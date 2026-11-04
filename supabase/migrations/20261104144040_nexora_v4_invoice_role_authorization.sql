-- Nexora Multisede V4: control de referencias, costos por IMEI, permisos de traslados y validación de facturas.
-- No modifica inventario, usuarios, ventas ni datos de facturas.
BEGIN;

DROP POLICY IF EXISTS bodega_products_insert ON public.bodega_products;
CREATE POLICY bodega_products_insert ON public.bodega_products
 FOR INSERT TO authenticated WITH CHECK ((select public.bodega_is_admin()));
DROP POLICY IF EXISTS bodega_products_update ON public.bodega_products;
CREATE POLICY bodega_products_update ON public.bodega_products
 FOR UPDATE TO authenticated
 USING ((select public.bodega_is_admin()))
 WITH CHECK ((select public.bodega_is_admin()));

CREATE OR REPLACE FUNCTION nexora_internal.guard_unit_cost_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public
AS $nexora_cost$
BEGIN
  IF old.cost IS DISTINCT FROM new.cost AND
     (auth.uid() IS NULL OR NOT public.bodega_is_admin()) THEN
    RAISE EXCEPTION 'Solo Administrador puede modificar el costo individual del IMEI.';
  END IF;
  RETURN new;
END
$nexora_cost$;
REVOKE ALL ON FUNCTION nexora_internal.guard_unit_cost_change() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS nexora_guard_unit_cost_change ON public.bodega_units;
CREATE TRIGGER nexora_guard_unit_cost_change BEFORE UPDATE OF cost
 ON public.bodega_units FOR EACH ROW
 EXECUTE FUNCTION nexora_internal.guard_unit_cost_change();

CREATE OR REPLACE FUNCTION nexora_internal.execute_transfer(p_action text, p_transfer_id uuid DEFAULT NULL::uuid, p_origin uuid DEFAULT NULL::uuid, p_destination uuid DEFAULT NULL::uuid, p_serials text[] DEFAULT ARRAY[]::text[], p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_serials text[];
  v_wanted integer;
  v_matched integer;
  v_total integer;
  v_missing integer;
  v_remaining integer;
  v_number bigint;
  v_tid uuid;
  v_origin uuid;
  v_destination uuid;
  v_status text;
  v_result jsonb;
  v_worker jsonb;
  v_my_site uuid;
begin
  v_worker := nexora_internal.worker_session();
  if auth.uid() is null or not (public.bodega_is_staff() or v_worker is not null) then
    raise exception 'No tienes permiso para operar traslados multisede.';
  end if;
  v_my_site := nullif(v_worker->>'siteId','')::uuid;
  -- Coordina el ledger con la escritura legacy de pedidos. Los guardas
  -- de asignación de pedidos usan exactamente el mismo bloqueo asesor.
  perform pg_advisory_xact_lock(78192346);
  if not exists (select 1 from public.nexora_initial_inventory_approvals) then
    raise exception 'Aprueba primero el inventario inicial por IMEI.';
  end if;
  if p_action not in ('create','dispatch','receive','return','cancel') or p_action is null then
    raise exception 'Acción de traslado inválida.';
  end if;

  select coalesce(array_agg(lower(btrim(x.serial))),array[]::text[])
    into v_serials from unnest(coalesce(p_serials,array[]::text[])) as x(serial);
  v_wanted := cardinality(v_serials);
  if v_wanted > 100 or exists (select 1 from unnest(v_serials) s where s = '' or length(s)>160)
    or (select count(distinct x.serial) from unnest(v_serials) as x(serial)) <> v_wanted then
    raise exception 'IMEI repetido, vacío o más de 100 unidades por operación.';
  end if;
  if (p_action in ('create','return') and v_wanted = 0)
     or (p_action in ('dispatch','cancel') and v_wanted <> 0) then
    raise exception 'Cantidad de IMEI inválida para esta operación.';
  end if;

  lock table public.nexora_transfers in share row exclusive mode;
  lock table public.nexora_transfer_lines in share row exclusive mode;
  lock table public.nexora_unit_custody in share row exclusive mode;

  if p_action = 'create' then
    if p_origin is null or p_destination is null or p_origin = p_destination then
      raise exception 'Selecciona un origen y un destino diferentes.';
    end if;
    if v_worker is not null and p_origin <> v_my_site then
      raise exception 'Solo puedes iniciar traslados desde tu local asignado.';
    end if;
    if v_worker is null and not public.bodega_is_admin() and not exists (
      select 1 from public.nexora_staff_sites ss
      where ss.user_id=auth.uid() and ss.site_id=p_origin and ss.is_active
    ) then
      raise exception 'Bodeguero: no puedes despachar desde una sede que no tienes asignada.';
    end if;
    if not exists (
      select 1 from public.nexora_sites o
      join public.nexora_sites d on d.id=p_destination
      where o.id=p_origin and o.is_active and d.is_active
        and (
          (o.site_type='principal' and d.site_type='bodega' and d.parent_site_id=o.id)
          or (o.site_type='principal' and d.site_type='local' and d.parent_site_id=o.id)
          or (o.site_type='bodega' and d.site_type='bodega' and o.id<>d.id)
          or (o.site_type='bodega' and d.site_type='local' and d.parent_site_id=o.id)
          or (o.site_type='local' and d.site_type in ('principal','bodega') and o.parent_site_id=d.id)
        )
    ) then
      raise exception 'Ruta no autorizada: no se permite local a local.';
    end if;
    select count(*) into v_matched
      from public.bodega_units u
      join public.nexora_initial_unit_sites s on s.unit_id=u.id
      left join public.nexora_unit_custody c on c.unit_id=u.id
      where lower(btrim(u.serial))=any(v_serials)
        and u.status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso')
        and u.serial=s.serial_snapshot
        and coalesce(c.site_id,s.site_id)=p_origin
        and coalesce(c.custody_status,'at_site')='at_site'
        and not exists (
          select 1 from public.nexora_transfer_lines l where l.unit_id=u.id
           and l.state in ('prepared','in_transit','return_pending')
        )
        and not exists (
          select 1 from public.bodega_order_item_units link
          join public.bodega_order_items item on item.id=link.order_item_id
          join public.bodega_orders ord on ord.id=item.order_id
          where link.unit_id=u.id and ord.status not in ('cancelado','despachado')
        );
    if v_matched <> v_wanted then
      raise exception 'Uno o más IMEI no están disponibles físicamente en el origen o están comprometidos en otro traslado.';
    end if;

    insert into public.nexora_transfers(origin_site_id,destination_site_id,note,created_by)
      values(p_origin,p_destination,nullif(btrim(p_note),''),auth.uid())
      returning id,transfer_number into v_tid,v_number;
    insert into public.nexora_unit_custody(unit_id,site_id,custody_status)
      select u.id,s.site_id,'at_site'
        from public.bodega_units u join public.nexora_initial_unit_sites s on s.unit_id=u.id
       where lower(btrim(u.serial))=any(v_serials)
      on conflict (unit_id) do nothing;
    insert into public.nexora_transfer_lines(transfer_id,unit_id,serial_snapshot,cost_snapshot)
      select v_tid,u.id,u.serial,s.cost_snapshot
      from public.bodega_units u join public.nexora_initial_unit_sites s on s.unit_id=u.id
      where lower(btrim(u.serial))=any(v_serials);
    insert into public.nexora_transfer_events(transfer_id,event_type,actor_id,detail)
      values(v_tid,'created',auth.uid(),jsonb_build_object('units',v_wanted));
    return jsonb_build_object('transferId',v_tid,'number',v_number,'status','draft','units',v_wanted);
  end if;

  select t.id,t.transfer_number,t.origin_site_id,t.destination_site_id,t.status
    into v_tid,v_number,v_origin,v_destination,v_status
    from public.nexora_transfers t where t.id=p_transfer_id for update;
  if not found then raise exception 'Traslado no encontrado.'; end if;
  select count(*) into v_total from public.nexora_transfer_lines where transfer_id=v_tid;
  if v_worker is not null and (
       (p_action in ('cancel','dispatch','return') and v_origin<>v_my_site)
       or (p_action='receive' and v_destination<>v_my_site)
     ) then
    raise exception 'El traslado no pertenece a una operación autorizada de tu local.';
  end if;
  if v_worker is null and not public.bodega_is_admin() and not exists (
    select 1 from public.nexora_staff_sites ss
     where ss.user_id=auth.uid() and ss.is_active
       and ss.site_id=(case when p_action='receive' then v_destination else v_origin end)
  ) then
    raise exception 'Bodeguero: el traslado no pertenece a una sede asignada.';
  end if;

  if p_action = 'cancel' then
    if v_status <> 'draft' then raise exception 'Solo puedes cancelar un traslado sin despachar.'; end if;
    update public.nexora_transfer_lines set state='cancelled' where transfer_id=v_tid and state='prepared';
    update public.nexora_transfers set status='cancelled',closed_at=now() where id=v_tid;
    insert into public.nexora_transfer_events(transfer_id,event_type,actor_id)
      values(v_tid,'cancelled',auth.uid());
    return jsonb_build_object('transferId',v_tid,'status','cancelled');
  end if;

  if p_action = 'dispatch' then
    if v_status <> 'draft' then raise exception 'Solo puedes despachar un manifiesto en borrador.'; end if;
    select count(*) into v_matched
      from public.nexora_transfer_lines l
      join public.nexora_unit_custody c on c.unit_id=l.unit_id
      join public.bodega_units u on u.id=l.unit_id
      where l.transfer_id=v_tid and l.state='prepared'
        and c.custody_status='at_site' and c.site_id=v_origin
        and u.serial=l.serial_snapshot
        and u.status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso')
        and not exists (
          select 1 from public.bodega_order_item_units link
          join public.bodega_order_items item on item.id=link.order_item_id
          join public.bodega_orders ord on ord.id=item.order_id
          where link.unit_id=l.unit_id and ord.status not in ('cancelado','despachado')
        );
    if v_total=0 or v_matched<>v_total then
      raise exception 'No se puede despachar: verifica origen, disponibilidad física y estado de todos los IMEI.';
    end if;
    update public.nexora_unit_custody c
      set site_id=null,custody_status='in_transit',transfer_id=v_tid,updated_at=now()
      from public.nexora_transfer_lines l
      where l.transfer_id=v_tid and c.unit_id=l.unit_id;
    update public.nexora_transfer_lines set state='in_transit'
      where transfer_id=v_tid and state='prepared';
    update public.nexora_transfers set status='in_transit',dispatched_at=now() where id=v_tid;
    insert into public.nexora_transfer_events(transfer_id,event_type,actor_id,detail)
      values(v_tid,'dispatched',auth.uid(),jsonb_build_object('units',v_total));
    return jsonb_build_object('transferId',v_tid,'status','in_transit','sent',v_total);
  end if;

  if p_action = 'receive' then
    if v_status <> 'in_transit' then raise exception 'Esta recepción ya fue procesada o no ha sido despachada.'; end if;
    select count(*) into v_matched
      from public.nexora_transfer_lines l join public.bodega_units u on u.id=l.unit_id
      where l.transfer_id=v_tid and l.state='in_transit'
        and lower(btrim(l.serial_snapshot))=any(v_serials)
        and u.serial=l.serial_snapshot
        and u.status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso');
    if v_matched <> v_wanted then
      raise exception 'La recepción contiene IMEI repetidos, ajenos al envío o ya no físicos.';
    end if;
    update public.nexora_transfer_lines
      set state='received',received_at=now()
      where transfer_id=v_tid and lower(btrim(serial_snapshot))=any(v_serials) and state='in_transit';
    update public.nexora_unit_custody c
      set site_id=v_destination,custody_status='at_site',transfer_id=null,updated_at=now()
      from public.nexora_transfer_lines l where l.transfer_id=v_tid and l.unit_id=c.unit_id and l.state='received';
    update public.nexora_transfer_lines
      set state='return_pending'
      where transfer_id=v_tid and state='in_transit';
    update public.nexora_unit_custody c
      set site_id=null,custody_status='return_pending',transfer_id=v_tid,updated_at=now()
      from public.nexora_transfer_lines l
      where l.transfer_id=v_tid and l.unit_id=c.unit_id and l.state='return_pending';
    v_missing := v_total-v_wanted;
    if v_missing>0 then
      insert into public.nexora_transfer_return_documents(transfer_id,expected_count)
        values(v_tid,v_missing);
    end if;
    update public.nexora_transfers
      set received_at=now(),
        status=case when v_missing=0 then 'closed' else 'awaiting_returns' end,
        closed_at=case when v_missing=0 then now() else null end where id=v_tid;
    insert into public.nexora_transfer_events(transfer_id,event_type,actor_id,detail)
      values(v_tid,'received',auth.uid(),jsonb_build_object('received',v_wanted,'missing',v_missing));
    return jsonb_build_object('transferId',v_tid,
      'status',case when v_missing=0 then 'closed' else 'awaiting_returns' end,
      'received',v_wanted,'missing',v_missing,'returnDocumentCreated',v_missing>0);
  end if;

  if p_action = 'return' then
    if v_status <> 'awaiting_returns' then
      raise exception 'No hay retorno físico pendiente para este traslado.';
    end if;
    select count(*) into v_matched
    from public.nexora_transfer_lines l join public.bodega_units u on u.id=l.unit_id
    where l.transfer_id=v_tid and l.state='return_pending'
      and lower(btrim(l.serial_snapshot))=any(v_serials)
      and u.serial=l.serial_snapshot
      and u.status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso');
    if v_matched <> v_wanted then
      raise exception 'El retorno contiene IMEI ajenos, no pendientes o con estado incompatible.';
    end if;
    -- Solo un escaneo físico explícito puede devolver la custodia al origen.
    update public.nexora_transfer_lines
      set state='returned',returned_at=now()
      where transfer_id=v_tid and state='return_pending' and lower(btrim(serial_snapshot))=any(v_serials);
    update public.nexora_unit_custody c
      set site_id=v_origin,custody_status='at_site',transfer_id=null,updated_at=now()
      from public.nexora_transfer_lines l
      where l.transfer_id=v_tid and l.unit_id=c.unit_id and l.state='returned'
        and lower(btrim(l.serial_snapshot))=any(v_serials);
    select count(*) into v_remaining from public.nexora_transfer_lines
      where transfer_id=v_tid and state='return_pending';
    if v_remaining=0 then
      update public.nexora_transfer_return_documents
        set status='completed',completed_at=now() where transfer_id=v_tid;
      update public.nexora_transfers set status='closed',closed_at=now() where id=v_tid;
    end if;
    insert into public.nexora_transfer_events(transfer_id,event_type,actor_id,detail)
      values(v_tid,'return_confirmed',auth.uid(),
        jsonb_build_object('returnedNow',v_wanted,'remaining',v_remaining));
    return jsonb_build_object('transferId',v_tid,
      'status',case when v_remaining=0 then 'closed' else 'awaiting_returns' end,
      'returnedNow',v_wanted,'remaining',v_remaining);
  end if;
  raise exception 'Acción inválida.';
end;
$function$;
CREATE OR REPLACE FUNCTION nexora_internal.finalize_invoice_draft(p_id uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v public.nexora_invoice_drafts%rowtype; v_line jsonb; v_code text;v_receipt uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.bodega_is_admin() THEN
  RAISE EXCEPTION 'Solo Administrador puede revisar y preparar facturas.';
 END IF;
 IF p_action NOT IN ('approve','prepare') THEN
  RAISE EXCEPTION 'Acción de factura inválida.';
 END IF;
 SELECT * INTO v FROM public.nexora_invoice_drafts WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada.';END IF;
 IF v.supplier_id IS NULL OR nullif(btrim(v.invoice_no),'') IS NULL
   OR jsonb_array_length(v.lines)=0 THEN
  RAISE EXCEPTION 'Completa proveedor, número y referencias antes de validar.';
 END IF;
 FOR v_line IN SELECT value FROM jsonb_array_elements(v.lines) LOOP
   IF jsonb_typeof(v_line)<>'object'
    OR nullif(v_line->>'productId','') IS NULL
    OR NOT EXISTS(SELECT 1 FROM public.bodega_products prod
      WHERE prod.id=(v_line->>'productId')::uuid AND prod.is_active)
    OR coalesce((v_line->>'quantity')::numeric,0)<=0
    OR floor((v_line->>'quantity')::numeric)<>(v_line->>'quantity')::numeric
    OR coalesce((v_line->>'unitCost')::numeric,0)<=0 THEN
      RAISE EXCEPTION 'Cada referencia y costo debe ser revisado por Administrador.';
   END IF;
   IF (v_line ? 'total') AND (v_line->>'total') IS NOT NULL AND
      (coalesce((v_line->>'total')::numeric,0)<=0
       OR abs((v_line->>'quantity')::numeric*(v_line->>'unitCost')::numeric-
              (v_line->>'total')::numeric)>greatest(2,(v_line->>'total')::numeric*0.02)) THEN
      RAISE EXCEPTION 'El costo y cantidad no coinciden con el subtotal de una línea de factura.';
   END IF;
 END LOOP;
 IF p_action='approve' THEN
  IF v.status<>'pending' THEN RAISE EXCEPTION 'Factura ya revisada.';END IF;
  UPDATE public.nexora_invoice_drafts SET status='reviewed',
    reviewed_by=auth.uid(),reviewed_at=now()
    WHERE id=v.id;
  RETURN jsonb_build_object('id',v.id,'status','reviewed');
 END IF;
 IF v.status='prepared' THEN
  RETURN jsonb_build_object('id',v.id,'status','prepared','receptionId',v.reception_id);
 END IF;
 IF v.status<>'reviewed' THEN RAISE EXCEPTION 'Revisa y aprueba primero la factura.';END IF;
 PERFORM pg_advisory_xact_lock(67230183);
 SELECT 'REC-'||lpad((coalesce(max(substring(code from '^REC-([0-9]+)$')::integer),0)+1)::text,5,'0')
 INTO v_code FROM public.bodega_receptions
 WHERE code ~ '^REC-[0-9]+$';
 INSERT INTO public.bodega_receptions(
  code,reference,status,notes,supplier_id,created_by,received_at)
 VALUES(v_code,v.invoice_no,'captura',
  'Factura asistida '||v.id::text||'. Verificar físicamente IMEI y cantidades antes de confirmar.',
  v.supplier_id,auth.uid(),now())
 RETURNING id INTO v_receipt;
 UPDATE public.nexora_invoice_drafts SET status='prepared',reception_id=v_receipt WHERE id=v.id;
 RETURN jsonb_build_object('id',v.id,'status','prepared','receptionId',v_receipt,'receptionCode',v_code);
END $function$;
CREATE OR REPLACE FUNCTION nexora_internal.invoice_draft_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
 IF tg_op='INSERT' THEN
  IF new.source_path NOT LIKE new.created_by::text||'/%'
     OR coalesce(new.status,'')<>'pending' THEN
   RAISE EXCEPTION 'Ruta o estado inicial de factura no autorizado.';
  END IF;
  new.updated_by:=auth.uid();
 ELSE
  IF new.id IS DISTINCT FROM old.id OR new.created_by IS DISTINCT FROM old.created_by
   OR new.created_at IS DISTINCT FROM old.created_at
   OR new.source_path IS DISTINCT FROM old.source_path
   OR new.source_sha256 IS DISTINCT FROM old.source_sha256
   OR new.original_filename IS DISTINCT FROM old.original_filename THEN
    RAISE EXCEPTION 'No se pueden modificar los documentos originales.';
  END IF;
  IF old.status='prepared' THEN
    RAISE EXCEPTION 'Una recepción preparada no se vuelve a editar.';
  END IF;
  IF old.status='reviewed' AND new.status=old.status AND (
      new.supplier_name IS DISTINCT FROM old.supplier_name OR
      new.supplier_id IS DISTINCT FROM old.supplier_id OR
      new.invoice_no IS DISTINCT FROM old.invoice_no OR
      new.invoice_date IS DISTINCT FROM old.invoice_date OR
      new.currency IS DISTINCT FROM old.currency OR
      new.lines IS DISTINCT FROM old.lines OR
      new.warnings IS DISTINCT FROM old.warnings OR
      new.extracted_text IS DISTINCT FROM old.extracted_text
    ) THEN
    RAISE EXCEPTION 'La factura aprobada es inmutable; se requiere una nueva revisión documentada.';
  END IF;
  IF new.status=old.status AND
    (new.reviewed_by IS DISTINCT FROM old.reviewed_by
     OR new.reviewed_at IS DISTINCT FROM old.reviewed_at
     OR new.reception_id IS DISTINCT FROM old.reception_id) THEN
    RAISE EXCEPTION 'El cierre requiere el procedimiento administrativo.';
  END IF;
  IF new.status<>old.status AND
    not public.bodega_is_admin() THEN
    RAISE EXCEPTION 'Solo Administrador puede validar factura.';
  END IF;
  new.updated_by:=auth.uid();
  new.updated_at:=now();
 END IF;
 RETURN new;
END $function$;
COMMIT;
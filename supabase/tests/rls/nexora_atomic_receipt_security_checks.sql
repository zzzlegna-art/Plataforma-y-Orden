-- Nexora V4 · comprobación SQL SOLO LECTURA después de las migraciones
-- #144 + #147. Usar en PostgreSQL aislado o en postflight autorizado.
-- No genera traslados, escaneos, notas, aprobaciones ni cambios de permisos.
do $preflight$
declare
  v_notes oid := to_regclass('public.nexora_transfer_missing_receipt_notes');
  v_wrapper oid := to_regprocedure(
    'public.nexora_transfer_action(text,uuid,uuid,uuid,text[],text)');
  v_receive oid := to_regprocedure(
    'public.nexora_transfer_receive_with_notes(uuid,text[],jsonb)');
  v_internal oid := to_regprocedure(
    'nexora_internal.execute_transfer(text,uuid,uuid,uuid,text[],text)');
  v_trigger_count integer;
  v_policy_count integer;
begin
  if v_notes is null or v_wrapper is null or v_receive is null
     or v_internal is null then
    raise exception 'Falta la tabla de notas o una RPC requerida para recepciones V4.';
  end if;

  if not (select c.relrowsecurity from pg_class c where c.oid=v_notes) then
    raise exception 'Notas de receptor sin RLS.';
  end if;

  if has_table_privilege('anon',v_notes,'SELECT')
    or not has_table_privilege('authenticated',v_notes,'SELECT')
    or has_table_privilege('authenticated',v_notes,'INSERT')
    or has_table_privilege('authenticated',v_notes,'UPDATE')
    or has_table_privilege('authenticated',v_notes,'DELETE') then
    raise exception 'Las notas no tienen privilegios de solo lectura para clientes.';
  end if;

  select count(*) into v_policy_count
    from pg_policy p
    where p.polrelid=v_notes
      and p.polname='nexora_transfer_missing_receipt_notes_admin_read'
      and p.polcmd='r';
  if v_policy_count<>1 then
    raise exception 'Falta RLS de lectura administradora de notas.';
  end if;

  select count(*) into v_trigger_count
    from pg_trigger t
    where t.tgrelid=v_notes and t.tgenabled='O' and not t.tgisinternal
      and t.tgname in (
        'nexora_transfer_missing_notes_no_rewrite',
        'nexora_transfer_missing_notes_no_truncate'
      );
  if v_trigger_count<>2 then
    raise exception 'Faltan triggers que impiden modificar o borrar notas.';
  end if;

  if (select count(*) from pg_constraint c
    where c.conrelid=v_notes and c.contype='p'
      and pg_get_constraintdef(c.oid) like '%transfer_line_id%')<>1
    or (select count(*) from pg_constraint c
      where c.conrelid=v_notes and c.contype='f'
        and c.conname='nexora_missing_note_matches_original_incident'
        and c.confrelid='public.nexora_transfer_missing_observations'::regclass
        and pg_get_constraintdef(c.oid) like
          '%FOREIGN KEY (transfer_line_id, transfer_id, serial_snapshot, recorded_by)%')<>1
    or (select count(*) from pg_constraint c
      where c.conrelid='public.nexora_transfer_missing_observations'::regclass
        and c.contype='u'
        and c.conname='nexora_missing_incident_evidence_identity_key'
        and pg_get_constraintdef(c.oid) like
          '%(transfer_line_id, transfer_id, serial_snapshot, reported_by)%')<>1 then
    raise exception 'Cada nota debe cotejar línea, traslado, IMEI y autor del incidente.';
  end if;

  if has_function_privilege('authenticated',v_internal,'EXECUTE')
    or has_function_privilege('anon',v_internal,'EXECUTE')
    or has_function_privilege('anon',v_receive,'EXECUTE')
    or not has_function_privilege('authenticated',v_receive,'EXECUTE')
    or has_function_privilege('anon',v_wrapper,'EXECUTE')
    or not has_function_privilege('authenticated',v_wrapper,'EXECUTE') then
    raise exception 'RPC interna accesible o funciones públicas mal autorizadas.';
  end if;

  if (select count(*) from pg_proc p
    where p.oid in (v_wrapper,v_receive) and p.prosecdef)<>2 then
    raise exception 'Las dos RPC públicas deben delegar de manera segura.';
  end if;

  if exists (
    select 1 from pg_proc p
    where p.oid in (v_wrapper,v_receive)
      and not ('search_path=pg_catalog'=any(p.proconfig))
  ) then
    raise exception 'Las RPC públicas no fijan search_path seguro.';
  end if;

  -- La autoridad operativa se comprueba en DB; el motor exige el sitio
  -- de origen/destino. No aceptar JWT sin usuario ni rol no habilitado.
  if exists (
    select 1 from pg_proc p
    where p.oid in (v_wrapper,v_receive)
      and (position('auth.uid()' in p.prosrc)=0
        or position('public.bodega_is_staff()' in p.prosrc)=0
        or position('nexora_internal.worker_session()' in p.prosrc)=0)
  ) then
    raise exception 'Falta validación explícita de identidad y rol operativo en RPC pública.';
  end if;

  -- El wrapper público debe volver a comprobar la sede de origen del
  -- Bodeguero/Trabajador incluso si la función interna cambia en el futuro.
  if exists (
    select 1 from pg_proc p where p.oid=v_wrapper
      and (position('nexora_staff_sites' in p.prosrc)=0
           or position('v_required_site' in p.prosrc)=0
           or position('site.is_active' in p.prosrc)=0)
  ) then
    raise exception 'El wrapper de traslados no comprueba sede asignada y activa.';
  end if;

  if has_function_privilege('authenticated',
      'nexora_internal.reject_missing_audit_mutation()','EXECUTE') then
    raise exception 'Función privada de inmutabilidad expuesta a clientes.';
  end if;

  raise notice 'PASS: notas inmutables, RLS, funciones públicas seguras y sin bypass SQL interno.';
end;
$preflight$;

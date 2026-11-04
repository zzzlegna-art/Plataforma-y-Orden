-- Verificación de solo lectura. No inserta ni modifica datos productivos.
-- Se ejecuta después de aplicar la migración de recepción central.
do $verify$
declare
  staff record;
  allowed boolean;
  expected boolean;
  checked integer := 0;
begin
  if to_regprocedure('public.nexora_supplier_reception_access()') is null then
    raise exception 'Falta la función de acceso a recepción principal.';
  end if;
  if has_function_privilege('anon',
    'public.nexora_supplier_reception_access()','EXECUTE')
    or not has_function_privilege('authenticated',
    'public.nexora_supplier_reception_access()','EXECUTE') then
    raise exception 'Privilegios incorrectos de la función de recepción.';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename in ('bodega_receptions','bodega_reception_items',
        'nexora_invoice_drafts','bodega_units')
      and policyname in ('bodega_receptions_all','bodega_reception_items_all',
        'nexora_invoice_drafts_insert','nexora_invoice_drafts_read',
        'bodega_units_insert')
      and coalesce(qual,'')||coalesce(with_check,'')
        not like '%nexora_supplier_reception_access%'
  ) then
    raise exception 'Una política de recepción no aplica el control de sede principal.';
  end if;

  -- No se usa impersonación de API externa: solo comprueba la función
  -- de autorización con IDs de perfiles existentes, sin devolverlos.
  for staff in
    select p.id,p.role,p.is_active
    from public.bodega_profiles p
  loop
    perform set_config('request.jwt.claim.sub',staff.id::text,true);
    allowed:=public.nexora_supplier_reception_access();
    expected := (
      staff.is_active and (
        public.bodega_is_admin()
        or (
          public.bodega_is_staff()
          and exists(
            select 1 from public.nexora_staff_sites ss
            join public.nexora_sites s on s.id=ss.site_id
            where ss.user_id=staff.id and ss.is_active
              and s.site_type='principal' and s.is_active
          )
        )
      )
    );
    if allowed is distinct from expected then
      raise exception 'La autorización central no coincide con el perfil/sede.';
    end if;
    checked:=checked+1;
  end loop;
  perform set_config('request.jwt.claim.sub','',true);
  if public.nexora_supplier_reception_access() then
    raise exception 'Sesión anónima accedió a recepción central.';
  end if;
  raise notice 'Recepción central: verificados % perfiles sin modificar registros.',checked;
end;
$verify$;
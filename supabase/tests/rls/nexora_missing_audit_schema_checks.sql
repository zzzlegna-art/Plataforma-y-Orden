-- Nexora V4 · comprobaciones SOLO LECTURA de la migración «No llegó».
-- Ejecutar después de aplicar 20261103090000_nexora_transfer_missing_observations
-- en una instancia AISLADA, y opcionalmente tras una aplicación autorizada.
-- No requiere datos reales, no crea registros, no cambia permisos.
do $test$
declare
  v_table oid;
  v_line_table oid;
  v_trigger_count integer;
  v_policy_count integer;
begin
  select c.oid into v_table from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname='nexora_transfer_missing_observations'
    and c.relkind='r';

  if v_table is null then
    raise exception 'Falta la tabla auditada de IMEI No llegó.';
  end if;

  if not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid=v_table) then
    raise exception 'RLS no está habilitado en el historial.';
  end if;

  if has_table_privilege('anon',v_table,'SELECT')
    or has_table_privilege('authenticated',v_table,'INSERT')
    or has_table_privilege('authenticated',v_table,'UPDATE')
    or has_table_privilege('authenticated',v_table,'DELETE')
    or not has_table_privilege('authenticated',v_table,'SELECT') then
    raise exception 'Privilegios del historial incompatibles con el alcance del Administrador.';
  end if;

  if has_sequence_privilege('authenticated',
    'public.nexora_transfer_missing_observations_id_seq','USAGE')
    or has_sequence_privilege('anon',
    'public.nexora_transfer_missing_observations_id_seq','USAGE') then
    raise exception 'La secuencia auditada está expuesta a clientes.';
  end if;

  if has_function_privilege('anon','nexora_internal.log_missing_transfer_line()','EXECUTE')
    or has_function_privilege('authenticated',
      'nexora_internal.log_missing_transfer_line()','EXECUTE') then
    raise exception 'El trigger privado no puede ser ejecutable por API.';
  end if;

  select count(*) into v_trigger_count from pg_catalog.pg_trigger t
  where t.tgrelid='public.nexora_transfer_lines'::regclass
    and t.tgname='nexora_transfer_log_missing_line'
    and not t.tgisinternal and t.tgenabled='O';
  if v_trigger_count<>1 then
    raise exception 'Falta el trigger activo y único sobre las líneas de traslado.';
  end if;

  select count(*) into v_trigger_count from pg_catalog.pg_trigger t
  where t.tgrelid=v_table and not t.tgisinternal and t.tgenabled='O'
    and t.tgname in ('nexora_transfer_missing_no_rewrite',
      'nexora_transfer_missing_no_truncate');
  if v_trigger_count<>2 then
    raise exception 'Faltan triggers activos de protección UPDATE/DELETE/TRUNCATE.';
  end if;
  if has_function_privilege('anon',
      'nexora_internal.reject_missing_audit_mutation()','EXECUTE')
    or has_function_privilege('authenticated',
      'nexora_internal.reject_missing_audit_mutation()','EXECUTE') then
    raise exception 'El bloqueador de modificaciones no puede ejecutarse como API.';
  end if;

  select count(*) into v_policy_count from pg_catalog.pg_policy p
  where p.polrelid=v_table and p.polname='nexora_transfer_missing_admin_read'
    and p.polcmd='r';
  if v_policy_count<>1 then
    raise exception 'Falta la política de lectura del Administrador.';
  end if;

  if (select count(*) from pg_catalog.pg_constraint c
       where c.conrelid=v_table and c.contype='u'
         and pg_catalog.pg_get_constraintdef(c.oid)
           like '%transfer_line_id%')<>1 then
    raise exception 'Falta la unicidad de la observación por línea de IMEI.';
  end if;

  raise notice 'PASS: tabla auditada, permisos, política, trigger y unicidad verificados.';
end;
$test$;

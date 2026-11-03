-- Nexora V4: integración transaccional de notas escritas por el receptor.
-- TODO ES FICTICIO: veinte IMEI generados en PostgreSQL efímero y ROLLBACK.
-- Reutiliza la RPC de traslado del código original, más migraciones #144/#147.
\ir .nexora-receipt-notes-setup.generated.sql

create temporary table nexora_ci_receipt_case (
  transfer_id uuid not null,
  scanned_serials text[] not null,
  missing_marks jsonb not null
);

select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001',true);

do $fixture$
declare
  v_origin constant uuid := '00000000-0000-0000-0000-000000000100';
  v_dest constant uuid := '00000000-0000-0000-0000-000000000200';
  v_serials text[];
  v_scanned text[];
  v_tid uuid;
  v_marks jsonb;
  v_status jsonb;
begin
  if has_function_privilege('anon',
    'public.nexora_transfer_receive_with_notes(uuid,text[],jsonb)','EXECUTE')
    or not has_function_privilege('authenticated',
    'public.nexora_transfer_receive_with_notes(uuid,text[],jsonb)','EXECUTE')
    or has_table_privilege('authenticated',
    'public.nexora_transfer_missing_receipt_notes','INSERT')
    or has_table_privilege('authenticated',
    'public.nexora_transfer_missing_receipt_notes','UPDATE')
    or has_table_privilege('authenticated',
    'public.nexora_transfer_missing_receipt_notes','DELETE') then
    raise exception 'La RPC o notas tienen permisos de cliente incorrectos.';
  end if;

  select array_agg(serial order by serial) into v_serials from public.bodega_units;
  v_scanned:=v_serials[1:15];
  v_status:=nexora_internal.execute_transfer(
    'create',null,v_origin,v_dest,v_serials,'CI, equipo ficticio');
  v_tid:=(v_status->>'transferId')::uuid;
  perform nexora_internal.execute_transfer(
    'dispatch',v_tid,null,null,array[]::text[],null);

  select coalesce(jsonb_agg(jsonb_build_object(
    'lineId',l.id::text,
    'serial',l.serial_snapshot,
    'markedNotArrived',true,
    'observation','El receptor verificó que no llegó '||l.serial_snapshot
  ) order by l.serial_snapshot),'[]'::jsonb)
  into v_marks
  from public.nexora_transfer_lines l
  where l.transfer_id=v_tid and l.state='in_transit'
    and l.serial_snapshot>='IMEI-0016';

  if jsonb_array_length(v_marks)<>5 then
    raise exception 'Fixture de notas requiere exactamente 5 faltantes.';
  end if;
  insert into pg_temp.nexora_ci_receipt_case
    (transfer_id,scanned_serials,missing_marks)
  values(v_tid,v_scanned,v_marks);
end;
$fixture$;

create function public.nexora_ci_expect_notes_denial(
  p_id uuid,p_scanned text[],p_marks jsonb,p_expected text
)
returns void language plpgsql set search_path=pg_catalog
as $expect$
begin
  begin
    perform public.nexora_transfer_receive_with_notes(p_id,p_scanned,p_marks);
    raise exception 'CI_DID_NOT_REJECT';
  exception when others then
    if sqlerrm='CI_DID_NOT_REJECT' or sqlerrm not like p_expected then
      raise;
    end if;
  end;
end;
$expect$;

do $denials$
declare
  v_id uuid;
  v_scanned text[];
  v_marks jsonb;
begin
  select transfer_id,scanned_serials,missing_marks
  into v_id,v_scanned,v_marks from pg_temp.nexora_ci_receipt_case;

  -- La antigua API no puede recibir sin cinco notas y cinco casillas.
  begin
    perform public.nexora_transfer_action(
      'receive',v_id,null,null,v_scanned,null);
    raise exception 'CI_LEGACY_RECEIPT_BYPASS';
  exception when others then
    if sqlerrm='CI_LEGACY_RECEIPT_BYPASS'
      or sqlerrm not like '%requiere las notas individuales%' then
      raise;
    end if;
  end;

  perform public.nexora_ci_expect_notes_denial(
    v_id,v_scanned,v_marks - 0,'%Debe marcar%');
  perform public.nexora_ci_expect_notes_denial(
    v_id,v_scanned,'[]'::jsonb,'%Debe marcar%');
  perform public.nexora_ci_expect_notes_denial(
    v_id,v_scanned,
    jsonb_set(v_marks,'{0,markedNotArrived}','false'::jsonb),
    '%Falta la casilla%');
  perform public.nexora_ci_expect_notes_denial(
    v_id,v_scanned,
    jsonb_set(v_marks,'{0,observation}',to_jsonb('  '::text)),
    '%requiere una nota%');
  perform public.nexora_ci_expect_notes_denial(
    v_id,v_scanned,
    jsonb_set(v_marks,'{0,serial}',to_jsonb('IMEI-AJENO'::text)),
    '%IMEI ajeno%');
  perform public.nexora_ci_expect_notes_denial(
    v_id,v_scanned,
    jsonb_set(v_marks,'{1}',v_marks->0),
    '%más de una vez%');
  perform public.nexora_ci_expect_notes_denial(
    v_id,array_append(v_scanned,'IMEI-AJENO'),v_marks,
    '%no coincide con los IMEI%');
  perform public.nexora_ci_expect_notes_denial(
    v_id,array_append(v_scanned,'imei-0001'),v_marks,
    '%repetidos%');

  perform set_config('request.jwt.claim.sub',
    '00000000-0000-0000-0000-000000000002',true);
  perform public.nexora_ci_expect_notes_denial(
    v_id,v_scanned,v_marks,'%Solo Administrador%');
  perform set_config('request.jwt.claim.sub',
    '00000000-0000-0000-0000-000000000001',true);

  if (select count(*) from public.nexora_transfer_lines where state='in_transit')<>20
    or exists(select 1 from public.nexora_transfer_missing_receipt_notes)
    or exists(select 1 from public.nexora_transfer_missing_observations)
    or exists(select 1 from public.nexora_transfer_return_documents) then
    raise exception 'Un intento inválido alteró el manifiesto o generó notas.';
  end if;
end;
$denials$;

-- Simular un error real DESPUÉS del movimiento y ANTES de completar las
-- observaciones. La transacción completa debe volver a 20 en tránsito.
create function public.nexora_ci_simulated_write_failure()
returns trigger language plpgsql as $failure$
begin
  if new.serial_snapshot='IMEI-0020' then
    raise exception 'CI_FORCED_NOTE_WRITE_FAILURE';
  end if;
  return new;
end;
$failure$;
create trigger nexora_ci_force_note_failure
  before insert on public.nexora_transfer_missing_receipt_notes
  for each row execute function public.nexora_ci_simulated_write_failure();

do $rollback_test$
declare
  v_id uuid;
  v_scanned text[];
  v_marks jsonb;
begin
  select transfer_id,scanned_serials,missing_marks into
    v_id,v_scanned,v_marks from pg_temp.nexora_ci_receipt_case;
  begin
    perform public.nexora_transfer_receive_with_notes(v_id,v_scanned,v_marks);
    raise exception 'CI_DID_NOT_ROLL_BACK';
  exception when others then
    if sqlerrm='CI_DID_NOT_ROLL_BACK'
      or sqlerrm not like '%CI_FORCED_NOTE_WRITE_FAILURE%' then
      raise;
    end if;
  end;
  if (select count(*) from public.nexora_transfer_lines where state='in_transit')<>20
    or (select status from public.nexora_transfers where id=v_id)<>'in_transit'
    or exists(select 1 from public.nexora_transfer_missing_observations)
    or exists(select 1 from public.nexora_transfer_missing_receipt_notes)
    or exists(select 1 from public.nexora_transfer_return_documents)
    or (select count(*) from public.nexora_unit_custody
        where custody_status='in_transit' and site_id is null)<>20 then
    raise exception 'ERROR CRÍTICO: las cinco notas fallaron pero el movimiento quedó aplicado.';
  end if;
end;
$rollback_test$;

drop trigger nexora_ci_force_note_failure
  on public.nexora_transfer_missing_receipt_notes;
drop function public.nexora_ci_simulated_write_failure();

do $success$
declare
  v_id uuid;
  v_scanned text[];
  v_marks jsonb;
  v_result jsonb;
begin
  select transfer_id,scanned_serials,missing_marks
  into v_id,v_scanned,v_marks from pg_temp.nexora_ci_receipt_case;
  v_result:=public.nexora_transfer_receive_with_notes(v_id,v_scanned,v_marks);
  if (v_result->>'received')::integer<>15
    or (v_result->>'missing')::integer<>5
    or (v_result->>'observationsRecorded')::integer<>5
    or (select count(*) from public.nexora_transfer_lines where state='received')<>15
    or (select count(*) from public.nexora_transfer_lines where state='return_pending')<>5
    or (select count(*) from public.nexora_unit_custody
      where site_id is null and custody_status='return_pending')<>5
    or (select expected_count from public.nexora_transfer_return_documents
      where transfer_id=v_id)<>5
    or (select count(*) from public.nexora_transfer_missing_observations
      where transfer_id=v_id)<>5
    or (select count(*) from public.nexora_transfer_missing_receipt_notes
      where transfer_id=v_id)<>5
    or (select count(distinct receiver_observation)
      from public.nexora_transfer_missing_receipt_notes where transfer_id=v_id)<>5
    or (select count(*) from public.nexora_transfer_missing_receipt_notes
      where recorded_by='00000000-0000-0000-0000-000000000001'::uuid)<>5 then
    raise exception 'La RPC no dejó exactamente 15 recibidos, 5 faltantes y 5 notas.';
  end if;

  -- El retorno físico posterior no borra ninguna de las diez evidencias
  -- (cinco reportes automáticos + cinco textos individuales).
  perform nexora_internal.execute_transfer(
    'return',v_id,null,null,array['IMEI-0016'],null);
  if (select count(*) from public.nexora_transfer_missing_receipt_notes)<>5
    or (select count(*) from public.nexora_transfer_missing_observations)<>5 then
    raise exception 'Un retorno eliminó una observación histórica.';
  end if;

  perform public.nexora_ci_expect_notes_denial(
    v_id,v_scanned,v_marks,'%Solo se pueden recibir traslados en tránsito%');
end;
$success$;

do $immutable$
begin
  begin
    update public.nexora_transfer_missing_receipt_notes
      set receiver_observation='Nota cambiada'
      where serial_snapshot='IMEI-0016';
    raise exception 'CI_UPDATE_NOTE_ALLOWED';
  exception when others then
    if sqlerrm='CI_UPDATE_NOTE_ALLOWED'
      or sqlerrm not like '%Auditoría inmutable:%' then raise; end if;
  end;
  begin
    delete from public.nexora_transfer_missing_receipt_notes
      where serial_snapshot='IMEI-0016';
    raise exception 'CI_DELETE_NOTE_ALLOWED';
  exception when others then
    if sqlerrm='CI_DELETE_NOTE_ALLOWED'
      or sqlerrm not like '%Auditoría inmutable:%' then raise; end if;
  end;
  begin
    truncate table public.nexora_transfer_missing_receipt_notes;
    raise exception 'CI_TRUNCATE_NOTE_ALLOWED';
  exception when others then
    if sqlerrm='CI_TRUNCATE_NOTE_ALLOWED'
      or sqlerrm not like '%Auditoría inmutable:%' then raise; end if;
  end;
  if (select count(*) from public.nexora_transfer_missing_receipt_notes)<>5 then
    raise exception 'Los textos originales fueron modificados.';
  end if;
end;
$immutable$;

-- La consulta RLS no permite que otro rol lea las notas.
set local role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001',true);
do $api$
begin
  -- Comprueba que la RPC realmente es ejecutable por el rol API, que
  -- atraviesa SECURITY DEFINER y llega a la validación, sin escribir nada.
  begin
    perform public.nexora_transfer_receive_with_notes(
      null,array[]::text[],'[]'::jsonb);
    raise exception 'CI_ADMIN_RPC_WAS_NOT_VALIDATED';
  exception when others then
    if sqlerrm='CI_ADMIN_RPC_WAS_NOT_VALIDATED'
      or sqlerrm not like '%lista de observaciones válidos%' then raise; end if;
  end;

  if (select count(*) from public.nexora_transfer_missing_receipt_notes)<>5
    or has_table_privilege('authenticated',
      'public.nexora_transfer_missing_receipt_notes','INSERT')
    or has_table_privilege('authenticated',
      'public.nexora_transfer_missing_receipt_notes','UPDATE')
    or has_table_privilege('authenticated',
      'public.nexora_transfer_missing_receipt_notes','DELETE') then
    raise exception 'RLS del receptor no protege las notas individuales.';
  end if;
end;
$api$;

select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002',true);
do $api$
begin
  begin
    perform public.nexora_transfer_receive_with_notes(
      null,array[]::text[],'[]'::jsonb);
    raise exception 'CI_BODEGUERO_WAS_NOT_REJECTED';
  exception when others then
    if sqlerrm='CI_BODEGUERO_WAS_NOT_REJECTED'
      or sqlerrm not like '%Solo Administrador%' then raise; end if;
  end;

  if exists(select 1 from public.nexora_transfer_missing_receipt_notes) then
    raise exception 'Bodeguero pudo leer las notas globales del Administrador.';
  end if;
end;
$api$;
reset role;

rollback;

-- Nexora V4.9 - aprobacion explicita de inventario inicial por local.
-- No aprueba de forma automatica, no inventa escaneos, no modifica IMEI.
create table public.nexora_local_initial_approvals (
  site_id uuid primary key references public.nexora_sites(id) on delete restrict,
  global_approval_id uuid not null references public.nexora_initial_inventory_approvals(id) on delete restrict,
  approved_by uuid not null references public.bodega_profiles(id) on delete restrict,
  approved_at timestamptz not null default now(),
  initial_unit_count integer not null check(initial_unit_count>=0),
  acknowledgment text not null check (acknowledgment='APROBAR'),
  note text not null check (char_length(btrim(note)) between 10 and 500)
);
alter table public.nexora_local_initial_approvals enable row level security;
create policy nexora_local_initial_approvals_admin_read
  on public.nexora_local_initial_approvals for select to authenticated
  using ((select public.bodega_is_admin()));
revoke all on public.nexora_local_initial_approvals from public,anon,authenticated;
grant select on public.nexora_local_initial_approvals to authenticated;

-- Vista administrativa de cada local. Un local sin IMEI puede iniciar
-- con acta explicita de "inventario inicial vacio"; nunca simula unidades.
create function public.nexora_local_initial_status()
returns jsonb language plpgsql stable security invoker
set search_path=pg_catalog,public
as $$
declare v_rows jsonb;
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador consulta la activacion inicial de locales.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'siteId',s.id,'siteName',s.name,'initialCount',(
      select count(*) from public.nexora_initial_unit_sites i where i.site_id=s.id
    ),
    'globalApproved',exists(select 1 from public.nexora_initial_inventory_approvals),
    'approved',a.site_id is not null,
    'approvedAt',a.approved_at,'approvedCount',a.initial_unit_count
  ) order by s.name),'[]'::jsonb) into v_rows
    from public.nexora_sites s
    left join public.nexora_local_initial_approvals a on a.site_id=s.id
    where s.is_active and s.site_type='local';
  return v_rows;
end;
$$;
revoke all on function public.nexora_local_initial_status()
 from public,anon,authenticated;
grant execute on function public.nexora_local_initial_status() to authenticated;

create function nexora_internal.approve_local_initial(
  p_site_id uuid, p_acknowledgment text, p_note text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public
as $$
declare
  v_site public.nexora_sites%rowtype;
  v_global uuid;
  v_count integer;
  v_record public.nexora_local_initial_approvals%rowtype;
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador puede activar el inventario inicial del local.';
  end if;
  if p_acknowledgment is distinct from 'APROBAR' or
    char_length(btrim(coalesce(p_note,''))) not between 10 and 500 then
    raise exception 'Confirma APROBAR y registra una nota de verificacion de 10 a 500 caracteres.';
  end if;
  perform pg_advisory_xact_lock(78192350, hashtext(p_site_id::text));
  select * into v_site from public.nexora_sites
    where id=p_site_id and is_active and site_type='local' for share;
  if not found then raise exception 'No existe un local comercial activo con ese ID.'; end if;
  select id into v_global from public.nexora_initial_inventory_approvals limit 1;
  if v_global is null then
    raise exception 'Primero debe existir el acta central aprobada del inventario inicial.';
  end if;
  if exists(select 1 from public.nexora_local_initial_approvals where site_id=p_site_id) then
    raise exception 'Este local ya tiene su acta inicial firmada.';
  end if;
  select count(*) into v_count
    from public.nexora_initial_unit_sites i where i.site_id=p_site_id;
  -- El Administrador certifica el conteo real del local; las unidades deben
  -- existir ya en la foto de conciliacion aprobada o el local debe iniciar vacio.
  insert into public.nexora_local_initial_approvals
    (site_id,global_approval_id,approved_by,initial_unit_count,acknowledgment,note)
    values(p_site_id,v_global,auth.uid(),v_count,'APROBAR',btrim(p_note))
    returning * into v_record;
  return jsonb_build_object('siteId',v_record.site_id,
    'approvedCount',v_record.initial_unit_count,'approvedAt',v_record.approved_at);
end;
$$;
revoke all on function nexora_internal.approve_local_initial(uuid,text,text)
 from public,anon,authenticated;
grant execute on function nexora_internal.approve_local_initial(uuid,text,text)
 to authenticated;
create function public.nexora_approve_local_initial(
 p_site_id uuid,p_acknowledgment text,p_note text
) returns jsonb language sql volatile security invoker
set search_path=pg_catalog,public
as $$
 select nexora_internal.approve_local_initial(p_site_id,p_acknowledgment,p_note);
$$;
revoke all on function public.nexora_approve_local_initial(uuid,text,text)
 from public,anon,authenticated;
grant execute on function public.nexora_approve_local_initial(uuid,text,text)
 to authenticated;

-- El acta por local no abre caja automaticamente. Al intentar abrirla o
-- vender retail, la base exige firma administrativa previa.
create function nexora_internal.require_local_initial_approval()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public
as $$
begin
  if not exists(select 1 from public.nexora_local_initial_approvals a
     where a.site_id=new.site_id) then
    raise exception 'Inventario inicial de este local sin aprobacion administrativa.';
  end if;
  return new;
end;
$$;
revoke all on function nexora_internal.require_local_initial_approval()
 from public,anon,authenticated;
create trigger nexora_00_cash_requires_local_initial_approval
  before insert on public.nexora_cash_sessions
  for each row execute function nexora_internal.require_local_initial_approval();
create trigger nexora_00_retail_requires_local_initial_approval
  before insert on public.nexora_retail_sales
  for each row execute function nexora_internal.require_local_initial_approval();

comment on table public.nexora_local_initial_approvals is
  'Acta por local, solo Administrador; no equivale a stock vendible ni habilita roles.';

-- Amplía sólo las tablas temporales de CI para probar la activación V4.9.7.
\set ON_ERROR_STOP on
alter table public.nexora_staff_role_plans
 add column created_by uuid references public.bodega_profiles(id),
 add column updated_by uuid references public.bodega_profiles(id),
 add column created_at timestamptz not null default now(),
 add column updated_at timestamptz not null default now();
update public.nexora_staff_role_plans
 set created_by='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
     updated_by='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
alter table public.nexora_staff_role_plans add constraint
 nexora_staff_role_plans_operationally_enabled_check
 check (not operationally_enabled);

alter table public.nexora_staff_sites add column created_at timestamptz not null default now();
create trigger nexora_guard_staff_role_plan
 before insert or update on public.nexora_staff_role_plans
 for each row execute function public.nexora_validate_role_plan();
create table public.nexora_unit_custody(
 unit_id uuid primary key references public.bodega_units(id),
 site_id uuid not null references public.nexora_sites(id),
 custody_status text not null
);
grant insert,update on public.nexora_staff_role_plans to authenticated;

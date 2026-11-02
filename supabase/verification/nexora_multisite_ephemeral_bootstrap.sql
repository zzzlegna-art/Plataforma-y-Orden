-- ONLY ISOLATED CI POSTGRES; no Supabase or production connection.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
create table public.bodega_profiles(
 id uuid primary key,role text not null check(role in ('admin','bodeguero')),is_active boolean not null default true
);
create table public.bodega_units(
 id uuid primary key default gen_random_uuid(),product_id uuid,serial text not null unique,
 status text not null,cost numeric,location text
);
create table public.bodega_movements(
 id uuid primary key default gen_random_uuid(),unit_id uuid references public.bodega_units(id),
 product_id uuid,type text not null check(type in ('entrada','salida','ajuste','devolucion','garantia','liberacion','correccion')),
 quantity numeric not null,reference_type text not null default 'manual',reference_id uuid,
 notes text,created_by uuid,created_at timestamptz not null default now(),
 constraint bodega_movements_reference_type_check check(reference_type in ('recepcion','pedido','garantia','manual'))
);
create table public.bodega_orders(id uuid primary key,status text not null);
create table public.bodega_order_items(id uuid primary key,order_id uuid not null references public.bodega_orders(id));
create table public.bodega_order_item_units(
 id uuid primary key default gen_random_uuid(),order_item_id uuid not null references public.bodega_order_items(id),
 unit_id uuid references public.bodega_units(id)
);
create table public.bodega_warranties(
 id uuid primary key default gen_random_uuid(),unit_id uuid references public.bodega_units(id),
 replacement_unit_id uuid references public.bodega_units(id),status text not null default 'recibido'
);
create function public.bodega_is_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bodega_profiles where id=(select auth.uid()) and is_active and role='admin')
$$;
create function public.bodega_is_staff() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bodega_profiles where id=(select auth.uid()) and is_active)
$$;
grant usage on schema public to authenticated;
grant execute on function public.bodega_is_admin() to authenticated;
grant execute on function public.bodega_is_staff() to authenticated;
grant select,update on public.bodega_units to authenticated;
grant select,insert on public.bodega_order_item_units to authenticated;
grant select,insert on public.bodega_warranties to authenticated;
insert into public.bodega_profiles(id,role,is_active) values
 ('11111111-1111-4111-8111-111111111111','admin',true),
 ('22222222-2222-4222-8222-222222222222','bodeguero',true),
 ('33333333-3333-4333-8333-333333333333','bodeguero',false);
insert into public.bodega_orders(id,status) values ('33333333-3333-4333-8333-333333333334','en_preparacion');
insert into public.bodega_order_items(id,order_id) values
 ('33333333-3333-4333-8333-333333333335','33333333-3333-4333-8333-333333333334');

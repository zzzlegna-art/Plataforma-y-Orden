-- ============================================================
-- Bodega 6A :: esquema completo (instalación limpia)
-- Consolidado a partir de las migraciones originales del proyecto
-- Enter.pro, sin las migraciones de limpieza de datos de prueba
-- (esas solo tenían sentido en la base de datos original).
-- ============================================================

-- ------------------------------------------------------------
-- Perfiles de personal (admin / bodeguero)
-- ------------------------------------------------------------
create table public.bodega_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text,
  role text not null default 'bodeguero' check (role in ('admin', 'bodeguero')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.bodega_profiles enable row level security;
grant select, insert, update on public.bodega_profiles to authenticated;

-- Helpers (security definer) para evitar recursión de RLS
create or replace function public.bodega_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.bodega_profiles p
    where p.id = auth.uid() and p.is_active
  );
$$;

create or replace function public.bodega_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.bodega_profiles p
    where p.id = auth.uid() and p.is_active and p.role = 'admin'
  );
$$;

create policy bodega_profiles_select on public.bodega_profiles
  for select to authenticated
  using (public.bodega_is_staff());

create policy bodega_profiles_insert on public.bodega_profiles
  for insert to authenticated
  with check (public.bodega_is_admin());

create policy bodega_profiles_update on public.bodega_profiles
  for update to authenticated
  using (public.bodega_is_admin())
  with check (public.bodega_is_admin());

-- Alta automática del perfil al crear la cuenta de auth.
-- Queda como admin quien se registre cuando todavía no existe ningún
-- administrador activo (es decir: la primera cuenta que se cree).
create or replace function public.bodega_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_hay_admin boolean;
begin
  select exists (
    select 1 from public.bodega_profiles p
    where p.role = 'admin' and p.is_active
  ) into v_hay_admin;

  if v_hay_admin then
    v_role := 'bodeguero';
  else
    v_role := 'admin';
  end if;

  insert into public.bodega_profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    v_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger bodega_on_auth_user_created
after insert on auth.users
for each row execute function public.bodega_handle_new_user();

-- ============================================================
-- Catálogo
-- ============================================================
create table public.bodega_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now()
);
alter table public.bodega_categories enable row level security;
grant select, insert, update, delete on public.bodega_categories to authenticated;
create policy bodega_categories_read on public.bodega_categories for select to authenticated using (public.bodega_is_staff());
create policy bodega_categories_write on public.bodega_categories for all to authenticated using (public.bodega_is_admin()) with check (public.bodega_is_admin());

create table public.bodega_brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
alter table public.bodega_brands enable row level security;
grant select, insert, update, delete on public.bodega_brands to authenticated;
create policy bodega_brands_read on public.bodega_brands for select to authenticated using (public.bodega_is_staff());
create policy bodega_brands_write on public.bodega_brands for all to authenticated using (public.bodega_is_admin()) with check (public.bodega_is_admin());

create table public.bodega_products (
  id uuid primary key default gen_random_uuid(),
  sku text not null default '',
  name text not null,
  description text,
  category_id uuid references public.bodega_categories(id) on delete set null,
  brand_id uuid references public.bodega_brands(id) on delete set null,
  categoria text check (categoria in ('celular','tablet','reloj','repuesto')),
  tipo_repuesto text check (tipo_repuesto in ('bateria','display','otro')),
  price numeric(14,2) not null default 0,
  cost numeric(14,2) not null default 0,
  min_stock integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bodega_products_sku_idx on public.bodega_products (sku);
create index bodega_products_name_idx on public.bodega_products (name);
alter table public.bodega_products enable row level security;
grant select, insert, update, delete on public.bodega_products to authenticated;
create policy bodega_products_read on public.bodega_products for select to authenticated using (public.bodega_is_staff());
create policy bodega_products_insert on public.bodega_products for insert to authenticated with check (public.bodega_is_staff());
create policy bodega_products_update on public.bodega_products for update to authenticated using (public.bodega_is_staff()) with check (public.bodega_is_staff());
create policy bodega_products_delete on public.bodega_products for delete to authenticated using (public.bodega_is_admin());

create table public.bodega_settings (
  id text primary key default 'default',
  currency text not null default 'MXN',
  company_name text not null default 'Mi Empresa',
  updated_at timestamptz not null default now()
);
alter table public.bodega_settings enable row level security;
grant select, insert, update on public.bodega_settings to authenticated;
create policy bodega_settings_read on public.bodega_settings for select to authenticated using (public.bodega_is_staff());
create policy bodega_settings_write on public.bodega_settings for all to authenticated using (public.bodega_is_admin()) with check (public.bodega_is_admin());

insert into public.bodega_settings (id) values ('default') on conflict (id) do nothing;

-- ============================================================
-- Inventario
-- ============================================================
create table public.bodega_receptions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  reference text,
  status text not null default 'captura' check (status in ('captura','confirmada','descartada')),
  received_at timestamptz not null default now(),
  confirmed_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index bodega_receptions_code_idx on public.bodega_receptions (code);
alter table public.bodega_receptions enable row level security;
grant select, insert, update, delete on public.bodega_receptions to authenticated;
create policy bodega_receptions_all on public.bodega_receptions for all to authenticated using (public.bodega_is_staff()) with check (public.bodega_is_staff());

create table public.bodega_reception_items (
  id uuid primary key default gen_random_uuid(),
  reception_id uuid not null references public.bodega_receptions(id) on delete cascade,
  product_id uuid references public.bodega_products(id) on delete set null,
  serial text not null,
  unit_condition text not null default 'nuevo' check (unit_condition in ('nuevo','seminuevo')),
  cost numeric(14,2),
  created_at timestamptz not null default now()
);
create index bodega_reception_items_reception_idx on public.bodega_reception_items (reception_id);
alter table public.bodega_reception_items enable row level security;
grant select, insert, update, delete on public.bodega_reception_items to authenticated;
create policy bodega_reception_items_all on public.bodega_reception_items for all to authenticated using (public.bodega_is_staff()) with check (public.bodega_is_staff());

create table public.bodega_units (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.bodega_products(id) on delete set null,
  serial text not null,
  unit_condition text not null default 'nuevo' check (unit_condition in ('nuevo','seminuevo')),
  status text not null check (status in ('en_bodega','en_local','vendido','en_reparacion','defectuoso','en_transito','entregado_garantia','liberado')),
  cost numeric(14,2),
  reception_id uuid references public.bodega_receptions(id) on delete set null,
  location text,
  notes text,
  received_at timestamptz not null default now(),
  created_by uuid
);
create index bodega_units_serial_idx on public.bodega_units (serial);
create index bodega_units_product_idx on public.bodega_units (product_id);
create index bodega_units_status_idx on public.bodega_units (status);
alter table public.bodega_units enable row level security;
grant select, insert, update, delete on public.bodega_units to authenticated;
create policy bodega_units_read on public.bodega_units for select to authenticated using (public.bodega_is_staff());
create policy bodega_units_insert on public.bodega_units for insert to authenticated with check (public.bodega_is_staff());
create policy bodega_units_update on public.bodega_units for update to authenticated using (public.bodega_is_staff()) with check (public.bodega_is_staff());
create policy bodega_units_delete on public.bodega_units for delete to authenticated using (public.bodega_is_admin());

create table public.bodega_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.bodega_products(id) on delete set null,
  unit_id uuid,
  type text not null default 'ajuste' check (type in ('entrada','salida','ajuste','devolucion','garantia','liberacion','correccion')),
  quantity numeric(14,2) not null default 0,
  reference_type text not null default 'manual' check (reference_type in ('recepcion','pedido','garantia','manual')),
  reference_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index bodega_movements_product_idx on public.bodega_movements (product_id);
create index bodega_movements_created_idx on public.bodega_movements (created_at desc);
alter table public.bodega_movements enable row level security;
grant select, insert, update, delete on public.bodega_movements to authenticated;
create policy bodega_movements_all on public.bodega_movements for all to authenticated using (public.bodega_is_staff()) with check (public.bodega_is_staff());

-- ============================================================
-- Comercio
-- ============================================================
create table public.bodega_customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tipo text check (tipo in ('mayorista','detalle')),
  categoria_mayorista text check (categoria_mayorista in ('celulares','repuestos','ambos')),
  tax_id text,
  contact_name text,
  email text,
  phone text,
  address text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index bodega_customers_name_idx on public.bodega_customers (name);
alter table public.bodega_customers enable row level security;
grant select, insert, update, delete on public.bodega_customers to authenticated;
create policy bodega_customers_all on public.bodega_customers for all to authenticated using (public.bodega_is_staff()) with check (public.bodega_is_staff());

create table public.bodega_orders (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  customer_id uuid references public.bodega_customers(id) on delete set null,
  status text not null default 'en_preparacion' check (status in ('en_preparacion','despachado','cancelado')),
  order_date timestamptz not null default now(),
  delivery_date timestamptz,
  notes text,
  total numeric(14,2) not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bodega_orders_code_idx on public.bodega_orders (code);
create index bodega_orders_customer_idx on public.bodega_orders (customer_id);
alter table public.bodega_orders enable row level security;
grant select, insert, update, delete on public.bodega_orders to authenticated;
create policy bodega_orders_all on public.bodega_orders for all to authenticated using (public.bodega_is_staff()) with check (public.bodega_is_staff());

create table public.bodega_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.bodega_orders(id) on delete cascade,
  product_id uuid references public.bodega_products(id) on delete set null,
  quantity numeric(14,2) not null default 0,
  unit_condition text check (unit_condition in ('nuevo','seminuevo')),
  unit_price numeric(14,2) not null default 0,
  subtotal numeric(14,2) not null default 0
);
create index bodega_order_items_order_idx on public.bodega_order_items (order_id);
alter table public.bodega_order_items enable row level security;
grant select, insert, update, delete on public.bodega_order_items to authenticated;
create policy bodega_order_items_all on public.bodega_order_items for all to authenticated using (public.bodega_is_staff()) with check (public.bodega_is_staff());

create table public.bodega_order_item_units (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.bodega_order_items(id) on delete cascade,
  unit_id uuid
);
create index bodega_order_item_units_item_idx on public.bodega_order_item_units (order_item_id);
alter table public.bodega_order_item_units enable row level security;
grant select, insert, update, delete on public.bodega_order_item_units to authenticated;
create policy bodega_order_item_units_all on public.bodega_order_item_units for all to authenticated using (public.bodega_is_staff()) with check (public.bodega_is_staff());

-- ============================================================
-- Garantías y seriales previos
-- ============================================================
create table public.bodega_technicians (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.bodega_technicians enable row level security;
grant select, insert, update, delete on public.bodega_technicians to authenticated;
create policy bodega_technicians_all on public.bodega_technicians for all to authenticated using (public.bodega_is_staff()) with check (public.bodega_is_staff());

create table public.bodega_warranties (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  unit_id uuid references public.bodega_units(id) on delete set null,
  product_id uuid references public.bodega_products(id) on delete set null,
  customer_id uuid references public.bodega_customers(id) on delete set null,
  order_id uuid references public.bodega_orders(id) on delete set null,
  tecnico_id uuid references public.bodega_technicians(id) on delete set null,
  reason text not null default '',
  status text not null default 'recibido' check (status in ('recibido','en_servicio_tecnico','reenvio_pendiente','entregado','devuelto')),
  diagnostico text,
  resolucion text check (resolucion in ('reparado','cambio','sin_falla','defectuoso')),
  costo numeric(14,2),
  received_at timestamptz not null default now(),
  resolved_at timestamptz,
  notes text,
  imei_manual text,
  referencia_manual text,
  cliente_manual text,
  fecha_venta_manual text,
  created_by uuid
);
create index bodega_warranties_code_idx on public.bodega_warranties (code);
create index bodega_warranties_unit_idx on public.bodega_warranties (unit_id);
create index bodega_warranties_status_idx on public.bodega_warranties (status);
alter table public.bodega_warranties enable row level security;
grant select, insert, update, delete on public.bodega_warranties to authenticated;
create policy bodega_warranties_all on public.bodega_warranties for all to authenticated using (public.bodega_is_staff()) with check (public.bodega_is_staff());

create table public.bodega_warranty_events (
  id uuid primary key default gen_random_uuid(),
  warranty_id uuid not null references public.bodega_warranties(id) on delete cascade,
  status text not null check (status in ('recibido','en_servicio_tecnico','reenvio_pendiente','entregado','devuelto')),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index bodega_warranty_events_warranty_idx on public.bodega_warranty_events (warranty_id);
alter table public.bodega_warranty_events enable row level security;
grant select, insert, update, delete on public.bodega_warranty_events to authenticated;
create policy bodega_warranty_events_all on public.bodega_warranty_events for all to authenticated using (public.bodega_is_staff()) with check (public.bodega_is_staff());

create table public.bodega_previous_serials (
  id uuid primary key default gen_random_uuid(),
  serial text not null,
  notas text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index bodega_previous_serials_serial_idx on public.bodega_previous_serials (serial);
alter table public.bodega_previous_serials enable row level security;
grant select, insert, update, delete on public.bodega_previous_serials to authenticated;
create policy bodega_previous_serials_read on public.bodega_previous_serials for select to authenticated using (public.bodega_is_staff());
create policy bodega_previous_serials_write on public.bodega_previous_serials for all to authenticated using (public.bodega_is_admin()) with check (public.bodega_is_admin());

-- ============================================================
-- Auditoría (solo lectura para el administrador)
-- ============================================================
create table public.bodega_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  user_email text,
  action text not null check (action in ('create','update','delete','confirm','discard','assign','release','status','resolve','login')),
  entity text not null check (entity in ('product','category','brand','reception','unit','order','customer','warranty','user','tecnico','serial_previo','session')),
  entity_id uuid,
  details text,
  created_at timestamptz not null default now()
);
create index bodega_audit_logs_created_idx on public.bodega_audit_logs (created_at desc);
alter table public.bodega_audit_logs enable row level security;
grant select, insert on public.bodega_audit_logs to authenticated;
create policy bodega_audit_logs_read on public.bodega_audit_logs for select to authenticated using (public.bodega_is_admin());
create policy bodega_audit_logs_insert on public.bodega_audit_logs for insert to authenticated with check (public.bodega_is_staff());

-- ============================================================
-- Tiempo real: publicar los cambios de todas las tablas del inventario
-- ============================================================
do $$
declare
  nombre text;
  tablas text[] := array[
    'bodega_profiles',
    'bodega_categories',
    'bodega_brands',
    'bodega_products',
    'bodega_settings',
    'bodega_receptions',
    'bodega_reception_items',
    'bodega_units',
    'bodega_movements',
    'bodega_customers',
    'bodega_orders',
    'bodega_order_items',
    'bodega_order_item_units',
    'bodega_technicians',
    'bodega_warranties',
    'bodega_warranty_events',
    'bodega_previous_serials',
    'bodega_audit_logs'
  ];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach nombre in array tablas loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = nombre
    ) then
      execute format('alter publication supabase_realtime add table public.%I', nombre);
    end if;
  end loop;
end
$$;

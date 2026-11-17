\set ON_ERROR_STOP on

DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE SCHEMA auth;
CREATE SCHEMA nexora_archive;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE public.bodega_profiles (
  id uuid PRIMARY KEY,
  role text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.nexora_staff_role_plans (
  user_id uuid PRIMARY KEY,
  planned_role text NOT NULL,
  operationally_enabled boolean NOT NULL DEFAULT false
);

CREATE OR REPLACE FUNCTION public.bodega_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bodega_profiles p
    WHERE p.id = auth.uid() AND p.is_active AND p.role = 'admin'
  )
$$;

CREATE OR REPLACE FUNCTION public.bodega_is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bodega_profiles p
    JOIN auth.users au ON au.id = p.id
    WHERE p.id = auth.uid()
      AND p.is_active
      AND p.role IN ('admin', 'bodeguero')
      AND COALESCE(au.raw_app_meta_data->>'nexora_prepared_role', '')
        NOT IN ('encargado', 'vendedor')
      AND NOT EXISTS (
        SELECT 1 FROM public.nexora_staff_role_plans rp
        WHERE rp.user_id = p.id
          AND rp.operationally_enabled
          AND rp.planned_role IN ('encargado', 'vendedor')
      )
  )
$$;

CREATE TABLE public.bodega_technicians (
  id uuid PRIMARY KEY,
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.bodega_movements (
  id uuid PRIMARY KEY,
  unit_id uuid,
  type text NOT NULL,
  reference_type text NOT NULL,
  reference_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.bodega_receptions (
  id uuid PRIMARY KEY,
  status text NOT NULL
);
CREATE TABLE public.bodega_units (
  id uuid PRIMARY KEY,
  serial text NOT NULL,
  previous_serials text[] NOT NULL DEFAULT '{}',
  status text NOT NULL,
  reception_id uuid
);
CREATE TABLE public.bodega_warranties (
  id uuid PRIMARY KEY,
  unit_id uuid,
  status text NOT NULL,
  resolucion text,
  customer_id uuid,
  order_id uuid,
  cliente_manual text,
  reembolso_monto numeric,
  reembolso_metodo text,
  reembolso_referencia text,
  reembolso_pagado_at timestamptz
);
CREATE TABLE public.bodega_orders (
  id uuid PRIMARY KEY,
  status text NOT NULL,
  notes text,
  total numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.bodega_order_items (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL,
  product_id uuid,
  quantity numeric NOT NULL,
  unit_condition text,
  unit_price numeric NOT NULL,
  subtotal numeric NOT NULL,
  color text
);
CREATE TABLE public.bodega_order_item_units (
  id uuid PRIMARY KEY,
  order_item_id uuid NOT NULL,
  unit_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO auth.users(id, raw_app_meta_data) VALUES
  ('00000000-0000-4000-8000-000000000001', '{}'::jsonb),
  ('00000000-0000-4000-8000-000000000002', '{}'::jsonb),
  ('00000000-0000-4000-8000-000000000003', '{"nexora_prepared_role":"vendedor"}'::jsonb);
INSERT INTO public.bodega_profiles(id, role, is_active) VALUES
  ('00000000-0000-4000-8000-000000000001', 'admin', true),
  ('00000000-0000-4000-8000-000000000002', 'bodeguero', true),
  ('00000000-0000-4000-8000-000000000003', 'bodeguero', true);
INSERT INTO public.nexora_staff_role_plans(user_id, planned_role, operationally_enabled) VALUES
  ('00000000-0000-4000-8000-000000000003', 'vendedor', true);

INSERT INTO public.bodega_technicians(id,nombre,activo) VALUES
  ('10000000-0000-4000-8000-000000000001','Técnico fixture',true);

ALTER TABLE public.bodega_technicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bodega_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bodega_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bodega_receptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bodega_warranties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bodega_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bodega_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bodega_order_item_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY bodega_technicians_all ON public.bodega_technicians
  FOR ALL TO authenticated USING (public.bodega_is_staff())
  WITH CHECK (public.bodega_is_staff());
CREATE POLICY bodega_movements_insert ON public.bodega_movements
  FOR INSERT TO authenticated WITH CHECK (public.bodega_is_staff());
CREATE POLICY bodega_movements_read ON public.bodega_movements
  FOR SELECT TO authenticated USING (public.bodega_is_staff());
CREATE POLICY bodega_units_all ON public.bodega_units
  FOR ALL TO authenticated USING (public.bodega_is_staff())
  WITH CHECK (public.bodega_is_staff());
CREATE POLICY bodega_receptions_all ON public.bodega_receptions
  FOR ALL TO authenticated USING (public.bodega_is_staff())
  WITH CHECK (public.bodega_is_staff());
CREATE POLICY bodega_warranties_all ON public.bodega_warranties
  FOR ALL TO authenticated USING (public.bodega_is_staff())
  WITH CHECK (public.bodega_is_staff());
CREATE POLICY bodega_orders_all ON public.bodega_orders
  FOR ALL TO authenticated USING (public.bodega_is_staff())
  WITH CHECK (public.bodega_is_staff());
CREATE POLICY bodega_order_items_all ON public.bodega_order_items
  FOR ALL TO authenticated USING (public.bodega_is_staff())
  WITH CHECK (public.bodega_is_staff());
CREATE POLICY bodega_order_item_units_all ON public.bodega_order_item_units
  FOR ALL TO authenticated USING (public.bodega_is_staff())
  WITH CHECK (public.bodega_is_staff());

GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.bodega_profiles, public.nexora_staff_role_plans,
  public.bodega_technicians, public.bodega_movements, public.bodega_receptions,
  public.bodega_units, public.bodega_warranties, public.bodega_orders,
  public.bodega_order_items, public.bodega_order_item_units
TO authenticated;
GRANT SELECT ON auth.users TO authenticated;
GRANT EXECUTE ON FUNCTION public.bodega_is_admin(), public.bodega_is_staff()
TO authenticated;

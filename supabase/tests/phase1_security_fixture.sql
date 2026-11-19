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
CREATE TABLE public.bodega_products (
  id uuid PRIMARY KEY,
  cost numeric,
  color_variants jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE TABLE public.bodega_units (
  id uuid PRIMARY KEY,
  serial text NOT NULL,
  previous_serials text[] NOT NULL DEFAULT '{}',
  status text NOT NULL,
  reception_id uuid,
  location text,
  product_id uuid,
  unit_condition text,
  color text,
  cost numeric
);
CREATE TABLE public.bodega_warranties (
  id uuid PRIMARY KEY,
  unit_id uuid,
  status text NOT NULL,
  resolucion text,
  customer_id uuid,
  order_id uuid,
  imei_manual text,
  cliente_manual text,
  reembolso_monto numeric,
  reembolso_metodo text,
  reembolso_referencia text,
  reembolso_pagado_at timestamptz
);
CREATE TABLE public.nexora_retail_sales (unit_id uuid PRIMARY KEY);
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

-- Minimal copies of production legacy triggers that coexist with Phase 1.
CREATE OR REPLACE FUNCTION public.bodega_validar_asignacion_unidad()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $legacy_assignment$
DECLARE
  v_estado text;
  v_serial text;
  v_estado_pedido text;
BEGIN
  IF NEW.unit_id IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.bodega_order_item_units WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT status, serial INTO v_estado, v_serial
  FROM public.bodega_units WHERE id = NEW.unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BODEGA_UNIDAD_NO_DISPONIBLE:%', NEW.unit_id; END IF;

  SELECT o.status INTO v_estado_pedido
  FROM public.bodega_order_items oi
  JOIN public.bodega_orders o ON o.id = oi.order_id
  WHERE oi.id = NEW.order_item_id;

  IF v_estado_pedido = 'en_preparacion' AND v_estado <> 'en_bodega' THEN
    RAISE EXCEPTION 'BODEGA_UNIDAD_NO_DISPONIBLE:%', v_serial;
  ELSIF v_estado_pedido = 'despachado' AND v_estado NOT IN ('en_bodega','en_local') THEN
    RAISE EXCEPTION 'BODEGA_UNIDAD_NO_DISPONIBLE:%', v_serial;
  END IF;

  IF v_estado_pedido IN ('en_preparacion','despachado') AND EXISTS (
    SELECT 1 FROM public.bodega_order_item_units x
    JOIN public.bodega_order_items xi ON xi.id=x.order_item_id
    JOIN public.bodega_orders xo ON xo.id=xi.order_id
    WHERE x.unit_id=NEW.unit_id AND x.id<>NEW.id AND xo.status='en_preparacion'
  ) THEN
    RAISE EXCEPTION 'BODEGA_UNIDAD_YA_ASIGNADA:%', v_serial;
  END IF;
  RETURN NEW;
END;
$legacy_assignment$;

CREATE TRIGGER bodega_order_item_units_validar
BEFORE INSERT ON public.bodega_order_item_units
FOR EACH ROW EXECUTE FUNCTION public.bodega_validar_asignacion_unidad();

CREATE OR REPLACE FUNCTION public.nexora_guard_retail_legacy_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $legacy_retail_assignment$
BEGIN
  PERFORM pg_advisory_xact_lock(78192346);
  IF NEW.unit_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.nexora_retail_sales sale WHERE sale.unit_id=NEW.unit_id
  ) THEN
    RAISE EXCEPTION 'IMEI vendido en POS no puede asignarse a pedido mayorista.';
  END IF;
  RETURN NEW;
END;
$legacy_retail_assignment$;

CREATE TRIGGER nexora_00_guard_retail_legacy_assignment
BEFORE INSERT OR UPDATE OF unit_id, order_item_id ON public.bodega_order_item_units
FOR EACH ROW EXECUTE FUNCTION public.nexora_guard_retail_legacy_assignment();

CREATE OR REPLACE FUNCTION public.bodega_sincronizar_unidades_despacho()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $legacy_dispatch_sync$
BEGIN
  IF NEW.status='despachado' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.bodega_units u SET status='vendido'
    FROM public.bodega_order_item_units oiu
    JOIN public.bodega_order_items oi ON oi.id=oiu.order_item_id
    WHERE oiu.unit_id=u.id AND oi.order_id=NEW.id AND u.status<>'vendido';
  END IF;
  RETURN NEW;
END;
$legacy_dispatch_sync$;

CREATE TRIGGER trg_bodega_sincronizar_unidades_despacho
AFTER INSERT OR UPDATE OF status ON public.bodega_orders
FOR EACH ROW EXECUTE FUNCTION public.bodega_sincronizar_unidades_despacho();

CREATE OR REPLACE FUNCTION public.nexora_guard_retail_legacy_unit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $legacy_retail_unit$
BEGIN
  IF TG_OP='DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.nexora_retail_sales r WHERE r.unit_id=OLD.id) THEN
      RAISE EXCEPTION 'No puedes eliminar un IMEI vendido en POS.';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status='vendido' AND EXISTS (
    SELECT 1 FROM public.nexora_retail_sales r WHERE r.unit_id=OLD.id
  ) AND (
    NEW.status IS DISTINCT FROM OLD.status
    OR NEW.serial IS DISTINCT FROM OLD.serial
    OR NEW.cost IS DISTINCT FROM OLD.cost
    OR NEW.location IS DISTINCT FROM OLD.location
  ) THEN
    RAISE EXCEPTION 'IMEI vendido en POS no puede reactivarse fuera de devolución.';
  END IF;
  RETURN NEW;
END;
$legacy_retail_unit$;

CREATE TRIGGER nexora_guard_pos_sold_unit
BEFORE DELETE OR UPDATE OF status, serial, cost, location ON public.bodega_units
FOR EACH ROW EXECUTE FUNCTION public.nexora_guard_retail_legacy_unit();

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
INSERT INTO public.bodega_products(id,cost,color_variants) VALUES
  ('90000000-0000-4000-8000-000000000001',200,'[]'::jsonb);

ALTER TABLE public.bodega_technicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bodega_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bodega_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bodega_receptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bodega_products ENABLE ROW LEVEL SECURITY;
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
CREATE POLICY bodega_products_read ON public.bodega_products
  FOR SELECT TO authenticated USING (public.bodega_is_staff());
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
  public.bodega_units, public.bodega_products, public.bodega_warranties, public.bodega_orders,
  public.bodega_order_items, public.bodega_order_item_units,
  public.nexora_retail_sales
TO authenticated;
GRANT SELECT ON auth.users TO authenticated;
GRANT EXECUTE ON FUNCTION public.bodega_is_admin(), public.bodega_is_staff()
TO authenticated;

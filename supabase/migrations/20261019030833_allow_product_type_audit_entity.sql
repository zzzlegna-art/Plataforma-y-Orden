-- Keep product-type catalog actions in the audit trail using a stable database identifier.
-- The camelCase alias is retained temporarily for older open Nexora tabs during rollout.
begin;

alter table public.nexora_audit_logs
  drop constraint if exists nexora_audit_logs_entity_check;

alter table public.nexora_audit_logs
  add constraint nexora_audit_logs_entity_check
  check (entity = any (array[
    'product'::text,
    'product_type'::text,
    'productType'::text,
    'category'::text,
    'brand'::text,
    'reception'::text,
    'unit'::text,
    'order'::text,
    'customer'::text,
    'warranty'::text,
    'user'::text,
    'tecnico'::text,
    'serial_previo'::text,
    'session'::text
  ]));

commit;

-- El catálogo de Clientes se utiliza únicamente para Pedidos mayoristas.
-- categoria_mayorista permanece porque determina qué productos puede solicitar cada cliente.
-- Se valida que no existan registros de detalle antes de retirar el discriminador heredado.

do $$
begin
  if exists (
    select 1
    from public.bodega_customers
    where tipo is distinct from 'mayorista'
  ) then
    raise exception 'Hay clientes que no son mayoristas; se requiere revisión antes de retirar el campo heredado tipo.';
  end if;
end
$$;

alter table public.bodega_customers
  drop constraint if exists bodega_customers_tipo_check;

alter table public.bodega_customers
  drop column if exists tipo;

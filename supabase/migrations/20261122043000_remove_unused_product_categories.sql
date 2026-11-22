do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.bodega_aplicar_cambios(jsonb)'::regprocedure)
    into v_definition;
  if position('bodega_categories' in v_definition) = 0 then
    raise exception 'No se encontró la lista de tablas permitidas de bodega_aplicar_cambios';
  end if;
  v_definition := replace(v_definition, '''bodega_categories'', ', '');
  execute v_definition;

  select pg_get_functiondef('public.nexora_guardar_con_version(jsonb)'::regprocedure)
    into v_definition;
  if position('bodega_categories' in v_definition) = 0 then
    raise exception 'No se encontró la lista de tablas permitidas de nexora_guardar_con_version';
  end if;
  v_definition := replace(v_definition, '''bodega_categories'', ', '');
  execute v_definition;
end
$$;

alter table public.bodega_products
  drop constraint if exists bodega_products_category_id_fkey;

alter table public.bodega_products
  drop column if exists category_id;

drop table if exists public.bodega_categories;

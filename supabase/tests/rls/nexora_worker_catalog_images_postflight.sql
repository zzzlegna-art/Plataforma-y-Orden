-- Solo lectura: ejecutar DESPUÉS de instalar la migración del catálogo visual.
-- No genera productos, movimientos, costos ni datos ficticios.
do $verify$
declare
  v_ref text;
  v_imei text;
  v_repuestos integer;
  v_celulares_con_foto integer;
begin
  select pg_get_functiondef('public.nexora_inventory_reference_summary(text,integer,integer)'::regprocedure)
    into v_ref;
  select pg_get_functiondef('public.nexora_inventory_imei_directory(text,uuid,text,integer,integer)'::regprocedure)
    into v_imei;
  if v_ref is null or v_imei is null then
    raise exception 'Falta alguna consulta de inventario global.';
  end if;
  if position('v_retail_only' in v_ref)=0 or position('v_retail_only' in v_imei)=0
     or position('bodega_product_types' in v_ref)=0
     or position('bodega_product_types' in v_imei)=0
     or position('mayorista_group' in v_ref)=0 or position('mayorista_group' in v_imei)=0
     or position('imageUrl' in v_ref)=0 or position('imageUrl' in v_imei)=0
     or position('colorVariants' in v_ref)=0 or position('colorVariants' in v_imei)=0 then
    raise exception 'El filtro o las fotografías faltan en alguna consulta.';
  end if;
  if position('price' in v_ref)>0 or position('variant.photo->>''cost''' in v_ref)>0
     or position('variant.photo->>''price''' in v_imei)>0 then
    raise exception 'No exponer precios o costos de variantes en la consulta visual.';
  end if;
  if not has_function_privilege('authenticated',
       'public.nexora_inventory_reference_summary(text,integer,integer)','EXECUTE')
     or not has_function_privilege('authenticated',
       'public.nexora_inventory_imei_directory(text,uuid,text,integer,integer)','EXECUTE') then
    raise exception 'Las consultas dejaron de estar disponibles a personal autenticado.';
  end if;
  if has_function_privilege('anon',
       'public.nexora_inventory_reference_summary(text,integer,integer)','EXECUTE')
     or has_function_privilege('anon',
       'public.nexora_inventory_imei_directory(text,uuid,text,integer,integer)','EXECUTE') then
    raise exception 'Los usuarios anónimos obtuvieron consulta de inventario.';
  end if;
  select count(*) into v_repuestos from public.bodega_products
    where categoria='repuesto';
  select count(*) into v_celulares_con_foto from public.bodega_products
    where categoria='celular' and nullif(btrim(image_url),'') is not null;
  raise notice 'Catálogo comercial verificado: % referencias de repuestos preservadas fuera de la vista laboral; % celulares con foto real.',v_repuestos,v_celulares_con_foto;
end;
$verify$;

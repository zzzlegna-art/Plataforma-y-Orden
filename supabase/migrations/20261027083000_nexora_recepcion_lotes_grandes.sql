-- Optimización atómica para confirmaciones de recepciones con miles de seriales.
-- Mismos permisos y validaciones, con búsquedas y locks en bloque. La RPC sigue
-- siendo SECURITY INVOKER y respeta RLS; no altera inventario existente.
CREATE OR REPLACE FUNCTION public.nexora_guardar_con_version(p_cambios jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_cambios jsonb := p_cambios;
  paso jsonb;
  anterior jsonb;
  actual jsonb;
  normalizado jsonb;
  tabla text;
  nuevo text;
  v_op text;
  v_indice integer := 0;
  v_fila jsonb;
  v_fila_esperada jsonb;
  v_fila_efectiva jsonb;
  v_filas_efectivas jsonb;
  v_esperados jsonb;
  v_nuevos jsonb;
  v_id text;
  v_clave text;
  v_specs_actuales jsonb;
  v_specs_esperadas jsonb;
  v_specs_nuevas jsonb;
  v_specs_finales jsonb;
  v_spec_clave text;
  v_es_nuevo boolean;
  v_ids_lote text[];
  v_count_lote bigint;
  v_filas_lote bigint;
  v_conflicto_lote boolean;
begin
  if p_cambios is null
     or jsonb_typeof(p_cambios -> 'pasos') is distinct from 'array' then
    raise exception 'BODEGA_CAMBIOS_INVALIDOS';
  end if;

  if coalesce(p_cambios ->> 'version', '') <> '1' then
    raise exception 'BODEGA_CAMBIOS_VERSION:%', coalesce(p_cambios ->> 'version', '');
  end if;

  -- Serializa los guardados de la aplicación. Los registros se bloquean también
  -- individualmente más abajo para coordinar con otras escrituras del servidor.
  perform pg_advisory_xact_lock(78192346);

  for paso in select value from jsonb_array_elements(v_cambios -> 'pasos') loop
    tabla := paso ->> 'tabla';
    v_op := paso ->> 'op';

    if tabla not in (
      'bodega_units', 'bodega_orders', 'bodega_order_items', 'bodega_warranties',
      'bodega_receptions', 'bodega_reception_items', 'bodega_products', 'bodega_customers',
      'bodega_order_item_units', 'bodega_categories', 'bodega_product_types', 'bodega_brands',
      'bodega_technicians', 'bodega_previous_serials', 'bodega_profiles', 'bodega_settings'
    ) then
      v_indice := v_indice + 1;
      continue;
    end if;

    if v_op = 'upsert' then
      v_esperados := coalesce(paso -> 'esperados', '[]'::jsonb);
      v_nuevos := coalesce(paso -> 'nuevos', '[]'::jsonb);
      v_filas_efectivas := '[]'::jsonb;

      if jsonb_typeof(v_esperados) is distinct from 'array'
         or jsonb_typeof(v_nuevos) is distinct from 'array'
         or jsonb_typeof(coalesce(paso -> 'filas', 'null'::jsonb)) is distinct from 'array' then
        raise exception 'BODEGA_CAMBIOS_INVALIDOS';
      end if;

      -- Recepciones voluminosas: 1.350 unidades nuevas no deben ejecutar
      -- 1.350 x 1.350 búsquedas sobre arrays JSON ni concatenaciones O(n²).
      if tabla = 'bodega_units'
         and jsonb_array_length(v_esperados) = 0
         and jsonb_array_length(v_nuevos) > 100
         and jsonb_array_length(v_nuevos) = jsonb_array_length(paso -> 'filas')
         and not coalesce((paso ->> 'solo_alta')::boolean, false) then
        select array_agg(n.value), count(distinct n.value)
          into v_ids_lote, v_count_lote
          from jsonb_array_elements_text(v_nuevos) as n(value);
        select count(distinct f.value ->> 'id') into v_filas_lote
          from jsonb_array_elements(paso -> 'filas') as f(value);
        if v_count_lote <> cardinality(v_ids_lote)
           or v_filas_lote <> cardinality(v_ids_lote)
           or exists (
             select 1 from jsonb_array_elements(paso -> 'filas') as f(value)
             where f.value ->> 'id' is null
               or not ((f.value ->> 'id') = any (v_ids_lote))
           ) then
          raise exception 'BODEGA_CAMBIOS_INVALIDOS';
        end if;
        execute format('select exists (select 1 from public.%I t where t.id::text = any ($1))', tabla)
          into v_conflicto_lote using v_ids_lote;
        if v_conflicto_lote then
          raise exception 'BODEGA_CONFLICTO_CONCURRENCIA';
        end if;
        v_filas_efectivas := paso -> 'filas';
      else
      for v_fila in
        select value from jsonb_array_elements(coalesce(paso -> 'filas', '[]'::jsonb))
      loop
        v_id := v_fila ->> 'id';
        if v_id is null then
          raise exception 'BODEGA_CAMBIOS_INVALIDOS';
        end if;

        v_fila_esperada := null;
        select e.value
          into v_fila_esperada
          from jsonb_array_elements(v_esperados) as e(value)
         where e.value ->> 'id' = v_id
         limit 1;

        if v_fila_esperada is null then
          -- Una fila nueva debe seguir sin existir. Las colecciones de solo alta
          -- no envían 'nuevos' ni 'esperados', y conservan su comportamiento previo.
          select exists (
            select 1
              from jsonb_array_elements(v_nuevos) as n(value)
             where n.value #>> '{}' = v_id
          ) into v_es_nuevo;

          if v_es_nuevo then
            execute format(
              'select to_jsonb(t) from public.%I as t where t.id::text = $1',
              tabla
            ) into actual using v_id;

            if actual is not null then
              raise exception 'BODEGA_CONFLICTO_CONCURRENCIA';
            end if;
          elsif not coalesce((paso ->> 'solo_alta')::boolean, false) then
            raise exception 'BODEGA_CAMBIOS_INVALIDOS';
          end if;

          v_fila_efectiva := v_fila;
        else
          execute format(
            'select to_jsonb(t) from public.%I as t where t.id::text = $1 for update',
            tabla
          ) into actual using v_id;

          if actual is null then
            raise exception 'BODEGA_CONFLICTO_CONCURRENCIA';
          end if;

          execute format(
            'select to_jsonb(jsonb_populate_record(null::public.%I, $1))',
            tabla
          ) into normalizado using v_fila_esperada;

          -- El payload final contiene solo las columnas que el cliente iba a
          -- escribir. Para campos intactos se toma el valor actual del servidor,
          -- evitando pisar cambios ajenos que ya llegaron por sincronización.
          v_fila_efectiva := '{}'::jsonb;
          for v_clave in select jsonb_object_keys(v_fila) loop
            if v_clave = 'id' or v_clave = 'updated_at' then
              -- ID estable y marca de tiempo de edición: no son conflictos de negocio.
              v_fila_efectiva := jsonb_set(
                v_fila_efectiva, array[v_clave], v_fila -> v_clave, true
              );
            elsif tabla = 'bodega_products'
              and v_clave = 'technical_specs'
              and (v_fila -> v_clave) is distinct from (v_fila_esperada -> v_clave) then
              -- technical_specs se proyecta por categoría en el cliente: compara solo
              -- las claves que el usuario cambió y conserva campos heredados/ocultos.
              v_specs_actuales := case
                when jsonb_typeof(actual -> 'technical_specs') = 'object'
                  then actual -> 'technical_specs'
                else '{}'::jsonb
              end;
              v_specs_esperadas := case
                when jsonb_typeof(normalizado -> 'technical_specs') = 'object'
                  then normalizado -> 'technical_specs'
                else '{}'::jsonb
              end;
              v_specs_nuevas := case
                when jsonb_typeof(v_fila -> 'technical_specs') = 'object'
                  then v_fila -> 'technical_specs'
                else '{}'::jsonb
              end;
              v_specs_finales := v_specs_actuales;

              for v_spec_clave in
                select claves.clave
                  from (
                    select jsonb_object_keys(v_specs_esperadas) as clave
                    union
                    select jsonb_object_keys(v_specs_nuevas) as clave
                  ) as claves
              loop
                if (v_specs_nuevas -> v_spec_clave) is distinct from (v_specs_esperadas -> v_spec_clave) then
                  if (v_specs_actuales -> v_spec_clave) is distinct from (v_specs_esperadas -> v_spec_clave) then
                    raise exception 'BODEGA_CONFLICTO_CONCURRENCIA';
                  end if;

                  if v_specs_nuevas ? v_spec_clave then
                    v_specs_finales := jsonb_set(
                      v_specs_finales, array[v_spec_clave], v_specs_nuevas -> v_spec_clave, true
                    );
                  else
                    v_specs_finales := v_specs_finales - v_spec_clave;
                  end if;
                end if;
              end loop;

              v_fila_efectiva := jsonb_set(
                v_fila_efectiva, array[v_clave], v_specs_finales, true
              );
            elsif (v_fila -> v_clave) is distinct from (v_fila_esperada -> v_clave) then
              -- Para los demás campos, sigue vigente la protección anti-pisado:
              -- si otro usuario cambió el mismo campo, se rechaza el guardado.
              if (actual -> v_clave) is distinct from (normalizado -> v_clave) then
                raise exception 'BODEGA_CONFLICTO_CONCURRENCIA';
              end if;
              v_fila_efectiva := jsonb_set(
                v_fila_efectiva, array[v_clave], v_fila -> v_clave, true
              );
            else
              v_fila_efectiva := jsonb_set(
                v_fila_efectiva, array[v_clave], actual -> v_clave, true
              );
            end if;
          end loop;
        end if;

        v_filas_efectivas := v_filas_efectivas || jsonb_build_array(v_fila_efectiva);
      end loop;
      end if;

      v_cambios := jsonb_set(
        v_cambios,
        array['pasos', v_indice::text, 'filas'],
        v_filas_efectivas,
        true
      );

    elsif v_op = 'borrar' then
      -- Para recepciones grandes, bloquear y comparar en bloque todos los
      -- ítems antes de eliminarlos; nunca omitir la protección de concurrencia.
      v_esperados := coalesce(paso -> 'esperados', '[]'::jsonb);
      if tabla = 'bodega_reception_items'
         and jsonb_typeof(v_esperados) = 'array'
         and jsonb_array_length(v_esperados) > 100 then
        if jsonb_typeof(paso -> 'ids') is distinct from 'array' then
          raise exception 'BODEGA_CAMBIOS_INVALIDOS';
        end if;
        select array_agg(e.value), count(distinct e.value)
          into v_ids_lote, v_count_lote
          from jsonb_array_elements_text(paso -> 'ids') as e(value);
        select count(distinct e.value ->> 'id') into v_filas_lote
          from jsonb_array_elements(v_esperados) as e(value);
        if v_count_lote <> cardinality(v_ids_lote)
           or v_filas_lote <> cardinality(v_ids_lote)
           or cardinality(v_ids_lote) <> jsonb_array_length(v_esperados)
           or exists (
             select 1 from jsonb_array_elements(v_esperados) as e(value)
             where e.value ->> 'id' is null
               or not ((e.value ->> 'id') = any(v_ids_lote))
           ) then
          raise exception 'BODEGA_CAMBIOS_INVALIDOS';
        end if;
        execute format($fast_delete$
          with bloqueadas as materialized (
            select t.id::text as id, to_jsonb(t) as fila
              from public.%I t
             where t.id::text = any($1)
             for update
          ),
          esperadas as (
            select e.value,
                   to_jsonb(jsonb_populate_record(null::public.%I, e.value)) as normalizada
              from jsonb_array_elements($2) as e(value)
          )
          select exists (
            select 1 from esperadas e
            left join bloqueadas b on b.id = e.value ->> 'id'
            where b.id is null or not b.fila @> (
              select jsonb_object_agg(k, e.normalizada -> k)
                from jsonb_object_keys(e.value) as k
            )
          )
        $fast_delete$, tabla, tabla)
          into v_conflicto_lote using v_ids_lote, v_esperados;
        if v_conflicto_lote then
          raise exception 'BODEGA_CONFLICTO_CONCURRENCIA';
        end if;
      else
      -- Lotes pequeños continúan usando exactamente la comprobación anterior.
      for anterior in
        select value from jsonb_array_elements(coalesce(paso -> 'esperados', '[]'::jsonb))
      loop
        if anterior ->> 'id' is null then
          raise exception 'BODEGA_CAMBIOS_INVALIDOS';
        end if;

        execute format(
          'select to_jsonb(t) from public.%I as t where t.id::text = $1 for update',
          tabla
        ) into actual using anterior ->> 'id';

        execute format(
          'select to_jsonb(jsonb_populate_record(null::public.%I, $1))',
          tabla
        ) into normalizado using anterior;

        if actual is null or not actual @> (
          select jsonb_object_agg(k, normalizado -> k)
            from jsonb_object_keys(anterior) as k
        ) then
          raise exception 'BODEGA_CONFLICTO_CONCURRENCIA';
        end if;
      end loop;
      end if;
    end if;

    v_indice := v_indice + 1;
  end loop;

  return public.bodega_aplicar_cambios(v_cambios);
end;
$function$


-- Nexora: evita falsos conflictos al editar fichas técnicas de productos.
-- technical_specs se filtra por categoría en el cliente; compara y combina solo
-- las claves editadas para conservar propiedades heredadas que no aparecen en el formulario.
-- Los conflictos reales en la misma característica siguen rechazándose.
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

      v_cambios := jsonb_set(
        v_cambios,
        array['pasos', v_indice::text, 'filas'],
        v_filas_efectivas,
        true
      );

    elsif v_op = 'borrar' then
      -- Al borrar sí se valida la fila completa: no se elimina un registro que
      -- otro usuario haya modificado desde que se cargó.
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

    v_indice := v_indice + 1;
  end loop;

  return public.bodega_aplicar_cambios(v_cambios);
end;
$function$;

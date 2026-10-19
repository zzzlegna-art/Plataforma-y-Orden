-- ============================================================
-- Nexora :: sin seriales repetidos dentro de una misma recepción
--
-- La app ya evitaba escanear dos veces el mismo serial en una recepción, pero esa validación
-- solo corría en la pantalla, contra lo que ya tenía en memoria. Si dos escaneos del mismo
-- serial se cruzaban muy seguido (por ejemplo un lector físico que a veces dispara dos veces
-- con un solo movimiento), la segunda lectura podía colarse antes de que la primera terminara
-- de guardarse, y las dos quedaban guardadas: recién se notaba al confirmar la recepción, con
-- un mensaje de "serial duplicado" que no tenía nada visible que corregir en la lista.
--
-- Esta regla lo impide directamente en la base de datos: la segunda escritura se rechaza al
-- instante, sin importar qué tan rápido lleguen las dos.
-- ============================================================

do $$
begin
  alter table public.nexora_reception_items
    add constraint nexora_reception_items_serial_unico_por_recepcion unique (reception_id, serial);
exception
  when duplicate_object or duplicate_table then null;
end $$;

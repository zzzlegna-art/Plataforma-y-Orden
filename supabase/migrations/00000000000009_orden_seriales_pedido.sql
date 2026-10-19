-- ============================================================
-- Nexora :: fecha de creación en los seriales asignados a un pedido
--
-- nexora_order_item_units no tenía ninguna fecha, así que no había forma de ordenar los
-- seriales de un pedido por cuándo se fueron escaneando. La lista se ordenaba por el id
-- interno (aleatorio) de cada fila, así que cada vez que la pantalla se sincronizaba de nuevo
-- con el servidor, la lista se reordenaba sola: parecía que un serial "desaparecía" o "se
-- movía", aunque nunca se perdió nada.
--
-- Es aditiva: agrega una sola columna, con la hora de ahora como valor por defecto (para las
-- filas que ya existían). No cambia ningún dato existente.
-- ============================================================

alter table public.nexora_order_item_units
  add column if not exists created_at timestamptz not null default now();

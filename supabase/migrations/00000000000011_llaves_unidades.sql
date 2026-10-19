-- ============================================================
-- Nexora (migración histórica) :: llaves que faltaban hacia las unidades
--
-- Los movimientos de inventario y las asignaciones de serial a un pedido guardan el id de la
-- unidad, pero la base no lo comprobaba: si una unidad se borraba por error (o un bug dejaba
-- la referencia mal escrita), esas filas quedaban apuntando a algo que ya no existe y
-- aparecían en los reportes sin unidad.
--
-- Ahora la base lo garantiza:
--   * Un movimiento cuya unidad se borra se conserva (el historial no se pierde); solo queda
--     sin unidad.
--   * Una asignación de serial a un pedido se borra junto con su unidad.
--
-- Las llaves se comprueban al confirmar la operación completa (no fila por fila), así el
-- guardado atómico de la app puede escribir las unidades y sus movimientos en cualquier orden.
-- Se agregan también los índices que faltaban en esas columnas, para que buscar el historial
-- de una unidad no recorra toda la tabla.
-- ============================================================

do $$
begin
  alter table public.bodega_movements
    add constraint bodega_movements_unit_id_fkey
    foreign key (unit_id) references public.bodega_units (id)
    on delete set null
    deferrable initially deferred;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.bodega_order_item_units
    add constraint bodega_order_item_units_unit_id_fkey
    foreign key (unit_id) references public.bodega_units (id)
    on delete cascade
    deferrable initially deferred;
exception
  when duplicate_object then null;
end $$;

create index if not exists bodega_movements_unit_id_idx
  on public.bodega_movements (unit_id);

create index if not exists bodega_order_item_units_unit_id_idx
  on public.bodega_order_item_units (unit_id);

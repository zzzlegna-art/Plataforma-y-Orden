# Reglas de negocio de Nexora

## Inventario y trazabilidad

Toda unidad física debe tener producto asociado, identificador único, estado actual e historial de movimientos.

## Seriales e IMEIs

- Un serial activo no puede pertenecer a dos unidades activas.
- La validación de duplicados debe realizarse antes de guardar.
- La trazabilidad histórica debe conservarse aunque cambie el estado de una unidad.

## Guardados atómicos

Las operaciones que modifican varias entidades relacionadas deben completarse en su totalidad o revertirse. No se deben dejar pedidos, unidades o movimientos en un estado parcial.

## Recepciones

Una recepción representa mercancía recibida. Las unidades y seriales deben asociarse a la recepción correspondiente y validarse contra duplicados.

## Pedidos

Las cantidades, las unidades asignadas y los cambios de estado deben mantenerse coherentes y respetar las reglas de disponibilidad.

## Garantías

Los eventos y documentos de garantía deben conservar su historial. Las acciones permitidas dependen del estado y del rol del usuario.

## Permisos

- El acceso requiere una sesión válida y un perfil activo.
- Las operaciones administrativas deben limitarse a roles autorizados.
- RLS debe permanecer activo y verificarse mediante pruebas.

## Cambios futuros

Toda nueva función debe respetar estas reglas y agregar pruebas de regresión para los flujos afectados.

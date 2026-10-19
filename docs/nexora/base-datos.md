# Modelo de datos de Nexora

## Propósito

La base de datos registra productos, unidades físicas, movimientos, recepciones, pedidos, clientes, garantías, técnicos, perfiles y auditoría.

## Entidades principales

- Productos: SKU, nombre, categoría, marca, precio, coste, stock mínimo, imagen y ficha técnica.
- Unidades: serial/IMEI, producto, condición, estado y trazabilidad.
- Movimientos: entradas, salidas y cambios de inventario.
- Recepciones: mercancía recibida y sus unidades.
- Pedidos: cliente, líneas de producto y unidades asignadas.
- Garantías: unidad, estado, eventos y documentos.
- Usuarios y perfiles: identidad, rol y estado de acceso.
- Auditoría: acciones relevantes y su actor.

## Integridad

- Los seriales activos deben ser únicos.
- Las unidades deben mantener una relación trazable con el producto.
- Los movimientos y eventos históricos no deben modificarse sin autorización.
- Las operaciones críticas deben guardarse de forma atómica.
- Las políticas RLS deben limitar lectura y escritura según el rol.

## Migración de identificadores

La migración `20261019060000_rename_legacy_identifiers_to_nexora.sql` renombra objetos de base de datos heredados a `nexora_*`, actualiza los cuerpos de las funciones y conserva los datos, relaciones y permisos existentes. Está preparada en la rama de desarrollo, pero no se ha aplicado a producción.

## Datos auditados

La única instancia Supabase visible en la auditoría contiene 47 productos y 47 URL de imagen. Las 47 fichas técnicas están vacías. Esa instancia no se ha confirmado como el destino de producción de Nexora; no completar datos ni aplicar migraciones hasta confirmar el proyecto correcto.

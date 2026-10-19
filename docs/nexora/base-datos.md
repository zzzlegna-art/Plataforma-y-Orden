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

## Migraciones

El esquema actual conserva identificadores técnicos heredados. Su normalización para Nexora requiere una migración coordinada de tablas, funciones, triggers, políticas, relaciones, funciones remotas, tipos y código cliente. No se deben cambiar identificadores únicamente en el frontend.

## Datos actuales auditados

La instancia visible en la auditoría contiene 47 productos y 47 URL de imagen. Las 47 fichas técnicas están vacías. Antes de completar datos técnicos, verificar el modelo exacto de cada producto.

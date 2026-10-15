# Nexora v5.0 — Fase 3 (interfaz de operaciones)

## Alcance
- Diseño unificado de encabezados para Inventario, Recepción y Pedidos.
- Refinamiento de tarjetas de indicadores, filtros, tablas, controles y responsive.
- Capa CSS limitada a las tres páginas; no se cambian cálculos, consultas, validaciones, exportaciones ni rutas.
- Se conserva todo el código React, los tests y las migraciones de la fase 2.

## Seguridad y verificación
- No se ejecutan migraciones ni operaciones sobre Supabase.
- No se configura despliegue ni se modifican proyectos remotos.
- Requiere instalación de dependencias y validación real con `npm run build` y pruebas antes de publicar.

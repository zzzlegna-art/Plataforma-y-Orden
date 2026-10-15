# Nexora v5.0 — Fase 2: Panel principal

## Cambios
- Panel de operaciones rediseñado para acercarse a las referencias visuales originales, conservando Emerald Tech.
- Indicadores originales (disponibles, recibidos, stock bajo, valor de inventario, pedidos y garantías) conectados a `getDashboard(db)`.
- Acciones rápidas funcionales con enlaces a rutas existentes y permisos respetados.
- Se eliminó la búsqueda decorativa que no ejecutaba ninguna consulta. En su lugar se añadió un acceso a seriales.
- Se conservaron las gráficas de Recharts, las alertas, listados y selectores originales.
- Mejoras responsive y soporte de movimiento reducido.

## Alcance y precauciones
- No se alteraron migraciones SQL, RLS, ni conexiones remotas.
- No se cambiaron servicios, lógica de inventario, pedidos, garantías o seriales.
- No se ejecutó despliegue.
- Validar en un entorno de pruebas antes de producción.

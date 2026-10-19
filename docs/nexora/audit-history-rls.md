# Auditoría, historiales y RLS

## Objetivo

Proteger los registros de auditoría, movimientos de inventario y eventos de garantía para conservar la trazabilidad histórica.

## Reglas

- Mantener RLS activo y comprobar las políticas por rol.
- Los eventos históricos deben ser inmutables desde los flujos normales de la aplicación.
- La creación de eventos debe registrar el actor cuando corresponda.
- Las eliminaciones en cascada deben revisarse cuidadosamente si afectan registros históricos.
- Las funciones RPC deben ejecutarse con los permisos mínimos necesarios y permanecer sujetas a las políticas apropiadas.

## Validación de cambios

1. Revisar las tablas, funciones, triggers y políticas afectadas.
2. Comprobar los permisos de administrador y personal operativo.
3. Probar los flujos de creación, actualización y eliminación.
4. Verificar que los historiales no puedan alterarse desde roles no autorizados.
5. Aplicar los cambios primero en un entorno de prueba y conservar una estrategia de reversión.

No se debe ejecutar una migración de seguridad en producción sin comprobar su impacto en garantías, auditoría y relaciones históricas.

# Revisión de seguridad RLS — Nexora

## Estado observado

La consulta de solo lectura encontró RLS activado en las 51 tablas públicas de la instancia Supabase accesible durante la auditoría.

Este resultado confirma la activación de RLS, pero no sustituye las pruebas de autorización por rol. Cada política debe comprobarse con cuentas de personal y administrador, incluidos los permisos de las funciones RPC, los triggers y el almacenamiento.

## Validaciones pendientes

- Confirmar que el proyecto remoto revisado es el mismo que usa producción.
- Ejecutar las pruebas de aislamiento entre roles.
- Verificar que las funciones de guardado atómico no puedan omitir RLS ni permisos.
- Confirmar que la auditoría y los eventos históricos no puedan alterarse desde roles no autorizados.
- Revisar permisos de lectura pública y escritura del bucket de imágenes.
- Conservar evidencia de las pruebas y documentar cualquier excepción.

## Bloqueo de despliegue

La referencia de proyecto en `supabase/config.toml` difiere de la instancia visible en la auditoría. No aplicar migraciones ni declarar cerrada la revisión hasta alinear el destino y ejecutar las validaciones.

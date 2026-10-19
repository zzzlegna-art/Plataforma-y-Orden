# Nexora Database Map

## Objetivo

Mapa de referencia para que una IA comprenda la base de datos antes de
realizar cambios.

## Reglas

Toda modificación debe considerar:

-   RLS.
-   Auditoría.
-   Integridad histórica.
-   Relaciones.
-   Migraciones.

## Formato de tabla

### Nombre de tabla

Propósito: Descripción.

Relaciones: Tablas relacionadas.

Reglas: - Permisos. - Restricciones. - Eventos.

## Seguridad

La IA debe asumir que: - Los datos requieren protección. - RLS debe
permanecer activo. - Cambios destructivos requieren revisión.

## Migraciones

Deben ser: - Claras. - Versionadas. - Validadas automáticamente.

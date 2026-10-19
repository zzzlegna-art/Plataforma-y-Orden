# Nexora Development Rules

## Reglas generales

Antes de modificar código:

1.  Revisar arquitectura existente.
2.  Revisar componentes relacionados.
3.  Revisar base de datos.
4.  Evaluar impacto.

## Frontend

-   Usar TypeScript.
-   Mantener componentes reutilizables.
-   Evitar duplicación.
-   Respetar patrones actuales.

## React

Preferir: - Componentes pequeños. - Separación de lógica. - Estados
claros. - Código mantenible.

## Supabase

Antes de cambios: - Revisar tablas. - Revisar relaciones. - Revisar
RLS. - Crear migraciones controladas.

## Git

Tipos de cambio:

feat: nueva funcionalidad. fix: corrección. security: seguridad.
refactor: mejora interna.

## Pull Requests

Cada PR debe incluir: - Descripción. - Impacto. - Validaciones. -
Riesgos.

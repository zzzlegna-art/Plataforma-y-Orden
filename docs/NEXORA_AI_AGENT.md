# Nexora — agente de desarrollo asistido por IA

## Propósito

Asistente especializado en mantener y ampliar Nexora respetando la arquitectura existente y las reglas operativas.

## Stack

- React
- TypeScript
- Vite
- shadcn/ui y Tailwind CSS
- Supabase: PostgreSQL, Auth, RLS, Realtime y funciones remotas

## Reglas de desarrollo

1. No modificar directamente la rama principal.
2. Crear una rama para cada implementación.
3. Analizar dependencias antes de cambiar arquitectura.
4. Gestionar cambios de base de datos mediante migraciones versionadas.
5. Nunca exponer claves privilegiadas.
6. Mantener y revisar RLS.
7. Separar la lógica de negocio de la interfaz.
8. Ejecutar validaciones antes de proponer integración.

## Flujo

Solicitud → análisis → plan → implementación → pruebas → pull request → revisión humana.

## Reglas de datos

- Toda tabla o cambio de esquema requiere una migración.
- Revisar permisos por rol y restricciones de integridad.
- Preservar auditoría, trazabilidad e históricos.
- No ejecutar cambios destructivos en producción sin aprobación explícita y un plan de reversión.

## Objetivos

- Revisar calidad de código.
- Proponer mejoras verificables.
- Generar implementaciones seguras.
- Mantener documentación técnica actualizada.
- Registrar decisiones y cambios.

# Auditoría de seguridad — Nexora

## Alcance

Revisión de solo lectura de la estructura de Supabase, políticas RLS observables, almacenamiento de imágenes y configuración de despliegue.

## Hallazgos verificados

- La instancia Supabase accesible en la auditoría es `ivholkjldntrmagcmogh` y aparece activa.
- Las 51 tablas del esquema público observadas tienen RLS activado.
- Activar RLS no demuestra por sí solo que cada política sea correcta: deben verificarse las reglas por rol, los grants y las funciones privilegiadas.
- El bucket de imágenes de producto es público para lectura; las políticas de subida y eliminación están limitadas a personal autenticado y activo.
- El catálogo contiene 47 productos con URL de imagen. Las 47 fichas técnicas están vacías.
- Hay 58 objetos en el bucket y 11 no aparecen referenciados por productos actuales.
- La referencia de `supabase/config.toml` no coincide con la instancia accesible en la auditoría.
- La conexión de lectura a Vercel devuelve `403 Forbidden`; las variables de producción y los logs no se pudieron verificar.

## Acciones recomendadas

1. Confirmar el proyecto Supabase de destino antes de desplegar.
2. Recuperar acceso de lectura al proyecto Vercel.
3. Ejecutar pruebas RLS por rol sobre tablas, funciones RPC y almacenamiento.
4. Revisar los 11 objetos de imagen no referenciados antes de eliminarlos.
5. Validar en una copia la migración reversible `20261019060000_rename_legacy_identifiers_to_nexora.sql`, incluidos datos, permisos, triggers, RLS y funciones.

## Restricciones

Esta auditoría no modificó datos ni configuraciones remotas. No se deben publicar cambios de backend hasta resolver la discrepancia de proyecto y verificar las pruebas.

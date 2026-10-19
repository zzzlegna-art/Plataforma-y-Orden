# Nexora — aislamiento y despliegue seguro

## Objetivo

Mantener Nexora como producto independiente, con identidad propia y con una infraestructura remota validada antes de publicar cambios.

## Estado comprobado

- Repositorio: `zzzlegna-art/Plataforma-y-Orden`, rama principal `main`.
- Vercel: existe un proyecto llamado `nexora`. Tiene un dominio verificado sin la marca anterior: `nexora-beige-gamma.vercel.app`.
- El proyecto Vercel figura como no-live y su último despliegue estaba en estado `BUILDING`; no se debe tratar como producción lista.
- Vercel también conserva aliases heredados con `bodega6-a`. La conexión permite leer el proyecto, pero no ofrece una acción para quitar esos aliases desde este flujo.
- Supabase visible para la conexión: referencia `ivholkjldntrmagcmogh`, estado activo.
- La consulta de solo lectura encontró 51 tablas públicas, todas con RLS activado.
- Catálogo: 47 productos y 47 URL de imágenes; las 47 fichas técnicas están vacías.
- Almacenamiento: 58 archivos en el bucket de imágenes; 11 no aparecen referenciados por productos.
- Bloqueo crítico: `supabase/config.toml` apunta a `kiizldurgjtorxpzebpm`, distinto de la única instancia Supabase visible. Además, la instancia visible no tiene el RPC versionado que espera el código actual.

## Cambios preparados en la rama Nexora

- La identidad de la aplicación, el manifiesto PWA y los iconos usan Nexora.
- Los módulos cliente, tipos generados, pruebas y funciones Edge usan identificadores `nexora_*` / `nexora-*`.
- Se añadió `supabase/migrations/20261019060000_rename_legacy_identifiers_to_nexora.sql`, que renombra los objetos existentes de forma transaccional y preserva sus datos.
- Las migraciones históricas se mantienen en su orden y con su semántica original; la migración nueva realiza la transición después de ellas.

## Bloqueos antes de producción

1. Confirmar el proyecto Supabase correcto y alinear `supabase/config.toml` con las variables de Vercel.
2. Verificar que las migraciones anteriores y el RPC `nexora_guardar_con_version(jsonb)` estén disponibles en el destino.
3. Recuperar acceso de escritura a los ajustes de Vercel para retirar aliases heredados y confirmar el dominio canónico.
4. Ejecutar el cambio de esquema en una copia de prueba, comprobar RLS, funciones, triggers, permisos y datos, y preparar reversión.
5. Completar las fichas técnicas con datos verificados de cada producto.
6. Revisar los archivos de imagen no referenciados antes de decidir si deben conservarse.

## Reglas

- No desplegar ni aplicar migraciones mientras el destino remoto no esté confirmado.
- No eliminar productos, imágenes, usuarios, seriales, pedidos, garantías ni registros históricos como parte de la limpieza de marca.
- Nunca incluir claves privilegiadas en el frontend o en archivos versionados.
- Los cambios deben pasar por rama, pruebas, pull request y revisión antes de integrarse.

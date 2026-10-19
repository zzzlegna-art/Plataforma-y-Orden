# Nexora — aislamiento y despliegue seguro

## Objetivo

Mantener Nexora como producto independiente, con identidad propia y con una infraestructura remota validada antes de publicar cambios.

## Estado comprobado

- Repositorio: `zzzlegna-art/Plataforma-y-Orden`, rama principal `main`.
- Vercel: existe un proyecto llamado `nexora` y GitHub registra un despliegue completado para el commit `98732fedf06370f84282d72462920de56d5eb4c3`.
- Acceso a Vercel: las consultas de proyecto, dominios y registros devuelven `403 Forbidden` para el ámbito conectado. No se pudieron verificar las variables de producción ni probar directamente el sitio.
- Supabase visible para la conexión: referencia `ivholkjldntrmagcmogh`, estado activo.
- La consulta de solo lectura encontró 51 tablas públicas, todas con RLS activado.
- Catálogo: 47 productos y 47 URL de imágenes; las 47 fichas técnicas están vacías.
- Almacenamiento: 58 archivos en el bucket de imágenes; 11 no aparecen referenciados por productos.
- Discrepancia pendiente: `supabase/config.toml` contiene `kiizldurgjtorxpzebpm`, distinto de la instancia visible en la auditoría.

## Bloqueos antes de producción

1. Confirmar la instancia de Supabase que debe pertenecer a Nexora y alinear la configuración local, las variables de Vercel y el despliegue.
2. Confirmar el acceso correcto al equipo/proyecto de Vercel.
3. Planificar la migración de los identificadores internos heredados del backend y de las funciones remotas, conservando datos, permisos y compatibilidad.
4. Completar y validar las fichas técnicas con datos reales de cada referencia.
5. Revisar los archivos de imagen no referenciados antes de decidir si deben conservarse.

## Reglas

- No desplegar ni aplicar migraciones mientras el destino remoto no esté confirmado.
- No eliminar productos, imágenes, usuarios, seriales, pedidos, garantías ni registros históricos como parte de una limpieza de marca.
- Nunca incluir claves privilegiadas en el frontend o en archivos versionados.
- Los cambios deben pasar por rama, pruebas, pull request y revisión antes de integrarse.

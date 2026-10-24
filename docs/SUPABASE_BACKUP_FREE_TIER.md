# Copias manuales de Supabase en el plan Free

**Estado verificado el 24 de octubre de 2026:** la organización de Nexora está en el plan Free. Según la [documentación oficial de Supabase](https://supabase.com/docs/guides/platform/backups), los backups diarios descargables están disponibles en Pro, Team y Enterprise. Para proyectos Free, Supabase recomienda exportar los datos con la CLI y conservar copias fuera del proveedor.

## Crear una copia lógica

Requisitos:

- Supabase CLI instalada.
- Docker instalado y en ejecución.
- Una cadena de conexión de base de datos obtenida desde **Connect** en el panel de Supabase.
- Espacio local suficiente para esquema y datos.

Desde una terminal de confianza, solicita la cadena de conexión sin imprimirla en pantalla:

```bash
read -rsp "Supabase DB URL: " SUPABASE_DB_URL
echo
export SUPABASE_DB_URL
export SUPABASE_PROJECT_REF="ivholkjldntrmagcmogh"
bash scripts/backup-supabase.sh
unset SUPABASE_DB_URL
```

El script crea `backups/supabase/<fecha-UTC>/` con:

- `roles.sql`: roles personalizados que la CLI puede exportar.
- `schema.sql`: esquema compatible con el flujo de backup de Supabase.
- `data.sql`: datos de los esquemas incluidos por `supabase db dump`.
- `SHA256SUMS`: checksums para detectar corrupción.
- `MANIFEST.txt`: fecha, proyecto y alcance de la copia.

Los permisos de los archivos se restringen en el sistema local y `backups/` está excluido de Git. La conexión de base de datos es un secreto: no la subas al repositorio, no la pegues en chats ni la imprimas en logs.

## Límites importantes

El comando oficial `supabase db dump` excluye los esquemas administrados de Auth y Storage. Por eso esta copia **no es por sí sola una recuperación completa de la aplicación**:

1. Exporta por separado los archivos de los buckets Storage `warranty-documents` y `product-images`. El dump SQL contiene metadatos, no los objetos binarios.
2. Define y prueba un procedimiento separado para los usuarios/datos administrados por Auth y para los secretos de Edge Functions.
3. Cifra las copias antes de transferirlas a almacenamiento externo; conserva la clave de descifrado en un gestor de secretos independiente.
4. Prueba la restauración en un proyecto aislado. No restaures un dump de prueba sobre producción.

El script solo prepara el export local; **no se ha ejecutado ni se ha creado una copia de datos** desde esta sesión porque no se dispone de una cadena de conexión de base de datos proporcionada para ese propósito.

Referencias oficiales:

- [Backups de Supabase](https://supabase.com/docs/guides/platform/backups)
- [Referencia de `supabase db dump`](https://supabase.com/docs/reference/cli/supabase-db-dump)
- [Guía oficial de backup/restore con CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)

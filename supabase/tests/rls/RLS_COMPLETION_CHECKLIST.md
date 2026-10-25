# Nexora — checklist de auditoría RLS y permisos

Actualizado: 2026-10-24. Proyecto Supabase revisado en vivo: `ivholkjldntrmagcmogh`.

## Verificaciones de base de datos

- [x] RLS activado en las 51 tablas públicas revisadas.
- [x] Las 21 tablas operativas `bodega_*` tienen RLS y políticas explícitas.
- [x] Las 30 tablas heredadas sin políticas mantienen RLS activo (denegación por defecto); no se les añadieron políticas genéricas.
- [x] Bucket `warranty-documents` privado; lectura/escritura restringidas a personal activo mediante políticas de Storage.
- [x] Bucket `product-images` público para lectura de imágenes de catálogo; cargas y borrados requieren personal activo.
- [x] Funciones `SECURITY DEFINER` de autorización/almacenamiento verificadas con `search_path=public` y comprobación del usuario activo.
- [x] Restricciones de integridad revisadas para seriales únicos, estados de unidades, pedidos y garantías.
- [x] Migración de privilegios mínimos aplicada para quitar `TRUNCATE`, `REFERENCES`, `TRIGGER` y `MAINTAIN` de roles API, eliminar ejecución anónima de RPC y endurecer los defaults del propietario de objetos de la aplicación (`postgres`).
- [ ] Defaults del rol administrado `supabase_admin`: la conexión no es miembro de ese rol y no puede cambiar sus ACL predeterminadas. La auditoría confirmó que los 51 objetos públicos y las 18 funciones de la aplicación pertenecen a `postgres`; objetos internos del proveedor quedan fuera de esta migración.

## Pruebas automatizadas

- [x] Contrato de permisos por rol y protección de acciones de administración.
- [x] Reglas de pedidos/despachos, garantías/devoluciones, importaciones y seriales.
- [x] Contrato estático de la migración de privilegios mínimos.
- [x] Pruebas de rutas privadas: redirección sin sesión y protección por permiso.
- [x] Script SQL `rls_role_isolation_tests.sql` ejecutado en el proyecto Supabase conectado dentro de una transacción con `ROLLBACK`; terminó sin excepciones.
- [x] Aislamiento con sesiones reales de administrador y bodeguero: el usuario confirma que ya lo probó. Se registra como completado por confirmación del usuario; no se afirma que esta sesión haya reproducido la prueba.
- [ ] Automatizar el script SQL en un entorno de prueba dedicado desde CI; la ejecución de preflight en producción no sustituye la prueba con roles reales.

## Ajustes de configuración y decisiones de alcance

- [x] Protección contra contraseñas filtradas: el usuario decide descartarla del alcance actual. La función requiere Pro o superior; no se cambió el plan ni se incurrió en costos.
- [x] Guía y script de exportación local para el plan Free añadidos: `docs/SUPABASE_BACKUP_FREE_TIER.md` y `scripts/backup-supabase.sh`.
- [⏸] Ejecución del backup externo aplazada por decisión del usuario. El script no se ha ejecutado desde esta sesión y no se ha creado una copia. No ejecutar hasta nueva solicitud.
- [ ] Si se retoma el backup: exportar por separado los objetos de `warranty-documents` y `product-images`, definir cómo respaldar los datos gestionados por Auth, cifrar la copia y probar restauración en un proyecto aislado. `supabase db dump` no incluye los archivos de Storage ni los esquemas administrados de Auth/Storage.

## Criterio de cierre

El hardening SQL, las pruebas automatizadas y el despliegue están completados para el alcance acordado. El usuario confirma que probó el aislamiento de roles. La protección de contraseñas filtradas queda fuera de alcance y el backup externo se aplaza. No se declara un backup existente ni una restauración verificada. La automatización del SQL de RLS en CI y los límites de permisos del rol administrado siguen como mejoras técnicas.

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
- [x] Migración de privilegios mínimos preparada para quitar `TRUNCATE`, `REFERENCES`, `TRIGGER` y `MAINTAIN` de roles API; eliminar ejecución anónima de RPC y corregir privilegios predeterminados. La ejecución en producción se registra en `docs/NEXORA_AUDITORIA_FINAL.md`.

## Pruebas automatizadas

- [x] Contrato de permisos por rol y protección de acciones de administración.
- [x] Reglas de pedidos/despachos, garantías/devoluciones, importaciones y seriales.
- [x] Contrato estático de la migración de privilegios mínimos.
- [x] Pruebas de rutas privadas: redirección sin sesión y protección por permiso.
- [x] Script SQL de verificación RLS, permisos de tabla/función, historial inmutable y Storage disponible en `rls_role_isolation_tests.sql`.
- [ ] Ejecutar pruebas de aislamiento con dos sesiones reales distintas (administrador y bodeguero). No se simula ni se declara validado sin credenciales de prueba.
- [ ] Ejecutar el script SQL contra un entorno de prueba dedicado desde CI; la suite de frontend no sustituye la prueba con roles reales.

## Ajustes de configuración del proveedor

- [ ] Activar y probar la protección de Supabase Auth contra contraseñas filtradas; el asesor de seguridad la reporta deshabilitada y no existe una acción de configuración de Auth disponible en esta conexión.
- [ ] Confirmar retención y última ejecución de backups en el panel de Supabase. El estado del proyecto está activo, pero la configuración/recuperación de backups no se pudo verificar con las herramientas disponibles.

## Criterio de cierre

El código y los controles SQL quedan preparados para producción después de aplicar y verificar la migración de privilegios. La certificación integral de seguridad sigue condicionada a las dos pruebas con sesiones reales y a confirmar protección de contraseñas filtradas/backups en el panel del proveedor.

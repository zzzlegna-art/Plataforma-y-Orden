# Auditoría e historiales: endurecimiento de RLS

## Alcance
La migración `00000000000013_audit_history_rls.sql` protege las bitácoras de auditoría, movimientos y eventos de garantía. No modifica producción por sí sola.

## Dependencias verificadas
- `bodega_is_staff()` valida perfil activo mediante `auth.uid()`.
- `bodega_aplicar_cambios(jsonb)` ejecuta como invocador y sigue sujeto a RLS y GRANT.
- `src/lib/backend.ts` usa `soloAlta` para auditoría y movimientos; ahora los eventos de garantía usan `soloAlta: true` y rechazan actualizaciones o eliminaciones en `calcularPasos`.
- `src/lib/actions/warranties.ts` agrega eventos con `createdBy: actor.id`.
- El trigger `bodega_warranty_events_no_delete` bloquea también la eliminación en cascada de eventos históricos. Por diseño, borrar una garantía con eventos fallará; confirmar con producto que ese comportamiento es el deseado. **No aplicar a producción hasta validar estos flujos**.
- La FK conserva `ON DELETE CASCADE`, pero el trigger de protección impide borrar eventos, incluso por cascada. Usuarios privilegiados capaces de deshabilitar triggers siguen fuera de esta garantía.
- Un cliente autorizado todavía puede inventar contenido de un evento nuevo; la identidad del autor se valida, pero una auditoría irrefutable requiere registro del lado del servidor.

## Pruebas en staging (no producción)
1. Ejecutar migraciones y este SQL en una base aislada; verificar que el despliegue no arroje errores.
2. Como `authenticated` con perfil activo: insertar auditoría propia y evento de garantía propio; comprobar éxito.
3. Intentar insertar auditoría con `user_id` ajeno y evento con `created_by` ajeno; comprobar denegación.
4. Intentar `UPDATE` y `DELETE` de auditoría, movimientos y eventos de garantía; comprobar denegación.
5. Como usuario inactivo y `anon`: comprobar que no se pueden leer o insertar estos registros.
6. Probar creación, edición, cancelación y eliminación de garantías, y reconexión/reintento de guardado. Confirmar que el rechazo de eliminar garantías con historial es aceptable antes de habilitar esta migración.
7. Comprobar las políticas de lectura del administrador y el funcionamiento de `bodega_aplicar_cambios`.

Los tests Vitest del repositorio verifican el contrato estático del SQL; **no sustituyen** las pruebas de permisos con sesiones reales.

## Estado de validación
- Pruebas unitarias añadidas para altas, cambios y borrados de eventos en `calcularPasos`.
- Las pruebas SQL del repositorio son estáticas, no ejecutan RLS contra PostgreSQL.
- **Staging aislado validado:** proyecto Supabase `Bodega-6A-Pruebas` (`zcmmgmjzmmpsjwhdfrfb`), organización Techrez. El proyecto de producción (`kiizldurgjtorxpzebpm`) no se modificó.

### Evidencia de pruebas en PostgreSQL (8 de octubre de 2026)
- Se aplicaron las 13 migraciones del repositorio a la base de pruebas, incluida `00000000000013_audit_history_rls.sql`.
- Se verificó RLS habilitado y ausencia de privilegios UPDATE/DELETE para `authenticated` en `bodega_audit_logs`, `bodega_movements` y `bodega_warranty_events`.
- Con sesión `authenticated` sin perfil activo: INSERT en las tres tablas rechazado.
- Con sesión `authenticated`: UPDATE de auditoría, DELETE de movimientos y UPDATE de eventos rechazados por permisos.
- Se crearon dos identidades ficticias en transacciones reversibles: primer usuario `admin`, segundo `bodeguero`; se verificó `bodega_is_staff()` y `bodega_is_admin()` en ambos casos.
- Un administrador insertó una auditoría; un bodeguero insertó una garantía y su evento.
- Un bodeguero intentó suplantar `user_id` y `user_email` en auditoría; el trigger persistió la identidad y el correo de su sesión simulada.
- Se comprobó que eliminar una garantía con evento histórico dispara una excepción e impide la cascada.
- Las transacciones de datos ficticios se revirtieron con `ROLLBACK`; no se copiaron datos reales.
- GitHub Actions `Tests y Build` terminó correctamente en el commit `7ff2ebdc7963a94a0c691810890aebb48c9ae333`.
- Se verificó el RPC `bodega_aplicar_cambios` con altas de auditoría y garantía por separado, alta de evento con garantía preexistente y alta **conjunta** de garantía más evento en una sola llamada. Se verificó la existencia del evento y se hizo `ROLLBACK` en cada prueba.

**Límites:** estas pruebas usan sesiones JWT simuladas dentro de PostgreSQL; no son pruebas de extremo a extremo con inicio de sesión real, navegador, red ni reintentos. Tampoco se han completado los flujos de cancelación/eliminación de garantías en la interfaz. Mantener el PR en borrador y no desplegar a producción sin esa validación y autorización explícita.

## Lista de verificación previa al despliegue (pendiente de autorización)

**Estado:** PR #45 en borrador; sin fusionar y sin ejecutar esta migración en producción.

1. Confirmar en GitHub que `Tests y Build` sigue en verde para el commit exacto que se vaya a desplegar.
2. Revisar en producción las políticas, GRANT y triggers existentes en las tres tablas antes de aplicar SQL; registrar diferencias frente a staging, incluidas migraciones que no están en el repositorio.
3. Preparar un respaldo o punto de recuperación verificado de la base productiva mediante los mecanismos disponibles en el plan contratado. No asumir que el plan Free dispone de recuperación a un instante.
4. Planificar ventana de mantenimiento y confirmar explícitamente la autorización de despliegue. El cambio impide eliminar garantías que ya tienen eventos históricos; comunicar esta restricción.
5. Aplicar **solo** la migración `00000000000013_audit_history_rls.sql` mediante el mecanismo de migraciones aprobado, tras comprobar dependencias y estado real de producción. No reaplicar ciegamente las migraciones de staging.
6. Verificar RLS, GRANT y triggers, luego probar creación de garantía con evento, lectura por administrador/bodeguero, atribución de auditoría y bloqueo de mutaciones no autorizadas.
7. Supervisar errores de guardado y los flujos de garantías después del despliegue. Si hay errores, detener nuevas operaciones afectadas y ejecutar el plan de recuperación aprobado.

### Recuperación: consideraciones importantes

- El despliegue **no debe** usar como reversión automática `DROP TRIGGER` o abrir permisos UPDATE/DELETE: eso reintroduciría el riesgo de alterar historiales.
- Antes de una reversión, evaluar si hay nuevos eventos creados bajo la nueva política y si el código cliente ya depende de `soloAlta`.
- Restaurar desde un respaldo probado o aplicar una migración compensatoria **revisada**, con autorización expresa. Una reversión del código no revierte por sí sola políticas y triggers de PostgreSQL.
- No copiar credenciales, JWT, usuarios ni datos de clientes de producción al entorno de pruebas.

### Comprobación final del PR

En el commit `3561b6e71ce73b1aa004d4aab4a0ec3af72f56df`, GitHub reportó `Tests y Build` y `Vercel Preview Comments` con resultado satisfactorio, y el PR no tenía conflictos de fusión. Las verificaciones deben repetirse si cambia el commit.

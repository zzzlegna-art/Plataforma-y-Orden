# Nexora — Auditoría final (Punto 5)

**Fecha:** 24 de octubre de 2026  
**Proyecto Supabase:** `ivholkjldntrmagcmogh`  
**Resultado:** hardening SQL aplicado y comprobado; pruebas de aplicación aprobadas. La certificación integral mantiene tareas de proveedor y aislamiento real pendientes, detalladas al final.

## 1. Resumen ejecutivo

- Supabase aparece como `ACTIVE_HEALTHY`, PostgreSQL 17.11. La organización está en plan `free`; esto limita los controles de contraseña filtrada y los backups administrados.
- Las 51 tablas públicas tienen RLS habilitado (51/51; 0 deshabilitadas).
- Las 21 tablas operativas `bodega_*` cuentan con políticas RLS explícitas (37 políticas).
- Las 30 tablas heredadas que no tienen políticas conservan RLS activo: PostgreSQL deniega el acceso por defecto. No se añadieron políticas genéricas ni se borraron tablas históricas.
- Se aplicó la migración `20261024231520_nexora_least_privilege_defaults.sql` (`nexora_least_privilege_defaults`) en el proyecto conectado.
- El script `supabase/tests/rls/rls_role_isolation_tests.sql` se ejecutó en el proyecto real dentro de una transacción con `ROLLBACK`; finalizó sin excepciones y no alteró datos de negocio.

## 2. Endurecimiento de permisos aplicado

Antes del cambio, el rol `authenticated` tenía permisos `TRUNCATE`, `REFERENCES` y `TRIGGER` sobre las 51 tablas públicas. RLS protege filas, pero no sustituye esos privilegios SQL.

Después de la migración:

- `anon` no conserva privilegios directos sobre tablas públicas ni ejecución de funciones del esquema `public`.
- `authenticated` ya no tiene `TRUNCATE`, `REFERENCES`, `TRIGGER` ni `MAINTAIN` sobre tablas públicas.
- Se revocó `UPDATE` de secuencias a `authenticated` y los permisos de secuencia de `anon`.
- Se endurecieron los privilegios predeterminados del propietario de los objetos de aplicación (`postgres`): nuevas tablas, secuencias y funciones no vuelven a conceder automáticamente esos accesos anónimos o privilegios innecesarios.
- Se conservaron los permisos CRUD que la aplicación usa: `SELECT` e `INSERT` en 51 tablas y `UPDATE`/`DELETE` en las 48 tablas que permiten esas operaciones.
- Se conservó la ejecución autenticada de las RPC existentes; la función de trigger `bodega_handle_new_user()` sigue sin poder ejecutarse directamente por un cliente autenticado.

**Límite de la conexión:** el usuario de migración no pertenece al rol administrado `supabase_admin`, así que no puede modificar sus privilegios predeterminados. La auditoría confirmó que las 51 relaciones públicas y las 18 funciones de aplicación actuales pertenecen a `postgres`, por lo que el hardening de defaults cubre los objetos de la aplicación. Los objetos internos creados por el proveedor quedan fuera de esta migración.

## 3. Autenticación, roles y rutas

- Las rutas privadas pasan por `RequireAuth`; las secciones sensibles usan `RequirePermission`.
- Se añadieron cuatro pruebas de componente: redirección al login sin sesión, acceso privado con sesión, denegación cuando falta el permiso y acceso cuando el permiso está concedido.
- La lógica de dominio ya incluye pruebas de permisos por rol, protección del último administrador, pedidos/despachos, seriales duplicados, garantías, devoluciones e importaciones.
- Las Edge Functions de gestión de usuarios tienen `verify_jwt=true` y además validan el token contra Auth y comprueban que el perfil sea administrador activo.
- `catalog-image-proxy` permite acceso público de forma intencional, pero restringe las solicitudes a imágenes públicas del bucket del mismo proyecto, limita método/tamaño y no sigue redirecciones.

## 4. Historial, documentos y Storage

- `bodega_audit_logs`, `bodega_warranty_events` y `bodega_movements` conservan comportamiento append-only: no hay permisos de actualización/borrado ni políticas de mutación para el cliente.
- La función `bodega_uso_almacenamiento()` fija `search_path=public` y comprueba que la sesión corresponda a personal activo.
- `warranty-documents` permanece privado, con políticas que requieren personal activo.
- `product-images` es público para servir imágenes del catálogo; las cargas y borrados requieren personal activo.

## 5. Validación de código

| Comprobación | Resultado |
|---|---|
| Suite Vitest | **547 pruebas aprobadas** en 79 archivos |
| TypeScript + ESLint (`pnpm check`) | Sin errores; 2 advertencias preexistentes |
| Verificador de despliegue (`pnpm check:deploy`) | Aprobado |
| Compilación (`pnpm build`) | Aprobada |
| SQL de auditoría RLS/permisos | Aprobado; `ROLLBACK` al finalizar |
| Auditoría de dependencias de producción (`pnpm audit --prod`) | **0 vulnerabilidades** |

Las dos advertencias preexistentes son: exportaciones de componentes en `src/components/shared/product-thumbnail.tsx` y una dependencia de `useEffect` en `src/store/app-provider.tsx`. La compilación mantiene una advertencia de Vite por un chunk JavaScript principal de aproximadamente 3.56 MB (1.10 MB gzip); no bloquea el despliegue, pero queda como mejora de rendimiento.

## 6. Auditoría de dependencias de producción

El primer análisis de `pnpm audit --prod` encontró 53 avisos (2 críticos, 20 altos, 25 moderados y 6 bajos). Se actualizaron los paquetes vulnerables y se regeneró `pnpm-lock.yaml`:

- `jspdf` 2.5.2 → 4.2.1.
- `jspdf-autotable` 3.8.4 → 5.0.9.
- `react-router-dom` 7.8.2 → 7.18.4.
- `i18next-http-backend` 3.0.2 → 4.0.5.
- `zod` 4.1.5 → 4.6.7.
- `postcss` 8.5.6 → 8.5.31.
- Overrides transitorios: `dompurify` 3.4.17 y `postcss-selector-parser` 7.1.7.

**Resultado final: 0 vulnerabilidades** (críticas, altas, moderadas y bajas) en el árbol de dependencias de producción. La misma comprobación se añadió a los dos workflows de GitHub Actions para que una futura vulnerabilidad haga fallar la validación antes de desplegar.

## 7. Continuidad y límites del plan Free

- El plan de la organización se verificó como `free`. La protección de contraseñas filtradas de Supabase Auth está disponible en Pro y superiores; por eso el aviso actual no se puede resolver con un ajuste de base de datos. Requiere autorización del propietario para cambiar a un plan de pago y luego activar la protección en [Auth settings](https://supabase.com/dashboard/project/ivholkjldntrmagcmogh/auth/providers?provider=Email).
- En Free no están disponibles los backups diarios descargables de los planes Pro/Team/Enterprise. Se añadió `scripts/backup-supabase.sh` y la guía `docs/SUPABASE_BACKUP_FREE_TIER.md` para exportar roles, esquema y datos con la CLI.
- **La copia no se ha ejecutado desde esta sesión:** hace falta que una persona autorizada ejecute el script desde una estación segura con Docker y la cadena de conexión de la base de datos.
- `supabase db dump` excluye los esquemas administrados de Auth/Storage y no incluye archivos de Storage. Para una recuperación completa se deben exportar los objetos de los buckets por separado, definir la exportación de datos gestionados por Auth y probar una restauración aislada. Cifrar antes de transferir a almacenamiento externo.

## 8. Hallazgos del asesor de Supabase

- **30 avisos informativos `rls_enabled_no_policy`:** corresponden a tablas heredadas con RLS activo y sin políticas; se dejan cerradas por defecto.
- **3 avisos `authenticated_security_definer_function_executable`:** `bodega_is_admin()`, `bodega_is_staff()` y `bodega_uso_almacenamiento()` necesitan ejecución autenticada para las políticas y el módulo de almacenamiento. Sus definiciones fijan `search_path` y verifican el perfil activo. No se revocaron a ciegas porque rompería autorización/funcionalidad.
- **Protección contra contraseñas filtradas deshabilitada:** requiere Pro o superior; el plan Free actual no permite activarla. No se cambió el plan ni se incurrió en costos.
- Rendimiento: 26 claves foráneas sin índice de cobertura, 32 índices no usados, 5 conjuntos de políticas permisivas duplicadas y 1 par de índices duplicados. No se eliminaron índices ni se cambiaron políticas automáticamente sin revisar planes de consulta y dependencias.

## 9. Pendientes para certificar el cierre al 100 %

1. Autorizar un cambio de plan a Pro o superior si se desea activar la protección de contraseñas filtradas; después habilitarla en Auth settings y hacer una prueba controlada.
2. Ejecutar `scripts/backup-supabase.sh` desde una estación segura y almacenar la copia cifrada fuera del equipo. Exportar los objetos de Storage y definir la exportación de Auth por separado; probar restauración en un proyecto aislado.
3. Probar aislamiento con dos sesiones reales distintas (administrador y bodeguero), sin reutilizar credenciales personales. El SQL de preflight pasó, pero no se declara una prueba de usuario A/B sin sesiones de prueba.
4. Automatizar el SQL de RLS y las pruebas de roles en un entorno de prueba dedicado dentro del CI.
5. Mantener presente el límite de permisos del rol administrado `supabase_admin`; los defaults de los objetos de aplicación `postgres` sí quedaron endurecidos.

## Veredicto

**El hardening SQL, la suite automatizada y el despliegue están ejecutados.** No se afirma una certificación de seguridad absoluta mientras sigan pendientes la autorización del plan de Auth, la ejecución de un backup externo con prueba de restauración y las pruebas de aislamiento con sesiones reales.

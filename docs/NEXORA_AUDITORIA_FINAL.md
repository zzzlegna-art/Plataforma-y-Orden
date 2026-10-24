# Nexora — Auditoría final (Punto 5)

**Fecha:** 24 de octubre de 2026  
**Proyecto Supabase:** `ivholkjldntrmagcmogh`  
**Resultado:** hardening SQL aplicado y comprobado; pruebas de aplicación aprobadas. La certificación integral mantiene tareas de proveedor y aislamiento real pendientes, detalladas al final.

## 1. Resumen ejecutivo

- Supabase aparece como `ACTIVE_HEALTHY`, PostgreSQL 17.11.
- Las 51 tablas públicas tienen RLS habilitado (51/51; 0 deshabilitadas).
- Las 21 tablas operativas `bodega_*` cuentan con políticas RLS explícitas (37 políticas).
- Las 30 tablas heredadas que no tienen políticas conservan RLS activo: PostgreSQL deniega el acceso por defecto. No se añadieron políticas genéricas ni se borraron tablas históricas.
- Se aplicó la migración `20261024231500_nexora_least_privilege_defaults.sql` (`nexora_least_privilege_defaults`) en el proyecto conectado.
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

Las dos advertencias preexistentes son: exportaciones de componentes en `src/components/shared/product-thumbnail.tsx` y una dependencia de `useEffect` en `src/store/app-provider.tsx`. La compilación mantiene una advertencia de Vite por un chunk JavaScript principal de aproximadamente 3.56 MB (1.10 MB gzip); no bloquea el despliegue, pero queda como mejora de rendimiento.

## 6. Hallazgos del asesor de Supabase

- **30 avisos informativos `rls_enabled_no_policy`:** corresponden a tablas heredadas con RLS activo y sin políticas; se dejan cerradas por defecto.
- **3 avisos `authenticated_security_definer_function_executable`:** `bodega_is_admin()`, `bodega_is_staff()` y `bodega_uso_almacenamiento()` necesitan ejecución autenticada para las políticas y el módulo de almacenamiento. Sus definiciones fijan `search_path` y verifican el perfil activo. No se revocaron a ciegas porque rompería autorización/funcionalidad.
- **Protección contra contraseñas filtradas deshabilitada:** permanece pendiente en la configuración de Supabase Auth. Esta conexión no expone una acción para cambiar ese ajuste.
- Rendimiento: 26 claves foráneas sin índice de cobertura, 32 índices no usados, 5 conjuntos de políticas permisivas duplicadas y 1 par de índices duplicados. No se eliminaron índices ni se cambiaron políticas automáticamente sin revisar planes de consulta y dependencias.

## 7. Pendientes para certificar el cierre al 100 %

1. Activar la protección de contraseñas filtradas en Supabase Auth y verificarla con una prueba controlada.
2. Confirmar en el panel de Supabase la retención, última ejecución y posibilidad de restauración de backups. La conexión usada aquí no permite verificar esa configuración.
3. Probar aislamiento con dos sesiones reales distintas (administrador y bodeguero), sin reutilizar credenciales personales. El SQL de preflight pasó, pero no se declara una prueba de usuario A/B sin sesiones de prueba.
4. Ejecutar esas pruebas de roles y el SQL de RLS en un entorno de prueba dedicado dentro del CI.
5. Mantener presente el límite de permisos del rol administrado `supabase_admin`; los defaults de los objetos de aplicación `postgres` sí quedaron endurecidos.

## Veredicto

**El punto técnico de auditoría, el hardening SQL de la aplicación y la suite automatizada están ejecutados.** No se afirma una certificación de seguridad absoluta mientras sigan pendientes los ajustes de Auth, la verificación de backups y las pruebas de aislamiento con sesiones reales.

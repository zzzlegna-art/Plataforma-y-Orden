# Auditoría de Seguridad — Bodega 6A

> Para el estado vigente al 24 de octubre de 2026, consulta también `docs/NEXORA_AUDITORIA_FINAL.md`. Las recomendaciones antiguas se conservan como historial.

## Alcance

Revisión de controles de seguridad de la aplicación:

- autenticación de rutas
- control de permisos
- variables de entorno
- configuración de repositorio
- superficie de exposición del frontend
- Supabase/RLS

## Hallazgos y acciones

### 1. Autenticación de rutas

Estado: OK

Las rutas privadas pasan por `RequireAuth` antes de renderizar contenido protegido.

Recomendación futura:
- agregar pruebas automatizadas de navegación sin sesión.

### 2. Control de permisos

Estado: OK con seguimiento

Existe protección por permisos mediante `RequirePermission`.

Recomendación:
- mantener permisos definidos en un único catálogo.
- validar siempre permisos críticos en backend/RLS, no únicamente en frontend.

### 3. Variables de entorno

Estado: OK

El proyecto utiliza `.env.example` y excluye `.env` mediante `.gitignore`.

Reglas:
- nunca almacenar claves privadas en el repositorio.
- rotar claves si existe sospecha de exposición.

### 4. Supabase

Estado: revisado

Mantener:
- RLS activo en tablas sensibles.
- pruebas de aislamiento de roles.
- funciones con validaciones server-side.

### 5. Próximas mejoras recomendadas

- añadir Content Security Policy (CSP) en despliegue.
- añadir auditoría de acciones administrativas.
- ejecutar análisis de dependencias antes de cada release.
- pruebas de permisos como parte obligatoria del CI.

## Auditoría en vivo — 2026-10-23

Esta sección registra observaciones verificadas en el proyecto Supabase conectado. Los avisos del linter no se interpretan automáticamente como vulnerabilidades: se contrastan con permisos, código y uso real de las tablas.

### 6. Row Level Security y tablas heredadas

**Estado: RLS habilitado en todas las tablas públicas revisadas.**

- Las tablas activas de Nexora con prefijo `bodega_` tienen políticas RLS configuradas.
- Se observaron 30 tablas heredadas con RLS habilitado y sin políticas. En PostgreSQL, esto deniega el acceso por RLS por defecto; el aviso no significa por sí solo que los datos sean públicos.
- No se añadieron políticas genéricas a esas tablas: hacerlo podría exponer datos antiguos sin confirmar su modelo de autorización.
- Siguiente acción: confirmar referencias de aplicación, permisos SQL y dependencias antes de eliminar las tablas heredadas o definir políticas específicas.

### 7. Funciones `SECURITY DEFINER`

Se revisaron `bodega_is_admin()`, `bodega_is_staff()` y `bodega_uso_almacenamiento()`.

- Las tres fijan `search_path` a `public`.
- Los permisos comprobados no conceden ejecución a `anon`; `authenticated` sí puede ejecutarlas.
- Las funciones de rol consultan el perfil activo asociado a `auth.uid()`; la función de almacenamiento comprueba que el usuario sea personal activo antes de devolver métricas.
- El aviso del asesor de Supabase requiere seguimiento, pero revocar `EXECUTE` sin reemplazar las llamadas de políticas y aplicación podría romper la autorización. No se cambiaron permisos.

### 8. Protección de contraseñas filtradas

**Pendiente de configuración en Supabase Auth.** El asesor informa que la protección contra contraseñas comprometidas está deshabilitada. Debe habilitarse en la configuración de Auth del proyecto y después verificarse con una prueba controlada. No se pudo cambiar esta opción mediante las herramientas de base de datos utilizadas en esta revisión.

### 9. Índices y rendimiento

El asesor reporta advertencias de índices en varias tablas. Al contrastar las claves foráneas de las tablas activas `bodega_`, se identificaron tres relaciones sin índice de cobertura:

- `bodega_products(categoria)`: aproximadamente 47 filas.
- `bodega_warranties(replacement_unit_id)`: aproximadamente 9 filas.
- `bodega_documents(uploaded_by)`: sin filas estimadas.

La cantidad actual de datos es pequeña; por eso estos índices no se aplicaron automáticamente. Revaluar al crecer las tablas o si los planes de consulta muestran impacto. También hay avisos en tablas heredadas que deben evaluarse antes de modificarlas.

### 10. Autenticación y sesiones

En los registros de Auth de las últimas 24 horas se observó:
- un error HTTP 500 aislado al renovar un token, con mensaje `context canceled`;
- varios HTTP 400 `refresh_token_not_found`, compatibles con el uso de tokens de renovación caducados, revocados o ya consumidos.

Estos registros no demuestran por sí solos que sean la causa del error del navegador relacionado con `Navigator LockManager`. Ese error ocurre en el cliente y requiere reproducirlo con la consola del navegador, el número de pestañas abiertas y la secuencia de acciones. No se deshabilitó el bloqueo de sesiones de Supabase, ya que podría permitir carreras al rotar refresh tokens.

### 11. Próximas acciones priorizadas

1. Reproducir y registrar el error de `Navigator LockManager` sin exponer tokens ni datos personales.
2. Habilitar la protección contra contraseñas filtradas en Supabase Auth y verificar el resultado.
3. Añadir pruebas automatizadas de acceso sin sesión y de separación entre roles.
4. Revaluar índices de claves foráneas a medida que crezca el volumen real.
5. Revisar tablas heredadas con su historial de migraciones antes de eliminarlas o concederles acceso.


## Auditoría de cierre — 2026-10-24

El informe vigente está en `docs/NEXORA_AUDITORIA_FINAL.md`. Resumen de esta ejecución:

- 51/51 tablas públicas con RLS; las 21 tablas operativas tienen políticas explícitas.
- Se aplicó `nexora_least_privilege_defaults`: sin privilegios de tabla innecesarios para roles API, sin RPC público anónimo y con defaults del propietario `postgres` endurecidos.
- El script SQL de RLS/permisos pasó en una transacción con `ROLLBACK`.
- Se añadieron pruebas para `RequireAuth` y `RequirePermission`; suite total: 547 aprobadas.
- `pnpm check` y `pnpm check:deploy` pasan; la compilación también. Permanecen dos advertencias ESLint preexistentes y una advertencia de tamaño de chunk de Vite.
- Siguen pendientes la protección contra contraseñas filtradas, confirmar backups y probar aislamiento con sesiones reales. La conexión no permite modificar defaults de `supabase_admin`; los objetos de la aplicación están bajo `postgres`.

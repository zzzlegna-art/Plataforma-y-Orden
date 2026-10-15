# Auditoría de Seguridad — Bodega 6A

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

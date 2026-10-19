# Nexora v5.0 — Fase 6: auditoría de despliegue

## Hallazgos confirmados

- Supabase: la instancia accesible `ivholkjldntrmagcmogh` está activa.
- Seguridad de tablas: las 51 tablas públicas observadas tienen RLS activado.
- Catálogo: hay 47 productos con URL de imagen; las 47 fichas técnicas están vacías.
- Almacenamiento: hay 58 archivos de imagen; 11 no están referenciados por los productos actuales.
- Configuración: `supabase/config.toml` apunta a `kiizldurgjtorxpzebpm`, que no coincide con la instancia visible en la auditoría.
- Vercel: GitHub registra un despliegue completado para el commit `98732fedf06370f84282d72462920de56d5eb4c3`. Sin embargo, la conexión de auditoría devuelve `403 Forbidden` al consultar el proyecto y sus registros; las variables de entorno y el comportamiento del sitio no se han podido verificar directamente.

## Preparación incluida

- Verificador de estructura y fallback SPA: `pnpm check:deploy`.
- Workflow de GitHub Actions para ESLint, TypeScript, pruebas y build.
- Configuración Vite y fallback de rutas preservados.

## Pendiente antes de producción

1. Confirmar la instancia Supabase de destino y alinear configuración local y variables de producción.
2. Recuperar acceso autorizado de lectura al proyecto Vercel.
3. Planificar la migración de identificadores internos y funciones remotas, preservando datos y permisos.
4. Ejecutar build y pruebas automatizadas, y validar los flujos críticos en navegador.
5. Completar fichas técnicas con especificaciones verificadas de cada producto.

No aplicar cambios de esquema ni publicar una nueva versión hasta resolver los bloqueos anteriores.

# Nexora v5.0 — Fase 6: preparación de despliegue

## Estado verificado
- Proyecto Supabase `ivholkjldntrmagcmogh`: activo (consulta de solo lectura).
- Tablas de operaciones existentes. **Advertencia crítica:** 22 tablas públicas tienen RLS desactivado, incluyendo productos, seriales, pedidos, clientes y garantías. NO publicar datos reales hasta diseñar y verificar políticas RLS por rol.
- GitHub conectado: repositorios existentes consultados; **ninguno modificado**.
- Vercel: la conexión consultada no devolvió equipos; no fue posible crear proyecto ni URL.
- El entorno de ejecución no completó la instalación de dependencias: compilación, tests y navegación **no validados**.

## Preparación incluida
- Verificador `npm run check:deploy` para estructura y fallback SPA.
- Workflow GitHub Actions para instalar, compilar y ejecutar pruebas al subir el repositorio.
- Configuración `vercel.json` existente preservada para rutas de React Router.

## Para desplegar de forma segura
1. Revisar esquema, permisos y políticas RLS de Supabase, sin habilitar RLS masivamente sin políticas.
2. Compilar y ejecutar pruebas: `corepack pnpm install --frozen-lockfile`, `corepack pnpm build`, `corepack pnpm test`.
3. Crear **nuevo** repositorio de GitHub para Nexora y subir este proyecto (sin incluir `.env`).
4. Conectar Vercel con una cuenta/equipo autorizado y crear **nuevo** proyecto, framework Vite, build `pnpm build`, output `dist`.
5. Configurar en Vercel `VITE_SUPABASE_URL=https://ivholkjldntrmagcmogh.supabase.co` y `VITE_SUPABASE_ANON_KEY` con una clave **publicable** (nunca service_role).
6. Verificar autenticación, roles, CRUD, seriales duplicados, navegación y responsive antes de compartir la URL.

**Este paquete no está desplegado ni certificado para producción.**

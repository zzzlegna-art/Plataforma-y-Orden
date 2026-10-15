# Bodega 6A — Plataforma de inventario

App de inventario por seriales/IMEIs: recepción, unidades, pedidos mayoristas,
garantías y administración. React + Vite + TypeScript + shadcn/ui, con
Supabase (Postgres + Auth + RLS + Realtime) como backend.

Este proyecto se desconectó de Enter.pro: ya no usa su Supabase gestionado
(`EnterCloud`) ni sus paquetes privados (`@enter-pro/analytics-sdk`,
`vite-plugin-enter-dev`). Corre sobre **tu propio proyecto de Supabase**.

---

## 1. Crear tu proyecto de Supabase

1. Crea un proyecto en https://supabase.com/dashboard (o usa uno propio
   autoalojado si ya tienes Supabase corriendo en tu infraestructura).
2. En **Project Settings → API** copia:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY`

## 2. Aplicar el esquema de base de datos

El archivo `supabase/migrations/00000000000001_schema.sql` contiene **todo**
el esquema: tablas, políticas RLS, funciones de permisos, el trigger que
convierte en `admin` al primer usuario que se registre, y la publicación de
Realtime.

Opción A — Panel de Supabase (más simple):
1. Ve a **SQL Editor** en tu proyecto.
2. Pega el contenido completo de `supabase/migrations/00000000000001_schema.sql`
   y ejecútalo.

Opción B — Supabase CLI:
```bash
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase db push
```

## 3. Desplegar la función de administración de usuarios

El alta de usuarios y el restablecimiento de contraseñas los hace un
administrador desde la app; para eso hace falta la Edge Function
`bodega-gestion-usuarios`, que usa la `service_role key` (Supabase la inyecta
automáticamente a las Edge Functions, no hay que configurar ningún secreto
a mano):

```bash
supabase functions deploy bodega-gestion-usuarios --project-ref TU_PROJECT_REF
```

## 4. Configurar el frontend

```bash
cp .env.example .env
# Edita .env con tu VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
```

## 5. Instalar y correr en local

```bash
pnpm install   # o npm install / yarn install
pnpm dev
```

## 6. Primer usuario (administrador)

No hay registro libre: las cuentas se crean desde **Administración → Usuarios**
dentro de la app, pero para el primer usuario todavía no hay nadie con
permiso de admin. Créalo desde el panel de Supabase:

1. **Authentication → Users → Add user** (con email y contraseña,
   marca "Auto Confirm User").
2. El trigger `bodega_on_auth_user_created` crea automáticamente su perfil en
   `bodega_profiles`. Como todavía no existe ningún admin activo, **este
   primer usuario queda como `admin`** automáticamente.
3. Inicia sesión con ese usuario en `/login`. Desde ahí ya puedes crear al
   resto del equipo (rol `admin` o `bodeguero`) desde Administración →
   Usuarios.

## 7. Compilar para producción

```bash
pnpm build
```

Esto genera `dist/`, un sitio estático (SPA). Para hospedarlo:

- **Vercel / Netlify**: importa el repo, configura las variables de entorno
  `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, build command `pnpm build`,
  output `dist`. Como es un SPA con `react-router-dom`, configura el
  *rewrite* de todas las rutas hacia `/index.html` (Vercel/Netlify lo hacen
  solas al detectar Vite; si usas tu propio servidor —nginx, etc.— agrega
  un `try_files $uri /index.html;`).
- **Servidor propio**: sirve el contenido de `dist/` como estático detrás de
  cualquier servidor web, con el mismo *fallback* a `index.html`.

La app es instalable como PWA (`manifest.webmanifest` + `sw.js`), así que
una vez publicada con HTTPS se puede "agregar a pantalla de inicio" en
Android/iOS.

---

## Notas técnicas

- **Moneda / nombre de empresa**: se configuran desde Administración →
  Datos, o cambiando la fila `default` de la tabla `bodega_settings`
  (por defecto `MXN` / "Mi Empresa").
- **Roles**: solo `admin` y `bodeguero`. Ver `src/lib/permissions.ts` y las
  políticas RLS en la migración para la matriz completa.
- **Arquitectura de datos**: `src/lib/types.ts` (modelo) → `src/lib/actions/*`
  (funciones puras que validan reglas de negocio) → `src/store/app-provider.tsx`
  (sincroniza con Supabase) → páginas en `src/pages/`. Ver `CodeGuideline.md`
  para las convenciones del proyecto.
- **Analítica**: se quitó el SDK de Enter.pro. Si quieres analítica propia
  (Plausible, PostHog, etc.), agrégala en `src/main.tsx`.

## Tech stack

- Vite, TypeScript, React 19
- shadcn-ui, Tailwind CSS
- Supabase (Postgres, Auth, RLS, Realtime, Edge Functions)

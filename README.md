# Nexora — Smart Operations

Nexora es una plataforma de operaciones para administrar inventario por seriales/IMEIs, recepción de mercancía, unidades, pedidos mayoristas, clientes, garantías y administración.

## Stack

- React + TypeScript + Vite
- Supabase: PostgreSQL, Auth, Row Level Security (RLS) y Realtime
- Tailwind CSS y shadcn/ui
- Vitest, Testing Library, ESLint y TypeScript
- GitHub Actions y Vercel

## Desarrollo local

Requisitos: Node.js 22 y pnpm 8.

1. Instala dependencias:
   ```bash
   pnpm install --frozen-lockfile
   ```
2. Crea un archivo `.env` en la raíz con las variables públicas de tu instancia de Supabase:
   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
   ```
3. Inicia el servidor:
   ```bash
   pnpm dev
   ```

Nunca coloques una clave `service_role`, contraseñas ni credenciales privadas en variables `VITE_*` o en el código del frontend.

## Validaciones

Antes de proponer una integración, ejecuta:

```bash
pnpm check
pnpm test
pnpm build
pnpm check:deploy
```

El workflow de GitHub Actions ejecuta validaciones de TypeScript/ESLint, pruebas y build al subir cambios a `main` o abrir un pull request.

## Despliegue

- Framework: Vite
- Comando de build: `pnpm build`
- Directorio de salida: `dist`
- Rutas SPA: el archivo `vercel.json` redirige las rutas a `index.html`

## Estado de aislamiento

La marca de interfaz y la aplicación instalable usan Nexora. La configuración remota aún requiere validación: el identificador de proyecto presente en `supabase/config.toml` no coincide con la única instancia de Supabase visible para la conexión actual. No desplegar ni aplicar migraciones hasta confirmar el proyecto de destino y completar la migración de los identificadores internos del backend de forma reversible.

Las operaciones sobre inventario, seriales, pedidos, garantías, usuarios y auditoría deben conservar sus políticas de seguridad, integridad histórica y guardado atómico. No se deben hacer cambios destructivos en producción desde una rama de desarrollo.

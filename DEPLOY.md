# Despliegue de Nexora

## Antes de publicar

1. Confirma que las variables de entorno de producción apuntan a la instancia de Supabase correcta.
2. Revisa las políticas RLS y los permisos por rol.
3. Confirma que la Edge Function de administración de usuarios y las funciones RPC requeridas existen en el proyecto de destino.
4. Ejecuta las validaciones locales y revisa los checks de GitHub Actions.
5. Prueba login, inventario, seriales, recepción, pedidos, garantías y administración en un entorno de pruebas.

**Bloqueo actual:** el proyecto remoto indicado en `supabase/config.toml` no coincide con la instancia de Supabase visible en la conexión de auditoría. No publiques ni apliques migraciones hasta confirmar y corregir el destino.

## Validaciones

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm check:deploy
```

## Vercel

- Framework: Vite
- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm build`
- Output directory: `dist`
- El fallback SPA está definido en `vercel.json`.

Configura en el proyecto las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Son valores públicos de cliente; nunca agregues la clave `service_role` al frontend.

## Supabase

La configuración local y la instancia remota deben apuntar al mismo proyecto. Despliega las Edge Functions necesarias y aplica las migraciones únicamente después de validar el proyecto de destino, los permisos y el plan de reversión.

No se debe habilitar registro público ni cambiar políticas RLS de forma masiva sin revisar el flujo de autenticación y los permisos de administrador.

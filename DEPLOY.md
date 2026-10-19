# Despliegue de Nexora

## Antes de publicar

1. Confirma el proyecto Supabase que debe usar Nexora.
2. Alinea `supabase/config.toml`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y las variables de Vercel.
3. Comprueba que el RPC `nexora_guardar_con_version(jsonb)` y las funciones Edge requeridas existen en el destino.
4. Ejecuta las validaciones y revisa los checks de GitHub Actions.
5. Prueba login, inventario, seriales, recepción, pedidos, garantías y administración en un entorno de pruebas.

**Bloqueo actual:** la referencia de proyecto en `supabase/config.toml` no coincide con la instancia Supabase visible en la auditoría. No publiques ni apliques migraciones hasta confirmar el destino.

## Validaciones

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm check:deploy
```

## Vercel

- Framework: Vite.
- Build: `pnpm build`.
- Salida: `dist`.
- Las rutas SPA se resuelven mediante `vercel.json`.
- Existe un dominio verificado sin la marca anterior: `nexora-beige-gamma.vercel.app`; el proyecto figuraba como no-live en la última lectura.
- La migración visual no debe confundirse con la separación de infraestructura. Los aliases heredados de Vercel aún necesitan limpieza desde un ámbito con permisos de escritura.

Configura en el proyecto las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Nunca agregues la clave `service_role` al frontend.

## Supabase

La migración `20261019060000_rename_legacy_identifiers_to_nexora.sql` está preparada para renombrar los identificadores internos de forma transaccional. No se ha ejecutado en producción. Primero debe validarse en una copia del proyecto correcto, junto con RLS, funciones, triggers y plan de reversión.

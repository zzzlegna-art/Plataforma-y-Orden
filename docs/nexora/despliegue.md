# Despliegue de Nexora

## Flujo de publicación

1. Crear una rama de trabajo.
2. Revisar el alcance y las dependencias.
3. Ejecutar validaciones automáticas.
4. Abrir un pull request.
5. Revisar cambios, riesgos y plan de reversión.
6. Integrar después de la aprobación.
7. Desplegar y validar los flujos principales.

## Validaciones requeridas

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
- Dominio verificado sin marca heredada observado: `nexora-beige-gamma.vercel.app`. La última lectura indicó que el proyecto aún no estaba live.

## Supabase

La configuración local, las variables del despliegue y el destino de las funciones remotas deben apuntar al mismo proyecto.

La migración `20261019060000_rename_legacy_identifiers_to_nexora.sql` está preparada, pero no se ha aplicado a ningún backend remoto.

## Bloqueo actual

La referencia de `supabase/config.toml` no coincide con la instancia visible en la auditoría. No desplegar ni aplicar migraciones hasta confirmar el destino, ejecutar pruebas en una copia y verificar RLS, funciones, triggers y permisos.

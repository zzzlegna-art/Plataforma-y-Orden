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

## Supabase

La configuración local, las variables del despliegue y el destino de las funciones remotas deben apuntar al mismo proyecto.

## Bloqueo actual

La referencia de `supabase/config.toml` no coincide con la instancia visible en la auditoría, y la conexión de lectura a Vercel devuelve un error de permisos. No desplegar ni aplicar migraciones hasta resolver ambos puntos.

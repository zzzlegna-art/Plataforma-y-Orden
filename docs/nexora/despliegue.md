# Despliegue de Nexora

## Destino confirmado

La instancia Supabase que el usuario identificó como Nexora es `ivholkjldntrmagcmogh`. La configuración local `supabase/config.toml` apunta a esta referencia en la rama de trabajo.

## Estado de la base de datos

La instancia contiene tablas `bodega_*` con datos operativos, pero el código actual espera tablas `nexora_*`. También existen tablas genéricas vacías creadas por instalaciones previas. Se ha preparado una migración para normalizar los nombres dentro de la misma instancia, conservando los datos.

## Flujo de publicación

1. Revisar la migración de nombres y comprobar su compatibilidad con el esquema real.
2. Verificar las variables de entorno de Vercel.
3. Ejecutar ESLint, TypeScript, pruebas y build.
4. Abrir y revisar el pull request.
5. Preparar respaldo, ventana de mantenimiento y reversión.
6. Aplicar la migración y comprobar los flujos críticos antes de publicar.
7. Confirmar login, roles, recepción, inventario, seriales, pedidos, garantías y auditoría.

## Validaciones

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm check:deploy
```

No aplicar la migración ni desplegar hasta que el plan de reversión y la configuración de producción estén verificados.

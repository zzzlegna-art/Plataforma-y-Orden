# Nexora — registro de evolución de la plataforma

## Identidad y experiencia

- Marca de interfaz: Nexora.
- Subtítulo de navegación: Smart Operations.
- Estilo visual: Emerald Tech, con tema claro/oscuro y componentes responsive.
- HTML, metadatos, favicon, iconos PWA y navegación usan la identidad Nexora.

## Arquitectura conservada

- Frontend React, TypeScript y Vite.
- Supabase para PostgreSQL, autenticación, RLS y Realtime.
- La lógica de inventario, seriales, recepciones, pedidos, garantías y auditoría debe conservar sus validaciones y trazabilidad.
- Las operaciones críticas requieren guardado atómico y permisos por rol.

## Separación del esquema

La rama incluye la migración `supabase/migrations/20261019060000_rename_legacy_identifiers_to_nexora.sql`. La migración renombra tablas, funciones, constraints, índices, políticas y triggers con prefijo heredado, y actualiza los cuerpos de las funciones para que apunten a los nuevos nombres. Los datos y relaciones se conservan; no se elimina información.

La migración no se ha aplicado a ningún proyecto remoto. El identificador en `supabase/config.toml` no coincide con la instancia visible en la auditoría, y el proyecto Vercel todavía tiene aliases heredados. Por eso la separación remota sigue pendiente.

## Validación antes de integrar

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm check:deploy
```

No se considera verificado un despliegue solo por existir un registro de finalización. La prueba debe confirmar login, permisos, inventario, seriales, recepción, pedidos, garantías y administración contra la instancia de Nexora correcta.

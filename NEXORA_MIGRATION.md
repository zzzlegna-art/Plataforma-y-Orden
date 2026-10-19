# Nexora — registro de evolución de la plataforma

## Identidad y experiencia

- Marca de interfaz: Nexora.
- Subtítulo de navegación: Smart Operations.
- Estilo visual: Emerald Tech, con tema claro/oscuro y componentes responsive.
- HTML, metadatos, favicon, iconos PWA y navegación usan la identidad Nexora.

## Arquitectura y compatibilidad

- Frontend React, TypeScript y Vite.
- Supabase para PostgreSQL, autenticación, RLS y Realtime.
- La lógica de inventario, seriales, recepciones, pedidos, garantías y auditoría conserva sus validaciones y trazabilidad.
- Las operaciones críticas mantienen el guardado atómico mediante el RPC ya desplegado `nexora_guardar_con_version`.
- **Durante este despliegue se conservan los nombres de base de datos existentes `bodega_*`.** La marca visible Nexora no requiere renombrar las tablas internas.

## Migración de identificadores aplazada

El renombrado masivo de tablas, funciones, índices, políticas y triggers queda fuera de este despliegue. Aplicarlo antes de coordinar el código de producción podría dejar la versión actual consultando nombres inexistentes.

La migración de identificadores deberá prepararse por separado, probarse en un entorno aislado con una copia de respaldo y desplegarse de forma coordinada con la versión de aplicación que la utilice. No se debe ejecutar una migración de renombrado como parte de este release.

## Validación antes de integrar

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm check:deploy
```

No se considera verificado un despliegue solo por existir un registro de finalización. La prueba debe confirmar login, permisos, inventario, seriales, recepción, pedidos, garantías y administración contra la instancia de Nexora correcta.

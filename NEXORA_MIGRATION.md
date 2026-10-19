# Nexora — registro de evolución de la plataforma

## Identidad y experiencia

- Marca de interfaz: Nexora.
- Subtítulo de navegación: Smart Operations.
- Estilo visual: Emerald Tech, con tema claro/oscuro y componentes responsive.
- HTML, metadatos, favicon y navegación utilizan la identidad Nexora.
- La aplicación instalable y sus iconos se están alineando con la misma identidad.

## Arquitectura conservada

- Frontend React, TypeScript y Vite.
- Supabase para PostgreSQL, autenticación, RLS y Realtime.
- La lógica de inventario, seriales, recepciones, pedidos, garantías y auditoría debe conservar sus validaciones y trazabilidad.
- Las operaciones críticas siguen requiriendo guardado atómico y permisos por rol.

## Separación de infraestructura pendiente

La marca visual está separada, pero aún no puede certificarse el aislamiento completo de los servicios remotos. La referencia de Supabase en la configuración local no coincide con la única instancia accesible en la auditoría, y el acceso de lectura a Vercel devuelve un error de permisos.

Los identificadores internos heredados de la base de datos y de las funciones remotas requieren una migración coordinada. No deben renombrarse solo en el frontend ni modificarse directamente en producción.

## Validación antes de integrar

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm check:deploy
```

La compilación, las pruebas y la navegación real deben validarse antes de integrar los cambios. No se considera verificado un despliegue solo por existir un registro de finalización.

# Nexora — mapa de Supabase

## Visión general

Nexora utiliza Supabase para:

- PostgreSQL.
- Autenticación.
- Row Level Security (RLS).
- Edge Functions.
- Migraciones versionadas.
- Realtime cuando corresponde.

## Estructura

```
supabase/
├── functions/     Funciones del backend
├── migrations/    Cambios versionados de base de datos
├── tests/rls/     Validaciones de permisos
└── config.toml    Configuración local de Supabase
```

## Principios de seguridad

- Mantener RLS activo y revisar cada política por rol.
- Conservar propiedad de los datos, auditoría e integridad histórica.
- No exponer claves privilegiadas en el cliente.
- Usar migraciones versionadas para cambios de esquema.
- Validar las funciones remotas y sus permisos antes de desplegar.

## Estado de configuración

La referencia indicada en `supabase/config.toml` no coincide con la instancia de Supabase visible en la auditoría actual. Confirmar el destino antes de ejecutar comandos de enlace, despliegue o migración.

La migración `20261019060000_rename_legacy_identifiers_to_nexora.sql` coordina el cambio de nombres. Debe probarse en una copia del proyecto correcto antes de producción; no ejecutar mientras el destino de Supabase no esté confirmado.

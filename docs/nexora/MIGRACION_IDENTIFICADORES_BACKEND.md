# Nexora — plan de migración de identificadores internos

## Objetivo

Eliminar los prefijos técnicos heredados de los objetos de base de datos y de las funciones remotas, manteniendo Nexora como identidad única. Esta migración debe preservar los datos, las sesiones, los permisos, las referencias y la compatibilidad durante el cambio.

## Estado

La interfaz y la documentación se están alineando con Nexora. El esquema SQL aún usa objetos `bodega_*`. No se deben renombrar directamente desde el frontend ni ejecutar cambios destructivos en producción hasta confirmar el proyecto Supabase de destino.

La configuración local `supabase/config.toml` contiene la referencia `kiizldurgjtorxpzebpm`, mientras que la instancia Supabase visible en la auditoría es `ivholkjldntrmagcmogh`. Esta discrepancia debe resolverse primero.

## Objetos de esquema identificados

Las migraciones iniciales declaran estas tablas:

| Objeto actual | Nombre objetivo propuesto |
|---|---|
| `bodega_profiles` | `nexora_profiles` |
| `bodega_categories` | `nexora_categories` |
| `bodega_brands` | `nexora_brands` |
| `bodega_products` | `nexora_products` |
| `bodega_settings` | `nexora_settings` |
| `bodega_receptions` | `nexora_receptions` |
| `bodega_reception_items` | `nexora_reception_items` |
| `bodega_units` | `nexora_units` |
| `bodega_movements` | `nexora_movements` |
| `bodega_customers` | `nexora_customers` |
| `bodega_orders` | `nexora_orders` |
| `bodega_order_items` | `nexora_order_items` |
| `bodega_order_item_units` | `nexora_order_item_units` |
| `bodega_technicians` | `nexora_technicians` |
| `bodega_warranties` | `nexora_warranties` |
| `bodega_warranty_events` | `nexora_warranty_events` |
| `bodega_previous_serials` | `nexora_previous_serials` |
| `bodega_audit_logs` | `nexora_audit_logs` |

Los nombres de índices, políticas, funciones, triggers, secuencias, restricciones y tipos deben inventariarse desde el esquema real antes de generar la migración completa. No asumir que la lista de tablas es exhaustiva.

## Secuencia obligatoria

1. **Confirmar el destino:** comprobar que la instancia Supabase seleccionada es la de Nexora y alinear la configuración local y las variables del despliegue.
2. **Inventariar dependencias:** extraer el esquema actual y registrar tablas, vistas, índices, restricciones, secuencias, funciones, triggers, políticas RLS, grants, buckets, Edge Functions y referencias del cliente.
3. **Preparar compatibilidad:** crear una migración SQL versionada que renombre objetos preservando los datos y reconstruya o ajuste todas las dependencias. Revisar especialmente el código que usa nombres de tablas y las llamadas a funciones remotas.
4. **Actualizar la aplicación:** cambiar consultas, tipos generados, pruebas, funciones Edge, documentación y configuraciones de despliegue de forma coordinada.
5. **Probar en una copia:** ejecutar migraciones y pruebas de lectura/escritura, login, roles, recepción, seriales, inventario, pedidos, garantías y auditoría.
6. **Revisar RLS:** comprobar permisos efectivos por rol después de los renombres. Que RLS esté activado no demuestra que las políticas sean correctas.
7. **Desplegar con reversión:** respaldar el esquema y los datos, aplicar en una ventana controlada, validar y conservar un procedimiento de reversión probado.

## No hacer

- No eliminar y recrear tablas para cambiarles el nombre.
- No copiar datos a tablas nuevas y borrar las antiguas sin un plan de reconciliación.
- No desactivar RLS globalmente.
- No cambiar solo los nombres del frontend mientras el backend siga usando los identificadores anteriores.
- No aplicar migraciones a un proyecto remoto hasta confirmar inequívocamente su referencia.
- No cambiar el nombre de funciones Edge sin actualizar los clientes que las invocan y probar su despliegue.

## Criterio de finalización

La separación solo se puede declarar completa cuando el frontend, las migraciones, el esquema remoto, las funciones remotas, los permisos, la configuración de despliegue y la documentación ya no dependan de identificadores heredados, y las pruebas de regresión pasen sobre el proyecto Nexora confirmado.

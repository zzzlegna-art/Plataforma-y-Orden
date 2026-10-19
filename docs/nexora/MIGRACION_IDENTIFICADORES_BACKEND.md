# Nexora — normalización del esquema existente

## Importante: no se traslada la plataforma

Esta operación no copia datos a otro proyecto ni crea una segunda base de datos. Se prepara para ejecutarse dentro de la instancia Supabase confirmada para Nexora: `ivholkjldntrmagcmogh`.

## Diagnóstico de solo lectura

En esa misma base de datos existen dos grupos de tablas:

- Tablas heredadas `bodega_*` con datos operativos.
- Tablas genéricas como `products`, `orders`, `users` y `customers`, actualmente vacías.

Conteos observados durante la auditoría:

| Tabla | Filas |
|---|---:|
| `bodega_products` | 47 |
| `bodega_movements` | 9 |
| `bodega_units` | 6 |
| `bodega_orders` | 1 |
| `bodega_warranty_events` | 18 |
| `bodega_audit_logs` | 106 |
| `products` | 0 |
| `orders` | 0 |
| `users` | 0 |

El código de Nexora usa nombres como `nexora_products`, `nexora_units` y `nexora_orders`, pero la base de datos todavía no tiene tablas con el prefijo `nexora_`. La función `nexora_guardar_con_version` también contiene referencias internas a nombres antiguos.

## Trabajo de reconciliación preparado

La migración versionada está diseñada para renombrar objetos dentro de la misma base de datos, conservando las filas y relaciones existentes. Incluye tablas, funciones, índices, secuencias, restricciones, tipos, vistas, políticas RLS y triggers que usan el prefijo heredado.

La comprobación preliminar de solo lectura identificó 20 tablas con prefijo heredado, 15 funciones con ese prefijo y 60 relaciones entre índices, secuencias y vistas candidatas a renombrarse. No se encontraron colisiones de nombres para las tablas o funciones objetivo en las consultas de preflight.

## Configuración confirmada

`supabase/config.toml` se actualizó en esta rama para apuntar a `ivholkjldntrmagcmogh`. Aún no se ha verificado que las variables de entorno de Vercel apunten a la misma instancia.

## Antes de ejecutar en producción

1. Revisar la migración SQL completa contra el esquema y las funciones reales.
2. Crear o verificar una copia de seguridad y un procedimiento de reversión.
3. Asegurar una ventana de mantenimiento para evitar escrituras concurrentes durante el cambio de nombres.
4. Aplicar la migración de forma transaccional.
5. Validar tablas, datos, relaciones, funciones RPC, RLS, login, inventario, seriales, pedidos y garantías.
6. Comprobar que el despliegue de Nexora utiliza la URL y la clave pública de esta misma instancia.
7. Mantener intactas las tablas genéricas vacías hasta confirmar que no son utilizadas por otro flujo.

**Estado:** preparada en la rama de trabajo; no aplicada en la base de datos de producción.

# Nexora Multisede 2.0 · Fase 1: catálogo de ubicaciones

> **Estado:** desarrollo aislado en PR. No se ha migrado ni publicado el inventario de producción.

## Alcance implementado en esta fase

- Catálogo de ciudades, bodegas, locales y una sede principal.
- Un local debe estar vinculado a una bodega o sede principal **de la misma ciudad**.
- Pestaña **Administración > Sedes**, solo para Administrador, con alta de ciudad y sede.
- Acceso autenticado de solo lectura al catálogo para personal activo, con escritura protegida por políticas RLS de Administrador.
- Preparación de asignaciones de personal con los cuatro roles pactados: admin, bodeguero, encargado y vendedor, **sin habilitar todavía esos perfiles en el sistema legacy**.
- Campo nullable `bodega_units.site_id`, sin backfill automático. NULL significa «sede no conciliada».
- Trigger temporal que impide asignar/cambiar `site_id` desde permisos legacy por un usuario no Administrador.

## Disponibilidad global por sede incorporada al detalle del producto

- La ficha de cada referencia presenta ciudades, bodegas y locales con existencias verificadas.
- El agregado se deriva del IMEI individual `bodega_units.site_id`, **no** de una deducción basada en `en_bodega`/`en_local`.
- Los IMEI sin `site_id` o con ubicación inválida aparecen como **pendientes de conciliación**, jamás como disponibilidad real en una sede.
- El tránsito se informa aparte y no suma a disponible.
- Los pedidos preparados y garantías de cliente se excluyen del disponible, reutilizando los mismos selectores que el inventario actual.
- El catálogo de sedes se consulta con permisos existentes; si la migración aún no está desplegada, la vista informa que está pendiente sin bloquear el inventario legacy.
- La visibilidad del inventario no otorga autorización para vender, reservar, trasladar o ajustar mercancía fuera de la sede propia.
- Las pruebas de negocio verifican localización real, diversas ciudades, estado de tránsito, bloqueo por pedidos, garantías y datos históricos sin ubicación.
- Hasta que no se migre y confirme físicamente la totalidad de los IMEI, el resultado será parcial; los pendientes se muestran explícitamente.

## No implementado todavía

- Cambio del rol real de `bodega_profiles` o el motor de permisos legacy.
- Reglas multisede de lectura/escritura sobre el inventario y operaciones RPC.
- Conciliación física de IMEI y asignación de sedes de productos existentes.
- Traslados, salidas, tránsito, devoluciones automáticas, POS y caja.
- Operaciones de inventario basadas en `site_id`; los estados anteriores siguen igual.

**No considerar la sola presencia de `nexora_site_memberships` como seguridad suficiente** para operaciones de mercancía, venta o caja; primero deben endurecerse todas las operaciones de backend, RLS y Edge Functions.

## Secuencia para habilitar sin perder datos

1. Verificar la copia recuperable de Supabase y una restauración de prueba.
2. Crear entorno de staging; ejecutar allí `20261101040000_nexora_multisite_catalog.sql`.
3. Verificar RLS con sesiones de Administrador, Bodeguero y usuario sin autenticar:
   - Personal activo: SELECT del catálogo.
   - Bodeguero: INSERT/UPDATE de ciudades o sedes denegado.
   - Administrador: INSERT de ciudad y bodega autorizado.
   - Local sin bodega, local cuyo origen está en otra ciudad y segunda sede principal: denegados.
   - Bodeguero: asignar `bodega_units.site_id` denegado.
4. Revisar el resultado de Security Advisors y probar ambos temas (oscuro/claro), escritorio y móvil.
5. Validar que todas las unidades actuales conservan su estado, costo, proveedor, historia e identificador originales.
6. Registrar las sedes reales con sus nombres y direcciones confirmados; **no crear ubicaciones ficticias**.
7. Planificar el inventario físico de cada local antes de asignar IMEI.
8. Migrar roles y autorización atómica por sede; solo después habilitar el uso productivo de `site_id` y los traslados.

## Observaciones sobre datos actuales

La base legacy usa `en_bodega` y `en_local` como estados de unidad, sin identificar cada punto físico. No convertir esos estados en una ciudad por suposición.

El costo individual por unidad ya forma parte de la forma de datos. Su conservación y política de cambios corresponden a fases posteriores, con pruebas que eviten vender al costo o por debajo.

## Puerta de salida

La fase podrá fusionarse y desplegarse cuando CI esté en verde, migración probada en staging, permisos verificados, respaldo recuperable y revisión visual hecha. Hasta entonces, mantener la PR en borrador y la aplicación productiva intacta.

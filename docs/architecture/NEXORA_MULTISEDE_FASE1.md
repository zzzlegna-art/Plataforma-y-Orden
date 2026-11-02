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

## Matriz de permisos y normas de traslados (Fase 1 ampliada)

Se preparó la **matriz exacta de los cuatro perfiles** en `src/lib/nexora-role-policy.ts`: Administrador, Bodeguero, Encargado y Vendedor, sin personal financiero adicional. Se incluye la pestaña `Administración > Roles y permisos` con vista premium y comparación por rol, accesible solo al Administrador actual. Esta pantalla es **informativa y todavía no habilita los perfiles nuevos**.

Decisiones codificadas:
- Todos pueden consultar inventario, costo individual de IMEI y gestionar traslados (sujetos a sede y rutas).
- Administrador y Bodeguero gestionan garantías, correcciones de IMEI, recepciones de proveedores en sede principal y sustituciones individualmente.
- Solo el Administrador gestiona referencias, autoriza ajustes de inventario, costos, notas de crédito, mercancía extra y cancelación de ventas/devoluciones de dinero.
- Administrador o Encargado abren caja; el Encargado cierra, registra y autoriza gastos; solo el Administrador puede reabrir excepcionalmente.
- Los reportes corresponden al Administrador y Encargado, pero el alcance por sede **aún exige protección servidor**.
- La migración de roles NO debe activarse hasta corregir las políticas RLS, funciones RPC, Edge Functions y los cambios al modelo `bodega_profiles` del sistema actual. No es seguro simplemente crear usuarios con nuevos roles.

Se preparó el motor de reglas `src/lib/nexora-transfer-rules.ts` y pruebas:
- Rutas: sede principal → bodegas; bodega → bodega regional sin aprobación adicional; bodega → su local; local → bodega; **local → local prohibido**.
- Recibir exige marcar **cada IMEI** enviado como «recibido» o «no llegó», con observación en cada faltante.
- Un traslado de 20 celulares con 15 recibidos produce **15 recibidos y 5 devoluciones pendientes** en el origen. No se regresan automáticamente al disponible de origen: solo se habilitan después de confirmación física allí.
- Las reglas se escriben como funciones puras, sin alterar registros existentes. **La operación atómica y el documento de devolución persistido no están implementados todavía**; se construirán y probarán con el backend multisede.

## Recepción física premium y documentos de traslado · siguiente bloque

- Migración `20261101140000_nexora_transfer_documents_staging.sql`, que **depende de la migración de ciudades/sedes**. Se preparan:
  - `nexora_transfers`: origen y destino, tipo, estados, referencia al traslado original y quién crea, despacha y recibe.
  - `nexora_transfer_units`: verificación por cada IMEI, observaciones obligatorias de faltantes y exclusión única de un IMEI de dos traslados abiertos simultáneos.
  - `nexora_transfer_events`: eventos con actor, momento, documento e historial inmutable.
- Las tres tablas poseen RLS y **solo GRANT SELECT** para el usuario autenticado. No hay edición directa del historial ni despacho por modificaciones del navegador.
- La lectura del documento requiere rol Administrador activo o asignación activa a sede de origen/destino. Los usuarios sin sede asignada no pueden consultar documentos ajenos.
- El componente reutilizable `src/components/transfers/TransferReceiptChecklist.tsx` ofrece el flujo premium real: marca obligatoria por IMEI, observación por faltante, totalizadores y confirmación mediante `onConfirm` asíncrono. Impide confirmar incompletos, repetir confirmaciones exitosas y conserva marcas ante fallas del servidor.
- **Todavía no está conectado a una RPC de escritura**. La interfaz solo puede habilitarse cuando se implemente y pruebe una transacción atómica que registre recepción, historial, nueva ubicación, estado y devolución pendiente de origen. Hasta entonces, no presentar el componente como recepción guardada.
- De momento también se bloquea en la primera migración asignar perfiles `encargado` / `vendedor` a `nexora_site_memberships`. Sin refactorizar RLS/RPC de la base legacy, podrían heredar involuntariamente permisos amplios de Bodeguero. La activación requiere la sustitución segura de esa protección.

### Checklist antes de conectar la confirmación real

1. Migrar y verificar la autenticación y la autorización de los cuatro roles en servidor (RLS, funciones, acciones de cliente y Edge Functions).
2. Asignar sedes verificadas e inventario físico a las unidades, sin backfill especulativo.
3. Implementar un RPC transaccional, idempotente por ID de recepción: bloquear traslado y unidades, validar origen/destino, usuario receptor, IMEI y estado previo.
4. Aplicar en una sola transacción: 15 IMEI recibidos al destino, 5 IMEI faltantes que continúan sin disponibilidad, cierre de tránsito original, creación de retorno por 5 unidades, y bitácora inmutable.
5. La bodega de origen debe verificar y confirmar físicamente cada equipo de retorno antes de sumarlo al disponible. Si no está, abrir incidencia sin duplicar stock.
6. Probar respuestas perdidas, doble envío concurrente, IMEI duplicado, recepción parcial y total, roles sin permiso, devoluciones y ciudades distintas.
7. Solo después habilitar la vista operacional en el menú y activar políticas de escritura/RPC en staging; no habilitar desde el cliente antes que el backend.

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

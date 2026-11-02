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

## Operaciones atómicas de traslado — prototipo administrativo para STAGING

Migración nueva: `20261101180000_nexora_transfer_atomic_staging.sql`. **No se ha ejecutado ni probado en PostgreSQL de staging**, y tampoco se ha aplicado en Supabase de producción. Es una implementación inicial para validar, no una autorización para encender los traslados reales.

- `nexora_dispatch_transfer`: usa un UUID de operación para reintentos, valida la ruta permitida mediante trigger, comprueba que todos los IMEI pertenecen físicamente a la sede emisora, excluye pedidos activos y garantías, evita doble tránsito y registra salida e historial en una transacción.
- `nexora_receive_transfer`: exige una decisión individual por cada IMEI, con observación para faltantes; cierra el tránsito original y crea automáticamente una devolución pendiente solo por los equipos no recibidos. Si se confirmó una petición y se pierde la respuesta de red, reconoce un reintento idéntico sin procesar otra vez.
- `nexora_verify_origin_return`: la sede emisora verifica cuáles equipos del documento de devolución encontró físicamente. Solo esos regresan al disponible en origen; los demás permanecen en tránsito y generan incidencia.
- Los eventos históricos conservan actor, fecha y documento y no se permiten borrados por usuario.
- Las operaciones utilizan inicialmente autorización de **Administrador activo solamente**. Esto limita explícitamente el prototipo hasta completar la migración del sistema legacy a los cuatro perfiles y al acceso efectivo por sede. No representa la política definitiva de todos los empleados.
- La migración reconoce `reference_type = 'traslado'` para que el historial de movimientos pueda identificar la vida de cada serial.

**Bloqueos antes de habilitar:** solo existe un proyecto Supabase conectado y corresponde al sistema activo; aún no se dispone de un proyecto de pruebas/restauración. Falta ejecutar las tres migraciones sobre staging, probar SQL/funciones y RLS con usuarios reales, validar fallas de red, reintentos simultáneos, garantías, inventario físico, integración de formulario y conciliación de incidencias no encontradas. No mezclar este backend sin verificar con recepciones o pedidos actuales. Los casos de incidencia después de una verificación sin hallazgo necesitarán un flujo de resolución posterior; no se permite devolver el equipo al stock con un simple cambio de estado.

Se agregó `src/lib/nexora-sql-contract.test.ts` para detectar delimitadores PL/pgSQL rotos, ausencia de restricciones, políticas y acceso anónimo. Esta prueba estática **no sustituye** ejecutar SQL contra PostgreSQL en staging.

## Vida global del IMEI y bloqueo integral durante el traslado

Última ampliación preparada en la rama multisede:

- El historial de traslado es **consultable por todos los empleados activos de la red**, independientemente de la ciudad. Las políticas de lectura de `nexora_transfers` validan `bodega_is_staff()`; el historial de eventos e IMEI sigue sujeto a RLS y ninguna de estas lecturas autoriza movimientos de mercancía.
- Cada serial tiene una sección adicional en `/seriales` llamada **Recorrido del IMEI entre ciudades**. Distingue despachos, recepciones físicas, faltantes, verificaciones de devoluciones e incidencias, con nombre de ciudad y sede y documento asociado.
- Los movimientos registrados por los RPC también usan nombres legibles de ciudad y bodega/local en las observaciones del movimiento legacy.
- La sección se oculta si las tablas nuevas aún no están migradas, para no bloquear ni confundir con la hoja de vida legacy. Si el servidor falla por otra causa, muestra una advertencia sin ocultar el historial existente.
- `nexora_prevent_open_transfer_restock` ahora intercepta **cualquier UPDATE** de un IMEI con traslado abierto, protegiendo también serial, costo, referencia, color, observaciones y demás campos. Solo permite el primer cambio de estado a `en_transito` realizado por el RPC de despacho, sin modificar ninguno de los demás campos. La operación de recepción debe cerrar antes la marca `is_open`.
- Pruebas: recorrido regional por IMEI, incidente y observación, registros ajenos excluidos, retorno físico y compatibilidad de la interfaz cuando todavía no hay migración.

**Importante:** la implementación es código no publicado y todavía no verificado con SQL de staging. No se atribuye stock ni se activa un traslado por leer su historial; la autorización efectiva de los cuatro roles y la migración del inventario siguen siendo puertas obligatorias.

## Resolución auditada de faltantes encontrados después

La validación automática de la última revisión del plan multisede pasó en GitHub. Se preparó, además, la RPC `nexora_resolve_origin_incident` **únicamente para staging**:

- Se usa cuando la bodega emisora reportó un IMEI como no encontrado en el primer conteo, pero después lo localiza físicamente.
- El Administrador del piloto debe indicar el IMEI, el documento de retorno y una observación explícita de recuperación. La función comprueba que esa unidad sea precisamente una incidencia abierta, que su estado sea `en_transito` y que su ubicación lógica siga siendo el origen.
- En una sola operación: cierra la incidencia de esa unidad, reincorpora el IMEI a la bodega que corresponde, escribe movimiento de entrada y agrega evento **incidencia_resuelta** al historial permanente.
- Si hay más IMEI sin aparecer, el documento permanece en estado `incidencia`. Solo pasa a `recibido` cuando no queda ninguno abierto.
- Un reintento de una recuperación ya confirmada no genera otra entrada, pero tampoco permite fingir que se recuperó una unidad recibida desde el comienzo.
- Los celulares que todavía no aparecen permanecen **fuera del disponible**, sin ningún atajo para regresar existencias por mera edición de pantalla.
- La hoja de vida muestra la incidencia inicial y la posterior recuperación como **dos hechos distintos**, con fechas y observaciones, sin sobrescribir la evidencia original.

Las pruebas de contratos SQL, API y vida del IMEI fueron ampliadas para el escenario. Sigue pendiente ejecutar las migraciones y RPC contra PostgreSQL de staging con sesiones reales y probar concurrencia.

**Entorno de pruebas:** Supabase confirmó que la creación de una rama de desarrollo requiere una confirmación de costo; no se creó ni se realizó ningún cargo. Hasta contar con autorización expresa del costo, NO ejecutar estas migraciones sobre producción ni asumir que las pruebas de GitHub sustituyen la prueba de base de datos.

## Pantalla de confirmación de devoluciones en la bodega emisora

Se incorporó el componente premium `src/components/transfers/OriginReturnChecklist.tsx` y sus pruebas:

- Permite **escanear** el IMEI (lector o teclado + Enter), marcar cada unidad como encontrada o no encontrada y registrar la observación obligatoria de cada faltante.
- El mismo IMEI no suma dos veces; una referencia que no pertenece al retorno se rechaza.
- El botón de confirmar se bloquea hasta revisar **todos** los IMEI pendientes. Se valida la coincidencia entre el documento y las decisiones antes de permitir el guardado.
- El componente invoca una operación proporcionada por el módulo servidor, no escribe inventario desde el navegador. Ante fallo de conexión conserva las marcas y no presenta la recepción como exitosa.
- Después de recibir confirmación del servidor, impide una segunda confirmación en la pantalla.
- Las verificaciones que no encuentran físicamente equipos crean incidencias; la RPC `nexora_resolve_origin_incident` permite resolverlas posteriormente, por equipo y con evidencia, sin sobrescribir su historia.
- Reintentos de esa RPC con una observación diferente se rechazan: una confirmación ya registrada no puede reemplazar silenciosamente la evidencia.

**Pendiente para uso real:** integrar el componente en el módulo operativo de traslados, probar las RPC y permisos en Supabase staging y migrar los cuatro roles. Se mantiene intencionalmente fuera de la navegación productiva.

## Validación automática de sintaxis PostgreSQL

Se añadió `.github/workflows/nexora-multisite-sql.yml`, que corre en cada cambio de migraciones de la rama. Usa el analizador real de gramática SQL PostgreSQL (`pglast`) para validar **tres archivos de migración y un archivo de comprobaciones**, sin conectarse a Supabase ni ejecutar sentencias SQL. La primera ejecución terminó correctamente.

Este resultado complementa las pruebas de TypeScript, pero NO valida el contenido completo de PL/pgSQL, dependencias del esquema, RLS o transacciones contra datos reales: **la migración sigue sin poder activarse sin staging**.

También se corrigió durante pruebas automáticas una excepción al confirmar devoluciones que tenían observaciones inicialmente vacías (`OriginReturnChecklist`). La pantalla ahora inicializa ambos campos incluso cuando la marca se crea mediante escaneo, y conserva los valores al reintentar.

## Seguridad por sede y exclusión de ventas concurrentes (nuevo bloque)

- Se preparó `public.nexora_can_operate_transfer_site(p_site_id)` como función **SECURITY DEFINER** con `search_path` restringido. Solo devuelve verdadero para un Administrador activo ante una sede activa, o para Bodeguero/Encargado/Vendedor activo que tenga **membresía activa y cuyo rol coincida exactamente con el perfil real** en la sede de destino. No confía en el rol enviado desde el navegador.
- Se añadió `src/lib/nexora-site-access.ts` como **espejo visual de permisos**, con pruebas para los cuatro perfiles, sedes no asignadas, perfiles bloqueados, asignaciones inactivas y membresías falsificadas. **El espejo en JavaScript NO autoriza operaciones.**
- **Activación pendiente:** las operaciones RPC de prueba siguen restringidas a Administrador y el esquema legacy todavía no admite Encargado/Vendedor. La función por sede está preparada para integrarse después de migrar las políticas RLS y los RPC históricos. No se ha concedido ningún privilegio adicional en producción.
- Se corrigió la selección de IMEI comprometidos en pedidos: solo los pedidos **en preparación o preparados** bloquean un despacho nuevo; un pedido histórico ya despachado no debe bloquear eternamente un equipo legítimamente recuperado que vuelva a estar disponible, sujeto a su verificación física.
- Se prepararon triggers de base de datos sobre `bodega_order_item_units` y `bodega_warranties` para impedir que una operación legacy relacione con pedidos o garantías una unidad **con traslado abierto**, incluso sin cambiar directamente `bodega_units`.
- Los triggers bloquean la fila física del IMEI antes de comprobar el tránsito, para serializar el alta de un pedido o una garantía frente al despacho y evitar carreras cuando dos empleados trabajan a la vez. Se revisarán estos bloqueos con sesiones simultáneas en staging antes de habilitar.
- Se ampliaron las pruebas de contratos SQL y el script de verificación de staging para exigir estos triggers. La gramática de la migración volvió a superar el analizador SQL después de corregir los delimitadores de una función.

**Sin cambios en producción:** ninguna tabla, disparador ni función de este bloque ha sido aplicada en Supabase real. La activación requiere staging, pruebas de concurrencia y la migración segura de los cuatro roles.

## Primera prueba E2E de PostgreSQL REAL en CI — APROBADA

**Verificado con PostgreSQL 16 temporal (2026-11-02), no con Supabase de producción.**

Se incorporaron tres componentes para probar las operaciones SQL sin incurrir en costos de una rama de Supabase:
- `.github/workflows/nexora-multisite-postgres.yml`: levanta un contenedor PostgreSQL desechable en GitHub Actions, sin claves ni conexión a bases productivas.
- `supabase/verification/nexora_multisite_ephemeral_bootstrap.sql`: crea un esquema *simulado y mínimo* de las tablas legacy, perfiles de Administrador/Bodeguero y la función `auth.uid()`. Todos los IMEI y ciudades de prueba son ficticios.
- `supabase/verification/nexora_multisite_ephemeral_e2e.sql`: aplica las tres migraciones en esa base aislada, verifica RLS/grants estructurales y ejecuta realmente los RPC con el usuario Administrador simulado.

### Caso de aceptación comprobado

- Se despachan 20 IMEI desde una bodega regional a su local. Los 20 pasan a `en_transito`.
- Una edición legacy que intenta alterar el **costo**, un pedido y una garantía que intentan asociar un IMEI en tránsito **son rechazados por PostgreSQL**.
- La recepción confirma 15 IMEI en el local y cinco faltantes con observación. Solo 15 entran al disponible del local.
- Se crea un solo documento de devolución para cinco IMEI. El reintento idéntico devuelve el mismo documento, sin duplicaciones.
- La bodega verifica tres IMEI recuperados y deja dos incidencias; solo los tres encontrados regresan a su stock.
- La recuperación tardía de otro IMEI reduce las incidencias abiertas de dos a una; su reintento no duplica el inventario ni la bitácora.
- El Administrador activo tiene permiso en sedes activas, el Bodeguero simulado solo en su sede asignada y el usuario desactivado no tiene permiso.

**Resultado GitHub Actions:** aprobado; el log contiene `E2E PASÓ: 20 enviados, 15 recibidos, 5 retorno, 3 encontrados, 2 incidencias y 1 recuperación posterior.`

Esta prueba detectó y permitió corregir dos problemas antes de producción: (1) una condición PL/pgSQL que impedía compilar la función de despacho y (2) la necesidad de sembrar las ubicaciones iniciales con el perfil Administrador activo incluso en staging.

**Limitaciones que aún impiden desplegar:** el esquema legacy del test es una maqueta reducida, no una restauración de la base Nexora; no valida aún todos los triggers/RLS históricos, sesiones de cuatro roles reales, conflictos entre transacciones de dos conexiones independientes ni comportamiento con el frontend real. Hace falta la revisión de seguridad por sede, conciliación física y el ambiente de ensayo Supabase antes del lanzamiento. El E2E no implica autorización para fusionar o aplicar migraciones.

## Bandeja premium de traslados conectada a RPC — PILOTO ADMINISTRATIVO

Se incorporó la pantalla `/traslados-piloto` con autorización legacy `users.manage` (**solo Administrador**), vinculada desde `Administración → Sedes`. Se mantiene en la rama de desarrollo y NO se ha publicado en producción.

- **Bandeja de documentos:** lista reciente (hasta 100) de traslados globales, con origen, ciudad, destino, estado y fecha; filtros de por atender, envíos, devoluciones y todos; búsqueda por código o sede. El listado no inventa documentos.
- **Acta por IMEI:** lee `nexora_transfers`, `nexora_transfer_units`, `bodega_units`, `nexora_sites` y `nexora_cities`. Comprueba que cada IMEI del documento sea visible y esté completo; si la consulta devuelve menos seriales de los esperados, bloquea la confirmación.
- **Recepción física desde la bandeja:** para `envio/en_transito` monta la lista premium con escaneo, decisiones `recibido/no_llego` y observaciones. Solo confirma cuando `nexora_receive_transfer` responde con el mismo documento y conteos.
- **Devolución en bodega:** para `retorno_faltantes/pendiente_recepcion` monta la lista de revisión física y `nexora_verify_origin_return` de la misma forma.
- **Incidencias:** para `retorno_faltantes/incidencia` abre el acta sin permitir editar su historia y ofrece la recuperación individual del IMEI físicamente encontrado, mediante `nexora_resolve_origin_incident` con observación obligatoria.
- **Errores de red y migración:** si la tabla no existe, se informa de que el módulo no está activo. Una respuesta RPC inconclusa **no se interpreta como éxito**; no se edita inventario en el navegador. Tras una confirmación SQL exitosa, un fallo de refresco no provoca repetir el movimiento.
- **Sin elevación prematura de permisos:** los cuatro roles siguen aprobados para el sistema definitivo, pero los RPC actuales restringen este piloto al Administrador porque la seguridad legacy todavía no se ha migrado integralmente. La ruta no se muestra al personal sin `users.manage`.

Pruebas nuevas: `src/lib/nexora-transfer-inbox.test.ts`, `src/pages/traslados/index.test.tsx` y `src/components/transfers/IncidentRecoveryPanel.test.tsx`. La conexión real del navegador con una base Supabase restaurada continúa pendiente; la prueba E2E PostgreSQL previa cubre motor y transacciones, no estas pantallas de punta a punta.

**No publicar la PR #106 ni aplicar migraciones productivas hasta validar permisos, datos existentes y pruebas E2E de interfaz contra staging.**

## Nuevo traslado por referencia e IMEI — formulario piloto

Se desarrolló `/traslados-piloto/nuevo`, accesible desde la bandeja piloto de traslados. La ruta mantiene `RequirePermission("users.manage")`; esta limitación a Administrador **es provisional** hasta completar la migración segura de Encargado, Bodeguero y Vendedor en el servidor.

- **Ruta:** selecciona ciudad/punto físico de origen y destino. Solo presenta rutas permitidas por `validateTransferRoute`; local→local está prohibido. Al cambiar origen, borra el destino y toda la selección para evitar traslados equivocados. El RPC y su trigger verifican la ruta una segunda vez.
- **Referencias y modelos:** permite buscar producto por nombre o SKU y añadir IMEI de varias referencias al mismo envío, con resumen de unidades por modelo.
- **Disponibilidad física:** consulta `bodega_units` por **`site_id` verificado, referencia exacta y estado `en_bodega`/`en_local`**; no permite mostrar como despachable un IMEI en tránsito, vendido, de otra sede o sin conciliación. Paginación controlada de candidatos; bloqueo si la respuesta presenta seriales duplicados o inconsistentes.
- **Escaneo rápido:** un lector que envía Enter añade el IMEI al documento; un serial ajeno a la referencia y a la sede es rechazado. El mismo serial solo puede seleccionarse una vez. Hasta 500 equipos por traslado, según el límite SQL del RPC.
- **Confirmación:** `nexora_dispatch_transfer` procesa unidades y eventos en una transacción y cambia su estado a `en_transito`; la interfaz no actualiza el inventario local de forma optimista ni declara éxito ante una respuesta inválida.
- **Red interrumpida:** el formulario conserva el UUID asignado a la primera confirmación, congela las selecciones y obliga a consultar `nexora_transfers` y el manifiesto completo de `nexora_transfer_units` antes de reintentar. Si no existe el documento, puede reenviar únicamente con el mismo UUID y los mismos IMEI; si existe y coincide se da por confirmado, evitando duplicar el despacho.
- **Sin producción:** el formulario y su ruta siguen solo en PR #106, no publicados en la plataforma. La consulta de unidades usa una columna `site_id` que todavía no está creada en producción. Sin migraciones, avisa que el servicio multisede no está habilitado.

Se añadieron pruebas de carga de IMEI por sede/referencia, agrupación de cantidades, verificación de reintentos después de un corte de red y flujo del formulario; faltan sus resultados finales de CI, una prueba con Supabase staging representativo, migración de roles y comprobaciones E2E del navegador antes de activar.

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

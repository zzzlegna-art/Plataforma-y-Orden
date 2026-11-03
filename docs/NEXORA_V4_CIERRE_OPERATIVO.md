# Nexora Multisede V4 · estado de cierre operativo (02-11-2026)

Plan Maestro de 29 páginas, versión 4, fechado 31-10-2026. Bodega 6A, Barranquilla, es la única sede **principal** y centro de abastecimiento; iPhone America es un **local dependiente**. No crear otras sedes ficticias ni atribuirles unidades automáticamente.

## Evidencia conservada
- 3.153 unidades históricas, 4.193 movimientos, dos perfiles legacy.
- 2.758 IMEI en bodega, 395 vendidos; 2.758 activos sin costo individual validado.
- 0 actas de apertura, 0 certificaciones físicas, 0 custodias, 0 traslados, 0 ventas retail, 0 cajas.
- PR #136: Bodega 6A única sede principal, Vercel READY.
- PR #139: guía de declaración administrativa 6A sin reescaneos ficticios, fusionado y Vercel READY.
- PR #140: preparación de personal y bloqueos por cada local, fusionado tras CI verde; despliegue sujeto a verificación READY.
- PR #141: base privada de alcance rol/sede en migración **pendiente de evaluación y prueba SQL**. No se considera aplicada ni operativa antes de comprobarlo en Supabase.
- Tablas/funciones de inventario por IMEI, hoja de vida, conciliación, transferencias físicas, POS/caja y auditoría creadas, pero su disponibilidad operativa sigue restringida.

## Matriz de cierre pendiente
| Bloque | Estado comprobado | Criterio para considerar cerrado |
| --- | --- | --- |
| Bodega 6A, recepción de proveedores | Jerarquía correcta; acta declarativa preparada | Firma real del Administrador sin simular IMEI escaneados; preservación de 395 vendidos |
| Costos unitarios | 2.758 IMEI en bodega sin costo | Recuperar soporte documental y aprobación administrativa; jamás imputar costos inventados |
| Roles de cuatro perfiles | Vista/planificación, diagnóstico por local (PR #140) y guardia privada preparatoria (PR #141); Encargado/Vendedor inactivos | Aplicar y probar guardia privada, conectar RLS/RPC transaccionales por sede, revisar permisos de roles y habilitar solo tras pruebas positivas/negativas |
| Inventario físico por local | Esquema de cotejo y aprobación | Conteos auténticos y aprobaciones, sin duplicar IMEI ni asignar sede ficticia |
| Traslados físicos | Motor básico; PR #106 aún borrador | Completar autorización por los cuatro roles según sede y pruebas 20→15→5 |
| POS/caja | Motor y UI existentes, bloqueados | Validación por rol, local, caja, costo real, precio > costo e idempotencia |
| Anulación y cambios | No habilitados | Cancelación y reintegro solo Administrador, auditoría e inventario físico correcto |
| Recepción inteligente de factura | No validado como completo | PDF/JPG/PNG asistido, human-in-loop, costos solo Administrador |
| Transferencias monetarias | **Este PR incorpora módulo documental** | Migración aplicada, CI verde, usuario registra solo operaciones reales y valida conciliación |
| Garantías multiubicación | Legacy presente; integración no demostrada | Flujo posventa con IMEI, local, caja, proveedor y trazabilidad |
| Informes | CSV retail y auditoría | Semanal automático, mensual y PDF/Excel por sede y empresa |
| Notificaciones/fallas | Infraestructura legacy | Alertas por sede, reconexión, reintentos idempotentes |
| Seguridad y despliegues | RLS/CI existentes | E2E por roles, cierres de caja, restauración y revisión de advertencias de Supabase |

## Reglas de cierre
1. No afirmar que una sucursal tiene inventario físico sin acta o evidencia apropiada. Los registros declarativos no son escaneos.
2. No activar caja o POS sin costos reales y permisos de sede en servidor.
3. Dinero transferido entre sedes no es venta ni ingreso adicional.
4. Cada PR requiere pruebas, revisión de migraciones, despliegue controlado, comprobación READY y actualización del historial.
5. Pendientes de definición empresarial según página 28 del PDF: responsable de faltantes irreconciliables, tope de gasto, diferencias en cambios, garantías, falla de conexión y permisos sobre sedes ajenas.

## Avance técnico de permisos por sede (PR #141)

- `nexora_internal.site_role_scope_basis(site_id, capability)`: función `SECURITY DEFINER` con `search_path` fijo y **sin EXECUTE para anon/authenticated**; no está enlazada a operaciones.
- `nexora_internal.transfer_actor_scope_basis(action, origin, destination)`: condición preparatoria por etapa para las rutas V4: **principal→bodega regional dependiente**, **bodega regional→otra regional de distinta ciudad**, **principal/bodega→local propio** y **local→su bodega matriz**. Se rechaza local→local y bodega→principal. `create/dispatch/return/cancel` comprueban la sede de **origen** y `receive` la de **destino**. No está vinculada al ejecutor `execute_transfer` (que sigue siendo solo Administrador y únicamente admite rutas padre→hijo).
- Evalúa identidad activa, sede activa, asignación vigente de empleados y capacidades operativas según los cuatro roles aprobados. Administrador global; demás perfiles acotados a su sede.
- **Condición necesaria, nunca suficiente:** las futuras operaciones siguen necesitando sus controles de ruta, custodia, acta, estado, costos, idempotencia y autorización en el servidor.
- `nexora_staff_role_plans.operationally_enabled` permanece invariablemente `false` por CHECK y trigger hasta una migración futura expresamente revisada.
- Prueba SQL transaccional manual: `supabase/tests/rls/nexora_site_scope_basis.sql`; revisión de permisos positivos/negativos y no exposición del esquema interno. Ninguna simulación sustituye pruebas con sesiones auténticas.
- Política pura de rutas `src/lib/nexora-transfer-route-policy.ts` y pruebas Vitest cubren las cuatro rutas, ciudades distintas, dependencias, sedes inactivas y prohibición local→local. Es diseño preparatorio, **no habilita destinos nuevos en la interfaz ni en el ejecutor SQL existente**.
- La devolución local→bodega se acota conservadoramente a su propia bodega matriz; la página 28 deja pendiente el alcance del trabajador sobre sedes ajenas.
- No ejecutar el SQL nuevo directamente en producción antes de superar la validación aislada y los chequeos de seguridad.

Este documento reporta estado y criterios de aceptación; **no certifica que todo el Plan V4 esté implementado**.

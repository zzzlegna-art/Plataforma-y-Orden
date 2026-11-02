# Nexora Multisede V4 · estado de cierre operativo (02-11-2026)

Plan Maestro de 29 páginas, versión 4, fechado 31-10-2026. Bodega 6A, Barranquilla, es la única sede **principal** y centro de abastecimiento; iPhone America es un **local dependiente**. No crear otras sedes ficticias ni atribuirles unidades automáticamente.

## Evidencia conservada
- 3.153 unidades históricas, 4.193 movimientos, dos perfiles legacy.
- 2.758 IMEI en bodega, 395 vendidos; 2.758 activos sin costo individual validado.
- 0 actas de apertura, 0 certificaciones físicas, 0 custodias, 0 traslados, 0 ventas retail, 0 cajas.
- PR #136 fusionado en main y despliegue Vercel READY.
- Tablas/funciones de inventario por IMEI, hoja de vida, conciliación, transferencias físicas, POS/caja y auditoría creadas, pero su disponibilidad operativa sigue restringida.

## Matriz de cierre pendiente
| Bloque | Estado comprobado | Criterio para considerar cerrado |
| --- | --- | --- |
| Bodega 6A, recepción de proveedores | Jerarquía correcta; acta declarativa preparada | Firma real del Administrador sin simular IMEI escaneados; preservación de 395 vendidos |
| Costos unitarios | 2.758 IMEI en bodega sin costo | Recuperar soporte documental y aprobación administrativa; jamás imputar costos inventados |
| Roles de cuatro perfiles | Vista/planificación y diagnóstico; Encargado/Vendedor inactivos | Migración RLS por sede y pruebas de permisos negativos/positivos |
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

Este documento reporta estado y criterios de aceptación; **no certifica que todo el Plan V4 esté implementado**.

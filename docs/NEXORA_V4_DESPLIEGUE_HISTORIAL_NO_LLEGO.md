# Nexora V4 · instalación segura de recepción parcial de traslados por IMEI

**Estado:** propuesta de PR #152; no instalada en Supabase productivo hasta superar revisión integral. Fecha: 4 de noviembre de 2026.

## Dos procesos que NO se mezclan

**Compras de proveedores:** mercancía nueva entra solamente en Bodega 6A por Administrador o Bodeguero asignado allí. Ya regulado por PR #153 y su política `nexora_supplier_reception_access()`. Esta regla no se modifica con el PR #152.

**Traslados existentes:** Administrador puede enviar y recibir globalmente en sedes activas; Bodeguero envía desde sus sedes activas asignadas y confirma recepción en las que tenga asignadas; Encargado y Vendedor envían desde su local activo asignado y reciben los documentos dirigidos al mismo local. Una sede no puede recibir por otra y un IMEI solo puede enviarse si su custodia física y disponibilidad pertenecen al origen.

Los faltantes marcados individualmente `No llegó` requieren observación de 3–500 caracteres, se registran en tablas de auditoría inmutables, y nunca regresan a stock hasta verificar su retorno físico.

## Migraciones propuestas para después de la versión de roles y facturas

1. `supabase/migrations/20261104190000_nexora_transfer_missing_observations.sql` — tabla y trigger automático de auditoría inmutable por IMEI.
2. `supabase/migrations/20261104191000_nexora_transfer_receive_observations.sql` — notas individuales, validaciones atómicas, RLS de participantes y RPC `nexora_transfer_receive_with_notes`. La función pública para crear/despachar/retornar/cancelar valida explícitamente la sede activa asignada. La ejecución interna directa se revoca para `authenticated` para impedir saltarse las observaciones.

**Importante:** `supabase/migrations/20261104185000_nexora_roles_inventory_transfer_permissions.sql` existe en el repositorio como representación del motor de traslados, pero la instancia productiva tiene su propia migración de rol `20261104131610`. No ejecutar indiscriminadamente todas las migraciones pendientes del repositorio ni sobreescribir la función real sin revisar el historial.

## Preflight sin cambios de datos

- Confirmar respaldos y comprobar versiones reales, políticas y firmas de funciones en producción.
- Confirmar que no hay manifiestos en tránsito, faltantes o retornos abiertos.
- Registrar conteos actuales de `bodega_units`, `nexora_transfers`, `nexora_transfer_lines`, `nexora_unit_custody`, ventas, pedidos, caja y actas; **no hacer transacciones ficticias en producción**.
- Verificar que se usa la RPC interna vigente de noviembre 4, con restricciones de origen/destino. Si el repositorio y producción difieren, reconciliar explícitamente antes de desplegar.

## Pruebas y publicación

- Ejecutar PostgreSQL 16 efímero en GitHub Actions: 20 enviados → 15 recibidos → 5 faltantes → retorno físico verificado, las tres variantes 20→20 y 20→0, rollback y rechazo de acciones no autorizadas por sede.
- Validar RLS con perfiles de Bodeguero de origen, Vendedor/Encargado de destino y usuarios de otros puntos, además de Administrador, con los JWT operativos correspondientes.
- Aplicar ambas migraciones juntas solo en la ventana autorizada y publicar simultáneamente la UI que llama a la nueva RPC. No lanzar la UI nueva sin funciones ni viceversa.
- Ejecutar `supabase/tests/rls/nexora_missing_audit_schema_checks.sql` y `supabase/tests/rls/nexora_atomic_receipt_security_checks.sql` como comprobaciones posteriores sin generar mercancía.
- Confirmar conteos sin cambios inesperados y auditar privilegios con Supabase Security Advisor.

**Rollback:** nunca borrar auditorías legítimas ni devolver artificialmente IMEI al origen. Ante fallo, suspender operación de recepciones y diseñar migración correctiva verificada; no activar el bypass antiguo de recepción sin notas.

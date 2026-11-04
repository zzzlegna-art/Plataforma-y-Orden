# Nexora V4 · instalación segura de recepción parcial de traslados por IMEI

**Estado:** migraciones de datos y seguridad instaladas y verificadas en Supabase el 4 de noviembre de 2026; falta fusionar/publicar la interfaz del PR #152.

## Dos procesos que NO se mezclan

**Compras de proveedores:** mercancía nueva entra solamente en Bodega 6A por Administrador o Bodeguero asignado allí. Ya regulado por PR #153 y su política `nexora_supplier_reception_access()`. Esta regla no se modifica con el PR #152.

**Traslados existentes:** Administrador puede enviar y recibir globalmente en sedes activas; Bodeguero envía desde sus sedes activas asignadas y confirma recepción en las que tenga asignadas; Encargado y Vendedor envían desde su local activo asignado y reciben los documentos dirigidos al mismo local. Una sede no puede recibir por otra y un IMEI solo puede enviarse si su custodia física y disponibilidad pertenecen al origen.

Los faltantes marcados individualmente `No llegó` requieren observación de 3–500 caracteres, se registran en tablas de auditoría inmutables, y nunca regresan a stock hasta verificar su retorno físico.

## Migraciones aplicadas después de la versión de roles y facturas

1. `supabase/migrations/20261104182506_nexora_transfer_missing_observations.sql` — tabla y trigger automático de auditoría inmutable por IMEI.
2. `supabase/migrations/20261104182517_nexora_transfer_receive_observations.sql` — notas individuales, validaciones atómicas, RLS de participantes y RPC `nexora_transfer_receive_with_notes`. La función pública para crear/despachar/retornar/cancelar valida explícitamente la sede activa asignada. La ejecución interna directa se revoca para `authenticated` para impedir saltarse las observaciones.

**Importante:** las pruebas extraen el motor vigente de `supabase/migrations/20261104144040_nexora_v4_invoice_role_authorization.sql`, que coincide con `pg_get_functiondef` en Supabase productivo (salvo el punto y coma de SQL). El repositorio conserva `20261104185000_nexora_roles_inventory_transfer_permissions.sql`, cuyo contenido corresponde a la migración productiva histórica `20261104131610`; hay un desajuste de nombres/versiones pendiente de reconciliar. No ejecutar `supabase db push` indiscriminadamente ni reejecutar migraciones ya presentes; aplicar solo las dos nuevas, de forma explícita y controlada.

## Preflight sin cambios de datos

- Confirmar respaldos y comprobar versiones reales, políticas y firmas de funciones en producción.
- Confirmar que no hay manifiestos en tránsito, faltantes o retornos abiertos.
- Registrar conteos actuales de `bodega_units`, `nexora_transfers`, `nexora_transfer_lines`, `nexora_unit_custody`, ventas, pedidos, caja y actas; **no hacer transacciones ficticias en producción**.
- Verificar que se usa la RPC interna vigente de noviembre 4, con restricciones de origen/destino. Si el repositorio y producción difieren, reconciliar explícitamente antes de desplegar.

## Pruebas y publicación

- Ejecutar PostgreSQL 16 efímero en GitHub Actions: 20 enviados → 15 recibidos → 5 faltantes → retorno físico verificado, las tres variantes 20→20 y 20→0, rollback y rechazo de acciones no autorizadas por sede.
- Validar RLS con perfiles de Bodeguero de origen, Vendedor/Encargado de destino y usuarios de otros puntos, además de Administrador, con los JWT operativos correspondientes.
- **Migraciones ya aplicadas.** Fusionar y publicar la UI que llama a la nueva RPC; no intentar reejecutar las migraciones.
- Ejecutar `supabase/tests/rls/nexora_missing_audit_schema_checks.sql` y `supabase/tests/rls/nexora_atomic_receipt_security_checks.sql` como comprobaciones posteriores sin generar mercancía.
- Confirmar conteos sin cambios inesperados y auditar privilegios con Supabase Security Advisor.

**Rollback:** nunca borrar auditorías legítimas ni devolver artificialmente IMEI al origen. Ante fallo, suspender operación de recepciones y diseñar migración correctiva verificada; no activar el bypass antiguo de recepción sin notas.

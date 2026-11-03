# Nexora Multisede V4 · despliegue seguro de auditoría «No llegó»

**Estado:** procedimiento operativo, **no autorización para ejecutar en producción**.  
**Origen:** Plan Maestro Nexora Multisede 2.0 V4.0 (31-10-2026), recepción parcial 20→15→5.  
**PR:** #144 (`supabase/migrations/20261103090000_nexora_transfer_missing_observations.sql`).  
**Interfaz de lectura:** PR #145, fusionado en `main`; informa «pendiente de desplegar» hasta que exista una auditoría auténtica.

## ¿Qué cambia y qué NO cambia?

La migración añade una tabla de solo lectura para los clientes, una política RLS de Administrador y un trigger privado que registra automáticamente «No llegó» por IMEI al pasar de `in_transit` a `return_pending`. Guarda identificador de línea, unidad, serial, usuario real de la sesión y fecha, en la misma transacción de la RPC.

Además instala dos triggers de **inmutabilidad** que rechazan `UPDATE`, `DELETE` y `TRUNCATE` de observaciones, incluso si un proceso con privilegios de dueño de tabla intenta ejecutarlos mediante DML normal. Las correcciones excepcionales requieren una migración expresamente revisada; no se elimina evidencia para cuadrar inventario.

- **No** crea IMEI, ventas, caja, aprobaciones físicas, nuevas rutas ni transferencias de mercancía.
- **No** abre permisos de Bodeguero, Encargado o Vendedor; el motor actual continúa exigiendo Administrador.
- **No** devuelve IMEI faltantes a stock ni modifica `bodega_units`; solamente un retorno físico verificado actualiza su custodia.
- **No** reescribe los eventos históricos previos ni atribuye «No llegó» retroactivamente. Si existieran movimientos anteriores a la migración, hay que conciliarlos expresamente antes de desplegar.

## Bloqueo para el ensayo en Supabase

No existe aún una rama Supabase de desarrollo en este proyecto. Crear una tiene consumo facturable y **requiere consentimiento expreso del usuario tras presentar el costo**. No reutilizar la base productiva para simular despachos ni generar un «acta de prueba». Las pruebas actualmente disponibles funcionan en PostgreSQL 16 efímero, con 20 IMEI ficticios y `ROLLBACK`.

**Condiciones para retirar el bloqueo de la migración:**
1. Aprobación explícita del costo de una rama Supabase (o disponibilidad de un proyecto aislado ya existente).
2. Aplicación de la migración versionada **solo** en esa instancia aislada, sin datos reales.
3. Ejecución de `supabase/tests/rls/nexora_missing_audit_schema_checks.sql`; confirmar RLS, privilegios, trigger, identidad de línea e índice único.
4. Confirmar que el RPC real permanece sin cambios y que `authenticated` no tiene `INSERT/UPDATE/DELETE` al historial.
5. Verificar con roles/JWT de prueba: Admin puede consultar; Bodeguero no puede ver el historial global ni saltarse el Admin-only de `execute_transfer`.
6. Probar la interfaz del PR #145: auditado únicamente cuando hay cinco observaciones válidas; «pendiente» cuando falta la tabla; «incompleto» cuando faltan registros o no coinciden con el manifiesto.
7. Revisión de seguridad, plan de restauración/backup y autorización independiente de la aplicación productiva.

## Comprobación de solo lectura en producción ANTES del cambio

```sql
select
 (select count(*) from public.bodega_units) as units,
 (select count(*) from public.bodega_movements) as movements,
 (select count(*) from public.nexora_initial_inventory_approvals) as signed_acts,
 (select count(*) from public.nexora_transfers) as transfers,
 (select count(*) from public.nexora_transfer_lines) as transfer_lines,
 (select count(*) from public.nexora_transfer_return_documents) as return_documents,
 (select count(*) from public.nexora_staff_role_plans
    where operationally_enabled) as enabled_roles,
 (select count(*) from public.nexora_retail_sales) as new_sales,
 (select count(*) from information_schema.tables
    where table_schema='public'
      and table_name='nexora_transfer_missing_observations') as audit_table;
```

**Última evidencia verificada (03-11-2026):** 3.153 unidades históricas, 4.193 movimientos; 0 actas firmadas, 0 traslados, 0 líneas, 0 documentos de retorno, 0 roles comerciales activados y tabla auditada todavía inexistente. **Volver a consultar los valores justo antes de cualquier cambio**. No comparar contra cifras de este documento como si fueran un estado inmutable.

## Comprobaciones DESPUÉS de la aplicación autorizada

Ejecutar el archivo `supabase/tests/rls/nexora_missing_audit_schema_checks.sql` con conexión administrativa de solo lectura. Verificar además:

```sql
select count(*) as historical_units from public.bodega_units;
select count(*) as historical_movements from public.bodega_movements;
select count(*) as missing_imei_observations
  from public.nexora_transfer_missing_observations;
select count(*) as physical_transfers from public.nexora_transfers;
```

Sin traslados nuevos, la tabla debería tener **0** incidentes: **no insertar cinco filas simuladas en producción**. Comparar conteos de unidades, movimientos, actas, cajas, ventas, transferencias y roles con la captura inmediatamente anterior; las diferencias no explicadas bloquean el cierre.

Ejecutar los asesores de seguridad de Supabase. Mantener el acceso administrativo y la revocación de escritura para clientes. La prueba manual de acceso con sesiones reales está pendiente hasta disponer de un entorno aislado.

## Rollback y fallos

- El SQL de la migración añade tabla y trigger: **no ejecutar `DROP TABLE` ni eliminar historial ya registrado** como solución automática.
- Si una transacción real de recepción falla tras instalar el trigger, Postgres debe revertir conjuntamente las líneas y observaciones. Inspeccionar los registros del error; no desactivar la auditoría para forzar la venta o el traslado.
- Si la UI muestra «historial incompleto», **no certificar los IMEI** ni editar directamente la tabla auditada. Revisar líneas y `nexora_transfer_events` bajo acceso autorizado.
- Una reversión requerirá copia de seguridad o una migración correctiva explícitamente revisada; preservar los incidentes creados legalmente.

## Tareas posteriores

La apertura comercial sigue bloqueada por el acta administrativa real de Bodega 6A, los costos individuales verificados, el modelo RLS por sede y las pruebas de caja/POS. El inventario físico de 2.758 IMEI ya fue verificado por el usuario: **no solicitar nuevo escaneo masivo, no inventar actas, costos ni firmas**. Este cambio de auditoría no sustituye los trabajos del PR #141 (permisos y rutas multisede).

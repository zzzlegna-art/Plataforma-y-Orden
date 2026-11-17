# NEXORA — Auditoría de reconciliación de migraciones

Fecha de auditoría: 2026-11-17

## Alcance y seguridad

Auditoría de solo lectura sobre el historial remoto del proyecto Supabase `ivholkjldntrmagcmogh` y los archivos de `supabase/migrations` de la rama `main`.

No se ejecutaron migraciones, no se usó `db push` ni `migration repair`, no se modificaron datos ni objetos de producción y no se crearon recursos adicionales.

## Inventario verificado

- Historial remoto: **105** versiones aplicadas, sin versiones duplicadas.
- Archivos SQL en `main`: **89**.
- Coincidencia exacta de versión y nombre: **30**.
- Mismo nombre lógico, pero versión/timestamp distinto: **34**.
- Migraciones aplicadas sin archivo con el mismo nombre lógico en el repositorio: **41**.
- Archivos del repositorio cuya versión no aparece en el historial remoto: **59**.

Las categorías son mutuamente excluyentes en esta comparación: 30 + 34 = 64 archivos con nombre lógico coincidente; 25 archivos restantes no coinciden por nombre y versión. Del lado remoto: 30 + 34 + 41 = 105.

## Migraciones aplicadas confirmadas

Estas dos versiones aparecen en el historial remoto como aplicadas:

- `20261114004055 — add_original_device_email_to_units`
- `20261114004206 — preserve_previous_unit_serials`

Su ausencia de archivo coincidente en `main` no significa que deban ejecutarse otra vez. El esquema vivo ya mostró las columnas `bodega_units.device_email` y `bodega_units.previous_serials`.

## Hallazgo de configuración

El archivo `supabase/config.toml` en `main` y en la rama de Fase 1 declara el proyecto histórico `kiizldurgjtorxpzebpm`, mientras que la auditoría de producción se conectó al proyecto activo `ivholkjldntrmagcmogh`.

El identificador histórico también aparece como `source_ref` en consultas del archivo histórico. No debe confundirse esa referencia de datos con el destino de despliegue de Supabase CLI.

## Por qué no se deben renombrar ni reparar automáticamente

La tabla de historial remoto conserva versión y nombre, pero no el contenido SQL original ni su hash. Por ello, no es posible demostrar que un archivo actual con el mismo nombre lógico sea el SQL que se aplicó originalmente.

Renombrar los 34 archivos para hacer coincidir timestamps, crear archivos vacíos para las 41 versiones ausentes o marcar versiones con `migration repair` ocultaría la discrepancia sin reconstruir la historia real. También podría causar que futuros despliegues omitan cambios necesarios o intenten repetir cambios ya aplicados.

## Plan de reconciliación seguro

1. Recuperar el SQL original desde commits, ramas, artefactos o respaldos verificables.
2. Comparar cada archivo recuperado con el esquema vivo y con las definiciones actuales de funciones, triggers, políticas, índices y constraints.
3. Para migraciones consolidadas o renombradas, conservar un manifiesto explícito que relacione versión aplicada, archivo fuente recuperado y evidencia de equivalencia.
4. Para SQL irrecuperable, no inventar contenido: documentar la versión como legado no reconstruido y establecer una línea base verificable para futuras migraciones, con revisión manual.
5. Solo después de completar la matriz de equivalencias, validar el flujo de Supabase CLI en un entorno local/gratuito y revisar el diff esperado. No aplicar cambios a producción como parte de esta auditoría.

## Bloqueo vigente

La reconciliación **no está completa** porque el historial remoto no contiene el SQL original y no se encontró evidencia suficiente para reconstruir todas las 41 migraciones sin archivo coincidente. Las dos migraciones de noviembre 14 están aplicadas, pero el inventario global requiere recuperación histórica.

La migración de seguridad de Fase 1 debe permanecer fuera de producción hasta cerrar este bloqueo y verificar la rama de destino.


## Detalle de las 41 versiones aplicadas sin archivo de igual nombre lógico

```text
20261014162822 bodega6a_initial_schema
20261014163251 add_inventory_foundation_v32
20261014163350 inventory_movements_v33
20261014165703 serial_management_v35_complete
20261014165953 serial_management_v36
20261014170534 serial_movements_v37_complete
20261014171041 serial_reservations_v38
20261014171356 orders_v39
20261014171557 dispatch_v40
20261014174219 customers_v41
20261014174434 warranties_v42
20261014175109 roles_v43
20261014182954 notifications_v47
20261016031830 secure_unused_initial_tables_with_rls
20261016031958 install_nexora_application_schema_from_repository
20261016032049 nexora_03_3_codigos_y_concurrencia
20261016032054 nexora_install_04
20261016032058 nexora_install_05
20261016032155 nexora_install_06_documentos_garantias
20261016032158 nexora_install_07_uso_almacenamiento
20261016032200 nexora_install_08_recepcion_serial_unico
20261016032203 nexora_install_09_orden_seriales_pedido
20261016032206 nexora_install_10_tipos_producto
20261016032208 nexora_install_11_llaves_unidades
20261016032211 nexora_install_12_garantia_unidad_reemplazo
20261016040538 nexora_security_integrity_hardening
20261017101120 nexora_unique_serial_lifetime
20261017135249 nexora_atomic_optimistic_guard
20261017135456 nexora_check_deletions_and_catalog_updates
20261017135936 nexora_normalize_snapshot_column_types
20261017140514 nexora_guard_settings_and_new_ids
20261025175458 archive_and_clear_nexora_trial_transactions_20261025
20261102064146 nexora_multisede_traslados_seguros
20261102092813 nexora_pos_sale_atomic_and_theme
20261102235820 nexora_money_transfers_admin
20261104014435 nexora_v49_cash_limits_by_site
20261104014511 nexora_v496_protected_worker_provisioning
20261105171923 nexora_historical_orders_private_archive_20261105
20261105220713 selective_history_private_units_audit_control
20261114004055 add_original_device_email_to_units
20261114004206 preserve_previous_unit_serials
```

## Detalle de los 34 archivos cuyo nombre lógico coincide pero el timestamp difiere

Formato: archivo actual en GitHub → versión registrada en Supabase.

```text
20261023072000_nexora_guardar_por_campo.sql -> 20261023072404
20261023213000_nexora_unique_product_sku.sql -> 20261023203054
20261027160000_nexora_proveedores.sql -> 20261027210429
20261027161000_nexora_recepcion_proveedor.sql -> 20261027210704
20261102060000_nexora_multisede_sedes.sql -> 20261102050111
20261102070000_nexora_staff_sites.sql -> 20261102052314
20261102080000_nexora_conciliacion_fisica_imei.sql -> 20261102054330
20261102090000_nexora_initial_inventory_approval.sql -> 20261102060945
20261102110000_nexora_site_availability_and_order_guards.sql -> 20261102074609
20261102120000_nexora_roles_pos_preflight.sql -> 20261102083640
20261102133000_nexora_cash_and_retail_foundation.sql -> 20261102090351
20261102173000_nexora_launch_readiness_role_boundary.sql -> 20261102095714
20261102183000_nexora_staff_access_audit.sql -> 20261102104028
20261102190000_nexora_inventory_imei_directory.sql -> 20261102101950
20261102201000_nexora_inventory_reference_summary.sql -> 20261102113023
20261102212000_nexora_unit_multisite_timeline.sql -> 20261102171102
20261102225000_nexora_retail_site_financial_report.sql -> 20261102183011
20261102235000_nexora_cash_closure_audit.sql -> 20261102190946
20261103001000_nexora_cash_event_ledger.sql -> 20261102194921
20261103010000_nexora_initial_inventory_worklist.sql -> 20261102205511
20261103020000_nexora_register_physical_scan_batch.sql -> 20261102211331
20261103030000_nexora_cost_evidence_by_reception.sql -> 20261102212530
20261103040000_nexora_warehouse_6a_admin_declaration.sql -> 20261102224157
20261103060000_nexora_bodega_6a_central_hub.sql -> 20261102231122
20261103181000_nexora_v49_local_initial_approval.sql -> 20261104014442
20261103200000_nexora_v497_worker_activation.sql -> 20261104014518
20261104064500_nexora_bodega6a_owner_historical_origin.sql -> 20261104113730
20261104165000_nexora_worker_activation_no_local_approval.sql -> 20261104121416
20261104185000_nexora_roles_inventory_transfer_permissions.sql -> 20261104131610
20261104193000_nexora_invoice_assisted_capture.sql -> 20261104132049
20261104203500_nexora_invoice_received_quantity_guard.sql -> 20261104132900
20261104211000_nexora_invoice_edit_history.sql -> 20261104133849
20261106033000_nexora_unified_orders_all_categories.sql -> 20261106023021
20261106160000_nexora_dashboard_order_rankings.sql -> 20261106211319
```

**Interpretación:** el timestamp de un archivo no se puede reemplazar por el timestamp remoto solo porque el nombre coincida. Primero se debe recuperar el SQL exacto que corresponde a la versión aplicada y verificar equivalencia. Las 59 versiones de archivos que no están registradas incluyen tanto estas 34 discrepancias como 25 archivos adicionales sin versión remota correspondiente.


## Verificación complementaria de objetos vivos y Fase 1 (2026-11-17)

Consulta de solo lectura al proyecto activo `ivholkjldntrmagcmogh`:

- `bodega_technicians` conserva la política `bodega_technicians_all` para `authenticated`, con lectura y escritura para cualquier usuario que cumpla `bodega_is_staff()`. La migración de Fase 1 la reemplaza por lectura para staff y operaciones de escritura solo para admin.
- `bodega_movements` conserva una política INSERT cuyo `WITH CHECK` es `bodega_is_staff()`; todavía no exige que `created_by = auth.uid()`. La migración de Fase 1 incorpora esa condición.
- No existen todavía en producción los triggers nuevos `nexora_guard_unit_sensitive_changes`, `nexora_guard_order_row`, `nexora_guard_order_item_row`, `nexora_guard_order_assignment_row` ni `nexora_guard_warranty_refund_payment`. Esto confirma que las defensas nuevas de Fase 1 aún no están aplicadas.
- Las funciones históricas `nexora_dashboard_order_rankings`, `nexora_historical_order_detail`, `nexora_historical_orders_list` y `nexora_historical_serial_trace` ya existen como `SECURITY DEFINER`; su ejecución está denegada a `anon` y permitida a `authenticated`. Sus cuerpos actuales verifican usuario activo con rol `admin` o `bodeguero`. La migración propuesta sustituye las dos primeras y refuerza la comprobación mediante `bodega_is_staff()`. Esta diferencia debe revisarse junto con los planes de rol para confirmar que no cambia indebidamente el conjunto de usuarios autorizados.
- Los cambios anteriores son diferencias de seguridad observadas, no evidencia de que el SQL de las 41 migraciones históricas ausentes se haya recuperado. No sustituyen la matriz histórica de equivalencias.

## Estado CI del commit de auditoría

En el HEAD `aa0d65fb38f16fb446126d8f95e349fab7341a0c`, GitHub Actions reportó:

- `Nexora Phase 1 - server-side security SQL`: **success**.
- `Validate platform`: **failure**.
- `Nexora - quality checks`: **failure**.

Los dos fallos generales ocurren en el paso `pnpm audit --prod`, antes de ejecutar pruebas unitarias, ESLint, TypeScript o build. El log identifica dos vulnerabilidades HIGH de `picomatch` (advisory `GHSA-fc5q-39xc-vjpf`), arrastradas por rutas de dependencias que incluyen `tailwindcss-animate -> tailwindcss -> chokidar/fast-glob`. Por tanto, esos checks no permiten concluir todavía si los pasos omitidos pasan o fallan. No se cambió el lockfile ni se eludió el control de auditoría.

## Recuperación histórica: resultado adicional

Se consultaron ramas y búsquedas de commits/archivos en GitHub, incluyendo los nombres de las dos migraciones del 14 de noviembre. No se encontró el contenido SQL original en las ramas revisadas ni coincidencias recuperables por nombre. Las consultas de Supabase tampoco conservan el SQL aplicado: solo el identificador de versión y nombre en el historial. La equivalencia histórica sigue sin poder demostrarse.

## Decisión de seguridad

La PR de Fase 1 debe permanecer abierta y sin merge mientras no se resuelva la reconciliación histórica y se completen los checks generales. No se ejecutó `migration repair`, `db push`, migración, despliegue ni cambio de datos. No se crearon recursos ni se incurrió en costos adicionales.


## Ajuste de dependencias de build (2026-11-17)

La inspección del árbol confirmó que `tailwindcss-animate` solo se importa desde `tailwind.config.ts` y se usa durante la compilación de CSS; no es una dependencia de ejecución de la aplicación. Se movió de `dependencies` a `devDependencies` y se actualizó el importador raíz de `pnpm-lock.yaml` en la misma rama. No se cambió la versión del paquete ni se ocultó la auditoría.

La alerta `GHSA-fc5q-39xc-vjpf` sigue sin una versión corregida publicada en el aviso consultado; GitHub describe como afectadas las versiones de picomatch hasta 4.0.7 y no informa una versión parcheada. El lockfile contiene picomatch 2.3.2 y 4.0.7 en rutas de herramientas de build. Clasificar el plugin como dependencia de desarrollo evita incluir una herramienta de compilación en el conjunto de dependencias de producción, pero **no elimina la vulnerabilidad del árbol de desarrollo**. No se afirma que la auditoría esté limpia: el commit nuevo no tiene una ejecución CI asociada disponible para verificar el resultado. La alerta debe mantenerse visible hasta que el proveedor publique una versión corregida y se actualice el árbol de dependencias.

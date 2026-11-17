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

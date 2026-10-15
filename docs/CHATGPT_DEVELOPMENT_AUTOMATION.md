# Bodega-6A — desarrollo asistido desde ChatGPT

## Flujo de trabajo
1. El propietario describe la función o corrección en el chat.
2. ChatGPT inspecciona el repositorio usando su conexión autorizada de GitHub y define archivos y pruebas afectados.
3. Los cambios se realizan **solo en una rama `feature/*` o `fix/*`**, mediante commits trazables.
4. Se crea un **pull request en borrador** dirigido a `main`; no se fusiona automáticamente.
5. GitHub Actions ejecuta las pruebas del producto y del agente. Si fallan, se inspeccionan los logs y se corrige en la misma rama.
6. Cuando las pruebas pasan, el propietario revisa la propuesta y autoriza explícitamente cualquier fusión, despliegue o cambio de datos de producción.

## Límites obligatorios
- No escribir directamente en `main`, no activar auto-merge y no desplegar a producción desde solicitudes en el chat.
- No copiar claves, variables secretas, datos de clientes ni inventario de producción al código, los logs, los PR o los embeddings.
- No ejecutar SQL destructivo ni cambios de esquema en la base de datos productiva como parte del flujo de desarrollo.
- Los archivos de `src/`, `docs/` y `supabase/functions/` son candidatos a inspección, **no** autorización indiscriminada para indexar datos sensibles.
- Cada cambio debe contar con pruebas pertinentes, revisión del diff y validación de seguridad.
- No dar por aprobado un commit hasta consultar el estado real de GitHub Actions para ese SHA.

## Estado de integración
- La conexión de ChatGPT a GitHub permite leer y editar el repositorio durante una conversación autorizada.
- El agente Edge de inspección del PR #44 sigue siendo un prototipo de **solo lectura**, sin despliegue.
- `index-preparation.ts` genera fragmentos locales; **no crea embeddings ni persiste datos**.
- Para ejecución desatendida mediante GitHub App se requieren instalación, permisos mínimos, credenciales almacenadas como secretos y un ejecutor seguro. El App ID por sí solo no autentica.
- La escritura en Supabase debe implementarse y probarse separadamente con cuentas de servicio de alcance mínimo, deduplicación por SHA y control explícito de archivos permitidos.

## Criterio de aceptación de una nueva función
- Comportamiento solicitado y pruebas reproducibles.
- PR en borrador con descripción del impacto y pasos de reversión.
- Checks obligatorios exitosos en el último commit.
- Confirmación humana antes de acciones irreversibles o productivas.

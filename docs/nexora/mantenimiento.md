# Mantenimiento de Nexora

## Proceso de cambios

1. Analizar el requerimiento.
2. Revisar arquitectura y reglas de negocio.
3. Identificar dependencias y datos afectados.
4. Implementar en una rama de trabajo.
5. Agregar o actualizar pruebas.
6. Ejecutar lint, TypeScript, tests y build.
7. Revisar el diff y los riesgos.
8. Integrar y publicar solo después de la aprobación.

## Corrección de errores

- Reproducir el problema.
- Identificar la causa raíz.
- Revisar los componentes y servicios relacionados.
- Añadir una prueba de regresión.
- Aplicar una corrección acotada.
- Verificar los flujos adyacentes.

## Cambios de base de datos

- Crear migraciones versionadas.
- Preservar datos existentes.
- Revisar RLS, relaciones, triggers y funciones.
- Preparar pasos de reversión.
- Probar antes de producción.

## Reglas de operación

No duplicar lógica de negocio, no eliminar validaciones existentes y no ejecutar cambios destructivos sobre datos reales sin autorización explícita.

# Nexora — flujo de automatización asistida por IA

## Flujo

Instrucción del propietario → orquestación de tareas → análisis del repositorio → propuesta de cambios en GitHub → pull request → validaciones → revisión humana → despliegue autorizado.

## Seguridad

- Los secretos permanecen en las funciones remotas y variables de entorno protegidas.
- No se escriben claves privadas, datos de clientes ni datos de inventario en el repositorio.
- No se modifica directamente la rama principal ni se ejecutan migraciones destructivas desde el flujo de chat.
- Todo cambio debe tener alcance, pruebas y estrategia de reversión.

## Estado de integración

- La persistencia de tareas de automatización está implementada.
- Existen componentes de análisis de repositorio y planificación, pero la integración completa de ejecución y despliegue depende de conexiones autorizadas.
- La ejecución de despliegues permanece pendiente de validar permisos del proveedor.
- Los cambios generados deben revisarse y aprobarse antes de integrarse en producción.

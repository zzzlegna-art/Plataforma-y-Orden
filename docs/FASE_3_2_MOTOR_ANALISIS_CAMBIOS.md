# Fase 3.2 — Motor de análisis de cambios

## Objetivo
Crear una capa previa a la ejecución de cambios para analizar solicitudes antes de modificar código o base de datos.

## Flujo

Solicitud de cambio
→ Clasificación del cambio
→ Archivos afectados
→ Impacto de base de datos
→ Impacto de seguridad RLS
→ Pruebas requeridas
→ Plan de implementación

## Reglas

- Ningún cambio se aplica directamente sin validación.
- Las migraciones deben identificarse antes de ejecutarse.
- Los cambios con impacto en permisos deben pasar por RLS Security Gate.
- La salida del analizador debe servir como entrada para una futura automatización de Pull Requests.

## Próxima etapa
Implementar la ejecución controlada del análisis dentro de GitHub Actions.

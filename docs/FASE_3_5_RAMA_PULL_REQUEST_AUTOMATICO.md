# Fase 3.5 — Creación automática de ramas y Pull Requests

## Objetivo

Preparar el flujo controlado para que una solicitud de cambio pueda convertirse en una propuesta de modificación mediante rama de trabajo y Pull Request.

## Flujo objetivo

Solicitud de cambio
→ análisis de impacto
→ plan de implementación
→ rama de trabajo
→ cambios preparados
→ validaciones CI/CD
→ Pull Request
→ revisión
→ integración

## Reglas de seguridad

- No modificar producción directamente.
- Todo cambio debe pasar validaciones existentes.
- RLS Security Gate continúa siendo obligatorio.
- Los cambios sensibles requieren revisión.

## Próxima integración

Conectar la generación de ramas y Pull Requests con el flujo de automatización operativo.

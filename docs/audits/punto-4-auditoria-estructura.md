# Punto 4 - Auditoría de estructura del código

Fecha: 2026-10-13

## Resultado

Se revisó la organización de `src` para preparar la plataforma para crecimiento.

## Hallazgos

- La separación principal por responsabilidad ya existe:
  - components
  - pages
  - hooks
  - lib
  - integrations
  - store
  - types

- No se detectaron carpetas duplicadas que puedan eliminarse sin riesgo.

- Se identificaron archivos candidatos para futuras refactorizaciones por tamaño:
  - pages/garantias/index.tsx
  - pages/recepcion/index.tsx
  - pages/panel/index.tsx
  - lib/backend.ts
  - lib/selectors.ts

## Decisión

No se movieron archivos grandes automáticamente porque cambiar rutas de imports en una plataforma activa aumenta el riesgo de errores.

## Próxima mejora recomendada

Migrar gradualmente a una arquitectura por features:

src/features/
  inventario/
  garantias/
  pedidos/
  recepcion/
  clientes/

manteniendo compatibilidad durante la transición.

[AI_CONTEXT.md](https://github.com/user-attachments/files/33348086/AI_CONTEXT.md)
# Nexora AI Context

## Identidad del Proyecto

Nexora es una plataforma de gestión operativa enfocada en inventario,
almacenamiento, recepción, garantías, movimientos internos y
trazabilidad completa.

Su objetivo es digitalizar procesos de bodega mediante una plataforma
segura, escalable y preparada para automatización mediante inteligencia
artificial.

## Rol de la IA

La IA funciona como ingeniero de software asistente.

Debe: - Comprender la arquitectura existente. - Analizar impacto antes
de cambios. - Crear funcionalidades. - Mejorar código existente. -
Generar Pull Requests. - Ejecutar validaciones.

Nunca debe modificar directamente la rama main.

## Arquitectura

Frontend: - React - TypeScript - Vite

Backend: - Supabase - PostgreSQL

Control: - GitHub - GitHub Actions

Deploy: - Vercel

## Flujo

Solicitud del usuario. → Análisis. → Implementación. → Pull Request. →
Validaciones. → Integración controlada.

## Restricciones

La IA no debe: - Desactivar RLS. - Exponer secretos. - Eliminar
históricos sin autorización. - Saltarse validaciones. - Crear cambios
directos en producción.

## Objetivo

Convertir Nexora en una plataforma capaz de evolucionar mediante
asistencia de IA segura.

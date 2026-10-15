# Fase 3.3 — Análisis inteligente de impacto de cambios

## Objetivo

Agregar una capa previa al pipeline para clasificar cambios y determinar qué validaciones deben ejecutarse.

## Flujo

Solicitud de cambio
↓
Detección de archivos modificados
↓
Clasificación de impacto
↓
Validaciones requeridas
↓
Pipeline existente

## Clasificación inicial

### Base de datos
Detecta cambios en:
- supabase/migrations
- funciones SQL
- políticas RLS

Impacto: ALTO

### Seguridad
Detecta cambios relacionados con:
- RLS
- auth
- roles
- permisos

Impacto: CRÍTICO

### Aplicación
Detecta cambios en:
- frontend
- lógica de negocio
- componentes

Impacto: MEDIO

## Reglas

- Cambios de seguridad requieren validación RLS.
- Cambios de base de datos requieren validación Supabase.
- Cambios críticos deben bloquearse si fallan pruebas.

## Estado

Preparado para integración progresiva en GitHub Actions.
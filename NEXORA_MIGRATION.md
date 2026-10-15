# Nexora v5.0 — Fase 1: migración visual segura

## Origen
Copia del código fuente Bodega 6A proporcionado por el propietario.

## Cambios aplicados
- Marca NEXORA y subtítulo SMART OPERATIONS en la navegación.
- Paleta Emerald Tech en variables de Tailwind/HSL, tema claro y oscuro.
- Barra lateral con degradado verde oscuro, iconografía Lucide y estados activos.
- Título y metadatos básicos del HTML.
- Nombre y versión del paquete.

## Sin modificar
- Migraciones SQL, políticas RLS y esquema Supabase.
- Backend, lógica de pedidos, garantías, seriales y recepción.
- Flujos de autenticación, rutas y permisos.
- PWA e iconos instalables heredados (pendiente de rebranding).
- Datos y configuración remota: no se ejecutaron operaciones contra Supabase, GitHub ni Vercel.

## Prueba
1. Instala Node.js y pnpm en un entorno de desarrollo.
2. Copia `.env.example` a `.env` y configura únicamente las variables públicas necesarias, sin credenciales privilegiadas.
3. Ejecuta `pnpm install --frozen-lockfile` y `pnpm build`.
4. Revisa login, permisos, inventario, seriales, pedidos y garantías en un entorno de pruebas.
5. No despliegues en producción hasta completar pruebas y auditoría de configuración.

## Pendiente
- Revisión funcional en navegador y pruebas automatizadas (dependencias no instaladas en este entorno).
- Adaptar pantalla por pantalla a las referencias visuales.
- Sustituir assets PWA y etiquetas heredadas con una estrategia de compatibilidad.
- Validar proyecto Supabase existente en modo lectura antes de cualquier migración.

# Arquitectura de Nexora

## Descripción general

Nexora es una plataforma de operaciones para inventario, recepción, despacho, pedidos, garantías y trazabilidad de unidades físicas.

## Tecnologías

- Frontend: React, TypeScript y Vite.
- Interfaz: Tailwind CSS, shadcn/ui y componentes reutilizables.
- Backend: Supabase y PostgreSQL.
- Autenticación y autorización: Supabase Auth y Row Level Security.
- Validación: ESLint, TypeScript, Vitest y GitHub Actions.
- Despliegue: Vercel, pendiente de validar el ámbito de acceso y las variables de producción.

## Capas

- Páginas y componentes: presentación e interacción.
- Hooks y store: estado compartido y coordinación de acciones.
- Lógica de dominio: validaciones y reglas de negocio.
- Backend: lectura y guardado de datos, persistencia atómica y sincronización en tiempo real.
- Base de datos: integridad referencial, permisos, auditoría y trazabilidad.

## Regla principal

Las operaciones críticas deben conservar la integridad de los datos: si falla un paso, no debe quedar guardado un estado parcial. Los cambios de esquema requieren migración, revisión de seguridad y plan de reversión.

## Aislamiento

La marca de la interfaz usa Nexora. La migración de identificadores internos heredados del backend debe realizarse de forma coordinada y validarse contra la instancia remota correcta.

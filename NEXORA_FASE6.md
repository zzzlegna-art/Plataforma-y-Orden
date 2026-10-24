# Nexora v5.0 — Fase 6: despliegue y auditoría final

> **Actualización vigente — 2026-10-24.** El diagnóstico inicial que aparece en el histórico de esta fase quedó superado por la auditoría del proyecto conectado. Para el detalle y los pendientes, consulta `docs/NEXORA_AUDITORIA_FINAL.md`.

## Estado vigente

- Supabase `ivholkjldntrmagcmogh`: `ACTIVE_HEALTHY`, PostgreSQL 17.11.
- RLS: 51/51 tablas públicas habilitadas; las 21 tablas operativas `bodega_*` tienen políticas. Las 30 tablas heredadas sin políticas permanecen cerradas por denegación predeterminada.
- La migración `nexora_least_privilege_defaults` fue aplicada y los privilegios se verificaron con el script SQL de auditoría.
- La suite automatizada tiene 547 pruebas aprobadas; TypeScript/ESLint y el verificador de estructura de despliegue pasan. La compilación de producción también pasó.
- `pnpm audit --prod` reporta 0 vulnerabilidades después de actualizar jsPDF, React Router y las dependencias transitorias; ambos workflows de CI ejecutan esta auditoría.
- La aplicación conserva los controles de autenticación, roles, integridad de seriales, historial de pedidos/garantías y Storage privado para documentos de garantía.

## Pendientes explícitos

- La protección de contraseñas filtradas requiere cambiar la organización de Free a Pro o superior; se necesita autorización del propietario para incurrir en el costo.
- Ejecutar `scripts/backup-supabase.sh` desde una estación segura, cifrar la copia y probar restauración; Storage y Auth necesitan un plan de respaldo separado.
- Ejecutar pruebas de aislamiento con sesiones reales de administrador y bodeguero.
- La conexión actual no puede modificar defaults del rol administrado `supabase_admin`; los 51 objetos públicos y las 18 funciones de la aplicación están bajo el propietario `postgres`, cuyos defaults sí se endurecieron.
- La compilación mantiene una advertencia de Vite por el tamaño del chunk principal; no bloquea la compilación.

## Histórico de preparación inicial (superado)

Las notas anteriores de esta fase describían un estado previo de preparación en el que no se habían validado las pruebas ni el despliegue y se señalaban tablas sin RLS. No representan el estado verificado el 24 de octubre de 2026. No se deben usar para inferir el estado actual del proyecto.

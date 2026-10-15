# Nexora — despliegue independiente

Este paquete no contiene credenciales ni conexión activa a Supabase.

## Aislamiento obligatorio
- Crear repositorio NUEVO `nexora` (no usar Bodega-6A).
- Crear proyecto NUEVO `nexora` en la cuenta personal correcta de Vercel.
- No vincular ni modificar el proyecto `bodega-6-a`.
- No reutilizar la base de datos de una empresa sin verificar propiedad, separación de datos y políticas RLS.
- Configurar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` solo después de revisar RLS y permisos. Nunca usar `service_role` en el frontend.

## Publicación
- Framework: Vite
- Install: `npm install`
- Build: `npm run build`
- Output: `dist`
- SPA fallback: `vercel.json`

## Estado
- Compilación y pruebas funcionales no certificadas.
- Vercel rechazó la creación del proyecto (403). No se publicó ningún sitio.
- Seguridad: se detectaron 22 tablas sin RLS en el Supabase inspeccionado. No se modificaron.

# Puesta en marcha — Bodega 6A

Tu Supabase ya tiene el esquema (18 tablas `bodega_*` con RLS) y la Edge Function
`bodega-gestion-usuarios` desplegada. El `.env` de este paquete ya apunta a ese proyecto.

## 1. En Supabase (2 minutos, antes de crear usuarios)

1. **Desactiva el registro libre**: Authentication → Sign In / Providers → apaga
   "Allow new users to sign up". Es obligatorio: el trigger da acceso de personal a
   cualquier cuenta nueva de Auth, y a la primera le da rol admin.
2. **Crea el primer admin**: Authentication → Users → Add user (email + contraseña,
   marca "Auto Confirm User"). Queda como `admin` automáticamente.

## 2. Hosting propio

### Opción A — Docker (recomendada)
```bash
docker compose up -d --build
# la app queda en http://TU-SERVIDOR:8080
```

### Opción B — Estático con nginx
```bash
npm install --legacy-peer-deps
npm run build          # genera dist/
# copia dist/ a tu servidor y usa nginx.conf como configuración del sitio
```

## 3. HTTPS
La instalación como PWA (agregar a pantalla de inicio) y la cámara para escanear
seriales exigen HTTPS. Pon delante un proxy con certificado, por ejemplo Caddy:
```
inventario.tudominio.com {
  reverse_proxy localhost:8080
}
```

## 4. Después
- Administración → Usuarios: crea al resto del equipo (admin / bodeguero).
- Administración → Datos: nombre de empresa y moneda.
- Si cambias de proyecto Supabase: edita `.env`, aplica `supabase/migrations/*.sql`,
  despliega la función y vuelve a compilar (las variables se incrustan al compilar).

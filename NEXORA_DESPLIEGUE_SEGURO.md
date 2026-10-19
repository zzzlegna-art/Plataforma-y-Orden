# Nexora — aislamiento y despliegue seguro

## Objetivo

Mantener Nexora como producto independiente, con identidad propia y configuración remota confirmada.

## Estado comprobado

- Repositorio: `zzzlegna-art/Plataforma-y-Orden`, rama principal `main`.
- Supabase confirmado por el usuario: instancia `ivholkjldntrmagcmogh`, activa.
- Configuración local de Supabase CLI: actualizada en la rama de trabajo para apuntar a esa instancia.
- Base de datos: existen tablas heredadas `bodega_*` con datos y tablas genéricas vacías como `products`, `orders`, `users` y `customers`.
- Conteos observados: 47 productos, 9 movimientos, 6 unidades, 1 pedido, 18 eventos de garantía y 106 registros de auditoría en tablas heredadas.
- Código actual: espera tablas con prefijo `nexora_*`; la base de datos todavía no contiene esas tablas.
- Vercel: el registro de despliegue existe, pero la conexión de auditoría devuelve `403 Forbidden` al consultar el proyecto y sus registros. No se pudieron verificar las variables de producción ni probar directamente el sitio.

## Bloqueos antes de producción

1. Revisar y validar la migración de nombres internos en una ventana controlada.
2. Verificar que las variables de Vercel apunten a la instancia Supabase confirmada.
3. Ejecutar pruebas de login, permisos, inventario, seriales, recepción, pedidos, garantías y auditoría.
4. Revisar las tablas genéricas vacías y mantenerlas intactas hasta confirmar que no son usadas.
5. Completar las fichas técnicas de los productos con valores verificados.

## Reglas

- La reconciliación de nombres se hace dentro de la misma base de datos; no se trasladan ni copian los datos a otra instancia.
- No eliminar productos, imágenes, usuarios, seriales, pedidos, garantías ni registros históricos como parte de la limpieza de marca.
- No exponer claves privilegiadas en el frontend.
- No desplegar ni aplicar cambios de esquema sin validar el destino y preparar reversión.

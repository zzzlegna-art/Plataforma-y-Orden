# Arquitectura por módulos - Bodega 6A

Esta estructura prepara la plataforma para crecer separando dominios de negocio.

## Estructura propuesta

- features/inventario: equipos, existencias, movimientos
- features/pedidos: órdenes y flujo comercial
- features/garantias: garantías y estados
- features/clientes: clientes y datos relacionados
- features/usuarios: roles y permisos
- features/reportes: métricas y análisis

## Regla de organización

Los componentes visuales reutilizables permanecen en `components/`.
La lógica específica de cada negocio debe vivir dentro de su módulo `features/`.

## Migración recomendada

La migración de páginas existentes debe hacerse módulo por módulo para evitar regresiones.

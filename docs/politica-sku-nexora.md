# Política de SKU · Nexora (v2)

La **SKU** identifica una referencia comercial, no una unidad individual. Las unidades
con IMEI/serial siguen vinculadas por **product_id**, y el nombre puede cambiar sin cambiar
el identificador interno. Los códigos se escriben en MAYÚSCULAS, sin espacios, con guiones,
hasta 40 caracteres contando los sufijos de duplicados.

## Estructura

- Equipos conocidos: modelo abreviado + almacenamiento: `IP16PM-256`,
  `S25U-256`, `A16-128`, `AI4`, `WASE11-46`.
- Repuestos: **PIEZA-FABRICANTE-MODELO-VARIANTE**.
  Ejemplos: `PAN-SUN-IP16PM`, `PAN-JK-IP13PM`, `BAT-IP13PM-CF`,
  `BAT-IP13PM-SF`, `PAN-IP13PM-OLED`.
- Tipos nuevos: **FAMILIA-MODELO-DESCRIPCIÓN-VARIANTE-CAPACIDAD**.
  Ejemplos: `CONS-PS5-SL-1T`, `CONS-PS5-PRO-2T`,
  `JUE-PS5-SPIDERMAN-2`, y equipos de otras categorías.
- Los nuevos tipos que no estén en la lista usan el nombre del tipo como prefijo
  (hasta 10 caracteres) y componentes del nombre de la referencia, para no
  limitar a Nexora a categorías fijas.

La marca comercial del repuesto (Sunlong, JK, OEM, etc.) se incorpora para evitar
que productos diferentes reciban una base idéntica. El fabricante del teléfono
compatible (Apple/Samsung) **no se asume** como fabricante de la pieza.
Se distinguen baterías **con flex (CF)** y **sin flex (SF)**.
Si una base ya está ocupada, se agrega `-2`, `-3`, etc., preservando el ancho máximo.

## Crear, editar e importar

El formulario genera la SKU al cambiar nombre, tipo o marca. Un cambio de SKU
escrito manualmente se respeta y se puede restablecer con «Regenerar SKU».
La importación CSV/Excel usa el mismo motor. La validación de duplicados del
cliente se complementa con un índice único en PostgreSQL
`bodega_products_sku_casefold_unique`, indiferente a mayúsculas/espacios externos.

## Inventario existente y trazabilidad

El 27/oct/2026 se actualizaron **15 SKU** de la base real: pantallas JK/Sunlong,
la batería iPhone 8G y el Watch Serie 11 de 46 mm. Otras SKU bien formadas
no se tocaron; una batería iPhone 13 Pro Max ya había sido actualizada en el
inventario por separado antes de ejecutar la migración.

La migración registró cada par anterior/nuevo en
`public.bodega_sku_migration_backup`, lote `2026-10-27-sku-v2`.
Esa tabla tiene RLS activo sin permisos de lectura para el cliente.
No se modificaron IDs, movimientos, precios ni seriales.

Para auditar (administrador de base de datos):

```sql
select p.name, m.old_sku, m.new_sku, m.changed_at
from public.bodega_sku_migration_backup m
join public.bodega_products p on p.id = m.product_id
where m.migration_batch = '2026-10-27-sku-v2'
order by p.name;
```

Para **revertir**, primero revisar que ningún código anterior haya sido reasignado
a otra referencia y que el producto conserve el `new_sku` migrado. No ejecutar
la reversión automáticamente: algunos productos podrían cambiar de nuevo de
manera legítima desde el formulario. Un DBA debe hacer la reversión
selectiva en una transacción bloqueada y verificar unicidad antes de confirmar.

## Agregar nuevas líneas de negocio

Las familias se mantienen en `src/lib/sku-engine.ts`. Para consolas, videojuegos,
repuestos nuevos, periféricos, etc., agregar pruebas en
`src/lib/sku-engine.test.ts`. Evitar códigos basados solo en números consecutivos
para distinguir marcas o variantes: primero usar información real de la referencia.

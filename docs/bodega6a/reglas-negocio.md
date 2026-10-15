\# Reglas de negocio Bodega 6A



\## Objetivo



Este documento define las reglas que deben respetarse al modificar

o ampliar la plataforma.



Cualquier nueva funcionalidad debe mantener estas reglas.



\---



\# Inventario



\## Regla 1: No existen unidades sin trazabilidad



Toda unidad física debe tener:



\- producto asociado.

\- identificación única.

\- estado actual.

\- historial de movimientos.



\---



\## Regla 2: Los seriales activos son únicos



Un mismo serial no puede pertenecer a dos unidades activas.



Antes de crear o modificar una unidad:



\- validar existencia.

\- bloquear duplicados.

\- conservar historial.



\---



\## Regla 3: No existen guardados parciales



Las operaciones críticas deben ser atómicas.



Ejemplo:



Si una operación modifica:



\- pedidos.

\- unidades.

\- movimientos.



Debe ocurrir:



Todo correcto:

→ guardar todo.



Algo falla:

→ revertir todo.



Nunca:



\- guardar una parte.

\- dejar datos incompletos.

\- continuar después de un error.



\---



\# Recepciones



Una recepción representa entrada real de mercancía.



Debe conservar:



\- proveedor si aplica.

\- productos recibidos.

\- unidades creadas.

\- seriales registrados.

\- fecha.

\- usuario responsable.



\---



\# Despachos



Un despacho debe:



\- afectar inventario.

\- relacionar unidades entregadas.

\- mantener trazabilidad del cliente.

\- registrar movimientos.



No se permite:



\- despachar unidades inexistentes.

\- liberar inventario sin registro.



\---



\# Pedidos



Un pedido debe conservar:



\- cliente.

\- productos.

\- cantidades.

\- estado.

\- unidades asignadas.



\---



\# Garantías



Toda garantía debe mantener:



\- cliente.

\- producto.

\- unidad relacionada.

\- técnico responsable.

\- eventos históricos.



Los eventos de garantía no deben eliminarse porque forman parte de la trazabilidad.



\---



\# Auditoría



Las acciones importantes deben poder rastrearse.



Debe existir información sobre:



\- qué ocurrió.

\- cuándo ocurrió.

\- quién lo realizó.



\---



\# Seguridad



Nunca se debe:



\- saltar validaciones del backend.

\- escribir directamente ignorando reglas.

\- exponer información sensible.

\- eliminar historial importante.



\---



\# Desarrollo



Todo cambio debe seguir:



1\. Crear rama.

2\. Modificar código.

3\. Crear o actualizar pruebas.

4\. Ejecutar pruebas completas.

5\. Revisar Pull Request.

6\. Integrar cambios.



\---



\# Principio principal



Bodega 6A administra inventario físico real.



La prioridad es:



1\. Integridad de datos.

2\. Trazabilidad.

3\. Seguridad.

4\. Facilidad de uso.

5\. Nuevas funciones.


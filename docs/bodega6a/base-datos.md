\# Base de datos Bodega 6A



\## Descripción general



Bodega 6A utiliza PostgreSQL como motor principal de datos mediante Supabase.



La base de datos mantiene la información operativa del inventario,

trazabilidad de unidades, movimientos, pedidos, recepciones y garantías.



\---



\# Tablas principales



\## bodega\_products



Representa los productos disponibles.



Información principal:



\- nombre

\- SKU

\- categoría

\- marca

\- tipo de producto



Relaciones:



\- categorías

\- marcas

\- unidades

\- movimientos



\---



\## bodega\_units



Representa unidades físicas individuales.



Cada unidad puede tener:



\- serial

\- producto asociado

\- estado

\- fecha de recepción



Reglas importantes:



\- Un serial activo debe ser único.

\- Una unidad debe mantener trazabilidad completa.

\- Los cambios deben quedar registrados.



Índice crítico:



bodega\_units\_serial\_activo\_uniq



Controla que no existan seriales activos duplicados.



\---



\## bodega\_movements



Registra movimientos del inventario.



Ejemplos:



\- entradas

\- salidas

\- despachos

\- ajustes



Debe mantener:



\- producto afectado

\- unidad relacionada

\- fecha

\- usuario responsable



\---



\## bodega\_orders



Representa pedidos o despachos.



Relacionado con:



\- clientes

\- productos

\- unidades



\---



\## bodega\_receptions



Representa recepciones de mercancía.



Permite controlar:



\- ingreso de productos

\- unidades recibidas

\- seriales registrados



\---



\## bodega\_warranties



Gestiona garantías.



Relaciona:



\- cliente

\- producto

\- unidad

\- técnico

\- eventos de garantía



\---



\# Funciones importantes



\## bodega\_aplicar\_cambios



Función crítica del sistema.



Responsabilidad:



Aplicar múltiples cambios dentro de una única transacción.



Regla:



Si un paso falla, toda la operación debe revertirse.



Nunca debe existir guardado parcial.



\---



\## Funciones de control



\### bodega\_control\_iniciar



Inicia procesos de control.



\### bodega\_control\_finalizar



Finaliza procesos verificando consistencia.



\### bodega\_control\_marcar\_serial



Controla validación de seriales.



\---



\# Triggers importantes



El sistema utiliza triggers para:



\- generación automática de códigos.

\- validaciones.

\- sincronización de unidades.

\- controles de integridad.



\---



\# Seguridad



La base utiliza:



\- claves foráneas.

\- restricciones únicas.

\- validaciones mediante funciones.

\- políticas RLS cuando corresponda.



\---



\# Regla fundamental



Los datos de inventario representan objetos físicos reales.



Por lo tanto:



\- no se eliminan movimientos históricos.

\- no se permiten duplicados de seriales.

\- toda modificación importante debe ser auditable.


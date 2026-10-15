\# Arquitectura Bodega 6A



\## Descripción general



Bodega 6A es una plataforma de gestión de inventario, recepción, despacho,

garantías y trazabilidad de unidades físicas.



El sistema está diseñado para mantener control sobre productos,

unidades individuales y movimientos realizados dentro del inventario.



\---



\# Tecnologías principales



\## Frontend



Tecnologías:



\- React

\- TypeScript

\- Vite



Responsabilidades:



\- Interfaz de usuario.

\- Validaciones de formularios.

\- Gestión del estado local.

\- Cálculo de cambios antes del guardado.



\---



\## Backend lógico



La lógica crítica de persistencia se realiza mediante Supabase.



Funciones importantes:



\- bodega\_aplicar\_cambios

\- bodega\_control\_iniciar

\- bodega\_control\_finalizar

\- bodega\_handle\_new\_user



\---



\## Base de datos



Motor:



PostgreSQL



La base contiene:



\- productos

\- unidades

\- movimientos

\- pedidos

\- recepciones

\- garantías

\- clientes

\- técnicos

\- auditoría



\---



\# Regla principal del sistema



Las operaciones críticas de inventario deben ser atómicas.



Un cambio debe:



\- aplicarse completamente,

\- o no aplicarse.



Nunca debe existir un estado parcial.



\---



\# Flujo general



Usuario

↓

Frontend React

↓

Supabase RPC

↓

PostgreSQL

↓

Respuesta validada

↓

Actualización de interfaz



\---



\# Control de cambios



Todo cambio importante debe pasar por:



1\. Rama de desarrollo.

2\. Pruebas automáticas.

3\. Pull Request.

4\. Revisión.

5\. Merge.

6\. Despliegue.


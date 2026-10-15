\# Despliegue Bodega 6A



\## Objetivo



Definir el proceso seguro para llevar cambios desde desarrollo hasta

producción evitando errores y pérdidas de información.



\---



\# Flujo oficial de cambios



Todo cambio debe seguir este proceso:



Desarrollo local

&#x20;       |

&#x20;       ↓

Rama de trabajo

&#x20;       |

&#x20;       ↓

Pruebas automáticas

&#x20;       |

&#x20;       ↓

Pull Request

&#x20;       |

&#x20;       ↓

Revisión técnica

&#x20;       |

&#x20;       ↓

Merge a main

&#x20;       |

&#x20;       ↓

Despliegue





\---



\# Control de ramas



\## main



Es la versión estable de producción.



Reglas:



\- No modificar directamente.

\- Todo cambio debe entrar mediante Pull Request.

\- Debe estar validado antes de integrar.



\---



\## Ramas de trabajo



Ejemplos:



Uso:



\- desarrollar cambios.

\- ejecutar pruebas.

\- revisar impacto.



\---



\# Validaciones antes de publicar



\## Código



Obligatorio:



\- TypeScript sin errores.

\- Pruebas automáticas exitosas.

\- Build correcto.



\---



\## Base de datos



Antes de cualquier cambio SQL:



1\. Crear respaldo.

2\. Probar migración.

3\. Confirmar rollback.

4\. Validar integridad.



\---



\# GitHub



Cada Pull Request debe incluir:



\- descripción del cambio.

\- archivos modificados.

\- pruebas realizadas.

\- posibles riesgos.



\---



\# Supabase



Los cambios de base de datos deben hacerse mediante:



\- migraciones controladas.

\- funciones versionadas.

\- revisión previa.



Nunca:



\- modificar tablas críticas sin respaldo.

\- eliminar datos directamente.

\- cambiar reglas importantes sin pruebas.



\---



\# Vercel



Antes del despliegue verificar:



\- compilación correcta.

\- variables de entorno.

\- conexión con Supabase.



\---



\# Recuperación ante errores



Si aparece un problema en producción:



1\. Revisar logs.

2\. Identificar el cambio responsable.

3\. Restaurar versión estable si es necesario.

4\. Crear una corrección mediante nueva rama.



\---



\# Principio principal



En Bodega 6A la prioridad es:



1\. Integridad de datos.

2\. Seguridad.

3\. Trazabilidad.

4\. Disponibilidad.

5\. Nuevas funcionalidades.


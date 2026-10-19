# Nexora GitHub Agent

## Propósito

Capa de integración para el agente de desarrollo asistido de Nexora. Este módulo gestiona la comunicación autorizada entre el agente y GitHub.

## Capacidades previstas

- Autenticación mediante GitHub App con credenciales guardadas como secretos del backend.
- Lectura de archivos del repositorio.
- Construcción de contexto para el análisis técnico.
- Creación de ramas de desarrollo.
- Preparación de commits y pull requests.

## Seguridad

- No almacenar claves privadas en el repositorio.
- No modificar directamente ramas protegidas.
- No ejecutar despliegues ni cambios de producción sin autorización explícita.
- Todo cambio generado requiere revisión y validaciones.

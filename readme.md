# SolarWeb

![logo](/docs/images/logo.png)

![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Angular](https://img.shields.io/badge/Angular-DD0031?style=for-the-badge&logo=angular&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)

## Descripción del Proyecto

SolarWeb es una plataforma web desarrollada para investigadores, con el objetivo de **visualizar, analizar y exportar datos de irradiancia solar e imágenes del cielo**. La aplicación busca proporcionar una herramienta eficiente y clara para el análisis de las condiciones atmosféricas y su impacto en la radiación solar.

---

## Características Principales

### Para Investigadores

* **Visualización de Datos:** Un panel de control intuitivo para ver gráficos de irradiancia global, directa y difusa del día actual.
* **Análisis Dinámico:** Capacidad para filtrar los tipos de irradiancia, seleccionar fechas específicas y ver los valores de cada punto en el gráfico al pasar el cursor.
* **Exportación de Datos:** Funcionalidad para exportar datos e imágenes de un rango de fechas específico. Puede filtrar por tipo de irradiación y métricas y elegir el formato de exportación (ej. CSV, Excel, JSON).
* **Gestión de Cuentas:** Capacidad para solicitar un registro y acceder al sitio una vez la solicitud ha sido aprobada.

### Para Administradores

* **Gestión de Usuarios:** Herramientas para visualizar y gestionar solicitudes de registro, aprobar o rechazar usuarios, y gestionar roles (administrador/usuario).
* **Monitoreo y Auditoría:** Acceso a un historial de descargas por cada usuario y un registro de los usuarios eliminados.
* **Notificaciones del Sistema:** El sistema notifica al administrador sobre problemas clave, como el sensor sin tomar datos o el espacio del disco duro bajo.

---

## Documentación Detallada

Para una guía completa sobre el proyecto, su arquitectura y su uso, consulta la documentación completa en la carpeta `docs/`.

* **[Manual de Usuario](/docs/user-manual/readme.md):** Guía completa para el usuario final sobre cómo interactuar con cada funcionalidad del sitio web.
* **[Manual DevOps](/docs/devops-manual/readme.md):** Documentación técnica para los desarrolladores y el equipo de operaciones sobre la infraestructura, despliegue, automatización y mantenimiento del sistema.
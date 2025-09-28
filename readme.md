# SolarWeb

![logo](/docs/images/logo.png)

## Descripción del Proyecto

SolarWeb es una plataforma web desarrollada para investigadores, con el objetivo de **visualizar, analizar y exportar datos de irradiancia solar e imágenes del cielo**. La aplicación busca proporcionar una herramienta eficiente y clara para el análisis de las condiciones atmosféricas y su impacto en la radiación solar.

---

## Características Principales

### Para Investigadores

- **Visualización de Datos:** Un panel de control intuitivo para ver gráficos de irradiancia global, directa y difusa del día actual.
- **Análisis Dinámico:** Capacidad para filtrar los tipos de irradiancia, seleccionar fechas específicas y ver los valores de cada punto en el gráfico al pasar el cursor.
- **Exportación de Datos:** Funcionalidad para exportar datos e imágenes de un rango de fechas específico. puede filtrar por tipo de irradiación y métricas y elegir el formato de exportación (ej. CSV, Excel, JSON)
- **Gestión de Cuentas:** Capacidad para solicitar un registro y acceder al sitio una vez la solicitud ha sido aprobada

### Para Administradores

- **Gestión de Usuarios:** Herramientas para visualizar y gestionar solicitudes de registro, aprobar o rechazar usuarios, y gestionar roles (administrador/usuario)
- **Monitoreo y Auditoría:** Acceso a un historial de descargas por cada usuario y un registro de los usuarios eliminados.
- **Notificaciones del Sistema:** El sistema notifica al administrador sobre problemas clave, como el sensor sin tomar datos o el espacio del disco duro bajo.

---

## Configuración y Despliegue

### Requisitos Técnicos

- **Docker** para despliegue

### Configuración del entorno

- Crear un archivo `.env` en la raíz del proyecto. Consulta la documentación del [Manual DevOps](docs/devops-manual/README.md) para ver las variables necesarias para la conexión con la base de datos y otros servicios.

### Guía de Inicio Rápido

1.  **Clonar el repositorio:**
    ```bash
    git clone https://github.com/Niik4466/SolarWeb
    ```

2.  **Iniciar los servicios:**
    Desde el directorio raíz del proyecto, ejecuta el siguiente comando para construir e iniciar todos los servicios definidos en el `docker-compose.yml`:
    ```bash
    docker compose up --build
    ```

3.  **Acceder a la aplicación:**
    Una vez que los contenedores estén activos, podrás acceder a la interfaz de usuario en su formato local en [http://localhost:3002](http://localhost:3002).

Para mayor detalles de despliegue en producción visitar [Manual DevOps para despliegue](./docs/devops-manual/deployment.md)

---

## Documentación Detallada

Para información más profunda sobre el uso, la arquitectura y el mantenimiento del proyecto, consultar los siguientes documentos:

**[Manual de Usuario](./docs/user-manual.md):** Guía completa para el usuario final sobre cómo interactuar con cada funcionalidad del sitio web.
**[Manual DevOps](./docs/devops-manual/README.md):** Documentación técnica para los desarrolladores y el equipo de operaciones sobre la infraestructura, despliegue, automatización y mantenimiento del sistema.
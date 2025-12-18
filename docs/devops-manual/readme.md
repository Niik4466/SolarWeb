# Manual de DevOps - SolarWeb

Este manual es una guía técnica para los equipos de desarrollo y operaciones. Su objetivo es documentar la arquitectura, los procesos de despliegue, la configuración del entorno de desarrollo y las herramientas utilizadas en el proyecto SolarWeb.

---

### Arquitectura del Sistema

El proyecto SolarWeb está diseñado con una arquitectura de **monolito modular con servicios de datos desacoplados**. Esto se gestiona a través de dos nodos de computo.

1.  **Nodo de Despliegue:** Contiene el **Frontend** y el **Backend**, los cuales consumen datos de los servicios en el nodo de datos. Ambos nodos Se comunican mediante de **ZeroTier** por limitaciones tecnicas.
2.  **Nodo de Datos:** Aloja los servicios de ingesta y almacenamiento de datos.
    - **MinIO** para las imágenes del cielo.
    - **InfluxDB** para los datos de irradiancia, GHI, DNI y DHI.
    - **PostgreSQL** para datos relacionales de usuarios, solicitudes y transacciones.
    - Se incluyen los `uploaders` que automatizan la carga de datos para ambos servicios desde directorios en el nodo.

---

### Tecnologías Clave

- **Frontend:** Angular
- **Backend:** Python, FastAPI
- **Bases de Datos:**
  - InfluxDB (series de tiempo)
  - MinIO (almacenamiento de objetos)
  - PostgreSQL (datos relacionales)
- **Contenedores:** Docker, Docker Compose
- **Servidor Web:** Caddy (para el frontend en producción)
- **Conectividad:** ZeroTier (para una red privada virtual)
- **Tareas Programadas:** APScheduler (para automatización de procesos)
- **Correos:** SMTP (Gmail)
- **Monitoreo:** Paramiko (SSH) para monitoreo de nodo de datos

---

### Configuración del Entorno de Desarrollo

Para iniciar el proyecto en tu máquina local, solo necesitas Docker y Docker Compose instalados.

1.  **Variables de Entorno:**
    Crea un archivo `.env` en el directorio raíz del proyecto (`/SolarWeb/.env`). Este archivo debe contener las variables de entorno para la configuración de la base de datos y otros servicios.

    _Para ver un ejemplo de las variables requeridas, consulta el archivo `docs/devops-manual/setup.md`._

2.  **Levantar los servicios en forma local:**
    Desde el directorio raíz, ejecuta el siguiente comando para construir y levantar todos los servicios juntos en un único entorno de desarrollo:

    ```bash
    docker compose up --build
    ```

    - `--build` es necesario solo la primera vez o cuando hay cambios en los Dockerfiles.
    - La aplicación estará disponible en `http://localhost:4002`.

---

### Flujo de Despliegue (CI/CD)

El despliegue en producción se realiza manualmente por cada actualización en el repositorio. Para ello, se utilizan diferentes archivos `docker-compose` adaptados a cada nodo, lo que asegura que solo se levanten los servicios necesarios en cada servidor.

- **En el Nodo de Datos:** Levanta los servicios de base de datos y los "uploaders" con su propio archivo de configuración:
  ```bash
  docker compose -f docker-compose-data.yml up --build -d
  ```
- **En el Nodo de Despliegue:** Levanta el frontend y el backend de producción:
  ```bash
  docker compose -f docker-compose-deploy.yml up --build -d
  ```

Más información sobre configuración para despliegue en [deployment de DevOps](deployment.md)

---

### Estructura de la Documentación Técnica

La documentación detallada se encuentra en esta misma carpeta para mantenerla organizada y versionada.

- [setup-local.md](setup-local.md) : Guía de configuración inicial del entorno, variables de entorno y dependencias para el desarrollo local.
- [deployment.md](deployment.md): Pasos para el despliegue en producción en dos nodos separados.
- [database_management.md](database_management.md): Información sobre manejo de base de datos relacionales, migración de esquemas y servicios de ingesta de datos.
- [networking_and_security.md](networking_and_security.md): Configuración de redes Docker, ZeroTier y consideraciones de seguridad.
- [troubleshooting.md](troubleshooting.md): Guía de solución de problemas comunes en despliegue.
- [genesis_ng.md](genesis_ng.md): Genesis del proyecto en Angular.

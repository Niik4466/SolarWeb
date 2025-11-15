# Guía de Despliegue en Producción

Este documento detalla el proceso de configuración y despliegue del proyecto SolarWeb en un entorno de producción, siguiendo la arquitectura de dos nodos explicada en el [readme de DevOps](readme.md).

## Arquitectura de Despliegue

El proyecto se despliega en dos servidores (nodos) distintos para separar la lógica de la aplicación del almacenamiento de datos.

  * **Nodo de Datos:** Servidor para el almacenamiento y la ingesta de grandes volúmenes de datos. Aloja los servicios de base de datos (`InfluxDB`, `MinIO`) y los servicios de carga de datos (`influxdb-uploader`, `minio-uploader`).
  * **Nodo de Despliegue:** Servidor orientado al cliente. Aloja el **backend** (API) y el **frontend** (UI), que interactúan directamente con los usuarios y se comunican con el Nodo de Datos para acceder a la información.

## Requisitos de Configuración

En ambos nodos se debe tener:

1.  **Sistema Operativo:** Linux (ej. Ubuntu, CentOS, etc.).
2.  **Docker y Docker Compose:** Docker en su versión `28.4.0`.
3.  **Red ZeroTier:** Una red ZeroTier privada creada previamente para la comunicación segura entre nodos.
4.  **Configuración de red:**
      * El **Nodo de Despliegue** debe tener acceso de red al **Nodo de Datos** a través de ZeroTier.
      * Las variables de entorno en el Nodo de Despliegue (`INFLUX_ENDPOINT`, `MINIO_ENDPOINT`, `POSTGRES_HOST`) deben apuntar a las direcciones IP o nombres de host del Nodo de Datos dentro de la red ZeroTier.
      * Ejemplo de configuración .env para producción
      ```ini
      # Variables de la base de datos de series de tiempo (InfluxDB)
      INFLUX_USER=admin
      INFLUX_PASS=admin123
      INFLUX_ORG=miOrg
      INFLUX_BUCKET=miBucket
      INFLUX_TOKEN=super-secret-token
      INFLUX_ENDPOINT=http://<IP_NODO_DATOS>:8086

      # Variables del servicio de almacenamiento de objetos (MinIO)
      MINIO_USER=minio
      MINIO_PASSWORD=minio123
      MINIO_ENDPOINT=http://<IP_NODO_DATOS>:9000

      # Variables de la base de datos relacional (PostgreSQL)
      POSTGRES_USER=postgres
      POSTGRES_PASSWORD=postgres
      POSTGRES_PORT=5002
      POSTGRES_HOST=postgres-solarweb
      POSTGRES_DB=solarweb

      # Variables para los servicios de carga de datos (Uploaders)
      MINIO_UPLOAD_IMAGES_DIR=~/Pictures/DatosCamera
      INFLUXDB_UPLOAD_CSV_DIR=~/Downloads/csv

      # Variables para la red ZeroTier
      ZT_NETWORK_ID=<tu_network_id>
      ```

## Proceso de Despliegue por Nodo

A continuación, los pasos en cada servidor para completar el despliegue.

### Nodo de Datos

Este nodo es el **primero** que debe configurarse. Su objetivo es asegurar que los servicios de almacenamiento de datos estén listos y accesibles.

1.  **Clonar el Repositorio:**

    ```bash
    git clone https://github.com/Niik4466/SolarWeb.git
    cd solarweb
    ```

2.  **Crear el archivo `.env`:**
    Copiar las variables de entorno descritas anteriormente y configurar dependiendo del caso

    Las variables `MINIO_UPLOAD_IMAGES_DIR` y `INFLUXDB_UPLOAD_CSV_DIR` deben apuntar a los directorios donde están almacenadas las imagenes de cielo y los .csv de irradiancia respectivamente.

    Incluir también la variable `ZT_NETWORK_ID` con el identificador de la red ZeroTier.

3.  **Desplegar los servicios de datos:**
    Ejecuta Docker Compose usando el archivo `docker-compose-data.yml` para levantar los contenedores de las bases de datos y los "uploaders".

    ```bash
    docker compose -f docker-compose-data.yml up --build -d
    ```

    El flag `-d` (`--detach`) es crucial para que los contenedores se ejecuten en segundo plano.

4.  **Configurar fileIngestDaemon:**
    Seguir los pasos descritos en la seccion de `Procesamiento local de archivos (fileIngestDaemon)` [database management docs](database_management.md)

### Nodo de Despliegue

Una vez que el Nodo de Datos esté operativo, configuramos el Nodo de Despliegue.

1.  **Clonar el Repositorio:**

    ```bash
    git clone https://github.com/Niik4466/SolarWeb.git
    cd solarweb
    ```

2.  **Crear el archivo `.env`:**
    Copiar las variables de entorno relacionadas con InfluxDB, MinIO y PostgreSQL en un archivo `.env` en la raíz del proyecto. Las variables `INFLUX_ENDPOINT` y `MINIO_ENDPOINT` deben apuntar a la dirección IP o el nombre de host del Nodo de Datos, y `POSTGRES_HOST` también debe apuntar a la IP del Nodo de Datos.

      * Ejemplo: 
        - `INFLUX_ENDPOINT=http://<IP_NODO_DATOS>:8086`
        - `MINIO_ENDPOINT=http://<IP_NODO_DATOS>:9000`
        - `POSTGRES_HOST=<IP_NODO_DATOS>`

    Incluir también la variable `ZT_NETWORK_ID` para conectarse a la red privada ZeroTier.

3.  **Desplegar el frontend y el backend:**
    Ejecutar Docker Compose usando el archivo `docker-compose-deploy.yml` para levantar los servicios del frontend y el backend.

    ```bash
    docker compose -f docker-compose-deploy.yml up --build -d
    ```

    Una vez que los contenedores estén activos, la aplicación estará disponible en los puertos especificados en el `docker-compose-deploy.yml`. Por defecto:

    * **Frontend:** Puerto 80 (a través de Caddy)
    * **Backend API:** Puerto 4002 (disponible internamente)
    * **PostgreSQL:** Puerto 5002 (disponible internamente)

    > **Nota:** En producción, los puertos están expuestos internamente a través de la red Docker `red_taller_software`, no directamente al host.

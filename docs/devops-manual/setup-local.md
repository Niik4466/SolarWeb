# Guía de Configuración del Entorno de Desarrollo

Este documento detalla los pasos y requisitos para configurar el entorno de desarrollo del proyecto SolarWeb. El proceso está diseñado para ser rápido y consistente utilizando Docker y Docker Compose.

-----

### Requisitos del Sistema

Para poder ejecutar el proyecto, necesitas tener instaladas las siguientes herramientas en tu máquina local:

  * **Git:** Para clonar el repositorio.
  * **Docker:** Versión 20.10.0 o superior.
  * **Docker Compose:** Versión 1.29.0 o superior (o el comando `docker compose` integrado).

-----

### Pasos de Configuración

Sigue estos pasos para poner el proyecto en marcha:

**Paso 1: Clonar el Repositorio**

Abre una terminal y clona el repositorio del proyecto:

```bash
git clone https://github.com/Niik4466/SolarWeb.git
cd solarweb
```

**Paso 2: Configurar Variables de Entorno**

El proyecto utiliza un archivo `.env` en la raíz para gestionar la configuración de los servicios. Crea este archivo y añade las siguientes variables, usando los valores de ejemplo como referencia.

```ini
# Variables de la base de datos de series de tiempo (InfluxDB)
INFLUX_USER=admin
INFLUX_PASS=admin123
INFLUX_ORG=miOrg
INFLUX_BUCKET=miBucket
INFLUX_TOKEN=super-secret-token
INFLUX_ENDPOINT=http://influxdb-solarweb:8086/

# Variables del servicio de almacenamiento de objetos (MinIO)
MINIO_USER=minio
MINIO_PASSWORD=minio123
MINIO_ENDPOINT=http://minio-solarweb:9000/

# Variables de la base de datos relacional (PostgreSQL)
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_PORT=5432
POSTGRES_HOST=postgres-solarweb
POSTGRES_DB=solarweb

# Variables para los servicios de carga de datos (Uploaders)
MINIO_UPLOAD_IMAGES_DIR=~/Pictures/DatosCamera
INFLUXDB_UPLOAD_CSV_DIR=~/Downloads/csv

# Variables para la red ZeroTier
ZT_NETWORK_ID=xxxxxxxxxxxxxxx
```

**Paso 3: Levantar los Contenedores**

Con el archivo `.env` creado, ejecuta el siguiente comando **desde el directorio raíz del proyecto**. Este comando construirá las imágenes y levantará todos los servicios.

```bash
docker compose up --build
```

  * El flag `--build` es importante la primera vez para construir las imágenes a partir de los `Dockerfile`s.
  * La primera ejecución puede tardar varios minutos mientras se descargan las imágenes y se construyen los servicios.

**Paso 4: Verificar la Instalación**

Una vez que los servicios estén activos, puedes verificar su funcionamiento:

  * **Frontend:** Abre tu navegador y navega a [http://localhost:4200](http://localhost:4200). Deberías ver la interfaz de usuario de SolarWeb.
  * **Backend:** La API estará disponible en [http://localhost:8000](http://localhost:8000). Puedes ir a [http://localhost:8000/docs](http://localhost:8000/docs) para probar los endpoints con Swagger.
  * **InfluxDB:** Accede a [http://localhost:8086](http://localhost:8086) con tus credenciales configuradas.
  * **MinIO:** Accede a [http://localhost:9001](http://localhost:9001) con las credenciales de MinIO.
  * **PostgreSQL:** Disponible en `localhost:5432` si necesitas conectarte desde un cliente externo.
  * **zerotier:** Creara una nueva interfaz de red, visible con:
    - **Windows**: ipconfig
    - **Linux**: ip addr show
    - **MAC**: ifconfig

Si encuentras algún problema, asegúrate de que no haya otros servicios ejecutándose en los mismos puertos y no tener servicios dockers activos.

Para detalles en la configuracion de zerotier, visitar [guia de networking](networking_and_security)
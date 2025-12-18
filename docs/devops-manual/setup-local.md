# Guía de Configuración del Entorno de Desarrollo

Este documento detalla los pasos y requisitos para configurar el entorno de desarrollo del proyecto SolarWeb. El proceso está diseñado para ser rápido y consistente utilizando Docker y Docker Compose.

---

### Requisitos del Sistema

Para poder ejecutar el proyecto, necesitas tener instaladas las siguientes herramientas en tu máquina local:

- **Git:** Para clonar el repositorio.
- **Docker:** Versión 20.10.0 o superior.
- **Docker Compose:** Versión 1.29.0 o superior (o el comando `docker compose` integrado).

---

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

# Variables para el modulo de correos
GMAIL_API_KEY="<google API key>"
GMAIL_USER=solarwebuach@gmail.com

# Variables para monitorear pc
DESTINY_MONITOR_PC=xxx.xxx.xxx.xxx
SSH_USER=user
SSH_PASSWORD=xxxxxx

# Variables para la red ZeroTier
ZT_NETWORK_ID=xxxxxxxxxxxxxxx
```

**Paso 3: Levantar los Contenedores**

El archivo `docker-compose.yml` utiliza **perfiles** para agrupar servicios. Esto permite levantar solo lo necesario.

- **Perfil `deploy`**: Frontend, Backend, PostgreSQL, ZeroTier.
- **Perfil `data`**: InfluxDB, MinIO, Uploaders, PostgreSQL, ZeroTier.

Para levantar un entorno de desarrollo **completo** (todos los servicios), utiliza:

```bash
docker compose --profile deploy --profile data up --build
```

Si solo necesitas trabajar en la aplicación (Frontend/Backend) simulando el despliegue:

```bash
docker compose --profile deploy up --build
```

- El flag `--build` es importante la primera vez para construir las imágenes.
- La primera ejecución puede tardar varios minutos.

**Paso 4: Verificar la Instalación**

Una vez que los servicios estén activos, puedes verificar su funcionamiento:

- **Frontend:** Abre tu navegador en [http://localhost:3002](http://localhost:3002). Deberías ver la interfaz de SolarWeb.
- **Backend:** La API estará disponible en [http://localhost:4002](http://localhost:4002). Documentación en [http://localhost:4002/docs](http://localhost:4002/docs).
- **InfluxDB:** Accede a [http://localhost:8086](http://localhost:8086).
- **MinIO:** Accede a [http://localhost:9001](http://localhost:9001).
- **PostgreSQL:** Disponible en `localhost:5432`.
- **ZeroTier:** Se creará una interfaz de red (verifica con `ip addr` o `ipconfig`).

Si encuentras algún problema, asegúrate de que no haya otros servicios ejecutándose en los mismos puertos y no tener servicios dockers activos.

Para detalles en la configuracion de zerotier, visitar [guia de networking](networking_and_security)

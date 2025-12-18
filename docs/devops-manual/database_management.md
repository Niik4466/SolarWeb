# Gestión de Datos

Este documento describe la lógica de los scripts de ingesta de datos, la gestión de migraciones de base de datos y las consideraciones de almacenamiento en las bases de datos de SolarWeb.

---

### Base de Datos Relacional (PostgreSQL)

PostgreSQL almacena datos estructurados como información de usuarios, solicitudes, y configuraciones del sistema.

**Migraciones y Schema:**

1.  **Ubicación de migraciones:** Las migraciones de base de datos se encuentran en `databases/postgres/db.sql`.
2.  **Proceso de migración:** Durante el levantamiento de los servicios, un contenedor `migrator` se encarga de ejecutar automáticamente las migraciones en la base de datos.
3.  **Health Check:** El contenedor de PostgreSQL incluye un verificador de salud que asegura que la base de datos esté lista antes de que otros servicios la utilicen.
4.  **Datos de prueba:** Existe un archivo `databases/postgres/tests_seed.sql` que contiene datos de prueba. Este se ejecuta cuando se levanta el perfil `test`:
    ```bash
    docker compose --profile test up --build
    ```

---

### Ingesta de Datos de Irradiancia (InfluxDB)

Los datos de irradiancia solar se almacenan en InfluxDB, una base de datos optimizada para series de tiempo. El servicio `influxdb-uploader` es el responsable de este proceso.

**Lógica del script:**

1.  **Entrada:** El script lee archivos `.csv` que contienen los datos de irradiancia.
2.  **Proceso inicial (lectura completa):** La primera vez que se ejecuta el contenedor, el script leerá y procesará **todos los archivos `.csv`** que se encuentren en el directorio especificado por la variable de entorno `INFLUXDB_UPLOAD_CSV_DIR`.
3.  **Proceso continuo (monitoreo):** Una vez que la lectura inicial ha finalizado, el script se mantendrá activo y monitoreará el directorio de forma constante. Si se agrega un nuevo archivo `.csv`, lo procesará y lo agregará a la base de datos automáticamente.
4.  **Formato esperado:** El archivo debe tener las siguientes columnas: `Fecha`, `Hora`, `DNI`, `DHI` y `GHI`.
5.  **Almacenamiento:** Cada registro se inserta en InfluxDB con un timestamp preciso, lo que permite consultas eficientes basadas en el tiempo.

Este proceso asegura que los datos crudos del sensor se transformen y se organicen de manera óptima para la visualización en el frontend.

---

### Ingesta de Imágenes del Cielo (MinIO)

Las imágenes de cielo se almacenan en MinIO, un servicio de almacenamiento de objetos. El script `minio-uploader` gestiona este proceso.

**Lógica del script:**

1.  **Entrada:** El script monitorea el directorio especificado por la variable de entorno `MINIO_UPLOAD_IMAGES_DIR` y procesa los archivos de imagen.
2.  **Proceso inicial (lectura completa):** La primera vez que el contenedor se inicia, el script subirá **todas las imágenes** presentes en el directorio a MinIO.
3.  **Proceso continuo (monitoreo):** Tras la carga inicial, el script queda a la espera de nuevos archivos. Cualquier nueva imagen que se añada al directorio será subida de forma automática.
4.  **Extracción de metadatos:** El script busca en el nombre del archivo un patrón de 17 dígitos (`YYYYMMDDhhmmss`) para extraer la fecha y hora exactas.
5.  **Generación de la clave (Key):** Para organizar las imágenes de manera lógica y facilitar su acceso, el script crea una estructura de directorios virtual dentro de MinIO. La clave del objeto se genera con el siguiente formato:
    ```
    YYYY/MM/DD/hh_mm_ss.extension
    ```
    - **Ejemplo:** La imagen de `*20250802213004*` se almacenará en la ruta `2025/08/02/21_30_04.jpg` dentro del bucket.

### Procesamiento Local de Archivos (fileIngestDaemon)

El `fileIngestDaemon` es un servicio que corre **localmente en el Nodo de Despliegue** (no en Docker). Su propósito es procesar imágenes y archivos CSV antes de que se envíen a los servicios de almacenamiento (MinIO e InfluxDB).

**Funcionalidades principales:**

1.  **Monitoreo de imágenes:** Vigila un directorio de origen (`IMAGES_ORIGIN_DIRECTORY`) de forma recursiva.
2.  **Procesamiento de imágenes:**
    - Comprime las imágenes reduciendo sus dimensiones a la mitad
    - Opcionalmente recorta bordes según la variable `CROP_PIXELS`
    - Ajusta la calidad JPEG según `JPEG_QUALITY` (default 85)
3.  **Organización de salida:** Mantiene la estructura relativa de directorios, guardando en `IMAGES_DESTINY_DIRECTORY`
4.  **Eliminación de origen:** Tras procesar exitosamente, **borra el archivo original**
5.  **Monitoreo de CSV:** Vigila archivos CSV en `CSV_ORIGIN_DIRECTORY`
6.  **Tail incremental:** Agrega solo las nuevas líneas de los CSV activos al directorio de destino (`CSV_DESTINY_DIRECTORY`)
7.  **Estado persistente:** Mantiene un archivo `state_log.csv` que registra timestamps de inicio y último procesamiento para ambos tipos de archivos

**Variables de entorno necesarias:**

```ini
# Rutas de directorios para imágenes
IMAGES_ORIGIN_DIRECTORY=~/Pictures/DatosCamera
IMAGES_DESTINY_DIRECTORY=~/Pictures/DatosCameraComprimido

# Rutas de directorios para CSV
CSV_ORIGIN_DIRECTORY=~/Downloads/csv
CSV_DESTINY_DIRECTORY=~/Downloads/Irradiancia

# Configuración de procesamiento de imágenes
CROP_PIXELS=0                    # píxeles a recortar de cada borde (0 = sin recorte)
JPEG_QUALITY=85                  # calidad de compresión JPEG (1-100)

# Parámetros de monitoreo
POLL_INTERVAL=1.0               # segundos entre polls de CSV
STABLE_WAIT=0.01                # segundos a esperar para confirmar estabilidad de archivo

# Ubicación del archivo de estado
STATE_LOG_FILE=./state_log.csv
```

**Configuración como Servicio Systemctl (Nodo de Despliegue):**

El `fileIngestDaemon` se configura manualmente como un servicio systemd para que se ejecute automáticamente al iniciar el servidor.

1.  **Instalar dependencias:**

    ```bash
    cd /mnt/e/SolarWeb/databases/fileIngestDaemon
    python -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    ```

2.  **Crear archivo de servicio systemd:**
    Crear `/etc/systemd/system/file-ingest-daemon.service`:

    ```ini
    [Unit]
    Description=SolarWeb File Ingest Daemon
    After=network.target

    [Service]
    Type=simple
    User=<usuario>
    WorkingDirectory=/mnt/e/SolarWeb/databases/fileIngestDaemon
    Environment="PATH=/usr/local/bin:/usr/bin:/bin"
    ExecStart=/mnt/e/SolarWeb/databases/fileIngestDaemon/<virtual_environment>/bin/python /mnt/e/SolarWeb/databases/fileIngestDaemon/ingest_watch.py
    EnvironmentFile=/mnt/e/SolarWeb/databases/fileIngestDaemon/.env
    Restart=on-failure
    RestartSec=10
    StandardOutput=journal
    StandardError=journal

    [Install]
    WantedBy=multi-user.target
    ```

3.  **Recargar y habilitar el servicio:**

    ```bash
    sudo systemctl daemon-reload
    sudo systemctl enable file-ingest-daemon
    sudo systemctl start file-ingest-daemon
    ```

4.  **Verificar estado:**
    ```bash
    sudo systemctl status file-ingest-daemon
    sudo journalctl -u file-ingest-daemon -f
    ```

**Gestión del servicio:**

```bash
# Iniciar el servicio
sudo systemctl start file-ingest-daemon

# Detener el servicio
sudo systemctl stop file-ingest-daemon

# Reiniciar
sudo systemctl restart file-ingest-daemon

# Ver estado
sudo systemctl status file-ingest-daemon

# Ver logs
tail -f /var/log/ingest_watch.log
```

**Flujo de procesamiento:**

1. El script vigila eventos `created` y `moved` en el directorio origen
2. Espera a que el archivo deje de crecer (seguro de escritura)
3. Crea estructura de directorios `YYYY/MM/DD` en destino
4. Las imágenes se comprimen y guardan en la estructura de destino, luego se borra el original
5. Los CSV se monitorean de forma incremental, agregando solo nuevas líneas
6. El estado se persiste en `state_log.csv` para recuperación ante fallos

### Servicios de Ingesta en Contenedores (Docker)

Además del demonio local que prepara los archivos, existen dos contenedores en el nodo de datos encargados de subir esta información a las bases de datos finales (`InfluxDB` y `MinIO`).

#### Ver Logs de los Contenedores

Para monitorear el funcionamiento de estos servicios, se utilizan los comandos de docker compose en el directorio donde está el `docker-compose-data.yml`:

```bash
# Ver logs de todos los servicios
docker compose -f docker-compose-data.yml logs -f

# Ver logs solo del uploader de imágenes
docker compose -f docker-compose-data.yml logs -f minio-uploader

# Ver logs solo del uploader de datos CSV
docker compose -f docker-compose-data.yml logs -f influxdb-uploader
```

#### Funcionamiento de los Scripts de Ingesta

**1. Ingesta de Imágenes (MinIO Uploader - `upload_images.py`)**

Este script se encarga de subir las imágenes procesadas al bucket de MinIO.

- **Escaneo Inteligente:** En lugar de usar `watchdog`, realiza un escaneo periódico (polling) del directorio de imágenes.
- **Compresión:** Redimensiona las imágenes a la mitad de su tamaño original y las convierte a JPEG (calidad 85) antes de subirlas para ahorrar espacio y ancho de banda.
- **Persistencia de Estado (`UPLOAD_LOG.csv`):** Mantiene un registro local de la última imagen subida exitosamente.
  - Al reiniciarse, lee este log para saber desde qué fecha/hora continuar, evitando re-procesar todo el historial.
  - Este archivo guarda: `LAST_DIRECTORY, LAST_FILE`.
- **Organización:** Sube los archivos respetando la estructura de carpetas `YYYY/MM/DD/HH_MM_SS.jpg`.

**2. Ingesta de Datos (InfluxDB Uploader - `script_parse.py`)**

Este servicio lee los archivos CSV de irradiancia y los inserta en InfluxDB.

- **Carga Inicial:** Al arrancar, escanea todos los CSV existentes en el directorio, los ordena cronológicamente y carga todos los datos históricos que no estén en la base de datos (según lógica de inserción).
- **Monitoreo en Tiempo Real (Tailing):**
  - Identifica el archivo CSV más reciente (el "activo").
  - Mantiene el archivo abierto y lee continuamente las nuevas líneas que se agregan (similar a un `tail -f`).
  - Cada vez que se detecta un nuevo archivo CSV (rotación de log diaria), cierra el anterior y comienza a leer el nuevo desde el principio.
- **Formato:** Parsea fecha y hora (`YYYY-MM-DD HH:MM:SS`) y extrae las métricas `DNI`, `DHI` y `GHI` para crear puntos de datos en InfluxDB.

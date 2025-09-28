# Gestión de Datos

Este documento describe la lógica de los scripts de ingesta de datos y las consideraciones de almacenamiento en las bases de datos de SolarWeb.

-----

### Ingesta de Datos de Irradiancia (InfluxDB)

Los datos de irradiancia solar se almacenan en InfluxDB, una base de datos optimizada para series de tiempo. El servicio `influxdb-uploader` es el responsable de este proceso.

**Lógica del script:**

1.  **Entrada:** El script lee archivos `.csv` que contienen los datos de irradiancia.
2.  **Proceso inicial (lectura completa):** La primera vez que se ejecuta el contenedor, el script leerá y procesará **todos los archivos `.csv`** que se encuentren en el directorio especificado por la variable de entorno `INFLUXDB_UPLOAD_CSV_DIR`.
3.  **Proceso continuo (monitoreo):** Una vez que la lectura inicial ha finalizado, el script se mantendrá activo y monitoreará el directorio de forma constante. Si se agrega un nuevo archivo `.csv`, lo procesará y lo agregará a la base de datos automáticamente.
4.  **Formato esperado:** El archivo debe tener las siguientes columnas: `Fecha`, `Hora`, `DNI`, `DHI` y `GHI`.
5.  **Almacenamiento:** Cada registro se inserta en InfluxDB con un timestamp preciso, lo que permite consultas eficientes basadas en el tiempo.

Este proceso asegura que los datos crudos del sensor se transformen y se organicen de manera óptima para la visualización en el frontend.

-----

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
      * **Ejemplo:** La imagen de `*20250802213004*` se almacenará en la ruta `2025/08/02/21_30_04.jpg` dentro del bucket.

# Estructura del backend

## api

- Contiene los routers de **FastAPI** (@router.get, @router.post, etc)
- Aqui se crean los endpoints

## core

- Trata la configuración de la API
- Archivos:
    - config.py: carga variables de entorno (URLs de DB, claves, etc)

## models

- Se definen los **modelos base** que representan las entidades
- Con postgres se utiliza SQLAlchemy
- En influxDB y MinIO se utilizan modelos de Pydantic base que representan esta estructura

## schemas

- Define como se van a ver los request en la API
- Se utilizan los endpoints de api/ para validar la entrada y salida.

## services

- Aqui se trabaja con la base de datos o API's externas
- **Importante**: los endpoints llaman a services, nunca a la BD directamente

## db

- Se define los clients/conexiones a PostgreSQL, InfluxDB y MinIO.
- Aquí solo se inician los clientes y las funciones de conexión


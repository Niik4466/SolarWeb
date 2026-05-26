# Diagrama de Componentes
El diagrama de componentes muestra la arquitectura general del sistema, destacando los principales componentes y sus interacciones. Este diagrama se ha elaborado a partir del análisis del código fuente, la estructura de carpetas y la documentación disponible. Esto fue hecho con la herramienta Tree Command para visualizar la estructura del proyecto y luego se tradujo a un diagrama de componentes utilizando Mermaid.

```bash
tree -L 3 
```
se obtuvo la siguiente estructura del proyecto:
```mermaid
flowchart LR
    Usuario[Usuario] --> Frontend[Frontend Angular]

    subgraph FE[Frontend]
        Frontend --> AngularApp[Angular App]
        AngularApp --> Rutas[Rutas / Vistas]
        AngularApp --> Componentes[Componentes UI]
    end

    Frontend --> Caddy[Caddy / Proxy]
    Caddy --> Backend[Backend API]

    subgraph BE[Backend]
        Backend --> Main[main.py]
        Main --> API[API v1]
        API --> Services[Servicios]
        API --> Schemas[Schemas]
        API --> Models[Modelos]

        Services --> UserService[user_service]
        Services --> ImageService[image_service]
        Services --> IrradianceService[irradiance_service]
        Services --> ExportService[export_service]
        Services --> MailService[mail_service]
        Services --> MonitorService[monitor_service]
    end

    subgraph DATA[Servicios de datos]
        Postgres[(PostgreSQL)]
        InfluxDB[(InfluxDB)]
        MinIO[(MinIO)]
        DataFiles[Archivos CSV / Imágenes / Logs]
    end

    Models --> Postgres
    Services --> Postgres
    Services --> InfluxDB
    Services --> MinIO
    Services --> DataFiles

    subgraph INGESTA[Ingesta de datos]
        FileIngest[fileIngestDaemon]
        Parser[script_parse.py]
    end

    FileIngest --> DataFiles
    Parser --> InfluxDB
    FileIngest --> MinIO

    subgraph DEPLOY[Despliegue]
        Docker[Docker Compose]
        Docker --> Frontend
        Docker --> Backend
        Docker --> Postgres
        Docker --> InfluxDB
        Docker --> MinIO
        Docker --> Caddy
    end
```
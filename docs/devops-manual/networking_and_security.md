# Configuración de Red y Seguridad

Este documento detalla la configuración de red, la conectividad entre nodos y las consideraciones de seguridad en SolarWeb.

---

## Redes Docker y Composición

### En Desarrollo (docker-compose.yml)

En el entorno local, los servicios se comunican a través del nombre del contenedor como hostname:

- `influxdb-solarweb:8086` para InfluxDB
- `minio-solarweb:9000` para MinIO
- `postgres-solarweb:5432` para PostgreSQL
- `zerotier-solarweb` para la conectividad VPN

**Red predefinida:** Docker Compose crea automáticamente una red para que los servicios se comuniquen.

### En Producción (docker-compose-deploy.yml)

En producción se utiliza una red Docker externa llamada `red_taller_software`:

```bash
docker network create red_taller_software
```

Esta red debe crearse **antes** de levantar los servicios en producción. Los contenedores en esta red se comunican entre sí de forma aislada del host.

---

## Conectividad ZeroTier

ZeroTier proporciona una red privada virtual que permite la comunicación segura entre el Nodo de Datos y el Nodo de Despliegue, incluso estando en diferentes ubicaciones geográficas o redes diferentes.

### Configuración en Desarrollo

En el `docker-compose.yml`, ZeroTier se levanta con:

```yaml
zerotier:
  image: zyclonite/zerotier:latest
  container_name: zerotier-solarweb
  restart: unless-stopped
  network_mode: host
  devices:
    - /dev/net/tun
  cap_add:
    - NET_ADMIN
    - SYS_ADMIN
  volumes:
    - zerotier-data:/var/lib/zerotier-one
  environment:
    - ZT_NETWORK_ID=${ZT_NETWORK_ID}
  entrypoint: >
    sh -c "
      /usr/sbin/zerotier-one -d &&
      sleep 8 &&
      zerotier-cli join ${ZT_NETWORK_ID} &&
      tail -f /dev/null
    "
```

**Características:**

- `network_mode: host` - Accede directamente a la red del host para máximo rendimiento
- Requiere acceso al dispositivo `/dev/net/tun` para crear interfaces virtuales
- Requiere permisos especiales (`NET_ADMIN`, `SYS_ADMIN`)

### Configuración en Producción

En el `docker-compose-deploy.yml`, ZeroTier se integra directamente en el contenedor del backend:

```yaml
backend-solarweb:
  # ...
  volumes:
    - zerotier-data:/var/lib/zerotier-one
  cap_add:
    - NET_ADMIN
    - SYS_ADMIN
  devices:
    - /dev/net/tun
  # ...
```

El backend tiene acceso a ZeroTier a través de volúmenes compartidos, permitiendo que se comunique con el Nodo de Datos a través de la red privada.

### Creación de una Red ZeroTier

Para crear una nueva red ZeroTier:

1. **Registrarse en ZeroTier Central:** Accede a [https://my.zerotier.com](https://my.zerotier.com)
2. **Crear una red:** En el panel, crea una nueva red privada
3. **Obtener el ID:** El ID de la red (formato: 16 caracteres hexadecimales) se configura en la variable `ZT_NETWORK_ID`
4. **Autorizar nodos:** Los nodos que se unan a la red deben ser autorizados desde el panel de ZeroTier Central

### Variables de Entorno

```ini
# ID de la red ZeroTier privada
ZT_NETWORK_ID=xxxxxxxxxxxxxxx
```

---

## Consideraciones de Seguridad

### Autenticación de Servicios

- **PostgreSQL:** Usuario y contraseña configuradas en `.env`
- **InfluxDB:** Token de autenticación configurado en `.env`
- **MinIO:** Credenciales de acceso configuradas en `.env`
- **Resend API:** Token API para servicio de correos

### Comunicación entre Nodos

- La comunicación entre el Nodo de Despliegue y el Nodo de Datos ocurre únicamente a través de ZeroTier
- ZeroTier proporciona cifrado de extremo a extremo
- Los endpoints deben usar direcciones IP de ZeroTier, no IPs públicas

### Aislamiento de Puertos

En producción, se recomienda:

- **No exponer puertos del backend al host** (comentar `ports` en docker-compose-deploy.yml)
- **No exponer bases de datos** directamente (comentar `ports` en los servicios)
- **Usar Caddy** como proxy inverso para el frontend
- **Usar cortafuegos** a nivel del sistema operativo para restringir acceso

### Gestión de Secretos

Nunca incluir en el repositorio:

- Archivos `.env` con credenciales reales
- Claves API privadas
- Contraseñas de bases de datos

Utilizar un sistema de gestión de secretos o variables de entorno separadas para cada entorno (desarrollo, staging, producción).

---

## Troubleshooting de Conectividad

### Verificar estado de ZeroTier

```bash
# Dentro del contenedor ZeroTier o backend
zerotier-cli info          # Información del nodo
zerotier-cli listpeers     # Listar pares conectados
zerotier-cli listnetworks  # Listar redes a las que está unido
```

PD: para acceder a un contenedor docker en funcionamiento se puede utilizar

```bash
docker exec -it <nombre_del_contenedor> sh
```

### Logs de ZeroTier

Los logs se almacenan en el volumen `zerotier-data`. Para inspeccionar:

```bash
docker exec zerotier-solarweb tail -f /var/lib/zerotier-one/zerotier-one.log
```

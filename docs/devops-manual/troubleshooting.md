# Troubleshooting y Problemas Comunes

Esta guía documenta problemas conocidos y sus soluciones al desplegar la infraestructura de SolarWeb.

## Problemas de Red (ZeroTier y MTU)

### Síntoma

En el entorno de despliegue, la comunicación entre contenedores a través de ZeroTier es inestable o inexistente para transferencias de datos grandes (ej. subida de archivos, respuestas JSON extensas), aunque el ping funcione correctamente. Se observa pérdida de paquetes o timeouts en la aplicación.

### Causa

Esto ocurre debido a una discrepancia en el MTU (Maximum Transmission Unit) entre las distintas capas de red:

- **Red VPS**: Generalmente MTU 1400-1500 (depende del proveedor).
- **Red Docker**: Por defecto MTU 1500 (o 1280 si se configura bridge).
- **Red ZeroTier**: Por defecto MTU 2800.

Cuando ZeroTier intenta enviar paquetes grandes (UDP), estos se fragmentan al pasar por la red del VPS (que tiene un MTU menor). Si la fragmentación es excesiva o si algún firewall descarta fragmentos UDP, la conexión falla para paquetes grandes.

### Diagnóstico

Verificar el MTU de las interfaces de red en el host o dentro del contenedor de zerotier:

```bash
ip link
```

Si se observa que la interfaz física (ej. `eth0`) tiene un MTU inferior a 1500 (ej. 1400), es muy probable que este sea el problema.

### Solución

La solución recomendada es forzar a ZeroTier a usar **TCP** en lugar de UDP. TCP maneja mejor la segmentación y evita la fragmentación de paquetes UDP grandes que causa problemas en redes con MTU restrictivo.

**Pasos para aplicar la solución:**

1. Asegúrate de tener levantado el contenedor de backend (`grupo2_solarweb_backend`) que contiene el servicio de ZeroTier y haber aceptado el dispositivo en la red (my.zerotier.com).

2. Accede al directorio de configuración de ZeroTier (generalmente un volumen docker o ruta en el host):

   ```bash
   # Dentro del contenedor o en el volumen montado
   cd /var/lib/zerotier-one
   ```

3. Crea (o edita) el archivo `local.conf` para forzar el uso de TCP relay:

   ```bash
   echo '{
     "settings": {
       "forceTcpRelay": true
     }
   }' > local.conf
   ```

4. Reinicia el servicio o el contenedor para aplicar los cambios:

   ```bash
   docker restart grupo2_solarweb_backend
   ```

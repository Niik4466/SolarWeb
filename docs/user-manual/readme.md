# Manual de Usuario – Plataforma SolarWeb (UACh)

**Versión:** 2.0 – Noviembre 2025  
**URL:** [https://solarweb.inf.uach.cl](https://solarweb.inf.uach.cl)  

---

# 📌 1. Introducción
La plataforma **SolarWeb** de la Universidad Austral de Chile (UACh) permite:

- **Visualizar** datos de radiación solar mediante gráficos interactivos e imágenes del cielo despejado en distintas fechas.  
- **Exportar** datos históricos en distintos formatos para análisis externo.  

Este manual está dirigido a **usuarios generales, estudiantes, docentes e investigadores** que deseen consultar, analizar y descargar información proveniente de estaciones solares y sistemas asociados al Campus Miraflores.  

---

# 💻 2. Requisitos técnicos
- Navegador web actualizado (Chrome, Firefox o Edge).  
- Conexión a internet estable.   
- (Opcional) Software para abrir archivos **CSV** o **JSON** (Excel, Editor de texto, Python, R, etc.).  

---

# 🔑 3. Acceso a la plataforma
1. Ingresar a la URL oficial:  
   👉 [https://solarweb.inf.uach.cl](https://solarweb.inf.uach.cl)  
2. El sistema lo llevará a la pantalla de Inicio de Sesión.  

---
# 🔐 4. Iniciar sesión

## 4.1 Descripción
La pantalla de **Iniciar sesión** permite a usuarios aprobados acceder a la plataforma usando su correo electrónico institucional o personal registrado y su contraseña de SolarWeb.

---

## 4.2 Interfaz

La pantalla presenta los siguientes elementos:

### 📧 Campo de correo electrónico
- Debe ingresar un correo válido (ej: `usuario@ejemplo.cl`).
- Mensajes de error posibles:
  - **“El correo es obligatorio.”**
  - **“Formato de correo inválido.”**
  - **“No existe una cuenta con ese correo.”**

### 🔑 Campo de contraseña
- Requiere la contraseña asignada durante el registro.
- Mensajes de error posibles:
  - **“La contraseña es obligatoria.”**
  - **“Contraseña incorrecta.”**

### 👁️ Opción “Mostrar contraseña”
- Permite visualizar temporalmente lo escrito para evitar errores.

### ▶️ Botón “Ingresar”
- Envía las credenciales para validación.
- Mientras el sistema procesa, se mostrará: **“Ingresando…”**.

### ❓ Enlace “¿Olvidaste tu contraseña?”
- Envía al usuario al proceso de recuperación.

### 📝 Enlace “Solicitar registro”
- Disponible para usuarios sin cuenta aprobada.

---

## 4.3 Procedimiento para iniciar sesión

1. Escriba su **correo electrónico** registrado.  
2. Ingrese su **contraseña**.  
3. (Opcional) Active **Mostrar contraseña** para revisar lo escrito.  
4. Presione el botón **Ingresar**.  
5. Si las credenciales son correctas, será redirigido a la sección **Gráficos**.  
6. Si hay errores, revise los mensajes en pantalla y corrija los datos ingresados.

---

## 4.4 Recuperación de contraseña

Si olvidaste tu contraseña, la plataforma no permite restablecerla automáticamente. En su lugar, debes solicitar asistencia al administrador del sistema. Para hacerlo:

1. En la pantalla de inicio de sesión, haz clic en **¿Olvidaste tu contraseña?**.
2. Se abrirá la página **Recuperar contraseña**, donde se muestra el correo del administrador encargado.
3. Presiona el botón **Contactar administrador**.  
   - Esto abrirá tu aplicación de correo electrónico con un mensaje prellenado dirigido al administrador.
4. Envía la solicitud desde tu correo personal o institucional.
5. El administrador te contactará y te indicará cómo proceder para restablecer tu acceso.
6. Una vez restablecida tu contraseña, podrás volver a iniciar sesión normalmente.

También puedes regresar al inicio de sesión usando el enlace **Volver al inicio de sesión**.

---

## 4.5 Solicitar una cuenta nueva

Si no posee acceso a la plataforma, puede enviar una solicitud de registro siguiendo estos pasos:

1. Haga clic en **Solicitar registro** desde la pantalla de inicio de sesión.
2. Complete el formulario con los siguientes campos:
   - **Nombre** y **Apellido:** datos personales obligatorios.
   - **Correo electrónico:** debe ser válido y no estar registrado previamente.
   - **Confirmar correo electrónico:** debe coincidir exactamente con el correo ingresado.
   - **Contraseña:** clave que usará para iniciar sesión.
   - **Confirmar contraseña:** debe coincidir con la contraseña ingresada.
   - **Motivo de registro:** explicación breve del propósito de uso de SolarWeb (mínimo 150 caracteres).
   - (Opcional) **Mostrar contraseña:** permite visualizar las claves mientras escribe.
3. Revise que todos los campos coincidan y cumplan las validaciones solicitadas.
4. Presione **Enviar solicitud** para enviar su registro al equipo administrador.
5. Su solicitud será revisada manualmente. Si es aprobada, podrá iniciar sesión normalmente utilizando el correo y contraseña que registró.

---

# 📊 5. Sección **Gráficos**

### 5.1 Descripción
Permite seleccionar un día y visualizar:  
- **Gráfico de irradiancia vs. tiempo** (Global, Directa, Difusa).  
- **Imágenes del cielo** captadas en distintos horarios del día.  

### 5.2 Interfaz
- **Selector de fecha**: calendario y botón *Buscar*.  
- **Gráfico de irradiancia** (izquierda):  
  - Eje X: tiempo del día.  
  - Eje Y: irradiancia en W/m².  
  - **Leyenda interactiva**: Global (azul), Directa (verde), Difusa (naranja). Puedes hacer clic en cada etiqueta para ocultar/mostrar la curva correspondiente.  
- **Visor de imágenes** (derecha):  
  - Barra de tiempo inferior para desplazarse entre horas.  
  - Controles de reproducción (adelante/atrás).  
  - Imagen ampliada del cielo en el horario seleccionado.  

### 5.3 Procedimiento
1. Seleccione una fecha en el calendario.  
2. Haga clic en **Buscar**.  
3. El sistema mostrará los datos disponibles de irradiancia y las imágenes asociadas.  
4. Use la leyenda para activar/desactivar curvas.  
5. Desplacése en la barra de tiempo para ver imágenes en distintos momentos del día.  

---
# 📥 6. Sección **Exportar**

### 6.1 Descripción general
Permite **descargar datos en bruto** de irradiación y otras variables en formato **CSV o JSON**, de manera **diaria** o por **rangos de fechas**.  

### 6.2 Interfaz principal
- **Granularidad**:  
  - **Diario** → datos de uno o varios días.  
  - **Rango** → datos entre dos fechas.  
- **Variables**: GHI, DNI, DHI. 
- **Formato**: CSV o JSON.  
- **Incluir imágenes**: opción para adjuntar imágenes de la cámara solar.  
- **Botón Exportar**: genera la descarga.  

### 6.3 Procedimiento

#### A) Exportación diaria
1. Seleccionar **Diario**.  
2. Escoger las fechas deseadas usando el calendario, para cada día seleccionado apretar el botón "Agregar".  
3. Seleccionar variables de interés.  
4. Elegir formato (CSV/JSON).  
5. (Opcional) Marcar **Incluir imágenes**.  
6. Presionar **Exportar** → se descargarán los archivos deseados.  

#### B) Exportación por rango
1. Seleccionar **Rango**.  
2. Definir fecha **inicio** y **término**.  
3. Seleccionar variables de interés.  
4. Elegir formato (CSV/JSON).  
5. (Opcional) Incluir imágenes.  
6. Presionar **Exportar** → se descargará un archivo ZIP con datos e imágenes.  

### 6.4 Casos de uso
- Descargar un solo día para análisis puntual.  
- Exportar un mes completo para análisis estadístico.  
- Obtener datos junto a imágenes para validación visual.  

---
# 7. Sección **Solicitudes** (solo administradores)

Esta pantalla permite a los usuarios con rol **administrador** revisar, aprobar o rechazar las solicitudes de registro enviadas por nuevos usuarios.

---

### 7.1 Interfaz general

La vista muestra:

- **Barra de búsqueda**  
  - Campo: *“Buscar por nombre o correo…”*.  
  - Filtra la tabla según el texto ingresado.

- **Selector de orden**  
  - **Más recientes primero**  
  - **Más antiguos primero**  
  - **Nombre (A–Z)**  
  - **Correo (A–Z)**  

- **Tabla de solicitudes**  
  Columnas:
  - **Nombre solicitante**: nombre ingresado en el formulario de registro.  
  - **Correo**: correo asociado a la cuenta solicitada.  
  - **Fecha solicitud**: fecha y hora en que se envió la solicitud.  
  - **Justificación**: botón **Ver** para revisar el motivo de registro completo.  
  - **Acciones**:  
    - Botón **✖** (rechazar).  
    - Botón **✔** (aprobar).

Mensajes especiales:
- **“No hay solicitudes pendientes.”** → cuando el backend no tiene solicitudes.  
- **“No hay resultados para la búsqueda.”** → cuando el filtro no encuentra coincidencias.

---

### 7.2 Ver la justificación de una solicitud

1. En la tabla, ubique la fila de la persona que desea revisar.  
2. Haga clic en el botón **Ver** en la columna *Justificación*.  
3. Se abrirá un modal con:
   - Nombre del solicitante.  
   - Correo.  
   - Justificación completa.  
4. Presione **Cerrar** para volver a la tabla.

---

### 7.3 Aprobar o rechazar una solicitud

1. En la fila correspondiente, vaya a la columna **Acciones**.  
2. Para **aprobar**:
   - Haga clic en el botón **✔**.  
   - Se abrirá un modal de confirmación.  
   - Seleccione el **tipo de permiso**:
     - **Administrador**  
     - **Usuario estándar**  
   - Haga clic en **Confirmar** para otorgar acceso.  
3. Para **rechazar**:
   - Haga clic en el botón **✖**.  
   - En el modal, confirme con **Sí, denegar** si desea rechazar la solicitud.  
4. En ambos casos, la solicitud desaparecerá de la lista una vez procesada.

Solo los usuarios con rol **administrador** pueden acceder y operar esta sección.

---
# 8. Sección **Usuarios** (solo administradores)

Esta pantalla permite a los usuarios con rol **administrador** gestionar las cuentas aprobadas de la plataforma: revisar su historial de uso, eliminarlas y restaurarlas.

---

### 8.1 Interfaz principal

La vista se divide en:

- **Barra de búsqueda**
  - Campo: *“Buscar por nombre o correo…”*.
  - Filtra en tiempo real la lista de usuarios visibles.

- **Selector de orden**
  - **Más recientes primero**
  - **Más antiguos primero**
  - **Nombre (A–Z)**
  - **Correo (A–Z)**  
  Además, la columna **Fecha de aprobación** permite alternar el orden (↑ / ↓) haciendo clic en el encabezado.

- **Tabla de usuarios activos**
  Columnas:
  - **Nombre usuario**  
  - **Correo**  
  - **Rol**  
    - Muestra una “pill” indicando **Administrador** o **Usuario estándar**.
  - **Fecha de aprobación**  
  - **Historial**  
    - Botón **⟳** para ver el historial de exportaciones del usuario.
  - **Eliminar**  
    - Botón **✖** para eliminar usuarios estándar.  
    - Los administradores muestran **—** (no pueden eliminarse desde aquí).

Si no hay resultados tras filtrar, se muestra **“Sin resultados”**.

- **Botón “🗑 Usuarios eliminados”**
  - Abre la vista de usuarios que han sido eliminados (papelera).

---

### 8.2 Ver el historial de un usuario

1. Localice al usuario en la tabla.  
2. Haga clic en el botón **⟳** de la columna **Historial**.  
3. Se abrirá un modal con:
   - Nombre y correo del usuario.
   - Fecha de aprobación.
   - Tabla de interacciones:
     - **Fecha interacción**
     - **Tipo exportación** (días / rango, etc.)
     - **Fechas** seleccionadas.
     - **Detalles** (variables, imágenes, etc.).
   - Mensajes posibles:
     - **“Sin eventos registrados”** si no hay historial.
     - **“Cargando historial…”** mientras se consulta la información.
4. Presione **Cerrar** para volver a la tabla.

---

### 8.3 Eliminar (desactivar) un usuario activo

> Nota: los usuarios con rol **Administrador** no se pueden eliminar desde esta pantalla.

1. Busque al usuario que desea desactivar.  
2. En la columna **Eliminar**, haga clic en el botón **✖**.  
3. Se abrirá un modal de confirmación con el nombre del usuario.  
4. Haga clic en **Eliminar** para confirmar, o en **Cancelar** para abortar.  
5. El usuario desaparecerá de la lista de activos y pasará a **Usuarios eliminados**, desde donde podrá restaurarse.

---

### 8.4 Gestionar usuarios eliminados

1. Haga clic en el botón **🗑 Usuarios eliminados**.  
2. Se abrirá un modal con una tabla que incluye:
   - **Nombre usuario**
   - **Correo**
   - **Eliminado el**
   - **Historial** (⟳, igual que en usuarios activos)
   - **Restaurar** (botón *Restaurar*)
   - **Borrar** (botón *Eliminar*)

Acciones disponibles:

- **Restaurar un usuario**
  1. Haga clic en **Restaurar** en la fila correspondiente.
  2. El usuario volverá a la lista principal de usuarios activos.

- **Eliminar definitivamente**
  1. Haga clic en **Eliminar** en la fila correspondiente.
  2. Se abrirá un modal de confirmación indicando que la acción es permanente.
  3. Haga clic en **Eliminar definitivamente** para borrar la cuenta de forma irreversible.  
     (Esta acción no se puede deshacer.)

Al pie del modal se muestra el mensaje:
> “Los usuarios eliminados serán borrados de forma permanente después de **30 días**.”

3. Cierre el modal con el botón **✕** cuando termine de revisar la información.

---

# 🛠️ 9. Solución de problemas

| Problema | Causa probable | Solución |
|----------|----------------|----------|
| Gráfico en blanco | No hay datos para el período | Probar con otro rango de fechas |
| Descarga vacía | Período sin registros | Verificar disponibilidad de datos |
| CSV no abre en Excel | Separador distinto | Usar “Importar datos” en Excel y definir separador “coma” |
| Archivo muy pesado | Rango extenso + imágenes | Exportar en períodos más cortos |

---

# 📚 10. Anexos

**Glosario**  
- **GHI**: Irradiancia Global Horizontal.  
- **DNI**: Irradiancia Directa Normal.  
- **DHI**: Irradiancia Difusa Horizontal.  
- **CSV**: Formato de texto separado por comas.  
- **JSON**: Formato de datos estructurados en texto.  


---

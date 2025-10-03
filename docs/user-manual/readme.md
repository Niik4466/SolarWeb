# Manual de Usuario – Plataforma SolarWeb (UACh)

**Versión:** 1.0 – Octubre 2025  
**URL:** [https://solarweb.inf.uach.cl](https://solarweb.inf.uach.cl)  

---

## 📌 1. Introducción
La plataforma **SolarWeb** de la Universidad Austral de Chile (UACh) permite:

- **Visualizar** datos de radiación solar mediante gráficos interactivos e imágenes del cielo despejado en distintas fechas.  
- **Exportar** datos históricos en distintos formatos para análisis externo.  

Este manual está dirigido a **usuarios generales, estudiantes, docentes e investigadores** que deseen consultar, analizar y descargar información proveniente de estaciones solares y sistemas asociados al Campus Miraflores.  

---

## 💻 2. Requisitos técnicos
- Navegador web actualizado (Chrome, Firefox o Edge).  
- Conexión a internet estable.   
- (Opcional) Software para abrir archivos **CSV** o **JSON** (Excel, Editor de texto, Python, R, etc.).  

---

## 🔑 3. Acceso a la plataforma
1. Ingresar a la URL oficial:  
   👉 [https://solarweb.inf.uach.cl](https://solarweb.inf.uach.cl)  
2. Desde el menú principal se puede navegar entre las secciones:  
   - **Gráficos**  
   - **Exportar**  

---

## 📊 4. Sección **Gráficos**

### 4.1 Descripción
Permite seleccionar un día y visualizar:  
- **Gráfico de irradiancia vs. tiempo** (Global, Directa, Difusa).  
- **Imágenes del cielo** captadas en distintos horarios del día.  

### 4.2 Interfaz
- **Selector de fecha**: calendario y botón *Buscar*.  
- **Gráfico de irradiancia** (izquierda):  
  - Eje X: tiempo del día.  
  - Eje Y: irradiancia en W/m².  
  - **Leyenda interactiva**: Global (azul), Directa (verde), Difusa (naranja). Puedes hacer clic en cada etiqueta para ocultar/mostrar la curva correspondiente.  
- **Visor de imágenes** (derecha):  
  - Barra de tiempo inferior para desplazarse entre horas.  
  - Controles de reproducción (adelante/atrás).  
  - Imagen ampliada del cielo en el horario seleccionado.  

### 4.3 Procedimiento
1. Seleccione una fecha en el calendario.  
2. Haga clic en **Buscar**.  
3. El sistema mostrará los datos disponibles de irradiancia y las imágenes asociadas.  
4. Use la leyenda para activar/desactivar curvas.  
5. Desplacése en la barra de tiempo para ver imágenes en distintos momentos del día.  

---

## 📥 5. Sección **Exportar**

### 5.1 Descripción general
Permite **descargar datos en bruto** de irradiación y otras variables en formato **CSV o JSON**, de manera **diaria** o por **rangos de fechas**.  

### 5.2 Interfaz principal
- **Granularidad**:  
  - **Diario** → datos de uno o varios días.  
  - **Rango** → datos entre dos fechas.  
- **Variables**: GHI, DNI, DHI. 
- **Formato**: CSV o JSON.  
- **Incluir imágenes**: opción para adjuntar imágenes de la cámara solar.  
- **Botón Exportar**: genera la descarga.  

### 5.3 Procedimiento

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

### 5.4 Casos de uso
- Descargar un solo día para análisis puntual.  
- Exportar un mes completo para análisis estadístico.  
- Obtener datos junto a imágenes para validación visual.  

---

## 🛠️ 6. Solución de problemas

| Problema | Causa probable | Solución |
|----------|----------------|----------|
| Gráfico en blanco | No hay datos para el período | Probar con otro rango de fechas |
| Descarga vacía | Período sin registros | Verificar disponibilidad de datos |
| CSV no abre en Excel | Separador distinto | Usar “Importar datos” en Excel y definir separador “coma” |
| Archivo muy pesado | Rango extenso + imágenes | Exportar en períodos más cortos |

---

## 📚 7. Anexos

**Glosario**  
- **GHI**: Irradiancia Global Horizontal.  
- **DNI**: Irradiancia Directa Normal.  
- **DHI**: Irradiancia Difusa Horizontal.  
- **CSV**: Formato de texto separado por comas.  
- **JSON**: Formato de datos estructurados en texto.  


---

# Casos de Prueba — HU-1I: Seleccionar fecha para ver datos e imágenes

> **Objetivo HU**: Permitir seleccionar una fecha; actualizar gráfico e imagen; mostrar mensaje claro si no hay datos.

---

## F-1I-01 | Calendario visible y fecha actual preseleccionada
**Propósito:** Validación  
**Clasificación:** Caja negra; Automatizada; Dinámica; Funcional  
**SUT:** Componente calendario.  
**Pasos:** Abrir `/graficos`.  
**Resultado esperado:** Calendario desplegable; “hoy” destacado.  
**Oráculo:** Aserciones DOM.  

---

## F-1I-02 | Cambio de fecha actualiza gráfico e imagen
**Propósito:** Validación  
**Clasificación:** Caja negra; Automatizada; Dinámica; Funcional (Sanidad)  
**SUT:** Calendario + `irradiance-chart` + imagen.  
**Datos:** Seleccionar fecha con datos.  
**Pasos:** Elegir fecha D; esperar actualización.  
**Resultado esperado:** Curvas y la imagen corresponden a D.  
**Oráculo:** Interceptar request y validar fecha; comprobar DOM.  

---

## F-1I-03 | Mensaje claro cuando no hay datos
**Propósito:** Validación  
**Clasificación:** Caja negra; Automatizada; Dinámica; Funcional  
**SUT:** Vista `/graficos`.  
**Datos:** Seleccionar fecha sin datos.  
**Resultado esperado:** Mensaje “No hay datos para la fecha seleccionada”.  
**Oráculo:** Aserción DOM; no hay errores en consola.  

---

## NF-1I-01 | Usabilidad: claridad de feedback
**Propósito:** No funcional → Usabilidad  
**Clasificación:** Caja negra; Manual; Dinámica  
**SUT:** Calendario y estados vacíos/errores.  
**Pasos:** Sesión con 3–5 usuarios; medir tiempo para seleccionar fecha y entender feedback.  
**Resultado esperado:** Tiempo medio < 30 s; comprensión ≥ 80%.  
**Oráculo:** Notas + métricas.  

---

## S-1I-01 | Verificación estática: reglas y formato de fecha
**Propósito:** Verificación  
**Clasificación:** Caja blanca; Estática  
**SUT:** Código del componente calendario.  
**Pasos:** Revisión de reglas (min/max, locales, accesibilidad).  
**Resultado esperado:** Sin hardcodes de timezone; strings localizados.  
**Oráculo:** Checklist y diff de cambios.  

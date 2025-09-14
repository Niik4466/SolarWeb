# Casos de Prueba — HU-12I: Ver datos de irradiancia e imagen del cielo (día actual)

> **Objetivo HU**: Mostrar gráfico con 3 curvas (global, directa, difusa) del día actual + imagen del cielo del día actual. Debe ser responsive, minimalista y con tiempos de carga ≤ 3 s.

---

## F-12I-01 | Render 3 curvas del día actual (Humo)
**Propósito:** Validación  
**Clasificación:** Accesibilidad=Caja negra; Ejecución=Automatizada (E2E); Método=Dinámica; Alcance=Funcional (Humo)  
**SUT:** Página `/graficos` + componente `irradiance-chart`  
**Suposiciones/Dependencias:** Backend operativo con dataset del día actual; ruta `/graficos` configurada.  
**Datos (Input):** Fecha = hoy (YYYY-MM-DD).  
**Setup:** App levantada en `http://localhost:4200`.  
**Pasos:**  
1. Abrir `/graficos`.  
2. Esperar render del gráfico.  
**Resultado esperado:** Se visualizan **tres** curvas con leyenda (Global, Directa, Difusa).  
**Oráculo:** Aserciones E2E sobre DOM/SVG (existencia de 3 series y leyendas).  
**Teardown:** Cerrar navegador.  
**Evidencias:** Captura del gráfico renderizado.

---

## F-12I-02 | Imagen del cielo del día actual visible
**Propósito:** Validación  
**Clasificación:** Caja negra; Automatizada (E2E); Dinámica; Funcional (Sanidad)  
**SUT:** Componente de imagen del cielo.  
**Datos:** Fecha = hoy con imagen disponible.  
**Pasos:** Abrir `/graficos`.  
**Resultado esperado:** `<img>` visible con `alt="Cielo - YYYY-MM-DD"`.  
**Oráculo:** Aserciones DOM (visible, `src` no vacío, `alt` correcto).  
**Evidencias:** Captura.

---

## F-12I-03 | Datos corresponden al día actual
**Propósito:** Validación  
**Clasificación:** Caja gris; Automatizada; Dinámica; Funcional (Sanidad)  
**SUT:** Servicio de datos + `irradiance-chart`.  
**Datos:** Mock/respuesta incluye campo `date=YYYY-MM-DD(hoy)`.  
**Pasos:** Interceptar request y validar payload (E2E).  
**Resultado esperado:** La fecha en datos == hoy; ejes/tooltip muestran horas del día actual.  
**Oráculo:** Aserción sobre respuesta interceptada + DOM.  

---

## F-12I-04 | Minimalismo/claridad de curvas
**Propósito:** Validación UX  
**Clasificación:** Caja negra; Manual; Dinámica; Funcional (UAT/Exploratoria)  
**SUT:** `irradiance-chart` + estilos.  
**Pasos:** Inspeccionar densidad de información (colores, grosor, rejillas, leyenda).  
**Resultado esperado:** Diferencias entre curvas claras; sin elementos distractores.  
**Oráculo:** Checklist UX (aprobado/rechazado).  
**Evidencias:** Captura comparativa.

---

## F-12I-05 | Responsive (mobile/desktop)
**Propósito:** Validación  
**Clasificación:** Caja negra; Semiautomática; Dinámica; Funcional (Compatibilidad de layout)  
**SUT:** Página `/graficos`.  
**Pasos:** Probar viewports 360×640 y 1440×900.  
**Resultado esperado:** Sin scroll horizontal; imagen y gráfico no se superponen; tipografías legibles.  
**Oráculo:** Verificación visual + screenshots.  

---

## NF-12I-01 | Rendimiento: tiempo de carga ≤ 3 s
**Propósito:** No funcional → Rendimiento (Carga)  
**Clasificación:** Caja negra; Automatizada; Dinámica  
**SUT:** `/graficos` + carga de datos/imagen.  
**Datos:** Red “normal” simulada (Fast 3G/4G).  
**Pasos:** Medir `DOMContentLoaded`, primer render del gráfico y disponibilidad de imagen.  
**Resultado esperado:** p95 ≤ 3.0 s.  
**Oráculo:** Script que exporta métricas a CSV.  
**Evidencias:** CSV + gráfico de tiempos.

---

## NF-12I-02 | Compatibilidad (Chrome/Firefox/Edge)
**Propósito:** No funcional → Compatibilidad  
**Clasificación:** Caja negra; Semiautomática; Dinámica  
**SUT:** `/graficos`.  
**Pasos:** Ejecutar suite en 3 navegadores.  
**Resultado esperado:** Mismo resultado funcional/visual.  
**Oráculo:** Screenshots por navegador.  

---

## S-12I-01 | Verificación estática: accesibilidad básica
**Propósito:** Verificación (sin ejecutar)  
**Clasificación:** Caja blanca; Estática  
**SUT:** Templates y estilos.  
**Pasos:** Linter + checklist de accesibilidad (alt de imágenes, contraste mínimo, labels).  
**Resultado esperado:** 0 issues bloqueantes.  
**Oráculo:** Reporte de linter/checklist.  

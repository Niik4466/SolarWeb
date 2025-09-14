# Casos de Prueba — HU-9I: Menú de pestañas (Gráficos, Exportación, Admin)

> **Objetivo HU**: Separar funciones por pestañas; mostrar solo la funcionalidad correspondiente; indicar pestaña activa claramente.

---

## F-9I-01 | Menú de pestañas muestra pestaña activa
**Propósito:** Validación  
**Clasificación:** Caja negra; Automatizada; Dinámica; Funcional (Humo)  
**SUT:** Navbar/tabs.  
**Pasos:** Navegar entre “Gráficos” y “Exportación”.  
**Resultado esperado:** Indicador de pestaña activa claro; foco accesible.  
**Oráculo:** Aserciones DOM (aria-selected/estados).  

---

## F-9I-02 | Carga perezosa por pestaña
**Propósito:** Verificación + Validación  
**Clasificación:** Caja blanca (estática) + Caja negra (dinámica); Autom/Estática; Funcional  
**SUT:** Configuración de rutas y módulos/componentes.  
**Pasos (estática):** Revisar lazy routes y división de bundles.  
**Pasos (dinámica):** Medir que al cambiar de pestaña no se cargan módulos ajenos.  
**Resultado esperado:** Lazy-loading efectivo.  
**Oráculo:** Revisión de código + tamaño de bundles en red.  

---

## F-9I-03 | Cada pestaña carga solo su funcionalidad
**Propósito:** Validación  
**Clasificación:** Caja negra; Automatizada; Dinámica; Funcional (Regresión)  
**SUT:** Router + vistas.  
**Pasos:** Abrir “Exportación”; confirmar que `irradiance-chart` **no** está montado.  
**Resultado esperado:** No hay componentes de otras pestañas.  
**Oráculo:** Aserciones DOM.  

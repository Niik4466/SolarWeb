# Casos de Prueba — HU-2U: Registro de usuario

> **Objetivo HU**: Permitir a un usuario solicitar registro, validando unicidad de correo, match de contraseñas y almacenamiento seguro.

---

## F-2U-01 | Correo único
**Propósito:** Validación  
**Clasificación:** Caja negra; Automatizada; Dinámica; Funcional  
**SUT:** Formulario de registro + backend.  
**Datos:** Usuario con correo ya existente.  
**Resultado esperado:** Mensaje de error “El correo ya existe”; no se registra.  
**Oráculo:** Aserción de respuesta/DOM.  

---

## F-2U-02 | Contraseñas y correos deben coincidir
**Propósito:** Validación  
**Clasificación:** Caja negra; Automatizada; Dinámica; Funcional (Sanidad)  
**SUT:** Validaciones de formulario.  
**Datos:** Contraseñas distintas.  
**Resultado esperado:** Mensaje de error “Las contraseñas no coinciden”.  
**Oráculo:** DOM.  

---

## NF-2U-01 | Seguridad — Hash de contraseñas
**Propósito:** Verificación/Seguridad  
**Clasificación:** Caja blanca; Estática; No funcional → Seguridad  
**SUT:** Código backend.  
**Pasos:** Revisar que contraseñas se guardan encriptadas.  
**Resultado esperado:** Ninguna contraseña en texto plano.  
**Oráculo:** Revisión de código/linter.  

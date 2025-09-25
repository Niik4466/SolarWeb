# Genesis del proyecto de angular
## Instalacion de Node.js
    Descarga e instala Node.js desde su [sitio oficial](https://nodejs.org/).
## Instalacion de Angular CLI y creacion del proyecto
    Abre una terminal y ejecuta los siguientes comandos:
    ```bash
    npm install -g @angular/cli // Instala Angular CLI globalmente
    ng new SolarWeb // Crea un nuevo proyecto llamado SolarWeb
    cd SolarWeb // Navega al directorio del proyecto
    ng serve    // Inicia el servidor de desarrollo
    ng build --prod // Compila el proyecto para producción
    ```
    Referencia: https://angular.dev/installation


# Cómo ejecutar la página con Angular

Sigue estos pasos para ejecutar tu aplicación Angular:

1. **Instalar dependencias**  
    Asegúrate de tener Node.js y npm instalados. Luego, ejecuta:
    ```bash
    npm install
    ```

2. **Iniciar el servidor de desarrollo**  
    Usa el siguiente comando para iniciar el servidor:
    ```bash
    ng serve
    ```

3. **Abrir en el navegador**  
    Por defecto, la aplicación estará disponible en [http://localhost:4200](http://localhost:4200).

4. **Compilar para producción (opcional)**  
    Si necesitas generar una versión optimizada:
    ```bash
    ng build --prod
    ```

¡Listo! Ahora puedes trabajar con tu aplicación Angular.


## Crear un entorno virtual (venv) en Python

Si necesitas trabajar con Python en tu proyecto, puedes crear un entorno virtual para aislar las dependencias. Sigue estos pasos:

1. **Instalar Python**  
    Asegúrate de tener Python instalado en tu sistema. Puedes verificarlo con:
    ```bash
    python --version
    ```

2. **Crear el entorno virtual**  
    Ejecuta el siguiente comando en la terminal:
    ```bash
    python -m venv venv
    ```
    Esto creará una carpeta llamada `venv` en tu proyecto.

3. **Activar el entorno virtual**  
    - En Windows:
      ```bash
      venv\Scripts\activate
      ```
    - En macOS/Linux:
      ```bash
      source venv/bin/activate
      ```

4. **Instalar dependencias**  
    Una vez activado el entorno, instala las dependencias necesarias con:
    ```bash
    pip install -r requirements.txt
    ```

5. **Desactivar el entorno virtual**  
    Cuando termines, puedes desactivar el entorno con:
    ```bash
    deactivate
    ```

¡Listo! Ahora tienes un entorno virtual configurado para tu proyecto.


## Cómo ejecutar una aplicación con FastAPI

Sigue estos pasos para ejecutar tu aplicación FastAPI:

1. **Instalar dependencias**  
    Asegúrate de tener Python instalado. Luego, instala FastAPI y un servidor ASGI como `uvicorn`:
    ```bash
    pip install fastapi uvicorn
    ```
    
3. **Ejecutar el servidor**  
    Usa el siguiente comando para iniciar el servidor:
    ```bash
    uvicorn main:app --reload
    ```

4. **Abrir en el navegador**  
    Por defecto, la aplicación estará disponible en [http://127.0.0.1:8000](http://127.0.0.1:8000).  
    También puedes acceder a la documentación interactiva en [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

¡Listo! Ahora puedes trabajar con tu aplicación FastAPI.
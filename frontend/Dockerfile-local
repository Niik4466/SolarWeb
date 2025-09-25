# Imagen base con Node.js
FROM node:20-alpine

# Crear directorio de trabajo
WORKDIR /usr/src/app

# Instalar Angular CLI globalmente
RUN npm install -g @angular/cli

# Copiar package.json y package-lock.json desde app/
COPY app/package*.json ./

# Instalar dependencias
RUN npm install

# Copiar todo el proyecto Angular
COPY app/ .

# Exponer el puerto que usa Angular (por defecto 4200)
EXPOSE 4200

# Comando por defecto: levantar el servidor de desarrollo
CMD ["ng", "serve", "--host", "0.0.0.0"]

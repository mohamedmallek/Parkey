# ---- Etape 1 : build Angular ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build -- --configuration production

# ---- Etape 2 : image d'execution (Nginx sert les fichiers statiques) ----
FROM nginx:1.27-alpine

# Backend interroge par defaut via le nom du Service Kubernetes (namespace
# parkey). Surchargeable au lancement du conteneur (docker run -e ... /
# env du Deployment k8s) si le backend vit ailleurs.
ENV BACKEND_UPSTREAM=http://pothole-spring-api:8080

# nginx.conf.template est substitue automatiquement au demarrage par
# l'entrypoint de l'image officielle (envsubst sur /etc/nginx/templates/).
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist/pothole-angular/browser /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:80/health || exit 1

CMD ["nginx", "-g", "daemon off;"]

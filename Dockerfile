# Image de production du site
FROM node:22-alpine

ENV NODE_ENV=production TZ=Europe/Paris
RUN apk add --no-cache tzdata
WORKDIR /app

# Dépendances d'abord (mise en cache des couches Docker)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY public ./public
COPY database ./database

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

# Installe / met à jour la base, puis démarre le serveur
CMD ["sh", "-c", "node src/migrate.js && exec node src/server.js"]

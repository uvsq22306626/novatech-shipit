# ---- Étape 1 : build ----
FROM node:20-alpine AS build

WORKDIR /app

# Copie des fichiers de dépendances
COPY package*.json ./

# Installation des dépendances de production uniquement
RUN npm install --omit=dev

# ---- Étape 2 : image finale ----
FROM node:20-alpine

WORKDIR /app

# Création d’un utilisateur non-root pour la sécurité
RUN addgroup -S app && adduser -S app -G app

# Copie des dépendances depuis l’étape build
COPY --from=build /app/node_modules ./node_modules

# Copie du code source
COPY src ./src
COPY package*.json ./

# Basculer sur l’utilisateur non-root
USER app

# Le service écoute sur le port 3004
EXPOSE 3004

# Commande de démarrage
CMD ["node", "src/index.js"]

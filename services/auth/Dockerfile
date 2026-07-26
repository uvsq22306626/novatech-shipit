# ---- Étape 1 : build ----
# On part d'une image Node.js légère (alpine = version minimale)
FROM node:20-alpine AS build

WORKDIR /app

# On copie d'abord les fichiers de dépendances uniquement
COPY package*.json ./

# Installation des dépendances de production uniquement
RUN npm install --omit=dev

# ---- Étape 2 : image finale ----
FROM node:20-alpine

WORKDIR /app

# On crée un utilisateur non-root pour la sécurité
RUN addgroup -S app && adduser -S app -G app

# On récupère les dépendances déjà installées à l'étape build
COPY --from=build /app/node_modules ./node_modules

# On copie le code source
COPY src ./src
COPY package*.json ./

# On bascule sur l'utilisateur non-root
USER app

# Le service écoute sur le port 3001
EXPOSE 3001

# Commande de démarrage
CMD ["node", "src/index.js"]

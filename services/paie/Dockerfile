FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

FROM node:20-alpine
WORKDIR /app
RUN addgroup -S hrflow && adduser -S hrflow -G hrflow
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY package.json ./
USER hrflow
EXPOSE 3002
CMD ["node", "src/index.js"]

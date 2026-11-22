FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json* bun.lock* ./
RUN npm install --omit=dev

COPY server.ts ./
COPY server ./server
COPY firebase-applet-config.json ./

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "server.ts"]

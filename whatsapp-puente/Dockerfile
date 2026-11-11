# Puente de WhatsApp de LIFE. Corre prendido siempre; la sesión va cifrada a LIFE, así que el disco puede ser efímero.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY puente.mjs ./
ENV NODE_ENV=production DATOS=/app/datos
USER node
CMD ["node", "puente.mjs"]

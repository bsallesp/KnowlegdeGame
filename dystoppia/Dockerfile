FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

# ─── Runner ───────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# TLS para PostgreSQL Azure + engines Prisma no Alpine
RUN apk add --no-cache ca-certificates openssl libc6-compat

ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

# Standalone Next.js output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Prisma: schema + config + migrations + full @prisma scope + pg adapter
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/pg ./node_modules/pg

# Azure SDK dependencies (control panel uses DefaultAzureCredential + ARM clients)
COPY --from=builder /app/node_modules/@azure ./node_modules/@azure
COPY --from=builder /app/node_modules/uuid ./node_modules/uuid

# Recreate the .bin/prisma symlink so startup.sh can call prisma migrate deploy
RUN mkdir -p node_modules/.bin && \
    ln -sf /app/node_modules/prisma/build/index.js node_modules/.bin/prisma && \
    chmod +x node_modules/prisma/build/index.js

COPY startup.sh ./
RUN sed -i 's/\r$//' /app/startup.sh && chmod +x /app/startup.sh

EXPOSE 8080
CMD ["/bin/sh", "/app/startup.sh"]

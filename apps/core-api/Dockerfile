# syntax=docker/dockerfile:1.7
# Build from the repository root:
#   docker build -f apps/core-api/Dockerfile -t algomemtor-core .
# One image runs the API (default) and (target `migrate`) the Prisma
# migrations and idempotent seed. Queued sync and memory jobs run inside the
# API process when activity wakes them; there are no worker services.

ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
# Prisma's config reads DATABASE_URL even for `generate`; no connection is made.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY package.json package-lock.json ./
COPY packages/shared-contracts/package.json packages/shared-contracts/
COPY apps/core-api/package.json apps/core-api/
COPY apps/web/package.json apps/web/
COPY apps/core-api/prisma apps/core-api/prisma
COPY apps/core-api/prisma.config.ts apps/core-api/
RUN npm ci --workspace packages/shared-contracts --workspace apps/core-api \
      --include-workspace-root --no-audit --no-fund

FROM deps AS build
COPY packages/shared-contracts packages/shared-contracts
COPY apps/core-api apps/core-api
RUN npm run build:contracts && npm run build:core

# Migrations and seed need the Prisma CLI and tsx (dev dependencies).
FROM build AS migrate
WORKDIR /app/apps/core-api
ENV NODE_ENV=production
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed"]

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared-contracts/package.json packages/shared-contracts/
COPY apps/core-api/package.json apps/core-api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --ignore-scripts --workspace packages/shared-contracts \
      --workspace apps/core-api --include-workspace-root --no-audit --no-fund \
    && npm cache clean --force
COPY --from=build /app/packages/shared-contracts/dist packages/shared-contracts/dist
COPY --from=build /app/apps/core-api/dist apps/core-api/dist
WORKDIR /app/apps/core-api
USER node
ENV PORT=3001
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]

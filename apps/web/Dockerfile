# syntax=docker/dockerfile:1.7
# Build from the repository root:
#   docker build -f apps/web/Dockerfile \
#     --build-arg VITE_SUPABASE_URL=... \
#     --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=... \
#     --build-arg PUBLIC_SITE_URL=https://app.example.com -t algomemtor-web .
# Only public, browser-safe values are build arguments; never pass a secret.

ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS build
RUN apt-get update \
    && apt-get install -y --no-install-recommends zip \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared-contracts/package.json packages/shared-contracts/
COPY apps/web/package.json apps/web/
COPY apps/core-api/package.json apps/core-api/
RUN npm ci --ignore-scripts --workspace packages/shared-contracts \
      --workspace apps/web --include-workspace-root --no-audit --no-fund
COPY packages/shared-contracts packages/shared-contracts
COPY apps/browser-extension apps/browser-extension
COPY apps/web apps/web

ARG PUBLIC_SITE_URL=http://localhost:8080
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_CHROME_EXTENSION_URL=
ARG VITE_FIREFOX_EXTENSION_URL=
# The browser calls the API through the same origin (nginx proxies /api), and
# the connector extension talks to that same public origin.
ENV VITE_CORE_API_URL=${PUBLIC_SITE_URL} \
    VITE_USE_MOCKS=false \
    VITE_SUPABASE_URL=${VITE_SUPABASE_URL} \
    VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY} \
    VITE_CHROME_EXTENSION_URL=${VITE_CHROME_EXTENSION_URL} \
    VITE_FIREFOX_EXTENSION_URL=${VITE_FIREFOX_EXTENSION_URL} \
    ALGOMEMTOR_WEB_URL=${PUBLIC_SITE_URL} \
    ALGOMEMTOR_API_URL=${PUBLIC_SITE_URL}
RUN npm run build:contracts && npm run build:extension && npm run build:web

FROM nginxinc/nginx-unprivileged:1.29-alpine AS runtime
ENV CORE_API_UPSTREAM=http://core-api:3001
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1

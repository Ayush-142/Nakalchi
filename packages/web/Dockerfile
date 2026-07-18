# Build context is the monorepo root (see docker-compose.prod.yml) - npm
# workspaces resolution and @nakalchi/core's own build both need the full repo.

FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/service/package.json packages/service/package.json
COPY packages/web/package.json packages/web/package.json
RUN npm ci

COPY tsconfig.base.json tsconfig.json ./
COPY packages/core packages/core
COPY packages/web packages/web

# Same fresh-clone fix as packages/service/Dockerfile - @nakalchi/core must
# be built before Next can resolve it.
RUN npm run build --workspace=@nakalchi/core

# NAKALCHI_API_BASE_URL/NAKALCHI_API_KEY are read server-side at REQUEST time
# (packages/web/src/lib/api.ts's getConfig(), gated behind `import 'server-only'`)
# - not NEXT_PUBLIC_* vars, so they are NOT baked in here. They're supplied at
# container runtime via docker-compose.prod.yml's nakalchi-web `environment:`,
# same as docker-compose.yml already does for local dev.
RUN npm run build --workspace=@nakalchi/web

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Next's `output: standalone` (packages/web/next.config.ts) traces the
# monorepo dependency subset needed to run - with outputFileTracingRoot set
# to the repo root, that trace lands at .next/standalone/packages/web/server.js
# plus a pruned node_modules, all still rooted under packages/web/.next/standalone
# because `next build` itself ran with cwd=packages/web. Static assets are
# deliberately NOT included in standalone output (Next's own documented
# behavior) and must be copied in separately.
COPY --from=builder /app/packages/web/.next/standalone ./
COPY --from=builder /app/packages/web/.next/static ./packages/web/.next/static

WORKDIR /app/packages/web
CMD ["node", "server.js"]

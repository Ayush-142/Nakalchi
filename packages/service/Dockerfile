# Shared image for both nakalchi-api and nakalchi-worker (docker-compose.prod.yml
# picks the entrypoint via `command:` - one build, two containers). Build context
# is the monorepo root (see docker-compose.prod.yml's `build.context: .`), because
# npm workspaces resolution and @nakalchi/core's own build both need the full repo,
# not just packages/service - same reason docker-compose.yml's dev-mode `command`
# builds core first before starting the service.

FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/service/package.json packages/service/package.json
COPY packages/web/package.json packages/web/package.json
RUN npm ci

COPY tsconfig.base.json tsconfig.json ./
COPY packages/core packages/core
COPY packages/service packages/service

# @nakalchi/core resolves to ./dist/index.js (see its package.json's "main"/
# "exports") and dist/ is gitignored with no prepare/postinstall hook - this
# build step is the fix for the exact fresh-clone gap docker-compose.yml's
# comments and BUGLOG.md already document for local dev.
RUN npm run build --workspace=@nakalchi/core
RUN npm run build --workspace=@nakalchi/service
RUN npm prune --omit=dev

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/core/package.json ./packages/core/package.json
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/service/package.json ./packages/service/package.json
COPY --from=builder /app/packages/service/dist ./packages/service/dist

# No default CMD - docker-compose.prod.yml sets `command:` per service
# (nakalchi-api -> dist/server.js, nakalchi-worker -> dist/queue/analysisWorker.js),
# since this one image serves both.

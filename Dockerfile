# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1 CI=true
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY packages/db/package.json packages/db/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

COPY packages packages
COPY apps apps
RUN pnpm --filter @ombre/shared test

# ---- API: one bundled file, plus the migration command and its SQL files ----
FROM build AS api-build
RUN pnpm --filter @ombre/api build

FROM node:22-alpine AS api
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 OMBRE_MIGRATIONS_DIR=/app/migrations
COPY --from=api-build --chown=node:node /repo/apps/api/dist ./
COPY --from=api-build --chown=node:node /repo/packages/db/migrations ./migrations
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/v1/health || exit 1
CMD ["node", "server.mjs"]

# ---- Web: prerendered public pages ----
FROM build AS web-build
# Public pages are prerendered: these values are fixed when the image is built.
ARG OMBRE_BRAND_NAME=Ombrè
ARG OMBRE_SITE_URL=http://localhost:3210
ARG OMBRE_INDEXABLE=false
ARG OMBRE_BOOKINGS_OPEN=false
ARG OMBRE_CONTACT_EMAIL=
ENV OMBRE_BRAND_NAME=$OMBRE_BRAND_NAME \
    OMBRE_SITE_URL=$OMBRE_SITE_URL \
    OMBRE_INDEXABLE=$OMBRE_INDEXABLE \
    OMBRE_BOOKINGS_OPEN=$OMBRE_BOOKINGS_OPEN \
    OMBRE_CONTACT_EMAIL=$OMBRE_CONTACT_EMAIL
RUN pnpm --filter @ombre/web build

FROM node:22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=web-build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1
CMD ["node", "apps/web/server.js"]

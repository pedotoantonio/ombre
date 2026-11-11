# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1 CI=true
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

COPY packages packages
COPY apps apps

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

RUN pnpm --filter @ombre/shared test && pnpm --filter @ombre/web build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1

COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1
CMD ["node", "apps/web/server.js"]

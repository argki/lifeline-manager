# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; else pnpm install; fi
COPY tsconfig.json tsconfig.server.json vite.config.ts vitest.config.ts ./
COPY index.html* ./
COPY assets ./assets
COPY src ./src
RUN pnpm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3456
ENV DATA_DIR=/app/data

COPY package.json pnpm-lock.yaml* ./
RUN if [ -f pnpm-lock.yaml ]; then pnpm install --prod --frozen-lockfile; else pnpm install --prod; fi
COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/data
EXPOSE 3456

CMD ["node", "dist/server/index.js"]

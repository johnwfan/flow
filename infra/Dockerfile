# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# ---- prune: cut the workspace down to @flow/api + its deps (incl. @flow/shared) ----
FROM base AS pruner
WORKDIR /app
COPY . .
RUN pnpm dlx turbo prune @flow/api --docker

# ---- build: install against the pruned lockfile, then build ----
FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/tsconfig.json ./tsconfig.json
RUN pnpm turbo run build --filter=@flow/api

# ---- runtime: slim image ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app ./
EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]

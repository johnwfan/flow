# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# ---- prune: cut the workspace down to @flow/api + @flow/web + their shared deps ----
FROM base AS pruner
WORKDIR /app
COPY . .
RUN pnpm dlx turbo prune @flow/api @flow/web --docker

# ---- build: install against the pruned lockfile, then build both apps ----
FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/tsconfig.json ./tsconfig.json
RUN pnpm turbo run build --filter=@flow/api --filter=@flow/web

# ---- runtime: slim image running both services ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app ./
EXPOSE 3000 3001

COPY infra/start.sh /app/start.sh
RUN chmod +x /app/start.sh
CMD ["/app/start.sh"]

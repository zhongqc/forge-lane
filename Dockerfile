FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@11.9.0
WORKDIR /app
ENV pnpm_config_store_dir=/pnpm/store
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,id=forge-pnpm,target=/pnpm/store SKIP_INSTALL_SIMPLE_GIT_HOOKS=1 pnpm install --frozen-lockfile --store-dir /pnpm/store --network-concurrency=8 --fetch-timeout=600000
COPY . .
RUN pnpm db:generate && pnpm build
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
EXPOSE 3001
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/server/apps/server/src/main.js"]

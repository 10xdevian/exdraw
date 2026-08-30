FROM node:20-alpine
WORKDIR /app

RUN npm install -g pnpm turbo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/ws-backend ./apps/ws-backend

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @repo/db run generate
RUN pnpm --filter ws-backend run build

WORKDIR /app/apps/ws-backend
CMD ["pnpm", "start"]

# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN \
  if [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm install; \
  elif [ -f yarn.lock ]; then corepack enable yarn && yarn install; \
  else npm install; \
  fi

FROM base AS builder
COPY package.json ./
COPY tsconfig.json ./
COPY src ./src
COPY --from=deps /app/node_modules ./node_modules
RUN npm run build

FROM node:20-alpine AS runner
ARG BUILD_TIME=unknown
ENV NODE_ENV=production
ENV BUILD_TIME=${BUILD_TIME}
WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
EXPOSE 21000
CMD ["node", "dist/server.js"]

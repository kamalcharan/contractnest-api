# Multi-stage build for production optimization
FROM node:18-alpine AS base

RUN apk add --no-cache \
    python3 \
    py3-pip \
    make \
    g++ \
    curl

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Dependencies stage
FROM base AS deps
RUN npm ci --only=production && npm cache clean --force

# Build stage
FROM base AS builder

# Copy everything needed for building
COPY . .

RUN npm ci --include=dev
RUN npm run build

# Runtime stage
FROM node:18-alpine AS runner
WORKDIR /app

RUN apk add --no-cache \
    python3 \
    py3-pip \
    curl \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 contractnest

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

RUN chown -R contractnest:nodejs /app
USER contractnest

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

CMD ["npm", "start"]

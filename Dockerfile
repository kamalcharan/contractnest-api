# Multi-stage build for production optimization
FROM node:18-alpine AS base

# Install system dependencies for future AI/ML libraries
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

# Production dependencies stage
FROM base AS deps
RUN npm ci --only=production && npm cache clean --force

# Build stage
FROM base AS builder
RUN npm ci --include=dev
COPY . .
RUN npm run build

# Runtime stage
FROM node:18-alpine AS runner
WORKDIR /app

# Install system dependencies for production
RUN apk add --no-cache \
    python3 \
    py3-pip \
    curl \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 contractnest

# Copy built application
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Set ownership
RUN chown -R contractnest:nodejs /app

# Switch to non-root user
USER contractnest

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

# Start application
CMD ["npm", "start"]
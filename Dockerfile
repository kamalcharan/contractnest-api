FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci --legacy-peer-deps

# Copy tsconfig
COPY tsconfig.json ./

# Copy source code explicitly
COPY src ./src

# DEBUG: Check what files were copied
RUN echo "=== Contents of src/controllers ===" && ls -la src/controllers/
RUN echo "=== Checking for authController.ts ===" && ls -la src/controllers/authController.ts || echo "FILE NOT FOUND"
RUN echo "=== First few lines of auth.ts ===" && head -20 src/routes/auth.ts

# Build TypeScript (compiles to dist/)
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --legacy-peer-deps --only=production

# Copy compiled JavaScript from builder
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the compiled app
CMD ["node", "dist/index.js"]
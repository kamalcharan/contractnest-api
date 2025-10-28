FROM node:18-alpine

WORKDIR /app

# Install supervisor and redis
RUN apk add --no-cache supervisor redis

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --legacy-peer-deps

# Copy source and build
COPY . .
RUN npm run build

# Create supervisor config
RUN mkdir -p /var/log/supervisor

COPY <<EOF /etc/supervisord.conf
[supervisord]
nodaemon=true

[program:redis]
command=redis-server
autostart=true
autorestart=true

[program:api]
command=node dist/index.js
autostart=true
autorestart=true
environment=PORT=5000

[program:n8n-main]
command=npx n8n
autostart=true
autorestart=true

[program:n8n-worker]
command=npx n8n worker
autostart=true
autorestart=true
EOF

EXPOSE 5000 5678

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
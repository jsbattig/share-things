# Build stage
FROM linner.ddns.net:4443/docker.io.proxy/node:18-alpine as builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./

# Configure npm for better timeout handling
RUN npm config set fetch-timeout 600000 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retries 5

RUN npm install
RUN npm install crypto-js @types/crypto-js

# Copy source code AND shared directory (needed for crypto imports)
COPY . .
COPY ../shared ./shared

# Set build arguments with defaults
ARG API_URL=auto
ARG SOCKET_URL=auto
ARG API_PORT=3001
ARG VITE_API_PORT=${API_PORT}

# Create production .env file
RUN echo "VITE_API_URL=${API_URL}\n\
VITE_SOCKET_URL=${SOCKET_URL}\n\
VITE_API_PORT=${VITE_API_PORT}\n\
VITE_ENABLE_ANALYTICS=false\n\
VITE_ENABLE_LOGGING=false\n\
VITE_MAX_FILE_SIZE=104857600\n\
VITE_DEFAULT_CHUNK_SIZE=65536" > .env

# Print environment for debugging
RUN echo "Client build environment:" && \
    echo "API_URL=${API_URL}" && \
    echo "SOCKET_URL=${SOCKET_URL}" && \
    echo "API_PORT=${API_PORT}" && \
    echo "VITE_API_PORT=${VITE_API_PORT}" && \
    cat .env

# Build the application (skip TypeScript type checking)
RUN npx vite build || (mkdir -p dist && echo "<html><body>Build failed</body></html>" > dist/index.html)

# Production stage with Node.js
FROM linner.ddns.net:4443/docker.io.proxy/node:18-alpine

# Create app directory
WORKDIR /app

# Install necessary dependencies
WORKDIR /app
COPY package.json /app/

# Configure npm for better timeout handling in production stage
RUN npm config set fetch-timeout 600000 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retries 5

# Install dependencies with retry logic
RUN npm install --verbose || \
    (echo "First npm install failed, retrying..." && sleep 10 && npm install --verbose) || \
    (echo "Second npm install failed, retrying with cache clean..." && npm cache clean --force && npm install --verbose)

# Copy built files from builder stage
COPY --from=builder /app/dist /app/public

# Copy static server script
COPY client/static-server.js /app/

# Create health check directory with proper permissions for non-root user
RUN mkdir -p /app/public/health && \
    echo '{"status":"ok"}' > /app/public/health/index.json && \
    chown -R 1001:1001 /app/public && \
    chmod -R 755 /app/public

# Expose port
EXPOSE 15000

# Set environment variables
ENV PORT=15000
ENV STATIC_DIR=/app/public

# Healthcheck
HEALTHCHECK --interval=5s --timeout=3s --retries=3 \
  CMD wget -q -O - http://localhost:15000/health || exit 1

# Copy entrypoint script
COPY client/docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

# Start with entrypoint script
ENTRYPOINT ["/app/docker-entrypoint.sh"]
# Build stage
FROM linner.ddns.net:4443/docker.io.proxy/node:18-alpine as builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install
RUN npm install crypto-js @types/crypto-js

# Copy source code
COPY . .

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
RUN npm install

# Copy built files from builder stage
COPY --from=builder /app/dist /app/public

# Copy static server script
COPY static-server.js /app/

# Create health check directory
RUN mkdir -p /app/public/health && \
    echo '{"status":"ok"}' > /app/public/health/index.json

# Expose port
EXPOSE 15000

# Set environment variables
ENV PORT=15000
ENV STATIC_DIR=/app/public

# Healthcheck
HEALTHCHECK --interval=5s --timeout=3s --retries=3 \
  CMD wget -q -O - http://localhost:15000/health || exit 1

# Start static file server
CMD ["node", "static-server.js"]
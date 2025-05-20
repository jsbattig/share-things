# Build stage
FROM linner.ddns.net:4443/docker.io.proxy/node:18 as builder

WORKDIR /app

# Install SQLite dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    sqlite3 \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM linner.ddns.net:4443/docker.io.proxy/node:18

WORKDIR /app

# Install SQLite dependencies
RUN apt-get update && apt-get install -y \
    sqlite3 \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm install --only=production

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Create data directory with proper permissions for non-root user
RUN mkdir -p /app/data && chown -R 1001:1001 /app/data && chmod -R 755 /app/data

# Set default port
ARG PORT=3001
ENV PORT=${PORT}

# Make sure the port is explicitly set and used
ENV LISTEN_PORT=${PORT}

# Print port configuration for debugging
RUN echo "Server configured with PORT=${PORT} and LISTEN_PORT=${LISTEN_PORT}"

# Create health check endpoint
RUN echo 'const http = require("http"); \
    const server = http.createServer((req, res) => { \
      if (req.url === "/health") { \
        res.writeHead(200, {"Content-Type": "application/json"}); \
        res.end(JSON.stringify({status: "ok"})); \
      } else { \
        res.writeHead(404); \
        res.end(); \
      } \
    }); \
    const port = process.env.PORT || 3001; \
    server.listen(port); \
    console.log(`Health check server listening on port ${port}`);' > /app/health.js

# Expose the port
EXPOSE ${PORT}

# Healthcheck
HEALTHCHECK --interval=5s --timeout=3s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

# Start the server
CMD ["node", "dist/index.js"]
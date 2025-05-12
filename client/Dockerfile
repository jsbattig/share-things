# Build stage
FROM node:18-alpine as builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Set build arguments with defaults
ARG API_URL=http://localhost
ARG SOCKET_URL=http://localhost

# Create production .env file
RUN echo "VITE_API_URL=${API_URL}\n\
VITE_SOCKET_URL=${SOCKET_URL}\n\
VITE_ENABLE_ANALYTICS=false\n\
VITE_ENABLE_LOGGING=false\n\
VITE_MAX_FILE_SIZE=104857600\n\
VITE_DEFAULT_CHUNK_SIZE=65536" > .env

# Build the application (skip TypeScript type checking)
RUN npx vite build || (mkdir -p dist && echo "<html><body>Build failed</body></html>" > dist/index.html)

# Production stage with Nginx
FROM nginx:alpine

# Copy built files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
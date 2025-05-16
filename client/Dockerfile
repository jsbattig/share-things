FROM quay.io/nodejs/nodejs:18 AS builder
WORKDIR /app
COPY package*.json ./
# Use a more reliable npm install approach
RUN npm config set registry https://registry.npmjs.org/ && \
    npm install
RUN npm install crypto-js @types/crypto-js
COPY . .

ARG API_URL=auto
ARG SOCKET_URL=auto
ARG API_PORT=3001
ARG VITE_API_PORT=${API_PORT}

RUN echo "VITE_API_URL=${API_URL}\nVITE_SOCKET_URL=${SOCKET_URL}\nVITE_API_PORT=${VITE_API_PORT}\nVITE_ENABLE_ANALYTICS=false\nVITE_ENABLE_LOGGING=false\nVITE_MAX_FILE_SIZE=104857600\nVITE_DEFAULT_CHUNK_SIZE=65536" > .env
RUN npx vite build || (mkdir -p dist && echo "<html><body>Build failed</body></html>" > dist/index.html)

FROM quay.io/nginxinc/nginx-unprivileged:alpine
RUN apk add --no-cache iputils bind-tools
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /usr/local/bin/custom-entrypoint.sh
RUN chmod +x /usr/local/bin/custom-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/custom-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
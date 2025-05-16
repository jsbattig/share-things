FROM registry.access.redhat.com/ubi8/nodejs-18:latest AS builder
WORKDIR /app
COPY package*.json ./
# Use a more reliable npm install approach
RUN npm config set registry https://registry.npmjs.org/ && \
    npm install
COPY . .
RUN npm run build

FROM registry.access.redhat.com/ubi8/nodejs-18:latest
WORKDIR /app
COPY package*.json ./
RUN npm install --only=production
COPY --from=builder /app/dist ./dist

ARG PORT=3001
ENV PORT=${PORT}
ENV LISTEN_PORT=${PORT}

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

EXPOSE ${PORT}

CMD ["node", "dist/index.js"]
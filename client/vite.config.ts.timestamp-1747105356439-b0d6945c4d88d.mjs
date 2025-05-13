// vite.config.ts
import { defineConfig, loadEnv } from "file:///app/node_modules/vite/dist/node/index.js";
import react from "file:///app/node_modules/@vitejs/plugin-react/dist/index.mjs";
import viteTsconfigPaths from "file:///app/node_modules/vite-tsconfig-paths/dist/index.mjs";
import svgrPlugin from "file:///app/node_modules/vite-plugin-svgr/dist/index.mjs";
import path from "path";
import fs from "fs";
var __vite_injected_original_dirname = "/app";
function loadBackendUrl() {
  try {
    const envPath = path.resolve(__vite_injected_original_dirname, ".env.backend");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf8");
      const match = content.match(/BACKEND_URL=(.+)/);
      if (match && match[1]) {
        console.log(`Loaded backend URL from .env.backend: ${match[1]}`);
        return match[1];
      }
    }
  } catch (error) {
    console.error("Error loading backend URL:", error);
  }
  return "http://localhost:3001";
}
var backendUrl = loadBackendUrl();
var vite_config_default = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [
      react(),
      viteTsconfigPaths(),
      svgrPlugin()
    ],
    resolve: {
      alias: {
        "@": path.resolve(__vite_injected_original_dirname, "./src")
      }
    },
    server: {
      port: 3e3,
      host: "0.0.0.0",
      // Bind to all network interfaces
      open: false,
      proxy: {
        "/socket.io": {
          target: backendUrl,
          ws: true
        },
        "/api": {
          target: backendUrl,
          changeOrigin: true
        }
      }
    },
    build: {
      outDir: "dist",
      sourcemap: true
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvYXBwXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvYXBwL3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9hcHAvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcsIGxvYWRFbnYgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgdml0ZVRzY29uZmlnUGF0aHMgZnJvbSAndml0ZS10c2NvbmZpZy1wYXRocyc7XG5pbXBvcnQgc3ZnclBsdWdpbiBmcm9tICd2aXRlLXBsdWdpbi1zdmdyJztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IGZzIGZyb20gJ2ZzJztcblxuLy8gRnVuY3Rpb24gdG8gbG9hZCBiYWNrZW5kIFVSTCBmcm9tIC5lbnYuYmFja2VuZCBmaWxlXG5mdW5jdGlvbiBsb2FkQmFja2VuZFVybCgpIHtcbiAgdHJ5IHtcbiAgICAvLyBUcnkgdG8gcmVhZCB0aGUgLmVudi5iYWNrZW5kIGZpbGVcbiAgICBjb25zdCBlbnZQYXRoID0gcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy5lbnYuYmFja2VuZCcpO1xuICAgIGlmIChmcy5leGlzdHNTeW5jKGVudlBhdGgpKSB7XG4gICAgICBjb25zdCBjb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKGVudlBhdGgsICd1dGY4Jyk7XG4gICAgICBjb25zdCBtYXRjaCA9IGNvbnRlbnQubWF0Y2goL0JBQ0tFTkRfVVJMPSguKykvKTtcbiAgICAgIGlmIChtYXRjaCAmJiBtYXRjaFsxXSkge1xuICAgICAgICBjb25zb2xlLmxvZyhgTG9hZGVkIGJhY2tlbmQgVVJMIGZyb20gLmVudi5iYWNrZW5kOiAke21hdGNoWzFdfWApO1xuICAgICAgICByZXR1cm4gbWF0Y2hbMV07XG4gICAgICB9XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGxvYWRpbmcgYmFja2VuZCBVUkw6JywgZXJyb3IpO1xuICB9XG4gIFxuICAvLyBEZWZhdWx0IGZhbGxiYWNrXG4gIHJldHVybiAnaHR0cDovL2xvY2FsaG9zdDozMDAxJztcbn1cblxuLy8gR2V0IHRoZSBiYWNrZW5kIFVSTFxuY29uc3QgYmFja2VuZFVybCA9IGxvYWRCYWNrZW5kVXJsKCk7XG5cbi8vIGh0dHBzOi8vdml0ZWpzLmRldi9jb25maWcvXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoKHsgbW9kZSB9KSA9PiB7XG4gIC8vIExvYWQgZW52IHZhcmlhYmxlc1xuICBjb25zdCBlbnYgPSBsb2FkRW52KG1vZGUsIHByb2Nlc3MuY3dkKCksICcnKTtcbiAgXG4gIHJldHVybiB7XG4gICAgcGx1Z2luczogW1xuICAgICAgcmVhY3QoKSxcbiAgICAgIHZpdGVUc2NvbmZpZ1BhdGhzKCksXG4gICAgICBzdmdyUGx1Z2luKCksXG4gICAgXSxcbiAgICByZXNvbHZlOiB7XG4gICAgICBhbGlhczoge1xuICAgICAgICAnQCc6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuL3NyYycpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHNlcnZlcjoge1xuICAgICAgcG9ydDogMzAwMCxcbiAgICAgIGhvc3Q6ICcwLjAuMC4wJywgLy8gQmluZCB0byBhbGwgbmV0d29yayBpbnRlcmZhY2VzXG4gICAgICBvcGVuOiBmYWxzZSxcbiAgICAgIHByb3h5OiB7XG4gICAgICAgICcvc29ja2V0LmlvJzoge1xuICAgICAgICAgIHRhcmdldDogYmFja2VuZFVybCxcbiAgICAgICAgICB3czogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgJy9hcGknOiB7XG4gICAgICAgICAgdGFyZ2V0OiBiYWNrZW5kVXJsLFxuICAgICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBidWlsZDoge1xuICAgICAgb3V0RGlyOiAnZGlzdCcsXG4gICAgICBzb3VyY2VtYXA6IHRydWUsXG4gICAgfSxcbiAgfTtcbn0pOyJdLAogICJtYXBwaW5ncyI6ICI7QUFBOEwsU0FBUyxjQUFjLGVBQWU7QUFDcE8sT0FBTyxXQUFXO0FBQ2xCLE9BQU8sdUJBQXVCO0FBQzlCLE9BQU8sZ0JBQWdCO0FBQ3ZCLE9BQU8sVUFBVTtBQUNqQixPQUFPLFFBQVE7QUFMZixJQUFNLG1DQUFtQztBQVF6QyxTQUFTLGlCQUFpQjtBQUN4QixNQUFJO0FBRUYsVUFBTSxVQUFVLEtBQUssUUFBUSxrQ0FBVyxjQUFjO0FBQ3RELFFBQUksR0FBRyxXQUFXLE9BQU8sR0FBRztBQUMxQixZQUFNLFVBQVUsR0FBRyxhQUFhLFNBQVMsTUFBTTtBQUMvQyxZQUFNLFFBQVEsUUFBUSxNQUFNLGtCQUFrQjtBQUM5QyxVQUFJLFNBQVMsTUFBTSxDQUFDLEdBQUc7QUFDckIsZ0JBQVEsSUFBSSx5Q0FBeUMsTUFBTSxDQUFDLENBQUMsRUFBRTtBQUMvRCxlQUFPLE1BQU0sQ0FBQztBQUFBLE1BQ2hCO0FBQUEsSUFDRjtBQUFBLEVBQ0YsU0FBUyxPQUFPO0FBQ2QsWUFBUSxNQUFNLDhCQUE4QixLQUFLO0FBQUEsRUFDbkQ7QUFHQSxTQUFPO0FBQ1Q7QUFHQSxJQUFNLGFBQWEsZUFBZTtBQUdsQyxJQUFPLHNCQUFRLGFBQWEsQ0FBQyxFQUFFLEtBQUssTUFBTTtBQUV4QyxRQUFNLE1BQU0sUUFBUSxNQUFNLFFBQVEsSUFBSSxHQUFHLEVBQUU7QUFFM0MsU0FBTztBQUFBLElBQ0wsU0FBUztBQUFBLE1BQ1AsTUFBTTtBQUFBLE1BQ04sa0JBQWtCO0FBQUEsTUFDbEIsV0FBVztBQUFBLElBQ2I7QUFBQSxJQUNBLFNBQVM7QUFBQSxNQUNQLE9BQU87QUFBQSxRQUNMLEtBQUssS0FBSyxRQUFRLGtDQUFXLE9BQU87QUFBQSxNQUN0QztBQUFBLElBQ0Y7QUFBQSxJQUNBLFFBQVE7QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLE1BQU07QUFBQTtBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sT0FBTztBQUFBLFFBQ0wsY0FBYztBQUFBLFVBQ1osUUFBUTtBQUFBLFVBQ1IsSUFBSTtBQUFBLFFBQ047QUFBQSxRQUNBLFFBQVE7QUFBQSxVQUNOLFFBQVE7QUFBQSxVQUNSLGNBQWM7QUFBQSxRQUNoQjtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsSUFDQSxPQUFPO0FBQUEsTUFDTCxRQUFRO0FBQUEsTUFDUixXQUFXO0FBQUEsSUFDYjtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=

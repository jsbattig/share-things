import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import viteTsconfigPaths from 'vite-tsconfig-paths';
import svgrPlugin from 'vite-plugin-svgr';
import path from 'path';
import fs from 'fs';

// Function to load backend URL from .env.backend file
function loadBackendUrl() {
  try {
    // Try to read the .env.backend file
    const envPath = path.resolve(__dirname, '.env.backend');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(/BACKEND_URL=(.+)/);
      if (match && match[1]) {
        console.log(`Loaded backend URL from .env.backend: ${match[1]}`);
        return match[1];
      }
    }

    // Try to read the .env file for VITE_API_PORT
    const mainEnvPath = path.resolve(__dirname, '.env');
    if (fs.existsSync(mainEnvPath)) {
      const content = fs.readFileSync(mainEnvPath, 'utf8');
      const match = content.match(/VITE_API_PORT=(.+)/);
      if (match && match[1]) {
        const apiPort = match[1].trim();
        console.log(`Using API port from .env: ${apiPort}`);
        return `http://localhost:${apiPort}`;
      }
    }
  } catch (error) {
    console.error('Error loading backend URL:', error);
  }
  
  // Default fallback
  console.log('Using default backend URL: http://localhost:15001');
  return 'http://localhost:15001';
}

// Get the backend URL
const backendUrl = loadBackendUrl();

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env variables but don't use them directly in this config
  loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [
      react(),
      viteTsconfigPaths(),
      svgrPlugin(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0', // Bind to all network interfaces
      open: false,
      proxy: {
        '/socket.io': {
          target: backendUrl,
          ws: true,
        },
        '/api': {
          target: backendUrl,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      // Optimize chunk splitting for better caching
      rollupOptions: {
        output: {
          manualChunks: {
            // Separate vendor chunks for better caching
            'react-vendor': ['react', 'react-dom'],
            'chakra-vendor': ['@chakra-ui/react', '@emotion/react', '@emotion/styled'],
            'icons': ['react-icons'],
            'crypto': ['crypto-js'],
            'socket': ['socket.io-client'],
            'router': ['react-router-dom']
          }
        }
      },
      // Set chunk size warning limit
      chunkSizeWarningLimit: 600,
      // Enable tree shaking
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true, // Remove console logs in production
          drop_debugger: true
        }
      }
    },
  };
});
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_SOCKET_URL: string;
  readonly VITE_ENABLE_ANALYTICS: string;
  readonly VITE_ENABLE_LOGGING: string;
  readonly VITE_MAX_FILE_SIZE: string;
  readonly VITE_DEFAULT_CHUNK_SIZE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
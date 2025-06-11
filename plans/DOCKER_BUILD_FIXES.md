# Docker Build Fixes for Production Deployment

## Problem Analysis

The ShareThings application was failing to build in production due to incorrect Docker build contexts. The issue was that both server and client Dockerfiles were copying the wrong `package.json` files, leading to missing dependencies during the build process.

### Root Cause

1. **Server Dockerfile Issue**: 
   - Line 16: `COPY package*.json ./` correctly copied `server/package.json`
   - Line 17: `RUN npm install` correctly installed server dependencies
   - Line 20: `COPY . .` **OVERWROTE** the correct `package.json` with the root `package.json`
   - Line 23: `RUN npm run build` used the wrong dependencies, causing build failures

2. **Client Dockerfile Issue**:
   - Line 7: `COPY package*.json ./` copied the **root** `package.json` instead of `client/package.json`
   - This meant React, Chakra UI, and other client dependencies were never installed
   - TypeScript compilation failed with "Cannot find module" errors

## Fixes Applied

### 1. Server Dockerfile (`server/Dockerfile`)

**Before:**
```dockerfile
# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .
```

**After:**
```dockerfile
# Copy package files and install dependencies
COPY server/package*.json ./
RUN npm install

# Copy source code
COPY server/ .
COPY shared/ ./shared
```

**Also fixed production stage:**
```dockerfile
# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
```

### 2. Client Dockerfile (`client/Dockerfile`)

**Before:**
```dockerfile
# Copy package files and install dependencies
COPY package*.json ./
```

**After:**
```dockerfile
# Copy package files and install dependencies
COPY client/package*.json ./
```

**Also fixed production stage:**
```dockerfile
COPY client/package.json /app/
```

## Why This Fixes the Issue

1. **Correct Dependencies**: Each container now installs the correct dependencies for its component
2. **No Overwriting**: Server package.json is no longer overwritten by root package.json
3. **Proper Build Context**: Each Dockerfile only copies files relevant to its component
4. **Shared Directory**: Server gets access to shared crypto utilities for tests

## Expected Results

- ✅ Server build will succeed with all SQLite, Express, and Socket.IO dependencies
- ✅ Client build will succeed with all React, Chakra UI, and Vite dependencies  
- ✅ TypeScript compilation will work in both containers
- ✅ Production deployment will work on fresh repository clones

## Testing

To test these fixes:
1. Run `./setup.sh --uninstall` to clean up
2. Run `./setup.sh` to rebuild with the fixed Dockerfiles
3. Verify both containers build and start successfully
# Project File Organization Cleanup Plan

Based on my analysis of the current project structure, I've created a detailed plan to reorganize the files, moving build scripts and configuration files to a 'build' directory, ensuring test files are in the 'test' directory, and keeping only essential documentation in the root.

## 1. Directory Structure Changes

```
share-things/
├── build/                  # New directory for build scripts and configuration
│   ├── scripts/            # Build scripts
│   └── config/             # Configuration files
├── test/                   # Existing test directory (will be expanded)
│   ├── e2e/                # End-to-end tests (already exists)
│   ├── unit/               # New directory for unit tests
│   └── config/             # Test configuration files
├── client/                 # Existing client directory
├── server/                 # Existing server directory
└── ... (other directories)
```

## 2. Files to Move

### 2.1. To build/scripts/
- build-and-test.sh
- build-production.sh

### 2.2. To build/config/
- docker-compose.yml
- docker-compose.test.yml
- docker-compose.prod.yml
- podman-compose.yml
- podman-compose.test.yml
- podman-compose.prod.yml
- podman-compose.dev.temp.yml
- podman-compose.prod.temp.yml
- haproxy.cfg.template

### 2.3. To test/config/
- jest.config.js (from root)

### 2.4. Files to Keep in Root
- README.md
- CONTAINERS.md
- HAPROXY.md
- package.json
- package-lock.json
- .env.example
- .gitignore

## 3. Reference Updates Required

### 3.1. Script Updates
We need to update references in scripts that use these files:

1. Update references in build scripts to point to the new locations
2. Update any CI/CD configurations (when implemented)
3. Update package.json scripts that reference these files

### 3.2. Jest Configuration Updates
- Update the root jest.config.js to reflect its new location
- Update any references to the jest.config.js file

### 3.3. Documentation Updates
- Update any documentation that references the moved files
- Update README.md to reflect the new directory structure

## 4. GitHub Actions Considerations

Based on analysis, there are no actual GitHub Actions workflow files yet, but there are plans to create them. When these are implemented, they should:

1. Reference build scripts in their new location: `./build/scripts/build-and-test.sh`
2. Reference Docker/Podman compose files in their new location: `./build/config/podman-compose.yml`

## 5. Implementation Steps

### 5.1. Create New Directory Structure
```bash
mkdir -p build/scripts build/config test/config test/unit
```

### 5.2. Move Files
```bash
# Move build scripts
mv build-and-test.sh build/scripts/
mv build-production.sh build/scripts/

# Move configuration files
mv docker-compose*.yml build/config/
mv podman-compose*.yml build/config/
mv haproxy.cfg.template build/config/

# Move test configuration
mv jest.config.js test/config/
```

### 5.3. Update References

#### Update package.json
The scripts in package.json need to be updated to reference the new file locations:

```json
"scripts": {
  "test": "jest --config=test/config/jest.config.js",
  "test:e2e": "jest --config=test/config/jest.config.js test/e2e/functional/functional-tests.test.ts",
  "test:e2e:simple": "jest --config=test/config/jest.config.js test/e2e/functional/simple-test.test.ts",
  // Other scripts that need updating
}
```

#### Update Jest Configuration
The Jest configuration needs to be updated to reflect its new location and any path changes:

```js
// In test/config/jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  // Other configuration
};
```

#### Update Build Scripts
The build scripts need to be updated to reference the new locations of the Docker/Podman compose files:

```bash
# In build/scripts/build-and-test.sh
$DOCKER_COMPOSE_CMD -f ../config/docker-compose.test.yml down
$DOCKER_COMPOSE_CMD -f ../config/docker-compose.test.yml build
# Other references
```

## 6. Testing Plan

After implementing these changes, we need to test:

1. Building the application
2. Running tests
3. Production builds
4. Any CI/CD processes (when implemented)

This will ensure that the reorganization doesn't break any functionality.

## 7. Mermaid Diagram of New Structure

```mermaid
graph TD
    A[share-things] --> B[build]
    A --> C[test]
    A --> D[client]
    A --> E[server]
    A --> F[docs in root]
    
    B --> G[scripts]
    B --> H[config]
    
    G --> I[build-and-test.sh]
    G --> J[build-production.sh]
    
    H --> K[docker-compose files]
    H --> L[podman-compose files]
    H --> M[haproxy.cfg.template]
    
    C --> N[e2e]
    C --> O[unit]
    C --> P[config]
    
    P --> Q[jest.config.js]
    
    F --> R[README.md]
    F --> S[CONTAINERS.md]
    F --> T[HAPROXY.md]
    F --> U[package.json]
# Consolidated Implementation Plan for File Reorganization

This document provides a detailed implementation plan for reorganizing the project files, taking into account the existing GitHub Actions workflow and its dependencies.

## 1. Current Structure Analysis

The project currently has several build-related files in the root directory:
- Build scripts: `build-and-test.sh`, `build-production.sh`, `test-setup.sh`, `setup.sh`
- Docker/Podman configuration files: `docker-compose.yml`, `docker-compose.test.yml`, `docker-compose.prod.yml`, `podman-compose.yml`, `podman-compose.test.yml`, `podman-compose.prod.yml`, etc.
- Configuration templates: `haproxy.cfg.template`
- Test configuration: `jest.config.js`

The GitHub Actions workflow (`.github/workflows/share-things-ci-cd.yml`) references several of these files directly:
- `build-and-test.sh` in the integration job
- `test-setup.sh` in the test-setup job
- `setup.sh` indirectly through the deployment job

## 2. New Directory Structure

```
share-things/
├── build/                  # New directory for build scripts and configuration
│   ├── scripts/            # Build scripts
│   └── config/             # Configuration files
├── test/                   # Existing test directory (will be expanded)
│   ├── e2e/                # End-to-end tests (already exists)
│   ├── unit/               # New directory for unit tests
│   └── config/             # Test configuration files
├── setup/                  # Already exists for setup modules
├── client/                 # Existing client directory
├── server/                 # Existing server directory
└── ... (other directories)
```

## 3. Files to Move

### 3.1. To build/scripts/
- `build-and-test.sh`
- `build-production.sh`

### 3.2. To build/config/
- `docker-compose.yml`
- `docker-compose.test.yml`
- `docker-compose.prod.yml`
- `podman-compose.yml`
- `podman-compose.test.yml`
- `podman-compose.prod.yml`
- `podman-compose.dev.temp.yml`
- `podman-compose.prod.temp.yml`
- `haproxy.cfg.template`

### 3.3. To test/config/
- `jest.config.js` (from root)

### 3.4. Files to Keep in Root
- `README.md`
- `CONTAINERS.md`
- `HAPROXY.md`
- `package.json`
- `package-lock.json`
- `.env.example`
- `.gitignore`
- `setup.sh` (this is a main entry point script)
- `test-setup.sh` (this is a main test script)

## 4. Implementation Steps

### 4.1. Create Directory Structure
```bash
mkdir -p build/scripts build/config test/config test/unit
```

### 4.2. Move Files
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

### 4.3. Update References in Scripts

#### Update build-and-test.sh
The `build-and-test.sh` script needs to be updated to reference the new locations of the Docker/Podman compose files:

```bash
# Find and replace all references to docker-compose.test.yml
sed -i 's|docker-compose.test.yml|../config/docker-compose.test.yml|g' build/scripts/build-and-test.sh
sed -i 's|podman-compose.test.yml|../config/podman-compose.test.yml|g' build/scripts/build-and-test.sh
```

#### Update build-production.sh
Similarly, update `build-production.sh`:

```bash
# Find and replace all references to docker-compose.prod.yml
sed -i 's|docker-compose.prod.yml|../config/docker-compose.prod.yml|g' build/scripts/build-production.sh
sed -i 's|podman-compose.prod.yml|../config/podman-compose.prod.yml|g' build/scripts/build-production.sh
```

#### Update package.json
Update the scripts in `package.json` to reference the new locations:

```bash
# Update test script to use the new jest.config.js location
sed -i 's|"test": "jest"|"test": "jest --config=test/config/jest.config.js"|g' package.json
sed -i 's|"test:e2e": "jest --config=jest.config.js|"test:e2e": "jest --config=test/config/jest.config.js|g' package.json
sed -i 's|"test:e2e:simple": "jest --config=jest.config.js|"test:e2e:simple": "jest --config=test/config/jest.config.js|g' package.json
```

### 4.4. Update GitHub Actions Workflow

The GitHub Actions workflow file (`.github/workflows/share-things-ci-cd.yml`) needs to be updated to reference the new locations:

```bash
# Update references to build-and-test.sh
sed -i 's|chmod +x build-and-test.sh|chmod +x build/scripts/build-and-test.sh|g' .github/workflows/share-things-ci-cd.yml
sed -i 's|bash -x ./build-and-test.sh|bash -x ./build/scripts/build-and-test.sh|g' .github/workflows/share-things-ci-cd.yml
```

### 4.5. Update setup.sh and test-setup.sh

These scripts may reference the Docker/Podman compose files directly. We need to update these references:

```bash
# For setup.sh, check if it references compose files directly
grep -r "docker-compose" setup/
grep -r "podman-compose" setup/

# Update any references found in the setup modules
sed -i 's|podman-compose.yml|build/config/podman-compose.yml|g' setup/*.sh
sed -i 's|docker-compose.yml|build/config/docker-compose.yml|g' setup/*.sh
```

## 5. Testing Plan

After implementing these changes, we need to test:

1. **Local Development**: Ensure the application can be built and run locally
   ```bash
   # Test setup script
   ./setup.sh --non-interactive --force-install
   
   # Test build script
   ./build/scripts/build-and-test.sh
   ```

2. **GitHub Actions**: Trigger a GitHub Actions workflow to ensure it still works
   ```bash
   # Make a small change and push to trigger the workflow
   git commit --allow-empty -m "Test workflow after file reorganization"
   git push
   ```

3. **Test Scripts**: Ensure the test scripts still work
   ```bash
   # Run the test setup script
   ./test-setup.sh
   
   # Run npm tests
   npm test
   npm run test:e2e:simple
   ```

## 6. Rollback Plan

In case of issues, we should have a rollback plan:

1. Create a backup of the current state before making changes:
   ```bash
   # Create a backup directory
   mkdir -p file-reorg-backup
   
   # Copy all files that will be moved
   cp build-and-test.sh build-production.sh docker-compose*.yml podman-compose*.yml haproxy.cfg.template jest.config.js file-reorg-backup/
   
   # Copy GitHub Actions workflow
   cp .github/workflows/share-things-ci-cd.yml file-reorg-backup/
   
   # Copy package.json
   cp package.json file-reorg-backup/
   ```

2. If issues occur, restore from backup:
   ```bash
   # Restore files
   cp file-reorg-backup/build-and-test.sh file-reorg-backup/build-production.sh ./
   cp file-reorg-backup/docker-compose*.yml file-reorg-backup/podman-compose*.yml file-reorg-backup/haproxy.cfg.template ./
   cp file-reorg-backup/jest.config.js ./
   cp file-reorg-backup/share-things-ci-cd.yml .github/workflows/
   cp file-reorg-backup/package.json ./
   ```

## 7. Documentation Updates

Update the README.md to reflect the new directory structure:

```markdown
## Project Structure

- `build/`: Build scripts and configuration files
  - `scripts/`: Build scripts (build-and-test.sh, build-production.sh)
  - `config/`: Configuration files (docker-compose.yml, podman-compose.yml, etc.)
- `test/`: Test files and configuration
  - `config/`: Test configuration (jest.config.js)
  - `e2e/`: End-to-end tests
  - `unit/`: Unit tests
- `client/`: Frontend application
- `server/`: Backend application
- `setup/`: Setup modules
- `setup.sh`: Main setup script
- `test-setup.sh`: Setup test script
```

## 8. Implementation Sequence

To minimize disruption, implement the changes in this order:

1. Create backup
2. Create new directory structure
3. Move files
4. Update references in scripts
5. Update GitHub Actions workflow
6. Test locally
7. Commit and push changes
8. Monitor GitHub Actions workflow
9. Update documentation

## 9. Conclusion

This implementation plan provides a comprehensive approach to reorganizing the project files while ensuring that all scripts and workflows continue to function correctly. By following this plan, we can achieve a cleaner, more maintainable project structure without disrupting the development workflow.
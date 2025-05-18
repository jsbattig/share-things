# Duplicate Files Analysis

After analyzing the repository, I've identified several categories of duplicate files and backup directories that should be considered for cleanup.

## 1. GitHub Actions Workflow Files

| File Path | Status | Notes |
|-----------|--------|-------|
| `.github/workflows/share-things-ci-cd.yml` | Active | The current workflow file used by GitHub Actions |
| `build/config/share-things-ci-cd.yml` | Outdated | Contains old paths (e.g., `build-and-test.sh` instead of `build/scripts/build-and-test.sh`) |
| `file-reorg-backup/share-things-ci-cd.yml` | Backup | Part of the file reorganization backup |

**Recommendation**: Keep only the active file in `.github/workflows/` and remove the others.

## 2. Jest Configuration Files

| File Path | Status | Notes |
|-----------|--------|-------|
| `client/jest.config.cjs` | Active | Client-specific Jest configuration |
| `server/jest.config.js` | Active | Server-specific Jest configuration |
| `test/config/jest.config.js` | Active | Global Jest configuration used by root package.json |
| `file-reorg-backup/jest.config.js` | Backup | Old version of the global Jest configuration |

**Recommendation**: Keep the three active configuration files and remove the backup.

## 3. Docker/Podman Compose Files

### 3.1 Active Configuration Files

| File Path | Status | Notes |
|-----------|--------|-------|
| `build/config/docker-compose.yml` | Active | Base Docker configuration |
| `build/config/docker-compose.test.yml` | Active | Docker test configuration |
| `build/config/docker-compose.prod.yml` | Active | Docker production configuration |
| `build/config/podman-compose.yml` | Active | Base Podman configuration |
| `build/config/podman-compose.test.yml` | Active | Podman test configuration |
| `build/config/podman-compose.prod.yml` | Active | Podman production configuration |
| `build/config/podman-compose.dev.temp.yml` | Active | Podman development template |
| `build/config/podman-compose.prod.temp.yml` | Active | Podman production template |

### 3.2 Backup Configuration Files

| File Path | Status | Notes |
|-----------|--------|-------|
| `file-reorg-backup/docker-compose.yml` | Backup | Backup of Docker base configuration |
| `file-reorg-backup/docker-compose.test.yml` | Backup | Backup of Docker test configuration |
| `file-reorg-backup/docker-compose.prod.yml` | Backup | Backup of Docker production configuration |
| `file-reorg-backup/podman-compose.yml` | Backup | Backup of Podman base configuration |
| `file-reorg-backup/podman-compose.prod.temp.yml` | Backup | Backup of Podman production template |
| Multiple files in `backups/` directory | Backups | Timestamped backups of various configuration files |

**Recommendation**: Keep the active configuration files in `build/config/` and remove all backups.

## 4. Podman Migration Documentation

| File Path | Status | Notes |
|-----------|--------|-------|
| `plans/PODMAN-MIGRATION.md` | Active | Summary of the Podman migration |
| `plans/podman-migration-plan.md` | Active | Detailed plan for Podman migration |
| `PODMAN-MIGRATION.md` | Referenced but missing | Referenced in VSCode Open Tabs but doesn't exist in the root directory |

**Recommendation**: Keep both files in the `plans/` directory as they serve different purposes (summary vs. detailed plan).

## 5. Backup Directories

| Directory Path | Status | Notes |
|----------------|--------|-------|
| `backups/` | Backup | Contains multiple timestamped backups of configuration files |
| `docker-backup-20250516224450/` | Backup | Contains Docker configuration backups |
| `file-reorg-backup/` | Backup | Contains backups created during the file reorganization process |

**Recommendation**: Remove all backup directories as they contain outdated copies of files that are now properly organized in the project structure.

## 6. Other Potential Duplicates

### 6.1 Configuration Templates

| File Path | Status | Notes |
|-----------|--------|-------|
| `build/config/haproxy.cfg.template` | Active | HAProxy configuration template |
| `file-reorg-backup/haproxy.cfg.template` | Backup | Backup of HAProxy configuration template |

**Recommendation**: Keep only the active template in `build/config/` and remove the backup.

### 6.2 Environment Files

| File Path | Status | Notes |
|-----------|--------|-------|
| `.env.example` | Active | Root environment example |
| `client/.env.example` | Active | Client-specific environment example |
| `client/.env.backend` | Active | Client backend environment configuration |
| `server/.env.example` | Active | Server-specific environment example |
| Multiple files in `backups/` directory | Backups | Timestamped backups of client.env and server.env |

**Recommendation**: Keep the active environment files and remove all backups.

## 7. VSCode Open Tabs with Missing Files

Several files are referenced in VSCode Open Tabs but don't actually exist in the filesystem:

1. `client/jest.config.js`
2. `client/jest.config.mjs`
3. `PODMAN-MIGRATION.md`

These appear to be files that were either renamed, moved, or deleted, but the tabs remain open in VSCode.

## Summary

The repository contains numerous duplicate files and backup directories that can be safely removed without affecting the functionality of the project. The main categories of duplicates are:

1. GitHub Actions workflow files
2. Jest configuration files
3. Docker/Podman compose files
4. Podman migration documentation
5. Backup directories
6. Configuration templates
7. Environment files

By cleaning up these duplicates, the repository will be more maintainable and easier to navigate.
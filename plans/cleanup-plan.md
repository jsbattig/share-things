# Repository Cleanup Plan

This document outlines a comprehensive plan for cleaning up redundant and backup files in the share-things repository.

## 1. Duplicate Configuration Files

### 1.1. GitHub Actions Workflow File

**Issue:** There are multiple versions of the share-things-ci-cd.yml file:
- `.github/workflows/share-things-ci-cd.yml` (active file)
- `build/config/share-things-ci-cd.yml` (outdated copy)
- `file-reorg-backup/share-things-ci-cd.yml` (backup)

**Action:** Keep only the active file in `.github/workflows/` and remove the others.

```bash
rm build/config/share-things-ci-cd.yml
# file-reorg-backup directory will be removed entirely in a later step
```

### 1.2. Jest Configuration Files

**Issue:** There are multiple Jest configuration files:
- `client/jest.config.cjs` (client-specific config)
- `server/jest.config.js` (server-specific config)
- `test/config/jest.config.js` (global config)
- `file-reorg-backup/jest.config.js` (backup)

**Action:** Keep the three active configuration files and remove the backup.

### 1.3. Docker/Podman Compose Files

**Issue:** There are duplicate Docker and Podman compose files in multiple locations:
- Active files in `build/config/`
- Backup files in `file-reorg-backup/`
- Multiple timestamped backups in `backups/`

**Action:** Keep only the active configuration files in `build/config/` and remove all backups.

### 1.4. HAProxy Configuration Template

**Issue:** There are duplicate HAProxy configuration templates:
- `build/config/haproxy.cfg.template` (active)
- `file-reorg-backup/haproxy.cfg.template` (backup)

**Action:** Keep only the active template in `build/config/` and remove the backup.

## 2. Backup Directories

### 2.1. /backups Directory

**Issue:** The `/backups` directory contains multiple timestamped backups of configuration files that are no longer needed.

**Action:** Remove the entire backups directory and all its contents.

```bash
rm -rf backups/
```

### 2.2. docker-backup-* Directory

**Issue:** The `docker-backup-*` directories contain old Docker configuration backups.

**Action:** Remove all docker-backup-* directories.

```bash
rm -rf docker-backup-*/
```

### 2.3. file-reorg-backup Directory

**Issue:** The `file-reorg-backup` directory contains backups created during the file reorganization process.

**Action:** Remove the entire file-reorg-backup directory and all its contents.

```bash
rm -rf file-reorg-backup/
```

## 3. Environment Files

**Issue:** There are multiple environment file backups in the backups directory.

**Action:** Keep only the active environment files and remove all backups:
- `.env.example` (root)
- `client/.env.example`
- `client/.env.backend`
- `server/.env.example`

## 4. Documentation Updates

### 4.1. Update References

**Action:** Search for and update any documentation that references the removed files or directories.

```bash
# Example search command to find references
grep -r "backups/" --include="*.md" .
grep -r "file-reorg-backup" --include="*.md" .
grep -r "docker-backup" --include="*.md" .
```

### 4.2. Add Cleanup Documentation

**Action:** Add a note to the project README or relevant documentation about the cleanup that was performed.

## 5. Implementation Steps

1. Create a backup branch before making changes (optional safety measure)
   ```bash
   git checkout -b backup-before-cleanup
   git push origin backup-before-cleanup
   git checkout master
   ```

2. Remove the duplicate GitHub Actions workflow file
   ```bash
   rm build/config/share-things-ci-cd.yml
   ```

3. Remove backup directories
   ```bash
   rm -rf backups/
   rm -rf docker-backup-*/
   rm -rf file-reorg-backup/
   ```

4. Update documentation as needed
   ```bash
   # Update memory-bank/technical/ci-cd/README.md to remove references to build/config/share-things-ci-cd.yml
   ```

5. Commit changes
   ```bash
   git add -A
   git commit -m "Clean up redundant files and backup directories"
   git push origin master
   ```

## 6. Verification

After completing the cleanup:

1. Verify that the GitHub Actions workflow still runs correctly
2. Ensure all documentation is consistent
3. Confirm that no essential files were accidentally removed

## 7. Future Recommendations

1. Implement a more structured approach to backups
2. Use git branches for experimental changes instead of creating backup directories
3. Document the purpose of any backup files that need to be kept
4. Regularly review and clean up temporary or backup files
5. Consider implementing a .gitignore rule for temporary backup files
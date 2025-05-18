# CI/CD Tools and Utilities

This directory contains tools and utilities related to Continuous Integration and Continuous Deployment (CI/CD) for the ShareThings project.

## Badge Simplification (May 2025)

In May 2025, we simplified the badge approach in the README.md file. Instead of using multiple job-specific badges, we now use a single consolidated badge that shows the overall status of the CI/CD pipeline.

### Background

Previously, we had 5 separate badges for different jobs in the CI/CD pipeline:
- Lint
- Build and Test
- Integration Tests
- Test Setup
- Deploy to Production

Each badge used job-specific parameters to show the status of individual jobs. However, we encountered issues where the badges were showing all green or all red even when the actual job statuses were mixed.

### Current Approach

We now use a single badge without the job parameter:
```
https://img.shields.io/github/actions/workflow/status/jsbattig/share-things/share-things-ci-cd.yml?label=Build%20Status
```

This badge shows the overall status of the workflow:
- Green if all jobs succeed
- Red if any job fails

The badge links to the GitHub Actions workflow page where users can see detailed status of each step.

### Benefits

1. **Simplicity**: One badge is easier to understand at a glance than five separate badges
2. **Reliability**: Using the overall workflow status avoids issues with job-specific parameters
3. **Clarity**: The badge clearly indicates if there are any issues in the build process
4. **Detailed Information**: Users can still access detailed job status by clicking the badge

### Related Files

- [README.md](../../../README.md) - Contains the CI/CD badge
- [build/config/share-things-ci-cd.yml](../../../build/config/share-things-ci-cd.yml) - GitHub Actions workflow file
- [plans/badge-simplification-plan.md](../../../plans/badge-simplification-plan.md) - Detailed plan for badge simplification

## validate-badges.js (Historical)

A utility script that demonstrates the difference between the old and new badge URL formats used in the README.md file. This script is kept for historical reference but is no longer relevant to the current badge implementation.

### Purpose

This script was created to diagnose and validate the fix for an issue where all CI/CD badges in the README.md were showing the same status (failing) instead of reflecting the actual status of individual jobs in the GitHub Actions workflow.

### How It Works

The script:
1. Fetches the badge SVG from both the old URL format (using shields.io) and the new URL format (with job parameter)
2. Checks the HTTP status code and badge content
3. Determines if the badge is showing "passing" or "failing" status
4. Explains the difference between the two URL formats

### Usage

```bash
node memory-bank/technical/ci-cd/validate-badges.js
```

### Historical Findings

- The old badge format (`https://img.shields.io/github/actions/workflow/status/jsbattig/share-things/share-things-ci-cd.yml?label=X`) without the job parameter shows the overall workflow status for all jobs.
- The new badge format (`https://img.shields.io/github/actions/workflow/status/jsbattig/share-things/share-things-ci-cd.yml?label=X&job=X`) with the job parameter shows the status of a specific job.
- The `job=jobname` parameter is crucial for showing the status of specific jobs within the workflow.
- We initially tried using GitHub's native badge URLs (`https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml/badge.svg?branch=master&event=push&job=X`) but they didn't work as expected.
- We reverted to shields.io URLs but added the job parameter to fix the issue.

Note: As of May 2025, we've reverted to using the badge format without the job parameter to show the overall workflow status, as documented in the "Badge Simplification" section above.
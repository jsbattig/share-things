# CI/CD Tools and Utilities

This directory contains tools and utilities related to Continuous Integration and Continuous Deployment (CI/CD) for the ShareThings project.

## validate-badges.js

A utility script that demonstrates the difference between the old and new badge URL formats used in the README.md file.

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

### Key Findings

- The old badge format (`https://img.shields.io/github/actions/workflow/status/jsbattig/share-things/share-things-ci-cd.yml?label=X`) without the job parameter shows the overall workflow status for all jobs.
- The new badge format (`https://img.shields.io/github/actions/workflow/status/jsbattig/share-things/share-things-ci-cd.yml?label=X&job=X`) with the job parameter shows the status of a specific job.
- The `job=jobname` parameter is crucial for showing the status of specific jobs within the workflow.
- We initially tried using GitHub's native badge URLs (`https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml/badge.svg?branch=master&event=push&job=X`) but they didn't work as expected.
- We reverted to shields.io URLs but added the job parameter to fix the issue.

### Related Files

- [README.md](../../../README.md) - Contains the CI/CD badges
- [.github/workflows/share-things-ci-cd.yml](../../../.github/workflows/share-things-ci-cd.yml) - GitHub Actions workflow file
- [plans/ci-cd-implementation-plan.md](../../../plans/ci-cd-implementation-plan.md) - Original implementation plan for CI/CD
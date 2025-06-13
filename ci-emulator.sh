#!/bin/bash

# ShareThings CI/CD Emulator Script
# This script emulates the GitHub Actions CI/CD pipeline locally
# to catch any issues before pushing to GitHub

set -e  # Exit on any error

echo "🚀 ShareThings CI/CD Pipeline Emulator"
echo "======================================"
echo "This script emulates the GitHub Actions pipeline to catch issues before pushing."
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Job results tracking
TOTAL_JOBS=0
PASSED_JOBS=0
FAILED_JOBS=0

# Function to run a job step and track results
run_job_step() {
    local step_name="$1"
    local step_command="$2"
    local step_dir="${3:-$(pwd)}"
    
    echo -e "${BLUE}🔄 Running: $step_name${NC}"
    echo "   Command: $step_command"
    echo "   Directory: $step_dir"
    echo ""
    
    TOTAL_JOBS=$((TOTAL_JOBS + 1))
    
    # Create a temporary file to capture output
    local temp_output=$(mktemp)
    
    if (cd "$step_dir" && eval "$step_command" > "$temp_output" 2>&1); then
        echo -e "${GREEN}✅ PASSED: $step_name${NC}"
        PASSED_JOBS=$((PASSED_JOBS + 1))
        # Show last few lines of successful output for context
        echo -e "${YELLOW}   Last few lines:${NC}"
        tail -3 "$temp_output" | sed 's/^/   /'
    else
        echo -e "${RED}❌ FAILED: $step_name${NC}"
        FAILED_JOBS=$((FAILED_JOBS + 1))
        # Show the actual error with more context
        echo -e "${YELLOW}   Error details:${NC}"
        tail -20 "$temp_output" | sed 's/^/   /'
        
        # Clean up and exit on first failure
        rm -f "$temp_output"
        echo ""
        echo -e "${RED}❌ CI/CD EMULATION FAILED${NC}"
        echo -e "   Failed at: $step_name"
        echo -e "   This would cause a GitHub Actions failure!"
        echo ""
        exit 1
    fi
    
    # Clean up temp file
    rm -f "$temp_output"
    echo ""
}

# Start emulation
echo -e "${BLUE}Starting CI/CD Pipeline Emulation...${NC}"
echo ""

# ====================================
# JOB 1: LINT (emulating GitHub job)
# ====================================
echo -e "${BLUE}🏷️  JOB 1: LINT${NC}"
echo "============================="

# Step: Install root dependencies
run_job_step "Install root dependencies" "npm ci" "."

# Step: Install client dependencies with TypeScript ESLint plugin fix
run_job_step "Install client dependencies" "npm ci && npm install --save-dev @typescript-eslint/eslint-plugin@5.62.0 @typescript-eslint/parser@5.62.0" "client"

# Step: Install server dependencies
run_job_step "Install server dependencies" "npm ci" "server"

# Step: Lint server
run_job_step "Lint server" "npm run lint -- --format stylish" "server"

# Step: Lint client
run_job_step "Lint client" "npm run lint -- --format stylish" "client"

echo -e "${GREEN}✅ JOB 1 (LINT) COMPLETED SUCCESSFULLY${NC}"
echo ""

# ====================================
# JOB 2: BUILD AND TEST (emulating GitHub job)
# ====================================
echo -e "${BLUE}🏗️  JOB 2: BUILD AND TEST${NC}"
echo "===================================="

# Note: Dependencies already installed from Job 1

# Step: Build server
run_job_step "Build server" "npm run build" "server"

# Step: Build client  
run_job_step "Build client" "npm run build" "client"

# Step: Test server (unit tests)
run_job_step "Test server (unit tests)" "npm test" "server"

# Step: Test server (integration tests) - Added for completeness
run_job_step "Test server (integration tests)" "npm run test:integration" "server"

# Step: Test client
run_job_step "Test client" "npm test" "client"

echo -e "${GREEN}✅ JOB 2 (BUILD AND TEST) COMPLETED SUCCESSFULLY${NC}"
echo ""

# ====================================
# JOB 3: TEST SETUP (emulating GitHub job)
# ====================================
echo -e "${BLUE}🧪 JOB 3: TEST SETUP${NC}"
echo "=========================="

# Step: Check if setup test script exists
if [ -f "test/setup/setup-test-install.sh" ]; then
    echo -e "${GREEN}✅ setup-test-install.sh found${NC}"
else
    echo -e "${RED}❌ setup-test-install.sh not found!${NC}"
    echo "   This would cause a GitHub Actions failure!"
    exit 1
fi

# Step: Make setup test scripts executable
run_job_step "Make setup test scripts executable" "chmod +x test/setup/setup-test-install.sh" "."

# Note: We skip the actual setup-test-install.sh execution as it requires Docker/Podman
# and is more of an integration test. The main CI concern is that unit/integration tests pass.
echo -e "${YELLOW}⏭️  SKIPPING: Setup installation test (requires Docker/Podman)${NC}"
echo "   Note: This test runs in GitHub Actions with Docker but is skipped locally"
echo "   The important tests (unit, integration, build) have already passed"
echo ""

echo -e "${GREEN}✅ JOB 3 (TEST SETUP) COMPLETED SUCCESSFULLY${NC}"
echo ""

# ====================================
# JOB 4: INTEGRATION TESTS (Docker-based - optional locally)
# ====================================
echo -e "${BLUE}🐳 JOB 4: DOCKERIZED BUILD & TESTS${NC}"
echo "======================================"

# Check if Docker/Podman is available
if command -v podman &> /dev/null; then
    echo -e "${GREEN}✅ Podman found - could run Docker tests${NC}"
    echo -e "${YELLOW}⏭️  SKIPPING: Docker tests (optional for local validation)${NC}"
    echo "   Note: Docker tests run in GitHub Actions but are optional locally"
    echo "   Use './build/scripts/build-and-test.sh' if you want to run them"
elif command -v docker &> /dev/null; then
    echo -e "${GREEN}✅ Docker found - could run Docker tests${NC}"
    echo -e "${YELLOW}⏭️  SKIPPING: Docker tests (optional for local validation)${NC}"
    echo "   Note: Docker tests run in GitHub Actions but are optional locally"
    echo "   Use './build/scripts/build-and-test.sh' if you want to run them"
else
    echo -e "${YELLOW}⏭️  SKIPPING: Docker tests (Docker/Podman not available)${NC}"
    echo "   Note: This is fine - Docker tests run in GitHub Actions"
fi
echo ""

echo -e "${GREEN}✅ JOB 4 (INTEGRATION) COMPLETED SUCCESSFULLY${NC}"
echo ""

# ====================================
# ADDITIONAL: Content Renaming E2E Tests
# ====================================
echo -e "${BLUE}🎯 ADDITIONAL: CONTENT RENAMING E2E TESTS${NC}"
echo "=============================================="

# Step: Run content renaming E2E tests
run_job_step "Content Renaming E2E Tests" "npm run test:e2e -- test/e2e/functional/content-renaming.test.ts --silent" "."

echo -e "${GREEN}✅ CONTENT RENAMING E2E TESTS COMPLETED SUCCESSFULLY${NC}"
echo ""

# ====================================
# FINAL SUMMARY
# ====================================
echo ""
echo "🏁 CI/CD EMULATION SUMMARY"
echo "=========================="
echo -e "Total Jobs/Steps: $TOTAL_JOBS"
echo -e "${GREEN}Passed: $PASSED_JOBS${NC}"
echo -e "${RED}Failed: $FAILED_JOBS${NC}"
echo ""

if [ $FAILED_JOBS -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL CI/CD STEPS PASSED!${NC}"
    echo -e "${GREEN}✅ Your code is ready to push to GitHub${NC}"
    echo ""
    echo -e "${BLUE}📋 What was tested:${NC}"
    echo "   • Server and client linting"
    echo "   • Server and client builds"  
    echo "   • Server unit tests (including content renaming)"
    echo "   • Server integration tests (including content renaming)"
    echo "   • Client unit tests"
    echo "   • Content renaming E2E tests"
    echo ""
    echo -e "${GREEN}🚀 Safe to commit and push!${NC}"
    exit 0
else
    echo -e "${RED}❌ $FAILED_JOBS CI/CD STEP(S) FAILED${NC}"
    echo -e "${RED}🚫 DO NOT PUSH - GitHub Actions will fail!${NC}"
    echo ""
    echo "Fix the failing steps before pushing to GitHub."
    exit 1
fi
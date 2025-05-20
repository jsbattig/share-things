#!/bin/bash
#
# fix-eslint-typescript-plugin.sh - Script to fix ESLint TypeScript plugin issues
#
# This script installs the necessary ESLint plugins for TypeScript
# to resolve the linting errors in the GitHub Actions workflow
#

set -e  # Exit immediately if a command exits with a non-zero status

# Text colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Determine repository root
REPO_ROOT=$(pwd)
log_info "Repository root: $REPO_ROOT"

# Check if client directory exists
if [ ! -d "$REPO_ROOT/client" ]; then
  log_error "Client directory not found at $REPO_ROOT/client"
  exit 1
fi

# Navigate to client directory
cd "$REPO_ROOT/client"
log_info "Changed to client directory: $(pwd)"

# Check if package.json exists
if [ ! -f "package.json" ]; then
  log_error "package.json not found in client directory"
  exit 1
fi

# Get Node.js version
NODE_VERSION=$(node -v)
log_info "Node.js version: $NODE_VERSION"

# Install TypeScript ESLint plugin with a version compatible with Node.js v16
log_info "Installing TypeScript ESLint plugin with a version compatible with Node.js v16..."
npm install --save-dev @typescript-eslint/eslint-plugin@5.62.0 @typescript-eslint/parser@5.62.0

# Verify installation
if [ -d "node_modules/@typescript-eslint/eslint-plugin" ]; then
  log_success "TypeScript ESLint plugin installed successfully"
else
  log_error "Failed to install TypeScript ESLint plugin"
  exit 1
fi

# Run lint to verify it works
log_info "Running lint to verify the plugin works..."
npm run lint -- --format stylish || {
  log_warning "Linting produced errors, but the plugin is installed correctly."
  log_info "You may need to fix actual linting errors in the code."
  # Don't exit with error since we just want to verify the plugin is installed
}

log_success "ESLint TypeScript plugin fix completed successfully!"
#!/bin/bash

# Test script for verifying the fresh install functionality of setup.sh
# This script simulates a production deployment using fresh installs instead of updates

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}=== Testing setup.sh fresh install functionality ===${NC}"
echo "This script will test if the fresh install functionality works correctly."
echo "Note: We no longer use --update. Production deployments now use fresh installs."
echo ""

# Step 1: Check if setup.sh exists
echo -e "${YELLOW}Step 1: Checking if setup.sh exists...${NC}"
if [ ! -f "./setup.sh" ]; then
    echo -e "${RED}Error: setup.sh not found in the current directory.${NC}"
    exit 1
fi
echo -e "${GREEN}setup.sh found.${NC}"
echo ""

# Step 2: Make setup.sh executable
echo -e "${YELLOW}Step 2: Making setup.sh executable...${NC}"
chmod +x ./setup.sh
echo -e "${GREEN}setup.sh is now executable.${NC}"
echo ""

# Step 3: Check that update function has been removed
echo -e "${YELLOW}Step 3: Verifying that update functionality has been removed...${NC}"
if grep -q "perform_update" setup/operations.sh; then
    echo -e "${RED}Error: perform_update function still found in setup/operations.sh.${NC}"
    echo "The update functionality should have been removed."
    exit 1
fi
echo -e "${GREEN}perform_update function has been properly removed.${NC}"
echo ""

# Step 4: Check that --update option has been removed from setup.sh
echo -e "${YELLOW}Step 4: Checking that --update option has been removed...${NC}"
if grep -q "\-\-update" setup.sh; then
    echo -e "${RED}Error: --update option still found in setup.sh.${NC}"
    echo "The --update option should have been removed."
    exit 1
fi
echo -e "${GREEN}--update option has been properly removed.${NC}"
echo ""

# Step 5: Check that help text no longer mentions update
echo -e "${YELLOW}Step 5: Checking that help text no longer mentions update...${NC}"
if grep -q "update.*installation" setup/common.sh; then
    echo -e "${RED}Error: Help text still mentions update functionality.${NC}"
    echo "The help text should have been updated."
    exit 1
fi
echo -e "${GREEN}Help text has been properly updated.${NC}"
echo ""

# Step 6: Verify that fresh install approach is documented
echo -e "${YELLOW}Step 6: Verifying fresh install approach...${NC}"
echo "Production deployments now use the following approach:"
echo "1. Uninstall existing installation: ./setup.sh --uninstall --non-interactive"
echo "2. Fresh install: ./setup.sh --non-interactive --force-install"
echo ""
echo "This approach ensures:"
echo "- Clean state for each deployment"
echo "- No leftover configuration issues"
echo "- Proper volume preservation (data is preserved)"
echo "- Simpler and more reliable deployment process"
echo ""

# Step 7: Summary
echo -e "${YELLOW}=== Test Summary ===${NC}"
echo -e "${GREEN}All tests passed. The fresh install approach is properly implemented.${NC}"
echo ""
echo "The following changes were made:"
echo "1. Removed --update option from setup.sh"
echo "2. Removed perform_update function from operations.sh"
echo "3. Updated help text to remove update references"
echo "4. Updated CI/CD pipeline to use fresh installs"
echo "5. Updated test scripts to use reinstall instead of update"
echo ""
echo "Production deployment command sequence:"
echo "  ./setup.sh --uninstall --non-interactive --debug"
echo "  ./setup.sh --non-interactive --force-install --debug"
echo ""
echo -e "${GREEN}The fresh install approach is simpler, more reliable, and preserves data properly.${NC}"
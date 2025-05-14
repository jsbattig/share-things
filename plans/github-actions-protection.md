# GitHub Actions Protection Plan

This document outlines a plan to implement a GitHub Action that prevents unauthorized modifications to GitHub Actions workflow files.

## Requirements

- Only allow the user `jsbattig` to modify files in the `.github/workflows/` directory
- Prevent pull requests from being merged if they contain changes to workflow files made by other users
- Provide clear feedback when a pull request is rejected due to unauthorized workflow changes

## Implementation Approach

We'll create a new GitHub Action that:
1. Runs on pull requests to the `master` branch
2. Checks if any files in the `.github/workflows/` directory have been modified
3. If workflow files have been modified, checks if the commit author is `jsbattig`
4. Fails the check if the author is not `jsbattig`, preventing the pull request from being merged

### Workflow File

Create a new file at `.github/workflows/protect-workflows.yml` with the following content:

```yaml
name: Protect Workflow Files

on:
  pull_request:
    branches: [ master ]
    paths:
      - '.github/workflows/**'

jobs:
  check-author:
    name: Check Workflow File Changes
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
        with:
          fetch-depth: 0
      
      - name: Check commit author for workflow changes
        run: |
          # Get the list of files changed in this PR
          CHANGED_FILES=$(git diff --name-only ${{ github.event.pull_request.base.sha }} ${{ github.event.pull_request.head.sha }} | grep "^\.github/workflows/")
          
          if [ -n "$CHANGED_FILES" ]; then
            echo "Workflow files have been modified in this PR:"
            echo "$CHANGED_FILES"
            
            # Check each commit that modified workflow files
            for FILE in $CHANGED_FILES; do
              COMMITS=$(git log ${{ github.event.pull_request.base.sha }}..${{ github.event.pull_request.head.sha }} --format="%H" -- "$FILE")
              
              for COMMIT in $COMMITS; do
                AUTHOR=$(git show -s --format='%an <%ae>' $COMMIT)
                AUTHOR_USERNAME=$(git show -s --format='%an' $COMMIT)
                
                echo "Checking commit $COMMIT by $AUTHOR"
                
                if [ "$AUTHOR_USERNAME" != "jsbattig" ]; then
                  echo "::error::Unauthorized modification to workflow file $FILE by $AUTHOR"
                  echo "::error::Only jsbattig is allowed to modify workflow files"
                  exit 1
                fi
              done
            done
            
            echo "All workflow file changes were made by authorized users"
          else
            echo "No workflow files were modified in this PR"
          fi
```

### Alternative Implementation: Using GitHub's CODEOWNERS Feature

As an alternative or complementary approach, we can use GitHub's CODEOWNERS feature to restrict who can approve changes to workflow files:

1. Create a `.github/CODEOWNERS` file with the following content:
   ```
   # Only jsbattig can approve changes to workflow files
   /.github/workflows/ @jsbattig
   ```

2. In the repository settings, under "Branches" → "Branch protection rules":
   - Create a rule for the `master` branch
   - Enable "Require pull request reviews before merging"
   - Enable "Require review from Code Owners"

This approach will require `jsbattig` to approve any pull request that modifies workflow files, but it won't prevent other users from making changes in their branches.

## Implementation Steps

1. Create the `.github/workflows/protect-workflows.yml` file with the content above
2. Optionally, create the `.github/CODEOWNERS` file for additional protection
3. Configure branch protection rules in the repository settings
4. Test the protection by creating a pull request with changes to workflow files from a different user

## Limitations and Considerations

1. **Username vs. Email**: The current implementation checks the commit author's username. If the same user has different usernames across systems, this might cause issues. Consider checking the email address instead.

2. **Commit Squashing**: If pull requests are squashed when merging, the commit author information might be lost. In this case, you might need to check the pull request author instead.

3. **Direct Pushes**: This protection only works for pull requests. If someone has permission to push directly to the `master` branch, they can bypass this check. Make sure to also set up branch protection rules to prevent direct pushes.

4. **Bypass Permissions**: Repository administrators can bypass branch protection rules. Make sure to carefully manage repository permissions.

5. **False Positives**: If `jsbattig` creates a pull request but someone else makes changes to it (e.g., through the GitHub UI), the check might fail even though the changes were approved by `jsbattig`.

## Testing the Protection

To test this protection:

1. Create a new branch from `master`
2. Make changes to a file in `.github/workflows/`
3. Commit the changes with a non-jsbattig user
4. Create a pull request to merge the changes into `master`
5. Verify that the check fails and prevents the pull request from being merged
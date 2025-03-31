#!/bin/bash

# Step 1: Check if we're in a Git repository
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  echo "Error: Not in a Git repository"
  exit 1
fi

# Step 2: Make sure the .gitignore exists and contains node_modules
if [ ! -f "travel-tracker-ui/.gitignore" ]; then
  echo "Error: travel-tracker-ui/.gitignore not found"
  exit 1
fi

# Step 3: Remove node_modules from Git tracking without deleting the files
echo "Removing node_modules from Git tracking..."
git rm -r --cached travel-tracker-ui/node_modules 2>/dev/null || echo "node_modules not currently tracked in Git."

# Step 4: Add the .gitignore file to Git
echo "Adding .gitignore to Git..."
git add travel-tracker-ui/.gitignore

# Step 5: Commit the changes
echo "Committing changes..."
git commit -m "chore: Stop tracking node_modules directory in Git"

echo "Done! node_modules should now be properly ignored by Git." 
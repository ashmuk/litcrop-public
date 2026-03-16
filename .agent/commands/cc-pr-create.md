---
name: cc-pr-create
description: Command - Create a pull request with generated title and description
---

## Prerequisites Check

1. Verify GitHub CLI is installed: `gh --version`
   - If not installed, inform user: `brew install gh` or see https://cli.github.com/
2. Verify authentication: `gh auth status`
   - If not authenticated, run: `gh auth login`

## Gather Information

1. Get current branch: `git branch --show-current`
   - If on main/master, stop and ask user to checkout a develop or feature branch

2. Detect base branch for the PR:
   - If the user specifies `--base`, use that
   - Otherwise, check if a `develop` branch exists: `git rev-parse --verify origin/develop 2>/dev/null`
     - If `develop` exists AND current branch is a `feature/*`, `fix/*`, or `hotfix/*` branch: use `develop` as base (Git Flow convention)
     - Otherwise: detect default branch dynamically: `gh repo view --json defaultBranchRef -q '.defaultBranchRef.name'`
   - Show the chosen base branch to the user and confirm before proceeding

3. Ensure all commits are pushed: `git log origin/$(git branch --show-current)..HEAD --oneline`
   - If unpushed commits exist, ask user if they want to push first

4. Get commit history for this branch:
   ```
   git log origin/<default-branch>..HEAD --pretty=format:"%s%n%b"
   ```

5. Get diff summary:
   ```
   git diff origin/<default-branch>..HEAD --stat
   ```

## Generate PR Content

Based on the commits and diff, generate content:
- Use .github/PULL_REQUEST_TEMPLATE.md (if present)

Otherwise, follow this below

### Issue Detection
When `github_issues.enabled: true` in PROJECT.yaml:
1. Extract issue numbers from branch name (e.g., `feature/123-description` → #123)
2. Extract issue references from commit messages (`Refs #N`, `Closes #N`)
3. Include all detected issues in the PR description under "Related Issues"
4. Use `Closes #N` for issues that will be completed by this PR
5. Use `Relates to #N` for issues that are referenced but not completed
6. Show all detected issue references to the user for confirmation before including them in the PR body. Distinguish between `Closes` (will auto-close on merge) and `Relates to` (informational only).

### Title
- Follow format: `<type>: <description>` or match branch name pattern
- Keep under 72 characters
- Use imperative mood

### Description
Use this template:

```markdown
## Summary
<Brief description of what this PR does>

## Changes
<Bullet list of main changes>

## Testing
<How the changes were tested>

## Related Issues
<!-- Auto-detected from branch name and commit messages -->
<Fixes #N, Relates to #M — auto-detect from branch name pattern and commit body references>
```

## Create PR

1. Show generated title and description to user
2. Ask for confirmation or edits
3. Execute:
   ```bash
   gh pr create --title "<title>" --body "<description>" --base <default-branch>
   ```

4. Additional options if requested:
   - `--draft` for draft PR
   - `--reviewer <users>` to request reviewers
   - `--assignee @me` to self-assign
   - `--label <labels>` to add labels

5. Show PR URL after creation

## Usage Examples

```bash
# Create PR with auto-generated content
> /cc-pr-create

# Create as draft
> /cc-pr-create --draft

# Create with reviewers
> /cc-pr-create --reviewer @teammate1,@teammate2

# Create with labels
> /cc-pr-create --label bug,urgent

# Specify base branch
> /cc-pr-create --base develop
```

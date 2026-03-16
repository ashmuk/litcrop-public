---
name: cc-push
description: Command - Push changes to remote with safety checks
---

Before pushing, perform these safety checks:

1. Run `git status` to ensure working directory is clean
   - If there are uncommitted changes, ask user if they want to commit first

2. Check if the current branch has an upstream:
   `git rev-parse --abbrev-ref @{u} 2>/dev/null`
   - If no upstream: inform user this will be a first push, skip unpushed-commits check

3. If upstream exists, run `git log origin/$(git branch --show-current)..HEAD --oneline` to show unpushed commits
   - If no commits to push, inform user and stop

4. Run `git branch --show-current` to confirm current branch
   - Warn if pushing to main/master directly

5. Optional pre-push checks (if configured):
   - Run `npm test` or equivalent test command
   - Run `npm run lint` or equivalent lint command
   - Run `npm run typecheck` or equivalent type check

6. If all checks pass, execute:
   - First push: `git push -u origin $(git branch --show-current)`
   - Subsequent: `git push`

7. Report push result and show remote URL for reference

## Safety warnings

- Warn before force push (`--force` or `-f`)
- Warn before pushing to protected branches (main, master, production)
- Show commit count and summary before pushing

## Usage Examples

```bash
# Standard push
> /cc-push

# Push with force (use carefully)
> /cc-push --force

# Push to specific remote
> /cc-push origin

# Push and set upstream
> /cc-push -u origin feature/new-login
```

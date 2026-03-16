---
name: cc-tag-update
description: Command - Move latest tag to current HEAD with updated message
---

Move the latest tag to the current HEAD, updating its annotated message to reflect all included commits.

## Steps

1. **Find the latest tag:**
   `git tag -l --sort=-version:refname | head -1`
   - If no tags exist, stop with: "No tags found. Use `/cc-tag-create` to create the first tag."

2. **Compare tag position to HEAD:**
   - Get the tag's commit: `git rev-list -n 1 <tag>`
   - Get HEAD commit: `git rev-parse HEAD`
   - If they are the same, stop with: "Tag `<tag>` already points to HEAD. Nothing to update."

3. **Show commits between old tag position and HEAD:**
   `git log <tag>..HEAD --pretty=format:"- %s" --no-merges`

4. **Find the tag before the latest** to determine full commit range:
   `git tag -l --sort=-version:refname | sed -n '2p'`
   - If no prior tag exists, use the root commit as the base

5. **Compose updated tag message** covering all commits from prior-tag to HEAD:
   ```
   Release <tag>: <synthesized one-line summary>

   Changes since <prior-tag>:
   - <commit subject 1>
   - <commit subject 2>
   - ...
   ```

6. **Display warnings:**
   - Always: "⚠ This will DELETE and RECREATE tag `<tag>`"
   - Check if tag exists on remote: `git ls-remote --tags origin <tag>`
     - If yes: "⚠ Tag exists on remote — you will need to force-push: `git push origin --force tag <tag>`"

7. **Ask for confirmation** (yes/no/edit)

8. **Execute:**
   ```bash
   git tag -d <tag>
   git tag -a <tag> -m "<message>"
   ```

9. **Offer to push the tag:**
   - If tag was on remote: Ask "Force-push updated tag to origin? (yes/no)"
     - **Yes** → `git push origin --force tag <tag>`, report result
     - **No** → remind: "Push later with: `git push origin --force tag <tag>`"
   - If tag was local only: Ask "Push tag `<tag>` to origin? (yes/no)"
     - **Yes** → `git push origin <tag>`, report result
     - **No** → remind: "Push later with: `git push origin <tag>`"

## Edge Cases

- **No tags exist**: Stop and suggest `/cc-tag-create`
- **Tag already at HEAD**: Stop with informational message
- **Detached HEAD**: Warn the user before proceeding
- **Uncommitted changes**: Warn if working directory is dirty
- **Tag on remote**: Warn about force-push requirement and its impact on collaborators

## Usage Examples

```bash
# Move latest tag to current HEAD
> /cc-tag-update

# With context about why
> /cc-tag-update include the hotfix commits
```

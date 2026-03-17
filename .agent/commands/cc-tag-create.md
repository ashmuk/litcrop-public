---
name: cc-tag-create
description: Command - Create next annotated tag following v{X}.{yy} convention
---

Create the next annotated tag following the project's `v{X}.{yy}` convention (X = stage, yy = patch).

## Steps

1. **Read current stage** from `PROJECT.yaml` → `staged.current_stage`
   - If PROJECT.yaml is missing or `current_stage` is not set, stop and ask the user for the stage number

2. **Find the next patch number:**
   - List existing tags: `git tag -l "v<stage>.*" --sort=-version:refname`
   - Parse the highest `yy` value and increment by 1
   - If no tags exist for this stage, start at `0` (first tag will be `v<stage>.0`)

3. **Find the previous tag** (any stage):
   `git describe --tags --abbrev=0 2>/dev/null`
   - If no previous tag exists, use the root commit as the base

4. **Gather commits since previous tag:**
   `git log <prev-tag>..HEAD --pretty=format:"- %s" --no-merges`
   - If no new commits exist since the previous tag, stop with message:
     "No new commits since `<prev-tag>`. Nothing to tag."

5. **Compose the annotated tag message:**
   ```
   Release v{X}.{yy}: <synthesized one-line summary of changes>

   Changes since <prev-tag>:
   - <commit subject 1>
   - <commit subject 2>
   - ...
   ```
   The one-line summary should capture the theme of the changes (e.g., "hook improvements and devcontainer fixes").

6. **Show proposed tag and message**, then ask for confirmation:
   - **Yes** — proceed to create
   - **Edit** — let the user modify the message
   - **No** — abort

7. **Create the annotated tag:**
   `git tag -a "v{X}.{yy}" -m "<message>"`

8. **Offer to push the tag:**
   Ask: "Push tag `v{X}.{yy}` to origin? (yes/no)"
   - **Yes** → `git push origin v{X}.{yy}`, report result
   - **No** → remind: "Push later with: `git push origin v{X}.{yy}`"

## Edge Cases

- **Detached HEAD**: Warn the user they are in detached HEAD state before proceeding
- **Uncommitted changes**: Warn if working directory is dirty (tag will point to last commit, not uncommitted work)
- **No PROJECT.yaml**: Stop and ask for stage number explicitly

## Usage Examples

```bash
# Auto-detect next tag
> /cc-tag-create

# With hint about what this release covers
> /cc-tag-create hook system improvements
```

---
name: cc-commit
description: Command - Stage changes and commit with generated message
---

Review the current git status and staged/unstaged changes:

1. Run `git status` to see the current state
2. Run `git diff` to see unstaged changes
3. Run `git diff --cached` to see already staged changes

Then:

1. Stage the appropriate files using `git add`:
   - If specific files were mentioned: `git add <files>`
   - If no files specified: show changed files list and ask user which to stage

   **Safety Rule A — Secrets protection (check BEFORE staging):**
   Before running `git add`, check file names against these patterns:
   `.env`, `.env.*` (except `.env.example`, `.env.sample`, `.env.template`),
   `credentials.json`, `*secret*.json`, `token.json`,
   `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.keystore`, `*.jks`,
   `id_rsa*`, `id_ed25519*`, `id_ecdsa*`,
   `secrets.*`, `.npmrc`, `.pypirc`.
   If a matching file is detected: **refuse to stage it** and warn the user.
   If the user insists, require explicit confirmation with a warning that
   secrets committed to git history are nearly impossible to fully remove.

   **Safety Rule B — .gitignore-blocked files (check BEFORE staging):**
   Before running `git add`, use `git check-ignore -v <files>` to identify
   which files are blocked by `.gitignore`. For any blocked files:
   **stop**, list them with their matching `.gitignore` patterns,
   and ask the user whether to force-add (`git add -f`) or skip each file.
   Never use `git add -f` without explicit user approval.

2. Generate a commit message following conventional commits format:
   - Follow RULES.md (if present in this project)
     Otherwise,
   - Type: feat|fix|docs|style|refactor|test|chore
   - Scope: optional, module or component affected
   - Description: imperative mood, lowercase, no period
   - Body: optional, explain what and why
   - **Issue reference**: If `github_issues.enabled: true` in PROJECT.yaml and the work relates to a GitHub Issue:
     - Include `Refs #N` in the commit body for in-progress work
     - Include `Closes #N` in the commit body when the commit completes the issue
     - Detect the linked issue from: branch name pattern (`feature/123-*`, `fix/123-*`), recent issue context in conversation, or ask user
     - If no linked issue is detected and issues are enabled, ask: "Link to a GitHub Issue? (enter number, or skip)"

3. Show the proposed commit message and ask for confirmation

4. Execute `git commit -m "<message>"` (or with body: `git commit -m "<title>" -m "<body>"`)

## Example commit message format

```
feat(auth): add OAuth2 login support

- Implement Google OAuth2 provider
- Add session management for OAuth tokens
- Update user model with provider field
```

## Usage Examples

```bash
# Stage all and commit
> /cc-commit

# Stage specific files
> /cc-commit src/auth.ts src/types.ts

# With hint for commit type
> /cc-commit fix the login bug
```

---
name: cc-pr-merge
description: Command - Validate and merge an open pull request on GitHub
---

## Prerequisites

1. Verify GitHub CLI: `gh --version`
   - If not installed, inform user: `brew install gh`
2. Verify authentication: `gh auth status`
3. Fetch latest from remote: `git fetch --prune`

## Find Target PR

1. If user specified a PR number: use that
   If no PR number specified:
   - List open PRs: `gh pr list --state open --json number,title,headRefName,baseRefName,author --template '{{range .}}#{{.number}} {{.title}} ({{.headRefName}} → {{.baseRefName}}) by {{.author.login}}{{"\n"}}{{end}}'`
   - If only one open PR exists, select it automatically
   - If no open PRs exist, inform user and exit
   - If multiple, show the list and ask user to choose

2. Get full PR details:
   `gh pr view <number> --json number,title,headRefName,baseRefName,body,state,mergeable,reviewDecision,statusCheckRollup,isDraft,additions,deletions,changedFiles`

3. If PR is a draft: warn user and ask if they want to proceed or mark as ready first

## Validate PR

1. **Merge conflict check:**
   - Check `mergeable` field from PR details
   - If `CONFLICTING`: stop and inform user to resolve conflicts first
   - If `UNKNOWN`: warn and suggest waiting or re-fetching

2. **CI status check:**
   - Parse `statusCheckRollup` for check statuses
   - Show summary: passed, failed, pending checks
   - If any checks failed: show details and warn user
   - If checks are still running: inform user and ask whether to wait or proceed

3. **Review status:**
   - Check `reviewDecision` field
   - Show status: APPROVED, CHANGES_REQUESTED, REVIEW_REQUIRED, or no reviews
   - If CHANGES_REQUESTED: warn user

4. **Protected branch warning:** If base branch is `main` or `master`:
   - Show prominent warning: "This PR merges into a protected branch (main/master)"
   - Require explicit confirmation before proceeding

5. **Diff summary:**
   - Show: files changed, additions, deletions
   - Optionally show full diff: `gh pr diff <number> --stat`

6. Display validation summary:
   ```
   PR #<number>: <title>
   <head> → <base>
   Mergeable: YES/NO    CI: PASS/FAIL/PENDING    Reviews: APPROVED/PENDING
   Changes: +<additions> -<deletions> across <files> files
   ```

## Merge PR

1. Determine merge method:
   - If user provided `--squash` or `--rebase` as argument: use that method
   - Otherwise, ask user to choose:
     - **Merge commit** (default): `--merge`
     - **Squash**: `--squash`
     - **Rebase**: `--rebase`

2. Ask for confirmation showing the full summary

3. Execute merge:
   `gh pr merge <number> --<method> --delete-branch`
   - `--delete-branch` removes the remote head branch after merge
   - If user doesn't want branch deletion, omit the flag

4. After merge succeeds:
   - Show merge confirmation
   - Sync local target branch:
     - If currently on target branch: `git pull`
     - Otherwise: `git fetch origin <base>:<base>`
   - Clean up local head branch if it exists:
     - `git branch -d <head-branch>` (safe delete)
     - If delete fails, inform user and skip

## Usage Examples

```bash
# Validate and merge an open PR (interactive selection)
> /cc-pr-merge

# Merge a specific PR
> /cc-pr-merge #42

# Merge with squash
> /cc-pr-merge #42 --squash
```

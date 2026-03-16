---
name: cc-issue-create
description: Command - Create GitHub Issues with labels and milestones from task descriptions or bulk task boards
---

## Prerequisites Check

1. Verify GitHub CLI is installed: `gh --version`
   - If not installed, inform user: `brew install gh` or see https://cli.github.com/
2. Verify authentication: `gh auth status`
   - If not authenticated, run: `gh auth login`
3. Read PROJECT.yaml and check `github_issues.enabled`:
   - If the key is missing or `false`, stop and inform the user: "GitHub Issues are disabled for this project. Set `github_issues.enabled: true` in PROJECT.yaml to enable."
4. Verify a GitHub remote is configured: `gh repo view --json nameWithOwner -q .nameWithOwner`
   - If this fails, stop and inform the user that no GitHub remote was detected.

## Determine Mode

Check the user's invocation for a mode flag:

- **Single mode** (default): User provides a description of one task. Proceed to [Single Issue Creation](#single-issue-creation).
- **Bulk mode** (`--bulk`): Read task boards from PLANS.md, BACKLOG.md, or docs/TASK_BREAKDOWN.md and create issues for tasks not yet tracked. Optionally filter by scope level with `--scope <level>`. Proceed to [Bulk Issue Creation](#bulk-issue-creation).

## Ensure Labels Exist

Before creating any issue, ensure required labels exist in the repository. For each label that will be applied, run:

```bash
gh label list --limit 100
```

Compare against needed labels. For any missing label, create it:

```bash
gh label create "<label>" --color "<hex>" --description "<desc>" --force
```

Use these default colors and descriptions:

| Label | Color | Description |
|---|---|---|
| `step:define` | `#0075ca` | Define & requirements |
| `step:design` | `#e4e669` | Architecture & design |
| `step:implement` | `#d93f0b` | Implementation |
| `step:test` | `#0e8a16` | Test strategy & coverage |
| `step:review` | `#6f42c1` | Code & design review |
| `step:remediate` | `#b60205` | Fix review findings |
| `step:deploy` | `#1d76db` | Deployment & release |
| `area:docs` | `#cfd3d7` | Documentation |
| `area:agent` | `#84b6eb` | Agent / AI tooling |
| `area:performance` | `#e4e669` | Performance |
| `area:scripts` | `#bfd4f2` | Scripts & automation |
| `area:infra` | `#f9d0c4` | Infrastructure |
| `status:active` | `#0e8a16` | Currently being worked |
| `status:queued` | `#0075ca` | Queued for work |
| `status:idea` | `#cfd3d7` | Idea / not yet planned |
| `type:feature` | `#a2eeef` | New feature or capability |
| `type:fix` | `#d93f0b` | Bug fix |
| `type:docs` | `#cfd3d7` | Documentation change |
| `type:refactor` | `#e4e669` | Refactoring |
| `type:infra` | `#f9d0c4` | Infrastructure change |
| `priority:high` | `#b60205` | High priority |
| `priority:low` | `#cfd3d7` | Low priority |

Custom area labels (e.g., `area:auth`, `area:api`) may be created on demand using color `#bfd4f2`.

## Single Issue Creation

### Gather Description

Accept the user's task description. If none was given, ask: "Describe the task or work item for this issue."

### Determine Labels

Analyze the description and propose labels from these four dimensions. Ask the user to confirm or adjust before proceeding:

1. **Step label** (pick one that fits the task's current stage):
   - `step:define` — requirements or specification work
   - `step:design` — architecture, design, or planning work
   - `step:implement` — coding or building
   - `step:test` — test writing or coverage analysis
   - `step:review` — review or validation
   - `step:remediate` — fixing findings from review
   - `step:deploy` — deployment, release, or infrastructure provisioning

2. **Area label** (pick the most relevant; create a custom `area:<name>` if none fits):
   - `area:docs`, `area:agent`, `area:performance`, `area:scripts`, `area:infra`

3. **Type label** (pick one):
   - `type:feature`, `type:fix`, `type:docs`, `type:refactor`, `type:infra`

4. **Status label** (default to `status:queued` unless user specifies otherwise):
   - `status:active` — actively in progress
   - `status:queued` — ready for work, not started
   - `status:idea` — exploratory or not yet scoped

5. **Priority label** (optional; omit if no special priority):
   - `priority:high`, `priority:low`

### Determine Milestone

Ask whether this issue belongs to a milestone. Common milestones for staged projects:

- **PoC** — proof of concept scope
- **MVP** — minimum viable product scope
- **Production** — production-ready scope

If the user specifies one, look up or create the milestone:

```bash
gh api repos/{owner}/{repo}/milestones --jq '.[] | "\(.number) \(.title)"'
```

If the milestone does not exist, offer to create it:

```bash
gh api repos/{owner}/{repo}/milestones -X POST -f title="<name>"
```

If not applicable, leave unset.

### Generate Issue Content

Based on the description, generate:

- **Title**: concise, imperative mood, under 72 characters
- **Body**: use this template:

```markdown
## Summary
<One-paragraph description of the work item>

## Acceptance Criteria
- [ ] <criterion 1>
- [ ] <criterion 2>

## Notes
<Any context, references, or constraints>
```

Show the proposed title, body, labels, and milestone to the user. Ask for confirmation or edits before creating.

### Create Issue

```bash
gh issue create \
  --title "<title>" \
  --body "<body>" \
  --label "<label1>,<label2>,..." \
  --milestone "<milestone>"
```

Omit `--milestone` if none was selected.

Show the issue URL after creation.

### Sync TASKS.md

After successful creation, run cc-issue-sync to refresh `TASKS.md` (project root):

```bash
# Invoke /cc-issue-sync to refresh task tracking
```

Inform the user that TASKS.md has been updated.

## Bulk Issue Creation

### Read Task Board

Read the task board source in this priority order:

1. `PLANS.md` or `BACKLOG.md` (preferred — manually authored task definitions)
2. `docs/TASK_BREAKDOWN.md` (fallback — design artifact from cc-design Step 6)

### Filter by Scope Level

If `--scope <level>` is passed (e.g., `--scope PoC`), only create issues for tasks belonging to that scope level. This is used by cc-implement's scope transition checkpoint to create issues incrementally per scope level rather than all at once.

If no `--scope` flag is passed, create issues for all tasks (backward compatible).

Parse tasks from the file. Look for:
- Markdown checkboxes (`- [ ] Task description`)
- Numbered task lists with descriptions
- Table rows in a task board section

### Filter Already-Tracked Tasks

Run `gh issue list --limit 200 --json title,number` and compare titles against parsed tasks. Skip any task whose title already exists as an open issue (fuzzy-match on normalized title).

Show the user a summary:
- N tasks found in task board
- M already tracked as issues
- K tasks to be created

Ask for confirmation before proceeding.

### Assign Labels and Milestones in Bulk

For each task to create, infer labels from available context:
- Section heading in TASKS.md (e.g., "## Step 3: Design" → `step:design`)
- Keywords in task description (e.g., "fix", "deploy", "document")
- Milestone from section (e.g., "### PoC Scope" → milestone `PoC`)

Present the proposed label+milestone mapping for the batch and ask for confirmation or adjustments before creation.

### Create Issues

For each task, ensure labels exist (see [Ensure Labels Exist](#ensure-labels-exist)), then create:

```bash
gh issue create \
  --title "<task title>" \
  --body "<generated body>" \
  --label "<labels>" \
  --milestone "<milestone>"
```

Print a progress line for each issue created: `Created #<number>: <title>`.

### Sync TASKS.md

After all issues are created, invoke cc-issue-sync to refresh TASKS.md with the new issue numbers linked.

Report the total count of issues created and any that were skipped.

## Usage Examples

```bash
# Create a single issue interactively
> /cc-issue-create

# Create with description hint
> /cc-issue-create Add OAuth2 login support

# Create in bulk from TASKS.md
> /cc-issue-create --bulk

# Create in bulk from PLANS.md
> /cc-issue-create --bulk --source PLANS.md

# Create in bulk for a specific scope level
> /cc-issue-create --bulk --scope PoC
```

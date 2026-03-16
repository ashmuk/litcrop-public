#!/usr/bin/env bash
# init-project.sh - Initialize project after template deployment
# Supports both interactive (wizard) and non-interactive (CLI) modes
set -euo pipefail

# Track current step for interrupt handling
CURRENT_STEP=""

# Error handler for unexpected failures
trap 'on_error $? $LINENO' ERR

on_error() {
  local exit_code=$1
  local line_no=$2
  echo "" >&2
  echo -e "\033[0;31m✗ Unexpected error at line $line_no (exit code: $exit_code)\033[0m" >&2
  echo "  Run with VERBOSE=1 for more details" >&2
  echo "  You can safely re-run this script to continue setup" >&2
  exit "$exit_code"
}

# Interrupt handler for CTRL-C
trap 'on_interrupt' INT TERM

on_interrupt() {
  echo "" >&2
  echo "" >&2
  echo -e "\033[1;33m⚠ Interrupted by user\033[0m" >&2
  if [[ -n "$CURRENT_STEP" ]]; then
    echo "  Stopped during: $CURRENT_STEP" >&2
  fi
  echo "" >&2
  echo "  Your project is in a partial state. What was completed:" >&2

  # Show what's already done
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "    ✓ Git repository initialized" >&2
    if git rev-parse HEAD >/dev/null 2>&1; then
      echo "    ✓ Has commits" >&2
    fi
    if git remote get-url origin >/dev/null 2>&1; then
      echo "    ✓ Remote configured" >&2
    fi
    if git show-ref --verify --quiet refs/heads/develop 2>/dev/null; then
      echo "    ✓ Develop branch exists" >&2
    fi
  fi
  [[ -f ".env" ]] && echo "    ✓ .env file exists" >&2

  echo "" >&2
  echo "  To continue setup, run: make init" >&2
  echo "  To start fresh, run: rm -rf .git && make init" >&2
  echo "" >&2
  exit 130
}

# Show usage
show_usage() {
  cat << 'EOF'
Usage: init-project.sh [MODE] [OPTIONS]

Modes:
  wizard    Interactive setup with prompts (default)
  cli       Non-interactive setup with defaults

Options:
  -v, --verbose   Show detailed command output and errors
  -h, --help      Show this help message

Examples:
  ./scripts/init-project.sh                    # Interactive wizard
  ./scripts/init-project.sh wizard -v          # Wizard with verbose output
  ./scripts/init-project.sh cli                # Non-interactive
  VERBOSE=1 ./scripts/init-project.sh          # Verbose via env var

Environment Variables:
  VERBOSE=1       Enable verbose mode
EOF
  exit 0
}

# Handle --help anywhere in args
for arg in "$@"; do
  if [[ "$arg" == "-h" ]] || [[ "$arg" == "--help" ]]; then
    show_usage
  fi
done

# Check required commands
check_requirements() {
  local missing=()

  if ! command -v git >/dev/null 2>&1; then
    missing+=("git")
  fi

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "Error: Required command(s) not found: ${missing[*]}" >&2
    echo "Please install the missing tools and try again." >&2
    exit 1
  fi
}

check_requirements

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

# Colors
RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'
CYAN=$'\033[0;36m'
NC=$'\033[0m'

# Mode: "wizard" (interactive) or "cli" (non-interactive)
MODE="${1:-wizard}"

# Verbose mode: set VERBOSE=1 or pass -v/--verbose as second argument
VERBOSE="${VERBOSE:-0}"
if [[ "${2:-}" == "-v" ]] || [[ "${2:-}" == "--verbose" ]]; then
  VERBOSE=1
fi

print_header() {
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}  $1${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_step() {
  echo -e "${CYAN}▶${NC} $1"
}

print_success() {
  echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
  echo -e "${RED}✗${NC} $1"
}

print_info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

print_verbose() {
  if [[ "$VERBOSE" == "1" ]]; then
    echo -e "${CYAN}  [verbose]${NC} $1"
  fi
}

print_cmd() {
  echo -e "${CYAN}  \$${NC} $1"
}

# Run a command with verbose output and error handling
# Usage: run_cmd "description" command [args...]
# Returns: exit code of the command
run_cmd() {
  local description="$1"
  shift
  local cmd_str="$*"

  print_step "$description"
  print_cmd "$cmd_str"

  local output
  local exit_code=0

  # Capture both stdout and stderr
  output=$("$@" 2>&1) || exit_code=$?

  if [[ "$VERBOSE" == "1" ]] && [[ -n "$output" ]]; then
    echo "$output" | sed 's/^/    /'
  fi

  if [[ $exit_code -ne 0 ]]; then
    print_error "Command failed (exit code: $exit_code)"
    if [[ -n "$output" ]]; then
      echo -e "${RED}  Error output:${NC}"
      echo "$output" | sed 's/^/    /'
    fi
    suggest_fix_for_error "$cmd_str" "$output"
    return $exit_code
  fi

  return 0
}

# Suggest fixes based on common error patterns
suggest_fix_for_error() {
  local _cmd="$1"  # Reserved for future use (e.g., command-specific suggestions)
  local error="$2"

  echo ""
  echo -e "${YELLOW}Possible solutions:${NC}"

  # SSH key issues
  if echo "$error" | grep -qi "permission denied (publickey)"; then
    echo "  1. Check SSH key is added: ssh-add -l"
    echo "  2. Add SSH key: ssh-add ~/.ssh/id_ed25519"
    echo "  3. Test SSH connection: ssh -T git@github.com"
    echo "  4. Use HTTPS instead: git remote set-url origin https://github.com/USER/REPO.git"
    return
  fi

  # Authentication issues
  if echo "$error" | grep -qi "authentication failed\|could not read Username"; then
    echo "  1. Check gh auth status: gh auth status"
    echo "  2. Re-authenticate: gh auth login"
    echo "  3. For HTTPS, set up credential helper: git config --global credential.helper osxkeychain"
    return
  fi

  # Remote already exists
  if echo "$error" | grep -qi "remote origin already exists"; then
    echo "  1. View current remote: git remote -v"
    echo "  2. Remove and re-add: git remote remove origin && git remote add origin <url>"
    echo "  3. Update URL: git remote set-url origin <new-url>"
    return
  fi

  # Non-fast-forward (need to pull first)
  if echo "$error" | grep -qi "non-fast-forward\|fetch first\|failed to push"; then
    echo "  1. Pull first: git pull origin main --rebase"
    echo "  2. If unrelated histories: git pull origin main --rebase --allow-unrelated-histories"
    echo "  3. Force push (destructive!): git push -u origin main --force"
    return
  fi

  # Branch doesn't exist on remote
  if echo "$error" | grep -qi "src refspec.*does not match\|failed to push some refs"; then
    echo "  1. Check current branch: git branch --show-current"
    echo "  2. Create initial commit if needed: git add . && git commit -m 'Initial commit'"
    echo "  3. Push with explicit branch: git push -u origin HEAD:main"
    return
  fi

  # Repository not found
  if echo "$error" | grep -qi "repository not found\|does not exist"; then
    echo "  1. Verify repository exists: gh repo view <owner/repo>"
    echo "  2. Check access permissions on GitHub"
    echo "  3. Verify remote URL: git remote -v"
    return
  fi

  # Connection issues
  if echo "$error" | grep -qi "could not resolve host\|connection refused\|network"; then
    echo "  1. Check internet connection"
    echo "  2. Try: ping github.com"
    echo "  3. Check DNS: nslookup github.com"
    return
  fi

  # gh CLI not authenticated
  if echo "$error" | grep -qi "gh auth login\|not logged in"; then
    echo "  1. Authenticate gh CLI: gh auth login"
    echo "  2. Check status: gh auth status"
    return
  fi

  # Generic fallback
  echo "  1. Check the error message above for details"
  echo "  2. Run with verbose mode: VERBOSE=1 make init"
  echo "  3. Try the command manually to see full output"
}

# Ask yes/no question (wizard mode only)
ask_yes_no() {
  local prompt="$1"
  local default="${2:-y}"

  if [[ "$MODE" == "cli" ]]; then
    [[ "$default" == "y" ]] && return 0 || return 1
  fi

  local yn_hint="[Y/n]"
  [[ "$default" == "n" ]] && yn_hint="[y/N]"

  read -p "$prompt $yn_hint " -n 1 -r
  echo

  if [[ -z "$REPLY" ]]; then
    [[ "$default" == "y" ]] && return 0 || return 1
  fi

  [[ "$REPLY" =~ ^[Yy]$ ]] && return 0 || return 1
}

# Ask for input (wizard mode only)
# Usage: result=$(ask_input "prompt" "default")
ask_input_value() {
  local prompt="$1"
  local default="$2"

  if [[ "$MODE" == "cli" ]]; then
    echo "$default"
    return
  fi

  local input
  read -r -p "$prompt [$default]: " input
  echo "${input:-$default}"
}

# Legacy wrapper for compatibility (deprecated - use ask_input_value instead)
ask_input() {
  local prompt="$1"
  local default="$2"
  local varname="$3"
  local value

  value=$(ask_input_value "$prompt" "$default")
  # Use printf to safely assign without eval
  printf -v "$varname" '%s' "$value"
}

# ============================================
# Step 1: Git Repository
# ============================================
init_git() {
  CURRENT_STEP="Step 1: Git Repository"
  print_header "$CURRENT_STEP"

  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    print_success "Git repository already initialized"
    return 0
  fi

  if [[ "$MODE" == "wizard" ]]; then
    if ! ask_yes_no "Initialize git repository?"; then
      print_warning "Skipping git initialization"
      return 0
    fi
  fi

  print_step "Initializing git repository..."
  git init
  print_success "Git repository initialized"

  # Ask about default branch
  local branch_name="main"
  if [[ "$MODE" == "wizard" ]]; then
    ask_input "Default branch name" "main" branch_name
  fi

  if [[ "$branch_name" != "main" ]] && [[ "$branch_name" != "master" ]]; then
    git checkout -b "$branch_name" 2>/dev/null || true
    print_success "Default branch set to: $branch_name"
  fi
}

# ============================================
# Step 8: Git Hooks (after remote push, for PR workflow)
# ============================================
setup_hooks() {
  CURRENT_STEP="Step 8: Git Hooks"
  print_header "$CURRENT_STEP"

  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    print_warning "Not a git repository, skipping hooks setup"
    return 0
  fi

  if [[ "$MODE" == "wizard" ]]; then
    echo ""
    print_info "Git hooks will enforce code quality on commits and pushes."
    print_info "Now that initial setup is pushed, hooks won't block your workflow."
    echo ""
    if ! ask_yes_no "Set up git hooks (pre-commit, pre-push)?"; then
      print_warning "Skipping git hooks setup"
      print_info "You can set up hooks later with: make setup-hooks"
      return 0
    fi
  fi

  if [[ -x "./scripts/boilerplate/setup-git-hooks.sh" ]]; then
    print_step "Running setup-git-hooks.sh..."
    ./scripts/boilerplate/setup-git-hooks.sh
  elif [[ -d ".githooks" ]]; then
    print_step "Configuring git to use .githooks/..."
    git config core.hooksPath .githooks
    chmod +x .githooks/* 2>/dev/null || true
    print_success "Git hooks configured"
  else
    print_warning "No .githooks directory found, skipping"
  fi
}

# ============================================
# Step 2: Environment File
# ============================================
setup_env() {
  CURRENT_STEP="Step 2: Environment Configuration"
  print_header "$CURRENT_STEP"

  if [[ -f ".env" ]]; then
    print_success ".env file already exists"

    if [[ "$MODE" == "wizard" ]]; then
      if ask_yes_no "Review/edit .env file now?" "n"; then
        ${EDITOR:-nano} .env
      fi
    fi
    return 0
  fi

  if [[ ! -f ".env.example" ]]; then
    print_warning "No .env.example found, skipping"
    return 0
  fi

  if [[ "$MODE" == "wizard" ]]; then
    if ! ask_yes_no "Create .env from .env.example?"; then
      print_warning "Skipping .env creation"
      return 0
    fi
  fi

  print_step "Creating .env from .env.example..."
  cp .env.example .env
  print_success ".env file created"

  if [[ "$MODE" == "wizard" ]]; then
    print_warning "Remember to edit .env and add your configuration values!"
    if ask_yes_no "Edit .env file now?" "n"; then
      ${EDITOR:-nano} .env
    fi
  fi
}

# ============================================
# Step 3: Project Character (toolbox or staged)
# ============================================
setup_character() {
  CURRENT_STEP="Step 3: Project Character"
  print_header "$CURRENT_STEP"

  if [[ -f "PROJECT.yaml" ]]; then
    local character
    character=$(grep "^character:" PROJECT.yaml | awk '{print $2}')
    print_success "PROJECT.yaml already exists (character: ${character:-unknown})"
    return 0
  fi

  if [[ ! -d ".agent/starters" ]]; then
    print_warning ".agent/starters/ not found — skipping project character setup"
    print_info "Run 'make fetch-from-upstream' first to get starter templates"
    return 0
  fi

  if [[ "$MODE" == "wizard" ]]; then
    echo ""
    echo "Project character determines your workflow:"
    echo "  1) Staged — Linear progression through defined stages (PLANS.md)"
    echo "     Best for: new products, migrations, structured development"
    echo "  2) Toolbox — Ad-hoc tasks with a backlog (BACKLOG.md)"
    echo "     Best for: utility repos, plugins, ongoing maintenance"
    echo ""
    read -p "Choose project character [1/2] (default: 1 Staged): " -n 1 -r character_choice
    echo ""
  else
    # CLI mode defaults to staged
    character_choice="1"
  fi

  case "$character_choice" in
    2)
      if [[ ! -f ".agent/starters/PROJECT.toolbox.yaml" ]]; then
        print_error "Starter file missing: .agent/starters/PROJECT.toolbox.yaml"
        return 1
      fi
      cp .agent/starters/PROJECT.toolbox.yaml PROJECT.yaml
      print_success "Initialized as TOOLBOX project"

      if [[ -f "BACKLOG.md" ]]; then
        if [[ "$MODE" == "wizard" ]] && ask_yes_no "BACKLOG.md already exists. Overwrite (backup will be created)?" "n"; then
          mv BACKLOG.md BACKLOG.md.bak
          cp .agent/starters/BACKLOG.md BACKLOG.md
          print_success "BACKLOG.md replaced (backup: BACKLOG.md.bak)"
        else
          print_info "BACKLOG.md already exists, keeping it"
        fi
      else
        cp .agent/starters/BACKLOG.md BACKLOG.md
        print_success "Created BACKLOG.md"
      fi

      mkdir -p docs/decisions
      print_info "Add tasks to BACKLOG.md to get started"
      ;;
    *)
      if [[ ! -f ".agent/starters/PROJECT.staged.yaml" ]]; then
        print_error "Starter file missing: .agent/starters/PROJECT.staged.yaml"
        return 1
      fi
      cp .agent/starters/PROJECT.staged.yaml PROJECT.yaml
      print_success "Initialized as STAGED project"

      if [[ -f "PLANS.md" ]]; then
        if [[ "$MODE" == "wizard" ]] && ask_yes_no "PLANS.md already exists. Overwrite (backup will be created)?" "n"; then
          mv PLANS.md PLANS.md.bak
          cp .agent/starters/PLANS.md PLANS.md
          print_success "PLANS.md replaced (backup: PLANS.md.bak)"
        else
          print_info "PLANS.md already exists, keeping it"
        fi
      else
        cp .agent/starters/PLANS.md PLANS.md
        print_success "Created PLANS.md"
      fi

      mkdir -p docs/decisions
      print_info "Edit PROJECT.yaml to set current_stage, edit PLANS.md to define roadmap"
      ;;
  esac
}

# ============================================
# Step 4: Sync Agents (non-interactive - always runs)
# ============================================
run_sync() {
  CURRENT_STEP="Step 4: Sync Agent Configuration"
  print_header "$CURRENT_STEP"

  if [[ ! -f "Makefile" ]]; then
    print_warning "No Makefile found, skipping sync"
    return 0
  fi

  if grep -q "^sync:" Makefile; then
    print_step "Running make sync..."
    if make sync 2>/dev/null; then
      print_success "Agent sync completed"
    else
      print_warning "make sync had warnings (may be OK)"
    fi
  fi

  if grep -q "^sync-codex-skills:" Makefile; then
    print_step "Running make sync-codex-skills..."
    if make sync-codex-skills 2>/dev/null; then
      print_success "Codex skills sync completed"
    else
      print_warning "make sync-codex-skills had warnings (may be OK)"
    fi
  fi

  if ! grep -q "^sync:" Makefile && ! grep -q "^sync-codex-skills:" Makefile; then
    print_warning "No sync targets found in Makefile, skipping"
  fi
}

# ============================================
# Step 5: Initial Commit (wizard only)
# ============================================
initial_commit() {
  CURRENT_STEP="Step 5: Initial Commit"
  if [[ "$MODE" != "wizard" ]]; then
    return 0
  fi

  print_header "$CURRENT_STEP"

  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    print_warning "Not a git repository, skipping"
    return 0
  fi

  # Check if there are already commits
  if git rev-parse HEAD >/dev/null 2>&1; then
    print_info "Repository already has commits"
    return 0
  fi

  if ! ask_yes_no "Create initial commit?"; then
    print_warning "Skipping initial commit"
    return 0
  fi

  local project_name
  project_name=$(basename "$PROJECT_ROOT")

  print_step "Staging files..."
  git add .

  print_step "Creating initial commit..."
  git commit -m "feat: initial project setup for ${project_name}

- Project template deployed
- Agent configuration synced
- Environment configured

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

  print_success "Initial commit created"
}

# ============================================
# Step 7: Branch Strategy (wizard only)
# ============================================
setup_branches() {
  CURRENT_STEP="Step 7: Branch Strategy"
  if [[ "$MODE" != "wizard" ]]; then
    return 0
  fi

  print_header "$CURRENT_STEP"

  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    print_warning "Not a git repository, skipping"
    return 0
  fi

  # Check if there are commits
  if ! git rev-parse HEAD >/dev/null 2>&1; then
    print_warning "No commits yet, skipping branch setup"
    return 0
  fi

  # Check if develop branch already exists
  if git show-ref --verify --quiet refs/heads/develop; then
    print_success "'develop' branch already exists"
    local current_branch
    current_branch=$(git branch --show-current)
    if [[ "$current_branch" != "develop" ]]; then
      if ask_yes_no "Switch to 'develop' branch?"; then
        git checkout develop
        print_success "Switched to 'develop' branch"
      fi
    fi
    return 0
  fi

  echo ""
  echo "Branch strategy options:"
  echo "  1) PR workflow: Create 'develop' branch for feature work (recommended)"
  echo "     - 'main' for releases, 'develop' for integration"
  echo "     - Features branch from 'develop', PRs merge to 'develop'"
  echo "  2) Simple workflow: Work directly on 'main'"
  echo "     - Suitable for small projects or solo development"
  echo ""
  read -p "Choose branch strategy [1/2]: " -n 1 -r branch_strategy
  echo ""

  if [[ "$branch_strategy" != "1" ]]; then
    print_info "Using simple workflow on 'main' branch"
    return 0
  fi

  # Ensure we're on main first
  local current_branch
  current_branch=$(git branch --show-current 2>/dev/null || echo "")

  if [[ "$current_branch" != "main" ]]; then
    print_step "Switching to 'main' branch first..."
    git checkout main 2>/dev/null || git checkout -b main 2>/dev/null || true
  fi

  print_step "Creating 'develop' branch from 'main'..."
  git checkout -b develop

  print_success "Created and switched to 'develop' branch"

  # If remote exists, push develop branch
  if git remote get-url origin >/dev/null 2>&1; then
    if ask_yes_no "Push 'develop' branch to remote? (--no-verify)" "y"; then
      if run_cmd "Pushing develop branch (--no-verify)" git push -u origin develop --no-verify; then
        print_success "Pushed 'develop' branch to remote"
      fi
    fi
  fi

  print_info "Branch strategy:"
  echo "    main    ← releases/production (protected)"
  echo "    develop ← integration branch (current)"
  echo "    feature/* ← branch from develop for new features"
  echo ""
  print_info "Workflow: feature/* → PR → develop → PR → main"

  if ask_yes_no "Show recommended branch protection settings?" "n"; then
    echo ""
    echo -e "${BLUE}Recommended GitHub branch protection for 'main':${NC}"
    echo "  • Require pull request before merging"
    echo "  • Require approvals (1+)"
    echo "  • Require status checks to pass"
    echo "  • Require branches to be up to date"
    echo "  • Do not allow bypassing the above settings"
    echo ""
    echo -e "${BLUE}Recommended protection for 'develop':${NC}"
    echo "  • Require pull request before merging"
    echo "  • Require status checks to pass"
    echo ""
    echo "Configure at: https://github.com/<owner>/<repo>/settings/branches"
    echo ""
  fi
}

# ============================================
# Step 6: Remote Repository (wizard only)
# ============================================
setup_remote() {
  CURRENT_STEP="Step 6: Remote Repository"
  if [[ "$MODE" != "wizard" ]]; then
    return 0
  fi

  print_header "$CURRENT_STEP"

  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    print_warning "Not a git repository, skipping"
    return 0
  fi

  # Check if remote already exists
  if git remote get-url origin >/dev/null 2>&1; then
    local remote_url
    remote_url=$(git remote get-url origin)
    print_success "Remote 'origin' already configured: $remote_url"
    return 0
  fi

  echo ""
  echo "Remote repository options:"
  echo "  1) Create new GitHub repository (requires gh CLI)"
  echo "  2) Connect to existing remote repository"
  echo "  3) Skip - set up remote later"
  echo ""
  read -p "Choose [1/2/3]: " -n 1 -r remote_choice
  echo ""

  case "$remote_choice" in
    1)
      # Create new GitHub repo
      if command -v gh >/dev/null 2>&1; then
        create_github_repo
      else
        print_error "gh CLI not found. Install from: https://cli.github.com/"
        print_info "Falling back to manual remote entry..."
        connect_manual_remote
      fi
      ;;
    2)
      # Connect to existing remote
      connect_manual_remote
      ;;
    *)
      # Skip
      print_info "Skipping remote setup"
      print_info "You can add a remote later with: git remote add origin <url>"
      ;;
  esac
}

# ============================================
# Connect to Manual Remote URL
# ============================================
connect_manual_remote() {
  local remote_url=""
  ask_input "Remote URL (e.g., git@github.com:user/repo.git)" "" remote_url

  if [[ -z "$remote_url" ]]; then
    print_warning "No URL provided, skipping remote setup"
    return 0
  fi

  # Basic URL validation
  if [[ ! "$remote_url" =~ ^(https?://|git@|ssh://|git://) ]]; then
    print_warning "URL doesn't look like a valid git remote URL"
    if ! ask_yes_no "Continue anyway?"; then
      return 0
    fi
  fi

  if ! git remote add origin "$remote_url"; then
    print_error "Failed to add remote"
    suggest_fix_for_error "git remote add origin" "remote origin already exists"
    return 1
  fi
  print_success "Remote 'origin' added: $remote_url"

  # Push current branch (should be main at this point)
  local current_branch
  current_branch=$(git branch --show-current)

  if ask_yes_no "Push '$current_branch' branch to remote? (--no-verify)" "y"; then
    if run_cmd "Pushing to origin/$current_branch (--no-verify)" git push -u origin "$current_branch" --no-verify; then
      print_success "Pushed to origin/$current_branch"
    fi
  fi
}

# ============================================
# Create GitHub Repository via gh CLI
# ============================================
create_github_repo() {
  local project_name
  project_name=$(basename "$PROJECT_ROOT")

  local repo_name=""
  ask_input "Repository name" "$project_name" repo_name

  # Check if repository already exists on GitHub
  local gh_user
  gh_user=$(gh api user --jq '.login' 2>/dev/null || echo "")

  if [[ -n "$gh_user" ]]; then
    local full_repo_name="$repo_name"
    # If repo_name doesn't contain '/', assume it's under current user
    if [[ "$repo_name" != *"/"* ]]; then
      full_repo_name="$gh_user/$repo_name"
    fi

    if gh repo view "$full_repo_name" >/dev/null 2>&1; then
      print_warning "Repository '$full_repo_name' already exists on GitHub!"
      if ask_yes_no "Connect local project to existing repository?"; then
        connect_existing_github_repo "$full_repo_name"
        return 0
      else
        print_info "Skipping remote setup"
        return 0
      fi
    fi
  fi

  local visibility="private"
  echo ""
  echo "Repository visibility:"
  echo "  1) Private (default)"
  echo "  2) Public"
  read -p "Choose [1/2]: " -n 1 -r visibility_choice
  echo ""

  if [[ "$visibility_choice" == "2" ]]; then
    visibility="public"
  fi

  # Ensure we're on 'main' branch before creating repo
  ensure_main_branch

  # Create the repository
  local gh_args=("repo" "create" "$repo_name" "--$visibility" "--source=." "--remote=origin")

  if ask_yes_no "Push to GitHub after creating?" "y"; then
    gh_args+=("--push")
  fi

  local gh_cmd_str="gh ${gh_args[*]}"
  print_step "Creating GitHub repository: $repo_name ($visibility)..."
  print_cmd "$gh_cmd_str"

  local output
  local exit_code=0
  output=$(gh "${gh_args[@]}" 2>&1) || exit_code=$?

  if [[ "$VERBOSE" == "1" ]] && [[ -n "$output" ]]; then
    echo "$output" | sed 's/^/    /'
  fi

  if [[ $exit_code -eq 0 ]]; then
    print_success "GitHub repository created and 'main' pushed!"
    local repo_url
    repo_url=$(git remote get-url origin 2>/dev/null || echo "")
    if [[ -n "$repo_url" ]]; then
      print_info "Repository URL: $repo_url"
    fi
  else
    print_error "Command failed (exit code: $exit_code)"
    if [[ -n "$output" ]]; then
      echo -e "${RED}  Error output:${NC}"
      echo "$output" | sed 's/^/    /'
    fi
    suggest_fix_for_error "$gh_cmd_str" "$output"
  fi
}

# ============================================
# Connect to Existing GitHub Repository
# ============================================
connect_existing_github_repo() {
  local full_repo_name="$1"

  print_step "Connecting to existing repository: $full_repo_name"

  # Get the clone URL
  local repo_url
  repo_url=$(gh repo view "$full_repo_name" --json sshUrl --jq '.sshUrl' 2>/dev/null)

  if [[ -z "$repo_url" ]]; then
    # Fallback to HTTPS URL
    repo_url=$(gh repo view "$full_repo_name" --json url --jq '.url' 2>/dev/null)
  fi

  if [[ -z "$repo_url" ]]; then
    print_error "Could not get repository URL"
    return 1
  fi

  # Add remote
  git remote add origin "$repo_url"
  print_success "Remote 'origin' added: $repo_url"

  # Ensure we're on 'main' branch
  ensure_main_branch

  # Check if remote has commits
  local remote_has_commits=false
  if git ls-remote --heads origin main >/dev/null 2>&1; then
    if [[ -n "$(git ls-remote --heads origin main)" ]]; then
      remote_has_commits=true
    fi
  fi

  local local_has_commits=false
  if git rev-parse HEAD >/dev/null 2>&1; then
    local_has_commits=true
  fi

  if [[ "$remote_has_commits" == "true" && "$local_has_commits" == "true" ]]; then
    print_warning "Both local and remote have commits."
    echo ""
    echo "Options:"
    echo "  1) Pull remote changes first, then push (recommended if remote has important content)"
    echo "  2) Force push local (overwrites remote - use if remote is empty/template)"
    echo "  3) Skip - handle manually later"
    read -p "Choose [1/2/3]: " -n 1 -r sync_choice
    echo ""

    case "$sync_choice" in
      1)
        if run_cmd "Pulling remote changes" git pull origin main --rebase --allow-unrelated-histories; then
          print_success "Pulled remote changes"
          if ask_yes_no "Push local commits now? (--no-verify)" "y"; then
            if run_cmd "Pushing to origin/main (--no-verify)" git push -u origin main --no-verify; then
              print_success "Pushed to origin/main"
            fi
          fi
        fi
        ;;
      2)
        if ask_yes_no "Are you sure you want to force push? This will OVERWRITE remote!" "n"; then
          if run_cmd "Force pushing to origin/main (--no-verify)" git push -u origin main --force --no-verify; then
            print_success "Force pushed to origin/main"
          fi
        else
          print_info "Skipped push"
        fi
        ;;
      *)
        print_info "Skipped - handle sync manually"
        ;;
    esac
  elif [[ "$local_has_commits" == "true" ]]; then
    if ask_yes_no "Push local commits to remote? (--no-verify)" "y"; then
      if run_cmd "Pushing to origin/main (--no-verify)" git push -u origin main --no-verify; then
        print_success "Pushed to origin/main"
      fi
    fi
  elif [[ "$remote_has_commits" == "true" ]]; then
    if ask_yes_no "Pull remote commits to local?" "y"; then
      if run_cmd "Pulling from origin/main" git pull origin main; then
        print_success "Pulled from origin/main"
      fi
    fi
  else
    print_info "Both local and remote are empty - ready for first commit"
  fi
}

# ============================================
# Ensure main branch
# ============================================
ensure_main_branch() {
  local current_branch
  current_branch=$(git branch --show-current 2>/dev/null || echo "")

  if [[ -z "$current_branch" ]]; then
    # No commits yet, create main branch
    git checkout -b main 2>/dev/null || true
  elif [[ "$current_branch" != "main" ]]; then
    if ask_yes_no "Current branch is '$current_branch'. Switch to 'main' for GitHub default?" "y"; then
      git branch -m "$current_branch" main 2>/dev/null || git checkout -b main 2>/dev/null || true
      print_success "Switched to 'main' branch"
    fi
  fi
}

# ============================================
# Summary
# ============================================
print_summary() {
  print_header "Setup Complete!"

  echo ""
  echo -e "${GREEN}✓ Project initialization completed!${NC}"
  echo ""

  echo -e "${BLUE}What was configured:${NC}"

  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "  ✓ Git repository initialized"
    # Show branch info
    local current_branch
    current_branch=$(git branch --show-current 2>/dev/null || echo "")
    if [[ -n "$current_branch" ]]; then
      if git show-ref --verify --quiet refs/heads/develop 2>/dev/null; then
        echo "  ✓ Branch strategy: PR workflow (main + develop)"
        echo "    Current branch: $current_branch"
      else
        echo "  ✓ Branch strategy: Simple workflow"
        echo "    Current branch: $current_branch"
      fi
    fi
    # Show hooks status
    if [[ -n "$(git config --get core.hooksPath)" ]]; then
      echo "  ✓ Git hooks enabled (pre-commit, pre-push)"
    else
      echo "  ○ Git hooks not configured (run: make setup-hooks)"
    fi
  fi

  [[ -f ".env" ]] && echo "  ✓ Environment file created"
  [[ -d ".claude/agents" ]] && echo "  ✓ Claude agents synced"
  [[ -d ".cursor/rules" ]] && echo "  ✓ Cursor rules generated"
  [[ -d ".codex/skills" ]] && echo "  ✓ Codex skills synced"

  echo ""
  echo -e "${BLUE}Next steps:${NC}"
  echo "  1. Edit .env with your configuration values"
  echo "  2. Review CLAUDE.md and AGENTS.md for AI guidelines"
  echo "  3. Open in DevContainer: Cmd+Shift+P → 'Reopen in Container'"
  if git show-ref --verify --quiet refs/heads/develop 2>/dev/null; then
    echo "  4. Create feature branch: git checkout -b feature/your-feature"
  fi
  echo ""

  echo -e "${BLUE}Useful commands:${NC}"
  echo "  make help              # Show all available commands"
  echo "  make sync              # Sync agent configuration"
  echo "  make sync-codex-skills # Sync Codex skills"
  echo ""
}

# ============================================
# Main
# ============================================
main() {
  if [[ "$MODE" == "wizard" ]]; then
    print_header "Project Initialization Wizard"
    echo ""
    echo "This wizard will help you set up your new project."
    echo "Press Enter to accept defaults, or type your choice."
    if [[ "$VERBOSE" == "1" ]]; then
      echo ""
      echo -e "${CYAN}Verbose mode enabled${NC} - commands will show detailed output"
    fi
    echo ""
  else
    print_header "Project Initialization (CLI Mode)"
    echo ""
    echo "Running non-interactive setup with defaults..."
    if [[ "$VERBOSE" == "1" ]]; then
      echo -e "${CYAN}Verbose mode enabled${NC}"
    fi
    echo ""
  fi

  init_git
  setup_env
  setup_character   # Step 3: Choose toolbox or staged
  run_sync
  initial_commit
  setup_remote      # Step 6: Push main first (while on main)
  setup_branches    # Step 7: Then create develop branch
  setup_hooks       # Step 8: Enable hooks after setup is done
  print_summary
}

main

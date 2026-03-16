.PHONY: help init init-cli setup-hooks check-env sync sync-check sync-verify sync-claude sync-cursor sync-codex fetch-from-upstream fetch-from-upstream-check fetch-from-upstream-status fetch-from-upstream-dry-run push-to-upstream push-to-upstream-check push-to-upstream-status push-to-upstream-dry-run _check-starters init-staged init-toolbox show-character

# ============================================
# Help
# ============================================
help:
	@echo "Project Management Commands"
	@echo ""
	@echo "Project Character:"
	@echo "  make init-toolbox      # Initialize as toolbox (ad-hoc) project"
	@echo "  make init-staged       # Initialize as staged development project"
	@echo "  make show-character    # Show current project character"
	@echo ""
	@echo "Initialization:"
	@echo "  make init              # Interactive setup wizard (recommended for new projects)"
	@echo "  make init-cli          # Non-interactive setup (for automation/CI)"
	@echo "  make setup-hooks       # Set up git hooks only"
	@echo "  make check-env         # Verify environment configuration"
	@echo ""
	@echo "Sync (Local):"
	@echo "  make sync              # Sync .agent -> .claude, .cursor, .codex"
	@echo "  make sync-check        # Sync then show git status"
	@echo "  make sync-verify       # Sync then verify all targets"
	@echo "  make sync-claude       # Sync to Claude Code only"
	@echo "  make sync-cursor       # Sync to Cursor IDE only"
	@echo "  make sync-codex        # Sync to OpenAI Codex only"
	@echo ""
	@echo "Sync (Upstream Template):"
	@echo "  make fetch-from-upstream           # Sync from dotfiles template"
	@echo "  make fetch-from-upstream-check     # Check for template differences"
	@echo "  make fetch-from-upstream-status    # Show sync status"
	@echo "  make fetch-from-upstream-dry-run   # Preview template sync"
	@echo ""
	@echo "Push to Upstream Template:"
	@echo "  make push-to-upstream           # Push local changes to dotfiles template"
	@echo "  make push-to-upstream-check     # Show what would be pushed (dry-run)"
	@echo "  make push-to-upstream-status    # Compare local vs upstream"
	@echo "  make push-to-upstream-dry-run   # Preview push without changes"
	@echo ""
	@echo "Options:"
	@echo "  VERBOSE=1 make init    # Show detailed command output and errors"
	@echo "  ./scripts/init-project.sh --help  # Show all init options"

# ============================================
# Initialization
# ============================================

# Interactive wizard (default for new projects)
init:
	@./scripts/boilerplate/init-project.sh wizard

# Non-interactive mode (for automation/CI)
init-cli:
	@./scripts/boilerplate/init-project.sh cli

# Set up git hooks only
setup-hooks:
	@./scripts/boilerplate/setup-git-hooks.sh

# Verify environment is configured
check-env:
	@echo "Checking environment configuration..."
	@if [ -f .env ]; then \
		echo "✓ .env file exists"; \
		missing=0; \
		while IFS= read -r line; do \
			if echo "$$line" | grep -q "^[A-Z_]*=$$"; then \
				var=$$(echo "$$line" | cut -d= -f1); \
				echo "⚠ $$var is not set"; \
				missing=1; \
			fi; \
		done < .env; \
		if [ $$missing -eq 0 ]; then \
			echo "✓ All variables appear to be set"; \
		else \
			echo ""; \
			echo "Edit .env to set missing values"; \
		fi; \
	else \
		echo "✗ .env file not found"; \
		echo "  Run: cp .env.example .env"; \
	fi

# ============================================
# Project Character
# ============================================

# Check if starters exist (need fetch-from-upstream first)
_check-starters:
	@if [ ! -d .agent/starters ]; then \
		echo "Error: .agent/starters/ not found."; \
		echo "Run 'make fetch-from-upstream' first to get starter templates."; \
		exit 1; \
	fi

# Initialize as staged development project
init-staged: _check-starters
	@if [ -f PROJECT.yaml ]; then \
		echo "PROJECT.yaml already exists. Remove it first to reinitialize."; \
		exit 1; \
	fi
	@cp .agent/starters/PROJECT.staged.yaml PROJECT.yaml
	@if [ -f PLANS.md ]; then \
		printf "PLANS.md exists. Overwrite? [y/N]: "; \
		read answer; \
		case "$$answer" in \
			[yY]*) \
				echo "Backing up existing PLANS.md -> PLANS.md.bak"; \
				mv PLANS.md PLANS.md.bak; \
				cp .agent/starters/PLANS.md PLANS.md; \
				;; \
			*) \
				echo "Keeping existing PLANS.md"; \
				;; \
		esac; \
	else \
		cp .agent/starters/PLANS.md PLANS.md; \
	fi
	@mkdir -p docs/decisions
	@echo "[OK] Initialized as STAGED project"
	@echo "  - Edit PROJECT.yaml to set current_stage"
	@echo "  - Edit PLANS.md to define roadmap"

# Initialize as toolbox/ad-hoc project
init-toolbox: _check-starters
	@if [ -f PROJECT.yaml ]; then \
		echo "PROJECT.yaml already exists. Remove it first to reinitialize."; \
		exit 1; \
	fi
	@cp .agent/starters/PROJECT.toolbox.yaml PROJECT.yaml
	@if [ -f BACKLOG.md ]; then \
		printf "BACKLOG.md exists. Overwrite? [y/N]: "; \
		read answer; \
		case "$$answer" in \
			[yY]*) \
				echo "Backing up existing BACKLOG.md -> BACKLOG.md.bak"; \
				mv BACKLOG.md BACKLOG.md.bak; \
				cp .agent/starters/BACKLOG.md BACKLOG.md; \
				;; \
			*) \
				echo "Keeping existing BACKLOG.md"; \
				;; \
		esac; \
	else \
		cp .agent/starters/BACKLOG.md BACKLOG.md; \
	fi
	@mkdir -p docs/decisions
	@echo "[OK] Initialized as TOOLBOX project"
	@echo "  - Add tasks to BACKLOG.md"

# Show current project character
show-character:
	@if [ -f PROJECT.yaml ]; then \
		grep "^character:" PROJECT.yaml; \
	else \
		echo "character: staged (default - no PROJECT.yaml)"; \
	fi

# ============================================
# Sync
# ============================================

# Full sync: .agent -> .claude, .cursor, .codex
sync:
	@./scripts/boilerplate/sync-agents.sh
	@./scripts/boilerplate/sync-cursor-rules.sh
	@./scripts/boilerplate/sync-codex-skills.sh

# Sync then show git status
sync-check: sync
	@git status --porcelain

# Sync then verify all targets
sync-verify: sync
	@echo ""
	@echo "=== Sync Verification ==="
	@echo "Claude Code:"
	@echo "  Agents:   $$(ls .claude/agents/*.md 2>/dev/null | wc -l | tr -d ' ') files"
	@echo "  Skills:   $$(ls -d .claude/skills/*/ 2>/dev/null | wc -l | tr -d ' ') dirs"
	@echo "  Commands: $$(ls .claude/commands/*.md 2>/dev/null | wc -l | tr -d ' ') files"
	@echo "Cursor IDE:"
	@echo "  Rules:    $$(find .cursor/rules -name 'RULE.md' 2>/dev/null | wc -l | tr -d ' ') files"
	@echo "Codex:"
	@echo "  Skills:   $$(ls -d .codex/skills/*/ 2>/dev/null | wc -l | tr -d ' ') dirs"
	@echo "  Override: $$(test -f .codex/AGENTS.override.md && echo 'exists' || echo 'MISSING')"

# Individual tool syncs (for debugging)
sync-claude:
	@./scripts/boilerplate/sync-agents.sh

sync-cursor:
	@./scripts/boilerplate/sync-cursor-rules.sh

sync-codex:
	@./scripts/boilerplate/sync-codex-skills.sh

# ============================================
# Upstream Template Sync
# ============================================

# Sync from upstream dotfiles template
fetch-from-upstream:
	@./scripts/boilerplate/fetch-from-upstream.sh

# Check for template differences
fetch-from-upstream-check:
	@./scripts/boilerplate/fetch-from-upstream.sh --check

# Show sync status
fetch-from-upstream-status:
	@./scripts/boilerplate/fetch-from-upstream.sh --status

# Preview template sync (dry-run)
fetch-from-upstream-dry-run:
	@./scripts/boilerplate/fetch-from-upstream.sh --dry-run

# ============================================
# Push to Upstream Template
# ============================================

# Push local changes to dotfiles template
push-to-upstream:
	@./scripts/boilerplate/push-to-upstream.sh

# Show what would be pushed (dry-run)
push-to-upstream-check:
	@./scripts/boilerplate/push-to-upstream.sh --check

# Compare local vs upstream
push-to-upstream-status:
	@./scripts/boilerplate/push-to-upstream.sh --status

# Preview push without changes
push-to-upstream-dry-run:
	@./scripts/boilerplate/push-to-upstream.sh --dry-run

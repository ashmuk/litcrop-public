#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Push to Upstream - Push local changes back to dotfiles template
# ============================================================================
# Usage: push-to-upstream.sh [OPTIONS] [FILES...]
#
# Options:
#   --check           Show what would be pushed without pushing
#   --dry-run         Same as --check (alias)
#   --status          Show local vs upstream comparison
#   --force           Skip prompts for Tier 2 files (still ask for Tier 1)
#   --force-global    Allow force mode for Tier 1 global (dangerous!)
#   --help            Show this help message
#
# Files (optional):
#   AGENTS_global     Push only AGENTS_global.md
#   CLAUDE_global     Push only CLAUDE_global.md
#   AGENTS            Push only AGENTS.md -> AGENTS_project.md
#   CLAUDE            Push only CLAUDE.md -> CLAUDE_project.md
#   RULES             Push only RULES.md
#   Makefile          Push only Makefile
#   gitignore         Push only .gitignore -> dot.gitignore
#   agent             Push only .agent/ -> dot.agent/
#   boilerplate       Push only scripts/boilerplate/
#   all               Push all files (default)
# ============================================================================

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMPLATE_ROOT="${TEMPLATE_ROOT:-${HOME}/dotfiles/templates}"
TEMPLATE_GLOBAL="${TEMPLATE_ROOT}/global"
TEMPLATE_PROJECT="${TEMPLATE_ROOT}/project"
BACKUP_DIR="${TEMPLATE_ROOT}/.push-backups/$(date +%Y%m%d-%H%M%S)"
PUSH_LOG="${PROJECT_ROOT}/.template-push.log"
SYNC_METADATA="${PROJECT_ROOT}/.template-sync-metadata"

# Operation modes
MODE="push"  # push, check, dry-run, status
FORCE_MODE=false
FORCE_GLOBAL=false
SELECTED_FILES=()

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# ============================================================================
# Helper Functions
# ============================================================================

log() {
  local level="$1"
  shift
  local message="$*"
  local timestamp
  timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
  echo "[${timestamp}] [${level}] ${message}" >> "${PUSH_LOG}"

  case "${level}" in
    INFO)  echo -e "${BLUE}ℹ${NC} ${message}" ;;
    OK)    echo -e "${GREEN}✓${NC} ${message}" ;;
    WARN)  echo -e "${YELLOW}⚠${NC} ${message}" ;;
    ERROR) echo -e "${RED}✗${NC} ${message}" ;;
    PUSH)  echo -e "${MAGENTA}↑${NC} ${message}" ;;
    *)     echo "${message}" ;;
  esac
}

show_help() {
  sed -n '3,26p' "$0" | sed 's/^# \?//'
  exit 0
}

check_upstream_exists() {
  if [[ ! -d "${TEMPLATE_GLOBAL}" ]]; then
    log ERROR "Template global directory not found: ${TEMPLATE_GLOBAL}"
    log INFO "Set TEMPLATE_ROOT environment variable if your dotfiles are elsewhere"
    return 1
  fi

  if [[ ! -d "${TEMPLATE_PROJECT}" ]]; then
    log ERROR "Template project directory not found: ${TEMPLATE_PROJECT}"
    log INFO "Set TEMPLATE_ROOT environment variable if your dotfiles are elsewhere"
    return 1
  fi

  log INFO "Using template: ${TEMPLATE_ROOT}"
  return 0
}

files_differ() {
  local local_file="$1"
  local upstream_file="$2"

  if [[ ! -f "${local_file}" ]]; then
    return 1  # Local doesn't exist, nothing to push
  fi

  if [[ ! -f "${upstream_file}" ]]; then
    return 0  # Upstream doesn't exist, local is new
  fi

  if ! diff -q "${local_file}" "${upstream_file}" &>/dev/null; then
    return 0  # Files differ
  fi

  return 1  # Files are identical
}

show_diff() {
  local local_file="$1"
  local upstream_file="$2"
  local label="$3"

  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}Diff for: ${label}${NC}"
  echo -e "${BLUE}Local → Upstream${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  if [[ ! -f "${upstream_file}" ]]; then
    echo -e "${GREEN}New file (doesn't exist in upstream)${NC}"
    echo ""
    echo -e "${GREEN}Preview of content to push:${NC}"
    head -20 "${local_file}"
    if [[ $(wc -l < "${local_file}") -gt 20 ]]; then
      echo "... ($(wc -l < "${local_file}") lines total)"
    fi
  else
    # Show diff: local (new) vs upstream (old)
    diff -u "${upstream_file}" "${local_file}" || true
  fi

  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
}

create_upstream_backup() {
  local upstream_file="$1"

  if [[ ! -f "${upstream_file}" ]] && [[ ! -d "${upstream_file}" ]]; then
    return 0  # Nothing to backup
  fi

  # Create backup directory structure
  local relative_path="${upstream_file#${TEMPLATE_ROOT}/}"
  local backup_path="${BACKUP_DIR}/${relative_path}"

  mkdir -p "$(dirname "${backup_path}")"

  if [[ -d "${upstream_file}" ]]; then
    cp -R "${upstream_file}" "${backup_path}"
    log INFO "Backed up: ${relative_path}/ → .push-backups/$(basename "${BACKUP_DIR}")/"
  else
    cp -f "${upstream_file}" "${backup_path}"
    log INFO "Backed up: ${relative_path} → .push-backups/$(basename "${BACKUP_DIR}")/"
  fi
}

prompt_user() {
  local message="$1"
  local options="$2"  # e.g., "y/n/d/s"

  while true; do
    echo -ne "${YELLOW}?${NC} ${message} [${options}]: "
    read -r response

    case "${response}" in
      y|Y) return 0 ;;
      n|N) return 1 ;;
      d|D) return 2 ;;  # Show diff
      s|S) return 3 ;;  # Skip
      *) echo "Invalid option. Please choose from: ${options}" ;;
    esac
  done
}

get_file_hash() {
  local file="$1"
  if [[ -f "${file}" ]]; then
    shasum -a 256 "${file}" | cut -d' ' -f1
  else
    echo "none"
  fi
}

check_upstream_diverged() {
  local local_file="$1"
  local upstream_file="$2"

  # Get hash from last sync metadata
  if [[ ! -f "${SYNC_METADATA}" ]]; then
    return 1  # No metadata, can't detect divergence
  fi

  if ! command -v jq &>/dev/null; then
    return 1  # No jq, can't parse metadata
  fi

  local last_upstream_hash
  last_upstream_hash=$(jq -r ".files[\"${local_file}\"].upstream_hash // \"none\"" "${SYNC_METADATA}" 2>/dev/null)

  if [[ "${last_upstream_hash}" == "none" ]]; then
    return 1  # No previous sync, can't detect divergence
  fi

  # Get current upstream hash
  local current_upstream_hash
  current_upstream_hash="$(get_file_hash "${upstream_file}")"

  if [[ "${last_upstream_hash}" != "${current_upstream_hash}" ]]; then
    return 0  # Upstream has diverged since last sync
  fi

  return 1  # No divergence
}

update_push_metadata() {
  local local_file="$1"
  local upstream_file="$2"
  local status="${3:-pushed}"

  local timestamp
  timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local upstream_hash
  upstream_hash="$(get_file_hash "${upstream_file}")"
  local local_hash
  local_hash="$(get_file_hash "${PROJECT_ROOT}/${local_file}")"

  # Create or update metadata file
  if [[ ! -f "${SYNC_METADATA}" ]]; then
    echo "{" > "${SYNC_METADATA}"
    echo "  \"last_sync\": \"${timestamp}\"," >> "${SYNC_METADATA}"
    echo "  \"last_push\": \"${timestamp}\"," >> "${SYNC_METADATA}"
    echo "  \"template_root\": \"${TEMPLATE_ROOT}\"," >> "${SYNC_METADATA}"
    echo "  \"files\": {}" >> "${SYNC_METADATA}"
    echo "}" >> "${SYNC_METADATA}"
  fi

  if command -v jq &>/dev/null; then
    local temp_file
    temp_file="$(mktemp)"
    jq --arg ts "${timestamp}" \
       --arg file "${local_file}" \
       --arg status "${status}" \
       --arg upstream_hash "${upstream_hash}" \
       --arg local_hash "${local_hash}" \
       '.last_push = $ts | .files[$file] = (.files[$file] // {}) + {last_push: $ts, status: $status, upstream_hash: $upstream_hash, local_hash: $local_hash}' \
       "${SYNC_METADATA}" > "${temp_file}"
    mv "${temp_file}" "${SYNC_METADATA}"
  fi
}

# ============================================================================
# Push Functions
# ============================================================================

push_tier1_global_file() {
  local local_file="$1"
  local upstream_file="$2"
  local label="$3"

  local local_path="${PROJECT_ROOT}/${local_file}"

  # Check if local file exists
  if [[ ! -f "${local_path}" ]]; then
    log INFO "${label}: local file doesn't exist (skip)"
    return 0
  fi

  # Check if files differ
  if ! files_differ "${local_path}" "${upstream_file}"; then
    log OK "${label}: unchanged"
    return 0
  fi

  # Files differ - handle based on mode
  case "${MODE}" in
    check|dry-run)
      log WARN "${label}: differs from upstream (GLOBAL)"
      return 0
      ;;
    status)
      return 0
      ;;
    push)
      echo ""
      echo -e "${RED}╔══════════════════════════════════════════════════════════╗${NC}"
      echo -e "${RED}║  WARNING: TIER 1 GLOBAL FILE                             ║${NC}"
      echo -e "${RED}║  Changes will affect ALL projects using this template!   ║${NC}"
      echo -e "${RED}╚══════════════════════════════════════════════════════════╝${NC}"
      echo ""

      log WARN "${label}: differs from upstream"
      show_diff "${local_path}" "${upstream_file}" "${label}"

      # Never auto-push global files, even with --force
      if [[ "${FORCE_GLOBAL}" != "true" ]]; then
        if ! prompt_user "Push ${label} to upstream? (AFFECTS ALL PROJECTS)" "y/n"; then
          log INFO "${label}: skipped by user"
          return 0
        fi
      else
        log WARN "${label}: Force-global mode - pushing without prompt"
      fi

      # Create backup and push
      create_upstream_backup "${upstream_file}"
      mkdir -p "$(dirname "${upstream_file}")"
      cp -f "${local_path}" "${upstream_file}"
      log PUSH "${label}: pushed to upstream"
      update_push_metadata "${local_file}" "${upstream_file}"
      ;;
  esac
}

push_tier1_file() {
  local local_file="$1"
  local upstream_file="$2"
  local label="$3"

  local local_path="${PROJECT_ROOT}/${local_file}"

  # Check if local file exists
  if [[ ! -f "${local_path}" ]]; then
    log INFO "${label}: local file doesn't exist (skip)"
    return 0
  fi

  # Check if files differ
  if ! files_differ "${local_path}" "${upstream_file}"; then
    log OK "${label}: unchanged"
    return 0
  fi

  # Files differ - handle based on mode
  case "${MODE}" in
    check|dry-run)
      log WARN "${label}: differs from upstream"
      return 0
      ;;
    status)
      return 0
      ;;
    push)
      echo ""
      log INFO "${label}: differs from upstream"
      show_diff "${local_path}" "${upstream_file}" "${label}"

      if [[ "${FORCE_MODE}" == "false" ]]; then
        prompt_user "Push ${label} to upstream?" "y/n/d" || local result=$?
        result=${result:-0}
        case $result in
          0) ;; # yes - proceed
          2) # show diff, then re-prompt
            show_diff "${local_path}" "${upstream_file}" "${label}"
            prompt_user "Push ${label} to upstream?" "y/n" || local result2=$?
            result2=${result2:-0}
            if [[ ${result2} -ne 0 ]]; then
              log INFO "${label}: skipped by user"
              return 0
            fi
            ;;
          *) # no/skip
            log INFO "${label}: skipped by user"
            return 0
            ;;
        esac
      fi

      # Create backup and push
      create_upstream_backup "${upstream_file}"
      mkdir -p "$(dirname "${upstream_file}")"
      cp -f "${local_path}" "${upstream_file}"
      log PUSH "${label}: pushed to upstream"
      update_push_metadata "${local_file}" "${upstream_file}"
      ;;
  esac
}

push_tier2_file() {
  local local_file="$1"
  local upstream_file="$2"
  local label="$3"

  local local_path="${PROJECT_ROOT}/${local_file}"

  # Check if local file exists
  if [[ ! -f "${local_path}" ]]; then
    log INFO "${label}: local file doesn't exist (skip)"
    return 0
  fi

  # Check if files differ
  if ! files_differ "${local_path}" "${upstream_file}"; then
    log OK "${label}: unchanged"
    return 0
  fi

  # Check for upstream divergence
  local diverged=false
  if check_upstream_diverged "${local_file}" "${upstream_file}"; then
    diverged=true
  fi

  # Files differ - handle based on mode
  case "${MODE}" in
    check|dry-run)
      if [[ "${diverged}" == "true" ]]; then
        log WARN "${label}: differs (upstream has changed since last sync!)"
      else
        log WARN "${label}: differs from upstream"
      fi
      return 0
      ;;
    status)
      return 0
      ;;
    push)
      echo ""
      if [[ "${diverged}" == "true" ]]; then
        echo -e "${YELLOW}╔══════════════════════════════════════════════════════════╗${NC}"
        echo -e "${YELLOW}║  WARNING: Upstream has changed since last sync!          ║${NC}"
        echo -e "${YELLOW}║  Pushing will overwrite those changes.                   ║${NC}"
        echo -e "${YELLOW}╚══════════════════════════════════════════════════════════╝${NC}"
        echo ""
      fi

      log INFO "${label}: differs from upstream"
      show_diff "${local_path}" "${upstream_file}" "${label}"

      if [[ "${FORCE_MODE}" == "false" ]]; then
        local prompt_msg="Push ${label} to upstream?"
        if [[ "${diverged}" == "true" ]]; then
          prompt_msg="Push ${label} to upstream? (will overwrite upstream changes)"
        fi

        prompt_user "${prompt_msg}" "y/n/d" || local result=$?
        result=${result:-0}
        case $result in
          0) ;; # yes - proceed
          2) # show diff, then re-prompt
            show_diff "${local_path}" "${upstream_file}" "${label}"
            prompt_user "${prompt_msg}" "y/n" || local result2=$?
            result2=${result2:-0}
            if [[ ${result2} -ne 0 ]]; then
              log INFO "${label}: skipped by user"
              return 0
            fi
            ;;
          *) # no/skip
            log INFO "${label}: skipped by user"
            return 0
            ;;
        esac
      fi

      # Create backup and push
      create_upstream_backup "${upstream_file}"
      mkdir -p "$(dirname "${upstream_file}")"
      cp -f "${local_path}" "${upstream_file}"
      log PUSH "${label}: pushed to upstream"
      update_push_metadata "${local_file}" "${upstream_file}"
      ;;
  esac
}

preview_directory_push() {
  local local_dir="$1"
  local upstream_dir="$2"
  local label="$3"

  echo ""
  echo -e "${BLUE}Preview of changes for ${label}:${NC}"
  echo ""

  # Files only in local (will be added to upstream)
  local to_add
  to_add=$(diff -qr \
    -x ".DS_Store" -x ".AppleDouble" -x ".LSOverride" \
    -x "Thumbs.db" -x "Desktop.ini" -x ".git" \
    "${local_dir}" "${upstream_dir}" 2>/dev/null | \
    grep "Only in ${local_dir}" | \
    sed "s|Only in ${local_dir}[:/] *||" || true)

  if [[ -n "$to_add" ]]; then
    echo -e "${GREEN}Files to be added to upstream:${NC}"
    echo "$to_add" | while read -r file; do
      echo "  + $file"
    done
    echo ""
  fi

  # Files only in upstream (will be removed from upstream)
  local to_remove
  to_remove=$(diff -qr \
    -x ".DS_Store" -x ".AppleDouble" -x ".LSOverride" \
    -x "Thumbs.db" -x "Desktop.ini" -x ".git" \
    "${local_dir}" "${upstream_dir}" 2>/dev/null | \
    grep "Only in ${upstream_dir}" | \
    sed "s|Only in ${upstream_dir}[:/] *||" || true)

  if [[ -n "$to_remove" ]]; then
    echo -e "${RED}Files to be removed from upstream:${NC}"
    echo "$to_remove" | while read -r file; do
      echo "  - $file"
    done
    echo ""
  fi

  # Files that differ (will be modified in upstream)
  local to_modify
  to_modify=$(diff -qr \
    -x ".DS_Store" -x ".AppleDouble" -x ".LSOverride" \
    -x "Thumbs.db" -x "Desktop.ini" -x ".git" \
    "${local_dir}" "${upstream_dir}" 2>/dev/null | \
    grep "^Files " | \
    sed "s|Files ${local_dir}/\(.*\) and ${upstream_dir}/\(.*\) differ|\1|" || true)

  if [[ -n "$to_modify" ]]; then
    echo -e "${YELLOW}Files to be modified in upstream:${NC}"
    echo "$to_modify" | while read -r file; do
      echo "  ~ $file"
    done
    echo ""
  fi
}

push_agent_directory() {
  local local_dir="${PROJECT_ROOT}/.agent"
  local upstream_dir="${TEMPLATE_PROJECT}/dot.agent"
  local label=".agent/ -> dot.agent/"

  # Check if local directory exists
  if [[ ! -d "${local_dir}" ]]; then
    log INFO "${label}: local directory doesn't exist (skip)"
    return 0
  fi

  # Create upstream if it doesn't exist
  if [[ ! -d "${upstream_dir}" ]]; then
    case "${MODE}" in
      check|dry-run)
        log WARN "${label}: will create new directory in upstream"
        return 0
        ;;
      status)
        return 0
        ;;
      push)
        if [[ "${FORCE_MODE}" == "false" ]]; then
          if ! prompt_user "Create ${label} in upstream?" "y/n"; then
            log INFO "${label}: skipped by user"
            return 0
          fi
        fi
        mkdir -p "${upstream_dir}"
        cp -R "${local_dir}/"* "${upstream_dir}/"
        log PUSH "${label}: created in upstream"
        return 0
        ;;
    esac
  fi

  # Compare directories
  local dirs_differ=false
  if ! diff -qr \
    -x ".DS_Store" -x ".AppleDouble" -x ".LSOverride" \
    -x "Thumbs.db" -x "Desktop.ini" -x ".git" \
    "${local_dir}" "${upstream_dir}" &>/dev/null; then
    dirs_differ=true
  fi

  if [[ "${dirs_differ}" == "false" ]]; then
    log OK "${label}: unchanged"
    return 0
  fi

  # Directories differ
  case "${MODE}" in
    check|dry-run)
      log WARN "${label}: differs from upstream"
      preview_directory_push "${local_dir}" "${upstream_dir}" "${label}"
      return 0
      ;;
    status)
      return 0
      ;;
    push)
      echo ""
      log INFO "${label}: differs from upstream"
      preview_directory_push "${local_dir}" "${upstream_dir}" "${label}"

      echo -e "${YELLOW}Warning:${NC} upstream dot.agent/ will be completely replaced"
      echo "Current upstream will be backed up to .push-backups/"
      echo ""

      if [[ "${FORCE_MODE}" == "false" ]]; then
        if ! prompt_user "Replace upstream dot.agent/ directory?" "y/n"; then
          log INFO "${label}: skipped by user"
          return 0
        fi
      fi

      # Backup and replace
      create_upstream_backup "${upstream_dir}"
      rm -rf "${upstream_dir}"
      cp -R "${local_dir}" "${upstream_dir}"
      log PUSH "${label}: pushed to upstream"
      ;;
  esac
}

push_boilerplate_directory() {
  local local_dir="${PROJECT_ROOT}/scripts/boilerplate"
  local upstream_dir="${TEMPLATE_PROJECT}/scripts/boilerplate"
  local label="scripts/boilerplate/"

  # Check if local directory exists
  if [[ ! -d "${local_dir}" ]]; then
    log INFO "${label}: local directory doesn't exist (skip)"
    return 0
  fi

  # Create upstream if it doesn't exist
  if [[ ! -d "${upstream_dir}" ]]; then
    case "${MODE}" in
      check|dry-run)
        log WARN "${label}: will create new directory in upstream"
        return 0
        ;;
      status)
        return 0
        ;;
      push)
        if [[ "${FORCE_MODE}" == "false" ]]; then
          if ! prompt_user "Create ${label} in upstream?" "y/n"; then
            log INFO "${label}: skipped by user"
            return 0
          fi
        fi
        mkdir -p "${upstream_dir}"
        cp -R "${local_dir}/"* "${upstream_dir}/"
        chmod +x "${upstream_dir}"/*.sh "${upstream_dir}"/*.py 2>/dev/null || true
        log PUSH "${label}: created in upstream"
        return 0
        ;;
    esac
  fi

  # Compare directories
  local dirs_differ=false
  if ! diff -qr \
    -x ".DS_Store" -x ".AppleDouble" -x ".LSOverride" \
    -x "Thumbs.db" -x "Desktop.ini" -x ".git" \
    "${local_dir}" "${upstream_dir}" &>/dev/null; then
    dirs_differ=true
  fi

  if [[ "${dirs_differ}" == "false" ]]; then
    log OK "${label}: unchanged"
    return 0
  fi

  # Directories differ
  case "${MODE}" in
    check|dry-run)
      log WARN "${label}: differs from upstream"
      preview_directory_push "${local_dir}" "${upstream_dir}" "${label}"
      return 0
      ;;
    status)
      return 0
      ;;
    push)
      echo ""
      log INFO "${label}: differs from upstream"
      preview_directory_push "${local_dir}" "${upstream_dir}" "${label}"

      echo -e "${YELLOW}Warning:${NC} upstream scripts/boilerplate/ will be completely replaced"
      echo "Current upstream will be backed up to .push-backups/"
      echo ""

      if [[ "${FORCE_MODE}" == "false" ]]; then
        if ! prompt_user "Replace upstream scripts/boilerplate/ directory?" "y/n"; then
          log INFO "${label}: skipped by user"
          return 0
        fi
      fi

      # Backup and replace
      create_upstream_backup "${upstream_dir}"
      rm -rf "${upstream_dir}"
      cp -R "${local_dir}" "${upstream_dir}"

      # Ensure scripts are executable
      chmod +x "${upstream_dir}"/*.sh "${upstream_dir}"/*.py 2>/dev/null || true

      log PUSH "${label}: pushed to upstream"
      ;;
  esac
}

# ============================================================================
# Main Push Logic
# ============================================================================

push_all_files() {
  log INFO "Starting push to upstream (mode: ${MODE})"
  log INFO "Project: ${PROJECT_ROOT}"
  log INFO "Template: ${TEMPLATE_ROOT}"
  echo ""

  # Determine which files to push
  local push_agents_global=false
  local push_claude_global=false
  local push_agents=false
  local push_claude=false
  local push_rules=false
  local push_makefile=false
  local push_gitignore=false
  local push_agent_dir=false
  local push_boilerplate_dir=false

  if [[ ${#SELECTED_FILES[@]} -eq 0 ]] || [[ " ${SELECTED_FILES[*]} " =~ " all " ]]; then
    push_agents_global=true
    push_claude_global=true
    push_agents=true
    push_claude=true
    push_rules=true
    push_makefile=true
    push_gitignore=true
    push_agent_dir=true
    push_boilerplate_dir=true
  else
    for file in "${SELECTED_FILES[@]}"; do
      case "${file}" in
        AGENTS_global) push_agents_global=true ;;
        CLAUDE_global) push_claude_global=true ;;
        AGENTS) push_agents=true ;;
        CLAUDE) push_claude=true ;;
        RULES) push_rules=true ;;
        Makefile) push_makefile=true ;;
        gitignore) push_gitignore=true ;;
        agent) push_agent_dir=true ;;
        boilerplate) push_boilerplate_dir=true ;;
        *) log WARN "Unknown file: ${file}" ;;
      esac
    done
  fi

  # Tier 1 Global: Files that affect ALL projects (require explicit confirmation)
  echo -e "${RED}Tier 1 Global: Affects ALL projects using this template${NC}"
  if [[ "${push_agents_global}" == "true" ]]; then
    push_tier1_global_file "AGENTS_global.md" "${TEMPLATE_GLOBAL}/AGENTS_global.md" "AGENTS_global.md"
  fi

  if [[ "${push_claude_global}" == "true" ]]; then
    push_tier1_global_file "CLAUDE_global.md" "${TEMPLATE_GLOBAL}/CLAUDE_global.md" "CLAUDE_global.md"
  fi

  echo ""

  # Tier 1: Directories (prompt by default)
  echo -e "${YELLOW}Tier 1: Template Directories${NC}"
  if [[ "${push_agent_dir}" == "true" ]]; then
    push_agent_directory
  fi

  if [[ "${push_boilerplate_dir}" == "true" ]]; then
    push_boilerplate_directory
  fi

  echo ""

  # Tier 2: Customizable project files (can be forced)
  echo -e "${BLUE}Tier 2: Project Template Files${NC}"
  if [[ "${push_agents}" == "true" ]]; then
    push_tier2_file "AGENTS.md" "${TEMPLATE_PROJECT}/AGENTS_project.md" "AGENTS.md -> AGENTS_project.md"
  fi

  if [[ "${push_claude}" == "true" ]]; then
    push_tier2_file "CLAUDE.md" "${TEMPLATE_PROJECT}/CLAUDE_project.md" "CLAUDE.md -> CLAUDE_project.md"
  fi

  if [[ "${push_rules}" == "true" ]]; then
    push_tier2_file "RULES.md" "${TEMPLATE_PROJECT}/RULES.md" "RULES.md"
  fi

  if [[ "${push_makefile}" == "true" ]]; then
    push_tier2_file "Makefile" "${TEMPLATE_PROJECT}/Makefile" "Makefile"
  fi

  if [[ "${push_gitignore}" == "true" ]]; then
    push_tier2_file ".gitignore" "${TEMPLATE_PROJECT}/dot.gitignore" ".gitignore -> dot.gitignore"
  fi

  echo ""
  log OK "Push complete"
}

show_status() {
  echo -e "${BLUE}Push to Upstream Status${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "Template: ${GREEN}${TEMPLATE_ROOT}${NC}"
  echo ""

  echo -e "${RED}Tier 1 Global:${NC}"
  check_file_status "AGENTS_global.md" "${TEMPLATE_GLOBAL}/AGENTS_global.md"
  check_file_status "CLAUDE_global.md" "${TEMPLATE_GLOBAL}/CLAUDE_global.md"
  echo ""

  echo -e "${YELLOW}Tier 1 Directories:${NC}"
  check_dir_status ".agent" "${TEMPLATE_PROJECT}/dot.agent"
  check_dir_status "scripts/boilerplate" "${TEMPLATE_PROJECT}/scripts/boilerplate"
  echo ""

  echo -e "${BLUE}Tier 2 Project:${NC}"
  check_file_status "AGENTS.md" "${TEMPLATE_PROJECT}/AGENTS_project.md"
  check_file_status "CLAUDE.md" "${TEMPLATE_PROJECT}/CLAUDE_project.md"
  check_file_status "RULES.md" "${TEMPLATE_PROJECT}/RULES.md"
  check_file_status "Makefile" "${TEMPLATE_PROJECT}/Makefile"
  check_file_status ".gitignore" "${TEMPLATE_PROJECT}/dot.gitignore"

  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

check_file_status() {
  local local_file="$1"
  local upstream_file="$2"
  local local_path="${PROJECT_ROOT}/${local_file}"

  if [[ ! -f "${local_path}" ]]; then
    echo -e "  ${BLUE}○${NC} ${local_file} (local doesn't exist)"
    return
  fi

  if [[ ! -f "${upstream_file}" ]]; then
    echo -e "  ${GREEN}+${NC} ${local_file} (new - not in upstream)"
    return
  fi

  if files_differ "${local_path}" "${upstream_file}"; then
    echo -e "  ${YELLOW}~${NC} ${local_file} (differs)"
  else
    echo -e "  ${GREEN}✓${NC} ${local_file} (in sync)"
  fi
}

check_dir_status() {
  local local_dir="$1"
  local upstream_dir="$2"
  local local_path="${PROJECT_ROOT}/${local_dir}"

  if [[ ! -d "${local_path}" ]]; then
    echo -e "  ${BLUE}○${NC} ${local_dir}/ (local doesn't exist)"
    return
  fi

  if [[ ! -d "${upstream_dir}" ]]; then
    echo -e "  ${GREEN}+${NC} ${local_dir}/ (new - not in upstream)"
    return
  fi

  if ! diff -qr \
    -x ".DS_Store" -x ".AppleDouble" -x ".LSOverride" \
    -x "Thumbs.db" -x "Desktop.ini" -x ".git" \
    "${local_path}" "${upstream_dir}" &>/dev/null; then
    echo -e "  ${YELLOW}~${NC} ${local_dir}/ (differs)"
  else
    echo -e "  ${GREEN}✓${NC} ${local_dir}/ (in sync)"
  fi
}

# ============================================================================
# Argument Parsing
# ============================================================================

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --help|-h)
        show_help
        ;;
      --check)
        MODE="check"
        shift
        ;;
      --dry-run)
        MODE="dry-run"
        shift
        ;;
      --status)
        MODE="status"
        shift
        ;;
      --force)
        FORCE_MODE=true
        shift
        ;;
      --force-global)
        FORCE_GLOBAL=true
        FORCE_MODE=true
        shift
        ;;
      AGENTS_global|CLAUDE_global|AGENTS|CLAUDE|RULES|Makefile|gitignore|agent|boilerplate|all)
        SELECTED_FILES+=("$1")
        shift
        ;;
      *)
        log ERROR "Unknown option: $1"
        echo "Run with --help for usage information"
        exit 1
        ;;
    esac
  done
}

# ============================================================================
# Main
# ============================================================================

main() {
  parse_args "$@"

  # Check upstream exists
  if ! check_upstream_exists; then
    exit 1
  fi

  # Handle different modes
  case "${MODE}" in
    status)
      show_status
      ;;
    check|dry-run|push)
      push_all_files
      ;;
    *)
      log ERROR "Unknown mode: ${MODE}"
      exit 1
      ;;
  esac
}

main "$@"

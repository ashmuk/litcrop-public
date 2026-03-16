#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Template Sync Script - Fetch updates from upstream dotfiles template
# ============================================================================
# Usage: fetch-from-upstream.sh [OPTIONS] [FILES...]
#
# Options:
#   --check           Check for differences without syncing
#   --dry-run         Show what would be synced without making changes
#   --status          Show last sync info and current state
#   --force           Skip prompts for Tier 1 files (still ask for Tier 2)
#   --help            Show this help message
#
# Configuration:
#   .template-sync-ignore   List of paths (relative to project root) to exclude
#                           from upstream sync. One path per line, # comments.
#
# Files (optional):
#   AGENTS_global     Sync only AGENTS_global.md
#   CLAUDE_global     Sync only CLAUDE_global.md
#   AGENTS            Sync only AGENTS.md
#   CLAUDE            Sync only CLAUDE.md
#   RULES             Sync only RULES.md
#   Makefile          Sync only Makefile
#   gitignore         Sync only .gitignore
#   agent             Sync only .agent/ directory
#   devcontainer      Sync only .devcontainer/ directory
#   boilerplate       Sync only scripts/boilerplate/ directory
#   claude-config     Sync only Claude config files (statusline.sh)
#   all               Sync all files (default)
# ============================================================================

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMPLATE_ROOT="${TEMPLATE_ROOT:-${HOME}/dotfiles/templates}"
TEMPLATE_GLOBAL="${TEMPLATE_ROOT}/global"
TEMPLATE_PROJECT="${TEMPLATE_ROOT}/project"
BACKUP_DIR="${PROJECT_ROOT}/.template-backups/$(date +%Y%m%d-%H%M%S)"
SYNC_LOG="${PROJECT_ROOT}/.template-sync.log"
SYNC_METADATA="${PROJECT_ROOT}/.template-sync-metadata"

# Operation modes
MODE="sync"  # sync, check, dry-run, status
FORCE_MODE=false
SELECTED_FILES=()

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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
  echo "[${timestamp}] [${level}] ${message}" >> "${SYNC_LOG}"

  case "${level}" in
    INFO)  echo -e "${BLUE}ℹ${NC} ${message}" ;;
    OK)    echo -e "${GREEN}✓${NC} ${message}" ;;
    WARN)  echo -e "${YELLOW}⚠${NC} ${message}" ;;
    ERROR) echo -e "${RED}✗${NC} ${message}" ;;
    *)     echo "${message}" ;;
  esac
}

show_help() {
  sed -n '4,27p' "$0" | sed 's/^# \?//'
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

# ============================================================================
# Template Sync Ignore
# ============================================================================

# Global array populated by load_sync_ignore
SYNC_IGNORE_PATHS=()

load_sync_ignore() {
  local ignore_file="${PROJECT_ROOT}/.template-sync-ignore"
  SYNC_IGNORE_PATHS=()
  [[ ! -f "${ignore_file}" ]] && return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// }" ]] && continue
    line="$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    SYNC_IGNORE_PATHS+=("$line")
  done < "${ignore_file}"
  if [[ ${#SYNC_IGNORE_PATHS[@]} -gt 0 ]]; then
    log INFO "Loaded ${#SYNC_IGNORE_PATHS[@]} exclusion(s) from .template-sync-ignore"
  fi
}

is_sync_ignored() {
  local path="$1"
  [[ ${#SYNC_IGNORE_PATHS[@]} -eq 0 ]] && return 1
  for ignored in "${SYNC_IGNORE_PATHS[@]}"; do
    [[ "$path" == "$ignored" ]] && return 0
  done
  return 1
}

# Build exclude list for a given directory prefix
# Usage: get_dir_excludes ".devcontainer"  →  populates DIR_EXCLUDE_FLAGS array
DIR_EXCLUDE_FLAGS=()
get_dir_excludes() {
  local dir_prefix="$1"
  DIR_EXCLUDE_FLAGS=()
  [[ ${#SYNC_IGNORE_PATHS[@]} -eq 0 ]] && return 0
  for ignored in "${SYNC_IGNORE_PATHS[@]}"; do
    if [[ "$ignored" == ${dir_prefix}/* ]]; then
      DIR_EXCLUDE_FLAGS+=("${ignored#${dir_prefix}/}")
    fi
  done
}

# Replace directory contents, preserving ignored files when rsync is available
sync_directory_with_excludes() {
  local upstream_dir="$1"
  local local_dir="$2"
  shift 2
  local -a rsync_excludes=("$@")

  if [[ ${#rsync_excludes[@]} -gt 0 ]]; then
    if command -v rsync &>/dev/null; then
      rsync -a --delete "${rsync_excludes[@]}" "${upstream_dir}/" "${local_dir}/"
    else
      log WARN "rsync not found; ignored files in ${local_dir}/ will NOT be preserved"
      rm -rf "${local_dir}"
      cp -R "${upstream_dir}" "${local_dir}"
    fi
  else
    rm -rf "${local_dir}"
    cp -R "${upstream_dir}" "${local_dir}"
  fi
}

has_local_modifications() {
  local file="$1"

  # Check if file exists and is tracked by git
  if [[ ! -f "${PROJECT_ROOT}/${file}" ]]; then
    return 1  # No file means no modifications
  fi

  if ! git -C "${PROJECT_ROOT}" ls-files --error-unmatch "${file}" &>/dev/null; then
    return 1  # Untracked file means no modifications (will be created)
  fi

  # Check for modifications (staged or unstaged)
  if ! git -C "${PROJECT_ROOT}" diff --quiet HEAD -- "${file}" 2>/dev/null; then
    return 0  # Has modifications
  fi

  return 1  # No modifications
}

files_differ() {
  local upstream="$1"
  local local="$2"

  if [[ ! -f "${upstream}" ]]; then
    return 1  # Upstream doesn't exist
  fi

  if [[ ! -f "${local}" ]]; then
    return 0  # Local doesn't exist, so they differ
  fi

  if ! diff -q "${upstream}" "${local}" &>/dev/null; then
    return 0  # Files differ
  fi

  return 1  # Files are identical
}

show_diff() {
  local upstream="$1"
  local local="$2"
  local label="$3"

  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}Diff for: ${label}${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  if [[ ! -f "${local}" ]]; then
    echo -e "${GREEN}File will be created (doesn't exist locally)${NC}"
    echo ""
    echo -e "${GREEN}Preview of new content:${NC}"
    head -20 "${upstream}"
    if [[ $(wc -l < "${upstream}") -gt 20 ]]; then
      echo "... ($(wc -l < "${upstream}") lines total)"
    fi
  else
    diff -u "${local}" "${upstream}" || true
  fi

  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
}

create_backup() {
  local file="$1"
  local filepath="${PROJECT_ROOT}/${file}"

  if [[ ! -f "${filepath}" ]]; then
    return 0  # No file to backup
  fi

  mkdir -p "${BACKUP_DIR}/$(dirname "${file}")"
  cp -f "${filepath}" "${BACKUP_DIR}/${file}"
  log INFO "Backed up: ${file} → .template-backups/$(basename "${BACKUP_DIR}")/${file}"
}

create_backup_dir() {
  local dir="$1"
  local dirpath="${PROJECT_ROOT}/${dir}"

  if [[ ! -d "${dirpath}" ]]; then
    return 0  # No directory to backup
  fi

  # Create parent directory structure in backup location
  mkdir -p "${BACKUP_DIR}/$(dirname "${dir}")"
  cp -R "${dirpath}" "${BACKUP_DIR}/${dir}"
  log INFO "Backed up: ${dir}/ → .template-backups/$(basename "${BACKUP_DIR}")/${dir}/"
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

update_metadata() {
  local file="$1"
  local upstream_file="$2"
  local status="$3"  # synced, modified, diverged, skipped

  local timestamp
  timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local upstream_hash
  upstream_hash="$(get_file_hash "${upstream_file}")"
  local local_hash
  local_hash="$(get_file_hash "${PROJECT_ROOT}/${file}")"

  # Create or update metadata file (simple JSON)
  if [[ ! -f "${SYNC_METADATA}" ]]; then
    echo "{" > "${SYNC_METADATA}"
    echo "  \"last_sync\": \"${timestamp}\"," >> "${SYNC_METADATA}"
    echo "  \"template_root\": \"${TEMPLATE_ROOT}\"," >> "${SYNC_METADATA}"
    echo "  \"files\": {}" >> "${SYNC_METADATA}"
    echo "}" >> "${SYNC_METADATA}"
  fi

  # Update last_sync timestamp
  if command -v jq &>/dev/null; then
    local temp_file
    temp_file="$(mktemp)"
    jq --arg ts "${timestamp}" \
       --arg file "${file}" \
       --arg status "${status}" \
       --arg upstream_hash "${upstream_hash}" \
       --arg local_hash "${local_hash}" \
       '.last_sync = $ts | .files[$file] = {last_sync: $ts, status: $status, upstream_hash: $upstream_hash, local_hash: $local_hash}' \
       "${SYNC_METADATA}" > "${temp_file}"
    mv "${temp_file}" "${SYNC_METADATA}"
  else
    # Fallback: just update timestamp
    sed -i.bak "s/\"last_sync\": \".*\"/\"last_sync\": \"${timestamp}\"/" "${SYNC_METADATA}"
    rm -f "${SYNC_METADATA}.bak"
  fi
}

# ============================================================================
# Sync Functions
# ============================================================================

sync_tier1_file() {
  local upstream_file="$1"
  local local_file="$2"
  local label="$3"

  if is_sync_ignored "${local_file}"; then
    log OK "${label}: protected by .template-sync-ignore"
    return 0
  fi

  local upstream_path="${upstream_file}"
  local local_path="${PROJECT_ROOT}/${local_file}"

  # Check if files differ
  if ! files_differ "${upstream_path}" "${local_path}"; then
    log OK "${label}: unchanged"
    update_metadata "${local_file}" "${upstream_path}" "synced"
    return 0
  fi

  # Files differ
  case "${MODE}" in
    check)
      log WARN "${label}: differs from upstream"
      return 0
      ;;
    dry-run)
      log INFO "${label}: would be updated"
      return 0
      ;;
    status)
      return 0
      ;;
    sync)
      if [[ "${FORCE_MODE}" == "false" ]]; then
        echo ""
        log INFO "${label}: differs from upstream"
        show_diff "${upstream_path}" "${local_path}" "${label}"

        while true; do
          prompt_user "Apply changes to ${label}?" "y/n/d"
          local result=$?
          case ${result} in
            0)  # Yes - proceed to apply changes
              break
              ;;
            2)  # Diff - show diff again and re-prompt
              show_diff "${upstream_path}" "${local_path}" "${label}"
              ;;
            *)  # No or Skip
              log INFO "${label}: skipped by user"
              update_metadata "${local_file}" "${upstream_path}" "skipped"
              return 0
              ;;
          esac
        done
      fi

      # Apply changes
      create_backup "${local_file}"
      mkdir -p "$(dirname "${local_path}")"
      cp -f "${upstream_path}" "${local_path}"
      log OK "${label}: synced from upstream"
      update_metadata "${local_file}" "${upstream_path}" "synced"
      ;;
  esac
}

sync_tier2_file() {
  local upstream_file="$1"
  local local_file="$2"
  local label="$3"

  if is_sync_ignored "${local_file}"; then
    log OK "${label}: protected by .template-sync-ignore"
    return 0
  fi

  local upstream_path="${upstream_file}"
  local local_path="${PROJECT_ROOT}/${local_file}"

  # Check if files differ
  if ! files_differ "${upstream_path}" "${local_path}"; then
    log OK "${label}: unchanged"
    update_metadata "${local_file}" "${upstream_path}" "synced"
    return 0
  fi

  # Check for local modifications
  local has_mods=false
  if has_local_modifications "${local_file}"; then
    has_mods=true
  fi

  # Files differ
  case "${MODE}" in
    check)
      if [[ "${has_mods}" == "true" ]]; then
        log WARN "${label}: differs from upstream (has local modifications)"
      else
        log WARN "${label}: differs from upstream"
      fi
      return 0
      ;;
    dry-run)
      if [[ "${has_mods}" == "true" ]]; then
        log INFO "${label}: would prompt (has local modifications)"
      else
        log INFO "${label}: would be updated"
      fi
      return 0
      ;;
    status)
      return 0
      ;;
    sync)
      echo ""
      if [[ "${has_mods}" == "true" ]]; then
        log WARN "${label}: differs from upstream and has local modifications"
      else
        log INFO "${label}: differs from upstream"
      fi

      show_diff "${upstream_path}" "${local_path}" "${label}"

      while true; do
        prompt_user "Apply changes to ${label}?" "y/n/d/s"
        local result=$?
        case ${result} in
          0)  # Yes
            create_backup "${local_file}"
            mkdir -p "$(dirname "${local_path}")"
            cp -f "${upstream_path}" "${local_path}"
            log OK "${label}: synced from upstream"
            update_metadata "${local_file}" "${upstream_path}" "synced"
            break
            ;;
          2)  # Diff
            show_diff "${upstream_path}" "${local_path}" "${label}"
            ;;
          *)  # No or Skip
            log INFO "${label}: skipped by user"
            update_metadata "${local_file}" "${upstream_path}" "skipped"
            break
            ;;
        esac
      done
      ;;
  esac
}

sync_agent_directory() {
  local upstream_dir="${TEMPLATE_PROJECT}/dot.agent"
  local local_dir="${PROJECT_ROOT}/.agent"
  local label=".agent/"

  # Check if entire directory is ignored
  if is_sync_ignored ".agent" || is_sync_ignored ".agent/"; then
    log INFO "${label}: skipped (in .template-sync-ignore)"
    return 0
  fi

  # Check if upstream directory exists
  if [[ ! -d "${upstream_dir}" ]]; then
    log WARN "${label}: upstream directory not found"
    return 0
  fi

  # Build exclude flags from .template-sync-ignore
  get_dir_excludes ".agent"
  local -a extra_x=()
  local -a rsync_excludes=()
  if [[ ${#DIR_EXCLUDE_FLAGS[@]} -gt 0 ]]; then
    for exc in "${DIR_EXCLUDE_FLAGS[@]}"; do
      extra_x+=(-x "$exc")
      rsync_excludes+=(--exclude "/$exc")
    done
  fi

  # Simple directory comparison (check if any files differ)
  local dirs_differ=false
  if [[ ! -d "${local_dir}" ]]; then
    dirs_differ=true
  else
    # Compare directory trees (excluding system files and ignored files)
    if ! diff -qr \
      -x ".DS_Store" \
      -x ".AppleDouble" \
      -x ".LSOverride" \
      -x "Thumbs.db" \
      -x "Desktop.ini" \
      -x ".git" \
      ${extra_x[@]+"${extra_x[@]}"} \
      "${upstream_dir}" "${local_dir}" &>/dev/null; then
      dirs_differ=true
    fi
  fi

  if [[ "${dirs_differ}" == "false" ]]; then
    log OK "${label}: unchanged"
    return 0
  fi

  # Directories differ
  case "${MODE}" in
    check)
      log WARN "${label}: differs from upstream"
      return 0
      ;;
    dry-run)
      log INFO "${label}: would be replaced"
      return 0
      ;;
    status)
      return 0
      ;;
    sync)
      echo ""
      log INFO "${label}: differs from upstream"

      if [[ "${FORCE_MODE}" == "false" ]]; then
        preview_directory_changes "${upstream_dir}" "${local_dir}" "${label}" ".agent"

        echo -e "${YELLOW}Warning:${NC} .agent/ directory will be completely replaced"
        echo "Current .agent/ will be backed up to .template-backups/"
        echo ""

        if ! prompt_user "Replace .agent/ directory?" "y/n"; then
          log INFO "${label}: skipped by user"
          return 0
        fi
      fi

      # Replace directory (preserving ignored files)
      create_backup_dir ".agent"
      sync_directory_with_excludes "${upstream_dir}" "${local_dir}" ${rsync_excludes[@]+"${rsync_excludes[@]}"}
      log OK "${label}: synced from upstream"

      # Run local sync to propagate changes to Claude, Cursor, and Codex
      if [[ -f "${PROJECT_ROOT}/Makefile" ]]; then
        log INFO "Running 'make sync' to propagate .agent/ changes to all tools..."
        make -C "${PROJECT_ROOT}" sync
      elif [[ -f "${PROJECT_ROOT}/scripts/boilerplate/sync-agents.sh" ]]; then
        log INFO "Running local sync to propagate .agent/ changes..."
        "${PROJECT_ROOT}/scripts/boilerplate/sync-agents.sh"
      fi
      ;;
  esac
}

preview_directory_changes() {
  local upstream_dir="$1"
  local local_dir="$2"
  local label="$3"
  local dir_prefix="${4:-}"  # e.g., ".devcontainer" for building excludes

  # Build exclude flags for ignored files (snapshot into locals to avoid clobbering caller)
  local -a extra_x=()
  local -a protected_files=()
  if [[ -n "$dir_prefix" ]]; then
    get_dir_excludes "$dir_prefix"
    if [[ ${#DIR_EXCLUDE_FLAGS[@]} -gt 0 ]]; then
      protected_files=("${DIR_EXCLUDE_FLAGS[@]}")
      for exc in "${protected_files[@]}"; do
        extra_x+=(-x "$exc")
      done
    fi
  fi

  echo ""
  echo -e "${BLUE}Preview of changes for ${label}:${NC}"
  echo ""

  # Files only in upstream (will be added)
  local to_add=$(diff -qr \
    -x ".DS_Store" -x ".AppleDouble" -x ".LSOverride" \
    -x "Thumbs.db" -x "Desktop.ini" -x ".git" \
    ${extra_x[@]+"${extra_x[@]}"} \
    "${upstream_dir}" "${local_dir}" 2>/dev/null | \
    grep "Only in ${upstream_dir}" | \
    sed "s|Only in ${upstream_dir}[:/] *||")

  if [[ -n "$to_add" ]]; then
    echo -e "${GREEN}Files to be added:${NC}"
    echo "$to_add" | while read -r file; do
      echo "  + $file"
    done
    echo ""
  fi

  # Files only in local (will be removed)
  local to_remove=$(diff -qr \
    -x ".DS_Store" -x ".AppleDouble" -x ".LSOverride" \
    -x "Thumbs.db" -x "Desktop.ini" -x ".git" \
    ${extra_x[@]+"${extra_x[@]}"} \
    "${upstream_dir}" "${local_dir}" 2>/dev/null | \
    grep "Only in ${local_dir}" | \
    sed "s|Only in ${local_dir}[:/] *||")

  if [[ -n "$to_remove" ]]; then
    echo -e "${RED}Files to be removed:${NC}"
    echo "$to_remove" | while read -r file; do
      echo "  - $file"
    done
    echo ""
  fi

  # Files that differ (will be modified)
  local to_modify=$(diff -qr \
    -x ".DS_Store" -x ".AppleDouble" -x ".LSOverride" \
    -x "Thumbs.db" -x "Desktop.ini" -x ".git" \
    ${extra_x[@]+"${extra_x[@]}"} \
    "${upstream_dir}" "${local_dir}" 2>/dev/null | \
    grep "^Files " | \
    sed "s|Files ${upstream_dir}/\(.*\) and ${local_dir}/\(.*\) differ|\1|")

  if [[ -n "$to_modify" ]]; then
    echo -e "${YELLOW}Files to be modified:${NC}"
    echo "$to_modify" | while read -r file; do
      echo "  ~ $file"
    done
    echo ""
  fi

  # Show protected files
  if [[ ${#protected_files[@]} -gt 0 ]]; then
    echo -e "${BLUE}Protected by .template-sync-ignore:${NC}"
    for exc in "${protected_files[@]}"; do
      echo "  # $exc"
    done
    echo ""
  fi
}

sync_boilerplate_directory() {
  local upstream_dir="${TEMPLATE_PROJECT}/scripts/boilerplate"
  local local_dir="${PROJECT_ROOT}/scripts/boilerplate"
  local label="scripts/boilerplate/"

  # Check if entire directory is ignored
  if is_sync_ignored "scripts/boilerplate" || is_sync_ignored "scripts/boilerplate/"; then
    log INFO "${label}: skipped (in .template-sync-ignore)"
    return 0
  fi

  # Check if upstream directory exists
  if [[ ! -d "${upstream_dir}" ]]; then
    log WARN "${label}: upstream directory not found"
    return 0
  fi

  # Build exclude flags from .template-sync-ignore
  get_dir_excludes "scripts/boilerplate"
  local -a extra_x=()
  local -a rsync_excludes=()
  if [[ ${#DIR_EXCLUDE_FLAGS[@]} -gt 0 ]]; then
    for exc in "${DIR_EXCLUDE_FLAGS[@]}"; do
      extra_x+=(-x "$exc")
      rsync_excludes+=(--exclude "/$exc")
    done
  fi

  # Simple directory comparison
  local dirs_differ=false
  if [[ ! -d "${local_dir}" ]]; then
    dirs_differ=true
  else
    # Compare directory trees (excluding system files and ignored files)
    if ! diff -qr \
      -x ".DS_Store" \
      -x ".AppleDouble" \
      -x ".LSOverride" \
      -x "Thumbs.db" \
      -x "Desktop.ini" \
      -x ".git" \
      ${extra_x[@]+"${extra_x[@]}"} \
      "${upstream_dir}" "${local_dir}" &>/dev/null; then
      dirs_differ=true
    fi
  fi

  if [[ "${dirs_differ}" == "false" ]]; then
    log OK "${label}: unchanged"
    return 0
  fi

  # Directories differ
  case "${MODE}" in
    check)
      log WARN "${label}: differs from upstream"
      return 0
      ;;
    dry-run)
      log INFO "${label}: would be replaced"
      return 0
      ;;
    status)
      return 0
      ;;
    sync)
      echo ""
      log INFO "${label}: differs from upstream"

      if [[ "${FORCE_MODE}" == "false" ]]; then
        preview_directory_changes "${upstream_dir}" "${local_dir}" "${label}" "scripts/boilerplate"

        echo -e "${YELLOW}Warning:${NC} scripts/boilerplate/ directory will be completely replaced"
        echo "Current scripts/boilerplate/ will be backed up to .template-backups/"
        echo ""

        if ! prompt_user "Replace scripts/boilerplate/ directory?" "y/n"; then
          log INFO "${label}: skipped by user"
          return 0
        fi
      fi

      # Replace directory (preserving ignored files)
      create_backup_dir "scripts/boilerplate"
      sync_directory_with_excludes "${upstream_dir}" "${local_dir}" ${rsync_excludes[@]+"${rsync_excludes[@]}"}

      # Ensure scripts are executable
      chmod +x "${local_dir}"/*.sh 2>/dev/null || true

      log OK "${label}: synced from upstream"
      ;;
  esac
}

sync_devcontainer_directory() {
  local upstream_dir="${TEMPLATE_PROJECT}/dot.devcontainer"
  local local_dir="${PROJECT_ROOT}/.devcontainer"
  local label=".devcontainer/"

  # Check if entire directory is ignored
  if is_sync_ignored ".devcontainer" || is_sync_ignored ".devcontainer/"; then
    log INFO "${label}: skipped (in .template-sync-ignore)"
    return 0
  fi

  # Check if upstream directory exists
  if [[ ! -d "${upstream_dir}" ]]; then
    log WARN "${label}: upstream directory not found"
    return 0
  fi

  # Build exclude flags from .template-sync-ignore
  get_dir_excludes ".devcontainer"
  local -a extra_x=()
  local -a rsync_excludes=()
  if [[ ${#DIR_EXCLUDE_FLAGS[@]} -gt 0 ]]; then
    for exc in "${DIR_EXCLUDE_FLAGS[@]}"; do
      extra_x+=(-x "$exc")
      rsync_excludes+=(--exclude "/$exc")
    done
  fi

  # Directory comparison (same pattern as boilerplate)
  local dirs_differ=false
  if [[ ! -d "${local_dir}" ]]; then
    dirs_differ=true
  else
    if ! diff -qr \
      -x ".DS_Store" \
      -x ".AppleDouble" \
      -x ".LSOverride" \
      -x "Thumbs.db" \
      -x "Desktop.ini" \
      -x ".git" \
      ${extra_x[@]+"${extra_x[@]}"} \
      "${upstream_dir}" "${local_dir}" &>/dev/null; then
      dirs_differ=true
    fi
  fi

  if [[ "${dirs_differ}" == "false" ]]; then
    log OK "${label}: unchanged"
    return 0
  fi

  # Check for local modifications
  local has_mods=false
  if git -C "${PROJECT_ROOT}" ls-files --error-unmatch ".devcontainer" &>/dev/null; then
    if ! git -C "${PROJECT_ROOT}" diff --quiet HEAD -- ".devcontainer" 2>/dev/null; then
      has_mods=true
    fi
  fi

  # Mode handling (Tier 2 - always interactive in sync mode)
  case "${MODE}" in
    check)
      if [[ "${has_mods}" == "true" ]]; then
        log WARN "${label}: differs from upstream (has local modifications)"
      else
        log WARN "${label}: differs from upstream"
      fi
      return 0
      ;;
    dry-run)
      if [[ "${has_mods}" == "true" ]]; then
        log INFO "${label}: would prompt (has local modifications)"
      else
        log INFO "${label}: would be updated"
      fi
      return 0
      ;;
    status)
      return 0
      ;;
    sync)
      echo ""
      if [[ "${has_mods}" == "true" ]]; then
        log WARN "${label}: differs from upstream and has local modifications"
      else
        log INFO "${label}: differs from upstream"
      fi

      preview_directory_changes "${upstream_dir}" "${local_dir}" "${label}" ".devcontainer"

      echo -e "${YELLOW}Warning:${NC} .devcontainer/ directory will be completely replaced"
      echo "Current .devcontainer/ will be backed up to .template-backups/"
      echo ""

      while true; do
        prompt_user "Replace .devcontainer/ directory?" "y/n/d/s"
        local result=$?
        case ${result} in
          0)  # Yes
            create_backup_dir ".devcontainer"
            sync_directory_with_excludes "${upstream_dir}" "${local_dir}" ${rsync_excludes[@]+"${rsync_excludes[@]}"}
            # Ensure scripts are executable
            find "${local_dir}" -name "*.sh" -exec chmod +x {} \; 2>/dev/null || true
            log OK "${label}: synced from upstream"
            break
            ;;
          2)  # Diff
            preview_directory_changes "${upstream_dir}" "${local_dir}" "${label}" ".devcontainer"
            ;;
          *)  # No or Skip
            log INFO "${label}: skipped by user"
            break
            ;;
        esac
      done
      ;;
  esac
}

sync_claude_config() {
  # Sync Claude config files to .claude/ directory
  # Sources:
  #   - statusline.sh from ~/dotfiles/config/claude/
  #   - settings.json from ~/dotfiles/templates/project/dot.claude/
  local dotfiles_config="${TEMPLATE_ROOT}/../config/claude"
  local template_claude="${TEMPLATE_PROJECT}/dot.claude"
  local local_dir="${PROJECT_ROOT}/.claude"

  mkdir -p "${local_dir}"

  # Sync statusline.sh from config/claude/
  local statusline_src="${dotfiles_config}/statusline.sh"
  local statusline_dst="${local_dir}/statusline.sh"
  if [[ -f "${statusline_src}" ]]; then
    sync_claude_config_file "${statusline_src}" "${statusline_dst}" ".claude/statusline.sh" "executable"
  else
    log WARN ".claude/statusline.sh: source not found at ${statusline_src}"
  fi

  # Sync settings.json from templates/project/dot.claude/
  local settings_src="${template_claude}/settings.json"
  local settings_dst="${local_dir}/settings.json"
  if [[ -f "${settings_src}" ]]; then
    sync_claude_config_file "${settings_src}" "${settings_dst}" ".claude/settings.json"
  else
    log WARN ".claude/settings.json: source not found at ${settings_src}"
  fi
}

sync_claude_config_file() {
  local upstream_file="$1"
  local local_file="$2"
  local label="$3"
  local file_type="${4:-}"  # "executable" or empty

  if is_sync_ignored "${label}"; then
    log OK "${label}: protected by .template-sync-ignore"
    return 0
  fi

  # Check if files differ
  if ! files_differ "${upstream_file}" "${local_file}"; then
    log OK "${label}: unchanged"
    return 0
  fi

  # Files differ - handle based on mode
  case "${MODE}" in
    check)
      log WARN "${label}: differs from upstream"
      return 0
      ;;
    dry-run)
      log INFO "${label}: would be updated"
      return 0
      ;;
    status)
      return 0
      ;;
    sync)
      echo ""
      log INFO "${label}: differs from upstream"
      show_diff "${upstream_file}" "${local_file}" "${label}"

      while true; do
        prompt_user "Apply changes to ${label}?" "y/n/d/s"
        local result=$?
        case ${result} in
          0)  # Yes
            create_backup "${label}"
            cp -f "${upstream_file}" "${local_file}"
            [[ "${file_type}" == "executable" ]] && chmod +x "${local_file}"
            log OK "${label}: synced from upstream"
            break
            ;;
          2)  # Diff
            show_diff "${upstream_file}" "${local_file}" "${label}"
            ;;
          *)  # No or Skip
            log INFO "${label}: skipped by user"
            break
            ;;
        esac
      done
      ;;
  esac
}

# ============================================================================
# Main Sync Logic
# ============================================================================

sync_all_files() {
  log INFO "Starting template sync (mode: ${MODE})"
  log INFO "Project: ${PROJECT_ROOT}"
  log INFO "Template: ${TEMPLATE_ROOT}"
  echo ""

  load_sync_ignore

  # Determine which files to sync
  local sync_agents_global=false
  local sync_claude_global=false
  local sync_agents=false
  local sync_claude=false
  local sync_rules=false
  local sync_makefile=false
  local sync_gitignore=false
  local sync_agent_dir=false
  local sync_boilerplate_dir=false
  local sync_devcontainer_dir=false
  local sync_claude_config=false

  if [[ ${#SELECTED_FILES[@]} -eq 0 ]] || [[ " ${SELECTED_FILES[*]} " =~ " all " ]]; then
    sync_agents_global=true
    sync_claude_global=true
    sync_agents=true
    sync_claude=true
    sync_rules=true
    sync_makefile=true
    sync_gitignore=true
    sync_agent_dir=true
    sync_boilerplate_dir=true
    sync_devcontainer_dir=true
    sync_claude_config=true
  else
    for file in "${SELECTED_FILES[@]}"; do
      case "${file}" in
        AGENTS_global) sync_agents_global=true ;;
        CLAUDE_global) sync_claude_global=true ;;
        AGENTS) sync_agents=true ;;
        CLAUDE) sync_claude=true ;;
        RULES) sync_rules=true ;;
        Makefile) sync_makefile=true ;;
        gitignore) sync_gitignore=true ;;
        agent) sync_agent_dir=true ;;
        boilerplate) sync_boilerplate_dir=true ;;
        devcontainer) sync_devcontainer_dir=true ;;
        claude-config) sync_claude_config=true ;;
        *) log WARN "Unknown file: ${file}" ;;
      esac
    done
  fi

  # Tier 1: Pure template files (auto-sync with backup)
  echo -e "${BLUE}Tier 1: Pure Template Files${NC}"
  if [[ "${sync_agents_global}" == "true" ]]; then
    sync_tier1_file "${TEMPLATE_GLOBAL}/AGENTS_global.md" "AGENTS_global.md" "AGENTS_global.md"
  fi

  if [[ "${sync_claude_global}" == "true" ]]; then
    sync_tier1_file "${TEMPLATE_GLOBAL}/CLAUDE_global.md" "CLAUDE_global.md" "CLAUDE_global.md"
  fi

  if [[ "${sync_agent_dir}" == "true" ]]; then
    sync_agent_directory
  fi

  if [[ "${sync_boilerplate_dir}" == "true" ]]; then
    sync_boilerplate_directory
  fi

  echo ""

  # Tier 2: Customizable project files (interactive)
  echo -e "${BLUE}Tier 2: Customizable Project Files${NC}"
  if [[ "${sync_agents}" == "true" ]]; then
    sync_tier2_file "${TEMPLATE_PROJECT}/AGENTS_project.md" "AGENTS.md" "AGENTS.md"
  fi

  if [[ "${sync_claude}" == "true" ]]; then
    sync_tier2_file "${TEMPLATE_PROJECT}/CLAUDE_project.md" "CLAUDE.md" "CLAUDE.md"
  fi

  if [[ "${sync_rules}" == "true" ]]; then
    sync_tier2_file "${TEMPLATE_PROJECT}/RULES.md" "RULES.md" "RULES.md"
  fi

  if [[ "${sync_makefile}" == "true" ]]; then
    sync_tier2_file "${TEMPLATE_PROJECT}/Makefile" "Makefile" "Makefile"
  fi

  if [[ "${sync_gitignore}" == "true" ]]; then
    sync_tier2_file "${TEMPLATE_PROJECT}/dot.gitignore" ".gitignore" ".gitignore"
  fi

  if [[ "${sync_devcontainer_dir}" == "true" ]]; then
    sync_devcontainer_directory
  fi

  if [[ "${sync_claude_config}" == "true" ]]; then
    sync_claude_config
  fi

  echo ""
  log OK "Sync complete"
}

show_status() {
  if [[ ! -f "${SYNC_METADATA}" ]]; then
    log INFO "No sync history found"
    log INFO "Run 'make fetch-from-upstream' to fetch from template"
    return 0
  fi

  echo -e "${BLUE}Template Sync Status${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  if command -v jq &>/dev/null; then
    local last_sync
    last_sync="$(jq -r '.last_sync' "${SYNC_METADATA}")"
    echo -e "Last sync: ${GREEN}${last_sync}${NC}"
    echo ""

    echo -e "${BLUE}Files:${NC}"
    jq -r '.files | to_entries[] | "\(.key): \(.value.status)"' "${SYNC_METADATA}" | while read -r line; do
      local file="${line%%:*}"
      local status="${line#*: }"

      case "${status}" in
        synced)   echo -e "  ${GREEN}✓${NC} ${file} (synced)" ;;
        modified) echo -e "  ${YELLOW}⚠${NC} ${file} (local modifications)" ;;
        diverged) echo -e "  ${RED}✗${NC} ${file} (diverged)" ;;
        skipped)  echo -e "  ${BLUE}○${NC} ${file} (skipped)" ;;
        *)        echo -e "  ${BLUE}?${NC} ${file} (${status})" ;;
      esac
    done
  else
    cat "${SYNC_METADATA}"
  fi

  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
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
      AGENTS_global|CLAUDE_global|AGENTS|CLAUDE|RULES|Makefile|gitignore|agent|boilerplate|devcontainer|claude-config|all)
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
    check|dry-run|sync)
      sync_all_files
      ;;
    *)
      log ERROR "Unknown mode: ${MODE}"
      exit 1
      ;;
  esac
}

main "$@"

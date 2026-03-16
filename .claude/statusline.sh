#!/usr/bin/env bash
# ~/.claude/statusline.sh
# Claude Code polished status line with ccusage integration
# Reference: https://note.com/y__u777/n/n841c3da533b8

# ============================================
# Configuration
# ============================================
CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/claude-statusline"
BLOCKS_CACHE_TTL=60   # 1 minute for blocks (changes frequently)

# Environment options
FORMAT="${CLAUDE_STATUSLINE_FORMAT:-balanced}"
PLAN="${CLAUDE_STATUSLINE_PLAN:-max5}"
USE_ASCII="${CLAUDE_STATUSLINE_ASCII:-0}"
ENHANCED="${CLAUDE_STATUSLINE_ENHANCED:-1}"
DEBUG="${CLAUDE_STATUSLINE_DEBUG:-0}"

# Plan limits
declare -A PLAN_COST_LIMITS=(
    ["pro"]=20
    ["max5"]=100
    ["max20"]=200
)
declare -A PLAN_TOKEN_LIMITS=(
    ["pro"]=45000
    ["max5"]=88000
    ["max20"]=175000
)

# Validate plan and set limits
if [[ -z "${PLAN_COST_LIMITS[$PLAN]:-}" ]]; then
    [[ "$DEBUG" == "1" ]] && echo "[DEBUG] Warning: Invalid plan '$PLAN', defaulting to max5" >&2
    PLAN="max5"
fi
COST_LIMIT="${PLAN_COST_LIMITS[$PLAN]}"
TOKEN_LIMIT="${PLAN_TOKEN_LIMITS[$PLAN]}"
PLAN_DISPLAY="${PLAN^^}"  # Uppercase

# ============================================
# Icons (Emoji for polish, Nerd Font alternative, ASCII fallback)
# ============================================
if [[ "$USE_ASCII" == "1" ]] || [[ "$TERM" == "dumb" ]]; then
    ICON_MODEL="[AI]"
    ICON_COST="$"
    ICON_TOKEN="#"
    ICON_TIME="@"
    ICON_WARN="!"
    ICON_CRIT="!!"
    ICON_DIR="Dir:"
    ICON_BRANCH="Branch:"
else
    # Emoji icons (match reference screenshot)
    ICON_MODEL="🤖"
    ICON_COST="💰"
    ICON_TOKEN="📊"
    ICON_TIME="⏰"
    ICON_WARN="⚠️"
    ICON_CRIT="🔴"
    ICON_DIR="📁"
    ICON_BRANCH="🌿"
fi

# ============================================
# Utility Functions
# ============================================
debug_log() {
    [[ "$DEBUG" == "1" ]] && echo "[DEBUG] $*" >&2
}

# Format number with K suffix (e.g., 5200 -> 5.2k)
format_tokens() {
    local num="$1"
    if [[ -z "$num" || "$num" == "null" ]]; then
        echo "0"
        return
    fi
    awk -v n="$num" 'BEGIN {
        if (n >= 1000000) printf "%.1fM", n/1000000
        else if (n >= 1000) printf "%.1fk", n/1000
        else printf "%.0f", n
    }'
}

# Get warning indicator based on percentage
get_warning() {
    local pct="$1"
    if [[ -z "$pct" ]]; then
        echo ""
        return
    fi
    local pct_int="${pct%.*}"
    if (( pct_int >= 95 )); then
        echo "$ICON_CRIT "
    elif (( pct_int >= 80 )); then
        echo "$ICON_WARN "
    else
        echo ""
    fi
}

# ============================================
# Data Collection
# ============================================

# Read JSON input from stdin
input=$(cat)

# Parse session metrics
read -r MODEL COST_RAW DUR_MS L_ADDED L_REMOVED PRJ_DIR_RAW < <(
    echo "$input" | jq -r '[
        .model.display_name // "NA",
        .cost.total_cost_usd // 0,
        .cost.total_duration_ms // 0,
        .cost.total_lines_added // 0,
        .cost.total_lines_removed // 0,
        .workspace.project_dir // "."
    ] | @tsv' 2>/dev/null || echo "NA 0 0 0 0 ."
)

# Format model name (remove date suffix, clean up)
MODEL_CLEAN="${MODEL//-20[0-9][0-9][0-9][0-9][0-9][0-9]/}"  # Remove date like -20251101
MODEL_CLEAN="${MODEL_CLEAN/claude-/}"  # Remove claude- prefix
# Handle version numbers: opus-4-5 -> Opus 4.5
MODEL_CLEAN=$(echo "$MODEL_CLEAN" | sed -E 's/-([0-9]+)-([0-9]+)/ \1.\2/g')  # Convert -4-5 to 4.5
MODEL_CLEAN="${MODEL_CLEAN//-/ }"  # Replace remaining - with space
# Capitalize first letter of each word
MODEL_DISPLAY=$(echo "$MODEL_CLEAN" | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1')

# Session cost
SESSION_COST=$(awk -v cst="${COST_RAW:-0}" 'BEGIN {printf "%.2f", cst}')

# Duration (ms -> human readable)
DUR_MIN=$(awk -v msec="${DUR_MS:-0}" 'BEGIN { printf "%.0f", msec / 60000 }')
DUR_HOURS=$((DUR_MIN / 60))
DUR_MINS=$((DUR_MIN % 60))
if (( DUR_HOURS > 0 )); then
    DURATION_DISPLAY="${DUR_HOURS}h ${DUR_MINS}m"
else
    DURATION_DISPLAY="${DUR_MINS}m"
fi

# Project directory (short name)
PRJ_NAME=$(basename "$PRJ_DIR_RAW")

# Git branch
GIT_BRANCH=""
if git rev-parse --git-dir > /dev/null 2>&1; then
    GIT_BRANCH=$(git branch --show-current 2>/dev/null)
fi

# ============================================
# ccusage Blocks Integration (Real-time data)
# ============================================
BLOCK_COST=""
BLOCK_COST_PCT=""
BLOCK_TOKENS=""
BLOCK_TOKENS_PCT=""
RESET_TIME=""
REMAINING_TIME=""
SESSION_ID=""

get_blocks_data() {
    [[ "$ENHANCED" != "1" ]] && return 1
    command -v npx >/dev/null 2>&1 || return 1

    mkdir -p "$CACHE_DIR" 2>/dev/null || return 1

    local cache_file="$CACHE_DIR/blocks-active.json"
    local cache_age=999999

    if [[ -f "$cache_file" ]]; then
        local now=$(date +%s)
        local mtime=$(stat -f %m "$cache_file" 2>/dev/null || stat -c %Y "$cache_file" 2>/dev/null || echo 0)
        cache_age=$((now - mtime))
    fi

    # Refresh if stale
    if [[ $cache_age -gt $BLOCKS_CACHE_TTL ]]; then
        debug_log "Refreshing blocks cache..."
        timeout 5s npx -y ccusage@latest blocks --active --json > "$cache_file.tmp" 2>/dev/null && \
            mv "$cache_file.tmp" "$cache_file" 2>/dev/null
    fi

    [[ -f "$cache_file" ]] && cat "$cache_file" && return 0
    return 1
}

parse_blocks_data() {
    local blocks_json
    blocks_json=$(get_blocks_data) || return 1

    if [[ -n "$blocks_json" ]]; then
        # Parse active block data
        local parsed
        parsed=$(echo "$blocks_json" | jq -r '
            .blocks[0] // {} |
            [
                .costUSD // 0,
                (.tokenCounts.inputTokens // 0) + (.tokenCounts.outputTokens // 0),
                .endTime // "",
                .projection.remainingMinutes // 0,
                (.id // "" | split("T")[0] | split("-") | .[-1])
            ] | @tsv
        ' 2>/dev/null)

        if [[ -n "$parsed" ]]; then
            read -r cost tokens end_time remaining_min session_suffix <<< "$parsed"

            # Block cost and percentage
            BLOCK_COST=$(awk -v c="$cost" 'BEGIN {printf "%.2f", c}')
            BLOCK_COST_PCT=$(awk -v c="$cost" -v l="$COST_LIMIT" 'BEGIN {printf "%.0f", (c/l)*100}')

            # Tokens and percentage
            BLOCK_TOKENS="$tokens"
            BLOCK_TOKENS_PCT=$(awk -v t="$tokens" -v l="$TOKEN_LIMIT" 'BEGIN {printf "%.0f", (t/l)*100}')

            # Reset time (convert UTC to local with English AM/PM)
            if [[ -n "$end_time" ]]; then
                local hour min ampm
                if [[ "$OSTYPE" == "darwin"* ]]; then
                    # Get 24-hour format first, then convert manually
                    local time24=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${end_time%.000Z}" "+%H:%M" 2>/dev/null)
                    hour="${time24%%:*}"
                    min="${time24##*:}"
                else
                    local time24=$(date -d "${end_time}" "+%H:%M" 2>/dev/null)
                    hour="${time24%%:*}"
                    min="${time24##*:}"
                fi
                # Convert to 12-hour format with AM/PM
                hour=$((10#$hour))  # Remove leading zero
                if (( hour >= 12 )); then
                    ampm="PM"
                    (( hour > 12 )) && hour=$((hour - 12))
                else
                    ampm="AM"
                    (( hour == 0 )) && hour=12
                fi
                RESET_TIME="${hour}:${min}${ampm}"
            fi

            # Remaining time
            if [[ -n "$remaining_min" && "$remaining_min" != "0" ]]; then
                local rem_hours=$((remaining_min / 60))
                local rem_mins=$((remaining_min % 60))
                REMAINING_TIME="${rem_hours}h ${rem_mins}m"
            fi

            # Session ID (short hash from block ID)
            SESSION_ID="${session_suffix:0:4}"

            debug_log "Blocks: cost=$BLOCK_COST ($BLOCK_COST_PCT%) tokens=$BLOCK_TOKENS ($BLOCK_TOKENS_PCT%)"
        fi
    fi
}

parse_blocks_data

# ============================================
# Format Functions
# ============================================

format_balanced() {
    # Polished single-line format matching reference
    local line=""

    # Model with plan
    line+="${ICON_MODEL} ${MODEL_DISPLAY} [${PLAN_DISPLAY}]"

    # Cost with percentage and warning
    local cost_warn=$(get_warning "$BLOCK_COST_PCT")
    if [[ -n "$BLOCK_COST" ]]; then
        line+=" | ${cost_warn}${ICON_COST} \$${BLOCK_COST}/\$${COST_LIMIT} (${BLOCK_COST_PCT}%)"
    else
        line+=" | ${ICON_COST} \$${SESSION_COST}"
    fi

    # Tokens with percentage
    if [[ -n "$BLOCK_TOKENS" && "$BLOCK_TOKENS" != "0" ]]; then
        local tokens_fmt=$(format_tokens "$BLOCK_TOKENS")
        local limit_fmt=$(format_tokens "$TOKEN_LIMIT")
        local token_warn=$(get_warning "$BLOCK_TOKENS_PCT")
        line+=" | ${token_warn}${ICON_TOKEN} ${tokens_fmt}/${limit_fmt} (${BLOCK_TOKENS_PCT}%)"
    fi

    # Reset time with remaining
    if [[ -n "$RESET_TIME" && -n "$REMAINING_TIME" ]]; then
        line+=" | ${ICON_TIME} ${RESET_TIME} (${REMAINING_TIME})"
    fi

    # Session ID
    if [[ -n "$SESSION_ID" ]]; then
        line+=" [ID:${SESSION_ID}]"
    fi

    # Directory and branch (using icons)
    line+=" | ${ICON_DIR} ${PRJ_NAME}"
    [[ -n "$GIT_BRANCH" ]] && line+=" | ${ICON_BRANCH} ${GIT_BRANCH}"

    echo "$line"
}

format_compact() {
    # Ultra-compact single line
    local line="${ICON_MODEL} ${MODEL_DISPLAY}"

    if [[ -n "$BLOCK_COST" ]]; then
        line+=" ${ICON_COST}\$${BLOCK_COST}(${BLOCK_COST_PCT}%)"
    else
        line+=" ${ICON_COST}\$${SESSION_COST}"
    fi

    if [[ -n "$BLOCK_TOKENS" && "$BLOCK_TOKENS" != "0" ]]; then
        local tokens_fmt=$(format_tokens "$BLOCK_TOKENS")
        line+=" ${ICON_TOKEN}${tokens_fmt}"
    fi

    [[ -n "$REMAINING_TIME" ]] && line+=" ${ICON_TIME}${REMAINING_TIME}"

    # Directory (use basename if available)
    local dir_name="${PRJ_NAME:-$(basename "$PWD")}"
    [[ "$dir_name" == "." ]] && dir_name=$(basename "$PWD")
    line+=" ${dir_name}"
    [[ -n "$GIT_BRANCH" ]] && line+="@${GIT_BRANCH}"

    echo "$line"
}

format_minimal() {
    # Essential info only
    local model_short="${MODEL_DISPLAY%% *}"
    local cost="${BLOCK_COST:-$SESSION_COST}"

    echo "${ICON_MODEL} ${model_short} | ${ICON_COST} \$${cost} | ${PRJ_NAME}"
}

format_rich() {
    # Multi-line detailed report
    local sep="────────────────────────────────────────"

    echo ""
    echo "${ICON_MODEL} Session Report"
    echo "$sep"
    echo "Model: ${MODEL_DISPLAY} [${PLAN_DISPLAY}]"
    echo ""

    if [[ -n "$BLOCK_COST" ]]; then
        local cost_warn=$(get_warning "$BLOCK_COST_PCT")
        echo "${ICON_COST} Cost: ${cost_warn}\$${BLOCK_COST} / \$${COST_LIMIT} (${BLOCK_COST_PCT}%)"
    else
        echo "${ICON_COST} Session Cost: \$${SESSION_COST}"
    fi

    if [[ -n "$BLOCK_TOKENS" && "$BLOCK_TOKENS" != "0" ]]; then
        local tokens_fmt=$(format_tokens "$BLOCK_TOKENS")
        local limit_fmt=$(format_tokens "$TOKEN_LIMIT")
        local token_warn=$(get_warning "$BLOCK_TOKENS_PCT")
        echo "${ICON_TOKEN} Tokens: ${token_warn}${tokens_fmt} / ${limit_fmt} (${BLOCK_TOKENS_PCT}%)"
    fi

    if [[ -n "$RESET_TIME" ]]; then
        echo "${ICON_TIME} Reset: ${RESET_TIME} (${REMAINING_TIME} remaining)"
    fi

    [[ -n "$SESSION_ID" ]] && echo "Session ID: ${SESSION_ID}"
    echo ""
    echo "Duration: ${DURATION_DISPLAY}"
    echo "Lines: +${L_ADDED} -${L_REMOVED}"
    echo ""
    echo "${ICON_DIR} ${PRJ_NAME}"
    [[ -n "$GIT_BRANCH" ]] && echo "${ICON_BRANCH} ${GIT_BRANCH}"
    echo ""
}

# ============================================
# Main Output
# ============================================
case "$FORMAT" in
    compact)  format_compact ;;
    balanced) format_balanced ;;
    minimal)  format_minimal ;;
    rich)     format_rich ;;
    *)        format_balanced ;;
esac

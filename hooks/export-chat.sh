#!/usr/bin/env bash
set -euo pipefail

# Auto-export Claude Code chat on PreCompact / SessionEnd
# Reads hook JSON from stdin, extracts transcript, converts to readable markdown

HOOK_INPUT=$(cat)

# Extract transcript_path and session_id
if ! command -v jq &>/dev/null; then
  # Try node fallback for JSON parsing
  if command -v node &>/dev/null; then
    TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).transcript_path||'')}catch{console.log('')}})")
    SESSION_ID=$(echo "$HOOK_INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).session_id||'')}catch{console.log('')}})")
  else
    echo "export-chat: neither jq nor node available, skipping" >&2
    exit 0
  fi
else
  TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.transcript_path // empty')
  SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id // empty')
fi

# Validate transcript exists and is non-empty
if [[ -z "${TRANSCRIPT_PATH:-}" ]] || [[ ! -s "$TRANSCRIPT_PATH" ]]; then
  exit 0
fi

# Project name from CLAUDE_PROJECT_DIR env var, fallback to PWD
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
PROJECT_NAME=$(basename "$PROJECT_DIR")

# Git branch
BRANCH=$(git -C "$PROJECT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

# Output directory: project's .claude/chat-exports/
EXPORT_DIR="$PROJECT_DIR/.claude/chat-exports"
mkdir -p "$EXPORT_DIR"

TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
OUTPUT_FILE="$EXPORT_DIR/${TIMESTAMP}.txt"

# Handle collision (PreCompact + SessionEnd in same second)
if [[ -f "$OUTPUT_FILE" ]]; then
  OUTPUT_FILE="$EXPORT_DIR/${TIMESTAMP}-2.txt"
fi

# Dispatch to Node.js (rich format) or shell fallback (basic format)
if command -v node &>/dev/null; then
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  node "$SCRIPT_DIR/export-chat.js" \
    "$TRANSCRIPT_PATH" \
    "${SESSION_ID:-unknown}" \
    "$PROJECT_NAME" \
    "$BRANCH" \
    > "$OUTPUT_FILE"
elif command -v jq &>/dev/null; then
  # Shell fallback: jq + awk
  {
    echo "=== Claude Code Chat Export ==="
    echo "Date: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "Project: $PROJECT_NAME"
    echo "Branch: $BRANCH"
    echo "Session: ${SESSION_ID:-unknown}"
    echo ""
    echo "---"
    echo ""

    jq -r '
      if .type == "user" then
        .message // empty |
        if type == "string" then
          # Strip system-reminder and local-command-caveat tags
          gsub("<system-reminder>[^<]*</system-reminder>"; "") |
          gsub("<local-command-caveat>[^<]*</local-command-caveat>"; "") |
          gsub("\\n\\n+"; "\n") |
          if (. | ltrimstr(" \n\t") | length) > 0 then
            "[USER] " + .
          else empty end
        else empty end
      elif .type == "assistant" then
        .message.content[]? |
        if .type == "text" then
          "[ASSISTANT] " + .text
        elif .type == "tool_use" then
          "[TOOL: " + .name + "] " + (.input.description // .input.command // .input.pattern // .input.prompt // .name // "")
        else empty end
      else empty end
    ' "$TRANSCRIPT_PATH" 2>/dev/null | while IFS= read -r line; do
      echo "$line"
      echo ""
    done

    echo "---"
  } > "$OUTPUT_FILE"
else
  echo "export-chat: neither node nor jq available, skipping" >&2
  exit 0
fi

# Only keep the file if it has content beyond just a header
if [[ ! -s "$OUTPUT_FILE" ]]; then
  rm -f "$OUTPUT_FILE"
fi

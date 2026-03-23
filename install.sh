#!/usr/bin/env bash
set -euo pipefail

HOOKS_DIR="$HOME/.claude/hooks"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Installing Claude chat export hooks..."

# Copy hook scripts
mkdir -p "$HOOKS_DIR"
cp "$SCRIPT_DIR/hooks/export-chat.sh" "$HOOKS_DIR/export-chat.sh"
cp "$SCRIPT_DIR/hooks/export-chat.js" "$HOOKS_DIR/export-chat.js"
chmod +x "$HOOKS_DIR/export-chat.sh"

# Merge hooks into settings.json
SETTINGS_FILE="$HOME/.claude/settings.json"

if ! command -v node &>/dev/null; then
  echo ""
  echo "Node.js not found — cannot auto-update settings.json."
  echo "Manually add the following to $SETTINGS_FILE:"
  echo ""
  cat <<'MANUAL'
  "hooks": {
    "PreCompact": [{ "hooks": [{ "type": "command", "command": "~/.claude/hooks/export-chat.sh", "timeout": 30 }] }],
    "SessionEnd": [{ "hooks": [{ "type": "command", "command": "~/.claude/hooks/export-chat.sh", "timeout": 30 }] }]
  }
MANUAL
  exit 0
fi

node -e "
const fs = require('fs');
const path = '$SETTINGS_FILE';

let settings = {};
if (fs.existsSync(path)) {
  settings = JSON.parse(fs.readFileSync(path, 'utf8'));
}

const hookEntry = {
  hooks: [{ type: 'command', command: '~/.claude/hooks/export-chat.sh', timeout: 30 }]
};

if (!settings.hooks) settings.hooks = {};

const entriesToAdd = [
  { event: 'PreCompact', entry: hookEntry },
  { event: 'SessionEnd', entry: hookEntry },
  { event: 'SessionEnd', entry: { matcher: 'clear', hooks: [{ type: 'command', command: '~/.claude/hooks/export-chat.sh', timeout: 30 }] } },
];
let changed = false;

for (const { event, entry } of entriesToAdd) {
  if (!settings.hooks[event]) {
    settings.hooks[event] = [entry];
    changed = true;
  } else {
    const matcher = entry.matcher;
    const already = settings.hooks[event].some(e =>
      e.matcher === matcher &&
      e.hooks?.some(h => h.command?.includes('export-chat.sh'))
    );
    if (!already) {
      settings.hooks[event].push(entry);
      changed = true;
    }
  }
}

if (changed) {
  fs.writeFileSync(path, JSON.stringify(settings, null, 2) + '\n');
  console.log('Updated ' + path);
} else {
  console.log('Hooks already registered in ' + path);
}
"

echo ""
echo "Done! Chat exports will save to <project>/.claude/chat-exports/ on:"
echo "  - Context compaction (PreCompact)"
echo "  - Session end (SessionEnd)"

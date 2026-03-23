# Changelog

## 1.0.0 — 2026-03-23

Initial release.

- Exports conversations as terminal-style `.txt` files
- Fires on `PreCompact`, `SessionEnd`, and `/clear`
- Rich format via Node.js: bash output previews, edit diffs, write previews, collapsed reads/greps
- Fallback to `[USER]/[ASSISTANT]` format via `jq` if Node.js is unavailable
- `${CLAUDE_PLUGIN_ROOT}`-relative hook paths for portability
- Manual install script (`install.sh`) for non-plugin setups

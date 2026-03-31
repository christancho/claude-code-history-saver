# Chat Auto Exporter

A Claude Code plugin that automatically saves your conversations as readable text files before context compaction and when sessions end. Never lose a conversation again.

## How it works

Claude Code hooks fire automatically at three key moments:

- **PreCompact** — right before the context window gets compressed, saving the full conversation before details are lost
- **SessionEnd** — when you close a session, capturing everything from that run
- **SessionEnd (clear)** — when you run `/clear`, saving the conversation before it's wiped

Each export is saved as a `.txt` file inside the project's `.claude/chat-exports/` directory, so conversations stay with the project they belong to.

## Output format

Exports use a terminal-style format that mirrors the Claude Code CLI:

```
────────────────────────────────────────────────────────────────────────────────
 ▐▛███▜▌   Claude Code · my-project
▝▜█████▛▘  2026-03-20 14:00 · Branch: main
  ▘▘ ▝▝    Session: a8f2c3d1
────────────────────────────────────────────────────────────────────────────────

❯ How do I add authentication to this API?

⏺ You can add JWT-based authentication by installing jsonwebtoken and
  creating middleware that validates the token on each request.

⏺ Bash(Install jsonwebtoken)
  ⎿  added 1 package, audited 312 packages in 2s

⏺ Write(~/src/middleware/auth.ts)
  ⎿  Wrote 42 lines to ~/src/middleware/auth.ts
     import jwt from 'jsonwebtoken';
     import { Request, Response, NextFunction } from 'express';
     … +40 lines

⏺ Update(~/src/app.ts)
  ⎿  Added 2 lines, removed 1 line
     import { authMiddleware } from './middleware/auth';

────────────────────────────────────────────────────────────────────────────────
```

### What gets included

- User messages (cleaned of internal system tags), prefixed with `❯`
- Claude's text responses, prefixed with `⏺`
- Tool usage rendered as CLI-style summaries:
  - **Bash** — command description + first 8 lines of output
  - **Edit** — file path, lines added/removed, added content preview
  - **Write** — file path, line count, first 5 lines of content
  - **Read/Grep/Glob** — collapsed when consecutive (e.g., `Read 3 files`)
  - **Agent/Skill** — name and description

### What gets excluded

- Raw tool input/output JSON
- System messages and internal metadata
- Thinking blocks
- File history snapshots and progress events

## Installation

### As a Claude Code plugin (recommended)

Inside a Claude Code session run:

```
/plugin marketplace add christancho/chat-autoexporter
/plugin install chat-autoexporter@christancho
/reload-plugins
```

The hooks register automatically — no manual configuration needed.

### From a local clone

Clone the repo, then inside a Claude Code session run:

```
/plugin install /path/to/chat-autoexporter
```

### Manual install

```bash
git clone https://github.com/christancho/chat-autoexporter.git
cd chat-autoexporter
./install.sh
```

The install script copies the hooks to `~/.claude/hooks/` and merges the hook configuration into your existing `~/.claude/settings.json` without overwriting anything.

### Local testing

```bash
claude --plugin-dir /path/to/chat-autoexporter
```

## Where exports are saved

```
your-project/
└── .claude/
    └── chat-exports/
        ├── 2026-03-20-140000.txt
        ├── 2026-03-20-153022.txt
        └── 2026-03-21-091500.txt
```

Each file is timestamped (`YYYY-MM-DD-HHMMSS.txt`). If two exports happen in the same second (e.g., PreCompact + SessionEnd), the second gets a `-2` suffix.

## Requirements

- **Node.js** (primary) — produces the rich terminal-style format with diffs and output previews
- **jq** (fallback) — if Node isn't available, falls back to a simpler `[USER]/[ASSISTANT]` format
- If neither is available, the hook exits silently without blocking Claude Code

## Error handling

All errors are non-fatal. The hook will never block Claude Code operation:

- Missing or empty transcript: exits silently
- Malformed JSONL lines: skipped
- Missing Node and jq: exits with a stderr warning

## Author

[Christian Mendieta](https://christianmendieta.ca)

## License

MIT

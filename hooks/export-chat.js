#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const [,, transcriptPath, sessionId, projectName, branch] = process.argv;

if (!transcriptPath || !fs.existsSync(transcriptPath)) {
  process.exit(0);
}

const raw = fs.readFileSync(transcriptPath, 'utf8');
const lines = raw.split('\n').filter(l => l.trim());

const entries = [];
for (const line of lines) {
  try {
    const obj = JSON.parse(line);
    if (obj.type === 'user' || obj.type === 'assistant') {
      entries.push(obj);
    }
  } catch {
    // Skip malformed lines
  }
}

if (entries.length === 0) {
  process.exit(0);
}

// Format timestamp to HH:MM
function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// Format date for header
function formatDate(ts) {
  if (!ts) return new Date().toISOString().slice(0, 16).replace('T', ' ');
  const d = new Date(ts);
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 16).replace('T', ' ');
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

// Strip system tags from user messages
function cleanUserMessage(msg) {
  if (typeof msg !== 'string') return '';
  return msg
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, '')
    .replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, '')
    .replace(/<command-name>[\s\S]*?<\/command-name>/g, '')
    .replace(/<command-message>[\s\S]*?<\/command-message>/g, '')
    .replace(/<command-args>[\s\S]*?<\/command-args>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const MAX_WIDTH = 80;

// Word-wrap text to MAX_WIDTH, preserving indent prefix on continuation lines
function wordWrap(text, indent = '') {
  const lines = text.split('\n');
  const wrapped = [];
  for (const line of lines) {
    if (line.length <= MAX_WIDTH) {
      wrapped.push(line);
      continue;
    }
    // Detect leading whitespace + bullet prefix to preserve on first line
    const match = line.match(/^(\s*(?:⏺|❯|⎿)\s*)/);
    const firstPrefix = match ? match[1] : '';
    const contPrefix = indent || ' '.repeat(firstPrefix.length);
    let remaining = line;
    let isFirst = true;
    while (remaining.length > MAX_WIDTH) {
      const limit = MAX_WIDTH;
      let breakAt = remaining.lastIndexOf(' ', limit);
      if (breakAt <= (isFirst ? firstPrefix.length : contPrefix.length)) {
        breakAt = remaining.indexOf(' ', limit);
      }
      if (breakAt === -1) {
        // No space to break on — hard break
        wrapped.push(remaining.slice(0, MAX_WIDTH));
        remaining = (isFirst ? contPrefix : contPrefix) + remaining.slice(MAX_WIDTH);
        isFirst = false;
        continue;
      }
      wrapped.push(remaining.slice(0, breakAt));
      remaining = (isFirst ? contPrefix : contPrefix) + remaining.slice(breakAt + 1);
      isFirst = false;
    }
    wrapped.push(remaining);
  }
  return wrapped.join('\n');
}

// Shorten file path for display
function shortPath(filePath) {
  if (!filePath) return '';
  return filePath.replace(/^\/Users\/[^/]+/, '~');
}

// Format Edit tool as CLI-style diff
function formatEdit(input) {
  const fp = shortPath(input.file_path);
  const lines = [];
  lines.push(`⏺ Update(${fp})`);
  if (input.old_string && input.new_string) {
    const oldLines = input.old_string.split('\n');
    const newLines = input.new_string.split('\n');
    const oldSet = new Set(oldLines);
    const newSet = new Set(newLines);
    const added = newLines.filter(l => !oldSet.has(l));
    const removed = oldLines.filter(l => !newSet.has(l));
    if (added.length > 0 || removed.length > 0) {
      const parts = [];
      if (added.length > 0) parts.push(`Added ${added.length} line${added.length > 1 ? 's' : ''}`);
      if (removed.length > 0) parts.push(`removed ${removed.length} line${removed.length > 1 ? 's' : ''}`);
      lines.push(`  ⎿  ${parts.join(', ')}`);
      let shown = 0;
      for (const l of newLines) {
        if (shown >= 12) { lines.push('     …'); break; }
        if (!oldSet.has(l)) {
          lines.push(wordWrap(`     ${l}`, '     '));
        }
        shown++;
      }
    }
  }
  return lines.join('\n');
}

// Format Read tool (single — collapsed version handled in main loop)
function formatRead(input) {
  return `  Read 1 file`;
}

// Format Bash tool
function formatBash(input) {
  const cmd = input.command || '';
  const desc = input.description || '';
  const cmdPreview = cmd.length > 100 ? cmd.slice(0, 100) + '…' : cmd;
  if (desc) {
    return `⏺ Bash(${desc})`;
  }
  return `⏺ Bash(${cmdPreview})`;
}

// Format Write tool
function formatWrite(input) {
  const fp = shortPath(input.file_path);
  const contentLines = (input.content || '').split('\n');
  const lines = [`⏺ Write(${fp})`];
  if (contentLines.length > 0) {
    lines.push(wordWrap(`  ⎿  Wrote ${contentLines.length} lines to ${fp}`, '     '));
    // Show first 5 lines as preview
    const preview = contentLines.slice(0, 5);
    for (const l of preview) {
      lines.push(wordWrap(`     ${l}`, '     '));
    }
    if (contentLines.length > 5) {
      lines.push(`     … +${contentLines.length - 5} lines`);
    }
  }
  return lines.join('\n');
}

// Format tool use block — CLI style
function formatToolUse(block) {
  const name = block.name || 'Unknown';
  const input = block.input || {};

  if (name === 'Edit') return formatEdit(input);
  if (name === 'Read') return formatRead(input);
  if (name === 'Bash') return formatBash(input);
  if (name === 'Write') return formatWrite(input);
  if (name === 'Glob') return `  Searched for 1 pattern`;
  if (name === 'Grep') return `  Searched for 1 pattern`;
  if (name === 'Agent') return `⏺ Agent(${input.description || ''})`;
  if (name === 'Skill') return `  Skill(${input.skill || ''})`;

  // Generic fallback — secondary tools (no ⏺)
  const SECONDARY = new Set(['TodoRead', 'TodoWrite', 'ListDir', 'ToolSearch']);
  const desc = input.description || input.command || input.prompt || input.pattern || input.file_path || '';
  const summary = typeof desc === 'string' ? desc.split('\n')[0].slice(0, 100) : '';
  if (SECONDARY.has(name)) {
    return summary ? `  ${name}(${summary})` : `  ${name}`;
  }
  return summary ? `⏺ ${name}(${summary})` : `⏺ ${name}`;
}

// Collect tool results keyed by tool_use_id
const toolResults = new Map();
for (const entry of entries) {
  if (entry.type !== 'user') continue;
  const msg = entry.message;
  if (!msg) continue;
  const content = Array.isArray(msg.content) ? msg.content : (typeof msg.content === 'string' ? [] : []);
  for (const block of content) {
    if (block.type === 'tool_result' && block.tool_use_id) {
      const text = typeof block.content === 'string' ? block.content : '';
      toolResults.set(block.tool_use_id, text);
    }
  }
}

// Count consecutive reads/greps for collapsing
function countConsecutiveTools(content, startIdx, toolName) {
  let count = 0;
  for (let i = startIdx; i < content.length; i++) {
    if (content[i].type === 'tool_use' && content[i].name === toolName) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

// Build output — CLI style
const output = [];
const firstTs = entries[0]?.timestamp;
const shortSession = sessionId ? sessionId.slice(0, 8) : 'unknown';
const HR = '─'.repeat(80);

output.push(`${HR}`);
output.push(` ▐▛███▜▌   Claude Code · ${projectName}`);
output.push(`▝▜█████▛▘  ${formatDate(firstTs)} · Branch: ${branch}`);
output.push(`  ▘▘ ▝▝    Session: ${shortSession}`);
output.push(`${HR}`);
output.push('');

let lastRole = null;
let lastAssistantTs = null;

for (const entry of entries) {
  const time = formatTime(entry.timestamp);

  if (entry.type === 'user') {
    const msg = entry.message;
    let rawText = '';
    if (typeof msg === 'string') {
      rawText = msg;
    } else if (msg && typeof msg.content === 'string') {
      rawText = msg.content;
    } else if (msg && Array.isArray(msg.content)) {
      rawText = msg.content
        .filter(b => typeof b === 'string' || (b.type === 'text' && b.text))
        .map(b => typeof b === 'string' ? b : b.text)
        .join('\n');
    }
    const text = cleanUserMessage(rawText);
    if (!text) continue;

    // Separator between exchanges
    if (lastRole === 'assistant') {
      output.push('');
    }

    // User prompt with ❯
    const textLines = text.split('\n');
    output.push(wordWrap(`❯ ${textLines[0]}`, '  '));
    for (let i = 1; i < textLines.length; i++) {
      output.push(wordWrap(`  ${textLines[i]}`, '  '));
    }
    output.push('');

    lastRole = 'user';
  }

  if (entry.type === 'assistant') {
    const msg = entry.message;
    if (!msg) continue;

    if (typeof msg === 'string') {
      output.push(wordWrap(`⏺ ${msg}`, '  '));
      output.push('');
      lastRole = 'assistant';
      lastAssistantTs = entry.timestamp;
      continue;
    }

    const content = msg.content;
    if (!Array.isArray(content)) continue;

    const parts = [];
    const skipIndices = new Set();

    for (let i = 0; i < content.length; i++) {
      if (skipIndices.has(i)) continue;
      const block = content[i];

      if (block.type === 'text' && block.text) {
        parts.push(wordWrap(`⏺ ${block.text}`, '  '));
      } else if (block.type === 'tool_use') {
        // Collapse consecutive reads
        if (block.name === 'Read') {
          const readCount = countConsecutiveTools(content, i, 'Read');
          if (readCount > 1) {
            parts.push(`  Read ${readCount} files`);
            for (let j = 1; j < readCount; j++) {
              skipIndices.add(i + j);
            }
            continue;
          }
        }

        // Collapse consecutive greps
        if (block.name === 'Grep') {
          const grepCount = countConsecutiveTools(content, i, 'Grep');
          if (grepCount > 1) {
            parts.push(`  Searched for ${grepCount} patterns`);
            for (let j = 1; j < grepCount; j++) {
              skipIndices.add(i + j);
            }
            continue;
          }
        }

        // Collapse consecutive globs
        if (block.name === 'Glob') {
          const globCount = countConsecutiveTools(content, i, 'Glob');
          if (globCount > 1) {
            parts.push(`  Searched for ${globCount} patterns`);
            for (let j = 1; j < globCount; j++) {
              skipIndices.add(i + j);
            }
            continue;
          }
        }

        const toolLine = formatToolUse(block);
        parts.push(toolLine);

        // Include Bash output preview if available
        if (block.name === 'Bash' && block.id) {
          const result = toolResults.get(block.id);
          if (result) {
            const resultLines = result.split('\n').filter(l => l.trim());
            if (resultLines.length > 0) {
              const preview = resultLines.slice(0, 8)
                .map(l => wordWrap(`     ${l}`, '     '));
              parts.push('  ⎿  ' + preview[0].replace(/^\s+/, ''));
              for (let p = 1; p < preview.length; p++) {
                parts.push(preview[p]);
              }
              if (resultLines.length > 8) {
                parts.push(`     … +${resultLines.length - 8} lines`);
              }
            }
          }
        }
      }
      // Skip thinking blocks, tool_result, etc.
    }

    if (parts.length === 0) continue;

    output.push(parts.join('\n\n'));
    output.push('');

    lastRole = 'assistant';
    lastAssistantTs = entry.timestamp;
  }
}

output.push(HR);
output.push('');

process.stdout.write(output.join('\n') + '\n');

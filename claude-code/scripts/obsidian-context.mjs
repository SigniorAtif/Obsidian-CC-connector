#!/usr/bin/env node
// Claude Code hook for the Claude Code Connector Obsidian plugin.
//
// The Obsidian plugin keeps ~/.claude/obsidian-context/state.json up to date
// (its shape is in src/state.ts). On UserPromptSubmit this script turns that
// file into a short <obsidian-context> block that Claude sees next to the
// prompt. It sends the block only when:
//   - Obsidian is still running (the pid in the file is alive),
//   - the session runs inside the git project that holds the vault (or the
//     vault itself), unless the plugin's "share with every session" is on,
//   - the block changed since the last prompt of the same session.
// On SessionStart (new, resumed, cleared or compacted) it forgets what it
// sent, so the next prompt carries the block again.
//
// It must never get in the way of a prompt: any problem means "add nothing".

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function stateDir(env = process.env) {
  return env.OBSIDIAN_CONTEXT_DIR || path.join(os.homedir(), '.claude', 'obsidian-context');
}

/** The hook's stdout for one event: a JSON string, or '' to add nothing. */
export function handle(input, { dir = stateDir(), now = Date.now() } = {}) {
  const session = String(input.session_id || 'unknown').replace(/[^\w-]/g, '_');
  const sentDir = path.join(dir, 'sent');
  const sentFile = path.join(sentDir, session);

  if (input.hook_event_name === 'SessionStart') {
    fs.rmSync(sentFile, { force: true });
    return '';
  }

  const state = readJson(path.join(dir, 'state.json'));
  if (!state?.active || typeof state.vault !== 'string') return '';
  if (!isRunning(state.pid)) return ''; // Obsidian quit or crashed
  const cwd = input.cwd || process.cwd();
  if (!state.shareEverywhere && !isInside(cwd, projectRoot(state.vault))) return '';

  const body = render(state, cwd, now);
  const hash = crypto.createHash('sha1').update(body).digest('hex');
  if (readText(sentFile) === hash) return ''; // Claude already has exactly this
  fs.mkdirSync(sentDir, { recursive: true });
  fs.writeFileSync(sentFile, hash);
  pruneSent(sentDir, now);

  const intro =
    `What the user has open in Obsidian (updated ${ago(state.updatedAt, now)}). ` +
    'Use it to work out what "this", "here" or "this note" means in their message; ' +
    'ignore it when the message is about something else. Read the note for its full text.';
  const additionalContext = `<obsidian-context>\n${intro}\n${body}\n</obsidian-context>`;
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext } });
}

/** The lines Claude sees. Stable for the same reading position, so it can be hashed. */
export function render(state, cwd, now = Date.now()) {
  const a = state.active;
  const vault = isInside(state.vault, cwd) ? path.relative(cwd, state.vault) || '.' : state.vault;
  const lines = [`Vault: ${vault} (note paths below are inside it)`];

  lines.push(a.mode ? `Reading: ${a.path} (${a.mode} view)` : `Reading: ${a.path}`);
  if (a.section?.length) lines.push(`Section: ${a.section.join(' > ')}`);

  if (a.selection?.text) {
    const s = a.selection;
    let where = '';
    if (s.fromLine) where = s.fromLine === s.toLine ? ` (line ${s.fromLine})` : ` (lines ${s.fromLine}-${s.toLine})`;
    lines.push(`Selected text${where}${s.truncated ? ', cut short' : ''}:`, '<selection>', s.text, '</selection>');
  }

  const tabs = (state.openTabs ?? []).filter((p) => p !== a.path);
  if (tabs.length) lines.push(`Other open tabs: ${tabs.join(', ')}`);

  const recent = (state.recent ?? []).filter((r) => r.path !== a.path).slice(0, 5);
  if (recent.length) {
    lines.push(`Recently opened: ${recent.map((r) => `${r.path} (${clock(r.at, now)})`).join(', ')}`);
  }

  return lines.join('\n');
}

/** The nearest folder at or above the vault that has a .git entry, else the vault. */
export function projectRoot(vault) {
  for (let dir = vault; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    if (path.dirname(dir) === dir) return vault;
  }
}

export function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (rel.split(path.sep)[0] !== '..' && !path.isAbsolute(rel));
}

/** "14:05" today, "2026-10-15 14:05" on other days, in local time. */
export function clock(iso, now = Date.now()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '?';
  const pad = (n) => String(n).padStart(2, '0');
  const day = (x) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return day(d) === day(new Date(now)) ? time : `${day(d)} ${time}`;
}

export function ago(iso, now = Date.now()) {
  const minutes = Math.round((now - Date.parse(iso)) / 60000);
  if (!Number.isFinite(minutes)) return 'at an unknown time';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h ago`;
  return `${Math.round(minutes / (24 * 60))} days ago`;
}

function isRunning(pid) {
  if (!Number.isInteger(pid)) return false;
  try {
    process.kill(pid, 0); // signal 0 checks the process exists without touching it
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function pruneSent(sentDir, now) {
  for (const name of fs.readdirSync(sentDir)) {
    const file = path.join(sentDir, name);
    if (now - fs.statSync(file).mtimeMs > WEEK_MS) fs.rmSync(file, { force: true });
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function invokedDirectly() {
  try {
    const run = fs.realpathSync(process.argv[1]);
    const self = fs.realpathSync(fileURLToPath(import.meta.url));
    // Windows paths can differ in the case of the drive letter.
    return process.platform === 'win32' ? run.toLowerCase() === self.toLowerCase() : run === self;
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  try {
    process.stdout.write(handle(JSON.parse(fs.readFileSync(0, 'utf8'))));
  } catch (err) {
    process.stderr.write(`obsidian-context hook: ${err.message}\n`);
  }
  process.exitCode = 0;
}

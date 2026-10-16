// Tests for the Claude Code hook. The end-to-end cases run the script the way
// Claude Code does: JSON on stdin, the answer on stdout.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { clock, isInside, projectRoot, render } from '../claude-code/scripts/obsidian-context.mjs';

const HOOK = fileURLToPath(new URL('../claude-code/scripts/obsidian-context.mjs', import.meta.url));
const NOT_A_PID = 2 ** 31 - 2;

const sampleNote = {
  path: 'guides/Cooking basics.md',
  type: 'markdown',
  mode: 'reading',
  line: 12,
  section: ['Cooking basics', 'Knife skills'],
  selection: { text: 'Keep the tip of the knife on the board.', fromLine: 14, toLine: 15, truncated: false },
};

/** A project with a .git folder, a vault inside it and a state file. */
function setup({ pid = process.pid, shareEverywhere = false, active = sampleNote } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-connector-'));
  const project = path.join(root, 'project');
  const vault = path.join(project, 'vault');
  const elsewhere = path.join(root, 'elsewhere');
  const dir = path.join(root, 'state');
  for (const d of [path.join(project, '.git'), vault, elsewhere, dir]) fs.mkdirSync(d, { recursive: true });
  const state = {
    version: 1,
    pid,
    vault,
    shareEverywhere,
    updatedAt: new Date().toISOString(),
    active,
    openTabs: ['Index.md', active.path],
    recent: [
      { path: active.path, at: new Date().toISOString() },
      { path: 'guides/Bread.md', at: '2026-01-05T09:30:00Z' },
    ],
  };
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(state));
  return { project, vault, elsewhere, dir, state };
}

/** Runs the hook and returns the context it added ('' when none). */
function runHook(dir, input) {
  const result = spawnSync(process.execPath, [HOOK], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    env: { ...process.env, OBSIDIAN_CONTEXT_DIR: dir },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout ? JSON.parse(result.stdout).hookSpecificOutput.additionalContext : '';
}

const prompt = (cwd, session = 's1') => ({ session_id: session, hook_event_name: 'UserPromptSubmit', cwd });

test('adds the note, section and selection for a session inside the project', () => {
  const { project, dir } = setup();
  const context = runHook(dir, prompt(project));
  assert.match(context, /^<obsidian-context>\n/);
  assert.match(context, /Vault: vault /);
  assert.match(context, /Reading: guides\/Cooking basics\.md \(reading view\)/);
  assert.match(context, /Section: Cooking basics > Knife skills/);
  assert.match(context, /Selected text \(lines 14-15\):\n<selection>\nKeep the tip of the knife on the board\.\n<\/selection>/);
  assert.match(context, /Other open tabs: Index\.md\n/);
  assert.match(context, /Recently opened: guides\/Bread\.md \(2026-01-05 \d\d:\d\d\)/);
});

test('adds the same context only once per session', () => {
  const { project, dir } = setup();
  assert.notEqual(runHook(dir, prompt(project)), '');
  assert.equal(runHook(dir, prompt(project)), '');
  assert.notEqual(runHook(dir, prompt(project, 's2')), '', 'another session gets its own copy');
});

test('sends it again after the session starts over', () => {
  const { project, dir } = setup();
  runHook(dir, prompt(project));
  runHook(dir, { session_id: 's1', hook_event_name: 'SessionStart', cwd: project });
  assert.notEqual(runHook(dir, prompt(project)), '');
});

test('sends it again when the reading position changes', () => {
  const { project, dir, state } = setup();
  runHook(dir, prompt(project));
  state.active = { ...state.active, section: ['Cooking basics', 'Heat'], selection: undefined };
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(state));
  assert.match(runHook(dir, prompt(project)), /Section: Cooking basics > Heat/);
});

test('works from inside the vault and from subfolders of the project', () => {
  const { project, vault, dir } = setup();
  assert.notEqual(runHook(dir, prompt(vault, 'a')), '');
  fs.mkdirSync(path.join(project, 'src'));
  assert.notEqual(runHook(dir, prompt(path.join(project, 'src'), 'b')), '');
});

test('adds nothing for a session outside the project', () => {
  const { elsewhere, dir } = setup();
  assert.equal(runHook(dir, prompt(elsewhere)), '');
});

test('adds context everywhere when the plugin says to share with every session', () => {
  const { elsewhere, vault, dir } = setup({ shareEverywhere: true });
  const context = runHook(dir, prompt(elsewhere));
  assert.match(context, /Reading: guides\/Cooking basics\.md/);
  assert.ok(context.includes(`Vault: ${vault} `), 'shows the absolute vault path');
});

test('adds nothing when Obsidian is not running', () => {
  const { project, dir } = setup({ pid: NOT_A_PID });
  assert.equal(runHook(dir, prompt(project)), '');
});

test('adds nothing when there is no state file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-connector-'));
  assert.equal(runHook(dir, prompt(dir)), '');
});

test('never fails a prompt, even on input it cannot read', () => {
  const { dir } = setup();
  assert.equal(runHook(dir, 'not json'), '');
  fs.writeFileSync(path.join(dir, 'state.json'), '{ half a file');
  assert.equal(runHook(dir, prompt(dir)), '');
});

test('render leaves out the parts it has nothing for', () => {
  const vault = path.join(os.tmpdir(), 'v');
  const text = render({ vault, active: { path: 'a.md', type: 'pdf' }, openTabs: ['a.md'], recent: [] }, vault);
  assert.equal(text, 'Vault: . (note paths below are inside it)\nReading: a.md');
});

test('render notes a selection that was cut short or has no line numbers', () => {
  const vault = path.join(os.tmpdir(), 'v');
  const active = { path: 'a.pdf', type: 'pdf', selection: { text: 'x', fromLine: null, toLine: null, truncated: true } };
  assert.match(render({ vault, active }, vault), /Selected text, cut short:/);
});

test('isInside', () => {
  const base = path.join(os.tmpdir(), 'a');
  assert.ok(isInside(base, base));
  assert.ok(isInside(path.join(base, 'b', 'c'), base));
  assert.ok(!isInside(path.join(os.tmpdir(), 'ab'), base));
  assert.ok(!isInside(path.dirname(base), base));
});

test('projectRoot falls back to the vault when no folder above it is a git project', () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-connector-vault-'));
  const found = projectRoot(vault);
  assert.ok(found === vault || fs.existsSync(path.join(found, '.git')));
});

test('clock shows the date only for other days', () => {
  const now = new Date(2026, 9, 16, 21, 0).getTime();
  assert.equal(clock(new Date(2026, 9, 16, 9, 5).toISOString(), now), '09:05');
  assert.equal(clock(new Date(2026, 9, 15, 23, 59).toISOString(), now), '2026-10-15 23:59');
  assert.equal(clock('nonsense', now), '?');
});

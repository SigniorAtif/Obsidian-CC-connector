# Contributing

Thanks for helping. Bug reports, fixes and ideas are all welcome. For anything
bigger than a small fix, open an issue first so we can agree on the approach
before you spend time on it.

## How the code is laid out

```text
src/                     the Obsidian plugin (TypeScript, bundled to main.js)
  main.ts                watches the workspace, writes the state file
  settings.ts            the settings tab
  state.ts               the state file's shape, shared contract with the hook
claude-code/             the Claude Code plugin
  scripts/obsidian-context.mjs   the hook: reads the state file, adds context
  hooks/hooks.json       registers the hook for UserPromptSubmit and SessionStart
  .claude-plugin/plugin.json
.claude-plugin/marketplace.json  lets `/plugin marketplace add` find claude-code/
test/hook.test.mjs       tests for the hook (Node's built-in test runner)
manifest.json            the Obsidian plugin manifest
versions.json            plugin version → minimum Obsidian version
```

The two halves only share `~/.claude/obsidian-context/state.json`. Its shape
is defined in `src/state.ts`. If you change it in a way the hook cannot read,
bump `STATE_VERSION` and update the hook in the same pull request.

## Setup

You need Node.js 20 or newer and [pnpm](https://pnpm.io).

```bash
git clone https://github.com/SigniorAtif/Obsidian-CC-connector.git
cd Obsidian-CC-connector
pnpm install
```

## Working on the Obsidian plugin

1. Use a test vault, not your real one.
2. Link the plugin into it:

   ```bash
   mkdir -p <vault>/.obsidian/plugins/claude-code-connector
   ln -s "$PWD/main.js" "$PWD/manifest.json" <vault>/.obsidian/plugins/claude-code-connector/
   ```

3. Run `pnpm dev`. It rebuilds `main.js` on every save.
4. In Obsidian, run **Reload app without saving** from the command palette to
   load the new build, or install the
   [Hot Reload](https://github.com/pjeby/hot-reload) plugin to do it for you.
5. Watch the state file while you click around:

   ```bash
   watch -n 0.5 cat ~/.claude/obsidian-context/state.json
   ```

## Working on the Claude Code hook

Run Claude Code with the plugin loaded straight from your checkout:

```bash
claude --plugin-dir ./claude-code
```

Or run the hook by hand with a prompt event on stdin:

```bash
echo '{"session_id":"dev","hook_event_name":"UserPromptSubmit","cwd":"'"$PWD"'"}' \
  | node claude-code/scripts/obsidian-context.mjs
```

The hook must never block or break a prompt: on any problem it adds nothing
and exits 0. Keep it that way, and keep it free of npm dependencies, since it
runs from the user's plugin folder with no install step.

## Checks

```bash
pnpm check    # typecheck, lint, test and build: what CI runs
```

Linting uses [eslint-plugin-obsidianmd](https://github.com/obsidianmd/eslint-plugin),
the rules Obsidian's review bot applies to community plugins.

The hook has automated tests. The Obsidian plugin does not, because it needs a
running Obsidian, so before a pull request that touches `src/`, check by hand
in a test vault that:

- [ ] switching notes and tabs updates `active.path` and `openTabs`
- [ ] selecting text in editing view gives the right `fromLine` and `toLine`
- [ ] selecting text in reading view does too
- [ ] scrolling without a selection updates `section`
- [ ] the status bar item, the command and the settings toggle pause and resume
- [ ] disabling the plugin deletes the state file

## Commits and pull requests

- Branch from `main`: `feat/…`, `fix/…`, `docs/…`, `chore/…`.
- Write commit messages as
  [Conventional Commits](https://www.conventionalcommits.org/):
  `fix(hook): ignore a state file from a crashed Obsidian`.
- Keep each commit to one change, and make sure `pnpm check` passes.
- Add a line to `CHANGELOG.md` under **Unreleased** for anything a user
  would notice.

## Releasing

Maintainers only.

1. Move the **Unreleased** notes in `CHANGELOG.md` under the new version.
2. Run `npm version patch` (or `minor` / `major`). It bumps `package.json`,
   both plugin manifests and `versions.json`, commits, and tags the commit
   with the bare version (`0.2.0`, no `v`, as Obsidian requires).
3. Push the commit and the tag: `git push --follow-tags`.
4. The **Release** workflow builds the plugin and opens a draft release with
   `main.js` and `manifest.json` attached. Check it, then publish it.

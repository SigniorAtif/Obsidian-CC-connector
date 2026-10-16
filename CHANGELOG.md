# Changelog

All notable changes to this project are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Obsidian's settings search now finds both settings, by name or by words
  like "pause" and "privacy" (Obsidian 1.13 and newer). Older Obsidian
  versions keep the same settings tab as before.

## [0.1.0] - 2026-10-16

### Added

- Obsidian plugin that shares the note you are reading, the headings above
  where you are, your selection with its source lines, your open tabs and
  recently opened notes through `~/.claude/obsidian-context/state.json`.
- Claude Code plugin whose hook adds that to your prompts, only while
  Obsidian is running, only for sessions in the vault's project, and only
  when it changed.
- A status bar item, a command and a settings tab to pause sharing, and a
  setting to share with every Claude Code session.

[Unreleased]: https://github.com/SigniorAtif/Obsidian-CC-connector/compare/0.1.0...HEAD
[0.1.0]: https://github.com/SigniorAtif/Obsidian-CC-connector/releases/tag/0.1.0

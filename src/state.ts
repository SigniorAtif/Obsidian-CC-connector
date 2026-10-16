// The file the Obsidian plugin writes and the Claude Code hook
// (claude-code/scripts/obsidian-context.mjs) reads. Both sides must agree on
// it: bump STATE_VERSION for any change the hook cannot read.

export const STATE_VERSION = 1;

export interface ReadingState {
  version: number;
  /** Obsidian's process id, so the hook can tell a crashed Obsidian from a running one. */
  pid: number;
  /** Absolute path of the vault folder, or null for a vault not on disk. */
  vault: string | null;
  active: ActiveNote | null;
  /** Vault-relative paths of the open tabs in the main area. */
  openTabs: string[];
  /** Notes opened most recently, newest first. */
  recent: RecentNote[];
  updatedAt?: string;
}

export interface ActiveNote {
  /** Vault-relative path. */
  path: string;
  /** Obsidian view type: "markdown", "pdf", "canvas"... */
  type: string;
  mode?: 'reading' | 'editing';
  /** 1-based line: the start of the selection, else the first line on screen. */
  line?: number | null;
  /** Headings above that line, outermost first. */
  section?: string[];
  selection?: SelectedText;
}

export interface SelectedText {
  text: string;
  /** 1-based source lines; null when they cannot be worked out (PDFs, canvases). */
  fromLine: number | null;
  toLine: number | null;
  truncated: boolean;
}

export interface RecentNote {
  path: string;
  /** ISO time the note was last opened. */
  at: string;
}

/** What the plugin keeps in its data.json. */
export interface PluginData {
  recent: RecentNote[];
  paused: boolean;
}

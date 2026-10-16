// Claude Code Connector: tells Claude Code which note you are reading.
//
// Whenever you switch notes, scroll or select text, the plugin rewrites one
// small JSON file, ~/.claude/obsidian-context/state.json (see ./state.ts). The
// Claude Code hook in claude-code/ reads it each time you send a prompt and
// hands the note, section and selection to Claude.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { EditorView } from '@codemirror/view';
import {
  type Debouncer,
  debounce,
  FileSystemAdapter,
  FileView,
  MarkdownView,
  Plugin,
  type TFile,
} from 'obsidian';
import {
  type ActiveNote,
  type PluginData,
  type ReadingState,
  type SelectedText,
  STATE_VERSION,
} from './state';

const STATE_DIR =
  process.env.OBSIDIAN_CONTEXT_DIR || path.join(os.homedir(), '.claude', 'obsidian-context');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const MAX_SELECTION_CHARS = 4000;
const MAX_RECENT_KEPT = 20;
const MAX_RECENT_SHARED = 10;
const MAX_TABS = 10;

/** Reading view's rendered blocks. Obsidian internals, not in the public API. */
interface RenderedSection {
  el: HTMLElement;
  start: { line: number };
  end: { line: number };
}

export default class ClaudeCodeConnector extends Plugin {
  data: PluginData = { recent: [], paused: false };
  private statusEl!: HTMLElement;
  private lastWritten = '';
  private scheduleWrite!: Debouncer<[], void>;
  private scheduleSave!: Debouncer<[], void>;

  override async onload() {
    const saved = (await this.loadData()) as Partial<PluginData> | null;
    this.data = {
      recent: Array.isArray(saved?.recent) ? saved.recent : [],
      paused: saved?.paused === true,
    };
    this.scheduleWrite = debounce(() => this.writeState(), 300, true);
    this.scheduleSave = debounce(() => void this.save(), 2000, true);

    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass('mod-clickable');
    this.statusEl.setAttr('aria-label', 'Click to pause or resume sharing with Claude Code');
    this.registerDomEvent(this.statusEl, 'click', () => this.setPaused(!this.data.paused));
    this.showStatus();

    this.addCommand({
      id: 'toggle-sharing',
      name: 'Pause or resume sharing',
      callback: () => this.setPaused(!this.data.paused),
    });

    // The editor reports every selection change, including keyboard ones the
    // page never sees as a selection event.
    this.registerEditorExtension(
      EditorView.updateListener.of((update) => {
        if (update.selectionSet) this.scheduleWrite();
      }),
    );

    this.app.workspace.onLayoutReady(() => {
      const { workspace, vault } = this.app;
      this.registerEvent(
        workspace.on('file-open', (file) => {
          if (file) this.remember(file.path);
          this.scheduleWrite();
        }),
      );
      this.registerEvent(workspace.on('active-leaf-change', () => this.scheduleWrite()));
      this.registerEvent(workspace.on('layout-change', () => this.scheduleWrite()));
      this.registerEvent(workspace.on('window-open', (_popout, win) => this.watchWindow(win)));
      this.registerEvent(vault.on('rename', (file, oldPath) => this.renamed(oldPath, file.path)));
      this.registerEvent(vault.on('delete', (file) => this.forget(file.path)));
      this.watchWindow(window);

      const file = workspace.getActiveFile();
      if (file) this.remember(file.path);
      this.writeState();
    });

    // Obsidian does not always unload plugins when the app quits, so clear the
    // file when the window closes too. The hook also checks the pid.
    this.registerDomEvent(window, 'beforeunload', () => this.clearState());
  }

  override onunload() {
    this.clearState();
  }

  setPaused(paused: boolean) {
    this.data.paused = paused;
    this.showStatus();
    void this.save();
    if (paused) this.clearState();
    else this.writeState();
  }

  private save() {
    return this.saveData(this.data);
  }

  private showStatus() {
    this.statusEl.setText(this.data.paused ? 'Claude: paused' : 'Claude: sharing');
  }

  private watchWindow(win: Window) {
    // Selecting in reading view and scrolling have no Obsidian event, so
    // listen on the page.
    this.registerDomEvent(win.document, 'selectionchange', () => this.scheduleWrite());
    this.registerDomEvent(win.document, 'scroll', () => this.scheduleWrite(), {
      capture: true,
      passive: true,
    });
  }

  // Reading history, newest first. One entry per note: reopening moves it up.
  private remember(notePath: string) {
    const at = new Date().toISOString();
    const others = this.data.recent.filter((r) => r.path !== notePath);
    this.data.recent = [{ path: notePath, at }, ...others].slice(0, MAX_RECENT_KEPT);
    this.scheduleSave();
  }

  private renamed(oldPath: string, newPath: string) {
    for (const r of this.data.recent) {
      if (r.path === oldPath) r.path = newPath;
      else if (r.path.startsWith(`${oldPath}/`)) r.path = newPath + r.path.slice(oldPath.length);
    }
    this.scheduleSave();
    this.scheduleWrite();
  }

  private forget(notePath: string) {
    this.data.recent = this.data.recent.filter((r) => r.path !== notePath);
    this.scheduleSave();
    this.scheduleWrite();
  }

  private writeState() {
    if (this.data.paused) return;
    try {
      const state = this.snapshot();
      const json = JSON.stringify(state);
      if (json === this.lastWritten) return;
      this.lastWritten = json;
      state.updatedAt = new Date().toISOString();
      fs.mkdirSync(STATE_DIR, { recursive: true });
      // Write a temp file and rename it, so the hook never reads half a file.
      const tmp = `${STATE_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
      fs.renameSync(tmp, STATE_FILE);
    } catch (err) {
      console.error('Claude Code Connector: could not write the state file', err);
    }
  }

  private clearState() {
    this.scheduleWrite.cancel();
    this.lastWritten = '';
    try {
      fs.rmSync(STATE_FILE, { force: true });
    } catch (err) {
      console.error('Claude Code Connector: could not remove the state file', err);
    }
  }

  private snapshot(): ReadingState {
    // The most recent leaf in the main area, so clicking a sidebar does not
    // make it look like you stopped reading.
    const view = this.app.workspace.getMostRecentLeaf()?.view;
    const file = view instanceof FileView ? view.file : null;
    return {
      version: STATE_VERSION,
      pid: process.pid,
      vault: this.vaultPath(),
      active: view instanceof FileView && file ? this.describe(view, file) : null,
      openTabs: this.openTabs(),
      recent: this.data.recent.slice(0, MAX_RECENT_SHARED),
    };
  }

  private describe(view: FileView, file: TFile): ActiveNote {
    const active: ActiveNote = { path: file.path, type: view.getViewType() };
    if (!(view instanceof MarkdownView)) {
      // A PDF, an image or a canvas: the selection is all we can see.
      const sel = this.domSelection(view);
      if (sel) active.selection = clip(selectedText(sel), null, null);
      return active;
    }

    const reading = view.getMode() === 'preview';
    active.mode = reading ? 'reading' : 'editing';
    const selection = reading ? this.readingSelection(view) : this.editorSelection(view);
    if (selection) active.selection = selection;

    // Where you are: the selection if there is one, else the top of the screen.
    const line = selection?.fromLine ?? this.topLine(view);
    active.line = line;
    active.section = this.sectionAt(file, line);
    return active;
  }

  private editorSelection(view: MarkdownView): SelectedText | null {
    const { editor } = view;
    const text = editor.getSelection();
    if (!text.trim()) return null;
    return clip(text, editor.getCursor('from').line + 1, editor.getCursor('to').line + 1);
  }

  private readingSelection(view: MarkdownView): SelectedText | null {
    const sel = this.domSelection(view);
    if (!sel) return null;
    const [fromLine, toLine] = this.renderedLines(view, sel.getRangeAt(0));
    return clip(selectedText(sel), fromLine, toLine);
  }

  private domSelection(view: FileView): Selection | null {
    const sel = view.containerEl.ownerDocument.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    if (!view.containerEl.contains(sel.anchorNode)) return null;
    return selectedText(sel).trim() ? sel : null;
  }

  // Reading view has no line numbers, so map the selection back to the source
  // through the blocks Obsidian rendered. This uses Obsidian internals (their
  // start/end lines count from 0), so it fails soft: no lines, not an error.
  private renderedLines(view: MarkdownView, range: Range): [number | null, number | null] {
    try {
      const preview = view.previewMode as unknown as { renderer?: { sections?: RenderedSection[] } };
      const sections = preview.renderer?.sections ?? [];
      const find = (node: Node) => sections.find((s) => s.el.contains(node));
      const first = find(range.startContainer);
      const last = find(range.endContainer);
      if (first && last) return [first.start.line + 1, last.end.line + 1];
    } catch (err) {
      console.warn('Claude Code Connector: cannot map a reading-view selection to lines', err);
    }
    return [null, null];
  }

  /** 1-based number of the first line on screen. */
  private topLine(view: MarkdownView): number | null {
    try {
      const scroll = view.currentMode.getScroll();
      return Number.isFinite(scroll) ? Math.floor(scroll) + 1 : null;
    } catch {
      return null;
    }
  }

  /** The headings above `line`, outermost first: ["HTTP", "Status codes"]. */
  private sectionAt(file: TFile, line: number | null): string[] {
    if (line === null) return [];
    const headings = this.app.metadataCache.getFileCache(file)?.headings ?? [];
    const trail: typeof headings = [];
    for (const h of headings) {
      if (h.position.start.line + 1 > line) break;
      while (trail.length > 0 && (trail.at(-1)?.level ?? 0) >= h.level) trail.pop();
      trail.push(h);
    }
    return trail.map((h) => h.heading);
  }

  private openTabs(): string[] {
    const paths: string[] = [];
    this.app.workspace.iterateRootLeaves((leaf) => {
      // Background tabs load lazily and have no file yet; their saved state
      // still names it.
      const loaded = leaf.view instanceof FileView ? leaf.view.file?.path : undefined;
      const saved = leaf.getViewState().state?.file;
      const p = loaded ?? (typeof saved === 'string' ? saved : undefined);
      if (p !== undefined && !paths.includes(p)) paths.push(p);
    });
    return paths.slice(0, MAX_TABS);
  }

  private vaultPath(): string | null {
    const { adapter } = this.app.vault;
    return adapter instanceof FileSystemAdapter ? adapter.getBasePath() : null;
  }
}

// Selection.toString() keeps the line breaks between paragraphs but comes back
// blank for text the browser has not laid out; Range.toString() never does.
function selectedText(sel: Selection): string {
  const text = sel.toString();
  return text.trim() ? text : sel.getRangeAt(0).toString();
}

function clip(text: string, fromLine: number | null, toLine: number | null): SelectedText {
  const truncated = text.length > MAX_SELECTION_CHARS;
  return { text: truncated ? text.slice(0, MAX_SELECTION_CHARS) : text, fromLine, toLine, truncated };
}

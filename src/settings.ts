import { type App, PluginSettingTab, Setting, type SettingDefinitionItem } from 'obsidian';
import type ClaudeCodeConnector from './main';

type Key = 'share' | 'shareEverywhere';

interface Toggle {
  key: Key;
  name: string;
  desc: string;
  /** Extra words Obsidian's settings search matches. */
  aliases: string[];
}

const TOGGLES: Toggle[] = [
  {
    key: 'share',
    name: 'Share with Claude Code',
    desc: 'Turn off to stop sharing until you turn it back on. Clicking the status bar item does the same.',
    aliases: ['pause', 'resume', 'privacy'],
  },
  {
    key: 'shareEverywhere',
    name: 'Share with every Claude Code session',
    desc:
      'Off: only sessions started inside this vault, or inside the git project that contains it, ' +
      'see what you are reading. On: every Claude Code session on this computer does.',
    aliases: ['all sessions', 'any folder', 'scope'],
  },
];

export class ConnectorSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: ClaudeCodeConnector,
  ) {
    super(app, plugin);
  }

  // Obsidian 1.13 and newer draw the tab from these definitions and index
  // them, so the settings search finds both switches.
  override getSettingDefinitions(): SettingDefinitionItem<Key>[] {
    return TOGGLES.map(({ key, name, desc, aliases }) => ({
      name,
      desc,
      aliases,
      control: { type: 'toggle', key },
    }));
  }

  // The plugin keeps its settings in `data` and acts on a change (pausing
  // deletes the state file), so values go through the plugin rather than
  // `plugin.settings`, which the default implementation would use.
  override getControlValue(key: string): unknown {
    if (key === 'share') return !this.plugin.data.paused;
    if (key === 'shareEverywhere') return this.plugin.data.shareEverywhere;
    return undefined;
  }

  override setControlValue(key: string, value: unknown): void {
    if (key === 'share') this.plugin.setPaused(value !== true);
    else if (key === 'shareEverywhere') this.plugin.setShareEverywhere(value === true);
  }

  // Obsidian before 1.13 has no setting definitions and calls this instead.
  // Newer versions never call it while getSettingDefinitions returns any.
  override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    for (const { key, name, desc } of TOGGLES) {
      new Setting(containerEl)
        .setName(name)
        .setDesc(desc)
        .addToggle((toggle) =>
          toggle
            .setValue(this.getControlValue(key) === true)
            .onChange((on) => this.setControlValue(key, on)),
        );
    }
  }
}

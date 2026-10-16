import { type App, PluginSettingTab, Setting } from 'obsidian';
import type ClaudeCodeConnector from './main';

export class ConnectorSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: ClaudeCodeConnector,
  ) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Share with Claude Code')
      .setDesc('Turn off to stop sharing until you turn it back on. Clicking the status bar item does the same.')
      .addToggle((toggle) =>
        toggle.setValue(!this.plugin.data.paused).onChange((on) => this.plugin.setPaused(!on)),
      );

    new Setting(containerEl)
      .setName('Share with every Claude Code session')
      .setDesc(
        'Off: only sessions started inside this vault, or inside the git project that contains it, ' +
          'see what you are reading. On: every Claude Code session on this computer does.',
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.data.shareEverywhere)
          .onChange((on) => this.plugin.setShareEverywhere(on)),
      );
  }
}

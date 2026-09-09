import { App, PluginSettingTab, Setting } from 'obsidian';
import FocusOutlinePlugin from './main';

export interface PanelPosition {
  left: number;
  top: number;
}

export interface PanelSize {
  width: number;
  height: number;
}

export interface FocusOutlineSettings {
  showByDefault: boolean;
  minLevel: number;
  maxLevel: number;
  autoCollapse: boolean;
  position: PanelPosition;
  size: PanelSize;
}

export const DEFAULT_SETTINGS: FocusOutlineSettings = {
  showByDefault: true,
  minLevel: 1,
  maxLevel: 6,
  autoCollapse: false,
  position: { left: -1, top: 60 },
  size: { width: 260, height: 400 },
};

export class FocusOutlineSettingTab extends PluginSettingTab {
  plugin: FocusOutlinePlugin;

  constructor(app: App, plugin: FocusOutlinePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Focus Outline Panel' });

    new Setting(containerEl)
      .setName('Show by default')
      .setDesc('Open the outline panel automatically when Obsidian starts.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showByDefault)
        .onChange(async (value) => {
          this.plugin.settings.showByDefault = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Minimum heading level')
      .setDesc('Show headings starting from this level (1 = H1).')
      .addSlider(slider => slider
        .setLimits(1, 6, 1)
        .setValue(this.plugin.settings.minLevel)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.minLevel = value;
          if (value > this.plugin.settings.maxLevel) {
            this.plugin.settings.maxLevel = value;
          }
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Maximum heading level')
      .setDesc('Show headings up to this level (6 = H6).')
      .addSlider(slider => slider
        .setLimits(1, 6, 1)
        .setValue(this.plugin.settings.maxLevel)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.maxLevel = value;
          if (value < this.plugin.settings.minLevel) {
            this.plugin.settings.minLevel = value;
          }
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Auto-collapse')
      .setDesc('Automatically collapse all levels except the active one.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoCollapse)
        .onChange(async (value) => {
          this.plugin.settings.autoCollapse = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Reset position and size')
      .setDesc('Reset the panel to its default position and size.')
      .addButton(button => button
        .setButtonText('Reset')
        .onClick(async () => {
          this.plugin.settings.position = DEFAULT_SETTINGS.position;
          this.plugin.settings.size = DEFAULT_SETTINGS.size;
          await this.plugin.saveSettings();
          this.plugin.hidePanel();
          this.plugin.showPanel();
          this.display();
        }));
  }
}

import { Plugin } from 'obsidian';
import { FocusOutlineSettingTab, FocusOutlineSettings, DEFAULT_SETTINGS } from './settings';
import { OutlinePanel } from './OutlinePanel';

export default class FocusOutlinePlugin extends Plugin {
  settings: FocusOutlineSettings = DEFAULT_SETTINGS;
  private panel: OutlinePanel | null = null;
  private collapseState = new Map<number, boolean>();

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new FocusOutlineSettingTab(this.app, this));

    this.addCommand({
      id: 'toggle-outline-panel',
      name: 'Toggle outline panel',
      callback: () => this.togglePanel(),
    });

    this.addCommand({
      id: 'reveal-active-heading',
      name: 'Reveal active heading in outline',
      callback: () => this.panel?.scrollToActiveHeading(),
    });

    this.addCommand({
      id: 'reset-outline-panel-position',
      name: 'Reset outline panel position',
      callback: () => this.panel?.resetPosition(),
    });

    this.app.workspace.onLayoutReady(() => {
      if (this.settings.showByDefault) {
        this.showPanel();
      }
    });

    this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
      if (this.panel?.isVisible()) {
        void this.panel.render();
        this.panel.attachScrollHandler();
      }
    }));

    this.registerEvent(this.app.workspace.on('editor-change', () => {
      if (this.panel?.isVisible()) {
        void this.panel.render();
      }
    }));
  }

  onunload() {
    this.hidePanel();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    if (this.panel?.isVisible()) {
      void this.panel.render();
    }
  }

  showPanel() {
    if (!this.panel) {
      this.panel = new OutlinePanel(this.app, this);
    }
    this.panel.show();
  }

  hidePanel() {
    if (this.panel) {
      this.panel.hide();
    }
  }

  private togglePanel() {
    if (this.panel?.isVisible()) {
      this.hidePanel();
    } else {
      this.showPanel();
    }
  }

  isCollapsed(line: number): boolean {
    return this.collapseState.get(line) ?? false;
  }

  setCollapsed(line: number, collapsed: boolean) {
    this.collapseState.set(line, collapsed);
  }
}

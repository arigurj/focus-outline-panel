import { App, MarkdownView, HeadingCache, debounce } from 'obsidian';
import FocusOutlinePlugin from './main';

interface HeadingItem {
  level: number;
  text: string;
  line: number;
  children: HeadingItem[];
}

export class OutlinePanel {
  private app: App;
  private plugin: FocusOutlinePlugin;
  private container: HTMLElement | null = null;
  private contentEl: HTMLElement | null = null;
  private activeLine: number = -1;
  private scrollHandler: (() => void) | null = null;
  private observer: IntersectionObserver | null = null;

  // Drag state
  private isDragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private onDragMove: ((e: MouseEvent) => void) | null = null;
  private onDragEnd: ((e: MouseEvent) => void) | null = null;

  // Resize state
  private isResizing = false;
  private resizeDirection: string | null = null;
  private resizeStartX = 0;
  private resizeStartY = 0;
  private resizeStartWidth = 0;
  private resizeStartHeight = 0;
  private onResizeMove: ((e: MouseEvent) => void) | null = null;
  private onResizeEnd: ((e: MouseEvent) => void) | null = null;

  constructor(app: App, plugin: FocusOutlinePlugin) {
    this.app = app;
    this.plugin = plugin;
  }

  isVisible(): boolean {
    return this.container !== null;
  }

  show() {
    if (this.container) return;

    this.container = document.body.createDiv({
      cls: 'focus-outline-floating-panel',
    });

    const pos = this.plugin.settings.position;
    const size = this.plugin.settings.size;
    this.container.style.width = `${size.width}px`;
    this.container.style.height = `${size.height}px`;

    if (pos.left < 0) {
      this.container.style.top = `${pos.top}px`;
      this.container.style.right = '20px';
      this.container.style.left = 'auto';
    } else {
      this.container.style.top = `${pos.top}px`;
      this.container.style.left = `${pos.left}px`;
      this.container.style.right = 'auto';
    }

    const header = this.container.createDiv({ cls: 'focus-outline-header' });
    header.createSpan({ text: 'Outline', cls: 'focus-outline-title' });
    const closeBtn = header.createSpan({ cls: 'focus-outline-close', text: '✕' });
    closeBtn.addEventListener('click', () => this.plugin.hidePanel());

    this.contentEl = this.container.createDiv({ cls: 'focus-outline-content' });

    this.setupDrag(header);
    this.createResizeHandles();
    this.setupResizeHandlers();

    this.render();
    this.attachScrollHandler();
    this.setupIntersectionObserver();
  }

  hide() {
    this.detachScrollHandler();
    this.disconnectObserver();
    this.removeGlobalListeners();
    if (this.container) {
      this.container.remove();
      this.container = null;
      this.contentEl = null;
    }
  }

  resetPosition() {
    if (!this.container) return;
    this.plugin.settings.position = { left: -1, top: 60 };
    this.plugin.settings.size = { width: 260, height: 400 };
    this.plugin.saveSettings();

    this.container.style.top = '60px';
    this.container.style.right = '20px';
    this.container.style.left = 'auto';
    this.container.style.width = '260px';
    this.container.style.height = '400px';
  }

  render() {
    if (!this.contentEl) return;
    this.contentEl.empty();

    const file = this.app.workspace.getActiveFile();
    if (!file) {
      this.showEmpty('No active note');
      return;
    }

    const metadata = this.app.metadataCache.getFileCache(file);
    if (!metadata?.headings?.length) {
      this.showEmpty('No headings');
      return;
    }

    const headings = this.buildHeadingTree(metadata.headings);
    const root = this.contentEl.createDiv({ cls: 'focus-outline-tree' });
    this.renderHeadings(root, headings);
  }

  private showEmpty(message: string) {
    if (!this.contentEl) return;
    this.contentEl.createDiv({ cls: 'focus-outline-empty', text: message });
  }

  private buildHeadingTree(headings: HeadingCache[]): HeadingItem[] {
    const items = headings
      .filter(h => h.level >= this.plugin.settings.minLevel && h.level <= this.plugin.settings.maxLevel)
      .map(h => ({
        level: h.level,
        text: h.heading.replace(/#+\s*/, ''),
        line: h.position.start.line,
        children: [],
      }));

    const root: HeadingItem[] = [];
    const stack: HeadingItem[] = [];

    for (const item of items) {
      while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
        stack.pop();
      }
      if (stack.length === 0) {
        root.push(item);
      } else {
        stack[stack.length - 1].children.push(item);
      }
      stack.push(item);
    }

    return root;
  }

  private renderHeadings(container: HTMLElement, items: HeadingItem[]) {
    for (const item of items) {
      const row = container.createDiv({
        cls: 'focus-outline-row',
        attr: { 'data-level': String(item.level), 'data-line': String(item.line) },
      });

      const indent = (item.level - this.plugin.settings.minLevel) * 12;
      row.style.paddingLeft = `${indent}px`;

      const isCollapsed = this.plugin.isCollapsed(item.line);

      if (item.children.length > 0) {
        const toggle = row.createSpan({ cls: 'focus-outline-toggle' });
        toggle.setText(isCollapsed ? '▶' : '▼');
        toggle.addEventListener('click', (e) => {
          e.stopPropagation();
          this.plugin.setCollapsed(item.line, !isCollapsed);
          this.render();
        });
      }

      const text = row.createSpan({ cls: 'focus-outline-text' });
      text.setText(item.text);

      if (item.line === this.activeLine) {
        row.addClass('focus-outline-active');
      }

      row.addEventListener('click', () => {
        this.scrollToLine(item.line);
      });

      if (!isCollapsed && item.children.length > 0) {
        this.renderHeadings(container, item.children);
      }
    }
  }

  updateActiveHeading() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.editor) return;

    const cursor = view.editor.getCursor();
    const currentLine = cursor.line;

    let activeHeading = -1;
    for (const h of this.flattenVisibleHeadings()) {
      if (h.line <= currentLine) {
        activeHeading = h.line;
      } else {
        break;
      }
    }

    if (activeHeading !== this.activeLine) {
      this.activeLine = activeHeading;
      this.highlightActive();
    }
  }

  private flattenVisibleHeadings(): HeadingItem[] {
    const file = this.app.workspace.getActiveFile();
    if (!file) return [];
    const metadata = this.app.metadataCache.getFileCache(file);
    if (!metadata?.headings?.length) return [];

    const tree = this.buildHeadingTree(metadata.headings);
    return this.flattenTree(tree);
  }

  private flattenTree(items: HeadingItem[]): HeadingItem[] {
    const result: HeadingItem[] = [];
    for (const item of items) {
      result.push(item);
      if (!this.plugin.isCollapsed(item.line)) {
        result.push(...this.flattenTree(item.children));
      }
    }
    return result;
  }

  private highlightActive() {
    if (!this.contentEl) return;
    const rows = this.contentEl.querySelectorAll('.focus-outline-row');
    rows.forEach(row => {
      const line = parseInt(row.getAttribute('data-line') || '-1');
      row.toggleClass('focus-outline-active', line === this.activeLine);
    });
  }

  scrollToLine(line: number) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.editor) return;
    view.editor.setCursor({ line, ch: 0 });
    view.editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } });
  }

  scrollToActiveHeading() {
    if (this.activeLine >= 0) {
      this.scrollToLine(this.activeLine);
    }
  }

  attachScrollHandler() {
    this.detachScrollHandler();
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.editor) return;

    const editor = view.editor;
    const scroller = (editor as any).cm?.dom?.querySelector?.('.cm-scroller') as HTMLElement | null
      || (editor as any).cm?.dom as HTMLElement | null;

    if (!scroller) return;

    this.scrollHandler = debounce(() => {
      this.updateActiveHeading();
    }, 50);

    scroller.addEventListener('scroll', this.scrollHandler);
    this.updateActiveHeading();
  }

  detachScrollHandler() {
    if (this.scrollHandler) {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view?.editor) {
        const editor = view.editor;
        const scroller = (editor as any).cm?.dom?.querySelector?.('.cm-scroller') as HTMLElement | null
          || (editor as any).cm?.dom as HTMLElement | null;
        if (scroller) {
          scroller.removeEventListener('scroll', this.scrollHandler);
        }
      }
    }
    this.scrollHandler = null;
  }

  private setupIntersectionObserver() {
    this.disconnectObserver();
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const line = parseInt((entry.target as HTMLElement).dataset.line || '-1');
            if (line >= 0 && line !== this.activeLine) {
              this.activeLine = line;
              this.highlightActive();
            }
          }
        }
      },
      { threshold: 0.5 }
    );

    this.observeHeadings();
  }

  private observeHeadings() {
    if (!this.observer) return;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;

    const preview = view.containerEl.querySelector('.markdown-preview-view');
    if (!preview) return;

    const headings = preview.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach(h => {
      const level = parseInt(h.tagName[1]);
      if (level >= this.plugin.settings.minLevel && level <= this.plugin.settings.maxLevel) {
        const line = this.findLineForHeading(h.textContent || '');
        if (line >= 0) {
          (h as HTMLElement).dataset.line = String(line);
          this.observer!.observe(h);
        }
      }
    });
  }

  private findLineForHeading(text: string): number {
    const file = this.app.workspace.getActiveFile();
    if (!file) return -1;
    const metadata = this.app.metadataCache.getFileCache(file);
    if (!metadata?.headings) return -1;

    const heading = metadata.headings.find(h => h.heading.replace(/#+\s*/, '') === text);
    return heading ? heading.position.start.line : -1;
  }

  private disconnectObserver() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  /* === Drag === */

  private setupDrag(header: HTMLElement) {
    this.onDragMove = (e: MouseEvent) => {
      if (!this.isDragging || !this.container) return;

      const newX = e.clientX - this.dragOffsetX;
      const newY = e.clientY - this.dragOffsetY;

      // Constrain: header (top 32px) must stay visible
      const constrainedX = Math.max(-this.container.offsetWidth + 60, Math.min(newX, window.innerWidth - 60));
      const constrainedY = Math.max(0, Math.min(newY, window.innerHeight - 32));

      this.container.style.left = `${constrainedX}px`;
      this.container.style.top = `${constrainedY}px`;
      this.container.style.right = 'auto';
    };

    this.onDragEnd = () => {
      if (!this.isDragging || !this.container) return;
      this.isDragging = false;

      const rect = this.container.getBoundingClientRect();
      this.plugin.settings.position = {
        left: rect.left,
        top: rect.top,
      };
      this.plugin.saveSettings();

      document.removeEventListener('mousemove', this.onDragMove!);
      document.removeEventListener('mouseup', this.onDragEnd!);
    };

    header.addEventListener('mousedown', (e: MouseEvent) => {
      if (!this.container) return;
      this.isDragging = true;
      const rect = this.container.getBoundingClientRect();
      this.dragOffsetX = e.clientX - rect.left;
      this.dragOffsetY = e.clientY - rect.top;

      document.addEventListener('mousemove', this.onDragMove!);
      document.addEventListener('mouseup', this.onDragEnd!);
      e.preventDefault();
    });
  }

  /* === Resize === */

  private createResizeHandles() {
    if (!this.container) return;

    const directions = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
    for (const dir of directions) {
      const handle = this.container.createDiv({
        cls: `focus-outline-resize-handle focus-outline-resize-${dir}`,
      });
      handle.addEventListener('mousedown', (e: MouseEvent) => {
        this.startResize(e, dir);
      });
    }
  }

  private setupResizeHandlers() {
    this.onResizeMove = (e: MouseEvent) => {
      if (!this.isResizing || !this.container || !this.resizeDirection) return;

      const dx = e.clientX - this.resizeStartX;
      const dy = e.clientY - this.resizeStartY;

      let newWidth = this.resizeStartWidth;
      let newHeight = this.resizeStartHeight;
      let newLeft = this.container.offsetLeft;
      let newTop = this.container.offsetTop;

      const dir = this.resizeDirection;

      if (dir.includes('e')) {
        newWidth = Math.max(180, this.resizeStartWidth + dx);
      }
      if (dir.includes('w')) {
        const widthDelta = Math.min(dx, this.resizeStartWidth - 180);
        newWidth = this.resizeStartWidth - widthDelta;
        newLeft = this.container.offsetLeft + widthDelta;
      }
      if (dir.includes('s')) {
        newHeight = Math.max(120, this.resizeStartHeight + dy);
      }
      if (dir.includes('n')) {
        const heightDelta = Math.min(dy, this.resizeStartHeight - 120);
        newHeight = this.resizeStartHeight - heightDelta;
        newTop = this.container.offsetTop + heightDelta;
      }

      this.container.style.width = `${newWidth}px`;
      this.container.style.height = `${newHeight}px`;
      this.container.style.left = `${newLeft}px`;
      this.container.style.top = `${newTop}px`;
      this.container.style.right = 'auto';
    };

    this.onResizeEnd = () => {
      if (!this.isResizing || !this.container) return;
      this.isResizing = false;
      this.resizeDirection = null;

      const rect = this.container.getBoundingClientRect();
      this.plugin.settings.size = {
        width: rect.width,
        height: rect.height,
      };
      this.plugin.settings.position = {
        left: rect.left,
        top: rect.top,
      };
      this.plugin.saveSettings();

      document.removeEventListener('mousemove', this.onResizeMove!);
      document.removeEventListener('mouseup', this.onResizeEnd!);
    };
  }

  private startResize(e: MouseEvent, direction: string) {
    if (!this.container) return;
    this.isResizing = true;
    this.resizeDirection = direction;
    this.resizeStartX = e.clientX;
    this.resizeStartY = e.clientY;

    const rect = this.container.getBoundingClientRect();
    this.resizeStartWidth = rect.width;
    this.resizeStartHeight = rect.height;

    document.addEventListener('mousemove', this.onResizeMove!);
    document.addEventListener('mouseup', this.onResizeEnd!);
    e.preventDefault();
    e.stopPropagation();
  }

  private removeGlobalListeners() {
    if (this.onDragMove) {
      document.removeEventListener('mousemove', this.onDragMove);
      document.removeEventListener('mouseup', this.onDragEnd!);
    }
    if (this.onResizeMove) {
      document.removeEventListener('mousemove', this.onResizeMove);
      document.removeEventListener('mouseup', this.onResizeEnd!);
    }
  }
}

# Focus Outline Panel

Floating sidebar panel with live outline of the current note, collapsible by levels, synced to viewport scroll position.

## Features

- **Always-visible outline** — a floating panel on the right side of the editor showing all headings in the current note.
- **Collapsible levels** — click a heading to collapse/collapse its children.
- **Viewport sync** — the active heading (the one currently in view) is highlighted automatically.
- **Lightweight** — no inline TOC, no DOM injection into the note body. Pure sidebar panel.

## Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release.
2. Place them in `<vault>/.obsidian/plugins/focus-outline-panel/`.
3. Enable the plugin in **Settings → Community plugins**.

## Usage

- The panel appears automatically when you open a note with headings.
- Click any heading to scroll the editor to that section.
- Click the arrow next to a heading to collapse/expand its children.
- The active heading (currently in viewport) is highlighted with an accent color.

## Settings

- **Show panel** — toggle the panel on/off.
- **Min heading level** — filter out top-level headings (e.g., show only H2 and below).
- **Max heading level** — filter out deep headings (e.g., show only up to H4).
- **Auto-collapse** — automatically collapse all levels except the active one.

## Development

```bash
npm install
npm run dev     # watch mode
npm run build   # production build
```

## License

MIT

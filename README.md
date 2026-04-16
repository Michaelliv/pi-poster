# pi-poster

🎨 [Poster](https://github.com/Michaelliv/poster) integration for [pi](https://github.com/badlogic/pi-mono).

Give agents the ability to render standalone React posters to PNG / SVG / PDF / JPG / WebP during a session.

## Install

```bash
npm i -g poster-ai
pi install npm:pi-poster
```

`poster-ai` ships a headless Chromium download for global installs, so the first run is ready to render.

## What you get

### Extension

**poster-make** — registers one tool:

- `poster_render` — Render a React component to an image file. Single-file authoring — Tailwind classes, Recharts, lucide-react icons, Inter / Source Serif 4 / JetBrains Mono fonts all work out of the box. Source the TSX two ways:
  - **`tsx`** — inline source string. Use for the first render.
  - **`tsxPath`** — path to a `.tsx` file on disk. Use for iterative edits: the agent edits the previously archived source rather than resending the whole component.

First render — inline source:

```
poster_render({
  tsx: `export default () => <div className="w-[1200px] p-10 bg-black text-white"><h1 className="text-7xl font-black">Hello.</h1></div>`,
  out: "./hello.png"
})
→ Rendered /Users/you/project/hello.png · 24.3 KB · 1200×180 · png
```

Iterative edit — the agent edits `.poster/output/hello-<ts>.tsx` and re-renders by path:

```
poster_render({
  tsxPath: ".poster/output/hello-1776359608903.tsx",
  out: "./hello.png"
})
```

### Archive

Every render also writes a paired `<name>-<ts>.{png,tsx}` into `.poster/output/`. The image gives you a full history of what the agent produced; the `.tsx` is what `tsxPath` re-renders against. Add `.poster/` to `.gitignore` if you don't want the archive in version control.

### Skill

The `poster` skill gives the agent the authoring contract, canvas size conventions, common pitfalls, and a minimal example.

## Use cases

When to reach for `poster_render` during a session:

- "Make me a chart showing X" → dashboard-style PNG
- "Give me a share image for this release" → OG image / social card
- "Turn this data into a one-page PDF report" → editorial layout → PDF
- "Mock up a year-in-review" → wrapped-style story poster
- "I need a cover for this repo" → hero image for README

## License

MIT

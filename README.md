# pi-poster

🎨 [Poster](https://github.com/Michaelliv/poster) integration for [pi](https://github.com/badlogic/pi).

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

- `poster_render` — Render a React component (inline `.tsx` source as a string) to an image file. Single-file authoring — Tailwind classes, Recharts, lucide-react icons, Inter / Source Serif 4 / JetBrains Mono fonts all work out of the box.

Example the agent might make on your behalf:

```
poster_render({
  tsx: `export default () => <div className="w-[1200px] p-10 bg-black text-white"><h1 className="text-7xl font-black">Hello.</h1></div>`,
  out: "./hello.png"
})
→ Rendered /Users/you/project/hello.png · 24.3 KB · png
```

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

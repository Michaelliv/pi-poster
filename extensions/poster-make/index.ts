// poster-make — register the `poster_render` tool so an agent can turn
// inline TSX into a rendered image (or HTML / PDF / SVG) file.
//
// Design: pure capability unlock. No session context, no state. The agent
// authors a single-file React component as a string, names an output path,
// and gets back a file on disk.
//
// There is deliberately NO `width`/`height` tool parameter. The canvas is
// declared inside the TSX (via Tailwind `w-[Npx]` on the root), so there's
// exactly one source of truth. Two sources = overflow + empty-strip bugs.

import { writeFileSync } from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { Poster } from "poster-ai";

const FORMATS = ["png", "svg", "pdf", "jpg", "webp"] as const;
type Format = (typeof FORMATS)[number];

function inferFormat(out: string): Format | null {
  const ext = path.extname(out).toLowerCase().slice(1);
  if (ext === "jpeg") return "jpg";
  return (FORMATS as readonly string[]).includes(ext) ? (ext as Format) : null;
}

/**
 * Pre-flight check on the TSX source. Catches the three mistakes that
 * guarantee a broken canvas before we waste a puppeteer launch on them.
 *
 * Returns an error message if the TSX violates the contract, or null if OK.
 */
function validateTsx(tsx: string): string | null {
  if (!/\bw-\[\d+px\]/.test(tsx)) {
    return [
      "The TSX must declare an explicit canvas width on the root element — this is the single source of truth for the canvas.",
      "",
      "Fix: add `w-[Npx]` to the outermost <div>. Examples:",
      '  <div className="w-[1600px] p-10 ...">   // landscape / twitter / dashboard',
      '  <div className="w-[1200px] p-10 ...">   // square / poster / cover',
      '  <div className="w-[1080px] p-10 ...">   // story / wrapped',
      '  <div className="w-[1400px] p-10 ...">   // magazine / editorial',
      "",
      "Add `h-[Npx]` as well only if you need a fixed aspect (magazine covers, story format). Otherwise height emerges from content.",
    ].join("\n");
  }

  if (/\bmin-h-screen\b/.test(tsx)) {
    return [
      "`min-h-screen` is not allowed. It stretches the wrapper to an internal 3600px viewport instead of your declared canvas, which ruins the composition.",
      "",
      "If you need vertical flex distribution inside a fixed-height parent, use `h-full` on the inner wrapper. If you need a minimum canvas height, declare it on the root with `h-[Npx]` or `min-h-[Npx]`.",
    ].join("\n");
  }

  // Root-level `w-full` is a common footgun — it silently overrides `w-[Npx]`.
  // We can't reliably parse TSX without an AST, but the typical pattern is
  // `w-[Npx] ... w-full` or `w-full ... w-[Npx]` in the same className string
  // on the root element. Scan the first 1000 chars for both tokens together.
  const head = tsx.slice(0, 1500);
  if (/w-\[\d+px\]/.test(head) && /\bw-full\b/.test(head)) {
    const firstWPx = head.indexOf("w-[");
    const firstWFull = head.indexOf("w-full");
    if (
      firstWPx !== -1 &&
      firstWFull !== -1 &&
      Math.abs(firstWPx - firstWFull) < 200
    ) {
      return [
        "`w-full` appears next to `w-[Npx]` on (or near) the root element. `w-full` will override your explicit width.",
        "",
        "Fix: remove `w-full` from the root's className. Keep the `w-[Npx]` only.",
      ].join("\n");
    }
  }

  return null;
}

/** Parse the IHDR chunk of a PNG buffer for pixel dimensions. */
function readPngDims(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    if (ctx.hasUI) {
      const theme = ctx.ui.theme;
      ctx.ui.setStatus("poster", `🎨${theme.fg("dim", " poster")}`);
    }
  });

  pi.registerMessageRenderer("poster-make", (_message, _opts, theme) => {
    const label = theme.fg("customMessageLabel", "🎨 poster");
    return new Text(label, 1, 0);
  });

  pi.registerTool({
    name: "poster_render",
    label: "Poster Render",
    description:
      "Render a React component to an image (png/svg/pdf/jpg/webp). Pass a single-file TSX source as a string. Best for charts, dashboards, report cards, OG images, year-in-review, editorial data stories, event posters, cover images — anything that's a visual composition, not an interactive UI. See the `poster` skill for the full authoring guide.",
    promptSnippet:
      "Render inline TSX to an image. Use when the user asks for a chart, dashboard, report card, OG image, social share card, year-in-review, magazine layout, cover image, or any single-page visual deliverable.",
    parameters: Type.Object({
      tsx: Type.String({
        description: [
          "Full TSX source for a self-contained React poster. Must `export default` a React component.",
          "",
          "HOW THE CANVAS IS SIZED — the most important rule:",
          "The root element declares the canvas via Tailwind. There is no width/height tool parameter — the root div IS the canvas. The renderer measures it exactly.",
          "",
          '  <div className="w-[1600px] p-10 ...">   ← width declared, height auto (most common)',
          '  <div className="w-[1080px] h-[1350px] p-10 ...">   ← fixed aspect (story, magazine cover)',
          "",
          "You MUST include `w-[Npx]` on the outermost <div>. Without it, the render falls back to default dimensions and content usually doesn't fit. Add `h-[Npx]` only if the poster needs a fixed aspect (story format, dashboard-in-fold, magazine cover).",
          "",
          "BANNED classes — they break the canvas:",
          "- `min-h-screen` anywhere (stretches to 3600px viewport, not your canvas)",
          "- `w-full` on the root alongside `w-[Npx]` (overrides your explicit width)",
          "- `aspect-[W/H]` on the root without an explicit width (indeterminate box)",
          "",
          "AVAILABLE WITHOUT IMPORTS: Tailwind classes; fonts Inter (sans), 'Source Serif 4' (serif/italic), 'JetBrains Mono' (code) — set via inline `style={{ fontFamily: \"...\" }}`.",
          "AVAILABLE VIA IMPORT: recharts, lucide-react, react.",
          "",
          "OTHER NON-NEGOTIABLES:",
          "- Font-size floor is 14px. No `text-xs`, no `text-[11px]`. Use `text-sm` or `text-[14px]` minimum. Recharts axis ticks: `fontSize: 13`.",
          "- Use `tabular-nums` on every number that needs to align.",
          "",
          "SIGNATURE PATTERNS (use liberally):",
          "- Header row: flex items-end justify-between, with kicker+title on left, status chip on right. Kicker = `text-[14px] font-bold uppercase tracking-[0.3em] text-white/50`.",
          "- Italic reveal word in headlines via Source Serif 4 + gradient text fill (e.g. `linear-gradient(180deg,#fef3c7,#f472b6,#a855f7)` with WebkitBackgroundClip: text, color: transparent).",
          "- Cards: `rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5` with boxShadow `inset 0 1px 0 0 rgba(255,255,255,0.04), 0 20px 40px -24px rgba(0,0,0,0.6)`.",
          "- Dark backgrounds: layer two radial-gradient hotspots at opposite corners over a near-black base. Example: `radial-gradient(800px 500px at 90% 0%, rgba(139,92,246,0.18), transparent 60%), #0a0a0f`.",
          '- Recharts: always ResponsiveContainer; `tickLine={false} axisLine={false}`; `CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false}`; gradient area fills via <defs><linearGradient>.',
          "",
          "CANVAS SIZES by shape: twitter/landscape 1600, square 1200×1200, story 1080×1350, magazine 1400×1800, dashboard 1600×1000, poster/cover 1200×1600, OG image 1200×630.",
          "",
          "CONTENT VOICE: realistic fake data, not foo/bar. Precise numbers ($48,291, +12.4%). Diverse names (Ava Chen, Sora Okafor, Kai Nakamura). Natural dates (Monday, 16 April 2026). Three-part kickers like `The Almanac · Vol. XII · Climate`.",
          "",
          "PICK ONE ACCENT FAMILY — don't mix: cyan/violet (tech), amber/rose (warm), emerald (growth), fuchsia/violet (consumer). Mixing three families = muddy output.",
          "",
          "Load the `poster` skill for the full catalog (layout grammar, composition skeletons, color system, pitfalls, worked examples).",
        ].join("\n"),
      }),
      out: Type.String({
        description:
          "Output file path. Format is inferred from the extension (.png / .svg / .pdf / .jpg / .webp). Relative paths resolve against cwd.",
      }),
      format: Type.Optional(
        Type.Union(
          FORMATS.map((f) => Type.Literal(f)),
          { description: "Force format, overriding the file extension." },
        ),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const format = params.format ?? inferFormat(params.out);
      if (!format) {
        return {
          content: [
            {
              type: "text",
              text: `Cannot infer format from '${params.out}'. Use a .png/.svg/.pdf/.jpg/.webp extension, or pass \`format\`.`,
            },
          ],
          isError: true,
        };
      }

      const violation = validateTsx(params.tsx);
      if (violation) {
        return {
          content: [{ type: "text", text: violation }],
          isError: true,
        };
      }

      const outPath = path.resolve(ctx.cwd, params.out);

      try {
        const poster = new Poster();
        const result = await poster.render({ tsx: params.tsx }, { format });

        if (typeof result === "string") {
          writeFileSync(outPath, result, "utf-8");
        } else {
          writeFileSync(outPath, result);
        }

        // Write a sidecar .tsx next to the output for debuggability —
        // lets us (and the user) inspect what the agent actually authored.
        const srcPath = outPath.replace(/\.[^.]+$/, ".tsx");
        try {
          writeFileSync(srcPath, params.tsx, "utf-8");
        } catch {
          // non-fatal
        }

        const bytes =
          typeof result === "string"
            ? Buffer.byteLength(result, "utf-8")
            : result.length;

        // Surface the real rendered CSS dims for PNG so the agent can
        // sanity-check that auto-fit measured what they expected.
        let dimsLabel = "";
        if (typeof result !== "string") {
          const dims = readPngDims(result);
          if (dims) {
            const w = Math.round(dims.width / 2);
            const h = Math.round(dims.height / 2);
            dimsLabel = ` · ${w}×${h}`;
          }
        }

        return {
          content: [
            {
              type: "text",
              text: `Rendered ${outPath} · ${(bytes / 1024).toFixed(1)} KB${dimsLabel} · ${format}`,
            },
          ],
          details: { path: outPath, bytes, format },
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `poster_render failed: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  });
}

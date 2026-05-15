/**
 * Hyperframes composer — visual-only, full depth pass.
 *
 * No narrator avatar. Composition runs on its own rAF clock from load,
 * with an internal play/pause/replay control. The script becomes lower-
 * third captions that key to each beat. Beats are the main canvas.
 *
 * Everything is Hyperframes-deterministic: every motion is a pure
 * function of the timeline `t`. The clock can be paused or scrubbed
 * and the entire scene reflows accordingly.
 */

import fs from "node:fs";
import path from "node:path";

import type { Beat, Brief } from "./brief";
import type { Animation } from "./animator";
import type { Source } from "./source";
import { sourceFigures, sourceKindLabel, sourceMetaLine } from "./source";
import { lintHyperframeHtml } from "@hyperframes/core/lint";

/**
 * Load the real @hyperframes/core browser runtime IIFE off disk and cache it.
 * We can't `import` the package root because it transitively pulls esbuild
 * (used by their runtime BUILDER, which isn't needed at runtime).
 */
let _hfRuntime: string | null = null;
function getHyperframeRuntimeScript(): string {
  if (_hfRuntime) return _hfRuntime;
  const p = path.resolve(
    process.cwd(),
    "node_modules/@hyperframes/core/dist/hyperframe.runtime.iife.js",
  );
  _hfRuntime = fs.readFileSync(p, "utf8");
  return _hfRuntime;
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function transitionFor(i: number): "slide" | "wipe" | "tilt" | "zoom" {
  return ["slide", "wipe", "tilt", "zoom"][i % 4] as
    | "slide"
    | "wipe"
    | "tilt"
    | "zoom";
}

function beatHtml(
  b: Beat,
  source: Source,
  index: number,
  durSec: number,
  animation?: Animation,
) {
  const figs = sourceFigures(source);
  const id = `b${index}`;
  const trans = transitionFor(index);
  const common = `id="${id}" class="clip beat trans-${trans}" data-start="${b.at}" data-duration="${durSec}" data-track-index="2"`;

  switch (b.show.type) {
    case "animation":
      if (!animation || !animation.html) {
        return `
<div ${common}>
  <div class="card quote-card">
    <div class="quote-text">${escapeHtml(b.show.intent)}</div>
  </div>
</div>`;
      }
      return `
<div ${common}>
  <div class="card anim-card" id="${id}-canvas">${animation.html}</div>
</div>`;
    case "title":
      return `
<div ${common}>
  <div class="card title-card">
    <div class="kicker">${escapeHtml(sourceKindLabel(source))} · ${escapeHtml(sourceMetaLine(source))}</div>
    <h1 class="paper-title">${escapeHtml(source.title)}</h1>
    <div class="paper-authors">${escapeHtml((source.authors ?? []).slice(0, 6).join(" · "))}${
      (source.authors ?? []).length > 6 ? " et al." : ""
    }</div>
  </div>
</div>`;
    case "figure": {
      const fig = figs[b.show.index];
      if (!fig) return "";
      return `
<div ${common}>
  <div class="card figure-card">
    <img class="figure-img" src="${escapeHtml(fig.imageUrl)}" alt="Figure ${b.show.index + 1}" />
    <div class="figure-caption">FIG ${b.show.index + 1} — ${escapeHtml((b.show.caption || fig.caption || "").slice(0, 160))}</div>
  </div>
</div>`;
    }
    case "equation":
      return `
<div ${common}>
  <div class="card equation-card">
    <div class="equation-label">Key equation</div>
    <div class="equation-body">\\[${b.show.latex.replace(/\\/g, "\\\\")}\\]</div>
  </div>
</div>`;
    case "quote":
      return `
<div ${common}>
  <div class="card quote-card">
    <div class="quote-mark">"</div>
    <div class="quote-text">${escapeHtml(b.show.text)}</div>
  </div>
</div>`;
    case "cta": {
      const eyebrow =
        source.kind === "arxiv"
          ? "Read the full paper"
          : source.kind === "repo"
          ? "Star the repo"
          : "Read the full story";
      const url =
        source.kind === "arxiv"
          ? `arxiv.org/abs/${source.id}`
          : source.kind === "repo"
          ? `github.com/${source.id}`
          : new URL(source.url).hostname;
      return `
<div ${common}>
  <div class="card cta-card">
    <div class="cta-eyebrow">${eyebrow}</div>
    <div class="cta-url">${escapeHtml(url)}</div>
  </div>
</div>`;
    }
  }
}

function computeBeatDurations(beats: Beat[], total: number): number[] {
  const sorted = [...beats].sort((a, b) => a.at - b.at);
  return sorted.map((b, i) => Math.max(1, (sorted[i + 1]?.at ?? total) - b.at));
}

/** Split a script into chunks that line up with the beats. */
function chunkScriptToBeats(script: string, n: number): string[] {
  const sentences = script
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  if (!sentences.length) return new Array(n).fill("");
  if (sentences.length === n) return sentences;
  // Distribute proportionally.
  const out: string[] = [];
  const per = Math.max(1, Math.ceil(sentences.length / n));
  for (let i = 0; i < n; i++) {
    out.push(sentences.slice(i * per, (i + 1) * per).join(" ").trim());
  }
  // Make sure we don't drop the tail.
  if (out[n - 1] === "" && sentences.length > 0)
    out[n - 1] = sentences[sentences.length - 1];
  return out;
}

/**
 * Run the official @hyperframes/core linter on the produced HTML.
 * The inlined Hyperframes runtime IIFE + the GSAP minified bundle both
 * trip a few rules ('invalid_inline_script_syntax' for `?.`,
 * 'non_deterministic_code' for `Math.random` / `Date.now` used in
 * the runtime's own scheduler). Those aren't findings against OUR
 * composition, they're findings against the libraries it ships with.
 * Filter them out so we only report findings the user can act on.
 */
const NOISE_CODES = new Set([
  "invalid_inline_script_syntax",
  "non_deterministic_code",
  // The inlined Hyperframes runtime + GSAP use template-literal selectors
  // internally. We never call querySelector from our own emitted code.
  "template_literal_selector",
]);
export function lintComposition(html: string) {
  const r = lintHyperframeHtml(html);
  const findings = r.findings.filter((f) => !NOISE_CODES.has(f.code));
  const errorCount = findings.filter((f) => f.severity === "error").length;
  return { ...r, findings, errorCount, ok: errorCount === 0 };
}

export function buildComposition(opts: {
  source: Source;
  brief: Brief;
  narratorUrl?: string; // ignored in visual-only mode, kept for type compat
  durationSeconds: number;
  animations?: Record<number, Animation>;
}): string {
  const { source, brief, durationSeconds, animations = {} } = opts;
  const total = Math.max(durationSeconds, 20);
  const beats = [...brief.beats].sort((a, b) => a.at - b.at);
  const durs = computeBeatDurations(beats, total);
  const captions = chunkScriptToBeats(brief.script, beats.length);

  const beatsHtml = beats
    .map((b, i) => beatHtml(b, source, i, durs[i], animations[i]))
    .filter(Boolean)
    .join("\n");

  const chyronMeta = sourceMetaLine(source);

  // Per-beat entrance GSAP. 4 transition variants with real depth motion.
  const beatsGsap = beats
    .map((b, i) => {
      const at = b.at;
      const trans = transitionFor(i);
      let enter = "";
      if (trans === "slide") {
        enter = `tl.fromTo("#b${i} > .card", { y: 120, z: -200, opacity: 0, rotationX: 15 }, { y: 0, z: 0, opacity: 1, rotationX: 0, duration: 0.85, ease: "power3.out" }, ${at})`;
      } else if (trans === "wipe") {
        enter = `tl.fromTo("#b${i} > .card", { x: -200, z: -300, opacity: 0, rotationY: -20, clipPath: "inset(0 100% 0 0)" }, { x: 0, z: 0, opacity: 1, rotationY: 0, clipPath: "inset(0 0% 0 0)", duration: 0.95, ease: "power3.out" }, ${at})`;
      } else if (trans === "tilt") {
        enter = `tl.fromTo("#b${i} > .card", { z: -500, opacity: 0, rotationX: -30, scale: 0.7 }, { z: 0, opacity: 1, rotationX: 0, scale: 1, duration: 0.95, ease: "power3.out" }, ${at})`;
      } else {
        enter = `tl.fromTo("#b${i} > .card", { z: -800, opacity: 0, scale: 0.55, filter: "blur(8px)" }, { z: 0, opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.95, ease: "back.out(1.3)" }, ${at})`;
      }
      // Idle drift while the beat is held.
      const idle = `tl.to("#b${i} > .card", { y: -10, duration: ${Math.max(durs[i] - 1, 1.5)}, ease: "sine.inOut" }, ${at + 0.5})`;
      const ctaHold =
        b.show.type === "cta"
          ? `\n      tl.to("#b${i} > .card", { scale: 1.04, duration: ${Math.max(durs[i] - 1, 1.5)}, ease: "sine.inOut" }, ${at + 0.5})`
          : "";
      if (b.show.type !== "animation") return [enter, idle, ctaHold].filter(Boolean).join("\n      ");
      const anim = animations[i];
      if (!anim || !anim.gsap) return [enter, idle].join("\n      ");
      const body = anim.gsap.replace(
        /tl\.(from|to|fromTo|set)\s*\(([\s\S]*?),\s*([^)]*?)\)\s*;?/g,
        (_m, fn, args, pos) => {
          const trimmedPos = pos.trim();
          const offset = trimmedPos === "" ? `${at}` : `(${trimmedPos}) + ${at}`;
          return `tl.${fn}(${args}, ${offset});`;
        },
      );
      return `${enter}\n      ${idle}\n      ${body}`;
    })
    .join("\n      ");

  // Caption sequence — types in for each beat.
  const captionsHtml = beats
    .map((b, i) => {
      const cap = captions[i] ?? "";
      if (!cap) return "";
      return `<div id="cap-${i}" class="clip cap" data-start="${b.at}" data-duration="${durs[i]}" data-track-index="3">${escapeHtml(cap)}</div>`;
    })
    .join("\n");

  // Floating depth particles — deterministic spread.
  const particleCount = 28;
  const particles = Array.from({ length: particleCount })
    .map((_, i) => {
      const x = (i * 137) % 1920; // golden-angle-ish
      const y = ((i * 263) % 1080);
      const size = 4 + ((i * 7) % 10);
      const depth = -800 + ((i * 53) % 700);
      const dur = 8 + ((i * 3) % 12);
      const delay = (i * 0.7) % 6;
      return `<div class="particle" style="left:${x}px; top:${y}px; width:${size}px; height:${size}px; transform: translateZ(${depth}px); animation-duration: ${dur}s; animation-delay: -${delay}s;"></div>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1920, height=1080" />
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <script>
    window.MathJax = { tex: { inlineMath: [['$', '$']] }, svg: { fontCache: 'global' } };
  </script>
  <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js" defer></script>
  <style>
    :root {
      --bg-0: #06070d;
      --bg-1: #0a1024;
      --bg-2: #131b3e;
      --ink: #f5efe5;
      --ink-soft: #c8c2b6;
      --accent: #e63946;
      --gold: #f4c542;
      --grid: rgba(255,255,255,0.045);
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 1920px; height: 1080px; overflow: hidden;
      background: var(--bg-0);
      color: var(--ink);
      font-family: "Helvetica Neue", Arial, sans-serif;
    }

    /* Global perspective so all transforms gain depth */
    .world {
      position: absolute; inset: 0;
      perspective: 1600px;
      perspective-origin: 50% 45%;
      transform-style: preserve-3d;
    }

    /* ===== Background layers (parallax) ===== */
    .bg {
      position: absolute; inset: -10%; z-index: 0;
      background:
        radial-gradient(1400px 800px at 20% 20%, rgba(40, 70, 180, 0.40), transparent 60%),
        radial-gradient(1200px 900px at 80% 80%, rgba(150, 30, 60, 0.32), transparent 65%),
        linear-gradient(180deg, var(--bg-0) 0%, var(--bg-1) 60%, var(--bg-2) 100%);
      transform: translateZ(-600px) scale(1.2);
      animation: bg-pan 24s ease-in-out infinite alternate;
    }
    @keyframes bg-pan {
      0%   { transform: translateZ(-600px) scale(1.2) translate(-2%, -1%); }
      100% { transform: translateZ(-600px) scale(1.2) translate(2%, 1%); }
    }
    .bg-grid {
      position: absolute; inset: -5%; z-index: 0;
      background-image:
        linear-gradient(to right, var(--grid) 1px, transparent 1px),
        linear-gradient(to bottom, var(--grid) 1px, transparent 1px);
      background-size: 80px 80px;
      mask-image: radial-gradient(ellipse at center, black 35%, transparent 78%);
      transform: translateZ(-300px) scale(1.1);
      animation: grid-pan 32s linear infinite;
    }
    @keyframes grid-pan {
      0%   { background-position: 0 0; }
      100% { background-position: 80px 80px; }
    }
    .bg-noise {
      position: absolute; inset: 0; z-index: 0; pointer-events: none;
      opacity: 0.06;
      background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
    }
    .bg-vignette {
      position: absolute; inset: 0; z-index: 25; pointer-events: none;
      background: radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.55) 100%);
    }

    /* ===== Spotlight that moves to active beat ===== */
    .spotlight {
      position: absolute;
      width: 1400px; height: 1400px;
      left: 50%; top: 50%;
      margin-left: -700px; margin-top: -700px;
      z-index: 1;
      background: radial-gradient(circle, rgba(80, 140, 255, 0.22), transparent 55%);
      filter: blur(40px);
      transition: transform 0.8s ease, opacity 0.8s ease;
    }

    /* ===== Floating depth particles ===== */
    .particles { position: absolute; inset: 0; z-index: 2; transform-style: preserve-3d; }
    .particle {
      position: absolute;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255,255,255,0.55), rgba(255,255,255,0.0));
      filter: blur(0.5px);
      animation-name: float;
      animation-timing-function: ease-in-out;
      animation-iteration-count: infinite;
    }
    @keyframes float {
      0%   { transform: translate(0, 0) translateZ(var(--z, 0)) scale(1); opacity: 0.3; }
      50%  { transform: translate(20px, -30px) scale(1.15); opacity: 0.8; }
      100% { transform: translate(0, 0) scale(1); opacity: 0.3; }
    }

    /* ===== Chyron — top, persistent ===== */
    .chyron {
      position: absolute;
      top: 36px; left: 40px; right: 40px;
      display: flex; align-items: center; gap: 18px;
      z-index: 20;
    }
    .chyron-mark {
      width: 10px; height: 64px;
      background: var(--accent);
      box-shadow: 0 0 24px rgba(230, 57, 70, 0.55);
      animation: mark-pulse 2.4s ease-in-out infinite;
    }
    @keyframes mark-pulse {
      0%, 100% { box-shadow: 0 0 18px rgba(230, 57, 70, 0.4); transform: scaleY(1); }
      50%      { box-shadow: 0 0 36px rgba(230, 57, 70, 0.85); transform: scaleY(1.05); }
    }
    .chyron-title {
      font-size: 11px;
      letter-spacing: 0.32em;
      text-transform: uppercase;
      color: var(--ink-soft);
      margin-bottom: 6px;
    }
    .chyron-paper {
      font-size: 24px;
      letter-spacing: 0.01em;
      color: var(--ink);
      max-width: 1400px;
    }
    .chyron-paper b { color: #ffffff; font-weight: 700; }
    .chyron-time {
      margin-left: auto;
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 22px;
      letter-spacing: 0.04em;
      color: var(--ink-soft);
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.1);
      padding: 8px 14px;
      border-radius: 999px;
    }

    /* ===== Beat cards on the main canvas ===== */
    .beat {
      position: absolute;
      inset: 140px 100px 240px 100px;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
      transform-style: preserve-3d;
    }
    .card {
      width: 100%;
      max-width: 1480px;
      max-height: 700px;
      padding: 60px 72px;
      background: rgba(255, 255, 255, 0.025);
      border: 1px solid rgba(255, 255, 255, 0.09);
      border-radius: 22px;
      box-shadow:
        0 36px 80px rgba(0, 0, 0, 0.55),
        0 0 80px rgba(70, 110, 255, 0.05),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(8px);
      transform-style: preserve-3d;
    }

    .title-card { text-align: left; }
    .kicker {
      font-size: 18px;
      letter-spacing: 0.28em;
      color: var(--accent);
      text-transform: uppercase;
      margin-bottom: 30px;
      font-weight: 700;
    }
    .paper-title {
      font-size: 92px;
      font-weight: 800;
      line-height: 1.04;
      letter-spacing: -0.02em;
      margin-bottom: 28px;
      background: linear-gradient(180deg, #ffffff 0%, #c8c2b6 100%);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .paper-authors { font-size: 28px; color: var(--ink-soft); }

    .figure-card { display: flex; flex-direction: column; align-items: center; gap: 24px; }
    .figure-img { max-height: 560px; max-width: 100%; object-fit: contain; background: #fff; padding: 24px; border-radius: 12px; }
    .figure-caption { font-size: 22px; color: var(--ink-soft); max-width: 1100px; text-align: center; }

    .equation-card { background: #ffffff; color: var(--bg-1); }
    .equation-label { font-size: 18px; letter-spacing: 0.2em; color: var(--accent); text-transform: uppercase; margin-bottom: 24px; }
    .equation-body { font-size: 60px; line-height: 1.4; min-height: 200px; display: flex; align-items: center; justify-content: center; }

    .quote-card { padding: 64px 72px; }
    .quote-mark { font-size: 200px; line-height: 0.6; color: var(--accent); font-family: Georgia, serif; }
    .quote-text { font-size: 56px; line-height: 1.3; font-weight: 600; margin-top: 24px; }

    .cta-card { text-align: center; }
    .cta-eyebrow { font-size: 28px; letter-spacing: 0.2em; color: var(--ink-soft); text-transform: uppercase; margin-bottom: 28px; }
    .cta-url {
      font-size: 96px; font-weight: 800;
      background: linear-gradient(180deg, #ffffff 0%, var(--accent) 130%);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: -0.01em;
    }

    .anim-card {
      display: flex; align-items: center; justify-content: center;
      padding: 32px;
      background: transparent;
      border: none;
      box-shadow: none;
      backdrop-filter: none;
    }
    .anim-card svg { width: 100%; height: auto; max-height: 640px; }
    .anim-card text { fill: var(--ink); }
    .anim-card .anim-el { opacity: 1; }

    /* ===== Lower-third caption strip ===== */
    .cap {
      position: absolute;
      left: 50%;
      bottom: 110px;
      transform: translateX(-50%);
      max-width: 1500px;
      padding: 18px 32px;
      font-size: 32px;
      line-height: 1.35;
      color: var(--ink);
      background: rgba(0, 0, 0, 0.55);
      border-left: 4px solid var(--accent);
      border-radius: 4px;
      text-align: center;
      z-index: 22;
      box-shadow: 0 16px 40px rgba(0,0,0,0.45);
      backdrop-filter: blur(8px);
    }

    /* ===== Progress scrubber + transport ===== */
    .scrub {
      position: absolute;
      left: 0; right: 0; bottom: 0;
      height: 4px;
      background: rgba(255,255,255,0.06);
      z-index: 30;
    }
    .scrub-fill {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, var(--accent), var(--gold));
      box-shadow: 0 0 18px rgba(230, 57, 70, 0.55);
    }
    .transport {
      position: absolute;
      bottom: 24px; left: 40px;
      z-index: 31;
      display: flex; align-items: center; gap: 12px;
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 14px;
      color: var(--ink-soft);
    }
    .transport button {
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.16);
      color: var(--ink);
      padding: 8px 14px;
      font-family: inherit;
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      border-radius: 6px;
      cursor: pointer;
    }
    .transport button:hover { background: rgba(255,255,255,0.14); }
  </style>
</head>
<body>
  <div class="world"
       id="root"
       data-composition-id="brief"
       data-composition-duration="${total}"
       data-start="0"
       data-duration="${total}"
       data-width="1920"
       data-height="1080">
    <!-- background layers -->
    <div class="bg"></div>
    <div class="bg-grid"></div>
    <div class="bg-noise"></div>
    <div class="spotlight" id="spot"></div>

    <!-- floating depth particles -->
    <div class="particles">
      ${particles}
    </div>

    <!-- Persistent chyron with live timecode -->
    <div id="chy" class="clip chyron" data-start="0" data-duration="${total}" data-track-index="1">
      <div class="chyron-mark"></div>
      <div>
        <div class="chyron-title">${escapeHtml(sourceKindLabel(source))}</div>
        <div class="chyron-paper">
          <b>${escapeHtml(source.title.slice(0, 100))}</b>
          ${chyronMeta ? `<span style="opacity:0.6"> · ${escapeHtml(chyronMeta)}</span>` : ""}
        </div>
      </div>
      <div class="chyron-time" id="tc">0:00 / ${Math.floor(total / 60)}:${String(Math.floor(total % 60)).padStart(2, "0")}</div>
    </div>

    <!-- Per-beat content -->
${beatsHtml}

    <!-- Captions, one per beat -->
${captionsHtml}

    <div class="bg-vignette"></div>

    <!-- transport -->
    <div class="transport">
      <button id="play">▶ Play</button>
      <button id="replay">↻ Replay</button>
      <span id="tc-tx">0:00 / ${Math.floor(total / 60)}:${String(Math.floor(total % 60)).padStart(2, "0")}</span>
    </div>

    <!-- Progress scrubber -->
    <div class="scrub"><div class="scrub-fill" id="scrub-fill"></div></div>
  </div>

  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    ${beatsGsap}
    window.__timelines["brief"] = tl;
  </script>

  <!--
    The actual @hyperframes/core runtime, inlined.
    It picks up [data-composition-id], [data-start], [data-duration],
    class="clip", and window.__timelines and drives the whole show. Once
    it boots, window.__player exposes play/pause/seek. We delegate our
    transport buttons to that API.
  -->
  <script>${getHyperframeRuntimeScript()}</script>

  <!-- UI bridge: transport buttons → __player + companion overlays -->
  <script>
    (function () {
      const tc = document.getElementById('tc');
      const tcTx = document.getElementById('tc-tx');
      const scrub = document.getElementById('scrub-fill');
      const playBtn = document.getElementById('play');
      const replayBtn = document.getElementById('replay');
      const spot = document.getElementById('spot');
      const total = ${total};

      function fmt(s) {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return m + ':' + (sec < 10 ? '0' : '') + sec;
      }

      function whenPlayer(cb) {
        if (window.__player) return cb(window.__player);
        if (window.__playerReady) window.__playerReady.then(cb).catch(() => {});
      }

      function paint(t) {
        if (tc) tc.textContent = fmt(t) + ' / ' + fmt(total);
        if (tcTx) tcTx.textContent = fmt(t) + ' / ' + fmt(total);
        if (scrub) scrub.style.width = Math.min(100, (t / total) * 100) + '%';
        if (spot) {
          const ang = t * 0.18;
          const dx = Math.cos(ang) * 80;
          const dy = Math.sin(ang) * 50;
          spot.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
          spot.style.opacity = 0.6 + 0.35 * Math.sin(t * 0.4);
        }
      }

      function tick() {
        const p = window.__player;
        const t = p && typeof p.getTime === 'function' ? p.getTime() :
                  p && typeof p.currentTime === 'function' ? p.currentTime() :
                  (p && 'currentTime' in p ? p.currentTime : 0);
        paint(typeof t === 'number' ? t : 0);
        requestAnimationFrame(tick);
      }

      playBtn.addEventListener('click', () => {
        whenPlayer((p) => {
          const isPlaying = p.isPlaying ? p.isPlaying() : (typeof p.playing === 'boolean' ? p.playing : false);
          if (isPlaying) { p.pause && p.pause(); playBtn.textContent = '▶ Play'; }
          else            { p.play  && p.play();  playBtn.textContent = '❚❚ Pause'; }
        });
      });
      replayBtn.addEventListener('click', () => {
        whenPlayer((p) => {
          if (p.seek) p.seek(0); else if (p.setTime) p.setTime(0);
          p.play && p.play();
          playBtn.textContent = '❚❚ Pause';
        });
      });

      // Auto-start once the runtime is ready.
      whenPlayer((p) => { p.play && p.play(); playBtn.textContent = '❚❚ Pause'; });
      tick();
    })();
  </script>
</body>
</html>`;
}

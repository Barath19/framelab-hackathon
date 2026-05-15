/**
 * Hyperframes composer — polished pass.
 *
 * Takes the brief (script + beats), the source (paper / article / repo),
 * and the narrator MP4. Emits a Hyperframes index.html with:
 *
 *   - Animated background (slow radial drift + scrolling grid)
 *   - Persistent top chyron (kind label + title + byline + LIVE timecode)
 *   - Bottom-right avatar PIP (rounded frame, BRIEF corner badge,
 *     gentle breath pulse, name strap underneath)
 *   - Per-beat content cards with three transition variants chosen by
 *     beat index (slide-up / wipe-from-left / scale-in)
 *   - A thin progress scrubber pinned to the bottom edge
 *   - CTA card held a beat longer with a slow zoom-out
 *
 * The composition runs deterministically: the narrator <video> drives a
 * single time source — clip visibility (data-start/data-duration), the
 * GSAP beat timeline (tl.totalTime(video.currentTime)), the live
 * timecode, and the progress scrubber are all derived from one rAF tick.
 */

import type { Beat, Brief } from "./brief";
import type { Animation } from "./animator";
import type { Source } from "./source";
import { sourceFigures, sourceKindLabel, sourceMetaLine } from "./source";

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** 3 transition variants — picked by index % 3. */
function transitionFor(i: number): "slide" | "wipe" | "scale" {
  return ["slide", "wipe", "scale"][i % 3] as "slide" | "wipe" | "scale";
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

export function buildComposition(opts: {
  source: Source;
  brief: Brief;
  narratorUrl: string;
  durationSeconds: number;
  animations?: Record<number, Animation>;
}): string {
  const { source, brief, narratorUrl, durationSeconds, animations = {} } = opts;
  const total = Math.max(durationSeconds, 30);
  const beats = [...brief.beats].sort((a, b) => a.at - b.at);
  const durs = computeBeatDurations(beats, total);

  const beatsHtml = beats
    .map((b, i) => beatHtml(b, source, i, durs[i], animations[i]))
    .filter(Boolean)
    .join("\n");

  const chyronMeta = sourceMetaLine(source);

  // Per-beat entrance GSAP. Animation beats also append their own offset GSAP.
  const beatsGsap = beats
    .map((b, i) => {
      const at = b.at;
      const trans = transitionFor(i);
      let enter = "";
      if (trans === "slide") {
        enter = `tl.fromTo("#b${i} > .card", { y: 80, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: "power3.out" }, ${at})`;
      } else if (trans === "wipe") {
        enter = `tl.fromTo("#b${i} > .card", { x: -120, opacity: 0, clipPath: "inset(0 100% 0 0)" }, { x: 0, opacity: 1, clipPath: "inset(0 0% 0 0)", duration: 0.8, ease: "power3.out" }, ${at})`;
      } else {
        enter = `tl.fromTo("#b${i} > .card", { scale: 0.86, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.7, ease: "back.out(1.4)" }, ${at})`;
      }
      // CTA gets a slow held zoom-out for extra weight.
      const ctaHold =
        b.show.type === "cta"
          ? `\n      tl.to("#b${i} > .card", { scale: 1.04, duration: ${Math.max(durs[i] - 1, 1.5)}, ease: "sine.inOut" }, ${at + 0.5})`
          : "";
      if (b.show.type !== "animation") return enter + ctaHold;
      const anim = animations[i];
      if (!anim || !anim.gsap) return enter;
      // Offset every relative tl.* call in the animator's body by the beat's
      // start time so its internal motion runs aligned to the narrator.
      const body = anim.gsap.replace(
        /tl\.(from|to|fromTo|set)\s*\(([\s\S]*?),\s*([^)]*?)\)\s*;?/g,
        (_m, fn, args, pos) => {
          const trimmedPos = pos.trim();
          const offset = trimmedPos === "" ? `${at}` : `(${trimmedPos}) + ${at}`;
          return `tl.${fn}(${args}, ${offset});`;
        },
      );
      return `${enter}\n      ${body}`;
    })
    .join("\n      ");

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
      --grid: rgba(255,255,255,0.04);
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 1920px; height: 1080px; overflow: hidden;
      background: var(--bg-0);
      color: var(--ink);
      font-family: "Helvetica Neue", Arial, sans-serif;
    }

    /* ===== Animated background ===== */
    .bg {
      position: absolute; inset: 0; z-index: 0;
      background:
        radial-gradient(1400px 800px at 20% 20%, rgba(40, 70, 180, 0.35), transparent 60%),
        radial-gradient(1200px 900px at 80% 80%, rgba(150, 30, 60, 0.28), transparent 65%),
        linear-gradient(180deg, var(--bg-0) 0%, var(--bg-1) 60%, var(--bg-2) 100%);
    }
    .bg-grid {
      position: absolute; inset: 0; z-index: 0;
      background-image:
        linear-gradient(to right, var(--grid) 1px, transparent 1px),
        linear-gradient(to bottom, var(--grid) 1px, transparent 1px);
      background-size: 64px 64px;
      mask-image: radial-gradient(ellipse at center, black 40%, transparent 80%);
    }
    .bg-noise {
      position: absolute; inset: 0; z-index: 0; pointer-events: none;
      opacity: 0.05;
      background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
    }
    .bg-glow {
      position: absolute;
      width: 1400px; height: 1400px;
      left: -300px; top: -300px;
      z-index: 0;
      background: radial-gradient(circle, rgba(40, 90, 220, 0.18), transparent 60%);
      filter: blur(40px);
    }

    /* ===== Chyron — top-left, persistent ===== */
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
      max-width: 1300px;
    }
    .chyron-paper b { color: #ffffff; font-weight: 700; }
    .chyron-time {
      margin-left: auto;
      font-family: ui-monospace, "SF Mono", monospace;
      font-size: 22px;
      letter-spacing: 0.04em;
      color: var(--ink-soft);
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.1);
      padding: 8px 14px;
      border-radius: 999px;
    }

    /* ===== PIP avatar — bottom-right ===== */
    .pip-wrap {
      position: absolute;
      bottom: 64px; right: 40px;
      width: 320px;
      z-index: 20;
      display: flex; flex-direction: column; align-items: center; gap: 10px;
    }
    .pip {
      width: 320px; height: 320px;
      border-radius: 16px;
      overflow: hidden;
      position: relative;
      box-shadow:
        0 24px 60px rgba(0, 0, 0, 0.65),
        0 0 0 3px rgba(255, 255, 255, 0.9) inset,
        0 0 0 6px rgba(0, 0, 0, 0.85) inset;
      animation: breath 6s ease-in-out infinite;
    }
    @keyframes breath {
      0%, 100% { transform: scale(1); }
      50%      { transform: scale(1.012); }
    }
    .pip video { width: 100%; height: 100%; object-fit: cover; display: block; }
    .pip-badge {
      position: absolute;
      top: 12px; left: 12px;
      font-family: ui-monospace, "SF Mono", monospace;
      font-size: 10px;
      letter-spacing: 0.18em;
      color: white;
      background: var(--accent);
      padding: 5px 9px;
      border-radius: 4px;
      font-weight: 700;
    }
    .pip-strap {
      width: 100%;
      text-align: center;
      font-family: ui-monospace, "SF Mono", monospace;
      font-size: 14px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--ink-soft);
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      padding: 8px 14px;
      border-radius: 6px;
    }

    /* ===== Beat cards on the main canvas ===== */
    .beat {
      position: absolute;
      inset: 140px 420px 140px 80px; /* leave room for chyron + PIP */
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
    }
    .card {
      width: 100%;
      max-width: 1280px;
      max-height: 720px;
      padding: 56px 64px;
      background: rgba(255, 255, 255, 0.025);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 18px;
      box-shadow:
        0 24px 60px rgba(0, 0, 0, 0.45),
        inset 0 1px 0 rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(6px);
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
      font-size: 88px;
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
    .figure-img { max-height: 600px; max-width: 100%; object-fit: contain; background: #fff; padding: 24px; border-radius: 10px; }
    .figure-caption { font-size: 22px; color: var(--ink-soft); max-width: 1100px; text-align: center; }

    .equation-card { background: #ffffff; color: var(--bg-1); }
    .equation-label { font-size: 18px; letter-spacing: 0.2em; color: var(--accent); text-transform: uppercase; margin-bottom: 24px; }
    .equation-body { font-size: 60px; line-height: 1.4; min-height: 200px; display: flex; align-items: center; justify-content: center; }

    .quote-card { padding: 64px 72px; }
    .quote-mark { font-size: 200px; line-height: 0.6; color: var(--accent); font-family: Georgia, serif; }
    .quote-text { font-size: 52px; line-height: 1.3; font-weight: 600; margin-top: 24px; }

    .cta-card { text-align: center; }
    .cta-eyebrow { font-size: 26px; letter-spacing: 0.2em; color: var(--ink-soft); text-transform: uppercase; margin-bottom: 28px; }
    .cta-url {
      font-size: 88px; font-weight: 800;
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
    }
    .anim-card svg { width: 100%; height: auto; max-height: 700px; }
    .anim-card text { fill: var(--ink); }
    .anim-card .anim-el { opacity: 1; }

    /* ===== Progress scrubber ===== */
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
      transition: width 0.12s linear;
    }
  </style>
</head>
<body>
  <!-- background layers -->
  <div class="bg"></div>
  <div class="bg-grid"></div>
  <div class="bg-glow"></div>
  <div class="bg-noise"></div>

  <div id="root"
       data-composition-id="brief"
       data-start="0"
       data-duration="${total}"
       data-width="1920"
       data-height="1080">

    <!-- Avatar PIP, plays for full duration -->
    <div id="narrator" class="clip pip-wrap" data-start="0" data-duration="${total}" data-track-index="1">
      <div class="pip">
        <div class="pip-badge">BRIEF</div>
        <video src="${escapeHtml(narratorUrl)}" autoplay muted playsinline></video>
      </div>
      <div class="pip-strap">Narrator · live</div>
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
    Inline Hyperframes-compatible runtime. The narrator <video> is the
    single time source — clip visibility, GSAP timeline, live timecode,
    and progress scrubber are all derived from one rAF tick.
  -->
  <script>
    (function () {
      const clips = Array.from(document.querySelectorAll('.clip'));
      for (const c of clips) {
        if (c.dataset.trackIndex === '2') c.style.opacity = '0';
        c.style.transition = 'opacity 0.32s ease';
      }
      const video = document.querySelector('.pip video');
      const tc = document.getElementById('tc');
      const scrub = document.getElementById('scrub-fill');
      const tl = (window.__timelines || {})['brief'];
      const total = ${total};

      function fmt(s) {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return m + ':' + (sec < 10 ? '0' : '') + sec;
      }
      function apply(t) {
        for (const c of clips) {
          if (c.dataset.trackIndex !== '2') continue;
          const s = parseFloat(c.dataset.start);
          const d = parseFloat(c.dataset.duration);
          c.style.opacity = (t >= s && t < s + d) ? '1' : '0';
        }
        if (tl) tl.totalTime(t);
        if (tc) tc.textContent = fmt(t) + ' / ' + fmt(total);
        if (scrub) scrub.style.width = Math.min(100, (t / total) * 100) + '%';
      }

      let raf;
      function tick() {
        apply(video.currentTime);
        raf = requestAnimationFrame(tick);
      }

      if (video) {
        video.addEventListener('play', () => { cancelAnimationFrame(raf); tick(); });
        video.addEventListener('pause', () => cancelAnimationFrame(raf));
        video.addEventListener('seeked', () => apply(video.currentTime));
        video.addEventListener('loadedmetadata', () => apply(0));
        video.play().catch(() => {});
      }
    })();
  </script>
</body>
</html>`;
}

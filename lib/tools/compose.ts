/**
 * Hyperframes composer.
 *
 * Takes the brief (script + beats) + the paper + the HeyGen narrator MP4
 * and emits a Hyperframes index.html. The composition runs for the duration
 * of the narrator clip (~75s), shows the avatar in a bottom-right PIP, and
 * cycles main-canvas content (title, figure, equation, quote, cta) at each
 * beat's `at` timestamp.
 *
 * We don't run `hyperframes render` from the API route — that would take 60s+
 * and tie up the server. Instead we serve the composition HTML as a static
 * route the client can preview in an iframe, which is identical to what the
 * final MP4 would render.
 */

import type { Beat, Brief } from "./brief";
import type { ArxivPaper } from "./arxiv";

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function beatHtml(b: Beat, paper: ArxivPaper, index: number, durSec: number) {
  const id = `b${index}`;
  const common = `id="${id}" class="clip beat" data-start="${b.at}" data-duration="${durSec}" data-track-index="2"`;

  switch (b.show.type) {
    case "title":
      return `
<div ${common}>
  <div class="title-card">
    <div class="paper-id">${escapeHtml(paper.id)} · ${escapeHtml(paper.publishedAt.slice(0, 4))}</div>
    <h1 class="paper-title">${escapeHtml(paper.title)}</h1>
    <div class="paper-authors">${escapeHtml(paper.authors.slice(0, 6).join(" · "))}${
      paper.authors.length > 6 ? " et al." : ""
    }</div>
  </div>
</div>`;
    case "figure": {
      const fig = paper.figures[b.show.index];
      if (!fig) return "";
      return `
<div ${common}>
  <div class="figure-card">
    <img class="figure-img" src="${escapeHtml(fig.imageUrl)}" alt="Figure ${b.show.index + 1}" />
    <div class="figure-caption">FIG ${b.show.index + 1} — ${escapeHtml((b.show.caption || fig.caption || "").slice(0, 160))}</div>
  </div>
</div>`;
    }
    case "equation":
      return `
<div ${common}>
  <div class="equation-card">
    <div class="equation-label">Key equation</div>
    <div class="equation-body">\\[${b.show.latex.replace(/\\/g, "\\\\")}\\]</div>
  </div>
</div>`;
    case "quote":
      return `
<div ${common}>
  <div class="quote-card">
    <div class="quote-mark">"</div>
    <div class="quote-text">${escapeHtml(b.show.text)}</div>
  </div>
</div>`;
    case "cta":
      return `
<div ${common}>
  <div class="cta-card">
    <div class="cta-eyebrow">Read the full paper</div>
    <div class="cta-url">arxiv.org/abs/${escapeHtml(paper.id)}</div>
  </div>
</div>`;
  }
}

function computeBeatDurations(beats: Beat[], total: number): number[] {
  // Each beat lasts from its `at` to the next beat's `at` (or `total`).
  const sorted = [...beats].sort((a, b) => a.at - b.at);
  return sorted.map((b, i) =>
    Math.max(1, (sorted[i + 1]?.at ?? total) - b.at),
  );
}

export function buildComposition(opts: {
  paper: ArxivPaper;
  brief: Brief;
  narratorUrl: string;
  durationSeconds: number;
}): string {
  const { paper, brief, narratorUrl, durationSeconds } = opts;
  const total = Math.max(durationSeconds, 30);
  const beats = [...brief.beats].sort((a, b) => a.at - b.at);
  const durs = computeBeatDurations(beats, total);

  const beatsHtml = beats
    .map((b, i) => beatHtml(b, paper, i, durs[i]))
    .filter(Boolean)
    .join("\n");

  // GSAP entrance animation per beat (from below).
  const beatsGsap = beats
    .map(
      (_, i) =>
        `tl.fromTo("#b${i} > div", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "power3.out" }, ${beats[i].at})`,
    )
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
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 1920px; height: 1080px; overflow: hidden; background: #0a0f1e; color: #f5efe5; font-family: "Helvetica Neue", Arial, sans-serif; }

    .stage { position: absolute; inset: 0; }

    /* Chyron — top-left, persistent */
    .chyron {
      position: absolute;
      top: 32px; left: 36px;
      max-width: 1100px;
      display: flex; align-items: center; gap: 16px;
      z-index: 10;
    }
    .chyron-mark { width: 8px; height: 56px; background: #e63946; }
    .chyron-paper {
      font-size: 22px;
      letter-spacing: 0.04em;
      color: #f5efe5; opacity: 0.95;
    }
    .chyron-paper b { color: #ffffff; font-weight: 700; }

    /* Avatar PIP — bottom-right */
    .pip {
      position: absolute;
      bottom: 36px; right: 36px;
      width: 320px; height: 320px;
      border-radius: 4px;
      overflow: hidden;
      box-shadow: 0 8px 40px rgba(0,0,0,0.5), 0 0 0 4px #fff inset;
      z-index: 10;
    }
    .pip video { width: 100%; height: 100%; object-fit: cover; display: block; }

    /* Beat cards on the main canvas — centered */
    .beat {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 80px 220px 80px 80px;
    }

    .title-card { max-width: 1300px; }
    .paper-id { font-size: 22px; letter-spacing: 0.18em; color: #e63946; text-transform: uppercase; margin-bottom: 24px; }
    .paper-title { font-size: 92px; font-weight: 800; line-height: 1.05; margin-bottom: 28px; }
    .paper-authors { font-size: 30px; color: #c8c2b6; }

    .figure-card { display: flex; flex-direction: column; align-items: center; gap: 24px; max-width: 1300px; }
    .figure-img { max-height: 720px; max-width: 100%; object-fit: contain; background: #fff; padding: 24px; border-radius: 6px; }
    .figure-caption { font-size: 22px; color: #c8c2b6; max-width: 1100px; text-align: center; }

    .equation-card { background: #fff; color: #0a0f1e; padding: 64px 100px; border-radius: 8px; max-width: 1200px; }
    .equation-label { font-size: 18px; letter-spacing: 0.2em; color: #e63946; text-transform: uppercase; margin-bottom: 24px; }
    .equation-body { font-size: 64px; line-height: 1.4; min-height: 200px; display: flex; align-items: center; justify-content: center; }

    .quote-card { max-width: 1200px; }
    .quote-mark { font-size: 200px; line-height: 0.6; color: #e63946; font-family: Georgia, serif; }
    .quote-text { font-size: 56px; line-height: 1.3; font-weight: 600; margin-top: 24px; }

    .cta-card { text-align: center; }
    .cta-eyebrow { font-size: 28px; letter-spacing: 0.18em; color: #c8c2b6; text-transform: uppercase; margin-bottom: 28px; }
    .cta-url { font-size: 88px; font-weight: 800; color: #e63946; }
  </style>
</head>
<body>
  <div id="root"
       data-composition-id="brief"
       data-start="0"
       data-duration="${total}"
       data-width="1920"
       data-height="1080">

    <!-- Avatar PIP, plays for full duration -->
    <div id="narrator" class="clip pip" data-start="0" data-duration="${total}" data-track-index="1">
      <video src="${escapeHtml(narratorUrl)}" autoplay muted playsinline></video>
    </div>

    <!-- Persistent chyron -->
    <div id="chy" class="clip chyron" data-start="0" data-duration="${total}" data-track-index="1">
      <div class="chyron-mark"></div>
      <div class="chyron-paper">
        <b>${escapeHtml(paper.title.slice(0, 100))}</b><br/>
        ${escapeHtml(paper.authors.slice(0, 3).join(" · "))}${paper.authors.length > 3 ? " et al." : ""} · ${escapeHtml(paper.publishedAt.slice(0, 4))}
      </div>
    </div>

    <!-- Per-beat content -->
${beatsHtml}
  </div>

  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    ${beatsGsap}
    window.__timelines["brief"] = tl;
  </script>

  <!--
    Minimal Hyperframes-compatible runtime, inlined for iframe preview.
    The narrator <video> is the single time source: it drives both clip
    visibility (data-start / data-duration) and the GSAP beat timeline.
    Once the real Hyperframes Studio embeds this composition, it will
    pick up the same data attributes and timeline — this script is
    only here to make the standalone iframe play without the runtime.
  -->
  <script>
    (function () {
      const root = document.querySelector('[data-composition-id]');
      const clips = Array.from(document.querySelectorAll('.clip'));
      // Hide track-2 (per-beat) clips initially; track-1 (PIP + chyron) stays visible.
      for (const c of clips) {
        if (c.dataset.trackIndex === '2') c.style.opacity = '0';
        c.style.transition = 'opacity 0.35s ease';
      }

      const video = document.querySelector('.pip video');
      const tl = (window.__timelines || {})['brief'];

      function applyTime(t) {
        for (const c of clips) {
          if (c.dataset.trackIndex !== '2') continue;
          const s = parseFloat(c.dataset.start);
          const d = parseFloat(c.dataset.duration);
          c.style.opacity = (t >= s && t < s + d) ? '1' : '0';
        }
        if (tl) tl.totalTime(t);
      }

      let raf;
      function tick() {
        applyTime(video.currentTime);
        raf = requestAnimationFrame(tick);
      }

      if (video) {
        video.addEventListener('play', () => { cancelAnimationFrame(raf); tick(); });
        video.addEventListener('pause', () => cancelAnimationFrame(raf));
        video.addEventListener('seeked', () => applyTime(video.currentTime));
        video.addEventListener('loadedmetadata', () => applyTime(0));
        // Some browsers block autoplay until the iframe is visible. Try to start.
        video.play().catch(() => {});
      }
    })();
  </script>
</body>
</html>`;
}

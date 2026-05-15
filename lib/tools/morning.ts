/**
 * Morning composer — emits the Hyperframes HTML for a metric brief.
 *
 * Pure animation. No avatar, no narrator. 4 beats over ~16s:
 *   0s   title card: company + metric name + date range
 *   2s   animated bar chart: bars stagger-grow into place with values
 *   8s   counter: big number ramps from 0 → total renders
 *   12s  milestone callout: peak day + week-over-week %
 *   15s  CTA
 *
 * Everything is Hyperframes-deterministic — motion is a pure function of
 * the timeline `t`, driven by the official @hyperframes/core runtime.
 */

import fs from "node:fs";
import path from "node:path";
import type { MetricSource } from "./posthog";
import { lintHyperframeHtml } from "@hyperframes/core/lint";

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

export function lintComposition(html: string) {
  return lintHyperframeHtml(html);
}

export function buildMorningComposition(metric: MetricSource): string {
  const total = 16;
  const series = metric.metric.series.slice(-21); // up to last 3 weeks
  const maxV = Math.max(...series.map((p) => p.value), 1);
  const peak = metric.metric.peak;
  const wowPct = metric.metric.weekOverWeekPct;
  const totalCount = metric.metric.total;

  // Bar layout
  const chartW = 1380;
  const chartH = 460;
  const barGap = 6;
  const barW = Math.max(8, (chartW - barGap * (series.length - 1)) / series.length);
  const bars = series.map((p, i) => {
    const h = (p.value / maxV) * chartH;
    const x = i * (barW + barGap);
    const y = chartH - h;
    return { x, y, w: barW, h, value: p.value, date: p.date, idx: i };
  });

  const today = new Date(metric.publishedAt);
  const dateLine = today.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1920, height=1080" />
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <style>
    :root {
      --bg-0: #050810;
      --bg-1: #0a1226;
      --bg-2: #131e3e;
      --ink: #f5efe5;
      --ink-soft: #c8c2b6;
      --accent: #ff5566;
      --accent-2: #ffb84a;
      --good: #5cd99c;
      --grid: rgba(255,255,255,0.04);
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 1920px; height: 1080px; overflow: hidden;
      background: var(--bg-0);
      color: var(--ink);
      font-family: "Helvetica Neue", Arial, sans-serif;
    }
    .bg {
      position: absolute; inset: -8%; z-index: 0;
      background:
        radial-gradient(1500px 900px at 25% 25%, rgba(50, 90, 220, 0.32), transparent 60%),
        radial-gradient(1300px 950px at 75% 80%, rgba(255, 85, 102, 0.22), transparent 65%),
        linear-gradient(180deg, var(--bg-0) 0%, var(--bg-1) 60%, var(--bg-2) 100%);
      animation: bg-pan 24s ease-in-out infinite alternate;
    }
    @keyframes bg-pan {
      0%   { transform: translate(-1.5%, -1%); }
      100% { transform: translate(1.5%, 1%); }
    }
    .grid {
      position: absolute; inset: -4%; z-index: 0;
      background-image:
        linear-gradient(to right, var(--grid) 1px, transparent 1px),
        linear-gradient(to bottom, var(--grid) 1px, transparent 1px);
      background-size: 80px 80px;
      mask-image: radial-gradient(ellipse at center, black 35%, transparent 80%);
    }
    .vignette {
      position: absolute; inset: 0; z-index: 25; pointer-events: none;
      background: radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.55) 100%);
    }

    /* Persistent chyron — top */
    .chyron {
      position: absolute; top: 36px; left: 40px; right: 40px;
      display: flex; align-items: center; gap: 18px; z-index: 20;
    }
    .chyron-mark {
      width: 10px; height: 64px;
      background: var(--accent);
      box-shadow: 0 0 24px rgba(255, 85, 102, 0.55);
      animation: mark-pulse 2.4s ease-in-out infinite;
    }
    @keyframes mark-pulse {
      0%, 100% { box-shadow: 0 0 18px rgba(255, 85, 102, 0.4); transform: scaleY(1); }
      50%      { box-shadow: 0 0 36px rgba(255, 85, 102, 0.85); transform: scaleY(1.05); }
    }
    .chyron-kicker {
      font-size: 11px;
      letter-spacing: 0.32em;
      text-transform: uppercase;
      color: var(--ink-soft);
      margin-bottom: 6px;
    }
    .chyron-title {
      font-size: 26px;
      letter-spacing: 0.01em;
      color: var(--ink);
    }
    .chyron-title b { color: #ffffff; font-weight: 700; }
    .chyron-time {
      margin-left: auto;
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 22px;
      color: var(--ink-soft);
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.1);
      padding: 8px 14px;
      border-radius: 999px;
    }

    .stage {
      position: absolute;
      inset: 150px 80px 100px 80px;
      display: flex; align-items: center; justify-content: center;
      z-index: 10;
    }

    /* === Beats === */
    .beat { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
    .card {
      width: 100%; max-width: 1480px; padding: 60px 80px;
      background: rgba(255,255,255,0.025);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 22px;
      box-shadow: 0 36px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.1);
      backdrop-filter: blur(8px);
    }

    .title-card .eyebrow {
      font-size: 18px; letter-spacing: 0.28em; color: var(--accent);
      text-transform: uppercase; font-weight: 700; margin-bottom: 28px;
    }
    .title-card .metric-name {
      font-size: 88px; font-weight: 800; line-height: 1.04; margin-bottom: 22px;
      background: linear-gradient(180deg, #ffffff 0%, #c8c2b6 100%);
      -webkit-background-clip: text; background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .title-card .date-line { font-size: 28px; color: var(--ink-soft); }

    .chart-card svg { width: 100%; height: auto; }
    .chart-card .axis-label {
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 18px; fill: var(--ink-soft);
    }
    .chart-card .axis {
      stroke: rgba(255,255,255,0.18); stroke-width: 1;
    }
    .chart-card .bar { fill: var(--accent); }
    .chart-card .bar-peak { fill: var(--accent-2); }
    .chart-card .bar-label {
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 14px; fill: var(--ink-soft); text-anchor: middle;
    }
    .chart-card .title-row {
      display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 24px;
    }
    .chart-card .lhs .label { font-size: 14px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-soft); }
    .chart-card .lhs .value { font-size: 56px; font-weight: 800; }
    .chart-card .rhs .label { font-size: 14px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-soft); text-align: right; }
    .chart-card .rhs .value { font-size: 32px; font-weight: 700; }
    .chart-card .rhs .value.good { color: var(--good); }
    .chart-card .rhs .value.bad { color: var(--accent); }

    .counter-card { text-align: center; }
    .counter-card .label {
      font-size: 22px; letter-spacing: 0.2em; text-transform: uppercase;
      color: var(--ink-soft); margin-bottom: 24px;
    }
    .counter-card .number {
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 360px; font-weight: 800; line-height: 0.9;
      background: linear-gradient(180deg, #ffffff 0%, var(--accent-2) 110%);
      -webkit-background-clip: text; background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: -0.04em;
    }
    .counter-card .unit { margin-top: 28px; font-size: 26px; color: var(--ink-soft); letter-spacing: 0.08em; text-transform: uppercase; }

    .milestone-card { display: flex; flex-direction: column; align-items: center; text-align: center; }
    .milestone-card .pin {
      width: 18px; height: 18px; background: var(--accent); border-radius: 50%;
      margin-bottom: 28px;
      box-shadow: 0 0 0 8px rgba(255,85,102,0.18), 0 0 32px rgba(255,85,102,0.6);
    }
    .milestone-card .headline {
      font-size: 88px; font-weight: 800; line-height: 1.05; max-width: 1200px; margin-bottom: 28px;
      background: linear-gradient(180deg, #ffffff 0%, #c8c2b6 100%);
      -webkit-background-clip: text; background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .milestone-card .sub {
      font-size: 30px; color: var(--ink-soft); letter-spacing: 0.04em;
    }

    .cta-card { text-align: center; }
    .cta-card .eyebrow {
      font-size: 24px; letter-spacing: 0.22em; color: var(--ink-soft);
      text-transform: uppercase; margin-bottom: 28px;
    }
    .cta-card .line {
      font-size: 76px; font-weight: 800;
      background: linear-gradient(180deg, #ffffff 0%, var(--accent) 130%);
      -webkit-background-clip: text; background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: -0.01em;
    }

    /* Progress scrubber */
    .scrub {
      position: absolute; left: 0; right: 0; bottom: 0;
      height: 4px; background: rgba(255,255,255,0.06); z-index: 30;
    }
    .scrub-fill {
      height: 100%; width: 0%;
      background: linear-gradient(90deg, var(--accent), var(--accent-2));
      box-shadow: 0 0 18px rgba(255, 85, 102, 0.55);
    }
  </style>
</head>
<body>
  <div class="world"
       id="root"
       data-composition-id="morning"
       data-composition-duration="${total}"
       data-start="0"
       data-duration="${total}"
       data-width="1920"
       data-height="1080">

    <div class="bg"></div>
    <div class="grid"></div>

    <!-- Persistent chyron -->
    <div id="chy" class="clip chyron" data-start="0" data-duration="${total}" data-track-index="1">
      <div class="chyron-mark"></div>
      <div>
        <div class="chyron-kicker">Morning Brief</div>
        <div class="chyron-title"><b>${escapeHtml(metric.title)}</b> · ${escapeHtml(metric.source)}</div>
      </div>
      <div class="chyron-time" id="tc">0:00 / 0:${String(total).padStart(2, "0")}</div>
    </div>

    <div class="stage">
      <!-- Beat 1 — Title (0–2s) -->
      <div id="b0" class="clip beat" data-start="0" data-duration="2.4" data-track-index="2">
        <div class="card title-card">
          <div class="eyebrow">Yesterday at framelab</div>
          <div class="metric-name">${escapeHtml(metric.title)}</div>
          <div class="date-line">${escapeHtml(dateLine)}</div>
        </div>
      </div>

      <!-- Beat 2 — Bar chart (2.4–8s) -->
      <div id="b1" class="clip beat" data-start="2.4" data-duration="5.6" data-track-index="2">
        <div class="card chart-card">
          <div class="title-row">
            <div class="lhs">
              <div class="label">Daily ${escapeHtml(metric.metric.event)}</div>
              <div class="value">${totalCount.toLocaleString()} <span style="font-size:24px;color:var(--ink-soft);font-weight:500;letter-spacing:0.08em;text-transform:uppercase">${escapeHtml(metric.metric.unit)}</span></div>
            </div>
            <div class="rhs">
              <div class="label">Week-over-week</div>
              <div class="value ${wowPct >= 0 ? "good" : "bad"}">${wowPct >= 0 ? "▲" : "▼"} ${Math.abs(wowPct)}%</div>
            </div>
          </div>
          <svg viewBox="0 0 ${chartW} ${chartH + 60}" preserveAspectRatio="xMidYMid meet">
            <line class="axis" x1="0" y1="${chartH}" x2="${chartW}" y2="${chartH}" />
            ${bars
              .map((b) => {
                const isPeak = b.value === peak.value;
                return `<rect id="bar-${b.idx}" class="bar ${isPeak ? "bar-peak" : ""}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="2" />
                        <text id="bar-label-${b.idx}" class="bar-label" x="${b.x + b.w / 2}" y="${b.y - 8}" opacity="${isPeak ? 1 : 0}">${b.value}</text>`;
              })
              .join("")}
            ${bars
              .filter((_, i) => i === 0 || i === bars.length - 1 || i % 7 === 0)
              .map(
                (b) =>
                  `<text class="axis-label" x="${b.x + b.w / 2}" y="${chartH + 28}" text-anchor="middle">${b.date.slice(5)}</text>`,
              )
              .join("")}
          </svg>
        </div>
      </div>

      <!-- Beat 3 — Counter (8–12s) -->
      <div id="b2" class="clip beat" data-start="8" data-duration="4" data-track-index="2">
        <div class="card counter-card">
          <div class="label">Total this period</div>
          <div class="number" id="counter">0</div>
          <div class="unit">${escapeHtml(metric.metric.unit)}</div>
        </div>
      </div>

      <!-- Beat 4 — Milestone (12–14.5s) -->
      <div id="b3" class="clip beat" data-start="12" data-duration="2.5" data-track-index="2">
        <div class="card milestone-card">
          <div class="pin"></div>
          <div class="headline">Peak on ${escapeHtml(new Date(peak.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }))}</div>
          <div class="sub">${peak.value} ${escapeHtml(metric.metric.unit.replace("/ day", ""))} in a single day</div>
        </div>
      </div>

      <!-- Beat 5 — CTA (14.5–16s) -->
      <div id="b4" class="clip beat" data-start="14.5" data-duration="1.5" data-track-index="2">
        <div class="card cta-card">
          <div class="eyebrow">See more in PostHog</div>
          <div class="line">framelab.posthog.com</div>
        </div>
      </div>
    </div>

    <div class="vignette"></div>
    <div class="scrub"><div class="scrub-fill" id="scrub"></div></div>
  </div>

  <!-- Hyperframes-driven GSAP timeline -->
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });

    // Beat 1
    tl.fromTo("#b0 .eyebrow",     { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, 0);
    tl.fromTo("#b0 .metric-name", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "power3.out" }, 0.15);
    tl.fromTo("#b0 .date-line",   { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, 0.45);

    // Beat 2 — bars stagger
    tl.from("#b1 > .card",        { y: 60, opacity: 0, duration: 0.6, ease: "power3.out" }, 2.4);
${bars
  .map(
    (b, i) =>
      `    tl.fromTo("#bar-${i}", { attr: { y: ${chartH}, height: 0 } }, { attr: { y: ${b.y}, height: ${b.h} }, duration: 0.7, ease: "back.out(1.6)" }, ${2.6 + i * 0.04});`,
  )
  .join("\n")}
    // peak bar label glows in last
    tl.fromTo("#bar-label-${bars.findIndex((b) => b.value === peak.value)}",
      { opacity: 0, y: ${peak ? bars.find((b) => b.value === peak.value)!.y : 0} + 20 },
      { opacity: 1, y: ${peak ? bars.find((b) => b.value === peak.value)!.y : 0} - 8, duration: 0.5, ease: "power3.out" }, 4.6);

    // Beat 3 — counter ramps
    tl.from("#b2 > .card", { scale: 0.85, opacity: 0, duration: 0.7, ease: "back.out(1.4)" }, 8);
    tl.fromTo({ v: 0 }, { v: 0 }, {
      v: ${totalCount},
      duration: 2.5,
      ease: "power2.out",
      onUpdate: function () {
        const v = Math.round(this.targets()[0].v);
        const el = document.getElementById("counter");
        if (el) el.textContent = v.toLocaleString();
      }
    }, 8.4);

    // Beat 4 — milestone
    tl.from("#b3 > .card", { scale: 0.8, opacity: 0, duration: 0.6, ease: "back.out(1.6)" }, 12);
    tl.from("#b3 .pin",      { scale: 0, duration: 0.5, ease: "back.out(2)" }, 12.2);
    tl.from("#b3 .headline", { y: 40, opacity: 0, duration: 0.5, ease: "power3.out" }, 12.4);
    tl.from("#b3 .sub",      { y: 20, opacity: 0, duration: 0.4, ease: "power3.out" }, 12.7);

    // Beat 5 — CTA
    tl.from("#b4 > .card", { y: 50, opacity: 0, duration: 0.5, ease: "power3.out" }, 14.5);
    tl.to("#b4 > .card",   { scale: 1.04, duration: 1.0, ease: "sine.inOut" }, 15.0);

    window.__timelines["morning"] = tl;
  </script>

  <!-- @hyperframes/core runtime -->
  <script>${getHyperframeRuntimeScript()}</script>

  <!-- Overlay bridge: scrubber + timecode -->
  <script>
    (function () {
      const tc = document.getElementById("tc");
      const scrub = document.getElementById("scrub");
      const total = ${total};
      function fmt(s) {
        const m = Math.floor(s / 60), sec = Math.floor(s % 60);
        return m + ":" + (sec < 10 ? "0" : "") + sec;
      }
      function tick() {
        const p = window.__player;
        const t = p && typeof p.getTime === "function" ? p.getTime() : 0;
        if (tc) tc.textContent = fmt(t) + " / 0:${String(total).padStart(2, "0")}";
        if (scrub) scrub.style.width = Math.min(100, (t / total) * 100) + "%";
        requestAnimationFrame(tick);
      }
      function whenReady(cb) {
        if (window.__player) return cb(window.__player);
        if (window.__playerReady) window.__playerReady.then(cb).catch(() => {});
      }
      whenReady((p) => { p.play && p.play(); });
      tick();
    })();
  </script>
</body>
</html>`;
}

/**
 * Animator agent.
 *
 * Given a paper and one beat's intent ("explain attention"), returns a
 * self-contained chunk of inline SVG/HTML plus a GSAP timeline string that
 * Hyperframes can play deterministically. The output is meant to replace
 * a static figure card on the main canvas.
 *
 * Contract with the composer:
 *  - `html` is one root <div> containing whatever SVG/HTML elements the
 *    animation needs. The composer will wrap it in a Hyperframes clip
 *    with data-start / data-duration; the animator does NOT add those.
 *  - Every animatable element needs a unique id prefixed by the beat id
 *    (`#bN-…`) so the GSAP string can target it without collisions.
 *  - `gsap` is a fragment of JS that runs in the *same scope* as the
 *    composition's main `tl` variable. Use only relative `tl.from/to`
 *    calls — the composer offsets them by the beat's `at` automatically.
 *    NO Math.random, NO Date.now, NO fetch — pure timeline state.
 */

import { openai } from "../openai";
import type { Source } from "./source";
import { sourceBody } from "./source";

export type Animation = {
  html: string;
  gsap: string;
};

const SYSTEM = `You are a science-explainer animator. You translate one
specific concept from a research paper into a 4-7 second inline SVG/HTML
animation that plays inside a Hyperframes timeline. The avatar narrator is
in a small bottom-right PIP — your animation owns the main canvas
(roughly 1700x900px, dark background).

OUTPUT
Return ONLY this JSON object, no prose, no markdown fences:
{
  "html": string,   // a single <div>...</div> root with inline SVG + text
  "gsap": string    // JS body that uses 'tl.from(...)' / 'tl.to(...)' calls
}

DESIGN RULES
- Bold typography, generous spacing, large hit targets — this is screen
  content, not a figure thumbnail. Default text size 28-36px, headings 44-72px.
- Black/white/gradient is fine. Accent: red (#e63946) or gold (#f4c542).
- Use SVG for diagrams: rects, lines, paths, circles, arrows. NO external
  assets, NO web fonts, NO Math.random.
- All animated elements MUST have unique ids prefixed by the beat id you
  receive. E.g. for beat id 'b2', use '#b2-box1', '#b2-arrow1', etc.
- Use class="anim-el" on any element you animate so the composer can
  initialize it hidden.

ANIMATION
- Use only relative GSAP times. The composer offsets your timeline by the
  beat's start time. Start your first call at time 0, your last finishes
  before the duration ends.
- Prefer .from(...) with {opacity:0, y/x:N} for entrances, .to(...) for
  payoffs. Stagger by index when revealing groups.
- Always restore to a clean held state at the end so the last frame reads.

PATTERNS YOU CAN USE
- concept-flow: boxes connected by arrows; tokens flow through.
- equation-build: each term of a formula fades in in order with arrows.
- token-attention: a row of word tokens, then attention lines drawing
  between them with varying opacity (weights).
- bar-grow: a bar chart whose bars grow from 0 to value.
- side-by-side: two diagrams with a vs. between them.
- callout: one big number/word ramping in, label underneath.

CODE / ARCHITECTURE PATTERNS (for repo sources)
- file-tree: lines of monospace text with file/folder icons appearing
  one row at a time. Treat dirs as 📁 (or rect+label), files as 📄.
- module-graph: rounded rect modules connected by arrows showing imports
  or call directions; light up an active path while others dim.
- request-flow: a small token (pulsing circle) travels along an arrow
  path through 3-5 labeled stages (Request → Router → Handler →
  Database → Response).
- code-type-on: a monospace block where lines reveal character-by-character
  (use stagger across many <tspan> elements). Use real method/identifier
  names from the entry point when relevant.
- stack-build: layers of a stack stacking from bottom (e.g. UI / API /
  Engine / Storage), each labeled, snapping into place.
- pipeline: source on the left, sink on the right, three or four
  transform stages in between with data dots flowing through.

DON'T
- Do not include <html>/<head>/<body>.
- Do not import GSAP — it's already loaded.
- Do not reference the narrator video or anything outside your <div>.
- Do not exceed ~6 seconds of animation including holds.`;

export async function animateBeat(opts: {
  source: Source;
  beatId: string;
  intent: string;
  durationSeconds: number;
}): Promise<Animation> {
  const { source, beatId, intent, durationSeconds } = opts;

  let sourceBlock: string;
  if (source.kind === "arxiv") {
    sourceBlock = `Paper: "${source.title}" (${source.id})
Abstract: ${sourceBody(source).slice(0, 800)}`;
  } else if (source.kind === "news") {
    sourceBlock = `Article: "${source.title}" — ${source.source || "(source)"}
Lede: ${sourceBody(source).slice(0, 800)}`;
  } else if (source.kind === "repo") {
    const treeSample = source.tree
      .slice(0, 16)
      .map((n) => `${n.type === "dir" ? "[dir]" : "[file]"} ${n.path}`)
      .join("\n");
    sourceBlock = `Repo: "${source.title}" (${source.language || "?"}, ★${source.stars})
Description: ${source.abstract.slice(0, 500)}
Entry point: ${source.entry || "(unknown)"}
Top-level tree:
${treeSample}`;
  } else {
    // metric
    const tail = source.metric.series.slice(-7);
    sourceBlock = `Metric: "${source.title}" (${source.metric.event}, ${source.metric.unit})
Source: ${source.source}
Total ${source.metric.total.toLocaleString()} · peak ${source.metric.peak.value} on ${source.metric.peak.date}
Last week vs prior: ${source.metric.weekOverWeekPct >= 0 ? "+" : ""}${source.metric.weekOverWeekPct}%
Last 7 datapoints (date → value):
${tail.map((p) => `  ${p.date}: ${p.value}`).join("\n")}`;
  }

  const userMsg = `${sourceBlock}

Beat id: ${beatId}    (use #${beatId}-... for every element id)
Duration budget: ~${durationSeconds.toFixed(1)}s
What to show: ${intent}

Design the animation. Return the JSON only.`;

  const resp = await openai().chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    temperature: 0.7,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: userMsg },
    ],
  });

  const raw = resp.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as Animation;
  return {
    html: parsed.html ?? "",
    gsap: parsed.gsap ?? "",
  };
}

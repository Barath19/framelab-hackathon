import { openai } from "../openai";
import type { Source } from "./source";
import { sourceBody } from "./source";

export type Beat = {
  at: number; // seconds into the narration
  show:
    | { type: "title" }
    | { type: "figure"; index: number; caption?: string }
    | { type: "equation"; latex: string }
    | { type: "quote"; text: string }
    | { type: "cta" }
    | { type: "animation"; intent: string }; // explained by the Animator agent
};

export type Brief = {
  hook: string; // 1-sentence opener
  script: string; // full ~20s narration
  beats: Beat[];
};

const SYSTEM = `You write a 20-second video narration plus a parallel list of
"beats" — visual moments timed against the narration. The source is an arXiv
paper, a news article, or a GitHub code repository. Tone follows the source:
  - arXiv → an AI science communicator explaining the paper.
  - news → a news anchor / explainer host summarizing the story.
  - repo → a developer-relations host explaining what the codebase does
           and how it works architecturally.

Rules:
- The script must sound natural spoken aloud. 55-65 words total.
- Open with a one-sentence hook.
- For arXiv: cover problem → idea → why it matters.
- For news: cover what happened → why → what's next.
- For repo: cover what it does → how it works (architecture) → why dev should care.
- End with a half-second CTA ("read the full paper" / "read the full story" /
  "star the repo").
- Use 3-4 beats total spanning 0..20s. Pace: ~5-7s per beat.
- 'figure' beats reference figure indexes from the source's figures array.
- 'equation' beats use plain LaTeX (no $$ markers).
- 'animation' beats describe what to visualize in plain English. STRONGLY
  PREFER animation beats for repos — code architecture is visual: file
  trees sliding in, modules connected by arrows, data flowing through a
  pipeline, a request traveling from entry point to handler. The
  downstream Animator agent will generate SVG/GSAP.
- Always start with { at: 0, show: { type: 'title' } } and end with
  { type: 'cta' } around 17s.

Return ONLY JSON. No prose, no markdown.

Schema:
{
  "hook": string,
  "script": string,
  "beats": [{ "at": number, "show": { "type": "title" } | { "type": "figure", "index": number, "caption"?: string } | { "type": "equation", "latex": string } | { "type": "quote", "text": string } | { "type": "cta" } | { "type": "animation", "intent": string } }]
}`;

export async function generateBrief(source: Source): Promise<Brief> {
  const kindLabel =
    source.kind === "arxiv"
      ? "arXiv paper"
      : source.kind === "news"
      ? "news article"
      : "GitHub repository";

  const figureList = source.figures
    .map((f, i) => `  [${i}] ${f.caption || "(no caption)"}`)
    .join("\n");

  let meta: string;
  if (source.kind === "arxiv") {
    meta = `Authors: ${source.authors.join(", ")}\nPublished: ${source.publishedAt}`;
  } else if (source.kind === "news") {
    meta = `Byline: ${source.authors.join(", ") || "—"}\nPublication: ${source.source || "—"}\nPublished: ${source.publishedAt}`;
  } else if (source.kind === "repo") {
    const treeSample = source.tree
      .slice(0, 14)
      .map((n) => `${n.type === "dir" ? "📁" : "📄"} ${n.path}`)
      .join("\n");
    meta =
      `Owner: ${source.authors[0]}\n` +
      `Language: ${source.language || "?"}\n` +
      `Stars: ${source.stars.toLocaleString()}\n` +
      `Topics: ${source.topics.join(", ") || "—"}\n` +
      `Entry point: ${source.entry || "(not detected)"}\n` +
      `Top-level tree (first 14):\n${treeSample}`;
  } else {
    // metric (PostHog)
    const tail = source.metric.series.slice(-7);
    meta =
      `Source: ${source.source}\n` +
      `Event: ${source.metric.event} · Unit: ${source.metric.unit}\n` +
      `Total ${source.metric.total.toLocaleString()} · Peak ${source.metric.peak.value} on ${source.metric.peak.date}\n` +
      `Week-over-week: ${source.metric.weekOverWeekPct >= 0 ? "+" : ""}${source.metric.weekOverWeekPct}%\n` +
      `Last 7 days:\n${tail.map((p) => `  ${p.date}: ${p.value}`).join("\n")}`;
  }

  const userMsg = `Source kind: ${kindLabel}
Title: ${source.title}
${meta}

Body:
${sourceBody(source).slice(0, 5000)}

Figures available (you may reference by index):
${figureList || "  (none — work from text)"}

Write the brief.`;

  const resp = await openai().chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: userMsg },
    ],
    response_format: { type: "json_object" },
    temperature: 0.6,
  });

  const raw = resp.choices[0]?.message?.content ?? "{}";
  return JSON.parse(raw) as Brief;
}

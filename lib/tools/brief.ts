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
"beats" — visual moments timed against the narration. The source is either a
research paper (arXiv) or a news article. Tone follows the source:
  - arXiv → an AI science communicator explaining the paper.
  - news → a news anchor / explainer host summarizing the story.

Rules:
- The script must sound natural spoken aloud. 55-65 words total.
- Open with a one-sentence hook.
- For arXiv: cover problem → idea → why it matters.
- For news: cover what happened → why → what's next.
- End with a half-second CTA ("read the full paper" / "read the full story").
- Use 3-4 beats total spanning 0..20s. Pace: ~5-7s per beat.
- 'figure' beats reference figure indexes from the source's figures array.
- 'equation' beats use plain LaTeX (no $$ markers).
- 'animation' beats describe what to visualize in plain English. PREFER
  animation beats over figure beats when the concept is conceptual
  rather than chart-shaped — a downstream Animator agent generates SVG.
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
    source.kind === "arxiv" ? "arXiv paper" : "news article";
  const figureList = (source.kind === "arxiv" ? source.figures : source.figures)
    .map((f, i) => `  [${i}] ${f.caption || "(no caption)"}`)
    .join("\n");

  const meta =
    source.kind === "arxiv"
      ? `Authors: ${source.authors.join(", ")}\nPublished: ${source.publishedAt}`
      : `Byline: ${source.authors.join(", ") || "—"}\nPublication: ${source.source || "—"}\nPublished: ${source.publishedAt}`;

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

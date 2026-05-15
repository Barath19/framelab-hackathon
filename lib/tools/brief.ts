import { openai } from "../openai";
import type { ArxivPaper } from "./arxiv";

export type Beat = {
  at: number; // seconds into the narration
  show:
    | { type: "title" }
    | { type: "figure"; index: number; caption?: string }
    | { type: "equation"; latex: string }
    | { type: "quote"; text: string }
    | { type: "cta" };
};

export type Brief = {
  hook: string; // 1-sentence opener
  script: string; // full ~75s narration
  beats: Beat[];
};

const SYSTEM = `You are an AI science communicator. You have just read a research paper.
Your job: write a 75-second video narration that explains the paper to a smart non-expert,
and a parallel list of "beats" that direct what should be visible on screen at each time.

Rules:
- The script should sound natural for spoken delivery. Around 180-200 words.
- Open with a hook in one sentence.
- Cover: what problem, what idea, what evidence, why it matters.
- End with a one-line "if you want more, read the full paper" CTA.
- The beats array sequences visual moments to the timeline. The avatar is in
  a small PIP; the rest of the canvas shows beat content.
- Beat times must be monotonically increasing and fit within 0..75s.
- Use 4-7 beats total. Pace: ~10-15s per beat.
- 'figure' beats reference figure indexes from the paper's figures array.
- 'equation' beats use plain LaTeX (no $$ markers).
- Always start with { at: 0, show: { type: 'title' } } and end with { type: 'cta' } near 70s.

Return ONLY JSON. No prose, no markdown.

Schema:
{
  "hook": string,
  "script": string,
  "beats": [{ "at": number, "show": { "type": "title" } | { "type": "figure", "index": number, "caption"?: string } | { "type": "equation", "latex": string } | { "type": "quote", "text": string } | { "type": "cta" } }]
}`;

export async function generateBrief(paper: ArxivPaper): Promise<Brief> {
  const figureList = paper.figures
    .map((f, i) => `  [${i}] ${f.caption || "(no caption)"}`)
    .join("\n");
  const userMsg = `Paper:
Title: ${paper.title}
Authors: ${paper.authors.join(", ")}
Published: ${paper.publishedAt}

Abstract:
${paper.abstract}

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

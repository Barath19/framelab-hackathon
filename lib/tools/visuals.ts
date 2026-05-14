import { openai } from "../openai";
import type { MotifBrief } from "../types";

export type MotifCandidate = {
  index: number;
  prompt: string;
  dataUrl: string; // data:image/png;base64,...
};

/**
 * Build N candidate prompts from the brief — same motif intent, slight
 * compositional variations so the vision critic has real choices.
 */
function candidatePrompts(brief: MotifBrief, n: number): string[] {
  const palette = brief.palette.map((p) => `${p.name} ${p.hex}`).join(", ");
  const base = `
${brief.aesthetic}.
Recurring motif: ${brief.recurringElement}.
Palette (use only these colors, dominant first): ${palette}.
Mood: ${brief.mood}.
No text, no logos, no faces, no watermarks.
Album-cover composition, square, centered subject, generous negative space.
`.trim();

  const variations = [
    "Wide negative space, motif element small and centered, painterly grain.",
    "Tight crop on the motif element, fills 70% of the frame, soft vignette.",
    "Motif element offset to the lower-right third, dramatic light direction.",
    "Two echoes of the motif in soft parallax — main one sharp, echo blurred.",
    "Symmetrical mirror composition, motif reflected across the horizontal center.",
  ];
  return variations.slice(0, n).map((v) => `${base}\n${v}`);
}

/**
 * Generate one motif image. Tries gpt-image-1 first; falls back to dall-e-3.
 * Returns a data: URL so the client can render it directly without storage.
 */
async function generateOne(prompt: string, size = "1024x1024"): Promise<string> {
  try {
    const resp = await openai().images.generate({
      model: "gpt-image-1",
      prompt,
      size: size as "1024x1024",
      n: 1,
    });
    const b64 = resp.data?.[0]?.b64_json;
    if (b64) return `data:image/png;base64,${b64}`;
  } catch {
    // fall through to DALL-E 3
  }

  const resp = await openai().images.generate({
    model: "dall-e-3",
    prompt,
    size: size as "1024x1024",
    n: 1,
    response_format: "b64_json",
  });
  const b64 = resp.data?.[0]?.b64_json;
  if (!b64) throw new Error("Image generation returned no data");
  return `data:image/png;base64,${b64}`;
}

/**
 * Generate N candidate motif images in parallel.
 * Yields each as it resolves so the orchestrator can stream them to the UI.
 */
export async function* generateCandidates(
  brief: MotifBrief,
  n = 3,
): AsyncGenerator<MotifCandidate, void, unknown> {
  const prompts = candidatePrompts(brief, n);
  // Kick off all generations in parallel; surface results as they resolve.
  const inflight = prompts.map(async (prompt, index): Promise<MotifCandidate> => {
    const dataUrl = await generateOne(prompt);
    return { index, prompt, dataUrl };
  });
  // Race-yield as each settles.
  const settled = new Set<number>();
  while (settled.size < inflight.length) {
    const winner = await Promise.race(
      inflight.map(async (p, i) => {
        if (settled.has(i)) return null;
        const c = await p;
        return c;
      }),
    );
    if (winner && !settled.has(winner.index)) {
      settled.add(winner.index);
      yield winner;
    }
  }
}

/**
 * Ask GPT-4o to critique the candidates and pick the winner.
 * Returns the chosen index plus a one-sentence reason.
 */
export async function chooseWinner(
  brief: MotifBrief,
  candidates: MotifCandidate[],
): Promise<{ index: number; reason: string }> {
  const resp = await openai().chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content:
          'You are the Music Director critiquing motif candidates against a brief. ' +
          'Return ONLY JSON: {"index": <0-based>, "reason": "<one sentence>"}.',
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Brief mood: ${brief.mood}\nMotif element: ${brief.recurringElement}\nAesthetic: ${brief.aesthetic}\n\nPick the candidate that most strongly embodies the brief. Penalize generic, busy, or mood-mismatched images.`,
          },
          ...candidates.map((c) => ({
            type: "image_url" as const,
            image_url: { url: c.dataUrl, detail: "low" as const },
          })),
        ],
      },
    ],
  });

  const raw = resp.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw);
  return {
    index: Number.isFinite(parsed.index) ? Math.max(0, Math.min(candidates.length - 1, parsed.index)) : 0,
    reason: typeof parsed.reason === "string" ? parsed.reason : "Best fit.",
  };
}

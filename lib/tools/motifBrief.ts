import { openai } from "../openai";
import type { AudioFacts, MotifBrief, Transcript } from "../types";

const SYSTEM = `You are the Music Director — an AI creative director for indie musicians.
You listen to one track (via lyrics + audio facts) and design a complete visual identity.

Be opinionated. Make creative-director choices a human would. Justify them in the mood phrase.

Return ONLY valid JSON matching the MotifBrief schema. No prose, no markdown fences.

Schema:
{
  "mood": string,                          // one short phrase, e.g. "defiant • slick • paranoid-pop • noir"
  "moodKeywords": string[],                // 3–6 short tags
  "palette": [{ "hex": "#rrggbb", "name": string }],  // 3–5 colors, ordered dark→light
  "aesthetic": string,                     // visual era / film / paint, e.g. "1980s noir pop, soft neon glow, 16mm grain"
  "recurringElement": string,              // the motif itself, one sentence
  "motionVerb": string,                    // one word: stalk | drift | pulse | shatter | float | bloom | glitch | march
  "typeSystem": {
    "family": string,                      // a real Google Font, e.g. "Playfair Display"
    "weight": 400|500|600|700,
    "italic": boolean,
    "tracking": number                     // letter-spacing in em, e.g. -0.02
  },
  "sections": [
    { "start": number, "end": number, "type": "intro"|"verse"|"pre-chorus"|"chorus"|"bridge"|"outro"|"instrumental" }
  ],
  "lyricStyle": "kinetic"|"karaoke"|"cinematic",
  "avatar": {
    "use": boolean,
    "placements": ("lyric-end"|"reel-intro"|"tiktok-drop")[],
    "persona": string                      // one short character note
  },
  "produce": ("canvas"|"cover"|"lyric"|"reel"|"tiktok")[]   // pick which formats fit this track
}`;

export async function generateMotifBrief(
  transcript: Transcript,
  facts: AudioFacts,
  trackName: string,
): Promise<MotifBrief> {
  const user = `Track filename: ${trackName}
Duration: ${facts.durationSeconds.toFixed(1)}s
BPM: ${facts.bpm ?? "unknown"}
Key: ${facts.key ?? "unknown"}
Energy: ${facts.energy ?? "unknown"}

Lyrics (Whisper):
${transcript.text || "[instrumental / no lyrics detected]"}

Design the motif. Reply with the JSON only.`;

  const resp = await openai().chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
    temperature: 0.8,
  });

  const raw = resp.choices[0]?.message?.content ?? "{}";
  return JSON.parse(raw) as MotifBrief;
}

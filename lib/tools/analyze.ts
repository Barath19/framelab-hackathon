import { openai } from "../openai";
import type { Transcript } from "../types";

/**
 * Transcribe the track with OpenAI Whisper, with word-level timestamps.
 * Whisper drifts on music — for production we'd add forced alignment, but
 * for the hackathon the word timestamps it returns are good enough to drive
 * a lyric video that *feels* synced.
 */
export async function transcribe(audio: File): Promise<Transcript> {
  const resp = await openai().audio.transcriptions.create({
    file: audio,
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["word"],
  });

  // The SDK types verbose_json loosely; cast pragmatically.
  // deno-lint-ignore no-explicit-any
  const r = resp as any;
  const words = (r.words ?? []).map((w: { word: string; start: number; end: number }) => ({
    word: w.word,
    start: w.start,
    end: w.end,
  }));

  return {
    text: r.text ?? "",
    words,
    durationSeconds: r.duration ?? words.at(-1)?.end ?? 0,
  };
}

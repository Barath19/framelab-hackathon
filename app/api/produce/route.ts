import { transcribe } from "@/lib/tools/analyze";
import { generateMotifBrief } from "@/lib/tools/motifBrief";
import type { MotifBrief } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

type Event =
  | { type: "log"; ts: string; tag: string; text: string }
  | { type: "brief"; brief: MotifBrief }
  | { type: "done" }
  | { type: "error"; message: string };

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  const pastedLyrics = (form.get("lyrics") as string | null) ?? "";

  if (!(file instanceof File)) {
    return new Response("missing file", { status: 400 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const t0 = Date.now();
      const send = (e: Event) => controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      const stamp = () => {
        const s = Math.floor((Date.now() - t0) / 1000);
        const mm = String(Math.floor(s / 60)).padStart(2, "0");
        const ss = String(s % 60).padStart(2, "0");
        return `${mm}:${ss}`;
      };
      const log = (tag: string, text: string) => send({ type: "log", ts: stamp(), tag, text });

      try {
        log("LISTEN", `Loading ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)…`);

        // 1) Transcribe
        log("WHISPER", "Transcribing with word-level timestamps…");
        const transcript = pastedLyrics
          ? { text: pastedLyrics, words: [], durationSeconds: 0 }
          : await transcribe(file);

        if (transcript.text.trim().length > 0) {
          const wordCount = transcript.words.length || transcript.text.split(/\s+/).length;
          const preview = transcript.text.replace(/\s+/g, " ").slice(0, 70).trim();
          log("LYRICS", `${wordCount} words. "${preview}${transcript.text.length > 70 ? "…" : ""}"`);
        } else {
          log("LYRICS", "Instrumental — no vocals detected. Going purely visual.");
        }

        // 2) Motif brief
        log("DIRECTOR", "Designing visual identity…");
        const brief = await generateMotifBrief(
          transcript,
          { durationSeconds: transcript.durationSeconds },
          file.name,
        );

        log("MOOD", brief.mood);
        log(
          "PALETTE",
          brief.palette.map((c) => `${c.name} ${c.hex}`).join("  •  "),
        );
        log("MOTIF", brief.recurringElement);
        log(
          "TYPE",
          `${brief.typeSystem.family} ${brief.typeSystem.weight}${brief.typeSystem.italic ? " italic" : ""}`,
        );
        log("STYLE", `${brief.lyricStyle} lyric video. Motion verb: ${brief.motionVerb}.`);
        log(
          "PLAN",
          `Producing: ${brief.produce.join(", ")}.${
            brief.avatar.use ? ` Avatar placements: ${brief.avatar.placements.join(", ")}.` : " No avatar."
          }`,
        );

        send({ type: "brief", brief });

        // TODO Task #15–#19: visual gen → HeyGen avatar → Hyperframes compose → review → finalize
        log("NEXT", "Visual generation + HeyGen avatar + Hyperframes composition — coming online.");

        send({ type: "done" });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}

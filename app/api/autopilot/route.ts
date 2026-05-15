/**
 * Autopilot — run the Brief pipeline over a list of URLs sequentially.
 * Streams the underlying log events plus episode-level lifecycle events.
 *
 * Reuses the same building blocks as /api/brief but doesn't redirect there;
 * it calls the tools directly so a single SSE channel covers the whole batch.
 */

import { fetchArxivPaper } from "@/lib/tools/arxiv";
import { generateBrief } from "@/lib/tools/brief";
import { pollNarration, startNarration } from "@/lib/tools/narrator";
import { buildComposition } from "@/lib/tools/compose";
import { saveComposition } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 800;

export async function POST(req: Request) {
  const { urls } = (await req.json()) as { urls?: string[] };
  if (!urls?.length) return new Response("missing urls", { status: 400 });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const t0 = Date.now();
      const send = (e: unknown) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      const stamp = () => {
        const s = Math.floor((Date.now() - t0) / 1000);
        return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
      };
      const log = (tag: string, text: string) =>
        send({ type: "log", ts: stamp(), tag, text });

      try {
        log("AUTOPILOT", `Starting batch of ${urls.length} paper${urls.length === 1 ? "" : "s"}.`);

        for (let i = 0; i < urls.length; i++) {
          const url = urls[i];
          const tag = `EP ${i + 1}/${urls.length}`;
          log("EPISODE", `${tag} → ${url}`);
          send({ type: "episode_start", index: i, url });

          try {
            log(tag, "Fetching paper…");
            const paper = await fetchArxivPaper(url);
            log(tag, `${paper.title.slice(0, 60)}${paper.title.length > 60 ? "…" : ""}`);

            log(tag, "Writing brief…");
            const brief = await generateBrief(paper);

            const MAX_CHARS = 420;
            const script =
              brief.script.length > MAX_CHARS
                ? brief.script.slice(0, MAX_CHARS).replace(/\S*$/, "").trim() + "."
                : brief.script;

            log(tag, "Submitting to HeyGen…");
            const { videoId } = await startNarration(script);
            saveComposition(
              {
                id: videoId,
                paper,
                brief,
                narratorUrl: "",
                durationSeconds: 0,
                createdAt: Date.now(),
                pending: true,
              },
              null,
            );

            const clip = await pollNarration(videoId, {
              onStatus: (s) => log(tag, `HeyGen: ${s}`),
              onTick: (e) => log(tag, `HeyGen rendering… ${e}s`),
            });
            log(tag, `Narrator ready (${clip.durationSeconds.toFixed(1)}s).`);

            const html = buildComposition({
              paper,
              brief,
              narratorUrl: clip.videoUrl,
              durationSeconds: clip.durationSeconds,
            });
            saveComposition(
              {
                id: videoId,
                paper,
                brief,
                narratorUrl: clip.videoUrl,
                thumbnailUrl: clip.thumbnailUrl,
                durationSeconds: clip.durationSeconds,
                createdAt: Date.now(),
                pending: false,
              },
              html,
            );

            log(tag, "Episode ready.");
            send({
              type: "episode_done",
              index: i,
              id: videoId,
              previewUrl: `/api/compositions/${videoId}`,
              title: paper.title,
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log(tag, `failed: ${message}`);
            send({ type: "episode_error", index: i, url, message });
            // Continue to next URL.
          }
        }

        log("AUTOPILOT", "Batch complete.");
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
      Connection: "keep-alive",
    },
  });
}

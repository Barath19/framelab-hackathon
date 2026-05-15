import { fetchArxivPaper } from "@/lib/tools/arxiv";
import { generateBrief } from "@/lib/tools/brief";
import { pollNarration, startNarration } from "@/lib/tools/narrator";
import { buildComposition } from "@/lib/tools/compose";
import { compositions } from "@/lib/store";
import type { ArxivPaper } from "@/lib/tools/arxiv";
import type { Brief } from "@/lib/tools/brief";

export const runtime = "nodejs";
export const maxDuration = 800;

type Event =
  | { type: "log"; ts: string; tag: string; text: string }
  | { type: "paper"; paper: ArxivPaper }
  | { type: "brief"; brief: Brief }
  | { type: "narrator"; videoUrl: string; durationSeconds: number }
  | { type: "composition"; id: string; previewUrl: string }
  | { type: "done" }
  | { type: "error"; message: string };

export async function POST(req: Request) {
  const { url } = (await req.json()) as { url?: string };
  if (!url) return new Response("missing url", { status: 400 });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const t0 = Date.now();
      const send = (e: Event) => controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      const stamp = () => {
        const s = Math.floor((Date.now() - t0) / 1000);
        return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
      };
      const log = (tag: string, text: string) => send({ type: "log", ts: stamp(), tag, text });

      try {
        log("FETCH", `Resolving ${url}…`);
        const paper = await fetchArxivPaper(url);
        log(
          "PAPER",
          `${paper.title.slice(0, 80)}${paper.title.length > 80 ? "…" : ""} — ${paper.authors.slice(0, 2).join(", ")}${paper.authors.length > 2 ? " et al." : ""}`,
        );
        log("FIGURES", `${paper.figures.length} figure${paper.figures.length === 1 ? "" : "s"} extracted from arXiv HTML page.`);
        send({ type: "paper", paper });

        log("READING", "Asking GPT-4o for the 75-second brief + visual beats…");
        const brief = await generateBrief(paper);
        const wc = brief.script.split(/\s+/).filter(Boolean).length;
        log(
          "BRIEF",
          `${wc} words · ${brief.beats.length} beats. Hook: "${brief.hook.slice(0, 80)}${brief.hook.length > 80 ? "…" : ""}"`,
        );
        send({ type: "brief", brief });

        // Clamp script defensively — HeyGen will refuse / produce overlong
        // clips if the LLM ignored the 75s budget.
        const MAX_CHARS = 1400;
        const script =
          brief.script.length > MAX_CHARS
            ? brief.script.slice(0, MAX_CHARS).replace(/\S*$/, "").trim() + "…"
            : brief.script;
        if (script.length < brief.script.length) {
          log("CLAMP", `Trimmed script ${brief.script.length} → ${script.length} chars to keep clip under ~100s.`);
        }

        log("HEYGEN", `Submitting ${script.length}-char narration to HeyGen…`);
        const { videoId } = await startNarration(script);
        log("HEYGEN", `video_id=${videoId} — polling…`);
        const clip = await pollNarration(videoId, {
          onStatus: (s) => log("HEYGEN", `status: ${s}`),
          onTick: (elapsed) => log("HEYGEN", `still rendering… ${elapsed}s elapsed`),
        });
        log(
          "HEYGEN",
          `ready — ${clip.durationSeconds.toFixed(1)}s narrator clip.`,
        );
        send({ type: "narrator", videoUrl: clip.videoUrl, durationSeconds: clip.durationSeconds });

        log("COMPOSE", "Hyperframes composition: chyron + PIP + per-beat figures/equations…");
        const id = videoId; // reuse for our composition store id
        const html = buildComposition({
          paper,
          brief,
          narratorUrl: clip.videoUrl,
          durationSeconds: clip.durationSeconds,
        });
        compositions.set(id, {
          id,
          paper,
          brief,
          narratorUrl: clip.videoUrl,
          durationSeconds: clip.durationSeconds,
          html,
          createdAt: Date.now(),
        });
        const previewUrl = `/api/compositions/${id}`;
        log("COMPOSE", `Composition ready — ${html.length} bytes. Previewing…`);
        send({ type: "composition", id, previewUrl });

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

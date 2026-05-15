import { fetchArxivPaper } from "@/lib/tools/arxiv";
import { generateBrief } from "@/lib/tools/brief";
import { pollNarration, startNarration } from "@/lib/tools/narrator";
import { buildComposition } from "@/lib/tools/compose";
import { getComposition, saveComposition } from "@/lib/store";
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
  const body = (await req.json()) as { url?: string; videoId?: string };
  if (!body.url && !body.videoId) {
    return new Response("missing url or videoId", { status: 400 });
  }

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
        let paper: ArxivPaper;
        let brief: Brief;
        let videoId: string;

        if (body.videoId) {
          // ===== RESUME MODE =====
          // Need cached metadata for this videoId so we can compose once HeyGen
          // returns. The pending record was written when the original run
          // first kicked off narration.
          videoId = body.videoId;
          log("RESUME", `Looking up cached metadata for video_id=${videoId}…`);
          const cached = getComposition(videoId);
          if (!cached) {
            throw new Error(
              `No cached paper/brief for ${videoId}. Start a fresh run with the URL — resume only works for runs this app previously kicked off.`,
            );
          }
          paper = cached.paper;
          brief = cached.brief;
          log("RESUME", `Found cached paper: ${paper.title.slice(0, 70)}…`);
          send({ type: "paper", paper });
          send({ type: "brief", brief });
        } else {
          // ===== FULL RUN =====
          log("FETCH", `Resolving ${body.url}…`);
          paper = await fetchArxivPaper(body.url!);
          log(
            "PAPER",
            `${paper.title.slice(0, 80)}${paper.title.length > 80 ? "…" : ""} — ${paper.authors.slice(0, 2).join(", ")}${paper.authors.length > 2 ? " et al." : ""}`,
          );
          log("FIGURES", `${paper.figures.length} figure${paper.figures.length === 1 ? "" : "s"} extracted.`);
          send({ type: "paper", paper });

          log("READING", "Asking GPT-4o for the 20-second brief + visual beats…");
          brief = await generateBrief(paper);
          const wc = brief.script.split(/\s+/).filter(Boolean).length;
          log(
            "BRIEF",
            `${wc} words · ${brief.beats.length} beats. Hook: "${brief.hook.slice(0, 80)}${brief.hook.length > 80 ? "…" : ""}"`,
          );
          send({ type: "brief", brief });

          // Clamp script for the ~20s budget.
          const MAX_CHARS = 420;
          const script =
            brief.script.length > MAX_CHARS
              ? brief.script.slice(0, MAX_CHARS).replace(/\S*$/, "").trim() + "."
              : brief.script;
          if (script.length < brief.script.length) {
            log("CLAMP", `Trimmed script ${brief.script.length} → ${script.length} chars.`);
          }

          log("HEYGEN", `Submitting ${script.length}-char narration to HeyGen…`);
          const started = await startNarration(script);
          videoId = started.videoId;
          log("HEYGEN", `video_id=${videoId} — polling…`);

          // Stash a pending record IMMEDIATELY so we can resume on timeout.
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
        }

        // ===== Both modes converge here: poll → compose =====
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

        const previewUrl = `/api/compositions/${videoId}`;
        log("COMPOSE", `Composition ready — ${html.length} bytes. Previewing…`);
        send({ type: "composition", id: videoId, previewUrl });

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

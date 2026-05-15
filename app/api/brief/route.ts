import { fetchArxivPaper } from "@/lib/tools/arxiv";
import { generateBrief } from "@/lib/tools/brief";
import { pollNarration, startNarration } from "@/lib/tools/narrator";
import { buildComposition } from "@/lib/tools/compose";
import {
  downloadAsset,
  getComposition,
  hasComposedVideo,
  hasLocalVideo,
  localThumbPath,
  localVideoPath,
  saveComposition,
} from "@/lib/store";
import { renderComposition } from "@/lib/tools/render";
import type { ArxivPaper } from "@/lib/tools/arxiv";
import type { Brief } from "@/lib/tools/brief";

export const runtime = "nodejs";
export const maxDuration = 800;

type Event =
  | { type: "log"; ts: string; tag: string; text: string }
  | { type: "progress"; percent: number; stage: string }
  | { type: "paper"; paper: ArxivPaper }
  | { type: "brief"; brief: Brief }
  | { type: "narrator"; videoUrl: string; durationSeconds: number }
  | { type: "composition"; id: string; previewUrl: string }
  | { type: "composed"; id: string; downloadUrl: string }
  | { type: "done" }
  | { type: "error"; message: string };

/** Stage→percent bands. HeyGen is the longest leg so it owns the biggest band. */
const BANDS = {
  fetch: { start: 2, end: 10, label: "fetching paper" },
  reading: { start: 10, end: 22, label: "reading paper" },
  heygen: { start: 25, end: 95, label: "rendering narrator" },
  compose: { start: 95, end: 100, label: "composing" },
} as const;

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
      const progress = (percent: number, stage: string) =>
        send({ type: "progress", percent: Math.max(0, Math.min(100, Math.round(percent))), stage });

      try {
        let paper: ArxivPaper;
        let brief: Brief;
        let videoId: string;

        if (body.videoId) {
          // ===== RESUME MODE =====
          videoId = body.videoId;
          progress(BANDS.heygen.start, BANDS.heygen.label);
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

          // ===== LOCAL FAST-PATH =====
          // If we already have the MP4 on disk, skip HeyGen entirely and
          // compose straight from the local file. This is what makes the
          // demo deterministic + offline-friendly.
          if (hasLocalVideo(videoId)) {
            log("LOCAL", "Found local MP4 — skipping HeyGen, composing instantly.");
            progress(BANDS.compose.start, BANDS.compose.label);
            const localUrl = `/api/videos/${videoId}`;
            const html = buildComposition({
              paper,
              brief,
              narratorUrl: localUrl,
              durationSeconds: cached.durationSeconds || 20,
            });
            saveComposition(
              { ...cached, narratorUrl: localUrl, pending: false },
              html,
            );
            send({
              type: "narrator",
              videoUrl: localUrl,
              durationSeconds: cached.durationSeconds || 20,
            });
            send({ type: "composition", id: videoId, previewUrl: `/api/compositions/${videoId}` });

            // Render the composed MP4 (avatar + chyron + beats) — auto-downloads on the client.
            if (hasComposedVideo(videoId)) {
              log("RENDER", "Composed MP4 already on disk.");
            } else {
              log("RENDER", "Rendering composed MP4 with Hyperframes headless…");
              try {
                await renderComposition({
                  id: videoId,
                  html,
                  onLog: (l) => log("RENDER", l),
                });
                log("RENDER", "Composed MP4 ready.");
              } catch (err) {
                log("RENDER", `failed: ${err instanceof Error ? err.message : String(err)}`);
              }
            }
            if (hasComposedVideo(videoId)) {
              send({ type: "composed", id: videoId, downloadUrl: `/api/composed/${videoId}` });
            }
            progress(100, "done");
            send({ type: "done" });
            controller.close();
            return;
          }
        } else {
          // ===== FULL RUN =====
          progress(BANDS.fetch.start, BANDS.fetch.label);
          log("FETCH", `Resolving ${body.url}…`);
          paper = await fetchArxivPaper(body.url!);
          progress(BANDS.fetch.end, BANDS.fetch.label);
          log(
            "PAPER",
            `${paper.title.slice(0, 80)}${paper.title.length > 80 ? "…" : ""} — ${paper.authors.slice(0, 2).join(", ")}${paper.authors.length > 2 ? " et al." : ""}`,
          );
          log("FIGURES", `${paper.figures.length} figure${paper.figures.length === 1 ? "" : "s"} extracted.`);
          send({ type: "paper", paper });

          progress(BANDS.reading.start, BANDS.reading.label);
          log("READING", "Asking GPT-4o for the 20-second brief + visual beats…");
          brief = await generateBrief(paper);
          const wc = brief.script.split(/\s+/).filter(Boolean).length;
          log(
            "BRIEF",
            `${wc} words · ${brief.beats.length} beats. Hook: "${brief.hook.slice(0, 80)}${brief.hook.length > 80 ? "…" : ""}"`,
          );
          progress(BANDS.reading.end, BANDS.reading.label);
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
        progress(BANDS.heygen.start, BANDS.heygen.label);
        // Tuned to observed runtimes for our talking-head avatar (~90-120s
        // wall time). Asymptote ensures the bar never lies past ~93% while
        // HeyGen is still working.
        const EXPECTED_HEYGEN_SECS = 100;
        const clip = await pollNarration(videoId, {
          onStatus: (s) => log("HEYGEN", `status: ${s}`),
          onTick: (elapsed) => {
            log("HEYGEN", `still rendering… ${elapsed}s elapsed`);
            // Asymptote within the heygen band — never quite hit 95 until done.
            const frac = 1 - Math.exp(-elapsed / EXPECTED_HEYGEN_SECS);
            const pct =
              BANDS.heygen.start + frac * (BANDS.heygen.end - BANDS.heygen.start - 2);
            progress(pct, BANDS.heygen.label);
          },
        });
        progress(BANDS.heygen.end, BANDS.heygen.label);

        // ===== DOWNLOAD TO LOCAL =====
        // HeyGen returns a signed S3 URL that expires within 24h. Pull the
        // bytes down now so demos and the channel page keep working forever.
        log("LOCAL", "Downloading narrator MP4 + thumbnail to local cache…");
        try {
          await downloadAsset(clip.videoUrl, localVideoPath(videoId));
          if (clip.thumbnailUrl) {
            await downloadAsset(clip.thumbnailUrl, localThumbPath(videoId));
          }
          log("LOCAL", "Cached. Composition will reference /api/videos/<id>.");
        } catch (err) {
          log(
            "LOCAL",
            `download failed: ${err instanceof Error ? err.message : String(err)} — falling back to signed URL.`,
          );
        }

        const localNarrator = hasLocalVideo(videoId)
          ? `/api/videos/${videoId}`
          : clip.videoUrl;
        const localThumb = hasLocalVideo(videoId)
          ? `/api/thumbs/${videoId}`
          : clip.thumbnailUrl;
        log(
          "HEYGEN",
          `ready — ${clip.durationSeconds.toFixed(1)}s narrator clip.`,
        );
        send({ type: "narrator", videoUrl: localNarrator, durationSeconds: clip.durationSeconds });

        progress(BANDS.compose.start, BANDS.compose.label);
        log("COMPOSE", "Hyperframes composition: chyron + PIP + per-beat figures/equations…");
        const html = buildComposition({
          paper,
          brief,
          narratorUrl: localNarrator,
          durationSeconds: clip.durationSeconds,
        });

        saveComposition(
          {
            id: videoId,
            paper,
            brief,
            narratorUrl: localNarrator,
            thumbnailUrl: localThumb,
            durationSeconds: clip.durationSeconds,
            createdAt: Date.now(),
            pending: false,
          },
          html,
        );

        const previewUrl = `/api/compositions/${videoId}`;
        log("COMPOSE", `Composition ready — ${html.length} bytes. Previewing…`);
        send({ type: "composition", id: videoId, previewUrl });

        // Render the composed MP4 in this same request — short clips render in
        // well under a minute and the client autodownloads when it arrives.
        log("RENDER", "Rendering composed MP4 with Hyperframes headless…");
        try {
          await renderComposition({
            id: videoId,
            html,
            onLog: (l) => log("RENDER", l),
          });
          log("RENDER", "Composed MP4 ready.");
        } catch (err) {
          log("RENDER", `failed: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (hasComposedVideo(videoId)) {
          send({ type: "composed", id: videoId, downloadUrl: `/api/composed/${videoId}` });
        }

        progress(100, "done");
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

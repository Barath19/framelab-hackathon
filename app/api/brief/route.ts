import { fetchArxivPaper } from "@/lib/tools/arxiv";
import { generateBrief } from "@/lib/tools/brief";
import { animateBeat, type Animation } from "@/lib/tools/animator";
import { mockNarration, pollNarration, startNarration } from "@/lib/tools/narrator";
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
        let mockClip:
          | { videoId: string; videoUrl: string; thumbnailUrl?: string; durationSeconds: number }
          | undefined;
        const animations: Record<number, Animation> = {};

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
              animations,
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

          // ===== ANIMATE: generate inline SVG explainers per animation beat =====
          const animBeats = brief.beats
            .map((b, i) => ({ b, i }))
            .filter(({ b }) => b.show.type === "animation");
          if (animBeats.length > 0) {
            log("ANIMATE", `Generating ${animBeats.length} animation${animBeats.length === 1 ? "" : "s"} for the visual beats…`);
            const total = 20;
            const durs = brief.beats.map((b, i) =>
              Math.max(1, (brief.beats[i + 1]?.at ?? total) - b.at),
            );
            const results = await Promise.allSettled(
              animBeats.map(async ({ b, i }) => {
                if (b.show.type !== "animation") return null;
                const anim = await animateBeat({
                  paper,
                  beatId: `b${i}`,
                  intent: b.show.intent,
                  durationSeconds: durs[i],
                });
                return { i, anim };
              }),
            );
            for (const r of results) {
              if (r.status === "fulfilled" && r.value) {
                animations[r.value.i] = r.value.anim;
                log("ANIMATE", `beat ${r.value.i}: ${r.value.anim.html.length} bytes of SVG, ${r.value.anim.gsap.length} bytes of GSAP.`);
              } else if (r.status === "rejected") {
                log("ANIMATE", `failed: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
              }
            }
          }

          // Clamp script for the ~20s budget.
          const MAX_CHARS = 420;
          const script =
            brief.script.length > MAX_CHARS
              ? brief.script.slice(0, MAX_CHARS).replace(/\S*$/, "").trim() + "."
              : brief.script;
          if (script.length < brief.script.length) {
            log("CLAMP", `Trimmed script ${brief.script.length} → ${script.length} chars.`);
          }

          const isMock = process.env.MOCK_HEYGEN === "1";
          if (isMock) {
            // Generate the mock clip exactly once; we'll skip pollNarration below.
            const mock = mockNarration(paper.id);
            videoId = mock.videoId;
            // Stash so the converge-step finds a "ready" mock without re-fetching.
            mockClip = mock;
            log("HEYGEN", `MOCK_HEYGEN=1 — reusing cached clip → ${videoId}.`);
          } else {
            log("HEYGEN", `Submitting ${script.length}-char narration to HeyGen…`);
            const started = await startNarration(script);
            videoId = started.videoId;
            log("HEYGEN", `video_id=${videoId} — polling…`);
          }

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
        const isMock = process.env.MOCK_HEYGEN === "1";
        let clip;
        if (mockClip) {
          clip = mockClip;
          log("HEYGEN", `MOCK clip ready (${clip.durationSeconds}s).`);
        } else if (isMock) {
          // Resume + MOCK_HEYGEN: synthesize once now.
          clip = mockNarration(paper.id);
          videoId = clip.videoId;
          log("HEYGEN", `MOCK clip ready (${clip.durationSeconds}s).`);
        } else {
          const EXPECTED_HEYGEN_SECS = 100;
          clip = await pollNarration(videoId, {
            onStatus: (s) => log("HEYGEN", `status: ${s}`),
            onTick: (elapsed) => {
              log("HEYGEN", `still rendering… ${elapsed}s elapsed`);
              const frac = 1 - Math.exp(-elapsed / EXPECTED_HEYGEN_SECS);
              const pct =
                BANDS.heygen.start + frac * (BANDS.heygen.end - BANDS.heygen.start - 2);
              progress(pct, BANDS.heygen.label);
            },
          });
        }
        progress(BANDS.heygen.end, BANDS.heygen.label);

        // ===== DOWNLOAD TO LOCAL (skip if mocking — already copied) =====
        if (!isMock) {
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
        log("COMPOSE", "Hyperframes composition: chyron + PIP + per-beat animations…");
        const html = buildComposition({
          paper,
          brief,
          narratorUrl: localNarrator,
          durationSeconds: clip.durationSeconds,
          animations,
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

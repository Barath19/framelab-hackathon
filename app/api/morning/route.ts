import { fetchNorthStar } from "@/lib/tools/posthog";
import { buildMorningComposition, lintComposition } from "@/lib/tools/morning";
import { renderComposition } from "@/lib/tools/render";
import {
  hasComposedVideo,
  listBriefs,
  saveBrief,
} from "@/lib/store";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 800;

type Event =
  | { type: "log"; ts: string; tag: string; text: string }
  | { type: "progress"; percent: number; stage: string }
  | { type: "composition"; id: string; previewUrl: string }
  | { type: "composed"; id: string; downloadUrl: string }
  | { type: "done" }
  | { type: "error"; message: string };

export async function GET() {
  // List recent briefs for the home page.
  return Response.json({
    items: listBriefs().map((r) => ({
      id: r.id,
      title: r.metric.title,
      createdAt: r.createdAt,
      total: r.metric.metric.total,
      peakDate: r.metric.metric.peak.date,
      peakValue: r.metric.metric.peak.value,
      wowPct: r.metric.metric.weekOverWeekPct,
    })),
  });
}

export async function POST(req: Request) {
  const { metricId = "video_rendered_30d" } =
    (await req.json().catch(() => ({}))) as { metricId?: string };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const t0 = Date.now();
      const send = (e: Event) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      const stamp = () => {
        const s = Math.floor((Date.now() - t0) / 1000);
        return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
      };
      const log = (tag: string, text: string) =>
        send({ type: "log", ts: stamp(), tag, text });
      const progress = (pct: number, stage: string) =>
        send({ type: "progress", percent: Math.round(pct), stage });

      try {
        progress(5, "pulling metrics");
        log("POSTHOG", `Fetching ${metricId}…`);
        const metric = await fetchNorthStar(metricId);
        log(
          "METRIC",
          `${metric.metric.series.length} datapoints · total ${metric.metric.total.toLocaleString()} · peak ${metric.metric.peak.value} on ${metric.metric.peak.date} · WoW ${metric.metric.weekOverWeekPct >= 0 ? "+" : ""}${metric.metric.weekOverWeekPct}%`,
        );

        progress(25, "composing");
        log("COMPOSE", "Building Hyperframes morning brief…");
        const id = `morning-${randomBytes(6).toString("hex")}`;
        const html = buildMorningComposition(metric);

        const lint = lintComposition(html);
        const errs = lint.findings.filter((f) => f.severity === "error");
        log(
          "LINT",
          `@hyperframes/core: ${lint.findings.length} findings (${errs.length} errors).`,
        );
        for (const f of errs.slice(0, 3)) log("LINT", `! ${f.code}: ${f.message}`);

        saveBrief({ id, metric, createdAt: Date.now() }, html);
        send({
          type: "composition",
          id,
          previewUrl: `/api/morning/${id}/preview`,
        });

        progress(45, "rendering");
        log("RENDER", "npx hyperframes render — headless Chromium…");
        try {
          await renderComposition({
            id,
            html,
            onLog: (l) => log("RENDER", l),
          });
        } catch (err) {
          log(
            "RENDER",
            `failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }

        if (hasComposedVideo(id)) {
          log("RENDER", "Composed MP4 ready.");
          progress(100, "done");
          send({
            type: "composed",
            id,
            downloadUrl: `/api/composed/${id}`,
          });
        } else {
          send({
            type: "error",
            message: "Render failed — no MP4 produced.",
          });
        }
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

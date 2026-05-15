import { sendWhatsAppVideo } from "@/lib/tools/whatsapp";
import { getBrief } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { id, to } = (await req.json()) as { id?: string; to?: string };
  if (!id) return new Response("missing id", { status: 400 });

  const rec = getBrief(id);
  if (!rec) return new Response("brief not found", { status: 404 });

  const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const mediaUrl = `${base}/api/composed/${id}`;
  const m = rec.metric;
  const caption = `🌅 Morning brief — ${m.title}\n${m.metric.total.toLocaleString()} ${m.metric.unit} · peak ${m.metric.peak.value} on ${m.metric.peak.date} · WoW ${m.metric.weekOverWeekPct >= 0 ? "+" : ""}${m.metric.weekOverWeekPct}%`;

  try {
    const result = await sendWhatsAppVideo({ mediaUrl, caption, to });
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { configured: true, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

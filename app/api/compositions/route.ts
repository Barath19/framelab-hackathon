import { listCompositions } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const items = listCompositions().map((r) => ({
    id: r.id,
    title: r.paper.title,
    hook: r.brief.hook,
    authors: r.paper.authors,
    arxivId: r.paper.id,
    durationSeconds: r.durationSeconds,
    thumbnailUrl: r.thumbnailUrl,
    narratorUrl: r.narratorUrl,
    createdAt: r.createdAt,
  }));
  return Response.json({ items });
}

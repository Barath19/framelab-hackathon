import fs from "node:fs";
import { composedVideoPath } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const p = composedVideoPath(id);
  if (!fs.existsSync(p)) return new Response("not found", { status: 404 });
  const stat = fs.statSync(p);
  const stream = fs.createReadStream(p);
  return new Response(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="morning-${id}.mp4"`,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

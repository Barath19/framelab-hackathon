import fs from "node:fs";
import { localVideoPath } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const p = localVideoPath(id);
  if (!fs.existsSync(p)) return new Response("not found", { status: 404 });
  const stat = fs.statSync(p);
  const stream = fs.createReadStream(p);
  return new Response(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(stat.size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

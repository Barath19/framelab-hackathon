import fs from "node:fs";
import { localThumbPath } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const p = localThumbPath(id);
  if (!fs.existsSync(p)) return new Response("not found", { status: 404 });
  const stat = fs.statSync(p);
  const stream = fs.createReadStream(p);
  return new Response(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(stat.size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

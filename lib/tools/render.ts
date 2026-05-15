/**
 * Render a Hyperframes composition HTML to MP4 using the Hyperframes CLI.
 *
 * We write the HTML + a minimal hyperframes.json into .data/render-projects/<id>/
 * and run `npx hyperframes render --output …`. Hyperframes spins up headless
 * Chromium under the hood, plays the timeline deterministically, and captures
 * frames into a real MP4.
 *
 * The narrator <video> in our composition references /api/videos/<id> served
 * by Next on localhost. Hyperframes' headless browser CAN fetch it as long as
 * the dev server is running on the same host:port — we pass NEXT_PUBLIC_BASE
 * (or fall back to http://localhost:3000) so absolute URLs work.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  composedVideoPath,
  hasComposedVideo,
  renderProjectDir,
} from "../store";

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

function rewriteRelativeUrls(html: string): string {
  // Make /api/... paths absolute so headless Chromium can fetch them.
  return html
    .replace(/src="\/api\//g, `src="${BASE}/api/`)
    .replace(/href="\/api\//g, `href="${BASE}/api/`);
}

export async function renderComposition(opts: {
  id: string;
  html: string;
  onLog?: (line: string) => void;
}): Promise<{ path: string }> {
  const { id, html, onLog } = opts;
  const out = composedVideoPath(id);
  if (hasComposedVideo(id)) {
    onLog?.(`already rendered: ${out}`);
    return { path: out };
  }

  const dir = renderProjectDir(id);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(path.join(dir, "index.html"), rewriteRelativeUrls(html), "utf8");
  fs.writeFileSync(
    path.join(dir, "hyperframes.json"),
    JSON.stringify(
      { id, name: `brief-${id}`, width: 1920, height: 1080, fps: 30 },
      null,
      2,
    ),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "meta.json"),
    JSON.stringify({ id, name: `brief-${id}` }, null, 2),
    "utf8",
  );

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "npx",
      ["--yes", "hyperframes", "render", "--output", out],
      {
        cwd: dir,
        env: { ...process.env, npm_config_cache: "/tmp/npm-cache" },
      },
    );
    child.stdout?.on("data", (b) => onLog?.(`render: ${b.toString().trim().slice(0, 200)}`));
    child.stderr?.on("data", (b) => onLog?.(`render err: ${b.toString().trim().slice(0, 200)}`));
    child.on("close", (code) => {
      if (code === 0 && fs.existsSync(out)) resolve();
      else reject(new Error(`hyperframes render exited with ${code}`));
    });
  });

  return { path: out };
}

/**
 * Render a Hyperframes composition HTML to MP4 using the Hyperframes CLI.
 * Writes the HTML + a minimal hyperframes.json into a per-id project dir
 * and runs `npx hyperframes render`. Headless Chromium under the hood;
 * the artifact is a real MP4.
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
  // /api/... paths become absolute so headless Chromium can fetch them.
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
      { id, name: `morning-${id}`, width: 1920, height: 1080, fps: 30 },
      null,
      2,
    ),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "meta.json"),
    JSON.stringify({ id, name: `morning-${id}` }, null, 2),
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

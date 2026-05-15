#!/usr/bin/env node
/**
 * One-shot HeyGen video generation test.
 *  - POSTs to /v2/video/generate
 *  - Polls status until "completed" or "failed"
 *  - Prints the final MP4 URL
 *
 * Usage:  node scripts/test-heygen.mjs
 */

import "node:process";
import fs from "node:fs";

// Load .env.local
const env = Object.fromEntries(
  fs
    .readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const KEY = env.HEYGEN_API_KEY;
if (!KEY) throw new Error("HEYGEN_API_KEY missing");

const AVATAR_ID = "Abigail_expressive_2024112501";
const VOICE_ID = "f38a635bee7a4d1f9b0a654a31d050d2"; // Chill Brian
const SCRIPT =
  "Hi, I'm a test avatar from HeyGen. Motif is alive.";

console.log("→ POST /v2/video/generate");
const gen = await fetch("https://api.heygen.com/v2/video/generate", {
  method: "POST",
  headers: {
    "X-Api-Key": KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    video_inputs: [
      {
        character: { type: "avatar", avatar_id: AVATAR_ID, avatar_style: "normal" },
        voice: { type: "text", input_text: SCRIPT, voice_id: VOICE_ID },
      },
    ],
    dimension: { width: 1280, height: 720 },
  }),
});

const genJson = await gen.json();
console.log("  status:", gen.status);
console.log("  body:", JSON.stringify(genJson, null, 2));

const videoId = genJson?.data?.video_id;
if (!videoId) {
  console.error("✗ No video_id returned. Aborting.");
  process.exit(1);
}

console.log(`\n→ Polling /v1/video_status.get?video_id=${videoId}`);
const started = Date.now();
let last = "";
while (true) {
  await new Promise((r) => setTimeout(r, 4000));
  const s = await fetch(
    `https://api.heygen.com/v1/video_status.get?video_id=${videoId}`,
    { headers: { "X-Api-Key": KEY } },
  );
  const sj = await s.json();
  const status = sj?.data?.status;
  const elapsed = ((Date.now() - started) / 1000).toFixed(0);
  if (status !== last) {
    console.log(`  [${elapsed}s] ${status}`);
    last = status;
  } else {
    process.stdout.write(".");
  }
  if (status === "completed") {
    console.log(`\n✓ Done in ${elapsed}s`);
    console.log("  video_url:", sj.data.video_url);
    console.log("  thumbnail:", sj.data.thumbnail_url);
    console.log("  duration:", sj.data.duration);
    break;
  }
  if (status === "failed") {
    console.error("\n✗ failed:", JSON.stringify(sj, null, 2));
    process.exit(1);
  }
  if ((Date.now() - started) / 1000 > 300) {
    console.error("\n✗ timeout after 5 min");
    process.exit(1);
  }
}

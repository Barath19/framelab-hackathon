#!/usr/bin/env node
/**
 * Generate the weekly-brief narration via HeyGen REST (Adriana + Allison),
 * then download the MP4 next to index.html as `narrator.mp4`.
 *
 * Reads HEYGEN_API_KEY from .env. Skips generation if narrator.mp4 already
 * exists and the script-hash matches (so re-runs of render.sh are fast).
 *
 *   node scripts/narrate.mjs
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const env = Object.fromEntries(
  (fs.existsSync(path.join(ROOT, ".env")) ? fs.readFileSync(path.join(ROOT, ".env"), "utf8") : "")
    .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const KEY = env.HEYGEN_API_KEY;
if (!KEY) { console.error("HEYGEN_API_KEY missing in .env"); process.exit(1); }

// Load the freshest numbers from morning.json (written by fetch-series.mjs)
const summary = JSON.parse(fs.readFileSync(path.join(ROOT, "morning.json"), "utf8"));
const fmt$ = (n) => "$" + Math.round(n).toLocaleString();

// Natural phrasing → TTS slows itself. Full numbers + transitional words
// ("alright", "so", "that's", "this week") give breathing room without
// requiring an API-side speed knob (HeyGen v2 ignores it).
const fmtShort = (n) => {
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + " million";
  if (n >= 1_000)     return "$" + (n / 1_000).toFixed(1) + " thousand";
  return "$" + Math.round(n);
};
const SCRIPT = [
  `Good morning, team. Here's your weekly framelab brief.`,
  `Daily active users climbed to ${summary.dauNow} this week, peaking at ${summary.dauPeak.value} on ${humanDate(summary.dauPeak.date)}. That's up ${Math.abs(summary.dauWowPct)} percent week over week.`,
  `Monthly recurring revenue is now ${fmtShort(summary.mrrNow)} per month, putting our annual run-rate above ${fmtShort(summary.arrNow)}.`,
  `Quick snapshot from the last thirty days: ${summary.dauNow} daily active. ${summary.wauNow} weekly active. ${fmtShort(summary.mrrNow)} in MRR. And ${fmtShort(summary.arrNow)} ARR.`,
  `We added ${summary.signups30d} new signups and ${summary.newSubs30d} paid customers.`,
  `Have a great week.`,
].join(" ");

function humanDate(mmdd) {
  const [m, d] = String(mmdd).split("-").map(Number);
  const dt = new Date(new Date().getFullYear(), (m || 1) - 1, d || 1);
  return dt.toLocaleDateString("en-US", { weekday: "long" });
}

const HASH = crypto.createHash("sha1").update(SCRIPT).digest("hex").slice(0, 12);
const OUT = path.join(ROOT, "narrator.mp4");
const META = path.join(ROOT, ".narrator.json");
if (fs.existsSync(OUT) && fs.existsSync(META)) {
  const prev = JSON.parse(fs.readFileSync(META, "utf8"));
  if (prev.hash === HASH) {
    console.log(`Narrator already up to date (hash ${HASH}). Skipping HeyGen.`);
    console.log(SCRIPT);
    process.exit(0);
  }
}

console.log("Script:");
console.log("  " + SCRIPT);
console.log(`Hash ${HASH} — submitting to HeyGen…`);

const AVATAR = "Adriana_BizTalk_Front_public";
const VOICE = "f8c69e517f424cafaecde32dde57096b"; // Allison, female, English

const gen = await fetch("https://api.heygen.com/v2/video/generate", {
  method: "POST",
  headers: { "X-Api-Key": KEY, "Content-Type": "application/json" },
  body: JSON.stringify({
    video_inputs: [
      {
        character: { type: "avatar", avatar_id: AVATAR, avatar_style: "normal" },
        voice: { type: "text", input_text: SCRIPT, voice_id: VOICE },
      },
    ],
    dimension: { width: 720, height: 720 },
  }),
});
const gj = await gen.json();
const videoId = gj?.data?.video_id;
if (!videoId) { console.error("No video_id:", JSON.stringify(gj, null, 2)); process.exit(1); }
console.log(`video_id = ${videoId}`);

let last = "";
let videoUrl = "";
const t0 = Date.now();
for (let i = 0; i < 90; i++) {
  await new Promise((r) => setTimeout(r, 4000));
  const r = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
    headers: { "X-Api-Key": KEY },
  });
  const j = await r.json();
  const s = j?.data?.status;
  const elapsed = Math.floor((Date.now() - t0) / 1000);
  if (s !== last) { console.log(`  [${elapsed}s] ${s}`); last = s; } else process.stdout.write(".");
  if (s === "completed") { videoUrl = j.data.video_url; break; }
  if (s === "failed") { console.error("\nfailed:", JSON.stringify(j)); process.exit(1); }
}
if (!videoUrl) { console.error("\nTimed out"); process.exit(1); }

console.log(`\n→ Downloading…`);
const bin = await fetch(videoUrl);
if (!bin.ok) { console.error("download failed", bin.status); process.exit(1); }
fs.writeFileSync(OUT, Buffer.from(await bin.arrayBuffer()));
fs.writeFileSync(META, JSON.stringify({ hash: HASH, videoId, generatedAt: new Date().toISOString() }, null, 2));
console.log(`✓ Wrote ${OUT} (${(fs.statSync(OUT).size / 1024 / 1024).toFixed(1)} MB)`);

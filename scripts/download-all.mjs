#!/usr/bin/env node
/**
 * Backfill local copies of every composition's HeyGen MP4 + thumbnail.
 *
 *   node scripts/download-all.mjs
 *
 * Reads .data/compositions.json. For each record whose narratorUrl is a
 * remote (signed) URL — i.e. not a /api/videos/... path — fetches the
 * bytes to .data/videos/<id>.mp4 (+ thumbnail to .data/thumbnails/<id>.jpg)
 * and rewrites narratorUrl/thumbnailUrl in the index + the composition's
 * HTML body to point at the local proxy routes.
 *
 * Idempotent — already-local entries are skipped. Run it any time before
 * the signed URLs expire.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), ".data");
const INDEX = path.join(ROOT, "compositions.json");
const VIDEO_DIR = path.join(ROOT, "videos");
const THUMB_DIR = path.join(ROOT, "thumbnails");
const HTML_DIR = path.join(ROOT, "compositions");

if (!fs.existsSync(INDEX)) {
  console.log("No .data/compositions.json yet. Nothing to backfill.");
  process.exit(0);
}
for (const d of [VIDEO_DIR, THUMB_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

const records = JSON.parse(fs.readFileSync(INDEX, "utf8"));

async function pull(url, dest) {
  if (fs.existsSync(dest)) return true;
  const r = await fetch(url);
  if (!r.ok) {
    console.warn(`  HTTP ${r.status} for ${url}`);
    return false;
  }
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(dest, buf);
  console.log(`  → ${path.relative(process.cwd(), dest)} (${(buf.length / 1024).toFixed(0)} KB)`);
  return true;
}

let changed = 0;
for (const rec of records) {
  const isRemote = rec.narratorUrl && !rec.narratorUrl.startsWith("/api/");
  if (!isRemote) continue;

  console.log(`\n[${rec.id}] ${rec.paper?.title?.slice(0, 60) ?? "(no title)"}`);
  const videoPath = path.join(VIDEO_DIR, `${rec.id}.mp4`);
  const ok = await pull(rec.narratorUrl, videoPath);
  if (rec.thumbnailUrl && !rec.thumbnailUrl.startsWith("/api/")) {
    await pull(rec.thumbnailUrl, path.join(THUMB_DIR, `${rec.id}.jpg`));
  }
  if (!ok) continue;

  // Rewrite record URLs to local proxies.
  rec.narratorUrl = `/api/videos/${rec.id}`;
  rec.thumbnailUrl = `/api/thumbs/${rec.id}`;
  changed++;

  // Rewrite the composition HTML to point at the local URL too.
  const htmlFile = path.join(HTML_DIR, `${rec.id}.html`);
  if (fs.existsSync(htmlFile)) {
    let html = fs.readFileSync(htmlFile, "utf8");
    html = html.replace(/src="https:\/\/files\d?\.heygen\.ai[^"]+"/g, `src="/api/videos/${rec.id}"`);
    fs.writeFileSync(htmlFile, html, "utf8");
  }
}

if (changed > 0) {
  fs.writeFileSync(INDEX, JSON.stringify(records, null, 2), "utf8");
  console.log(`\nUpdated index — ${changed} record(s) now point at local copies.`);
} else {
  console.log("\nEverything already local. ✓");
}

/**
 * Composition store — persists generated briefings to disk so episodes
 * survive dev restarts and power the /channel index.
 *
 * Two layers:
 *  - .data/compositions.json  — the index (an array of CompositionRecord
 *    minus the heavy HTML body)
 *  - .data/compositions/<id>.html — the composition HTML for each episode
 *
 * On first import we hydrate the in-memory map from disk.
 */

import fs from "node:fs";
import path from "node:path";
import type { ArxivPaper } from "./tools/arxiv";
import type { Brief } from "./tools/brief";

const ROOT = path.resolve(process.cwd(), ".data");
const HTML_DIR = path.join(ROOT, "compositions");
const VIDEO_DIR = path.join(ROOT, "videos");
const THUMB_DIR = path.join(ROOT, "thumbnails");
const COMPOSED_DIR = path.join(ROOT, "composed");
const RENDER_DIR = path.join(ROOT, "render-projects");
const INDEX = path.join(ROOT, "compositions.json");

export type CompositionRecord = {
  id: string;
  paper: ArxivPaper;
  brief: Brief;
  narratorUrl: string;
  thumbnailUrl?: string;
  durationSeconds: number;
  createdAt: number;
  // optional pre-narration record (used by resume flow before HeyGen returns)
  pending?: boolean;
};

type Indexed = Omit<CompositionRecord, never>;

function ensureDirs() {
  for (const d of [ROOT, HTML_DIR, VIDEO_DIR, THUMB_DIR, COMPOSED_DIR, RENDER_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

export function composedVideoPath(id: string): string {
  return path.join(COMPOSED_DIR, `${id}.mp4`);
}
export function renderProjectDir(id: string): string {
  return path.join(RENDER_DIR, id);
}
export function hasComposedVideo(id: string): boolean {
  return fs.existsSync(composedVideoPath(id));
}

export function localVideoPath(id: string): string {
  return path.join(VIDEO_DIR, `${id}.mp4`);
}

export function localThumbPath(id: string): string {
  return path.join(THUMB_DIR, `${id}.jpg`);
}

export function hasLocalVideo(id: string): boolean {
  return fs.existsSync(localVideoPath(id));
}

export function hasLocalThumb(id: string): boolean {
  return fs.existsSync(localThumbPath(id));
}

/**
 * Download a remote (HeyGen signed) URL to local disk. The signed URLs
 * expire within 24h; pulling them down means our compositions stay
 * playable forever.
 */
export async function downloadAsset(
  url: string,
  dest: string,
): Promise<void> {
  ensureDirs();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

function readIndex(): Map<string, Indexed> {
  ensureDirs();
  if (!fs.existsSync(INDEX)) return new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(INDEX, "utf8")) as Indexed[];
    return new Map(raw.map((r) => [r.id, r]));
  } catch {
    return new Map();
  }
}

function writeIndex(map: Map<string, Indexed>) {
  ensureDirs();
  const arr = Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
  fs.writeFileSync(INDEX, JSON.stringify(arr, null, 2), "utf8");
}

const g = globalThis as unknown as { __compStore?: Map<string, Indexed> };
if (!g.__compStore) g.__compStore = readIndex();
const store = g.__compStore;

export function saveComposition(rec: CompositionRecord, html: string | null) {
  ensureDirs();
  store.set(rec.id, rec);
  writeIndex(store);
  if (html !== null) {
    fs.writeFileSync(path.join(HTML_DIR, `${rec.id}.html`), html, "utf8");
  }
}

export function getComposition(id: string): CompositionRecord | undefined {
  return store.get(id);
}

export function getCompositionHtml(id: string): string | null {
  const f = path.join(HTML_DIR, `${id}.html`);
  if (!fs.existsSync(f)) return null;
  return fs.readFileSync(f, "utf8");
}

export function listCompositions(): CompositionRecord[] {
  return Array.from(store.values())
    .filter((r) => !r.pending)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function deleteComposition(id: string) {
  store.delete(id);
  writeIndex(store);
  const f = path.join(HTML_DIR, `${id}.html`);
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

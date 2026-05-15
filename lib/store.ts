/**
 * Morning store — keeps the rendered MP4s + a tiny index of past briefs.
 * Disk-backed under .data/ so episodes survive dev restarts.
 */

import fs from "node:fs";
import path from "node:path";
import type { MetricSource } from "./tools/posthog";

const ROOT = path.resolve(process.cwd(), ".data");
const HTML_DIR = path.join(ROOT, "compositions");
const COMPOSED_DIR = path.join(ROOT, "composed");
const RENDER_DIR = path.join(ROOT, "render-projects");
const INDEX = path.join(ROOT, "morning.json");

export type BriefRecord = {
  id: string;
  metric: MetricSource;
  createdAt: number;
};

function ensureDirs() {
  for (const d of [ROOT, HTML_DIR, COMPOSED_DIR, RENDER_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

export function compositionHtmlPath(id: string) {
  return path.join(HTML_DIR, `${id}.html`);
}
export function composedVideoPath(id: string) {
  return path.join(COMPOSED_DIR, `${id}.mp4`);
}
export function renderProjectDir(id: string) {
  return path.join(RENDER_DIR, id);
}
export function hasComposedVideo(id: string) {
  return fs.existsSync(composedVideoPath(id));
}

function readIndex(): Map<string, BriefRecord> {
  ensureDirs();
  if (!fs.existsSync(INDEX)) return new Map();
  try {
    const arr = JSON.parse(fs.readFileSync(INDEX, "utf8")) as BriefRecord[];
    return new Map(arr.map((r) => [r.id, r]));
  } catch {
    return new Map();
  }
}

function writeIndex(map: Map<string, BriefRecord>) {
  ensureDirs();
  const arr = Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
  fs.writeFileSync(INDEX, JSON.stringify(arr, null, 2), "utf8");
}

const g = globalThis as unknown as { __briefStore?: Map<string, BriefRecord> };
if (!g.__briefStore) g.__briefStore = readIndex();
const store = g.__briefStore;

export function saveBrief(rec: BriefRecord, html: string) {
  ensureDirs();
  store.set(rec.id, rec);
  writeIndex(store);
  fs.writeFileSync(compositionHtmlPath(rec.id), html, "utf8");
}

export function getBrief(id: string) {
  return store.get(id);
}

export function listBriefs(): BriefRecord[] {
  return Array.from(store.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function getCompositionHtml(id: string): string | null {
  const p = compositionHtmlPath(id);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

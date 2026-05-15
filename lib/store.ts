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
  if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true });
  if (!fs.existsSync(HTML_DIR)) fs.mkdirSync(HTML_DIR, { recursive: true });
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

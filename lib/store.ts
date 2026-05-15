// Tiny in-memory composition store so /api/compositions/[id] can serve
// the HTML that /api/brief just generated. Resets on every dev restart.

import type { ArxivPaper } from "./tools/arxiv";
import type { Brief } from "./tools/brief";

export type CompositionRecord = {
  id: string;
  paper: ArxivPaper;
  brief: Brief;
  narratorUrl: string;
  durationSeconds: number;
  html: string;
  createdAt: number;
};

const g = globalThis as unknown as { __compStore?: Map<string, CompositionRecord> };
if (!g.__compStore) g.__compStore = new Map();
export const compositions = g.__compStore;

/**
 * Unified source type for everything Brief can read.
 * arXiv papers and news articles share enough shape — title, byline, lede,
 * a body, inline images — that the brief + animator can treat them
 * identically once normalized.
 */

import type { ArxivPaper } from "./arxiv";
import type { NewsArticle, NewsFigure } from "./news";

export type Source = ArxivPaper | NewsArticle;

export function sourceKindLabel(s: Source): string {
  return s.kind === "arxiv" ? "RESEARCH PAPER" : "NEWS ARTICLE";
}

export function sourceFigures(s: Source): NewsFigure[] {
  return s.kind === "arxiv"
    ? s.figures.map((f) => ({ caption: f.caption, imageUrl: f.imageUrl }))
    : s.figures;
}

export function sourceBody(s: Source): string {
  // arXiv: only the abstract is reliable; news: the full body.
  return s.kind === "arxiv" ? s.abstract : s.body;
}

export function sourceMetaLine(s: Source): string {
  if (s.kind === "arxiv") {
    return `${s.id} · ${s.publishedAt.slice(0, 4)}`;
  }
  const date = s.publishedAt ? new Date(s.publishedAt) : null;
  const dStr = date && !Number.isNaN(+date)
    ? date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "";
  return [s.source, dStr].filter(Boolean).join(" · ");
}

/** Auto-detect which fetcher to use from a raw URL. */
export function detectKind(input: string): "arxiv" | "news" {
  const t = input.trim();
  if (/arxiv\.org\/(abs|pdf|html)\//i.test(t)) return "arxiv";
  if (/^\d{4}\.\d{4,5}(v\d+)?$/.test(t)) return "arxiv";
  return "news";
}

/**
 * Unified source type for everything Brief can read.
 * arXiv papers, news articles, and GitHub repos share enough shape — title,
 * byline, lede, body, inline images — that the brief + animator + composer
 * treat them identically once normalized through these helpers.
 */

import type { ArxivPaper } from "./arxiv";
import type { NewsArticle, NewsFigure } from "./news";
import type { RepoSource } from "./repo";
import type { MetricSource } from "./posthog";

export type Source = ArxivPaper | NewsArticle | RepoSource | MetricSource;

export function sourceKindLabel(s: Source): string {
  switch (s.kind) {
    case "arxiv":
      return "RESEARCH PAPER";
    case "news":
      return "NEWS ARTICLE";
    case "repo":
      return "CODE REPOSITORY";
    case "metric":
      return "NORTH-STAR METRIC";
  }
}

export function sourceFigures(s: Source): NewsFigure[] {
  return s.figures.map((f) => ({ caption: f.caption, imageUrl: f.imageUrl }));
}

export function sourceBody(s: Source): string {
  // arXiv: abstract is the most reliable substrate; news/repo: full body text.
  return s.kind === "arxiv" ? s.abstract : s.body;
}

export function sourceMetaLine(s: Source): string {
  if (s.kind === "arxiv") {
    return `${s.id} · ${s.publishedAt.slice(0, 4)}`;
  }
  if (s.kind === "repo") {
    const parts = [s.source, s.language, `★ ${s.stars.toLocaleString()}`].filter(Boolean);
    return parts.join(" · ");
  }
  const date = s.publishedAt ? new Date(s.publishedAt) : null;
  const dStr =
    date && !Number.isNaN(+date)
      ? date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
      : "";
  return [s.source, dStr].filter(Boolean).join(" · ");
}

/** Auto-detect which fetcher to use from a raw URL. */
export function detectKind(input: string): "arxiv" | "news" | "repo" {
  const t = input.trim();
  if (/arxiv\.org\/(abs|pdf|html)\//i.test(t)) return "arxiv";
  if (/^\d{4}\.\d{4,5}(v\d+)?$/.test(t)) return "arxiv";
  if (/github\.com\/[^/]+\/[^/?#]+/i.test(t)) return "repo";
  if (/^[\w-]+\/[\w.-]+$/.test(t)) return "repo"; // bare owner/repo
  return "news";
}

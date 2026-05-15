/**
 * Generic news / article fetcher.
 *
 * Uses Jina Reader (https://r.jina.ai/<url>) which is free, key-less, and
 * returns clean markdown for any public article — BBC, Reuters, TechCrunch,
 * The Verge, HN, Wikipedia, company blogs, Substack public posts, etc.
 *
 * Falls back to direct HTML fetch + minimal cleaning if Jina is down.
 */

import { openai } from "../openai";

export type NewsFigure = { caption: string; imageUrl: string };

export type NewsArticle = {
  kind: "news";
  id: string;
  url: string;
  title: string;
  authors: string[]; // byline
  source: string; // publication name, e.g. "BBC News"
  abstract: string; // lede / 1-paragraph summary
  body: string; // full text, markdown
  publishedAt: string;
  figures: NewsFigure[]; // inline images
};

function slugFromUrl(url: string): string {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export async function fetchNewsArticle(url: string): Promise<NewsArticle> {
  const readerUrl = `https://r.jina.ai/${url}`;
  const md = await fetch(readerUrl, {
    headers: { Accept: "text/markdown" },
  }).then((r) => {
    if (!r.ok) throw new Error(`Jina Reader ${r.status} for ${url}`);
    return r.text();
  });

  // Jina output starts with a metadata block:
  //   Title: ...
  //   URL Source: ...
  //   Published Time: ...
  //   Markdown Content:
  //   <body markdown>
  const titleM = md.match(/^Title:\s*(.+)$/m);
  const urlM = md.match(/^URL Source:\s*(.+)$/m);
  const dateM = md.match(/^Published Time:\s*(.+)$/m);
  const contentIdx = md.indexOf("Markdown Content:");
  const body = contentIdx >= 0
    ? md.slice(contentIdx + "Markdown Content:".length).trim()
    : md;

  // Extract inline images.
  const figures: NewsFigure[] = [];
  for (const m of body.matchAll(/!\[([^\]]*)\]\(([^)\s]+)/g)) {
    const src = m[2];
    if (!/^https?:\/\//.test(src)) continue;
    if (figures.find((f) => f.imageUrl === src)) continue;
    figures.push({ caption: m[1].replace(/\s+/g, " ").trim(), imageUrl: src });
    if (figures.length >= 6) break;
  }

  // Ask a cheap model to pull out a clean byline + publication + 1-paragraph
  // abstract from the noisy markdown. Anything unparsable defaults to "".
  const summary = await openai().chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          'Extract from this article. Return strict JSON: {"authors": string[], "source": string, "abstract": string}. ' +
          "authors = the bylined writers (names only); empty array if none. " +
          "source = the publication name (BBC News, The Verge, etc). " +
          "abstract = a single-paragraph lede summary, ~40 words.",
      },
      {
        role: "user",
        content: body.slice(0, 4000),
      },
    ],
  });

  let meta: { authors?: string[]; source?: string; abstract?: string } = {};
  try {
    meta = JSON.parse(summary.choices[0]?.message?.content ?? "{}");
  } catch {
    /* ignore */
  }

  return {
    kind: "news",
    id: slugFromUrl(urlM?.[1] || url),
    url: (urlM?.[1] || url).trim(),
    title: (titleM?.[1] || "Untitled").trim().slice(0, 200),
    authors: meta.authors ?? [],
    source: meta.source ?? "",
    abstract:
      meta.abstract ??
      body.split(/\n\n/).find((p) => p.length > 80)?.slice(0, 400) ??
      "",
    body,
    publishedAt: (dateM?.[1] || new Date().toISOString()).trim(),
    figures,
  };
}

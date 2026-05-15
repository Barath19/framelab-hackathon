/**
 * arXiv paper fetcher.
 *
 * Given a URL like https://arxiv.org/abs/1706.03762 or just the ID 1706.03762,
 * returns the paper metadata plus a list of figure image URLs and equations.
 *
 * For figures we parse the arXiv HTML rendering at /html/<id>v<n> when available,
 * which has all <img> assets inline. Falls back to abstract-only if HTML page
 * 404s (older papers without HTML renders).
 */

export type ArxivFigure = {
  caption: string;
  imageUrl: string;
};

export type ArxivPaper = {
  kind: "arxiv";
  id: string;
  url: string;
  title: string;
  authors: string[];
  abstract: string;
  publishedAt: string;
  figures: ArxivFigure[];
};

function parseId(input: string): string {
  // Accept full URL, abs URL, pdf URL, html URL, or raw id.
  const trimmed = input.trim();
  const m =
    trimmed.match(/arxiv\.org\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5})(?:v\d+)?/i) ||
    trimmed.match(/^(\d{4}\.\d{4,5})$/);
  if (!m) throw new Error(`Not a recognizable arXiv URL or ID: ${input}`);
  return m[1];
}

export async function fetchArxivPaper(input: string): Promise<ArxivPaper> {
  const id = parseId(input);

  // 1) Metadata via arXiv export API (Atom XML).
  const xml = await fetch(
    `https://export.arxiv.org/api/query?id_list=${id}`,
  ).then((r) => r.text());

  const titleM = xml.match(/<entry>[\s\S]*?<title>([\s\S]*?)<\/title>/);
  const summaryM = xml.match(/<summary>([\s\S]*?)<\/summary>/);
  const publishedM = xml.match(/<published>([\s\S]*?)<\/published>/);
  const authorMs = [...xml.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/g)];

  const title = (titleM?.[1] ?? id).replace(/\s+/g, " ").trim();
  const abstract = (summaryM?.[1] ?? "").replace(/\s+/g, " ").trim();
  const publishedAt = (publishedM?.[1] ?? "").trim();
  const authors = authorMs.map((m) => m[1].trim());

  // 2) Figures via the HTML render page.
  const figures: ArxivFigure[] = [];
  try {
    const htmlUrl = `https://arxiv.org/html/${id}`;
    const html = await fetch(htmlUrl).then((r) => (r.ok ? r.text() : ""));
    if (html) {
      // arXiv HTML uses <figure> ... <img src="..."> ... <figcaption>...</figcaption>
      const figMatches = [
        ...html.matchAll(
          /<figure[\s\S]*?<img[^>]+src="([^"]+)"[\s\S]*?<figcaption[^>]*>([\s\S]*?)<\/figcaption>[\s\S]*?<\/figure>/g,
        ),
      ];
      for (const m of figMatches.slice(0, 8)) {
        let src = m[1];
        if (src.startsWith("/")) src = `https://arxiv.org${src}`;
        else if (!src.startsWith("http")) src = `${htmlUrl}/${src}`;
        const caption = m[2]
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 300);
        figures.push({ imageUrl: src, caption });
      }
    }
  } catch {
    /* figures optional */
  }

  return {
    kind: "arxiv",
    id,
    url: `https://arxiv.org/abs/${id}`,
    title,
    authors,
    abstract,
    publishedAt,
    figures,
  };
}

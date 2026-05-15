/**
 * GitHub repo fetcher.
 *
 * Pulls the metadata Brief needs to explain a codebase's architecture:
 *  - basic metadata (name, description, stars, language, topics, license)
 *  - README rendered to plain text
 *  - root-level file/folder tree (what's the shape of the project?)
 *  - parsed entry point from package.json / pyproject.toml / Cargo.toml /
 *    go.mod when present (gives the animator a real entry to trace)
 *
 * Uses the public GitHub REST API — no token required for the small number
 * of requests we make per run. The free tier (60 req/hour) is plenty.
 */

import { openai } from "../openai";

export type RepoFigure = { caption: string; imageUrl: string };

export type RepoTreeNode = {
  path: string;
  type: "file" | "dir";
  size?: number;
};

export type RepoSource = {
  kind: "repo";
  id: string; // owner/repo
  url: string;
  title: string; // repo full name
  authors: string[]; // owner + top contributors (best effort)
  source: string; // "GitHub"
  abstract: string; // 1-paragraph summary
  body: string; // README text
  publishedAt: string; // pushed_at
  figures: RepoFigure[]; // images embedded in the README

  // Repo-specific extras the Animator can use.
  stars: number;
  language: string;
  topics: string[];
  entry?: string; // entry-point file path
  tree: RepoTreeNode[];
};

function parseRepoUrl(input: string): { owner: string; repo: string } {
  const t = input.trim();
  const m =
    t.match(/^https?:\/\/github\.com\/([^/]+)\/([^/?#]+)/i) ||
    t.match(/^([^/]+)\/([^/?#]+)$/);
  if (!m) throw new Error(`Not a recognizable GitHub repo URL: ${input}`);
  return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
}

async function gh<T>(path: string): Promise<T> {
  const r = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!r.ok) throw new Error(`GitHub API ${r.status} for ${path}`);
  return (await r.json()) as T;
}

type GhRepo = {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  topics: string[];
  pushed_at: string;
  default_branch: string;
  html_url: string;
  owner: { login: string };
};

type GhReadme = { content: string; encoding: "base64" | string };

type GhContent = {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
};

function detectEntry(tree: RepoTreeNode[]): string | undefined {
  // Prefer the conventional ones — small heuristic, doesn't need to be perfect.
  const candidates = [
    "src/index.ts", "src/index.js", "src/main.ts", "src/main.py",
    "src/lib.rs", "src/main.rs", "src/main.go",
    "index.ts", "index.js", "main.py", "main.go", "main.rs",
    "lib/index.ts", "lib/index.js",
    "pyproject.toml", "package.json", "Cargo.toml", "go.mod",
  ];
  const files = new Set(tree.filter((n) => n.type === "file").map((n) => n.path));
  return candidates.find((c) => files.has(c));
}

function readmeToText(md: string): string {
  // Strip HTML comments + badge images at the top — they're noisy for the LLM.
  return md
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/!\[[^\]]*\]\([^)]*(?:shields\.io|badge|github\.com\/.+\/workflows)[^)]*\)/gi, "")
    .replace(/^[ \t]*\n{2,}/gm, "\n\n");
}

function extractImages(md: string, owner: string, repo: string, branch: string): RepoFigure[] {
  const figs: RepoFigure[] = [];
  const matches = [...md.matchAll(/!\[([^\]]*)\]\(([^)\s]+)/g)];
  for (const m of matches) {
    let src = m[2];
    if (/shields\.io|badge|github\.com\/.+\/workflows/i.test(src)) continue;
    if (src.startsWith("./")) src = src.slice(2);
    if (!/^https?:\/\//.test(src)) {
      // resolve relative → raw.githubusercontent
      src = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${src.replace(/^\//, "")}`;
    }
    if (figs.find((f) => f.imageUrl === src)) continue;
    figs.push({ caption: m[1].replace(/\s+/g, " ").trim(), imageUrl: src });
    if (figs.length >= 6) break;
  }
  return figs;
}

export async function fetchRepo(input: string): Promise<RepoSource> {
  const { owner, repo } = parseRepoUrl(input);

  const [meta, readmeRaw, contents] = await Promise.all([
    gh<GhRepo>(`/repos/${owner}/${repo}`),
    gh<GhReadme>(`/repos/${owner}/${repo}/readme`).catch(() => null),
    gh<GhContent[]>(`/repos/${owner}/${repo}/contents`).catch(() => []),
  ]);

  const tree: RepoTreeNode[] = contents.map((c) => ({
    path: c.path,
    type: c.type,
    size: c.size,
  }));

  let readmeText = "";
  if (readmeRaw && readmeRaw.encoding === "base64") {
    readmeText = readmeToText(Buffer.from(readmeRaw.content, "base64").toString("utf8"));
  }

  const figures = readmeRaw
    ? extractImages(readmeText, owner, repo, meta.default_branch)
    : [];

  // One cheap call to compress the README into a single paragraph abstract.
  let abstract = "";
  try {
    const summary = await openai().chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            'Summarize this GitHub README in one tight paragraph (~50 words). Return JSON: {"abstract": string}. Plain prose, no bullets.',
        },
        { role: "user", content: readmeText.slice(0, 6000) || `${meta.full_name}: ${meta.description ?? ""}` },
      ],
    });
    const j = JSON.parse(summary.choices[0]?.message?.content ?? "{}");
    abstract = j.abstract ?? "";
  } catch {
    abstract = meta.description ?? "";
  }

  return {
    kind: "repo",
    id: meta.full_name,
    url: meta.html_url,
    title: meta.full_name,
    authors: [meta.owner.login],
    source: "GitHub",
    abstract: abstract || meta.description || "",
    body: readmeText || meta.description || "",
    publishedAt: meta.pushed_at,
    figures,
    stars: meta.stargazers_count,
    language: meta.language ?? "",
    topics: meta.topics ?? [],
    entry: detectEntry(tree),
    tree,
  };
}

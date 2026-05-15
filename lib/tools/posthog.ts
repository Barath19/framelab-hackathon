/**
 * PostHog NorthStar source.
 *
 * Reads a chosen metric (e.g. `video_rendered` daily over 30 days) and
 * normalizes it into a Source the Brief/Animator/Composer pipeline can
 * consume identically to arXiv/news/repo.
 *
 * Two paths at runtime:
 *  1. POSTHOG_PERSONAL_API_KEY + POSTHOG_PROJECT_ID set → live HogQL query.
 *  2. Otherwise → load the pre-fetched JSON at .data/posthog/<id>.json
 *     (seeded by the MCP during dev).
 *
 * Either way, the orchestrator gets a typed MetricSource with derived
 * insights (peak, growth %, milestones) the brief/animator can reason on.
 */

import fs from "node:fs";
import path from "node:path";

export type MetricPoint = { date: string; value: number; users?: number };

export type MetricMilestone = {
  date: string;
  label: string;
  value?: number;
};

export type MetricSource = {
  kind: "metric";
  id: string;
  url: string;
  title: string;
  authors: string[];
  source: string;
  abstract: string;
  body: string;
  publishedAt: string;
  figures: { caption: string; imageUrl: string }[];

  metric: {
    event: string;
    unit: string;
    series: MetricPoint[];
    total: number;
    start: number;
    end: number;
    peak: { date: string; value: number };
    growthPct: number; // last / first - 1, expressed as percent
    weekOverWeekPct: number;
    activeUsersTotal: number;
  };
  milestones: MetricMilestone[];
};

const ROOT = path.resolve(process.cwd(), ".data/posthog");

type SeriesCache = {
  id: string;
  metric: string;
  title: string;
  unit: string;
  publishedAt: string;
  fetchedFrom: string;
  series: MetricPoint[];
};

async function fetchFromRest(metricId: string): Promise<SeriesCache | null> {
  const personal = process.env.POSTHOG_PERSONAL_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const host = (process.env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/+$/, "");
  if (!personal || !projectId) return null;

  // Single canonical metric for the demo. Easy to extend later.
  if (metricId !== "video_rendered_30d") return null;
  const hogql = `SELECT toDate(timestamp) AS day, count() AS value, uniq(distinct_id) AS users FROM events WHERE event = 'video_rendered' AND timestamp >= now() - INTERVAL 30 DAY GROUP BY day ORDER BY day`;

  const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${personal}`,
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query: hogql } }),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { results: [string, number, number][] };
  const series: MetricPoint[] = j.results.map(([date, value, users]) => ({
    date,
    value: Number(value),
    users: Number(users),
  }));
  return {
    id: metricId,
    metric: "video_rendered",
    title: "Daily videos rendered",
    unit: "videos / day",
    publishedAt: new Date().toISOString(),
    fetchedFrom: `PostHog · project ${projectId} (live)`,
    series,
  };
}

function loadFromCache(metricId: string): SeriesCache {
  const p = path.join(ROOT, `${metricId}.json`);
  if (!fs.existsSync(p)) {
    throw new Error(`No cached metric at ${p} and no live PostHog credentials. Run the seeder + cache step first.`);
  }
  return JSON.parse(fs.readFileSync(p, "utf8")) as SeriesCache;
}

/** Identify big spikes vs a 3-day rolling median as milestones. */
function deriveMilestones(series: MetricPoint[]): MetricMilestone[] {
  const out: MetricMilestone[] = [];
  if (!series.length) return out;

  // First-day milestone.
  out.push({ date: series[0].date, label: "First render", value: series[0].value });

  // Peak.
  const peak = series.reduce((p, c) => (c.value > p.value ? c : p), series[0]);
  out.push({ date: peak.date, label: `Peak — ${peak.value} renders`, value: peak.value });

  // Biggest single-day jump (compared to previous).
  let bestJump = { gain: 0, point: series[0] as MetricPoint };
  for (let i = 1; i < series.length; i++) {
    const gain = series[i].value - series[i - 1].value;
    if (gain > bestJump.gain) bestJump = { gain, point: series[i] };
  }
  if (bestJump.gain > 0 && bestJump.point.date !== peak.date) {
    out.push({
      date: bestJump.point.date,
      label: `+${bestJump.gain} vs day before`,
      value: bestJump.point.value,
    });
  }

  return out;
}

export async function fetchNorthStar(metricId: string): Promise<MetricSource> {
  const cache = (await fetchFromRest(metricId).catch(() => null)) || loadFromCache(metricId);

  const series = cache.series.filter((p) => Number.isFinite(p.value));
  const total = series.reduce((a, p) => a + p.value, 0);
  const start = series[0]?.value ?? 0;
  const end = series.at(-1)?.value ?? 0;
  const peak = series.reduce((p, c) => (c.value > p.value ? c : p), series[0] ?? { date: "", value: 0 });
  const growthPct = start > 0 ? Math.round(((end - start) / start) * 100) : 0;

  // Week-over-week: last 7 vs prior 7.
  const last7 = series.slice(-7).reduce((a, p) => a + p.value, 0);
  const prior7 = series.slice(-14, -7).reduce((a, p) => a + p.value, 0);
  const weekOverWeekPct = prior7 > 0 ? Math.round(((last7 - prior7) / prior7) * 100) : 0;
  const activeUsersTotal = new Set(
    cache.series.flatMap((p) => (p.users != null ? [p.users] : [])),
  ).size > 0
    ? Math.max(...cache.series.map((p) => p.users ?? 0))
    : 0;

  const milestones = deriveMilestones(series);
  const abstractLines = [
    `Tracking ${cache.metric} over ${series.length} days.`,
    `Total ${total.toLocaleString()} ${cache.unit}.`,
    `Peak ${peak.value} on ${peak.date}.`,
    `Last week ${weekOverWeekPct >= 0 ? "up" : "down"} ${Math.abs(weekOverWeekPct)}% vs prior week.`,
  ];

  return {
    kind: "metric",
    id: cache.id,
    url: `posthog://insights/${cache.id}`,
    title: cache.title,
    authors: ["FrameLab"],
    source: cache.fetchedFrom,
    abstract: abstractLines.join(" "),
    body: abstractLines.join("\n") + "\n\nSeries (date — value):\n" +
      series.map((p) => `  ${p.date}: ${p.value}`).join("\n"),
    publishedAt: cache.publishedAt,
    figures: [],

    metric: {
      event: cache.metric,
      unit: cache.unit,
      series,
      total,
      start,
      end,
      peak: { date: peak.date, value: peak.value },
      growthPct,
      weekOverWeekPct,
      activeUsersTotal,
    },
    milestones,
  };
}

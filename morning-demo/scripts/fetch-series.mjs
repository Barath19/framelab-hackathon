#!/usr/bin/env node
/**
 * Query PostHog for everything the morning brief shows, then patch
 * index.html in place. Pulls:
 *
 *   • DAU per day, 30-day window         (uniq distinct_id on $pageview)
 *   • WAU per day, 30-day window         (rolling 7-day unique on $pageview)
 *   • Subscription events, 90 days       → cumulative MRR series
 *   • Total signups, 30 days
 *   • Total paid users now
 *
 * Writes morning.json (debug) and rewrites index.html.
 *
 *   POSTHOG_HOST  POSTHOG_PROJECT_ID  POSTHOG_PERSONAL_API_KEY
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(__dirname, "..");
const ENV_FILE = path.join(PROJECT_DIR, ".env");
const HTML_FILE = path.join(PROJECT_DIR, "index.html");
const JSON_FILE = path.join(PROJECT_DIR, "morning.json");

const env = Object.fromEntries(
  (fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, "utf8") : "")
    .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const HOST = (env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/+$/, "");
const PROJECT_ID = env.POSTHOG_PROJECT_ID;
const PERSONAL = env.POSTHOG_PERSONAL_API_KEY;
if (!PROJECT_ID || !PERSONAL) { console.error("Missing POSTHOG_PROJECT_ID or POSTHOG_PERSONAL_API_KEY"); process.exit(1); }

async function hogql(query) {
  const res = await fetch(`${HOST}/api/projects/${PROJECT_ID}/query/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${PERSONAL}` },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).results || [];
}

console.log(`→ Querying PostHog (project ${PROJECT_ID})…`);

// === DAU last 30 days ===
const dauRows = await hogql(`
  SELECT toDate(timestamp) AS day, uniq(distinct_id) AS value
  FROM events
  WHERE event = '$pageview'
    AND timestamp >= now() - INTERVAL 30 DAY
  GROUP BY day ORDER BY day
`);
const dau = dauRows.map(([d, v]) => ({ date: String(d).slice(5), value: Number(v) || 0 }));

// === WAU "right now" — uniq distinct_id over last 7 days ===
const wauNowRow = await hogql(`
  SELECT uniq(distinct_id) AS value
  FROM events
  WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 7 DAY
`);
const wauNowValue = Number(wauNowRow?.[0]?.[0] || 0);

// Weekly buckets for a sparse WAU line.
const wauWeeklyRows = await hogql(`
  SELECT toStartOfWeek(timestamp) AS day, uniq(distinct_id) AS value
  FROM events
  WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 90 DAY
  GROUP BY day ORDER BY day
`);
const wau = wauWeeklyRows.map(([d, v]) => ({ date: String(d).slice(5), value: Number(v) || 0 }));

// === Subscription deltas → cumulative MRR series, 90 days ===
const subRows = await hogql(`
  SELECT
    toDate(timestamp) AS day,
    sumIf(toFloat(properties.monthly_value), event = 'subscription_started') AS started,
    sumIf(toFloat(properties.monthly_value), event = 'subscription_canceled') AS canceled
  FROM events
  WHERE event IN ('subscription_started','subscription_canceled')
    AND timestamp >= now() - INTERVAL 90 DAY
  GROUP BY day ORDER BY day
`);
let mrrCum = 0;
const mrr = subRows.map(([d, s, c]) => {
  mrrCum += (Number(s) || 0) - (Number(c) || 0);
  return { date: String(d).slice(5), value: Math.round(mrrCum) };
});

// === Totals over the last 30 days ===
const totals = await hogql(`
  SELECT
    countIf(event = 'signup') AS signups,
    uniqIf(distinct_id, event = '$pageview') AS active_users,
    countIf(event = 'subscription_started') AS new_subs,
    countIf(event = 'subscription_canceled') AS cancels,
    countIf(event = 'payment_received') AS payments,
    sumIf(toFloat(properties.\`$revenue\`), event = 'payment_received') AS revenue_30d
  FROM events
  WHERE timestamp >= now() - INTERVAL 30 DAY
`);
const [signups, activeUsers30d, newSubs, cancels, payments, revenue30d] = totals[0] || [0,0,0,0,0,0];

// Derived stats
const dauNow = dau.at(-1)?.value || 0;
const dauPeak = dau.reduce((p, x) => (x.value > p.value ? x : p), dau[0] || { date: "", value: 0 });
const wauNow = wauNowValue || (wau.at(-1)?.value || 0);
const mrrNow = mrr.at(-1)?.value || 0;
const arrNow = mrrNow * 12;

// DAU WoW
const last7 = dau.slice(-7).reduce((a, p) => a + p.value, 0);
const prior7 = dau.slice(-14, -7).reduce((a, p) => a + p.value, 0);
const dauWowPct = prior7 > 0 ? Math.round(((last7 - prior7) / prior7) * 100) : 0;

const summary = {
  fetchedAt: new Date().toISOString(),
  dau, wau, mrr,
  dauNow, dauPeak, wauNow, mrrNow, arrNow, dauWowPct,
  signups30d: Number(signups), newSubs30d: Number(newSubs), cancels30d: Number(cancels),
  revenue30d: Number(revenue30d) || 0,
  activeUsers30d: Number(activeUsers30d) || 0,
};
fs.writeFileSync(JSON_FILE, JSON.stringify(summary, null, 2), "utf8");

console.log(`  DAU now ${dauNow} · peak ${dauPeak.value} on ${dauPeak.date} · WoW ${dauWowPct >= 0 ? "+" : ""}${dauWowPct}%`);
console.log(`  WAU now ${wauNow}`);
console.log(`  MRR  now $${mrrNow.toLocaleString()}/mo · ARR ~$${arrNow.toLocaleString()}`);
console.log(`  Last 30d: ${signups} signups, ${newSubs} new subs, ${cancels} cancels, $${(Number(revenue30d)||0).toFixed(0)} revenue`);

// === Patch index.html ===
console.log("→ Patching index.html…");
let html = fs.readFileSync(HTML_FILE, "utf8");

const seriesJs = (rows) =>
  "[\n" + rows.map((r) => `        [${JSON.stringify(r.date)}, ${r.value}]`).join(",\n") + "\n      ]";

// Replace the inline data block: a single const SUMMARY = ...; block.
const block =
  "const SUMMARY = " +
  JSON.stringify({
    dau: dau.map((r) => [r.date, r.value]),
    wau: wau.map((r) => [r.date, r.value]),
    mrr: mrr.map((r) => [r.date, r.value]),
    dauNow, dauPeak, wauNow, mrrNow, arrNow, dauWowPct,
    signups30d: Number(signups), newSubs30d: Number(newSubs),
    revenue30d: Number(revenue30d) || 0,
  }) + ";";

if (html.includes("const SUMMARY = ")) {
  html = html.replace(/const SUMMARY = [\s\S]*?\};/, block);
} else if (html.includes("/*__SUMMARY__*/")) {
  html = html.replace(/\/\*__SUMMARY__\*\/[\s\S]*?\/\*__\/SUMMARY__\*\//, `/*__SUMMARY__*/${block}/*__/SUMMARY__*/`);
} else {
  // First-time injection: insert right after the opening of the main timeline script.
  // Composition uses a marker `// __INJECT_SUMMARY__` for this purpose.
  html = html.replace("// __INJECT_SUMMARY__", `// __INJECT_SUMMARY__\n      ${block}`);
}

fs.writeFileSync(HTML_FILE, html, "utf8");
console.log("  patched.");

#!/usr/bin/env node
/**
 * Seed PostHog with ~30 days of realistic FrameLab events so the NorthStar
 * pipeline has a story to tell:
 *
 *   • daily user growth from ~5 → ~80 DAU
 *   • events: signup, $pageview, video_rendered, source_connected, upgraded
 *   • a "launch spike" mid-window (cohort doubles for 2 days)
 *   • a milestone day where the 1,000th video is rendered
 *
 * Deterministic (seeded RNG) so reruns produce the same arc.
 *
 *   node scripts/seed-posthog.mjs
 */

import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const HOST = env.POSTHOG_HOST?.replace(/\/+$/, "") || "https://us.i.posthog.com";
const API_KEY = env.POSTHOG_PROJECT_API_KEY;
if (!API_KEY || !API_KEY.startsWith("phc_")) {
  console.error("Missing POSTHOG_PROJECT_API_KEY (phc_...) in .env.local");
  process.exit(1);
}

const DAYS = 30;
const NOW = Date.now();
const DAY_MS = 86_400_000;

// Seeded RNG (mulberry32) → deterministic story.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = rng(424242);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

// Distinct users grow over the window. Each user is born on a day, then
// returns with declining-but-stochastic probability afterwards.
const PLANS = ["free", "free", "free", "free", "pro"]; // skewed
const SOURCES = ["arxiv", "github", "news"];
const COUNTRIES = ["US", "US", "GB", "DE", "IN", "BR", "CA", "FR", "JP"];

const users = []; // { id, born_day, plan, country }
const targetTotal = 150;
const launchDay = 18; // 0-indexed
for (let i = 0; i < targetTotal; i++) {
  // skew births early-to-mid, with a spike on launchDay+0 and +1
  let day = Math.floor(rnd() * DAYS);
  if (rnd() < 0.18) day = launchDay + (rnd() < 0.5 ? 0 : 1);
  users.push({
    id: `u_${i + 1}`,
    born_day: day,
    plan: pick(PLANS),
    country: pick(COUNTRIES),
  });
}
users.sort((a, b) => a.born_day - b.born_day);

const batch = [];

function ts(dayIdx, hour) {
  const t = NOW - (DAYS - dayIdx) * DAY_MS + hour * 3600_000;
  return new Date(t).toISOString();
}

let videosRendered = 0;
let renderedMilestoneFired = false;

for (let d = 0; d < DAYS; d++) {
  // 1) signups for users born today
  for (const u of users.filter((u) => u.born_day === d)) {
    const hour = Math.floor(rnd() * 6) + 8; // morning-ish
    batch.push({
      event: "signup",
      distinct_id: u.id,
      timestamp: ts(d, hour),
      properties: {
        plan: u.plan,
        $geoip_country_code: u.country,
        referrer: pick(["organic", "twitter", "hackernews", "google", "direct"]),
      },
    });
  }

  // 2) returning activity: every existing user has some chance of being active
  for (const u of users.filter((u) => u.born_day <= d)) {
    const age = d - u.born_day;
    // Pro users are stickier; everyone decays.
    const baseP = u.plan === "pro" ? 0.55 : 0.32;
    const decay = Math.exp(-age / 14);
    const dailyP = baseP * decay + 0.04;
    if (rnd() < dailyP) {
      const hour = Math.floor(rnd() * 14) + 7;
      // pageview
      batch.push({
        event: "$pageview",
        distinct_id: u.id,
        timestamp: ts(d, hour),
        properties: { $current_url: "https://framelab.app/" },
      });
      // sometimes connect a source
      if (rnd() < 0.18) {
        batch.push({
          event: "source_connected",
          distinct_id: u.id,
          timestamp: ts(d, hour),
          properties: { source: pick(SOURCES) },
        });
      }
      // sometimes render a video
      if (rnd() < 0.45) {
        videosRendered += 1;
        const evt = {
          event: "video_rendered",
          distinct_id: u.id,
          timestamp: ts(d, hour + Math.floor(rnd() * 2)),
          properties: {
            source: pick(SOURCES),
            duration_seconds: 20,
            video_number: videosRendered,
          },
        };
        if (!renderedMilestoneFired && videosRendered >= 1000) {
          renderedMilestoneFired = true;
          evt.properties.milestone = "1000th_video_rendered";
        }
        batch.push(evt);
      }
      // free → pro upgrade
      if (u.plan === "free" && age > 3 && rnd() < 0.012) {
        u.plan = "pro";
        batch.push({
          event: "upgraded",
          distinct_id: u.id,
          timestamp: ts(d, hour + 3),
          properties: { from: "free", to: "pro", mrr_delta: 19 },
        });
      }
    }
  }
}

// Sort by time for sanity in the activity feed.
batch.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));

console.log(`Built ${batch.length} events across ${DAYS} days.`);
console.log(`  signups:           ${batch.filter((e) => e.event === "signup").length}`);
console.log(`  pageviews:         ${batch.filter((e) => e.event === "$pageview").length}`);
console.log(`  source_connected:  ${batch.filter((e) => e.event === "source_connected").length}`);
console.log(`  video_rendered:    ${batch.filter((e) => e.event === "video_rendered").length}`);
console.log(`  upgraded:          ${batch.filter((e) => e.event === "upgraded").length}`);
console.log(`Unique users:        ${new Set(batch.map((e) => e.distinct_id)).size}`);

// Send in chunks — PostHog accepts up to several thousand per batch.
const CHUNK = 500;
for (let i = 0; i < batch.length; i += CHUNK) {
  const chunk = batch.slice(i, i + CHUNK);
  const res = await fetch(`${HOST}/batch/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: API_KEY,
      historical_migration: true,
      batch: chunk.map((e) => ({
        ...e,
        properties: { ...e.properties, $lib: "framelab-seeder" },
      })),
    }),
  });
  if (!res.ok) {
    console.error(`Chunk ${i / CHUNK + 1} failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  process.stdout.write(`. `);
}

console.log(`\n✓ Seeded ${batch.length} events to ${HOST}.`);
console.log(`  Allow ~10-30s for PostHog ingest to surface them in queries.`);

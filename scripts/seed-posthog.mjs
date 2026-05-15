#!/usr/bin/env node
/**
 * Seed PostHog with a realistic 90-day SaaS product story:
 *
 *   • 500 unique users (`m_001` … `m_500`) on an exponential growth curve
 *   • per-day events: signup, $pageview (multiple), feature_used
 *   • paid lifecycle: subscription_started (plan + monthly_value),
 *     subscription_canceled, payment_received (with $revenue)
 *   • realistic retention decay + churn
 *
 * Hits PostHog's /batch/ ingest endpoint with the public phc_ key.
 * Deterministic (seeded RNG) — re-runs produce the same arc.
 *
 *   node scripts/seed-posthog.mjs
 */

import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const HOST = (env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/+$/, "");
const KEY = env.POSTHOG_PROJECT_API_KEY;
if (!KEY?.startsWith("phc_")) { console.error("POSTHOG_PROJECT_API_KEY missing"); process.exit(1); }

const DAYS = 90;
const NOW = Date.now();
const DAY = 86_400_000;
const TARGET = 500;

function rng(seed) {
  let a = seed >>> 0;
  return () => { a=(a+0x6d2b79f5)|0; let t=Math.imul(a^(a>>>15),1|a); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; };
}
const r = rng(20260515);
const pick = (a) => a[Math.floor(r() * a.length)];
const pad = (n, w=3) => String(n).padStart(w, "0");

const PLANS = [
  { id: "starter",    monthly: 19,  weight: 0.55 },
  { id: "pro",        monthly: 99,  weight: 0.30 },
  { id: "team",       monthly: 499, weight: 0.15 },
];
function pickPlan() {
  const x = r();
  let acc = 0;
  for (const p of PLANS) { acc += p.weight; if (x < acc) return p; }
  return PLANS[0];
}

const FEATURES = ["render_video", "connect_source", "export_mp4", "share_link", "schedule_brief"];
const COUNTRIES = ["US","US","US","GB","DE","IN","BR","CA","FR","JP","AU","ES","NL","SE"];
const REFERRERS = ["twitter","hackernews","google","direct","producthunt","linkedin","reddit","newsletter"];

/**
 * Generate users. Births skew toward the recent end (exponential growth)
 * with a launch spike around day 72 (a "Product Hunt" moment).
 */
const users = [];
for (let i = 0; i < TARGET; i++) {
  // Exponential birth skew: more users born recently.
  const u = r();
  let bornDay = Math.floor(Math.pow(u, 1.8) * DAYS);
  if (r() < 0.18) bornDay = 72 + (r() < 0.5 ? 0 : 1); // launch spike
  if (r() < 0.06) bornDay = 85 + Math.floor(r() * 3); // a tail post-launch
  bornDay = Math.max(0, Math.min(DAYS - 1, bornDay));

  // Lifespan = how many days they stay active (0-1 prob each day decays)
  const baseStickiness = 0.18 + r() * 0.42; // 0.18–0.60 daily-active probability seed
  users.push({
    id: `m_${pad(i + 1)}`,
    born: bornDay,
    stickiness: baseStickiness,
    country: pick(COUNTRIES),
    referrer: pick(REFERRERS),
    paid: null, // {plan, day, canceledDay?}
  });
}
users.sort((a, b) => a.born - b.born);

const batch = [];
function evt(name, distinctId, dayIdx, hour, props = {}) {
  const t = NOW - (DAYS - dayIdx) * DAY + hour * 3600_000 + Math.floor(r() * 3600_000);
  batch.push({
    event: name,
    distinct_id: distinctId,
    timestamp: new Date(t).toISOString(),
    properties: { ...props, $lib: "framelab-saas-seeder" },
  });
}

// Walk each day and generate events.
let cumulativeMrr = 0;
const dayMetrics = []; // for sanity check

for (let d = 0; d < DAYS; d++) {
  let dauSet = new Set();
  let mrrDelta = 0;

  // Signups for users born today
  for (const u of users.filter((u) => u.born === d)) {
    const hour = 8 + Math.floor(r() * 12);
    evt("signup", u.id, d, hour, {
      plan: "free",
      $geoip_country_code: u.country,
      referrer: u.referrer,
    });
    // First-session: a burst of pageviews
    const burst = 3 + Math.floor(r() * 6);
    for (let k = 0; k < burst; k++) {
      evt("$pageview", u.id, d, hour, { $current_url: pick(["https://framelab.app/", "https://framelab.app/dashboard", "https://framelab.app/sources"]) });
    }
    dauSet.add(u.id);
  }

  // Returning activity + paid lifecycle
  for (const u of users.filter((u) => u.born <= d)) {
    const age = d - u.born;
    if (age === 0) continue; // already counted in signup burst

    // If canceled, skip eligibility entirely
    if (u.paid?.canceledDay != null && u.paid.canceledDay <= d) {
      // still might churn-back? skip
      continue;
    }

    // Daily-active prob: stickiness × decay × (paid users stickier)
    const decay = Math.exp(-age / 35);
    const paidBoost = u.paid ? 1.6 : 1.0;
    const p = u.stickiness * decay * paidBoost + 0.05;
    if (r() > p) continue;

    dauSet.add(u.id);
    const hour = 7 + Math.floor(r() * 14);
    const views = 1 + Math.floor(r() * 4);
    for (let v = 0; v < views; v++) {
      evt("$pageview", u.id, d, hour, { $current_url: pick(["https://framelab.app/dashboard","https://framelab.app/renders","https://framelab.app/sources","https://framelab.app/billing"]) });
    }
    if (r() < 0.35) {
      evt("feature_used", u.id, d, hour, { feature: pick(FEATURES) });
    }

    // Upgrade path: free → paid sometime after day 3
    if (!u.paid && age >= 3 && r() < 0.022) {
      const plan = pickPlan();
      u.paid = { plan, day: d, canceledDay: null };
      evt("subscription_started", u.id, d, hour, {
        plan: plan.id,
        monthly_value: plan.monthly,
        $revenue: plan.monthly,
      });
      evt("payment_received", u.id, d, hour, {
        plan: plan.id,
        $revenue: plan.monthly,
      });
      mrrDelta += plan.monthly;
    }

    // Monthly renewal for paid users
    if (u.paid && age > 0 && (d - u.paid.day) % 30 === 0 && d > u.paid.day) {
      evt("payment_received", u.id, d, hour, { plan: u.paid.plan.id, $revenue: u.paid.plan.monthly });
    }

    // Cancellation — small daily prob for paid users
    if (u.paid && !u.paid.canceledDay && r() < 0.004) {
      u.paid.canceledDay = d;
      evt("subscription_canceled", u.id, d, hour, {
        plan: u.paid.plan.id,
        monthly_value: u.paid.plan.monthly,
        $revenue: -u.paid.plan.monthly,
      });
      mrrDelta -= u.paid.plan.monthly;
    }
  }

  cumulativeMrr += mrrDelta;
  dayMetrics.push({ d, dau: dauSet.size, mrr: cumulativeMrr });
}

batch.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));

console.log(`Generated ${batch.length} events across ${DAYS} days.`);
const counts = batch.reduce((acc, e) => { acc[e.event] = (acc[e.event] || 0) + 1; return acc; }, {});
for (const [name, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${name.padEnd(24)} ${n}`);
}
console.log(`Unique users: ${new Set(batch.map((e) => e.distinct_id)).size}`);
console.log(`DAU at end:   ${dayMetrics.at(-1).dau}`);
console.log(`MRR at end:   $${dayMetrics.at(-1).mrr.toLocaleString()}/mo  · ARR ~$${(dayMetrics.at(-1).mrr * 12).toLocaleString()}`);
console.log(`Peak DAU:     ${Math.max(...dayMetrics.map((x) => x.dau))}`);

// Push in chunks.
const CHUNK = 500;
let pushed = 0;
for (let i = 0; i < batch.length; i += CHUNK) {
  const chunk = batch.slice(i, i + CHUNK);
  const res = await fetch(`${HOST}/batch/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: KEY,
      historical_migration: true,
      batch: chunk,
    }),
  });
  if (!res.ok) {
    console.error(`chunk ${i / CHUNK + 1} failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  pushed += chunk.length;
  process.stdout.write(`. `);
}
console.log(`\n✓ Pushed ${pushed} events to ${HOST}.`);
console.log("  Allow ~30-60s for PostHog ingest to surface them in queries.");

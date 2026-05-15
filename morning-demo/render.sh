#!/usr/bin/env bash
# Pull fresh data from PostHog, patch the composition, render via Hyperframes,
# and print the resulting MP4 absolute path as the last line of stdout.
set -euo pipefail

cd "$(dirname "$0")"

# 1) Fetch live PostHog series → patch index.html in place.
node scripts/fetch-series.mjs

# 2) Render via Hyperframes CLI.
NPM_CONFIG_CACHE=/tmp/npm-cache npm run render

# 3) Emit the newest MP4 path so callers (BriefScheduler) can capture it.
ls -t renders/*.mp4 2>/dev/null | head -1 | xargs -I{} realpath "{}"

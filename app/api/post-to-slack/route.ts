import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Posts the cached morning brief MP4 to a Slack channel.
 * Env vars (server-only):
 *   SLACK_BOT_TOKEN   — xoxb-… with chat:write, chat:write.public, files:write
 *   SLACK_CHANNEL_ID  — e.g. C0B405ZNGR3 (the bot must be invited to it)
 *
 * Flow: chat.postMessage (metrics blocks) → files.getUploadURLExternal →
 * PUT MP4 binary → files.completeUploadExternal.
 */
export async function POST() {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID;
  if (!token || !channel) {
    return Response.json(
      { ok: false, error: "SLACK_BOT_TOKEN or SLACK_CHANNEL_ID missing" },
      { status: 500 },
    );
  }

  const summaryLine =
    "DAU 109  ·  WAU 491  ·  MRR $11.5K  ·  ARR $137K  ·  349 signups · 30d";

  const post = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel,
      text: "🌅 Morning brief is ready",
      blocks: [
        { type: "header", text: { type: "plain_text", text: "🌅 Morning brief" } },
        { type: "section", text: { type: "mrkdwn", text: summaryLine } },
      ],
    }),
  }).then((r) => r.json());
  if (!post.ok) return Response.json({ ok: false, step: "chat.postMessage", err: post }, { status: 500 });
  const channelId = post.channel as string;

  const mp4Path = path.join(process.cwd(), "public", "morning-latest.mp4");
  const buf = await fs.readFile(mp4Path);
  const filename = "morning-latest.mp4";

  const upJson = await fetch(
    `https://slack.com/api/files.getUploadURLExternal?filename=${encodeURIComponent(filename)}&length=${buf.byteLength}`,
    { headers: { Authorization: `Bearer ${token}` } },
  ).then((r) => r.json());
  if (!upJson.ok) return Response.json({ ok: false, step: "getUploadURL", err: upJson }, { status: 500 });

  const put = await fetch(upJson.upload_url, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: buf,
  });
  if (!put.ok) return Response.json({ ok: false, step: "PUT", status: put.status }, { status: 500 });

  const complete = await fetch("https://slack.com/api/files.completeUploadExternal", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      files: [{ id: upJson.file_id, title: "Morning brief" }],
      channel_id: channelId,
    }),
  }).then((r) => r.json());

  if (!complete.ok) return Response.json({ ok: false, step: "completeUpload", err: complete }, { status: 500 });
  return Response.json({ ok: true, filename, summary: summaryLine, channel: channelId });
}

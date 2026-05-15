/**
 * HeyGen narrator. Submits a script, polls until the video is ready,
 * returns the MP4 URL + duration.
 *
 * Single avatar/voice pair for now — the same Abigail/Brian combo we proved
 * working in scripts/test-heygen.mjs. Both are HeyGen's free public choices.
 */

// Picked for fast render: talking-head business style instead of full-body
// expressive. The expressive class was queueing past 5 min on observed runs.
const AVATAR_ID = "Adriana_BizTalk_Front_public";
const VOICE_ID = "f8c69e517f424cafaecde32dde57096b"; // Allison — English, female

export type NarratorClip = {
  videoId: string;
  videoUrl: string;
  thumbnailUrl?: string;
  durationSeconds: number;
};

export async function startNarration(
  script: string,
): Promise<{ videoId: string }> {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error("HEYGEN_API_KEY missing");

  const res = await fetch("https://api.heygen.com/v2/video/generate", {
    method: "POST",
    headers: {
      "X-Api-Key": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      video_inputs: [
        {
          character: {
            type: "avatar",
            avatar_id: AVATAR_ID,
            avatar_style: "normal",
          },
          voice: {
            type: "text",
            input_text: script,
            voice_id: VOICE_ID,
          },
        },
      ],
      dimension: { width: 720, height: 720 }, // square — easy to PIP-crop
    }),
  });

  const json = await res.json();
  const videoId = json?.data?.video_id;
  if (!videoId) throw new Error(`HeyGen returned no video_id: ${JSON.stringify(json)}`);
  return { videoId };
}

export async function pollNarration(
  videoId: string,
  callbacks?: {
    onStatus?: (s: string) => void;
    onTick?: (elapsed: number) => void;
  },
): Promise<NarratorClip> {
  const key = process.env.HEYGEN_API_KEY!;
  const start = Date.now();
  let last = "";
  let lastTickAt = 0;
  while (true) {
    await new Promise((r) => setTimeout(r, 4000));
    const elapsed = Math.floor((Date.now() - start) / 1000);
    // Tick every ~10s so the SSE stream stays warm and the user sees progress.
    if (elapsed - lastTickAt >= 10) {
      lastTickAt = elapsed;
      callbacks?.onTick?.(elapsed);
    }
    const r = await fetch(
      `https://api.heygen.com/v1/video_status.get?video_id=${videoId}`,
      { headers: { "X-Api-Key": key } },
    );
    const j = await r.json();
    const status = j?.data?.status as string | undefined;
    if (status && status !== last) {
      last = status;
      callbacks?.onStatus?.(status);
    }
    if (status === "completed") {
      return {
        videoId,
        videoUrl: j.data.video_url,
        thumbnailUrl: j.data.thumbnail_url,
        durationSeconds: Number(j.data.duration ?? 0),
      };
    }
    if (status === "failed") {
      throw new Error(`HeyGen failed: ${JSON.stringify(j)}`);
    }
    if ((Date.now() - start) / 1000 > 600) {
      throw new Error(
        `HeyGen narration still rendering after 10 minutes (video_id=${videoId}). ` +
          `It may still complete in your HeyGen dashboard — open app.heygen.com to retrieve it.`,
      );
    }
  }
}

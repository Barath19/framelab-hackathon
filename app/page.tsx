"use client";

import { useState } from "react";

export default function Home() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function sendToSlack() {
    setStatus("sending");
    setError(null);
    try {
      const r = await fetch("/api/post-to-slack", { method: "POST" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || j.step || "unknown");
      setStatus("sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen bg-[#050810] text-[#f5efe5]">
      <div className="max-w-5xl mx-auto px-8 py-16">
        <div className="flex items-center gap-3 text-xs uppercase tracking-[0.32em] text-[#c8c2b6] mb-4">
          <span className="w-2 h-2 rounded-full bg-[#ffb84a] shadow-[0_0_16px_#ffb84a]" />
          <span>framelab · morning brief</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold leading-tight tracking-tight bg-gradient-to-b from-white to-[#c8c2b6] bg-clip-text text-transparent">
          Your weekly metrics, as a 35-second video.
        </h1>
        <p className="mt-6 text-lg text-[#c8c2b6] max-w-2xl">
          Every Monday at 8 AM, framelab pulls live data from PostHog, narrates it with a
          HeyGen avatar, composes it with Hyperframes, and posts it to your team&apos;s Slack
          channel — before anyone&apos;s opened a dashboard.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <button
            onClick={sendToSlack}
            disabled={status === "sending"}
            className="px-6 py-3 rounded-xl bg-[#ff5566] text-white font-semibold shadow-[0_24px_60px_rgba(255,85,102,0.35)] hover:bg-[#ff6c7a] transition disabled:opacity-60"
          >
            {status === "sending" && "Posting…"}
            {status === "idle" && "📨 Post to Slack now"}
            {status === "sent" && "✓ Posted to Slack"}
            {status === "error" && "Retry"}
          </button>
          <a
            href="/morning-latest.mp4"
            target="_blank"
            rel="noreferrer"
            className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition"
          >
            🎥 Open latest brief
          </a>
          <a
            href="https://github.com/Barath19/framelab-hackathon"
            target="_blank"
            rel="noreferrer"
            className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition"
          >
            ⌘ GitHub
          </a>
        </div>
        {status === "error" && error && (
          <div className="mt-4 text-sm text-[#ff5566]">Error: {error}</div>
        )}

        <div className="mt-16 rounded-2xl overflow-hidden border border-white/10 shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
          <video
            src="/morning-latest.mp4"
            controls
            poster="/architecture.png"
            className="w-full aspect-video bg-black"
          />
        </div>

        <h2 className="mt-20 text-2xl font-bold tracking-tight">How it works</h2>
        <div className="mt-6 rounded-2xl overflow-hidden border border-white/10">
          <video
            src="/architecture.mp4"
            autoPlay
            loop
            muted
            playsInline
            className="w-full aspect-video bg-black"
          />
        </div>

        <div className="mt-6 grid md:grid-cols-5 gap-3 text-xs text-[#c8c2b6]">
          {[
            ["🧊 macOS Menubar", "8:00 AM every weekday"],
            ["📊 PostHog", "DAU · WAU · MRR · ARR"],
            ["🎙️ HeyGen", "Adriana + Allison voice"],
            ["🎬 Hyperframes", "1080p · 35s MP4"],
            ["💬 Slack", "files.upload inline"],
          ].map(([t, s]) => (
            <div key={t} className="p-4 rounded-xl bg-white/[0.03] border border-white/10">
              <div className="font-semibold text-[#f5efe5] mb-1">{t}</div>
              <div className="font-mono text-[10px] leading-snug">{s}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

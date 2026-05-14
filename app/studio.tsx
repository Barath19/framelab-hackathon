"use client";

import { useCallback, useRef, useState } from "react";

type OutputKey = "canvas" | "cover" | "lyric" | "reel" | "tiktok";
type OutputStatus = "queued" | "generating" | "ready" | "skipped";

type OutputState = {
  key: OutputKey;
  label: string;
  aspect: string; // tailwind aspect class
  status: OutputStatus;
  mediaUrl?: string;
};

type TranscriptLine = {
  ts: string;
  tag?: string;
  text: string;
};

const initialOutputs: OutputState[] = [
  { key: "canvas", label: "Spotify Canvas", aspect: "aspect-[9/16]", status: "queued" },
  { key: "cover", label: "Album Cover", aspect: "aspect-square", status: "queued" },
  { key: "lyric", label: "Lyric Video", aspect: "aspect-[9/16]", status: "queued" },
  { key: "reel", label: "Instagram Reel", aspect: "aspect-[9/16]", status: "queued" },
  { key: "tiktok", label: "TikTok", aspect: "aspect-[9/16]", status: "queued" },
];

export default function Studio() {
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [outputs, setOutputs] = useState<OutputState[]>(initialOutputs);
  const [activeOutput, setActiveOutput] = useState<OutputKey>("canvas");
  const fileRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith("audio")) setFile(f);
  }, []);

  const start = async () => {
    if (!file || running) return;
    setRunning(true);
    setTranscript([{ ts: "00:00", text: `Listening to ${file.name}…` }]);
    setOutputs(initialOutputs.map((o) => ({ ...o, status: "generating" })));

    // TODO: POST file to /api/produce and stream SSE into transcript + statuses.
    // Stubbed demo flow:
    const fakeLines: TranscriptLine[] = [
      { ts: "00:02", tag: "ANALYZE", text: "BPM 117 ▸ steady danceable. Key F# minor ▸ unease. Energy 0.68 ▸ contained, confident." },
      { ts: "00:08", tag: "MOOD", text: "Defiant • slick • paranoid-pop • noir. Night music." },
      { ts: "00:11", tag: "MOTIF", text: "Palette: cobalt → midnight → magenta → cream. Element: a glowing tile that pulses on the off-beat. Type: Playfair Italic, condensed. Motion: stalk." },
      { ts: "00:15", tag: "PLAN", text: "Producing all 5 formats. 117 BPM is TikTok's sweet spot." },
      { ts: "00:18", tag: "AVATAR", text: "Theatrical performer → avatar as hero moment. Sign-off at end of lyric video; intro on Reel; drop face on TikTok." },
      { ts: "00:22", tag: "FAL", text: "Generating 4 motif candidates…" },
      { ts: "00:31", tag: "VISION", text: "Candidate #3 wins — echo tile reads as paranoia." },
      { ts: "00:34", tag: "HEYGEN", text: "3 avatar clips queued: Reel intro, TikTok drop, sign-off." },
      { ts: "00:38", tag: "HYPERFRAMES", text: "Composing 5 outputs in parallel…" },
      { ts: "01:14", tag: "SELF-REVIEW", text: "Loop closure ✓ Sync drift on word 'lover' — re-rendering 2 clips." },
      { ts: "01:21", tag: "DONE", text: "5 deliverables ready. 14 decisions, 31 tool calls, 78s." },
    ];
    for (const line of fakeLines) {
      await new Promise((r) => setTimeout(r, 600));
      setTranscript((prev) => [...prev, line]);
    }
    setOutputs((prev) => prev.map((o) => ({ ...o, status: "ready" })));
    setRunning(false);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Header */}
      <header className="h-14 shrink-0 border-b border-border flex items-center px-6 gap-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-[--accent] to-[--accent-2]" />
          <span className="font-semibold tracking-tight text-lg">Motif</span>
          <span className="text-muted text-sm hidden sm:inline">— a visual identity from your music</span>
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted">
          <span className="hidden md:inline">Powered by</span>
          <span className="px-2 py-1 rounded bg-panel-2 border border-border">HeyGen</span>
          <span className="px-2 py-1 rounded bg-panel-2 border border-border">Hyperframes</span>
          <span className="px-2 py-1 rounded bg-panel-2 border border-border">OpenAI</span>
        </div>
      </header>

      {/* 3-pane */}
      <div className="flex-1 grid grid-cols-12 gap-0 min-h-0">
        {/* LEFT — input */}
        <section className="col-span-3 border-r border-border p-5 flex flex-col gap-4 min-h-0">
          <h2 className="text-xs uppercase tracking-widest text-muted">Track</h2>

          {!file ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className="flex-1 rounded-xl border-2 border-dashed border-border hover:border-[--accent] cursor-pointer flex flex-col items-center justify-center gap-3 p-6 text-center transition"
            >
              <div className="text-4xl">♪</div>
              <div className="text-sm">Drop your MP3 here</div>
              <div className="text-xs text-muted">or click to browse</div>
              <input
                ref={fileRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="rounded-xl border border-border bg-panel p-4">
                <div className="text-xs uppercase tracking-widest text-muted mb-1">Loaded</div>
                <div className="font-medium truncate">{file.name}</div>
                <div className="text-xs text-muted">{(file.size / 1024 / 1024).toFixed(1)} MB</div>
                <audio src={URL.createObjectURL(file)} controls className="w-full mt-3" />
              </div>

              <details className="rounded-xl border border-border bg-panel p-4">
                <summary className="text-xs uppercase tracking-widest text-muted cursor-pointer">Lyrics (optional)</summary>
                <textarea
                  className="w-full mt-3 bg-transparent text-sm outline-none resize-none min-h-32"
                  placeholder="Paste lyrics for sharper sync. Otherwise we transcribe with Whisper."
                />
              </details>

              <button
                onClick={start}
                disabled={running}
                className="rounded-xl py-3 font-semibold bg-gradient-to-r from-[--accent] to-[--accent-2] text-black disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {running ? "Directing…" : "Generate Motif"}
              </button>

              <button
                onClick={() => {
                  setFile(null);
                  setTranscript([]);
                  setOutputs(initialOutputs);
                }}
                className="text-xs text-muted hover:text-foreground self-start"
              >
                ↺ Start over
              </button>
            </div>
          )}
        </section>

        {/* CENTER — agent transcript */}
        <section className="col-span-5 border-r border-border flex flex-col min-h-0">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <span className="text-xs uppercase tracking-widest text-muted">Music Director</span>
            <span className={`ml-2 inline-block w-2 h-2 rounded-full ${running ? "bg-[--accent] animate-pulse" : "bg-muted"}`} />
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 font-mono text-sm space-y-2">
            {transcript.length === 0 ? (
              <div className="text-muted text-sm font-sans pt-20 text-center">
                Drop a track and hit <span className="text-foreground">Generate Motif</span>.<br />
                The agent will think out loud here.
              </div>
            ) : (
              transcript.map((line, i) => (
                <div key={i} className="flex gap-3 leading-relaxed">
                  <span className="text-muted shrink-0 w-12">[{line.ts}]</span>
                  {line.tag && (
                    <span className="shrink-0 text-[10px] uppercase tracking-widest text-[--accent-2] bg-panel-2 border border-border rounded px-1.5 py-0.5 h-fit mt-0.5">
                      {line.tag}
                    </span>
                  )}
                  <span className="text-foreground">{line.text}</span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* RIGHT — outputs */}
        <section className="col-span-4 flex flex-col min-h-0">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <span className="text-xs uppercase tracking-widest text-muted">Release Kit</span>
          </div>

          {/* Tab bar */}
          <div className="px-5 pt-3 flex gap-1.5 flex-wrap">
            {outputs.map((o) => (
              <button
                key={o.key}
                onClick={() => setActiveOutput(o.key)}
                className={`text-xs px-2.5 py-1 rounded-md border transition ${
                  activeOutput === o.key
                    ? "border-[--accent] text-foreground bg-panel"
                    : "border-border text-muted hover:text-foreground"
                }`}
              >
                <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle ${
                  o.status === "ready" ? "bg-[--accent-2]" :
                  o.status === "generating" ? "bg-[--accent] animate-pulse" :
                  o.status === "skipped" ? "bg-muted opacity-50" : "bg-muted"
                }`} />
                {o.label}
              </button>
            ))}
          </div>

          {/* Preview */}
          <div className="flex-1 p-5 overflow-auto">
            {outputs
              .filter((o) => o.key === activeOutput)
              .map((o) => (
                <div key={o.key} className="flex flex-col gap-3">
                  <div className={`${o.aspect} max-h-[calc(100vh-200px)] w-full rounded-xl bg-panel border border-border flex items-center justify-center mx-auto`}
                       style={{ maxWidth: o.aspect === "aspect-square" ? "420px" : "280px" }}>
                    {o.status === "ready" ? (
                      <div className="text-[--accent-2] text-sm">Preview placeholder</div>
                    ) : o.status === "generating" ? (
                      <div className="text-muted text-sm animate-pulse">Generating…</div>
                    ) : (
                      <div className="text-muted text-sm">{o.label}</div>
                    )}
                  </div>
                  <div className="text-xs text-muted text-center">
                    {o.key === "canvas" && "1080 × 1920 — 8s loop"}
                    {o.key === "cover" && "3000 × 3000 — still"}
                    {o.key === "lyric" && "1080 × 1920 — full song"}
                    {o.key === "reel" && "1080 × 1920 — 15s"}
                    {o.key === "tiktok" && "1080 × 1920 — 9s"}
                  </div>
                </div>
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}

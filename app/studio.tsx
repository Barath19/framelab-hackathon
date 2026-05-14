"use client";

import { useCallback, useRef, useState } from "react";
import { Clouds } from "./clouds";

type OutputKey = "canvas" | "cover" | "lyric" | "reel" | "tiktok";
type OutputStatus = "queued" | "generating" | "ready" | "skipped";

type OutputState = {
  key: OutputKey;
  label: string;
  aspect: string;
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

    // Stubbed for now — Task #14 will swap to /api/produce SSE stream.
    const fakeLines: TranscriptLine[] = [
      { ts: "00:02", tag: "ANALYZE", text: "BPM 117 ▸ steady danceable. Key F# minor ▸ unease. Energy 0.68 ▸ contained, confident." },
      { ts: "00:08", tag: "MOOD", text: "Defiant • slick • paranoid-pop • noir. Night music." },
      { ts: "00:11", tag: "MOTIF", text: "Palette: cobalt → midnight → magenta → cream. Element: a glowing tile that pulses on the off-beat. Type: Playfair Italic, condensed. Motion: stalk." },
      { ts: "00:15", tag: "PLAN", text: "Producing all 5 formats. 117 BPM is TikTok's sweet spot." },
      { ts: "00:18", tag: "AVATAR", text: "Theatrical performer → avatar as hero moment. Sign-off at end of lyric video; intro on Reel; drop face on TikTok." },
      { ts: "00:22", tag: "VISUALS", text: "Generating 4 motif candidates…" },
      { ts: "00:31", tag: "CRITIC", text: "Candidate #3 wins — echo tile reads as paranoia." },
      { ts: "00:34", tag: "HEYGEN", text: "3 avatar clips queued: Reel intro, TikTok drop, sign-off." },
      { ts: "00:38", tag: "COMPOSE", text: "Hyperframes composing 5 outputs in parallel…" },
      { ts: "01:14", tag: "REVIEW", text: "Loop closure ✓ Sync drift on word 'lover' — re-rendering 2 clips." },
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
    <div className="relative min-h-screen w-full overflow-hidden">
      <Clouds />

      {/* page content above clouds */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Header */}
        <header className="px-8 pt-6 pb-4 flex items-end justify-between">
          <div>
            <h1 className="font-display text-5xl font-medium tracking-tight text-ink leading-none">
              Motif
            </h1>
            <p className="font-display italic text-lg text-ink-soft mt-1">
              a visual identity from your music
            </p>
          </div>

          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.15em] text-ink-soft">
            <span className="hidden sm:inline opacity-70">Powered by</span>
            <Chip>HeyGen</Chip>
            <Chip>Hyperframes</Chip>
            <Chip>OpenAI</Chip>
          </div>
        </header>

        {/* 3-pane workspace */}
        <main className="flex-1 px-8 pb-8 grid grid-cols-12 gap-6 min-h-0">
          {/* LEFT — track input */}
          <section className="col-span-3 paper grain relative p-6 flex flex-col gap-4 min-h-0 overflow-hidden">
            <SectionLabel>Track</SectionLabel>

            {!file ? (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                className="flex-1 rounded-xl border-2 border-dashed border-paper-line hover:border-accent cursor-pointer flex flex-col items-center justify-center gap-3 p-6 text-center transition bg-paper-2/50"
              >
                <div className="font-display text-5xl text-ink-soft">♪</div>
                <div className="font-display text-xl italic text-ink">Drop your MP3</div>
                <div className="text-xs text-ink-mute">or click to browse</div>
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
                <div className="paper-flat bg-paper-2 p-4">
                  <SectionLabel className="mb-1">Loaded</SectionLabel>
                  <div className="font-display text-lg italic truncate">{file.name}</div>
                  <div className="text-xs text-ink-mute">{(file.size / 1024 / 1024).toFixed(1)} MB</div>
                  <audio src={URL.createObjectURL(file)} controls className="w-full mt-3" />
                </div>

                <details className="paper-flat bg-paper-2 p-4">
                  <summary className="text-[11px] uppercase tracking-[0.15em] text-ink-soft cursor-pointer">
                    Lyrics (optional)
                  </summary>
                  <textarea
                    className="w-full mt-3 bg-transparent text-sm outline-none resize-none min-h-32 text-ink"
                    placeholder="Paste lyrics for sharper sync. Otherwise we transcribe with Whisper."
                  />
                </details>

                <button
                  onClick={start}
                  disabled={running}
                  className="rounded-xl py-3 font-display text-lg italic font-semibold bg-accent text-white hover:bg-accent-soft disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
                >
                  {running ? "Directing…" : "Generate Motif"}
                </button>

                <button
                  onClick={() => {
                    setFile(null);
                    setTranscript([]);
                    setOutputs(initialOutputs);
                  }}
                  className="text-xs text-ink-mute hover:text-ink self-start"
                >
                  ↺ Start over
                </button>
              </div>
            )}
          </section>

          {/* CENTER — agent transcript */}
          <section className="col-span-5 paper grain relative flex flex-col min-h-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-paper-line flex items-center gap-3">
              <SectionLabel>Music Director</SectionLabel>
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  running ? "bg-accent animate-pulse" : "bg-ink-mute"
                }`}
              />
              <span className="ml-auto font-display italic text-sm text-ink-mute">
                live reasoning
              </span>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 font-mono text-sm space-y-2.5 bg-[radial-gradient(circle_at_top,_var(--paper-2),_transparent_70%)]">
              {transcript.length === 0 ? (
                <div className="text-ink-mute text-center pt-24 font-display italic text-xl leading-relaxed">
                  Drop a track. Hit Generate.<br />
                  <span className="text-base not-italic font-sans tracking-wide text-ink-mute opacity-70">
                    the agent will think out loud here.
                  </span>
                </div>
              ) : (
                transcript.map((line, i) => (
                  <div key={i} className="flex gap-3 leading-relaxed text-ink">
                    <span className="text-ink-mute shrink-0 w-12">[{line.ts}]</span>
                    {line.tag && (
                      <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-accent bg-paper-2 border border-paper-line rounded px-1.5 py-0.5 h-fit mt-0.5">
                        {line.tag}
                      </span>
                    )}
                    <span>{line.text}</span>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* RIGHT — outputs */}
          <section className="col-span-4 paper grain relative flex flex-col min-h-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-paper-line flex items-center gap-3">
              <SectionLabel>Release Kit</SectionLabel>
            </div>

            <div className="px-6 pt-4 flex gap-1.5 flex-wrap">
              {outputs.map((o) => (
                <button
                  key={o.key}
                  onClick={() => setActiveOutput(o.key)}
                  className={`text-xs px-2.5 py-1 rounded-md border transition ${
                    activeOutput === o.key
                      ? "border-accent text-ink bg-paper-2"
                      : "border-paper-line text-ink-mute hover:text-ink"
                  }`}
                >
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle ${
                      o.status === "ready"
                        ? "bg-accent"
                        : o.status === "generating"
                        ? "bg-accent-soft animate-pulse"
                        : o.status === "skipped"
                        ? "bg-ink-mute opacity-50"
                        : "bg-ink-mute"
                    }`}
                  />
                  {o.label}
                </button>
              ))}
            </div>

            <div className="flex-1 p-6 overflow-auto">
              {outputs
                .filter((o) => o.key === activeOutput)
                .map((o) => (
                  <div key={o.key} className="flex flex-col gap-3">
                    <div
                      className={`${o.aspect} w-full rounded-xl bg-paper-2 border border-paper-line flex items-center justify-center mx-auto shadow-inner`}
                      style={{
                        maxWidth: o.aspect === "aspect-square" ? "420px" : "280px",
                        maxHeight: "calc(100vh - 260px)",
                      }}
                    >
                      {o.status === "ready" ? (
                        <div className="text-ink-soft text-sm font-display italic">
                          Preview ready
                        </div>
                      ) : o.status === "generating" ? (
                        <div className="text-ink-mute text-sm animate-pulse">
                          Generating…
                        </div>
                      ) : (
                        <div className="text-ink-mute text-sm font-display italic">
                          {o.label}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-ink-mute text-center font-display italic">
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
        </main>
      </div>
    </div>
  );
}

function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`text-[11px] uppercase tracking-[0.18em] text-ink-soft font-medium ${className}`}
    >
      {children}
    </span>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-1 rounded-md bg-paper border border-paper-line text-ink-soft">
      {children}
    </span>
  );
}

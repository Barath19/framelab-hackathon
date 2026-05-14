"use client";

import { useCallback, useRef, useState } from "react";
import { Clouds } from "./clouds";
import { Button } from "@/components/ui/8bit/button";
import { Card } from "@/components/ui/8bit/card";
import { Badge } from "@/components/ui/8bit/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/8bit/tabs";
import { Textarea } from "@/components/ui/8bit/textarea";

type OutputKey = "canvas" | "cover" | "lyric" | "reel" | "tiktok";
type OutputStatus = "queued" | "generating" | "ready" | "skipped";

type OutputState = {
  key: OutputKey;
  label: string;
  shortLabel: string;
  aspect: string;
  spec: string;
  status: OutputStatus;
  mediaUrl?: string;
};

type TranscriptLine = { ts: string; tag?: string; text: string };

const initialOutputs: OutputState[] = [
  { key: "canvas", label: "Spotify Canvas", shortLabel: "Canvas", aspect: "aspect-[9/16]", spec: "1080×1920 · 8s loop", status: "queued" },
  { key: "cover", label: "Album Cover", shortLabel: "Cover", aspect: "aspect-square", spec: "3000×3000 · still", status: "queued" },
  { key: "lyric", label: "Lyric Video", shortLabel: "Lyric", aspect: "aspect-[9/16]", spec: "1080×1920 · full song", status: "queued" },
  { key: "reel", label: "Instagram Reel", shortLabel: "Reel", aspect: "aspect-[9/16]", spec: "1080×1920 · 15s", status: "queued" },
  { key: "tiktok", label: "TikTok", shortLabel: "TikTok", aspect: "aspect-[9/16]", spec: "1080×1920 · 9s", status: "queued" },
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

    // Stubbed — Task #14 will swap to /api/produce SSE.
    const fakeLines: TranscriptLine[] = [
      { ts: "00:02", tag: "ANALYZE", text: "BPM 117 — steady danceable. Key F# minor — unease. Energy 0.68." },
      { ts: "00:08", tag: "MOOD", text: "Defiant. Slick. Paranoid-pop. Noir." },
      { ts: "00:11", tag: "MOTIF", text: "Palette: cobalt > midnight > magenta > cream. Element: a glowing tile that pulses on the off-beat." },
      { ts: "00:15", tag: "PLAN", text: "Producing all 5 formats. 117 BPM is TikTok's sweet spot." },
      { ts: "00:18", tag: "AVATAR", text: "Sign-off at end of lyric video; intro on Reel; drop face on TikTok." },
      { ts: "00:22", tag: "VISUALS", text: "Generating 4 motif candidates..." },
      { ts: "00:31", tag: "CRITIC", text: "Candidate #3 wins - echo tile reads as paranoia." },
      { ts: "00:34", tag: "HEYGEN", text: "3 avatar clips queued." },
      { ts: "00:38", tag: "COMPOSE", text: "Hyperframes composing 5 outputs in parallel..." },
      { ts: "01:14", tag: "REVIEW", text: "Loop closure OK. Sync drift on word 'lover' - re-rendering 2 clips." },
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

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* HEADER — pixel logo */}
        <header className="px-8 pt-8 pb-6 flex items-end justify-between gap-6 flex-wrap">
          <div>
            <h1 className="font-pixel text-3xl md:text-4xl text-foreground leading-none drop-shadow-[3px_3px_0_rgba(255,255,255,0.6)]">
              MOTIF
            </h1>
            <p className="mt-3 text-xl text-foreground/85">
              a visual identity from your music
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-pixel text-[10px] uppercase opacity-70 mr-2">
              Powered by
            </span>
            <Badge>HeyGen</Badge>
            <Badge>Hyperframes</Badge>
            <Badge>OpenAI</Badge>
          </div>
        </header>

        {/* WORKSPACE */}
        <main className="flex-1 px-8 pb-12 grid grid-cols-12 gap-8 min-h-0">
          {/* LEFT — Track */}
          <Card className="col-span-3 flex flex-col gap-4 p-5 min-h-0 overflow-hidden">
            <div className="font-pixel text-[10px] uppercase opacity-80">Track</div>

            {!file ? (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                className="flex-1 border-4 border-dashed border-foreground/70 cursor-pointer flex flex-col items-center justify-center gap-3 p-6 text-center hover:bg-secondary/60 transition-colors"
              >
                <div className="font-pixel text-5xl">♪</div>
                <div className="font-pixel text-xs">DROP MP3</div>
                <div className="text-base opacity-70">or click to browse</div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="border-4 border-foreground bg-secondary/70 p-3">
                  <div className="font-pixel text-[9px] uppercase opacity-70 mb-1">Loaded</div>
                  <div className="text-base truncate">{file.name}</div>
                  <div className="text-sm opacity-60">{(file.size / 1024 / 1024).toFixed(1)} MB</div>
                  <audio src={URL.createObjectURL(file)} controls className="w-full mt-3" />
                </div>

                <details className="border-4 border-foreground bg-secondary/70 p-3">
                  <summary className="font-pixel text-[9px] uppercase opacity-80 cursor-pointer">
                    Lyrics (optional)
                  </summary>
                  <Textarea
                    className="w-full mt-3 min-h-28 text-base"
                    placeholder="Paste lyrics for sharper sync. Otherwise we transcribe with Whisper."
                  />
                </details>

                <Button
                  onClick={start}
                  disabled={running}
                  className="w-full text-xs"
                >
                  {running ? "Directing…" : "Generate Motif"}
                </Button>

                <button
                  onClick={() => {
                    setFile(null);
                    setTranscript([]);
                    setOutputs(initialOutputs);
                  }}
                  className="text-sm opacity-60 hover:opacity-100 self-start underline"
                >
                  ↺ Start over
                </button>
              </div>
            )}
          </Card>

          {/* CENTER — Agent transcript */}
          <Card className="col-span-5 flex flex-col min-h-0 overflow-hidden p-0">
            <div className="px-5 py-3 border-b-4 border-foreground bg-secondary flex items-center gap-3">
              <span className="font-pixel text-[10px] uppercase">Music Director</span>
              <span className={`dot ${running ? "busy" : ""}`} />
              <span className="ml-auto text-sm opacity-70">live reasoning</span>
            </div>

            <div className="flex-1 overflow-y-auto p-5 text-base leading-relaxed space-y-2">
              {transcript.length === 0 ? (
                <div className="text-center pt-20 opacity-70">
                  <div className="font-pixel text-xs mb-3">DROP A TRACK</div>
                  <div className="text-lg">
                    the agent will think out loud here.
                  </div>
                </div>
              ) : (
                transcript.map((line, i) => (
                  <div key={i} className="flex gap-3 leading-relaxed">
                    <span className="opacity-50 shrink-0 w-12 text-sm tabular-nums">[{line.ts}]</span>
                    {line.tag && (
                      <span className="font-pixel text-[8px] uppercase tracking-wider text-primary bg-secondary border-2 border-foreground px-1.5 py-0.5 h-fit mt-1 shrink-0">
                        {line.tag}
                      </span>
                    )}
                    <span className="flex-1">{line.text}</span>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* RIGHT — Release Kit */}
          <Card className="col-span-4 flex flex-col min-h-0 overflow-hidden p-0">
            <div className="px-5 py-3 border-b-4 border-foreground bg-secondary flex items-center gap-3">
              <span className="font-pixel text-[10px] uppercase">Release Kit</span>
              <span className="ml-auto text-sm opacity-70">5 outputs</span>
            </div>

            <Tabs
              value={activeOutput}
              onValueChange={(v) => setActiveOutput(v as OutputKey)}
              className="flex-1 flex flex-col min-h-0"
            >
              <TabsList className="px-5 pt-4 flex flex-wrap gap-1.5 justify-start bg-transparent">
                {outputs.map((o) => (
                  <TabsTrigger
                    key={o.key}
                    value={o.key}
                    className="font-pixel text-[8px] uppercase tracking-wider"
                  >
                    <span
                      className={`dot mr-1.5 ${
                        o.status === "ready"
                          ? "ok"
                          : o.status === "generating"
                          ? "busy"
                          : ""
                      }`}
                    />
                    {o.shortLabel}
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="flex-1 p-5 overflow-auto">
                {outputs.map((o) => (
                  <TabsContent key={o.key} value={o.key} className="mt-0">
                    <div className="flex flex-col gap-3">
                      <div
                        className={`${o.aspect} w-full bg-secondary border-4 border-foreground flex items-center justify-center mx-auto`}
                        style={{
                          maxWidth: o.aspect === "aspect-square" ? "420px" : "260px",
                          maxHeight: "calc(100vh - 320px)",
                        }}
                      >
                        {o.status === "ready" ? (
                          <div className="font-pixel text-[9px] uppercase text-primary">
                            Preview Ready
                          </div>
                        ) : o.status === "generating" ? (
                          <div className="font-pixel text-[9px] uppercase animate-pulse">
                            Generating…
                          </div>
                        ) : (
                          <div className="font-pixel text-[9px] uppercase opacity-50">
                            {o.shortLabel}
                          </div>
                        )}
                      </div>
                      <div className="font-pixel text-[8px] uppercase text-center opacity-70">
                        {o.spec}
                      </div>
                    </div>
                  </TabsContent>
                ))}
              </div>
            </Tabs>
          </Card>
        </main>
      </div>
    </div>
  );
}

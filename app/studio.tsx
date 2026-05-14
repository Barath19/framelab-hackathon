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
  mediaType?: "image" | "video";
};

type TranscriptLine = { ts: string; tag?: string; text: string };

const initialOutputs: OutputState[] = [
  { key: "canvas", label: "Spotify Canvas", shortLabel: "Canvas", aspect: "aspect-[9/16]", spec: "1080×1920 · 8s loop", status: "queued" },
  { key: "cover", label: "Album Cover", shortLabel: "Cover", aspect: "aspect-square", spec: "3000×3000 · still", status: "queued" },
  { key: "lyric", label: "Lyric Video", shortLabel: "Lyric", aspect: "aspect-[9/16]", spec: "1080×1920 · full song", status: "queued" },
  { key: "reel", label: "Instagram Reel", shortLabel: "Reel", aspect: "aspect-[9/16]", spec: "1080×1920 · 15s", status: "queued" },
  { key: "tiktok", label: "TikTok", shortLabel: "TikTok", aspect: "aspect-[9/16]", spec: "1080×1920 · 9s", status: "queued" },
];

type ProduceEvent =
  | { type: "log"; ts: string; tag: string; text: string }
  | { type: "brief"; brief: { produce?: OutputKey[] } }
  | { type: "candidate"; index: number; dataUrl: string }
  | { type: "winner"; index: number; reason: string; dataUrl: string }
  | { type: "output"; key: OutputKey; mediaUrl: string; mediaType: "image" | "video" }
  | { type: "done" }
  | { type: "error"; message: string };

export default function Studio() {
  const [file, setFile] = useState<File | null>(null);
  const [lyrics, setLyrics] = useState("");
  const [running, setRunning] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [outputs, setOutputs] = useState<OutputState[]>(initialOutputs);
  const [activeOutput, setActiveOutput] = useState<OutputKey>("canvas");
  const [candidates, setCandidates] = useState<(string | undefined)[]>([]);
  const [winnerIdx, setWinnerIdx] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const transcriptEnd = useRef<HTMLDivElement>(null);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith("audio")) setFile(f);
  }, []);

  const handleEvent = useCallback((e: ProduceEvent) => {
    if (e.type === "log") {
      setTranscript((prev) => [...prev, { ts: e.ts, tag: e.tag, text: e.text }]);
      requestAnimationFrame(() =>
        transcriptEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }),
      );
    } else if (e.type === "brief") {
      const chosen = new Set(e.brief.produce ?? []);
      setOutputs((prev) =>
        prev.map((o) => ({
          ...o,
          status: chosen.size === 0 || chosen.has(o.key) ? "generating" : "skipped",
        })),
      );
    } else if (e.type === "candidate") {
      setCandidates((prev) => {
        const next = [...prev];
        next[e.index] = e.dataUrl;
        return next;
      });
    } else if (e.type === "winner") {
      setWinnerIdx(e.index);
    } else if (e.type === "output") {
      setOutputs((prev) =>
        prev.map((o) =>
          o.key === e.key
            ? { ...o, status: "ready", mediaUrl: e.mediaUrl, mediaType: e.mediaType }
            : o,
        ),
      );
      setActiveOutput(e.key);
    } else if (e.type === "done") {
      // Brief is finalized — composers (Task #16–#18) will mark items "ready"
      // individually as their media arrives. For now they stay "generating".
      setRunning(false);
    } else if (e.type === "error") {
      setTranscript((prev) => [
        ...prev,
        { ts: "--:--", tag: "ERROR", text: e.message },
      ]);
      setRunning(false);
    }
  }, []);

  const start = async () => {
    if (!file || running) return;
    setRunning(true);
    setTranscript([]);
    setCandidates([]);
    setWinnerIdx(null);
    setOutputs(initialOutputs.map((o) => ({ ...o, status: "generating" })));

    const form = new FormData();
    form.append("file", file);
    if (lyrics.trim()) form.append("lyrics", lyrics.trim());

    let res: Response;
    try {
      res = await fetch("/api/produce", { method: "POST", body: form });
    } catch (err) {
      handleEvent({ type: "error", message: `Network error: ${(err as Error).message}` });
      return;
    }
    if (!res.ok || !res.body) {
      handleEvent({ type: "error", message: `Server ${res.status}` });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Parse SSE: each event ends with "\n\n", lines start with "data: "
      let nl;
      while ((nl = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 2);
        const dataLines = chunk
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim());
        if (!dataLines.length) continue;
        try {
          const evt = JSON.parse(dataLines.join("\n")) as ProduceEvent;
          handleEvent(evt);
        } catch {
          // ignore malformed chunk
        }
      }
    }
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
                    value={lyrics}
                    onChange={(e) => setLyrics(e.target.value)}
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
                    setLyrics("");
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
              <div ref={transcriptEnd} />
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
                        className={`${o.aspect} w-full bg-secondary border-4 border-foreground flex items-center justify-center mx-auto overflow-hidden`}
                        style={{
                          maxWidth: o.aspect === "aspect-square" ? "420px" : "260px",
                          maxHeight: "calc(100vh - 320px)",
                        }}
                      >
                        {o.status === "ready" && o.mediaUrl ? (
                          o.mediaType === "video" ? (
                            // eslint-disable-next-line jsx-a11y/media-has-caption
                            <video
                              src={o.mediaUrl}
                              autoPlay
                              loop
                              muted
                              playsInline
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={o.mediaUrl}
                              alt={o.label}
                              className="w-full h-full object-cover"
                            />
                          )
                        ) : o.status === "generating" ? (
                          <div className="font-pixel text-[9px] uppercase animate-pulse">
                            Generating…
                          </div>
                        ) : o.status === "skipped" ? (
                          <div className="font-pixel text-[9px] uppercase opacity-50">
                            Skipped
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

                      {/* Motif candidate strip — visible during/after visual gen */}
                      {o.key === "cover" && candidates.length > 0 && (
                        <div className="mt-2">
                          <div className="font-pixel text-[8px] uppercase opacity-70 mb-2">
                            Motif Candidates
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {[0, 1, 2].map((i) => (
                              <div
                                key={i}
                                className={`aspect-square border-4 ${
                                  winnerIdx === i
                                    ? "border-primary"
                                    : "border-foreground/40"
                                } overflow-hidden bg-secondary flex items-center justify-center`}
                              >
                                {candidates[i] ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={candidates[i]}
                                    alt={`Candidate ${i + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="font-pixel text-[7px] opacity-50 animate-pulse">
                                    …
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
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

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clouds } from "./clouds";
import { Button } from "@/components/ui/8bit/button";
import { Card } from "@/components/ui/8bit/card";
import { Badge } from "@/components/ui/8bit/badge";

type TranscriptLine = { ts: string; tag?: string; text: string };

type BriefEvent =
  | { type: "log"; ts: string; tag: string; text: string }
  | { type: "paper"; paper: { title: string; authors: string[]; id: string } }
  | { type: "brief"; brief: { hook: string; script: string; beats: unknown[] } }
  | { type: "narrator"; videoUrl: string; durationSeconds: number }
  | { type: "composition"; id: string; previewUrl: string }
  | { type: "done" }
  | { type: "error"; message: string };

const EXAMPLES = [
  { label: "Attention Is All You Need (2017)", url: "https://arxiv.org/abs/1706.03762" },
  { label: "GPT-3 — Language Models Few-Shot (2020)", url: "https://arxiv.org/abs/2005.14165" },
  { label: "DPO — Direct Preference Optimization (2023)", url: "https://arxiv.org/abs/2305.18290" },
];

export default function Studio() {
  const [url, setUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [narratorUrl, setNarratorUrl] = useState<string | null>(null);
  const transcriptEnd = useRef<HTMLDivElement>(null);

  const handleEvent = useCallback((e: BriefEvent) => {
    if (e.type === "log") {
      setTranscript((prev) => [...prev, { ts: e.ts, tag: e.tag, text: e.text }]);
    } else if (e.type === "narrator") {
      setNarratorUrl(e.videoUrl);
    } else if (e.type === "composition") {
      setPreviewUrl(e.previewUrl);
    } else if (e.type === "done") {
      setRunning(false);
    } else if (e.type === "error") {
      setTranscript((prev) => [
        ...prev,
        { ts: "--:--", tag: "ERROR", text: e.message },
      ]);
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [transcript]);

  const submit = async () => {
    if (!url.trim() || running) return;
    setRunning(true);
    setTranscript([]);
    setPreviewUrl(null);
    setNarratorUrl(null);

    let res: Response;
    try {
      res = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
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
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) !== -1) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const data = chunk
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim())
          .join("\n");
        if (!data) continue;
        try {
          handleEvent(JSON.parse(data) as BriefEvent);
        } catch {
          /* ignore */
        }
      }
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <Clouds />

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* HEADER */}
        <header className="px-8 pt-8 pb-4 flex items-end justify-between gap-6 flex-wrap">
          <div>
            <h1 className="font-pixel text-3xl md:text-4xl text-foreground leading-none drop-shadow-[3px_3px_0_rgba(255,255,255,0.6)]">
              BRIEF
            </h1>
            <p className="mt-3 text-xl text-foreground/85">
              read everything. watch one thing.
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

        {/* URL INPUT */}
        <div className="px-8 pb-4">
          <Card className="p-5">
            <div className="font-pixel text-[10px] uppercase mb-3 opacity-80">
              arXiv URL
            </div>
            <div className="flex gap-3">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://arxiv.org/abs/1706.03762"
                className="flex-1 bg-secondary/70 border-4 border-foreground px-4 py-3 text-lg font-mono outline-none"
                onKeyDown={(e) => e.key === "Enter" && submit()}
                disabled={running}
              />
              <Button
                onClick={submit}
                disabled={running || !url.trim()}
                className="text-xs px-6"
              >
                {running ? "Briefing…" : "Generate"}
              </Button>
            </div>
            <div className="mt-3 flex gap-2 flex-wrap">
              <span className="text-xs opacity-60 self-center mr-1">try:</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.url}
                  onClick={() => setUrl(ex.url)}
                  className="text-xs px-2 py-1 border-2 border-foreground bg-secondary hover:bg-primary hover:text-white transition-colors disabled:opacity-50"
                  disabled={running}
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* WORKSPACE */}
        <main className="flex-1 px-8 pb-8 grid grid-cols-12 gap-6 min-h-0">
          {/* LEFT — Agent transcript */}
          <Card className="col-span-5 flex flex-col min-h-0 overflow-hidden p-0">
            <div className="px-5 py-3 border-b-4 border-foreground bg-secondary flex items-center gap-3">
              <span className="font-pixel text-[10px] uppercase">Agent</span>
              <span className={`dot ${running ? "busy" : ""}`} />
              <span className="ml-auto text-sm opacity-70">live reasoning</span>
            </div>
            <div className="flex-1 overflow-y-auto p-5 text-base leading-relaxed space-y-2 min-h-0">
              {transcript.length === 0 ? (
                <div className="text-center pt-20 opacity-70">
                  <div className="font-pixel text-xs mb-3">PASTE AN ARXIV URL</div>
                  <div className="text-lg">
                    the agent will read it for you.
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

          {/* RIGHT — Preview */}
          <Card className="col-span-7 flex flex-col min-h-0 overflow-hidden p-0">
            <div className="px-5 py-3 border-b-4 border-foreground bg-secondary flex items-center gap-3">
              <span className="font-pixel text-[10px] uppercase">Preview</span>
              <span className="ml-auto text-sm opacity-70">
                {previewUrl ? "composition" : narratorUrl ? "narrator only" : ""}
              </span>
            </div>
            <div className="flex-1 bg-foreground/5 flex items-center justify-center p-5 min-h-0">
              {previewUrl ? (
                <iframe
                  src={previewUrl}
                  className="w-full h-full bg-black"
                  style={{ aspectRatio: "16/9" }}
                  title="brief composition"
                />
              ) : narratorUrl ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video
                  src={narratorUrl}
                  controls
                  autoPlay
                  className="max-w-full max-h-full bg-black"
                />
              ) : (
                <div className="text-center opacity-60">
                  <div className="font-pixel text-xs mb-3">NO PREVIEW YET</div>
                  <div className="text-lg">
                    paper → script → narrator → composition.
                  </div>
                </div>
              )}
            </div>
          </Card>
        </main>
      </div>
    </div>
  );
}

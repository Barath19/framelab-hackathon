"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clouds } from "./clouds";
import { Button } from "@/components/ui/8bit/button";
import { Badge } from "@/components/ui/8bit/badge";

type Stage =
  | "idle"
  | "fetching"
  | "reading"
  | "heygen"
  | "composing"
  | "rendering"
  | "done"
  | "error";

const STAGE_LABEL: Record<Stage, string> = {
  idle: "",
  fetching: "Fetching source…",
  reading: "Agent writing the brief…",
  heygen: "Avatar narrating…",
  composing: "Hyperframes composing…",
  rendering: "Rendering MP4…",
  done: "Done.",
  error: "Something went wrong.",
};

type BriefEvent =
  | { type: "log"; ts: string; tag: string; text: string }
  | { type: "progress"; percent: number; stage: string }
  | { type: "paper"; paper: unknown }
  | { type: "brief"; brief: unknown }
  | { type: "narrator"; videoUrl: string; durationSeconds: number }
  | { type: "composition"; id: string; previewUrl: string }
  | { type: "composed"; id: string; downloadUrl: string }
  | { type: "done" }
  | { type: "error"; message: string };

const PLACEHOLDER =
  "Paste a URL or ask for a metric — arXiv, GitHub, an article, or 'PostHog north-star'";

export default function Studio() {
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [percent, setPercent] = useState(0);
  const [stageLabel, setStageLabel] = useState("");
  const [latestLog, setLatestLog] = useState<{ tag: string; text: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleEvent = useCallback((e: BriefEvent) => {
    if (e.type === "progress") {
      setPercent(e.percent);
      setStageLabel(e.stage);
      return;
    }
    if (e.type === "log") {
      setLatestLog({ tag: e.tag, text: e.text });
      if (e.tag === "FETCH" || e.tag === "PAPER" || e.tag === "FIGURES" || e.tag === "ARTICLE" || e.tag === "REPO" || e.tag === "TREE") setStage("fetching");
      else if (e.tag === "READING" || e.tag === "BRIEF" || e.tag === "CLAMP" || e.tag === "ANIMATE") setStage("reading");
      else if (e.tag === "HEYGEN" || e.tag === "LOCAL") setStage("heygen");
      else if (e.tag === "COMPOSE" || e.tag === "LINT") setStage("composing");
      else if (e.tag === "RENDER") setStage("rendering");
      return;
    }
    if (e.type === "composition") setPreviewUrl(e.previewUrl);
    if (e.type === "composed") {
      setDownloadUrl(e.downloadUrl);
      setStage("done");
      // Trigger browser download
      const a = document.createElement("a");
      a.href = e.downloadUrl;
      a.download = `brief-${e.id}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    if (e.type === "done") setRunning(false);
    if (e.type === "error") {
      setErrorMsg(e.message);
      setStage("error");
      setRunning(false);
    }
  }, []);

  const submit = async () => {
    const text = input.trim();
    if (!text || running) return;
    setRunning(true);
    setStage("fetching");
    setPercent(0);
    setStageLabel("starting…");
    setLatestLog(null);
    setPreviewUrl(null);
    setDownloadUrl(null);
    setErrorMsg(null);

    let res: Response;
    try {
      res = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: text }),
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
        {/* Header */}
        <header className="px-8 pt-8 pb-3 flex items-end justify-between gap-6 flex-wrap">
          <div>
            <h1 className="font-pixel text-3xl md:text-4xl text-foreground leading-none drop-shadow-[3px_3px_0_rgba(255,255,255,0.6)]">
              BRIEF
            </h1>
            <p className="mt-2 text-lg text-foreground/80">
              one prompt → one video
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/channel" className="text-base opacity-80 hover:opacity-100 underline mr-3">
              channel →
            </a>
            <Badge>HeyGen</Badge>
            <Badge>Hyperframes</Badge>
            <Badge>PostHog</Badge>
          </div>
        </header>

        {/* Hero — chat bar + button */}
        <main className="flex-1 flex flex-col items-center justify-center px-6 pb-12">
          <div className="w-full max-w-3xl space-y-4">
            <div className="bg-card border-4 border-foreground shadow-[6px_6px_0_0_var(--foreground)]">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={PLACEHOLDER}
                rows={3}
                disabled={running}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                }}
                className="w-full bg-transparent text-foreground placeholder:opacity-50 px-5 py-4 text-lg outline-none resize-none"
              />
              <div className="flex items-center justify-between px-3 py-2 border-t-4 border-foreground bg-secondary/70">
                <span className="font-pixel text-[9px] uppercase opacity-70 ml-2">
                  ⌘ + ↵ to send
                </span>
                <Button
                  onClick={submit}
                  disabled={running || !input.trim()}
                  className="text-xs px-6"
                >
                  {running ? "Generating…" : "Generate"}
                </Button>
              </div>
            </div>

            {/* Status strip */}
            {running && (
              <div className="bg-card border-4 border-foreground p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="font-pixel text-2xl tabular-nums text-primary">
                    {percent}%
                  </span>
                  <span className="font-pixel text-[10px] uppercase opacity-80">
                    {stageLabel || STAGE_LABEL[stage]}
                  </span>
                  <span className="ml-auto spinner" style={{ transform: "scale(0.5)" }}>
                    <i /><i /><i /><i />
                  </span>
                </div>
                <div className="h-3 border-2 border-foreground bg-secondary relative overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0"
                    style={{
                      width: `${percent}%`,
                      background:
                        "repeating-linear-gradient(-45deg, var(--primary) 0, var(--primary) 8px, var(--accent) 8px, var(--accent) 16px)",
                      animation: "bar-march 0.8s linear infinite",
                      transition: "width 0.4s ease",
                    }}
                  />
                </div>
                {latestLog && (
                  <div className="flex gap-2 text-sm">
                    <span className="font-pixel text-[8px] uppercase text-primary bg-secondary border-2 border-foreground px-1.5 py-0.5 h-fit mt-0.5 shrink-0">
                      {latestLog.tag}
                    </span>
                    <span className="opacity-90 leading-snug">{latestLog.text}</span>
                  </div>
                )}
              </div>
            )}

            {/* Error */}
            {errorMsg && (
              <div className="bg-card border-4 border-primary p-4 text-base">
                <div className="font-pixel text-[10px] uppercase text-primary mb-1">Error</div>
                {errorMsg}
              </div>
            )}

            {/* Result */}
            {previewUrl && (
              <div className="bg-card border-4 border-foreground p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-pixel text-[10px] uppercase">Composition</span>
                  {downloadUrl && (
                    <a
                      href={downloadUrl}
                      download
                      className="font-pixel text-[9px] uppercase px-3 py-1.5 border-2 border-foreground bg-primary text-white hover:bg-accent-soft"
                    >
                      ↓ Download MP4
                    </a>
                  )}
                </div>
                <iframe
                  src={previewUrl}
                  className="w-full bg-black border-2 border-foreground"
                  style={{ aspectRatio: "16/9" }}
                  title="composition"
                  allow="autoplay; encrypted-media"
                />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

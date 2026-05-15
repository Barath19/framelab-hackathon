"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Clouds } from "../clouds";
import { Button } from "@/components/ui/8bit/button";
import { Card } from "@/components/ui/8bit/card";
import { Badge } from "@/components/ui/8bit/badge";

type Episode = {
  id: string;
  title: string;
  hook: string;
  authors: string[];
  arxivId: string;
  durationSeconds: number;
  thumbnailUrl?: string;
  narratorUrl?: string;
  createdAt: number;
};

type LogLine = { ts: string; tag: string; text: string };

export default function ChannelPage() {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [autopilotUrls, setAutopilotUrls] = useState("");
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [activeEp, setActiveEp] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/compositions");
    const j = await r.json();
    setEpisodes(j.items ?? []);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const runAutopilot = async () => {
    const urls = autopilotUrls
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!urls.length || running) return;
    setRunning(true);
    setLog([]);

    const res = await fetch("/api/autopilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    });
    if (!res.ok || !res.body) {
      setRunning(false);
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
          const evt = JSON.parse(data);
          if (evt.type === "log") {
            setLog((p) => [...p, { ts: evt.ts, tag: evt.tag, text: evt.text }]);
          } else if (evt.type === "episode_done") {
            refresh();
          }
        } catch {
          /* ignore */
        }
      }
    }
    setRunning(false);
    refresh();
  };

  const totalSeconds = episodes.reduce((a, e) => a + e.durationSeconds, 0);

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <Clouds />

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* HEADER */}
        <header className="px-8 pt-8 pb-4 flex items-center justify-between gap-6 flex-wrap">
          <Link href="/" className="flex items-center gap-4">
            <h1 className="font-pixel text-2xl md:text-3xl text-foreground drop-shadow-[3px_3px_0_rgba(255,255,255,0.6)]">
              BRIEF
            </h1>
            <span className="text-base opacity-70 underline">← back to single</span>
          </Link>
          <div className="flex items-center gap-2">
            <Badge>HeyGen</Badge>
            <Badge>Hyperframes</Badge>
            <Badge>OpenAI</Badge>
          </div>
        </header>

        {/* CHANNEL HERO */}
        <section className="px-8 pb-6">
          <Card className="p-6 flex items-center gap-6 flex-wrap">
            <div
              className="w-24 h-24 border-4 border-foreground"
              style={{
                background:
                  "linear-gradient(45deg, var(--primary) 0%, var(--primary) 50%, var(--accent) 50%, var(--accent) 100%)",
              }}
            />
            <div className="flex-1 min-w-[260px]">
              <div className="font-pixel text-2xl md:text-3xl mb-2">BRIEF</div>
              <div className="text-lg opacity-80 mb-1">
                read everything. watch one thing.
              </div>
              <div className="text-base opacity-70">
                {episodes.length} episode{episodes.length === 1 ? "" : "s"} ·{" "}
                {Math.round(totalSeconds)}s total · last updated{" "}
                {episodes[0]
                  ? new Date(episodes[0].createdAt).toLocaleString()
                  : "—"}
              </div>
            </div>
            <Button className="text-xs px-6">Subscribe</Button>
          </Card>
        </section>

        {/* AUTOPILOT */}
        <section className="px-8 pb-6">
          <Card className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <span className="font-pixel text-[10px] uppercase">Autopilot</span>
              {running && (
                <span className="spinner" style={{ transform: "scale(0.5)" }}>
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              )}
              <span className="ml-auto text-sm opacity-70">
                Paste arXiv URLs — one per line. We&apos;ll batch a season.
              </span>
            </div>
            <textarea
              value={autopilotUrls}
              onChange={(e) => setAutopilotUrls(e.target.value)}
              disabled={running}
              placeholder={
                "https://arxiv.org/abs/1706.03762\nhttps://arxiv.org/abs/2005.14165\nhttps://arxiv.org/abs/2305.18290"
              }
              className="w-full bg-secondary/70 border-4 border-foreground px-4 py-3 text-base font-mono outline-none resize-y min-h-28"
            />
            <div className="mt-3 flex justify-between items-center">
              <span className="text-sm opacity-70">
                {autopilotUrls
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean).length}{" "}
                URLs queued
              </span>
              <Button
                onClick={runAutopilot}
                disabled={running || !autopilotUrls.trim()}
                className="text-xs px-6"
              >
                {running ? "Recording…" : "Record season"}
              </Button>
            </div>

            {log.length > 0 && (
              <div className="mt-4 max-h-44 overflow-y-auto bg-foreground/5 border-2 border-foreground p-3 font-mono text-sm space-y-1">
                {log.slice(-40).map((l, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="opacity-50 w-12 shrink-0">[{l.ts}]</span>
                    <span className="font-pixel text-[8px] uppercase text-primary bg-secondary border border-foreground px-1 h-fit mt-0.5 shrink-0">
                      {l.tag}
                    </span>
                    <span>{l.text}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>

        {/* EPISODE GRID */}
        <section className="px-8 pb-12">
          <div className="font-pixel text-[10px] uppercase mb-3 drop-shadow-[2px_2px_0_rgba(255,255,255,0.6)]">
            Episodes ({episodes.length})
          </div>
          {episodes.length === 0 ? (
            <Card className="p-10 text-center">
              <div className="font-pixel text-xs mb-3 opacity-80">NO EPISODES YET</div>
              <div className="text-lg opacity-70">
                Run autopilot above or generate one from the{" "}
                <Link href="/" className="underline">
                  home page
                </Link>
                .
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {episodes.map((ep) => (
                <Card key={ep.id} className="overflow-hidden p-0">
                  <button
                    onClick={() => setActiveEp(ep.id)}
                    className="block w-full text-left"
                  >
                    <div className="aspect-video bg-foreground/80 relative overflow-hidden border-b-4 border-foreground">
                      {ep.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={ep.thumbnailUrl}
                          alt={ep.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-secondary font-pixel text-[10px] uppercase">
                          {ep.arxivId}
                        </div>
                      )}
                      <div className="absolute bottom-2 right-2 bg-foreground text-secondary font-pixel text-[8px] px-1.5 py-0.5">
                        {Math.round(ep.durationSeconds)}s
                      </div>
                    </div>
                    <div className="p-3 space-y-1.5">
                      <div className="font-pixel text-[8px] uppercase text-primary">
                        {ep.arxivId} · {new Date(ep.createdAt).toLocaleDateString()}
                      </div>
                      <div className="text-base leading-snug line-clamp-2">
                        {ep.title}
                      </div>
                      <div className="text-sm opacity-70 line-clamp-1">
                        {ep.authors.slice(0, 3).join(", ")}
                        {ep.authors.length > 3 ? " et al." : ""}
                      </div>
                    </div>
                  </button>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Player modal */}
      {activeEp && (
        <div
          className="fixed inset-0 z-50 bg-foreground/80 flex items-center justify-center p-6"
          onClick={() => setActiveEp(null)}
        >
          <div
            className="w-full max-w-5xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2 text-secondary font-pixel text-[10px] uppercase">
              <span>Now Playing</span>
              <button
                onClick={() => setActiveEp(null)}
                className="bg-secondary text-foreground px-3 py-1 border-2 border-secondary"
              >
                Close ✕
              </button>
            </div>
            <iframe
              src={`/api/compositions/${activeEp}`}
              className="w-full bg-black border-4 border-secondary"
              style={{ aspectRatio: "16/9" }}
              title="episode"
              allow="autoplay; encrypted-media"
            />
          </div>
        </div>
      )}
    </div>
  );
}

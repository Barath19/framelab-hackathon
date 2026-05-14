# Motif

**A visual identity from your music.**

Drop an MP3. Meet your AI Music Director. It listens to the track, decides
the visual identity, and produces a release kit that shares one motif:

- Spotify Canvas (8s vertical loop)
- Album cover
- Lyric video
- Instagram Reel
- TikTok teaser

Built for the **HeyGen Hackathon** on top of **HeyGen** (Photo Avatar) and
**Hyperframes** (composition + render).

---

## Stack

- **Next.js 16** + React 19 + Tailwind 4
- **OpenAI** — Music Director Agent reasoning, Whisper transcription, vision critique, motif image generation (Fal fallback)
- **HeyGen** — Photo Avatar clips that appear at agent-chosen moments
- **Hyperframes** — composes every output deterministically (loop-clean Canvas + word-level lyric sync)

## Setup

```bash
cp .env.example .env.local       # fill in keys
npm install
npm run dev
```

## Tracks

Submitting to both **Product** and **Agent** tracks. The Music Director Agent
makes real judgment calls — which formats this track deserves, where the
artist's avatar appears, which motif candidate wins — all visible in the
live transcript.

## Built at

HeyGen Hackathon, San Francisco, May 14–15.

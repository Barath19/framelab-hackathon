// Shared types for the Motif pipeline.

export type Word = {
  word: string;
  start: number;
  end: number;
};

export type Section = {
  start: number;
  end: number;
  type: "intro" | "verse" | "pre-chorus" | "chorus" | "bridge" | "outro" | "instrumental";
};

export type Transcript = {
  text: string;
  words: Word[];
  durationSeconds: number;
};

export type AudioFacts = {
  bpm?: number;
  key?: string;
  energy?: number; // 0..1
  durationSeconds: number;
};

export type MotifBrief = {
  // Mood
  mood: string; // one short phrase
  moodKeywords: string[];

  // Visual
  palette: { hex: string; name: string }[]; // 3–5 colors
  aesthetic: string; // e.g. "1980s noir pop, soft neon glow, 16mm grain"
  recurringElement: string; // e.g. "a single glowing tile that pulses on the off-beat"
  motionVerb: string; // e.g. "stalk", "drift", "pulse", "shatter"

  // Typography
  typeSystem: {
    family: string; // e.g. "Playfair Display"
    weight: number;
    italic: boolean;
    tracking: number; // in em
  };

  // Sections & style
  sections: Section[];
  lyricStyle: "kinetic" | "karaoke" | "cinematic";

  // Avatar plan
  avatar: {
    use: boolean;
    placements: ("lyric-end" | "reel-intro" | "tiktok-drop")[];
    persona: string; // short character note
  };

  // Format plan
  produce: ("canvas" | "cover" | "lyric" | "reel" | "tiktok")[];
};

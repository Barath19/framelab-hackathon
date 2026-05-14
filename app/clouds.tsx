/**
 * Chrome-dino-style desert scene (without the dino).
 *  - A horizontally-striped pixel sun, high in the sky
 *  - Small, sparse, light blue-grey clouds drifting
 *  - A scattered desert speck pattern across the sand half
 *
 * All decorative — sits behind the workspace.
 */

export function Clouds() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
      {/* Tiny clouds — minimalist, Chrome-dino style */}
      <MiniCloud className="absolute top-[14%] right-[18%] w-[140px] cloud-anim-slow" />
      <MiniCloud className="absolute top-[26%] right-[8%]  w-[110px] cloud-anim" />
      <MiniCloud className="absolute top-[6%]  left-[55%] w-[120px] cloud-anim-fast" />

      {/* Sand specks — scattered, deterministic so SSR matches */}
      <Specks />
    </div>
  );
}

/* ----- Striped pixel sun ----- */
function StripedSun({ className }: { className?: string }) {
  // 9-cell pixel circle; horizontal stripes alternate yellow + orange.
  const r = 4;
  const cx = 4;
  const cy = 4;
  const cells: { x: number; y: number; band: "y" | "o" | "edge" }[] = [];

  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r + 0.4) continue;
      const band: "y" | "o" | "edge" = d > r - 0.2 ? "edge" : y === 3 || y === 5 ? "o" : "y";
      cells.push({ x, y, band });
    }
  }

  return (
    <svg viewBox="0 0 9 9" shapeRendering="crispEdges" className={className}>
      {cells.map((c, i) => (
        <rect
          key={i}
          x={c.x}
          y={c.y}
          width="1"
          height="1"
          fill={c.band === "y" ? "#f0a93f" : c.band === "o" ? "#e35817" : "#c64a17"}
        />
      ))}
    </svg>
  );
}

/* ----- Tiny minimalist cloud (Chrome dino-style) ----- */
function MiniCloud({ className }: { className?: string }) {
  // 14×4 grid, very simple shape, light blue-grey.
  const body: [number, number][] = [
    [3, 0], [4, 0], [5, 0], [6, 0],
    [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1],
    [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2],
    [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3],
  ];
  return (
    <svg viewBox="0 0 14 4" shapeRendering="crispEdges" className={className}>
      {body.map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="1" height="1" fill="#bcd3df" />
      ))}
    </svg>
  );
}

/* ----- Sand specks scattered across the bottom 38% ----- */
function Specks() {
  // Deterministic pseudo-random so SSR === client render.
  const rng = mulberry32(20260514);
  const count = 140;
  const specks: { x: number; y: number; w: number; color: string }[] = [];
  for (let i = 0; i < count; i++) {
    specks.push({
      x: rng() * 100,                     // 0..100 vw
      y: 62 + rng() * 38,                 // 62..100 vh
      w: rng() < 0.85 ? 4 : 6,            // mostly 4px, some 6px
      color: rng() < 0.7 ? "#a87a3d" : "#8a5d28",
    });
  }
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      className="absolute inset-0 w-full h-full"
    >
      {specks.map((s, i) => (
        <rect
          key={i}
          x={s.x}
          y={s.y}
          width={s.w / 16}
          height={s.w / 16}
          fill={s.color}
        />
      ))}
    </svg>
  );
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

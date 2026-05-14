/**
 * Pixel-art clouds, drawn as a grid of squares (1 unit = 1 "pixel").
 * SVG shapeRendering="crispEdges" preserves the blocky look at any zoom.
 *
 * Each cloud is a mini sprite. We place a few across the screen at different
 * speeds, plus a chunky pixel sun in the top-right corner.
 */

export function Clouds() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
      {/* Sun */}
      <Sun className="absolute top-8 right-10 w-28" />

      {/* Clouds, scattered */}
      <CloudSprite className="absolute top-10  left-[6%]   w-[280px] cloud-anim-slow" />
      <CloudSprite className="absolute top-28  right-[22%] w-[220px] cloud-anim" />
      <CloudSprite className="absolute top-[44%] left-[-40px] w-[180px] cloud-anim-fast" />
      <CloudSprite className="absolute bottom-[18%] right-[8%]  w-[260px] cloud-anim-slow" />
      <CloudSprite className="absolute bottom-12  left-[28%]  w-[200px] cloud-anim" />

      {/* Pixel grass strip at the very bottom */}
      <Grass className="absolute bottom-0 left-0 right-0 w-full h-8" />
    </div>
  );
}

function CloudSprite({ className }: { className?: string }) {
  // A small 16-wide pixel cloud sprite, light face + bottom shadow.
  // r = body, s = shadow. Coordinates are grid cells (1 unit = one pixel).
  const body: [number, number][] = [
    // top row
    [4, 1], [5, 1], [6, 1],
    [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2],
    [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3],
    [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4], [12, 4],
    [0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5], [11, 5], [12, 5], [13, 5],
    [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6], [11, 6], [12, 6], [13, 6],
  ];
  const shadow: [number, number][] = [
    [0, 7], [1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7], [11, 7], [12, 7], [13, 7],
  ];
  const outline: [number, number][] = [
    // top
    [4, 0], [5, 0], [6, 0],
    [3, 1], [7, 1], [8, 1],
    [2, 2], [9, 2], [10, 2],
    [1, 3], [11, 3],
    [0, 4], [12, 4], [13, 4],
    // bottom
    [-1, 5], [14, 5],
    [-1, 6], [14, 6],
    [-1, 7], [14, 7],
    [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 8], [7, 8], [8, 8], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8],
  ];

  return (
    <svg
      viewBox="-1 -1 16 11"
      shapeRendering="crispEdges"
      className={className}
    >
      {outline.map(([x, y], i) => (
        <rect key={`o${i}`} x={x} y={y} width="1" height="1" fill="#2c1810" />
      ))}
      {body.map(([x, y], i) => (
        <rect key={`b${i}`} x={x} y={y} width="1" height="1" fill="#ffffff" />
      ))}
      {shadow.map(([x, y], i) => (
        <rect key={`s${i}`} x={x} y={y} width="1" height="1" fill="#cfe2ee" />
      ))}
    </svg>
  );
}

function Sun({ className }: { className?: string }) {
  // 9×9 pixel sun: yellow body, gold ring, dark outline. Mario style.
  const ring: [number, number][] = [];
  const body: [number, number][] = [];
  const outline: [number, number][] = [];
  // Build a chunky pixel circle.
  const r = 4;
  const cx = 4;
  const cy = 4;
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < r - 1.2) body.push([x, y]);
      else if (d < r) ring.push([x, y]);
      else if (d < r + 0.6) outline.push([x, y]);
    }
  }
  return (
    <svg viewBox="0 0 9 9" shapeRendering="crispEdges" className={className}>
      {outline.map(([x, y], i) => (
        <rect key={`o${i}`} x={x} y={y} width="1" height="1" fill="#2c1810" />
      ))}
      {ring.map(([x, y], i) => (
        <rect key={`r${i}`} x={x} y={y} width="1" height="1" fill="#f4a042" />
      ))}
      {body.map(([x, y], i) => (
        <rect key={`b${i}`} x={x} y={y} width="1" height="1" fill="#f4c542" />
      ))}
    </svg>
  );
}

function Grass({ className }: { className?: string }) {
  // A simple 2-band pixel grass strip running the page width.
  return (
    <svg
      viewBox="0 0 100 8"
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      className={className}
    >
      <rect x="0" y="0" width="100" height="2" fill="#4cae5c" />
      <rect x="0" y="2" width="100" height="2" fill="#2f8a3b" />
      <rect x="0" y="4" width="100" height="2" fill="#3e7b30" />
      <rect x="0" y="6" width="100" height="2" fill="#1f4d20" />
      {/* tufts every few units */}
      {Array.from({ length: 20 }).map((_, i) => (
        <rect key={i} x={i * 5 + 1} y={-1} width="1" height="1" fill="#2f8a3b" />
      ))}
    </svg>
  );
}

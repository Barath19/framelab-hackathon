// Magritte-style painted clouds — soft, rounded, very subtle bottom shading.
// Pure SVG, decorative only. Positioned absolutely behind the UI.

export function Clouds() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
      {/* top-left big cloud */}
      <svg
        viewBox="0 0 400 180"
        className="absolute -top-4 -left-20 w-[560px] opacity-95 cloud-anim-slow"
      >
        <Cloud />
      </svg>

      {/* top-right small cloud */}
      <svg
        viewBox="0 0 400 180"
        className="absolute top-16 right-[-80px] w-[420px] opacity-90 cloud-anim"
      >
        <Cloud />
      </svg>

      {/* mid-left tiny */}
      <svg
        viewBox="0 0 400 180"
        className="absolute top-[42%] left-[-60px] w-[300px] opacity-75 cloud-anim-fast"
      >
        <Cloud />
      </svg>

      {/* bottom drifting */}
      <svg
        viewBox="0 0 400 180"
        className="absolute bottom-8 right-[15%] w-[520px] opacity-85 cloud-anim-slow"
      >
        <Cloud />
      </svg>

      <svg
        viewBox="0 0 400 180"
        className="absolute bottom-[28%] left-[35%] w-[360px] opacity-70 cloud-anim"
      >
        <Cloud />
      </svg>
    </div>
  );
}

function Cloud() {
  return (
    <g>
      <defs>
        <radialGradient id="cloud-grad" cx="50%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="70%" stopColor="#fdfcfa" />
          <stop offset="100%" stopColor="#d8e3ec" />
        </radialGradient>
        <filter id="cloud-blur" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="0.6" />
        </filter>
      </defs>
      <path
        filter="url(#cloud-blur)"
        fill="url(#cloud-grad)"
        d="
          M 60 130
          C 30 130 18 105 38 88
          C 30 60 70 50 88 70
          C 95 40 150 36 162 70
          C 178 50 220 56 222 82
          C 246 68 286 84 282 110
          C 312 110 326 138 296 148
          C 280 162 90 162 70 148
          C 50 148 48 138 60 130 Z"
      />
    </g>
  );
}

import { createIcon, Tone, ToneCircle } from "./base";

const CLOUD = "M7 18.5a4.5 4.5 0 1 1 .9-8.9A6 6 0 0 1 19 11.5a3.5 3.5 0 0 1-.5 7Z";
const CLOUD_SMALL = "M7 14.5a4 4 0 1 1 .8-7.9A5.5 5.5 0 0 1 18 8.5a3 3 0 0 1-.5 6Z";

/** Falling drop that bobs gently (disabled automatically by prefers-reduced-motion). */
function Drop({ d, delay }: { d: string; delay: number }) {
  return <path d={d} className="animate-drop" style={{ animationDelay: `${delay}ms`, transformBox: "fill-box" }} />;
}

export const SunIcon = createIcon(
  "SunIcon",
  <>
    <ToneCircle cx="12" cy="12" r="4" />
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </>,
  "var(--wf-wx-sun)",
);

export const CloudIcon = createIcon(
  "CloudIcon",
  <>
    <Tone d={CLOUD} />
    <path d={CLOUD} />
  </>,
  "var(--wf-wx-cloud)",
);

export const RainIcon = createIcon(
  "RainIcon",
  <>
    <Tone d={CLOUD_SMALL} />
    <path d={CLOUD_SMALL} />
    <Drop d="m8.5 17.5-1 2.5" delay={0} />
    <Drop d="m12.5 17.5-1 2.5" delay={300} />
    <Drop d="m16.5 17.5-1 2.5" delay={600} />
  </>,
  "var(--wf-wx-rain)",
);

export const HeavyRainIcon = createIcon(
  "HeavyRainIcon",
  <>
    <Tone d={CLOUD_SMALL} />
    <path d={CLOUD_SMALL} />
    <Drop d="m7 17-1.5 4" delay={0} />
    <Drop d="M10.5 17 9 21" delay={200} />
    <Drop d="m14 17-1.5 4" delay={400} />
    <Drop d="M17.5 17 16 21" delay={600} />
  </>,
  "var(--wf-wx-rain)",
);

export const StormIcon = createIcon(
  "StormIcon",
  <>
    <Tone d={CLOUD_SMALL} />
    <path d={CLOUD_SMALL} />
    <Tone d="M12.8 14.5 10.5 18.2h3L11.8 22" />
    <path d="M12.8 14.5 10.5 18.2h3L11.8 22" />
  </>,
  "var(--wf-wx-storm)",
);

export const WindIcon = createIcon(
  "WindIcon",
  <>
    <path d="M3 8.5h10.5A2.5 2.5 0 1 0 11 6" />
    <path d="M3 12.5h15a2.5 2.5 0 1 1-2.5 2.5" />
    <path d="M3 16.5h7" />
    <ToneCircle cx="13.5" cy="6" r="2.5" />
  </>,
  "var(--wf-wx-wind)",
);

const THERMO = "M9 13.8V5a2 2 0 0 1 4 0v8.8a4 4 0 1 1-4 0Z";
export const HeatIcon = createIcon(
  "HeatIcon",
  <>
    <Tone d={THERMO} />
    <path d={THERMO} />
    <path d="M11 9v7.5" />
    <path d="M16.5 5.5h3M16.5 9h4.5M16.5 12.5h3" />
  </>,
  "var(--wf-wx-heat)",
);

const MASK = "M4 9c2.5 0 4-2 8-2s5.5 2 8 2v3c0 3.8-3.8 6-8 6s-8-2.2-8-6Z";
export const Pm25Icon = createIcon(
  "Pm25Icon",
  <>
    <Tone d={MASK} />
    <path d={MASK} />
    <path d="M4 10H2.5M20 10h1.5" />
    <path d="M8 11.5h8M8.5 14.5h7" />
  </>,
  "var(--wf-wx-pm)",
);

export const MoonIcon = createIcon(
  "MoonIcon",
  <>
    <Tone d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
  </>,
  "var(--wf-wx-storm)",
);

export const SunriseIcon = createIcon(
  "SunriseIcon",
  <>
    <Tone d="M7 17a5 5 0 0 1 10 0Z" />
    <path d="M7 17a5 5 0 0 1 10 0" />
    <path d="M3 17h18M12 4v4M5.6 10.6 7 12M18.4 10.6 17 12M3 21h18" />
  </>,
  "var(--wf-wx-sun)",
);

export const SunsetIcon = createIcon(
  "SunsetIcon",
  <>
    <Tone d="M7 17a5 5 0 0 1 10 0Z" />
    <path d="M7 17a5 5 0 0 1 10 0" />
    <path d="M3 17h18M12 9V4M9.5 6.5 12 9l2.5-2.5M3 21h18" />
  </>,
  "var(--wf-wx-heat)",
);

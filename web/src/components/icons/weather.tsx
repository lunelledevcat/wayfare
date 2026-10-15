import { createIcon } from "./base";

const CLOUD_SMALL = "M7 14.5a4 4 0 1 1 .8-7.9A5.5 5.5 0 0 1 18 8.5a3 3 0 0 1-.5 6Z";

export const SunIcon = createIcon(
  "SunIcon",
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </>,
);

export const CloudIcon = createIcon("CloudIcon", <path d="M7 18.5a4.5 4.5 0 1 1 .9-8.9A6 6 0 0 1 19 11.5a3.5 3.5 0 0 1-.5 7Z" />);

export const RainIcon = createIcon(
  "RainIcon",
  <>
    <path d={CLOUD_SMALL} />
    <path d="m8.5 17.5-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5" />
  </>,
);

export const HeavyRainIcon = createIcon(
  "HeavyRainIcon",
  <>
    <path d={CLOUD_SMALL} />
    <path d="m7 17-1.5 4M10.5 17 9 21M14 17l-1.5 4M17.5 17 16 21" />
  </>,
);

export const StormIcon = createIcon(
  "StormIcon",
  <>
    <path d={CLOUD_SMALL} />
    <path d="M12.8 14.5 10.5 18.2h3L11.8 22" />
  </>,
);

export const WindIcon = createIcon(
  "WindIcon",
  <>
    <path d="M3 8.5h10.5A2.5 2.5 0 1 0 11 6" />
    <path d="M3 12.5h15a2.5 2.5 0 1 1-2.5 2.5" />
    <path d="M3 16.5h7" />
  </>,
);

export const HeatIcon = createIcon(
  "HeatIcon",
  <>
    <path d="M9 13.8V5a2 2 0 0 1 4 0v8.8a4 4 0 1 1-4 0Z" />
    <path d="M11 9v7.5" />
    <path d="M16.5 5.5h3M16.5 9h4.5M16.5 12.5h3" />
  </>,
);

export const Pm25Icon = createIcon(
  "Pm25Icon",
  <>
    <path d="M4 9c2.5 0 4-2 8-2s5.5 2 8 2v3c0 3.8-3.8 6-8 6s-8-2.2-8-6Z" />
    <path d="M4 10H2.5M20 10h1.5" />
    <path d="M8 11.5h8M8.5 14.5h7" />
  </>,
);

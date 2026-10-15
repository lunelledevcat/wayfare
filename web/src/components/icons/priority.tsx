import type { Priority } from "@/lib/planner/types";
import { createIcon, type Icon, type IconProps } from "./base";

export const FastestIcon = createIcon("FastestIcon", <path d="M13 2 4.5 13.5H11L10 22l9.5-12H13Z" />);

export const CheapestIcon = createIcon(
  "CheapestIcon",
  <>
    <path d="M3 11.2V4a1 1 0 0 1 1-1h7.2a1 1 0 0 1 .7.3l8.8 8.8a1 1 0 0 1 0 1.4l-7.2 7.2a1 1 0 0 1-1.4 0L3.3 11.9a1 1 0 0 1-.3-.7Z" />
    <circle cx="7.5" cy="7.5" r="1.4" />
  </>,
);

export const ValueIcon = createIcon("ValueIcon", <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z" />);

export const ComfortIcon = createIcon(
  "ComfortIcon",
  <>
    <path d="M4.5 11V8a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v3" />
    <path d="M2.5 13a2 2 0 0 1 4 0v2h11v-2a2 2 0 0 1 4 0v4a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1Z" />
    <path d="M5 18v2M19 18v2" />
  </>,
);

export const PRIORITY_ICON: Record<Priority, Icon> = {
  fastest: FastestIcon,
  cheapest: CheapestIcon,
  value: ValueIcon,
  comfort: ComfortIcon,
};

export function PriorityIcon({ priority, ...props }: IconProps & { priority: Priority }) {
  const C = PRIORITY_ICON[priority];
  return <C {...props} />;
}

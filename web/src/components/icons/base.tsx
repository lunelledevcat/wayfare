import type { ReactNode, SVGProps } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  size?: number | string;
  /** Accessible name. Omit when visible text already describes the icon (the icon is then aria-hidden). */
  label?: string;
}

export type Icon = ((props: IconProps) => ReactNode) & { displayName?: string };

/** Wayfare icon set: 24×24 grid, 1.75 stroke, currentColor, rounded joins. */
export function createIcon(name: string, body: ReactNode): Icon {
  const C = ({ size = 24, label, className, ...rest }: IconProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      {...rest}
    >
      {label && <title>{label}</title>}
      {body}
    </svg>
  );
  C.displayName = name;
  return C;
}

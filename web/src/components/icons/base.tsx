import type { CSSProperties, ReactNode, SVGProps } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  size?: number | string;
  /** Accessible name. Omit when visible text already describes the icon (the icon is then aria-hidden). */
  label?: string;
}

export type Icon = ((props: IconProps) => ReactNode) & { displayName?: string };

/** Duotone fill layer: same colour as the stroke at 20% opacity. */
export function Tone(props: SVGProps<SVGPathElement>) {
  return <path fill="currentColor" fillOpacity={0.2} stroke="none" {...props} />;
}
export function ToneCircle(props: SVGProps<SVGCircleElement>) {
  return <circle fill="currentColor" fillOpacity={0.2} stroke="none" {...props} />;
}

/**
 * Wayfare icon set: 24×24 grid, 1.75 stroke in currentColor, rounded joins, plus a 20%
 * tone fill of the same colour. `color` gives an icon its own default colour (weather).
 */
export function createIcon(name: string, body: ReactNode, color?: string): Icon {
  const C = ({ size = 24, label, className, style, ...rest }: IconProps) => (
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
      style={color ? ({ color, ...style } as CSSProperties) : style}
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

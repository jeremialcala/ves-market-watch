import type { SVGProps } from "react";

/** Glifos del sistema Higerotech usados por este dashboard (port de
 * `components/core/Icon.jsx`; se portan solo los que la UI necesita). */
const GLIFOS = {
  menu: { vb: "0 0 24 24", sw: 1.8, d: ["M4 7h16M4 12h16M4 17h16"] },
  close: { vb: "0 0 24 24", sw: 1.8, d: ["M6 6l12 12M18 6L6 18"] },
} as const;

export type NombreIcono = keyof typeof GLIFOS;

interface Props extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: NombreIcono;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, size = 24, strokeWidth, ...resto }: Props) {
  const g = GLIFOS[name];
  return (
    <svg
      viewBox={g.vb}
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      {...resto}
    >
      {g.d.map((d) => (
        <path
          key={d}
          d={d}
          stroke="currentColor"
          strokeWidth={strokeWidth ?? g.sw}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

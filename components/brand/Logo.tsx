import type { SVGProps } from "react";

type LogoProps = {
  variant?: "horizontal" | "mark" | "stacked";
  invert?: boolean;
  className?: string;
};

const petalPath =
  "M 0 -38 C 16 -38, 30 -28, 32 -8 C 32 -8, 26 -14, 18 -18 C 6 -22, 0 -28, 0 -38 Z";

export function LogoMark({
  invert = false,
  className,
  ...props
}: { invert?: boolean } & SVGProps<SVGSVGElement>) {
  const surface = invert ? "#FFFFFF" : "#111111";
  const mark = invert ? "#111111" : "#FFFFFF";
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <rect width="120" height="120" rx="22" fill={surface} />
      <g transform="translate(60 60)" fill={mark}>
        <path d={petalPath} />
        <path d={petalPath} transform="rotate(90)" />
        <path d={petalPath} transform="rotate(180)" />
        <path d={petalPath} transform="rotate(270)" />
      </g>
    </svg>
  );
}

export function Logo({
  variant = "horizontal",
  invert = false,
  className,
}: LogoProps) {
  const fg = invert ? "#FFFFFF" : "#111111";

  if (variant === "mark") {
    return <LogoMark invert={invert} className={className} />;
  }

  if (variant === "stacked") {
    return (
      <div
        className={["flex flex-col items-center gap-3", className]
          .filter(Boolean)
          .join(" ")}
      >
        <LogoMark invert={invert} className="h-12 w-12" />
        <div
          className="text-[1.05rem] font-extrabold tracking-tight"
          style={{ color: fg }}
        >
          BOServices
        </div>
        <div
          className="-mt-2 text-[0.6rem] font-medium uppercase tracking-[0.18em]"
          style={{ color: invert ? "rgba(255,255,255,0.55)" : "rgba(17,17,17,0.55)" }}
        >
          Business Operations Services
        </div>
      </div>
    );
  }

  return (
    <div
      className={["flex items-center gap-2.5", className].filter(Boolean).join(" ")}
      aria-label="BOServices"
    >
      <LogoMark invert={invert} className="h-7 w-7 shrink-0" />
      <span
        className="text-[1.05rem] font-extrabold tracking-tight leading-none"
        style={{ color: fg }}
      >
        BOServices
      </span>
    </div>
  );
}

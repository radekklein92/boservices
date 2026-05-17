import type { ReactNode } from "react";

export const CEIP_URL = "https://industrypartners.eu/";

export function ceipLink(chunks: ReactNode) {
  return (
    <a
      href={CEIP_URL}
      target="_blank"
      rel="noreferrer noopener"
      className="underline underline-offset-[3px] transition-opacity hover:opacity-70"
    >
      {chunks}
    </a>
  );
}

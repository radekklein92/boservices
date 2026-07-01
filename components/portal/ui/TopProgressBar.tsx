"use client";

import { useEffect, useRef, useState } from "react";

// Tenká horní lišta indikující probíhající RSC navigaci (typicky změna filtru,
// kdy se čeká na serverovou odpověď a URL/obsah se přepíšou až po ní). Bez ní
// nemá kliknutí na pilulku okamžitou odezvu a uživatel klika dokola.
//
// Chování: při aktivaci hned naskočí (viditelná reakce), plynule "natéká"
// k ~90 % (asymptota - nikdy nedojede sama, čeká na dokončení), po dokončení
// doskočí na 100 % a zhasne. Žádné závislosti, jen CSS transition.
export function TopProgressBar({ active }: { active: boolean }) {
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (active) {
      startedRef.current = true;
      setVisible(true);
      setWidth(8); // okamžitý náskok, ať je reakce vidět v tomtéž snímku
      const t = setTimeout(() => setWidth(90), 60); // pak plynulé natažení
      return () => clearTimeout(t);
    }
    if (!startedRef.current) return; // první mount (nikdy nebylo aktivní) - nedělat nic
    startedRef.current = false;
    setWidth(100); // dokončit
    const t = setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 260);
    return () => clearTimeout(t);
  }, [active]);

  if (!visible) return null;

  const done = width >= 100;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-[3px]"
      role="progressbar"
      aria-hidden="true"
    >
      <div
        className="h-full bg-ink-base shadow-[0_0_10px_rgba(15,15,15,0.35)]"
        style={{
          width: `${width}%`,
          opacity: done ? 0 : 1,
          transition: done
            ? "width 200ms ease-out, opacity 220ms ease-out 80ms"
            : width <= 8
              ? "width 140ms ease-out"
              : "width 8s cubic-bezier(0.12, 0.72, 0.12, 1)",
        }}
      />
    </div>
  );
}

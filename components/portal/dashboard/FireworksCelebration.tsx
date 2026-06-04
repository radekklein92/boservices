"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Volume2, VolumeX, X } from "lucide-react";
import type { Fireworks as FireworksType } from "fireworks-js";

// Zvukové soubory (volitelné). Když v public/sounds nejsou, přehrávání se
// jen tiše přeskočí - vizuál funguje vždy.
const SOUND_FILES = [
  "/sounds/firework-1.mp3",
  "/sounds/firework-2.mp3",
  "/sounds/firework-3.mp3",
];

const SOUND = { enabled: false, files: SOUND_FILES, volume: { min: 6, max: 16 } };

// Krátká triumfální fanfára (syntéza Web Audio - žádný soubor/licence). Brass
// motiv „ta-ta-ta-TÁÁ" + závěrečný durový akord. Přehraje se při zapnutí zvuku
// (klik = gesto, takže zní spolehlivě). Pokud existuje /sounds/fanfare.mp3,
// dá se použít místo syntézy (volitelné).
let fanfareCtx: AudioContext | null = null;
function playFanfare() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    if (!fanfareCtx) fanfareCtx = new Ctx();
    const ctx = fanfareCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime + 0.04;

    const master = ctx.createGain();
    master.gain.value = 0.9;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2800;
    lp.Q.value = 0.7;
    master.connect(lp);
    lp.connect(ctx.destination);

    const voice = (freq: number, start: number, dur: number, gain = 0.22) => {
      const t = t0 + start;
      const vg = ctx.createGain();
      vg.connect(master);
      vg.gain.setValueAtTime(0.0001, t);
      vg.gain.exponentialRampToValueAtTime(gain, t + 0.035);
      vg.gain.setValueAtTime(gain, t + dur * 0.65);
      vg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const specs: Array<[OscillatorType, number, number]> = [
        ["sawtooth", 0, 1],
        ["sawtooth", 7, 0.8],
        ["square", -6, 0.35],
      ];
      for (const [type, detune, g] of specs) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = freq;
        o.detune.value = detune;
        const og = ctx.createGain();
        og.gain.value = g;
        o.connect(og);
        og.connect(vg);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    };

    // G dur: D5 (3x staccato) -> G5 (delší) -> triumfální akord G B D G B.
    const D5 = 587.33, G5 = 783.99, B4 = 493.88, G4 = 392.0, B5 = 987.77;
    voice(D5, 0.0, 0.14);
    voice(D5, 0.17, 0.14);
    voice(D5, 0.34, 0.14);
    voice(G5, 0.5, 0.55, 0.26);
    [G4, B4, D5, G5, B5].forEach((f) => voice(f, 0.92, 1.3, 0.15));
  } catch {
    /* zvuk je doplněk - tiše ignorujeme */
  }
}

// Celoobrazovkový oslavný ohňostroj při splnění milníku. Vibrant multicolor,
// na tmavém pozadí (aby barvy vynikly). Zavře se kliknutím kamkoli / Esc / X.
export function FireworksCelebration({
  milestone,
  isGoal = false,
}: {
  milestone: number;
  isGoal?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fwRef = useRef<FireworksType | null>(null);
  const [open, setOpen] = useState(true);
  // Zvuk defaultně VYPNUTÝ - zapne se kliknutím na reproduktor (to gesto navíc
  // odemkne přehrávání i fanfáru, takže zazní spolehlivě).
  const [soundOn, setSoundOn] = useState(false);
  // Portál na document.body - aby overlay unikl stacking contextu Dashboardu
  // a pokryl celou obrazovku včetně levého menu (Sidebar je fixed z-30).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    // Instance žije jen dokud je overlay otevřený - při zavření (open=false)
    // se cleanup postará o zastavení ohňostroje i zvuku.
    if (!mounted || !open) return;
    let disposed = false;
    let instance: FireworksType | null = null;
    const el = containerRef.current;
    if (!el) return;
    // Dynamický import - fireworks-js běží jen v prohlížeči.
    import("fireworks-js").then(({ Fireworks }) => {
      if (disposed || !el) return;
      instance = new Fireworks(el, {
        autoresize: true,
        opacity: 0.5,
        acceleration: 1.02,
        friction: 0.97,
        gravity: 1.55,
        particles: 95,
        traceLength: 3,
        traceSpeed: 8,
        explosion: 8,
        intensity: 34,
        flickering: 55,
        lineStyle: "round",
        hue: { min: 0, max: 360 },
        delay: { min: 14, max: 28 },
        rocketsPoint: { min: 18, max: 82 },
        lineWidth: {
          explosion: { min: 1, max: 4 },
          trace: { min: 0.6, max: 1.6 },
        },
        brightness: { min: 55, max: 85 },
        decay: { min: 0.012, max: 0.028 },
        mouse: { click: false, move: false, max: 0 },
        sound: { ...SOUND, enabled: false },
      });
      fwRef.current = instance;
      instance.start();
    });
    return () => {
      disposed = true;
      instance?.stop(true);
      fwRef.current = null;
    };
  }, [mounted, open]);

  useEffect(() => {
    fwRef.current?.updateOptions({ sound: { ...SOUND, enabled: soundOn } });
    // Při zapnutí zvuku zahraj jednorázovou fanfáru (k praskání ohňostroje).
    if (soundOn) playFanfare();
  }, [soundOn]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fw-overlay fixed inset-0 z-[200] cursor-pointer overflow-hidden"
      role="dialog"
      aria-label={`Milník ${milestone} dosažen`}
      onClick={() => setOpen(false)}
    >
      {/* Tmavé pozadí, aby barvy ohňostroje vynikly */}
      <div className="fw-backdrop absolute inset-0" aria-hidden="true" />

      {/* Plátno ohňostroje */}
      <div ref={containerRef} className="absolute inset-0" aria-hidden="true" />

      {/* Oslavný text - uprostřed, neklikací (klik propadne na zavření) */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        <div className="fw-card pointer-events-none flex flex-col items-center">
          <span className="text-[11px] font-semibold uppercase tracking-[0.4em] text-white/70">
            {isGoal ? "Cíl dosažen" : "Milník dosažen"}
          </span>
          <span className="mt-3 font-extrabold leading-[0.85] tracking-[-0.04em] text-white text-[clamp(5rem,18vw,12rem)] [text-shadow:0_4px_40px_rgba(0,0,0,0.5)]">
            {milestone}
          </span>
          <span className="mt-4 max-w-[26ch] text-[15px] leading-relaxed text-white/85 sm:text-[17px]">
            {isGoal
              ? "Cíl 100 lokalit s franšízou je splněn. Skvělá práce!"
              : `${milestone} lokalit s franšízou v síti. Skvělá práce!`}
          </span>
        </div>
      </div>

      {/* Ovládání - vpravo nahoře (neklikací do zavření) */}
      <div
        className="absolute right-4 top-4 flex items-center gap-2 sm:right-6 sm:top-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setSoundOn((v) => !v)}
          aria-label={soundOn ? "Vypnout zvuk" : "Zapnout zvuk"}
          title={soundOn ? "Vypnout zvuk" : "Zapnout zvuk"}
          className="grid h-10 w-10 place-items-center rounded-full border border-white/25 bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
        >
          {soundOn ? (
            <Volume2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <VolumeX className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Zavřít"
          title="Zavřít"
          className="grid h-10 w-10 place-items-center rounded-full border border-white/25 bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
        >
          <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      {/* Nápověda dole */}
      <div className="pointer-events-none absolute inset-x-0 bottom-7 flex justify-center px-6">
        <span className="text-center text-[11px] font-medium uppercase tracking-[0.24em] text-white/45 sm:text-[11.5px] sm:tracking-[0.28em]">
          Reproduktorem zapneš zvuk · klikni kamkoli pro zavření
        </span>
      </div>

      <style>{`
        @keyframes fwFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes fwRise {
          from { opacity: 0; transform: translateY(18px) scale(0.96) }
          to { opacity: 1; transform: translateY(0) scale(1) }
        }
        .fw-overlay { animation: fwFade 0.45s ease-out both }
        .fw-backdrop {
          background:
            radial-gradient(120% 120% at 50% 35%, rgba(20,22,40,0.72) 0%, rgba(6,7,16,0.92) 60%, rgba(3,3,9,0.97) 100%);
        }
        .fw-card { animation: fwRise 0.7s cubic-bezier(0.22,1,0.36,1) 0.15s both }
      `}</style>
    </div>,
    document.body,
  );
}

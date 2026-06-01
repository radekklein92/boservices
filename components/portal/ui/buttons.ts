// Sjednocené třídy tlačítek pro portál (detaily + řádky seznamů). Cíl: jedna
// sada variant místo roztříštěných h-9/h-10/h-11 a font-medium/semibold.
// Pozn.: modaly a formuláře mají vlastní (vnitřně konzistentní) tlačítka a
// tato sada se na ně zatím nevztahuje.

// Tmavá primární pilulka (hlavní akce).
export const BTN_PRIMARY =
  "inline-flex h-11 items-center gap-2 rounded-full bg-ink-base px-5 text-[13px] font-semibold text-paper transition-transform active:translate-y-px disabled:opacity-60";

// Sekundární pilulka s obrysem.
export const BTN_OUTLINE =
  "inline-flex h-11 items-center gap-2 rounded-full border border-edge bg-paper px-5 text-[13px] font-semibold text-ink-deep transition-colors hover:border-ink-base hover:text-ink-base disabled:opacity-50";

// Decentní textové tlačítko (undo / zrušit).
export const BTN_SUBTLE =
  "inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-ink-mid transition-colors hover:text-ink-base disabled:opacity-50";

// Kompaktní obrysové tlačítko pro řádky seznamů (např. „Otevřit").
export const BTN_ROW =
  "inline-flex h-9 items-center gap-2 rounded-full border border-edge px-3 text-[12px] font-medium text-ink-deep transition-colors hover:border-ink-base hover:text-ink-base disabled:opacity-50";

// Kruhové ikonové tlačítko (h-9 w-9).
export const BTN_ICON =
  "grid h-9 w-9 place-items-center rounded-full border border-edge text-ink-mid transition-colors hover:border-ink-base hover:bg-ink-base hover:text-paper disabled:opacity-50";

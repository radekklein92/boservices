// Sjednocené třídy tlačítek pro portál. Cíl: jedna sada variant místo
// roztříštěných h-9/h-10/h-11 a font-medium/semibold.
//
// Dva tiery výšky podle kontextu (oba interně konzistentní):
//   - stránky / seznamy / sekce  -> h-11 (BTN_PRIMARY / BTN_OUTLINE)
//   - modaly / patičky formulářů  -> h-10 (BTN_PRIMARY_MODAL)
// Padding px-5 a text-[13px] jsou společné napříč tiery; modaly jsou jen
// kompaktnější na výšku. Auth/landing (h-12) jsou samostatný kontext.

// Tmavá primární pilulka (hlavní akce na stránce / v seznamu).
export const BTN_PRIMARY =
  "inline-flex h-11 items-center gap-2 rounded-full bg-ink-base px-5 text-[13px] font-semibold text-paper transition-transform active:translate-y-px disabled:opacity-60";

// Sekundární pilulka s obrysem.
export const BTN_OUTLINE =
  "inline-flex h-11 items-center gap-2 rounded-full border border-edge bg-paper px-5 text-[13px] font-semibold text-ink-deep transition-colors hover:border-ink-base hover:text-ink-base disabled:opacity-50";

// Kompaktní primární pilulka pro modaly / patičky formulářů (h-10).
// Sekundární akce ("Zrušit") v modalech je decentní textové tlačítko (h-10,
// text-ink-mid) - viz jednotlivé modaly; samostatnou konstantu nepotřebuje.
export const BTN_PRIMARY_MODAL =
  "inline-flex h-10 items-center gap-2 rounded-full bg-ink-base px-5 text-[13px] font-semibold text-paper transition-transform active:translate-y-px disabled:opacity-60";

// Decentní textové tlačítko (undo / zrušit).
export const BTN_SUBTLE =
  "inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-ink-mid transition-colors hover:text-ink-base disabled:opacity-50";

// Kompaktní obrysové tlačítko pro řádky seznamů (např. „Otevřit").
export const BTN_ROW =
  "inline-flex h-9 items-center gap-2 rounded-full border border-edge px-3 text-[12px] font-medium text-ink-deep transition-colors hover:border-ink-base hover:text-ink-base disabled:opacity-50";

// Kruhové ikonové tlačítko (h-9 w-9).
export const BTN_ICON =
  "grid h-9 w-9 place-items-center rounded-full border border-edge text-ink-mid transition-colors hover:border-ink-base hover:bg-ink-base hover:text-paper disabled:opacity-50";

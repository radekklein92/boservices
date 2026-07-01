// Sjednocené třídy tlačítek pro portál. Cíl: jedna sada variant místo
// roztříštěných h-9/h-10/h-11 a font-medium/semibold.
//
// Dva tiery výšky podle kontextu (oba interně konzistentní):
//   - stránky / seznamy / sekce  -> h-11 (BTN_PRIMARY / BTN_OUTLINE)
//   - modaly / patičky formulářů  -> h-10 (BTN_PRIMARY_MODAL)
// Padding px-5 a text-[13px] jsou společné napříč tiery; modaly jsou jen
// kompaktnější na výšku. Auth/landing (h-12) jsou samostatný kontext.

// Sdílený focus-visible prsten (klávesnicová navigace) - stejný napříč tlačítky.
// Exportovaný, ať ho sdílí i ne-tlačítkové prvky standardu (SearchInput apod.).
export const FV =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-base focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

// Tmavá primární pilulka (hlavní akce na stránce / v seznamu).
export const BTN_PRIMARY =
  `inline-flex h-11 items-center gap-2 rounded-full bg-ink-base px-5 text-[13px] font-semibold text-paper transition-transform active:translate-y-px disabled:opacity-60 ${FV}`;

// Sekundární pilulka s obrysem.
export const BTN_OUTLINE =
  `inline-flex h-11 items-center gap-2 rounded-full border border-edge bg-paper px-5 text-[13px] font-semibold text-ink-deep transition-colors hover:border-ink-base hover:text-ink-base disabled:opacity-50 ${FV}`;

// Kompaktní primární pilulka pro modaly / patičky formulářů (h-10).
// Sekundární akce ("Zrušit") v modalech je decentní textové tlačítko (h-10,
// text-ink-mid) - viz jednotlivé modaly; samostatnou konstantu nepotřebuje.
export const BTN_PRIMARY_MODAL =
  `inline-flex h-10 items-center gap-2 rounded-full bg-ink-base px-5 text-[13px] font-semibold text-paper transition-transform active:translate-y-px disabled:opacity-60 ${FV}`;

// Destruktivní akce (smazat / zrušit smlouvu). Jediné místo, kde je akční barva
// červená - přebíjí pravidlo „primární = černá", protože jde o nevratný krok.
// Používej JEN pro skutečně destruktivní potvrzení, ne pro běžné akce (h-10, do
// modalů/potvrzení). Barva ze sémantického tokenu --color-danger.
export const BTN_DANGER =
  `inline-flex h-10 items-center gap-2 rounded-full bg-danger px-5 text-[13px] font-semibold text-paper transition-transform active:translate-y-px disabled:opacity-60 ${FV}`;

// Decentní textové tlačítko (undo / zrušit).
export const BTN_SUBTLE =
  `inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-ink-mid transition-colors hover:text-ink-base disabled:opacity-50 ${FV}`;

// Kompaktní obrysové tlačítko pro řádky seznamů (např. „Otevřit").
export const BTN_ROW =
  `inline-flex h-9 items-center gap-2 rounded-full border border-edge px-3 text-[12px] font-medium text-ink-deep transition-colors hover:border-ink-base hover:text-ink-base disabled:opacity-50 ${FV}`;

// Nástroj nad tabulkou (h-9): Export do Excelu, výběr sloupců, Vývoj v čase apod.
// Sedí do pravého kraje filtrového řádku (vedle počtu) - vzor stránky Real Estate.
export const BTN_TOOL =
  `inline-flex h-9 items-center gap-2 rounded-full border border-edge bg-paper px-3.5 text-[12.5px] font-medium text-ink-deep transition-colors hover:border-ink-soft disabled:cursor-not-allowed disabled:opacity-50 ${FV}`;

// Kruhové ikonové tlačítko (h-9 w-9).
export const BTN_ICON =
  `grid h-9 w-9 place-items-center rounded-full border border-edge text-ink-mid transition-colors hover:border-ink-base hover:bg-ink-base hover:text-paper disabled:opacity-50 ${FV}`;

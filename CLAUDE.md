# CLAUDE.md — BOServices portál

Pokyny pro Claude Code v tomto repu. (Obecné pracovní preference jsou v uživatelském `~/.claude/CLAUDE.md`.)

## POS data z Data Warehouse (api.boservices.cz)

POS tržby / účtenky / refundace / analytiku bere portál z veřejného REST API datového skladu
**`https://api.boservices.cz`** (zdroj dat: Dotykačka + Trdlokafe; repo skladu: `rontoday/bo-service`).
Portálová API vrstva je v `lib/portal/pos/` (`api.ts`, `types.ts`, `queries.ts`).

- **Při jakékoli práci s DW API VŽDY nejdřív přečti jeho AKTUÁLNÍ dokumentaci** —
  strojově `https://api.boservices.cz/openapi.json`, lidsky `https://api.boservices.cz/docs`.
  Kontrakt se aktivně vyvíjí (přibývají parametry jako `shop_ids`, `bucket=month`, nové endpointy,
  pole jako `refunds`, a **mění se sémantika** — např. co přesně je „tržba"). Portál se musí vázat na
  to, co API reálně vrací TEĎ, ne na dřívější předpoklady. Nečtení docs už opakovaně vedlo k driftu
  (portál počítal se starým chováním polí/parametrů, než byl kontrakt aktualizovaný).

- **„Tržba" z DW je NETTO po refundacích a BEZ stornovaných objednávek** (`document_type='CANCELLATION'`),
  jednotně napříč všemi endpointy (`/v1/revenue/*` i `/v1/analytics/*`), aby seděla na Dotykačka
  „Přehled tržeb". Proto na portálu **nikdy nepředpokládej, že `gross` = hrubé prodeje** a
  **nepřepočítávej refundace ani storna z `gross`** — DW to už vyřešilo, portál čte hodnoty verbatim
  (jediná výjimka jsou ryze prezentační agregace: FX přepočet a rollup přes prodejny v `queries.ts`).

- Když se na API něco nezdá (čísla nesedí na zdroj, chybí endpoint/parametr), ověř to nejdřív proti
  `/openapi.json` a případně u skladu (`rontoday/bo-service`), než začneš obcházet/dopočítávat v portálu.

## Změny UI portálu - po každé úpravě ověřit (browser + konzistence)

Po **jakékoli změně UI** (layout, komponenta, styl, nový prvek) automaticky ještě před deployem - bez
čekání na výzvu uživatele - proveď tyto dva kroky:

- **Vizuální ověření na desktopu i na mobilu (úzký viewport).** Ověř, že se dotčená stránka načte a
  vypadá správně v obou šířkách. **Nástroj = claude-in-chrome** (uživatelův Chrome; mobil přes
  `resize_window`; otevřené taby po sobě zavřít). Když je potřeba jiná session než uživatelova
  (reálná data, chráněný preview, login flow), přihlas se v něm testovacím účtem
  (`claude-pos-test@boservices.cz`) - login na `/portal/login`.
- **Kontrola konzistence komponent.** Změna nesmí zavést bespoke variantu ani rozbít sdílené
  komponenty - drž se `PageHeader`, `FilterChip`, `Chip`, `KpiCard`, `buttons.ts` a sémantiky barev.
  Hlídej hlavně **regrese neviditelné na první pohled**: výška karet, velikost a váha písma nadpisů,
  mezery, pořadí prvků. Tyto se opakovaně rozbíjely jako vedlejší efekt jiné úpravy.

Důvod: bez tohoto kroku vzniká churn (uživatel pak ručně reportuje „zmenši zpátky", „to není
konzistentní se zbytkem Portálu") a tiché regrese se chytají až se zpožděním. Ověření na místě je
levnější než cyklus přes uživatele.

## Horní část stránky - sdílený standard (hlavička + toolbar + filtry)

Horní část KAŽDÉ seznamové stránky se skládá z těchto sdílených komponent v tomto pořadí. Nepiš
vlastní `<input type="search">`, ručně stylované pilulky ani vlastní počítadlo výsledků. **Referenční
rozložení toolbaru/filtrů = stránka Real Estate** (`components/portal/locations/RealEstateTable.tsx`).

1. **`PageHeader`** (`components/portal/shell/PageHeader.tsx`) - eyebrow + titulek + lede (masthead
   s hairline pod hlavičkou). Akce jdou do `actions`: **primární** (create) jako `BTN_PRIMARY` (černá
   pilulka) **vpravo, nejvíc vpravo, max jedna**; sekundární/datové akce (Export/Import/Sync) jako
   `BTN_OUTLINE` **vlevo od primární**. Read-only / report stránky (Lokality, Poplatky, Real Estate)
   create akci nemají → **žádnou primární pilulku nefinguj**, všechny akce jsou outline. Akce dávej
   přímo do `actions` (fragment) - `PageHeader` je sám zalamuje (`flex-wrap`).
2. **Hledání** - `<SearchInput>` **samostatně na vlastním řádku** (vlevo, roste do max-w-[400px]).
   NE spolu s počtem, NE vpravo, NE v řádku s něčím jiným.
3. **`FilterBar`** (`components/portal/ui/FilterBar.tsx`) - řádek pod hledáním: `<FilterChip>` (stavy/
   kategorie) **vlevo**, oddělovače `<FilterBar.Divider/>`, volitelný textový reset (`onReset`); do
   `trailing` jde **`<ResultCount>` a pohledové ovladače** (Vývoj v čase, Excel, Sloupce, řazení,
   měsíční navigace, přepínače) - **vždy u pravého kraje** (`ml-auto`). Počet je tedy VŽDY vpravo v
   tomto řádku, nikdy hned za hledáním. Stránky bez chipů (klikací karty/legenda) dají počet vpravo
   týmž způsobem (`ml-auto`).

Pravidla:

- **Tlačítka VŽDY přes konstanty z `components/portal/ui/buttons.ts`** - `BTN_PRIMARY` / `BTN_OUTLINE`
  (h-11, stránkové akce), `BTN_ROW` / `BTN_ICON` (h-9, řádky seznamů + toolbar), `BTN_PRIMARY_MODAL`
  (h-10, modaly). Nikdy inline `bg-ink-base … text-[13px]` ani odchylky jako `text-[13.5px]`.
- **Sdílené primitivy**: `SearchInput`, `ResultCount`, `FilterChip`, `FilterBar`, `Chip` (vše `components/portal/ui/`).
- **Primární barva = černá pilulka** (`ink-base`). Zelená zůstává sémantická (stavy, kladné hodnoty,
  toggle) - NIKDY z ní nedělej primární akční barvu.
- **Detailové stránky**: BackLink + titulek + lede + akce; akce v h-10 tieru. Nedělej vlastní `<h1>`
  s ad-hoc velikostí.

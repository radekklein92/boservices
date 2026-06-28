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

## Změny UI portálu - po každé úpravě ověřit (Playwright + konzistence)

Po **jakékoli změně UI** (layout, komponenta, styl, nový prvek) automaticky ještě před deployem - bez
čekání na výzvu uživatele - proveď tyto dva kroky:

- **Playwright na desktopu i na mobilu (úzký viewport).** Ověř, že se dotčená stránka načte a vypadá
  správně v obou šířkách. Reálná data přes testovací účet (`claude-pos-test@boservices.cz`),
  systémový Chrome (`channel: "chrome"`), úspěšný login potvrď přes `waitForURL` pryč z `/login`.
- **Kontrola konzistence komponent.** Změna nesmí zavést bespoke variantu ani rozbít sdílené
  komponenty - drž se `PageHeader`, `FilterChip`, `Chip`, `KpiCard`, `buttons.ts` a sémantiky barev.
  Hlídej hlavně **regrese neviditelné na první pohled**: výška karet, velikost a váha písma nadpisů,
  mezery, pořadí prvků. Tyto se opakovaně rozbíjely jako vedlejší efekt jiné úpravy.

Důvod: bez tohoto kroku vzniká churn (uživatel pak ručně reportuje „zmenši zpátky", „to není
konzistentní se zbytkem Portálu") a tiché regrese se chytají až se zpožděním. Ověření na místě je
levnější než cyklus přes uživatele.

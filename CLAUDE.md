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

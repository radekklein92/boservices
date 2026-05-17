# BOServices

Sales onepager pro **Business Operations Services s.r.o.** - firmu, která provozuje retailové prodejny pro značky.

Součást skupiny CEIP.

## Tech stack

- **Next.js 16** (App Router, Turbopack, RSC)
- **React 19**, **TypeScript** (strict)
- **Tailwind CSS v4**
- **next-intl** (CZ/EN)
- **Upstash Redis** - ukládání leadů z kontaktního formuláře
- **Resend** - e-mailové notifikace o nových leadech
- **framer-motion**, **lucide-react**, **zod**
- **Font:** Manrope (z brand manuálu)
- **Deploy:** Vercel

## Lokální vývoj

```bash
yarn install
cp .env.example .env.local
# vyplň UPSTASH_*, RESEND_API_KEY, NOTIFY_EMAIL
yarn dev
```

Defaultní jazyk je **čeština** (`/`). Angličtina na `/en`.

## Env proměnné

| Klíč | K čemu |
| --- | --- |
| `UPSTASH_REDIS_REST_URL` | Upstash REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash REST token |
| `RESEND_API_KEY` | Resend API key |
| `FROM_EMAIL` | Odesílatel notifikace (např. `BOServices <noreply@boservices.cz>`) |
| `NOTIFY_EMAIL` | Kam chodí notifikace o novém leadu |
| `NEXT_PUBLIC_SITE_URL` | Veřejná URL (kvůli OG/canonical) |

Pokud Upstash není nakonfigurován, lead se neuloží, ale e-mailová notifikace se přesto odešle (pokud je RESEND_API_KEY). Pokud není ani Resend, request projde jako 200 OK, jen se loguje warning.

## Struktura

```
app/
  [locale]/
    layout.tsx        # i18n layout + Manrope
    page.tsx          # onepager skládá sekce
  api/contact/        # POST -> Redis + Resend
  globals.css         # Tailwind v4 + theme tokens
components/
  brand/Logo.tsx      # SVG 4-list propeller + wordmark
  sections/           # Hero / WhatWeDo / People / Contact
  ui/                 # Navbar, Footer, ContactForm (client)
i18n/                 # routing, request config, navigation
messages/cs.json
messages/en.json
lib/
  people.ts           # data jednatelů
  redis.ts            # Upstash factory + Lead type
  email.ts            # Resend notification
proxy.ts              # next-intl locale middleware (Next 16 konvence)
```

## Build & deploy

```bash
yarn build        # production build (Turbopack)
yarn start        # spustí production server
yarn typecheck    # tsc --noEmit
```

Push na `main` -> Vercel auto-deploy.

## Brand

Vychází z `BOServices Design manuál v1.0` (květen 2026).

- **Symbol:** stylizovaný 4-list propeller (důvěra, struktura, tok, výkon)
- **Wordmark:** Manrope ExtraBold
- **Barvy:** `#111111` černá / `#2A2A2A` uhlová / `#BFC3C7` světle šedá / `#FFFFFF` bílá
- **Žádné akcenty.** Žádné gradienty. Žádné emoji. Žádné em/en-dash.

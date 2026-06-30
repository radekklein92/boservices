// Osobní účet majitele portálu zobrazujeme VŠUDE anonymně jako "Admin" (a bez
// e-mailu), aby se při sdílení obrazovky neukázaly osobní údaje. Týká se jen
// tohoto jednoho účtu; autorizace, akce (reset/smazat) i ukládání dál jedou na
// skutečném e-mailu - maskuje se výhradně ZOBRAZENÍ. Sdíleno mezi seznamem
// uživatelů, menu, logem změn Real Estate i dalšími místy, kde se jméno/e-mail
// uživatele vykresluje (jediný zdroj pravdy, ať se maskování nikde nezapomene).
//
// Client-safe: žádné server-only závislosti, smí se importovat i z "use client"
// komponent.

export const MASKED_ACCOUNT_EMAIL = "klein.radek@seznam.cz";
// Skutečné jméno, které se nikde nesmí zobrazit. Některá historická pole
// ("kdo") ukládají jen jméno bez e-mailu (editLock.byName, cancelledByName,
// requestedByName), proto maskujeme i podle něj.
export const MASKED_ACCOUNT_NAME = "Radek Klein";
export const MASKED_ACCOUNT_LABEL = "Admin";

// Je to maskovaný účet majitele? (case-insensitive, e-maily jsou lowercase)
export function isMaskedAccount(email?: string | null): boolean {
  return !!email && email.trim().toLowerCase() === MASKED_ACCOUNT_EMAIL;
}

// Zamaskuje libovolný „kdo" řetězec (uložené jméno NEBO e-mail majitele) na
// "Admin". Pro zobrazení historických polí, kde není po ruce dvojice e-mail+
// jméno (stačí samotná hodnota). Ostatní hodnoty vrací beze změny.
export function maskWho(value?: string | null): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  const low = v.toLowerCase();
  if (low === MASKED_ACCOUNT_EMAIL || low === MASKED_ACCOUNT_NAME.toLowerCase()) {
    return MASKED_ACCOUNT_LABEL;
  }
  return v;
}

// Jméno k zobrazení: u maskovaného účtu vždy "Admin", jinak jméno → fallback
// e-mail → prázdný řetězec.
export function maskedDisplayName(
  email?: string | null,
  name?: string | null,
): string {
  if (isMaskedAccount(email)) return MASKED_ACCOUNT_LABEL;
  return name?.trim() || email || "";
}

// E-mail k zobrazení: u maskovaného účtu nic (skryjeme), jinak samotný e-mail.
export function maskedDisplayEmail(email?: string | null): string | null {
  if (isMaskedAccount(email)) return null;
  return email ?? null;
}

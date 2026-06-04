// Firmy držící nájem k provozovně, když je nájemní smlouva „na třetí stranu"
// (lease_current_status = prepis_jinam). U franšízové smlouvy varianty B se
// podle výběru přepíše čl. III odst. 1 (podnájem) - doplní se „případně
// společnost ..., která drží nájem ... (dále společně jen „Nájemce")".

export type LeaseHolderKey = "operations" | "21consult";

export type LeaseHolderCompany = {
  key: LeaseHolderKey;
  name: string;
  ico: string;
  sidlo: string;
  jednatel: string;
};

export const LEASE_HOLDERS: Record<LeaseHolderKey, LeaseHolderCompany> = {
  operations: {
    key: "operations",
    name: "Operations Management s.r.o.",
    ico: "21933421",
    sidlo: "náměstí 14. října 1307/2, Smíchov, 150 00 Praha",
    jednatel: "Jakub Krampera",
  },
  "21consult": {
    key: "21consult",
    name: "21 Consult Group s.r.o.",
    ico: "08996865",
    sidlo: "Českomoravská 2255/12a, Libeň, 190 00 Praha",
    jednatel: "Jakub Krampera",
  },
};

export function isLeaseHolderKey(v: string): v is LeaseHolderKey {
  return v === "operations" || v === "21consult";
}

// Stabilní věta, která je v základním i firemním znění čl. III odst. 1 -
// slouží jako kotva pro nalezení odstavce v zapečeném textu.
const ANCHOR =
  "přenechá Příjemci do podnájmu prostory Provozovny v místě sjednaném v čl. I odst. 2";

// `<li>` obsahující čl. III odst. 1 (s volitelným <p> kvůli Tiptap normalizaci).
const SUBLEASE_LI_RE =
  /<li>\s*(?:<p>)?(?:(?!<\/li>)[\s\S])*?přenechá Příjemci do podnájmu prostory Provozovny v místě sjednaném v čl\. I odst\. 2(?:(?!<\/li>)[\s\S])*?<\/li>/;

// Vrátí <li><p>…</p></li> pro čl. III odst. 1: základní (key=null) nebo firemní.
export function buildSubleaseClause(key: LeaseHolderKey | null): string {
  if (!key) {
    return (
      "<li><p>Poskytovatel přenechá Příjemci do podnájmu prostory Provozovny " +
      "v místě sjednaném v čl. I odst. 2 této Smlouvy, a to za podmínek " +
      "odpovídajících nájemní smlouvě uzavřené mezi Poskytovatelem a pronajímatelem. " +
      "Příjemce se zavazuje hradit Poskytovateli podnájemné a poplatky související " +
      "s podnájmem (energie, služby apod.) a složit jistotu (kauci) v rozsahu " +
      "odpovídajícím povinnostem Poskytovatele vůči pronajímateli.</p></li>"
    );
  }
  const c = LEASE_HOLDERS[key];
  return (
    `<li><p>Poskytovatel, případně společnost <strong>${c.name}</strong>, ` +
    `IČO: ${c.ico}, se sídlem ${c.sidlo}, zastoupená jednatelem ${c.jednatel}, ` +
    "která drží nájem k prostorám Provozovny (dále společně jen " +
    "„<strong>Nájemce</strong>“), přenechá Příjemci do podnájmu prostory " +
    "Provozovny v místě sjednaném v čl. I odst. 2 této Smlouvy, a to za podmínek " +
    "odpovídajících nájemní smlouvě uzavřené mezi Nájemcem a pronajímatelem. " +
    "Příjemce se zavazuje hradit Nájemci podnájemné a poplatky související " +
    "s podnájmem (energie, služby apod.) a složit jistotu (kauci) v rozsahu " +
    "odpovídajícím povinnostem Nájemce vůči pronajímateli.</p></li>"
  );
}

// V zapečeném HTML přepíše čl. III odst. 1 na zvolené znění (základ ↔ firma).
// Kotvu (ANCHOR) obsahuje základní i firemní varianta, takže výměna funguje
// oběma směry i mezi firmami. Když kotva chybí (jiná varianta / ručně přepsáno),
// vrací HTML beze změny.
export function applySubleaseClause(
  html: string,
  key: LeaseHolderKey | null,
): string {
  if (!html.includes(ANCHOR)) return html;
  return html.replace(SUBLEASE_LI_RE, buildSubleaseClause(key));
}

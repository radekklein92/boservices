// Sdílené jádro Task Manageru - typy + pure helpery bez Redisu a Reactu, aby
// šlo importovat ze serveru (DB, e-mail, cron) i z klienta (panel, parser).

import {
  TONE_NEUTRAL,
  TONE_WARN,
  TONE_GOOD,
  DOT_NEUTRAL,
  DOT_WARN,
  DOT_GOOD,
} from "./tone";

// ───────────────────────────── Typy ─────────────────────────────

export type TaskStatus = "todo" | "in_progress" | "done";

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface TaskNotification {
  id: string;
  email: string;
  daysBefore: number; // 0 = v den termínu, 1 = den předem, …
}

// Volitelné vazby úkolu na entity portálu. Jeden úkol smí mít navázáno VÍCE
// klientů / lokalit / smluv (pole id).
export interface TaskLinks {
  clientIds: string[];
  locationIds: string[];
  contractIds: string[];
}

// Jeden navázaný odkaz: id (pro proklik na detail) + denormalizovaný popisek.
export interface TaskLinkRef {
  id: string;
  label: string;
}

// Denormalizovaný snímek popisků navázaných entit - ať řádek/panel nemusí
// dotahovat klienta/lokalitu/smlouvu zvlášť. Obnovuje se při uložení úkolu.
export interface TaskLinkLabels {
  clients: TaskLinkRef[];
  locations: TaskLinkRef[];
  contracts: TaskLinkRef[];
}

export interface Task {
  id: string;
  title: string;
  assignee: string; // jméno řešitele (volně, datalist členů týmu)
  requester: string; // jméno zadavatele (volně, datalist členů týmu)
  deadline: string | null; // "YYYY-MM-DD"
  status: TaskStatus;
  body: string | null; // markdown popis
  subtasks: Subtask[];
  notifications: TaskNotification[];
  links: TaskLinks;
  linkLabels: TaskLinkLabels;
  createdBy: string; // e-mail autora
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export const EMPTY_LINKS: TaskLinks = {
  clientIds: [],
  locationIds: [],
  contractIds: [],
};

export const EMPTY_LINK_LABELS: TaskLinkLabels = {
  clients: [],
  locations: [],
  contracts: [],
};

// ─────────────── Backward-compat normalizace vazeb ───────────────
// Starší úkoly mají links jako jednotlivé {clientId, locationId, contractId}
// a linkLabels jako {clientName, locationName, contractNumber}. Při čtení je
// převedeme na pole, ať zbytek kódu řeší jen nový tvar. Po dalším uložení se
// nový tvar zapíše do Redisu.

export function normalizeLinks(raw: unknown): TaskLinks {
  const r = (raw ?? {}) as Record<string, unknown>;
  const toArr = (plural: unknown, single: unknown): string[] => {
    if (Array.isArray(plural)) return plural.filter((x): x is string => !!x);
    return typeof single === "string" && single ? [single] : [];
  };
  return {
    clientIds: toArr(r.clientIds, r.clientId),
    locationIds: toArr(r.locationIds, r.locationId),
    contractIds: toArr(r.contractIds, r.contractId),
  };
}

export function normalizeLinkLabels(
  raw: unknown,
  links: TaskLinks,
): TaskLinkLabels {
  const r = (raw ?? {}) as Record<string, unknown>;
  const toRefs = (
    plural: unknown,
    ids: string[],
    singleLabel: unknown,
  ): TaskLinkRef[] => {
    if (Array.isArray(plural)) {
      return plural.filter(
        (x): x is TaskLinkRef =>
          !!x && typeof x === "object" && typeof (x as TaskLinkRef).id === "string",
      );
    }
    // Starý tvar: jeden popisek odpovídá prvnímu (jedinému) id.
    if (ids.length && typeof singleLabel === "string" && singleLabel) {
      return [{ id: ids[0]!, label: singleLabel }];
    }
    return ids.map((id) => ({ id, label: id }));
  };
  return {
    clients: toRefs(r.clients, links.clientIds, r.clientName),
    locations: toRefs(r.locations, links.locationIds, r.locationName),
    contracts: toRefs(r.contracts, links.contractIds, r.contractNumber),
  };
}

export function normalizeTask(raw: Task): Task {
  const links = normalizeLinks((raw as { links?: unknown }).links);
  return {
    ...raw,
    links,
    linkLabels: normalizeLinkLabels(
      (raw as { linkLabels?: unknown }).linkLabels,
      links,
    ),
  };
}

// ───────────────────────── Status meta ──────────────────────────
// Jen řetězce (žádné React ikony), ať je modul importovatelný i v e-mailu/cronu.
// dot = Tailwind třída (DOT_* z tone.ts), renderuje se přes className.

export const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done"];

export const STATUS_META: Record<
  TaskStatus,
  { label: string; dot: string; chip: string }
> = {
  todo: {
    label: "Nezahájeno",
    dot: DOT_NEUTRAL,
    chip: TONE_NEUTRAL,
  },
  in_progress: {
    label: "Probíhá",
    dot: DOT_WARN,
    chip: TONE_WARN,
  },
  done: {
    label: "Hotovo",
    dot: DOT_GOOD,
    chip: TONE_GOOD,
  },
};

export function isTaskStatus(v: unknown): v is TaskStatus {
  return v === "todo" || v === "in_progress" || v === "done";
}

// ──────────────────────── Unseen tracking ───────────────────────

export type SeenMap = Record<string, string>; // taskId → ISO timestamp

export function isTaskUnseen(task: Task, seen: SeenMap): boolean {
  const at = seen[task.id];
  return !at || task.updatedAt > at;
}

// Počítadlo do nav badge - nepřečtené a zároveň nehotové úkoly.
export function unseenCount(tasks: Task[], seen: SeenMap): number {
  return tasks.filter((t) => t.status !== "done" && isTaskUnseen(t, seen)).length;
}

// ──────────────────────── Termíny ───────────────────────────────

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Den jako "YYYY-MM-DD" z lokálního data (bez UTC posunu).
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Lidský popis termínu + příznaky pro barvu (po termínu / brzy = do 3 dnů).
export function formatDeadline(deadline: string | null): {
  text: string;
  overdue: boolean;
  soon: boolean;
} {
  if (!deadline) return { text: "bez termínu", overdue: false, soon: false };
  const target = new Date(`${deadline}T00:00:00`);
  if (Number.isNaN(target.getTime())) {
    return { text: deadline, overdue: false, soon: false };
  }
  const today = startOfToday();
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  const sameYear = target.getFullYear() === today.getFullYear();
  const dateText = `${target.getDate()}. ${target.getMonth() + 1}.${
    sameYear ? "" : ` ${target.getFullYear()}`
  }`;

  let text = dateText;
  if (diffDays === 0) text = "dnes";
  else if (diffDays === 1) text = "zítra";
  else if (diffDays === -1) text = `včera (${dateText})`;
  else if (diffDays < 0) text = `${dateText} (po termínu)`;

  return {
    text,
    overdue: diffDays < 0,
    soon: diffDays >= 0 && diffDays <= 3,
  };
}

// ──────────────────────── Markdown → HTML ───────────────────────
// Drobný řádkový převod pro náhled v UI i pro e-mail. Záměrně minimální:
// **tučně**, _kurzíva_, ## nadpis, - odrážka, 1. číslovaný seznam.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inlineMarkdown(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^_])_([^_]+)_/g, "$1<em>$2</em>");
}

export function markdownToHtml(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }
    const heading = /^#{1,3}\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      out.push(
        `<p style="font-weight:800;margin:12px 0 4px">${inlineMarkdown(heading[1]!)}</p>`,
      );
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      if (listType !== "ul") {
        closeList();
        out.push('<ul style="margin:6px 0;padding-left:20px">');
        listType = "ul";
      }
      out.push(`<li>${inlineMarkdown(bullet[1]!)}</li>`);
      continue;
    }
    const ordered = /^\d+\.\s+(.*)$/.exec(line);
    if (ordered) {
      if (listType !== "ol") {
        closeList();
        out.push('<ol style="margin:6px 0;padding-left:20px">');
        listType = "ol";
      }
      out.push(`<li>${inlineMarkdown(ordered[1]!)}</li>`);
      continue;
    }
    closeList();
    out.push(`<p style="margin:0 0 8px;line-height:1.55">${inlineMarkdown(line)}</p>`);
  }
  closeList();
  return out.join("");
}

// ───────────────── Parser rychlého přidání (Cmd+K) ──────────────
// Z věty vytáhne řešitele (@jméno proti seznamu členů) a termín (česká data),
// zbytek je název. Příklad: „Zavolat dodavateli @Radek zítra".

const WEEKDAYS: Record<string, number> = {
  // 0 = neděle … 6 = sobota (JS getDay)
  ne: 0, nedele: 0, neděle: 0,
  po: 1, pondeli: 1, pondělí: 1,
  ut: 2, "út": 2, utery: 2, úterý: 2,
  st: 3, streda: 3, středa: 3,
  ct: 4, "čt": 4, ctvrtek: 4, čtvrtek: 4,
  pa: 5, "pá": 5, patek: 5, pátek: 5,
  so: 6, sobota: 6,
};

function nextWeekday(target: number): Date {
  const d = startOfToday();
  let diff = (target - d.getDay() + 7) % 7;
  if (diff === 0) diff = 7; // „pondělí" = příští, ne dnešní
  d.setDate(d.getDate() + diff);
  return d;
}

export function parseQuickAdd(
  input: string,
  memberNames: string[],
): { title: string; assignee: string; deadline: string | null } {
  let text = ` ${input} `;
  let assignee = "";
  let deadline: string | null = null;

  // @řešitel - jeden token za @, řešitele dohledáme proti seznamu členů
  // (např. „@Radek" → „Radek Klein"). Zbytek věty (vč. termínu) zůstane.
  const atMatch = /(^|\s)@(\S+)/.exec(text);
  if (atMatch) {
    const token = atMatch[2]!;
    const lower = token.toLowerCase();
    const member =
      memberNames.find((n) => n.toLowerCase() === lower) ??
      memberNames.find((n) => n.toLowerCase().startsWith(lower)) ??
      memberNames.find((n) => n.toLowerCase().split(/\s+/).includes(lower));
    assignee = member ?? token;
    text = text.replace(`@${token}`, " ");
  }

  const today = startOfToday();
  const setDeadline = (d: Date) => {
    deadline = toISODate(d);
  };

  // „dnes" / „zítra" / „pozítří"
  if (/(^|\s)dnes(\s|$)/i.test(text)) {
    setDeadline(today);
    text = text.replace(/(^|\s)dnes(\s|$)/i, " ");
  } else if (/(^|\s)z[ií]tra(\s|$)/i.test(text)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    setDeadline(d);
    text = text.replace(/(^|\s)z[ií]tra(\s|$)/i, " ");
  } else if (/(^|\s)poz[ií]t[řr][ií](\s|$)/i.test(text)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    setDeadline(d);
    text = text.replace(/(^|\s)poz[ií]t[řr][ií](\s|$)/i, " ");
  }

  // „za N dní/dny/dnů"
  if (!deadline) {
    const rel = /(^|\s)za\s+(\d{1,3})\s+dn(?:y|í|ů|i)(\s|$)/i.exec(text);
    if (rel) {
      const d = new Date(today);
      d.setDate(d.getDate() + parseInt(rel[2]!, 10));
      setDeadline(d);
      text = text.replace(rel[0], " ");
    }
  }

  // Den v týdnu („pondělí", „pá", …)
  if (!deadline) {
    const wd = /(^|\s)(ne(?:děle|dele)?|po(?:ndělí|ndeli)?|út|ut(?:erý|ery)?|st(?:ředa|reda)?|čt|ct(?:vrtek)?|čtvrtek|pá|pa(?:tek)?|pátek|so(?:bota)?)(\s|$)/i.exec(
      text,
    );
    if (wd) {
      const key = wd[2]!
        .toLowerCase()
        .replace("í", "i")
        .replace("ě", "e")
        .replace("ř", "r")
        .replace("á", "a");
      const dayNum = WEEKDAYS[wd[2]!.toLowerCase()] ?? WEEKDAYS[key];
      if (dayNum !== undefined) {
        setDeadline(nextWeekday(dayNum));
        text = text.replace(wd[0], " ");
      }
    }
  }

  // Datum „DD.MM." nebo „DD.MM.YYYY" (i s mezerami)
  if (!deadline) {
    const dm = /(^|\s)(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})?(\s|$)/.exec(text);
    if (dm) {
      const day = parseInt(dm[2]!, 10);
      const month = parseInt(dm[3]!, 10);
      const year = dm[4] ? parseInt(dm[4]!, 10) : today.getFullYear();
      const d = new Date(year, month - 1, day);
      if (!Number.isNaN(d.getTime())) {
        // Bez roku a už po termínu → posuň na příští rok.
        if (!dm[4] && d < today) d.setFullYear(year + 1);
        setDeadline(d);
        text = text.replace(dm[0], " ");
      }
    }
  }

  const title = text.replace(/\s+/g, " ").trim();
  return { title, assignee, deadline };
}

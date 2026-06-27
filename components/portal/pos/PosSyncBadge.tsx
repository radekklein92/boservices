import { getLastSyncCached } from "@/lib/portal/pos/cache";
import { isPosApiConfigured } from "@/lib/portal/pos/api";

// Badge "Aktualizováno HH:MM" z /v1/meta/last-sync. Ukazuje reálnou čerstvost dat
// DW (data se obnovují v 15min cyklu). Tichý no-op, když API není nakonfigurováno
// nebo probe selže.
function fmt(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export async function PosSyncBadge() {
  if (!isPosApiConfigured()) return null;
  let when: string | null = null;
  try {
    const s = await getLastSyncCached();
    when = fmt(s?.last_successful_run_at);
  } catch {
    when = null;
  }
  if (!when) return null;
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-edge bg-paper px-3 py-1.5 text-[11.5px] text-ink-mid">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
      Aktualizováno {when}
    </div>
  );
}

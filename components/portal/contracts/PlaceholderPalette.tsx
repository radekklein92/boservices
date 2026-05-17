"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { PLACEHOLDER_GROUPS } from "@/lib/portal/placeholders";

export function PlaceholderPalette({
  onInsert,
}: {
  onInsert: (token: string) => void;
}) {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PLACEHOLDER_GROUPS;
    return PLACEHOLDER_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((i) =>
        `${i.label} ${i.token} ${i.example}`.toLowerCase().includes(q),
      ),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-mid">
          Placeholdery
        </div>
        <p className="mt-1 text-[11.5px] leading-snug text-ink-mid">
          Kliknutím vložíte token do textu. Při generování smlouvy se nahradí
          daty klienta.
        </p>
      </div>

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-mid"
          strokeWidth={1.5}
        />
        <input
          type="search"
          placeholder="Hledat…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 w-full rounded-md border border-edge bg-paper pl-9 pr-3 text-[12.5px] text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base"
        />
      </div>

      <div className="flex flex-col gap-5">
        {groups.length === 0 ? (
          <div className="text-[12px] text-ink-mid">Nic se neshoduje.</div>
        ) : (
          groups.map((group) => (
            <div key={group.key}>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
                {group.label}
              </div>
              <ul className="flex flex-col gap-1">
                {group.items.map((item) => (
                  <li key={item.token}>
                    <button
                      type="button"
                      onClick={() => onInsert(item.token)}
                      className="group flex w-full flex-col rounded-md border border-transparent px-2.5 py-1.5 text-left transition-colors hover:border-edge hover:bg-paper"
                    >
                      <span className="text-[12.5px] font-medium text-ink-base">
                        {item.label}
                      </span>
                      <code className="mt-0.5 font-mono text-[10.5px] text-ink-mid group-hover:text-ink-deep">
                        {item.token}
                      </code>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

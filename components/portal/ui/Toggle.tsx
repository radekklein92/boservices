"use client";

// Přepínač (switch) ve stylu portálu. ON = černá kolej (bg-ink-base, stejná
// sémantika aktivního stavu jako FilterChip / "Stejné prodejny"), bílý palec.
// A11y přes role="switch" + aria-checked, celý prvek je klikatelný (kolej i
// label). h-9 srovná výšku s FilterChip v řádku.

type ToggleProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  title?: string;
  disabled?: boolean;
};

export function Toggle({ checked, onChange, label, title, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      title={title}
      onClick={() => onChange(!checked)}
      className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-1.5 text-[12.5px] font-medium text-ink-deep transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-base focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:opacity-50"
    >
      <span
        aria-hidden="true"
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-ink-base" : "bg-ink-soft/50"
        }`}
      >
        <span
          className={`absolute left-0.5 h-5 w-5 rounded-full bg-paper shadow-sm transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
      <span className="pr-0.5">{label}</span>
    </button>
  );
}

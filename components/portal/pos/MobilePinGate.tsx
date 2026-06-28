"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LockKeyhole } from "lucide-react";

// PIN brána veřejného mobilního dashboardu. Po úspěchu server nastaví httpOnly cookie
// (zapamatování na zařízení) a my refreshneme RSC - stránka se vykreslí odemčená.
export function MobilePinGate({ token }: { token: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy || pin.length < 4) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/m/${token}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { reason?: string };
      setError(
        data.reason === "locked"
          ? "Příliš mnoho pokusů. Zkuste to za 15 minut."
          : data.reason === "missing"
            ? "Tento odkaz už neplatí."
            : "Nesprávný PIN.",
      );
      setPin("");
    } catch {
      setError("Něco se nepovedlo. Zkuste to znovu.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[100svh] flex-col items-center justify-center px-6 py-10">
      <div className="flex w-full max-w-[320px] flex-col items-center gap-6">
        <span className="grid h-14 w-14 place-items-center rounded-2xl border border-edge bg-paper">
          <LockKeyhole className="h-6 w-6 text-ink-mid" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="text-center">
          <h1 className="text-[1.05rem] font-bold tracking-[-0.01em] text-ink-base">Zadejte PIN</h1>
          <p className="mt-1.5 text-[13px] text-ink-mid">Pro zobrazení dnešních tržeb.</p>
        </div>

        <input
          autoFocus
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          maxLength={6}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, ""));
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="••••"
          aria-label="PIN"
          className="h-14 w-full rounded-2xl border border-edge bg-paper text-center text-[1.6rem] font-bold tracking-[0.5em] text-ink-base outline-none transition-colors focus-visible:border-ink-base"
        />

        {error && <p className="text-center text-[12.5px] font-medium text-rose-600">{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={busy || pin.length < 4}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ink-base text-[14px] font-semibold text-paper transition-opacity disabled:opacity-40"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Odemknout
        </button>
      </div>
    </div>
  );
}

"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { AuthShell } from "@/components/portal/AuthShell";
import { PasswordField, SubmitButton } from "@/components/portal/auth/PasswordField";

type VerifyState =
  | { state: "checking" }
  | { state: "valid"; email: string; kind: "set-password" | "forgot" }
  | { state: "invalid"; reason: string };

function SetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") || "";

  const [verify, setVerify] = useState<VerifyState>({ state: "checking" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!token) {
      setVerify({ state: "invalid", reason: "Chybí token v odkazu." });
      return;
    }
    let alive = true;
    (async () => {
      try {
        const res = await fetch(
          `/api/portal/auth/set-password?token=${encodeURIComponent(token)}`,
        );
        const data = await res.json();
        if (!alive) return;
        if (!data.ok) {
          setVerify({ state: "invalid", reason: data.error || "Odkaz vypršel." });
        } else {
          setVerify({ state: "valid", email: data.email, kind: data.kind });
        }
      } catch {
        if (alive) setVerify({ state: "invalid", reason: "Nepodařilo se ověřit odkaz." });
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Hesla se neshodují.");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/portal/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Něco se pokazilo.");
        setPending(false);
        return;
      }
      const signInRes = await signIn("credentials", {
        email: data.email,
        password,
        redirect: false,
      });
      if (signInRes?.error) {
        router.push("/portal/login?ok=password-set");
        return;
      }
      router.push("/portal");
      router.refresh();
    } catch {
      setError("Něco se pokazilo. Zkuste to znovu.");
      setPending(false);
    }
  }

  if (verify.state === "checking") {
    return (
      <AuthShell eyebrow="Ověřuji odkaz" title="Moment, prosím." />
    );
  }

  if (verify.state === "invalid") {
    return (
      <AuthShell
        eyebrow="Neplatný odkaz"
        title="Tento odkaz už nelze použít."
        lede={verify.reason}
      >
        <div className="flex flex-col gap-3">
          <Link
            href="/portal/forgot"
            className="inline-flex h-12 items-center justify-center rounded-full bg-ink-base px-6 text-[14px] font-semibold text-paper transition-transform active:translate-y-px"
          >
            Požádat o nový odkaz
          </Link>
          <Link
            href="/portal/login"
            className="text-center text-[12px] text-ink-mid transition-colors hover:text-ink-base"
          >
            Zpět na přihlášení
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow={verify.kind === "set-password" ? "První přihlášení" : "Reset hesla"}
      title={verify.kind === "set-password" ? "Nastavte si heslo." : "Nové heslo"}
      lede={
        <>
          {verify.email} · heslo musí mít aspoň 10 znaků, velké i malé písmeno a číslici.
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <PasswordField
          label="Heslo"
          name="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <PasswordField
          label="Heslo znovu"
          name="confirm"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />

        {error && (
          <div role="alert" className="text-[13px] text-ink-deep">
            {error}
          </div>
        )}

        <SubmitButton pending={pending}>
          {pending ? "Ukládám..." : "Uložit heslo a přihlásit"}
        </SubmitButton>
      </form>
    </AuthShell>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense>
      <SetPasswordInner />
    </Suspense>
  );
}

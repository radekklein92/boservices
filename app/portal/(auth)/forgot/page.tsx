"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/portal/AuthShell";
import { TextField, SubmitButton } from "@/components/portal/auth/PasswordField";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      await fetch("/api/portal/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
    } catch {
      // ignore — same response shape pro UI
    }
    setPending(false);
    setSubmitted(true);
  }

  return (
    <AuthShell
      eyebrow="Obnova hesla"
      title={submitted ? "Zkontrolujte schránku." : "Zapomenuté heslo"}
      lede={
        submitted
          ? "Pokud je váš e-mail v systému, dostali jste odkaz pro nastavení nového hesla. Doručení trvá obvykle do minuty."
          : "Pošleme vám e-mailem odkaz pro nastavení nového hesla."
      }
    >
      {submitted ? (
        <div className="flex flex-col gap-5">
          <Link
            href="/portal/login"
            className="inline-flex h-12 items-center justify-center rounded-full border border-edge px-6 text-[14px] font-semibold text-ink-base transition-colors hover:bg-edge-warm"
          >
            Zpět na přihlášení
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          <TextField
            label="E-mail"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <SubmitButton pending={pending}>
            {pending ? "Odesílám..." : "Poslat odkaz"}
          </SubmitButton>
          <Link
            href="/portal/login"
            className="text-center text-[12px] text-ink-mid transition-colors hover:text-ink-base"
          >
            Zpět na přihlášení
          </Link>
        </form>
      )}
    </AuthShell>
  );
}

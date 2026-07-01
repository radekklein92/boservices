"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { AuthShell } from "@/components/portal/AuthShell";
import { TextField, PasswordField, SubmitButton } from "@/components/portal/auth/PasswordField";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  // Jen interní cesta - obrana proti open redirectu (?callbackUrl=//evil.example
  // nebo https://... by po loginu odeslal uživatele na cizí doménu). Musí začínat
  // jedním lomítkem a ne dvěma (//host je protokolově-relativní odkaz ven).
  const rawCallback = params.get("callbackUrl") || "/portal";
  const callbackUrl =
    rawCallback.startsWith("/") && !rawCallback.startsWith("//")
      ? rawCallback
      : "/portal";
  const justSet = params.get("ok") === "password-set";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const res = await signIn("credentials", {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
    });
    setPending(false);
    if (!res || res.error) {
      setError("Špatný e-mail nebo heslo.");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <AuthShell
      eyebrow="Přihlášení"
      title="Vítejte v portálu."
      lede={
        justSet
          ? "Heslo bylo uloženo. Přihlaste se."
          : "Zadejte e-mail a heslo. Pokud heslo zapomenete, můžeme vám poslat odkaz na obnovu."
      }
    >
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
        <PasswordField
          label="Heslo"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <div role="alert" className="text-[13px] text-ink-deep">
            {error}
          </div>
        )}

        <SubmitButton pending={pending}>
          {pending ? "Přihlašuji..." : "Přihlásit"}
        </SubmitButton>

        <Link
          href="/portal/forgot"
          className="text-center text-[12px] text-ink-mid transition-colors hover:text-ink-base"
        >
          Zapomenuté heslo?
        </Link>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}

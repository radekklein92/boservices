"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  error?: string;
};

export function TextField({
  label,
  name,
  type = "text",
  error,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  error?: string;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mid">
        {label}
      </span>
      <input
        type={type}
        name={name}
        aria-invalid={error ? "true" : undefined}
        className={[
          "h-12 w-full rounded-xl border bg-paper px-4 text-[15px] text-ink-base outline-none transition-colors placeholder:text-ink-soft",
          "focus:border-ink-base",
          error ? "border-ink-base" : "border-edge",
        ].join(" ")}
        {...rest}
      />
      {error && <span className="text-[12px] text-ink-deep">{error}</span>}
    </label>
  );
}

export function PasswordField({ label, name, error, ...rest }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mid">
        {label}
      </span>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          name={name}
          aria-invalid={error ? "true" : undefined}
          className={[
            "h-12 w-full rounded-xl border bg-paper px-4 pr-12 text-[15px] text-ink-base outline-none transition-colors placeholder:text-ink-soft",
            "focus:border-ink-base",
            error ? "border-ink-base" : "border-edge",
          ].join(" ")}
          {...rest}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Skrýt heslo" : "Zobrazit heslo"}
          className="absolute inset-y-0 right-0 grid w-12 place-items-center text-ink-mid transition-colors hover:text-ink-base"
        >
          {visible ? <EyeOff className="h-4 w-4" strokeWidth={1.5} /> : <Eye className="h-4 w-4" strokeWidth={1.5} />}
        </button>
      </div>
      {error && <span className="text-[12px] text-ink-deep">{error}</span>}
    </label>
  );
}

export function SubmitButton({
  children,
  pending,
  ...rest
}: InputHTMLAttributes<HTMLButtonElement> & { pending?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="group mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink-base px-6 text-[14px] font-semibold text-paper transition-transform duration-200 active:translate-y-px disabled:opacity-60"
      {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {children}
      {!pending && (
        <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-0.5">
          →
        </span>
      )}
    </button>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";

type FieldErrors = Partial<Record<"name" | "email" | "message", string>>;
type Status = "idle" | "submitting" | "success" | "error";

export function ContactForm() {
  const t = useTranslations("contact.form");
  const locale = useLocale();
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<FieldErrors>({});

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = {
      name: String(fd.get("name") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim(),
      company: String(fd.get("company") ?? "").trim(),
      message: String(fd.get("message") ?? "").trim(),
      locale,
      website: String(fd.get("website") ?? ""),
    };

    const next: FieldErrors = {};
    if (!data.name) next.name = t("errors.name");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
      next.email = t("errors.email");
    if (data.message.length < 2) next.message = t("errors.message");

    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }

    setErrors({});
    setStatus("submitting");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("request failed");
      setStatus("success");
      (e.target as HTMLFormElement).reset();
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div
        role="status"
        className="flex h-full min-h-[420px] flex-col justify-center rounded-[28px] border border-edge bg-paper p-10"
      >
        <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-ink-mid">
          OK
        </div>
        <h3 className="mt-3 text-[1.75rem] font-extrabold tracking-[-0.02em] text-ink-base">
          {t("successTitle")}
        </h3>
        <p className="mt-3 max-w-[44ch] text-[0.985rem] leading-relaxed text-ink-deep">
          {t("successBody")}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="rounded-[28px] border border-edge bg-paper p-7 md:p-10"
    >
      <input
        type="text"
        name="website"
        autoComplete="off"
        tabIndex={-1}
        aria-hidden="true"
        style={{ position: "absolute", left: "-9999px", opacity: 0 }}
      />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field
          label={t("name")}
          name="name"
          placeholder={t("namePlaceholder")}
          error={errors.name}
          required
        />
        <Field
          label={t("email")}
          name="email"
          type="email"
          placeholder={t("emailPlaceholder")}
          error={errors.email}
          required
        />
      </div>

      <div className="mt-5">
        <Field
          label={t("company")}
          name="company"
          placeholder={t("companyPlaceholder")}
        />
      </div>

      <div className="mt-5">
        <TextareaField
          label={t("message")}
          name="message"
          placeholder={t("messagePlaceholder")}
          error={errors.message}
          required
        />
      </div>

      <div className="mt-8 flex items-center justify-between gap-4">
        <button
          type="submit"
          disabled={status === "submitting"}
          className="group inline-flex h-12 items-center gap-2 rounded-full bg-ink-base px-6 text-[14px] font-semibold text-paper transition-transform duration-200 active:translate-y-px disabled:opacity-60"
        >
          {status === "submitting" ? t("submitting") : t("submit")}
          {status !== "submitting" && (
            <span
              aria-hidden="true"
              className="transition-transform duration-300 group-hover:translate-x-0.5"
            >
              →
            </span>
          )}
        </button>

        {status === "error" && (
          <div role="alert" className="text-[12px] leading-snug text-ink-deep">
            <div className="font-semibold">{t("errorTitle")}</div>
            <div className="text-ink-mid">{t("errorBody")}</div>
          </div>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  error,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mid">
        {label}
      </span>
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        required={required}
        aria-invalid={error ? "true" : undefined}
        className={[
          "h-11 w-full rounded-xl border bg-paper-warm/40 px-4 text-[15px] text-ink-base placeholder:text-ink-soft outline-none transition-colors",
          "focus:border-ink-base focus:bg-paper",
          error ? "border-ink-base" : "border-edge",
        ].join(" ")}
      />
      {error && (
        <span className="text-[12px] text-ink-deep">{error}</span>
      )}
    </label>
  );
}

function TextareaField({
  label,
  name,
  placeholder,
  error,
  required,
}: {
  label: string;
  name: string;
  placeholder?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mid">
        {label}
      </span>
      <textarea
        name={name}
        rows={5}
        placeholder={placeholder}
        required={required}
        aria-invalid={error ? "true" : undefined}
        className={[
          "w-full rounded-xl border bg-paper-warm/40 px-4 py-3 text-[15px] leading-relaxed text-ink-base placeholder:text-ink-soft outline-none transition-colors",
          "focus:border-ink-base focus:bg-paper",
          error ? "border-ink-base" : "border-edge",
        ].join(" ")}
      />
      {error && (
        <span className="text-[12px] text-ink-deep">{error}</span>
      )}
    </label>
  );
}

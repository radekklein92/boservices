import { useTranslations } from "next-intl";
import { Logo } from "@/components/brand/Logo";

export function Footer() {
  const t = useTranslations("footer");
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-edge bg-ink-base text-paper">
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-start gap-10 px-5 py-14 md:grid-cols-[1fr_auto_1fr] md:px-8 md:py-16">
        <div className="flex items-center">
          <Logo invert />
        </div>

        <div className="text-center text-[11px] font-medium uppercase tracking-[0.32em] text-paper/55 md:text-[12px]">
          {t("pillars")}
        </div>

        <div className="flex flex-col items-start gap-1 text-[12px] text-paper/60 md:items-end md:text-right">
          <span>{t("copyright", { year })}</span>
          <span>{t("group")}</span>
        </div>
      </div>
    </footer>
  );
}

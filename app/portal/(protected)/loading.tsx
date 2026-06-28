import { SkeletonBlock } from "@/components/portal/shell/Skeleton";

// Dashboard nemá PageHeader (odebrán) - hned hero milestone karta, pak trend graf
// a sekce tržby/pohledávky. Skeleton drží tenhle tvar, ne grid karet.
// Pozn.: tohle je zároveň fallback pro /portal. Všechny ostatní protected stránky
// mají vlastní loading.tsx, takže tenhle (dashboardový) tvar vidí jen dashboard.
export default function Loading() {
  return (
    <div className="flex flex-col gap-8">
      <SkeletonBlock className="h-[420px] rounded-[28px]" />
      <SkeletonBlock className="h-72 rounded-3xl" />
      <SkeletonBlock className="h-44 rounded-3xl" />
    </div>
  );
}

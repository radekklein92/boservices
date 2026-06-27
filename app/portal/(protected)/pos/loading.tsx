import { OverviewSkeleton } from "@/components/portal/pos/skeletons";

// Fallback při přechodu na POS sekci - obsah Přehledu jako skeleton (shell s taby
// a filtrem drží layout). Zabrání prázdné obrazovce během načítání.
export default function Loading() {
  return <OverviewSkeleton />;
}

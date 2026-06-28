import { PageLoadingFallback } from "@/components/portal/shell/Skeleton";

// Detail lokality = hlavička + obsahové bloky (ne list jako zděděný seznam lokalit).
export default function Loading() {
  return <PageLoadingFallback variant="detail" />;
}

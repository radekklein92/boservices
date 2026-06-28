import { redirect } from "next/navigation";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import {
  getRepoSlug,
  getRequestStatus,
  isGithubConfigured,
} from "@/lib/portal/github";
import {
  isDevtoolsEnabled,
  listEditors,
  listRequests,
} from "@/lib/portal/devtools-db";
import { listFeedbackDrafts } from "@/lib/portal/feedback-db";
import { ChangesConsole } from "@/components/portal/admin/ChangesConsole";

export const dynamic = "force-dynamic";
export const metadata = { title: "Změny portálu" };

export default async function ChangesAdminPage() {
  const session = await getSession();
  if (!session?.user?.email) redirect("/portal/login");
  const role = session.user?.role;
  if (!isAdminRole(role)) redirect("/portal");

  const email = session.user.email.toLowerCase();
  const [requests, editors, enabled, feedback] = await Promise.all([
    listRequests(20),
    listEditors(),
    isDevtoolsEnabled(),
    listFeedbackDrafts("pending", 100),
  ]);
  const configured = isGithubConfigured();
  const withStatus = await Promise.all(
    requests.map(async (r) => ({
      ...r,
      live: configured ? await getRequestStatus(r.issueNumber).catch(() => null) : null,
    })),
  );

  return (
    <ChangesConsole
      initialRequests={withStatus}
      initialFeedback={feedback}
      configured={configured}
      enabled={enabled}
      canSubmit={enabled && editors.includes(email)}
      isSuperadmin={role === "superadmin"}
      repoSlug={getRepoSlug()}
    />
  );
}

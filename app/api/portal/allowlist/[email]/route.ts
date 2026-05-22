import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/portal/auth-guard";
import { removeAllowlistEntry } from "@/lib/portal/allowlist-db";
import { bustUsers } from "@/lib/portal/revalidate";

function decodeEmail(raw: string): string {
  try {
    return decodeURIComponent(raw).toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ email: string }> },
) {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  const { email: raw } = await params;
  const email = decodeEmail(raw);

  if (g.session.user?.email === email) {
    return NextResponse.json(
      { ok: false, error: "Sebe ze allowlistu odebrat nelze." },
      { status: 400 },
    );
  }

  await removeAllowlistEntry(email);
  bustUsers();
  return NextResponse.json({ ok: true });
}

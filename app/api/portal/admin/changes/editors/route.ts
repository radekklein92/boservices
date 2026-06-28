import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperadmin } from "@/lib/portal/auth-guard";
import {
  isDevtoolsEnabled,
  listEditors,
  setDevtoolsEnabled,
  setEditors,
} from "@/lib/portal/devtools-db";
import { listUsers } from "@/lib/portal/users-db";

export const dynamic = "force-dynamic";

const schema = z.object({
  editors: z.array(z.string().trim().email()).max(50).optional(),
  enabled: z.boolean().optional(),
});

// Správa Konzole změn: allowlist editorů + kill switch. Jen superadmin.
// adminUsers = nabídka adminů/superadminů, ze kterých se allowlist skládá.
export async function GET() {
  const g = await requireSuperadmin();
  if (!g.ok) return g.response;

  const [editors, enabled, users] = await Promise.all([
    listEditors(),
    isDevtoolsEnabled(),
    listUsers(),
  ]);
  const adminUsers = users
    .filter((u) => u.role === "admin" || u.role === "superadmin")
    .map((u) => ({ email: u.email, name: u.name }));

  return NextResponse.json({ ok: true, editors, enabled, adminUsers });
}

export async function PUT(req: Request) {
  const g = await requireSuperadmin();
  if (!g.ok) return g.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Validation failed" }, { status: 400 });
  }

  if (parsed.data.editors !== undefined) await setEditors(parsed.data.editors);
  if (parsed.data.enabled !== undefined) await setDevtoolsEnabled(parsed.data.enabled);

  const [editors, enabled] = await Promise.all([listEditors(), isDevtoolsEnabled()]);
  return NextResponse.json({ ok: true, editors, enabled });
}

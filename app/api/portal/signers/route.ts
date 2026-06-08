import { NextResponse } from "next/server";
import { requireSession } from "@/lib/portal/auth-guard";
import { cachedListUsers } from "@/lib/portal/cached-db";

// Veřejně-pro-přihlášené endpoint, který vrací jen seznam Podepisujících
// s daty potřebnými pro UI (signer picker modal + signer label).
// Nezveřejňuje role, password hashes, lastLoginAt atd. - na rozdíl od
// /api/portal/users, který je admin-only.
//
// Cache: sdílí cachedListUsers (TAG.users) - po mutaci usera se invaliduje
// stejně jako admin endpoint.

export async function GET(req: Request) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  // ?withPhone=1 (NDA/DigiSign): kdokoliv s vyplněným telefonem, bez ohledu na
  // isSigner - DigiSign telefon vyžaduje. Jinak klasicky jen Podepisující.
  const withPhone = new URL(req.url).searchParams.get("withPhone") === "1";

  const users = await cachedListUsers();
  const signers = users
    .filter((u) =>
      withPhone ? !!u.phone && !!u.phone.trim() : u.isSigner && u.signerFunction,
    )
    .map((u) => ({
      email: u.email,
      name: u.name,
      phone: u.phone,
      signerFunction: u.signerFunction,
      signerDisplayName: u.signerDisplayName,
      signerPoaSubstituteFor: u.signerPoaSubstituteFor,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));

  return NextResponse.json({ ok: true, signers });
}

"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  ASSUME_ROLE_COOKIE,
  ASSUMABLE_ROLES,
} from "@/lib/portal/role-override";
import type { UserRole } from "@/lib/portal/users-db";

// Nastaví (nebo zruší) náhled role. Volá se z přepínače v shellu.
//
// DŮLEŽITÉ: oprávnění čteme z RAW auth() = skutečné role z JWT, NE z
// applyRoleOverride. Kdybychom četli override, po přepnutí na "user" by
// session.user.role byla "user" → kontrola superadmin selže → nešlo by se
// přepnout zpět. Skutečný JWT se náhledem nemění, takže auth() vrací realRole.
export async function setAssumedRole(formData: FormData): Promise<void> {
  const session = await auth();
  if (session?.user?.role !== "superadmin") return;

  const target = String(formData.get("role") ?? "");
  const store = await cookies();

  const isValid = (ASSUMABLE_ROLES as string[]).includes(target);
  if (!isValid || target === "superadmin") {
    // Návrat na vlastní roli = žádný override.
    store.delete(ASSUME_ROLE_COOKIE);
  } else {
    store.set(ASSUME_ROLE_COOKIE, target as UserRole, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  // Celý protected layout přečte cookie znovu → nav i banner se přerenderují.
  revalidatePath("/portal", "layout");
}

// Tvrdé ukončení náhledu (smaže cookie). Používá banner.
export async function clearAssumedRole(): Promise<void> {
  const session = await auth();
  if (session?.user?.role !== "superadmin") return;
  const store = await cookies();
  store.delete(ASSUME_ROLE_COOKIE);
  revalidatePath("/portal", "layout");
}

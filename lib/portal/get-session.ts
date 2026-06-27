import { cache } from "react";
import { auth } from "@/auth";
import { applyRoleOverride } from "@/lib/portal/role-override";

// React.cache zajistí, že v rámci jednoho server requestu se auth() zavolá
// maximálně jednou - i když ji volá víc komponent (layout + page + nested).
// NextAuth v5 auth() není sám o sobě deduplikovaný a každé volání dělá JWT
// dekrypt z cookie. Tady to memoizujeme.
//
// applyRoleOverride navrství náhled rolí (superadmin "view as") - efektivní
// session.user.role pak odpovídá nasazené roli a UI/gating se chová podle ní.
export const getSession = cache(async () => applyRoleOverride(await auth()));

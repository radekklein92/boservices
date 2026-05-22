import { cache } from "react";
import { auth } from "@/auth";

// React.cache zajistí, že v rámci jednoho server requestu se auth() zavolá
// maximálně jednou - i když ji volá víc komponent (layout + page + nested).
// NextAuth v5 auth() není sám o sobě deduplikovaný a každé volání dělá JWT
// dekrypt z cookie. Tady to memoizujeme.
export const getSession = cache(async () => auth());

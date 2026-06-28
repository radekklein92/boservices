import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // `m/` = veřejné mobilní dashboardy (/m/[token]) - mimo i18n, nesmí propadnout do
  // locale. Lomítko drží vyloučení úzké (neomylí cesty jako /marketing).
  matcher: ["/((?!api|portal|m/|_next|_vercel|.*\\..*).*)"],
};

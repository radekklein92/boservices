import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getUser, recordLogin, type UserRole } from "@/lib/portal/users-db";
import { verifyPassword } from "@/lib/portal/passwords";
import { isMaskedAccount, MASKED_ACCOUNT_LABEL } from "@/lib/portal/masked-account";

declare module "next-auth" {
  interface Session {
    user: {
      // Efektivní role - to, čím se řídí UI i gating. Při náhledu rolí
      // (superadmin "view as") je to nasazená role, jinak = realRole.
      role?: UserRole;
      // Skutečná role z JWT (nikdy přepsaná náhledem). Drží oprávnění
      // přepnout náhled zpět.
      realRole?: UserRole;
      // Vyplněná jen když reálně probíhá náhled (assumedRole !== realRole).
      assumedRole?: UserRole;
    } & DefaultSession["user"];
  }
  interface User {
    role?: UserRole;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  pages: {
    signIn: "/portal/login",
    error: "/portal/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7,
  },
  trustHost: true,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Heslo", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await getUser(email);
        if (!user || !user.passwordHash) return null;

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        recordLogin(email).catch((err) =>
          console.error("[auth] recordLogin failed", err),
        );

        return {
          id: user.email,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user && "role" in user && user.role) {
        (token as Record<string, unknown>).role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const role = (token as { role?: UserRole }).role;
        session.user.role = role;
        // realRole = skutečná role z JWT. Náhled rolí ji navrství až později
        // (applyRoleOverride), tady je vždy = skutečná role.
        session.user.realRole = role;
        // Účet majitele zobrazujeme všude anonymně jako "Admin". Maskujeme i tady
        // (nejen v listUsers), ať session.user.name nikdy nenese skutečné jméno -
        // tím se "Admin" propíše do vlastního menu i do všech zápisů, které autora
        // berou z session (zámek/zrušení smlouvy, požadavky na změny, feedback).
        // Platí i pro už vydané JWT (maskuje se při čtení, token se nepřepisuje).
        if (isMaskedAccount(session.user.email)) {
          session.user.name = MASKED_ACCOUNT_LABEL;
        }
      }
      return session;
    },
  },
});

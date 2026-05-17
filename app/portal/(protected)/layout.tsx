import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Sidebar } from "@/components/portal/shell/Sidebar";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/portal/login");
  }

  return (
    <div className="min-h-[100dvh] bg-paper-warm">
      <Sidebar session={session} />
      <main className="px-5 py-10 md:ml-64 md:px-12 md:py-14 lg:px-16 lg:py-16">
        <div className="mx-auto w-full max-w-[1280px]">{children}</div>
      </main>
    </div>
  );
}

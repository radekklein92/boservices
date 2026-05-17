import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Portál",
  robots: { index: false, follow: false },
};

export default function PortalRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-[100dvh] bg-paper-warm">{children}</div>;
}

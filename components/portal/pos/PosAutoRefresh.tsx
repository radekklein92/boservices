"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Klientský auto-refresh pro "Živě": periodicky znovu načte RSC (router.refresh).
// Default 90 s - data DW se stejně mění jen á ~15 min, ale dnešní průběžné
// tržby chceme držet svěží.
export function PosAutoRefresh({ seconds = 90 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), Math.max(30, seconds) * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}

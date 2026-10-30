"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** While P24 has not confirmed yet, reload the server view a few times. */
export function ReturnRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 4000);
    const stop = window.setTimeout(() => window.clearInterval(timer), 60_000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [router]);
  return null;
}

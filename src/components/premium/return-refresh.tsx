"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

import { BrdButton } from "@/components/brand/brd-button";

const FAST_FOR_MS = 60_000;
const STOP_AFTER_MS = 15 * 60_000;

/** While the payment has not confirmed yet: reload the server view (4 s, later 20 s) and offer the check by hand. */
export function ReturnRefresh({ label }: { label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const startedAt = Date.now();
    let timer = 0;
    const schedule = () => {
      const age = Date.now() - startedAt;
      if (age > STOP_AFTER_MS) return;
      timer = window.setTimeout(() => {
        router.refresh();
        schedule();
      }, age < FAST_FOR_MS ? 4000 : 20_000);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [router]);
  return (
    <BrdButton type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())} data-testid="premium-return-check">
      {label}
    </BrdButton>
  );
}

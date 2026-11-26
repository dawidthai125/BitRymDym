"use client";

import { usePathname } from "next/navigation";

import Link from "@/components/ui/app-link";
import { cleanPagePath } from "@/lib/support/support-policy";

/** Footer: "Send feedback" and "Report a bug". The form learns which page the visitor came from. */
export function SupportLinks({ opinion, bug, className }: { opinion: string; bug: string; className: string }) {
  const path = usePathname();
  const page = cleanPagePath(path ?? "");
  const from = page && !page.startsWith("/account/support") ? `&from=${encodeURIComponent(page)}` : "";
  return (
    <>
      <Link href={`/account/support?new=opinion${from}`} prefetch={false} className={className}>{opinion}</Link>
      <Link href={`/account/support?new=bug${from}`} prefetch={false} className={className}>{bug}</Link>
    </>
  );
}

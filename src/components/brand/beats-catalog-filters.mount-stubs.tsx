import type { ReactNode } from "react";

import type { PresentedBeat } from "@/lib/ui/demo-beats";

/** Stub row — no player / audio (keyboard probe must not touch Play). */
export function BeatCatalogRowStub({
  beat,
}: {
  beat: PresentedBeat;
  featured?: boolean;
  className?: string;
}) {
  return (
    <li data-testid="beat-row-stub">
      <span>{beat.title}</span>
    </li>
  );
}

export function NextLinkStub({
  href,
  children,
  ...rest
}: {
  href: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}

/**
 * Test-only stubs for StudioEditToolbar mount harness.
 * Not imported by production routes. No audio / Supabase / network.
 */
import type { ReactNode, AnchorHTMLAttributes } from "react";

/** Replaces `next/link` via esbuild alias. */
export function NextLink({
  href,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}

export default NextLink;

export function forbiddenToolbarAction(name: string): never {
  throw new Error(`mount harness forbids toolbar action: ${name}`);
}

export function noopToolbarChildren(_props?: {
  children?: ReactNode;
}): null {
  void _props;
  return null;
}

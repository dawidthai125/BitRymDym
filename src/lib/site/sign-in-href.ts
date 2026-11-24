import { signInPathWithNext } from "@/lib/auth/next-path";

/** Home and account-access pages: nothing to come back to. */
const NO_RETURN = /^\/(?:en\/?)?$|^\/(?:sign-in|sign-up|forgot-password|resend-confirmation|auth|maintenance)(?:\/|$)/;

/** Sign-in address that brings the visitor back to `path` (pathname + query; /en stays /en). */
export function signInHrefFor(path: string): string {
  const pathname = path.split(/[?#]/)[0] ?? "";
  return NO_RETURN.test(pathname) ? "/sign-in" : signInPathWithNext(path);
}

/** The same for the address in the browser (client only). */
export function currentSignInHref(): string {
  return signInHrefFor(`${window.location.pathname}${window.location.search}`);
}

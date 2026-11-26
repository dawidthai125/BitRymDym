"use client";

import { useEffect } from "react";

import { settingsPathForHash } from "@/lib/account/account-tabs";

/** Old links (also in sent e-mails) such as /account#powiadomienia open the right place in settings. */
export function AccountHashRedirect() {
  useEffect(() => {
    const go = () => {
      const target = settingsPathForHash(window.location.hash);
      if (target) window.location.replace(target);
    };
    go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, []);
  return null;
}

"use client";

import { useEffect } from "react";

import { clearEmailChangeNotice } from "@/lib/auth/email-change-notice-action";

/** Clears the signed notice after the server has rendered it. */
export function ConsumeEmailChangeNotice() {
  useEffect(() => {
    void clearEmailChangeNotice();
  }, []);
  return null;
}

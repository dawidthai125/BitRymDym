"use client";

import { useEffect } from "react";

import { staffDeviceCookie } from "@/lib/analytics/consent";
import { expireAnalyticsCookies, stopAnalyticsOnThisPage } from "@/lib/analytics/ga";

/** Staff opened the panel here: this device is left out of Google Analytics and the entry counter. */
export function MarkStaffDevice() {
  useEffect(() => {
    stopAnalyticsOnThisPage();
    document.cookie = staffDeviceCookie(window.location.protocol === "https:");
    expireAnalyticsCookies();
  }, []);
  return null;
}

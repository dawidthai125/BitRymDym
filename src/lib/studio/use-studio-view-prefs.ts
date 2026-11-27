"use client";

import { useSyncExternalStore } from "react";

import {
  readStudioViewPrefs,
  STUDIO_VIEW_PREFS_DEFAULT,
  subscribeStudioViewPrefs,
  type StudioViewPrefs,
} from "@/lib/studio/studio-grid";

export function useStudioViewPrefs(projectId: string): StudioViewPrefs {
  return useSyncExternalStore(
    subscribeStudioViewPrefs,
    () => readStudioViewPrefs(projectId),
    () => STUDIO_VIEW_PREFS_DEFAULT,
  );
}

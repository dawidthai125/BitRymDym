import type { BitekTakeLevel } from "@/lib/studio/bitek/chat/types";

/**
 * Peak measured on the mic while a take was recording.
 * In-memory on purpose: the record panel writes it and the record-step
 * context builder reads it in the same tab, without editing studio-editor.
 */
const byProject = new Map<string, BitekTakeLevel>();

export function setBitekLiveTakeLevel(projectId: string, level: BitekTakeLevel | null): void {
  if (!level) byProject.delete(projectId);
  else byProject.set(projectId, level);
}

export function readBitekLiveTakeLevel(projectId: string): BitekTakeLevel | null {
  return byProject.get(projectId) ?? null;
}

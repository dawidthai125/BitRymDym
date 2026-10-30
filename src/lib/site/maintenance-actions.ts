"use server";

import { revalidatePath } from "next/cache";

import { AuthError } from "@/lib/auth/session";
import {
  updateSiteMaintenanceSettings,
  type SiteMaintenanceSettings,
  type UpdateSiteMaintenanceInput,
} from "@/lib/site/maintenance-settings";
import { toUserFacingError } from "@/lib/ui/user-errors";

export type SiteMaintenanceActionState = {
  error: string | null;
  success: boolean;
  settings?: SiteMaintenanceSettings;
};

export async function updateSiteMaintenanceAction(
  input: UpdateSiteMaintenanceInput,
): Promise<SiteMaintenanceActionState> {
  try {
    const settings = await updateSiteMaintenanceSettings(input);
    revalidatePath("/", "layout");
    return { error: null, success: true, settings };
  } catch (error) {
    const raw =
      error instanceof AuthError || error instanceof Error
        ? error.message
        : "Nie udało się zapisać trybu prac.";
    return { error: toUserFacingError(raw, "generic"), success: false };
  }
}

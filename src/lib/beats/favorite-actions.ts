"use server";

import { revalidatePath } from "next/cache";

import { AuthError } from "@/lib/auth/session";
import { toggleBeatFavorite } from "@/lib/beats/favorites";

export async function toggleBeatFavoriteAction(
  beatId: string,
): Promise<{ favorited: boolean } | { error: "auth" | "fail" }> {
  try {
    const favorited = await toggleBeatFavorite(beatId);
    revalidatePath("/beats");
    revalidatePath("/library/favorites");
    revalidatePath("/account/favorites");
    revalidatePath("/account");
    return { favorited };
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") {
      return { error: "auth" };
    }
    return { error: "fail" };
  }
}

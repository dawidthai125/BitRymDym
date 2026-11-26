import { redirect } from "next/navigation";

/** Old address: the library now lives in the profile tab. */
export default function LibraryAliasPage() {
  redirect("/account/favorites");
}

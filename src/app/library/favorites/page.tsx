import { redirect } from "next/navigation";

export default function LibraryFavoritesRedirect() {
  redirect("/account/favorites");
}

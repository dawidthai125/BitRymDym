import { redirect } from "next/navigation";

/** IA alias → istniejące Studio (account) do Fali 2. */
export default function StudioAliasPage() {
  redirect("/account");
}

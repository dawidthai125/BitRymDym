import { redirect } from "next/navigation";

/** Old address: settings now live in the profile tab. */
export default function SettingsAliasPage() {
  redirect("/account/settings");
}

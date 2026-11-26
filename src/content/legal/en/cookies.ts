/** English translation of src/content/legal/cookies.ts. The Polish version is binding; keep this file in sync with it. */
import { LEGAL_DATES_EN, PRIVACY_VERSION } from "@/lib/legal/legal-config";

import type { LegalDoc } from "../types";

export const COOKIES_EN: LegalDoc = {
  title: "BitRymDym Cookie Policy",
  version: PRIVACY_VERSION,
  lead: `We store cookies that are necessary for the operation of the Service without asking. We store Google Analytics statistics cookies only with your consent given in the banner. We do not use advertising cookies. You can change your consent at any time with the “Cookie settings” („Ustawienia cookies”) button in the footer. Effective from ${LEGAL_DATES_EN.privacy}`,
  sections: [
    { id: "c1", h: "1. Cookies", blocks: [{ table: { head: ["Name", "Purpose", "Expiry"], rows: [
      ["sb-…-auth-token", "sign-in session (Supabase)", "until sign-out, at most 400 days; without “Keep me signed in” („Nie wylogowuj mnie”) until the browser is closed"],
      ["brd_session_only", "remembers that the “Keep me signed in” box was unticked at sign-in", "until the browser is closed"],
      ["brd_password_recovery", "securing the password reset", "a few minutes"],
      ["brd_email_change", "message after an e-mail change", "a few minutes"],
      ["brd_dl_aid", "download limit without an account (random identifier, no personal data)", "up to 400 days"],
      ["brd_tk_aid", "earlier recordings without an account (random identifier)", "up to 2 hours"],
      ["brd_ref", "referral code from an “Invite a friend” („Zaproś znajomego”) link (code only, no personal data), read when the Account is created", "up to 30 days"],
      ["brd_signup_browser", "completing registration in the same browser after clicking the link in the e-mail", "up to 7 days"],
      ["brd_app", "app-store app mode (android or ios)", "12 hours"],
      ["NEXT_LOCALE", "selected language", "until changed"],
      ["brd_consent", "the remembered decision on statistics cookies", "12 months"],
      ["brd_staff", "only on the Service's staff devices: excludes them from statistics", "12 months"],
    ] } }] },
    { id: "c1a", h: "1a. Statistics cookies (only with consent)", blocks: [
      "After you click “Accept” („Akceptuję”) in the banner, we enable Google Analytics 4 (Google Ireland Ltd.). It is used to count visits and to see which pages are viewed. We also send three events: Account creation, playing a Beat (its title and number) and a purchase (product type and price), without the e-mail, Account number or order number. We do not link this data to the Account, and we do not enable advertising features or Google signals. After you click “Necessary only” („Tylko niezbędne”), Google Analytics does not load. Withdrawing consent deletes these files.",
      "Independently of this, our server counts visits without cookies: it adds 1 to the counter for the given day, page and source (e.g. search engine, social media). We store nothing on your device and we do not record the IP address or any identifier, so the counter cannot be linked to a person.",
      "A YouTube video on a Beat page loads only after you click play, from the youtube-nocookie.com address. Cloudflare Turnstile (protection against bots) runs on sign-in and registration; this is a necessary safeguard.",
      { table: { head: ["Name", "Purpose", "Expiry"], rows: [
        ["_ga", "distinguishing visitors (random identifier)", "up to 2 years"],
        ["_ga_<identifier>", "maintaining the statistics session", "up to 2 years"],
      ] } },
    ] },
    { id: "c2", h: "2. Browser storage", blocks: [
      "These are not cookies. They remain on your device and we do not send them to analytics.",
      { list: [
        "localStorage: light or dark theme; lyrics draft in the Studio; backup BITEK chat history and the state of its window; position of the BITEK window; switch for automatic mix and master; hiding the first steps; settings of the “Mastering only” („Sam mastering”) page; dismissal of the message about a change to the Terms of Service; selected microphone and audio output (device identifier from the browser); headphone and recording latency settings for the device; track layout in the Studio; playback key mode; memory of a recording that has not yet been placed on a track, and of the place where it is to be inserted.",
        "sessionStorage (disappears when the tab is closed): BITEK chat in this tab; a summary of the Plan limits for about a minute; a recording loudness hint passed on to the mix; a marker of an automatic mix or master in progress.",
        "IndexedDB, brd-take-recovery database: chunks of a recording in progress, so that it can be completed after the connection drops. This is not a copy on our server. After the recording is sent or the site data is cleared, this database disappears.",
      ] },
    ] },
    { id: "c3", h: "3. Management", blocks: [
      "You can delete or block cookies, localStorage, sessionStorage and IndexedDB in your browser settings. Without the session cookie, sign-in will not work. Disabling IndexedDB may prevent a recording from being completed after the connection drops. You can change your consent to statistics cookies with the “Cookie settings” („Ustawienia cookies”) button in the footer of the Service.",
    ] },
  ],
};

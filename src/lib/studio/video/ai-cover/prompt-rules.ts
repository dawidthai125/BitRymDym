/**
 * Local prompt rules (PL + EN), run before the Groq safeguard and again on the English
 * rewrite: explicit / sexual, hate & extremist symbols, graphic violence, real people and
 * brands / logos / copyrighted characters. Deliberately broad — false positives only cost
 * the user a re-phrase; the Groq model + Gemini image filter catch the rest.
 */
import { AI_COVER_MESSAGES, AI_COVER_PROMPT_MAX, AI_COVER_PROMPT_MIN } from "./config";

export type PromptRuleCategory = "sexual" | "hate" | "violence" | "real_person" | "logo_brand" | "minors" | "drugs";

/** Lower-case, strip Polish diacritics + leetspeak-ish separators so "n.a.g.a" / "nagą" both match. */
export function normalizePrompt(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/[0@]/g, "o")
    .replace(/[1!]/g, "i")
    .replace(/3/g, "e")
    .replace(/\$/g, "s")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const RULES: [PromptRuleCategory, RegExp][] = [
  ["sexual", /\b(nag[aiey]?|nago|nagosc\w*|golas\w*|rozebran\w*|nud[ea]s?|nudity|naked|topless|porn\w*|sex\w*|seks\w*|erot\w*|hentai|nsfw|xxx|bikini|bielizn\w*|lingerie|piersi|cycki?|cycek|boobs?|tits?|nipples?|sutk\w*|genital\w*|penis\w*|vagin\w*|cipk\w*|kutas\w*|fetysz\w*|fetish\w*|bdsm|onlyfans|striptiz\w*|stripper\w*|orgi\w*|orgy|lubiezn\w*|sensual\w*|seduct\w*|uwodzic\w*)\b/],
  ["minors", /\b(dziec\w*|dzieck\w*|child\w*|kids?|nastolat\w*|teen\w*|loli\w*|underage|nieletni\w*|maloletni\w*)\b.*\b(nag\w*|sex\w*|seks\w*|erot\w*|naked|nude|bikini|sensual\w*)\b|\b(nag\w*|sex\w*|seks\w*|erot\w*|naked|nude)\b.*\b(dziec\w*|child\w*|kids?|nastolat\w*|teen\w*|loli\w*)\b/],
  ["hate", /\b(nazi\w*|hitler\w*|swasty\w*|swastika|hakenkreuz|ss totenkopf|kkk|ku klux|white power|white pride|isis|al qaeda|jihad\w*|dzihad\w*|terroryst\w*|terrorist\w*|zamach\w*|holocaust\w*|holokaust\w*|rasis\w*|racis\w*|bialej rasy|nigg\w*|czarnuch\w*|ped[ao]l\w*|faggot\w*|zyd\w* (won|precz)|sieg heil|celtic cross|krzyz celtycki|14 88|wpierdol\w*)\b/],
  ["violence", /\b(gore|krwaw\w*|bloody|krwawi\w*|zwlok\w*|corpse\w*|trup\w*|dead body|decapitat\w*|dekapitac\w*|odciet\w* glow\w*|mutilat\w*|okalecz\w*|torture\w*|tortur\w*|egzekuc\w*|execution\w*|suicid\w*|samoboj\w*|self harm|samookalecz\w*|rozczlonk\w*|dismember\w*|massacre|masakr\w*|school shooting|strzelanin\w* w szkole)\b/],
  ["drugs", /\b(cocaine|kokain\w*|heroin\w*|heroin|meth|methamphetamine|metamfetamin\w*|amfetamin\w*|crack pipe|strzykawk\w* z narkot\w*|narkotyk\w*)\b/],
  ["logo_brand", /\b(logo\w*|loga|logotyp\w*|trademark\w*|znak towarow\w*|brand\w*|marki|nike|adidas|puma|gucci|louis vuitton|chanel|prada|supreme|balenciaga|coca cola|cocacola|pepsi|mcdonald\w*|iphone|samsung|google|youtube|spotify|tiktok|instagram|facebook|netflix|disney|pixar|marvel|dc comics|batman|superman|spider ?man|spiderman|mickey|myszk\w* miki|pokemon|pikachu|hello kitty|star wars|gwiezdn\w* wojn\w*|harry potter|ferrari|lamborghini|bmw|mercedes\w*|audi|porsche|tesla|red bull|monster energy|playstation|xbox|nintendo|super mario|simpsons?|simpsonow\w*|shrek|minecraft|fortnite|lego)\b/],
  ["real_person", /\b(taylor swift|drake|kanye|ye west|travis scott|eminem|beyonce|rihanna|billie eilish|the weeknd|bad bunny|kendrick lamar|snoop dogg|post malone|ariana grande|justin bieber|dua lipa|elon musk|musk|trump\w*|biden\w*|putin\w*|zelensk\w*|obama|tusk\w*|kaczynsk\w*|andrzej duda|nawrock\w*|papiez\w*|pope|jan pawel|jezus|jesus|allah|mahomet|muhammad|lewandowsk\w*|messi|ronaldo|quebonafide|taco hemingway|sobel|bedoes|white 2115|szpaku|kizo|pezet|young leosia|dawid podsiadlo|sanah|doda|michael jackson|tupac|2pac|biggie|celebryt\w*|celebrit\w*|famous person|slawn\w* osob\w*|prawdziw\w* osob\w*|real person|zdjeci\w* [a-z]+ [a-z]+ski)\b/],
];

export type PromptRuleVerdict =
  | { ok: true; prompt: string }
  | { ok: false; reason: "too_short" | "too_long" | PromptRuleCategory; message: string };

/** Trim, collapse whitespace, length checks, then the keyword rules. */
export function checkPromptRules(raw: unknown): PromptRuleVerdict {
  const prompt = typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "";
  if (prompt.length < AI_COVER_PROMPT_MIN) return { ok: false, reason: "too_short", message: AI_COVER_MESSAGES.promptTooShort };
  if (prompt.length > AI_COVER_PROMPT_MAX) return { ok: false, reason: "too_long", message: AI_COVER_MESSAGES.promptTooLong };
  const hit = matchPromptRule(prompt);
  if (hit) return { ok: false, reason: hit, message: AI_COVER_MESSAGES.promptRejected };
  return { ok: true, prompt };
}

export function matchPromptRule(text: string): PromptRuleCategory | null {
  const n = normalizePrompt(text);
  // "n.a.g.a" / "s e x" → letters joined back.
  const joined = n.replace(/\b([a-z]) (?=[a-z]\b)/g, "$1");
  for (const [cat, re] of RULES) if (re.test(n) || re.test(joined)) return cat;
  return null;
}

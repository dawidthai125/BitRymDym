export type LegalBlock = string | { list: string[] } | { table: { head: string[]; rows: string[][] } };
export type LegalSection = { id: string; h: string; blocks: LegalBlock[] };
export type LegalDoc = { title: string; version: string; lead: string; sections: LegalSection[] };

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { relatedSamples, sampleDescription, sampleMetaTitle, type SampleMetaInput } from "@/lib/seo/sample-meta";
import { isLocalizedPath, stripEnglishPrefix } from "@/lib/seo/locale-paths";

const base: SampleMetaInput = { title: "Gitara arpeggio Em", sampleType: "loop", typeLabel: "pętla", instrumentLabel: "Gitara", bpm: 88, barsLabel: "4 takty", musicalKey: "Em", locale: "pl" };

describe("sample page copy", () => {
  it("is built only from stored facts", () => {
    expect(sampleMetaTitle(base)).toBe("Gitara arpeggio Em — darmowy sampel do rapu: Gitara, 88 BPM");
    expect(sampleDescription(base)[0]).toContain("(pętla, Gitara, 88 BPM, 4 takty, tonacja lub nuta Em)");
    const bare = { ...base, sampleType: null, typeLabel: null, instrumentLabel: null, bpm: null, barsLabel: null, musicalKey: null };
    expect(sampleMetaTitle(bare)).toBe("Gitara arpeggio Em — darmowy sampel do rapu");
    expect(sampleDescription(bare)[0]).not.toContain("(");
    expect(sampleDescription({ ...base, locale: "en" })[1]).toContain("can't be downloaded");
  });
  it("orders related samples and drops the sample itself", () => {
    const s = (id: string, instrument: string, sampleType: string, bpm: number | null) => ({ id, instrument, sampleType, bpm });
    const target = s("a", "guitar", "loop", 88);
    expect(relatedSamples(target, [target, s("b", "kick", "oneshot", null), s("c", "guitar", "loop", 90), s("d", "piano", "loop", 88)]).map((x) => x.id)).toEqual(["c", "d", "b"]);
  });
  it("has an /en address", () => {
    expect(isLocalizedPath("/sampel/7436b665-d2e8-4ab0-b044-0a4692a98452")).toBe(true);
    expect(stripEnglishPrefix("/en/sampel/x")).toBe("/sampel/x");
  });
  it("offers the Studio and no download", () => {
    const page = readFileSync(join(process.cwd(), "src/app/sampel/[id]/page.tsx"), "utf8");
    expect(page).toContain('href="/studio"');
    expect(page).not.toMatch(/\sdownload[=\s>]|\/stream|\/copy|createSignedUrl|object_key/);
  });
});

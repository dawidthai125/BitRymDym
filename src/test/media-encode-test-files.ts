/**
 * Real MP3 encode tests. Excluded from the default Vitest run.
 * Run only via `vitest.media.config.ts` (`npm run test:media`).
 * Exclusion is not a pass.
 */
export const MEDIA_ENCODE_TEST_FILES = [
  "src/lib/audio/e3-6-c-mp3-encode.test.ts",
  "src/lib/audio/e3-7-c-hq-mp3-encode.test.ts",
  "src/lib/beats/preview/beat-preview-encode.test.ts",
] as const;

export const MP3_QC_REJECT_TEST_FILE = "src/lib/audio/mp3-qc-reject.test.ts";

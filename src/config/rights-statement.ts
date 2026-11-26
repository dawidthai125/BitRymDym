/**
 * Version of the rights statement shown before an audio upload ("Importuj wokal", stems, "Sam mastering").
 * Names the exact texts studio.studioRecordingPanel.importPrawa, studio.stemImport.prawa and mastering.prawa
 * (pl + en). Change a text → bump this date (src/lib/rights/upload-screen-policy.test.ts pins the texts).
 * The server refuses an upload session with any other version and stores the version with the statement.
 */
export const UPLOAD_RIGHTS_STATEMENT_VERSION = "2026-11-26";

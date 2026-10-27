# Catalog originals — OD-SC-02 content sniff (2026-10-28)

**Status:** **SHIPPED in repo** · copy E2E **NOT RUN** · Scratch **OUT** · **≠ Product GREEN**  
**GO:** Owner GO 1 = content sniff for Sample Catalog originals  
**Start tip:** `fac551ad795a7ee288eb9a314e2f4859dee4e368` = `origin/main` (`ls-remote`)

## Scope

- Real-file magic-byte sniff on catalog originals (OD-SC-02 fourth gate).
- Reuse existing `sniffAudioContainer` (moved to `src/lib/beats/audio-validation.ts`; backup re-exports).
- Remove `CATALOG_CONTENT_GATE_NOT_IMPLEMENTED`.

**Out:** Scratch DJ UI · Contabo · prod Storage mutate · copy E2E / TAKE write · Sacred / Studio chronione / `SYSTEM_ARCHITECTURE.md`.

## Implementation

| Gate | Result |
|------|--------|
| Declared MIME + 20 MiB + 180 s | unchanged (`validateCatalogOriginalUploadMeta`) |
| Allowlist | `audio/mpeg` · `audio/wav` · `audio/x-wav` · `audio/mp4` · `audio/aac` · **no FLAC** |
| Sniff | WAV `RIFF/WAVE` · MPEG `ID3` / frame · MP4 `ftyp` · AAC ADTS · FLAC `fLaC` rejected |
| Missing / empty / spoof / unsupported | `CATALOG_CONTENT_*` → HTTP **415** |
| Sniff PASS | `COPY_NOT_IMPLEMENTED` → HTTP **501** · dest key **null** · **zero writes** |
| Logs | no raw audio blob logging |

## Tests

```text
npm test -- --run src/lib/catalog/catalog-originals.test.ts src/lib/beats/audio-validation.test.ts src/lib/storage/backup-manifest.test.ts
→ 36/36 PASS
eslint (changed files) PASS
tsc --noEmit PASS
```

## Residual (GO 2)

Copy E2E: load server-held catalog original bytes, sniff, then write private TAKE. Not this GO.

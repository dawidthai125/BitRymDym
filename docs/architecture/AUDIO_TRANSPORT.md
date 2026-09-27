# Audio transport (Platform Beat)

**Status:** Design Freeze **APPROVED** Â· Implementation V1 **CLOSED / PRODUCTION VERIFIED** @ `73e213c`
**SSOT freeze:** [`docs/phases/PHASE_AUDIO_TRANSPORT_DESIGN_FREEZE.md`](../phases/PHASE_AUDIO_TRANSPORT_DESIGN_FREEZE.md)

## Problem

Base64 â†’ Server Action JSON hit Next.js **1 MB** default body limit. Domain **50 MiB** was unreachable in admin UI.

## Solution (V1)

**Signed binary upload** to private `beat-audio` (server AuthZ + server-chosen `object_key`).

```text
session (JSON) â†’ client uploadToSignedUrl â†’ analyze (JSON) â†’ finalize (JSON + BPM policy) â†’ READY
```

BPM Production V1 (`471dd5b`) unchanged: A+B â†’ C_NEAR â†’ RULE B.

## Non-goals

bodySizeLimit-as-fix Â· staging tables Â· new bucket Â· Access Gate redesign Â· community upload.

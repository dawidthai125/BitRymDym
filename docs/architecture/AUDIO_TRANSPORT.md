# Audio transport (Platform Beat)

**Status:** Design Freeze **APPROVED** · Implementation V1 **COMMITTED** · Deploy **PENDING VERCEL**  
**SSOT freeze:** [`docs/phases/PHASE_AUDIO_TRANSPORT_DESIGN_FREEZE.md`](../phases/PHASE_AUDIO_TRANSPORT_DESIGN_FREEZE.md)

## Problem

Base64 → Server Action JSON hit Next.js **1 MB** default body limit. Domain **50 MiB** was unreachable in admin UI.

## Solution (V1)

**Signed binary upload** to private `beat-audio` (server AuthZ + server-chosen `object_key`).

```text
session (JSON) → client uploadToSignedUrl → analyze (JSON) → finalize (JSON + BPM policy) → READY
```

BPM Production V1 (`471dd5b`) unchanged: A+B → C_NEAR → RULE B.

## Non-goals

bodySizeLimit-as-fix · staging tables · new bucket · Access Gate redesign · community upload.

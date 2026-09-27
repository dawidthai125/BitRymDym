# Audio transport

**Status:** Platform V1 **CLOSED / PRODUCTION VERIFIED** @ `73e213c` · Community Wave 2 **IMPLEMENTED** (USER path)
**SSOT freeze:** [`docs/phases/PHASE_AUDIO_TRANSPORT_DESIGN_FREEZE.md`](../phases/PHASE_AUDIO_TRANSPORT_DESIGN_FREEZE.md) · Community: [`PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md`](../phases/PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md)

## Problem

Base64 → Server Action JSON hit Next.js **1 MB** default body limit. Domain **50 MiB** was unreachable.

## Solution (V1 — reused)

**Signed binary upload** to private `beat-audio` (server AuthZ + server-chosen `object_key`).

```text
session (JSON) → client uploadToSignedUrl → analyze (JSON) → finalize (JSON + BPM policy) → READY
```

BPM Production V1 (`471dd5b`) unchanged: A+B → C_NEAR → RULE B.

## Object keys

| Ownership | Key |
|-----------|-----|
| PLATFORM | `platform/{beatId}/{assetId}/{purpose}.bin` |
| USER (Wave 2) | `user/{ownerId}/{beatId}/{assetId}/{purpose}.bin` |

Client never chooses bucket, owner path, beat id, or asset id.

## PLATFORM routes (ADMIN)

- `POST /api/admin/beats/audio/session`
- `POST /api/admin/beats/audio/analyze`
- `finalizePlatformBeatWithMasterAction`

## USER routes (Wave 2)

- `POST /api/beats/audio/session` — existing own USER **DRAFT** only
- `POST /api/beats/audio/analyze`
- `finalizeUserBeatWithMasterAction` — sets MASTER READY; **beat stays DRAFT**

AuthZ: `USER` role + `beats.create` + `owner_id = auth.uid()` + status DRAFT + asset/object-key binding.

## Storage

- Bucket `beat-audio` **private**
- **Storage INSERT = DENY** for authenticated clients
- Mutations via service/admin after AuthZ (signed upload URL only)

## Non-goals (still)

bodySizeLimit-as-fix · new bucket · Access Gate redesign · Wave 3 submit UI

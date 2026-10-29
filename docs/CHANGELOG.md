# Changelog

Wszystkie istotne zmiany dokumentacji i (później) aplikacji.

Format: data, zakres, skrót.

---

## 2026-10-28 — Unit 4 punch/count-in/metro+loop smoke PASS

**Status:** Loop+Metro toggle **PASS** · Count-in/punch UI **widoczne** · REC→Stop→Zachowaj **PASS** (finalize **200** · place **201**) · cleanup DELETE clip **200** · audit [PUNCH_METRO_UNIT4_SMOKE_2026-10-28.md](./audits/PUNCH_METRO_UNIT4_SMOKE_2026-10-28.md) · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** living NEXT unit 4 punch/metro · docs closeout po smoke
**Tip start:** `d25aa29a23a327b1faff98562c644463073e5878` = `origin/main` · kod DAW **`01629f5`** ancestor
**HTTP FACT:** finalize **200** · `record/place` **201** · DELETE clip `ad8e362a-…` **200** · TAKE `507d9cc2-…` · UI długość **19.0 s** (cel 1–3 s — harness delay)
**Explicit non-claim:** ucha metro/count-in **NOT VERIFIED** · punch ON E2E **NOT VERIFIED** · `dpl_*`/alias this tip **NOT VERIFIED** · last verified **`dpl_D5QpniJpUc75A1vBUiiffvqRzo3P`** @ `7438de2` · unit 5 jog = osobne GO · **≠** PRODUCTION VERIFIED · **≠** Product GREEN
**NEXT:** unit 5 jog — osobne GO · nie SFM / nie Contabo / nie OD-15

## 2026-10-28 — P0 unit 2 mix-working apply+restore HTTP PASS

**Status:** mute Wokal apply **200** v64→**65** · restore checkpoint **200** v65→**66** · audit [MIX_WORKING_APPLY_RESTORE_HTTP_2026-10-28.md](./audits/MIX_WORKING_APPLY_RESTORE_HTTP_2026-10-28.md) · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** docs closeout unit 2 (PASS już zmierzony; kod nietknięty)
**Tip start:** `a29fa31c215d03015ec6a1a575f0816a568998b7` = `origin/main` · kod **`5043b5e`** ancestor · HTTP przy tipie unit 1 `60d59a3`
**HTTP FACT:** GET v63 → checkpoint apply unmuted Wokal v63→**64** · mute Wokal v64→**65** · restore `537541b2-…` v65→**66** · końcowy Bit/Wokal unmuted · te same 2 clipy Keep
**Explicit non-claim:** punch/metro/live cue **NOT VERIFIED** · słyszalność miksu **NOT VERIFIED** · `dpl_*`/alias this tip **NOT VERIFIED** · last verified **`dpl_D5QpniJpUc75A1vBUiiffvqRzo3P`** @ `7438de2` · **≠** Mix Working GREEN · **≠** PRODUCTION VERIFIED · **≠** Product GREEN
**NEXT:** unit 4 punch/count-in/metro+loop smoke — nie SFM / nie Contabo / nie OD-15

## 2026-10-28 — SESSION_BRIDGE §4 archive (twentieth batch, room for mix-working HTTP)

**Status:** documentation · archiwizacja 3 najstarszych living `EXECUTED` (`DOCREF-SMOKE-AB` · `SCRATCH-TRACK-DOCREF` · `GO-SB-ARCHIVE-15`) → `### SESSION_BRIDGE archive` · `P-NEXT-10` BLOCKED zachowany

## 2026-10-28 — P0 unit 1 live Play PASS

**Status:** Catalog place + Zatwierdź + live Play **PASS** · PATCH set_scratch **200** · Record został · leftover **0** · projekt `178e902d-…` v63 · AudioContext CDP **NOT VERIFIED** · ucha **NOT VERIFIED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** docs-only zapis P0 unit 1 live Play PASS
**Tip start:** `60d59a39098584e0d9810719e2f6d4f653fcc12d` = `origin/main` · kod **`5043b5e`** ancestor
**Flow:** Catalog place → Record został → Zatwierdź stan → PATCH set_scratch **200** → live Play **PASS**
**Cue:** live = `transport.seek` · bake = `resolveScratchSourceMs` · schedule nie czyta `scratchCueMs`
**Explicit non-claim:** AudioContext CDP **NOT VERIFIED** · ucha Owner **NOT VERIFIED** · `dpl_*` @ `60d59a3` **NOT VERIFIED** this unit · last verified deploy **`dpl_D5QpniJpUc75A1vBUiiffvqRzo3P`** @ `7438de2` ancestor · **≠** PRODUCTION VERIFIED · **≠** Product GREEN
**NEXT:** unit 2 mix-working — nie SFM / nie Contabo / nie OD-15

## 2026-10-28 — Vercel MCP `dpl_*` + alias SHA bind PASS @ `7438de2`

**Status:** Vercel Production **`dpl_D5QpniJpUc75A1vBUiiffvqRzo3P`** **Ready** @ **`7438de2`** · www / apex / `bitrymdym.vercel.app` → ten `dpl_*` · unique `bitrymdym-gclyvcvdj-…` · GH **`7395502484`** **success** `2026-10-28T19:40:20Z` · **DEPLOYMENT VERIFIED** · **ALIAS VERIFIED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** Owner — domknij NOT VERIFIED `dpl_*` / alias www→SHA (MCP auth + FACT bind + docs tip)
**Tip start:** `7438de2763c22a7d7a3fe964527af7b6fb667196` = `origin/main` · kod **`5043b5e`** ancestor · docs bake **`06ffbf0`** ancestor
**MCP:** `plugin-vercel-vercel` auth **PASS** · project `bitrymdym` `prj_efwdGM4YfRC146ft85443tu3xBWB` · team `team_Shg0MetflUcRu6VP37tXEKYK`
**Bind FACT:** `get_alias` www/apex/`bitrymdym.vercel.app` → `dpl_D5QpniJpUc75A1vBUiiffvqRzo3P` · `get_deployment` READY `meta.githubCommitSha`=`7438de2763c22a7d7a3fe964527af7b6fb667196` · created `2026-10-28T19:39:50Z` · ready `2026-10-28T19:40:19Z` · apex **308→www**
**SHA:** vs `7438de2` **MATCH** · vs `06ffbf0` ancestor (`dpl_Dk6auzvVr6qnwfYBt8P8gj5jNDaz` HISTORY) · vs `5043b5e` ancestor (`dpl_Fjj76hZDYq4z7wdptBXezy9nfE3m` HISTORY)
**Explicit non-claim:** **≠** PRODUCTION VERIFIED · **≠** Product GREEN · ucha Owner **NOT VERIFIED** · ten zapis docs po pushu dostanie nowy SHA/`dpl_*` (auto-deploy)
**NEXT:** stop · EXPECT ucha Owner — nie SFM / nie Contabo / nie OD-15

## 2026-10-28 — SESSION_BRIDGE §4 archive (nineteenth batch, room for dpl/alias bind)

**Status:** documentation · archiwizacja 3 najstarszych living `EXECUTED` (`MARKERS-DOCREF` · `BAKE-LISTEN-POLARITY` · `GO-SB-ARCHIVE-14`) → `### SESSION_BRIDGE archive` · `P-NEXT-10` BLOCKED zachowany

## 2026-10-28 — Deploy bind FACT + §7 hygiene (dpl_*/alias NOT VERIFIED)

**Status:** GH Production **`7395335802`** **success** @ **`06ffbf0`** · unique `bitrymdym-k69kchfn9-…` **302 SSO** · kod **`5043b5e`** ancestor exit 0 · www **200** bez SHA · **`dpl_*` NOT VERIFIED** · alias SHA bind **NOT VERIFIED** · HTTP copy/place z UI **PASS** (istniejący SET-SCRATCH-UI + CAT-PLACE-UI; bez nowego smoke) · §7/§5 hygiene · ucha **NOT VERIFIED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** Owner „Robimy według twojej kolejności i propozycji działajcie!”
**Tip start:** `06ffbf0ae83b2974ab37d774eb4b00f191debfef` = `origin/main` · kod **`5043b5e`**
**Bind FACT:** `gh` deployments Production · Vercel commit status success · Vercel CLI ABSENT · unique URL SSO · bez OAuth
**Hygiene:** §7 nie listuje już punch/metro/catalog/Scratch PARTIAL/markers A3 jako blanket OUT · §5 Next Session Entry → living `06ffbf0` / NEXT UNIT
**Explicit non-claim:** `dpl_*` / alias SHA bind **NOT VERIFIED** · ucha Owner **NOT VERIFIED** · **≠** PRODUCTION VERIFIED · **≠** Product GREEN
**NEXT:** stop · EXPECT ucha Owner **albo** `vercel inspect` gdy CLI/token — nie SFM / nie Contabo / nie OD-15

## 2026-10-28 — Scratch bake `--play` polarity + PlaySync PASS (ucho NOT VERIFIED)

**Status:** polarność PCM/header **PASS** · SoundPlayer PlaySync **PLAY PASS** ×4 (exit 0) · ucha Owner **NOT VERIFIED** · temp WAV cleanup · 0 zmian produktu Studio · Contabo/SFM **nietknięte** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** Owner „Daje go pracujcie” — living NEXT bake `--play` ucha
**Tip start:** `7e14a5493586204140e1d15e4598afd78c70d77a` = `origin/main` · kod **`5043b5e`**
**REUSE:** `scripts/_bake-listen-scratch-wav.ts` (już na `main` @ `ad28be2`) · `--play --cleanup` · WAV w `%TEMP%\bitrymdym-bake-listen` · usunięte
**Polarity:** reverse.first=0.999… · last=0.800… · rate2 mid 0.20>0.10 · cue400 first=0.40 · identity first=0 · RIFF/WAVE/16-bit/44.1 kHz/200 ms/35324 B
**Play:** PlaySync exit 0 ×4 (`01-baseline` · `02-reverse` · `03-rate2` · `04-cue400`)
**EXPECT (ucho Ownera):** syntetyczna rampa DC 0→1, clip 200 ms — baseline cisza→wzrost · reverse głośno→spada · rate2 środek 2× · cue400 start ~0.4 · **nie** ton · **nie** prod master
**Explicit non-claim:** ucha Owner **NOT VERIFIED** (agent nie potwierdza głośników) · prod STUDIO_EXPORT **NOT RUN** · **≠** bake Product GREEN
**NEXT:** stop — nie SFM / nie Contabo / nie OD-15

## 2026-10-28 — SESSION_BRIDGE §4 archive (eighteenth batch, room for bake `--play`)

**Status:** documentation · archiwizacja 3 najstarszych living `EXECUTED` (`CAT-PLACE-UI` · `MARKERS-RESMOKE` · `GO-SB-ARCHIVE-13`) → `### SESSION_BRIDGE archive` · `P-NEXT-10` BLOCKED zachowany

## 2026-10-28 — UI Zatwierdź stan → set_scratch → clip-move PASS

**Status:** Owner UI **PASS** · kod **`5043b5e`** · GH **`7394804255`** **success** @ `5043b5e` · unique `bitrymdym-1svy8dp50-…` · leftover **0** · Bit/Wokal Keep OK · projekt `178e902d-…` v50 · **`dpl_*` NOT VERIFIED** · **ALIAS NOT VERIFIED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** docs-only zapis Owner UI Zatwierdź stan → set_scratch → clip-move po lift lastScratchClipId
**Tip start:** `5043b5eea03265b139e810805f9333e28694f95c` = `origin/main`
**Flow:** Catalog place → Record został → Zatwierdź stan → PATCH set_scratch **200** → clip-move **200** bez CAS/F5
**Cleanup:** leftover **0** · Bit/Wokal Keep OK · projekt `178e902d-…` v50
**Explicit non-claim:** `dpl_*` / alias SHA bind **NOT VERIFIED** · **≠** Product GREEN
**NEXT:** stop kolejki ack **albo** Owner bake `--play` ucha — nie SFM / nie Contabo

## 2026-10-28 — Lift lastScratchClipId — Record survives clip select

**Status:** kod **SHIPPED** · vitest **96/96** · UI Catalog→Zatwierdź→set_scratch→move **NOT VERIFIED** · **`dpl_*` NOT VERIFIED** · **ALIAS NOT VERIFIED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** Owner „Go na wszystko” — editor aktywny po audycie debugger 30044945
**Tip start:** `237c12e86ddc2d1d4cf62613fe5a36654efe2254` = `origin/main`
**Root cause:** `keepRecordPanel` na `237c12e` nie wystarcza — `lastScratchClipId` żyło w panelu i ginęło przy unmount; `onSelectClip` zawsze `setInspectorPreferRecord(false)` zrzucał Record
**Code:** helpery w `studio-inspector-context` (preferRecord po keepRecord place + po timeline select gdy sesja); `lastScratchClipId` SSOT w `StudioEditorInner`; panel props value+setter; `onClipCreated`+keepRecord → `preferRecord=true` + id, NIE File; `onSelectClip` przy sesji nie zrzuca Record
**Tests:** `scratch-record-session` (zachowania) + `record-inspector-mount` + `studio-scratch-cas` + `stu-08` + `p7-1-3` + `p7-1-6` + `studio-markers-*` + `pr-v1` → **96/96 PASS**
**Isolation:** editor **+18/−1**; panel **+6/−4**; context **+14**; bez LF-normalize; Sacred / `studio-service` / `SYSTEM_ARCHITECTURE` PRESERVE
**Explicit non-claim:** Owner re-smoke Catalog→Zatwierdź→set_scratch→clip-move **NOT VERIFIED** · **≠** Product GREEN
**NEXT:** re-smoke UI Catalog→Zatwierdź→set_scratch→move — nie SFM / nie Contabo

## 2026-10-28 — SESSION_BRIDGE §4 archive (seventeenth batch, room for lastScratchClipId lift)

**Status:** documentation · archiwizacja 3 najstarszych living `EXECUTED` (`MARKERS-CAS-VER` · `MARKERS-CAS` · `GO-SB-ARCHIVE-12`) → `### SESSION_BRIDGE archive` · `P-NEXT-10` BLOCKED zachowany

## 2026-10-28 — Catalog place keeps Record + onTrackCreated → doc.tracks

**Status:** kod **SHIPPED** · vitest **82/82** · UI „Zatwierdź stan” → clip-move **NOT VERIFIED** · **`dpl_*` NOT VERIFIED** · **ALIAS NOT VERIFIED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** Owner „Go na wszystko” — editor aktywny po Catalog place (Record unmount + brak `onTrackCreated`)
**Tip start:** `3a9bfd8cdc035c2a29a8f26087b6d37518f96db6` = `origin/main`
**Root cause:** `onClipCreated` zawsze `setInspectorPreferRecord(false)` → File + unmount Record → `lastScratchClipId` ginie; `onTrackCreated` niepodpięty → Scratch/Sample poza `doc.tracks`
**Code:** catalog place `keepRecordPanel: true` zostawia Record; `onTrackCreated` → `applyPersistedDoc` `doc.tracks` (REUSE clip/track sort); Keep/place nadal zrzuca Record
**Tests:** `studio-scratch-cas` + `record-inspector-mount` + `stu-08-record-mode-init` + `p7-1-6-autosave-orchestrator` + `studio-markers-*` + `pr-v1-cas-move-delete` → **82/82 PASS**
**Isolation:** editor **+17/−1**; panel **+8/−2**; bez LF-normalize; Sacred / `studio-service` / `SYSTEM_ARCHITECTURE` PRESERVE
**Explicit non-claim:** Owner re-smoke Zatwierdź stan → set_scratch → clip-move **NOT VERIFIED** · **≠** Product GREEN
**NEXT:** re-smoke UI Zatwierdź stan → clip-move — nie SFM / nie Contabo

## 2026-10-28 — Leftover cleanup + set_scratch→move API PASS

**Status:** leftover DELETE Sample `8273aeeb` + Scratch `bced0aa2` **200** · leftover **false** · Bit/Wokal Keep OK · projekt v27 · set_scratch→move API **PASS** (place TAKE → PATCH reverse true → clip-move bez CAS) · UI „Zatwierdź stan” **NOT VERIFIED** (`lastScratchClipId` / catalog 0) · **`dpl_*` NOT VERIFIED** · **ALIAS NOT VERIFIED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** docs-only closeout leftover cleanup + set_scratch→move API
**Tip start:** `4187ad31cdfde26866e7c6f41ba0a789c51774d3` = `origin/main`
**Cleanup:** DELETE Sample `8273aeeb` + Scratch `bced0aa2` HTTP **200** · leftover **false** · Bit/Wokal Keep OK
**API:** place TAKE na Scratch → PATCH reverse true → clip-move bez CAS (API/fetch)
**Explicit non-claim:** UI „Zatwierdź stan” **NOT VERIFIED** · GH/`dpl_*`/alias **NOT VERIFIED** · **≠** Product GREEN
**NEXT:** UI Zatwierdź stan → clip-move (seed catalog) **albo** stop kolejki ack — nie SFM / nie Contabo

## 2026-10-28 — SESSION_BRIDGE §4 archive (sixteenth batch, room for leftover + set_scratch API)

**Status:** documentation · archiwizacja 3 najstarszych living `EXECUTED` (`KEEP-SMOKE` · `DAW-QUEUE` · `GO-SB-ARCHIVE-11`) → `### SESSION_BRIDGE archive` · `P-NEXT-10` BLOCKED zachowany

## 2026-10-28 — Owner documentVersion A+B smoke PASS

**Status:** Owner A+B **PASS** · kod **`56c7f2f`** · GH **`7381694008`** **success** @ `56c7f2f` · unique `bitrymdym-gj9vss7k6-…` · ancestor GH **`7381581476`** **success** @ `1f8f776` · set_scratch→move **NOT VERIFIED** · **`dpl_*` NOT VERIFIED** · **ALIAS NOT VERIFIED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** docs-only zapis Owner smoke documentVersion po Scratch/track docRef
**Flow A:** marker → clip-move **PASS** (v17→18 marker, move expected 18→v19) bez CAS
**Flow B:** Sample create → clip-move **PASS** (track→v20, move expected 20→v21) bez CAS
**Cleanup:** markers n=0 v22 · Keep TAKE start 2ms · BEAT_REF OK
**Leftover:** puste ścieżki Scratch `bced0aa2` + Sample `8273aeeb` (opcjonalny cleanup)
**Tip start:** `56c7f2f4c1583341c289cdf58dbd168994cd5f43` = `origin/main`
**NEXT:** set_scratch zatwierdź → clip-move **albo** cleanup pustych tracków **albo** stop kolejki ack — nie SFM / nie Contabo

## 2026-10-28 — Scratch persist + create-track ack editor docRef

**Status:** kod **SHIPPED** · Owner Scratch→clip-move / track→clip-move **NOT VERIFIED** · **`dpl_*` NOT VERIFIED** · **ALIAS NOT VERIFIED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** Owner „pracuj dalej” — residual po `1f8f776` (Scratch / SAMPLE|SCRATCH create ackowały tylko tip)
**Tip start:** `1f8f77669262ddf1f3ef985e6c81906234211696` = `origin/main`
**Code:** recording `addProductTrack` + `set_scratch` wołają ten sam `ackDocumentVersion` → `onDocumentVersionAck` / `applyAckedDocumentVersion` → `applyPersistedDoc` (REUSE markerów; editor nietknięty)
**Tests:** `studio-scratch-cas` + `studio-markers-cas` + `studio-markers-state` + `p7-1-6-autosave-orchestrator` + `stu-08-record-mode-init` + `pr-v1-cas-move-delete` → **79/79 PASS**
**Isolation:** recording-panel **+3/−4**; bez LF-normalize; Sacred / `studio-service` / `SYSTEM_ARCHITECTURE` PRESERVE
**Explicit non-claim:** Owner smoke Scratch→move / track→move **NOT VERIFIED** · Keep/place/catalog nadal ackują tip + `onClipCreated` · **≠** Product GREEN
**NEXT:** Owner smoke: Scratch zatwierdź → clip-move **albo** Dodaj Sample/Scratch → clip-move bez F5

## 2026-10-28 — SESSION_BRIDGE §4 archive (fifteenth batch, room for Scratch/track docRef)

**Status:** documentation · archiwizacja 3 najstarszych living `EXECUTED` (`KEEP-UX-B` · `GIT-CLOSEOUT-PLACE` · `USER-COPY`) → `### SESSION_BRIDGE archive` · `P-NEXT-10` BLOCKED zachowany

## 2026-10-28 — Studio markers editor docRef sync (clip-move CAS)

**Status:** kod **SHIPPED** · Owner marker→clip-move re-smoke **NOT VERIFIED** · **`dpl_*` NOT VERIFIED** · **ALIAS NOT VERIFIED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** Owner „Go na wszystko” — odblokowany `studio-editor.tsx` wyłącznie pod sync `documentVersion`
**Tip start:** `ad28be2c2561e35645f5896c04eff186b5cdafe2` = `origin/main`
**Code:** `advanceStudioPersistDocumentVersion` + editor `applyAckedDocumentVersion` → `applyPersistedDoc` · recording `ackDocumentVersion` woła parent po tip ack
**Tests:** `studio-markers-cas` + `studio-markers-state` + `p7-1-6-autosave-orchestrator` + `stu-08-record-mode-init` + `pr-v1-cas-move-delete` → **71/71 PASS**
**Isolation:** editor dirty **CLEAN** vs HEAD; diff **+21** linii; bez LF-normalize
**Explicit non-claim:** Owner re-smoke marker → drag/nudge **NOT VERIFIED** · Scratch/track-create ack→docRef **poza** tym unitem · **≠** Product GREEN
**NEXT:** Owner re-smoke: marker → clip-move bez F5

## 2026-10-28 — Scratch bake listen polarity PASS (ucho NOT VERIFIED)

**Status:** polarność PCM/header **PASS** · SoundPlayer PlaySync **PLAY PASS** ×4 · ucha Owner **NOT VERIFIED** · 0 zmian produktu Studio · Contabo/SFM **nietknięte** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** closeout bake listen dump — path-scoped skrypt + docs tip
**Tip start:** `aacaada` = `origin/main` · kod **`fadb2b0`**
**Skrypt:** `scripts/_bake-listen-scratch-wav.ts` · REUSE `renderStudioDocumentOffline` + `encodeWavFromBake` · dump baseline/reverse/rate2/cue400
**Explicit non-claim:** ucha Owner **NOT VERIFIED** · prod STUDIO_EXPORT **NOT RUN** · **≠** bake Product GREEN
**NEXT:** residual markers clip-move CAS **albo** Owner `--play` ucha — nie SFM / nie Contabo

## 2026-10-28 — SESSION_BRIDGE §4 archive (fourteenth batch, room for bake listen)

**Status:** documentation · archiwizacja 3 najstarszych living `EXECUTED` (`GO-SB-ARCHIVE-10` · `GIT-CLOSEOUT` · `GO-SB-ARCHIVE-9`) → `### SESSION_BRIDGE archive` · `P-NEXT-10` BLOCKED zachowany

## 2026-10-28 — Catalog→place Owner UI smoke PASS + cleanup

**Status:** Owner UI place **PASS** · leftover catalog/take/clip/XP **0** · HTTP copy/place z UI **NOT VERIFIED** · Play **NOT VERIFIED** · **`dpl_*` NOT VERIFIED** · **ALIAS NOT VERIFIED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** docs-only zapis Catalog→place Owner UI po markerach re-smoke
**Sesja:** Dawid · projekt `178e902d-6ecf-4ef6-910c-d85612bb277c` v16
**Seed:** `d5c79f2a-15a8-4c43-8fa1-5564ddb646b5` PUBLISHED license_allows_copy
**Flow:** Kopiuj i umieść na playhead → Gotowe · clip TAKE `d525d69b-18df-4e51-8dc7-7229b8579c3a` 1s na Wokal · take `49bb2d34-…` · DELETE clip HTTP 200
**Zachowane:** BEAT_REF `2f06a6b2` · Keep `af9bd5aa`
**REUSE:** `scripts/_catalog-place-user-e2e.mjs` · 0 zmian kodu
**Tip start:** `49c2036` = `origin/main` · kod **`fadb2b0`**
**NEXT:** Scratch bake listen / STUDIO_EXPORT PARTIAL verify — nie SFM / nie Contabo / nie OD-15 / nie LF-normalize dirty editor

## 2026-10-28 — Owner re-smoke markerów PASS (dwie mutacje bez F5)

**Status:** Owner re-smoke **PASS** · kod **`fadb2b0`** · docs tip start **`30a9bc2`** · **`dpl_*` NOT VERIFIED** · **ALIAS NOT VERIFIED** · seek/ucho **NOT VERIFIED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** docs-only zapis Owner re-smoke po stale-version fix
**Sesja:** Dawid · projekt `178e902d-6ecf-4ef6-910c-d85612bb277c`
**Flow:** Dodaj zwrotkę → Dodaj refren PATCH **200** v11→v12 (bez F5) · cleanup Usuń→Usuń do n=0 v14
**Deploy:** GitHub Production **`7381109228`** **success** @ `30a9bc2` · **`7381095797`** **success** @ `fadb2b0`
**Residual:** clip-move po markerze może CAS (`studio-editor` nietknięty)
**NEXT:** Catalog→place Owner UI smoke **albo** bake listen — nie SFM / nie Contabo

## 2026-10-28 — SESSION_BRIDGE §4 archive (thirteenth batch, room for markers re-smoke)

**Status:** documentation · archiwizacja 3 najstarszych living `EXECUTED` (`MIX-A3.5-ENC` · `SCRATCH-PERSIST` · `GO-SB-ARCHIVE-8`) → `### SESSION_BRIDGE archive` · `P-NEXT-10` BLOCKED zachowany

## 2026-10-28 — Studio markers stale CAS documentVersion (sequential mutations)

**Status:** kod **SHIPPED** @ `fadb2b0…` · Owner re-smoke dwóch mutacji **NOT VERIFIED** · **`dpl_*` NOT VERIFIED** · **ALIAS NOT VERIFIED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** Owner smoke PARTIAL — pierwsza mutacja PASS, druga CAS fail bez F5
**Tip start:** `7dc3db4033e68b52e6c8cf055b8633d99dd4b941` = `origin/main`
**Code:** `fadb2b0eeb13f6681778e37f57d6d2c97dbcaccf` — `createStudioPersistVersionTip` · panel + recording chrome ack PATCH `documentVersion`
**Tests:** `studio-markers-state` + `studio-markers-cas` → **10/10 PASS**
**Explicit non-claim:** Owner re-smoke **NOT VERIFIED** · editor `docRef` applyPersistedDoc **poza** allowlistą · **≠** markers Product GREEN
**NEXT:** Owner re-smoke dwóch mutacji markerów bez F5

## 2026-10-28 — Studio markers A3/P7 lite (CAS + Inspector)

**Status:** kod **SHIPPED** @ `9fc7f6e…` · schema MCP **APPLIED** · Owner Inspector klik **NOT VERIFIED** · **`dpl_*` NOT VERIFIED** · **ALIAS NOT VERIFIED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** follow-up po vertical slice markerów (path-scoped commit+push+apply)
**Tip start:** `2fb71a90547f12c2ca261727b580b601e38b46ac` = `origin/main`
**Code:** `9fc7f6e21a202531114adfbde6f932acaf2e102b` — freeze A3/P7 lite · `markers` jsonb · `studio_cas_apply_markers` · `StudioMarkersPanel` w recording Inspector · domena `studio-markers-state` / persist / API
**Migration:** MCP `apply_migration` name `studio_markers_cas` · history **`20261028084022`** · project **`rzzxrgcdogkybkiidqgw`** · drift vs repo `20261028140000` — **nie** repair · **nie** `db push`
**Tests:** `studio-markers-state` + `studio-markers-cas` → **7/7 PASS**
**Deploy:** GitHub Production **`7380825799`** **success** `2026-10-28T08:40:58Z` @ `9fc7f6e` · unique `bitrymdym-hr1sncghm-…` · Vercel commit **success**
**Explicit non-claim:** Owner UI verse/hook **NOT VERIFIED** · **≠** markers Product GREEN
**NEXT:** Owner klik markerów w Inspector Studio

## 2026-10-28 — SESSION_BRIDGE §4 archive (twelfth batch, room for markers)

**Status:** documentation · archiwizacja 3 najstarszych living `EXECUTED` (`SCRATCH-CAS-REV` · `ALIAS-DPL` · `GO-SB-ARCHIVE-7`) → `### SESSION_BRIDGE archive` · `P-NEXT-10` BLOCKED zachowany

## 2026-10-28 — www Metro/Loop Play + TAKE listen (AudioContext)

**Status:** AudioContext **running PASS** · TAKE ścieżka odtwarzania **PASS** · ucha **NOT VERIFIED** · loop wrap **NOT VERIFIED** · `dpl_*` **NOT VERIFIED** · alias SHA bind **NOT VERIFIED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** Owner „Go pracujcie wszyscy” = NEXT po www metro chrome
**Tip living:** `c52f38c47d830bd17cae30ce7445f59827335dfc` = `origin/main` · kod **`01629f5`** ancestor
**Deploy:** GitHub Production **`7380550674`** **success** `2026-10-28T08:25:35Z` @ `c52f38c` · unique `bitrymdym-j7wf3q5lf-…`
**Play:** Loop+Metro **on** · Bit muted · Master **0.0 dB** · `AudioContext` **running** 48 kHz · playhead **00:09.192** · Stop
**TAKE:** waveform **00:00–00:18** · take `0ffb274a-…` · signed `take-audio/…/mic.bin` · **≠ błąd** · ucha **NOT VERIFIED**
**Audit:** [WWW_METRO_LOOP_LISTEN_2026-10-28.md](./audits/WWW_METRO_LOOP_LISTEN_2026-10-28.md)
**NEXT:** markery vertical slice (schema+CAS) **albo** Owner ear confirm klik/wokal

## 2026-10-28 — www Loop/Metronom chrome runtime (alias vs tip)

**Status:** chrome **PASS** · `dpl_*` **NOT VERIFIED** · alias SHA bind **NOT VERIFIED** · słyszalność **NOT VERIFIED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** Owner — living tip DAW (metro/loop) na aliasie www
**Tip living:** `c3b80636622316b999ffbeece33c46274d6357c6` = `origin/main` · kod **`01629f5`** ancestor
**Deploy:** GitHub Production **`7380377160`** **success** `2026-10-28T08:15:37Z` @ `c3b8063` · unique `bitrymdym-6m0t2jn31-…` **302 SSO** · Vercel commit **success**
**www UI:** `/studio/p/178e902d-…` Loop **„Włącz loop regionu”** / Metro **„Metronom — klik runtime”** · `disabled=false` · toggle **PASS** · **0** „niedostępne”
**Diagnoza Keep smoke:** „niedostępne w tej wersji Studio” = alias/cache lag (HISTORY), **nie** leftover OD-VS-01 disabled
**Fix kodu:** nie
**Audit:** [WWW_METRO_LOOP_ALIAS_2026-10-28.md](./audits/WWW_METRO_LOOP_ALIAS_2026-10-28.md)
**NEXT:** słyszalny metronom/loop (Play — osobny GO egress) **albo** Owner listen clipu TAKE — **superseded** przez listen unit (AudioContext PASS; ucha NOT VERIFIED)

## 2026-10-28 — Keep smoke PASS (sesja Dawida, Stop→Zachowaj→clip)

**Status:** Keep smoke **PASS** · **`dpl_*` NOT VERIFIED** · **ALIAS NOT VERIFIED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** Owner „ty zrob test” w Cursor Browser
**Tip start:** `26db6343416c0f13c7ac22e24393529a0301794c` = `origin/main`
**Projekt:** `178e902d-6ecf-4ef6-910c-d85612bb277c` · Wokal armed · mic **granted**
**Flow:** ● Nagraj → ■ Stop → „Nagranie gotowe — kliknij Zachowaj…” → **✓ Zachowaj**
**Clip:** TAKE `00:00.000–00:18.000` na Wokal
**Network:** `POST …/record/place` **201** · `POST /api/takes/finalize` **200**
**Egress:** Master 0.0 dB · Odtwórz **nie** kliknięte
**Limit:** take 18 s (nie 1–3 s) — opóźnienie snapshotu w RECORDING
**Audit:** [KEEP_SMOKE_DAWID_2026-10-28.md](./audits/KEEP_SMOKE_DAWID_2026-10-28.md)
**NEXT:** słyszalny metronom/loop **albo** Owner listen clipu (nie odtwarzane w tym teście)

## 2026-10-28 — Studio vs DAW queue P0–P1 (punch/metro/loop/monitor/lanes)

**Status:** kod **SHIPPED** · Keep smoke **PARTIAL** · Scratch listen/BPM-grid **PARTIAL/OUT** · Markery CAS **OUT** · **`dpl_*` NOT VERIFIED** · **ALIAS NOT VERIFIED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** Owner „Tak róbcie wszystko daje GO na całą kolejkę”
**Tip start:** `6c97ef85db39fb91b25139f8ec5ce70087e61885`
**Code:** `01629f531c82bdf66c8019c90f5597597586bf1b` · **Docs:** `3166ae286647242dfe444e47f028532783d45e71`
**IN:** count-in + punch 1 track · metronom click (BufferSource, ten sam context) · loop wrap na clock · suchy monitor + ostrzeżenie echo · Zastąp MUST overlapping TAKE · OD-VS-01 amended
**OUT:** Sacred · auto-place po Stop · piano roll / VST / multi-track REC · P6 automation · SFM · markery persist CAS (brak schematu) · Scratch BPM/grid
**Tests:** daw-clock + p5-6 + visual-shell/parity + p5-2/5/8/10 + vocal-import + scratch-place + WAV fixture → **132 PASS**
**Keep smoke:** sesja Dawida / projekt `178e902d-…` / Wokal armed / Record panel · Zachowaj niewidoczny (0 READY) · Play/Nagraj nie kliknięte
**Audit:** [STUDIO_DAW_QUEUE_P0_P2_2026-10-28.md](./audits/STUDIO_DAW_QUEUE_P0_P2_2026-10-28.md)
**NEXT:** Owner device Stop→Zachowaj→clip **albo** słyszalny metronom/loop

## 2026-10-28 — SESSION_BRIDGE §4 archive (eleventh batch, room for DAW queue)

**Status:** documentation · archiwizacja 3 najstarszych living `EXECUTED` (`STUDIO-C` · `STUDIO-A` · `GO-SB-ARCHIVE-6`) → `### SESSION_BRIDGE archive` · `P-NEXT-10` BLOCKED zachowany

## 2026-10-28 — Studio Keep Take UX po Stop (P5.6 bez auto-place)

**Status:** kod **SHIPPED** · kontrakt P5.6 **PASS** · Owner device **NOT VERIFIED** · **`dpl_*` NOT VERIFIED** · **ALIAS NOT VERIFIED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** Owner GO B — Stop = finalize only; UX ma wskazać **Zachowaj**
**Tip start:** `f4e6b4a1ef45967fac6d1485d9d07d0be4673d23` = `origin/main` (żywy Git)
**Zmiana:** `studio-recording-panel.tsx` — blok „Nagranie gotowe / ✓ Zachowaj” nad Katalog/Scratch/Sample; status „Nagranie gotowe — kliknij Zachowaj, żeby wstawić na ścieżkę.”; `scrollIntoView` na `aria-label="Studio Take Workflow"` po READY_TAKE
**P5.6:** `stopAndFinalize` nadal **bez** `record/place` / `placeReadyTakeOnTimeline`
**Tests:** `p5-6-take-workflow` + vocal-import + stu-08 + p5-5 → **61/61 PASS**
**Code:** `028cc5eb1ad440941b279a0635da25af983494ee`
**Deploy:** GitHub Production **`7379926192`** **success** `2026-10-28T07:47:24Z` @ `028cc5e` · unique `bitrymdym-5akcwnnni-…` · **`dpl_*` NOT VERIFIED** · **ALIAS NOT VERIFIED**
**Explicit non-claim:** live rec/mic **NOT RUN** · OD-15 **OPEN**
**NEXT:** Owner sprawdza Stop → widoczny Zachowaj → ręczne umieszczenie na ścieżce

## 2026-10-28 — Catalog place E2E + Scratch export WAV fixture

**Status:** place E2E **PASS** + leftover **0** · WAV header fixture **PASS** · Owner listen **NOT VERIFIED** · **`dpl_*` NOT VERIFIED** · **ALIAS NOT VERIFIED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** Owner — kolejność catalog→place, potem STUDIO_EXPORT fixture
**Tip start:** `d9739578d4f101dbb7d3d157a26f93127da88cb6` = `origin/main` (zweryfikowane przed tym unitem)
**Test:** `da2a48fa39360ba189601db830a647f9b7d205b3` · `encodes approved Scratch bake to WAV with RIFF/WAVE duration`
**Place:** `POST /api/catalog/copy` HTTP **200** · `POST …/record/place` HTTP **201** clip `5af7df51-…` TAKE · cleanup leftover **0** · projekt Dawida zachowany
**Explicit non-claim:** prod STUDIO_EXPORT job **NOT RUN** · Owner device listen **NOT VERIFIED** · one-off `scripts/_catalog-place-user-e2e.mjs` **nie** w commicie
**Audit:** [SCRATCH_CATALOG_PLACE_EXPORT_2026-10-28.md](./audits/SCRATCH_CATALOG_PLACE_EXPORT_2026-10-28.md)
**NEXT:** LF-normalize dirty editor history wiring **albo** UI catalog place **albo** Owner listen lokalnego WAV

## 2026-10-28 — Prod USER catalog copy E2E + cleanup

**Status:** copy runtime **PASS** · cleanup **done** · **`dpl_*` NOT VERIFIED** · **ALIAS NOT VERIFIED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** Owner — sesja Dawida w Cursor Browser jako test USER
**Tip:** `5b2fcebf79e559f7336d26d3018bddcb6180ed29` = `origin/main` (`ls-remote`)
**Copy:** `POST /api/catalog/copy` HTTP **200** · take `0b46506e-bf35-4e3b-a069-fa18d9f01b58` · `READY` · object `user/{dawid}/takes/{take}/mic.bin` · fixture WAV **16044** B
**Cleanup:** Storage catalog+take **0** · `catalog_assets` **0** · take **0** · XP probe `TAKE_READY` **0**
**GitHub Production:** **`7379526025`** **success** `2026-10-28T07:21:22Z` @ `5b2fceb` · unique `bitrymdym-3lsi0b9do-…`
**Audit:** [CATALOG_COPY_USER_E2E_2026-10-28.md](./audits/CATALOG_COPY_USER_E2E_2026-10-28.md)
**NEXT:** Scratch place **albo** słyszalny export **albo** LF-normalize editor — osobne GO

## 2026-10-28 — SESSION_BRIDGE §4 archive (tenth batch, room for USER copy E2E)

**Status:** documentation · archiwizacja 3 najstarszych living `EXECUTED` (`CAT-COPY` · `CAT-SNIFF` · `CAT-PROBE`) → `### SESSION_BRIDGE archive` · `P-NEXT-10` BLOCKED zachowany

## 2026-10-28 — SESSION_BRIDGE §4 archive (ninth batch, room for history wiring + scratch verify)

**Status:** documentation · archiwizacja 3 najstarszych living `EXECUTED` (`CAT-APPLY` · `GATE-C` · `GATE-B`) → `### SESSION_BRIDGE archive` · `P-NEXT-10` + `USER-COPY` BLOCKED zachowane

## 2026-10-28 — Mix Working A3.5 restore + Scratch export encode

**Status:** A **SHIPPED** · B **PARTIAL** · C **BLOCKED** · **`dpl_*` NOT VERIFIED** · **ALIAS NOT VERIFIED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** Owner trzy tropy naraz (A mix-working · B export encode · C USER copy)
**Tip start:** `41668c00b41acceb022c03f3b914716016ee8f67` · code **`fdd9e8fa8e2779bac2976d676b5a3faf217d7b0b`**
**A:** A3.5 hunks na cienki `studio-service` (track/master mix + FX → `applyStudioMixWorkingOpsFor`). Persist Scratch **nietknięty**. Dirty editor **nie stage’owany**.
**A schema:** MCP apply history `20261028070108` / `20261028070125` / `20261028070133` / `20261028070155` (drift vs repo `2026102022/23/24`). RPC 8-arg present · RLS ON
**B:** `resolveScratchSourceMs` + offline bake stosuje zatwierdzone cue/reverse/rate. `assertScratchExportEncodable` akceptuje reverse/rate. Jog **OUT**.
**C:** **BLOCKED** — `auth.users=4` · test-like `0` · local API 54421 unreachable · zero copy/cleanup
**Tests:** tsc **PASS** · vitest A/B slice **160 PASS** / 1 skipped
**Audit:** [MIX_WORKING_RESTORE_SCRATCH_EXPORT_2026-10-28.md](./audits/MIX_WORKING_RESTORE_SCRATCH_EXPORT_2026-10-28.md)
**NEXT:** Owner wskazuje test USER do copy **albo** wiring historii w editor **albo** słyszalny export verify

## 2026-10-28 — Scratch persist isolation from mix-working

**Status:** kod **SHIPPED** @ `6014556…` · service **bez** mix-working · **`dpl_*` NOT VERIFIED** · **ALIAS NOT VERIFIED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** Orchestrator — path-scoped commit+push izolacji Scratch persist
**Tip start:** `ba181500943621a99233a8ce1974f25b2974fbe0` = `origin/main` (`ls-remote`)
**Code:** `studio-scratch-persist.ts` = kanon CAS `studio_cas_apply_clip_scratch` + parse SAMPLE/SCRATCH · `studio-service.ts` cienki reuse · `POST /tracks` `trackType` · `PATCH …/clips` `op=set_scratch` · panel `onApprove`
**Tests:** `npx vitest run src/lib/studio/studio-scratch-cas.test.ts` → **6/6 PASS** · `tsc --noEmit` **PASS**
**Explicit non-claim:** mix-working **nie** restore · prod USER copy **BLOCKED** · **≠** Scratch GREEN
**Audit:** [SCRATCH_PERSIST_ISOLATION_2026-10-28.md](./audits/SCRATCH_PERSIST_ISOLATION_2026-10-28.md)
**NEXT:** Owner GO restore mix-working na cienki service **albo** prod USER copy **albo** export encode

## 2026-10-28 — SESSION_BRIDGE §4 archive (eighth batch, room for persist isolation)

**Status:** documentation · archiwizacja 3 najstarszych living `EXECUTED` (`GATE-A` · `GO-SB-ARCHIVE-4` · `GATE-2R`) → `### SESSION_BRIDGE archive` · `P-NEXT-10` + `USER-COPY` BLOCKED zachowane

## 2026-10-28 — Scratch reverse + CAS + SAMPLE/SCRATCH create

**Status:** kod **SHIPPED in repo** · CAS schema **APPLIED** · prod USER copy **BLOCKED** · **`dpl_*` NOT VERIFIED** · **ALIAS NOT VERIFIED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** Owner GO na 4 propozycje (reverse · CAS/SAMPLE/SCRATCH · USER copy · alias/`dpl_*`)
**Tip start:** `bb4857de5e0eb6b61761dbf74e70b48dfc5aae7f` = `origin/main` (`ls-remote`)
**1 Live reverse:** `StudioAudioEngine.applyScratchLive({ rate, reverse })` — BufferSource na istniejącym `AudioContext` / `clipGain` · **bez** drugiego silnika
**2 SAMPLE/SCRATCH + CAS:** `POST /tracks` `trackType` VOCAL|SAMPLE|SCRATCH · `PATCH …/clips` `op=set_scratch` · RPC `studio_cas_apply_clip_scratch` · MCP `apply_migration` history **`20261028050115` / `studio_scratch_cas_sample_scratch`** (drift vs repo `20261028120000` — nie repair)
**3 Prod USER copy:** **BLOCKED** — `auth.users=4` · brak bezpiecznej sesji · zero zapisu / cleanup
**4 Alias/`dpl_*`:** GitHub Production **`7377291086`** **success** `2026-10-28T04:37:56Z` @ `bb4857d` · unique URL `bitrymdym-gef23don8-…` **302 SSO** · www **200** bez SHA · **`dpl_*` NOT VERIFIED**
**Tests:** vitest slice scratch-engine/state/cas/place + p5-1/2/3/6/10 + p7-1-3/5 + architecture-guards (bez dirty `p5-track-crud`/editor) → **138/138 PASS**
**Explicit non-claim:** słyszalny reverse na urządzeniu **NOT VERIFIED** · **≠** Scratch GREEN · **≠** PRODUCTION VERIFIED
**Audit:** [SCRATCH_REVERSE_CAS_2026-10-28.md](./audits/SCRATCH_REVERSE_CAS_2026-10-28.md)
**NEXT:** path-scoped commit+push **albo** prod USER copy po wskazaniu test USER **albo** export encode

## 2026-10-28 — SESSION_BRIDGE §4 archive (seventh batch, room for reverse/CAS)

**Status:** documentation · archiwizacja 3 najstarszych living `EXECUTED` (`GATE-3` · `GATE-2` · `GATE-1`) → `### SESSION_BRIDGE archive` · `P-NEXT-10` BLOCKED zachowany

## 2026-10-28 — Studio unlock audit + Scratch DJ v1 PARTIAL

**Status:** audyt **SHIPPED** · Scratch **PARTIAL** · prod USER copy **BLOCKED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** Owner „GO, Studio odblokowujemy robimy jego audyt też.”
**Tip start:** `6e2132b…` = `origin/main` (`ls-remote`)
**A — Audyt:** [STUDIO_UNLOCK_AUDIT_2026-10-28.md](./audits/STUDIO_UNLOCK_AUDIT_2026-10-28.md) — powierzchnia editor/service/API/CAS/REC/export/AuthZ · Sacred adjacency path-only · SAMPLE/SCRATCH typy bez create UI · silnik = HTMLAudioElement (brak live reverse) · place TAKE już istnieje
**B — Prod USER copy:** **BLOCKED** (brak bezpiecznego test USER; `.env` nie otwierane)
**C — Scratch pion:** domain jog/cue/reverse/rate + export fail-closed · `copyCatalogAndPlaceStudioClip` reuse `POST /api/catalog/copy` + `…/record/place` · panel w recording Inspector · `StudioAudioEngine.applyScratchLive` na istniejącym `playbackRate` · **jeden** silnik
**OUT:** live reverse · persist CAS (brak kolumn) · SAMPLE/SCRATCH track create · BPM grid · export encode · dirty `studio-editor.tsx` / `studio-service.ts` · OD-15
**Tests:** vitest scratch-state + scratch-place + scratch-engine + p5-1/2/5/6/10 + p7-1-3/5 + architecture-guards → **131/131 PASS** · eslint changed files **PASS**
**Explicit non-claim:** **≠** full Scratch GREEN · **≠** PRODUCTION VERIFIED
**NEXT:** SAMPLE/SCRATCH create + CAS scratch fields **albo** live BufferSource reverse **albo** prod USER copy+cleanup — osobne GO

## 2026-10-28 — SESSION_BRIDGE §4 archive (sixth batch, room for Studio unlock)

**Status:** documentation · archiwizacja 3 najstarszych living `EXECUTED` (`GATE-0` · `GO-SB-ARCHIVE-3` · `S13-RO`) → `### SESSION_BRIDGE archive` · `P-NEXT-10` BLOCKED zachowany

## 2026-10-28 — Catalog copy private TAKE (repo)

**Status:** copy path **SHIPPED in repo** · prod copy runtime **NOT VERIFIED** · Scratch **NOT SHIPPED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** Owner GO 2 = Catalog copy E2E
**Tip start:** `3b8214b…` = `origin/main` (`ls-remote`)
**Code:** `prepareCatalogAssetCopy` po sniff **ok:true** (dest key tylko po claimed take id) · `executeCatalogAssetCopyFor` czyta `catalog/{uuid}/original.bin`, fail-closed gates, claim+upload+finalize TAKE · provenance `takes.title` = `catalog:{assetId}:{projectId}` · `recording_mode=QUICK` · client `beatId`/MIME ignorowane · upload fail → FAILED + remove
**API:** `POST /api/catalog/copy` — `requireUser` · 401/400/403/404/409/415/503/500 · PL `message` · success `{ takeId, beatId, objectKey, catalogAssetId, status: READY, reusedExisting }`
**Tests:** `npm test -- --run src/lib/catalog/catalog-originals.test.ts src/lib/catalog/catalog-copy-service.test.ts src/app/api/catalog/copy/route.test.ts src/lib/beats/audio-validation.test.ts` → **39/39 PASS**
**Lint/typecheck:** eslint changed files **PASS** · `tsc --noEmit` **PASS**
**Explicit non-claim:** prod USER copy **NOT VERIFIED** (brak bezpiecznego test USER) · Scratch **OUT** · **≠ Product GREEN**
**Audit:** [CATALOG_COPY_E2E_2026-10-28.md](./audits/CATALOG_COPY_E2E_2026-10-28.md)
**NEXT:** Scratch DJ **albo** prod USER copy+cleanup — osobne GO

## 2026-10-28 — Catalog originals OD-SC-02 content sniff (repo)

**Status:** content sniff **SHIPPED in repo** · copy E2E **NOT RUN** · Scratch **NOT SHIPPED** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** Owner GO 1 = content sniff (OD-SC-02) for Sample Catalog originals
**Tip start:** `fac551a…` = `origin/main` (`ls-remote`)
**Code:** `sniffAudioContainer` przeniesiony do `src/lib/beats/audio-validation.ts` (reuse backup verify) + `validateCatalogOriginalContentSniff` · planner `evaluateCatalogOriginalContentGate` wymaga server-held bytes · usunięto `CATALOG_CONTENT_GATE_NOT_IMPLEMENTED` · błędy `CATALOG_CONTENT_*` → **415** · sniff PASS → `COPY_NOT_IMPLEMENTED` (**501**, zero zapisu)
**Allowlista:** `audio/mpeg` · `audio/wav` · `audio/x-wav` · `audio/mp4` · `audio/aac` · **bez FLAC** · 20 MiB / 180 s **nietknięte**
**Tests:** `npm test -- --run src/lib/catalog/catalog-originals.test.ts src/lib/beats/audio-validation.test.ts src/lib/storage/backup-manifest.test.ts` → **36/36 PASS**
**Lint/typecheck:** eslint changed files **PASS** · `tsc --noEmit` **PASS**
**Explicit non-claim:** copy E2E / TAKE write **NOT IMPLEMENTED** · Scratch **OUT** · prod Storage **nie** mutowany · **≠ Product GREEN**
**Audit:** [CATALOG_OD_SC_02_CONTENT_SNIFF_2026-10-28.md](./audits/CATALOG_OD_SC_02_CONTENT_SNIFF_2026-10-28.md)
**NEXT:** copy E2E (test USER) **albo** Scratch — osobne GO

## 2026-10-28 — SESSION_BRIDGE §4 archive (fifth batch, room for content sniff)

**Status:** documentation · archiwizacja living `EXECUTED` = 15 · **≠** Product GREEN
**Scope:** przeniesiono 2 najstarsze living `EXECUTED` (`UNIT-2` · `P-NEXT-10B`) → `### SESSION_BRIDGE archive` · `P-NEXT-10` BLOCKED zachowany

## 2026-10-28 — Catalog originals controlled live Storage probe

**Status:** live probe **PASS** · cleanup **done** · Implementation **≠** Scratch DJ · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** Owner „GO” = controlled live probe po apply `20261027225553`
**Tip start:** `6f3a728…` = `origin/main` (`ls-remote`)
**Pre:** `catalog/` objects **0** · `catalog_assets` **0** · policies `catalog_originals_service_*` **4**
**Probe:** UUID `8c288da2-9017-415e-b715-64e65d4a35e9` · `beat-audio` `catalog/{uuid}/original.bin` · lokalny WAV **16044** B · `audio/wav` · service_role upload/list/download **PASS** · anon download **DENIED** · delete **PASS**
**Copy API:** **pominięte** (brak bezpiecznego test USER)
**Post leftover:** catalog objects **0** · catalog_assets **0**
**Explicit non-claim:** content sniff NOT IMPLEMENTED · Scratch NOT SHIPPED · service_role bypassrls **nie** rozstrzygnięty osobno
**Audit:** [CATALOG_ORIGINALS_LIVE_STORAGE_PROBE_2026-10-28.md](./audits/CATALOG_ORIGINALS_LIVE_STORAGE_PROBE_2026-10-28.md)
**NEXT:** content sniff **albo** copy E2E **albo** Scratch — osobne GO

## 2026-10-27 — Catalog originals prod apply + read-back

**Status:** schema **APPLIED** · read-back **PASS** · Implementation **≠** Scratch DJ · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**GO:** Owner „GO działajcie skutecznie i szybko!” = prod apply (MCP `apply_migration`, nie `db push` / repair)
**Pre-apply:** `list_migrations` — brak `catalog_originals_storage_and_entity` · tip start `0af0dc3…` = `origin/main`
**Apply:** name `catalog_originals_storage_and_entity` · SQL 1:1 z `supabase/migrations/20261027220000_catalog_originals_storage_and_entity.sql` · MCP `{success:true}`
**Historia:** **`20261027225553` / `catalog_originals_storage_and_entity`** · drift vs repo `20261027220000` — **nie** repair (jak F1-C / STU-16)
**Read-back PASS:** `catalog_assets` RLS ON+FORCE · polityka `catalog_assets_service_all` TO `service_role` · anon/authenticated table priv **false** · service_role SIDU **true** · Storage **4/4** `catalog_originals_service_{select,insert,update,delete}` TO `service_role` na `beat-audio` `catalog/{uuid}/original.bin`
**Tests:** `npm test -- --run src/lib/catalog/catalog-originals.test.ts src/lib/beats/audio-validation.test.ts` → **19/19 PASS**
**Explicit non-claim:** live Storage probe **BLOCKED** (osobne GO) · content sniff NOT IMPLEMENTED · Scratch NOT SHIPPED · advisors pre-existing **nie** naprawiane
**Audit:** [CATALOG_ORIGINALS_PROD_APPLY_2026-10-27.md](./audits/CATALOG_ORIGINALS_PROD_APPLY_2026-10-27.md)
**Docs updated:** gates · kontrakt §13 · REUSE map · this CHANGELOG · PROJECT_STATE Sample Catalog · SESSION_BRIDGE
**NEXT:** controlled live probe GO

## 2026-10-27 — Gate C: catalog copy fail-closed (repo; prod apply BLOCKED)

**Status:** code + tests **PASS** · **SHIPPED in repo** · **NOT in prod** · Scratch DJ v1 **OUT** · **≠ Product GREEN**
**Code:** `src/lib/catalog/catalog-originals.ts` planner — brak prod apply / tabeli / polityk `catalog_originals_service_*` → `CATALOG_STORAGE_POLICIES_UNAVAILABLE` · brak PUBLISHED+license → `CATALOG_ASSET_NOT_COPYABLE` · content sniff nadal fail-closed · dest TAKE key **nie** wymyślany · **zero zapisu**
**API:** `POST /api/catalog/copy` — `requireUser` · JSON 400 · `beatId` ignorowane · write intent **nie** w body · 503/409/501
**Tests:** `npm test -- --run src/lib/catalog/catalog-originals.test.ts src/lib/beats/audio-validation.test.ts` → **19/19 PASS**
**Git:** `5a6bc55` `feat(catalog): fail-closed copy when Storage policies are unknown` (parent `5200c6d`)
**Explicit non-claim:** prod `apply_migration` **BLOCKED** (brak Owner „prod apply”) · content sniff NOT IMPLEMENTED · Scratch NOT SHIPPED
**Docs updated:** [CATALOG_STORAGE_AND_OD_SC_02_GATES_2026-10-27.md](./decisions/CATALOG_STORAGE_AND_OD_SC_02_GATES_2026-10-27.md) · REUSE map · this CHANGELOG · PROJECT_STATE Sample Catalog · SESSION_BRIDGE

## 2026-10-27 — Gate B: alias / `dpl_*` best-effort @ `5200c6d` (docs-only)

**Status:** GitHub Production **success** · Vercel commit status **success** · **`dpl_*` NOT VERIFIED** · **ALIAS NOT VERIFIED** · **≠ PRODUCTION VERIFIED** · **≠ Product GREEN**
**FACT tip (pre-catalog):** **`5200c6da5813f0a446393b3ce79e9f03478f9bbd`** (`docs: verify Contabo host read-only after SSH key locate`)
**FACT deploy:** GitHub Production **`7372230897`** **success** `2026-10-27T22:42:24Z` @ **`5200c6d…`** · unique URL `https://bitrymdym-j1sp78uxs-dawidthai125s-projects.vercel.app` (**302 SSO**) · dashboard `https://vercel.com/dawidthai125s-projects/bitrymdym/8KYY2axTYMN4CKzsxEteqy857k5R`
**FACT www:** `https://www.bitrymdym.pl` HTTPS **200** · brak `dpl_*` / SHA w nagłówkach
**NOT VERIFIED:** `dpl_*` (brak `vercel` CLI · unique URL SSO-walled · bez OAuth login)
**Explicit non-claim:** historyczny `dpl_7Xwqf…` @ `d462b22` **nie** przenoszony

## 2026-10-27 — Gate A: Contabo poll journal RO (LEFT RUNNING)

**Status:** live host **journal RO PASS** · poll **zostawiony RUNNING** · **≠** always-on GO · **≠** sync · **≠** stop/restart
**Audit:** [CONTABO_GO_HOST_RO_2026-10-27.md](./audits/CONTABO_GO_HOST_RO_2026-10-27.md) § Journal RO
**FACT:** `bitrymdym-e3-worker-poll` **enabled/active/running** PID **847** since **2026-10-23 20:47:04 CEST** · journal `-n 80` = `claims_empty` / `busy=false` · sekrety **brak** · **nie** stop/start/enable/disable
**Explicit non-claim:** SHA drzewa hosta nadal NOT VERIFIED · `claims_empty` ≠ dowód pustej kolejki produktowej

## 2026-10-27 — SESSION_BRIDGE §4 archive (fourth batch, room for A/B/C)

**Status:** documentation only · archiwizacja living `EXECUTED` ≥14 · **≠** Product GREEN
**Scope:** przeniesiono 5 najstarszych living `EXECUTED` (`GO-TEAM-CLOSE` · `GO-SESSION-CLOSE` · `CONTINUITY-RELIABILITY` · `COLD-START-CLOSE` · `GO-SB-ARCHIVE`) → `### SESSION_BRIDGE archive` · `P-NEXT-10` BLOCKED zachowany

## 2026-10-27 — Contabo GO-HOST-RO retry (live SSH PASS)

**Status:** documentation · live host **RO PASS** · **≠** always-on GO · **≠** sync · **≠** canary · **≠** Product GREEN
**Audit:** [CONTABO_GO_HOST_RO_2026-10-27.md](./audits/CONTABO_GO_HOST_RO_2026-10-27.md)
**FACT:** klucz `C:\Users\dawid\.ssh\bitrymdym-contabo-recovery-ed25519` (passphrase; nie BatchMode) · `hostname=vmi3622761` · `bitrymdym-e3-worker.service` **disabled/inactive** · `bitrymdym-e3-worker-poll.service` **enabled/active/running** PID 847 since 2026-10-23 20:47 CEST · `/opt/bitrymdym-e3-worker` exists · **`HAS_GIT=no`** (sudo) · env **names only**
**Korekta Gate 2:** `bitrymdym-e3-contabo` ABSENT **zamierzone**; BatchMode 255 = passphrase, nie „brak klucza”
**Explicit non-claim:** always-on **nie** włączone w tej sesji · wartości env **nie** dumpowane · SHA drzewa hosta **NOT VERIFIED**
**Docs updated:** audit · PROJECT_STATE Contabo / §2c · this CHANGELOG · SESSION_BRIDGE §4

## 2026-10-27 — Gate 3: Implementation Catalog (repo; prod apply BLOCKED)

**Status:** code + SQL in Git · **SHIPPED in repo** · **NOT in prod** · Scratch DJ v1 **OUT** · **≠ Product GREEN**
**Design:** [CATALOG_STORAGE_AND_OD_SC_02_GATES_2026-10-27.md](./decisions/CATALOG_STORAGE_AND_OD_SC_02_GATES_2026-10-27.md) — OD-SC-02 (20 MiB / no FLAC / 180 s) **≠** beat-audio MASTER 50 MiB+FLAC · OD values **nie** zmienione
**Code:** `validateObjectKey` + `validateCatalogOriginalUploadMeta` · skeleton `src/lib/catalog/catalog-originals.ts` · `POST /api/catalog/copy` (auth + 501, zero zapisu)
**SQL (repo only):** `supabase/migrations/20261027220000_catalog_originals_storage_and_entity.sql` — `catalog_assets` + Storage `catalog/` service_role · **prod apply BLOCKED**
**Explicit non-claim:** content sniff NOT IMPLEMENTED · Scratch UI NOT SHIPPED · OD-15 OPEN
**Docs updated:** PROJECT_STATE Sample Catalog row · kontrakt §13 pointers · REUSE map · this CHANGELOG · SESSION_BRIDGE

## 2026-10-27 — Gate 2: Contabo GO-HOST-RO (docs-only)

**Status:** documentation only · **BLOCKED** on SSH · **≠** always-on · **≠** sync · **≠** canary
**Audit:** [CONTABO_GO_HOST_RO_2026-10-27.md](./audits/CONTABO_GO_HOST_RO_2026-10-27.md)
**FACT:** documented key `~/.ssh/bitrymdym-e3-contabo` **MISSING** · SSH BatchMode `ubuntu@161.97.72.197` exit **255** `Permission denied (publickey)` (documented + recovery key name) · host **nie** timeout
**NOT DONE:** service status · unit file · env names · git SHA on host
**Explicit non-claim:** always-on **nie** włączone · wartości kluczy **nie** dumpowane
**Docs updated:** audit nowy · PROJECT_STATE Contabo pointer · this CHANGELOG · SESSION_BRIDGE §4

## 2026-10-27 — Gate 1: SFM staging/host RO (docs-only)

**Status:** documentation only · read-only Git + MCP SELECT prod · **≠** flag ON · **≠** bake · **≠** SFM Production GREEN
**Audit:** [SFM_PLANES_STAGING_HOST_RO_2026-10-27.md](./audits/SFM_PLANES_STAGING_HOST_RO_2026-10-27.md)
**FACT (1) code:** `5212933` ancestor living tip (`merge-base` exit 0)
**FACT (2–4) staging:** **NOT VERIFIED** — GitHub last-20 Production only · MCP jeden projekt BitRymDym · `list_branches` [] · **nie** assumed = prod
**FACT (6) prod DB:** history A–D + KIND_REJECT present (version drift vs repo files) · tables + RPC exist · versions/stages/grants **0** · SFM kind jobs **0**
**NOT VERIFIED:** `SFM_VERSIONS_V1` runtime value · staging deploy/schema/worker · host process (Gate 2)
**Explicit non-claim:** flaga **nie** włączona · worker always-on **nie** włączony · migracje **nie** apply
**Docs updated:** audit nowy · PROJECT_STATE SFM PLANES / SFM CODE STATUS · this CHANGELOG · SESSION_BRIDGE §4
**Unchanged / out of scope:** NEXT UNIT STOP · Sacred WIP · Studio chronione · app code

## 2026-10-27 — Gate 0: alias / `dpl_*` best-effort (docs-only)

**Status:** documentation only · GitHub Production **success** · Vercel commit status **success** · **`dpl_*` NOT VERIFIED** · **ALIAS NOT VERIFIED** · **≠ PRODUCTION VERIFIED** · **≠ Product GREEN**
**FACT tip / HEAD / origin/main:** **`1c34a535867cf710ae6707a77a73a04aa3449af4`** (`docs: archive session bridge executed rows for gates 0-3`; parent **`bde3009`**)
**FACT deploy:** GitHub Production deployment **`7371927399`** **success** `2026-10-27T22:24:34Z` @ that SHA · Vercel commit status **success** (`Deployment has completed`) · unique URL `https://bitrymdym-jypwmgukh-dawidthai125s-projects.vercel.app` · dashboard `https://vercel.com/dawidthai125s-projects/bitrymdym/8N3C7ryXXx2LVaYt3G7ju5q1sirc`
**NOT VERIFIED:** `dpl_*` id · alias binding `www.bitrymdym.pl` / `bitrymdym.pl` / `bitrymdym.vercel.app` → this SHA (no `vercel` CLI; unique URL SSO-walled; `www` HTTPS 200 without SHA bind)
**Scope:** living tip / deploy pointers in [PROJECT_STATE.md](./PROJECT_STATE.md) §2 (+ PRODUCTION rows) reconciled to tip `1c34a53…` · prior Unit 1 era **`a1b84f6…` / `7371104561`** kept as **HISTORY**
**Explicit non-claim:** GitHub success + Vercel commit status **≠** alias binding · **≠** PRODUCTION VERIFIED · **≠** Product GREEN · historyczny `dpl_7Xwqf…` @ `d462b22` **nie** przenoszony
**Docs updated:** [PROJECT_STATE.md](./PROJECT_STATE.md) · this CHANGELOG entry · SESSION_BRIDGE §4
**Unchanged / out of scope:** Sacred WIP · remaining dirty WIP · app code · OD-15 OPEN · Premium Retention HOLD

## 2026-10-27 — SESSION_BRIDGE §4 archive (third batch, docs-only)

**Status:** documentation only · Owner GO archiwizacja przed Gate 0–3 · **≠** tip/deploy reconcile · **≠** Product GREEN
**Scope:** przeniesiono 6 najstarszych living `EXECUTED` (`KONTRAKT A–D` · `GO-5G-O` · `GO-5G-M` · `GO-5G-J` · `GO-5G-H` · `GO-5G-G`) z [SESSION_BRIDGE.md](./operations/SESSION_BRIDGE.md) §4 → `### SESSION_BRIDGE archive` · `P-NEXT-10` BLOCKED zachowany · living `EXECUTED` 14→8 (plus wiersz tej archiwizacji)
**Unchanged / out of scope:** `PROJECT_STATE.md` · Sacred WIP · Studio chronione · tip/deploy claims · pozostały dirty WIP poza allowlistą most+CHANGELOG

## 2026-10-27 — Sample Catalog §13 Storage / allowlist RO audit (docs-only)

**Status:** documentation only · read-only repo + SELECT prod · **≠ Implementation GO** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED**
**Scope:** nowy audyt [SAMPLE_CATALOG_S13_STORAGE_POLICIES_RO_2026-10-27.md](./audits/SAMPLE_CATALOG_S13_STORAGE_POLICIES_RO_2026-10-27.md) · kontrakt §13 blockers **zostają NOT VERIFIED**
**FACT live (SELECT):** 3 buckety · `beat-audio` 50 MiB + FLAC · polityki `storage.objects` = 3× FAR-01 (brak `catalog/` · brak polityk anon/authenticated) · prefix `catalog/` **0** obiektów · RLS ON
**FACT repo:** `validateObjectKey` tylko `platform/` / `user/` · brak encji catalog original · orphan KEEP `catalog/*` = straż delete, nie access policy
**Explicit non-claim:** Implementation **NOT AUTHORIZED** · STOP w PROJECT_STATE **zachowany** · ten wpis **nie** zamyka OD-SC ani OD-15 · **nie** mutowano Storage
**Docs updated:** audit nowy · this CHANGELOG entry
**Unchanged / out of scope:** `PROJECT_STATE.md` (tip/deploy/NEXT) · Sacred WIP · Studio chronione · app code

## 2026-10-27 — Unit 1: living tip / Production deploy reconcile (docs-only)

**Status:** documentation only · GitHub Production **success** · Vercel commit status **success** · **`dpl_*` NOT VERIFIED** · **ALIAS NOT VERIFIED** · **≠ PRODUCTION VERIFIED** · **≠ Product GREEN** · **≠ Implementation GO**
**FACT tip / HEAD / origin/main:** **`a1b84f68d570a9324328d3673ba5a04f3915414c`** (`docs(cursor): map Owner team roles to existing agents`; parent **`332336c`**)
**FACT deploy:** GitHub Production deployment **`7371104561`** **success** `2026-10-27T21:40:25Z` @ that SHA · Vercel commit status **success** (`Deployment has completed`) · unique URL `https://bitrymdym-aj5uz96jn-dawidthai125s-projects.vercel.app` · dashboard `https://vercel.com/dawidthai125s-projects/bitrymdym/699An9GSua2HV4d6BTEgsSNqbbXH`
**NOT VERIFIED:** `dpl_*` id · alias binding `www.bitrymdym.pl` / `bitrymdym.pl` / `bitrymdym.vercel.app` → this SHA (no `vercel inspect`; no OAuth)
**Scope:** living tip / deploy pointers in [PROJECT_STATE.md](./PROJECT_STATE.md) §2 (+ §2c / PRODUCTION rows) reconciled to tip `a1b84f6…` · prior GO-5G tip/deploy/alias era **`d462b22…` / `dpl_7Xwqf…` / `7354583257` / ALIAS VERIFIED** kept as **Prior / HISTORY**
**Explicit non-claim:** GitHub success + Vercel commit status **≠** alias binding · **≠** PRODUCTION VERIFIED · **≠** Product GREEN · **≠** Sample Catalog / Premium Retention / SFM cutover · `STOP — OWNER DECISION REQUIRED` **kept**
**Docs updated:** [PROJECT_STATE.md](./PROJECT_STATE.md) · this CHANGELOG entry
**Unchanged / out of scope:** Sacred WIP · remaining dirty WIP · SESSION_BRIDGE · FINAL_COLD_START · app code · OD-15 OPEN · Premium Retention HOLD

## 2026-10-27 — SESSION_BRIDGE §4 archive (docs-only)

**Status:** documentation only · Owner GO archiwizacja · **≠** tip/deploy reconcile · **≠** Product GREEN · **bez** commit/push/deploy w tym GO
**Scope:** przeniesiono starsze wpisy `EXECUTED` z [SESSION_BRIDGE.md](./operations/SESSION_BRIDGE.md) §4 → sekcja poniżej · wpis `BLOCKED` (`P-NEXT-10`) pozostaje w living §4 · living limit ≤15 zwolniony
**Unchanged / out of scope:** `PROJECT_STATE.md` · Sacred WIP · Studio chronione · tip/deploy claims · pozostały dirty WIP CHANGELOG (GO-5G-C / P-NEXT-06) nietknięty poza tą sekcją · commit/push = osobne GO
**Unit 2 (2026-10-27):** druga partia — `GO-5G-F` · `GO-5G-C` · `P-NEXT-10A` dopisane na górze tabeli poniżej (verbatim, newest-of-batch first) · living §4 zwolniony pod closeout

### SESSION_BRIDGE archive

Moved from `docs/operations/SESSION_BRIDGE.md` §4 on 2026-10-27 (Owner GO). First batch: GO-1…gap audit. Second batch (Unit 2 closeout): GO-5G-F · GO-5G-C · P-NEXT-10A. Third batch (Gates 0–3 room): KONTRAKT A–D · GO-5G-O · GO-5G-M · GO-5G-J · GO-5G-H · GO-5G-G. Fourth batch (room for journal/alias/catalog): GO-TEAM-CLOSE · GO-SESSION-CLOSE · CONTINUITY-RELIABILITY · COLD-START-CLOSE · GO-SB-ARCHIVE. Fifth batch (2026-10-28, room for content sniff): UNIT-2 · P-NEXT-10B. Sixth batch (2026-10-28, room for Studio unlock): GATE-0 · GO-SB-ARCHIVE-3 · S13-RO. Seventh batch (2026-10-28, room for reverse/CAS): GATE-3 · GATE-2 · GATE-1. Eighth batch (2026-10-28, room for persist isolation): GATE-A · GO-SB-ARCHIVE-4 · GATE-2R. Ninth batch (2026-10-28, room for history wiring + scratch verify): CAT-APPLY · GATE-C · GATE-B. Tenth batch (2026-10-28, room for USER copy E2E): CAT-COPY · CAT-SNIFF · CAT-PROBE. Eleventh batch (2026-10-28, room for DAW queue): STUDIO-C · STUDIO-A · GO-SB-ARCHIVE-6. Twelfth batch (2026-10-28, room for markers): SCRATCH-CAS-REV · ALIAS-DPL · GO-SB-ARCHIVE-7. Thirteenth batch (2026-10-28, room for markers re-smoke): MIX-A3.5-ENC · SCRATCH-PERSIST · GO-SB-ARCHIVE-8. Fourteenth batch (2026-10-28, room for bake listen): GO-SB-ARCHIVE-10 · GIT-CLOSEOUT · GO-SB-ARCHIVE-9. Fifteenth batch (2026-10-28, room for Scratch/track docRef): KEEP-UX-B · GIT-CLOSEOUT-PLACE · USER-COPY. Sixteenth batch (2026-10-28, room for leftover cleanup + set_scratch API): KEEP-SMOKE · DAW-QUEUE · GO-SB-ARCHIVE-11. Seventeenth batch (2026-10-28, room for lastScratchClipId lift): MARKERS-CAS-VER · MARKERS-CAS · GO-SB-ARCHIVE-12. Eighteenth batch (2026-10-28, room for bake `--play`): CAT-PLACE-UI · MARKERS-RESMOKE · GO-SB-ARCHIVE-13. Nineteenth batch (2026-10-28, room for dpl/alias bind): MARKERS-DOCREF · BAKE-LISTEN-POLARITY · GO-SB-ARCHIVE-14. Twentieth batch (2026-10-28, room for mix-working HTTP): DOCREF-SMOKE-AB · SCRATCH-TRACK-DOCREF · GO-SB-ARCHIVE-15. Rows preserved verbatim (newest-of-batch first). Do not delete without further Owner GO.

| date | prompt_id | topic | execution | verification | outcome | evidence / source | git_sha | next / block |
|------|-----------|-------|-----------|--------------|---------|-------------------|---------|--------------|
| 2026-10-28 | DOCREF-SMOKE-AB | Owner smoke documentVersion A+B (marker→move + Sample create→move) | EXECUTED | PASS | Start tip `56c7f2f`=`origin/main`. A) marker→clip-move **PASS** (v17→18 marker, move expected 18→v19) bez CAS. B) Sample create→clip-move **PASS** (track→v20, move expected 20→v21) bez CAS. Cleanup markers n=0 v22. Keep TAKE start 2ms. BEAT_REF OK. Leftover puste Scratch `bced0aa2` + Sample `8273aeeb` (opcjonalny cleanup). set_scratch→move **NOT VERIFIED**. GH **`7381694008`** @ `56c7f2f` success · unique `bitrymdym-gj9vss7k6-…` · GH **`7381581476`** @ `1f8f776` success. `dpl_*`/alias NOT VERIFIED. ≠ Product GREEN. | Owner UI smoke · `gh` `7381694008` / `7381581476` | `56c7f2f` + ten docs | NEXT: set_scratch→move **albo** cleanup pustych tracków **albo** stop kolejki ack |
| 2026-10-28 | SCRATCH-TRACK-DOCREF | Scratch persist + create-track ack editor docRef | EXECUTED | PASS | Start tip `1f8f776`=`origin/main`. Residual po markerach: `addProductTrack` + `set_scratch` tylko tip. REUSE `ackDocumentVersion` → `applyAckedDocumentVersion` / `applyPersistedDoc`. Editor nietknięty. Panel +3/−4. Vitest scratch+markers+p7.1.6+stu-08+pr-v1 **79/79**. Owner Scratch/track→clip-move **NOT VERIFIED**. `dpl_*`/alias NOT VERIFIED. ≠ Product GREEN. | vitest studio-scratch-cas + studio-markers-* + p7-1-6 + stu-08 + pr-v1 | _(ten commit)_ | NEXT: Owner smoke Scratch→move / track→move bez F5 |
| 2026-10-28 | GO-SB-ARCHIVE-15 | Archiwizacja §4 → CHANGELOG (room for Scratch/track docRef) | EXECUTED | PASS | Przeniesiono 3 najstarsze `EXECUTED` (`KEEP-UX-B` · `GIT-CLOSEOUT-PLACE` · `USER-COPY`) → CHANGELOG archive. Living 15→12, po SCRATCH-TRACK-DOCREF + tym wierszu **14**. `P-NEXT-10` BLOCKED zachowany. | Diff most + CHANGELOG archive table | _(ten commit)_ | Living tip/deploy → PROJECT_STATE |
| 2026-10-28 | MARKERS-DOCREF | Editor docRef sync po ack markerów | EXECUTED | PASS | Start tip `ad28be2`=`origin/main`. GO editor. Ack markerów → `advanceStudioPersistDocumentVersion` + `applyPersistedDoc` (REUSE tip/ack, bez drugiego CAS). Recording `ackDocumentVersion` → parent. Editor izolacja OK (+21, bez CRLF). Vitest markers+CAS/p7.1.6/stu-08/pr-v1 **71/71**. Owner marker→clip-move **NOT VERIFIED**. `dpl_*`/alias NOT VERIFIED. ≠ Product GREEN. | vitest studio-markers-* + p7-1-6 + stu-08 + pr-v1 | _(ten commit)_ | NEXT: Owner re-smoke marker → clip-move bez F5 |
| 2026-10-28 | BAKE-LISTEN-POLARITY | Scratch bake listen dump polarity + PlaySync | EXECUTED | PARTIAL | Start tip `aacaada`=`origin/main`. Kod `fadb2b0`. Skrypt `scripts/_bake-listen-scratch-wav.ts` (REUSE `renderStudioDocumentOffline` + `encodeWavFromBake`). Polarność PCM/header **PASS**. SoundPlayer PlaySync exit 0 ×4 (**PLAY PASS**). Ucho Owner **NOT VERIFIED**. Temp WAV usunięte. 0 zmian produktu Studio. Contabo/SFM nietknięte. ≠ Product GREEN. | skrypt dump · PlaySync ×4 | _(ten commit)_ | NEXT: residual clip-move CAS **albo** Owner `--play` ucha |
| 2026-10-28 | GO-SB-ARCHIVE-14 | Archiwizacja §4 → CHANGELOG (room for bake listen) | EXECUTED | PASS | Przeniesiono 3 najstarsze `EXECUTED` (`GO-SB-ARCHIVE-10` · `GIT-CLOSEOUT` · `GO-SB-ARCHIVE-9`) → CHANGELOG archive. Living 15→12, po BAKE-LISTEN-POLARITY + tym wierszu **14**. `P-NEXT-10` BLOCKED zachowany. | Diff most + CHANGELOG archive table | _(ten commit)_ | Living tip/deploy → PROJECT_STATE |
| 2026-10-28 | CAT-PLACE-UI | Catalog→place Owner UI smoke + cleanup | EXECUTED | PASS | Seed `d5c79f2a-15a8-4c43-8fa1-5564ddb646b5` PUBLISHED license_allows_copy. UI Dawid: Kopiuj i umieść na playhead → Gotowe. Clip TAKE `d525d69b-18df-4e51-8dc7-7229b8579c3a` 1s na Wokal · take `49bb2d34-…`. DELETE clip HTTP 200 · leftover catalog/take/clip/XP = 0. Zachowane: BEAT_REF `2f06a6b2` · Keep `af9bd5aa` · projekt `178e902d-…` v16. REUSE `scripts/_catalog-place-user-e2e.mjs` · 0 zmian kodu. Tip start `49c2036`=`origin/main`. Kod `fadb2b0`. HTTP copy/place z UI NOT VERIFIED. Play NOT VERIFIED. ≠ Product GREEN. | Owner UI smoke · leftover SELECT 0 | _(ten commit)_ | NEXT: Scratch bake listen / STUDIO_EXPORT PARTIAL verify |
| 2026-10-28 | MARKERS-RESMOKE | Owner re-smoke markerów (dwie mutacje bez F5) | EXECUTED | PASS | Sesja Dawid · projekt `178e902d-6ecf-4ef6-910c-d85612bb277c`. Tip docs start `30a9bc2`=`origin/main`. Kod `fadb2b0`. Dodaj zwrotkę → Dodaj refren PATCH **200** v11→v12. Cleanup Usuń→Usuń do n=0 v14. GH **`7381109228`** @ `30a9bc2` success · GH **`7381095797`** @ `fadb2b0` success. `dpl_*`/alias NOT VERIFIED. seek/ucho NOT VERIFIED. Residual: clip-move po markerze może CAS (editor nietknięty). ≠ Product GREEN. | Owner UI smoke · `gh` `7381109228` / `7381095797` | `30a9bc2` + ten docs | NEXT: Catalog→place Owner UI smoke **albo** bake listen |
| 2026-10-28 | GO-SB-ARCHIVE-13 | Archiwizacja §4 → CHANGELOG (room for markers re-smoke) | EXECUTED | PASS | Przeniesiono 3 najstarsze `EXECUTED` (`MIX-A3.5-ENC` · `SCRATCH-PERSIST` · `GO-SB-ARCHIVE-8`) → CHANGELOG archive. Living 15→12, po MARKERS-RESMOKE + tym wierszu **14**. `P-NEXT-10` BLOCKED zachowany. | Diff most + CHANGELOG archive table | _(ten commit)_ | Living tip/deploy → PROJECT_STATE |
| 2026-10-28 | MARKERS-CAS-VER | Stale expectedDocumentVersion po mutacji markerów | EXECUTED | PASS | Start tip `7dc3db4`=`origin/main`. Path-scoped 4 ścieżki @ `fadb2b0`. Tip `createStudioPersistVersionTip` + panel/recording ack PATCH. Vitest markers **10/10**. Owner re-smoke **NOT VERIFIED**. Editor docRef poza allowlistą. `dpl_*`/alias NOT VERIFIED. ≠ Product GREEN. | vitest studio-markers-* · `git ls-remote` `fadb2b0` | `fadb2b0…` | NEXT: Owner re-smoke dwóch mutacji bez F5 |
| 2026-10-28 | MARKERS-CAS | Studio markers A3/P7 lite commit+push+apply | EXECUTED | PARTIAL | Start tip `2fb71a9`=`origin/main`. Path-scoped 10 ścieżek @ `9fc7f6e`. MCP apply **`20261028084022`/`studio_markers_cas`** project `rzzxrgcdogkybkiidqgw`. Vitest markers **7/7**. GH Production **`7380825799`** success. Owner Inspector klik **NOT VERIFIED**. `dpl_*`/alias NOT VERIFIED. ≠ Product GREEN. | vitest studio-markers-* · MCP list_migrations · `gh` `7380825799` | `9fc7f6e…` | NEXT: Owner klik verse/hook w Inspector |
| 2026-10-28 | GO-SB-ARCHIVE-12 | Archiwizacja §4 → CHANGELOG (room for markers) | EXECUTED | PASS | Przeniesiono 3 najstarsze `EXECUTED` (`SCRATCH-CAS-REV` · `ALIAS-DPL` · `GO-SB-ARCHIVE-7`) → CHANGELOG archive. Living 15→12, po MARKERS-CAS + tym wierszu **14**. `P-NEXT-10` BLOCKED zachowany. | Diff most + CHANGELOG archive table | _(ten commit)_ | Living tip/deploy → PROJECT_STATE |
| 2026-10-28 | KEEP-SMOKE | Keep smoke Stop→Zachowaj→clip (sesja Dawida) | EXECUTED | PASS | Start tip `26db634`=`origin/main`. Wokal armed. Mic granted. Stop → Nagranie gotowe → Zachowaj. TAKE clip 00:00–00:18. `record/place` 201. finalize 200. Odtwórz nie kliknięte. Master 0 dB. Take 18 s (nie 1–3 s). Loop/metro www niedostępne. `dpl_*`/alias NOT VERIFIED. ≠ Product GREEN. | [audit](./audits/KEEP_SMOKE_DAWID_2026-10-28.md) · Cursor Browser snapshot | _(ten commit)_ | NEXT: słyszalny metro/loop **albo** Owner listen clipu |
| 2026-10-28 | DAW-QUEUE | Studio vs DAW P0–P1 punch/metro/loop/monitor/lanes | EXECUTED | PARTIAL | Start tip `6c97ef8`. Punch+count-in 1 track. Metro click + loop wrap na istniejącym clock. Suchy monitor + echo warning. Zastąp MUST. Keep smoke PARTIAL (sesja Dawida, 0 READY, bez Play/Nagraj). Markery CAS OUT. Scratch BPM-grid OUT. Vitest 132 PASS. OD-15 OPEN. ≠ Product GREEN. | [audit](./audits/STUDIO_DAW_QUEUE_P0_P2_2026-10-28.md) · daw-clock + p5-6/5/2/8/10 | `01629f5` | NEXT: Owner Stop→Zachowaj na urządzeniu **albo** słyszalny metro/loop |
| 2026-10-28 | GO-SB-ARCHIVE-11 | Archiwizacja §4 → CHANGELOG (room for DAW queue) | EXECUTED | PASS | Przeniesiono 3 najstarsze `EXECUTED` (`STUDIO-C` · `STUDIO-A` · `GO-SB-ARCHIVE-6`) → CHANGELOG archive. Living 15→12, po DAW-QUEUE + tym wierszu **14**. `P-NEXT-10` BLOCKED zachowany. | Diff most + CHANGELOG archive table | `3166ae2` | Living tip/deploy → PROJECT_STATE |
| 2026-10-28 | KEEP-UX-B | Surface Keep Take after Stop (no auto-place) | EXECUTED | PASS | Living tip start `f4e6b4a`=`origin/main`. Code `028cc5e`. Panel: workflow nad Katalog; status Zachowaj; scrollIntoView READY_TAKE. `stopAndFinalize` bez place. Vitest 61/61. GH **`7379926192`** success. Owner device / `dpl_*` / alias **NOT VERIFIED**. OD-15 OPEN. ≠ Product GREEN. | `p5-6-take-workflow.test.ts` · panel `Studio Take Workflow` · `gh` `7379926192` | `028cc5e…` | NEXT: Owner Stop→Zachowaj na urządzeniu |
| 2026-10-28 | GIT-CLOSEOUT-PLACE | Catalog place E2E + Scratch WAV fixture | EXECUTED | PARTIAL | Start tip `d973957` verified. C1 WAV test `da2a48f`. C2 ten docs. Place HTTP 201 leftover **0**. Probe script **nie** commit. Owner listen / prod STUDIO_EXPORT job **NOT VERIFIED**. `dpl_*` / alias **NOT VERIFIED**. ≠ Product GREEN. | [audit](./audits/SCRATCH_CATALOG_PLACE_EXPORT_2026-10-28.md) · test `da2a48f` | `da2a48f` + ten docs | NEXT: LF-normalize editor **albo** UI catalog place **albo** Owner listen |
| 2026-10-28 | USER-COPY | Prod USER catalog copy + cleanup | EXECUTED | PASS | Sesja Dawida w Cursor Browser. Fixture WAV 16044 B → `catalog/d9b4f821-…/original.bin` + PUBLISHED+license. `POST /api/catalog/copy` HTTP **200** take `0b46506e-…` READY. Cleanup Storage+DB+XP leftover **0**. Tip `5b2fceb`=`origin/main`. GH **`7379526025`** success. `dpl_*` / alias **NOT VERIFIED**. ≠ Product GREEN. | Browser fetch · MCP leftover SELECT · [audit](./audits/CATALOG_COPY_USER_E2E_2026-10-28.md) | _(ten commit)_ | NEXT: Scratch place **albo** słyszalny export **albo** LF-normalize editor |
| 2026-10-28 | GO-SB-ARCHIVE-10 | Archiwizacja §4 → CHANGELOG (room for USER copy E2E) | EXECUTED | PASS | Przeniesiono 3 najstarsze `EXECUTED` (`CAT-COPY` · `CAT-SNIFF` · `CAT-PROBE`) → CHANGELOG archive. Living 14→11, po USER-COPY + tym wierszu **13**. `P-NEXT-10` BLOCKED zachowany. | Diff most + CHANGELOG archive table | _(ten commit)_ | Living tip/deploy → PROJECT_STATE |
| 2026-10-28 | GIT-CLOSEOUT | Path-scoped commit+push po unicie archive+mix+bake | EXECUTED | PARTIAL | Start tip `c1c7e21`=`origin/main`. C1 docs archive `4c2a085`. C2 bake cue test `c58b090`. C3 editor **BLOCKED** (cached rewrite 3548/3532 CRLF; `-w` = +18/−2 history wiring). Push `c1c7e21..c58b090`. GH Production **`7379453375`** success @ `c58b090`. `dpl_*` / alias **NOT VERIFIED**. Sacred / SYSTEM_ARCHITECTURE / mix-working untracked **poza** stage. ≠ Product GREEN. | `git ls-remote` · `gh` `7379453375` · vitest 33/33 · tsc PASS | `c58b090…` | NEXT: LF-normalize editor history wiring **albo** test USER copy **albo** słyszalny export |
| 2026-10-28 | GO-SB-ARCHIVE-9 | Archiwizacja §4 → CHANGELOG (room for history wiring + scratch verify) | EXECUTED | PASS | Przeniesiono 3 najstarsze `EXECUTED` (`CAT-APPLY` · `GATE-C` · `GATE-B`) → CHANGELOG archive. Living 15→12, po tym wierszu **13**. `P-NEXT-10` + `USER-COPY` BLOCKED zachowane. | Diff most + CHANGELOG archive table | `4c2a085…` | Living tip/deploy → PROJECT_STATE |
| 2026-10-28 | MIX-A3.5-ENC | Restore Mix Working A3.5 + Scratch bake encode | EXECUTED | PARTIAL | A3.5 na cienki service. Persist Scratch nietknięty. Editor/Sacred poza stage. Bake cue/reverse/rate. Schema MCP `20261028070108`…`70155`. C BLOCKED (`auth.users=4`). tsc PASS · vitest 160 PASS. ≠ Product GREEN. | vitest A/B slice · tsc · MCP history · [audit](./audits/MIX_WORKING_RESTORE_SCRATCH_EXPORT_2026-10-28.md) | `fdd9e8f…` | NEXT: test USER **albo** editor history wiring **albo** słyszalny export |
| 2026-10-28 | SCRATCH-PERSIST | Isolate Scratch CAS persist from mix-working | EXECUTED | PASS | `studio-scratch-persist.ts` kanon CAS. `studio-service` cienki, **0** importów mix-working. Stage 7 ścieżek. Vitest scratch-cas **6/6**. `tsc --noEmit` PASS. Editor/Sacred/mix-working **poza** stage. ≠ Product GREEN. | `git show 6014556` · vitest · tsc · [audit](./audits/SCRATCH_PERSIST_ISOLATION_2026-10-28.md) | `6014556…` | NEXT: Owner GO restore mix-working **albo** USER copy **albo** export encode |
| 2026-10-28 | GO-SB-ARCHIVE-8 | Archiwizacja §4 → CHANGELOG (room for persist isolation) | EXECUTED | PASS | Przeniesiono 3 najstarsze `EXECUTED` (`GATE-A` · `GO-SB-ARCHIVE-4` · `GATE-2R`) → CHANGELOG archive. Living 15→12, po SCRATCH-PERSIST + tym wierszu **14**. `P-NEXT-10` + `USER-COPY` BLOCKED zachowane. | Diff most + CHANGELOG archive table | _(ten commit)_ | Living tip/deploy → PROJECT_STATE |
| 2026-10-28 | SCRATCH-CAS-REV | Live reverse + SAMPLE/SCRATCH create + CAS | EXECUTED | PARTIAL | BufferSource reverse w istniejącym `StudioAudioEngine` (jeden ctx). `POST /tracks` VOCAL\|SAMPLE\|SCRATCH. `op=set_scratch` → `studio_cas_apply_clip_scratch`. MCP apply history **`20261028050115`**. Vitest slice **138/138**. Dirty editor nietknięty. Export encode **OUT**. ≠ Product GREEN. | vitest scratch-engine/state/cas + p5/p7 (bez dirty editor) · [audit](./audits/SCRATCH_REVERSE_CAS_2026-10-28.md) | _(lokalnie, pre-commit)_ | NEXT: path-scoped commit+push **albo** export encode |
| 2026-10-28 | ALIAS-DPL | alias / `dpl_*` @ `bb4857d` (bez OAuth) | EXECUTED | PARTIAL | Tip `bb4857d…` (`ls-remote`). GitHub Production **`7377291086`** **success** `2026-10-28T04:37:56Z` @ ten SHA · Vercel **success** · unique URL `bitrymdym-gef23don8-…` **302 SSO**. **`dpl_*` NOT VERIFIED**. **ALIAS NOT VERIFIED** (`www` 200, brak SHA bind). | `gh` deployments `7377291086` · commit status success · curl www 200 / unique 302 | `bb4857d…` | Bind alias/`dpl_*` wymaga OAuth/`vercel inspect` |
| 2026-10-28 | GO-SB-ARCHIVE-7 | Archiwizacja §4 → CHANGELOG (room for reverse/CAS) | EXECUTED | PASS | Przeniesiono 3 najstarsze `EXECUTED` (`GATE-3` · `GATE-2` · `GATE-1`) → CHANGELOG archive. Living 15→12, po SCRATCH-CAS-REV + ALIAS-DPL + tym wierszu **15**. `P-NEXT-10` + USER-COPY BLOCKED zachowane. | Diff most + CHANGELOG archive table | _(lokalnie, pre-commit)_ | Living tip/deploy → PROJECT_STATE |
| 2026-10-28 | STUDIO-C | Scratch DJ v1 PARTIAL vertical | EXECUTED | PARTIAL | Domain jog/cue/reverse/rate + export fail-closed. Catalog→TAKE→clip reuse `POST /api/catalog/copy` + `…/record/place`. Panel w recording Inspector (pointer+touch). `applyScratchLive` na istniejącym `StudioAudioEngine.playbackRate`. Vitest **131/131**. Live reverse / CAS persist / SAMPLE-SCRATCH create / export encode **OUT**. Dirty editor/service **nietknięte**. ≠ Product GREEN. | vitest scratch-* + p5/p7 guards · eslint · tsc · [audit](./audits/STUDIO_UNLOCK_AUDIT_2026-10-28.md) | _(ten commit)_ | NEXT: Scratch persist/create track **albo** BufferSource reverse **albo** prod USER copy |
| 2026-10-28 | STUDIO-A | Audyt Studio unlock | EXECUTED | PASS | Powierzchnia editor/service/API/CAS/REC/export/AuthZ. Sacred path-only. SAMPLE/SCRATCH typy bez create. Silnik HTMLAudio = brak native reverse. Place TAKE już istnieje. Prod USER copy **BLOCKED**. | [STUDIO_UNLOCK_AUDIT_2026-10-28.md](./audits/STUDIO_UNLOCK_AUDIT_2026-10-28.md) | _(ten commit)_ | Faza C PARTIAL done |
| 2026-10-28 | GO-SB-ARCHIVE-6 | Archiwizacja §4 → CHANGELOG (room for Studio unlock) | EXECUTED | PASS | Przeniesiono 3 najstarsze `EXECUTED` (`GATE-0` · `GO-SB-ARCHIVE-3` · `S13-RO`) → CHANGELOG archive. Living 15→12, po A/C + tym wierszu **15**. `P-NEXT-10` BLOCKED zachowany. | Diff most + CHANGELOG archive table | _(ten commit)_ | Living tip/deploy → PROJECT_STATE |
| 2026-10-28 | CAT-COPY | Catalog copy private TAKE | EXECUTED | PARTIAL | `POST /api/catalog/copy` zapisuje prywatny TAKE z `catalog/{uuid}/original.bin` po sniff + PUBLISHED+license + project.beat_id. Fail-closed bez zapisu. Provenance `takes.title`. Vitest **39/39**. Prod USER copy **NOT VERIFIED**. Scratch **OUT**. ≠ Product GREEN. | vitest catalog-originals + catalog-copy-service + copy route + audio-validation · eslint · tsc · [audit](./audits/CATALOG_COPY_E2E_2026-10-28.md) | _(ten commit)_ | NEXT: Scratch **albo** prod USER copy+cleanup |
| 2026-10-28 | CAT-SNIFF | Catalog originals OD-SC-02 content sniff | EXECUTED | PASS | Usunięto `CATALOG_CONTENT_GATE_NOT_IMPLEMENTED`. `sniffAudioContainer` + `validateCatalogOriginalContentSniff` w `audio-validation.ts`. Spoof/empty/unsupported → `CATALOG_CONTENT_*` 415. Sniff PASS → `COPY_NOT_IMPLEMENTED` · **zero writes**. Vitest **36/36**. Scratch **OUT**. ≠ Product GREEN. | vitest catalog-originals + audio-validation + backup-manifest · eslint · tsc | _(ten commit)_ | NEXT: copy E2E (test USER) **albo** Scratch |
| 2026-10-28 | CAT-PROBE | Catalog originals live Storage probe | EXECUTED | PASS | service_role upload/list/download/delete `catalog/8c288da2-9017-415e-b715-64e65d4a35e9/original.bin` **PASS** (16044 B WAV). Anon **DENIED**. Cleanup leftover **0** / `catalog_assets` **0**. Copy API **NOT RUN**. Scratch **OUT**. ≠ Product GREEN. | Node probe + host-guard · MCP leftover SELECT · [audit](./audits/CATALOG_ORIGINALS_LIVE_STORAGE_PROBE_2026-10-28.md) | _(ten commit)_ | NEXT: content sniff / copy E2E / Scratch — sniff **done** |
| 2026-10-27 | CAT-APPLY | Catalog originals prod apply | EXECUTED | PASS | MCP `apply_migration` **PASS**. History **`20261027225553` / `catalog_originals_storage_and_entity`** (drift vs repo `20261027220000` — nie repair). Read-back: `catalog_assets` RLS ON+FORCE · 4 Storage `catalog_originals_service_*` · grants SIDU service_role / deny client. Vitest **19/19**. Live probe **BLOCKED**. Scratch **OUT**. ≠ Product GREEN. | MCP list/apply/execute_sql · [audit](./audits/CATALOG_ORIGINALS_PROD_APPLY_2026-10-27.md) · vitest catalog+audio-validation | `6f3a728…` | NEXT: controlled live probe GO — **done** CAT-PROBE |
| 2026-10-27 | GATE-C | Catalog copy fail-closed (repo) | EXECUTED | PASS | Planner: unknown policies/prod → `CATALOG_STORAGE_POLICIES_UNAVAILABLE` · unpublished/unlicensed → `CATALOG_ASSET_NOT_COPYABLE` · content sniff fail-closed · dest key nie wymyślany · zero writes. Route 503/409/501 · `requireUser` · JSON 400. Vitest **19/19**. Prod apply **BLOCKED**. Scratch **OUT**. | `git show 5a6bc55` · vitest catalog-originals + audio-validation | `5a6bc55…` | Owner GO: prod apply `20261027220000` (checklist) **albo** content sniff |
| 2026-10-27 | GATE-B | alias / `dpl_*` @ `5200c6d` (bez OAuth) | EXECUTED | PARTIAL | Tip `5200c6d…` (`ls-remote` then). GitHub Production **`7372230897`** **success** `2026-10-27T22:42:24Z` @ ten SHA · Vercel **success** · unique URL `bitrymdym-j1sp78uxs-…` **302 SSO** · dashboard `…/8KYY2axTYMN4CKzsxEteqy857k5R`. **`dpl_*` NOT VERIFIED**. **ALIAS NOT VERIFIED** (`www` 200, brak SHA bind). | `gh` deployments `7372230897` · commit status success · curl www 200 / unique 302 | `5200c6d…` | Bind alias/`dpl_*` wymaga OAuth/`vercel inspect` |
| 2026-10-27 | GATE-A | Contabo poll journal RO (LEFT RUNNING) | EXECUTED | PASS | Owner: zostaw RUNNING. Status **enabled/active/running** PID **847** since 2026-10-23 20:47 CEST. `journalctl -n 80` = `claims_empty` / `busy=false`. Sekrety brak. **Nie** stop/start/enable. Audit appended. | `systemctl status/show` · `journalctl -n 80` · audit journal section | _(ten commit)_ | Poll zostaje. SHA hosta nadal NOT VERIFIED |
| 2026-10-27 | GO-SB-ARCHIVE-4 | Archiwizacja §4 → CHANGELOG (room for A/B/C) | EXECUTED | PASS | Przeniesiono 5 najstarszych `EXECUTED` (`GO-TEAM-CLOSE` · `GO-SESSION-CLOSE` · `CONTINUITY-RELIABILITY` · `COLD-START-CLOSE` · `GO-SB-ARCHIVE`) → CHANGELOG archive. Living 14→9, po A/B/C + tym wierszu **13**. `P-NEXT-10` BLOCKED zachowany. | Diff most + CHANGELOG archive table | _(ten commit)_ | Living tip/deploy → PROJECT_STATE |
| 2026-10-27 | GATE-2R | Contabo GO-HOST-RO retry (właściwy klucz) | EXECUTED | PASS | Live SSH **PASS**. Klucz `C:\Users\dawid\.ssh\bitrymdym-contabo-recovery-ed25519` (passphrase). Gate 2 MISSING/`BatchMode` 255 = zła tożsamość. Host `vmi3622761`. Oneshot **disabled/inactive**. Poll **enabled/active/running** PID 847 since 2026-10-23. `HAS_GIT=no`. Always-on **nie** enable. Audit zaktualizowany. | interactive ssh exit 0 · `hostname` · `systemctl` · `sudo -n test -d .git` | `5200c6d…` | Owner GO: co z żywym `bitrymdym-e3-worker-poll` — **done: zostaw + journal RO** |
| 2026-10-27 | GATE-3 | Implementation Catalog (policies+allowlist+skeleton) | EXECUTED | PARTIAL | Repo: OD-SC-02 gates + `catalog/` key w `validateObjectKey` · migracja `20261027220000_…` · copy skeleton 501 · **prod apply BLOCKED** · Scratch **OUT**. Tests vitest allowlist. PS: SHIPPED in repo / NOT in prod | `git show` paths · vitest audio-validation + catalog-originals | _(ten commit)_ | NEXT: prod apply GO **albo** content sniff **albo** Scratch (osobno) |
| 2026-10-27 | GATE-2 | Contabo GO-HOST-RO | EXECUTED | BLOCKED | Live SSH **NOT DONE — blocked on SSH**. Klucz `bitrymdym-e3-contabo` **MISSING**. Recovery name istnieje, `Permission denied (publickey)` exit 255. Always-on **nie** enable. Audit [CONTABO_GO_HOST_RO_2026-10-27.md](./audits/CONTABO_GO_HOST_RO_2026-10-27.md) · PS pointer | `Test-Path` · `ssh` BatchMode 255 | _(ten commit)_ | Owner: restore documented key albo osobny GO. Gate 3 Implementation Catalog |
| 2026-10-27 | GATE-1 | SFM staging/host RO planes | EXECUTED | PARTIAL | Audyt [SFM_PLANES_STAGING_HOST_RO_2026-10-27.md](./audits/SFM_PLANES_STAGING_HOST_RO_2026-10-27.md). (1) code `5212933` ancestor **VERIFIED**. (2–4) staging SHA/schema/worker **NOT VERIFIED** (brak targetu). (6) prod DB A–D+KIND_REJECT **VERIFIED RO** · 0 versions/jobs. Flaga **nie** ON. Host process = Gate 2. PS tylko wiersze SFM RO | `git merge-base` · MCP `list_migrations`/`list_projects`/`list_branches` · SELECT counts | _(ten commit)_ | Gate 2 Contabo GO-HOST-RO |
| 2026-10-27 | GATE-0 | alias / `dpl_*` best-effort (bez OAuth) | EXECUTED | PARTIAL | Living tip `1c34a53…` (`ls-remote`). GitHub Production **`7371927399`** **success** `2026-10-27T22:24:34Z` @ ten SHA · Vercel commit status **success** · unique URL `bitrymdym-jypwmgukh-…vercel.app` · dashboard `…/8N3C7ryXXx2LVaYt3G7ju5q1sirc`. **`dpl_*` NOT VERIFIED** (brak `vercel` CLI · unique URL SSO). **ALIAS NOT VERIFIED** (`www` HTTPS 200, brak bindowania SHA). GitHub last-20 = Production only. PS tip/deploy reconcile + CHANGELOG. Sacred / Studio status-only PRESERVE | `git ls-remote` `1c34a53` · GitHub deployment `7371927399` · `gh` commit status success · curl www 200 | `1c34a53…` (pre-this-row commit) | Gate 1 SFM staging/host RO. Alias/`dpl_*` nadal osobny OAuth jeśli Owner chce bind |
| 2026-10-27 | GO-SB-ARCHIVE-3 | Archiwizacja §4 → CHANGELOG (room for Gates 0–3) | EXECUTED | PASS | Przeniesiono 6 najstarszych `EXECUTED` (`KONTRAKT A–D` · `GO-5G-O` · `GO-5G-M` · `GO-5G-J` · `GO-5G-H` · `GO-5G-G`) → [CHANGELOG.md](../CHANGELOG.md) `### SESSION_BRIDGE archive`. Living `EXECUTED` 14→8, po tym wierszu **9**. `P-NEXT-10` BLOCKED zachowany. `PROJECT_STATE` nietknięty. Path-scoped commit+push allowlisty most+CHANGELOG | `git status` przed `43c60883…` · `HEAD`=`bde3009` (`ls-remote`) | `bde3009…` | Gate 0 alias/`dpl_*` best-effort, potem SFM RO · Contabo RO · Implementation Catalog |
| 2026-10-27 | S13-RO | Sample Catalog §13 Storage/allowlist read-only | EXECUTED | PARTIAL | Audyt RO: repo + SELECT prod. §13 policies/runtime allowlista **zostają NOT VERIFIED**. Implementation **NOT AUTHORIZED**. `PROJECT_STATE` NEXT/STOP nietknięty. Commit+push `64e7ff3` audit + CHANGELOG. Host/deploy tego SHA = po pushu | `git show 64e7ff3` (2 paths) · MCP SELECT buckets/policies/prefix counts | `64e7ff3…` | Implementation Catalog = osobne GO. Alias/`dpl_*` = osobne GO |
| 2026-10-27 | P-NEXT-10B | Commit+push allowlisty 06/08 (D02 kanoniczna) | EXECUTED | PARTIAL | Path-scoped commit+push 10 dirty ścieżek 06/08 (z 12). `PROJECT_STATE` + `CHANGELOG` już CLEAN na `main` (Unit 1 / archiwum). D02 = `docs/phases/PHASE_RECORDING_D02_ANONYMOUS_QT_DESIGN_FREEZE_ADDENDUM.md`. HEAD/`origin/main` = `77343b6…` (`ls-remote`). GitHub Production `7371560902` success `2026-10-27T22:05:04Z` @ ten SHA; Vercel commit status success; host `bitrymdym-r3m22qy0g-…vercel.app`. `dpl_*` / alias www / runtime SHA **NOT VERIFIED**. `PROJECT_STATE` nietknięty. Sacred / Studio / `SYSTEM_ARCHITECTURE` status-only PRESERVE. P-NEXT-10 BLOCKED zachowany jako historia | `git show 77343b6` (10 paths) · `ls-remote` `77343b6` · GitHub deployment `7371560902` | `77343b6…` | Alias / `dpl_*` = osobne GO. Produkt NEXT = osobny gate (nie Implementation Catalog) |
| 2026-10-27 | UNIT-2 | Closeout SESSION_BRIDGE: archiwum §4 + tip snapshot | EXECUTED | PARTIAL | Zarchiwizowano 3 najstarsze `EXECUTED` (`GO-5G-F` · `GO-5G-C` · `P-NEXT-10A`) → [CHANGELOG.md](../CHANGELOG.md) `### SESSION_BRIDGE archive`. Living `EXECUTED` 14→11, po tym wierszu **12**. `P-NEXT-10` BLOCKED zachowany. §2/§2.1/§5 → living Git `0449410…` (`ls-remote` zgodny). GitHub Production `7371268857` success `2026-10-27T21:49:06Z` @ ten SHA; Vercel commit status success; host `bitrymdym-absxk3egj-…vercel.app`. `dpl_*` / alias www / runtime SHA **NOT VERIFIED**. `PROJECT_STATE` nietknięty (Unit 1). Path-scoped commit+push allowlisty w tym unicie | `git rev-parse`/`ls-remote` `0449410` · GitHub deployment `7371268857` · hash porcelain poza allowlistą `bbd0660c…` | `0449410…` (tip przed tym commitem) | Po pushu nowy SHA ≠ SSOT PS. Alias / `dpl_*` = osobne GO. Produkt = STOP |
| 2026-10-27 | GO-TEAM-CLOSE | Audyt zespołu, smoke RO, reguła, commit, handoff | EXECUTED | PARTIAL | Faza 0 bez edycji. Etap 1: `security-auditor`, hash porcelain przed=po `18b4bc34…`, indeks pusty; read-only jest prośbą, blokada zapisu **NOT VERIFIED**. Etap 2: sekcja Zespół Cursor w `.cursor/rules/bitrymdym-ssot-over-ecc.mdc`. Commit+push jednego pliku `92a1262` `chore(cursor): establish autonomous team workflow`, rodzic `2d872e5`, `ls-remote` zgodny. GitHub Production `7370676473` success @ ten SHA; Vercel commit status success; `dpl_*` NOT READ; alias www i runtime SHA **NOT VERIFIED**. `PROJECT_STATE` / `CHANGELOG` / Sacred / Studio nietknięte. Ten zapis mostu bez kolejnego commit/push | `git show 92a1262` (1 ścieżka) · `ls-remote` `92a1262` · GitHub deployment `7370676473` · hash porcelain `18b4bc34…` | `92a1262…` | Commit tego pliku = osobne GO. Alias / `dpl_*` = osobne GO. Produkt = STOP |
| 2026-10-27 | GO-SESSION-CLOSE | Commit ciągłości, odczyt produkcji, handoff | EXECUTED | PARTIAL | Path-scoped commit+push `7897037` `fix(docs): harden session continuity`: reguła fraz sesji oraz dwie linijki §6 (bramka `HANDOFF BLOCKED`, checklist tip/deploy). Reszta tego pliku została poza commitem. Odczyt produkcji: GitHub Deployment `7369350599` Production `success` @ ten SHA; status Vercel `success`; www HTTPS 200 tytuł BitRymDym. Alias www i runtime SHA **NOT VERIFIED**. Bez edycji `PROJECT_STATE` / `CHANGELOG` / Sacred / Studio. Ten zapis handoffu bez kolejnego commit/push/deploy | `git ls-remote` `7897037` · `git show 7897037` (2 ścieżki) · GitHub API deployment `7369350599` · curl www 200 | `7897037…` | Commit pozostałego dirty mostu = osobne GO. Alias / `dpl_*` = osobne GO. Produkt = STOP |
| 2026-10-27 | CONTINUITY-RELIABILITY | Straż cyklu sesji: reguła = triggery, procedura = most | EXECUTED | PARTIAL | Skrócono frazy w `.cursor/rules/bitrymdym-ssot-over-ecc.mdc` do triggerów i straż `HANDOFF BLOCKED` (bez edycji CHANGELOG/PROJECT_STATE; §2 mostu nadal wolno). W §6 tego pliku usunięto nakaz aktualizacji PROJECT_STATE przy każdym handoffie. Testy: T1 PASS (subagent bez historii czatu) · T2 PASS · T3 PASS · T4 PASS na fixturze 15→`HANDOFF BLOCKED` (living tabela nienaruszona, licznik 12 po tym wierszu) · T5 PASS po korekcie snapshotu 502/170 · T6 NOT RUN (brak nowej rozmowy Ownera) · T7 PASS na tym samym subagencie (jeden krok: GO; implementacji nie zaczął). Bez commit/push/deploy | `git status` porcelain=502 staged=0 · `git rev-parse` `8b4235a` · `git ls-remote` ten sam SHA · parser §4 | _(brak commita)_ | Path-scoped commit reguły da się odseparować. Ten plik łączy COLD-START-CLOSE i ten pass — bez `git add -p`. Produkt = STOP |
| 2026-10-27 | COLD-START-CLOSE | Cold-start „Kontynuuj projekt” + handoff sesji | EXECUTED | PARTIAL | Cold-start bez nowego zadania. `HEAD`=`origin/main`=`8b4235a…` (`ls-remote`). Odświeżono §2/§2.1/§4/§5 tego pliku. Pomiar przed zapisem: porcelain=500 / unstaged 168. Po zapisie ten plik jest `M`, więc porcelain=501 / unstaged 169. `PROJECT_STATE` / `CHANGELOG` / Sacred / Studio / `SYSTEM_ARCHITECTURE` nietknięte. Bez commit/push/deploy. Deploy po `d462b22` **NOT VERIFIED** | `git rev-parse` · `git ls-remote` · `git status` | _(brak commita)_ | Zapis jest lokalny dirty. Path-scoped commit tego pliku = osobne GO. Produkt = STOP |
| 2026-10-27 | GO-SB-ARCHIVE | Archiwizacja §4 → CHANGELOG `### SESSION_BRIDGE archive` | EXECUTED | PASS | Przeniesiono 6 najstarszych `EXECUTED` (SESSION_BRIDGE gap audit · AUTONOMY READINESS · GO-3b · GO-3 · GO-2 · GO-1) do [CHANGELOG.md](../CHANGELOG.md) `### SESSION_BRIDGE archive` · `BLOCKED` `P-NEXT-10` zachowany w living · **bez** commit/push | Diff allowlista: `SESSION_BRIDGE.md` + `CHANGELOG.md` | _(brak commita)_ | Path-scoped commit obu plików = osobne GO |
| 2026-10-27 | KONTRAKT A–D | Autonomia / reuse / handoff (AGENTS+bridge+continuity+REUSE map) | EXECUTED | PARTIAL | Commit+push allowlisty 4 ścieżek: `AGENTS.md` · `docs/operations/SESSION_BRIDGE.md` · `docs/DOCUMENTATION_CONTINUITY.md` · `docs/architecture/REUSE_SSOT_MAP.md` · message `docs: encode BitRymDym autonomy and session handoff contract` · lokalny `HEAD`/`origin/main` = `fa5b7ca…` · **≠** nowy deploy claim | `git show fa5b7ca` · paths only | `fa5b7ca…` | Tip SSOT / deploy / NEXT → PROJECT_STATE (lag możliwy) · commit bridge refresh = osobne GO |
| 2026-10-27 | GO-5G-O | SESSION_BRIDGE tip reconcile → `d05aa4e` | EXECUTED | PARTIAL | Living snapshot O: tip `d05aa4e`; deploy `@ d462b22`; **HISTORY:** commit Q + push R → tip `db435ed` | Raporty O/Q/R · `git show db435ed` | `db435ed…` (Q) | Mixed WIP PS/CL = osobne GO |
| 2026-10-27 | GO-5G-M | Push jednego commita `d05aa4e` | EXECUTED | PASS | Push `origin/main` bez force; remote SHA potwierdzony (raport M) | Raport GO-5G-M · `ls-remote` / GitHub API w M | `d05aa4e…` | Deploy/alias re-verify = osobne GO |
| 2026-10-27 | GO-5G-J | Commit wyłącznie SESSION_BRIDGE | EXECUTED | PASS | Lokalny commit 1 pliku; message `docs: refresh session bridge snapshot` | `git show d05aa4e` · path only bridge | `d05aa4e…` | Push = GO-5G-M (done) |
| 2026-10-27 | GO-5G-H | SESSION_BRIDGE snapshot refresh §2/§2.1/§5 | EXECUTED | PARTIAL | HEAD/origin lokalnie `d462b22`; tip/deploy pointer → PROJECT_STATE; bez stage/commit/push then | Diff lokalny tylko `docs/operations/SESSION_BRIDGE.md`; raport GO-5G-H | later `d05aa4e…` (J) | Commit/push bridge = J/M (done) |
| 2026-10-27 | GO-5G-G | CHANGELOG wpis GO-5G-C | EXECUTED | PARTIAL | Dodano wpis tip `d462b22` / `dpl_7Xwqf…` / ALIAS VERIFIED; P-NEXT-06 zachowany; ≠ Product GREEN | Dirty `docs/CHANGELOG.md` + raport GO-5G-G | _(brak commita)_ | Commit CHANGELOG = osobne GO |
| 2026-10-27 | GO-5G-F | PROJECT_STATE §5 → §2 NEXT UNIT | EXECUTED | PASS | §5 zredukowany do pointera; STOP Owner; P-NEXT-06 ≠ product CLOSED | Dirty `docs/PROJECT_STATE.md` + raport GO-5G-F | _(brak commita)_ | Commit PROJECT_STATE = osobne GO |
| 2026-10-27 | GO-5G-C | PROJECT_STATE tip/deploy/alias reconcile | EXECUTED | PARTIAL | Living tip `d462b22` · `dpl_7Xwqf…` · DEPLOYMENT/ALIAS VERIFIED · ≠ PRODUCTION VERIFIED ≠ Product GREEN | Dirty `docs/PROJECT_STATE.md` + raporty GO-5G-B/C | _(brak commita)_ | Commit PROJECT_STATE = osobne GO |
| 2026-10-27 | P-NEXT-10A | Audyt blokera przed publikacją 06/08 | EXECUTED | PASS | Baza `03d889a` SAFE; D02 path potwierdzona | Raport 10A; `git show` triad; 1× plik D02 w `docs/phases/` | N/A (RO) | Czeka GO na P-NEXT-10B / push |
| 2026-10-27 | SESSION_BRIDGE gap audit | Uzupełnienie §2/§4 bridge (ten wpis) | EXECUTED | PARTIAL | Minimalna edycja tylko tego pliku; bez stage/commit/push | Diff lokalny `docs/operations/SESSION_BRIDGE.md` (po kontroli); raport agenta w czacie | _(brak commita)_ | Stage/commit tego pliku = osobne GO |
| 2026-10-27 | AUTONOMY READINESS | Audyt gotowości Cursor+ECC (×2 raporty) | EXECUTED | PARTIAL | A spełniony · B częściowy · C nie; `PARTIALLY READY` | Raporty w sesji Cursor (bez zapisu do repo); Task A–D + review | N/A | Bridge/tip/NEXT Owner; ≠ Product GREEN |
| 2026-10-27 | GO-3b | Strip trailing WS + commit triad bridge | EXECUTED | PASS | Commit lokalny 3 ścieżek; `--check` exit 0; **push nie** | `git show 03d889a` · paths: SESSION_BRIDGE, CONTINUITY, README | `03d889a…` | Push / tip PROJECT_STATE = osobne GO |
| 2026-10-27 | GO-3 | Path-scoped commit triad | EXECUTED | FAIL | `git diff --cached --check` trailing WS w SESSION_BRIDGE | Raport GO-3 BLOCKED | — | Naprawione w GO-3b |
| 2026-10-27 | GO-2 | RO audit zakresu GO-1 | EXECUTED | PASS | Zakres triad OK; bez Sacred/Studio | Raport GO-2 w sesji | N/A (RO) | — |
| 2026-10-27 | GO-1 | Utworzenie SESSION_BRIDGE + wskaźniki | EXECUTED | PASS | Szablon ACTIVE; CONTINUITY/README pointers | Treść w commitcie `03d889a` (dostarczona przez GO-3b) | `03d889a…` | — |

---

## 2026-10-27 — GO-5G-C: living tip / Production deploy / alias reconcile (docs-only)

**Status:** documentation only · **DEPLOYMENT VERIFIED** · **ALIAS VERIFIED** · **≠ PRODUCTION VERIFIED** · **≠ Product GREEN** · **≠ Implementation GO**
**FACT tip / HEAD:** **`d462b22ec73bbd5931492cc90b028e6c6af71441`** (`docs: populate session bridge execution history`; parent **`03d889a`**; ancestry includes prior docs tip **`2cc4cc1`**)
**FACT deploy (GO-5G-B evidence):** Vercel Production **`dpl_7XwqfE4jjXyTpPa3ozYMB4v4tro1`** · target **production** · **Ready** @ that SHA · GitHub Production deployment **`7354583257`** **success**
**FACT aliases:** **`www.bitrymdym.pl`** · **`bitrymdym.pl`** · **`bitrymdym.vercel.app`** → that `dpl_*` (**ALIAS VERIFIED**; evidence `vercel inspect` + Vercel commit status)
**Scope:** living tip / deploy / alias pointers in [PROJECT_STATE.md](./PROJECT_STATE.md) §2 (+ §2c) reconciled to tip `d462b22…` · prior tip/deploy era **`2cc4cc1…` / `7350328308` / www→SHA then UNVERIFIED** kept as **Prior / HISTORY**
**Explicit non-claim:** Ready + alias binding **≠** full production product verification · **≠** Product GREEN · P-NEXT-06 as Prior/HISTORY = previous tip/deploy reference only — **≠** closure of QT / OD-SC / Sample Catalog product track (Implementation still **NOT AUTHORIZED**; §13 blockers remain)
**Docs updated:** [PROJECT_STATE.md](./PROJECT_STATE.md) (tip/deploy/alias living rows; this CHANGELOG entry) · SESSION_BRIDGE tip refresh = **out of this entry** (osobne GO)
**Unchanged / out of scope:** Sacred WIP · dirty WIP · app code · no commit/push of this CHANGELOG in GO-5G-G · no deploy/alias mutation

## 2026-10-27 — P-NEXT-06A/C/B: tip/deploy + QT labels + OD-SC discoverability (docs-only)

**Status:** documentation only · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED** · **≠ Implementation GO**
**FACT tip (pre-docs):** **`2cc4cc1c3e3a3536e7bf8fbae48dca3485700d5b`** · GitHub Production deployment **`7350328308`** **success** `2026-10-27T04:26:54Z` · alias **`www.bitrymdym.pl` → SHA UNVERIFIED**
**06A:** living tip/deploy pointers → `2cc4cc1…` + deploy id; prior tip **`11a664b`** kept as HISTORY where evidence belongs
**06C:** living QT LIMITS = **Account Level / OD-QT-01**; Sample Policy / `getSamplePolicy` labeled **HISTORY** in handoffs; D02 15s vs 30s both labeled; STU header stamp vs planes; P4 freeze-era vs PROJECT_STATE SHIPPED — dual labels; runtime QT **NOT VERIFIED**
**06B:** OD-SC-01…05 CLOSED pointers in DECISION_LOG + OPEN_DECISIONS + functional map; Storage policy blockers §13 **retained** · **Implementation NOT AUTHORIZED**
**Docs updated:** PROJECT_STATE · FINAL_COLD_START · MASTER_HANDOFF · PROJECT_FUNCTIONAL_MAP · RECORDING.md · D02 addendum · P4 freeze · OPEN_DECISIONS · DECISION_LOG · handoffs prompts · this CHANGELOG
**Unchanged / out of scope:** Sacred WIP · dirty WIP · `SYSTEM_ARCHITECTURE.md` (dirty `M`) · app code · no commit/push/deploy in this GO

## 2026-10-26 — OD-QT-01: QT LIMITS axis = Account Level (docs-only)

**Status:** documentation only · Owner D1/B-QT = **B** · **≠** Implementation GO · **≠** runtime cutover · **≠ Product GREEN**
**Decision:** [DECISION_LOG.md](./decisions/DECISION_LOG.md) · **OD-QT-01** — living QT LIMITS (duration / TTL / caps / QUICK|FULL) = **Account Level**; P1 Sample Policy as LIMITS axis = HISTORY
**Docs synced:** OPEN_DECISIONS (EPIC-P3 TTL) · MASTER_SSOT §4 · §18–23 · RECORDING.md P3 TTL/cap · PROJECT_STATE §3.1 · PROJECT_FUNCTIONAL_MAP (QT row + sprzeczności)
**Explicit non-claim:** eligibility/Sacred WIP not audited · code may still enforce Sample Policy until osobne Implementation GO · OD-04/07/15/16 unchanged OPEN · Premium Retention HOLD · SFM GREEN NOT CLAIMED
**Not done:** commit/push/deploy of this sync (Owner staging decision) · runtime AuthZ change · Product GREEN

## 2026-10-26 — Docs cold-start sync (tip `11a664b`)

**Status:** documentation only · **≠ Product GREEN**
**FACT tip (pre-docs):** **`11a664b`** · GitHub Production **success** `2026-10-26T20:11:21Z` (re-check Deployments after this push)
**App ancestry (already on main):** UserMenu disclosure · tablet nav `@ lg` (`c702d27`) · Premium keyboard table scroll (`11d6042`) · katalog/auth a11y continuum
**Docs updated:** [PROJECT_STATE.md](./PROJECT_STATE.md) · [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md) · [PROJECT_FUNCTIONAL_MAP.md](./PROJECT_FUNCTIONAL_MAP.md) · [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) · [handoffs/MASTER_START_PROMPT_*_PL.md](./handoffs/) · [README.md](./README.md) · audit pointer [FULL_PRODUCT_FUNCTIONAL_AUDIT_2026-10-25.md](./audits/FULL_PRODUCT_FUNCTIONAL_AUDIT_2026-10-25.md)
**Evidence recorded:** PRODUCTION UI UserMenu **PARTIAL** (AX/Escape/hit PASS; Tab/`focus-visible` NOT VERIFIED) · USER RLS Owner-reported PASS (2026-10-25) unchanged · Premium Retention **HOLD** · OD-04/07/15/16 **OPEN** · SFM GREEN **NOT CLAIMED**
**Unchanged:** Sacred WIP · dirty WIP · no Studio protected file opens · no Product GREEN

## 2026-10-25 — Premium Gold retention = 28 days (Owner; HOLD unchanged)

**Status:** Owner decision · **code + docs** · **Premium Retention remains HOLD** (no cron/janitor/activation)
**Decision:** [decisions/PREMIUM_GOLD_RETENTION_28D_OWNER_DECISION_2026-10-25.md](./decisions/PREMIUM_GOLD_RETENTION_28D_OWNER_DECISION_2026-10-25.md)
**Code:** `PREMIUM_TIER_MATRIX.GOLD.artifactRetentionSeconds` → **28 × DAY** (was 30); aligns with `PREMIUM_RETENTION_DAYS.GOLD` / OD-EXPORT-12 · SILVER **30d** unchanged · `retentionSecondsForPremium(true)` remains SILVER class (30d) · `isGoldRetentionProductionEnabled()` still **false** (90d design-only)
**Docs:** W2 / W2B · PROJECT_STATE · `/premium` · decision file · audit closeout
**Verify:** vitest **48 PASS** / 4 files (`w2a`, `e3-1`, `e3-5`, `premium-export-policy`) — GOLD 28d + SILVER/`premiumActive` 30d
**Not done:** commit/push/deploy · Retention cron · Storage/DB mutations · OD-15/OD-16 unchanged **OPEN** · Premium Retention **HOLD**

## 2026-10-25 — Sample Catalog & Scratch DJ v1 product contract (docs-only)

**Status:** documentation only · **implementation NOT authorized** · **NOT SHIPPED**
**New:** [decisions/SAMPLE_CATALOG_AND_DJ_SCRATCH_CONTRACT.md](./decisions/SAMPLE_CATALOG_AND_DJ_SCRATCH_CONTRACT.md) — platform catalog → private TAKE copy → Studio clip; Scratch DJ v1; export/CAS/reuse rules
**Pointers:** [ssot/MASTER_SSOT_v0.1.md](./ssot/MASTER_SSOT_v0.1.md) (version **0.1** unchanged) · [architecture/REUSE_SSOT_MAP.md](./architecture/REUSE_SSOT_MAP.md) · [architecture/SYSTEM_ARCHITECTURE.md](./architecture/SYSTEM_ARCHITECTURE.md) · [PROJECT_STATE.md](./PROJECT_STATE.md)
**Unchanged:** living tip / production SHA claims not re-verified (no Git in this GO) · OD-15 / OD-16 **OPEN** · Premium Retention **HOLD** · Sacred WIP **PRESERVE**
**Skipped (dirty / blocked):** `OPEN_DECISIONS.md` · `DECISION_LOG.md` · `RECORDING.md` · `studio-service.ts` · `studio-editor.tsx` · no `STUDIO_MASTER_ARCHITECTURE.md` created

## 2026-10-24 — Studio delivery docs consolidation + cold-start handoffs

**Status:** docs-only consolidation after Studio / RLS / theme session
**Tip (app):** **`35543c8`** (VOCAL unarmed) · parent **`1e75fd3`** (owner SELECT + local Studio evidence)
**Prod (read-only):** GitHub Production deployment **success** @ `35543c8` · public smoke **PASS** · admin authenticated visual **PASS** · USER RLS / audio-REC / migracje **NOT VERIFIED / NOT RUN**
**Docs:** [PROJECT_FUNCTIONAL_MAP.md](./PROJECT_FUNCTIONAL_MAP.md) · [handoffs/MASTER_START_PROMPT_CHATGPT_PL.md](./handoffs/MASTER_START_PROMPT_CHATGPT_PL.md) · [handoffs/MASTER_START_PROMPT_CURSOR_PL.md](./handoffs/MASTER_START_PROMPT_CURSOR_PL.md) · PROJECT_STATE / FINAL_COLD_START / MASTER_HANDOFF / AGENTS skills protocol
**OD-15 / OD-16:** remain **OPEN** · Premium Retention **HOLD** · Sacred WIP **PRESERVE**

## 2026-10-24 — logged-in theme chrome BLOCKED (no Docker / no session)

**Status:** evidence-only · **OD-15 / OD-16 remain OPEN**
**Result:** Studio / takes / account / downloads / settings / library = **BLOCKED** — Docker Desktop absent; local Supabase down; all six routes redirect to `/sign-in`; auth not spoofed; no logged-in PNGs
**Evidence:** [audits/_visual_theme_logged_in_2026-10-24/README.md](./audits/_visual_theme_logged_in_2026-10-24/README.md)

## 2026-10-24 — global dark chrome: toggle by auth + route pass

**Status:** additive · **OD-15 / OD-16 remain OPEN**
**Chrome:** ThemeToggle immediately before Zaloguj / UserMenu (mobile too) · `/auth/*` AuthThemeBar layout · downloads wash → `--brd-paper`
**Evidence:** [audits/_visual_theme_global_routes_2026-10-24/README.md](./audits/_visual_theme_global_routes_2026-10-24/README.md) · logged-in Studio/account/takes/settings **NOT VERIFIED**

## 2026-10-24 — on-media foam + theme toggle evidence follow-up

**Status:** additive fix on `f3b8e75` · **OD-15 / OD-16 remain OPEN**
**Fix:** `--brd-on-media` for light text on photo overlays (home / VisualScene / `onDark`); paper stays surface token
**Evidence:** storageState-seeded Playwright asserts (no post-load `data-theme` spoof) · overlay pixel contrast · [audits/_visual_theme_followup_on_media_2026-10-24/README.md](./audits/_visual_theme_followup_on_media_2026-10-24/README.md)
**Not verified:** logged-in Studio/takes/account · production UI smoke · FOUC via screenshot alone

## 2026-10-24 — global dark theme default + light toggle

**Status:** additive Owner direction · **OD-15 / OD-16 remain OPEN** · Studio V2 structure **unchanged**
**Default:** `html[data-theme="dark"]` (control-room graphite + REC `#db5a5a`) · light = paper zine
**Persist:** `localStorage bitrymdym.theme` · FOUC boot script · toggle in SiteHeader / auth bar
**Docs:** [decisions/VISUAL_DIRECTION_GLOBAL_DARK_DEFAULT_2026-10-24.md](./decisions/VISUAL_DIRECTION_GLOBAL_DARK_DEFAULT_2026-10-24.md)
**Evidence:** [audits/_visual_theme_global_dark_2026-10-24/README.md](./audits/_visual_theme_global_dark_2026-10-24/README.md)

## 2026-10-24 — visual evidence correction (viewport PNG)

**Status:** evidence-only · no chrome / product UI change
**Fix:** replaced Cursor-panel PNGs (IHDR **489×698**, misleading names) with Playwright captures **1280×800** and **390×844**, DevTools hidden · Studio logged-in still **NOT VERIFIED**
**Evidence:** [audits/_visual_followup_2026-10-24/README.md](./audits/_visual_followup_2026-10-24/README.md)

## 2026-10-24 — visual follow-up: copy + control-room REC AA

**Status:** additive polish on `e160f9d` · **OD-15 / OD-16 remain OPEN** · Studio V2 structure **unchanged**
**Copy:** natural PL on home / beats / beat Quick Take intro / takes archive / catalog “Wyróżniony” · no OD-16 close
**Contrast:** control-room `--brd-rec: #db5a5a` (~4.74:1 on `#161918`); public REC hex unchanged
**Seam:** paper header over graphite kept as intentional frame (local fixture screenshots) · live Studio UI **NOT VERIFIED** (auth gate)
**Evidence:** [audits/_visual_followup_2026-10-24/README.md](./audits/_visual_followup_2026-10-24/README.md)

## 2026-10-24 — visual direction: paper zine + control room

**Status:** additive Owner visual direction · **OD-15 / OD-16 remain OPEN** · Studio Visual Parity V2 structural contracts **unchanged**
**Surfaces:** public (`/`, `/beats`, `/beat/[id]` + Quick Take) → paper zine / label cover · Studio + `/account/takes` → night graphite via `data-brd-surface="control-room"` (not global `tone="studio"`)
**Tokens:** `--brd-amber`, `--brd-recess` / `--brd-recess-fg` · control-room remap in `globals.css`
**Docs:** [decisions/VISUAL_DIRECTION_ZINE_CONTROL_ROOM_2026-10-24.md](./decisions/VISUAL_DIRECTION_ZINE_CONTROL_ROOM_2026-10-24.md)
**Out:** schema/migrations/prod audio · Sacred WIP · account/library/settings global repaint · closing OD-15/16

## 2026-10-24 — local ↔ GitHub main reconciliation

**Status:** local HEAD = `origin/main` (0/0) · reconcile merge **`4b14ac9`** (`b55b5fb` + `90e538d` + `800f611`) · SESSION VERIFY docs **`61fba99`** · dirty WIP **PRESERVE** (Premium Retention HOLD · registries · Sacred WIP)
**Conflicts resolved (both sides kept):** `README.md` (FX parity + media suite) · `docs/CHANGELOG.md` · `docs/FINAL_COLD_START_HANDOFF.md` (Contabo SSH NOT VERIFIED · cold-start §0A)
**Checks:** `media-suite-selection` + `mp3-qc-reject` → **5/5 PASS** · production deploy **NOT RE-VERIFIED**
**Not published as app WIP:** package.json / vitest Premium deltas · OPEN_DECISIONS / DECISION_LOG dirty · Sacred WIP

## 2026-10-24 — documentation consolidation & cold-start recovery (docs-only)

**Status:** docs inventory + SSOT tip planes reconciled · **no** commit / push / branch switch / prod mutation / migration apply in this session
**Verified (read-only git):** local HEAD **`96e4c31`** · `origin/main` **`800f611`** · local **behind by 2** · Sacred WIP SHA256 **MATCH** · dirty worktree **PRESERVE**
**Production deploy:** **NOT RE-VERIFIED** this session · last documented READY **`dpl_31mz…` @ `0a565c0`** (2026-10-19) · re-check with `vercel inspect`
**Updated docs:** [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md) §0 SESSION VERIFY · [PROJECT_STATE.md](./PROJECT_STATE.md) §2 + **§2c connections** · [DOCUMENTATION_CONTINUITY.md](./DOCUMENTATION_CONTINUITY.md) entry order · [README.md](./README.md) ownership · [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) pointer · [runbooks/PRODUCTION_BOOTSTRAP.md](./runbooks/PRODUCTION_BOOTSTRAP.md) connections · evidence [audits/DOCUMENTATION_CONSOLIDATION_COLD_START_2026-10-24.md](./audits/DOCUMENTATION_CONSOLIDATION_COLD_START_2026-10-24.md)
**Not modified (dirty / foreign risk):** [decisions/OPEN_DECISIONS.md](./decisions/OPEN_DECISIONS.md) · [decisions/DECISION_LOG.md](./decisions/DECISION_LOG.md) — proposed registry entries only in the audit evidence file
**Premium Retention:** HOLD · local untracked only · see [PREMIUM_RETENTION_FENCING_CONTRACT.md](./decisions/PREMIUM_RETENTION_FENCING_CONTRACT.md)

## 2026-10-23 — polityka autonomii wykonawczej

**Status:** polityka zapisana w [AGENTS.md](../AGENTS.md). Ten wpis nie jest wdrożeniem i nie zamyka OD-15.
**Zakres:** zwykłe zlecenie obejmuje implementację, testy, commit, push na `main` i standardowy auto-deploy Vercel bez osobnego pytania. Pull request nie jest obowiązkowy. Bramki utraty danych, force-push, sekretów, infrastruktury poza pipeline i Sacred WIP zostają.
**Spójność:** [DOCUMENTATION_CONTINUITY.md](./DOCUMENTATION_CONTINUITY.md) · [README.md](./README.md) · instrukcje wykonawcze w [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md).

## 2026-10-19 — STU-16 Evidence V2/V3 (docs-only)

**Status:** still **`STU-16 LIMITED PRODUCTION PASS`** · **≠** Production GREEN · no app code / prod write / Cron invoke / commit in this entry
**Evidence V2 (read-only, same day):** XP ledger **PASS** — one `creator_experience_events` row `TAKE_READY` / idempotency `take_ready:f0cbcc6e-2dac-419e-bc5c-c2407495d6cc` / amount 10 / unique index · SQL semantic parity **PASS** (TTL 900, DEFINER claim, INVOKER release, `search_path=''`, `service_role` EXECUTE) · Git migration timestamp `20261018120000` vs prod history `20261018154129` · SQL byte-for-byte **NOT VERIFIED**
**Evidence V3 (observability, 2026-10-19 ~13:50Z):** Cron schedule **PASS** on live project (`/api/cron/takes-janitor` · `0 0 * * *`) · deployment `dpl_31mz…` created **2026-10-19 08:31Z** (after that day's 00:00Z tick) · `vercel logs --query takes-janitor --since 48h` → **no logs** · postgres logs show migration apply `2026-10-18T15:41:29Z` only, not a janitor RPC · Cron fire **NOT VERIFIED** · next natural tick **2026-10-20 00:00:00Z** (02:00 Europe/Warsaw) · QA UTC-day sessions **2/3** · pending **0** (preflight only; no claim)
**Still NOT VERIFIED:** janitor Cron fire · janitor cleanup counters · wall-clock 900 s · concurrency load · SQL byte-for-byte
**Local tests:** not re-run in V3 (prior session same day: 6 files / 50 PASS — historical)

## 2026-10-19 — STU-16 LIMITED PRODUCTION PASS + consolidated audit (docs-only)

**Status:** **`STU-16 LIMITED PRODUCTION PASS`** · docs SSOT reconcile after controlled production GO + read-only security/TTL/XP/SQL audit · **no** app code / migration / prod write / deploy / commit in the audit session itself · **≠** Production GREEN
**Confirmed (historical Owner GO evidence, not re-executed in audit session):** F-A1 claim→signed upload→finalize `READY` · F-B2 HTTP 409 `CONCURRENT_SESSION` · F-B1 idempotent finalize · soft-delete cleanup of exact `takeId`/`object_key` · fixture `src/lib/beats/fixtures/chromium-mediarecorder-opus.webm` (43 589 B, duration 3 s) · QA USER `418a6a91-ec4a-47a4-af72-e9dae39c25e0` · beat `fd1f8593-10e6-4a9d-b234-5726a9a5db2e` · take `f0cbcc6e-2dac-419e-bc5c-c2407495d6cc` · day-cap after retry **2/3** FREE (no soft-delete refund)
**Prior fixture miss:** ~0.25 s silent WAV → `DURATION_PROBE_FAILED` because `Math.round(0.25)=0` below `BEAT_DURATION_MIN` (1) — WAV container itself readable by music-metadata
**Audit (this session, read-only):** reject client-chosen `ownerId`/`objectKey`/`takeId` · claim DEFINER + release INVOKER + TTL **900** re-confirmed · `hookTakeReadyAuth` → `awardTakeReady` with idempotency key `take_ready:{takeId}` + `ignoreAwardErrors` (XP failure must not unwind READY) · janitor Cron `0 0 * * *` + `CRON_SECRET` configured in code/`vercel.json` · **Cron fire NOT VERIFIED** · SQL byte-for-byte **NOT VERIFIED** (grants/TTL/security markers PASS)
**Safe local tests run:** `audio-duration.chromium-webm` + `award-config` + `wave2-unit` + `p2-replace-unit` → **26/26 PASS**
**Still NOT VERIFIED / next GO:** XP prod ledger · wall-clock 900 s · janitor Cron fire · concurrency load · optional SQL body hash parity
**Planes:** tip parent **`0a565c0`** · live docs dpl last-known **`dpl_31mz…` @ `0a565c0`** · app tip **`d12e38e`**
**Canonical:** [PROJECT_STATE.md](./PROJECT_STATE.md) · [RECORDING.md](./architecture/RECORDING.md)

## 2026-10-19 — STU-16 tip and deployment evidence reconciled (docs-only)

**Status:** **DOCS ONLY** · Owner GO · updates living tip/dpl pointers after local-evidence commit auto-deploy · **no** app code / migration / prod DB write / Storage / Auth mutation / manual deploy in this session · **`supabase/config.toml` port WIP not included**
**Confirmed planes:** tip / `origin/main` parent **`0f07e846b116b11212b276427b243380633c5a7f` (`0f07e84`)** — `docs: record local STU-16 verification evidence` · live docs deployment **`dpl_4d5KefeYNbBgqTYfYmwnZFJgCivb`** READY @ **`0f07e84`** (build log Commit: 0f07e84) · **app tip unchanged `d12e38e`** · docs auto-deploy ≠ new application-code deploy
**Local evidence (unchanged; not re-run here):** last documented live suite **17/17 PASS** — see entry below
**HISTORY:** earlier STU-16 SHA verify **`dpl_Eoror2bbVeu896BtrCtysicNYPuZ` @ `9bd1f86`**
**Still NOT VERIFIED (production):** functional E2E · `SESSION_DAY_CAP` runtime · concurrency · janitor schedule · SQL byte-for-byte vs Git · STU-16 **not** Production GREEN · status remains **NOT VERIFIED — NO PRODUCTION FUNCTIONAL PASS**
**Canonical:** [PROJECT_STATE.md](./PROJECT_STATE.md) · [RECORDING.md](./architecture/RECORDING.md)

## 2026-10-19 — STU-16 local live integration verified (docs-only)

**Status:** **DOCS ONLY** · Owner GO · records local STU-16 live suite evidence + local Supabase port remapping · **no** app code / migration / prod DB write / Storage / Auth mutation / deploy in this docs session · **`supabase/config.toml` port WIP not included in this commit**
**Local ports:** Windows excluded TCP **54224–54323** blocked prior API/DB/studio/shadow · remapped to API **54421** · DB **54422** · shadow **54420** · Studio **54423** · Inbucket **54324** (unchanged) · `npx supabase start` from backup **without** `db reset` · Auth `http://127.0.0.1:54421/auth/v1/health` → **HTTP 200**
**Local live suite:** `npx vitest run --config vitest.integration.config.ts src/lib/takes/stu16-pending-upload-window-live.test.ts --reporter=verbose` → **17 passed / 0 failed / 0 skipped** · exit **0** · ~4.2 s · TTL via **`created_at` backdate** (not wall-clock 900 s)
**Also recorded (superseded as live dpl by tip/dpl reconcile above):** Vercel **`dpl_Eoror2bbVeu896BtrCtysicNYPuZ`** commit SHA **VERIFIED** @ **`9bd1f86`** (READY ≠ functional GREEN; later live alias = `dpl_4d5Kefe…` @ `0f07e84`)
**Still NOT VERIFIED (production):** functional E2E · `SESSION_DAY_CAP` runtime · concurrency · janitor schedule · SQL byte-for-byte vs Git · STU-16 **not** Production GREEN
**Canonical:** [PROJECT_STATE.md](./PROJECT_STATE.md) · [RECORDING.md](./architecture/RECORDING.md)

## 2026-10-19 — STU-16 production database evidence reconciled

**Status:** **DOCS ONLY** · Owner GO · reconciles living SSOT with READ-ONLY Supabase Production + STU-16 audit evidence · **no** code / migration / DB write / Storage / Auth / deploy / commit in this docs session
**Production DB migration apply:** **VERIFIED BY READ-ONLY AUDIT** · project **`rzzxrgcdogkybkiidqgw`** · history version **`20261018154129`** / name **`stu16_pending_upload_window`** · Git file `supabase/migrations/20261018120000_stu16_pending_upload_window.sql` (commit **`c2be3b0`**) · **timestamp drift** Git `20261018120000` ≠ DB `20261018154129` (name aligned; not treated as confirmed schema FAIL; no re-apply)
**Checked in audit scope:** live TTL **900 s** · app constant **900** · STU-16 functions present · `search_path=''` · claim DEFINER / release INVOKER · `EXECUTE` for `service_role` (`anon`/`authenticated` none) · window/storage/advisory markers in defs · **not** full byte-for-byte body compare
**Still NOT VERIFIED (at time of this entry):** Production functional verification · `SESSION_DAY_CAP` runtime/E2E · concurrency · Vercel deployment commit SHA — **later same day:** Vercel SHA **VERIFIED** and **local live 17/17 PASS** recorded in [entry above](#2026-10-19--stu-16-local-live-integration-verified-docs-only); production functional / prod concurrency / prod janitor / SQL byte-for-byte remain NOT VERIFIED · STU-16 **not** closed as Production GREEN
**Canonical:** [PROJECT_STATE.md](./PROJECT_STATE.md) · [RECORDING.md](./architecture/RECORDING.md)

## 2026-10-19 — SSOT tip/plane reconcile (docs-only; no app change)

**Status:** **DOCS ONLY** · no code / migration / DB / Storage / Auth / deploy / commit in the reconcile session itself · corrects living tip/deploy pointers after cold-start audit
**Planes:** docs tip / `origin/main` = **`d2fc609`** · app tip = **`d12e38e`** · last alias-control (re-verified 2026-10-19 ~08:23 +0200): **`dpl_4Mhme5x9QYk1vSigcGCx8NYyLZnX`** READY serves `www.bitrymdym.pl` / `bitrymdym.pl` · exact dpl commit SHA **NOT VERIFIED** in Vercel CLI meta · HISTORY: **`dpl_6K73CZWphFdfPz4JjrvLapERTjwT`** READY (~06:09 +0200; BPM UX functional deploy; superseded for those aliases at the 08:23 control; still READY ≠ failed)
**Also corrected:** STU-16 Git plane (code on `main` @ `c2be3b0`; at tip/plane time Production DB apply was still **NOT VERIFIED** — **superseded** by [STU-16 production database evidence reconciled](#2026-10-19--stu-16-production-database-evidence-reconciled) later the same day) · MASTER / FINAL history stamps no longer read as current tip · living SSOT = [PROJECT_STATE.md](./PROJECT_STATE.md)

## 2026-10-19 — BPM CONFLICT labeling UX CLOSED (app on production; this entry = docs closeout)

**Status:** **BPM CONFLICT LABELING CLOSED** · functional commit **`d12e38e64423b28ec34f04659712147de4966a18`** (`d12e38e`, `fix(bpm): clarify conflict hypothesis labels`, parent `d70be665…`) on `origin/main` · Vercel production **`dpl_6K73CZWphFdfPz4JjrvLapERTjwT`** READY · target Production · aliases include `www.bitrymdym.pl` · auto-deploy after push (no separate promote in the QA session) · **no** DB / Storage / beat metadata / WAV BPM mutation · **no** DSP / `bpm-resolve` / `bpm-uncertainty` envelope algorithm change
**Post-closeout note (2026-10-19 SSOT reconcile):** subsequent docs tip **`d2fc609`** auto-deployed; at alias-control ~08:23 +0200 live `www`/`apex` pointed at **`dpl_4Mhme…`** (app code for this UX fix still `d12e38e`). `dpl_6K73…` remains HISTORY for the functional BPM UX deploy — READY, not failed. Exact commit SHA of `dpl_4Mhme…` **NOT VERIFIED** in CLI meta.
**Implementation files:** `src/lib/beats/bpm-uncertainty-ui.ts` · `src/lib/beats/bpm-uncertainty-ui.test.ts` only
**UX contract (CONFLICT presentation):** labels `Hipoteza {n} BPM` · no „główna/alternatywna hipoteza” from array index · hint `Najwyższy score sygnałowy (0.xx)` only when clear composite margin `>= 0.05` · close scores → no quality hint · option order follows envelope hypotheses (not composite sort) · copy includes `Ranking sygnałowy nie oznacza automatycznej decyzji o tempie` (+ optional reason) · model keeps `recommendedBpm = null`, `requiresSelection = true`, `canProceed = false`, `defaultSelectionMode = null` · explicit user pick required · AUTO path unchanged
**Regression tests (this verification):** `bpm-uncertainty-ui` 19/19 · `bpm-uncertainty` 21/21 · `bpm-resolve` 33/33 · `bpm-quality-v2` 18/18 · **91/91 PASS**
**Isolated verification:** offline local `PawejJaBokoTy-6.wav` → envelope `CONFLICT` / `RATIO_1_5_AMBIGUITY` · `buildBpmUxModel` + SSR `BpmUncertaintyField` · labels / score hint on 100 / no auto-recommend / selection gate · presentation order 65 → 99 → 100 → 101 · verdict `PASS — ISOLATED E2E VERIFIED` (model + SSR; **not** full browser form E2E)
**NOT VERIFIED / NOT CLAIMED:** RTL component suite · Playwright form E2E · local `:3100` (unavailable that session) · `scripts/_e2e-bpm-uncertainty-verify.ts` (writes `docs/audits/`) · live production CONFLICT UI after analyze · ground-truth tempo of WAV-6
**WAV-6 (separate, OPEN for tempo):** production stored BPM **65** unchanged · signal/segments ~99–101 · conflict reason `RATIO_1_5_AMBIGUITY` · **do not** treat 100 as confirmed ground truth · Owner listen / data correction = separate GO · UX labeling closure ≠ BPM metadata correction
**Sacred WIP:** `src/lib/takes/recording-eligibility-service.ts` SHA-256 `5AE4C2311704DCDAE51CE36D8E69E1CA162F0C55AB14866EB30E73DC50EEECB9` MATCH · dirty worktree (live tests + untracked audits/scripts) **preserved** · not part of `d12e38e`
**Closure rules:** no further functional commit / push / deploy for this UX fix without a new concrete bug · no BPM algorithm change · no WAV-6 metadata edit under this closure · optional Playwright form E2E = independent QA backlog item, **non-blocking** for this closeout
**Canonical living tip / deploy pointers:** [PROJECT_STATE.md](./PROJECT_STATE.md) · design semantics: [BPM_UNCERTAINTY_UX_DESIGN.md](./architecture/BPM_UNCERTAINTY_UX_DESIGN.md) §6.1

## 2026-10-18 — STU-16: server upload window for PENDING_UPLOAD, p4 fixture leak fixed (local only)

**Status:** **LOCAL ONLY** · **NOT COMMITTED · NOT PUSHED · NOT DEPLOYED** · migration **not applied in production** · no production data / Auth / Storage change
**Addendum (2026-10-19 SSOT reconcile — Git plane):** the status line above is **HISTORICAL wording** from the day the entry was drafted. Verified Git history shows STU-16 **landed on `main`** as commit **`c2be3b0159deb02481dd402bd276ad35bf34b273` (`c2be3b0`)**, subject `fix(recording): finalize pending upload window and integration cleanup`, including migration file `supabase/migrations/20261018120000_stu16_pending_upload_window.sql` and app wiring (janitor / claim / config / tests).
**Addendum (2026-10-19 — Production DB evidence):** **Production DB migration apply: VERIFIED BY READ-ONLY AUDIT** — history `20261018154129` / `stu16_pending_upload_window` on project `rzzxrgcdogkybkiidqgw` · Git timestamp drift noted · TTL 900 · defs/grants checked in audit scope. **Production functional verification: NOT VERIFIED.** Do not claim STU-16 Production GREEN. Details: [entry above](#2026-10-19--stu-16-production-database-evidence-reconciled) · [PROJECT_STATE.md](./PROJECT_STATE.md).
**Server (local migration `20261018120000_stu16_pending_upload_window.sql`):** `take_pending_upload_window_seconds()` = 900 s · `claim_take_recording_session` / `claim_anon_take_recording_session` release the same actor's reservation older than the window and without an uploaded object (`FAILED` / `PENDING_UPLOAD_WINDOW_ELAPSED`) inside the claim transaction under the shared advisory lock · new `release_stale_pending_take_reservations(p_limit)` (`service_role` only, `SECURITY INVOKER`, `search_path = ''`) called by `src/lib/takes/takes-janitor.ts` (errors reported in `pendingWindowError`, retention still runs), which also removes objects uploaded after a release · `READY` / retention unchanged · window value 900 s confirmed by the Owner (`OD-REC-PENDING-UPLOAD-TTL` CLOSED for length; prod migration/deploy = separate GO) · `SESSION_DAY_CAP` unchanged: a reservation released after the window still counts toward the UTC-day session cap (no automatic refund)
**Client:** `TAKE_PENDING_UPLOAD_WINDOW_SECONDS` in `src/config/recording.ts`; the "inna sesja nagrania" message names the window; recovery logic unchanged (released take → 403 "not awaiting finalize" → one fresh upload). Studio UI wiring that clears a stale upload error after banner save (`recoverySavedKey`) stays in the local uncommitted Studio WIP and is not part of this commit
**Tests:** `p4-live-verify.test.ts` moved to `createIntegrationFixtures` (the only authorized edit of a protected file; previously left a user, beat and `creator_experience_events` per run) · `integration-fixtures.ts` also verifies beat assets, entitlements, xp events and tracked Storage objects · new live suite `stu16-pending-upload-window-live.test.ts` (17 tests covering the 20 spec scenarios + janitor end-to-end + `SESSION_DAY_CAP` spend/refund semantics, DB state read back) and unit `stu-16-pending-upload-window.test.ts`
**Verification (local Supabase only):** STU-16 live 16/16 (twice, locked, no leftovers; negative control against the pre-STU-16 RPCs: 13/15 fail) · p4 2/2 twice, no leftovers · unit suite 200 files / 2982 tests · `tsc` 0 · ESLint 0 on changed files · full locked integration 16/16 files pass with no leftovers · Chromium QA 390×844 + 1440×900 with synthetic audio (guest + account, Quick Take + Studio: normal take, reload mid-recording, offline mid-upload, reservation inside / past the window, with / without object, takeover, server release + recovery, daily limit, discard in a second tab) · production read-only: STU-16 functions / migration absent, counts unchanged
**`wave1-live.test.ts` (edited with Owner consent):** used any `PUBLISHED` beat and created no fixtures — it passed only because `p4` leaked one before it ran (on a clean DB: fail + 3 users left). Now seeds its own beat, tracks users / beat / objects via `createIntegrationFixtures`, cleanup in `onTestFinished`; assertions unchanged; 2 locked runs 1/1, no leftovers
**NOT VERIFIED:** Safari, Firefox, physical microphone, production

## 2026-10-18 — STU-15: unified recording recovery, lease safety, integration test isolation (local only)

**Status:** **LOCAL ONLY** · **NOT COMMITTED · NOT PUSHED · NOT DEPLOYED** · no schema / RLS / RPC / production change
**Recovery (Studio + Quick Take, one implementation):** IndexedDB adapter reopens a lost connection (`versionchange` / `close` / `InvalidStateError`) instead of staying "Lokalne zabezpieczenie niedostępne" until reload · upload failures mapped to Polish messages without raw codes (network, `REPLACE_REQUIRED` / `ACTIVE_READY_CAP`, separate `SESSION_DAY_CAP` daily-limit outcome; copy always kept) · discard confirmation closes on Escape and returns focus to "Odrzuć nagranie" · description in README "Nagrywanie — wspólne lokalne zabezpieczenie i odzyskiwanie", index in `docs/architecture/RECORDING.md`
**Integration isolation:** network guard also blocks Node sockets (`net.Socket.prototype.connect` → `node:http` / `https` / `tls` / `net`) outside loopback · atomic per-stack run lock (`globalSetup`, `src/test/integration-run-lock.ts`; stale PID / age takeover with token re-check, release only by owner, `BRD_INTEGRATION_LOCK_TOKEN` for nested runs) · fixture cleanup verification reports leftover ids incl. `auth.users` · `community-wave5-live.test.ts` moved to `createIntegrationFixtures`
**Verification (local Supabase only):** unit suites guard 59/59, run lock 10/10, recovery (STU-14 + STU-15 lease + IDB + user-errors) 91/91 · full integration 15/15 files with lock; second concurrent run refused with `IntegrationRunLockedError`; leftover rows only from protected `p4-live-verify.test.ts` (1 user, profile, beat, `creator_experience_events`) · Chromium browser QA 390×844 and 1440×900 with synthetic / loopback audio (reload mid-recording, discard + Escape, offline, `PENDING_UPLOAD`, throttled 100 s upload with 3 lease renewals, second tab `BUSY`, leave guard)
**Blocker (OPEN):** `OD-REC-PENDING-UPLOAD-TTL` — no dedicated pending TTL on the server; needs migration + RPC change + GO
**NOT VERIFIED:** Safari, Firefox, physical microphone, production

## 2026-10-17 — Security Wave 5: app code deployed, local path verification PASS (docs-only)

**Status:** **APP CODE DEPLOYED (READY)** · **LOCAL TESTS PASS** · **PRODUCTION FINALIZE PATH NOT EXERCISED** · docs-only change, uncommitted at writing · supersedes the "APP CODE NOT PUSHED / NOT DEPLOYED", **Deployment** and **Next** lines of the entry below, and the "NOT PUSHED · NOT DEPLOYED" status of the Security Wave 5 / Wave 4 / Audit Wave 3 / Audit Wave 2 entries further below — all in the same commit `de65ff9` (kept as written for history)
**Git:** implementation `de65ff9` pushed to `main` together with docs commit `1d33d3b51bb25c5a0a046c24d9ec8ae5ecdd411d` (`1d33d3b`, `docs: record production atomic finalization migration`, parent `de65ff9`) — normal fast-forward push under Owner GO (runbook step 7 below)
**Deployment:** `dpl_1g2NnoZGx4sZTDASfLUKbQVvWoJS` · commit `1d33d3b` (app code ≡ `de65ff9`) · target production · **READY** (created 20:10:40Z, ready 20:11:08Z) · no build error · aliases `www.bitrymdym.pl` / `bitrymdym.pl` / `bitrymdym.vercel.app` · HTTP `www.bitrymdym.pl/` 200, `/beats` 200, apex 308 → www. READY + HTTP 200 prove only that the deployment serves pages, not that the finalize path works
**Post-deploy read-only audit (same day):** production `finalize_beat_master_asset` definition and ACL unchanged vs the post-apply read-back in the entry below · deployed code calls the RPC from one place (`finalizeMasterAssetAtomically`) with the 19 arguments of the function · no application errors in the checked log window
**Local verification (isolated local Supabase `bitrymdym-local`, Postgres 17.6, all 59 repo migrations; app pointed at local Supabase via process env, guard `scripts/_assert-local-supabase-env.ts` = LOCAL; no production access):** T1–T10 **PASS** — T1 USER finalize · T2 PLATFORM finalize · T3 ADMIN replace (previous `REPLACED`, title / BPM kept, measured duration) · T4 idempotent replay (no writes) · T5 conflicts (`ALREADY_FINALIZED`; REPLACED / FAILED → 409 before the RPC) · T6 permissions (MODERATOR / USER on ADMIN routes 403, anonymous 401, direct RPC with anon key / user JWT `42501`) · T7 validation (unreadable file / 215 s → 400 + asset `FAILED`, previous MASTER intact) · T8 atomicity · T9 concurrency (4 parallel ADMIN replace → one active, `replaced_by` chain; 2 parallel USER finalize → metadata of the active asset) · T10 foreign beat / asset → 403, no RPC. T1–T7, T9, T10 through the running app (Next.js → local PostgREST → local Postgres / Storage), 9/9, no 5xx; T8 = the real-Postgres suite `beat-master-finalize-local.test.ts` **28/28 PASS** (forced activation failure, `CHECK` violation in the last step, session killed mid-transaction → full rollback). Session test data removed afterwards (local only)
**Local environment integrity (post-test audit):** a local `.next/dev` move during the test session emptied `node_modules/@audio/beat`, `audio-decode`, `music-metadata`; restored the same day. Re-verified: versions = `package-lock.json` (2.1.3 / 3.12.0 / 11.16.1), files byte-identical to the lock-integrity tarballs from the local npm cache (incl. nested `content-type` / `media-typer`), `npm ls --all` clean, imports + decode / BPM smoke OK, `tsc --noEmit` PASS. Local only; not part of the deployment
**Evidence source:** reports of Cursor agent sessions on 2026-10-17 (read-only Vercel API / `vercel inspect`, read-only Supabase catalog / logs, local test harness) — not an independent verification
**NOT VERIFIED:** no real production call of the new finalize path yet — USER / PLATFORM finalize and ADMIN MASTER replace in production, and the production app → PostgREST → Postgres path, are unexercised. This entry is **not** a production functional test; Security Wave 5 is **not** production verified
**Next (Owner GO):** one controlled production check of the finalize path (writes production data; runbook step 8 below)

## 2026-10-17 — Security Wave 5: production migration applied (docs-only)

**Status:** **PRODUCTION MIGRATION APPLIED + VERIFIED (read-only)** · **APP CODE NOT PUSHED / NOT DEPLOYED** · docs-only change, uncommitted at writing · canonical record of the `finalize_beat_master_asset` production state (other docs link here)
**Implementation commit (Git, local only):** `de65ff9eeac1865078b014152fa964caa0c075fe` (`de65ff9`) — `fix(security): transactional beat finalization and API error hardening` · parent `a91714a` · **not pushed**
**Production migration history:** `20261017193713 beat_master_finalize_atomic` (applied 2026-10-17 19:37 UTC via MCP `apply_migration`, one call, project `rzzxrgcdogkybkiidqgw`; history 61 → 62 entries; `idempotency_key = null`) · repo file `supabase/migrations/20261017140000_beat_master_finalize_atomic.sql` · version drift is the known MCP-apply pattern — **do not** rewrite history entries to align versions
**Applied content:** the canonical Git blob (LF), SHA256 `2EE615284323A973BE19CA6BF6E9BBE1C85AE886129CFE1A3CA19EB2B02ECAFA` — the Windows working copy is the same file with CRLF line endings (SHA256 `70AB5668CF9FABB418A75BC8B91D8780EB8D5C7272D19F0DAB25C3A7EC6FA953`). The history entry stores one statement whose MD5 equals that LF blob
**Transaction (production Postgres log, own execution):** one Query message `begin;` → `-- apply sql from post body` (migration) → `-- track statements in history table` (history insert) → `commit;` · no `ERROR` / `WARNING` for role `postgres` in the apply window · DDL, REVOKE / GRANT, DO-block assertions and the history row committed together
**Production DB read-back (SELECT only, after apply):** `public.finalize_beat_master_asset` · 19 arguments as in the file · returns `jsonb` · `plpgsql` · owner `postgres` · one overload · `prosecdef = false` (INVOKER) · `proconfig = {search_path=""}` · `proacl = {postgres=X/postgres,service_role=X/postgres}` (no `PUBLIC` entry) · `EXECUTE`: `service_role` true, `anon` false, `authenticated` false (effective holders: `postgres`, `service_role`, superuser `supabase_admin`) · `auth.role()` = `service_role` guard present in the body · `md5(prosrc)` `de9a0de0ccc999634dd9d7ff3a5a1297` and `md5(pg_get_functiondef)` `cdbc3c609b4b13975393e20c08d2eff2` = the local function with CR removed (the local reference `4136c19aa2eb19ab9eab9a48df4ce8fe` was taken from a CRLF apply) · dependencies (`beats` / `beat_audio_assets` columns, constraints, triggers, `beat_audio_assets_one_active_per_purpose_uidx`, `auth.role()`, enum `beat_ownership_type`, `service_role` privileges) and `public` default ACLs unchanged vs the pre-apply read
**Pre-apply checks (read-only, same day):** function absent (0 overloads), no history entry, all dependencies identical to the local Supabase where the 28/28 suite passed; `apply_migration` transactionality confirmed from the Supabase docs ("If the schema migration fails, the changes will be rolled back") and the production log of the F1-C apply (same `begin; … commit;` wrapper)
**Deployment:** production still runs `a91714a` (`dpl_4vddPKqXwfjqPBNBTkFX8r6FVDPN`, last read 2026-10-17 before the apply, not re-read here), which does not call the function — the apply is additive for it
**NOT VERIFIED (deliberately):** calling the function in production (it writes application data) · the app → PostgREST → Postgres path · USER / PLATFORM finalize and ADMIN MASTER replace in production — all wait for the push of `de65ff9`
**Next (each under its own Owner GO):** push `de65ff9` (+ this docs change) to `main` → Vercel auto-deploy → `vercel inspect` + path verification (runbook steps 7–8 in the entry below)
**Prior entry below** records the implementation and the runbook. Its "migration applied to the local Supabase only" status and runbook steps 1–6 are superseded by this entry.

## 2026-10-17 — Security Wave 5: transactional beat finalization and atomic MASTER replacement

**Status:** **NOT PUSHED · NOT DEPLOYED · NOT PRODUCTION VERIFIED** · Git: one Waves 2–5 change set (staged 2026-10-17; committed only if `git log` shows it) · on top of the Wave 2–4 tree (base `a91714a`) · new migration `supabase/migrations/20261017140000_beat_master_finalize_atomic.sql` applied to the **local** Supabase only · no production database / Storage / role / RLS / permission / config change
**Scope:** USER finalize (`finalizeUserBeatAfterUpload`), PLATFORM finalize (`finalizePlatformBeatAfterUpload`), ADMIN MASTER replace (`completeMasterReplaceUpload`, `/api/admin/beats/[id]/master`), USER + PLATFORM analyze. Out of scope: `archivePlatformBeatAudio` (deliberately deactivates). **Removed (owner decision):** `uploadPlatformBeatAudio` in `audio-service.ts` — a second, unchecked multi-UPDATE MASTER swap with no callers; `uploadPlatformBeatAudioAction` stays as the disabled base64 stub (returns "use binary upload", touches no data; covered by `audio-transport.test.ts`)
**(E1) metadata before activation — FIXED:** both finalizes wrote beat metadata before the swap, and analyze wrote title / `duration_seconds` to the beat for a still-pending asset (on a replace that changed the duration while the old MASTER was active). Analyze now writes only `byte_size` on the asset, pinned to `status = PENDING_UPLOAD`; the beat is written only by finalize, inside the same transaction as the swap. A new draft keeps the provisional `duration_seconds = 1` until finalize
**(E2) non-atomic swap — FIXED:** `activateAssetReady` / `restoreReplacedAsset` (separate UPDATEs + compensating restore) are removed. New `public.finalize_beat_master_asset(...)` does in one transaction: lock beat (`FOR NO KEY UPDATE`) → lock target asset (`FOR UPDATE`) → lock previous active MASTER (`FOR UPDATE`) → re-check beat exists with the expected ownership type / owner (USER: `DRAFT` or `REJECTED`, status unchanged), asset belongs to the beat, `purpose = MASTER`, `status = PENDING_UPLOAD` → previous MASTER `REPLACED` (`is_active = false`, `replaced_by_asset_id`) → new asset `READY` + active + content type / size / checksum → beat metadata (finalize: title, producer, description, genre, style, BPM, key, scale, tags, cover + duration) or only `duration_seconds` (replace). Fixed lock order per beat avoids deadlocks; the beat lock does not block new asset inserts (`KEY SHARE`)
**Contract:** success `{ beat_id, asset, replaced_asset_id, idempotent_replay }`. Idempotent replay: asset already READY + active with identical checksum / size / content type / duration (and metadata for finalize) → success, nothing written; any difference → `ALREADY_FINALIZED` 409. Errors are fixed `P0001` tokens mapped in `finalizeMasterAssetAtomically`: `BEAT_NOT_FOUND` / `ASSET_NOT_FOUND` 404 · `ASSET_BEAT_MISMATCH` 403 (kept as today's binding semantics; the application check runs first) · `BEAT_CHANGED` / `NOT_PENDING_MASTER` / `ALREADY_FINALIZED` / `ACTIVE_AUDIO_CHANGED` 409 · `INVALID_INPUT` and anything else → logged generic 500, no database text. Two concurrent finalizes of different assets: serialized by the beat lock, the later one is a legitimate replace and the metadata always describes the active asset (the Wave 4 loser `23505` path is now reachable only by writers outside the function)
**Security:** `SECURITY INVOKER` (service role already holds every privilege used, so nothing is elevated), `search_path = ''`, schema-qualified names, refuses callers whose `auth.role()` is not `service_role`; `EXECUTE` revoked from `PUBLIC` / `anon` / `authenticated`, granted to `service_role`; the migration ends with a DO block asserting ACL, INVOKER and `search_path`. All application authorization (session, role, permission, ownership, binding, purpose) still runs before the RPC; USER passes `ownerId = context.userId`
**Behaviour change — ADMIN replace:** now commits the measured duration of the new file (title and BPM kept — BPM re-detection on replace is an owner decision). A file whose duration cannot be measured or exceeds 210 s is rejected (400), the asset is marked `FAILED`, nothing is activated
**Deployment requirement:** migration `20261017140000` must be applied **before** this application code runs; without it every finalize / replace fails with a logged generic 500 (no partial state)
**Migration runbook (steps 1–6 EXECUTED 2026-10-17 — local commit `de65ff9`, production history `20261017193713`, see the entry above; steps 7–8 pending):** file `supabase/migrations/20261017140000_beat_master_finalize_atomic.sql` (SHA256 `70AB5668CF9FABB418A75BC8B91D8780EB8D5C7272D19F0DAB25C3A7EC6FA953`) creates only `public.finalize_beat_master_asset(...)` + its REVOKE / GRANT + a DO-block assertion; no table, column, index, trigger, RLS, role or data change. It is additive: the code on `origin/main` (`a91714a`) does not call the function, so applying it **before** the Waves 2–5 code is backward compatible for that code (the deployed SHA itself must be confirmed in step 2). **Push to `main` auto-deploys on Vercel (also docs-only commits): no commit of this change set may be pushed until the migration is applied and verified.** Order, each production step under its own Owner GO:
1. Local commit of code + docs — only after a separate Owner GO; no push
2. Owner GO (read-only): production migration history (`list_migrations`), PostgreSQL catalog (`pg_proc` for `public.finalize_beat_master_asset`, dependencies: `beats`, `beat_audio_assets`, enum `beat_ownership_type`, index `beat_audio_assets_one_active_per_purpose_uidx`, `auth.role()`, roles `anon` / `authenticated` / `service_role`) and the current Vercel deployment (`vercel inspect`)
3. Decide from that read: function absent → migration needed; present with the expected definition → no apply; present with a different definition or an existing `beat_master_finalize_atomic` history entry → STOP
4. Owner GO for the apply, only if step 3 shows it is needed
5. Apply only this file, unchanged, through the approved MCP `apply_migration` mechanism (name `beat_master_finalize_atomic`); the remote history will record an apply-time version, not `20261017140000` — the known MCP pattern, accepted or scheduled for closeout in that GO, not repaired here
6. Verify (read-only): history entry present (record its version) · `md5(prosrc)` = `4136c19aa2eb19ab9eab9a48df4ce8fe` (local reference) · `prosecdef = false` · `proconfig = {search_path=""}` · `EXECUTE`: `service_role` true, `anon` / `authenticated` false
7. Only after step 6 passes: separate Owner GO for the push to `main` (auto-deploy)
8. Verify the deployment (`vercel inspect`) and the USER / PLATFORM finalize and ADMIN MASTER replace paths; checks that write production data need their own GO; record the result in a separate docs commit (which also auto-deploys)

**Migration hard limits:** no `supabase db push` · no `migration up` / `migration repair` · no re-run of existing migrations · no alignment of the F1-C history drift in this operation (production `20261017081616` vs repo file `20261017120000_f1c_profiles_privilege_hardening.sql`; versions and history stay as they are) · never push before the migration is applied and verified · do not assume the function is absent in production · do not assume `apply_migration` runs the whole script in one transaction until confirmed (confirmed 2026-10-17 from the production log — see the entry above; if the DO-block assertion fails, read the catalog before any further step) · **STOP** on: unexpected HEAD / staging, function present with another definition, missing dependency, any apply error, any step-6 mismatch, unknown current deployment or concurrent pushes to `main`. Rollback: the function is additive and `service_role`-only — reverting the app code does not require dropping it; `DROP FUNCTION` needs its own GO
**Evidence — real Postgres (local Supabase, Postgres 17.6, `docker exec psql`):** `src/lib/beats/beat-master-finalize-local.test.ts` (opt-in `BEAT_FINALIZE_LOCAL_DB_TEST=1`) 28/28: ACL + definition; anon / authenticated / service role without claims refused; migration re-runnable; first USER finalize; PLATFORM replace (previous `REPLACED`); replace writes duration only; REJECTED stays REJECTED; REPLACED / FAILED / READY-inactive / ARCHIVED / PLAYBACK / DOWNLOAD refused with state unchanged; asset of another beat; PENDING_REVIEW / other owner / PLATFORM-vs-USER; unknown ids; invalid input; injected activation failure (temporary trigger), `CHECK` violation in the last step and `pg_terminate_backend` mid-transaction → full rollback; replay without writes; replay with different metadata / checksum → `ALREADY_FINALIZED`; same asset twice concurrently → one commit + one replay; two and eight concurrent different assets → one active, the rest `REPLACED` in a chain, metadata of the active asset; new asset insert not blocked by the beat lock; pinned analyze write after finalize updates 0 rows. Mutation: removing `FOR NO KEY UPDATE` fails 3 concurrency tests (function restored from the migration)
**Evidence — mocks (not proof of atomicity):** `audio-asset-lifecycle.test.ts` (63; the RPC is an in-memory model of the SQL contract) — exact RPC arguments per path, no direct asset / beat writes, analyze writes no beat, refusals before download with no RPC, token → status mapping, infrastructure errors → logged 500, ADMIN replace duration / FAILED / permissions / timeout. `admin-beats-api-authz-matrix.test.ts` and `user-draft-metadata-authz.test.ts` updated to the new contract (analyze: asset only; complete: one RPC; active READY retry decided by the RPC; call-site check now covers the RPC owner argument). App mutations: no token mapping (10 fail), USER finalize with the old pending-only guard (1 fail)
**Validation (local):** see [PROJECT_STATE](./PROJECT_STATE.md) row **SECURITY WAVE 5 (LOCAL)**
**Limitations:** not verified through the live app → PostgREST → Postgres path and not in production; full `npm test` not run (live tests read `.env.local`); BPM not re-detected on replace

## 2026-10-17 — Security Wave 4: grants API error contract, ownership before grantee lookup, MASTER race conflict

**Status:** **NOT PUSHED · NOT DEPLOYED · NOT PRODUCTION VERIFIED** · Git: one Waves 2–5 change set (staged 2026-10-17; committed only if `git log` shows it) · on top of the Wave 2 + Wave 3 tree (base `a91714a`) · no migration / RPC / RLS / ACL / role / permission / config / UI change
**Scope:** `/api/beats/[id]/grants` (GET, POST), `/api/beats/[id]/grants/[grantId]/revoke`, `/api/account/grants` (same service, same defect), `src/lib/grants/beat-access-grants.ts`, `grant-input.ts`; `activateAssetReady` (E2); Wave 2 / 3 doc correction (E3). Out of scope: `/api/studio/final/versions/[versionId]/grants` (SFM, own mapper) and the other AuthError → HTTP mappers (takes, studio, SFM, render jobs)
**(H1) raw errors — CONFIRMED, FIXED:** every non-`AuthError` was returned as **400 with the raw `error.message`** and not logged: PostgREST `22P02` for a non-uuid beat / grant id, the `SyntaxError` of a malformed body, database errors and unrecognised RPC errors (`mapCreateRpcError` fallback). Routes now use the shared classifier (`beatApiErrorResponse`, new generic form of `beatAudioApiErrorResponse` in `beat-operation-error.ts`; `beatAudioBadRequest` renamed `beatApiBadRequest`): malformed ids / non-object JSON / missing grantee → 400 `INVALID` before any query; `AuthError` → 401 / 403 / 404 / 409; unexpected → logged generic 500. The two local `authStatus` copies and the `/api/account/grants` copy are gone
**(H2) lookup before ownership — CONFIRMED, FIXED:** POST resolved the grantee (`profiles` by uuid or exact `display_name`) before the service checked beat ownership, so any signed-in user could probe whether a user / display name exists (404 vs 403). New `createBeatAccessGrantForGrantee`: input validated (no query) → `loadOwnedUserBeatOrThrow` → grantee lookup → self-grant check → RPC; `resolveGranteeUserId` is no longer exported. A non-owner now gets the same 403 whatever the grantee. List and revoke already checked ownership first (revoke reads the grant only after it); grant / beat ids are also uuid-guarded in the service
**(H3) contract — CONFIRMED, FIXED:** a past / unparsable `expiresAt` (and the RPC's `INVALID_EXPIRY`) was `AuthError("FORBIDDEN")` → 403; an ambiguous display name was 403 too. Both are request errors now (`BeatRequestError` → 400; `parseGrantExpiresAt` in `grant-input.ts`, shared by both create functions, runs before any query). Messages unchanged, so the panel's Polish mapping still applies. Kept as 403 by design: self grant, privilege fields, PLATFORM / not-PUBLISHED beat, active-grant cap. Duplicate active grant stays 409 (`ACTIVE_GRANT_EXISTS`). A raw `23505` cannot come from grant creation in practice (the RPC takes a per-beat advisory lock and checks `ACTIVE_GRANT_EXISTS` first); if it did, it is a logged 500
**(E2) MASTER race without a previous asset — CONFIRMED, FIXED:** two finalizations of different pending assets on a beat with no active MASTER: the loser's activation UPDATE hit `beat_audio_assets_one_active_per_purpose_uidx` (`23505`) and was reported as a generic 500 + error log. In `activateAssetReady` only, SQLSTATE `23505` on the activation step → `CONFLICT` ("Active audio changed during the update. Try again.", 409 / action message). Safe because that UPDATE changes no column of the only other unique index (`storage_bucket, object_key`). No global `23505` mapping
**(E3) docs — CONFIRMED, FIXED:** the Wave 3 entry said USER keeps a "DRAFT-only binding"; `assertUserDraftTransportAccess` (and `community-wave2-transport.test.ts`) allow own USER beats in DRAFT **or** REJECTED, matching `PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE` ("USER metadata freeze except DRAFT/REJECTED"; submit still requires DRAFT). Sentence corrected; the misleading finalize comment ("beat remains DRAFT") now says the status is unchanged. Rules: metadata edit, analyze and finalize — own USER beat in DRAFT or REJECTED; status never changes there; submit — DRAFT only
**(E1) beat metadata vs active MASTER — CONFIRMED, NOT CHANGED (owner decision):** both finalizes write title / producer / description / genre / style / BPM / key / scale / duration / tags / cover (USER `patchUserDraftMetadataAfterAuthz`, PLATFORM `updateBeatMetadata`) before `activateAssetReady`. A loser of a concurrent finalize (or any activation failure) keeps its metadata while another asset is active — BPM and duration can describe the wrong audio until the next successful finalize. Earlier still, PLATFORM analyze (`analyzeUploadedAudio`) already writes `duration_seconds` and the suggested title to the beat for a pending asset. Swapping the order would instead leave a new active MASTER with old metadata on a metadata failure; only a transaction removes both. Recommended: one transactional RPC for metadata + swap (also closes the non-atomic window). Now pinned by a test so a fix has to update it deliberately
**Tests:** new `src/lib/grants/grants-api-routes.test.ts` (48: real routes + session guard + service + classifier over a fake Supabase recording every admin query and RPC, with the RPC's checks emulated — anonymous / malformed ids / bad JSON / privilege fields → no query; non-owner → same 403 for existing, unknown and uuid grantees with `profiles` never queried; owner create / list; unknown and ambiguous grantee; past / now / unparsable / non-string / future / null expiry; RPC `INVALID_EXPIRY` → 400; self grant, not PUBLISHED, duplicate → 409; DB / RPC failures → generic 500 + log; revoke: non-owner, other beat's grant, idempotent repeat, update failure; account list; panel mapping of real responses). Mutation-checked one at a time: lookup before ownership (5 fail), expiry as FORBIDDEN (3), no uuid guard (3), raw message (7). `audio-asset-lifecycle.test.ts` +2 (deterministic 23505 race and `Promise.all` race without a previous MASTER → one active, loser `CONFLICT`, no log); the fake now returns code `23505`; removing the mapping fails both. The fake models the index semantics in memory — not Postgres; a process crash between swap steps is not tested
**Validation (local):** see [PROJECT_STATE](./PROJECT_STATE.md) row **SECURITY WAVE 4 (LOCAL)**
**Owner decisions:** transactional MASTER swap + metadata (E1 + atomicity) · whether active-grant cap / self grant should become 409 / 400 (kept 403)

## 2026-10-17 — Security Audit Wave 3: USER audio API error contract, server action errors, MASTER asset swap integrity

**Status:** **NOT PUSHED · NOT DEPLOYED · NOT PRODUCTION VERIFIED** · Git: one Waves 2–5 change set (staged 2026-10-17; committed only if `git log` shows it) · on top of the Wave 2 tree (base `a91714a`) · no migration / RPC / RLS / ACL / role / permission / config / UI change · owner review pending
**Scope:** (A) `/api/beats/audio/session`, `/api/beats/audio/analyze` · (B) `catchAction` in `community-actions.ts` / `actions.ts` and the catch blocks of `create-with-master.ts` / `user-create-with-master.ts` · (C) `markAssetFailed` and the active MASTER swap (`activateAssetReady`) · (D) `finalizePlatformBeatAfterUpload` (PLATFORM server action) compared with the admin API and USER paths
**Shared classifier (SSOT):** `src/lib/beats/beat-operation-error.ts` replaces Wave 2's `admin-audio-api-error.ts` (`adminBeatAudioApiErrorResponse` → `beatAudioApiErrorResponse`; same contract). `classifyBeatOperationError`: `AuthError` → `authErrorHttpStatus` + its message · `BeatRequestError` → 400 / 409 + its message · anything else → `console.error("[tag] unexpected error", error)` + generic message, code `INTERNAL`, 500. Used by the admin and USER audio routes (`beatAudioApiErrorResponse` / `beatAudioBadRequest`) and by the four server-action catch blocks (`beatActionErrorMessage`). Classification is `instanceof` + code only
**(A) `/api/beats/audio/**` — CONFIRMED, FIXED:** both routes mapped every non-`FORBIDDEN` `AuthError` to **401** — so the Wave 2 metadata-race `CONFLICT` (and `NOT_FOUND`) answered "401" — and every other exception, including Supabase / storage text and the `SyntaxError` of a malformed JSON body, to **400 with the raw message**, without a server log. Authorization order was correct (`requireUserCommunityUpload` + ownership before any write). Now: malformed JSON / non-uuid `beatId` / `assetId` / non-integer `byteSize` → 400 `INVALID` before the service; shared mapper otherwise. Client-chosen `objectKey` / `ownerId` / `bucket` are still passed through untouched, so any non-empty value (also non-strings) stays a 403. Domain failures that were plain `Error` (audio meta, size limit, unreadable audio, BPM resolution, `createUserBeat` validation) are now `BeatRequestError`, so their messages survive the generic policy. Response bodies add `code`; the upload form reads only `res.ok` + `error`
**(B) server actions — CONFIRMED, FIXED:** `community-actions`, `create-with-master`, `user-create-with-master` returned any `error.message` (including database / storage text) and logged nothing; `actions.ts` hid raw text behind `toUserFacingError` keyword mapping (a database "not found" became "Nie znaleziono zasobu.") and logged nothing. Now authored `AuthError` / `BeatRequestError` messages are kept (finalize keeps `BLOCKED_BPM_SELECTION_REQUIRED` for `mapFinalizeBpmError`), unexpected errors → generic message + server log. `actions.ts` keeps `toUserFacingError` on top. Success is reported only after the service returned. Authorization unchanged
**(C) asset lifecycle — CONFIRMED, FIXED (within non-transactional limits):** `markAssetFailed` ignored its UPDATE error and overwrote any status; now `eq(status, PENDING_UPLOAD)`, error logged, original error still rethrown. `activateAssetReady` ignored the previous-asset read error and the deactivation error, had no expected-state filters and treated 0 rows as success; activation failing after deactivation left the beat **without an active MASTER**. Now every step is checked: deactivation pinned to `is_active = true` (0 rows → `CONFLICT`), activation pinned to `status = PENDING_UPLOAD` (0 rows → `CONFLICT`), and on activation failure the previous asset is restored by a pinned UPDATE (`status = REPLACED`, `replaced_by_asset_id = <new>`); a failed restore is logged. Two active MASTERs remain impossible (`beat_audio_assets_one_active_per_purpose_uidx`). **Not atomic:** a crash or a failed restore between the steps can still leave no active MASTER — closing that needs a transactional RPC (owner decision, not added)
**(D) PLATFORM / USER finalize — CONFIRMED, FIXED:** both finalizes accepted a REPLACED or inactive READY asset, so an old master could be re-activated; now every analyze / complete / finalize path requires `purpose = MASTER` + `PENDING_UPLOAD` (`assertPendingMasterUpload`, 409 `CONFLICT` "Asset is not a pending MASTER upload."), which also makes a retry after success a conflict without writes. `finalizePlatformBeatAfterUpload` checked only `beats.create` but its `updateBeatMetadata` needs `beats.edit`, so a denied ADMIN could get a storage read + `markAssetFailed` first; it now checks `beats.edit` up front (same rule as admin analyze). USER analyze ignored its asset UPDATE error — now checked. Malformed beat / asset ids in the transport loaders → `NOT_FOUND` without a query (was a raw `22P02`). Admin rules were not copied to USER: USER keeps `requireUserCommunityUpload` + ownership + status binding (`assertUserDraftTransportAccess`: own USER beat in DRAFT or REJECTED; corrected in Wave 4 — this entry first said "DRAFT-only")
**Tests (new):** `audio-asset-lifecycle.test.ts` (42: real USER routes and real PLATFORM / USER finalize actions over a stateful fake Supabase that enforces the unique active index and records every read / write / storage call — anonymous / unpermitted / foreign beat → no operations; malformed input → 400 without operations; READY / REPLACED / FAILED / PREVIEW never analysed or activated; metadata race → 409 not 401; storage / DB failure → generic 500 or message + one log, no false success; `markAssetFailed` failure logged with the original error kept; deactivation failure, activation failure with restore, activation + restore failure, concurrent replace, concurrent asset change; `Promise.all` double finalize → exactly one active MASTER; ADMIN without `beats.edit` → zero operations) · `beat-action-errors.test.ts` (52: every community action × success / `AuthError` / `CONFLICT` / `BeatRequestError` / infrastructure text / non-Error throw, plus `actions.ts` Polish mapping and logging). **Mutation check:** disabling the restore, the deactivation error check, the pending-MASTER check and the generic message together fails 16 lifecycle tests
**Validation (local):** Vitest on 180 files (179 of 200 under `src` + `scripts/bpm/synthetic-wav.test.ts`; the 21 files that read `.env.local` / build live Supabase clients excluded, so full `npm test` was not run): **2489 PASS / 0 failed** · `npm run typecheck` PASS · ESLint `--max-warnings 0` on all 26 changed / new source and test files PASS · `npm run lint` FAIL with the same 43 pre-existing errors in untouched files (27 in untracked `scripts/*`, 16 in tracked files unchanged since `a91714a`), 0 in changed files · `npm run build` PASS (shell env pointing at local Supabase)
**Known, unchanged:** finalize writes beat metadata before activating the asset; an activation failure leaves new metadata with a still-pending asset (retry possible) · USER analyze stores `byte_size` / `checksum` on the pending asset before a metadata-patch `CONFLICT` · database-trigger messages (e.g. submit cooldown) now show the generic message · approve / publish hooks failing after a successful transition still report failure · `rejectClientChosenStorageParams` ignores `assetId` (server always generates it) · `/api/beats/[id]/grants*` keep their own mapper (addressed in Wave 4)
**Owner decisions:** transactional MASTER swap (RPC / migration) · whether trigger messages should become authored errors
**Architecture rule:** [AUTHORIZATION.md](./architecture/AUTHORIZATION.md) (API / action error contract; asset swap rules)

## 2026-10-17 — Security Audit Wave 2: authorization boundaries, admin beats API error contract, moderation detail

**Status:** **NOT PUSHED · NOT DEPLOYED** · Git: one Waves 2–5 change set (staged 2026-10-17; committed only if `git log` shows it) · base `a91714a` (= `origin/main`, = production deployment `dpl_4vddPKqXwfjqPBNBTkFX8r6FVDPN` at audit time) · no migration / RLS / ACL / role / permission / config change · owner review pending
**Scope:** (A) `patchUserDraftMetadataAfterAuthz` and all callers · (B) `/api/admin/beats/audio/session`, `/api/admin/beats/audio/analyze`, `/api/admin/beats/[id]/master` (`session` / `complete`) end to end · (C) `/admin/moderation/[id]` and `getStaffCommunityBeatForModeration` · `docs/PROJECT-GUIDE.md` and `docs/ARCHITECTURE.md` do not exist; `DOCUMENTATION_CONTINUITY.md` followed instead
**(A) `patchUserDraftMetadataAfterAuthz` — CONFIRMED (stale write of status / reason on a read→write race; REJECTED rework blocked), FIXED:** `server-only` in `src/lib/beats/service.ts` (not `"use server"`). Uses the service-role client, and `prevent_beat_privilege_escalation` skips every check for `service_role`, so the function is the whole boundary. Ownership checks were correct: it loads the row and requires `ownership_type = USER`, `owner_id = ownerId`, status DRAFT|REJECTED before writing; the only trusted input `ownerId` is `context.userId` from `requireUser()` / `requireUserCommunityUpload()` in all three production callers (the `*For(context)` variants are called only from tests). Defects: (1) the UPDATE wrote `status` and `rejection_reason` from the earlier read under a `status IN (DRAFT, REJECTED)` filter, so a concurrent REJECTED→DRAFT could be overwritten back to REJECTED with the old reason (a transition the state machine never allows a USER), and a 0-row UPDATE was reported as success; (2) `validateBeatInput` accepts only DRAFT for USER beats, so the documented REJECTED rework edit (`PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE`: "USER metadata freeze except DRAFT/REJECTED", enforced the same way by the DB trigger for non-service callers) always failed. Today (2) masked (1). Fix: metadata validated against the USER draft rules (status is not written); UPDATE writes only metadata columns via new `toBeatMetadataPayload` (`types.ts`, also used by `toBeatInsertPayload`), is pinned to `eq(status, <read status>)` and `select("id")`, and 0 rows → `AuthError("CONFLICT")`; malformed id → `NOT_FOUND` without query; validation failure → `BeatRequestError`. No role / permission / status-rule change: `updateOwnUserDraftMetadata` keeps `requireUser()` + ownership (same model as `archiveOwnUserBeat` / `returnRejectedUserBeatToDraft`)
**(B) `/api/admin/beats/**` — CONFIRMED, FIXED:** all three handlers mapped every non-`UNAUTHENTICATED`/`FORBIDDEN` `AuthError` to **401** (`NOT_FOUND`, `CONFLICT`) and every other exception to **400 with raw `error.message`** — including Supabase / PostgREST / storage messages (e.g. `insertError.message`, `22P02 invalid input syntax for type uuid` for a malformed path id) — with **no server log**, so internal failures looked like client errors and were not diagnosable. Authorization itself was correct (ADMIN + `beats.create` / `beats.edit` checked in the service before any data access). Fix: `adminBeatAudioApiErrorResponse` (`src/lib/beats/admin-audio-api-error.ts`; replaced in Wave 3 by `beatAudioApiErrorResponse` in `beat-operation-error.ts`): `AuthError` → `authErrorHttpStatus` (`src/lib/auth/auth-error-http.ts`, same convention as SFM / Studio / grants: 401 / 403 / 404 / 409); new `BeatRequestError` (`src/lib/beats/request-error.ts`, codes `INVALID` → 400, `CONFLICT` → 409) for client-correctable failures whose message is safe (audio meta validation, size limit, unreadable audio, asset not PENDING_UPLOAD, beat metadata validation in `createPlatformBeat` / `updateBeatMetadata`); anything else → `console.error("[route] unexpected error", error)` + 500 `{ error: generic, code: "INTERNAL" }`. Routes now reject malformed JSON and non-uuid ids with 400 before calling the service (`isUuid` exported from the existing `UUID_RE` in `audio-validation.ts`). Response bodies add `code`; admin forms read only `res.ok` + `error`, so the UI contract is unchanged. Expected denials are returned, not logged. USER routes `/api/beats/audio/**` keep their existing mapping (out of scope; `BeatRequestError` extends `Error`, so their behaviour is unchanged). **Also fixed in the transport:** `analyzePlatformBeatPendingUpload` checked only `beats.create`, then downloaded the object and wrote `byte_size` / `checksum` (or `FAILED`) on the asset before `updateBeatMetadata` denied an ADMIN without `beats.edit` — partial write after a denial; it now checks `beats.edit` up front (who can succeed is unchanged) and no longer ignores the asset UPDATE error. `completeMasterReplaceUpload` activated any asset of the beat; a REPLACED / FAILED / non-MASTER asset could displace the active MASTER — it now requires `purpose = MASTER` and `PENDING_UPLOAD` (409 `CONFLICT` otherwise; the admin form always completes the asset of its own fresh session)
**(C) `/admin/moderation/[id]` — CONFIRMED, FIXED:** (1) every `AuthError` became `notFound()`, conflating the viewer denial from the role guard with deliberate content hiding; anonymous got a 404 marker next to the layout redirect (seen in production 14:07Z on `a91714a`), signed-in USER the same next to the layout denial. Now the page resolves the viewer denial first with `checkAccess(requireModerationAccess)` (anonymous → `redirect("/sign-in")`, USER → `null`, layout shows the denial) and maps only `NOT_FOUND` and content `FORBIDDEN` (not a USER beat / not PENDING_REVIEW|APPROVED) to `notFound()` — deliberate hiding kept; other errors propagate. (2) a malformed id reached PostgREST (`22P02`), `loadBeat` rethrew it as a plain `Error`, so staff got an error page + `error` log instead of 404. `loadBeat` now treats a non-uuid id as `AuthError("NOT_FOUND")` without querying (also applies to `/admin/beats/[id]` and server actions using `loadBeat`). Service-level guard and per-id authorization were already correct. (3) an ADMIN who lost the role between the guard and `loadAdminProfileIdentities` got an error page; the page now keeps the masked owner id on that `FORBIDDEN` and rethrows anything else. `user_number` stays ADMIN-only (USER-ID-01)
**Tests (new):** `user-draft-metadata-authz.test.ts` (22: owner DRAFT + REJECTED, only metadata columns written, UPDATE pinned to the read status, race → `CONFLICT`, foreign owner / PLATFORM / disallowed statuses / missing / malformed id / DB read+write failure / protected fields / invalid metadata, anonymous / MODERATOR / ADMIN non-owner, owner from session, caller contract) · `admin-beats-api-authz-matrix.test.ts` (44: real routes + mapper + transport + service + permission checks, fake Supabase recording every query / storage call: anonymous / USER / MODERATOR / ADMIN without the needed permission → 401 / 403 with **zero** beat, asset or storage operations; success paths; missing beat / asset, USER-owned beat, asset of another beat, asset not pending / not MASTER → 404 / 403 / 409 without writes; DB and storage failure → generic 500 + one server log; mutation-checked: reverting either transport fix fails 5 tests) · `admin-beats-api-routes.test.ts` (44: HTTP contract per route) · `moderation-detail-access.test.ts` (14: viewer denial, hiding, propagation, rendered owner label MODERATOR vs ADMIN, identity denial / failure, no-MASTER warnings) · `moderation-detail-service.test.ts` (14: real guard + loader, anonymous / USER / MODERATOR / ADMIN, malformed / missing id, PLATFORM, disallowed statuses, APPROVED vs pending-only variant, no READY MASTER, DB error) · `load-beat-malformed-id.test.ts` (6) · `admin-audio-request-errors.test.ts` (3)
**Validation (local):** Vitest on 177 of 198 test files (all except the 21 that read `.env.local` / use live Supabase clients — `npm test` = `vitest run` would execute those against configured environments, so it was deliberately not run): **2374 PASS / 0 failed** · `npm run typecheck` PASS · `npm run lint` FAIL with 43 errors, all pre-existing in files not touched (27 in untracked `scripts/*`, 16 in tracked files unchanged since `a91714a`; split recounted in Wave 3); ESLint `--max-warnings 0` on the 18 changed / new files PASS · `npm run build` PASS (shell env pointing at local Supabase) · local PostgREST: UPDATE with non-matching filters + `select` → HTTP 200 `[]` (basis of the `CONFLICT` check) · local `next start` against local Supabase: anonymous API → 401 `UNAUTHENTICATED` JSON, malformed body / non-uuid id → 400 `INVALID`, MODERATOR on admin API → 403, anonymous `/admin/moderation/[id]` → redirect without 404 marker, USER → layout denial without 404 marker, MODERATOR with malformed or unknown id → controlled 404; 0 error log lines (two local test accounts got new local passwords for this)
**Production (read-only):** `dpl_4vddPKqXwfjqPBNBTkFX8r6FVDPN` @ `a91714a` Ready, aliases `www.bitrymdym.pl` / `bitrymdym.pl` · `vercel logs --level error|warning --since 14d`: 0 / 0 (retained window starts ~14:06Z) · no `/api/admin/beats*` traffic in retained logs, so finding (B) was not observed in production
**NOT VERIFIED:** signed-in roles in production · ADMIN runtime of the API error paths (unit-tested; no local PLATFORM beats / ADMIN upload run) · pre-fix 500 for a malformed moderation id at runtime (code trace + local PostgREST `22P02`) · real unexpected errors in production
**Known, unchanged (out of scope; the `/api/beats/audio/**`, `catchAction`, `markAssetFailed` / deactivation and `finalizePlatformBeatAfterUpload` items are addressed in Wave 3):** same 401 + raw-message-400 pattern in `/api/beats/audio/**`; raw-message-400 for non-auth errors in `/api/beats/[id]/grants*` (their `AuthError` mapping is already correct); server actions returning `error.message` (`catchAction`; a `CONFLICT` from the metadata patch surfaces there as its message, and as 401 in `/api/beats/audio/analyze`) · `markAssetFailed` / previous-MASTER deactivation ignore their UPDATE errors · `finalizePlatformBeatAfterUpload` (server action path) not re-audited for asset status
**Architecture rule:** [AUTHORIZATION.md](./architecture/AUTHORIZATION.md) (API error contract; malformed id = not found)

## 2026-10-17 — Admin auth denials: `/admin/**` audit + fix for admin beats and moderation

**Status:** **APP CODE + TESTS + DOCS** in this commit (parent `4b56651`) · no migration / RLS / ACL / role / permission / config change · production verification after the auto-deploy is recorded in the session report, not in a follow-up commit
**Audit scope:** every page under `/admin/**` (`/admin`, `/admin/beats`, `/admin/beats/new`, `/admin/beats/[id]`, `/admin/moderation`, `/admin/moderation/[id]`, `/admin/sample-policy`, `/admin/users`), both layout gates (`/admin`: ADMIN|MODERATOR, `/admin/beats`: ADMIN), the admin server actions and `/api/admin/beats/**` route handlers · roles anonymous / USER / MODERATOR / ADMIN
**Finding (CONFIRMED, local reproduction):** the same pattern as `b574937`. In Next.js 16 a layout gate does not stop its page from rendering; three pages called a guarded loader and threw the expected denial, which Next.js logged as `⨯ Error [AuthError]` at level `error`: `/admin/beats` (`listPlatformBeatsForAdmin`) and `/admin/beats/[id]` (`getPlatformBeatForAdmin`) for anonymous / USER / MODERATOR, `/admin/moderation` (`listPendingReviewForModeration` + `listApprovedForModeration`) for anonymous / USER. The UI was already correct (redirect to `/sign-in` or "Brak dostępu"); no data was returned. Additionally an ADMIN without `beats.edit` (permissions are DB-driven) passed the layout gate and hit the same unhandled `FORBIDDEN` on the beats list / detail.
**Fix:** `checkAccess(guard)` (`src/lib/auth/access-denial.ts`) returns `UNAUTHENTICATED` / `FORBIDDEN` from an `AuthError` (`instanceof` + code) and rethrows everything else. The viewer guards are now named exports in `src/lib/beats/service.ts`: `requireAdminPlatformBeatsAccess()` (ADMIN + `beats.edit`) and `requireModerationAccess()` (ADMIN|MODERATOR); the existing data functions call them, so their rules are unchanged. The three pages run `checkAccess` before loading data: `UNAUTHENTICATED` → `redirect("/sign-in")`; `FORBIDDEN` → inline "Brak dostępu" (beats list / detail, also covers ADMIN without `beats.edit`) or `null` (moderation, layout shows the denial). `/admin/beats/[id]` resolves the viewer denial from the guard alone, because `getPlatformBeatForAdmin` also throws `FORBIDDEN` for non-PLATFORM beats; its `NOT_FOUND` → `notFound()` and rethrow of other errors are unchanged. No global suppression.
**No issue found (code unchanged):** `/admin` (profile check + redirect before data) · `/admin/beats/new` (no data call) · `/admin/moderation/[id]` (`AuthError` → `notFound()`, not logged) · `/admin/sample-policy` (own sequential `requireRole(["ADMIN"])`) · `/admin/users` (fixed in `b574937`) · server actions return `AuthError` as form state · `/api/admin/beats/**` map `AuthError` to 401/403 JSON
**Local tests:** new `src/lib/auth/access-denial.test.ts` (5) + `src/lib/beats/admin-route-access.test.ts` (11: role/permission matrix for both guards incl. ADMIN without `beats.edit`, propagation of non-auth errors, source contract that loaders and pages call the guards before data) · `npx vitest run src/lib/admin src/lib/auth` + 27 non-live `src/lib/beats` test files: 548 PASS / 7 skipped (opt-in F1-C local DB) · `*-live.test.ts` and `community-wave2-e2e.test.ts` deliberately not run (they read `.env.local`) · `npx tsc --noEmit` PASS · ESLint (7 files) PASS · `npm run build` PASS (local Supabase env)
**Local runtime matrix (dev server, local Supabase, 8 routes × 4 roles):** before the fix 16 `⨯ Error [AuthError]` log lines, after 0; status, redirect, heading and body otherwise identical · gap test on the local DB only: ADMIN without `beats.edit` (role permission row temporarily removed and restored) → "Brak dostępu" on `/admin/beats` and `/admin/beats/[id]`, no error log
**Production logs before the fix (read-only, `vercel logs --level error|warning --since 14d`):** one `error` entry, the known pre-`b574937` anonymous `/admin/users` `AuthError` (13:11:31Z, `dpl_8w9MinqStCvEHjiTYw77TULw2zQp`) · 0 `warning` · no requests to `/admin/beats*` or `/admin/moderation` in the retained logs, so the finding was not observed in production (short retention)
**NOT VERIFIED:** signed-in USER / MODERATOR / ADMIN in production (requires login) · ADMIN without `beats.edit` in production (would need a role-permission change) · production logging of a real unexpected error (no induced failures) · `patchUserDraftMetadataAfterAuthz` relies on its callers' authorization (not deeply audited)
**Known, unchanged behaviour (out of scope):** `/api/admin/beats/**` return non-auth errors as 400 with `error.message` and no log, and map `NOT_FOUND` / `CONFLICT` `AuthError` to 401 · `/admin/moderation/[id]` maps every `AuthError` (incl. `FORBIDDEN`) to `notFound()`
**Architecture rule:** [AUTHORIZATION.md](./architecture/AUTHORIZATION.md) (Next.js note → layout gates do not stop page rendering)
**Deployment model:** this commit auto-deploys; verify the current deployment with `vercel inspect www.bitrymdym.pl` / `vercel inspect bitrymdym.pl`

## 2026-10-17 — Auth error logging: expected access denials (`b574937`) + protected-route audit

**Status:** **DOCS ONLY** in this commit · no code / migration / RLS / ACL / config change · records the production-verified fix `b574937` and an audit of four further protected routes (no code change needed)
**Implementation commit (Git):** `b5749375df49253114bbb096e5435c9eb89f4881` (`b574937`) — `fix(admin): handle expected user-list access denials` · parent `c722d59` · files `src/app/admin/users/page.tsx`, `src/lib/admin/users-list.ts`, `src/lib/admin/users-list-access.test.ts`
**Finding:** anonymous GET `/admin/users` (HTTP 200, redirect to `/sign-in` via streamed meta refresh) logged `⨯ Error [AuthError]: Authentication required.` at level `error`; a signed-in non-admin logged `Insufficient role.` (local reproduction). The layout gate renders the redirect / "Brak dostępu", but in Next.js 16 a layout does not stop its page from rendering; the page called `listAdminUsers()` (guarded by `requireAdminUsersListAccess()`) and rethrew every `AuthError`. No user data was returned.
**Fix:** `adminUsersListAccessDenial()` classifies only `AuthError` with code `UNAUTHENTICATED` / `FORBIDDEN` (`instanceof` + code, not message text); the page then calls `redirect("/sign-in")` or returns `null` (the layout shows the denial). Other `AuthError` codes are still rethrown; non-auth errors keep the existing `loadFailed` path. No global suppression; access rules unchanged.
**Local tests (pre-commit evidence for `b574937`):** `npx vitest run src/lib/admin src/lib/auth` 183 PASS / 7 skipped (opt-in F1-C local DB) · `npx tsc --noEmit` PASS · ESLint (3 files) PASS · `npm run build` PASS (local Supabase env) · local dev anonymous / USER / ADMIN: redirect, denial UI and admin table unchanged; no `AuthError` log lines after the fix
**Production verification (read-only, audit 2026-10-17 ~13:31Z, historical evidence):** deployment `dpl_HuQEcftsjTDPZCmazbTqCS57n5HX` @ `b574937` · Ready · target production · aliases `www.bitrymdym.pl` / `bitrymdym.pl` · 3 anonymous GET `/admin/users` → 200 + meta refresh / `NEXT_REDIRECT` to `/sign-in`, no user data in body · matching runtime log entries level `info` only (one correlated by `x-vercel-id`) · positive control: previous deployment `dpl_8w9MinqStCvEHjiTYw77TULw2zQp` @ `c722d59` logged `error` `Error [AuthError]: Authentication required.` for anonymous `/admin/users` at 13:11:31Z · apex `bitrymdym.pl/admin/users` → 308 `Location: https://www.bitrymdym.pl/admin/users` · verdict **PASS WITH LIMITATIONS**
**Protected-route audit (code unchanged):** `/account/takes`, `/beats/upload`, `/studio`, `/account/beats` — **NO ISSUE FOUND**. Each page calls `requireUser()` itself before any data access (no parallel layout gate); `UNAUTHENTICATED` → `redirect("/sign-in")`, other failures → existing `redirect("/account")`; `/beats/upload`: ADMIN → `/admin/beats/new`, other non-USER → `/account`, `getOwnUserBeat` failure (unknown or foreign `beatId`) → caught → `/account/beats`. Evidence: code trace · local dev matrix (13 GET: anonymous / USER / ADMIN on each route + USER with unknown `beatId`) with 0 error log lines · production `vercel logs --level error --since 24h` (read-only): no entries on these routes
**NOT VERIFIED:** signed-in non-admin and admin on `/admin/users` in production (requires login) · production logging of a real unexpected error (no induced failures) · audited routes for signed-in users in production · `/beats/upload` with a foreign `beatId` at runtime (code trace only) · longer-window log behaviour (short window, possible log sampling)
**Known, unchanged behaviour (out of scope):** on the four audited routes a non-`UNAUTHENTICATED` failure of `requireUser()` (e.g. profile load error) redirects to `/account` without an error log · `/admin/users` non-auth list errors set `loadFailed` without an error log · pages under the `/admin` and `/admin/beats` layout gates were not audited for this pattern
**Deployment model:** this docs commit also auto-deploys; the deployment above is a dated snapshot, not a live pointer — verify with `vercel inspect www.bitrymdym.pl` / `vercel inspect bitrymdym.pl`

## 2026-10-17 — F1-C production deployment reconciled (docs-only)

**Status:** **DOCS ONLY** · no code / migration / production change in this commit · canonical record of the F1-C production state (other docs link here)
**Implementation commit (Git):** `fc8570508acbff7553c605e12b522b24968bb84f` (`fc85705`) — `fix(security): harden profile privilege protection` · parent `4ca9c2d` · this docs commit is its direct child
**Production migration history:** `20261017081616 f1c_profiles_privilege_hardening` (applied via MCP `apply_migration`) · repo file `20261017120000_f1c_profiles_privilege_hardening.sql` · version drift is the known MCP-apply pattern — **do not** rewrite history entries to align versions
**Production DB read-back (SELECT only, after apply):** `prevent_privilege_escalation()` SECURITY DEFINER · `search_path=""` · body MD5 identical to local apply of the repo file · `profiles` ACL `anon` / `authenticated` = `rdDxtm` (no INSERT/UPDATE) · column ACL `display_name={authenticated=w}` · no client INSERT on any column · `service_role` unchanged · triggers `profiles_prevent_privilege_escalation` / `profiles_prevent_user_number_mutation` / `profiles_set_updated_at` enabled · policies `profiles_select_own_or_admin` / `profiles_update_own` · RLS ON · `on_auth_user_created` enabled · `handle_new_user` / `award_creator_experience` / `admin_apply_user_management` EXECUTE = `postgres` + `service_role` only
**Vercel deployment of F1-C (historical evidence):** `dpl_524m9URrk1MwZhcjpEYV7gi3DmaY` · commit `fc85705` · target production · **Ready** · build `Compiled successfully` · aliases `www.bitrymdym.pl` · `bitrymdym.pl` (+ `bitrymdym.vercel.app`) at deploy time · direct production predecessor `dpl_EPPiqjt4n6Vv9rQgFtb4v9ZDWFUq` @ `4ca9c2d` (build log)
**Deployment model (audit 2026-10-17):** Vercel auto-deploys every push to `main`, including docs-only commits. Snapshot confirmed in the audit: `dpl_ChczaN3zZxoX2brE81zhXDVUQ2Du` @ `61d3655` (docs-only; app code ≡ `fc85705`), aliases `www.bitrymdym.pl` / `bitrymdym.pl`. This is a dated snapshot, **not** the current deployment after later commits. Current deployment: verify with `vercel inspect www.bitrymdym.pl` / `vercel inspect bitrymdym.pl`
**Local tests (pre-commit evidence):** `F1C_LOCAL_DB_TEST=1 npx vitest run src/lib/auth` **91/91 PASS** (incl. F1-C T1–T5 on fresh local Supabase) · `npx tsc --noEmit` **PASS** · ESLint (new files) **PASS**
**Production smoke (read-only):** HTTP 200 for `/` · `/sign-in` · `/sign-up` · `/beats` · `/forgot-password` · `/account` · `/settings` · `/admin/users` · Supabase logs after deploy (postgres / pgbouncer / postgrest / edge): no `permission denied` / `42501`, no error entries
**NOT VERIFIED (deliberately, would require production writes):**
1. `display_name` save via UI on production (owner account write) — privilege confirmed by catalog read only
2. Full sign-up E2E on production (real account + irreversible `user_number_seq` consumption) — covered only locally (T3) + trigger/ACL read-back
**Also not verified by this deploy:** SFM and other non-F1-C app code were already in production before F1-C (documented auto-deploys of `81c2496` / `5212933` / `4ca9c2d`) — their functional behaviour **NOT VERIFIED** · `SFM_VERSIONS_V1` runtime flag **NOT VERIFIED** · historical exploitation of F1 **NOT VERIFIED**
**Remaining risks (out of F1-C scope):** F2 — `current_user = 'postgres'` checks in `award_creator_experience`, `prevent_creator_experience_privilege_escalation`, `admin_apply_user_management`, `admin_assert_user_deletable` (protected today by EXECUTE ACL / RLS; separate analysis) · `anon` / `authenticated` still hold `rdDxtm` on `profiles` (no DELETE policy → RLS matches no rows; TRUNCATE etc. not exposed via PostgREST)
**Design / boundaries:** [AUTHORIZATION.md](./architecture/AUTHORIZATION.md) (Security boundaries → F1-C) · living state: [PROJECT_STATE.md](./PROJECT_STATE.md) §2
**Prior entry below** records the implementation commit before production apply. Its "production apply is a separate step" status is superseded by this entry.

## 2026-10-17 — F1-C security fix: profiles privilege hardening

**Status:** **REPO MIGRATION + TESTS + DOCS** · **LOCAL SUPABASE PASS** · production apply is a separate step after push (a file in Git **≠** a database apply)
**Base tip:** `4ca9c2d50517fb058c0d26ac20e82e9f9961677e` (`4ca9c2d`)
**Finding F1:** `prevent_privilege_escalation()` is SECURITY DEFINER (owner `postgres`), so its `current_user IS DISTINCT FROM 'postgres'` maintainer bypass was always false → `authenticated` could change own `role` / `account_level` / `experience_total` via PostgREST (table grants + `profiles_update_own` allowed it). Introduced by `20261003210322`.
**Fix (F1-C = variant 2 + defense in depth):** migration `20261017120000_f1c_profiles_privilege_hardening.sql`
- trigger: `session_user` instead of `current_user`; `search_path = ''`
- `REVOKE INSERT, UPDATE ON public.profiles FROM PUBLIC, anon, authenticated` · `GRANT UPDATE (display_name) TO authenticated`
- in-migration assertions on final ACL, function definition, trigger, RLS policy (abort on mismatch)
**Unchanged:** SELECT grants · RLS policies · `handle_new_user()` · `prevent_user_number_mutation` · service_role privileges · award/admin RPC ACL
**Tests:** `src/lib/auth/profile-privilege-hardening.test.ts` (static, always on) · `src/lib/auth/profile-privilege-hardening-local.test.ts` (opt-in local Supabase; T1–T5: display_name self-update, protected columns 42501, foreign row RLS, anon deny, signup/handle_new_user, award/admin RPC via service_role, maintainer session, broad-grant regression detection, trigger in SECURITY DEFINER context). Baseline (pre-migration) run: 4/7 FAIL (vulnerability reproduced locally); post-migration: 7/7 PASS.
**Out of scope:** other F2 `current_user` checks (award/admin RPCs — ACL-protected) · beat renumbering · `user_number_seq` · TX-ACL/TX-SEQ · M1 · S1 · K3 · D1 · M2 · R1
**Historical exploitation:** **NOT VERIFIED**

## 2026-10-16 — SSOT tip moved by the docs publish

**Status:** **DOCS ONLY** · **NO DATABASE APPLY** · **NO DEPLOY** · **NO RPC** · **NO FLAG / POLLER / CONTABO RE-VERIFY** · **NO LIVE CAS** · **NO STAGING E2E**
**Git tip (confirmed):** `81c2496fec9699605ba2809e09f45e9fc69b7a19` (`81c2496`) — `docs: align the living SFM tip with main without claiming a live apply`
**Parent:** `b71a54913fd5b9768baad0ff38e11f45ef4e2e39` (`b71a549`)
**KIND_REJECT:** code and repo migration `20261016120000_sfm_reject_executor_job_kind.sql` remain in history at `69e50d0`, an ancestor of this tip. A file in Git **≠** a database apply. Live CAS/concurrency and staging E2E **NOT CONFIRMED**. Runtime flag, poller activity, and Contabo **NOT RE-VERIFIED**.
**Prior entry below** recorded `b71a549` as the tip of that earlier docs pass. It is not the current tip.

## 2026-10-16 — SSOT tip alignment (docs-only)

**Status:** **DOCS ONLY** · **NO DATABASE APPLY** · **NO DEPLOY** · **NO RPC** · **NO FLAG / POLLER / CONTABO RE-VERIFY** · **NO LIVE CAS** · **NO STAGING E2E**
**Git tip (confirmed this stage):** `b71a54913fd5b9768baad0ff38e11f45ef4e2e39` (`b71a549`) — `merge: integrate origin/main with local BitRymDym checkpoint`
**KIND_REJECT:** code and repo migration `20261016120000_sfm_reject_executor_job_kind.sql` are in `main` history at `69e50d0e6bbfdfa8ee7696e79e680ddea5019d88` (`69e50d0`), an ancestor of the tip. A file in Git **≠** a database apply.
**Poller:** `d3c99e348aa8f24d9d8d50a69a1629552211a630` (`d3c99e3`) remains the dedicated-poller commit. Runtime activity **NOT RE-VERIFIED IN THIS STAGE**.
**Prior entry below** records the local-impl session. It is not the current tip.

## 2026-10-16 — OD-SFM-WORKER-KIND-REJECT local impl (KIND_OUT → FAILED RPC)

**Status:** **LOCAL ONLY** · **NO COMMIT/PUSH IN THIS GO** · **NO REMOTE MIGRATION APPLY** · **NO DEPLOY** · **NO FLAG** · **NO WORKER RUN** · **NO STAGING E2E**
**Base tip:** `d3c99e348aa8f24d9d8d50a69a1629552211a630` (`d3c99e3`) — dedicated SFM worker poller already on `main`
**Decision:** OD-SFM-WORKER-KIND-REJECT — unsupported kind after claim → atomic `FAILED` + `KIND_OUT` via `reject_sfm_executor_job_kind` (SECURITY DEFINER · CAS `RUNNING`+`worker_ref` · service_role)
**Scope:** migration `20261016120000_sfm_reject_executor_job_kind.sql` · poller reject wiring · local unit/contract tests · SSOT decision notes
**Does not:** orphan kill/grace recovery (`OD-SFM-WORKER-ORPHAN-TIMEOUT` **OPEN**) · auto-retry/requeue · stage reset · remote apply · Production GREEN
**Staging E2E:** **BLOCKED** until Owner review + separate GO
**`SFM_VERSIONS_V1`:** OFF

## 2026-10-15 — SFM HTTP Surface on main: SSOT tip reconcile (docs-only)

**Status:** **DOCS SSOT** · **NO APP CODE IN THIS DOCS GO** · **NO DEPLOY** · **NO FLAG CHANGE** · **NO STAGING E2E** · **NO SFM WORKER OPS** · **NO `db push` / repair / apply** · **NO CONTABO**
**Git tip (confirmed):** `2f7050e47b47241b753bdd2c3de8352ef629d9e9` (`2f7050e`) — `feat(sfm): expose Studio Final Mix owner HTTP surface`
**Parent:** `2d3514c86cb5bc67996fba480140bb0f3f8d5878` (`2d3514c`)
**What landed on `main` (app commit already published):** owner HTTP surface — Accept · version/status · MIX/MASTER stage start · grants · quality encode · job status · SFM download (AuthZ before signed URL) · safe error mapping
**Local unit tests (publish evidence only):** `npx vitest run src/lib/sfm` **200 PASS** at HTTP-surface publish — **≠** re-run in this docs GO · **≠** staging/prod E2E
**Planes (do not collapse):**

| Plane | Status |
|-------|--------|
| Code on `main` | A · B1 · C · D · OD-06 · HTTP surface @ `2f7050e` |
| Staging deployment SHA | **UNKNOWN / NOT VERIFIED** |
| Staging schema | **UNVERIFIED** (do not assume ≡ prod) |
| Staging SFM worker | **NOT WIRED** (dedicated poll entrypoint absent; STUDIO poller remains `STUDIO_EXPORT` only) |
| Staging E2E | **NOT DONE** |
| Prod app deploy of tip | **NOT VERIFIED** (last-known deploy SHA **`2adb569`**) |
| Prod DB SFM A–D | Prior MCP apply + version drift (`20261015…` ≠ local `20261014…`) · **no remote re-verify** here |
| `SFM_VERSIONS_V1` | Default **OFF** in code · staging remote value **NOT VERIFIED** |
| SFM Production GREEN | **NOT CLAIMED** |

**Still OPEN:** OD-04 · OD-SFM-ID-05 · migration full alignment · SFM worker entrypoint · staging RO · staging E2E · flag/deploy Contabo SFM Ops
**Preserved:** migration drift ban (`db push` / `migration up` / `migration repair` **BLOCKED**) · Final Mix (STUDIO_EXPORT) GREEN / WAIVE / OUT unchanged · I.27/I.28
**SSOT:** [PROJECT_STATE.md](./PROJECT_STATE.md) · [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) · [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md)
**Next:** Owner docs-publish GO for this reconcile · then separate GOs for worker / staging RO / migration / E2E (one GO ≠ next)

## 2026-10-15 — SFM SSOT reconcile: Stages A/B1/C/D + OD-06 CODE ON MAIN (docs-only)

**Status:** **DOCS SSOT** · **NO APP CODE** · **NO MIGRATIONS** · **NO `db push` / repair / apply** · **NO DEPLOY / FLAG / CONTABO**
**Parent tip:** `e8d21271e7af5042eadc5b6d30d2e3fbbed99e3c` (`e8d2127`) — SFM type/poller fix already on `main`
**Problem fixed:** Living `PROJECT_STATE` still said Stage C executors **NOT IMPLEMENTED** and framed F-addendum/product as unimplemented, while `main` already contains foundation/grants/executor/artifacts/download+UI (commits `7fb5dcb` → `e8d2127`).
**Planes (do not collapse):**

| Plane | Status |
|-------|--------|
| Code on `main` | A · B1 · C (`claim_next_sfm_job` service_role) · D · OD-06 download + UI `sfmVersionId` |
| Local unit tests | `src/lib/sfm` **143 PASS** at tip evidence (re-verify after fetch) |
| Staging E2E | **NOT DONE** |
| Prod app deploy of tip | **NOT VERIFIED** (last-known deploy SHA **`2adb569`**) |
| Prod DB SFM A–D | Applied via MCP; remote versions `20261015…` ≠ local `20261014…` · drift guardrail **ACTIVE** |
| `SFM_VERSIONS_V1` | Default **OFF** |
| Contabo SFM bake/claim | **NOT WIRED** (poller remains `STUDIO_EXPORT` only) |
| SFM Production GREEN | **NOT CLAIMED** |

**Still OPEN:** OD-04 · OD-SFM-ID-05 · migration full alignment · deploy · flag · Contabo SFM Ops · staging/prod E2E
**Preserved:** historical CHANGELOG design-accept entries (do not rewrite) · I.27/I.28 · migration drift ban · Final Mix (STUDIO_EXPORT) GREEN / WAIVE / OUT unchanged
**SSOT:** [PROJECT_STATE.md](./PROJECT_STATE.md) · pointers in MASTER / FINAL_COLD Updated lines
**Next:** Owner docs-publish GO for this reconcile · then separate GOs for ops planes above

## 2026-10-15 — Migration history drift guardrail (docs-only)

**Status:** **DOCS GUARDRAIL** · **NO CODE / NO SQL / NO MIGRATION FILE CHANGES** · **NO `db push` / `migration up` / `migration repair` / re-apply** · **NO DEPLOY / FLAG / WORKER**
**Supersedes for ops policy only:** extends I.27 ban; **does not rewrite** I.27/I.28 historical entry (see **2026-10-10 — STUDIO_EXPORT Stages I.26–I.28**)
**Context:** Production SFM schema A→B1→C→D applied via MCP `apply_migration` on `rzzxrgcdogkybkiidqgw`. Local filenames use `20261014…`; remote `schema_migrations` recorded apply-time `20261015…` for the same four names. Broader audit: **43** name-matched migrations with divergent versions · **10** version-aligned · partial SFM-only repair **does not** clear the rest.
**Living rules (mandatory until Owner GO for full history alignment):**

1. **Drift scope:** Migration history drift is a **project-wide** registry problem, not SFM-only. Do not treat “SFM applied” as “history aligned.”
2. **Hard ban:** Do **not** run `supabase db push` or `supabase migration up` against production until local filenames and remote `schema_migrations` versions are **fully** reconciled under an explicit Owner GO. Risk: re-applying DDL under local version stamps missing from remote history.
3. **No mixed apply without same-GO history closeout:** Do not mix production apply mechanisms (MCP `apply_migration` vs CLI `db push`) in an uncontrolled way. If MCP apply is used, the **same Owner-approved scope** must also close history (repair and/or filename alignment) **or** explicitly leave status quo with this ban still in force.
4. **Partial SFM repair ≠ unlock:** Marking only the four SFM local `20261014…` versions applied (and/or reverting remote `20261015…`) **does not** authorize `db push`. Remaining drifts stay blocking.
5. **Future migration ladder (every change):** (a) author migration file · (b) local test · (c) **separate Owner GO** for production apply · (d) verify remote history **and** objects after apply · (e) no flag/deploy/worker in the same GO unless that GO says so.
6. **Still forbidden without separate GO:** `migration repair`, rewriting `schema_migrations`, re-running migration SQL, enabling `SFM_VERSIONS_V1`, deploy, Contabo/worker ops.

**Preserved:** I.27 (no `db push` until aligned) · I.28 (rename local files to match prod versions; SQL unchanged; history not rewritten)
**Not claimed:** full history reconciliation executed · `db push` safe · SFM flag ON · app deploy for SFM cutover
**SSOT pointers:** [PROJECT_STATE.md](./PROJECT_STATE.md) §2b · [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) · [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md)
**Next:** Owner chooses status quo (keep ban) **or** separate GO for SFM-narrow repair **or** full alignment (repair / I.28-style rename) — none of those are authorized by this docs note alone

## 2026-10-14 — OD-SFM-ID-07 ACCEPTED — exact SFM `render_jobs.kind` (docs-only, local worktree)

**Status:** **DOCS** · Owner ACCEPT variant A · **NO CODE** · **NO MIGRATIONS** · **NO COMMIT** · **NO PUSH** · **NO PRODUCTION** · **NO CONTABO**
**Base tip:** `a4ea89c5b1c8cb74aec243a002ca22805fe293e9` (`origin/main`)
**Delivered (isolated worktree):** OPEN_DECISIONS · DECISION_LOG · [IMPLEMENTATION_DESIGN](./decisions/STUDIO_FINAL_MIX_IMPLEMENTATION_DESIGN.md) · [DATA_MODEL](./decisions/STUDIO_FINAL_MIX_DATA_MODEL.md) · [RPC_SECURITY](./decisions/STUDIO_FINAL_MIX_RPC_SECURITY_CONTRACT.md) · PROJECT_STATE · CHANGELOG
**OD-SFM-ID-07 CLOSED:** `SFM_MIX_PREPARE` · `SFM_MASTER_BAKE` · `SFM_QUALITY_ENCODE`
**Locked:** domain stages remain `SFM_MIX`/`SFM_MASTER` · job SUCCEEDED ≠ stage complete · ≠ MIX/STUDIO_EXPORT identity · fail-closed `mapJobKind` · separate SFM claim · STUDIO_EXPORT poller unchanged · no Contabo auto-enable · no auto FAILED→QUEUED
**Deferred to Stage C Implementation GO:** CHECK/XOR · version bind · claim RPC · stage↔job wiring
**Still OPEN:** OD-04 · OD-SFM-ID-05 · OD-SFM-ID-06 · Contabo Ops GOs · GO-SFM-IMPL-C
**Next:** docs-publish GO (Owner) · then Stage C Implementation GO (not this session)

## 2026-10-14 — SFM Implementation Design reconciled OD-SFM-ID-01…04 (docs-only, local worktree)

**Status:** **DOCS** · Owner design decisions ACCEPTED · **NO CODE** · **NO COMMIT** · **NO PUSH** · **NO PRODUCTION**
**Delivered (isolated worktree):** [IMPLEMENTATION_DESIGN](./decisions/STUDIO_FINAL_MIX_IMPLEMENTATION_DESIGN.md) · [DATA_MODEL](./decisions/STUDIO_FINAL_MIX_DATA_MODEL.md) · [RPC_SECURITY](./decisions/STUDIO_FINAL_MIX_RPC_SECURITY_CONTRACT.md) · [TEST_MATRIX](./decisions/STUDIO_FINAL_MIX_TEST_MATRIX.md) · OPEN_DECISIONS / DECISION_LOG / PROJECT_STATE
**OD-SFM-ID-01:** dedicated SFM download route; mix route DENY SFM after cutover; E3/TAKE/RAW unchanged
**OD-SFM-ID-02:** version grant + historical `granted_qualities` snapshot; ≠ unlimited future qualities; expand-on-upgrade = OD-SFM-ID-05 OPEN (strict until then)
**OD-SFM-ID-03:** many `AVAILABLE` paid slots per Warsaw day; atomic bind; idempotent payment_ref
**OD-SFM-ID-04:** `SFM_MIX` = separate executor job ≠ E3 `kind=MIX`
**Still OPEN (at entry time; OD-SFM-ID-07 later CLOSED same day):** OD-04 · OD-SFM-ID-05…07 · Implementation GO · Contabo Ops GOs
**Next (historical):** docs-publish GO · then separate Implementation GO — see OD-SFM-ID-07 ACCEPT entry above

## 2026-10-14 — SFM F02b/F03b + Stages DF OWNER ACCEPTED with corrections A/B/C (docs-only, local worktree)

**Status:** **DOCS** · Owner ACCEPT with corrections · **NO CODE** · **NO COMMIT** · **NO PUSH** · **NO PRODUCTION**
**Delivered (isolated worktree):** [F-addendum](./decisions/STUDIO_FINAL_MIX_EXPORT_BAKE_F_ADDENDUM_PROPOSAL.md) · [Stages DF](./decisions/STUDIO_FINAL_MIX_VERSION_STAGES_DESIGN_FREEZE_PROPOSAL.md) · product contract / bake freeze / OPEN_DECISIONS / DECISION_LOG / PROJECT_STATE
**Correction A:** historical grant + OD-SFM-17 downgrade AuthZ; object_key/URL/READY alone insufficient
**Correction B:** ≤1 current downloadable artifact per `(versionId, QUALITY)`; atomic promote; concurrent winner rule (SQL TBD Implementation Design)
**Correction C:** domain stage names **`SFM_MIX` / `SFM_MASTER`** (≠ E3 `kind=MIX`)
**Supersession:** F02→F02b and F03→F03b **Studio Final Mix only**; F01/F04–F07 unchanged; TAKE/RAW/E3 unchanged
**Still OPEN:** OD-04 payment provider · Implementation GO
**Next:** optional docs publish GO · then separate Implementation GO

## 2026-10-14 — SFM OD-SFM-08/12/14 ACCEPTED + F-addendum / Stages DF then PROPOSAL (docs-only) — HISTORY

**Status:** **DOCS** · Owner ACCEPT OD-SFM-08/12/14 · F/Stages were PROPOSAL pending — superseded same day by ACCEPT-with-corrections entry above
**OD-SFM-08/12/14:** variant C · 90d · paid slot B
**Next (historical):** Owner ACCEPT F/Stages — **DONE** (see entry above)

## 2026-10-14 — Studio Final Mix Product Contract ACCEPTED (docs-only)

**Status:** **DOCS / SSOT** · Owner formal ACCEPT · **NO CODE** · **NO MIGRATIONS** · **NO PRODUCTION CHANGES** · **NO CONTABO / PAYMENTS** · direct `main` via isolated worktree (no PR)
**Delivered:** [STUDIO_FINAL_MIX_PRODUCT_CONTRACT_ADDENDUM.md](./decisions/STUDIO_FINAL_MIX_PRODUCT_CONTRACT_ADDENDUM.md) · OD-SFM-07…18 living product rules · **OD-SFM-02 SUPERSEDED** (product ladder; history preserved in Design Freeze §13) · OPEN_DECISIONS / DECISION_LOG / PROJECT_STATE updates
**Accepted (summary):** plan download ladder · grant per version · daily first-download 0/1/2/5 · reset `Europe/Warsaw`+DST · paid **7,99 PLN** = one extra first-download day-slot · Accept→MIX→MASTER · lazy variants · 90d retention · domain ≠ E3 / TAKE_EXPORT
**Explicit non-claims:** multi-variant Studio export **not** implemented · paid provider **not** integrated · runtime may still be WAV-only MVP until Implementation GO
**Follow-up same day:** OD-SFM-08/12/14 detail CLOSED + F/Stages proposals — see entry above
**Next:** Owner review of F-addendum / Stages DF proposals

## 2026-10-13 — GO-POLLER-KILL-SWITCH-01 fail-closed poller bootstrap

**Status:** **CODE + LOCAL TESTS** · selective Contabo sync in same GO · **NO** always-on / enable / start · direct `main` (no PR)
**Delivered:** `decideStudioExportPollerBootstrap` · `parseE3RenderJobsEnabledFlag` · `E3_RENDER_JOBS_ENABLED` false/missing/empty/invalid → `poller_disabled` + exit **0** (no claim/bake) · defense-in-depth `assertRenderJobsRuntimeEnabled` unchanged · vitest kill-switch suite
**Ops note:** flag changes require process restart (no hot-reload) · systemd `Restart=no` remains
**Explicit:** no enqueue/claim/bake on prod · oneshot unit unchanged · Sacred WIP untouched
**Docs:** CONTABO_CONTINUOUS_WORKER_V1_IMPLEMENTATION · DESIGN_FREEZE OD-CWP-09 · this entry
**Next:** Owner GO for always-on activation (separate)

## 2026-10-13 — GO-IMPL-CONTABO-POLL IMPLEMENTED / LOCAL TESTS PASS

**Status:** **CODE + LOCAL TESTS** · Contabo sync **NOT DONE** · production deployment **NOT DONE** · host verification **NOT DONE** · canary **NOT RUN** · always-on **NOT ENABLED** · direct `main` (no PR)
**Delivered:** migration `claim_next_studio_export_job` (service_role · SKIP LOCKED + CAS) · `claimNextStudioExportAsWorker` · `runAlreadyClaimedStudioExportWorkerJob` · `npm run e3:worker:poll` · vitest PASS
**Explicit:** local impl ≠ Contabo enable · Final Mix GREEN / WAIVE / OUT unchanged · migration **not** applied to production
**Docs:** audits/CONTABO_CONTINUOUS_WORKER_V1_IMPLEMENTATION.md · freeze living · OPEN_DECISIONS · DECISION_LOG · PROJECT_STATE · README · FINAL_COLD / MASTER · this entry
**Next OPEN GOs:** GO-HOST-RO-CONTABO · GO-SYNC-CONTABO-POLL · GO-ENABLE-CANARY · GO-ALWAYS-ON · prod migration apply

## 2026-10-13 — GO-DF-CONTABO-POLL Design Freeze ACCEPTED

**Status:** **DESIGN FREEZE** · followed by GO-IMPL local impl · **NO CONTABO ENABLE** · direct `main` (no PR)
**Locked:** OD-CWP-01…08 · V1 poller = **`STUDIO_EXPORT` only** · max 1 active · atomic claim-next · FINDING-01 on `RUNNING` · bake must not re-claim `QUEUED` · no auto-retry · enqueue unchanged
**Explicit:** freeze ≠ Contabo enable · Final Mix GREEN scope unchanged
**Docs:** decisions/CONTABO_CONTINUOUS_WORKER_DESIGN_FREEZE.md · OPEN_DECISIONS · DECISION_LOG · PROJECT_STATE · README · FINAL_COLD / MASTER · this entry
**Next OPEN GOs (at freeze time):** GO-IMPL-CONTABO-POLL · GO-HOST-RO-CONTABO · GO-SYNC · GO-ENABLE-CANARY · GO-ALWAYS-ON

## 2026-10-13 — Final Mix Production GREEN VERIFIED (docs closeout)

**Status:** **DOCS CLOSEOUT** · Final Mix Production GREEN **VERIFIED** under frozen IN allowlist · direct `main` (no PR)
**Preflight tip:** `dcd23080e1adbc951f0c1b58224bcf24248860b8` · all IN PASS verified from source closeouts
**IN:** Stage J CLOSED · I.45DR · J2 · object_key · P5/P6 JSON · empty-session prod · FULL FIXTURE (`21d98be2-…` · RIFF/WAVE · 10,584,044 B · SHA-256 recorded) · I.18 tip ON MAIN
**WAIVE unchanged:** Contabo always-on (disabled/inactive) · bit-perfect PCM · P6.8
**OUT unchanged:** full IDOR · apex · empty-project delete · Studio migration CLOSED claim
**Explicit:** GREEN ≠ Contabo always-on · ≠ bit-perfect · ≠ P6.8 · ≠ OUT · no new probes
**Docs:** audits/FINAL_MIX_PRODUCTION_GREEN_CLOSEOUT.md · PROJECT_STATE · GO-FM-CRITERIA living · bake freeze · README · FINAL_COLD / MASTER · this entry
**Next:** Owner decision — Contabo Ops / P6.8 / OUT (independent) · do not expand GREEN scope

## 2026-10-13 — FULL FIXTURE VERIFIED PASS (gate #7 · Path B)

**Status:** **DOCS CLOSEOUT** after Owner-authorized byte download + QC · Final Mix still **NOT VERIFIED** · direct `main` (no PR)
**Gate #7:** **PASS** · artifact `21d98be2-29b2-4d1d-8efb-b1c40af4709e` (I.45DR READY) · `RIFF`/`WAVE` · 10,584,044 B · size coherence · SHA-256 fingerprint recorded · **no** signed URL/token/cookie retained
**Path A rejected:** tip I.45BM/BO one-liners insufficient without dedicated byte/QC report
**Unchanged:** Stage J **CLOSED** · empty-session prod **PASS** · Contabo always-on **disabled/inactive** · P6.8 **NOT STARTED**
**Explicit:** FULL FIXTURE PASS **≠** Final Mix Production GREEN (needs separate GREEN closeout GO)
**Docs:** audits/FINAL_MIX_FULL_FIXTURE_VERIFIED_CLOSEOUT.md · PROJECT_STATE · GO-FM-CRITERIA living gate #7 · bake freeze · README · FINAL_COLD / MASTER · this entry
**Next:** Owner GO — Final Mix Production GREEN docs closeout · ≠ GREEN yet

## 2026-10-13 — Empty-session production gate PASS (docs closeout)

**Status:** **DOCS CLOSEOUT** · **NO CODE** · **NO PROD HTTP** · **NO CONTABO** (execution already done under prior Owner GOs) · Final Mix still **NOT VERIFIED** · direct `main` (no PR)
**Gate:** Empty-session production **PASS** · job `dac8ccb9-4bb1-48e9-848a-e8bfeb65d4fb` · `FAILED` · `STUDIO_RENDER_EMPTY_SESSION` · `artifactId=null` · no SUCCEEDED/READY/WAV
**Unchanged:** Stage J **CLOSED** · **FULL FIXTURE VERIFIED NOT CONFIRMED** · Contabo always-on **disabled/inactive** · P6.8 **NOT STARTED**
**Explicit:** empty-session prod PASS **≠** Final Mix Production GREEN
**Docs:** audits/STUDIO_EXPORT_EMPTY_SESSION_PRODUCTION_CLOSEOUT.md · PROJECT_STATE · GO-FM-CRITERIA living gate rows · bake freeze · README · FINAL_COLD · this entry
**Next:** Owner GO — FULL FIXTURE VERIFIED / Final Mix GREEN closeout (separate) · ≠ GREEN yet

## 2026-10-13 — GO-FM-CRITERIA Final Mix Production GREEN freeze

**Status:** **CRITERIA FREEZE** · **NO CODE** · **NO PROD HTTP** · **NO WAV** · **NO CONTABO** · Final Mix still **NOT VERIFIED** (≠ GREEN) · direct `main` (no PR)
**IN already:** Stage J **CLOSED** · I.45DR **PASS** · J2 **PASS/CLOSED** · object_key **PASS** · P5/P6 JSON **PASS**
**IN open blockers:** I.18 tip evidence **MISSING ON MAIN** · empty-session prod **NOT VERIFIED** · **FULL FIXTURE VERIFIED NOT CONFIRMED**
**WAIVE:** Contabo always-on / persistent · bit-perfect PCM · P6.8
**OUT:** full IDOR · apex · empty-project delete · Studio migration CLOSED claim
**Docs:** decisions/FINAL_MIX_PRODUCTION_GREEN_CRITERIA_FREEZE.md · PROJECT_STATE §4H · bake freeze · README · this entry
**Next:** Owner GO — I.18 tip recovery · then empty-session prod + fixture bytes (separate) · ≠ GREEN yet

## 2026-10-13 — GO-SJ-DOCS-CLOSE Stage J CLOSED

**Status:** **Stage J: CLOSED** · **DOCS ONLY** · **NO CODE** · **NO PROD HTTP** · **NO WAV** · **NO CONTABO** · direct `main` (no PR)
**IN satisfied:** I.45DR **PASS** · J2 **PASS/CLOSED** · object_key reject-only **PASS** · P5/P6 JSON **PASS**
**WAIVE:** byte-level WAV/RIFF for `c596e7bc-…` · **FULL FIXTURE VERIFIED = NOT CONFIRMED**
**OUT unchanged:** empty-session prod · Contabo always-on · P6.8 · full PCM · Final Mix GREEN · full IDOR · apex · empty-project delete
**Explicit:** Stage J CLOSED **≠** Final Mix Production GREEN
**Docs:** audits/STAGE_J_FINAL_CLOSURE.md · PROJECT_STATE §4G · bake freeze · README · FINAL_COLD / MASTER living headers · criteria freeze applied note · this entry
**Next:** Owner GO — Final Mix / Contabo / P6.8 / other OUT

## 2026-10-13 — GO-SJ-CRITERIA Stage J closure criteria freeze

**Status:** **CRITERIA FREEZE** · **NO CODE** · **NO PROD HTTP** · **NO WAV** · **NO CONTABO** · Stage J still **OPEN** (≠ CLOSED) · direct `main` (no PR)
**IN (required for Stage J CLOSED):** I.45DR **PASS** · J2 **PASS/CLOSED** · object_key reject-only **PASS** · P5/P6 JSON **PASS**
**WAIVE:** byte-level WAV/RIFF for fixture `c596e7bc-…` · ≠ FULL FIXTURE VERIFIED · ≠ WAV correctness
**OUT (independent):** empty-session prod · Contabo always-on · P6.8 · full PCM · Final Mix GREEN · full IDOR · apex · empty-project delete
**Docs:** decisions/STAGE_J_CLOSURE_CRITERIA_FREEZE.md · PROJECT_STATE §4F · bake freeze living Stage J rows · README · this entry
**Next:** Owner GO — Stage J CLOSED docs closeout (apply freeze) · ≠ Final Mix GREEN

## 2026-10-13 — Stage J P5/P6 owner download probe PASS (docs closeout)

**Status:** **DOCS CLOSEOUT** · **NO CODE** · **NO RE-PROBE** · **NO WAV / SIGNED URL** · direct `main` (no PR)
**Result:** P5 **PASS** · P6 **PASS** — owner download endpoint JSON only (artifact `c596e7bc-…`) · ≠ WAV retrieval · ≠ full FIXTURE VERIFIED
**Gates unchanged:** object_key reject-only **PASS** (separate) · J2 **PASS/CLOSED** · Stage J **OPEN** · Final Mix **NOT VERIFIED** · P6.8 **NOT STARTED** · Contabo always-on **OPEN/NOT VERIFIED**
**Docs:** audits/STAGE_J_P5_P6_OWNER_DOWNLOAD_PROBE_CLOSEOUT.md · PROJECT_STATE §4E · bake freeze AuthZ row · README · this entry
**Next:** Owner GO — remaining Stage J / Final Mix gates vs P6.8

## 2026-10-13 — GO-A Stage J docs integrity (A2)

**Status:** **DOCS INTEGRITY** · **NO CODE** · **NO PROD HTTP** · **NO P5/P6** · **NO CONTABO** · direct `main` (no PR)
**Scope:** Living tip/plane reconcile to Git tip after `50d7788` · bake freeze `object_key` living row aligned to reject-only **PASS** · I.18/I.13F tip links marked **MISSING ON CURRENT MAIN** / **HISTORICAL LOCAL EVIDENCE — NOT COMMITTED** (A2 — do not land dirty local files)
**Gates unchanged:** object_key reject-only **PASS** · P5/P6 **NOT EXECUTED** · FIXTURE VERIFIED **NOT CONFIRMED** · J2 **PASS/CLOSED** · Stage J **OPEN** · Final Mix **NOT VERIFIED** · P6.8 **NOT STARTED** · Contabo always-on **OPEN/NOT VERIFIED**
**Docs:** PROJECT_STATE · bake freeze · README · FINAL_COLD_START · MASTER_HANDOFF · this entry · related I.18 link hygiene
**Next:** Owner GO — remaining Stage J / Final Mix gates vs P6.8 · optional P5/P6

## 2026-10-13 — I.48 SSOT tip/plane reconcile after PR #12

**Status:** **DOCS RECONCILE (I.48-A3)** · **NO CODE** · **NO COMMIT/PUSH/PR/DEPLOY IN THIS NOTE** · **NO HTTP / NO SQL / NO CONTABO** · isolated worktree only
**Git tip (remote main):** **`2adb5699e72c9c8c35023500a001310e227e70d7` (`2adb569`)** — Merge PR #12 (docs-only I.47 session-closure handoff) · prior tip **`f730a7a`** (PR #11) = HISTORY
**Production deploy (observed I.48-A0):** **`dpl_sAyrsHCfMVLFer669J2MgbbXbhGN`** · Ready · SHA **`2adb569`** · evidence cold-start RO (GitHub Deployments + Vercel CLI) · **I.48-A2/A3 do not re-verify** · Ready ≠ functional app GREEN ≠ Final Mix GREEN
**Prior prod (HISTORY):** **`dpl_28oHcn3w146saZ6fNDFsiCQehUQP`** @ **`f730a7a`** (I.46-A10 / I.47 snapshot)
**Planes after I.48:** Git tip **`2adb569`** · app-code tip **`ce2f0cc`** (unchanged) · prod observed **`dpl_sAyrsHC…` @ `2adb569`** · dual-plane: tip ≠ app-code ≠ dirty local WIP ≠ V2 `44f7cbd` · commit ≠ deployment ≠ domain alias
**Gates unchanged:** J2 **PASS / CLOSED** · Stage J **OPEN** · Final Mix **NOT VERIFIED / NOT GREEN** · P6.8 **NOT STARTED** · `object_key` live probe **NOT EXECUTED** · Contabo always-on **OPEN / NOT VERIFIED** · apex redirect e2e **NOT VERIFIED** · Empty-session Production **NOT VERIFIED** · FX/PCM parity **NOT VERIFIED** · Empty-project delete **NOT VERIFIED**
**Docs:** PROJECT_STATE · MASTER_HANDOFF · FINAL_COLD_START · README · bake freeze living tip/plane rows · this entry
**Next:** Owner GO — remaining Stage J / Final Mix gates vs P6.8 · no auto Contabo · no sync dirty local main · no commit/push of I.48 without separate GO

## 2026-10-12 — I.47 Session Closure & Cold-Start Handoff

**Status:** **DOCS SESSION CLOSURE (I.47)** · **NO CODE / NO COMMIT IN THIS NOTE** · **NO HTTP / NO SQL / NO CONTABO / NO REDEPLOY**
**Git tip (remote main):** **`f730a7af1ed34a9667e7bfba1a766d8481ed9df5` (`f730a7a`)** — Merge PR #11 (docs-only SSOT tip/plane) · prior tip **`522e514`** (PR #10 J2 docs) = HISTORY
**I.46 closure facts:** PR #10 merged @ `522e514` · PR #11 merged @ `f730a7a` · **I.46-A10** confirmed Production deploy **`dpl_28oHcn3w146saZ6fNDFsiCQehUQP`** Ready @ SHA `f730a7a` · aliases www + `bitrymdym.vercel.app` + `bitrymdym.pl` assigned · apex redirect e2e **NOT VERIFIED** · functional app GREEN **not** claimed
**Planes after I.47:** Git tip **`f730a7a`** · app-code tip **`ce2f0cc`** · prod last-confirmed **`dpl_28oH…` @ `f730a7a`** (I.46-A10 · this note does **not** re-verify) · prior prod `dpl_7Cp2gQ9…` @ `df37048` = HISTORY
**Gates unchanged:** J2 **PASS / CLOSED** · Stage J **OPEN** · Final Mix **NOT VERIFIED / NOT GREEN** · P6.8 **NOT STARTED** · `object_key` live probe **NOT EXECUTED** · Contabo always-on **OPEN / NOT VERIFIED** · apex redirect e2e **NOT VERIFIED**
**Cold-start:** complete MASTER PROMPTS (ChatGPT + Cursor) in [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md) §12
**Docs:** PROJECT_STATE · MASTER_HANDOFF · FINAL_COLD_START · README · bake freeze living tip/plane rows · this entry
**Next:** Owner GO — remaining Stage J / Final Mix gates vs P6.8 · no auto Contabo · no sync dirty local main · no commit/push of I.47 without separate GO

## 2026-10-12 — I.46-A5 SSOT tip/plane reconcile after PR #10 merge

**Status:** **DOCS RECONCILE (I.46-A5)** · **NO CODE / NO COMMIT IN THIS NOTE** · **NO HTTP / NO SQL / NO CONTABO / NO REDEPLOY**
**PR #10:** **MERGED** · merge SHA `522e514fcc42f314b4db621c80c30d7412ee7e08` (`522e514`) · scope = **documentation-only** closure of Stage J gate **J2** (Download AuthZ closeout docs)
**Planes (authoritative after this note):** GitHub main tip **`522e514`** · app-code tip **`ce2f0cc`** (last-established in available evidence) · production last-known **`dpl_7Cp2gQ9BX3s8jVG9faL3LUjMgyt5`** @ **`df37048`** (I.45EJ-R1 · **HISTORICAL / NEEDS FRESH VERIFY**)
**Explicit non-claims:** merge `522e514` does **not** prove that SHA was deployed · docs may deploy via pipeline, but this task does **not** assume that happened · domain aliases remain last-known until re-verified · merge is **not** evidence of a functional app-code production release
**Gates unchanged:** J2 **PASS / CLOSED** · Stage J **OPEN** · Full Final Mix GREEN **NOT VERIFIED / OPEN** · P6.8 **NOT STARTED** · `object_key` live probe **NOT EXECUTED** · Contabo always-on **OPEN / NOT VERIFIED**
**Docs:** PROJECT_STATE · MASTER_HANDOFF · README · FINAL_COLD_START · bake freeze living tip/plane rows · this entry
**Next:** Owner GO — remaining Stage J / Final Mix gates vs P6.8 · fresh production plane verify if needed · no auto Contabo enable

## 2026-10-12 — I.45EX J2 Download AuthZ gate PASS / CLOSED (A16–A18)

**Status:** **DOCS CLOSEOUT (I.45EX J2)** · **NO CODE / NO COMMIT IN THIS NOTE** · **NO HTTP / NO SQL / NO CONTABO**
**Gate:** Stage J **J2** (narrow cross-user / owner / unauth download AuthZ) → **PASS / CLOSED**
**Evidence:** I.45EX-A16 owner GET → HTTP **200** · `success=true` · `hasUrl=true` · `qualityTier=WAV` · ALLOW · I.45EX-A17 other user → HTTP **403** · `success=false` · `hasUrl=false` · DENY · I.45EX-A18 unauth `credentials: 'omit'` → HTTP **401** · `success=false` · `hasUrl=false` · DENY
**Fixture:** artifact `c596e7bc-a031-4df8-a17b-31c4fd2cce8b` · job `61b7cdf1-…` untouched · canary `21d98be2-…` excluded · Sacred SHA256 **MATCH** on all three · no WAV bytes / no signed URL in evidence · `object_key` live probe **NOT EXECUTED**
**Not claimed:** Stage J full close · Full Final Mix Production GREEN · P6.8 · Contabo always-on · full module security audit · deploy/tip change
**Docs:** [I45EX_J2_DOWNLOAD_AUTHZ_GATE_CLOSEOUT.md](./audits/I45EX_J2_DOWNLOAD_AUTHZ_GATE_CLOSEOUT.md) · PROJECT_STATE · MASTER_HANDOFF · README · FINAL_COLD_START · bake freeze living AuthZ/J2 rows · this entry
**Next:** Owner GO — remaining Stage J / Final Mix gates vs P6.8 · no auto Contabo enable
**Later tip note:** PR #10 merged this closeout at `522e514` — see I.46-A5 entry above for tip/plane split (merge ≠ deploy)

## 2026-10-12 — I.45EK Production deploy & alias SSOT (I.45EJ-R1 evidence)

**Status:** **DOCS RECONCILE (I.45EK-DOCS)** · **NO CODE / NO COMMIT IN THIS NOTE** · **NO REDEPLOY / NO ALIAS MUTATION**
**Evidence:** **I.45EJ-R1 PASS** — authorized Vercel panel read-only (existing evidence; **not** a fresh live re-verify in this note)
**PR #8:** MERGED · merge SHA `df37048d0b34439de5b77ed83350048a6335c391` · **docs-only** (not an app feature release)
**Vercel Production:** `dpl_7Cp2gQ9BX3s8jVG9faL3LUjMgyt5` · deployment SHA `df37048…` · Ready · Current · Latest (per I.45EJ-R1)
**Aliases:** `www.bitrymdym.pl` **ASSIGNED** · `bitrymdym.vercel.app` **ASSIGNED** · `bitrymdym.pl` HTTP **308 → www** (not a direct deployment alias)
**Planes:** commit ≠ deployment ≠ domain alias · docs tip `df37048` / `dpl_7Cp2gQ9…` · app-code tip `ce2f0cc` / prior `dpl_1P8ixpt…` = **HISTORY** for live aliases
**Not claimed:** Final Mix / Stage J / P6.8 / Contabo always-on / worker status change — prior OPEN / last-known unchanged
**Docs:** PROJECT_STATE · MASTER_HANDOFF · README · FINAL_COLD_START · bake freeze living Production row · this entry
**Next:** Owner GO for commit/publish of docs tip · remaining Final Mix gates vs P6.8 · no auto Contabo enable

## 2026-10-12 — I.45DZ SSOT tip reconciliation after PR #7

**Status:** **DOCS TIP RECONCILE (I.45DZ)** · **NO CODE / NO COMMIT IN THIS NOTE** · **NO CONTABO / NO REDEPLOY**
**Git:** remote `main` / docs merge tip **`e3dc0b9036ee85dd91ffca845362b4b12431f1bc` (`e3dc0b9`)** — Merge PR #7 · prior docs tip **`d3ef59a`** (PR #6) = **HISTORY** · app-code tip **`ce2f0cc`** unchanged
**Deployments:** app **`dpl_1P8ixpt2snpqTHMvERKSDtvDcwRH`** @ `ce2f0cc` · docs-only last-known **`dpl_HM2sq…`** (PR #6) · post-PR #7 docs `dpl_*` **UNKNOWN** (not guessed)
**I.45DR / gates unchanged:** narrow WAV canary PASS · Full Final Mix GREEN **OPEN** · Stage J full close **OPEN** · P6.8 **NOT STARTED** · persistent worker **disabled/inactive** (last-known)
**Docs:** PROJECT_STATE · MASTER_HANDOFF · README · FINAL_COLD_START · bake freeze living tip rows · this entry
**Next:** Owner GO on publication of this docs tip reconcile · do not treat docs tip as app tip

## 2026-10-12 — I.45DX docs plane clarity (app tip vs docs tip vs deployments)

**Status:** **DOCS CLARITY (I.45DX)** · **NO CODE / NO COMMIT IN THIS NOTE** · **NO CONTABO / NO REDEPLOY**
**Planes (authoritative):** app-code tip **`ce2f0cc`** · app deploy **`dpl_1P8ixpt2snpqTHMvERKSDtvDcwRH`** · docs merge tip **`d3ef59a`** (PR #6) · docs-only deploy **`dpl_HM2sqJFv5XJSJ5tU7hmXR4znzN5g`** (auto after PR #6) · **not interchangeable**
**I.45DR facts unchanged:** job `53398f9e-…` **SUCCEEDED** · artifact `21d98be2-…` **READY** · persistent worker **disabled/inactive** · Full Final Mix GREEN **OPEN** · P6.8 **NOT STARTED**
**Docs:** PROJECT_STATE · MASTER_HANDOFF · README · FINAL_COLD_START · bake freeze living plane notes · this entry
**Next:** Owner GO on publication of this docs branch · do not swap `ce2f0cc`↔`d3ef59a` as if equivalent

## 2026-10-12 — I.45DR Contabo STUDIO_EXPORT WAV canary (SSOT docs I.45DT)

**Status:** **RUNTIME PASS (narrow canary)** · **DOCS RECONCILE (I.45DT)** · **NO CODE / NO COMMIT IN THIS NOTE** · **NO CONTABO RETRY**
**Chain:** I.45DM SSH BLOCKED → I.45DN reachability RO → I.45DO post-SSH preflight PASS → **I.45DP** manual oneshot as `bitrymdym-e3` **FAIL** before claim (`worker.env` `root:root` 600 / dir 700 unreadable; `E3_RENDER_JOBS_ENABLED=OFF` in process) → **I.45DQ** RO RCA: systemd loads `EnvironmentFile` as manager before `User=bitrymdym-e3` (no chmod) → **I.45DR** GO-ONESHOT via transient `systemd-run`
**I.45DR execution:** `systemd-run --wait --collect --uid=bitrymdym-e3 --gid=bitrymdym-e3` · unit `bitrymdym-e3-canary-53398f9e` · `WorkingDirectory=/opt/bitrymdym-e3-worker` · `EnvironmentFile=-/etc/bitrymdym-e3-worker/worker.env` · `npm run e3:worker:once -- 53398f9e-7b7f-4dc5-bc76-34e9648c6aa1` · exit **0** · unit **collected**
**Job:** `53398f9e-7b7f-4dc5-bc76-34e9648c6aa1` · project `bfc3d223-6107-4e11-a96a-470d88439f0b` · `STUDIO_EXPORT` · `WAV` · attempt **1** · **SUCCEEDED** · `started_at=2026-10-12 04:09:30.42 UTC` · `finished_at=2026-10-12 04:09:37.125 UTC` · `worker_ref=null`
**Artifact:** `21d98be2-29b2-4d1d-8efb-b1c40af4709e` · **READY** · bucket `audio-artifacts` · `audio/wav` · **10,584,044** B (= `storage.objects`) · **60,000** ms · encoder `pcm_s16le_wav`
**Persistent service:** `bitrymdym-e3-worker.service` remained **disabled/inactive** · no continuous worker / timer / cron · no other jobs · no `worker.env` permission/content change
**Flag:** `E3_RENDER_JOBS_ENABLED` **TRUE** — last confirmed I.45DO/I.45DR (not a perpetual runtime guarantee)
**Historic job:** `61b7cdf1-0dfa-41aa-a493-e4f438d09131` remained **SUCCEEDED** / untouched
**I.45DR — PASS:** narrow production STUDIO_EXPORT WAV canary
**Full Studio Final Mix Production GREEN — nadal NOT VERIFIED / OPEN** (Live↔Offline FX/PCM · empty-session prod · cross-user AuthZ · Studio migration CLOSED · Contabo full-tree = tip · always-on · Stage J full close · P6.8)
**Docs (I.45DT):** PROJECT_STATE · MASTER_HANDOFF · README · FINAL_COLD_START · bake freeze living Contabo/Stage J · this entry
**Next:** Owner GO — remaining Final Mix gates vs P6.8 · do **not** re-run `53398f9e-…` or `61b7cdf1-…` · no auto Contabo enable

## 2026-10-11 — I.45CW Studio project delete export-history conflict (SSOT docs)

**Status:** **DOCS RECONCILE (I.45CW)** · **NO CODE / NO COMMIT IN THIS NOTE** · **NO RE-DELETE / NO JOB RE-RUN**
**Land:** PR #5 merge `ce2f0cc7ad7f5257577e858d64ca8531ebb35000` · feature `18eec832a330a33dc4db5678917cde923e849b07` · Vercel Production `dpl_1P8ixpt2snpqTHMvERKSDtvDcwRH` (Ready)
**Behavior (Variant A):** hard-delete of owned Studio project with `render_jobs` / `audio_artifacts` → controlled `AuthError CONFLICT` → HTTP **409** + Polish message; FK `ON DELETE RESTRICT` unchanged; jobs/artifacts/takes/beats/Storage **not** deleted
**I.45CV runtime (Owner GO, exactly one DELETE):** project `d07f3011-8a64-4d90-a54a-cd50d1219b6a` · HTTP **409** · exact PL copy · project retained · `render_jobs` 1→1 · `audio_artifacts` 1→1 · no raw SQL/FK · job `61b7cdf1-…` untouched
**PRODUCTION VERIFIED (narrow):** scenario *projekt ma historię eksportów → HTTP 409 → dane zachowane* only
**Not claimed:** empty-project happy-path delete · full Project List Delete module re-verification · Final Mix / Stage J GREEN · Contabo always-on · soft-delete/archive
**Docs:** PROJECT_STATE · MASTER_HANDOFF · README · FINAL_COLD_START · bake freeze living note · list-delete gate addendum · this entry
**Next:** Stage J vs P6.8 (Owner GO) · do not re-run export `61b7cdf1…` · no auto Contabo start

## 2026-10-11 — I.45CB–I.45CF Contabo markers update (SSOT docs I.45CG)

**Status:** **DOCS RECONCILE (I.45CG)** · **NO CODE / NO COMMIT IN THIS NOTE** · **NO WORKER START / NO NEW ONESHOT**
**I.45CB:** Contabo remaining tree drift RO — true runtime closure 67 vs `faf734b`: **1 RAW_MATCH** (`render-worker-pipeline.ts` SHA256 `4a737f94…`) · **66 LINE_ENDING_ONLY** · **0 REAL_CONTENT_DIFF** · API-outside-closure drift OPEN (`studio-export-service` / missing `failure-contract`)
**I.45CC–CE:** marker compatibility + write preflight — two-file ordered publish (not pair-atomic) · `DEPLOYED_COMMIT` = reference tip not full-tree claim
**I.45CF:** markers APPLIED — tip `faf734bd99a13b427f00745563b54583f7258e94` · `SOURCE=github-raw-blob-selective` · `PATHS=src/lib/audio/render-worker-pipeline.ts` · `I45CC_STATUS=applied` · marker SHA256 `DEPLOYED_COMMIT`=`bdf63b2f…404c` · `WORKER_TARGET_SHA`=`f84af2a8…5379` · backup `/opt/bitrymdym-e3-worker/_backup_20261011T133026Z_i45cf_markers/` · apply script validator failed after both publishes; independent re-verify **PASS** · no rollback · service remained disabled/inactive · no oneshot
**History retained:** pre-I.45CF markers `4778be5`/I.45Q · I.45BU flag last-known TRUE · current flag **UNKNOWN**
**Not claimed:** Contabo full-tree = `faf734b` · continuous mode · Stage J CLOSED · Final Mix Production GREEN · P6.8 · FX parity · Studio migration CLOSED · new enqueue/oneshot
**Docs (I.45CG):** PROJECT_STATE · MASTER_HANDOFF · README · FINAL_COLD_START · bake freeze living Contabo row · this entry
**Next:** Stage J vs P6.8 (Owner GO only) · do not re-run export `61b7cdf1…` · no auto Contabo start

## 2026-10-11 — I.45BS–I.45BY Contabo pipeline tip-align + export status (SSOT docs I.45CA)

**Status:** **DOCS RECONCILE (I.45CA)** · **NO CODE / NO COMMIT IN THIS NOTE** · **NO WORKER START / NO NEW ONESHOT**
**I.45BS:** Contabo RO readiness — service disabled/inactive · pipeline then @ `4778be5` · tree drift vs GitHub OPEN
**I.45BU:** safe flag check `E3_RENDER_JOBS_ENABLED` → **VERIFIED TRUE** (no raw value / no other env dump)
**I.45BV/BW:** single-file sync `render-worker-pipeline.ts` → SHA256 `4a737f94…` (= `@faf734b`) · backup old `f1815bdd…` · markers still `4778be5`/I.45Q · post-sync verify PASS WITH LIMITATIONS
**I.45BY:** owner-auth GET job `61b7cdf1-0dfa-41aa-a493-e4f438d09131` / project `d07f3011-8a64-4d90-a54a-cd50d1219b6a` → HTTP 200 · `STUDIO_EXPORT` · **SUCCEEDED** · artifact present · **no re-run**
**Not claimed:** worker continuous mode · full worker-tree align · Stage J CLOSED · Final Mix Production GREEN · Studio migration CLOSED · new enqueue/oneshot after I.45BV
**Docs (I.45CA):** PROJECT_STATE · MASTER_HANDOFF · README · FINAL_COLD_START · bake freeze living Stage I · this entry
**Next (historical I.45CA):** worker-tree drift RO audit/plan → optional markers GO → Stage J vs P6.8 — **superseded living NEXT by I.45CG** (markers done)

## 2026-10-11 — STUDIO_EXPORT PR #4 land + I.45 narrow production smoke (SSOT docs)

**Status:** **APP DEPLOYED** @ `faf734bd99a13b427f00745563b54583f7258e94` / `dpl_9YDCyG4jU6cDuyLu111VaEVQmSqy` · **≠ Final Mix Production GREEN / Stage J** · **Studio migration ≠ CLOSED** · **THIS NOTE = DOCS SSOT RECONCILE (I.45BR)** · **NO CODE / NO COMMIT IN THIS NOTE**
**Merge:** PR #4 — Studio Export recovery (I.45AU/AW latest GET) + I.17 typed public failure surface on status/recovery paths
**Prod smoke (narrow, Owner-authorized I.45BK/BM/BO):** recovery GET-only **PASS** · existing WAV download **PASS** (API HTTP 200 · RIFF/WAVE · size match · Windows saves `WAV.wav`)
**Not claimed:** new prod enqueue→Contabo worker E2E · empty-session on production · cross-user download AuthZ · full Live↔Offline FX/PCM parity · Contabo always-on · Loop/Metronom · P6.8 · Stage J CLOSED
**Docs (I.45BR):** PROJECT_STATE · MASTER_HANDOFF · README · bake freeze living Stage I · this changelog entry
**Next:** Contabo readiness read-only + strategic Stage J vs P6.8 — Owner GO only

## 2026-10-10 — STUDIO_EXPORT Stages I.26–I.28 production migrations + local version alignment

**Status:** **PRODUCTION SCHEMA APPLIED (I.26)** · **LOCAL FILENAME ALIGNMENT (I.28)** · **NO DEPLOY / CANARY / WORKER START** · **NO COMMIT IN THIS NOTE**
**Production applied versions (MCP `apply_migration` on `rzzxrgcdogkybkiidqgw`):**
`20261010185003_studio_export_render_job_kind` · `20261010185020_studio_export_document_snapshot` · `20261010185034_studio_export_audio_artifacts`
**Original local filename prefixes (pre–I.28):** `20261010010000` · `20261010020000` · `20261010030000`
**I.28:** renamed local migration files to match production history versions; **SQL content unchanged** (same SHA-256); production migration history **not rewritten**
**I.27:** read-only reconciliation audit — do **not** run `supabase db push` until local filenames and remote history versions are verified aligned (risk of re-applying DDL under the old local prefixes)
**Not claimed here:** app deploy · Contabo start · Studio Export canary · commit/push of rename

## 2026-10-10 — STUDIO_EXPORT Stage I.20 SSOT reconcile + I.18 evidence freeze

**Status:** **DOCS ONLY** · **NO CODE** · **NO TESTS / WORKER / SUPABASE** · **NO COMMIT/PUSH/DEPLOY**
**Scope:** Freeze historical I.18 local empty-session integration PASS; correct SSOT contradictions (I.14-02 typed `error_code`; remove stale “no worker+DB integration”)
**Docs:** `STUDIO_EXPORT_I18_EMPTY_SESSION_INTEGRATION.md` (**MISSING ON CURRENT MAIN** · **HISTORICAL LOCAL EVIDENCE — NOT COMMITTED** · GO-A A2) · bake freeze §8/§16 / Stage I status
**Not claimed:** production schema · prod deploy · Contabo · canary · full Live↔Offline PCM parity
**Next:** Owner GO for fresh production schema verification (read-only) before any migrate/deploy/canary discussion

## 2026-10-10 — STUDIO_EXPORT Stage I.8 reconcile I.3A + SSOT

**Status:** **LOCAL RECONCILE** · **UNIT TESTS THIS SESSION** · **NO COMMIT/PUSH/DEPLOY**
**Scope:** Promote Stage I.3A dialog focus/a11y from worktree into main; update living SSOT after Stage I.7 PASS
**Code:** `studio-dialog-focus.ts` · `studio-export-control.tsx` (focus trap / Escape / restore / dialog semantics) · `studio-export-ui.test.ts` I.3A suite · `domain.ts` comment (kind is worker-backed)
**Docs:** PROJECT_STATE · MASTER_HANDOFF · README · bake freeze Stage I/I.7 status · historical Stage F “bake not implemented” marked superseded
**Not done:** Contabo · prod deploy · cross-user download AuthZ · FX live/offline parity · commit/push
**Next:** Owner GO Contabo/canary **or** commit/land — do not mark production GREEN

## 2026-10-10 — STUDIO_EXPORT Stage I.7 controlled local E2E

**Status:** **PASS** · **LOCAL ISOLATED ONLY** · **PRODUCTION NOT DEPLOYED** · **Contabo STOPPED**
**Scope:** Worktree + local Supabase UI→POST→single `e3:worker:once`→WAV/QC→Storage→`audio_artifacts`→authorized download→cleanup
**Evidence:** RIFF/WAVE · PCM 16-bit stereo · 44.1 kHz · duration 1500 ms · Storage SHA = download SHA
**Automated tests in I.7 session:** **none** (runtime only)
**Gaps:** FX live/offline parity **NOT VERIFIED** · cross-user download AuthZ **NOT VERIFIED** · prod **NOT VERIFIED**
**Next:** Stage I.8 reconcile/docs (this follow-on)

## 2026-10-10 — STUDIO_EXPORT Stage I UI Export wiring

**Status:** **LOCAL UI IMPLEMENTATION** · **UNIT/SOURCE TESTED** · later **I.7 local E2E PASS** (see above) · **PRODUCTION NOT DEPLOYED**
**Scope:** Stage I after local H2 bake smoke PASS (historical) — wire Studio transport Export to existing STUDIO_EXPORT backend
**UI:** `StudioExportControl` · `studio-export-client.ts` · replaces OD-VS-03 `/account/takes` deep-link in transport (deep-link is **not** the current Export path)
**API used:** `POST/GET /api/studio/projects/[projectId]/export` (project-scoped status + `artifactId`) · download `GET /api/mix/artifacts/[id]/download` (owner AuthZ)
**Tests:** `src/lib/studio/studio-export-ui.test.ts` · visual-shell export assertion updated
**Not done (Stage I session):** Contabo · commit/push/deploy · Sacred WIP
**Next (historical):** Owner GO for runtime UI→API — **closed by Stage I.7**

## 2026-10-10 — STUDIO_EXPORT Stage G local bake implementation

**Status:** **LOCAL IMPLEMENTATION** · **UNIT TESTED** · **LOCAL INTEGRATION NOT RUN** · **LIVE PARITY NOT VERIFIED** · **PRODUCTION NOT DEPLOYED**
**Scope:** Stage G after Owner ACCEPT OD-SFM-F01…F07 (F04: no silent FX-tail trim)
**Freeze:** [STUDIO_FINAL_MIX_EXPORT_BAKE_DESIGN_FREEZE.md](./decisions/STUDIO_FINAL_MIX_EXPORT_BAKE_DESIGN_FREEZE.md)
**Code:** `runClaimedStudioExportWorkerJob` · `buildStudioExportArtifactObjectKey` · `planStudioExportDuration` · `studioEngineDocumentFromProject` · offline `exportDurationMs`
**Migration (file only):** `supabase/migrations/20261010030000_studio_export_audio_artifacts.sql` — `audio_artifacts.project_id` + ternary XOR — **NOT APPLIED**
**Not done:** worker-once · Contabo · real Storage/DB bake · UI Export · commit/push/deploy · Sacred WIP
**Next:** Stage H GO — apply migration locally + isolated worker smoke

## 2026-10-08 — FULL DOCUMENTATION RECONCILIATION / COLD START READY

**Status:** **DOCS ONLY** · FULL PROJECT continuity pack · **COLD START READY** · **NO DUPLICATION CONTRACT READY**
**Scope:** FINAL_COLD_START · MASTER_HANDOFF · PROJECT_STATE · README · DOCUMENTATION_CONTINUITY · architecture README · new [REUSE_SSOT_MAP.md](./architecture/REUSE_SSOT_MAP.md) · this entry
**Production (unchanged):** `4fa658d` · dpl `dpl_6saiDX4bSbwWp7U7S2QLRMcGLEcy` · READY / GREEN · https://www.bitrymdym.pl
**Repo tip after this reconcile:** verify `git rev-parse HEAD` · may ≠ PRODUCTION APP · **NO REDEPLOY**
**Shipped in docs:** HOW TO START WORK contract · Sacred WIP fingerprint · Domain→SSOT→Owner map · Existing Capability / Reuse map · DO NOT DUPLICATE · dual-plane clarity · compact Studio/audio phase index · security boundary summary · known limitations (incl. 7.1.6 NOT SAFELY MUTATED)
**Not done:** no app code · no migration · no deploy · no Sacred WIP touch · no new product phase invented
**Next:** STOP · new GPT/Cursor sessions may cold-start from FINAL_COLD_START · next product phase requires separate audit / design freeze

## 2026-10-08 — PHASE 7.1.6 AUTO SAVE + CAS COMPLETENESS PRODUCTION GREEN + SSOT RECONCILIATION

**Status:** **Phase 7.1.6 — CLOSED / LAND GREEN · PRODUCTION VERIFIED — GREEN**
**Scope:** Living SSOT tip (FINAL_COLD_START · MASTER_HANDOFF · PROJECT_STATE · README · architecture index · closeout · DECISION_LOG · this entry)
**Production release tip:** `4fa658d` (`4fa658d33c7e0124d1fabc5c8c4ebbe0b05b4ba1`) · dpl `dpl_6saiDX4bSbwWp7U7S2QLRMcGLEcy` · READY / GREEN · https://www.bitrymdym.pl
**Feature LAND:** `89ee919` — `feat(studio): ship phase 7.1.6 auto save`
**Correction LAND:** `4fa658d` — `fix(studio): complete phase 7.1.6 cas wiring`
**Previous production tip (HISTORY):** `3fccbf7` — Phase 7.1.5 Shell Polish + Stacked Escape · dpl `dpl_2E7JrvusAzAG8bsXydpqNJ36k6JR`
**Shipped:** Studio Persist Orchestrator · CLEAN/DIRTY/SAVING/SAVE_FAILED/CONFLICT · serialized FIFO · generation · retry 1s/3s/8s · 409 non-retryable · manual „Zapisz teraz” · beforeunload · CAS completeness (clips · record/place · tracks · reorder · FX · beat attach · place service) · `expectedDocumentVersion` + `documentVersion`
**Migration:** repo `20261008160000_p7_1_6_studio_cas_completeness.sql` · applied `20261008192141_p7_1_6_studio_cas_completeness` · **not** re-run on production deploy
**Architecture:** 1 StudioAudioEngine · 1 Studio AudioContext · PlayerProvider / E3 untouched
**Production verify:** routes `/` `/beats` `/account` `/studio` `/studio/p/{real}` = 200 · production SHA verified · editor chunk contains Auto Save + CAS markers · real project `a8b42570-…` unchanged (`document_version=1` · 2 tracks · 0 clips) · Sacred WIP untouched
**Verification limitation:** production interactive mutation tests (**Clip Gain / Fade / Track / Reorder / Add Clip / FX / Place / Beat / conflict**) = **NOT SAFELY MUTATED** — no prod credentials / no safe disposable path · **STATICALLY VERIFIED / PRODUCTION BUNDLE VERIFIED** (intentional safety gate · not a blocker)
**Evidence:** [P7_1_6_AUTO_SAVE_CAS_PRODUCTION_CLOSEOUT.md](./audits/P7_1_6_AUTO_SAVE_CAS_PRODUCTION_CLOSEOUT.md)
**Repo tip after docs reconcile:** verify `git rev-parse HEAD` · may ≠ PRODUCTION APP `4fa658d` · **NO REDEPLOY** of docs tip
**Next:** **Phase 7.1.6 CLOSED / GREEN** · next phase requires separate audit / design freeze · do **not** invent Phase 7.1.7 scope

## 2026-10-08 — PHASE 7.1.5 SHELL POLISH + STACKED ESCAPE FIX PRODUCTION GREEN + SSOT RECONCILIATION

**Status:** **Phase 7.1.5 — CLOSED / IMPLEMENTATION GREEN · LAND GREEN · PRODUCTION VERIFIED — GREEN**
**Scope:** Living SSOT tip (FINAL_COLD_START · MASTER_HANDOFF · PROJECT_STATE · README · architecture index · closeout · DECISION_LOG · this entry)
**Production release tip:** `3fccbf7` (`3fccbf7e9f93df519aa57475d79d045b8d2a636d`) · dpl `dpl_2E7JrvusAzAG8bsXydpqNJ36k6JR` · READY / GREEN · https://www.bitrymdym.pl
**Feature LAND:** `f891bce` — `feat(studio): ship phase 7.1.5 shell polish`
**Escape fix LAND:** `3fccbf7` — `fix(studio): prioritize FxSheet escape over overlays`
**Previous production tip (HISTORY):** `9abc1b6` — Phase 7.1.4 Mixer Dock
**Shipped:** transport/meter render isolation · FxSheet a11y · Space/Home/End · mobile „Więcej” · stacked Escape ownership (FxSheet capture + `stopImmediatePropagation`)
**Architecture:** 1 StudioAudioEngine · 1 Studio AudioContext · no new Mixer/FxSheet audio architecture · PlayerProvider / E3 untouched
**Security / DB:** no DB · no API · no RLS · no Auth · no Storage · no CAS · no Premium · no Contabo
**Production verify:** routes `/` `/beats` `/account` `/studio` = 200 · pageErrors 0 · console 0 · AudioContext constructions 1 · tablet/mobile stacked Escape PASS · FxSheet dialog/aria-modal/trap/Escape/close PASS · Mixer/Inspector XOR preserved · real project `a8b42570-…` unchanged · Sacred WIP untouched
**Evidence:** [P7_1_5_SHELL_POLISH_PRODUCTION_CLOSEOUT.md](./audits/P7_1_5_SHELL_POLISH_PRODUCTION_CLOSEOUT.md)
**Repo tip after docs reconcile:** verify `git rev-parse HEAD` · may ≠ PRODUCTION APP `3fccbf7` · **NO REDEPLOY** of docs tip
**Next:** STOP · do **not** start P6.8 / next Studio unit without Owner GO

## 2026-10-08 — PHASE 7.1.4 MIXER DOCK PRODUCTION GREEN + SSOT RECONCILIATION

**Status:** **Phase 7.1.4 — CLOSED / IMPLEMENTATION GREEN · LAND GREEN · PRODUCTION VERIFIED — GREEN**
**Scope:** Living SSOT tip (FINAL_COLD_START · MASTER_HANDOFF · PROJECT_STATE · README · architecture index · freeze · closeout · DECISION_LOG · this entry)
**Production release tip:** `9abc1b6` (`9abc1b647a042201ad263466aaecd984033a9b2a`) · dpl `dpl_7nZZXRBBZS3hJMzSfw4F8FXkRoww` · READY / GREEN · https://www.bitrymdym.pl
**Previous production tip (HISTORY):** `8f6eeca` — Phase 7.1.3 Inspector IA
**LAND commit:** `feat(studio): land phase 7.1.4 mixer dock`
**Decisions:** OD-P7.1.4-01…04 = **A** (desktop bottom dock · thin chrome + chevron · tablet/mobile sheet + XOR · Master sticky-first)
**Architecture:** 1 StudioAudioEngine · 1 Studio AudioContext · reuses `doc` / `engineDocument` / `selectedTrackId` / `patchTrack` / `patchMasterMix` · Mixer does **not** own AC/engine/analyser/rAF/selection store
**Security / DB:** no DB · no API · no RLS · no Auth · no Storage · no CAS · no Premium · no E3 · no PlayerProvider changes
**Tests (LAND):** 7.1.4 **13/13** · focused P5+P6+7.1.1–7.1.4 **80/80** · Studio **627/627** · full **1785 PASS / 1 SKIP** · typecheck/build/scoped lint PASS · ambient lint baseline 40/223 (not a 7.1.4 regression) · flaky `p3-claim-live` PASS on retry (out of scope)
**Production verify:** routes `/` `/beats` `/account` `/studio` = 200 · Desktop/Tablet/Mobile Mixer PASS · XOR PASS · Master sticky PASS · Gain/Pan persistence PASS · disposable cleaned · real project `a8b42570-…` unchanged (`document_version=1` · 2 tracks · 0 clips)
**Evidence:** [P7_1_4_MIXER_DOCK_DESIGN_FREEZE.md](./decisions/P7_1_4_MIXER_DOCK_DESIGN_FREEZE.md) · [P7_1_4_MIXER_DOCK_PRODUCTION_CLOSEOUT.md](./audits/P7_1_4_MIXER_DOCK_PRODUCTION_CLOSEOUT.md)
**Repo tip after docs reconcile:** verify `git rev-parse HEAD` · may ≠ PRODUCTION APP `9abc1b6` · **NO REDEPLOY** of docs tip
**Next:** STOP · do **not** start Phase 7.1.5 without Owner GO

## 2026-10-08 — PHASE 3 PRODUCTION USER CLEANUP + USER-ID-01 DOC RECONCILIATION

**Status:** **PHASE 3 GREEN** · **Phase 4 documentation reconciliation** (docs only)
**Scope:** Production Auth/Storage cleanup (already executed) + USER-ID-01 docs sync — **not** an application feature
**Supabase project:** `rzzxrgcdogkybkiidqgw`
**KEEP:** Dawid · UUID `fdf04726-e971-42a7-9d46-8b9bdd099c23` · `user_number=1` · `ADMIN` · data preserved (takes 10 · audio_artifacts 2 · render_jobs 4 · studio_projects 1 · mix_sessions 1)
**Deleted:** **421** test Auth accounts (PRE-CLEANUP **422** users/profiles)
**Premium:** **50** non-Dawid `premium_entitlements` cleared
**Storage:** approved user-scoped objects cleaned · approved orphan Storage cleaned · KEEP Storage + platform catalog (**17** `owner_id` NULL beats) preserved
**Sequence:** ONE-TIME OWNER-APPROVED USER-ID-01 AMENDMENT — `setval('public.user_number_seq', 1, true)` → `last_value=1` / `is_called=true` → **next user_number = 2**
**Standing contract:** normal DELETE still **does not** reuse `user_number` · do **not** repeat reset without new Owner GO
**Production verification:** GREEN
**App / deploy:** NONE (no code · no migration · no Vercel · no push required for cleanup itself)
**Docs:** AUTHORIZATION · ACCOUNT_PROFILE_01 freeze · USER_ID_01_EVIDENCE · PROJECT_STATE · MASTER_HANDOFF · FINAL_COLD_START · this entry

## 2026-10-08 — P4.6 TAKE_EXPORT PRODUCTION RELEASE + CLOSEOUT

**Status:** **P4.6 TAKE_EXPORT — CLOSED / PRODUCTION VERIFIED / LIVE E2E VERIFIED / GREEN**
**Scope:** Living SSOT tip (FINAL_COLD_START · MASTER_HANDOFF · PROJECT_STATE · README · closeout evidence · this entry)
**Production release tip:** `a72fed9` · dpl `dpl_8PDyhXVZDMyBm8fgiWNgj9ZPwnJY` · READY / GREEN · https://www.bitrymdym.pl
**Docs/repository tip after closeout:** `65ebc46`
**origin/main after closeout:** `65ebc46` (REPO ≠ PRODUCTION · no redeploy of docs tip)
**Chain:** `836679a` → `0b0ca04` (docs) → `a72fed9` (Phase 1 TAKE_EXPORT code) → `65ebc46` (docs dual-plane closeout)
**Closure path:** Phase 1 CODE → Phase 2 INFRA → Phase 3 (historical Contabo) → controlled push → Vercel deploy → post-deploy verify → **production LIVE E2E**
**Production LIVE E2E:** Take `a9542a12-…` READY · job `a5b6e8e0-…` TAKE_EXPORT MP3_192 · `QUEUED`→`RUNNING`→`SUCCEEDED` · artifact `d7b05d44-…` · take-audio only · MIX used **NO** · `ffmpeg+libmp3lame` · stream bitrate **192000** · ~10.80s · 260850 bytes · owner download PASS · non-owner DENIED · Contabo single-job · worker **STOPPED / DISABLED** after test
**Evidence:** [P4_6_PRODUCTION_CLOSEOUT.md](./audits/P4_6_PRODUCTION_CLOSEOUT.md) · Phase 1/2/3 reports under `docs/audits/`
**Contabo permanent runtime:** STOPPED / DISABLED (capability GREEN ≠ always-on worker)
**P6.8:** NOT STARTED / OWNER DECISION
**P4 local WIP / SA-07:** NOT PRODUCTION · NOT BASELINE · untouched
**Next:** STOP · Owner decides next unit

## 2026-10-07 — P4.6 TAKE_EXPORT FINAL CLOSE + SSOT RECONCILIATION

**Status (historical docs tip):** **DOCS ONLY** · pre-deploy close · living tip later superseded by **2026-10-08 production release** above
**Scope:** Living SSOT tip only (FINAL_COLD_START · MASTER_HANDOFF · PROJECT_STATE · README · this entry)
**Production tip (at that time):** `836679a` · dpl `dpl_5J2cRHA2XRg7SKCZuyFvVZhBpJpT` · READY / VERIFIED
**Closure path:** Phase 1 CODE GREEN → Phase 2 INFRA GREEN → Phase 3 LIVE VERIFIED (Contabo; app tip then still `836679a`)
**Live proof:** READY Take → TAKE_EXPORT MP3_192 → existing E3 Contabo worker claim → take-audio only → FFmpeg/libmp3lame → ~192000 bps → audio-artifacts → signed download PASS · non-owner DENIED · MIX regression PASS · worker STOPPED after verify
**Evidence:** [P4_6_PHASE1_CODE_IMPLEMENTATION_REPORT.md](./audits/P4_6_PHASE1_CODE_IMPLEMENTATION_REPORT.md) · [P4_6_PHASE2_WORKER_INFRASTRUCTURE_REPORT.md](./audits/P4_6_PHASE2_WORKER_INFRASTRUCTURE_REPORT.md) · [P4_6_PHASE3_LIVE_VERIFICATION.md](./audits/P4_6_PHASE3_LIVE_VERIFICATION.md)
**Not done then:** production app still `836679a` · Phase 1 code not yet on Vercel tip
**P6.8:** NOT STARTED / OWNER DECISION
**P4 local WIP (`context?` / p4-live-verify) / SA-07:** NOT PRODUCTION · NOT BASELINE · untouched
**Next (historical):** STOP · Owner decides push/deploy of Phase 1

## 2026-10-07 — FINAL SSOT TIP RECONCILIATION @ 836679a

**Status:** **DOCS ONLY** · living tip reconciled · **CURRENT PROJECT STATE → GREEN** (docs plane)
**Scope:** FINAL_COLD_START · MASTER_HANDOFF · PROJECT_STATE · README (+ this tip)
**Production tip:** `836679a` · dpl `dpl_5J2cRHA2XRg7SKCZuyFvVZhBpJpT` · READY / VERIFIED
**Ancestry (unchanged history):** V1 `56b629e` · List UX `2c4b416` · multi-select `0f2169a` · P6.7 `06c60b5`
**Catalog / Storage:** 17 PLATFORM · beat-audio orphans 0 · take-audio 13
**Security / Mobile:** GREEN · TECHNICALLY READY — DEVICE CERTIFICATION PENDING
**P6.8:** NOT STARTED / OWNER DECISION
**P4 / SA-07 local WIP:** NOT PRODUCTION · NOT BASELINE · untouched
**Next:** STOP · Owner decides commit of docs tip · no deploy / no code
**Note (living tip later):** superseded as **current** P4.6 status by **P4.6 TAKE_EXPORT FINAL CLOSE** entry above — this tip remains historical baseline reconcile @ `836679a`

## 2026-10-07 — POST-RECORDING EDITING / VOCAL PRODUCTION V1 — PRODUCTION GATE GREEN

**Status:** **PRODUCTION VERIFIED — GREEN · CLOSED** (historical gate @ `56b629e`; superseded as **living production tip** by `836679a`)
**Scope:** Production Gate (no force redeploy · no new features)
**Production (at gate):** `56b629e` · `dpl_HcaXhP9nZXnDAWCAUBvoFu6Qh9Ei` · GH `6908396342` · chunk `1rnqr79fxkwx9.js`
**Automated:** Vitest **1567 PASS · 0 FAIL · 1 SKIP** · Studio **445 PASS** · `tsc` PASS
**Audible evidence:** Master meter Gain −18→+9 Δ≈+14.5 dB · Mute → −100 dB floor · unmute restores peak
**API/security/ACL/Take/mobile/P6.7:** PASS
**Gate report:** [POST_RECORDING_EDITING_VOCAL_PRODUCTION_V1_PRODUCTION_GATE.md](./audits/POST_RECORDING_EDITING_VOCAL_PRODUCTION_V1_PRODUCTION_GATE.md)
**Next:** **STOP** — do **not** start P6.8 / Automation / Autotune / E3 Studio Render / Undo / Autosave / P7 / Contabo
**Note:** interim RED (wrong meter sampling) superseded by this GREEN
**WIP:** untouched

## 2026-10-07 — P0 SECURITY FIX — studio_cas_* client EXECUTE revoke

**Status:** **P0 CLOSED — PRODUCTION VERIFIED GREEN** (ACL-only · DB)
**Scope:** revoke `EXECUTE` on four `studio_cas_*` RPCs from `anon` / `authenticated`; keep `service_role`
**Root cause:** `ALTER DEFAULT PRIVILEGES` grants role-level EXECUTE; prior migrations only `REVOKE FROM PUBLIC`
**Repo migration file:** `supabase/migrations/20261007140000_p0_studio_cas_client_execute_revoke.sql`
**Production applied version:** `20261007073533` `p0_studio_cas_client_execute_revoke` (filename timestamp ≠ applied version — documented mapping)
**RPCs:** `studio_cas_apply_fx_chain` · `studio_cas_apply_clip_fades` · `studio_cas_apply_clip_geometry_fades` · `studio_cas_apply_clip_split`
**LIVE ACL AFTER:** anon **FALSE** · authenticated **FALSE** · service_role **TRUE** (all four)
**SET ROLE:** anon/authenticated → `42501 permission denied` · service_role invoke ALLOWED (non-mutating fake UUIDs)
**Security Advisor:** `studio_cas_*` removed from anon/authenticated DEFINER EXECUTE findings (residual pre-existing findingi OUT of P0)
**Tests:** Vitest **1525 PASS · 1 SKIP** · Studio suite 403 PASS · P0 contract test PASS
**Production app SHA:** **unchanged** `06c60b5` (no app code change · P6.7 remains **CLOSED / GREEN**)
**Next:** STOP · do **not** start P6.8 · optional P1 = default privileges hardening (OUT of this P0)
**WIP:** untouched

## 2026-10-07 — P6.7 FINAL SSOT RECONCILE (Px→P6.7)

**Status:** DOCS ONLY · full continuity reconcile through **P6.7 CLOSED / GREEN**
**Production app (unchanged):** `06c60b5` · dpl `dpl_CpGUtwjDbvXdJ8oEuDyDFjQ1UgNp`
**Repo/docs tip:** `origin/main` (verify `git rev-parse HEAD`) · must stay **≠** production app `06c60b5` · historical docs tips `e136558` (first gate) · `c767d12` (full reconcile)
**Purpose:** remove residual “P6.7 NOT AUTHORIZED / NEXT=Owner GO / app=c825e42” drift in mid/bottom SSOT · dual-plane SHA · P5–P6.7 discoverability · WIP untouched

## 2026-10-07 — P6.7 PRODUCTION GATE (P6.7.4) — GREEN

**Status:** **P6.7 = PRODUCTION VERIFIED — GREEN · CLOSED**
**Application tip:** `06c60b54234db5d27682a607f6a80dececc7257e` (`06c60b5`)
**Repo/docs tip at first gate docs:** `e136558eceed0904b5045bd3a495d1e626e50e6e` (`e136558`) · **≠** app SHA
**Deployment:** `dpl_CpGUtwjDbvXdJ8oEuDyDFjQ1UgNp` · www · GitHub deployment `6902986442` · served Studio editor chunk `0g5xoq_48-8xn.js`
**Phases:** P6.7.1 runtime `8750ab9` · P6.7.2 CAS `b21c6dc` · P6.7.3 UI `1305385` · P6.7.x Trim/Split `06c60b5` · P6.7.4 gate @ `06c60b5`
**DB migrations (production applied version):** `20261007061035` `p6_7_2_studio_cas_apply_clip_fades` · `20261007061049` `p6_7_x_studio_cas_trim_split`
**Repo migration filenames:** `20261007120000_p6_7_2_studio_cas_apply_clip_fades.sql` · `20261007130000_p6_7_x_studio_cas_trim_split.sql` — **filename timestamp ≠ production applied version** (documented mapping; same SQL content)
**RPCs verified:** `studio_cas_apply_clip_fades` · `studio_cas_apply_clip_geometry_fades` · `studio_cas_apply_clip_split`
**Tests:** Full Vitest **1519 PASS · 1 SKIP · 0 FAIL** · typecheck · build · scoped lint PASS
**Production evidence:**
- Persistence: set_fades **200** · documentVersion **v47→48→49→55** · reload PASS · UI „Zapisano”
- CAS: stale **409** `FX_CHAIN_VERSION_CONFLICT` · fades/version unchanged · fresh **200**
- Trim: **10000→6000** · fade clamp · stale **409**
- Split: left **Fi=1000 Fo=0** · right **Fi=0 Fo=2000** · no orphans · stale **409**
- Runtime: Fade In ≈ **0.06→0.56→1** · Fade Out → **0** · seek position-based · pause/resume continues · stop **00:00.000** · overlap **3 voices** · **1 AudioContext**
- Normalization: **5000+5000 @ D=6000 → 3000/3000** persisted
- Security: unauth **401** · IDOR **404** · owner **200** · stale **409**
- Mobile ~390: Fade In/Out/Save/Play **≥44px** · no overflow · nav clear
- Guards: no FadeEngine / AutomationEngine / mix-graph / `/fade` · PlayerProvider not in Studio editor chunk
**Next:** **STOP** — do **not** start P6.8 · do **not** reopen P6.6 / P6.5 Scenario B
**Known limitations (unchanged):** limiter IMPLEMENTATION LIMITATION · reverb synthetic IR · delay no BPM sync · P5.10 TAKE preview may fail · P6.5 Scenario B BLOCKED / INCONCLUSIVE · PlayerProvider shared shell only
**WIP:** YES (unrelated local WIP preserved — not staged)

## 2026-10-07 — P6.7.x TRIM/SPLIT FADE SEMANTICS + CAS (COMPLETE)

**Status:** CODE · **COMPLETE** · included in production app `06c60b5`
**Commit:** `06c60b54234db5d27682a607f6a80dececc7257e`
**Scope:** DF §14–§17.2 · `resolveFadesAfterTrim` / `resolveFadesAfterSplit` · RPCs `studio_cas_apply_clip_geometry_fades` + `studio_cas_apply_clip_split` · stale Trim/Split **409** · no partial orphans
**Migration file:** `supabase/migrations/20261007130000_p6_7_x_studio_cas_trim_split.sql`

## 2026-10-07 — P6.7.3 CLIP FADE UI (COMPLETE)

**Status:** CODE · **COMPLETE** · commit `1305385`
**Scope:** ClipEditPanel Fade In/Out · explicit „Zapisz fade” · local draft until save · CAS `expectedDocumentVersion` · mobile ≥44px · no autosave

## 2026-10-07 — P6.7.2 CLIP FADE WRITE / CAS (COMPLETE)

**Status:** CODE · **COMPLETE** · commit `b21c6dc`
**Scope:** Clip PATCH `op: set_fades` · `studio_cas_apply_clip_fades` · normalize Fi+Fo>D · HTTP **409** `FX_CHAIN_VERSION_CONFLICT`
**Migration file:** `supabase/migrations/20261007120000_p6_7_2_studio_cas_apply_clip_fades.sql`

## 2026-10-07 — P6.7.1 CLIP FADE RUNTIME (COMPLETE)

**Status:** CODE · **COMPLETE** · commit `8750ab9`
**Scope:** `applyClipFadeGainParam` on existing Clip GainNode · `effectiveGain = baseClipGain × fadeEnvelope` · Play/Seek/Pause/Stop position-based · no FadeEngine / second AudioContext

## 2026-10-07 — P6.7 CLIP FADES DESIGN FREEZE (GO)

**Status:** DOCS ONLY · **DESIGN FREEZE: GO**
**SSOT tip at authoring:** `edf8fac` · production app **unchanged** `c825e42` · dpl `dpl_3s3fAnvrpNVSwJcdhV8J1SZtc9g9`
**Closes:** [P6.7 Architecture Audit](./architecture/P6_7_CLIP_FADES_ARCHITECTURE_AUDIT.md) GO WITH CONDITIONS
**Frozen:** Clip runtime fades on existing Clip GainNode · `effectiveGain = baseClipGain × fadeEnvelope` · proportional overlap normalize · position-based Play/Seek/Pause/Stop · trim clamp · deterministic split inheritance · Clip PATCH `set_fades` + CAS · ClipEditPanel · mobile ~390 · meters unchanged
**AC:** DF-01…DF-36 (36)
**Implementation:** **NOT AUTHORIZED** until Owner GO · sequence P6.7.1→P6.7.4
**Artifact:** [P6_7_CLIP_FADES_DESIGN_FREEZE.md](./decisions/P6_7_CLIP_FADES_DESIGN_FREEZE.md)
**Deploy this freeze:** **NOT DONE** (docs-only)

## 2026-10-07 — P6.7 CLIP FADES ARCHITECTURE AUDIT (GO WITH CONDITIONS)

**Status:** DOCS ONLY · **ARCHITECTURE AUDIT** · **GO WITH CONDITIONS**
**SSOT tip:** `cb4f930` · production app **unchanged** `c825e42` · dpl `dpl_3s3fAnvrpNVSwJcdhV8J1SZtc9g9`
**Candidate next unit:** **P6.7 Studio Clip Fades** — apply existing `fadeInMs` / `fadeOutMs` on clip voice `GainNode`
**Why (SSOT):** P5.10 SHOULD · P5.11 known gap · P6.6 audit #1 Owner alternative after metering · schema/DTO exist · engine apply missing · UI/API write missing
**Decision:** **GO WITH CONDITIONS** — Design Freeze next (Owner accept) · **implementation NOT AUTHORIZED**
**Out:** automation lanes · P7 · buses · autosave · reopen P6.6 / P6.5 Scenario B / P6.4.4
**P6.5 Scenario B:** **BLOCKED / INCONCLUSIVE** — unchanged
**P6.6:** **PRODUCTION VERIFIED — GREEN** — unchanged
**Artifact:** [P6_7_CLIP_FADES_ARCHITECTURE_AUDIT.md](./architecture/P6_7_CLIP_FADES_ARCHITECTURE_AUDIT.md)
**Deploy this audit:** **NOT DONE** (docs-only)

## 2026-10-07 — P6.6 SSOT RECONCILE (PRODUCTION VERIFIED — GREEN)

**Status:** DOCS ONLY · **P6.6 PRODUCTION VERIFIED — GREEN**
**Application tip:** `c825e422111e69350abfb4bebbb38eb5d4707a8e` (`c825e42`)
**Deployment:** `dpl_3s3fAnvrpNVSwJcdhV8J1SZtc9g9` · www · served Studio editor chunk `3_efrbzvmc1dc.js`
**Phases:** P6.6.1 engine `a8a3337` · P6.6.2 UI `c825e42` · P6.6.3 production gate @ `c825e42`
**Product:** On-demand Track Peak Metering — selected Track only · max 1 Track Analyser after Track Pan → Σ · Master Analyser unchanged · shared `studio-meter` + reader · Mix `selectedTrackId` → `setTrackMeterTarget` → `subscribeTrackMeter` → `StudioTrackMeter`
**Tests:** Full Vitest **1410 PASS · 1 SKIP · 0 FAIL** · Studio 288 PASS · typecheck · build · scoped lint PASS
**Production runtime:** Studio load · Track selection · Track Meter UI · live Track Peak · A→B · clear selection · Master Meter · Play/Stop · mobile ~390 · no overflow · ≥44px · safe-area · unauth Studio API 401 · owner access
**P6.5 Scenario B:** **BLOCKED / INCONCLUSIVE** — **unchanged** (not reopened · not GREEN)
**P6.5 living note:** Master metering remains shipped; Scenario A PROVEN · Scenario B BLOCKED · P6.5 gate was never reclassified as GREEN
**Next:** **NEXT ARCHITECTURE AUDIT** (do not auto-start implementation) · do **not** reopen P6.6.1–P6.6.3 / P6.5 / P6.4.4
**Known limitations (unchanged):** limiter IMPLEMENTATION LIMITATION · reverb synthetic IR · delay no BPM sync · P5.10 TAKE preview may fail · wave4-live PRE-EXISTING / OUT-OF-SCOPE · LUFS/True Peak/spectrum/AudioWorklet OUT
**WIP:** YES (unrelated local WIP preserved)
**Deploy this reconcile:** **NOT DONE** (docs-only)

## 2026-10-07 — P6.5 SSOT RECONCILE (SCENARIO A PROVEN · B BLOCKED · GATE INCONCLUSIVE)

**Status:** DOCS ONLY · **P6.5 IMPLEMENTATION COMPLETE** · **PRODUCTION DEPLOYED** · **SCENARIO A PROVEN** · **SCENARIO B BLOCKED BY BROWSER/CDP** · **PRODUCTION RUNTIME GATE — INCONCLUSIVE**
**Not GREEN / not FAILED:** do **not** treat as `PRODUCTION VERIFIED — GREEN` and do **not** treat as P6.5 FAIL
**Application tip (unchanged):** `2258bdbbf5099189bf88e9ed65f41faf43afe226` (`2258bdb`) · dpl `dpl_54uwtNdFbSG4apwikSioTyevdYcr` · chunk `29qtmv8kgtz1f.js`
**Fixture (read-only):** project `d2bdb431-4b40-4d7c-9bfc-d18d05cbad14` („P5.2 verify real beat“) · BEAT_REF `f69034e6-2c6d-43f5-93cd-2b6531051edb` PUBLISHED · timeline Play (not Take preview)
**Scenario A — PASS:** G1 real transport (playhead advances) · G2 real beat-audio media (`beat-audio`…`/master.bin` HTTP 206) · G3 Live Peak (`-12.4 dB` / aria `24` → `-10.3 dB` / aria `31`; later `-9.7`/`33` → `-7.5`/`42`) · Stop → Peak `-100 dB` · transport Gotowy
**Proven path:** BEAT_REF → StudioAudioEngine → Master Pan → Analyser → Master Meter (observable Live Peak during real playback)
**Scenario B — INCONCLUSIVE / BLOCKED:** Live Peak confirmed before lifecycle · cannot force true `document.visibilityState === "hidden"` in current Cursor browser/CDP · `Page.setWebLifecycleState(frozen)` hangs CDP (do not reuse) · `Object.defineProperty(document,…)` Cannot redefine · prototype override left `visibilityState` as `visible` while Peak stayed live — **browser/CDP limitation**, not P6.5 FAIL
**Remaining open acceptance:** visibility hidden → reader pause → visible → reader resume (production browser proof)
**P6.6:** **NOT AUTHORIZED**
**Known limitations (unchanged):** limiter IMPLEMENTATION LIMITATION · reverb synthetic IR · delay no BPM sync · P5.10 TAKE preview may fail · wave4-live PRE-EXISTING / OUT-OF-SCOPE
**WIP:** YES (unrelated local WIP preserved)

## 2026-10-06 — P6.5 SSOT RECONCILE (IMPLEMENTATION COMPLETE · RUNTIME GATE INCONCLUSIVE)

**Status:** DOCS ONLY · **P6.5 IMPLEMENTATION COMPLETE** · **PRODUCTION DEPLOYED** · **PRODUCTION RUNTIME GATE — INCONCLUSIVE**
**Not GREEN:** do **not** treat as `PRODUCTION VERIFIED — GREEN`
**Application tip:** `2258bdbbf5099189bf88e9ed65f41faf43afe226` (`2258bdb`) · fix `fix(studio): start P6.5 meter reader before voice sync`
**Implementation:** `345e8e57d6ef32fc841e7623dc97ad970190e0e2` · Design Freeze `57f4216` · Architecture Audit `fe4eb0d`
**Deployment:** `dpl_54uwtNdFbSG4apwikSioTyevdYcr` · www · served Studio chunk `29qtmv8kgtz1f.js`
**Contract:** Master-only realtime Peak + clipping latch · `MasterPan → Analyser → Destination` · fftSize 256 · ≤10–15 Hz · visibility pause/resume · UI Gain→Pan→Meter→FX · no DB/API · no PlayerProvider/E3
**Automated tests:** P6.5 18 · P6.4.3 14 · P6.4.2 14 · P6.4.1 21 · P6.3 17 · P6.2 14 · P6.1 29 · **127/127 PASS** · typecheck · build · scoped lint PASS
**Production smoke:** unauth Studio API 401 · `/studio` 200 · chunk YES `StudioAudioEngine`/`createAnalyser`/`subscribeMeter`/`Miernik Master` · NO `PlayerProvider`/`mix-graph`/`StudioMixEngine`/`MeteringEngine` · Master Meter UI observed · Mobile ~390 PASS · Mix/transport smoke PASS · security surface unchanged (P6.4.3 401/200/403 baseline)
**Runtime gate INCONCLUSIVE reason (superseded 2026-10-07 for Play→Peak):** at reconcile time no deterministic production browser evidence for (1) Play → real audio signal → Peak response (2) visibility hidden → reader pause → visible → resume. Observed Play UI `Odtwarzanie` with Peak `-100 dB` / playhead `00:00.000` was **not** PASS and **not** interpreted as P6.5 FAIL. Unit lifecycle tests ≠ production browser proof.
**Follow-up (not a code bug):** production runtime evidence for Play→Peak and visibility lifecycle — Owner/Architect decision required before any GREEN claim
**P6.6:** **NOT AUTHORIZED** by this reconciliation
**Known limitations (unchanged):** limiter IMPLEMENTATION LIMITATION · reverb synthetic IR · delay no BPM sync · P5.10 TAKE preview may fail · wave4-live PRE-EXISTING / OUT-OF-SCOPE
**WIP:** YES (unrelated local WIP preserved)

## 2026-10-06 — P6.4.3 PRODUCTION VERIFIED — GREEN (SSOT RECONCILE)

**Status:** DOCS ONLY · **P6.4.3 PRODUCTION VERIFIED — GREEN**
**Application:** f261ea8 · **RPC hotfix:** 57ef69e (unchanged) · **Deployment:** dpl_5ZBCGED4nQBuWQx81aa9959YeKCM
**GitHub SHA == Vercel == served:** f261ea8a622ee3b3038e81ff89be6277535821ae
**Served Studio chunk:** /_next/static/immutable/chunks/0kfptvapkfp-m.js (Transport Studio · Mix · FX entry · z-50 sheet · StudioAudioEngine · no PlayerProvider/mix-graph/StudioMixEngine)
**Contract:** Mix UX integration — Track Mute/Solo → Gain/Pan → FX · Master Gain/Pan → FX · sticky transport · FX sheet above bottom-nav · scroll-padding / safe-area · conflict Odśwież
**Gate API (12/12):** chunk markers · unauth 401 · cross-user 403 · Track mix controls · Track FX add/reorder · stale CAS 409 · recovery · Master Gain/Pan · Master FX · reload
**UI smoke:** Mix region · Master distinguished · FX (n) / bypass hint · Master/Track sheets · sheet z-50 > nav z-40 · transport sticky · mobile ~390 no horizontal overflow · 44px targets
**Tests:** P6.4.3 14 · P6.4.2 14 · P6.1 29 · P6.2 14 · P6.3 17 · P6.4.1 21 · Studio 242 · typecheck · scoped eslint · build PASS
**Next:** **P6.4.4 — Master FX UI polish** (do not start in this wave)
**Known limitations:** limiter IMPLEMENTATION LIMITATION · reverb synthetic IR · delay no BPM sync · P5.10 TAKE preview may fail · wave4-live PRE-EXISTING / OUT-OF-SCOPE
**WIP:** YES (unrelated local WIP preserved)

## 2026-10-06 — P6.4.2 PRODUCTION VERIFIED — GREEN (SSOT RECONCILE)

**Status:** DOCS ONLY · **P6.4.2 PRODUCTION VERIFIED — GREEN**
**Application:** 320907a · **RPC hotfix:** 57ef69e (unchanged) · **Deployment:** dpl_HrDh4nwTpQEK4MDPUT3h77gBae1k
**GitHub SHA == Vercel == served:** 320907af8b1088c69d607647df76ae1e038bd0af
**Served Studio chunk:** /_next/static/immutable/chunks/3aj31lbra-fb7.js (`StudioFx` · `STUDIO_FX_UI_META` labels · `StudioAudioEngine` · Włączony/Wyłączony · no PlayerProvider/mix-graph/StudioMixEngine)
**Contract:** Shared `StudioFxChainEditor` role=track|master · registry-driven `STUDIO_FX_UI_META` from `studio-fx-chain` SSOT · CAS `expectedDocumentVersion` · pointerUp param commit · ↑/↓ reorder · Master Gain/Pan reuse P6.4.1
**Gate API (19/19):** chunk markers · unauth 401 · cross-user 403 · Track add/enable/reorder/param/remove · Master add · limiter-last 400 · stale CAS 409 · recovery · Master Gain/Pan + Track controls regression · Track→FX CAS · reload persistence
**UI smoke:** Studio load · Master FX sheet · Track FX sheet · Włączony aria-pressed · first ↑ / last ↓ disabled · params expand · transport visible · mobile ~390 no horizontal overflow (bottom-nav click intercept known non-blocking)
**Tests:** P6.4.2 14 · P6.1 29 · P6.2 14 · P6.3 17 · P6.4.1 21 · Studio 228 · typecheck · scoped eslint · build PASS
**Next:** **P6.4.3 — Track FX UI** (do not start in this wave; shared editor already shipped in P6.4.2)
**Known limitations:** limiter IMPLEMENTATION LIMITATION · reverb synthetic IR · delay no BPM sync · P5.10 TAKE preview may fail · wave4-live PRE-EXISTING / OUT-OF-SCOPE · mobile bottom-nav may intercept lower Track / Master FX controls
**WIP:** YES (unrelated local WIP preserved)

## 2026-10-06 — P6.4.1 PRODUCTION VERIFIED — GREEN (SSOT RECONCILE)

**Status:** DOCS ONLY · **P6.4.1 PRODUCTION VERIFIED — GREEN**
**Application:** 9f93606 · **RPC hotfix:** 57ef69e (unchanged) · **Deployment:** dpl_EHkvay3T1siEm3oM7MEonN4BypkR
**GitHub SHA == Vercel == served:** 9f93606d5f0152cd6dbe1a890892ece6190755bd
**Served Studio chunk:** /_next/static/immutable/chunks/3llg0viqy_c95.js (masterGainDb · masterPan · documentVersion · StudioAudioEngine · no PlayerProvider/mix-graph/StudioMixEngine)
**Contract:** Master Gain/Pan Option A on existing master_gain_db/master_pan + CAS · Track PATCH returns documentVersion · editor applies version
**Gate API (17/17):** unauth 401 · cross-user 403 · Gain/Pan 200 +1 · invalid 400 no mutation · stale CAS 409 no mutation · recovery 200 · Track→FX CAS 200 · reverse FX→Track→FX · combo Master+Track+MasterFX +1s · reload persistence · P6.1 FX CAS 409
**UI smoke:** / /beats /studio /studio/p/... · transport Play/Stop→00:00.000 · Track Mute/Solo/Gain/Pan present · mobile ~390 load OK (bottom-nav click intercept known non-blocking)
**Tests:** P6.4.1 21 · P6.1 29 · P6.2 14 · P6.3 17 · Studio 214 · typecheck · P6.4.1 eslint clean · build PASS
**Next:** **P6.4.2 — Shared FX UI Foundation** (do not start in this wave)
**Known limitations:** Master Gain/Pan UI controls deferred to Mix UX (API/runtime ready) · limiter IMPLEMENTATION LIMITATION · reverb synthetic IR · delay no BPM sync · P5.10 TAKE preview may fail · wave4-live PRE-EXISTING / OUT-OF-SCOPE · mobile bottom-nav may intercept lower Track controls
**WIP:** YES (unrelated local WIP preserved)

## 2026-10-06 — P6.3 PRODUCTION VERIFIED — GREEN (SSOT RECONCILE)

**Status:** DOCS ONLY · **P6.3 PRODUCTION VERIFIED — GREEN**
**Application:** `350303e` · **RPC hotfix:** `57ef69e` · **Deployment:** `dpl_AdUhQzAFBNAFeJ8qTEaa4jTpbsho`
**Served:** `/_next/static/immutable/chunks/040z15suoi1r8.js` (`masterInput` · `syncMasterFx` · `masterFxChain` · StudioAudioEngine · no first-wins)
**Topology:** Σ Track pans → Master FX[] → Master Gain/Pan → Destination · Take preview stays dry of Master FX
**Gate:** Master empty/EQ/comp/reverb/delay/limiter · full chain · limiter-last 400 · bypass · params · reorder · remove · reload · CAS 409 · recovery · runtime multi-source · transport STOP→0 · mobile 390 · unauth 401 · cross-user 403 · P6.1/2/3 + Studio PASS
**Next:** **P6.4 — FX UI / Studio Mix UX** (do not start in this wave)
**Known limitations:** limiter IMPLEMENTATION LIMITATION · reverb synthetic IR · delay no BPM sync · P5.10 TAKE preview may fail · wave4-live PRE-EXISTING / OUT-OF-SCOPE
**WIP:** YES (unrelated local WIP preserved)

## 2026-10-06 — P6.2 PRODUCTION VERIFIED — GREEN (SSOT RECONCILE)

**Status:** DOCS ONLY · **P6.2 PRODUCTION VERIFIED — GREEN**
**Application:** `23d3be8` · **RPC hotfix:** `57ef69e` · **Deployment:** `dpl_3DonumGaeZvVqPXGb5ch8No28VpS`
**Served:** `/_next/static/immutable/chunks/1bfh8g1yqvhyi.js` (StudioAudioEngine · syncTrackFx · FX registry · no first-wins transport)
**Gate:** Track/Master FX persist · bypass · param · reorder · remove · CAS 409 · limiter-last · runtime adapters · multi-source · transport · track controls · mobile 390 · unauth 401 · cross-user 403 · tests PASS
**Next:** **P6.3 — Master FX Graph** (do not start in this wave)
**Known limitations:** limiter IMPLEMENTATION LIMITATION · reverb synthetic IR · delay no BPM sync · P5.10 TAKE preview may fail · wave4-live PRE-EXISTING / OUT-OF-SCOPE
**WIP:** YES (unrelated local WIP preserved)

## 2026-10-06 — P6.1 RPC HOTFIX (`document_version` ambiguity)

**Status:** RPC / migration · production app **unchanged** at **`23d3be8`** · dpl **`dpl_GZbap8mjpdFtdssB9dxd4zSyudwL`**
**Migration:** `20261006190900_p6_1_fx_cas_document_version_qualify.sql`
**Defect:** `studio_cas_apply_fx_chain` `RETURNS TABLE (document_version …)` made unqualified `document_version` ambiguous in UPDATE SET/WHERE → owner FX PATCH HTTP 400
**Fix:** qualify `studio_projects.document_version` (CAS / AuthZ / JSONB / Track FX graph unchanged)
**P6.2:** **PRODUCTION VERIFIED — GREEN** (Gate rerun after this hotfix)

## 2026-10-06 — P5.10 SSOT RECONCILIATION (DOCS ONLY)

**Status:** DOCS ONLY · production app **`9c2a958`** · dpl **`dpl_L7pB5A8iuY8CKipxbLsGEVLESZTC`** · P5.10 **PRODUCTION VERIFIED — GREEN**
**SSOT:** [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md) · [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) · [PROJECT_STATE.md](./PROJECT_STATE.md) · [P5_10_STUDIO_AUDIO_ENGINE_DESIGN_FREEZE.md](./decisions/P5_10_STUDIO_AUDIO_ENGINE_DESIGN_FREEZE.md)

- Studio baseline closed as **P5.10 GREEN** (P5.1–P5.6 GREEN · P5.7 GO WITH CONDITIONS · P5.8 GREEN · P5.9 GO WITH CONDITIONS · D02 CLOSED)
- Documented StudioAudioEngine · multi-source `planVoicesAtPlayhead` · overlap = MIX · shared AudioContext clock · Track/Master graph
- PlayerProvider + E3 Mix isolated · recording architecture unchanged · Live IDOR not rerun in P5.10 gate
- Known verification limitation: one production TAKE fixture failed preview; live A+B overlap not heard on that fixture (unit coverage of mix)
- Next gate = **Architecture Audit / formal next Studio unit** (do not auto-start P6 / FX / Mix / Master)
- Application / DB / RPC / API / Storage / tests: **UNCHANGED** this docs wave · production remains `9c2a958`

## 2026-10-06 — P5.8 SSOT RECONCILIATION (DOCS ONLY)

**Status:** DOCS ONLY · production app **`95e04ff`** · dpl **`dpl_2RhUDgWM9DX4twjJSFrGcJmgAp1S`** · P5.8 **PRODUCTION VERIFIED — GREEN**
**SSOT:** [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md) · [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) · [PROJECT_STATE.md](./PROJECT_STATE.md) · [P5_8_STUDIO_DEVICES_DESIGN_FREEZE.md](./decisions/P5_8_STUDIO_DEVICES_DESIGN_FREEZE.md)

- Studio baseline closed as **P5.8 GREEN** (P5.1–P5.6 GREEN · P5.7 GO WITH CONDITIONS · D02 CLOSED)
- Documented Vercel **build-cache incident** + no-cache recovery deployment
- Next gate = **Architecture Audit / formal next Studio unit** (do not auto-start P6)
- Application / DB / RPC / API / tests: **UNCHANGED** this docs wave

## 2026-10-05 — FALA 3.5.1 SSOT RECONCILIATION (DOCS ONLY)

**Status:** DOCS ONLY · verify baseline **`75bd80f`** · feature **`c690831`** · Fala 3.5.1 **CLOSED / SHIPPED / PRODUCTION VERIFIED — GREEN**
**SSOT:** [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md) · [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) · [PROJECT_STATE.md](./PROJECT_STATE.md) · [architecture/RECORDING.md](./architecture/RECORDING.md)

- Living labels updated: CLOSED · SHIPPED · PRODUCTION VERIFIED (supersedes living **NOT DEPLOYED**)
- Historical plan baseline `42369c0` retained · actual production verification baseline **`75bd80f`**
- D-V matrix **PASS** · no blockers · no required micro-patches
- Findings: F351-V-01 **LOW** (first automated REC error · retry succeeded) · F351-V-02 **FALSE POSITIVE / NOT REPRODUCED** (sticky-nav)
- P1 / P2 / P3 **UNCHANGED** · no Security / Storage / Auth / RLS / code changes
- Production app redeploy: **NOT DONE** (docs-only · Fala already in production tree)

## 2026-10-05 — FALA 3.5.1 PRODUCTION VERIFIED — GREEN

**Status:** **CLOSED / SHIPPED / PRODUCTION VERIFIED — GREEN**
**Feature:** `c690831` · `feat(audio): close recording experience 3.5.1`
**Verify baseline:** `75bd80f` · https://www.bitrymdym.pl
**Plan:** [D_FALA_351_PRODUCTION_VERIFY_PLAN.md](./audits/D_FALA_351_PRODUCTION_VERIFY_PLAN.md) (historical plan SHA `42369c0` · rebaselined for execute)

```text
DESIGN FREEZE           = GO
IMPLEMENTATION          = ALREADY SHIPPED
PRODUCTION VERIFICATION = PASS
PRODUCTION              = GREEN
STATUS                  = CLOSED
```

- D-V-01…42 critical path **PASS** (dedicated production verify)
- No P1/P2/P3 regression · no security blocker · no Storage/Auth/RLS changes
- F351-V-01 LOW · F351-V-02 FALSE POSITIVE — no micro-patch required

## 2026-10-05 — P3 SSOT RECONCILIATION (DOCS ONLY)

**Status:** DOCS ONLY · tip / production **`dabbc936`** · P3 **COMPLETE / PRODUCTION VERIFIED — GREEN**
**SSOT:** [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md) · [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) · [PROJECT_STATE.md](./PROJECT_STATE.md) · [architecture/RECORDING.md](./architecture/RECORDING.md)

- Living docs aligned to production SHA `dabbc936` · deploy `dpl_Hd4QAwDkkw99FMiFhh8nJ1N6nvsR`
- OD-P3-01…11 marked **CLOSED / IMPLEMENTED** · cookie E2E = CODE-VERIFIED / FULL E2E NOT EXECUTED
- Follow-up: `p_take_id` hardening — **NON-BLOCKING**
- Runtime / DB / Storage / migracje: **NONE**

## 2026-10-05 — P3 Anonymous Take → Account Claim PRODUCTION VERIFIED — GREEN

**Status:** **COMPLETE / PRODUCTION VERIFIED — GREEN**
**Commit:** `dabbc936` · `feat(takes): claim anonymous READY take to account after login`
**Deploy:** `dpl_Hd4QAwDkkw99FMiFhh8nJ1N6nvsR` · https://www.bitrymdym.pl
**SSOT:** OD-P3-01…11 · Premium Tier TTL/cap via `getSamplePolicy` · [RECORDING.md](./architecture/RECORDING.md)
**Migration:** `20261005211153_p3_claim_anon_take_to_account.sql` · RPC `claim_anon_take_to_account`

- Auto claim after successful sign-in / sign-up session · latest anonymous READY · Storage COPY anon→user · ownership transfer · source delete · cookie clear on `CLAIM_OK` / `CLAIM_IDEMPOTENT_REPLAY`
- Cap DENY (no silent replace) · claim ≠ daily recording session · fail-open auth · idempotent replay
- Production verify: deployment / migration / RPC security / Storage / ownership / idempotency / CAP / D02·P2 regression / runtime CLEAN / fixture cleanup PASS
- Cookie clear: **CODE-VERIFIED** · full disposable production E2E **NOT EXECUTED** (no safe disposable recording + guaranteed cleanup)
- Follow-up (non-blocking): optional `p_take_id` RPC binding

## 2026-10-05 — DOCUMENTATION CONTINUITY RECONCILIATION

**Status:** DOCS ONLY · historical tip / production **`1c63080`** at time of write · superseded living tip by P3 `dabbc936`
**SSOT:** [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md) · [MASTER_HANDOFF.md](./MASTER_HANDOFF.md) · [PROJECT_STATE.md](./PROJECT_STATE.md)

- Ujednolicono baseline at `1c63080` · deploy `dpl_2YVDSYPXsmrmx9hxQiF9X6AgVRQP` (historical)
- POLISH-01 / P0 / P1 / P2 / BPM / ARCH-05 / ADMIN W0–W4 CLOSED / VERIFIED
- Known waiver: `e3-7-f` / `EXPORT_WAV` · PRE-EXISTING / WAIVED
- Runtime / DB / Storage / migracje: **NONE**

## 2026-10-05 — POLISH-01 (+ residual hotfix) PRODUCTION VERIFIED

**Status:** **CLOSED / PRODUCTION VERIFIED** · verify **GREEN WITH NOTES**
**Feature:** `579acb3` · **Residual:** `1c63080` · Deploy: `dpl_2YVDSYPXsmrmx9hxQiF9X6AgVRQP`
**SSOT:** [POLISH-01_DESIGN_FREEZE.md](./audits/POLISH-01_DESIGN_FREEZE.md)

- OD-PL-01…06 LOCKED · UI PL + KEEP EN (Studio/Mix/Master/Premium/tiers/BPM/…)
- Residual: home `miejscu` · beat `nagrania` / `nagraj nagranie` · moderation `· Administrator`
- Waiver suite: `e3-7-f` EXPORT_WAV — not a POLISH regression

## 2026-10-05 — P2 Explicit Sample Replace PRODUCTION VERIFIED

**Status:** **CLOSED / PRODUCTION VERIFIED — GREEN** @ `943d81e`
**SSOT:** [P2_REPLACE_SAMPLE_IMPLEMENTATION.md](./audits/P2_REPLACE_SAMPLE_IMPLEMENTATION.md) · docs verify `fa7bfe3`

- Variant C · `replaces_take_id` · finalize swap · advisory lock · cross-beat + anonymous own replace

## 2026-10-05 — P1 Sample Policy Matrix PRODUCTION VERIFIED

**Status:** **CLOSED / PRODUCTION VERIFIED — GREEN** @ `5927e35`
**SSOT:** [P1_SAMPLE_POLICY_MATRIX.md](./audits/P1_SAMPLE_POLICY_MATRIX.md) · docs verify `c38e8d2`

- `getSamplePolicy` · `sample_policy_settings` · Bronze/Silver/Gold defaults · Anonymous ≠ Free

## 2026-10-05 — P0 PLATFORM master download deny PRODUCTION VERIFIED

**Status:** **CLOSED / PRODUCTION VERIFIED — GREEN** @ `fdfff71`
**SSOT:** [P0_PLATFORM_MASTER_DOWNLOAD_DENY.md](./audits/P0_PLATFORM_MASTER_DOWNLOAD_DENY.md) · docs verify `23577a3`

- User-facing PLATFORM DOWNLOAD DENY · PLAYBACK ALLOW · ADMIN/OPS export separate · no generic `canDownload`

## 2026-10-05 — ARCH-05 POST-DELETE RECONCILIATION (CLOSED / VERIFIED)

**Status:** CLOSEOUT **PASS** · live Storage **11 / 8 / 3 / 0 / 0** · historical backup **43/43 RETAINED**
**SSOT:** [ARCH_05_POST_DELETE_RECONCILIATION.md](./audits/ARCH_05_POST_DELETE_RECONCILIATION.md)

- Read-only re-inventory: USER **8** · PLATFORM **3** · ORPHAN **0** · UNKNOWN **0** · total **11**
- VPS Layer-1 **43/43** · Local Layer-2 SHA/manifest/restore **43/43** · no delete sync
- ARCH-05 remains **CLOSED / VERIFIED** · no new Storage mutation · no deploy
- Next: Owner Review · do not re-open ARCH-05 without new Owner GO

## 2026-10-05 — ARCH-05 DELETE EXECUTED (CLOSED / VERIFIED)

**Status:** DELETE **PASS** · **32/32** · Storage **43 → 11** · unexpected deletes **0**
**SSOT:** [ARCH_05_DELETE_EXECUTION.md](./audits/ARCH_05_DELETE_EXECUTION.md) · [evidence](./audits/ARCH_05_DELETE_EXECUTION_EVIDENCE.json)

- Owner GO issued for exact allowlist only · version-bound `remove([{path, versionId}])`
- Pre: **43 / 8 / 3 / 32 / 0** · revalidation **32/32 PASS** · Local/VPS **43/43**
- Post: **11 / 8 / 3 / 0 / 0** · DB-linked **11** · Auth/Profiles **UNCHANGED**
- Local backup + VPS Layer-1: **43/43 RETAINED** (no delete propagation)
- Ladder: SAFE → OWNER APPROVED → DELETE EXECUTED → POST-DELETE VERIFIED
- Commit/push/deploy: **NO**

## 2026-10-05 — ARCH-05 FINAL SAFE-TO-DELETE READINESS (READY FOR OWNER DELETE GO)

**Status:** AUDIT **PASS** · SAFE **32/32** · DELETE **0** · OWNER DELETE GO **NOT ISSUED**
**SSOT:** [ARCH_05_FINAL_SAFE_TO_DELETE_READINESS.md](./audits/ARCH_05_FINAL_SAFE_TO_DELETE_READINESS.md) · [allowlist](./audits/ARCH_05_DELETE_ALLOWLIST.json)

- Fresh inventory **43 / 8 / 3 / 32 / 0** · no drift
- Each orphan: auth/profile absent · DB/take/artifact refs 0 · not platform · no quarantine/MIGRATE · FAR-01 retain **NO**
- Local backup + restore evidence **32/32** · `version_id` bound in allowlist
- Ladder: **SAFE** · not OWNER APPROVED · not DELETED
- Next: Owner REVIEW → optional **OWNER GO — ARCH-05 DELETE**

## 2026-10-05 — LOCAL WINDOWS BACKUP RESTORE DRILL (PASS)

**Status:** PHASE LOCAL-BACKUP-RESTORE-DRILL **PASS**
**SSOT:** [STORAGE_ARCH_07_LOCAL_BACKUP_RESTORE_DRILL.md](./audits/STORAGE_ARCH_07_LOCAL_BACKUP_RESTORE_DRILL.md) · [evidence](./audits/STORAGE_ARCH_07_LOCAL_BACKUP_RESTORE_DRILL_EVIDENCE.json)

- LOCAL → LOCAL ISOLATED restore · run `local-restore-20261005T040831Z-76ca3678`
- Source backup `local-layer2-full-20261005T040146Z-42d6212b` · **43/43** SHA+SIZE+WAV+ffprobe **PASS**
- Source `objects/` integrity **PASS** · Supabase/VPS/AWS **NO MUTATION**
- Ladder: **RESTORE VERIFIED** · ARCH-05 **NOT READY** · orphans **NOT SAFE FOR DELETE**
- Next: Owner REVIEW (no ARCH-05 without separate GO)

## 2026-10-05 — LOCAL WINDOWS BACKUP IMPLEMENTATION (PASS)

**Status:** PHASE LOCAL-BACKUP-IMPLEMENTATION **PASS**
**SSOT:** [STORAGE_ARCH_07_LOCAL_BACKUP_IMPLEMENTATION.md](./audits/STORAGE_ARCH_07_LOCAL_BACKUP_IMPLEMENTATION.md) · [evidence](./audits/STORAGE_ARCH_07_LOCAL_BACKUP_IMPLEMENTATION_EVIDENCE.json)

- Windows PULL from VPS Layer-1 → `C:\BitRymDym-Backup\` · run `local-layer2-full-20261005T040146Z-42d6212b`
- **43/43** COPIED · SHA VERIFIED · MANIFEST VERIFIED · bytes **111574892**
- Restore drill **not** executed (**0/43**) · ARCH-05 **NOT READY** · BitLocker remains **SECURITY FINDING**
- Supabase/VPS: no mutation · no delete propagation
- Next: Owner REVIEW → **PHASE LOCAL-BACKUP-RESTORE-DRILL**

## 2026-10-05 — LOCAL WINDOWS BACKUP PLANE DESIGN FREEZE (COMPLETE)

**Status:** OD-VPS-LOCAL-01…12 **CLOSED / APPROVED** · Design Freeze **COMPLETE** · Implementation **NOT STARTED**
**SSOT:** [STORAGE_ARCH_07_LOCAL_BACKUP_DESIGN_FREEZE.md](./audits/STORAGE_ARCH_07_LOCAL_BACKUP_DESIGN_FREEZE.md) · [audit](./audits/STORAGE_ARCH_07_LOCAL_BACKUP_AUDIT.md)

- Local Windows = Layer-2 independent copy · VPS remains Layer-1 · PULL-only · append/retain · no delete propagation
- Path freeze: `C:\BitRymDym-Backup\` (collision check ABSENT · directory **not** created)
- SHA-256 + manifest + isolated restore drill mandatory · AWS **DEFERRED** · ARCH-05 **NOT READY**
- BitLocker remains **SECURITY FINDING** until elevated verification
- Next gate: Owner GO — **PHASE LOCAL-BACKUP-IMPLEMENTATION** (no auto-start)

## 2026-10-05 — VPS BACKUP PLANE PHASE 6 FULL VPS BACKUP (PASS)

**Status:** Owner GO **APPROVED** · Phase 6 **PASS** · **VPS Layer-1 43/43 BACKED UP** · restore still **3/43** · Phase 7 **NOT STARTED**
**SSOT:** [STORAGE_ARCH_07_IMPLEMENTATION.md](./audits/STORAGE_ARCH_07_IMPLEMENTATION.md) · [evidence](./audits/STORAGE_ARCH_07_PHASE6_FULL_BACKUP_EVIDENCE.json)

- Fresh inventory unchanged: 43 / USER 8 / PLATFORM 3 / ORPHAN 32 · canary 3/3 immutable
- New exact allowlist COPY: **40** (USER 7 + PLATFORM 2 + ORPHAN 31) · SHA+size VERIFIED ×40
- VPS objects **43** · manifests **43** · SHA reconcile **43/43** · production Storage **43** · deletes **0**
- Restore verified remains **3/43** · AWS **NOT CONFIGURED** · ARCH-05 **NOT READY**
- Next gate: Owner GO for **PHASE 7 — RESTORE VERIFICATION EXPANSION** or **AWS IMMUTABLE DR**

## 2026-10-05 — VPS BACKUP PLANE PHASE 5 CANARY RESTORE DRILL (PASS)

**Status:** Owner GO **APPROVED** · Phase 5 **PASS / CANARY RESTORE VERIFIED** · Phase 6 later **PASS** (see above)
**SSOT:** [STORAGE_ARCH_07_IMPLEMENTATION.md](./audits/STORAGE_ARCH_07_IMPLEMENTATION.md) · [evidence](./audits/STORAGE_ARCH_07_PHASE5_RESTORE_EVIDENCE.json)

- Restore source = VPS Layer-1 backup only (Supabase **not** used as restore source)
- USER / PLATFORM / ORPHAN: SHA+size+WAV header+ffprobe **PASS** ×3
- Isolated dest: `/srv/bitrymdym-backup/restore-drills/sa07-phase5-restore-20261005T033401Z-5560b4f7/`
- Backup objects unchanged · production Storage still **43** · deletes **0** · AWS **0**
- Does **not** mean ARCH-05 SAFE / orphan delete / full DR

## 2026-10-05 — VPS BACKUP PLANE PHASE 4 CONTROLLED CANARY (PASS)

**Status:** Owner GO **APPROVED** · Phase 4 **PASS / CANARY BACKED UP** · Phase 5 later **PASS** (see above)
**SSOT:** [STORAGE_ARCH_07_IMPLEMENTATION.md](./audits/STORAGE_ARCH_07_IMPLEMENTATION.md) · [evidence](./audits/STORAGE_ARCH_07_PHASE4_CANARY_EVIDENCE.json)

- Exact allowlist COPY: 1 USER + 1 PLATFORM + 1 ORPHAN · SHA+size VERIFIED ×3
- VPS `/srv/bitrymdym-backup/objects` = **3** files · owner `bitrymdym-backup` · mode 0600
- Production `beat-audio` still **43** · Storage deletes **0** · DB/Auth/AWS **0**
- Orphan status: **BACKED UP / NOT SAFE FOR DELETE** · ARCH-05 still **NOT READY**

## 2026-10-05 — VPS BACKUP PLANE PHASE 3 TRANSFER DESIGN + DRY-RUN (PASS)

**Status:** Owner GO **APPROVED** · Phase 3 **PASS / DRY-RUN VERIFIED** · Phase 4 later **PASS** (see above)
**SSOT:** [STORAGE_ARCH_07_IMPLEMENTATION.md](./audits/STORAGE_ARCH_07_IMPLEMENTATION.md) · [VPS freeze](./audits/STORAGE_ARCH_07_VPS_BACKUP_DESIGN_FREEZE.md)

- Fresh `beat-audio` inventory: TOTAL 43 · USER 8 · PLATFORM 3 · ORPHAN 32 · UNKNOWN 0
- Reused `backup-manifest` helpers: SHA-256 · path fail-closed · idempotency · atomic write · dry-run planner
- Fixture SHA match + mismatch + manifest schema tests **PASS** (`backup-manifest.test.ts`)
- Metadata dry-run: COPY 43 · SKIP 0 · UPDATE 0 · BLOCKED 0 (at time of Phase 3 · VPS objects were 0)
- No Storage/DB/AWS mutations · no secrets logged · ARCH-05 still **NOT READY**

## 2026-10-05 — VPS BACKUP PLANE PHASE 2 PRINCIPAL + DIRECTORY (PASS)

**Status:** Owner GO **APPROVED** · Phase 2 **PASS** · Phase 3 later **PASS** (see above)
**SSOT:** [STORAGE_ARCH_07_VPS_BACKUP_DESIGN_FREEZE.md](./audits/STORAGE_ARCH_07_VPS_BACKUP_DESIGN_FREEZE.md)

- User `bitrymdym-backup` (uid 997) · nologin · locked · no sudo · no SSH · group-only self
- `/srv/bitrymdym-backup/{objects,manifests,restore-drills,logs}` · owner backup · **0700** · **0 files**
- Isolation PASS: `bitrymdym-e3` DENIED · `ubuntu` (no sudo) DENIED · backup user R/W/D PASS
- E3 worker unchanged · no Storage pull · no backup tools installed · no AWS · no Phase 3

---

## 2026-10-05 — VPS BACKUP PLANE PHASE 1 SECURITY HARDENING (PASS)

**Status:** Owner GO **APPROVED** · Phase 1 **PASS** · Phase 2 later **PASS** (see above)
**SSOT:** [STORAGE_ARCH_07_VPS_BACKUP_DESIGN_FREEZE.md](./audits/STORAGE_ARCH_07_VPS_BACKUP_DESIGN_FREEZE.md)

- OD-VPS-01…20 **CLOSED / APPROVED** · OD-SA-07-14a **CLOSED / APPROVED**
- Contabo `161.97.72.197`: SSH key-only · PasswordAuthentication **no** · PermitRootLogin **no** (admin = `ubuntu` + sudo)
- UFW **active** · deny in / allow out · inbound **22/tcp only**
- fail2ban **active** · jail **sshd** (only package installed this phase)
- E3 worker unchanged: inactive/disabled · `DEPLOYED_COMMIT=92496d4…`

---

## 2026-10-05 — VPS BACKUP PLANE DESIGN FREEZE (DRAFT / PROPOSED)

**Status:** Design draft **COMPLETE** · OD-VPS-01…20 later **APPROVED** (see Phase 1 entry) · historical draft note
**SSOT:** [STORAGE_ARCH_07_VPS_BACKUP_DESIGN_FREEZE.md](./audits/STORAGE_ARCH_07_VPS_BACKUP_DESIGN_FREEZE.md)

- Contabo feasibility audit result **B — YES WITH CONDITIONS** recorded as design input only
- Contabo EXTERNAL COMPUTE role **unchanged** · Contabo ≠ sole/final DR · AWS Object Lock remains required immutable DR
- Proposed Layer-1 path: Supabase → VPS (`/srv/bitrymdym-backup`) → SHA-256/manifest/restore drill → later AWS
- OD-SA-07-14 Contabo Layer-1 exception later approved as **OD-SA-07-14a**
- ARCH-05 remains **NOT READY** · Storage COPY **0/43**

---

## 2026-10-05 — HISTORICAL LOCAL DB BACKUP RECONCILIATION (DOCS-ONLY)

**Status:** Docs SSOT reconciled · **no** AWS / Storage / DB / restore / commit / push
**SSOT:** [HISTORICAL_LOCAL_DB_BACKUP_AUDIT.md](./audits/HISTORICAL_LOCAL_DB_BACKUP_AUDIT.md)

- Historical local PostgreSQL CUSTOM dump **FOUND** at `C:\BitRymDym-recovery\bitrymdym-production-pre-account-profile-01.dump`
- Size **532829** B · TOC **835** · pg_dump **17.11** ← PostgreSQL **17.6** · archive **2026-10-03 19:28:34**
- Provenance **LIKELY PRODUCTION / MEDIUM** · project_ref **NOT PROVEN** from PGDMP
- Dump includes DB/Auth + `storage.*` **metadata** · **excludes** Storage object bytes
- Restore **NOT VERIFIED** · **do not** assign `bdpygdvfgbggermvqtys` to this dump
- Canonical wording: BitRymDym has a historical local DB recovery artifact, but no independently verified Supabase Storage object backup
- STORAGE-ARCH-07 Phase A remains **BLOCKED** · Storage COPY **0/43** · ARCH-05 remains **NOT READY** · 32 orphans unchanged (ZERO DELETE)

---

## 2026-10-04 — STORAGE-ARCH-07 IMPLEMENTATION GO (PHASE A STOP)

**Status:** Implementation GO **ISSUED** · AWS S3 `eu-central-1` selected · **PHASE A STOP / BLOCKED**
**SSOT:** [STORAGE_ARCH_07_IMPLEMENTATION.md](./audits/STORAGE_ARCH_07_IMPLEMENTATION.md)

- Tooling + manifest migration **authored locally** (not applied to production DB)
- Unit tests PASS (13) · fixture restore drill PASS · Phase A AWS lock proof **FAIL / STOP**
- aws CLI missing · AWS credentials unset · dedicated backup account **not provisioned**
- Production Storage COPY **NOT EXECUTED** · ARCH-05 **NOT READY / BLOCKED** · 32 orphans **not deleted**
- Commit/push deferred: production verification cannot PASS without Object Lock evidence
- Note (2026-10-05): historical local **DB** dump later found — still **≠** Storage object backup

---

## 2026-10-04 — STORAGE-ARCH-07 DESIGN FREEZE (OWNER DECISIONS CLOSED)

**Status:** **DESIGN FREEZE COMPLETE** · Owner Decisions **OD-SA-07-01…16 CLOSED** · **IMPLEMENTATION NOT STARTED**
**SSOT:** [STORAGE_ARCH_07_DESIGN_FREEZE.md](./audits/STORAGE_ARCH_07_DESIGN_FREEZE.md) · [DECISION_LOG.md](./decisions/DECISION_LOG.md)

- PRIMARY remains Supabase Storage · BACKUP plane design = external S3-compatible + Versioning + Object Lock/WORM (Compliance preferred) + separate account + SHA-256 + required manifest
- Contabo / DB PITR / W4 JSON ≠ Storage backup (unchanged SSOT)
- GC ladder + SAFE FOR GC contract frozen · ARCH-05 remains **BLOCKED**
- Living orphans **32** = NOT SAFE / NOT BACKED UP / NOT RESTORE VERIFIED / NOT OWNER APPROVED / NOT DELETED
- Naming adjacency documented: **OD-SA-07** (Mix no-backup default) ≠ **OD-SA-07-01…16**
- No Storage/DB mutation · no Implementation GO · no commit/push required by this freeze session unless separately authorized

---

## 2026-10-04 — FAR-01 FINAL SOAK AUDIT (DOCS RECONCILIATION)

**Status:** Final soak audit **COMPLETE** · docs living SSOT reconciled · **no Storage/DB/Auth/app mutation**
**SSOT:** [FAR_01_CURRENT_STATE.md](./audits/FAR_01_CURRENT_STATE.md)

- Soak clock **elapsed**; soak integrity **FAILED / CONTAMINATED**
- Original FAR-01 retain-set (**67**) **already gone outside FAR-01 retirement flow** (USER-CLEANUP-01 collateral) — **not** formal FAR-01 retirement
- **FAR-01 RETIREMENT = NOT EXECUTED**
- Living Storage: USER masters **8** · platform **3** · orphan/historical/delete-residue **32** · retained **0** · quarantine **0** · MIGRATE **0** · beat-audio total **43**
- Current **32** orphans = candidate scope for separate **ARCH-04/05** orphan-GC audit — **not** approved for deletion · **not** automatic FAR-01 retirement candidates
- Backup evidence **NOT VERIFIED** · continuous soak telemetry **NOT VERIFIED**
- Production app remains `ddcee65` (docs tip may advance independently)

---

## 2026-10-04 — ADMIN USER DELETE W4 (CLOSED / PRODUCTION VERIFIED)

**Status:** **CLOSED / PRODUCTION VERIFIED**
**SSOT:** [ADMIN_USER_DELETE_DESIGN_FREEZE.md](./decisions/ADMIN_USER_DELETE_DESIGN_FREEZE.md)
**Implementation / production app:** `ddcee65` · `dpl_C1y6toEPYacQmsxv5Jsa8Dj5KM38` · READY / PROMOTED
**DB:** `20261004174202` / `admin_user_management_w4_delete` (local file `20261004190900` — timestamp drift)

- Shared `executeAccountProfile01Deletion` + admin `adminDeleteUserAction` + audit `USER_ACCOUNT_DELETE`
- Delete E2E: disposable USER fixtures (#85 lifecycle / #86 email) via `/admin/users`
- **EMAIL E2E PASS** — Resend production env · sender domain `bitrymdym.pl` · real disposable inbox · subject/reason/Polish body verified · no UUID/user_number/secrets
- Remaining P2 (documented, non-blocking): last-admin TOCTOU; no durable idempotency; live last-admin concurrency NOT VERIFIED; published USER beat retain NOT LIVE-DATA VERIFIED; migration timestamp drift

---

## 2026-10-04 — ADMIN USER MANAGEMENT W3 (AUDIT HISTORY UI) — CLOSED / PRODUCTION VERIFIED

**Status:** **CLOSED / PRODUCTION VERIFIED**
**App SHA:** `237a86f` · deployment `dpl_DjmSXuv7UbB2jYpfidAuXKLWWaQR` · READY / PROMOTED
**DB tip:** `20261004144223` · **W3 migration NONE** · DB **UNCHANGED** by W3
**SSOT:** [ADMIN_USER_MANAGEMENT_DESIGN_FREEZE.md](./decisions/ADMIN_USER_MANAGEMENT_DESIGN_FREEZE.md) · [W3 closeout](./audits/ADMIN_USER_MANAGEMENT_W3_CLOSEOUT.md)

- `/admin/users` — read-only Historia zmian
- AuthZ: ADMIN ∧ `audit_log.view` (MODERATOR/USER DENY)
- SELECT `admin_audit_events` via `createSupabaseAdminClient()` — no read RPC, no authenticated SELECT policy
- Filters: `auditAction` + `auditUser` · page size 25 · `created_at DESC, id DESC`
- Production: 49 audit rows · deleted-target snapshots · pagination/filters verified · P0/P1 = 0
- W2 findings preserved (last-admin concurrency, migration timestamp drift, `user_number` holes, retained audits)
- W4 Admin Delete: see [ADMIN_USER_DELETE_DESIGN_FREEZE.md](./decisions/ADMIN_USER_DELETE_DESIGN_FREEZE.md) (**PENDING OWNER GO**)

---

## 2026-10-04 — ADMIN USER MANAGEMENT W2 (MUTATIONS + AUDIT WRITE)

**Status:** **IMPLEMENTED** (repository) · **PRODUCTION NOT DEPLOYED** · production DB **UNCHANGED**
**SSOT:** [ADMIN_USER_MANAGEMENT_DESIGN_FREEZE.md](./decisions/ADMIN_USER_MANAGEMENT_DESIGN_FREEZE.md)

- `/admin/users` Zarządzaj → server action → `admin_apply_user_management`
- `admin_audit_events` (ON DELETE SET NULL) · atomic mutation+audit
- Self-demotion DENY · last-admin advisory lock · Premium `manual_admin`
- W3 history UI **NOT STARTED** · migration **not applied** to production

---

## 2026-10-04 — ADMIN USER MANAGEMENT W1 (READ-ONLY LIST)

**Status:** **IMPLEMENTED** · **NOT production-deployed**
**SSOT:** [ADMIN_USER_MANAGEMENT_DESIGN_FREEZE.md](./decisions/ADMIN_USER_MANAGEMENT_DESIGN_FREEZE.md)

- `/admin/users` — ADMIN + `users.view`/`users.edit`
- Search: ksywka / e-mail / `user_number`
- Filters: Premium · role · rank (resolver SSOT)
- No mutations · no `admin_audit_events` migration · W2 not started

---

## 2026-10-04 — ADMIN USER MANAGEMENT W0 (OWNER DECISIONS LOCKED)

**Status:** **W0 CLOSED** · feature **NOT IMPLEMENTED** · **NOT committed / NOT pushed / NOT deployed**
**SSOT:** [ADMIN_USER_MANAGEMENT_DESIGN_FREEZE.md](./decisions/ADMIN_USER_MANAGEMENT_DESIGN_FREEZE.md) · [DECISION_LOG.md](./decisions/DECISION_LOG.md)

```text
OD-ADMIN-01 = YES
OD-ADMIN-02 = NO
OD-ADMIN-03 = NO
OD-ADMIN-04 = OPTIONAL EXPIRATION
OD-ADMIN-05 = YES
OD-ADMIN-06 = YES
OD-ADMIN-07 = YES / W3
```

Next: W1 read-only `/admin/users` requires separate Owner GO.

---

## 2026-10-04 — USER-FACING POLISH LOCALIZATION (CLOSED / PRODUCTION VERIFIED GREEN)

**Status:** **CLOSED** · **PRODUCTION VERIFIED GREEN**
**Final app SHA:** `ffe723b` · deployment `dpl_FkuQKRm6JE6gNqZkCopE4UmvUviM`
**Closeout SSOT:** [USER_FACING_POLISH_LOCALIZATION_IMPLEMENTATION.md](./audits/USER_FACING_POLISH_LOCALIZATION_IMPLEMENTATION.md)
**Email templates:** [USER_FACING_POLISH_LOCALIZATION_EMAIL_TEMPLATES.md](./audits/USER_FACING_POLISH_LOCALIZATION_EMAIL_TEMPLATES.md)

### Delivery

- App localization @ `4ebd1d3` · P2 chrome cleanup @ `ffe723b`
- Production UX verification **PASS** · P0/P1/P2 = **0**
- P2 CLOSED: `Workspace` → `Studio` · `Raw` → `Surowy`
- DB / Storage unchanged · Auth templates unchanged on final deploy gate
- Supabase Auth email inbox E2E = **BLOCKED — NO INBOX ACCESS** (evidence limitation)

---

## 2026-10-04 — P2 POLISH CHROME CLEANUP (Workspace · Raw)

**Status:** **SHIPPED** · production @ `ffe723b` / `dpl_FkuQKRm6JE6gNqZkCopE4UmvUviM`
**Baseline:** `4ebd1d3` · USER-FACING POLISH LOCALIZATION

### Changes

- `/` home studio card chrome: `Workspace` → `Studio` (reuse existing section label)
- `/beats` catalog mood filter: remove English `Raw`; reuse existing Polish mood `Surowy` in UI presentation taxonomy (`demo-beats` only — no DB/API contract change)

---

## 2026-10-03 — ACCOUNT / PROFILE-01 (BLOCKER FIX CYCLE · AWAITING OWNER RE-REVIEW)

**Status:** Blocker fixes in working tree · **NOT committed / NOT pushed / NOT production-DB-applied / NOT deployed**
**Baseline:** `0ca0115` · USER-ID-01 PRODUCTION VERIFIED — GREEN

### Blocker fixes

- **Recovery:** PKCE (`flow=recovery`) + OTP (`type=recovery`) keep session → `/auth/reset-password`; signup confirm still signs out
- **Delete/audio:** orchestrator nullifies `created_by` before anonymize/Auth delete; migration updates audio trigger for controlled retained/nullify states without opening USER privilege

### Prior implement scope (still in tree)

- Mandatory ksywka · profile edit · change password · forgot/reset · delete orchestrator
- OTD-01 C / OTD-02 A / OTD-03 A / OTD-04 · USER-ID-01 untouched

---


## 2026-10-03 — USER-CLEANUP-01 + USER-ID-01 (IMPLEMENTED · OWNER VERIFICATION PENDING)

**Status:** Production DB mutated · app/docs in working tree · **NOT committed / NOT pushed / NOT app-deployed**

### USER-CLEANUP-01

- Deleted exactly **93** allowlisted fixture users; KEEP Dawid + Tajski
- `auth.users` / `profiles` = **2**; platform beats = **3**; Dawid baseline intact; anon take-audio = 12; orphan-31 untouched
- Evidence: [USER_CLEANUP_01_PREDELETE_SNAPSHOT.md](./audits/USER_CLEANUP_01_PREDELETE_SNAPSHOT.md) · [USER_CLEANUP_01_POSTDELETE_EVIDENCE.md](./audits/USER_CLEANUP_01_POSTDELETE_EVIDENCE.md)

### USER-ID-01

- Remote migration tip: `20261003110802` / `user_id_01_stable_user_number`
- Hardening migration (repo, **pending apply**): `20261003123000` — authenticated DENY any `user_number` UPDATE incl. NULL→value
- App: `PROTECTED_PROFILE_FIELDS` includes `user_number`
- `profiles.user_number` BIGINT NULL + `user_number_seq` + immutability trigger
- Dawid = **1** · Tajski = **NULL** · next signup = **2**
- Session/account expose own number; public DTOs never; ADMIN can see foreign numbers; MODERATOR cannot
- SSOT: [AUTHORIZATION.md](./architecture/AUTHORIZATION.md#user-id-01--stable-user-number) · [USER_ID_01_EVIDENCE.md](./audits/USER_ID_01_EVIDENCE.md)

---

## 2026-10-03 — FAR-01 OPERATOR TOOLING + DEF-01 + SOAK ACTIVE (DOCS RECONCILIATION)

**Status:** Repository / Production app tip `e03f3be` · deployment `6823806375` · FAR-01 campaign **SOAK ACTIVE** · FAR-01 **NOT CLOSED**

### FAR-01 operator tooling (Commit 1 — not a UI release)

- Commit: `e03f3be` — `feat(far01): add production backfill operator tooling`
- R1 role `far01_dryrun_readonly` · LIVE role `far01_live_mutator` (prod applied; repo filenames production-aligned)
- Production dry-run · credential gates · canary **N=5 PASS** · fleet **N=62 PASS**
- Soak **ACTIVE**: start `2026-10-03T04:40:56.645Z` · end `2026-10-04T04:40:56.645Z` · interim **PASS** · no drift
- Inventory (living): legacy1 · canonical77 · platform3 · retained67 · orphans30 · orphan Storage97 · quarantine1 · MIGRATE=0
- Retirement / cleanup / orphan deletion: **NOT EXECUTED**
- Living status: [FAR_01_CURRENT_STATE.md](./audits/FAR_01_CURRENT_STATE.md)

### DEF-01

- **CLOSED / PRODUCTION VERIFIED** @ `fbc696f`
- Remote migration `20261003051539` / `def01_e3_definer_execute_revoke`
- Four E3 DEFINER trigger functions: anon/authenticated EXECUTE revoked
- ACTIVE P0 / P1: **NONE VERIFIED**
- HIBP: **DEFERRED / ACCEPTED RISK** (not solved)

### Documentation

- Living SSOT reconciled: FINAL_COLD_START · MASTER_HANDOFF · PROJECT_STATE · architecture index · this CHANGELOG
- Contabo documented as **EXTERNAL COMPUTE** (STOPPED/DISABLED) · Supabase Storage = durable media SSOT

---

## 2026-10-02 — FAR-01 / STORAGE-ARCH-02-KEY — PHASE 1 DR-A (SHIPPED / PRODUCTION VERIFIED)

**Status:** **SHIPPED** · **PRODUCTION VERIFIED — GREEN WITH EVIDENCE LIMITATIONS** · app `f514a51` · deployment `6817346937` · Vercel `dpl_HuRoZ9MQ7VM5jYmeJ19YJsoasM7h`

- Phase 1 DR-A: controlled dual-accept (canonical MASTER **or** deterministic legacy twin from authorized DB identities)
- Shared helper: `isAuthorizedUserBeatObjectKeyRepresentation` · wired through `assertUserBeatObjectKeyBinding` / `assertUserAssetBinding`
- Canonical WRITE SSOT unchanged (`buildUserBeatAudioObjectKey`) · dual-write **NO** · DR-B **DEFERRED**
- Live test fixtures stop seeding new legacy USER beat keys (OD-KEY-06)
- Exact product commit: `feat(storage): add FAR-01 DR-A dual-read` (8 files)
- Verify PASS: Production SHA · Access Gate signed URL for existing legacy PUBLISHED MASTER · platform canonical playback · no dual-write · no backfill · orphans untouched (30) · regression
- Evidence limitations: DR-A binding/publish ACCEPT live · USER canonical playback · cross-owner live · arbitrary legacy live — **NOT VERIFIED** / **PARTIAL** (safe mutation required); unit contract **14/14 PASS**
- Inventory unchanged: **68** legacy PUBLISHED USER · **2** canonical USER DRAFT · **3** platform — **not migrated**
- **Backfill / retirement = NOT STARTED** · next gate = PHASE 0 SOAK / BACKFILL READINESS AUDIT (separate Owner GO)
- Closeout: [FAR_01_PHASE1_DRA_PRODUCTION_CLOSEOUT.md](./audits/FAR_01_PHASE1_DRA_PRODUCTION_CLOSEOUT.md)

---

## 2026-10-02 — POLISH UX — MIX / MASTER / RECORDING / PLAYBACK (CLOSED / PRODUCTION VERIFIED)

**Status:** **CLOSED** · **PRODUCTION VERIFIED — PASS WITH EVIDENCE LIMITATIONS** · app `0afa29b` · deployment `6815846706` · Vercel `dpl_9EDrc78ompk8B2QZk6tDwQurntus`

- Polish UX: Mix · Master · Recording · Playback · export/status labels · a11y strings · take→nagranie (in-scope)
- KEEP: MIX · MASTER · Premium · Pro · EQ · LUFS · dB · dBFS · MP3 · WAV · REC
- Exact product commit: `feat(ux): localize mix master recording ui` (9 files)
- Verify PASS: Production SHA · Mix · Master · Recording · Playback · 390px · 1440px · runtime smoke · no observed functional regression
- Evidence limitations: REC Stop during REC · EN `json.error` passthrough · Premium metering — **NOT VERIFIED**
- Residual (OUT OF SCOPE): F-UX-01…03 `próba` copy outside 9-file release · F-UX-04 hardening candidate
- Security / Auth / RLS / DB / Storage / audio engine / API / ENV / Infrastructure **unchanged**
- Prior Wave A Account / Beats @ `2c4200b` remains CLOSED (parent Prod tip)
- Closeout: [POLISH_UX_PRODUCTION_CLOSEOUT.md](./audits/POLISH_UX_PRODUCTION_CLOSEOUT.md)

---

## 2026-10-02 — WAVE A — ACCOUNT / BEATS VISUAL CLOSURE (CLOSED / PRODUCTION VERIFIED)

**Status:** **CLOSED** · **PRODUCTION VERIFIED — GREEN** · app `2c4200b` · deployment `6810556404` · Vercel `dpl_9FdJrwvxGdwafGUTbzpKDzeds9PE`

- `/account/beats`: AppShell studio · PageFrame · SectionLabel · BRD tokens · PL copy · mobile-first
- Access: `requireRole(["USER"])` removed → `requireUser()` (ADMIN ALLOW · own beats only)
- Label: `MASTER READY` → `audio gotowe`
- Keep: `listOwnUserBeats` · `UserBeatActions` · `BeatGrantsPanel` · owner_id scoping
- Exact file: `src/app/account/beats/page.tsx`
- Verify PASS: Production SHA · Anonymous · ADMIN route · ADMIN owner scoping · Mobile 390 · Desktop 1440 · `/account` · `/account/takes` · runtime
- Explicit NOT VERIFIED: USER authenticated path · live cross-owner isolation (second account unavailable)
- Security / Auth architecture / RLS / DB / Storage / audio / Recording / E3 **unchanged**
- Prior Wave B Mix presentation @ `812a9d4` remains PRODUCTION VERIFIED (parent tip)
- Closeout: [A_ACCOUNT_BEATS_PRODUCTION_CLOSEOUT.md](./audits/A_ACCOUNT_BEATS_PRODUCTION_CLOSEOUT.md)

---

## 2026-10-02 — FALA 1B — ACCOUNT + PANEL ADMINISTRACYJNY (CLOSED / PRODUCTION VERIFIED)

**Status:** **CLOSED** · **PRODUCTION VERIFIED — GREEN** · app `42369c0` · deployment `6802739724` · Vercel `dpl_7hbfYd1wD6QGAbV6vLqLCXusjx7X`

- Account: `/account` BRD studio „Twoje studio” · debug dump email/role/permissions removed from UI · decorative Waveform · `listOwnTakes` read-only
- Account Takes: `/account/takes` BRD shell · OwnTakesList behavior unchanged
- Admin: `/admin` → **Panel Administracyjny** → **Pulpit** (no redirect hub) · chrome + nav (Pulpit / Bity / Moderacja / Nowy bit / Katalog)
- Admin polish: `/admin/beats` · `/admin/moderation` presentation / PL labels
- Shared: `src/lib/ui/labels.ts` (presentation-only)
- Security / Auth / RLS / audio / Recording / D02 **unchanged**
- Prior Fala 1A public visual foundation @ `fdf74f9` remains PRODUCTION VERIFIED (parent baseline)
- Deferred: full `/account/beats` redesign · Mix Panel · dead BeatListRow/BrdSymbol · Geist fonts · deep admin expansion
- Closeout: [FALA_1B_ACCOUNT_ADMIN_VISUAL_FOUNDATION_CLOSEOUT.md](./audits/FALA_1B_ACCOUNT_ADMIN_VISUAL_FOUNDATION_CLOSEOUT.md)

---

## 2026-10-02 — FALA 3.5.1 — RECORDING EXPERIENCE + DUAL AUDIO TIMELINE (CLOSED)

**Status (historical at closeout):** **CLOSED** · Owner verification **PRELIMINARY PASS** · Production **NOT DEPLOYED**
**Living status (2026-10-05):** **CLOSED / SHIPPED / PRODUCTION VERIFIED — GREEN** — see changelog entry above

- Live mic waveform + Input Monitor · BIT waveform during REC · shared REC playhead
- BRD Take Preview (BIT + TAKE dual rail · play/pause/seek) · no native `<audio controls>` in take UI
- Regression fix: BIT rail visibility (`rgba` rest bars · studio height)
- Closeout: [FALA_351_RECORDING_EXPERIENCE_CLOSEOUT.md](./audits/FALA_351_RECORDING_EXPERIENCE_CLOSEOUT.md)
- Note (historical): Owner QA wstępny; pełne production verification = osobny krok po deployu — **executed 2026-10-05** (PASS)
- Fala 4 **NOT STARTED**

---

## 2026-10-01 — FINAL COLD START HANDOFF PACK (DOCS-ONLY)

**Status:** Cold-start pack **READY** · docs tip baseline `82e0194` · Production app `6dfd201` **UNCHANGED** · STORAGE-ARCH-02 **NOT STARTED**

- New entry: [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md)
- Living SSOT entry points updated (PROJECT_STATE · MASTER_HANDOFF · docs README · architecture README)
- Docs tip corrected to `82e0194` (`a8e9356` kept as historical reference)
- Documented known DOCUMENTATION/IMPLEMENTATION DRIFT notes for new agents
- No code/DB/Storage/env/worker/deploy mutations

---

## 2026-10-01 — STORAGE-ARCH-01 — DESIGN FREEZE LOCKED + LIVING SSOT RECONCILIATION

**Status:** **STORAGE-ARCH-01 = LOCKED** · Final Architecture Review **PASS WITH FINDINGS** · Owner Review **PASS** · Implementation **NOT STARTED** · STORAGE-ARCH-02 **NOT STARTED** · Production app `6dfd201` **UNCHANGED** · deploy `dpl_3H57UgU2TfqkYawzamsVJ13qnMsG` **UNCHANGED**

- Audit + Design Freeze + Final Architecture Review complete (docs layer)
- OD-SA-01…10 LOCKED (3 private buckets · dual-read→staged migration · MASTER+fallback · artwork deferred · janitor/backup/orphans = future waves)
- Living SSOT reconciled: PROJECT_STATE · MASTER_HANDOFF · docs README · architecture README
- FAR-02 closed (living handoff links to Storage freeze/audit)
- FAR-01 / FAR-03 / FAR-04 remain deferred (Wave 02 dual-read · Wave 07 scale threshold · observability)
- Contabo remains ephemeral compute only · Supabase Storage remains durable media SSOT
- No code/DB/Storage/env/worker/deploy mutations
- Canonical: [STORAGE_ARCH_01_DESIGN_FREEZE.md](./audits/STORAGE_ARCH_01_DESIGN_FREEZE.md) · [STORAGE_ARCH_01_AUDIT.md](./audits/STORAGE_ARCH_01_AUDIT.md)

---

## 2026-10-01 — E3 PRODUCTION ENABLEMENT — FINAL GREEN + DOCS RECONCILIATION

**Status:** **E3 = PRODUCTION VERIFIED — GREEN** (PASS WITH FINDINGS) · app `6dfd201` · deploy `dpl_3H57UgU2TfqkYawzamsVJ13qnMsG` · Mix/Jobs/PUBLIC_AUDIO **ON**

- E3 Production Enablement **COMPLETE** (GO #2 Contabo · GO #3 flags · GO #4 Basic Free Final Truth · GO #5 Public Free Audio)
- AC-PE-12 / F-PE-02 implemented @ `6dfd201` (`assertPublicFreeAudioReleased` · Mix/job/download wires)
- GO #5 **PASS**: Free Basic Mix → BASIC_MP3 render → READY artifact → signed download
- Private `audio-artifacts` preserved · public object inaccessible · Free HQ/WAV **DENY** · worker 401/403 verified
- Worker Contabo bootstrap `92496d4` · final state **STOPPED / DISABLED**
- FINAL E3 STATUS: **PRODUCTION VERIFIED — GREEN**
- Deferred remain deferred: Premium Production E2E · artifacts janitor · ops dashboard · live rollback drill · STEMS · payments · public Free HQ/WAV
- Living docs reconciled (PROJECT_STATE · MASTER_HANDOFF · README · architecture README · PE freeze ops continuity · GO #2 CLOSED/SUPERSEDED stamp) — historical closeouts untouched

---

## 2026-09-30 — OWNER GO #2 — WORKER INFRASTRUCTURE — BLOCKED

**Status:** **GO #2 = BLOCKED** (partial progress) · Application `9026fa9` **UNCHANGED** · **E3 = DARK** · Mix/Jobs/Public **UNSET** · **no Production claim/render/artifact**

- FFmpeg 9.0.2 + libmp3lame + pcm_s16le verified on **candidate** agent machine (≠ approved Production host)
- `E3_RENDER_WORKER_SECRET` = **CONFIGURED** in Vercel Production project env (Encrypted) · live deploy **PENDING REDEPLOY** (GO #2 forbids Next.js redeploy)
- Claim/fake-complete auth smoke: **403** without/wrong Bearer · no Production job claimed
- **BLOCKERS:** approved EXTERNAL worker host **Owner decision required** · `scripts/e3-render-worker-once.ts` fails under plain `tsx` (`server-only`) — needs Owner GO for bootstrap fix
- Record: [E3_WORKER_INFRASTRUCTURE_GO2.md](./audits/E3_WORKER_INFRASTRUCTURE_GO2.md)
- Next = **WORKER INFRASTRUCTURE BLOCKER REVIEW** (do not auto-start GO #3)

## 2026-09-30 — W6.2/W6.3 UX RELEASE — PRODUCTION VERIFIED

**Status:** **W6.2/W6.3 UX = CLOSED / PRODUCTION VERIFIED** @ `9026fa9` · deploy `dpl_2aZabB1AtXCUNGEERmjwupXTVP9S` · **E3 = DARK** · **NOT** Production Enablement

- Shipped presentation only: touch ≥44 · SiteHeader/safe-area · PlaybackShell · Download/Auth CTAs · MixPanel RSC `mixEnabled` · progressive disclosure · jobs-OFF Export error UX
- Production Verify: `/` `/beats` `/beat/[id]` `/sign-in` `/sign-up` `/account` · 200 · `min-h-11` · `viewport-fit=cover` · Mix UI **absent** (flags UNSET) · worker claim **403** · overflow OK @360
- **E3 flags remain UNSET** · no worker · no render · no artifacts
- Next = **OWNER GO #2 — WORKER INFRASTRUCTURE** (do not auto-start)

---

## 2026-09-30 — E3 PRODUCTION ENABLEMENT — DESIGN FREEZE


**Status:** **DESIGN FREEZE COMPLETE** · Architecture Review **PASS WITH FINDINGS** · Implementation **NONE** · Production `17c4d530` **DARK** · **NO COMMIT/PUSH/DEPLOY/ENV/WORKER/RENDER**

- Owner decisions locked: **OD-E3-PE-01=B** (Mix+Jobs+worker+secret+controlled render) · **PE-02=PROVISION NOW** · **PE-03=REQUIRE PUBLIC_AUDIO RUNTIME GATE** (design now / implement later) · **PE-04=SHIP W6.2/W6.3 BEFORE ENABLEMENT** · **PE-05=YES** controlled real Production render (later GO)
- Staged flag strategy: W6 UX → worker infra → Mix → Jobs → secret → controlled render → verify → optional Public Free Audio
- `E3_PUBLIC_AUDIO` remains **OFF** for first enablement; public Free Audio = separate Owner GO #5 after runtime gate exists
- Canonical: [E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md](./audits/E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md)
- Next = **ARCHITECTURE REVIEW / OWNER GO** (GO #1 = W6 UX ship)

---

## 2026-09-29 — E3.8 W6.5 — FINAL CLOSEOUT (OWNER-ACCEPTED EMULATED CERT)


**Status:** **W6 = CLOSED / PASS** · **CERTIFICATION MODE = OWNER-ACCEPTED EMULATED** · Production `17c4d530` **UNCHANGED** · **E3 = DARK** · **no Production enablement** · **no live render / artifacts / worker**

- **OD-W6-03 CLOSED / OWNER ACCEPTED:** Owner accepts emulated Playwright Chromium/WebKit + Android UA evidence as the certification substitute (physical iOS Safari / Android Chrome unavailable in agent environment)
- Explicit limitation recorded: **no physical-device execution** — do not describe as physical iOS/Android PASS
- W6.4 = **PASS** · Owner-accepted emulated · Desktop ≥1024 = **REAL PASS** (Production DARK regression)
- Mobile certification prerequisite = **SATISFIED**
- Closeout: [E3_8_W6_IMPLEMENTATION_CLOSEOUT.md](./audits/E3_8_W6_IMPLEMENTATION_CLOSEOUT.md)
- Checklist: [E3_8_W6_CERT_CHECKLIST.md](./audits/E3_8_W6_CERT_CHECKLIST.md)
- Evidence retained: `docs/audits/_w64_evidence/`
- **W6 PASS ≠** `E3_PUBLIC_AUDIO` ON · **≠** Production render enablement · **≠** E3 epic COMPLETE
- Next = **OWNER DECISION / NEXT RELEASE STAGE** (do not auto-open next feature / do not enable Production flags)

---

## 2026-09-29 — E3.8 W6.4 — DEVICE CERTIFICATION (EMULATED EVIDENCE)

**Status:** Evidence executed · later **Owner-accepted as PASS** in W6.5 · Production `17c4d530` **UNCHANGED** · **E3 = DARK** · **no live render / artifacts**

- Emulated matrix: Playwright Chromium (35 cells) + WebKit (4 beat viewports) · overflow PASS · CTA ≥44 · playback smoke PASS
- Preview Mix ON (`mixEnabled=true`) verified via official `vercel curl` · jobs OFF
- Production Dark = **PASS** (Mix absent · E3 flags UNSET)
- Desktop Chrome ≥1024 Production = **PASS** (DARK regression)
- Physical iOS/Android = **not executed** (documented limitation)
- Checklist: [E3_8_W6_CERT_CHECKLIST.md](./audits/E3_8_W6_CERT_CHECKLIST.md)

---

## 2026-09-29 — E3.8 W6.3 — MIX / MASTER / EXPORT MOBILE PRESENTATION (CODE · PRE-COMMIT)


**Status:** **W6.3 IMPLEMENTED** · Owner Verification pending · Production app remains `17c4d530` · **E3 = DARK** · **COMMIT/PUSH/DEPLOY = NONE** · **no live render**

- **AR-W6-01:** RSC `E3_MIX_ENABLED` → `mixEnabled` prop → MixPanel (client no longer imports env flag)
- Mix/Master: native `<details>` progressive disclosure · touch CTAs `min-h-11` · sliders `h-11` · `min-w-0` overflow hygiene
- Export: Basic / HQ / WAV / Premium lock / status / error / disabled Download presentation · jobs-OFF error copy for W6 cert
- **NOT done:** `E3_RENDER_JOBS_ENABLED` · worker · FFmpeg · artifacts · Production env · Mix/Master DSP/AuthZ
- Next = **OWNER W6.3 VERIFICATION GO** → then W6.4 only

---

## 2026-09-29 — E3.8 W6.2 — SHARED MOBILE PRESENTATION (CODE · PRE-COMMIT)

**Status:** **W6.2 IMPLEMENTED** · Owner Verification pending · Production app remains `17c4d530` · **E3 = DARK** · **COMMIT/PUSH/DEPLOY = NONE**

- Surface-local touch targets (`min-h-11`) on SiteHeader nav · PlaybackShell Play/Mute · Download · Auth submit/CTAs · home/sign-in/sign-up/confirmed links · beats list rows
- Safe-area: `viewportFit: cover` · header insets · body bottom inset
- Global Button default `h-8` **unchanged** (no desktop density regression via global default)
- Recording CTAs already `min-h-11` — reused / not redesigned
- **OUT:** Mix/Master/Export presentation (W6.3) · hamburger · AuthZ/DSP · E3 flags · live render
- Next = **OWNER W6.2 VERIFICATION GO** → then W6.3 only

---

## 2026-09-29 — E3.8 W6.1 — CERTIFICATION FOUNDATION (DOCS)

**Status:** **W6.1 COMPLETE** (docs) · Owner Verification pending · Design Freeze COMPLETE · Arch Review **PASS WITH FINDINGS** · Owner Implement GO **GRANTED** · Production `17c4d530` · **E3 = DARK**

- Deliverable: fillable cert checklist [E3_8_W6_CERT_CHECKLIST.md](./audits/E3_8_W6_CERT_CHECKLIST.md) (REUSE freeze §§5–7 as criteria SSOT — no duplicate acceptance prose)
- Locked Implement decisions: **AR-W6-01** RSC `mixEnabled` prop · **AR-W6-02** Preview Mix-only · **AR-W6-03** Export presentation/status/error only (no live render)
- Recording historical W6 security = **OUT** (OD-W6-01)
- **CODE / CONFIG / COMMIT / PUSH / DEPLOY = NONE**
- Next = **OWNER W6.1 VERIFICATION GO** → then W6.2 only

---

## 2026-09-29 — E3.8 W6 MOBILE CERT — DESIGN FREEZE

**Status:** **DESIGN FREEZE COMPLETE** · Arch Review later **PASS WITH FINDINGS** · Implement GO later **GRANTED** · Production remains `17c4d530` · **E3 = DARK**

- Owner Decisions: **OD-W6-01 = A** (OAD-05 mobile cert only · Recording W6 security OUT) · **OD-W6-02 = A** (Preview Mix cert · Production flags UNSET) · **OD-W6-03** device matrix frozen (iOS Safari + Android Chrome · 360/390/412/768 + desktop ≥1024)
- Waves frozen: W6.1 checklist → W6.2 shared presentation → W6.3 Mix/Master/Export presentation → W6.4 device matrix → W6.5 closeout
- Acceptance frozen: CTA ≥44×44 · overflow-x · playback · Basic Mix on Preview · Export presentation/status/error · Premium UX readable · no Production enablement
- **OUT:** redesign · native apps · DSP/AuthZ/business logic · Production render · public Free Audio ON
- Canonical: [E3_8_W6_MOBILE_CERT_PLAN.md](./audits/E3_8_W6_MOBILE_CERT_PLAN.md)
- Checklist: [E3_8_W6_CERT_CHECKLIST.md](./audits/E3_8_W6_CERT_CHECKLIST.md)

---

## 2026-09-29 — E3.7 PREMIUM RENDER — PRODUCTION VERIFIED (POST-DEPLOY)

**Status:** **E3.7 PRODUCTION VERIFIED** @ `17c4d530` · Owner Verification **PASS WITH FINDINGS** · **E3 = DARK** · real render **NOT EXECUTED** · artifact **NONE**

- Production application = `17c4d530c2ecc7c0c8e68cf6266e73b330f09be1` (`feat(audio): implement E3.7 premium export`)
- Production deployment = `dpl_BsdUUMvwsgg3xGJthfSYXE52rQCe` · URL https://www.bitrymdym.pl
- Previous Production = `183b2a4` (E3.6)
- **Verify:** public smoke `/` `/beats` `/sign-in` `/sign-up` `/account` · apex→www **PASS** · regression **PASS** · worker/claim **403** (secret UNSET) · E3 flags **UNSET**
- **E3.7 on Production (DARK):** `server-pro-v1` · Master Plan A · HQ MP3 **320** · WAV **44.1/16/stereo** · tier download AuthZ · private `audio-artifacts`
- **NOT enabled:** Production render · worker secret · public Free Audio · E3 epic COMPLETE
- INFO: G5 soft RMS ≠ full ITU-R BS.1770 (non-blocking)
- Closeout: [E3_7_IMPLEMENTATION_CLOSEOUT.md](./audits/E3_7_IMPLEMENTATION_CLOSEOUT.md)
- Next = **OWNER DECISION** (do **not** auto-enable E3)

---

## 2026-09-29 — E3.7 PREMIUM RENDER — COMMITTED + PUSHED (POST-COMMIT DOCS)

**Status (historical):** **E3.7 IMPLEMENTED** · Owner Verification **PASS WITH FINDINGS** · **COMMITTED + PUSHED** @ `17c4d530` · Production then still `183b2a4` · **E3 = DARK**

- Repository / `origin/main` = `17c4d530c2ecc7c0c8e68cf6266e73b330f09be1` (`feat(audio): implement E3.7 premium export`)
- Production application (then unchanged) = `183b2a4` · deployment `dpl_D5EfHdSSahouFftf5HK35wKSHmts`
- **E3.7 waves A–H on main:** `server-pro-v1` Pro Mix · Master **Plan A** · HQ MP3 **320** · WAV **44.1/16/stereo** · EXTERNAL worker dispatcher · tier-aware download AuthZ · Premium Export UX · tests **100/100**
- **Later:** Production Deploy + Verify completed @ `17c4d530` · `dpl_BsdUUMvwsgg3xGJthfSYXE52rQCe` — see Production Verified entry above
- Closeout: [E3_7_IMPLEMENTATION_CLOSEOUT.md](./audits/E3_7_IMPLEMENTATION_CLOSEOUT.md)

---

## 2026-09-29 — E3.7 PREMIUM RENDER — IMPLEMENTATION CLOSEOUT (DOCS · PRE-COMMIT)

**Status (historical at authorship):** **E3.7 IMPLEMENTED** · Owner Verification **PASS WITH FINDINGS** · docs reconciliation · **COMMIT/PUSH/DEPLOY = NONE** at that moment · Production app remains `183b2a4` · **E3 = DARK**

- Production application (unchanged) = `183b2a4` · deployment `dpl_D5EfHdSSahouFftf5HK35wKSHmts` · Documentation tip then = `f944747`
- **E3.7 waves A–H:** `server-pro-v1` Pro Mix (`MixProParams`) · Master **Plan A** (OD-E37-01) · HQ MP3 **320** · WAV **44.1/16/stereo** · EXTERNAL worker dispatcher · tier-aware download AuthZ · thin Premium Export UX (HQ+WAV+Basic) · tests **100/100** · typecheck/build/security/regression **PASS**
- **Premium Final Truth:** Pro Mix → Master Plan A → HQ/WAV encode → QC → private `audio-artifacts` → READY · **not** `server-basic-v1`
- **Basic path:** `server-basic-v1` → Basic MP3 128 unchanged
- **Download:** `quality_tier` → `EXPORT_BASIC_MP3` / `EXPORT_HQ_MP3` / `EXPORT_WAV`
- **Production safety:** flags UNSET · worker secret UNSET · Production Render **NOT EXECUTED** · no Production E3.7 deploy
- **OUT:** STEMS · `artifact_kind` · payments · public Free Audio · W6 matrix · Production enablement · `MasterProParams` / True Peak / BS.1770 · bake↔encode ±5% QC (OD-E37-03 OUT)
- INFO: G5 soft RMS approximation · *(then)* E3.7 code uncommitted until Owner Commit GO — **later committed** @ `17c4d530`
- Closeout: [E3_7_IMPLEMENTATION_CLOSEOUT.md](./audits/E3_7_IMPLEMENTATION_CLOSEOUT.md)
- Next at authorship = **OWNER COMMIT GO** — superseded by Commit+Push @ `17c4d530`

---

## 2026-09-29 — E3.6 BASIC MP3 EXPORT — POST-RELEASE CLOSEOUT (DOCS)

**Status:** **E3.1 → E3.6 CLOSED / PRODUCTION VERIFIED** @ `183b2a4` · **E3 = DARK** · docs reconciliation · **no app/DB/env/deploy in this closeout**

- Application / Production = `183b2a4a7ea3cc8be7f0ac337e75e915ffdae0b9` (`feat(audio): implement E3.6 basic mp3 export`)
- Production deployment = `dpl_D5EfHdSSahouFftf5HK35wKSHmts` · URL https://www.bitrymdym.pl · Production Verify = **PASS**
- Previous Production = `fbece37` (E3.5 Render Jobs)
- **E3.6 shipped:** source authorization/resolution · `server-basic-v1` bake · real Basic MP3 **128 kbps stereo** · **OD-E36-04 = C** native/system FFmpeg + libmp3lame on **EXTERNAL worker** (FFmpeg **not** an app npm dependency) · QC · signed download · thin Free Export UX · Final Truth READY artifact path · tests
- **Production safety (unchanged / DARK):** `E3_RENDER_JOBS_ENABLED` / `E3_MIX_ENABLED` / `E3_PUBLIC_AUDIO` = **UNSET** · `E3_RENDER_WORKER_SECRET` = **UNSET** · Production real render **NOT ENABLED / NOT EXECUTED**
- History preserved: E3.1 @ `35e1eaa` → E3.2 @ `24e50ac` → E3.3 @ `8283bd0` → E3.4 @ `69dc9d1` → E3.5 @ `fbece37` → E3.6 @ `183b2a4`
- Closeout: [E3_6_PRODUCTION_CLOSEOUT.md](./audits/E3_6_PRODUCTION_CLOSEOUT.md)
- Architecture continuity: [E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md](./architecture/E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md) · [E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md](./architecture/E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md)
- INFO (non-blockers): Live Full E2E not executed · Free Export needs EXTERNAL worker process · G5 soft RMS (not full BS.1770) · Fake-complete ≠ Final Truth · native FFmpeg per OD-E36-04
- D02 @ `e98ba52` · W1–W5 @ prior SHAs — unchanged
- Docs-only tip may advance after Owner docs-commit GO — **do not** redeploy docs as application
- Next = **OWNER DIRECTION / READY FOR NEXT AUDIT** (do **not** auto-select E3.7+)

---

## 2026-09-28 — D02 ANONYMOUS QUICK TAKE — POST-RELEASE CLOSEOUT (DOCS)

**Status:** **D02 CLOSED / IN V1** · **SHIPPED** · **PRODUCTION VERIFIED** @ `e98ba52` · docs reconciliation · **no app/DB/deploy**

- Application / Production = `e98ba52c610b4c6dee8f69aa76f734b6cbe898ab` (`feat: add d02 anonymous quick take`)
- Production Verify = GREEN · Closeout: [RECORDING_D02_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_D02_PRODUCTION_CLOSEOUT.md)
- Contract addendum reconciled: [PHASE_RECORDING_D02_ANONYMOUS_QT_DESIGN_FREEZE_ADDENDUM.md](./phases/PHASE_RECORDING_D02_ANONYMOUS_QT_DESIGN_FREEZE_ADDENDUM.md)
- Preserve NOT EXECUTED: post-expiry live · 3/day · missing READY-master case · W4/W5 full interactive · mobile 390/412
- POST-RELEASE FINDING: anonymous verify artifacts TTL-bound (MEDIUM=1) — no delete feature in closeout
- OUT unchanged: anon→account claim · durable anon download · MIX/EXPORT/TRACK/PAYMENTS/PREMIUM/SOCIAL/DUAL-PLAY · grant PLAYBACK|DOWNLOAD
- Wave 5 @ `37892a6` unchanged · W4 ownership path unchanged
- Docs-only tip may advance after Owner docs-commit GO — **do not** redeploy docs as application
- Next = **OWNER DIRECTION / READY FOR NEXT AUDIT**

---

## 2026-09-28 — D02 ANONYMOUS QUICK TAKE — DESIGN FREEZE ADDENDUM

**Status (freeze gate — historical):** **DESIGN FREEZE COMPLETE** · Implementation GO was **NONE** at freeze time · Architecture Review was next gate · **no app/DB/config change in that docs step**

- Canonical: [PHASE_RECORDING_D02_ANONYMOUS_QT_DESIGN_FREEZE_ADDENDUM.md](./phases/PHASE_RECORDING_D02_ANONYMOUS_QT_DESIGN_FREEZE_ADDENDUM.md)
- At freeze: D02 CLOSED / IN V1 · delivery still NOT SHIPPED
- Frozen: TTL 7200s · max 30s · caps 1/3/concurrent 1 · dedicated take identity ≠ `brd_dl_aid`
- Preview YES (short-lived signed) · durable download NO · anon→account claim NO · PUBLISHED only · dual-play OUT
- Wave 5 / MIX / EXPORT / Track / Payments / grant PLAYBACK|DOWNLOAD = OUT
- **Later:** Implementation + Production Verify completed @ `e98ba52` — see Post-Release Closeout entry above

---

## 2026-09-28 — RECORDING WAVE 5: PRODUCTION VERIFIED / CLOSED

**Status:** **CLOSED / PRODUCTION GREEN** @ `37892a6adca1ac3b4bf68a06af248ca38bbcc177`

- Scope: Shared Grants → RECORD only (`beat_access_grants`)
- OWNER VERIFICATION = PASS · PRODUCTION VERIFY = PASS
- Production URL: https://www.bitrymdym.pl
- D03 decision unchanged CLOSED / IN Recording EPIC · delivery = SHIPPED / PRODUCTION VERIFIED
- D02 Anonymous QT at Wave 5 closeout: CLOSED / IN V1 · delivery then NOT SHIPPED / DEFERRED *(later shipped @ `e98ba52`)*
- Security continuity: P1-B/P1-C CLOSED · P1-A HIBP BLOCKED · Wave 5 AuthZ/IDOR/RLS PASS · Take ACL unchanged
- Closeout: [RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md)
- Known INFO: React hydration warning on `/beat/[id]` (non-blocker)
- Migration timestamp drift = P2 OPS (deferred)
- Docs-only tip may advance after this closeout — **do not** redeploy docs without Owner Production GO
- Next at Wave 5 closeout = **OWNER DIRECTION / READY FOR NEXT AUDIT** (no auto EPIC)

---

## 2026-09-28 — RECORDING WAVE 5 IMPLEMENTATION (LOCAL · PRE-COMMIT)

**Status:** Implementation complete locally · remote DB migration applied · **COMMIT/PUSH/DEPLOY = NONE** · production app remains `99c4815`

- Scope: Shared Grants → RECORD only (`beat_access_grants`)
- D03 decision unchanged CLOSED / IN EPIC; delivery implemented pending Owner Verification
- OUT unchanged: PLAYBACK/DOWNLOAD via grant · Anon QT · MIX/EXPORT · Payments · take sharing
- AuthZ: `assertTakeRecordAccess` + grant domain; PUBLISHED RECORD without grant preserved (W4)
- APIs: `/api/beats/[id]/grants` · revoke · `/api/account/grants`
- UI: Moje bity grant panel · `/account/shared`
- Next: **OWNER VERIFICATION** → then commit GO

---

## 2026-09-28 — P1 SECURITY HARDENING CLOSEOUT (DOCS)

**Status:** documentation continuity after P1-B/P1-C · **no app deploy** · production app remains `99c4815`

- Git / origin/main = `b4199ef` (`security: harden definer grants and updated_at search path`)
- **P1-B** selective DEFINER EXECUTE REVOKE = **CLOSED** / VERIFIED / committed+pushed
- **P1-C** `set_updated_at` (`search_path` + `pg_catalog.now()`) = **CLOSED** / VERIFIED / committed+pushed
- Remote DB contains P1-B + P1-C hardening
- **P1-A HIBP** = **BLOCKED** — Owner Dashboard action required (not enabled)
- Security = **GREEN WITH WARNINGS** · CRITICAL=0 · HIGH=0 · MEDIUM residual = HIBP disabled
- Migration timestamp drift local↔remote = **P2 OPS** (not P1 blocker)
- Wave 5 = **NOT IMPLEMENTED** / **NO IMPLEMENTATION GO**

---

## 2026-09-28 — DOCUMENTATION CONTINUITY RECONCILIATION

**Status:** documentation only (Owner GO: docs continuity) · **no app / DB / env / deploy**

- Added canonical cold-start entry [MASTER_HANDOFF.md](./MASTER_HANDOFF.md)
- Entry points: MASTER_HANDOFF → PROJECT_STATE → SSOT / architecture / audits
- Clarified production app `99c4815` ≠ git docs tip (prior tip `406ff5b`; do not auto-align)
- Next = **OWNER DIRECTION / COLD START AUDIT** (Wave 5 = **no** automatic GO)
- Decision ≠ delivery: D02/D03 decisions unchanged; delivery NOT SHIPPED; no Implementation GO
- Continuity rule: documentation ≠ proof of shipped implementation; code/schema = evidence
- Deferred (not done here): freeze / SYSTEM_ARCHITECTURE §9 / SSOT §18 / OPEN_DECISIONS D02–D03 wording sync — awaits Owner clarification

---

## 2026-09-28 — RECORDING WAVE 4: PRODUCTION VERIFIED / CLOSED

**Status:** **CLOSED / PRODUCTION GREEN** @ `99c4815e26b224cb66e221831687b0688bf20476`

- Production deploy Ready · aliased https://www.bitrymdym.pl
- Smoke + live W4 E2E (BEGINNER record→download→delete, caps, IDOR) PASS
- PRO/LEGEND entitlement snapshots PASS; Chromium WebM/Opus regression PASS
- Janitor: Hobby daily `0 0 * * *`; unauthorized cron 401 PASS; scheduled run PENDING_SCHEDULE
- Closeout: [RECORDING_WAVE4_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_WAVE4_PRODUCTION_CLOSEOUT.md)
- OUT remains: anon QT · grants · MIX/EXPORT · payments

---

## 2026-09-28 — RECORDING WAVE 4: HOBBY-COMPATIBLE DAILY JANITOR CRON

**Status:** hotfix (Wave 4 still OPEN — not CLOSED)

- Vercel Hobby rejects hourly cron; schedule changed to `0 0 * * *` (00:00 UTC daily)
- Expiry AuthZ unchanged (immediate DENY); janitor remains cleanup/lifecycle only
- No business-logic / schema / AuthZ / entitlement changes

---

## 2026-09-27 — RECORDING WAVE 4: ENTITLEMENT / RETENTION / JANITOR / ANTI-ABUSE / DOWNLOAD / MOJE PRÓBKI

**Status:** **IMPLEMENTED / READY_FOR_OWNER_REVIEW** — COMMIT / PUSH / DEPLOY = NOT PERFORMED · production still @ `9f6f006`

- Entitlement SSOT: BEGINNER 30s · PRO/LEGEND `MIN(beat,180)` (`entitlement.ts` + session/finalize)
- Retention: account-level `expires_at`; AuthZ DENY when expired
- Anti-abuse race-safe: `claim_take_recording_session` (advisory_xact_lock) + unique PENDING per owner
- Janitor: Vercel Hobby daily cron `0 0 * * *` → `GET /api/cron/takes-janitor` (`CRON_SECRET`) — take-audio only; expiry AuthZ remains immediate
- Own take download: `POST /api/takes/download` signed GET TTL 300s
- Soft-delete: `POST /api/takes/delete` → DELETED + deleted_at
- UI: `/account/takes` Moje próbki (preview / download / delete)
- Migration: `20260927220000_recording_wave4_session_claim.sql` (applied remote)
- Tests: wave4-unit + wave4-live; full `src/lib/takes` regression PASS
- Report: [RECORDING_WAVE4_IMPLEMENTATION_REPORT.md](./audits/RECORDING_WAVE4_IMPLEMENTATION_REPORT.md)
- OUT: anon QT · grants · MIX/EXPORT · publish · payments

---

## 2026-09-27 — RECORDING WAVE 3: DURATION HOTFIX PRODUCTION VERIFIED / CLOSED

**Status:** **CLOSED / PRODUCTION VERIFIED** @ `9f6f006c4dbb3354260ca2f5479c18952f8a713a`

- Blocker discovered on `507f78f`: Chromium timesliced WebM/Opus → music-metadata `format.duration` missing → finalize `DURATION_PROBE_FAILED`
- Hotfix: `fix(recording): support chromium webm duration fallback` @ `9f6f006`
- RCA: [RECORDING_WAVE3_PRODUCTION_BLOCKER_RCA.md](./audits/RECORDING_WAVE3_PRODUCTION_BLOCKER_RCA.md)
- Production E2E: real MediaRecorder `audio/webm;codecs=opus` + timeslice 250 → upload → decode fallback duration → READY_TAKE → signed take-only preview PASS

---

## 2026-09-27 — RECORDING WAVE 3: PRODUCTION BLOCKER RCA + HOTFIX

**Status:** superseded by production verify CLOSED @ `9f6f006`

- RCA: [RECORDING_WAVE3_PRODUCTION_BLOCKER_RCA.md](./audits/RECORDING_WAVE3_PRODUCTION_BLOCKER_RCA.md)
- Cause: timesliced Chromium MediaRecorder WebM omits Info.Duration; music-metadata ignores Clusters
- Fix: server-side `audio-decode` PCM fallback when EBML/WebM lacks metadata duration (client duration still untrusted)
- Fixture: `src/lib/beats/fixtures/chromium-mediarecorder-opus.webm`

---

## 2026-09-27 — RECORDING WAVE 3: PLAYER INTEGRATION + TAKE PREVIEW

**Status:** **DEPLOYED** @ `507f78fb03347683c847d5b0a0d76a3fffe1827d` · **PRODUCTION VERIFY NOT CLOSED**

- Sibling `RecordingPanel` + `BeatRecordingSurface` on beat detail
- Pure `recording-ui-state` machine (separate from `reducePlayback`)
- Thin PlaybackShell sync: playFromStart(0) + stop + controls lock (OD-W3-01)
- Take-only preview via `POST /api/takes/preview` owner signed GET (OD-W3-04)
- Anonymous QT OUT (OD-W3-02); interim AuthZ unchanged (auth + PUBLISHED)
- Tests: wave3-unit + wave3-live preview AuthZ
- Closeout: [RECORDING_WAVE3_IMPLEMENTATION_CLOSEOUT.md](./audits/RECORDING_WAVE3_IMPLEMENTATION_CLOSEOUT.md)
- OUT: dual-play, anon, grants, entitlements, download, MIX/EXPORT
- **Prod verify:** UI START/STOP/CANCEL + upload PASS; finalize **FAIL** — `DURATION_PROBE_FAILED` on real Chromium MediaRecorder `audio/webm; Opus` (music-metadata returns no `format.duration`). READY_TAKE / take preview not reached. Blocker — no hotfix without Owner GO.

---

## 2026-09-27 — RECORDING WAVE 2: TRANSPORT + MEDIARECORDER

**Status:** **IMPLEMENTED** (Owner review / commit pending)

- Take session = existing `takes` row (`PENDING_UPLOAD` → `READY`)
- MediaRecorder / getUserMedia module (`src/lib/takes/media-recorder.ts`)
- Signed upload + finalize for private `take-audio` (`/api/takes/session`, `/api/takes/finalize`)
- Interim AuthZ: authenticated + PUBLISHED beat; max = `MIN(beat, 180)`
- Duration probe fail-closed (OD-W2-04); no client duration trust
- Tests: wave2-unit + wave2-live security matrix
- Closeout: [RECORDING_WAVE2_IMPLEMENTATION_CLOSEOUT.md](./audits/RECORDING_WAVE2_IMPLEMENTATION_CLOSEOUT.md)
- OUT: PlaybackShell Record, QT product UI, anon, entitlements, janitor

---

## 2026-09-27 — RECORDING WAVE 1: TAKE FOUNDATION

**Status:** **IMPLEMENTED** (Owner review / commit pending)

- New domain table `takes` (not extending `beat_audio_assets`)
- Enums: `take_status`, `take_recording_mode`
- RLS: owner SELECT own non-deleted; client mutations DENY (service_role only)
- Private bucket `take-audio` (client Storage INSERT/SELECT DENY)
- Object key helpers + `src/config/recording.ts` retention/anti-abuse constants
- Tests: wave1-foundation unit + live RLS/storage
- Migration: `20260927180000_recording_wave1_take_foundation.sql` (applied remote)
- OUT: MediaRecorder, Record UI, upload transport API, shared grants, janitor

---

## 2026-09-27 — RECORDING / QUICK TAKE DESIGN FREEZE v1.0 LOCKED

**Status:** **DESIGN FREEZE LOCKED** · Owner D01–D08 / OD-REC-01…08 **CLOSED** · **IMPLEMENTATION NONE**

- Canonical: [PHASE_RECORDING_DESIGN_FREEZE.md](./phases/PHASE_RECORDING_DESIGN_FREEZE.md)
- RECORD ≠ PLAYBACK ≠ DOWNLOAD; anon QT IN V1; shared grants IN EPIC; hybrid Account Level + future Premium
- Retention: BEGINNER 24h · PRO 10d · LEGEND 30d; anti-abuse caps locked; own take download YES (anon no durable DL)
- MIC TAKE ≠ mix; MIX/EXPORT OUT (OD-14); `MIN(beat, entitlement, 180)` server-enforced
- Next: Wave 1 Implementation AUDIT/PLAN only after separate Owner GO

---

## 2026-09-27 — COMMUNITY WAVE 5: HARDENING + EPIC CLOSEOUT

**Status:** **IMPLEMENTED / VERIFIED** · EPIC **COMPLETE / LOCKED**

- Submit cooldown: `beats.last_submitted_at` + trigger (60s) + service `assertSubmitCooldown`
- Cleared on `REJECTED → DRAFT` (legitimate rework allowed)
- Security regression suite (AuthZ/IDOR/READY/Storage/public visibility)
- Live E2E: cooldown DENY · reject/rework · approve · publish · public · PLATFORM regression
- Audit/telemetry: DOWNLOAD_EVENT remains SSOT for downloads; beat lifecycle audit **deferred** (invariants enforced without new framework)
- Migration: `community_wave5_submit_cooldown`

---

## 2026-09-27 — COMMUNITY WAVE 4: STAFF PUBLISH APPROVED USER BEATS

**Status:** **IMPLEMENTED / VERIFIED** · ADMIN + MODERATOR · USER DENY · READY hard gate first

- `publishApprovedUserBeat`: `beats.publish` → APPROVED USER only → READY+object-key gate → `PUBLISHED`
- Moderation UI: tabs W moderacji / Zaakceptowane · `Opublikuj` (no metadata edit)
- Public reuse: `/beats` · `/beat/[id]` · PlaybackShell · Access Gate · download / My Downloads
- USER: status Opublikowany · CTA `Zobacz bit`
- Tests: community-wave4 unit A–R + live E2E; PLATFORM regression PASS
- No new migration (Wave 1 MOD publish RLS reused)

---

## 2026-09-27 — COMMUNITY WAVE 3: SUBMIT + MODERATION

**Status:** **IMPLEMENTED / VERIFIED** · APPROVED ≠ PUBLISHED · Wave 4 publish still pending

- Submit: `submitUserBeat` DRAFT→PENDING_REVIEW (own USER + active MASTER READY revalidated)
- Moderation: `approveUserBeat` / `rejectUserBeat` (+ required `rejection_reason`); queue `/admin/moderation`
- USER UI: `/beats/upload`, `/account/beats`; Polish status labels; resubmit after REJECTED→DRAFT
- MOD playback via existing PlaybackShell + Access Gate (staff non-public PLAYBACK)
- Migration `community_wave3_user_edit_freeze`: USER metadata edits only DRAFT/REJECTED
- Tests: community-wave3 unit + live RLS/E2E; APPROVED not in public catalog
- Wave 4 remaining: APPROVED→PUBLISHED UI/flow (service already exists)

---

## 2026-09-27 — COMMUNITY WAVE 2: USER SIGNED AUDIO TRANSPORT

**Status:** **IMPLEMENTED / VERIFIED** · Storage INSERT still **DENY** · beat stays **DRAFT**

- Reuse Audio Transport V1: signed upload → analyze → finalize → MASTER READY
- Routes: `POST /api/beats/audio/session`, `POST /api/beats/audio/analyze`, `finalizeUserBeatWithMasterAction`
- Object key: `user/{ownerId}/{beatId}/{assetId}/master.bin` (server-chosen)
- Migration `community_wave2_user_audio`: asset trigger allows USER beats with `user/{ownerId}/` prefix
- Replacement: new PENDING → READY activates; previous MASTER → REPLACED
- Live E2E: `bpm-120-steady.wav` → duration 30 · BPM 120 · no 413 · DRAFT retained
- IDOR / AuthZ unit tests + PLATFORM transport regression preserved

---

## 2026-09-27 — COMMUNITY WAVE 1: OWNERSHIP / RLS / AUTHZ FOUNDATION

**Status:** **IMPLEMENTED** · Design Freeze honored · UI/transport **OUT**

- Migration `community_wave1_ownership`: `rejection_reason`, USER `beats.create`, `beats.publish` (ADMIN+MODERATOR), RLS insert/update, trigger rewrite
- App: ownership-aware `assertPublishHardGate`; USER/MOD transition matrix; community service contracts; `user/` object key validator
- Tests: community-wave1 contracts A–T + IDOR; total suite GREEN
- Live RLS: USER own insert/select; foreign/PLATFORM/PUBLISHED insert DENY; MOD reject+reason / approve; ADMIN PLATFORM insert regression
- Storage INSERT remains default deny

---

## 2026-09-27 — COMMUNITY BEAT UPLOAD + MODERATION — DESIGN FREEZE

**Status:** Design Freeze **READY / OWNER GO** · Implementation **NONE** · Migration **NONE**

- Owner GO closed OD-COMMUNITY-01…05 (staff publish; rejection_reason; USER `beats.create`; all account levels upload; USER archive own PUBLISHED)
- Frozen: USER ownership + lifecycle DRAFT→PENDING_REVIEW→APPROVED→PUBLISHED; USER never publishes; reuse `beat-audio` + signed upload; object key `user/{ownerId}/{beatId}/{assetId}/master.bin`
- Docs: [PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md](./phases/PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md)
- Baseline: `47643c2` · Production GREEN · Phase 1.9 CLOSED

---

## 2026-09-27 — EPIC-A: PHASE 1.9 CLOSEOUT + PUBLISH HARD GATE

**Status:** Implementation **COMPLETE** on `main` @ `47643c2` · Phase 1.9 **CLOSED / LOCKED** · Production **VERIFIED GREEN**

- Server: `transitionBeatStatus(…, PUBLISHED)` requires PLATFORM + active MASTER READY (same `beat_id`); create no longer inserts as PUBLISHED
- UI publish gate preserved; GAP-PUBLISH-READY **CLOSED**
- Docs reconciled; production verify GREEN @ `47643c2`

---

## 2026-09-27 — AUDIO TRANSPORT V1 (SIGNED BINARY UPLOAD)

**Status:** Design Freeze **APPROVED** · Implementation **CLOSED / PRODUCTION VERIFIED** @ `73e213c`

- Gap: base64 Server Action vs Next.js 1 MB body limit blocked >1 MB WAV E2E
- Decision: **signed binary upload** to private `beat-audio` (not bodySizeLimit-as-fix; not RH multipart as sole path)
- DRAFT-beat-first · BPM V1 unchanged (`471dd5b`)
- Live E2E localhost + production: `bpm-120-steady.wav` ~2.52 MiB → session → signed upload → analyze → finalize · no HTTP 413 · BPM 120 AUTO_SUGGEST
- Docs: [PHASE_AUDIO_TRANSPORT_DESIGN_FREEZE.md](./phases/PHASE_AUDIO_TRANSPORT_DESIGN_FREEZE.md) · [AUDIO_TRANSPORT.md](./architecture/AUDIO_TRANSPORT.md)

---

## 2026-09-27 — BPM PRODUCTION IMPLEMENTATION V1

**Status:** **IMPLEMENTED** on `main` · **ACCURACY NOT CERTIFIED** · Phase 1.9 **NOT CLOSED**

- Platform Beat create: A=`tempo()` + B=`combTempo()` → C_NEAR → RULE B → AUTO_SUGGEST | MANUAL_REQUIRED
- Server re-probe + `resolveCreateBpm`; client BPM untrusted; user override allowed (1–300)
- DB unchanged (`beats.bpm` only); no telemetry / confidence columns
- Docs: [PHASE_BPM_DESIGN_FREEZE.md](./phases/PHASE_BPM_DESIGN_FREEZE.md) · [BPM_AUTO_DETECTION.md](./architecture/BPM_AUTO_DETECTION.md)

---

## 2026-09-26 — SCOPE B — BPM AUTO-DETECTION (RESEARCH → V1)

**Status:** Research + Design Freeze completed; production wiring shipped as V1 above · **NOT accuracy-certified**

- Detector: `@audio/beat` signal analysis (not ID3); decode WAV/MP3 via `audio-decode`; FLAC/AAC/M4A → manual BPM
- Experiments V2–V5 + Design Freeze precede production resolver (C_NEAR + RULE B)
- Benchmark fixtures remain outside git; accuracy Owner-gated

---

## 2026-09-26 — SCOPE A — AUDIO-FIRST PLATFORM BEAT UPLOAD (LOCAL)

**Status:** Scope A **IMPLEMENTED locally** · BPM auto (**Scope B**) **DEFERRED** · Phase 1.9 **NOT CLOSED** · **NO COMMIT / NO PUSH**

- `/admin/beats/new`: audio-first UX — select file → server `music-metadata` duration → title suggestion → manual BPM/metadata → CREATE DRAFT + existing MASTER upload pipeline
- `duration_seconds`: server source of truth (`Math.round` float → int); range 1–180; no hardcoded 120; manual duration input removed
- Title: pure `suggestTitleFromFilename` (editable); BPM: manual only, no default 140, no detector
- Dependency: `music-metadata` (server-only / `serverExternalPackages`); no Access Gate / RLS / AuthZ / GAP-PUBLISH-READY changes
- Scope B (BPM auto-detection): **DEFERRED — Owner GO required**
- Next: Owner uses audio-first create → READY → UI publish → agent live E2E

---

## 2026-09-26 — PHASE 1.9 — FIRST PLATFORM BEAT (BLOCKED ON OPERATOR UI)

**Status:** Cold-start **PASS** · ADMIN **PASS** · First beat **BLOCKED** (no ADMIN browser session for agent) · Phase **NOT CLOSED**

- Live: ADMIN=1 · beats=0 · PUBLISHED=0 · READY=0 · events=0 · `beat-audio` private
- No new architecture; REUSE Phase 1.7 admin UI + 1.5 Access Gate + 1.8A downloads
- Agent cannot complete create/upload/publish without Owner ADMIN login + MASTER file via UI
- Fixture (outside git): `../bitrymdym-fixtures/phase19-master-tone.wav` (5s tone WAV)
- Local uncommitted: admin nav „Panel administratora”; Phase 1.9 docs drift updates
- Next: Owner creates + publishes first PLATFORM beat → agent resumes live E2E

---

## 2026-09-26 — AUTH PRODUCTION CANONICAL URL FIX (IN PROGRESS)

**Status:** Code + Vercel env updated · **Supabase Auth Site URL = HUMAN OPERATOR REQUIRED** · Phase 1.9 still PARTIAL

- Canonical production origin: `https://bitrymdym.pl`
- Code: `getSiteUrl()` / `getAuthEmailRedirectTo()`; `signUp` passes `emailRedirectTo` → `/account`
- Production guard: `VERCEL_ENV=production` never falls back to `*.vercel.app`
- Vercel Production env: `NEXT_PUBLIC_SITE_URL=https://bitrymdym.pl` set
- Custom SMTP / branded sender: **OUT** (future Owner GO)
- Supabase Dashboard still required:
  - Site URL → `https://bitrymdym.pl`
  - Redirect allow-list: `https://bitrymdym.pl/**`, `https://www.bitrymdym.pl/**`, localhost, preview wildcards
- Deploy of this commit required before production signup sends BitRymDym redirects from app `emailRedirectTo`

---

## 2026-09-26 — PHASE 1.9 — DESIGN FREEZE APPROVED / IMPLEMENTATION IN PROGRESS

**Status:** DESIGN FREEZE **APPROVED / LOCKED** · IMPLEMENTATION **IN PROGRESS** · PRODUCTION BOOTSTRAP **PENDING** (not CLOSED)

- Candidate: Operator Production Enablement (OD-20 manual ADMIN + first PLATFORM beat + live E2E)
- Freeze: [PHASE_1_9_DESIGN_FREEZE.md](./phases/PHASE_1_9_DESIGN_FREEZE.md)
- Runbook: [PRODUCTION_BOOTSTRAP.md](./runbooks/PRODUCTION_BOOTSTRAP.md)
- No app/DB/bootstrap code; no migration; OD-20 unchanged
- Live baseline pre-bootstrap: ADMIN/PUBLISHED/READY/users/beats = 0
- Next: Human operator executes runbook → production verify → closeout
- FOLLOW-UP: stale drift in `PHASE_1_FOUNDATION.md` + root `README.md` (not fixed in this phase unless Owner expands docs GO)

---

## 2026-09-26 — PHASE 1.8A — CLOSED / LOCKED (production verified)

**Status:** **COMPLETE / CLOSED / LOCKED** @ `fd87f23` on `main` / `origin/main`

- Commit: `fd87f23` — `feat(downloads): complete phase 1.8a download productization`
- Push: COMPLETE → `origin/main`
- Production deploy: Vercel **success**; live marker Phase 1.8A on bitrymdym.pl / www / vercel.app
- Production Verify: **PASS** (homepage, sign-in/up, `/account/downloads` anon → sign-in gate, security smoke)
- Live Download E2E: **NOT VERIFIED** (`published_count=0`, `admin_count=0` / OD-20) — non-blocking
- Next: **COLD-START AUDIT (next Foundation candidate)**

---

## 2026-09-26 — PHASE 1.8A — DOCUMENTATION CLOSEOUT COMPLETE

**Status:** IMPLEMENTATION AUDIT PASS · DOCUMENTATION CLOSEOUT COMPLETE · **READY FOR OWNER REVIEW** (not CLOSED)

- Design Freeze: [PHASE_1_8A_DESIGN_FREEZE.md](./phases/PHASE_1_8A_DESIGN_FREEZE.md) — APPROVED / LOCKED
- OD-05 = 2 / UTC day · OD-06 = 4 / UTC day · OD-17 = signed URL SUCCESS → finalize event
- Flow: AUTH → AUTHZ → READY → RESERVATION (TTL 120s, not an event) → signed URL → FINALIZE → `beat_download_events`
- Audit: OD-17 / reservation / crash safety / concurrency / grants / RLS / security PASS; tests **84/84**
- Known non-blocking: no live RLS/concurrency integration tests; Live E2E NOT VERIFIED (`published_count=0`, `admin_count=0`)
- Homepage stale “Download OUT” copy corrected
- Phase **NOT CLOSED**; not committed / not pushed
- Next: OWNER REVIEW → COMMIT → PUSH → PRODUCTION VERIFY

---

## 2026-09-26 — PHASE 1.8A — IMPLEMENTATION FIX (OD-17 reservation)

**Status:** IMPLEMENTATION COMPLETE (fix) — uncommitted — **READY FOR IMPLEMENTATION AUDIT**

- Root cause addressed: provisional event-before-URL rejected
- Model: `beat_download_reservations` (ephemeral) ≠ `beat_download_events` (final OD-17)
- Flow: AuthZ → reserve → signed URL SUCCESS → finalize event
- Least-privilege: revoked anon/authenticated DML on events; reservations client-denied
- Dropped `claim_beat_download_slot`; RPCs service_role only
- Migration: `phase_1_8a_download_reservation` applied remote
- Phase **NOT CLOSED**

---

## 2026-09-26 — PHASE 1.8A — IMPLEMENTATION COMPLETE (not CLOSED)

**Status:** IMPLEMENTATION COMPLETE — local / uncommitted — **READY FOR IMPLEMENTATION AUDIT**

- Design Freeze: [PHASE_1_8A_DESIGN_FREEZE.md](./phases/PHASE_1_8A_DESIGN_FREEZE.md) — APPROVED / LOCKED
- Migrations: `phase_1_8a_download_events`, `phase_1_8a_claim_rpc_grants` (applied remote)
- Table: `beat_download_events` + RLS (own SELECT); claim RPC service_role only
- Config SSOT: `src/config/downloads.ts` (anon=2, user=4, UTC day)
- Access Gate REUSE: DOWNLOAD branch + atomic limit claim + event
- UI: Download CTA on `/beat/[id]`; Moje pobrane `/account/downloads`
- OD-05 / OD-06 / OD-17 CLOSED interim; OD-13 / OD-04 OUT
- Tests 59/59; lint / typecheck / build PASS
- Live Download E2E: **NOT VERIFIED** (empty catalog / no ADMIN)
- Phase **NOT CLOSED**; not committed / not pushed

---

## 2026-09-26 — PHASE 1.7 — COMPLETE / CLOSED / LOCKED

**Status:** COMPLETE / COMMITTED / PUSHED — `ed499ee` on `main` / `origin/main`

- Commit: `ed499ee` — `feat(admin): complete phase 1.7 platform content ops`
- Design Freeze: [PHASE_1_7_DESIGN_FREEZE.md](./phases/PHASE_1_7_DESIGN_FREEZE.md) — APPROVED / LOCKED
- Routes: `/admin`, `/admin/beats`, `/admin/beats/new`, `/admin/beats/[id]`
- REUSE: createPlatformBeat, updateBeatMetadata, uploadPlatformBeatAudio, lifecycle `DRAFT → PUBLISHED`, Access Gate PLAYBACK
- UI Publish gate: READY MASTER required; GAP-PUBLISH-READY server hard rule preserved
- Production: **GREEN / VERIFIED** (Vercel PASS)
- Production smoke: public/auth/routing/security/regression **PASS**
- Live Admin E2E: **NOT VERIFIED** — OD-20 / `admin_count=0` (non-blocking)
- Published Content E2E: **NOT VERIFIED** — `published_count=0` (non-blocking)
- Audit infrastructure GAP preserved; OD-04 … OD-18 remain OPEN
- Next: Cold-Start Audit for next Foundation candidate

---

## 2026-09-26 — PHASE 1.6 — COMPLETE / CLOSED / LOCKED

**Status:** COMPLETE / COMMITTED / PUSHED — `39be430` on `main` / `origin/main`

- Commit: `39be430` — `feat(beats): complete phase 1.6 playback surface`
- Design Freeze: [PHASE_1_6_DESIGN_FREEZE.md](./phases/PHASE_1_6_DESIGN_FREEZE.md) — APPROVED / LOCKED
- Routes: `/beats` (PUBLISHED-only catalog), `/beat/[id]` (PUBLISHED-only detail + PlaybackShell)
- Playback via existing Access Gate (`PLAYBACK` only); signed PLAYBACK URL
- Hard OUT: DOWNLOAD UI / limits / counters / audit; Quick Take; waveform engine
- Production: **GREEN / VERIFIED**
- OD-04 … OD-18 remain OPEN
- Downloads remain **PARTIAL**; Quick Take **NOT STARTED**
- Next: Phase 1.7 Cold-Start candidates → Owner Design Freeze selection

---

## 2026-09-26 — PHASE 1.5 — COMPLETE / LOCKED

**Status:** COMPLETE / COMMITTED / PUSHED — `0ec0be0` on `main` / `origin/main`

- Commit: `0ec0be0` — `feat(audio): complete phase 1.5 private storage and access gate`
- Design Freeze: `0e5c491`
- Migration `20260925220000_phase_1_5_audio_storage.sql` / live `phase_1_5_audio_storage`
- Private bucket `beat-audio`; `beat_audio_assets`; Access Gate; signed URL PLAYBACK 120s / DOWNLOAD 300s
- Unit 28/28; live Storage/RLS/signed URL PASS; pre-commit audit PASS
- OD-12 remains OPEN; player/limits/Quick Take/community/payments out of scope
- Next: Phase 1.6 Cold-Start Audit

---

## 2026-09-26 — PHASE 1.5 — PRIVATE AUDIO STORAGE + ACCESS GATE (IMPLEMENTATION)

**Status:** superseded by COMPLETE / LOCKED entry above (`0ec0be0`)

- Migration `20260925220000_phase_1_5_audio_storage.sql` applied live (`phase_1_5_audio_storage`)
- Private bucket `beat-audio`; table `beat_audio_assets`; no audio columns on `beats`
- Object keys opaque `.bin`; interim MIME allow-list + 50 MiB (OD-12 OPEN)
- Access Gate: anonymous / authenticated / admin upload paths; signed URL PLAYBACK 120s / DOWNLOAD 300s
- ADMIN PLATFORM upload only; USER/MODERATOR upload DENY; MODERATOR download DENY
- Unit 28 PASS; live Storage/RLS/signed URL PASS; lint / typecheck / build PASS
- Out of scope: player, limits, Quick Take, community upload, watermark, payments

---

## 2026-09-26 — PHASE 1.5 — DESIGN FREEZE LOCKED

- Commit: `0e5c491` — `docs(phase-1.5): freeze private audio storage architecture`
- Document: `docs/phases/PHASE_1_5_DESIGN_FREEZE.md`
- Pushed to `origin/main`

---

## 2026-09-25 — PHASE 1.4 — BEATS DOMAIN FOUNDATION (COMPLETE / LOCKED)

**Status:** COMPLETE / COMMITTED / PUSHED — `6cb1e9a` on `main` / `origin/main`

- Migration `20260925130000_phase_1_4_beats.sql` applied live on `rzzxrgcdogkybkiidqgw` (additive; no `db reset`)
- `beat_status` / `beat_ownership_type` enums; `public.beats` metadata table (no audio columns)
- Ownership integrity (PLATFORM⇒null owner; USER⇒required owner); status transition guards; prefer ARCHIVE
- RLS: published public read; admin write; moderator review path; ownership/status protected
- Domain: `Beat` / `BeatStatus` / `BeatOwnershipType`; central validator + transitions; `src/lib/beats/*`
- Unit 21/21 PASS; live RLS PASS; lint / typecheck / build PASS
- Docs: `BEATS.md` + PROJECT_STATE / PHASE_1 / SYSTEM_ARCHITECTURE / AUTHORIZATION / README
- Out of scope: Storage, player, downloads, Quick Take, community upload, payments
- OD-04…OD-18 remain OPEN (OD-12 OPEN)
- Next: Phase 1.5 Design Freeze (NOT STARTED)

---

## 2026-09-25 — PHASE 1.3 — DOCUMENTATION LOCK CLOSEOUT

- Docs aligned to canonical `main` @ `efe3f71`
- Phase 1.3 marked **COMPLETE / LOCKED**
- Ready for Phase 1.4 planning (no implementation in this closeout)

---

## 2026-09-25 — PHASE 1.3 — COMMIT + MAIN PROMOTION

- Commit: `efe3f71` — `feat(auth): complete phase 1.3 identity and rls`
- Branch: `cursor/phase-1-3-auth` pushed; fast-forward promoted to `main` / `origin/main`
- Identity / Auth foundation: profiles, roles, account levels, permissions, authorization helpers
- RLS + privilege escalation protection
- Live Supabase verification PASS (project `rzzxrgcdogkybkiidqgw`)
- Excluded from commit: `.env.local`, `.agents/`, `.cursor/`, `skills-lock.json`, `supabase/.temp/`

---

## 2026-09-25 — PHASE 1.3 — FINAL PRE-COMMIT AUDIT PASS

- Git: `.env.local` ignored; no secrets in diff
- Code/security review PASS (Role ≠ AccountLevel; no auto-admin; service role server-only)
- Lint / typecheck / unit / build PASS
- Status: **OWNER REVIEW COMPLETE** — **READY TO COMMIT** (commit/push not performed)

**Commit hygiene notes (non-blocking):** decide whether to include `.agents/`, `skills-lock.json`, `.cursor/mcp.json`, and `scripts/_live_verify_phase13.mjs` in the Phase 1.3 commit; `supabase/.temp/` now gitignored.

---

## 2026-09-25 — PHASE 1.3 — LIVE SUPABASE VERIFICATION PASS

- Supabase MCP configured (`.cursor/mcp.json` + user mcp) for project `rzzxrgcdogkybkiidqgw`
- MCP authenticated; identity migration applied via `apply_migration` (no `db reset`)
- Live Auth: profile auto-create → `USER` + `BEGINNER_RAPPER`
- Live RLS: own read ALLOW; cross-user DENY; display_name ALLOW; role/account_level escalation DENY
- Permission catalog writes DENY; Auth sign-in / session / sign-out PASS
- Unit 6/6 PASS; lint / typecheck / build PASS
- Status: **READY FOR OWNER REVIEW** (not locked; commit/push not performed)

---

## 2026-09-25 — PHASE 1.3 — CLI ACCESS RECOVERY ATTEMPT

- Diagnosed: CLI credential in Windows Credential Manager belongs to a different Supabase account
- Visible projects: unrelated only (not BitRymDym)
- `supabase link --project-ref rzzxrgcdogkybkiidqgw` → privilege denied
- Agent shell is non-TTY → interactive `supabase login` impossible
- Blocker narrowed to: **SUPABASE_ACCESS_TOKEN** from BitRymDym-owning account
- Migration / live Auth/RLS: still not executed

---

## 2026-09-25 — PHASE 1.3 — LIVE SUPABASE VERIFICATION (PARTIAL)

- `.env.local` created locally (gitignored) for project `rzzxrgcdogkybkiidqgw`
- Auth API health: OK
- Identity migration: **NOT APPLIED** (CLI link denied for this project; no DB password / Management token)
- Live Auth/RLS suite: **NOT RUN**
- Result: **BLOCKED** — awaiting migration apply path from Owner

**Static security audit:** PASS · **Unit:** PASS · **Live RLS:** BLOCKED

---

## 2026-09-25 — PHASE 1.3 — LIVE SUPABASE VERIFICATION ATTEMPT

- Runtime check performed: `.env.local` absent; no BitRymDym project linked
- Local Docker Supabase unavailable
- Unrelated CLI-visible org projects: not used
- Migration / live Auth / live RLS: **not executed**
- Result: **SUPABASE RUNTIME UNAVAILABLE** / **BLOCKED**

**Static security audit:** PASS · **Unit:** PASS · **Live RLS:** BLOCKED

---

## 2026-09-25 — PHASE 1.3 — OWNER DECISIONS CLOSED

- OD-19 closed
- BEGINNER_RAPPER approved as signup default
- OD-20 closed
- no automatic first-admin mechanism
- manual/operator-controlled admin bootstrap
- live Supabase verification remains pending

**Static security audit:** PASS · **Live RLS:** BLOCKED (credentials)

---

## 2026-09-25 — PHASE 1.3 — AUTH + USERS / ROLES / PERMISSIONS / PROFILES

**Status:** PENDING OWNER REVIEW

- Supabase Auth integration (sign-up / sign-in / sign-out) — minimal UI
- `profiles` + trigger on Auth user create (default role `USER`)
- Roles: ADMIN / MODERATOR / USER; Account levels: working SSOT names
- Permission catalog seeded from SSOT §36 examples; role mapping ADMIN + MODERATOR
- Server authorization helpers (`requireUser` / `requireRole` / `requirePermission`)
- RLS + privilege-escalation trigger in SQL migration
- Unit tests for authorization helpers
- Docs: AUTHORIZATION.md; OD-19 / OD-20 initially OPEN (closed in later entry same day)
- Live Supabase project credentials: not configured in agent environment

**Not included:** Beats, tracks, audio, Quick Take, downloads, payments, admin panel, auto-admin bootstrap.

---

## 2026-09-25 — PHASE 1.2 — APPLICATION SCAFFOLD / TECHNICAL BOOTSTRAP

**Status:** LOCKED (Owner APPROVED)

- Next.js 16 App Router + TypeScript + Tailwind CSS v4
- shadcn/ui baseline (minimal `Button` + utils) as technical base only
- BitRymDym Design System foundation (`src/styles/tokens.css`, `src/components/brand`)
- Supabase client integration stubs (`src/lib/supabase/*`) — no schema / Auth / RLS / Storage
- `.env.example` placeholders only
- Base application shell `/` + `loading` / `error` / `not-found`
- Domain type foundation (`Role` ≠ `AccountLevel`)
- Validation: lint PASS, typecheck PASS, build PASS
- Documentation updated (PROJECT_STATE, PHASE_1, APPLICATION_SCAFFOLD, architecture)

**Not included:** Auth, Users, Roles, Permissions, Profiles, beats, player, Quick Take, downloads, payments, production Supabase setup.

---

## 2026-09-25 — Foundation Documentation Baseline LOCKED

- OD-01 closed
- OD-02 closed
- OD-03 closed
- System Architecture documented
- Project State established
- Documentation Continuity Rule established
- Foundation documentation approved by Owner
- No application implementation started

**Foundation Documentation Baseline:** LOCKED
**Application implementation:** not started.

---

## 2026-09-25 — Foundation documentation closeout (pre-lock)

- OD-01 CLOSED / ACCEPTED (frontend stack)
- OD-02 CLOSED / ACCEPTED (Next.js application server)
- OD-03 CLOSED / ACCEPTED (Supabase infrastructure)
- System architecture baseline udokumentowany (`docs/architecture/SYSTEM_ARCHITECTURE.md`)
- Documentation Continuity Rule ustanowiona (`docs/DOCUMENTATION_CONTINUITY.md`)
- Project State utworzony (`docs/PROJECT_STATE.md`)
- Aktualizacja OPEN_DECISIONS, DECISION_LOG, SSOT (zgodność z OD-01–03), PHASE_1, docs README

# SESSION_BRIDGE — skrót ciągłości sesji (BitRymDym)

**Status:** ACTIVE (GO-1)
**Rola:** operacyjny rejestr przekazywania kontekstu wykonawczego między sesjami Cursor / ChatGPT.
**Owner:** Prezes Dawid

## Ważne ograniczenie

**SESSION_BRIDGE nie jest SSOT** dla living tip, stanu wdrożenia (deploy), NEXT UNIT ani stanu produkcji.
Kanoniczne źródło tip / deploy / NEXT / SESSION VERIFY / connections: **[PROJECT_STATE.md](../PROJECT_STATE.md) §2 (+ §2c)**.

Nie kopiuj tu całych raportów, architektury ani decyzji produktowych, które mają własne kanoniczne źródła. Przy sprzeczności: wskaż konflikt i źródło weryfikacji — nie rozstrzygaj domysłem.

ECC `save-session` / magazyn poza repozytorium / pamięć czatu **nie** są kanonicznym źródłem ciągłości wiedzy.

---

## 0. Hierarchia (skrót)

1. Jawne GO Ownera
2. [AGENTS.md](../../AGENTS.md)
3. Living tip / deploy / NEXT → [PROJECT_STATE.md](../PROJECT_STATE.md) §2
4. Decyzje → [OPEN_DECISIONS.md](../decisions/OPEN_DECISIONS.md) · [DECISION_LOG.md](../decisions/DECISION_LOG.md)
5. Cold-start → [FINAL_COLD_START_HANDOFF.md](../FINAL_COLD_START_HANDOFF.md) · [MASTER_HANDOFF.md](../MASTER_HANDOFF.md) · [DOCUMENTATION_CONTINUITY.md](../DOCUMENTATION_CONTINUITY.md)
6. Ten plik — skrót ≤15 `EXECUTED` + snapshot WIP + open GO sesji
7. ECC → [ECC_CURSOR_WORKFLOW.md](./ECC_CURSOR_WORKFLOW.md) (pomocnicze)

---

## 1. Cold-start (nowa sesja)

**Trigger Cursor:** polecenie Ownera **„Kontynuuj projekt”** (lub równoważne wznowienie) → wykonaj tę sekcję od razu, bez pytania o osobny audyt startowy. Szczegóły fraz: reguła `.cursor/rules/bitrymdym-ssot-over-ecc.mdc` (Frazy sesji Cursor).

1. Odczytaj `AGENTS.md` i obowiązujące instrukcje repozytorium (autonomia, Sacred WIP, zasady architektury).
2. Odczytaj [FINAL_COLD_START_HANDOFF.md](../FINAL_COLD_START_HANDOFF.md).
3. Odczytaj [PROJECT_STATE.md](../PROJECT_STATE.md), w szczególności **§2** (living tip / deploy / NEXT).
4. Odczytaj **ten** plik (`SESSION_BRIDGE.md`) — §4 (ostatnie `EXECUTED` / `BLOCKED`), §5 (open GO / STOP), §2 (snapshot = **wskazówka**, nie SSOT).
5. Sprawdź świeży `git status` + `git rev-parse HEAD` / `origin/main` + staging — **zachowaj** istniejący dirty WIP. **Nie** czyść / stash / reset / restore niepowiązanego WIP.
6. Ścieżki chronione = **status-only** (bez odczytu treści / diff / wyszukiwania / hasha / historii): Sacred `src/lib/takes/recording-eligibility-service.ts` · `src/components/studio/studio-editor.tsx` · `src/lib/studio/studio-service.ts` · `docs/architecture/SYSTEM_ARCHITECTURE.md`.
7. Przed planowaniem nowych zmian: [OPEN_DECISIONS.md](../decisions/OPEN_DECISIONS.md) · [architecture/REUSE_SSOT_MAP.md](../architecture/REUSE_SSOT_MAP.md) · skill **`architecture-and-reuse`** (gdy dostępny) — MODIFY BEFORE CREATE / ONE CANONICAL.
8. Ustal warstwy osobno: **FACT** (Git / dowód w repo) · **INFERENCE** · **NOT VERIFIED** · **BLOCKED**. Tip/deploy/NEXT wyłącznie z PROJECT_STATE §2 — **żywy Git wygrywa** nad przestarzłym wierszem §2.1/§5 tego pliku.
9. Rozróżnij zadania: ukończone (dowód) · częściowe (`PARTIAL` / dirty bez commita) · nieuruchomione · zablokowane (`BLOCKED` / brak GO). **Nie** uznawaj ukończenia wyłącznie na podstawie starego raportu czatu lub samego wiersza `EXECUTED` bez zgodności z Git/dowodem w `outcome` / `evidence`.
10. Ustal **jeden** konkretny, dozwolony następny krok. Zatrzymaj się przed implementacją, jeśli wymaga osobnego GO (chroniony / mixed WIP, destrukcja, produkcja, archiwizacja §4, tip w PROJECT_STATE).
11. Zwróć krótki raport cold-startu (HEAD · dirty/Sacred status-only · NEXT/STOP · jeden następny krok · otwarte GO). Bez nowego szerokiego audytu produktu.

Opcjonalnie (po powyższym):
[handoffs/MASTER_START_PROMPT_CURSOR_PL.md](../handoffs/MASTER_START_PROMPT_CURSOR_PL.md) ·
[handoffs/MASTER_START_PROMPT_CHATGPT_PL.md](../handoffs/MASTER_START_PROMPT_CHATGPT_PL.md)

---

## 2. Snapshot WIP (bez diffów / sekretów)

Aktualizuj po `git status`, przed nowym zadaniem. **Nie** wklejaj treści diffów, `.env`, tokenów ani PII.

Snapshot poniżej = stan z **jednej** kontroli odczytowej. **Nie** jest trwałym SSOT WIP — przed każdym zadaniem **ponów** `git status`. Całego dirty WIP **nie** przypisuj do jednego GO.

| when (ISO) | branch | HEAD (short) | staged | unstaged (tracked) | untracked | areas (high level) | sacred | notes |
|------------|--------|--------------|--------|--------------------|-----------|--------------------|--------|-------|
| 2026-10-28T22:45:00+01:00 (unit 4 punch/metro smoke) | main | `d25aa29` start | 0 | ~151 | ~326 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | start tip `d25aa29`=`origin/main`; kod DAW `01629f5` ancestor; Loop+Metro toggle **PASS**; Count-in/punch UI **widoczne**; REC→Stop→Zachowaj finalize **200** place **201**; cleanup DELETE clip **200**; TAKE `507d9cc2-…` UI 19.0s; projekt `178e902d-…`; ucha/punch-ON/dpl_* **NOT VERIFIED**; last verified `dpl_D5QpniJpUc75A1vBUiiffvqRzo3P` @ `7438de2`; allowlista: audit+CHANGELOG+PS+bridge; Sacred/Studio PRESERVE · OD-15 OPEN · §4 EXECUTED=15 · NEXT unit 5 jog = osobne GO · ≠ GREEN |
| 2026-10-28T21:10:00+01:00 (P0 unit 2 mix-working apply+restore) | main | `a29fa31` start | 0 | ~151 | ~326 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | start tip `a29fa31`=`origin/main`; kod `5043b5e` ancestor; apply mute Wokal HTTP **200** v64→65; restore checkpoint **200** → v66; Wokal unmuted; Bit/Keep OK; projekt `178e902d-…` v66; kod produktu nietknięty; last verified `dpl_D5QpniJpUc75A1vBUiiffvqRzo3P` @ `7438de2`; allowlista: audit+CHANGELOG+PS+bridge; Sacred/Studio PRESERVE · OD-15 OPEN · §4 archive-20 + MIX-WORKING-APPLY · NEXT unit 4 punch/metro · ≠ GREEN |
| 2026-10-28T20:54:00+01:00 (P0 unit 1 live Play) | main | `60d59a3` start | 0 | ~151 | ~326 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | start tip `60d59a3`=`origin/main`; kod `5043b5e` ancestor; Catalog place + Zatwierdź + live Play **PASS**; set_scratch **200**; Record został; leftover **0**; projekt `178e902d-…` v63; live cue=`transport.seek`; bake=`resolveScratchSourceMs`; schedule nie czyta `scratchCueMs`; AudioContext CDP **NOT VERIFIED**; ucha **NOT VERIFIED**; last verified `dpl_D5QpniJpUc75A1vBUiiffvqRzo3P` @ `7438de2`; allowlista docs: CHANGELOG+PS+bridge; Sacred/Studio PRESERVE · OD-15 OPEN · §4 EXECUTED=15 · ≠ GREEN |
| 2026-10-28T20:45:00+01:00 (dpl/alias SHA bind) | main | `7438de2` start | 0 | ~151 | ~326 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | start tip `7438de2`=`origin/main`; kod `5043b5e` ancestor; Vercel **`dpl_D5QpniJpUc75A1vBUiiffvqRzo3P`** Ready @ `7438de2`; unique `bitrymdym-gclyvcvdj-…`; GH **`7395502484`** success; **ALIAS VERIFIED**; HTTP copy/place z UI **PASS** (bez nowego smoke); allowlista docs: CHANGELOG+PS+bridge; Sacred/Studio PRESERVE · OD-15 OPEN · §4 archive-19 + DPL-ALIAS-BIND · ≠ GREEN |
| 2026-10-28T20:35:00+01:00 (bake --play ucha) | main | `7e14a54` start | 0 | ~151 | ~326 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | start tip `7e14a54`=`origin/main`; kod `5043b5e`; polarność **PASS** · PlaySync ×4 **PLAY PASS** (exit 0) · ucha **NOT VERIFIED**; temp WAV cleanup; allowlista docs: CHANGELOG+PS+bridge; skrypt **nie** duplikowany; Sacred/Studio PRESERVE · OD-15 OPEN · §4 archive-18 + BAKE-LISTEN-PLAY · ≠ GREEN |
| 2026-10-28T20:20:00+01:00 (UI Zatwierdź stan set_scratch move) | main | `5043b5e` start | 0 | ~151 | ~326 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | start tip `5043b5e`=`origin/main`; Catalog place → Record został → Zatwierdź stan → PATCH set_scratch **200** → move **200** bez CAS/F5; leftover **0**; Bit/Wokal Keep OK; projekt `178e902d-…` v50; GH **`7394804255`** @ `5043b5e` success · unique `bitrymdym-1svy8dp50-…`; allowlista docs: CHANGELOG+PS+bridge; Sacred/Studio PRESERVE · OD-15 OPEN · §4 EXECUTED=15 · ≠ GREEN |
| 2026-10-28T20:06:00+01:00 (lift lastScratchClipId) | main | `237c12e` start | 0 | ~151 | ~326 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | start tip `237c12e`=`origin/main`; GO editor; lastScratchClipId lift + preferRecord helpers; vitest **96/96**; editor +18/−1; panel +6/−4; context +14; UI Catalog→Zatwierdź→move NOT VERIFIED; allowlista: editor+panel+context+4 testy+CHANGELOG+PS+bridge; Sacred/service PRESERVE · OD-15 OPEN · §4 archive-17 + SCRATCH-LIFT-ID · ≠ GREEN |
| 2026-10-28T10:40:00+01:00 (leftover + set_scratch API) | main | `4187ad3` start | 0 | ~151 | ~326 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | start tip `4187ad3`=`origin/main`; DELETE Sample `8273aeeb` + Scratch `bced0aa2` **200** leftover **false**; Bit/Wokal Keep OK; projekt v27; set_scratch→move API **PASS** (place TAKE → PATCH reverse → move bez CAS); UI Zatwierdź stan **NOT VERIFIED** (`lastScratchClipId` / catalog 0); last GH `7381694008` @ 56c7f2f; allowlista docs: CHANGELOG+PS+bridge; Sacred/Studio PRESERVE · OD-15 OPEN · §4 archive-16 + LEFTOVER-SET-SCRATCH · ≠ GREEN |
| 2026-10-28T10:34:00+01:00 (Owner docRef A+B smoke) | main | `56c7f2f` start | 0 | ~151 | ~326 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | start tip `56c7f2f`=`origin/main`; A marker→clip-move **PASS** (v17→18, move 18→v19) bez CAS; B Sample create→clip-move **PASS** (track→v20, move 20→v21) bez CAS; cleanup markers n=0 v22; Keep TAKE start 2ms; BEAT_REF OK; leftover puste Scratch `bced0aa2` + Sample `8273aeeb`; set_scratch→move **NOT VERIFIED**; GH `7381694008` @ 56c7f2f · `7381581476` @ 1f8f776 success; allowlista docs: CHANGELOG+PS+bridge; Sacred/Studio PRESERVE · OD-15 OPEN · §4 EXECUTED=15 · ≠ GREEN |
| 2026-10-28T10:27:00+01:00 (Scratch/track editor docRef) | main | `1f8f776` start | 0 | ~152 | ~326 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | start tip `1f8f776`=`origin/main`; Scratch persist + SAMPLE/SCRATCH create → `ackDocumentVersion` / parent `applyAckedDocumentVersion`; vitest **79/79**; panel +3/−4; editor nietknięty; Sacred/service PRESERVE · OD-15 OPEN · §4 archive-15 + SCRATCH-TRACK-DOCREF · ≠ GREEN |
| 2026-10-28T10:25:00+01:00 (markers editor docRef sync) | main | `ad28be2` start | 0 | ~152 | ~326 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | start tip `ad28be2`=`origin/main`; GO editor; ack markerów → `applyPersistedDoc` / docRef; vitest markers+CAS **71/71**; editor izolacja OK (+21, bez CRLF); Sacred/service PRESERVE · OD-15 OPEN · §4 EXECUTED=15 · ≠ GREEN |
| 2026-10-28T10:20:00+01:00 (bake listen polarity closeout) | main | `aacaada` start | 0 | ~152 | ~326 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | start tip `aacaada`=`origin/main`; code `fadb2b0`; polarność PASS · PLAY PASS ×4 · ucha NOT VERIFIED; allowlista: `_bake-listen-scratch-wav.ts`+CHANGELOG+PS+bridge; Sacred/Studio editor/service PRESERVE · OD-15 OPEN · §4 archive-14 + BAKE-LISTEN · ≠ GREEN |
| 2026-10-28T10:12:00+01:00 (Catalog place Owner UI PASS) | main | `49c2036` start | 0 | ~152 | ~326 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | start tip `49c2036`=`origin/main`; code `fadb2b0`; UI Kopiuj i umieść → Gotowe; leftover 0; allowlista docs: CHANGELOG+PS+bridge; Sacred/Studio editor/service PRESERVE · OD-15 OPEN · §4 EXECUTED=15 · ≠ GREEN |
| 2026-10-28T10:00:00+01:00 (Owner markers re-smoke PASS) | main | `30a9bc2` docs | 0 | ~154 | ~325 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | start tip `30a9bc2`=`origin/main`; code `fadb2b0`; GH `7381109228` @ 30a9bc2 · `7381095797` @ fadb2b0 success; allowlista docs: CHANGELOG+PS+bridge; Sacred/Studio editor/service PRESERVE · OD-15 OPEN · §4 archive-13 + RESMOKE · ≠ GREEN |
| 2026-10-28T09:58:00+01:00 (markers stale CAS version tip) | main | `fadb2b0` code | 0 | ~154 | ~325 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | code tip `fadb2b0`=`origin/main`; parent `7dc3db4`; vitest markers **10/10**; allowlista docs: CHANGELOG+PS+bridge; Sacred/Studio editor/service PRESERVE · OD-15 OPEN · §4 EXECUTED=15 |
| 2026-10-28T09:45:00+01:00 (Studio markers A3/P7 lite closeout) | main | `9fc7f6e` code | 0 | ~154 | ~325 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | code tip `9fc7f6e`=`origin/main`; MCP apply `20261028084022`/`studio_markers_cas`; GH `7380825799` success; vitest markers **7/7**; allowlista docs: CHANGELOG+PS+bridge; Sacred/Studio editor/service PRESERVE · OD-15 OPEN · §4 archive-12 + MARKERS |
| 2026-10-28T09:40:00+01:00 (www Metro/Loop Play + TAKE listen) | main | `c52f38c` start | 0 | ~154 | ~325 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | start tip `c52f38c`=`origin/main`; GH `7380550674` success; AudioContext running; TAKE ścieżka PASS; ucha NOT VERIFIED; allowlista: listen audit+CHANGELOG+PS+bridge §2; Sacred/Studio PRESERVE · OD-15 OPEN · §4 EXECUTED=15 (bez nowego wiersza) |
| 2026-10-28T09:25:00+01:00 (www Loop/Metro chrome) | main | `c3b8063` start | 0 | ~154 | ~325 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | start tip `c3b8063`=`origin/main`; GH `7380377160` success; www Loop/Metro runtime; `dpl_*`/SHA bind NOT VERIFIED; allowlista docs: audit+CHANGELOG+PS+Keep follow-up+bridge §2; Sacred/Studio PRESERVE · OD-15 OPEN · §4 EXECUTED=15 (bez nowego wiersza) |
| 2026-10-28T09:20:00+01:00 (Keep smoke Dawid) | main | `26db634` start | 0 | ~154 | ~325 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | start tip `26db634`=`origin/main`; Keep smoke PASS; allowlista docs: audit+CHANGELOG+PS+bridge; Sacred/Studio PRESERVE · OD-15 OPEN |
| 2026-10-28T09:06:00+01:00 (Studio vs DAW queue P0–P1) | main | `3166ae2` docs / `01629f5` code | 0 | ~154 | ~325 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | start tip `6c97ef8`; code `01629f5`; docs `3166ae2`; allowlista committed; Sacred/SYSTEM_ARCHITECTURE PRESERVE · OD-15 OPEN |
| 2026-10-28T08:46:00+01:00 (Keep Take UX po Stop, P5.6) | main | `f4e6b4a` start | 0 | ~154 | ~325 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | living tip `f4e6b4a`=`origin/main` (ls-remote); allowlista: panel + p5-6 test + CHANGELOG + bridge; Sacred/Studio editor/service PRESERVE · OD-15 OPEN |
| 2026-10-28T09:34:00+01:00 (Git closeout catalog place + Scratch WAV) | main | `da2a48f` code | 0 | ~154 | ~325 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | start tip `d973957` verified; test `da2a48f`; allowlista docs: audit+CHANGELOG+PS+bridge; `_catalog-place-user-e2e.mjs` **nie** commit; Sacred/Studio/mix-working PRESERVE |
| 2026-10-28T08:28:00+01:00 (USER catalog copy E2E) | main | `5b2fceb` | 0 | ~154 | ~326 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | tip `5b2fceb`=`origin/main` (`ls-remote`); allowlista docs: audit+CHANGELOG+PS+bridge; one-off script **nie** commit; Sacred/Studio PRESERVE |
| 2026-10-28T09:18:00+01:00 (Git closeout archive+mix+bake) | main | `c58b090` | 0 | ~154 | ~325 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | tip `c58b090`=`origin/main` (`ls-remote`); docs archive `4c2a085` · bake test `c58b090`; editor **nie** stage (CRLF rewrite) · Sacred PRESERVE · mix-working untracked PRESERVE |
| 2026-10-28T08:15:00+01:00 (SB archive-9 + history wiring + scratch bake verify) | main | `c1c7e21` | 0 | ~170 | ~334 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | tip `c1c7e21`=`origin/main` (verified); archive 15→13; history control w dirty editor (A3.5 only) · Sacred PRESERVE · C BLOCKED |
| 2026-10-28T08:05:00+01:00 (Mix Working restore + Scratch bake) | main | `41668c0` start | 0 | ~170 | ~334 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | start tip `41668c0`=`origin/main`; A3.5 na cienki service · persist Scratch PRESERVE · dirty editor / Sacred PRESERVE · C BLOCKED |
| 2026-10-28T07:50:00+01:00 (Scratch persist isolation, po kodzie) | main | `6014556` | 0 | ~170 | ~334 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | code SHA `6014556` parent `ba18150`; allowlista docs: audit+CHANGELOG+PS+bridge; Sacred / dirty editor / mix-working PRESERVE · service **bez** mix-working-apply |
| 2026-10-28T06:55:00+01:00 (Scratch reverse+CAS, pomiar lokalny) | main | `bb4857d` | 0 | ~170 | ~334 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | `HEAD`=`origin/main`=`bb4857d` (`ls-remote`); allowlista: engine/scratch/CAS/service izolowane + docs; Sacred / dirty editor PRESERVE · studio-service mix-working na końcu nietknięte |
| 2026-10-28T06:16:00+01:00 (catalog copy E2E, pomiar przed commit) | main | `3b8214b` | 0 | ~166 | ~332 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | `HEAD`=`origin/main`=`3b8214b` (`ls-remote`); allowlista: catalog-originals + catalog-copy-service + copy route + docs; Sacred/Studio PRESERVE |
| 2026-10-28T00:12:00+01:00 (catalog content sniff, pomiar przed commit) | main | `fac551a` | 0 | ~166 | ~332 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | `HEAD`=`origin/main`=`fac551a` (`ls-remote`); allowlista: audio-validation + catalog-originals + backup re-export + copy route + docs; Sacred/Studio PRESERVE |
| 2026-10-28T00:10:00+01:00 (catalog live probe, pomiar przed docs commit) | main | `6f3a728` | 0 | ~166 | ~332 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | `HEAD`=`origin/main`=`6f3a728` (`ls-remote`); porcelain 488 hash `cbc18f20…`; allowlista: probe audit + apply NEXT + CHANGELOG + PS + bridge; Sacred/Studio PRESERVE |
| 2026-10-27T23:57:00+01:00 (catalog prod apply, pomiar przed docs commit) | main | `0af0dc3` | 0 | ~166 | ~332 | remaining dirty — **nie** przypisuj | path `M` PRESERVE | `HEAD`=`origin/main`=`0af0dc3` (`ls-remote`); allowlista: apply audit + CHANGELOG + PS + bridge + gates + kontrakt §13 + REUSE; Sacred/Studio PRESERVE |
| 2026-10-27T23:50:00+01:00 (Gates A/B/C, pomiar przed docs commit) | main | `5a6bc55` | 0 | ~166 | ~332 | catalog already committed; remaining dirty — **nie** przypisuj | path `M` PRESERVE | porcelain hash przed docs `e0f4456f…` (pre-catalog); catalog commit `5a6bc55`; allowlista docs: audit+CHANGELOG+PS+bridge; Sacred/Studio PRESERVE |
| 2026-10-27T23:25:00+01:00 (Gates 0–3 archive, pomiar przed tym zapisem) | main | `bde3009` | 0 | ~166 | ~332 | pozostałe dirty — **nie** przypisuj do tego GO | path `M` PRESERVE | porcelain hash przed edycją `43c60883…`; `HEAD`=`origin/main`=`bde3009` (`ls-remote`); allowlista tego unitu: `SESSION_BRIDGE.md` + `CHANGELOG.md`; `PROJECT_STATE` nietknięty w micro-commit archiwum; tip SSOT = PROJECT_STATE |
| 2026-10-27T22:50:51+01:00 (Unit 2 closeout, pomiar przed tym zapisem) | main | `0449410` | 0 | 166 | 332 | pozostałe dirty — **nie** przypisuj do tego GO | path `M` PRESERVE | porcelain=498 poza allowlistą hash `bbd0660c…`; po zapisie ten plik + `CHANGELOG` `M` → porcelain=500 / unstaged 168; indeks pusty; `HEAD`=`origin/main`=`0449410` (`ls-remote`); `PROJECT_STATE` czysty (Unit 1 @ `0449410`, nie edytowany); tip SSOT = PROJECT_STATE |
| 2026-10-27T22:21:09+01:00 (HISTORY · session close) | main | `92a1262` | 0 | 168 | 332 | pozostałe dirty — **nie** przypisuj do tego GO | path `M` PRESERVE | HISTORY snapshot przed tipem `0449410` (łańcuch: `92a1262` · `332336c` · `a1b84f6` · `0449410`) |
| 2026-10-27T21:25:48+01:00 (HISTORY · session close) | main | `7897037` | 0 | 169 | 332 | docs≈188 · … | path `M` PRESERVE | HISTORY snapshot przed tipem `92a1262` (łańcuch: `2d872e5` · `92a1262`) |
| 2026-10-27T20:12:12+01:00 (HISTORY · reliability pass) | main | `8b4235a` | 0 | 170 | 332 | docs≈188 · … | path `M` PRESERVE | HISTORY snapshot przed tipem `7897037` |
| 2026-10-27T14:17:35+01:00 (HISTORY · post A–D snapshot) | main | `fa5b7ca` | 0 | ~168 | ~332 | docs≈186 · … | path `M` PRESERVE | HISTORY snapshot przed tipem `8b4235a` (już na `main`: `1c2abd2` · `c7fbaf3` · `8b4235a`) |
| 2026-10-27T13:57:00+01:00 (HISTORY · kontrakt A–D pre-commit) | main | `db435ed` | 0 | ~168 | ~332 | docs≈186 · … | path `M` PRESERVE | HISTORY snapshot przed tipem `fa5b7ca` (A–D commit); tip then GO-5G-Q/R |
| 2026-10-27T11:20:30+01:00 (HISTORY · GO-5G-O tip reconcile) | main | `d05aa4e` | 0 | ~168 | ~332 | docs≈186 · … | path `M` PRESERVE | HISTORY snapshot przed tipem `db435ed` (commit Q / push R) |
| 2026-10-27T10:45:56+01:00 (HISTORY · GO-5G-H refresh) | main | `d462b22` | 0 | ~168 | ~332 | docs≈186 · … | path `M` PRESERVE | HISTORY snapshot przed tipem `d05aa4e` (parent bridge commit `d462b22`) |
| 2026-10-27T09:49:43+01:00 (HISTORY · gap fill) | main | `03d889a` | 0 | ~169 | ~332 | docs≈187 · … | path `M` PRESERVE | HISTORY snapshot przed pushem tipu `d462b22` |

**Sacred WIP (path-only):** `src/lib/takes/recording-eligibility-service.ts`
— nigdy nie czytaj / nie wyszukuj / nie diffuj / nie haszuj / nie przekazuj subagentom (`AGENTS.md`). W tabeli: tylko obecność w `git status`, bez treści.

### 2.1 Tip / deploy — ostatni znany stan (datowany; tip SSOT = PROJECT_STATE)

Kontrola `2026-10-28T22:45+01:00` (`git rev-parse HEAD` + `ls-remote`):

| Źródło | Wartość | Uwaga |
|--------|---------|--------|
| Lokalny `HEAD` (przed tym commit) | `d25aa29` | start `d25aa29a23a327b1faff98562c644463073e5878` = `origin/main`; kod DAW `01629f5` ancestor |
| Last independently verified deploy | **`dpl_D5QpniJpUc75A1vBUiiffvqRzo3P`** Ready @ `7438de2` ancestor · unique `bitrymdym-gclyvcvdj-…` · GH **`7395502484`** success | last verified bind · `dpl_*` @ `d25aa29` **NOT VERIFIED** this unit · unit 4 punch/metro **PASS** |
| Living tip / deploy / NEXT | → [PROJECT_STATE.md](../PROJECT_STATE.md) §2 (+ §2c) | **SSOT tip/deploy/NEXT = PS** · living tip start `d25aa29` · last verified `dpl_*` @ `7438de2` · **NEXT = unit 5 jog (osobne GO)** · **≠ PRODUCTION VERIFIED ≠ Product GREEN** |
| Docs continuity (worktree) | Unit 4 punch/count-in/metro+loop smoke PASS | Ten zapis edytuje most + CHANGELOG + PS + audit |

**HISTORY (bridge tip table, `2026-10-27T22:21+01:00`):** HEAD/`origin` last-known `92a1262…` · GitHub Production **`7370676473`** success @ ten SHA · alias wtedy **NOT VERIFIED** — **superseded** tipem `0449410…` (po drodze `332336c` · `a1b84f6` / `7371104561`).
**HISTORY (bridge tip table, `2026-10-27T21:25+01:00`):** HEAD/`origin` last-known `7897037…` · GitHub Production **`7369350599`** success @ ten SHA · alias wtedy **NOT VERIFIED** — **superseded** tipem `92a1262…` (po drodze `2d872e5`, deployment **`7369738523`** success, alias też **NOT VERIFIED**).

**HISTORY (bridge tip table, `2026-10-27T14:17+01:00`):** HEAD/`origin` last-known `fa5b7ca…` — **superseded** tipem `8b4235a…` (łańcuch już na `main`: `1c2abd2` · `c7fbaf3` · `8b4235a`).  
**HISTORY (kontrakt A–D tip table, `2026-10-27T13:57+01:00`):** HEAD/`origin` = `db435ed…` — **superseded** tipem `fa5b7ca…` (A–D), potem `8b4235a…`.  
**HISTORY (GO-5G-O tip table, `2026-10-27T11:20+01:00`):** HEAD/`origin` = `d05aa4e…` — **superseded** tipem `db435ed…` (Q/R).  
**HISTORY (GO-5G-H tip table, `2026-10-27T10:45+01:00`):** HEAD/`origin` = `d462b22…` — **superseded** tipem `d05aa4e…` (J/M).  
**HISTORY (konflikt tip/push, `2026-10-27T09:49+01:00`):** HEAD=`03d889a` · `origin`=`2cc4cc1` · push then **nie** — **superseded** po pushu `d462b22` (GO-5D).

**Zakazy (ten dokument nie upoważnia do):**
`git stash` · `clean` · `reset` · `restore` · `checkout` wpływający na WIP · `git add -A` / `-u` / `.` · commit / push / deploy / instalacje bez odpowiedniego GO · automatyczne „porządki” dirty tree.

Przed **każdym** nowym zadaniem: **ponów** `git status`.

---

## 3. Statusy (pola niezależne)

### `execution`
| Wartość | Znaczenie |
|---------|-----------|
| `PLANNED` | Zaplanowane — **nie** liczy się do limitu 15 |
| `EXECUTED` | Zakres wykonano w sesji (edycje / testy / raport) |
| `CANCELLED` | Anulowane przed EXECUTED — **nie** liczy się do limitu 15 |

### `verification`
| Wartość | Znaczenie |
|---------|-----------|
| `PASS` | Jest wskazany **rzeczywisty** dowód weryfikacji w zakresie |
| `FAIL` | Weryfikacja wykazała błąd |
| `PARTIAL` | Część dowodów OK, część brak |
| `NOT VERIFIED` | Brak wystarczającego dowodu |
| `BLOCKED` | Zatrzymane (bramka, brak GO, konflikt SSOT, ochrona WIP) |

**Reguły:** `EXECUTED` ≠ `PASS`. Nie deklaruj `PASS` na podstawie samego planu, zgody albo opisu bez dowodu.
`git_sha` — tylko gdy commit istnieje i został odczytany.
`prod` — tylko po niezależnej weryfikacji; inaczej `N/A` lub `UNVERIFIED`.

---

## 4. Rejestr (max 15 × `execution=EXECUTED`)

Najnowsze na górze. **Licznik limitu:** wyłącznie wiersze `EXECUTED`.
`PLANNED` / `CANCELLED` poza limitem.

| date | prompt_id | topic | execution | verification | outcome | evidence / source | git_sha | next / block |
|------|-----------|-------|-----------|--------------|---------|-------------------|---------|--------------|
| 2026-10-28 | PUNCH-METRO-U4 | Unit 4 punch/count-in/metro+loop smoke PASS | EXECUTED | PASS | Start tip `d25aa29`=`origin/main`. Kod DAW `01629f5` ancestor. Loop+Metro toggle **PASS**. Count-in **1 takt** + punch checkbox **widoczne**. REC→Stop→Zachowaj finalize **200** · place **201**. Cleanup DELETE clip `ad8e362a-…` **200**. TAKE `507d9cc2-…` UI 19.0s. Projekt `178e902d-…`. Ucha/punch-ON/`dpl_*` **NOT VERIFIED**. Last verified `dpl_D5QpniJpUc75A1vBUiiffvqRzo3P` @ `7438de2`. ≠ PRODUCTION VERIFIED ≠ Product GREEN. | Owner UI smoke · [audit](../audits/PUNCH_METRO_UNIT4_SMOKE_2026-10-28.md) | `d25aa29` + ten docs | NEXT: unit 5 jog = osobne GO |
| 2026-10-28 | MIX-WORKING-APPLY | P0 unit 2 mix-working apply+restore HTTP PASS | EXECUTED | PASS | Start tip `a29fa31`=`origin/main`. Kod `5043b5e` ancestor. Apply mute Wokal HTTP **200** v64→65. Restore checkpoint `537541b2-…` **200** → v66. Wokal unmuted. Bit/Keep OK. Projekt `178e902d-…` v66. Kod produktu nietknięty. `dpl_*` @ `a29fa31` **NOT VERIFIED** this unit. Last verified `dpl_D5QpniJpUc75A1vBUiiffvqRzo3P` @ `7438de2`. ≠ PRODUCTION VERIFIED ≠ Product GREEN. | Owner HTTP apply+restore · [audit](../audits/MIX_WORKING_APPLY_RESTORE_HTTP_2026-10-28.md) | `a29fa31` + ten docs | NEXT: unit 4 punch/metro |
| 2026-10-28 | GO-SB-ARCHIVE-20 | Archiwizacja §4 → CHANGELOG (room for mix-working apply+restore) | EXECUTED | PASS | Przeniesiono 3 najstarsze `EXECUTED` (`DOCREF-SMOKE-AB` · `SCRATCH-TRACK-DOCREF` · `GO-SB-ARCHIVE-15`) → CHANGELOG archive. Living 15→12, po MIX-WORKING-APPLY + tym wierszu **14**. `P-NEXT-10` BLOCKED zachowany. | Diff most + CHANGELOG archive table | _(ten commit)_ | Living tip/deploy → PROJECT_STATE |
| 2026-10-28 | P0-LIVE-PLAY | P0 unit 1 live Play PASS | EXECUTED | PASS | Start tip `60d59a3`=`origin/main`. Kod `5043b5e` ancestor. Catalog place + Zatwierdź + live Play **PASS**. PATCH set_scratch **200**. Record został. leftover **0**. Projekt `178e902d-…` v63. Live cue = `transport.seek`; bake = `resolveScratchSourceMs`; schedule nie czyta `scratchCueMs`. AudioContext CDP **NOT VERIFIED**. Ucho **NOT VERIFIED**. `dpl_*` @ `60d59a3` **NOT VERIFIED** this unit. Last verified `dpl_D5QpniJpUc75A1vBUiiffvqRzo3P` @ `7438de2`. ≠ PRODUCTION VERIFIED ≠ Product GREEN. | Owner UI live Play | `60d59a3` + ten docs | NEXT: unit 2 mix-working |
| 2026-10-28 | DPL-ALIAS-BIND | Vercel MCP `dpl_*` + alias SHA bind | EXECUTED | PASS | Start tip `7438de2`=`origin/main`. MCP `plugin-vercel-vercel` auth **PASS**. Project `bitrymdym` `prj_efwdGM4YfRC146ft85443tu3xBWB`. www/apex/`bitrymdym.vercel.app` → **`dpl_D5QpniJpUc75A1vBUiiffvqRzo3P`** READY @ `7438de2763c22a7d7a3fe964527af7b6fb667196`. Unique `bitrymdym-gclyvcvdj-…`. GH **`7395502484`** success. SHA vs `7438de2` **MATCH** · `06ffbf0`/`5043b5e` ancestor. History READY `dpl_Dk6auzv…` @ `06ffbf0` · `dpl_Fjj76h…` @ `5043b5e`. ≠ PRODUCTION VERIFIED ≠ Product GREEN. | Vercel MCP get_alias+get_deployment · `gh` `7395502484` | `7438de2` + ten docs | NEXT: stop · EXPECT ucha Owner |
| 2026-10-28 | GO-SB-ARCHIVE-19 | Archiwizacja §4 → CHANGELOG (room for dpl/alias bind) | EXECUTED | PASS | Przeniesiono 3 najstarsze `EXECUTED` (`MARKERS-DOCREF` · `BAKE-LISTEN-POLARITY` · `GO-SB-ARCHIVE-14`) → CHANGELOG archive. Living 15→12, po DPL-ALIAS-BIND + tym wierszu **14**. `P-NEXT-10` BLOCKED zachowany. | Diff most + CHANGELOG archive table | _(ten commit)_ | Living tip/deploy → PROJECT_STATE |
| 2026-10-28 | DEPLOY-BIND-H7 | Deploy bind FACT + §7 hygiene | EXECUTED | PARTIAL | Start tip `06ffbf0`=`origin/main`. Kod `5043b5e` ancestor exit 0. GH **`7395335802`** success @ `06ffbf0` · unique `bitrymdym-k69kchfn9-…` **302 SSO**. www **200** bez SHA. `dpl_*`/alias **NOT VERIFIED**. HTTP copy/place z UI **PASS** (SET-SCRATCH-UI + CAT-PLACE-UI; bez nowego smoke). §7/§5 hygiene. Ucho Owner **NOT VERIFIED**. Contabo/SFM nietknięte. ≠ Product GREEN. | `gh` `7395335802` · curl www/apex/unique | _(ten commit)_ | NEXT: stop · EXPECT ucha Owner **albo** vercel inspect gdy CLI |
| 2026-10-28 | BAKE-LISTEN-PLAY | Scratch bake `--play` polarity + PlaySync | EXECUTED | PARTIAL | Start tip `7e14a54`=`origin/main`. Kod `5043b5e`. REUSE `scripts/_bake-listen-scratch-wav.ts` `--play --cleanup` (już na `main` @ `ad28be2`). Polarność PCM/header **PASS**. SoundPlayer PlaySync exit 0 ×4 (**PLAY PASS**). Ucho Owner **NOT VERIFIED**. Temp WAV usunięte. 0 zmian produktu Studio. Contabo/SFM nietknięte. ≠ Product GREEN. | skrypt dump · PlaySync ×4 · EXIT=0 | _(ten commit)_ | NEXT: stop · EXPECT ucha Owner: 4 rampy DC 200ms |
| 2026-10-28 | GO-SB-ARCHIVE-18 | Archiwizacja §4 → CHANGELOG (room for bake `--play`) | EXECUTED | PASS | Przeniesiono 3 najstarsze `EXECUTED` (`CAT-PLACE-UI` · `MARKERS-RESMOKE` · `GO-SB-ARCHIVE-13`) → CHANGELOG archive. Living 15→12, po BAKE-LISTEN-PLAY + tym wierszu **14**. `P-NEXT-10` BLOCKED zachowany. | Diff most + CHANGELOG archive table | _(ten commit)_ | Living tip/deploy → PROJECT_STATE |
| 2026-10-28 | SET-SCRATCH-UI | UI Zatwierdź stan → set_scratch → clip-move | EXECUTED | PASS | Start tip `5043b5e`=`origin/main`. Catalog place → Record został → Zatwierdź stan → PATCH set_scratch **200** → clip-move **200** bez CAS/F5. Cleanup leftover **0**. Bit/Wokal Keep OK. Projekt `178e902d-…` v50. GH **`7394804255`** @ `5043b5e` success · unique `bitrymdym-1svy8dp50-…`. `dpl_*`/alias NOT VERIFIED. ≠ Product GREEN. | Owner UI smoke · `gh` `7394804255` | `5043b5e` + ten docs | NEXT: stop kolejki ack **albo** Owner bake `--play` ucha |
| 2026-10-28 | SCRATCH-LIFT-ID | Lift lastScratchClipId — Record survives clip select | EXECUTED | PASS | Start tip `237c12e`=`origin/main`. GO editor. Helpery preferRecord (keepRecord place + timeline select przy sesji). `lastScratchClipId` SSOT w editorze; panel props. `onClipCreated`+keepRecord → preferRecord true + id, NIE File. `onSelectClip` przy sesji nie zrzuca Record. Editor +18/−1; panel +6/−4; context +14. Vitest **96/96**. UI Catalog→Zatwierdź→move **NOT VERIFIED**. `dpl_*`/alias NOT VERIFIED. ≠ Product GREEN. | vitest scratch-record-session + record-inspector-mount + studio-scratch-cas + stu-08 + p7-1-3 + p7-1-6 + studio-markers-* + pr-v1 | _(ten commit)_ | NEXT: re-smoke Catalog→Zatwierdź→set_scratch→move |
| 2026-10-28 | GO-SB-ARCHIVE-17 | Archiwizacja §4 → CHANGELOG (room for lastScratchClipId lift) | EXECUTED | PASS | Przeniesiono 3 najstarsze `EXECUTED` (`MARKERS-CAS-VER` · `MARKERS-CAS` · `GO-SB-ARCHIVE-12`) → CHANGELOG archive. Living 15→12, po SCRATCH-LIFT-ID + tym wierszu **14**. `P-NEXT-10` BLOCKED zachowany. | Diff most + CHANGELOG archive table | _(ten commit)_ | Living tip/deploy → PROJECT_STATE |
| 2026-10-28 | CAT-PLACE-RECORD | Catalog place keeps Record + onTrackCreated | EXECUTED | PASS | Start tip `3a9bfd8`=`origin/main`. GO editor. `keepRecordPanel` zostawia Record po catalog place; `onTrackCreated` → `applyPersistedDoc` `doc.tracks`. Editor +17/−1; panel +8/−2. Vitest scratch+markers+p7.1.6+stu-08+pr-v1 **82/82**. UI Zatwierdź stan→clip-move **NOT VERIFIED**. `dpl_*`/alias NOT VERIFIED. ≠ Product GREEN. | vitest studio-scratch-cas + record-inspector-mount + stu-08 + p7-1-6 + studio-markers-* + pr-v1 | _(ten commit)_ | NEXT: re-smoke UI Zatwierdź stan→set_scratch→clip-move |
| 2026-10-28 | LEFTOVER-SET-SCRATCH | Leftover cleanup + set_scratch→move API | EXECUTED | PASS | Start tip `4187ad3`=`origin/main`. DELETE Sample `8273aeeb` + Scratch `bced0aa2` HTTP **200** · leftover **false** · Bit/Wokal Keep OK · projekt v27. set_scratch→move API **PASS**: place TAKE na Scratch → PATCH reverse true → clip-move bez CAS (API/fetch). UI „Zatwierdź stan” **NOT VERIFIED** (`lastScratchClipId` / catalog 0). GH/`dpl_*`/alias NOT VERIFIED. ≠ Product GREEN. | Owner cleanup + API/fetch | `4187ad3` + ten docs | NEXT: UI Zatwierdź stan→clip-move (seed catalog) **albo** stop kolejki ack |
| 2026-10-28 | GO-SB-ARCHIVE-16 | Archiwizacja §4 → CHANGELOG (room for leftover + set_scratch API) | EXECUTED | PASS | Przeniesiono 3 najstarsze `EXECUTED` (`KEEP-SMOKE` · `DAW-QUEUE` · `GO-SB-ARCHIVE-11`) → CHANGELOG archive. Living 15→12, po LEFTOVER-SET-SCRATCH + tym wierszu **14**. `P-NEXT-10` BLOCKED zachowany. | Diff most + CHANGELOG archive table | _(ten commit)_ | Living tip/deploy → PROJECT_STATE |
| 2026-10-27 | P-NEXT-10 | Commit+push allowlisty 06/08 | BLOCKED | BLOCKED | HEAD≠`2cc4cc1` (był już `03d889a`); zła nazwa D02 w briefie | Preflight P-NEXT-10; brak stage | — | Wznów tylko po GO z bazą `03d889a` |

**Licznik `EXECUTED` w tabeli:** 15 (limit 15). Wiersz `P-NEXT-10` ma `execution=BLOCKED` — **nie** liczy się do limitu. Archiwum (twentieth batch DOCREF-SMOKE-AB + SCRATCH-TRACK-DOCREF + GO-SB-ARCHIVE-15 + earlier): [CHANGELOG.md](../CHANGELOG.md) → `### SESSION_BRIDGE archive`. **Kolejny** `EXECUTED` wymaga archiwizacji §4 przed dopisaniem (limit pełny).

### 4.1 Limit i archiwizacja

- Maksymalnie **15** najnowszych wpisów `EXECUTED` w tabeli powyżej.
- Docelowe archiwum starszych wpisów: [CHANGELOG.md](../CHANGELOG.md) → sekcja `### SESSION_BRIDGE archive`.
- **GO-1 i bieżąca polityka:** `docs/CHANGELOG.md` jest poza zakresem wielu GO dokumentacyjnych i może mieć dirty WIP. **Nie edytuj CHANGELOG** w ramach GO-1 ani „przy okazji” rotacji bez **osobnego GO Ownera**.
- **Zakaz:** ciche usuwanie starszych wpisów `EXECUTED` bez zatwierdzonej procedury archiwizacji (osobne GO).
- **Przed** dopisaniem kolejnego `EXECUTED`: policz living `EXECUTED` w §4. Jeśli wynik ≥ 15 albo dopisanie przekroczyłoby 15 → **nie zapisuj** wiersza i **nie** kasuj historii.
- Wówczas obowiązkowy wynik dla agenta: **`HANDOFF BLOCKED`** — podaj: aktualny licznik, że limit = 15, że wymagane jest **osobne GO Ownera** na archiwizację §4 → CHANGELOG `### SESSION_BRIDGE archive`, oraz że **nie** wolno tworzyć alternatywnego handoffu / drugiego mastera / cichej rotacji.
- **Zakaz fałszywego sukcesu:** przy `HANDOFF BLOCKED` nie deklaruj „przekazanie sesji zakończone” / „handoff PASS”. Dozwolony jest raport w czacie ze statusem `HANDOFF BLOCKED` + faktami Git (status-only).

### 4.2 Przerwane / FAIL / brak commita

| Sytuacja | Wpis |
|----------|------|
| Sesja urwała się po pracy | `EXECUTED` + `NOT VERIFIED` lub `PARTIAL`; `git_sha` puste jeśli brak commit |
| Kontrola fail | `EXECUTED` + `FAIL` |
| Bramka / brak GO | `BLOCKED` (execution wg faktu) |
| Anulowano przed startem | `CANCELLED` |
| Brak commita | nie zmyślaj `git_sha` |

---

## 5. Open / STOP (skrót)

Linkuj, nie duplikuj:

- NEXT / STOP → [PROJECT_STATE.md](../PROJECT_STATE.md) (NEXT UNIT)
- OPEN → [OPEN_DECISIONS.md](../decisions/OPEN_DECISIONS.md)

**Last-known deploy / alias (odczyt `2026-10-28T22:45+01:00`; living Git):**
- Living Git: **`d25aa29…`** = `origin/main` (`ls-remote`) · kod DAW **`01629f5`** ancestor
- Last independently verified: Vercel **`dpl_D5QpniJpUc75A1vBUiiffvqRzo3P`** **Ready** @ **`7438de2`** ancestor · unique `bitrymdym-gclyvcvdj-…`
- GitHub Production **`7395502484`** · **success** · `2026-10-28T19:40:20Z` @ **`7438de2`**
- `dpl_*` @ `d25aa29` **NOT VERIFIED** this unit · unit 4 punch/metro **PASS** · **≠ PRODUCTION VERIFIED ≠ Product GREEN**
- Kanoniczne wiersze tip/deploy/NEXT → [PROJECT_STATE.md](../PROJECT_STATE.md) §2 (+ §2c); ten bridge **nie** jest SSOT tipu.

**Lokalne GO oczekujące (uzupełniaj ręcznie):**
- Path-scoped commit dirty docs poza P-NEXT-10B — **bez** Sacred / reszty WIP. `PROJECT_STATE` nietknięty (pętla tip).
- **HISTORY (done):** P-NEXT-10B allowlista 06/08 @ **`77343b6`** (10 dirty + 2 już CLEAN: PS/CHANGELOG; D02 kanoniczna). Push tipu `03d889a`→`d462b22` · reconcile tip/deploy/alias w PROJECT_STATE (GO-5G-C) · §5→§2 (GO-5G-F) · wpis CHANGELOG GO-5G-C (GO-5G-G) · commit+push SESSION_BRIDGE (J/M @ `d05aa4e`; Q/R @ `db435ed`) · kontrakt A–D @ **`fa5b7ca`** · reconcile mostu @ **`1c2abd2`** · **GO-SB-ARCHIVE** commit+push @ **`c7fbaf3`** · continuity hardening reguły @ **`8b4235a`** · procedura §6 + reguła fraz commit+push @ **`7897037`** · domknięcie mostu @ **`2d872e5`** · reguła zespołu Cursor @ **`92a1262`** · Unit 1 tip/deploy reconcile @ **`0449410`** · Unit 2 closeout @ **`f5b3515`**.
- P-NEXT-06 tip/deploy era = HISTORY w PS/CHANGELOG — **≠** zamknięcie toru produktowego QT / OD-SC / Sample Catalog (**Implementation NOT AUTHORIZED**).
- NEXT UNIT produktu → PROJECT_STATE (**STOP — OWNER DECISION REQUIRED**); Implementation **nie** autoryzowana; nie mylić z GO dokumentacyjnymi powyżej.

---

## 6. Checklist po zadaniu / handoff sesji

**Trigger Cursor:** polecenie Ownera **„Kończymy sesję — przygotuj przekazanie pracy”** (lub równoważne zamknięcie) → wykonaj ten checklist i zaktualizuj ten plik zgodnie z rzeczywistym stanem (bez fikcji commit/push/test/deploy). Szczegóły fraz: reguła `.cursor/rules/bitrymdym-ssot-over-ecc.mdc` (Frazy sesji Cursor).

**Gate przed zapisem:** policz living `EXECUTED` (§4.1). Jeśli dopisanie wiersza nie jest możliwe → **`HANDOFF BLOCKED`** (patrz §4.1) i **STOP** dalszego zapisu §4. Nie edytuj wtedy `CHANGELOG.md` ani `PROJECT_STATE.md`. To koniec frazy, nie pętla: raport w czacie nie jest sukcesem zapisu, a następna sesja czyta ten sam licznik. Nadal wolno zaktualizować §2 snapshot (status-only), o ile ten plik nie niesie obcego WIP i zapis nie rusza chronionego/mixed WIP. Nie obchodź limitu nowym plikiem handoffu.

**Po istotnej jednostce pracy** (zanim nowa sesja przejmie zadanie) uzupełnij istniejące źródła — **nie** twórz drugiego master handoffu:

1. Cel i zakres zadania (ten GO / wiersz §4) — albo powód `HANDOFF BLOCKED`.
2. Stan początkowy vs aktualny (HEAD, staged, dirty obszary — status only; §2). Osobno: ukończone / częściowe / nieuruchomione / zablokowane.
3. Kluczowe decyzje i uzasadnienie (link do OD / DECISION_LOG, nie kopiuj).
4. Kanoniczne pliki / mechanizmy (link REUSE_SSOT_MAP + ścieżki).
5. Zmienione pliki + krótki opis (**tylko** diff allowlisty / ścieżki dozwolone do odczytu — Sacred/Studio chronione = status-only).
6. Testy: wykonane / wyniki / niewykonane — bez fikcji.
7. Ryzyka, regresje, otwarte pytania; niezacommitowany WIP = **PRESERVE** (nie czyść).
8. Potwierdzony Git: branch · HEAD · `origin/main` (last-known) · staging · ochrona WIP (Sacred + Studio chronione = status-only).
9. Następny krok + kryteria akceptacji + ograniczenia (**jeden** konkretny krok).
10. Operacje nadal wymagające osobnego GO Ownera.

**Weryfikacja własnego przekazania (obowiązkowa przed deklaracją sukcesu):**

1. Ponów `git status` / `git rev-parse HEAD` — porównaj z twierdzeniami w raporcie i w §2/§4.
2. Jeśli twierdzisz, że zapisano §4 / §2 — potwierdź, że diff allowlisty rzeczywiście zawiera te zmiany; inaczej **nie** deklaruj zapisu.
3. Lokalna edycja ≠ commit ≠ push ≠ deploy. Brak dowodu → `NOT VERIFIED` / nie rość PASS.
4. Przy `HANDOFF BLOCKED` raport czatu musi zawierać tę frazę + wymagane GO; to **nie** jest sukces handoffu plikowego.

**Skrót kontrolny:**

- [ ] Zakres = GO
- [ ] Gate limitu §4 wykonany (licznik znany)
- [ ] Dopisano wiersz §4 (`execution` + `verification` rozdzielone; bez fikcji) — **tylko jeśli limit < 15** albo po GO archiwizacji; inaczej status **`HANDOFF BLOCKED`**
- [ ] `git_sha` / `prod` tylko z dowodem
- [ ] Zaktualizowano §2 WIP snapshot (status only) **albo** udokumentowano dlaczego nie (np. brak GO / konflikt WIP)
- [ ] Jeśli dodanie kolejnego `EXECUTED` przekroczyłoby 15 → **nie kasuj**; **`HANDOFF BLOCKED`** + GO archiwizacji CHANGELOG
- [ ] Tip/deploy: **nie** edytuj `PROJECT_STATE` ani `CHANGELOG` bez osobnego GO (mixed = cały plik). Living tip/deploy/NEXT zostaje w PROJECT_STATE §2. Operacyjny SHA Gita wolno zapisać w §2.1/§5 tego pliku, bez uznania tego za SSOT tipu i bez claimu nowego `dpl_*`
- [ ] Sacred / Studio chronione / dirty poza zakresem: nietknięte
- [ ] Raport uzgodniony z Git (weryfikacja powyżej)
- [ ] Commit / push — wg `AGENTS.md` (path-scoped); **ten plik sam nie jest zgodą**; deploy claim ≠ push docs

---

## 7. Related

- [DOCUMENTATION_CONTINUITY.md](../DOCUMENTATION_CONTINUITY.md)
- [FINAL_COLD_START_HANDOFF.md](../FINAL_COLD_START_HANDOFF.md)
- [PROJECT_STATE.md](../PROJECT_STATE.md)
- [CHANGELOG.md](../CHANGELOG.md) _(archiwum — edycja tylko po osobnym GO)_
- [ECC_CURSOR_WORKFLOW.md](./ECC_CURSOR_WORKFLOW.md)

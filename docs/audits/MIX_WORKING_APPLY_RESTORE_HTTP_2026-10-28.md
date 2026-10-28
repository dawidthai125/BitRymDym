# Mix Working apply + restore HTTP — 2026-10-28

**Status:** Owner HTTP **PASS** · kod **nietknięty** · **≠ Product GREEN** · **≠ PRODUCTION VERIFIED** · `dpl_*` / alias **NOT VERIFIED**  
**Unit:** P0 unit 2 (Owner GO uznania z planu)  
**Tip living (start closeout):** `a29fa31c215d03015ec6a1a575f0816a568998b7` = `origin/main` (HTTP PASS przy tipie unit 1 `60d59a3`)  
**Projekt:** `178e902d-6ecf-4ef6-910c-d85612bb277c` · „Projekt z bitem” · sesja Dawid (`www.bitrymdym.pl`)  
**Egress:** Play / master **nie** kliknięte.

Sacred WIP **nie odczytano**. `studio-editor.tsx` **nie edytowano**. Contabo/SFM / `db push` **nietknięte**.

## REUSE

`POST /api/studio/projects/[id]/mix-working/apply` → `applyStudioMixWorkingOps` → `applyStudioMixWorkingOpsFor`.  
`POST …/mix-working/revisions/[revisionId]/restore` → `restoreMixWorkingRevision` → ten sam apply.  
Zero nowego silnika.

## HTTP (FACT)

| Krok | Wynik |
|------|--------|
| GET project | **200** · `documentVersion=63` · Bit `be2dc465-…` unmuted gain 0 · Wokal `bb80c14e-…` unmuted gain 0 |
| Clips Keep | BEAT_REF `2f06a6b2-…` · TAKE Keep `af9bd5aa-…` |
| GET revisions | **200** · 8 rewizji · latest `f653fd07-…` @ source v61 (snapshot ma Scratch + extra clip — **nie** restore, identityConflict) |
| Checkpoint apply `muted:false` (Wokal) | **200** · v63→**64** · `revisionId=537541b2-623f-4d13-acb1-90983d43b971` · `replay=false` |
| Apply mute Wokal | **200** · v64→**65** · `revisionId=eb34de2c-09b3-41fb-a26e-f5f95680e153` · `replay=false` · Wokal `muted=true` |
| Restore checkpoint `537541b2-…` | **200** · v65→**66** · nowa rewizja `58e5af4b-ae50-4ff6-9247-9269ba1a333a` · `replay=false` · Wokal `muted=false` |
| GET końcowy | **200** · v**66** · Bit/Wokal unmuted gain 0 · te same 2 clipy |

Rollback awaryjny **nie** potrzebny.

## Non-claim

- Punch / metro / live cue **NOT VERIFIED** (NEXT unit 4; unit 3 tylko przy luce live cue)
- Słyszalność miksu **NOT VERIFIED**
- `dpl_*` / alias SHA bind **NOT VERIFIED** w tym unicie
- **≠** Mix Working GREEN · **≠** PRODUCTION VERIFIED · **≠** Product GREEN

## Git

Docs closeout: path-scoped audit + CHANGELOG + PROJECT_STATE + SESSION_BRIDGE. Kod Studio **nietknięty**. Sacred / dirty WIP **PRESERVE**.

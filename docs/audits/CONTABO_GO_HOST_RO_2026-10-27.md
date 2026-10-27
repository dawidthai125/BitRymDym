# Contabo GO-HOST-RO — 2026-10-27

| Pole | Wartość |
|------|---------|
| Charakter | **Read-only host probe** · **bez** enable / start / stop / sync / canary |
| Data | 2026-10-27 |
| Kontrakt | [CONTABO_CONTINUOUS_WORKER_DESIGN_FREEZE.md](../decisions/CONTABO_CONTINUOUS_WORKER_DESIGN_FREEZE.md) · PROJECT_STATE §2c |
| Host last-known | `vmi3622761` · `ubuntu@161.97.72.197` · path `/opt/bitrymdym-e3-worker` |
| Klucz last-known | `~/.ssh/bitrymdym-e3-contabo` (**nazwa tylko**) |

**Werdykt: BLOCKED** — live SSH **NOT DONE — blocked on SSH**.

---

## FACT — ta sesja

| Check | Wynik |
|-------|--------|
| Klucz dokumentowany `~/.ssh/bitrymdym-e3-contabo` | **MISSING** (`Test-Path` false) |
| Próba SSH documented key · BatchMode · ConnectTimeout 12s | **FAIL** exit **255** · `Identity file … not accessible` · potem `Permission denied (publickey)` |
| Klucz recovery `~/.ssh/bitrymdym-contabo-recovery-ed25519` (istnieje na maszynie Ownera) | **FAIL** exit **255** · `Permission denied (publickey)` · **nie** dumpowano materiału klucza |
| Timeout / host down | **nie** — host odpowiada odmową klucza (INFERENCE: TCP/SSH daemon osiągalny) |
| `systemctl` / unit / env names / git SHA na hoście | **NOT DONE** |
| Always-on / persist enable | **nie** próbowane |

Last successful RO SSH w docs: **2026-10-16** (`SFM_KIND_REJECT_DEPLOYMENT_HOST_VERIFICATION_12.md`). To **nie** jest dowód tej sesji.

---

## Co pozostaje last-known (docs, nie re-verify)

Persistent systemd **disabled/inactive** · oneshot path · always-on **NOT ENABLED** · sync **NOT DONE**.

---

## Zakazy

Nie enable always-on · nie sync mutate · nie canary · nie dump `worker.env` / kluczy.

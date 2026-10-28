# Studio Markery verse/hook — Design Freeze (PARTIAL / OUT implementacji)

**Status:** FREEZE ONLY — implementacja persist CAS **OUT** tej kolejki  
**Powód:** brak pola markerów w dokumencie projektu; nowa kolumna/RPC = migracja, a `db push` jest **BLOCKED** bez osobnego schema GO.  
**OD-15:** OPEN

## IN (gdy schema GO)

- Markery verse/hook w ms.
- Persist CAS + `document_version`.

## OUT teraz

- Kod · migracja · localStorage jako fałszywy persist.

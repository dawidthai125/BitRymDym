"""Site effect chain for the Windows recorder.

Same ids and default params as src/lib/studio/studio-fx-chain.ts.
The site plays them. This file does not run DSP and does not load VST.
"""

from __future__ import annotations

import re
import uuid
from typing import Any


ABSOLUTE_CAP = 12
CAPS = {"FREE": 4, "BRONZE": 4, "SILVER": 12, "GOLD": 12}
SIDECHAIN = {"FREE": False, "BRONZE": False, "SILVER": True, "GOLD": True}

FX: list[tuple[str, str]] = [
    ("eq", "EQ"),
    ("spectrum", "Pasma"),
    ("compressor", "Wyrównaj głośność"),
    ("limiter", "Pułap głośności"),
    ("reverb", "Pogłos"),
    ("delay", "Echo"),
    ("highpass", "Obetnij dół"),
    ("deesser", "Ścisz syki"),
    ("gate", "Wycisz szum"),
    ("tune", "Strojenie wokalu"),
    ("rider", "Wyrównanie wokalu"),
    ("harmony", "Harmonia"),
    ("voice", "Zmiana głosu"),
    ("saturate", "Ciepło"),
    ("pocket", "Miejsce na rap"),
    ("sidechain", "Ścisz pod bit"),
]

DEFAULTS: dict[str, dict[str, Any]] = {
    "eq": {
        "low": {"frequencyHz": 120, "gainDb": 0, "q": 0.7},
        "mid": {"frequencyHz": 1000, "gainDb": 0, "q": 1},
        "high": {"frequencyHz": 8000, "gainDb": 0, "q": 0.7},
    },
    "spectrum": {"b0": 0, "b1": 0, "b2": 0, "b3": 0, "b4": 0, "b5": 0, "b6": 0},
    "compressor": {"thresholdDb": -24, "ratio": 3, "attackMs": 10, "releaseMs": 100, "makeupDb": 0},
    "limiter": {"thresholdDb": -1, "ceilingDb": -0.1},
    "reverb": {"mix": 0, "decaySeconds": 1.2},
    "delay": {"mix": 0, "timeMs": 250, "feedback": 0.25},
    "highpass": {"frequencyHz": 90, "q": 0.707},
    "deesser": {"frequencyHz": 6500, "thresholdDb": -30, "ratio": 4},
    "gate": {"thresholdDb": -55, "rangeDb": 12, "releaseMs": 150},
    "tune": {"keyRoot": 0, "scale": 2, "retuneMs": 100, "amount": 0.85},
    "rider": {"amount": 0.65, "maxBoostDb": 6, "maxCutDb": 6},
    "harmony": {"amount": 0.7},
    "voice": {"color": 0, "mix": 1},
    "saturate": {"drive": 0.35, "mix": 0.55},
    "pocket": {"verseDb": -1.5, "hookDb": 0, "depth": 0.55, "doubleMs": 20, "doubleCents": 12, "doubleDb": -14},
    "sidechain": {"depth": 0.65, "attackMs": 8, "releaseMs": 140},
}

_UUID = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
_LABELS = dict(FX)


def display_tier(tier: str) -> str:
    return {"FREE": "Free", "BRONZE": "Bronze", "SILVER": "Silver", "GOLD": "Gold"}.get(tier, "Free")


def limits_for(tier: str) -> tuple[int, bool]:
    key = tier if tier in CAPS else "FREE"
    return min(CAPS[key], ABSOLUTE_CAP), SIDECHAIN[key]


def limits_from_usage(payload: dict[str, Any]) -> tuple[str, int, bool]:
    usage = payload.get("usage")
    tier = usage.get("tier") if isinstance(usage, dict) else None
    if not isinstance(tier, str) or tier not in CAPS:
        tier = "FREE"
    cap, side = limits_for(tier)
    return tier, cap, side


def build_chain(types: list[str], tier: str) -> dict[str, Any]:
    cap, side_ok = limits_for(tier)
    if len(types) > cap:
        raise ValueError(f"Plan {display_tier(tier)} mieści {cap} efektów.")
    if len(types) > ABSOLUTE_CAP:
        raise ValueError("Sufit to 12 efektów.")
    known = set(DEFAULTS)
    effects: list[dict[str, Any]] = []
    seen: set[str] = set()
    for fx_type in types:
        if fx_type not in known:
            raise ValueError("Nieznany efekt.")
        if fx_type in seen:
            raise ValueError("Każdy efekt raz.")
        if fx_type == "sidechain" and not side_ok:
            raise ValueError("Ściszanie pod bit jest od Silver.")
        seen.add(fx_type)
        effect_id = str(uuid.uuid4())
        effects.append(
            {
                "id": effect_id,
                "type": fx_type,
                "enabled": True,
                "params": DEFAULTS[fx_type],
            }
        )
    return {"schemaVersion": 1, "effects": effects}


def self_test() -> None:
    if len(FX) != 16 or len(DEFAULTS) != 16:
        raise SystemExit("katalog efektów nie ma 16 pozycji")
    if limits_for("FREE") != (4, False) or limits_for("BRONZE") != (4, False):
        raise SystemExit("limit Free albo Bronze")
    if limits_for("SILVER") != (12, True) or limits_for("GOLD") != (12, True):
        raise SystemExit("limit Silver albo Gold")
    if limits_for("NOPE") != (4, False):
        raise SystemExit("nieznany plan ma iść w limit Free")
    chain = build_chain(["eq", "compressor"], "FREE")
    if chain["schemaVersion"] != 1 or len(chain["effects"]) != 2:
        raise SystemExit("łańcuch")
    if chain["effects"][0]["params"] != DEFAULTS["eq"]:
        raise SystemExit("domyślne EQ")
    if "notes" in chain["effects"][0]:
        raise SystemExit("nuty nie idą z tego programu")
    if not _UUID.match(chain["effects"][0]["id"]):
        raise SystemExit("id efektu")
    try:
        build_chain(["eq", "spectrum", "compressor", "limiter", "reverb"], "FREE")
    except ValueError as error:
        if "4" not in str(error):
            raise SystemExit("komunikat limitu") from None
    else:
        raise SystemExit("Free przepuścił 5 efektów")
    try:
        build_chain(["sidechain"], "BRONZE")
    except ValueError as error:
        if "Silver" not in str(error):
            raise SystemExit("komunikat sidechain") from None
    else:
        raise SystemExit("Bronze przepuścił sidechain")
    silver = build_chain(["sidechain", "tune"], "SILVER")
    if [item["type"] for item in silver["effects"]] != ["sidechain", "tune"]:
        raise SystemExit("kolejność")
    if "notes" in silver["effects"][1]:
        raise SystemExit("strojenie bez nut")
    tier, cap, side = limits_from_usage({"usage": {"tier": "GOLD"}})
    if (tier, cap, side) != ("GOLD", 12, True):
        raise SystemExit("odczyt planu")
    if limits_from_usage({})[0] != "FREE":
        raise SystemExit("pusty plan")
    if _LABELS["pocket"] != "Miejsce na rap" or _LABELS["sidechain"] != "Ścisz pod bit":
        raise SystemExit("etykieta")
    print("fx self-test ok")


if __name__ == "__main__":
    self_test()

"""What a new track is for: Wokal, Podbicie or Adlib, and its next free number.

Pure model: no Tk. Studio Offline keeps two roles, "wokal" and "podbicie"; an adlib counts as a
podbicie there, as before ("podbicie / adlib" in the session notes).
"""

from __future__ import annotations

import re

KINDS: tuple[str, ...] = ("Wokal", "Podbicie", "Adlib")
ROLE_OF = {"Wokal": "wokal", "Podbicie": "podbicie", "Adlib": "podbicie"}
NAME_LIMIT = 40


def next_name(kind: str, names: list[str]) -> str:
    """'Wokal 1', 'Wokal 2'… The number after the highest one taken, so a deleted track leaves no clash."""
    kind = kind if kind in KINDS else KINDS[0]
    pattern = re.compile(rf"^{re.escape(kind)}\s*(\d+)?$", re.IGNORECASE)
    taken = 0
    for name in names:
        found = pattern.match(name.strip())
        if found:
            taken = max(taken, int(found.group(1) or 1))
    return f"{kind} {taken + 1}"


def clean_name(text: str, fallback: str) -> str:
    cleaned = " ".join(text.split())[:NAME_LIMIT]
    return cleaned or fallback


def self_test() -> None:
    if next_name("Wokal", []) != "Wokal 1" or next_name("Wokal", ["Wokal 1", "Wokal 3", "Adlib 1"]) != "Wokal 4":
        raise SystemExit("ścieżki: numer wokalu")
    if next_name("Adlib", ["Wokal 1", "adlib 2"]) != "Adlib 3" or next_name("Podbicie", ["Podbicie"]) != "Podbicie 2":
        raise SystemExit("ścieżki: numer adlibu i podbicia")
    if next_name("cokolwiek", ["Wokal 1"]) != "Wokal 2" or ROLE_OF["Adlib"] != "podbicie":
        raise SystemExit("ścieżki: rodzaj")
    if clean_name("  Refren   chór ", "X") != "Refren chór" or clean_name("   ", "Wokal 2") != "Wokal 2" or len(clean_name("a" * 99, "X")) != 40:
        raise SystemExit("ścieżki: nazwa")
    print("track_kind self-test ok")


if __name__ == "__main__":
    self_test()

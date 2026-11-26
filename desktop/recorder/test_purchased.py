"""Bought exclusive beats on the recorder's list (owner order 2026-11-26)."""

from record_app import PURCHASED_PREFIX, beat_choice, merge_purchased


def main() -> None:
    catalog = [("a", "Bit A (90 BPM)")]
    info = {"a": ("Bit A", 90, 120.0)}
    bought = [
        {"id": "p", "title": "Zakup", "bpm": 85.4, "durationSeconds": 150},
        {"id": "a", "title": "Bit A", "bpm": 90},  # already listed: not doubled
        {"id": "", "title": "pusty"},  # broken row: skipped
        "x",
    ]
    beats, merged = merge_purchased(catalog, info, bought)
    assert beats == [("p", f"{PURCHASED_PREFIX}Zakup (85 BPM)"), ("a", "Bit A (90 BPM)")], beats
    assert merged["p"] == ("Zakup", 85, 150.0) and merged["a"] == info["a"], merged
    assert info == {"a": ("Bit A", 90, 120.0)}, "input info untouched"
    assert merge_purchased(catalog, info, []) == (catalog, info)
    assert beat_choice({"id": "z", "title": "T", "bpm": True, "durationSeconds": True}) == ("z", "T", ("T", 0, 0.0))
    print("purchased tests ok")


if __name__ == "__main__":
    main()

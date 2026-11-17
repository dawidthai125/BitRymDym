"""Contract: Offline STOP / Space / R must reach the app while recording.

Root cause of the FAIL smoke: transport keys used root.bind (missed when focus
was on a Canvas child) and NAGRAJ called record() which no-ops mid-capture.
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent
APP = (ROOT / "record_app.py").read_text(encoding="utf-8")


def test_transport_uses_bind_all() -> None:
    assert "self.root.bind_all(sequence, lambda event, run=handler: self._key(event, run))" in APP
    # Must not reintroduce root-only binds for the transport loop.
    assert 'self.root.bind(sequence, lambda event, run=handler: self._key(event, run))' not in APP


def test_space_bound_once() -> None:
    assert '("<space>", lambda: self.toggle_record())' in APP
    assert "<KeyPress-space>" not in APP


def test_nagraj_toggles() -> None:
    assert 'self._tool(bar, "● NAGRAJ", self.toggle_record,' in APP
    assert "def toggle_record(self) -> None:" in APP
    block = APP.split("def toggle_record(self) -> None:", 1)[1].split("def ", 1)[0]
    assert "self.stop()" in block
    assert "self.record()" in block


def test_key_skips_text_fields() -> None:
    block = APP.split("def _key(self, event: tk.Event, run: Callable[[], object]) -> str | None:", 1)[1].split(
        "def ", 1
    )[0]
    assert "tk.Entry" in block and "tk.Listbox" in block
    assert 'name in {"Entry", "Listbox", "Text", "TEntry"}' in block


def test_focus_force_after_capture_starts() -> None:
    assert "self.root.focus_force()" in APP


if __name__ == "__main__":
    test_transport_uses_bind_all()
    test_space_bound_once()
    test_nagraj_toggles()
    test_key_skips_text_fields()
    test_focus_force_after_capture_starts()
    print("test_stop_transport: ok")

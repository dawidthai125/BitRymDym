"""Tests for updater.py with a throw-away Ed25519 key (pure Python signer, no openssl). Run: python test_updater.py"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import tempfile
from pathlib import Path

import updater as u


def make_signer(seed: bytes):
    digest = hashlib.sha512(seed).digest()
    secret = bytearray(digest[:32])
    secret[0] &= 248
    secret[31] &= 127
    secret[31] |= 64
    scalar = int.from_bytes(secret, "little")
    prefix = digest[32:]

    def encode(point) -> bytes:
        zinv = pow(point[2], u._P - 2, u._P)
        x, y = point[0] * zinv % u._P, point[1] * zinv % u._P
        return (y | ((x & 1) << 255)).to_bytes(32, "little")

    public = encode(u._mul(scalar, u._G))

    def sign(message: bytes) -> bytes:
        r = int.from_bytes(hashlib.sha512(prefix + message).digest(), "little") % u._Q
        point_r = encode(u._mul(r, u._G))
        k = int.from_bytes(hashlib.sha512(point_r + public + message).digest(), "little") % u._Q
        return point_r + ((r + k * scalar) % u._Q).to_bytes(32, "little")

    return public, sign


def manifest(sign, version="2026.12.1", size=2_000_000, sha="a" * 64, url=None, notes="n"):
    url = url or f"{u.INSTALLER_PREFIX}BitRymDym-Setup-{version}.exe"
    return json.dumps(u.sign_manifest(version, sha, size, url, notes, sign)).encode()


def expect_reject(raw, public, prefix=u.INSTALLER_PREFIX, why=""):
    try:
        u.parse_manifest(raw, public, prefix)
    except ValueError:
        return
    raise SystemExit(f"manifest przyjęty, a miał być odrzucony: {why}")


def main() -> None:
    u.self_test()
    public, sign = make_signer(b"test-seed-" + b"x" * 22)
    good = manifest(sign)
    parsed = u.parse_manifest(good, public)
    if parsed.version != "2026.12.1" or parsed.size != 2_000_000:
        raise SystemExit("poprawny manifest")
    # tampering with any signed field breaks the signature
    data = json.loads(good)
    for field, value in (("version", "2099.1.1"), ("sha256", "b" * 64), ("size", 2_000_001),
                         ("url", u.INSTALLER_PREFIX + "Other.exe")):
        broken = dict(data, **{field: value})
        expect_reject(json.dumps(broken).encode(), public, why=field)
    _other_public, other_sign = make_signer(b"other-seed-" + b"y" * 21)
    expect_reject(manifest(other_sign), public, why="cudzy klucz")
    expect_reject(manifest(sign, url="http://pub-8c6908a0590848aeb53ab34c2317d857.r2.dev/bitrymdym/a.exe"), public, why="http")
    expect_reject(manifest(sign, url="https://evil.example/BitRymDym-Setup.exe"), public, why="obca domena")
    expect_reject(manifest(sign, url=u.INSTALLER_PREFIX + "../x.exe"), public, why="..")
    expect_reject(manifest(sign, size=10), public, why="mały rozmiar")
    expect_reject(b"not json", public, why="śmieci")
    expect_reject(good[:-5], public, why="ucięty")
    expect_reject(json.dumps(dict(data, signature="@@@")).encode(), public, why="zły base64")
    # check_for_update: newer yes, same/older no, errors -> None
    if u.check_for_update(lambda: good, "2026.11.12.2", public) is None:
        raise SystemExit("nowsza wersja nie wykryta")
    # Several builds behind still gets this one manifest, not the next number.
    jumped = u.check_for_update(lambda: good, "2026.11.12.1", public)
    if jumped is None or jumped.version != "2026.12.1":
        raise SystemExit("przeskok kilku wersji ma dać od razu najnowszy manifest")
    if u.check_for_update(lambda: good, "2026.12.1", public) is not None or u.check_for_update(lambda: good, "2027.1", public) is not None:
        raise SystemExit("ta sama lub starsza wersja nie może proponować aktualizacji")
    if u.check_for_update(lambda: (_ for _ in ()).throw(OSError("sieć")), "2026.11.12.2", public) is not None:
        raise SystemExit("błąd sieci ma dać None")
    # download: exact bytes accepted; wrong hash, short, long rejected; no leftovers
    payload = os.urandom(2_500_000)
    update = u.Update("2026.12.1", u.INSTALLER_PREFIX + "x.exe", hashlib.sha256(payload).hexdigest(), len(payload))
    with tempfile.TemporaryDirectory() as raw_dir:
        folder = Path(raw_dir)
        seen: list[int] = []
        path = u.download(update, folder, lambda done, total: seen.append(done), lambda _url: io.BytesIO(payload))
        if path.read_bytes() != payload or not seen or seen[-1] != len(payload):
            raise SystemExit("pobranie")
        for name, body in (("zła suma", os.urandom(len(payload))), ("za krótki", payload[:-1]), ("za długi", payload + b"x")):
            bad = u.Update("2026.12.2", update.url, update.sha256, update.size)
            try:
                u.download(bad, folder, None, lambda _url, body=body: io.BytesIO(body))
            except ValueError:
                pass
            else:
                raise SystemExit(f"pobranie {name} przyjęte")
        left = sorted(p.name for p in folder.iterdir())
        if left != ["BitRymDym-Setup-2026.12.1.exe"]:
            raise SystemExit(f"śmieci po pobraniu: {left}")
    print("updater tests ok")


if __name__ == "__main__":
    main()

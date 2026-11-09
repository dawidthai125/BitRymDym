"""Upload a WAV into the signed-in account through the existing site routes.

No new API, no second studio, no master. The bearer is the user access token.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


SITE = "https://www.bitrymdym.pl"


def signed_put_headers(upload_token: str) -> dict[str, str]:
    """PUT goes to the signed URL. That URL already has the upload token.

    Authorization on this request is checked as an account JWT. The upload
    token is not one, so a Bearer here makes storage reject the WAV.
    The account access token stays on the site routes, not on this PUT.
    """
    if not isinstance(upload_token, str):
        raise TypeError("token wrzutki")
    return {"Content-Type": "audio/wav", "x-upsert": "false"}


def put_target(signed_url: str, upload_token: str) -> str:
    """Keep a token that is already in the signed URL. Add it only when missing."""
    token = upload_token.strip()
    if not token or "token=" in signed_url:
        return signed_url
    from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

    parts = urlsplit(signed_url)
    query = parse_qsl(parts.query, keep_blank_values=True)
    query.append(("token", token))
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def is_unauthorized(error: BaseException) -> bool:
    return "-> 401" in str(error)


def vocal_track_id(document: dict[str, Any]) -> str:
    found = vocal_track_ids(document)
    if not found:
        raise ValueError("Projekt nie ma ścieżki wokalu.")
    return found[0]


def vocal_track_ids(document: dict[str, Any]) -> list[str]:
    tracks = document.get("tracks")
    if not isinstance(tracks, list):
        raise ValueError("Projekt nie ma ścieżek.")
    found: list[str] = []
    for track in tracks:
        if isinstance(track, dict) and track.get("trackType") == "VOCAL" and track.get("id"):
            found.append(str(track["id"]))
    return found


def wav_duration_ms(wav: bytes) -> int:
    return max(1, int((len(wav) - 44) / 2 / 48_000 * 1000))


def playback_target(payload: dict[str, Any]) -> tuple[str, int | None]:
    """Signed listen URL. The recorder plays it and does not store the beat."""
    url = payload.get("url")
    if not isinstance(url, str) or not url.startswith("https://"):
        raise RuntimeError("Strona nie oddała odsłuchu.")
    limit = payload.get("previewLimitSeconds")
    seconds = limit if isinstance(limit, int) and 0 < limit <= 180 else None
    return url, seconds


def _version(payload: dict[str, Any]) -> int:
    version = payload.get("documentVersion")
    if not isinstance(version, int):
        raise RuntimeError("Strona nie oddała wersji projektu.")
    return version


def document_version(document: dict[str, Any]) -> int:
    project = document.get("project")
    if not isinstance(project, dict):
        raise ValueError("Projekt nie ma wersji.")
    version = project.get("documentVersion")
    if not isinstance(version, int):
        raise ValueError("Projekt nie ma wersji.")
    return version


def project_id(document: dict[str, Any]) -> str:
    project = document.get("project")
    if isinstance(project, dict) and project.get("id"):
        return str(project["id"])
    raise ValueError("Projekt nie ma numeru.")


class SiteClient:
    def __init__(self, site: str, access_token: str) -> None:
        self.site = site.rstrip("/")
        self.access_token = access_token

    def _json(self, method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        data = None if body is None else json.dumps(body).encode("utf-8")
        request = urllib.request.Request(
            f"{self.site}{path}",
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {self.access_token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")[:300]
            raise RuntimeError(f"{method} {path} -> {error.code} {detail}") from None
        if not isinstance(payload, dict):
            raise RuntimeError(f"{method} {path} nie zwróciło obiektu.")
        return payload

    def create_project(self, title: str, beat_id: str) -> dict[str, Any]:
        payload = self._json("POST", "/api/studio/projects", {"title": title, "beatId": beat_id})
        document = payload.get("document")
        if not isinstance(document, dict):
            raise RuntimeError("Strona nie oddała projektu.")
        return document

    def open_take(self, beat_id: str, byte_size: int) -> dict[str, Any]:
        payload = self._json(
            "POST",
            "/api/takes/session",
            {"beatId": beat_id, "contentType": "audio/wav", "byteSize": byte_size},
        )
        if not payload.get("takeId") or not payload.get("signedUrl"):
            raise RuntimeError("Strona nie oddała adresu nagrania.")
        return payload

    def put_wav(self, signed_url: str, wav: bytes, upload_token: str) -> None:
        request = urllib.request.Request(
            put_target(signed_url, upload_token),
            data=wav,
            method="PUT",
            headers=signed_put_headers(upload_token),
        )
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                if response.status not in (200, 201):
                    raise RuntimeError(f"Wrzutka WAV skończyła się kodem {response.status}.")
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")[:300]
            raise RuntimeError(f"Wrzutka WAV -> {error.code} {detail}") from None

    def finalize(self, take_id: str) -> None:
        self._json("POST", "/api/takes/finalize", {"takeId": take_id})

    def place(self, project: str, body: dict[str, Any]) -> dict[str, Any]:
        return self._json("POST", f"/api/studio/projects/{project}/record/place", body)

    def plan_usage(self) -> dict[str, Any]:
        return self._json("GET", "/api/account/plan-usage")

    def playback(self, beat_id: str) -> dict[str, Any]:
        payload = self._json("POST", "/api/beats/audio/playback", {"beatId": beat_id})
        playback_target(payload)
        return payload

    def apply_track_fx(self, project: str, track_id: str, version: int, chain: dict[str, Any]) -> dict[str, Any]:
        return self._json(
            "PATCH",
            f"/api/studio/projects/{project}/tracks/{track_id}/effects",
            {"expectedDocumentVersion": version, "chain": chain},
        )

    def add_vocal_track(self, project: str, version: int) -> tuple[str, int]:
        payload = self._json(
            "POST",
            f"/api/studio/projects/{project}/tracks",
            {"expectedDocumentVersion": version, "trackType": "VOCAL"},
        )
        track = payload.get("track")
        if not isinstance(track, dict) or not track.get("id"):
            raise RuntimeError("Strona nie oddała ścieżki wokalu.")
        return str(track["id"]), _version(payload)


def _effect_chain(chain: dict[str, Any] | None) -> dict[str, Any] | None:
    effects = chain.get("effects") if isinstance(chain, dict) else None
    if isinstance(effects, list) and effects:
        return chain
    return None


def upload_vocals(
    client: SiteClient,
    *,
    title: str,
    beat_id: str,
    wav_paths: list[Path],
    playhead_ms: int = 0,
    chain: dict[str, Any] | None = None,
) -> str:
    """One project. The site already creates Bit plus the first vocal track."""
    if not wav_paths:
        raise ValueError("Najpierw nagraj wokal.")
    blobs: list[bytes] = []
    for path in wav_paths:
        wav = path.read_bytes()
        if len(wav) < 45:
            raise ValueError("Plik WAV jest pusty.")
        blobs.append(wav)
    document = client.create_project(title, beat_id)
    pid = project_id(document)
    try:
        version = document_version(document)
        track_ids = [vocal_track_id(document)]
        for _extra in range(1, len(blobs)):
            added_id, version = client.add_vocal_track(pid, version)
            track_ids.append(added_id)
        for track_id, wav in zip(track_ids, blobs, strict=True):
            session = client.open_take(beat_id, len(wav))
            client.put_wav(str(session["signedUrl"]), wav, str(session.get("token") or ""))
            take_id = str(session["takeId"])
            client.finalize(take_id)
            placed = client.place(
                pid,
                {
                    "trackId": track_id,
                    "takeId": take_id,
                    "timelineStartMs": playhead_ms,
                    "sourceOffsetMs": 0,
                    "durationMs": wav_duration_ms(wav),
                    "expectedDocumentVersion": version,
                },
            )
            version = _version(placed)
        fx = _effect_chain(chain)
        if fx is not None:
            for track_id in track_ids:
                patched = client.apply_track_fx(pid, track_id, version, fx)
                version = _version(patched)
    except RuntimeError as error:
        raise RuntimeError(f"Projekt {pid} jest na koncie. {error}") from None
    return pid


def upload_vocal(
    client: SiteClient,
    *,
    title: str,
    beat_id: str,
    wav_path: Path,
    playhead_ms: int = 0,
    chain: dict[str, Any] | None = None,
) -> str:
    return upload_vocals(
        client,
        title=title,
        beat_id=beat_id,
        wav_paths=[wav_path],
        playhead_ms=playhead_ms,
        chain=chain,
    )


def self_test() -> None:
    headers = signed_put_headers("signed-token")
    if "Authorization" in headers or "authorization" in {key.lower() for key in headers}:
        raise SystemExit("token wrzutki")
    if headers.get("Content-Type") != "audio/wav" or headers.get("x-upsert") != "false":
        raise SystemExit("nagłówki wrzutki")
    if "Authorization" in signed_put_headers("  "):
        raise SystemExit("pusty token wrzutki")
    user = "aaa.bbb.ccc"
    if user in json.dumps(headers):
        raise SystemExit("token konta na wrzutce")
    kept = put_target("https://example.invalid/put?token=already", "other")
    if kept != "https://example.invalid/put?token=already":
        raise SystemExit("adres wrzutki")
    added = put_target("https://example.invalid/put", "signed-token")
    if "token=" not in added or "Authorization" in added:
        raise SystemExit("brak tokenu w adresie")
    try:
        playback_target({"url": "http://example.invalid/beat"})
    except RuntimeError as error:
        if "http" in str(error) or "example" in str(error):
            raise SystemExit("adres odsłuchu w błędzie") from error
    else:
        raise SystemExit("zły adres odsłuchu")
    heard, limit = playback_target({"url": "https://example.invalid/listen", "previewLimitSeconds": 20})
    if not heard.startswith("https://") or limit != 20:
        raise SystemExit("odsłuch")
    if playback_target({"url": "https://example.invalid/listen"})[1] is not None:
        raise SystemExit("pełny odsłuch")
    if not is_unauthorized(RuntimeError("GET /api/account/plan-usage -> 401 no")):
        raise SystemExit("401")
    if is_unauthorized(RuntimeError("GET /api/account/plan-usage -> 403 no")):
        raise SystemExit("403")
    _self_test_two_vocals()
    print("upload self-test ok")


class _FakeSite:
    def __init__(self) -> None:
        self.calls: list[object] = []

    def create_project(self, title: str, beat_id: str) -> dict[str, Any]:
        self.calls.append(("create", title, beat_id))
        return {
            "project": {"id": "p1", "documentVersion": 4},
            "tracks": [
                {"id": "bit", "trackType": "BEAT"},
                {"id": "v0", "trackType": "VOCAL"},
            ],
        }

    def add_vocal_track(self, project: str, version: int) -> tuple[str, int]:
        self.calls.append(("add", project, version))
        return "v1", version + 1

    def open_take(self, beat_id: str, byte_size: int) -> dict[str, Any]:
        self.calls.append(("take", beat_id, byte_size))
        return {"takeId": f"take-{len(self.calls)}", "signedUrl": "https://example.invalid/put", "token": "signed"}

    def put_wav(self, signed_url: str, wav: bytes, upload_token: str) -> None:
        if upload_token != "signed" or not signed_url.startswith("https://example.invalid/"):
            raise RuntimeError("zły token wrzutki")
        self.calls.append(("put", len(wav)))

    def finalize(self, take_id: str) -> None:
        self.calls.append(("fin", take_id))

    def place(self, project: str, body: dict[str, Any]) -> dict[str, Any]:
        self.calls.append(("place", project, body["trackId"], body["expectedDocumentVersion"]))
        return {"documentVersion": int(body["expectedDocumentVersion"]) + 1}

    def apply_track_fx(self, project: str, track_id: str, version: int, chain: dict[str, Any]) -> dict[str, Any]:
        self.calls.append(("fx", track_id, version, len(chain["effects"])))
        return {"documentVersion": version + 1}


def _self_test_two_vocals() -> None:
    folder = Path(__import__("os").environ.get("TEMP", ".")) / "bitrymdym-upload-plan"
    folder.mkdir(parents=True, exist_ok=True)
    first = folder / "a.wav"
    second = folder / "b.wav"
    first.write_bytes(b"R" * 48)
    second.write_bytes(b"R" * 96)
    fake = _FakeSite()
    chain = {"schemaVersion": 1, "effects": [{"id": "e", "type": "eq"}]}
    project = upload_vocals(fake, title="Utwór", beat_id="beat-1", wav_paths=[first, second], chain=chain)  # type: ignore[arg-type]
    if project != "p1":
        raise SystemExit("projekt")
    kinds = [item[0] for item in fake.calls if isinstance(item, tuple)]
    if kinds != ["create", "add", "take", "put", "fin", "place", "take", "put", "fin", "place", "fx", "fx"]:
        raise SystemExit(f"kolejność {kinds}")
    add = fake.calls[1]
    if not isinstance(add, tuple) or add != ("add", "p1", 4):
        raise SystemExit("dodanie ścieżki")
    place_tracks = [item[2] for item in fake.calls if isinstance(item, tuple) and item[0] == "place"]
    if place_tracks != ["v0", "v1"]:
        raise SystemExit("ułożenie wokali")
    fx_versions = [item[2] for item in fake.calls if isinstance(item, tuple) and item[0] == "fx"]
    if fx_versions != [7, 8]:
        raise SystemExit(f"wersje efektów {fx_versions}")
    one = _FakeSite()
    upload_vocal(one, title="Solo", beat_id="beat-1", wav_path=first)  # type: ignore[arg-type]
    one_kinds = [item[0] for item in one.calls if isinstance(item, tuple)]
    if "add" in one_kinds or one_kinds[-1] != "place":
        raise SystemExit("jeden wokal")
    first.unlink(missing_ok=True)
    second.unlink(missing_ok=True)


if __name__ == "__main__":
    self_test()

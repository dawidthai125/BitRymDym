"""Upload a WAV into the signed-in account through the existing site routes.

No new API, no second studio, no master. The bearer is the user access token.
"""

from __future__ import annotations

import json
import socket
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable

from desk import wav_data_offset


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


NETWORK_ERRORS = (urllib.error.URLError, TimeoutError, ConnectionError, socket.timeout, OSError)


def network_message(error: BaseException) -> str:
    """Plain Polish text for a dropped connection. No URL, no socket detail."""
    reason = getattr(error, "reason", error)
    if isinstance(reason, (TimeoutError, socket.timeout)):
        return "Strona nie odpowiada na czas. Sprawdź internet i spróbuj jeszcze raz."
    return "Brak połączenia ze stroną. Sprawdź internet i spróbuj jeszcze raz."


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
    offset = wav_data_offset(wav[:4096]) or 44
    return max(1, int((len(wav) - offset) / 2 / 48_000 * 1000))


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
        except NETWORK_ERRORS as error:
            raise RuntimeError(network_message(error)) from None
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
        except NETWORK_ERRORS as error:
            raise RuntimeError(network_message(error)) from None

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


@dataclass
class UploadState:
    """Where a send stopped. It holds no token, only ids and file paths, so it can live on disk."""

    project_id: str
    beat_id: str
    title: str
    version: int
    wav_paths: list[str]
    track_ids: list[str] = field(default_factory=list)
    placed: int = 0
    fx_done: int = 0
    # Timeline mode: wav_paths are clips. track_of[i] is the vocal track, starts_ms[i] the place.
    track_of: list[int] = field(default_factory=list)
    starts_ms: list[int] = field(default_factory=list)

    def to_json(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_json(cls, raw: object) -> "UploadState | None":
        if not isinstance(raw, dict):
            return None
        try:
            paths = [str(item) for item in raw["wav_paths"]]
            state = cls(
                project_id=str(raw["project_id"]),
                beat_id=str(raw["beat_id"]),
                title=str(raw["title"]),
                version=int(raw["version"]),
                wav_paths=paths,
                track_ids=[str(item) for item in raw.get("track_ids", [])],
                placed=int(raw.get("placed", 0)),
                fx_done=int(raw.get("fx_done", 0)),
                track_of=[int(item) for item in raw.get("track_of", [])],
                starts_ms=[int(item) for item in raw.get("starts_ms", [])],
            )
        except (KeyError, TypeError, ValueError):
            return None
        if not state.project_id or not paths or state.placed > len(paths) or state.fx_done > len(paths):
            return None
        if state.track_of and (len(state.track_of) != len(paths) or len(state.starts_ms) != len(paths)):
            return None
        return state

    def summary(self) -> str:
        noun = "klipów" if self.track_of else "ścieżek"
        return f"projekt {self.project_id}: {self.placed} z {len(self.wav_paths)} {noun}"


def upload_vocals(
    client: SiteClient,
    *,
    title: str,
    beat_id: str,
    wav_paths: list[Path],
    playhead_ms: int = 0,
    chain: dict[str, Any] | None = None,
    progress: Callable[[str], None] | None = None,
    resume: UploadState | None = None,
    on_state: Callable[[UploadState], None] | None = None,
    track_of: list[int] | None = None,
    starts_ms: list[int] | None = None,
) -> str:
    """One project.

    Without track_of every WAV is its own vocal track at playhead_ms. With track_of (timeline
    mode) every WAV is one clip: track_of[i] picks the vocal track, starts_ms[i] the place. The site already creates Bit plus the first vocal track.

    With resume the send continues the same project from the first track that is not placed yet
    (and the first effect not applied yet). No second project, no duplicate tracks.
    """

    def say(text: str) -> None:
        if progress is not None:
            progress(text)

    def saved(item: UploadState) -> None:
        if on_state is not None:
            on_state(item)

    if not wav_paths:
        raise ValueError("Najpierw nagraj wokal.")
    blobs: list[bytes] = []
    for path in wav_paths:
        wav = path.read_bytes()
        if len(wav) < 45:
            raise ValueError("Plik WAV jest pusty.")
        blobs.append(wav)
    if resume is not None and [str(path) for path in wav_paths] != resume.wav_paths:
        raise ValueError("Ścieżki do wysłania nie zgadzają się z przerwaną wysyłką.")
    lanes = list(track_of) if track_of is not None else list(range(len(wav_paths)))
    starts = list(starts_ms) if starts_ms is not None else [playhead_ms] * len(wav_paths)
    if len(lanes) != len(wav_paths) or len(starts) != len(wav_paths) or min(lanes) < 0:
        raise ValueError("Klipy nie zgadzają się ze ścieżkami.")
    track_count = max(lanes) + 1
    clip_mode = track_of is not None
    noun = "klip" if clip_mode else "ścieżkę"
    if resume is None:
        say("Tworzę projekt na koncie.")
        document = client.create_project(title, beat_id)
        state = UploadState(
            project_id=project_id(document),
            beat_id=beat_id,
            title=title,
            version=document_version(document),
            wav_paths=[str(path) for path in wav_paths],
            track_ids=[vocal_track_id(document)],
            track_of=lanes if clip_mode else [],
            starts_ms=starts if clip_mode else [],
        )
        saved(state)
    else:
        say(f"Dokańczam wysyłkę: {resume.summary()}.")
        state = resume
    pid = state.project_id
    try:
        while len(state.track_ids) < track_count:
            say(f"Dodaję ścieżkę wokalu {len(state.track_ids) + 1} z {track_count}.")
            added_id, state.version = client.add_vocal_track(pid, state.version)
            state.track_ids.append(added_id)
            saved(state)
        for index in range(state.placed, len(blobs)):
            wav = blobs[index]
            say(f"Wysyłam {noun} {index + 1} z {len(blobs)} ({len(wav) / 1_000_000:.1f} MB).")
            session = client.open_take(state.beat_id, len(wav))
            client.put_wav(str(session["signedUrl"]), wav, str(session.get("token") or ""))
            take_id = str(session["takeId"])
            client.finalize(take_id)
            placed = client.place(
                pid,
                {
                    "trackId": state.track_ids[lanes[index]],
                    "takeId": take_id,
                    "timelineStartMs": starts[index],
                    "sourceOffsetMs": 0,
                    "durationMs": wav_duration_ms(wav),
                    "expectedDocumentVersion": state.version,
                },
            )
            state.version = _version(placed)
            state.placed = index + 1
            saved(state)
        fx = _effect_chain(chain)
        if fx is not None:
            if state.fx_done < track_count:
                say("Zapisuję efekty na ścieżkach.")
            for index in range(state.fx_done, track_count):
                patched = client.apply_track_fx(pid, state.track_ids[index], state.version, fx)
                state.version = _version(patched)
                state.fx_done = index + 1
                saved(state)
    except RuntimeError as error:
        unit = "klipów" if clip_mode else "ścieżek"
        raise RuntimeError(f"Projekt {pid} jest na koncie ({state.placed} z {len(blobs)} {unit}). {error}") from None
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
    leaked = network_message(urllib.error.URLError("getaddrinfo failed 10.0.0.1"))
    if "getaddrinfo" in leaked or "10.0.0.1" in leaked or "połączenia" not in leaked:
        raise SystemExit("komunikat sieci")
    if "na czas" not in network_message(TimeoutError("timed out")):
        raise SystemExit("komunikat limitu czasu")
    head = (
        b"RIFF" + (4000 + 70).to_bytes(4, "little") + b"WAVEfmt " + (16).to_bytes(4, "little") + bytes(16)
        + b"LIST" + (26).to_bytes(4, "little") + bytes(26) + b"data" + (96000).to_bytes(4, "little")
    )
    if wav_duration_ms(head + bytes(96000)) != 1000 or wav_duration_ms(b"R" * 48) != 1:
        raise SystemExit("czas WAV z nagłówkiem ffmpeg (78 B)")
    _self_test_two_vocals()
    _self_test_resume()
    _self_test_clips()
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
        self.calls.append(("place", project, body["trackId"], body["expectedDocumentVersion"], body["timelineStartMs"]))
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
    steps: list[str] = []
    project = upload_vocals(
        fake,  # type: ignore[arg-type]
        title="Utwór",
        beat_id="beat-1",
        wav_paths=[first, second],
        chain=chain,
        progress=steps.append,
    )
    if steps[0] != "Tworzę projekt na koncie." or not any("ścieżkę 2 z 2" in step for step in steps):
        raise SystemExit(f"postęp {steps}")
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


def _self_test_resume() -> None:
    folder = Path(__import__("os").environ.get("TEMP", ".")) / "bitrymdym-upload-resume"
    folder.mkdir(parents=True, exist_ok=True)
    first = folder / "a.wav"
    second = folder / "b.wav"
    first.write_bytes(b"R" * 48)
    second.write_bytes(b"R" * 96)

    class Flaky(_FakeSite):
        failures = 1

        def put_wav(self, signed_url: str, wav: bytes, upload_token: str) -> None:
            if len(wav) == 96 and self.failures:
                self.failures -= 1
                raise RuntimeError(network_message(OSError("x")))
            super().put_wav(signed_url, wav, upload_token)

    site = Flaky()
    last: list[UploadState] = []
    chain = {"schemaVersion": 1, "effects": [{"id": "e", "type": "eq"}]}
    try:
        upload_vocals(site, title="T", beat_id="b1", wav_paths=[first, second], chain=chain, on_state=last.append)  # type: ignore[arg-type]
    except RuntimeError as error:
        if "1 z 2" not in str(error) or "Projekt p1" not in str(error):
            raise SystemExit(f"komunikat przerwanej wysyłki: {error}") from error
    else:
        raise SystemExit("wysyłka miała się przerwać")
    state = last[-1]
    if state.placed != 1 or len(state.track_ids) != 2 or state.fx_done != 0:
        raise SystemExit(f"stan przerwania {state}")
    restored = UploadState.from_json(json.loads(json.dumps(state.to_json())))
    if restored is None or restored != state:
        raise SystemExit("zapis stanu")
    for bad in (None, {}, {"project_id": "", "beat_id": "b", "title": "t", "version": 1, "wav_paths": ["x"]},
                {"project_id": "p", "beat_id": "b", "title": "t", "version": 1, "wav_paths": ["x"], "placed": 3}):
        if UploadState.from_json(bad) is not None:
            raise SystemExit(f"zły stan przyjęty {bad}")
    steps: list[str] = []
    project = upload_vocals(
        site,  # type: ignore[arg-type]
        title="T",
        beat_id="b1",
        wav_paths=[first, second],
        chain=chain,
        progress=steps.append,
        resume=restored,
        on_state=last.append,
    )
    kinds = [item[0] for item in site.calls if isinstance(item, tuple)]
    if project != "p1" or kinds.count("create") != 1 or kinds.count("add") != 1 or kinds.count("place") != 2 or kinds.count("fx") != 2:
        raise SystemExit(f"wznowienie powieliło kroki {kinds}")
    if not steps[0].startswith("Dokańczam wysyłkę") or last[-1].placed != 2 or last[-1].fx_done != 2:
        raise SystemExit(f"wznowienie: postęp {steps} {last[-1]}")
    try:
        upload_vocals(site, title="T", beat_id="b1", wav_paths=[first], resume=restored)  # type: ignore[arg-type]
    except ValueError:
        pass
    else:
        raise SystemExit("inne ścieżki nie mogą wznowić cudzej wysyłki")
    first.unlink(missing_ok=True)
    second.unlink(missing_ok=True)


def _self_test_clips() -> None:
    folder = Path(__import__("os").environ.get("TEMP", ".")) / "bitrymdym-upload-clips"
    folder.mkdir(parents=True, exist_ok=True)
    clips = [folder / f"k{index}.wav" for index in range(3)]
    for clip in clips:
        clip.write_bytes(b"R" * 48)
    fake = _FakeSite()
    last: list[UploadState] = []
    upload_vocals(
        fake,  # type: ignore[arg-type]
        title="Klipy",
        beat_id="b1",
        wav_paths=clips,
        track_of=[0, 0, 1],
        starts_ms=[0, 4000, 1500],
        on_state=last.append,
    )
    kinds = [item[0] for item in fake.calls if isinstance(item, tuple)]
    if kinds.count("add") != 1 or kinds.count("place") != 3:
        raise SystemExit(f"klipy: kroki {kinds}")
    placed = [(item[2], item[4]) for item in fake.calls if isinstance(item, tuple) and item[0] == "place"]
    if placed != [("v0", 0), ("v0", 4000), ("v1", 1500)]:
        raise SystemExit(f"klipy: ułożenie {placed}")
    restored = UploadState.from_json(json.loads(json.dumps(last[-1].to_json())))
    if restored is None or restored.track_of != [0, 0, 1] or restored.starts_ms != [0, 4000, 1500]:
        raise SystemExit("klipy: zapis stanu")
    try:
        upload_vocals(fake, title="x", beat_id="b", wav_paths=clips, track_of=[0], starts_ms=[0])  # type: ignore[arg-type]
    except ValueError:
        pass
    else:
        raise SystemExit("klipy: zła liczba")
    for clip in clips:
        clip.unlink(missing_ok=True)


if __name__ == "__main__":
    self_test()

"""Upload a WAV into the signed-in account through the existing site routes.

No new API, no second studio, no master. The bearer is the user access token.
"""

from __future__ import annotations

import io
import json
import re
import socket
import urllib.error
import urllib.request
import wave
from dataclasses import asdict, dataclass, field, replace
from pathlib import Path
from typing import Any, Callable

from desk import wav_data_offset


SITE = "https://www.bitrymdym.pl"
# The upload cannot go on: the project is gone, changed on the site, or belongs to another account.
STALE_SEND = "Poprzedniej wysyłki nie da się dokończyć"


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


def padded_wav(wav: bytes) -> bytes:
    """The WAV with silence up to the next whole second.

    The site stores a take's length rounded to whole seconds and cuts the clip to it: 4.4 s would lose
    0.4 s of voice and 0.4 s would be refused. The clip itself keeps its exact durationMs.
    """
    offset = wav_data_offset(wav[:4096])
    if offset is None or wav[:4] != b"RIFF":
        return wav
    pcm = wav[offset:]
    frames = len(pcm) // 2
    whole = max(1, -(-frames // 48_000)) * 48_000
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(48_000)
        handle.writeframes(pcm[: frames * 2] + bytes((whole - frames) * 2))
    return buffer.getvalue()


def error_body(text: str) -> tuple[int, str, str]:
    """(HTTP status, code, error text) from a SiteClient error. Zeros and blanks when it is not one."""
    found = re.search(r" -> (\d{3}) ?(.*)$", text, re.S)
    if not found:
        return 0, "", ""
    try:
        data = json.loads(found.group(2))
    except ValueError:
        data = None
    if not isinstance(data, dict):
        return int(found.group(1)), "", ""
    return int(found.group(1)), str(data.get("code") or ""), str(data.get("error") or "")


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
    def __init__(self, site: str, access_token: str, refresh: Callable[[], str] | None = None) -> None:
        self.site = site.rstrip("/")
        self.access_token = access_token
        self._refresh = refresh

    def _json(self, method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """One request. A login that ran out in the middle of a long send is renewed once."""
        try:
            return self._request(method, path, body)
        except RuntimeError as error:
            if self._refresh is None or not is_unauthorized(error):
                raise
            self.access_token = self._refresh()
            return self._request(method, path, body)

    def _request(self, method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        data = None if body is None else json.dumps(body).encode("utf-8")
        request = urllib.request.Request(
            f"{self.site}{path}",
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {self.access_token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "BitRymDymRecorder",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")[:2000]
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

    def project_document(self, project: str) -> dict[str, Any]:
        document = self._json("GET", f"/api/studio/projects/{project}").get("document")
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

    def desktop_send(self, spend: bool) -> dict[str, Any]:
        """Daily "Wrzuć do Studia" counter of the Windows recorder. spend=False only reads it."""
        return self._json("POST" if spend else "GET", "/api/desktop/studio-send")

    def desktop_send_refund(self, send_id: str) -> bool:
        """Gives one daily send back (upload failed, nothing to resume). Never raises."""
        if not send_id:
            return False
        try:
            return bool(self._json("DELETE", "/api/desktop/studio-send", {"sendId": send_id}).get("refunded"))
        except Exception:
            return False

    def delete_take(self, take_id: str) -> None:
        """Drops a half-sent take so it no longer holds the single recording session. Never raises."""
        try:
            self._json("POST", "/api/takes/delete", {"takeId": take_id})
        except Exception:
            pass

    def delete_project(self, project: str) -> bool:
        """Drops an empty project left by a failed send. True when it is gone. Never raises."""
        try:
            self._json("DELETE", f"/api/studio/projects/{project}")
        except Exception as error:
            return error_body(str(error))[0] == 404
        return True

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
    # Timeline mode sends every take first and makes the project only after that.
    take_ids: list[str] = field(default_factory=list)
    # Windows recorder daily send (POST /api/desktop/studio-send), spent once per send.
    send_id: str = ""
    # Account e-mail of the send. Another account must not continue it.
    account: str = ""

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
                take_ids=[str(item) for item in raw.get("take_ids", [])],
                send_id=str(raw.get("send_id") or ""),
                account=str(raw.get("account") or ""),
            )
        except (KeyError, TypeError, ValueError):
            return None
        if not paths or state.placed > len(paths) or state.fx_done > len(paths) or len(state.take_ids) > len(paths):
            return None
        if not state.project_id and not state.track_of:
            return None
        if state.track_of and (len(state.track_of) != len(paths) or len(state.starts_ms) != len(paths)):
            return None
        return state

    def summary(self) -> str:
        if self.track_of and not self.project_id:
            return f"wysłane nagrania: {len(self.take_ids)} z {len(self.wav_paths)}, projektu jeszcze nie ma"
        noun = "klipów" if self.track_of else "ścieżek"
        return f"projekt {self.project_id}: {self.placed} z {len(self.wav_paths)} {noun}"


def give_back_send(client: Any, state: "UploadState | None", send_id: str) -> tuple[bool, "UploadState | None"]:
    """After a failed upload: return the daily send to the account.

    True when the site took it back. A saved resume state keeps its clips but loses the send id,
    so the next send claims a fresh one instead of reusing a refunded id.
    """
    if not send_id or not client.desktop_send_refund(send_id):
        return False, state
    if state is not None and state.send_id == send_id:
        state = replace(state, send_id="")
    return True, state


def send_one_take(client: Any, beat_id: str, wav: bytes) -> str:
    """Opens a take, uploads and finalizes it. When that fails, the half-sent take is deleted,
    otherwise it keeps the only recording session and the next try gets 409 CONCURRENT_SESSION."""
    session = client.open_take(beat_id, len(wav))
    take_id = str(session["takeId"])
    try:
        client.put_wav(str(session["signedUrl"]), wav, str(session.get("token") or ""))
        client.finalize(take_id)
    except BaseException:
        client.delete_take(take_id)
        raise
    return take_id


def drop_empty_project(client: Any, state: "UploadState | None") -> "UploadState | None":
    """A failed send that placed nothing leaves an empty project and a resume state with no value.
    Delete the project and forget the state (the clips stay on the desk, the user presses Gotowe again).
    When the delete did not go through (no network), the state stays: the next try continues that project
    with the same daily send instead of paying for a second one."""
    if state is None or state.placed > 0 or not state.project_id:
        return state
    return None if client.delete_project(state.project_id) else state


def refreshed_state(client: Any, state: "UploadState") -> "UploadState":
    """A send that continues an existing project: its version and tracks as they are on the site now."""
    if not state.project_id:
        return state
    try:
        document = client.project_document(state.project_id)
    except RuntimeError as error:
        if error_body(str(error))[0] in (403, 404):
            raise RuntimeError(f"{STALE_SEND}: projektu nie ma już na koncie. Naciśnij Gotowe jeszcze raz, żeby wysłać od nowa.") from None
        raise
    known = vocal_track_ids(document)
    if any(track not in known for track in state.track_ids):
        raise RuntimeError(f"{STALE_SEND}: w projekcie na stronie brakuje ścieżki. Naciśnij Gotowe jeszcze raz, żeby wysłać od nowa.")
    return replace(state, version=document_version(document))


def _place_take(client: Any, state: "UploadState", index: int, wav: bytes, body: dict[str, Any], saved: Callable[["UploadState"], None]) -> dict[str, Any]:
    """Place one take. A take sent in an earlier try may have expired on the site: send it once more."""
    try:
        return client.place(state.project_id, {**body, "takeId": state.take_ids[index]})
    except RuntimeError as error:
        status, code, _text = error_body(str(error))
        if status not in (403, 404) or code:
            raise
        state.take_ids = state.take_ids[:index]
        state.take_ids.append(send_one_take(client, state.beat_id, padded_wav(wav)))
        saved(state)
        return client.place(state.project_id, {**body, "takeId": state.take_ids[index]})


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
    send_id: str = "",
    account: str = "",
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
    if clip_mode:
        return _upload_timeline(client, title, beat_id, wav_paths, blobs, lanes, starts, chain, say, saved, resume, send_id, account)
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
            send_id=send_id,
        )
        saved(state)
    else:
        say(f"Dokańczam wysyłkę: {resume.summary()}.")
        state = _with_send(resume, send_id)
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
            take_id = send_one_take(client, state.beat_id, padded_wav(wav))
            placed = client.place(
                pid,
                {
                    "trackId": state.track_ids[lanes[index]],
                    "takeId": take_id,
                    "timelineStartMs": starts[index],
                    "sourceOffsetMs": 0,
                    "durationMs": wav_duration_ms(wav),
                    "expectedDocumentVersion": state.version,
                    **_send_field(state.send_id),
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


def _upload_timeline(
    client: SiteClient,
    title: str,
    beat_id: str,
    wav_paths: list[Path],
    blobs: list[bytes],
    lanes: list[int],
    starts: list[int],
    chain: dict[str, Any] | None,
    say: Callable[[str], None],
    saved: Callable[[UploadState], None],
    resume: UploadState | None,
    send_id: str = "",
    account: str = "",
) -> str:
    """One recorder send: project, tracks, then each take uploaded and placed at once."""
    if resume is not None:
        say(f"Dokańczam wysyłkę: {resume.summary()}.")
        resume = refreshed_state(client, resume)
    state = _with_send(resume, send_id) if resume is not None else UploadState(
        project_id="",
        beat_id=beat_id,
        title=title,
        version=0,
        wav_paths=[str(path) for path in wav_paths],
        track_of=list(lanes),
        starts_ms=list(starts),
        send_id=send_id,
        account=account,
    )
    track_count = max(lanes) + 1
    # Project first, then take by take: each take is placed at once, so loose READY takes
    # never pile up against the plan's active-take cap. The daily limit is the send itself.
    if not state.project_id:
        say("Tworzę projekt na koncie.")
        document = client.create_project(state.title, state.beat_id)
        state.project_id = project_id(document)
        state.version = document_version(document)
        state.track_ids = [vocal_track_id(document)]
        saved(state)
    pid = state.project_id
    try:
        while len(state.track_ids) < track_count:
            say(f"Dodaję ścieżkę wokalu {len(state.track_ids) + 1} z {track_count}.")
            added_id, state.version = client.add_vocal_track(pid, state.version)
            state.track_ids.append(added_id)
            saved(state)
        for index in range(state.placed, len(blobs)):
            wav = blobs[index]
            if len(state.take_ids) <= index:
                say(f"Wysyłam nagranie {index + 1} z {len(blobs)} ({len(wav) / 1_000_000:.1f} MB).")
                take_id = send_one_take(client, state.beat_id, padded_wav(wav))
                state.take_ids.append(take_id)
                saved(state)
            placed = _place_take(
                client,
                state,
                index,
                wav,
                {
                    "trackId": state.track_ids[lanes[index]],
                    "timelineStartMs": starts[index],
                    "sourceOffsetMs": 0,
                    "durationMs": wav_duration_ms(wav),
                    "expectedDocumentVersion": state.version,
                    **_send_field(state.send_id),
                },
                saved,
            )
            state.version = _version(placed)
            state.placed = index + 1
            saved(state)
        fx = _effect_chain(chain)
        if fx is not None:
            for index in range(state.fx_done, track_count):
                patched = client.apply_track_fx(pid, state.track_ids[index], state.version, fx)
                state.version = _version(patched)
                state.fx_done = index + 1
                saved(state)
    except RuntimeError as error:
        raise RuntimeError(f"Projekt {pid} jest na koncie ({state.placed} z {len(blobs)} nagrań ułożonych). {error}") from None
    return pid


def _send_field(send_id: str) -> dict[str, str]:
    """record/place binds exactly this daily send (site 2026-11-22). Empty id: field left out."""
    return {"sendId": send_id} if send_id else {}


def _with_send(state: UploadState, send_id: str) -> UploadState:
    """A resumed send that just claimed a fresh daily send carries that id from now on."""
    if send_id and state.send_id != send_id:
        state.send_id = send_id
    return state


def forget_spent_send(state: "UploadState | None", message: str) -> "UploadState | None":
    """record/place said DESKTOP_SEND_REQUIRED: the held send expired or is bound elsewhere.
    The resume state keeps its clips but drops the id, so the next send claims a fresh one."""
    if state is None or not state.send_id or "DESKTOP_SEND_REQUIRED" not in message:
        return state
    return replace(state, send_id="")


def friendly_upload_error(text: str) -> str:
    """Site limit codes in plain Polish. Other text stays as it is."""
    if "DESKTOP_SEND_REQUIRED" in text:
        return (
            "Ta wysyłka do Studia wygasła albo poszła już do innego projektu. "
            "Kliknij jeszcze raz Gotowe i Wrzuć do Studia: program weźmie nową wysyłkę z dziennego limitu "
            "i dokończy ten projekt."
        )
    if "desktop_send_limit" in text:
        return "Na dziś wysyłki do Studia z programu są wykorzystane. Nagrania zostają w programie; wyślij je jutro."
    if "SESSION_DAY_CAP" in text:
        head = text.split(" POST ", 1)[0].split(" Wrzutka", 1)[0].strip()
        return (
            f"{head} Dzienny limit wysyłek nagrań w Twoim planie jest na dziś wyczerpany "
            "(każda ścieżka z nagraniem to jedna wysyłka). Spróbuj jutro albo wyślij mniej ścieżek."
        ).strip()
    head = re.split(r" ?(?:GET|POST|PATCH|DELETE) /api/", text, maxsplit=1)[0].strip()
    if "ACTIVE_READY_CAP" in text or "REPLACE_REQUIRED" in text:
        return f"{head} Masz za dużo gotowych nagrań czekających na koncie. Użyj ich w Studio albo usuń stare.".strip()
    if "CONCURRENT_SESSION" in text:
        return f"{head} Na koncie trwa inne nagrywanie albo wysyłka. Zamknij ją na stronie lub odczekaj 15 minut.".strip()
    status, _code, said = error_body(text)
    if status == 503 and not said:
        return f"{head} Strona ma przerwę. Spróbuj za kilka minut.".strip()
    if status == 429 and not said:
        return f"{head} Za dużo prób naraz. Odczekaj minutę i spróbuj jeszcze raz.".strip()
    if status and said:
        return f"{head} {said}".strip()
    if status:
        return f"{head} Strona odrzuciła wysyłkę (kod {status}). Spróbuj za chwilę.".strip()
    return text


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
    def project_document(self, project: str) -> dict[str, Any]:
        self.calls.append(("doc", project))
        return {
            "project": {"id": project, "documentVersion": 40},
            "tracks": [{"id": item, "trackType": "VOCAL"} for item in ("v0", "v1")],
        }

    def delete_take(self, take_id: str) -> None:
        pass

    def delete_project(self, project: str) -> bool:
        return True

    def __init__(self) -> None:
        self.calls: list[object] = []
        self.send_ids: list[object] = []

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
        self.send_ids.append(body.get("sendId"))
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


_CLIP_STATES: list[dict[str, Any]] = []


def states_first(_fake: object) -> dict[str, Any]:
    return dict(_CLIP_STATES[0])


def _self_test_clips() -> None:
    folder = Path(__import__("os").environ.get("TEMP", ".")) / "bitrymdym-upload-clips"
    folder.mkdir(parents=True, exist_ok=True)
    clips = [folder / f"k{index}.wav" for index in range(3)]
    for clip in clips:
        clip.write_bytes(b"R" * 48)
    fake = _FakeSite()
    last: list[UploadState] = []
    _CLIP_STATES.clear()
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
    if kinds.count("add") != 1 or kinds.count("place") != 3 or kinds.index("create") > kinds.index("take") or kinds[kinds.index("fin") + 1] != "place":
        raise SystemExit(f"klipy: kroki {kinds}")
    placed = [(item[2], item[4]) for item in fake.calls if isinstance(item, tuple) and item[0] == "place"]
    if placed != [("v0", 0), ("v0", 4000), ("v1", 1500)]:
        raise SystemExit(f"klipy: ułożenie {placed}")
    _CLIP_STATES.append(last[-1].to_json())
    restored = UploadState.from_json(json.loads(json.dumps(last[-1].to_json())))
    if restored is None or restored.track_of != [0, 0, 1] or restored.starts_ms != [0, 4000, 1500]:
        raise SystemExit("klipy: zapis stanu")
    try:
        upload_vocals(fake, title="x", beat_id="b", wav_paths=clips, track_of=[0], starts_ms=[0])  # type: ignore[arg-type]
    except ValueError:
        pass
    else:
        raise SystemExit("klipy: zła liczba")

    if "Na dziś wysyłki" not in friendly_upload_error('POST /api/desktop/studio-send -> 429 {"error":"desktop_send_limit"}'):
        raise SystemExit("limit wysyłek: komunikat")
    state = UploadState.from_json({**states_first(fake), "send_id": "s1"})
    if state is None or state.send_id != "s1":
        raise SystemExit("limit wysyłek: zapis send_id")
    _self_test_send_id_on_place(clips)
    for clip in clips:
        clip.unlink(missing_ok=True)
    _self_test_send_refund()
    _self_test_failed_send_cleanup()


def _self_test_send_id_on_place(clips: list[Path]) -> None:
    """Every record/place carries the claimed daily send; a resume takes over a fresh one."""
    sid = "0f0e0d0c-0b0a-4908-8706-050403020100"
    fake = _FakeSite()
    last: list[UploadState] = []
    upload_vocals(fake, title="K", beat_id="b1", wav_paths=clips, track_of=[0, 0, 1], starts_ms=[0, 1, 2], send_id=sid, on_state=last.append)  # type: ignore[arg-type]
    if fake.send_ids != [sid, sid, sid] or last[-1].send_id != sid:
        raise SystemExit(f"limit wysyłek: sendId przy wstawianiu {fake.send_ids}")
    fake = _FakeSite()
    upload_vocals(fake, title="K", beat_id="b1", wav_paths=clips, track_of=[0, 0, 1], starts_ms=[0, 1, 2])  # type: ignore[arg-type]
    if fake.send_ids != [None, None, None]:
        raise SystemExit("limit wysyłek: bez identyfikatora pole sendId nie jedzie")
    fresh = "11111111-2222-4333-8444-555555555555"
    stale = replace(last[-1], placed=1, send_id="")
    fake = _FakeSite()
    upload_vocals(fake, title="K", beat_id="b1", wav_paths=clips, track_of=[0, 0, 1], starts_ms=[0, 1, 2], resume=stale, send_id=fresh)  # type: ignore[arg-type]
    if fake.send_ids != [fresh, fresh]:
        raise SystemExit(f"limit wysyłek: wznowienie z nową wysyłką {fake.send_ids}")
    held = replace(last[-1], send_id=sid)
    gone = forget_spent_send(held, 'POST /x/record/place -> 429 {"error":"desktop_send_limit","code":"DESKTOP_SEND_REQUIRED"}')
    if gone is None or gone.send_id != "" or gone.wav_paths != held.wav_paths:
        raise SystemExit("limit wysyłek: DESKTOP_SEND_REQUIRED zdejmuje identyfikator")
    if forget_spent_send(held, "POST -> 500 inne") is not held or forget_spent_send(None, "DESKTOP_SEND_REQUIRED") is not None:
        raise SystemExit("limit wysyłek: inne błędy nie ruszają stanu")
    text = friendly_upload_error('POST /api/studio/projects/p/record/place -> 429 {"error":"desktop_send_limit","code":"DESKTOP_SEND_REQUIRED"}')
    if "wygasła" not in text or "Na dziś" in text:
        raise SystemExit("limit wysyłek: komunikat DESKTOP_SEND_REQUIRED")


def _self_test_send_refund() -> None:
    """Refund of a spent daily send: true only when the site says so, never raises."""
    calls: list[tuple[str, str, Any]] = []

    class _Fake:
        reply: Any = {"refunded": True}

        def _json(self, method: str, path: str, body: Any = None) -> dict[str, Any]:
            calls.append((method, path, body))
            if isinstance(self.reply, Exception):
                raise self.reply
            return self.reply

    fake = _Fake()
    refund = SiteClient.desktop_send_refund
    if refund(fake, "") is not False or calls:  # type: ignore[arg-type]
        raise SystemExit("zwrot wysyłki: pusty identyfikator")
    if refund(fake, "abc") is not True or calls[-1] != ("DELETE", "/api/desktop/studio-send", {"sendId": "abc"}):  # type: ignore[arg-type]
        raise SystemExit("zwrot wysyłki: wywołanie")
    fake.reply = {"refunded": False}
    if refund(fake, "abc") is not False:  # type: ignore[arg-type]
        raise SystemExit("zwrot wysyłki: odmowa")
    fake.reply = RuntimeError("sieć")
    if refund(fake, "abc") is not False:  # type: ignore[arg-type]
        raise SystemExit("zwrot wysyłki: błąd sieci")
    fake.reply = {"refunded": True}
    ok, kept = give_back_send(_Refunder(True), None, "s1")
    if not ok or kept is not None:
        raise SystemExit("give_back_send: bez stanu")
    state = UploadState(project_id="p", beat_id="b", title="t", version=1, wav_paths=["a.wav"], send_id="s1")
    ok, kept = give_back_send(_Refunder(True), state, "s1")
    if not ok or kept is None or kept.send_id != "" or kept.wav_paths != ["a.wav"]:
        raise SystemExit("give_back_send: stan do wznowienia ma zostać bez identyfikatora wysyłki")
    ok, kept = give_back_send(_Refunder(False), state, "s1")
    if ok or kept is not state or kept.send_id != "s1":
        raise SystemExit("give_back_send: odmowa serwera ma zostawić stan")
    ok, kept = give_back_send(_Refunder(True), state, "inna")
    if not ok or kept is not state:
        raise SystemExit("give_back_send: cudzy identyfikator nie rusza stanu")
    ok, _ = give_back_send(_Refunder(True), state, "")
    if ok:
        raise SystemExit("give_back_send: pusty identyfikator")


class _Refunder:
    def __init__(self, result: bool) -> None:
        self.result = result

    def desktop_send_refund(self, send_id: str) -> bool:
        return self.result and bool(send_id)


def _self_test_failed_send_cleanup() -> None:
    """A failed upload deletes its half-sent take and the empty project."""
    deleted_takes: list[str] = []
    deleted_projects: list[str] = []

    class _Broken:
        def open_take(self, beat_id: str, byte_size: int) -> dict[str, Any]:
            return {"takeId": "t1", "signedUrl": "u"}

        def put_wav(self, signed_url: str, wav: bytes, upload_token: str) -> None:
            raise RuntimeError("siec")

        def finalize(self, take_id: str) -> None:
            raise AssertionError("no finalize")

        def delete_take(self, take_id: str) -> None:
            deleted_takes.append(take_id)

        def delete_project(self, project: str) -> bool:
            deleted_projects.append(project)
            return True

    try:
        send_one_take(_Broken(), "b", b"x" * 50)
    except RuntimeError:
        pass
    assert deleted_takes == ["t1"], deleted_takes
    empty = UploadState(project_id="p1", beat_id="b", title="t", version=1, wav_paths=["a.wav"], track_of=[0], starts_ms=[0])
    assert drop_empty_project(_Broken(), empty) is None and deleted_projects == ["p1"]
    kept = replace(empty, placed=1)
    assert drop_empty_project(_Broken(), kept) is kept and deleted_projects == ["p1"]

    class _Offline(_Broken):
        def delete_project(self, project: str) -> bool:
            return False

    assert drop_empty_project(_Offline(), empty) is empty
    _self_test_stale_resume()


def _self_test_stale_resume() -> None:
    """Resume reads the project again; an expired take is sent once more; padding and messages."""
    folder = Path(__import__("os").environ.get("TEMP", ".")) / "bitrymdym-upload-stale"
    folder.mkdir(parents=True, exist_ok=True)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(48_000)
        handle.writeframes(b"\x01\x00" * 211_200)
    short = buffer.getvalue()
    grown = padded_wav(short)
    if wav_duration_ms(short) != 4400 or wav_duration_ms(grown) != 5000 or wav_duration_ms(padded_wav(grown)) != 5000:
        raise SystemExit("dopełnienie do pełnej sekundy")
    if grown[44 : 44 + 422_400] != b"\x01\x00" * 211_200 or any(grown[44 + 422_400 :]):
        raise SystemExit("dopełnienie zmieniło nagranie")
    clip = folder / "a.wav"
    clip.write_bytes(short)
    state = UploadState(
        project_id="p1", beat_id="b", title="t", version=3, wav_paths=[str(clip)], track_ids=["v0"],
        track_of=[0], starts_ms=[0], take_ids=["old"], send_id="s",
    )

    class Expired(_FakeSite):
        def place(self, project: str, body: dict[str, Any]) -> dict[str, Any]:
            if body["takeId"] == "old":
                raise RuntimeError('POST /api/studio/projects/p1/record/place -> 403 {"error":"Nagranie wygasło."}')
            self.calls.append(("ms", body["durationMs"]))
            return super().place(project, body)

    site = Expired()
    if upload_vocals(site, title="t", beat_id="b", wav_paths=[clip], track_of=[0], starts_ms=[0], resume=replace(state)) != "p1":  # type: ignore[arg-type]
        raise SystemExit("wygasłe nagranie")
    if site.calls[0] != ("doc", "p1") or ("ms", 4400) not in site.calls or not any(item[:2] == ("place", "p1") and item[3] == 40 for item in site.calls):  # type: ignore[index]
        raise SystemExit(f"wznowienie ze świeżą wersją {site.calls}")
    if ("take", "b", len(grown)) not in site.calls:
        raise SystemExit("ponowna wysyłka wygasłego nagrania")

    class Gone(_FakeSite):
        def project_document(self, project: str) -> dict[str, Any]:
            raise RuntimeError('GET /api/studio/projects/p1 -> 404 {"error":"x"}')

    for dead in (Gone(), _FakeSite()):
        broken = state if isinstance(dead, Gone) else replace(state, track_ids=["inna"])
        try:
            upload_vocals(dead, title="t", beat_id="b", wav_paths=[clip], track_of=[0], starts_ms=[0], resume=replace(broken))  # type: ignore[arg-type]
        except RuntimeError as error:
            if STALE_SEND not in str(error):
                raise SystemExit(f"martwa wysyłka: {error}") from error
        else:
            raise SystemExit("martwa wysyłka przyjęta")
    clip.unlink(missing_ok=True)
    for raw, want in (
        ('POST /api/takes/session -> 403 {"error":"e","code":"REPLACE_REQUIRED"}', "za dużo gotowych"),
        ('POST /api/takes/session -> 409 {"error":"e","code":"CONCURRENT_SESSION"}', "15 minut"),
        ('Projekt p1 jest na koncie (0 z 1). POST /api/studio/projects -> 403 {"error":"Masz już 3 projekty.","code":"LIMIT"}', "Masz już 3 projekty."),
        ("POST /api/x -> 503 <html>", "przerwę"),
    ):
        if want not in friendly_upload_error(raw) or "/api/" in friendly_upload_error(raw):
            raise SystemExit(f"komunikat {raw} {friendly_upload_error(raw)}")

    class Expiring(SiteClient):
        tries = 0

        def _request(self, method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
            self.tries += 1
            if self.access_token == "stary":
                raise RuntimeError(f"{method} {path} -> 401 no")
            return {"ok": True}

    client = Expiring("https://example.invalid", "stary", lambda: "nowy")
    if client._json("GET", "/api/x") != {"ok": True} or client.tries != 2:
        raise SystemExit("odnowienie logowania w trakcie wysyłki")
    try:
        Expiring("https://example.invalid", "stary", lambda: "stary")._json("GET", "/api/x")
    except RuntimeError:
        pass
    else:
        raise SystemExit("401 po odnowieniu ma być błędem")

if __name__ == "__main__":
    self_test()


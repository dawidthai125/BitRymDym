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


def vocal_track_id(document: dict[str, Any]) -> str:
    tracks = document.get("tracks")
    if not isinstance(tracks, list):
        raise ValueError("Projekt nie ma ścieżek.")
    for track in tracks:
        if isinstance(track, dict) and track.get("trackType") == "VOCAL" and track.get("id"):
            return str(track["id"])
    raise ValueError("Projekt nie ma ścieżki wokalu.")


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

    def put_wav(self, signed_url: str, wav: bytes) -> None:
        request = urllib.request.Request(
            signed_url,
            data=wav,
            method="PUT",
            headers={"Content-Type": "audio/wav", "Authorization": f"Bearer {self.access_token}"},
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

    def apply_track_fx(self, project: str, track_id: str, version: int, chain: dict[str, Any]) -> dict[str, Any]:
        return self._json(
            "PATCH",
            f"/api/studio/projects/{project}/tracks/{track_id}/effects",
            {"expectedDocumentVersion": version, "chain": chain},
        )


def upload_vocal(
    client: SiteClient,
    *,
    title: str,
    beat_id: str,
    wav_path: Path,
    playhead_ms: int = 0,
    chain: dict[str, Any] | None = None,
) -> str:
    wav = wav_path.read_bytes()
    if len(wav) < 45:
        raise ValueError("Plik WAV jest pusty.")
    document = client.create_project(title, beat_id)
    session = client.open_take(beat_id, len(wav))
    client.put_wav(str(session["signedUrl"]), wav)
    take_id = str(session["takeId"])
    client.finalize(take_id)
    duration_ms = max(1, int((len(wav) - 44) / 2 / 48_000 * 1000))
    placed = client.place(
        project_id(document),
        {
            "trackId": vocal_track_id(document),
            "takeId": take_id,
            "timelineStartMs": playhead_ms,
            "sourceOffsetMs": 0,
            "durationMs": duration_ms,
            "expectedDocumentVersion": document_version(document),
        },
    )
    pid = project_id(document)
    effects = chain.get("effects") if isinstance(chain, dict) else None
    if isinstance(effects, list) and effects:
        version = placed.get("documentVersion")
        if not isinstance(version, int):
            raise RuntimeError(f"Wokal jest na koncie ({pid}). Strona nie oddała wersji do efektów.")
        try:
            client.apply_track_fx(pid, vocal_track_id(document), version, chain or {})
        except RuntimeError as error:
            raise RuntimeError(f"Wokal jest na koncie ({pid}). Efekty nie weszły: {error}") from None
    return pid

"""Builds light browser sample sets for the BitRymDym "Graj" instruments.

Reads the SFZ maps of free (CC0 / CC BY) instruments, picks notes and two velocity layers,
trims, fades and encodes MP3, and writes one manifest per instrument:
  {"id", "attribution", "zones": [{"file", "center", "lo", "hi", "vel": "soft"|"hard"}]}
"""
import json
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
X = os.path.join(ROOT, "x")
OUT = sys.argv[1]  # brd-site/public/instruments


def parse_sfz(path):
    text = open(path, encoding="utf-8", errors="replace").read()
    text = re.sub(r"//[^\n]*", "", text)
    tokens = re.split(r"(<\w+>)", text)
    glob, group, regions, cur = {}, {}, [], None
    default_path = ""
    for tok in tokens:
        tok = tok.strip()
        if not tok:
            continue
        if tok.startswith("<"):
            if cur is not None:
                regions.append(cur)
                cur = None
            if tok == "<global>":
                glob = {}
                target = glob
            elif tok == "<group>":
                group = {}
                target = group
            elif tok == "<region>":
                cur = {}
                target = cur
            elif tok == "<control>":
                target = {}
                ctl = target
            else:
                target = {}
            continue
        # opcodes: key=value pairs, sample may contain spaces until next opcode
        for m in re.finditer(r"(\w+)=(.*?)(?=\s+\w+=|$)", tok, re.S):
            k, v = m.group(1), m.group(2).strip()
            target[k] = v
            if k == "default_path":
                default_path = v
    if cur is not None:
        regions.append(cur)
    out = []
    for r in regions:
        merged = {**glob, **group, **r} if False else None
        out.append(r)
    # Re-run with inheritance (simple approach: track group per region)
    return regions_with_inheritance(text), default_path


def regions_with_inheritance(text):
    tokens = re.split(r"(<\w+>)", text)
    glob, group, cur, section = {}, {}, None, None
    regions = []
    for tok in tokens:
        tok = tok.strip()
        if not tok:
            continue
        if tok.startswith("<"):
            if cur is not None:
                regions.append({**glob, **group, **cur})
                cur = None
            section = tok
            if tok == "<group>":
                group = {}
            elif tok == "<global>":
                glob = {}
            elif tok == "<region>":
                cur = {}
            continue
        kv = {m.group(1): m.group(2).strip() for m in re.finditer(r"(\w+)=(.*?)(?=\s+\w+=|$)", tok, re.S)}
        if section == "<global>":
            glob.update(kv)
        elif section == "<group>":
            group.update(kv)
        elif section == "<region>" and cur is not None:
            cur.update(kv)
    if cur is not None:
        regions.append({**glob, **group, **cur})
    return regions


NOTE = {"c": 0, "d": 2, "e": 4, "f": 5, "g": 7, "a": 9, "b": 11}


def keynum(v):
    if v is None:
        return None
    v = v.strip()
    if re.fullmatch(r"-?\d+", v):
        return int(v)
    m = re.fullmatch(r"([a-gA-G])(#|b)?(-?\d)", v)
    if not m:
        return None
    n = NOTE[m.group(1).lower()] + (1 if m.group(2) == "#" else -1 if m.group(2) == "b" else 0)
    return (int(m.group(3)) + 1) * 12 + n


def zones_of(regions):
    zs = []
    for r in regions:
        key = keynum(r.get("key"))
        lo = keynum(r.get("lokey")) if r.get("lokey") else key
        hi = keynum(r.get("hikey")) if r.get("hikey") else key
        center = keynum(r.get("pitch_keycenter")) if r.get("pitch_keycenter") else key if key is not None else lo
        if lo is None or hi is None or center is None or not r.get("sample"):
            continue
        zs.append({
            "sample": r["sample"].replace("\\", "/"),
            "lo": lo, "hi": hi, "center": center,
            "lovel": int(r.get("lovel", 1)), "hivel": int(r.get("hivel", 127)),
            "seq": r.get("seq_position"),
        })
    return zs


def encode(src, dst, seconds, mono=False, bitrate="96k"):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    fade_start = max(0.05, seconds - 0.4)
    args = ["ffmpeg", "-v", "error", "-y", "-i", src, "-t", str(seconds),
            "-af", f"afade=t=out:st={fade_start}:d=0.4,aresample=44100",
            "-ac", "1" if mono else "2", "-c:a", "libmp3lame", "-b:a", bitrate, dst]
    subprocess.run(args, check=True)


def build_melodic(inst_id, sfz, attribution, pick_vel, seconds, mono, keep_center=None, bitrate="96k", sample_filter=None):
    regions = regions_with_inheritance(re.sub(r"//[^\n]*", "", open(sfz, encoding="utf-8", errors="replace").read()))
    base = os.path.dirname(sfz)
    zones = [z for z in zones_of(regions) if not sample_filter or re.search(sample_filter, z["sample"])]
    out_dir = os.path.join(OUT, inst_id)
    shutil.rmtree(out_dir, ignore_errors=True)
    manifest = {"id": inst_id, "attribution": attribution, "zones": []}
    centers = sorted({z["center"] for z in zones})
    if keep_center:
        centers = [c for c in centers if keep_center(c)]
    for c in centers:
        cz = [z for z in zones if z["center"] == c]
        for label, target in pick_vel:
            z = min(cz, key=lambda z: abs((z["lovel"] + z["hivel"]) / 2 - target))
            src = os.path.join(base, z["sample"])
            if not os.path.exists(src):
                print("missing", src)
                continue
            name = f"{c}-{label}.mp3"
            encode(src, os.path.join(out_dir, name), seconds, mono, bitrate)
            manifest["zones"].append({"file": name, "center": c, "lo": z["lo"], "hi": z["hi"], "vel": label})
            if len(pick_vel) == 1:
                break
    # Widen ranges so every key between the chosen centers is covered.
    cs = sorted({z["center"] for z in manifest["zones"]})
    for z in manifest["zones"]:
        i = cs.index(z["center"])
        z["lo"] = cs[i] - (cs[i] - cs[i - 1]) // 2 if i else max(0, cs[i] - 12)
        z["hi"] = cs[i + 1] - (cs[i + 1] - cs[i] + 1) // 2 if i + 1 < len(cs) else min(127, cs[i] + 12)
    json.dump(manifest, open(os.path.join(out_dir, "manifest.json"), "w"), indent=1)
    print(inst_id, len(manifest["zones"]), "zones")


def build_drums(inst_id, sfz, attribution, wanted):
    """wanted: {label: (midi_key, target_velocity)} — one-shot per pad."""
    regions = regions_with_inheritance(re.sub(r"//[^\n]*", "", open(sfz, encoding="utf-8", errors="replace").read()))
    base = os.path.dirname(sfz)
    zones = zones_of(regions)
    out_dir = os.path.join(OUT, inst_id)
    shutil.rmtree(out_dir, ignore_errors=True)
    manifest = {"id": inst_id, "attribution": attribution, "pads": []}
    for label, (key, vel, secs) in wanted.items():
        cand = [z for z in zones if z["lo"] <= key <= z["hi"]]
        if not cand:
            print("no zone for", label, key)
            continue
        z = min(cand, key=lambda z: abs((z["lovel"] + z["hivel"]) / 2 - vel) + (0 if not z["seq"] or z["seq"] == "1" else 5))
        name = f"{label}.mp3"
        encode(os.path.join(base, z["sample"]), os.path.join(out_dir, name), secs, False, "128k")
        manifest["pads"].append({"id": label, "file": name, "key": key})
    json.dump(manifest, open(os.path.join(out_dir, "manifest.json"), "w"), indent=1)
    print(inst_id, len(manifest["pads"]), "pads")


def build_own_kit(inst_id, src_dir, files):
    out_dir = os.path.join(OUT, inst_id)
    shutil.rmtree(out_dir, ignore_errors=True)
    manifest = {"id": inst_id, "attribution": "BitRymDym (własne)", "pads": []}
    for label, f in files.items():
        name = f"{label}.mp3"
        encode(os.path.join(src_dir, f), os.path.join(out_dir, name), 3, False, "128k")
        manifest["pads"].append({"id": label, "file": name})
    json.dump(manifest, open(os.path.join(out_dir, "manifest.json"), "w"), indent=1)
    print(inst_id, len(manifest["pads"]), "pads")


if __name__ == "__main__":
    piano = os.path.join(X, "piano/SalamanderGrandPianoV3_OggVorbis/SalamanderGrandPianoV3.sfz")
    build_melodic("piano", piano, "Salamander Grand Piano V3 — Alexander Holm, CC BY 3.0",
                  [("soft", 48), ("hard", 100)], 4.5, False, keep_center=lambda c: 33 <= c <= 96,
                  sample_filter=r"/[A-G]#?\d+v\d+\.ogg$")
    build_melodic("epiano", os.path.join(X, "epiano/FM-Piano1 SFZ+WAV-20190916/FM-Piano1 20190916.sfz"),
                  "FreePats FM Piano 1 — CC0", [("soft", 60)], 3.5, False)
    build_melodic("guitar", os.path.join(X, "guitar/SpanishClassicalGuitar-SFZ+FLAC-20190618/SpanishClassicalGuitar-20190618.sfz"),
                  "FreePats Spanish Classical Guitar — CC0", [("soft", 90)], 3.5, True,
                  keep_center=lambda c: c % 2 == 0 or c in (40, 45, 50, 55, 59, 64))
    build_melodic("bass", os.path.join(X, "bass/FingerBassYR SFZ+FLAC-20190930/FingerBassYR 20190930.sfz"),
                  "FreePats Bass Guitar YR (finger) — CC0", [("soft", 90)], 2.5, True)
    drums_sfz = os.path.join(X, "drums/MuldjordKit SFZ+FLAC-20201018/MuldjordKit 20201018.sfz")
    build_drums("drums", drums_sfz, "MuldjordKit — Lars Muldjord, CC BY 4.0", {
        # MuldjordKit's own key map (not General MIDI), read from the SFZ group comments.
        "kick": (48, 100, 1.5), "snare": (50, 100, 1.5), "hat": (52, 90, 0.8), "openhat": (53, 90, 1.8),
        "tom1": (61, 100, 1.5), "tom2": (63, 100, 1.5), "crash": (58, 100, 3), "ride": (54, 90, 2.5),
    })
    sg = os.path.join(os.path.dirname(ROOT), "samplegen", "out")
    build_own_kit("hiphop", sg, {
        "kick": "stopa-boombap.wav", "snare": "werbel-boombap.wav", "clap": "klask.wav", "hat": "hihat-zamkniety.wav",
        "openhat": "hihat-otwarty.wav", "rim": "rimshot.wav", "808a": "808-stopa-a1.wav", "808f": "808-stopa-f1.wav",
    })

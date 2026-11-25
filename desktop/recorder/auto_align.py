"""Automatic latency: a take carries a faint trace of the beat (headphones leak into the microphone).

Comparing that trace with the beat gives the real delay of this very take. Same method and limits as
src/lib/studio/recording/auto-align.ts. No Tk, no audio device, no network. numpy is loaded only here.
"""

from __future__ import annotations

from typing import Any

RATE = 12_000
MIN_SECONDS = 4
MAX_SECONDS = 16
LAG_MIN_MS, LAG_MAX_MS = -60, 700
N = 16_384
FRAME = 2_048
HOP = FRAME // 2
BAND_HZ = (180, 5_200)
MIN_PEAK_SIGMA = 9.0
MAX_SECOND_PEAK = 0.8
HALVES_AGREE_MS = 3.0
CAP = 6.0


def _peak(np: Any, corr: Any, lo: int) -> tuple[float, float, float] | None:
    best = int(np.argmax(corr))
    if best == 0 or best == len(corr) - 1:
        return None
    guard = round(0.004 * RATE)
    rest = np.concatenate((corr[: max(0, best - guard)], corr[best + guard + 1 :]))
    sigma = float(np.sqrt(np.mean(rest**2)))
    if sigma <= 0:
        return None
    a, top, c = (float(corr[best + step]) for step in (-1, 0, 1))
    curve = a - 2 * top + c
    shift = max(-0.5, min(0.5, 0.5 * (a - c) / curve)) if curve < 0 else 0.0
    return lo + best + shift, top / sigma, float(rest.max()) / top


def bleed_lag(mic: Any, beat: Any) -> float | None:
    """How many ms late the beat is in the microphone. mic[i] and beat[i] are the same moment without any
    correction, mono at RATE. None: no trustworthy trace of the beat."""
    import numpy as np

    mic = np.asarray(mic, dtype=np.float64)
    beat = np.asarray(beat, dtype=np.float64)
    length = min(len(mic), len(beat), MAX_SECONDS * RATE)
    if length < MIN_SECONDS * RATE or float(np.mean(beat[:length] ** 2)) < 1e-7:
        return None
    lo, hi = round(LAG_MIN_MS * RATE / 1000), round(LAG_MAX_MS * RATE / 1000)
    k0, k1 = -(-BAND_HZ[0] * N // RATE), BAND_HZ[1] * N // RATE
    window = 0.5 - 0.5 * np.cos(2 * np.pi * (np.arange(FRAME) + 0.5) / FRAME)
    # beat[at - hi : at - lo + FRAME] under every frame: each searched lag has the full overlap.
    padded = np.concatenate((np.zeros(hi), beat[:length], np.zeros(FRAME - lo)))
    starts = range(0, length - FRAME + 1, HOP)
    mics = np.stack([np.fft.rfft(mic[at : at + FRAME] * window, N)[k0 : k1 + 1] for at in starts])
    beats = np.stack([np.fft.rfft(padded[at : at + FRAME + hi - lo], N)[k0 : k1 + 1] for at in starts])
    m, b = np.abs(mics), np.abs(beats)
    mean_m, mean_b = m.sum(axis=0), b.sum(axis=0)
    # Loud words say little, the pauses between them a lot.
    weight = np.minimum(CAP, (b / np.maximum(mean_b, 1e-12)) / np.maximum(m / np.maximum(mean_m, 1e-12), 1e-12))
    weight = weight / np.maximum(m * b, 1e-24)
    weight[(m < 1e-12) | (b < 1e-12)] = 0
    weight[:, mean_b < mean_b.max() * 0.0015] = 0
    cross = mics * np.conj(beats) * weight

    def correlation(part: Any) -> Any:
        spectrum = np.zeros(N // 2 + 1, dtype=np.complex128)
        spectrum[k0 : k1 + 1] = part.sum(axis=0)
        return np.abs(np.fft.irfft(spectrum, N)[(np.arange(lo, hi + 1) - hi) % N])

    whole = _peak(np, correlation(cross), lo)
    if whole is None or whole[1] < MIN_PEAK_SIGMA or whole[2] > MAX_SECOND_PEAK:
        return None
    half = len(cross) // 2
    for part in (cross[:half], cross[half:]):
        found = _peak(np, correlation(part), lo)
        if found is None or abs(found[0] - whole[0]) * 1000 / RATE > HALVES_AGREE_MS:
            return None
    return round(whole[0] * 1000 / RATE, 1)


def mic_at_rate(samples: Any, skip: float, rate: int = 48_000) -> Any:
    """16-bit take from `skip` seconds on, mono at RATE. A plain average of whole groups: nothing moves."""
    import numpy as np

    step = rate // RATE
    part = np.asarray(samples, dtype=np.int16)[int(round(skip * rate)) : int(round(skip * rate)) + (MAX_SECONDS + 1) * rate]
    part = part[: len(part) // step * step].astype(np.float64) / 32768.0
    return part.reshape(-1, step).mean(axis=1)


def stream_slip(ahead: list[float]) -> float:
    """Seconds the microphone and the output moved against each other during a measurement. ahead: the recording's
    lead over the played sound, read all the time."""
    if len(ahead) < 45:
        return 0.0
    third = len(ahead) // 3
    first, last = sorted(ahead[:third]), sorted(ahead[-third:])
    return abs(last[third // 2] - first[third // 2])


def lag_jump(lags: list[float]) -> float:
    """ms by which the claps moved for good in the middle of the run (a Bluetooth stream that slipped).
    0 for an uneven hand, and for one that slowly drifts: a step must explain the claps far better than a line."""
    import numpy as np

    y = np.asarray(lags, dtype=np.float64)
    if len(y) < 6:
        return 0.0
    x = np.arange(len(y))
    line = float(np.sum((y - np.polyval(np.polyfit(x, y, 1), x)) ** 2))
    best, found = float("inf"), 0.0
    for at in range(3, len(y) - 2):
        left, right = y[:at], y[at:]
        rest = float(np.sum((left - left.mean()) ** 2) + np.sum((right - right.mean()) ** 2))
        step = abs(float(np.median(left[-3:])) - float(np.median(right[:3])))
        clear = step > 2.2 * max(float(np.ptp(left)), float(np.ptp(right)), 5.0) / 2 + 8
        if rest < best and rest < 0.4 * line and step > 25 and clear:
            best, found = rest, step
    return found


def clap_lag(samples: Any, skip: float, period: float, count: int, rate: int = 48_000) -> float | None:
    return clap_delay(samples, skip, period, count, rate)[0]


def clap_delay(samples: Any, skip: float, period: float, count: int, rate: int = 48_000) -> tuple[float | None, float]:
    """How many ms late the claps (or the clicks heard by the microphone) are against `count` clicks, one every
    `period` seconds. samples: 16-bit take, `skip` seconds of it lie before the first click.
    None: too few sounds, or they do not agree. Second: lag_jump of the claps that agree.
    """
    import numpy as np

    part = np.abs(np.asarray(samples, dtype=np.float64)[max(0, int(round(skip * rate))) :]) / 32768.0
    frame = rate // 200
    if len(part) < frame * 8:
        return None, 0.0
    level = part[: len(part) // frame * frame].reshape(-1, frame).max(axis=1)
    floor = float(np.median(level))
    lags: list[float] = []
    # The first two clicks only give the tempo.
    for index in range(2, count):
        begin = max(0, int((index * period + LAG_MIN_MS / 1000) * 200))
        window = level[begin : int((index * period + LAG_MAX_MS / 1000 + 0.02) * 200)]
        if len(window) < 20:
            break
        top = float(window.max())
        if top < max(0.004, floor * 6):
            continue
        onset = int(np.argmax(window >= top * 0.4))
        lags.append((begin + onset) * 5.0 - index * period * 1000)
    if len(lags) < 5:
        return None, 0.0
    middle = float(np.median(lags))
    near = [lag for lag in lags if abs(lag - middle) <= 60]
    if len(near) < max(5, round(len(lags) * 0.6)):
        return None, 0.0
    return round(min(float(LAG_MAX_MS), max(0.0, float(np.mean(near)))), 1), lag_jump(near)


def self_test() -> None:
    import numpy as np

    noise = np.random.default_rng(11)
    for true_lag in (0, 150, 440, 640):
        take = noise.standard_normal(48_000 * 14) * 20
        for index in range(12):
            at = int((0.3 + index + true_lag / 1000 + float(noise.uniform(-0.02, 0.02))) * 48_000)
            if index != 5 and at + 1500 < len(take):
                take[at : at + 1500] += 9000 * np.exp(-np.arange(1500) / 300) * noise.standard_normal(1500)
        measured = clap_lag(np.clip(take, -32768, 32767).astype(np.int16), 0.3, 1.0, 12)
        if measured is None or abs(measured - true_lag) > 15:
            raise SystemExit(f"klaskanie: {true_lag} -> {measured}")
    if clap_lag((noise.standard_normal(48_000 * 14) * 20).astype(np.int16), 0.3, 1.0, 12) is not None:
        raise SystemExit("klaskanie: sam szum")
    loose = noise.standard_normal(48_000 * 14) * 20
    for index in range(12):
        at = int((0.3 + index + float(noise.uniform(0.0, 0.65))) * 48_000)
        loose[at : at + 800] += 9000
    if clap_lag(np.clip(loose, -32768, 32767).astype(np.int16), 0.3, 1.0, 12) is not None:
        raise SystemExit("klaskanie: nierówno")

    caught = sum(lag_jump([float(noise.normal(437 + 41 * (i > 4), 5)) for i in range(10)]) > 0 for _ in range(300))
    if caught < 240:
        raise SystemExit(f"klaskanie: przeskok 41 ms zauważony {caught}/300")
    if lag_jump([440.0] * 4 + [481.0] * 6) < 40 or lag_jump([437, 441, 432, 445, 478, 480, 471, 484, 479, 476]) < 35:
        raise SystemExit("klaskanie: przeskok")
    for drift in (4, 6, 10):
        wrong = sum(lag_jump([round((300 + drift * i + noise.normal(0, 10)) / 5) * 5 for i in range(10)]) > 0 for _ in range(300))
        if wrong > 6:
            raise SystemExit(f"klaskanie: dryf {drift} ms uznany za przeskok {wrong}/300")
    false = sum(lag_jump(list(noise.normal(300, spread, 10))) > 0 for spread in (8, 14, 20) for _ in range(300))
    if false > 18:
        raise SystemExit(f"klaskanie: {false}/900 równych uznane za przeskok")
    if stream_slip([0.5] * 100 + [0.54] * 100) < 0.03 or stream_slip([0.5, 0.51] * 100) > 0.011:
        raise SystemExit("klaskanie: strumień")

    rng = np.random.default_rng(5)
    seconds = 12
    total = seconds * RATE
    step = round(RATE * 60 / 90 / 4)
    beat = np.zeros(total)
    hat = rng.standard_normal(500) * np.exp(-np.arange(500) / 90)
    snare = rng.standard_normal(1800) * np.exp(-np.arange(1800) / 500)
    for k in range(total // step):
        for sound, gain, on in ((hat, 0.12, True), (snare, 0.25, k % 8 == 4)):
            if on:
                at = k * step
                n = min(len(sound), total - at)
                beat[at : at + n] += sound[:n] * gain
    beat += 0.05 * np.cumsum(rng.standard_normal(total)) / 60
    beat += 0.03 * rng.standard_normal(total)
    voice = np.zeros(total)
    at = 4000
    while at < total:
        n = int(rng.integers(900, 2600))
        t = np.arange(min(n, total - at)) / RATE
        f = float(rng.uniform(100, 160))
        voice[at : at + len(t)] = 0.25 * np.sin(np.pi * t * RATE / n) * sum(np.sin(2 * np.pi * f * h * t) / h for h in range(1, 18))
        at += n + int(rng.integers(300, 3500))
    for lag in (35, 120, 310):
        delay = round(lag * RATE / 1000)
        mic = voice + 0.02 * np.concatenate((np.zeros(delay), beat))[:total] + 0.0005 * rng.standard_normal(total)
        got = bleed_lag(mic, beat)
        if got is None or abs(got - lag) > 1.0:
            raise SystemExit(f"wyrównanie do bitu: {lag} -> {got}")
    if bleed_lag(voice + 0.0005 * rng.standard_normal(total), beat) is not None:
        raise SystemExit("wyrównanie bez śladu bitu")
    if bleed_lag(beat[: 2 * RATE], beat[: 2 * RATE]) is not None or bleed_lag(voice, np.zeros(total)) is not None:
        raise SystemExit("wyrównanie: za krótko albo cisza")
    pulse = np.zeros(48_000, dtype=np.int16)
    pulse[24_000:24_004] = 20_000
    if int(np.argmax(mic_at_rate(pulse, 0.25))) != 3_000:
        raise SystemExit("wyrównanie: próbki")
    print("auto align self-test ok")


if __name__ == "__main__":
    self_test()

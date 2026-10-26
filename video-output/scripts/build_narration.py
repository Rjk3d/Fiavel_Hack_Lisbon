"""Narration, caption timings and SRT for the Fiável film, fully local (Kokoro-82M via kokoro-onnx).

    KOKORO_DIR=<dir with model_quantized.onnx and voices.npz> python3 scripts/build_narration.py

Each scene's text is synthesized clause by clause (split at , ; : . ? !), which is how
kokoro-onnx batches text anyway, and the clauses are joined with fixed pauses. Every clause's
start and end are therefore known exactly. A clause longer than 7 words is shown as two
caption groups; the split point is the quietest 20 ms of audio near the phoneme-weighted
estimate (a word gap). This model exports no word timestamps and whisper models could not be
downloaded here, so this is how captions are timed (see README).

Writes assets/voice/<scene>.wav (loudness-normalized with ffmpeg), timing.json (scene starts, durations, caption groups) and
fiavel-captions.srt.
"""

import json
import os
import re
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parent.parent
SR = 24_000
PAUSE = {",": 0.18, ";": 0.26, ":": 0.26, ".": 0.55, "?": 0.55, "!": 0.55}
TAIL = 0.9  # silence after the last word of a scene before its end
MAX_WORDS = 7

cfg = json.loads((ROOT / "narration.json").read_text())
kdir = Path(os.environ["KOKORO_DIR"])
kokoro = Kokoro(str(kdir / "model_quantized.onnx"), str(kdir / "voices.npz"))
LANG = "en-us" if cfg["voice"][0] == "a" else "en-gb"

# Phonemes espeak gets wrong, replaced by the right ones in every clause.
fixes = [(kokoro.tokenizer.phonemize(w, LANG).strip(" ."), p) for w, p in cfg["pronunciations"].items()]


def phonemes(text: str) -> str:
    ph = kokoro.tokenizer.phonemize(text, LANG)
    for wrong, right in fixes:
        ph = ph.replace(wrong, right)
    return ph


def synth(text: str) -> np.ndarray:
    audio, sr, _ = kokoro.create_timed(phonemes(text), voice=cfg["voice"], speed=cfg["speed"], lang=LANG, is_phonemes=True)
    assert sr == SR
    return audio.astype(np.float32)


def quietest(audio: np.ndarray, around: float, span: float = 0.3) -> float:
    """Centre of the quietest 20 ms window within ±span s of `around` (seconds)."""
    win = int(0.02 * SR)
    lo, hi = max(0, int((around - span) * SR)), min(len(audio) - win, int((around + span) * SR))
    if hi <= lo:
        return around
    energy = np.convolve(audio[lo:hi + win] ** 2, np.ones(win), "valid")
    return (lo + int(np.argmin(energy)) + win // 2) / SR


JOINS = {"and", "or", "to", "for", "with", "so", "using", "into", "through", "from", "that", "the", "when", "a"}


def split_clause(words: list[str]) -> list[list[str]]:
    """Two caption groups for a long clause, cut before a joining word near the middle when there is one."""
    if len(words) <= MAX_WORDS:
        return [words]
    mid = len(words) / 2
    joins = [i for i in range(3, len(words) - 2) if words[i].lower() in JOINS]
    cut = min(joins, key=lambda i: abs(i - mid)) if joins and min(abs(i - mid) for i in joins) <= 2 else (len(words) + 1) // 2
    return [words[:cut], words[cut:]]


def srt_time(t: float) -> str:
    ms = int(round(t * 1000))
    return f"{ms // 3_600_000:02}:{ms // 60_000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"


voice_dir = ROOT / "assets" / "voice"
voice_dir.mkdir(parents=True, exist_ok=True)
timing = {"voice": cfg["voice"], "speed": cfg["speed"], "scenes": []}
t_scene = 0.0
for scene in cfg["scenes"]:
    clauses = [c.strip() for c in re.findall(r"[^,;:.?!]+[,;:.?!]?", scene["text"]) if c.strip()]
    parts, groups, t = [], [], 0.0
    for clause in clauses:
        audio = synth(clause)
        dur = len(audio) / SR
        words = clause.split()
        pieces = split_clause(words)
        if len(pieces) == 1:
            groups.append({"text": clause, "start": round(t, 3), "end": round(t + dur, 3)})
        else:
            # Phoneme-weighted estimate of where the second piece starts, snapped to a word gap.
            share = len(phonemes(" ".join(pieces[0]))) / max(1, len(phonemes(clause)))
            cut = quietest(audio, share * dur)
            groups.append({"text": " ".join(pieces[0]), "start": round(t, 3), "end": round(t + cut, 3)})
            groups.append({"text": " ".join(pieces[1]), "start": round(t + cut, 3), "end": round(t + dur, 3)})
        parts.append(audio)
        t += dur
        pause = PAUSE.get(clause[-1], 0.12)
        parts.append(np.zeros(int(pause * SR), dtype=np.float32))
        t += pause
    voice = np.concatenate(parts[:-1])  # no pause after the last clause
    voice_len = len(voice) / SR
    path = voice_dir / f"{scene['id']}.wav"
    sf.write(path, voice, SR)
    # Loudness for online playback: -16 LUFS integrated, true peak -1.5 dBTP, 48 kHz (length unchanged).
    tmp = path.with_name(f"n-{path.name}")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(path), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-ac", "1", str(tmp)], check=True)
    tmp.replace(path)
    duration = round(max(scene["min"], scene["lead"] + voice_len + TAIL), 2)
    timing["scenes"].append(
        {
            "id": scene["id"],
            "start": round(t_scene, 2),
            "duration": duration,
            "voice": f"assets/voice/{scene['id']}.wav",
            "voice_start": scene["lead"],
            "voice_length": round(voice_len, 3),
            "groups": [{**g, "start": round(g["start"] + scene["lead"], 3), "end": round(g["end"] + scene["lead"], 3)} for g in groups],
        }
    )
    print(f"{scene['id']:14} start {t_scene:6.2f}  voice {voice_len:5.2f}s  scene {duration:5.2f}s  groups {len(groups)}")
    t_scene = round(t_scene + duration, 2)

timing["total"] = t_scene
(ROOT / "timing.json").write_text(json.dumps(timing, indent=2, ensure_ascii=False))

lines, n = [], 0
for s in timing["scenes"]:
    for g in s["groups"]:
        n += 1
        lines += [str(n), f"{srt_time(s['start'] + g['start'])} --> {srt_time(s['start'] + g['end'])}", g["text"], ""]
(ROOT / "fiavel-captions.srt").write_text("\n".join(lines), encoding="utf-8")
print(f"total {t_scene:.2f}s · {n} caption groups")

"""Does each recording belong to its entry? Compares clip length with the number of syllables.

    python3 tools/check_audio.py <folder with w/ and s/>

A recording of a longer sentence is longer. If clips had been given to the wrong entries (a mistake in naming
or in the folders), the correlation between syllables and seconds would collapse; with the labels shuffled it is
about zero, which is printed as the control.
"""
import base64
import json
import os
import random
import re
import statistics
import subprocess
import sys
import unicodedata
from multiprocessing import Pool

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SYL = re.compile(r"[A-Za-zÀ-ɏ̀-ͯḀ-ỿ]+")


def nsyl(t):
    return len(SYL.findall(unicodedata.normalize("NFC", t)))


def dur(p):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], capture_output=True, text=True)
    try:
        return float(r.stdout)
    except ValueError:
        return None


def corr(a, b):
    ma, mb = statistics.mean(a), statistics.mean(b)
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    return num / ((sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b)) ** 0.5)


def main():
    folder = sys.argv[1]
    random.seed(3)
    d = json.load(open(os.path.join(ROOT, "data", "dict.json"), encoding="utf-8"))
    entries = {e[0]: e for e in d["e"]}
    ex = json.load(open(os.path.join(ROOT, "data", "examples.json"), encoding="utf-8"))
    bits = base64.b64decode(json.load(open(os.path.join(ROOT, "data", "audio.json")))["w"])
    has = [i for i in entries if (bits[i >> 3] >> (i & 7)) & 1]
    words = [(f"{folder}/w/{i // 1000}/{i}.mp3", nsyl(entries[i][3].split("/")[0])) for i in random.sample(has, 600)]
    sents = [(f"{folder}/s/{e[3] // 1000}/{e[3]}-{e[4]}.mp3", nsyl(e[1])) for e in random.sample([e for e in ex if e[4]], 600)]
    with Pool(8) as pool:
        for name, items in (("headword clips", words), ("example clips", sents)):
            ds = pool.map(dur, [x[0] for x in items], chunksize=20)
            pairs = [(n, t) for (_, n), t in zip(items, ds) if t]
            r = corr([a for a, _ in pairs], [b for _, b in pairs])
            shuffled = [b for _, b in pairs]
            random.shuffle(shuffled)
            print(f"{name}: {len(pairs)} of {len(items)} readable, correlation(syllables, seconds) = {r:.2f}; "
                  f"{statistics.mean(t / n for n, t in pairs):.2f} s per syllable; labels shuffled: {corr([a for a, _ in pairs], shuffled):.2f}", flush=True)


if __name__ == "__main__":
    main()

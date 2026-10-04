"""Re-encode the Ministry of Education audio for the web.

    python3 tools/build_audio.py <sutiau-mp3 folder> <leku-mp3 folder> <output folder> [--verify]

The official downloads are 870 MB of 56-65 kbps mono MP3. This writes the same clips as 32 kbps mono
22.05 kHz MP3 (about half the size; speech and pitch, which carry the tones, are kept) into a layout meant
for static hosting, spread over folders so none holds more than about a thousand files:

    w/<id // 1000>/<id>.mp3                    one clip per headword        (source: <id>(1).mp3)
    s/<id // 1000>/<id>-<sense>-<n>.mp3        one clip per example sentence (source: <id>-<sense>-<n>.mp3)

Needs ffmpeg with libmp3lame. Clips that are already converted are skipped, so it can be stopped and resumed.
--verify decodes every output clip and compares its length with the source (slow, but it is the check that
nothing was cut off or broken).
"""
import os
import re
import subprocess
import sys
from multiprocessing import Pool

WORD = re.compile(r"^(\d+)\((\d+)\)\.mp3$")
SENT = re.compile(r"^(\d+)-(\d+)-(\d+)\.mp3$")


def jobs(words, sents, out):
    for dp, _, fns in os.walk(words):
        for f in fns:
            m = WORD.match(f)
            if m:
                i, n = int(m.group(1)), int(m.group(2))
                name = f"{i}.mp3" if n == 1 else f"{i}-{n}.mp3"
                yield os.path.join(dp, f), os.path.join(out, "w", str(i // 1000), name)
    for dp, _, fns in os.walk(sents):
        for f in fns:
            m = SENT.match(f)
            if m:
                yield os.path.join(dp, f), os.path.join(out, "s", str(int(m.group(1)) // 1000), f)


def duration(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                       capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def encode(job):
    src, dst = job
    if os.path.exists(dst) and os.path.getsize(dst) > 0:
        return dst, "skipped", 0
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    tmp = dst + ".part"
    r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-vn", "-map_metadata", "-1", "-ac", "1", "-ar", "22050",
                        "-c:a", "libmp3lame", "-b:a", "32k", "-id3v2_version", "0", "-write_xing", "0", "-f", "mp3", tmp],
                       capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(tmp) or os.path.getsize(tmp) == 0:
        return dst, "FAILED " + r.stderr.strip()[:120], 0
    os.replace(tmp, dst)
    return dst, "ok", os.path.getsize(dst)


def check(job):
    src, dst = job
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", dst, "-f", "null", "-"], capture_output=True, text=True)
    if r.returncode != 0 or r.stderr.strip():
        return dst, "does not decode: " + r.stderr.strip()[:100]
    a, b = duration(src), duration(dst)
    if abs(a - b) > max(0.25, 0.15 * a):
        return dst, f"length {b:.2f}s differs from source {a:.2f}s"
    return dst, "ok"


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 3:
        sys.exit(__doc__)
    words, sents, out = args
    todo = sorted(jobs(words, sents, out), key=lambda j: j[1])
    print(f"{len(todo)} clips to produce into {out}", flush=True)
    done = failed = 0
    size = 0
    with Pool(os.cpu_count()) as pool:
        for k, (dst, status, nbytes) in enumerate(pool.imap_unordered(encode, todo, chunksize=40), 1):
            size += nbytes
            if status.startswith("FAILED"):
                failed += 1
                print(dst, status, flush=True)
            if k % 2000 == 0:
                print(f"  {k}/{len(todo)}", flush=True)
        print(f"encoded: {len(todo) - failed} ok, {failed} failed", flush=True)
        if "--verify" in sys.argv:
            bad = 0
            for k, (dst, status) in enumerate(pool.imap_unordered(check, todo, chunksize=40), 1):
                if status != "ok":
                    bad += 1
                    print("VERIFY", dst, status, flush=True)
                if k % 5000 == 0:
                    print(f"  verified {k}/{len(todo)}", flush=True)
            print(f"verified: {len(todo) - bad} ok, {bad} problems", flush=True)
            failed += bad
    total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fns in os.walk(out) for f in fns if f.endswith(".mp3"))
    print(f"output size: {total / 1e6:.0f} MB")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()

"""Stage 2: raw/*.json (from ods_to_raw.py) -> data/*.json used by the site.

Source: 教育部《臺灣台語常用詞辭典》 kautian.ods (CC BY-ND 3.0 TW).
The dictionary text is carried over unchanged. Everything this script *derives*
(the 華語→台語 index, word frequencies, the daily list) is kept in separate
files so the dictionary content itself is never altered.

    python3 tools/ods_to_raw.py ~/Downloads/kautian.ods raw
    python3 tools/build_data.py            # writes data/
    python3 tools/build_data.py --report   # also prints the 華語 test list
"""
import collections
import datetime
import json
import math
import os
import random
import re
import sys
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "raw")
OUT = os.path.join(ROOT, "data")
TOOLS = os.path.join(ROOT, "tools")

TYPES = ["主詞目", "臺華共同詞", "單字不成詞者", "近反義詞不單列詞目者", "附錄"]
T_MAIN, T_SHARED, T_CHAR, T_SYN, T_APPX = range(5)

HAN = r"〇㐀-䶿一-鿿豈-﫿\U00020000-\U000323af"
HAN_RE = re.compile(f"[{HAN}]")
PURE_HAN = re.compile(f"^[{HAN}]+$")
LAT = r"A-Za-zÀ-ɏ̀-ͯḀ-ỿ"
SYL_RE = re.compile(f"[{LAT}]+")
# a romanized word: optional leading "--", syllables joined by "-" or "--"
WORD_RE = re.compile(f"(?:--)?[{LAT}0-9]+(?:--?[{LAT}0-9]+)*")


def load(name):
    with open(os.path.join(RAW, name + ".json"), encoding="utf-8") as f:
        rows = json.load(f)
    return rows[0], rows[1:]


def col(row, i):
    return row[i] if len(row) > i else ""


def nfc(s):
    return unicodedata.normalize("NFC", s)


def tl_key(t):
    """Case-insensitive romanization key; keeps a leading "--" (neutral tone)."""
    return nfc(t).strip().lower()


def tl_bare(t):
    return tl_key(t).lstrip("-")


def syllables(t):
    return SYL_RE.findall(nfc(t))


def split_readings(raw):
    """'【白】kuè/kè' -> ('b', ['kuè', 'kè'])"""
    mark = ""
    m = re.match(r"^【(.)】", raw)
    if m:
        mark = {"白": "b", "文": "l", "俗": "s"}.get(m.group(1), "")
        raw = raw[m.end():]
    return mark, [nfc(x.strip()) for x in raw.split("/") if x.strip()]


# --------------------------------------------------------------------------
# 1. entries
# --------------------------------------------------------------------------
def build_entries():
    _, su = load("詞目")
    _, gi = load("義項")
    _, le = load("例句")

    pos_list = [""]
    pos_idx = {"": 0}

    entries = {}
    order = []
    for r in su:
        eid = int(r[0])
        typ = TYPES.index(r[1])
        hanji = col(r, 2)
        mark = ""
        if "【替】" in hanji:
            mark += "t"
            hanji = hanji.replace("【替】", "")
        hanji = nfc(hanji.strip())
        rmark, readings = split_readings(col(r, 3))
        entries[eid] = {
            "id": eid, "type": typ, "hanji": hanji, "tailo": "/".join(readings),
            "readings": readings, "mark": rmark + mark, "cat": col(r, 4),
            "senses": [], "x": {},
        }
        order.append(eid)

    sense_of = {}  # 義項id -> (eid, index)
    for r in gi:
        eid, gid = int(r[0]), int(r[1])
        p = col(r, 2)
        if p not in pos_idx:
            pos_idx[p] = len(pos_list)
            pos_list.append(p)
        e = entries[eid]
        sense_of[gid] = (eid, len(e["senses"]))
        e["senses"].append({"pos": pos_idx[p], "def": nfc(col(r, 3)), "ex": [], "syn": [], "ant": []})

    examples = []
    le_sorted = sorted(le, key=lambda r: (int(r[0]), int(r[1]), int(r[2])))
    for r in le_sorted:
        gid = int(r[1])
        if gid not in sense_of:
            continue
        eid, si = sense_of[gid]
        entries[eid]["senses"][si]["ex"].append(len(examples))
        examples.append([nfc(r[3]), nfc(r[4]), nfc(r[5]), eid])

    # alternative readings
    for sheet, kind in (("又唸作", "iu"), ("合音唸作", "ha"), ("俗唸作", "sio")):
        _, rows = load(sheet)
        for r in rows:
            eid = int(r[0])
            if eid in entries:
                for t in col(r, 2).split("/"):
                    if t.strip():
                        entries[eid]["x"].setdefault("a", []).append([kind, nfc(t.strip())])

    _, rows = load("異用字")
    for r in rows:
        eid = int(r[0])
        if eid in entries and col(r, 2):
            entries[eid]["x"].setdefault("v", []).append(nfc(r[2]))

    # synonyms / antonyms
    def add(lst, v):
        if v not in lst:
            lst.append(v)

    for sheet, key in (("義項tuì義項近義", "syn"), ("義項tuì義項反義", "ant")):
        _, rows = load(sheet)
        for r in rows:
            a, b = int(r[0]), int(r[3])
            if a in sense_of and b in sense_of:
                eid, si = sense_of[a]
                add(entries[eid]["senses"][si][key], sense_of[b][0])
    for sheet, key in (("義項tuì詞目近義", "syn"), ("義項tuì詞目反義", "ant")):
        _, rows = load(sheet)
        for r in rows:
            a, b = int(r[0]), int(r[3])
            if a in sense_of and b in entries:
                eid, si = sense_of[a]
                add(entries[eid]["senses"][si][key], b)
    for sheet, key in (("詞目tuì詞目近義", "s"), ("詞目tuì詞目反義", "n")):
        _, rows = load(sheet)
        for r in rows:
            a, b = int(r[0]), int(r[2])
            if a in entries and b in entries:
                add(entries[a]["x"].setdefault(key, []), b)

    return entries, order, examples, pos_list


# --------------------------------------------------------------------------
# 2. tokenising the example sentences (漢字 <-> 台羅, one syllable per character)
# --------------------------------------------------------------------------
def align(hanji, tailo, is_word=None):
    """-> list of (hanji_word, tailo_word) or None when the two sides do not line up.

    A "--" (neutral tone) normally starts a new token; `is_word(hanji, tailo)` lets
    lexical items such as 後--日 or 轉--來 stay in one piece.
    """
    words = WORD_RE.findall(nfc(tailo))
    hs = HAN_RE.findall(hanji)
    if not hs or sum(len(syllables(w)) for w in words) != len(hs):
        return None
    out, i = [], 0
    for w in words:
        k = len(syllables(w))
        h = "".join(hs[i:i + k])
        i += k
        if "--" not in w.lstrip("-") or (is_word and is_word(h, w)):
            out.append((h, w))
            continue
        j = 0
        for part in re.split(r"(?=--)", w):
            if not part:
                continue
            n = len(syllables(part))
            out.append((h[j:j + n], part))
            j += n
    return out


# --------------------------------------------------------------------------
# 3. 華語 glosses mined from the definitions
# --------------------------------------------------------------------------
STOP_PREFIX = ("形容", "比喻", "表示", "用來", "用於", "用在", "一種", "引申", "泛指", "通常",
               "專指", "意指", "是指", "例如", "多用", "常用", "也作", "又稱", "亦稱", "俗稱",
               "簡稱", "原指", "借指", "特指", "相當於", "意思", "指稱", "多指", "常指", "此指")
STOP_SUFFIX = ("類", "後綴", "前綴", "助詞", "詞綴", "的一種", "之一", "名稱", "用語", "單位")
STOP_WORDS = {"姓氏", "地名", "人名", "植物名", "動物名", "魚名", "鳥名", "樹名", "草名", "藥名",
              "病名", "書名", "官名", "國名", "星名", "節氣名", "擬聲詞", "嘆詞", "量詞", "數詞",
              "副詞", "名詞", "動詞", "代詞", "連詞", "介詞", "形容詞", "語氣詞", "詈語", "合音",
              "百家姓", "二十四節氣", "十二生肖", "十二生相", "天干", "地支"}


def glosses(defn):
    """-> [(sentence_idx, piece_idx, word)] for definition parts that are plain 華語 equivalents."""
    d = re.sub(r"[（(][^）)]*[）)]", "", defn)
    d = d.replace("……", "").replace("…", "").replace(" ", "")
    out = []
    for si, sent in enumerate(re.split(r"[。；！？]", d)):
        sent = sent.split("，")[0].strip()
        if not sent:
            continue
        ok = []
        for p in sent.split("、"):
            q = p.strip()
            if len(q) > 2 and q[-1] in "的地":
                q = q[:-1]
            if not PURE_HAN.match(q) or len(q) > 6:
                ok = None
                break
            if len(q) >= 3 and any(ch in q for ch in "的或之所而"):
                ok = None
                break
            if q.startswith(STOP_PREFIX) or q.endswith(STOP_SUFFIX) or q in STOP_WORDS:
                ok = None
                break
            ok.append(q)
        if ok:
            for pi, q in enumerate(ok):
                out.append((si, pi, q))
    return out


# characters a learned 華語 "word" may not begin / end with (they are grammar, not vocabulary)
EDGE_L = set("個在這那的了是有會要不很也都就把被得著過一他她我你們和跟與而")
EDGE_R = set("的了得著是在個們和跟與而")


def hua_variants(w):
    """Extra spellings a learner might type for the same 華語 word."""
    out = {w}
    if len(w) >= 3 and w[-1] in "子兒":
        out.add(w[:-1])
    for a, b in (("臺", "台"), ("裡", "裏"), ("著", "着"), ("佈", "布"), ("週", "周"), ("溼", "濕"), ("汙", "污")):
        if a in w:
            out.add(w.replace(a, b))
    return out


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------
def main():
    report = "--report" in sys.argv
    entries, order, examples, pos_list = build_entries()
    print(f"entries {len(entries)}  examples {len(examples)}  pos {pos_list}")

    # ---- lookups ---------------------------------------------------------
    by_ht = collections.defaultdict(list)   # (hanji, tl_bare) -> [eid]
    by_h = collections.defaultdict(list)    # hanji -> [eid]
    for eid in order:
        e = entries[eid]
        by_h[e["hanji"]].append(eid)
        alts = [t for _, t in e["x"].get("a", [])]
        for t in e["readings"] + alts:
            k = (e["hanji"], tl_bare(t))
            if eid not in by_ht[k]:
                by_ht[k].append(eid)

    type_rank = {T_MAIN: 0, T_SHARED: 1, T_SYN: 2, T_APPX: 3, T_CHAR: 4}

    def n_examples(eid):
        return sum(len(x["ex"]) for x in entries[eid]["senses"])

    def resolve(h, t):
        """token -> entry id (best) or None. Same spelling and reading: the entry with more examples."""
        c = by_ht.get((h, tl_bare(t)))
        if c:
            return sorted(c, key=lambda i: (type_rank[entries[i]["type"]], -n_examples(i)))[0]
        return None

    # ---- tokens, frequencies, char readings ------------------------------
    ex_tokens = []                     # per example: list of token keys (hanji, tl_key)
    tok_freq = collections.Counter()
    tok_case = collections.defaultdict(collections.Counter)   # spelling seen away from sentence start
    char_read = collections.defaultdict(collections.Counter)
    n_aligned = 0
    for ex in examples:
        al = align(ex[0], ex[1], lambda h, t: (h, tl_bare(t)) in by_ht)
        if al is None:
            ex_tokens.append([])
            continue
        n_aligned += 1
        keys = []
        for pos_i, (h, t) in enumerate(al):
            k = (h, tl_key(t))
            keys.append(k)
            tok_freq[k] += 1
            if pos_i > 0:
                tok_case[k][nfc(t)] += 1
            sy = syllables(t)
            if len(sy) == len(h):
                for ch, s in zip(h, sy):
                    char_read[ch][s.lower()] += 1
        ex_tokens.append(keys)
    print(f"aligned examples {n_aligned}/{len(examples)}  distinct tokens {len(tok_freq)}")

    # headwords also teach character readings (weighted a little: they are the citation forms)
    for eid in order:
        e = entries[eid]
        if e["type"] == T_APPX or not e["readings"]:
            continue
        sy = syllables(e["readings"][0])
        hs = HAN_RE.findall(e["hanji"])
        if len(sy) == len(hs) and len(hs) == len(e["hanji"]):
            w = 3 if len(hs) > 1 else 1
            for ch, s in zip(hs, sy):
                char_read[ch][s.lower()] += w

    def spelling(k):
        """Romanization to show for a token: capitalised only when it is a proper noun."""
        seen = tok_case.get(k)
        return seen.most_common(1)[0][0] if seen else k[1]

    freq = collections.Counter()       # entry id -> occurrences in examples
    tok_entry = {}
    for k, n in tok_freq.items():
        eid = resolve(*k)
        tok_entry[k] = eid
        if eid:
            freq[eid] += n
    for eid, n in freq.items():
        entries[eid]["x"]["f"] = n

    # ---- 華語 index ------------------------------------------------------
    # cand[W][(hanji, tl_key)] = {"g": best gloss score, "sense": i, "src": bits, ...}
    SRC_GLOSS, SRC_SAME, SRC_PK, SRC_EX, SRC_HAND = 1, 2, 4, 8, 16
    cand = collections.defaultdict(dict)
    disp = {}          # (W, key) -> romanization as it should be displayed (keeps capitals)

    def put(w, h, t, src, score, sense=-1, eid=None):
        k = (h, tl_key(t))
        disp.setdefault((w, k), nfc(t))
        c = cand[w].setdefault(k, {"src": 0, "base": 0.0, "sense": -1, "eid": eid})
        c["src"] |= src
        if score > c["base"]:
            c["base"] = score
            if sense >= 0:
                c["sense"] = sense
        if eid and not c["eid"]:
            c["eid"] = eid

    first_gloss = {}   # eid -> set of glosses of its first sense (false-friend check)
    gloss_fanout = collections.Counter()
    gl = []
    for eid in order:
        e = entries[eid]
        if e["type"] != T_MAIN or not e["readings"]:
            continue
        for gi_, s in enumerate(e["senses"]):
            for si, pi, w in glosses(s["def"]):
                gl.append((w, eid, gi_, si, pi))
                if gi_ == 0 and si == 0:
                    first_gloss.setdefault(eid, set()).add(w)
                gloss_fanout[w] += 1
    POSSESSIVE = re.compile("^(我|你|妳|他|她|它|您|咱|我們|你們|他們|咱們)的$")
    for w, eid, gi_, si, pi in gl:
        if gloss_fanout[w] > 40:        # a category label, not an equivalent
            continue
        if POSSESSIVE.match(w):         # 我的 is 我 + 的, never one word (阮 is glossed 我的)
            continue
        e = entries[eid]
        base = 5.0 * (0.9 ** gi_) if si == 0 else (3.5 if si == 1 else 2.5) * (0.9 ** gi_)
        base -= 0.15 * pi
        if gi_ > 0 and si > 0:
            base -= 0.8
        if "l" in e["mark"] and len(e["hanji"]) == 1:
            base -= 0.7
        for v in hua_variants(w):
            put(v, e["hanji"], e["readings"][0], SRC_GLOSS, base if v == w else base - 0.5, gi_, eid)

    # identical spelling
    for eid in order:
        e = entries[eid]
        if not e["readings"] or not PURE_HAN.match(e["hanji"]):
            continue
        h = e["hanji"]
        if e["type"] == T_SHARED:
            base = 6.0
        elif e["type"] == T_MAIN:
            # 走 (tsáu) is glossed 跑 and 大家 (ta-ke) 婆婆: same spelling, different word.
            # The example sentences decide how far such a word drops (see the Dice term below).
            fg = first_gloss.get(eid)
            false_friend = bool(fg) and not any(ch in g for g in fg for ch in h)
            base = 3.0 if false_friend else (6.0 if len(h) > 1 else 5.0)
        elif e["type"] == T_SYN:
            base = 3.0
        elif e["type"] == T_APPX:
            base = 1.5
        else:
            base = 1.0
        if len(h) == 1:      # 白話音 before 文言音, unless usage says otherwise (the frequency term)
            if "l" in e["mark"]:
                base -= 0.7
            elif "b" in e["mark"]:
                base += 0.3
        for v in hua_variants(h):
            put(v, h, e["readings"][0], SRC_SAME, base, 0 if e["senses"] else -1, eid)

    # 華語 X子 is regularly X仔 in 台語 (帽子→帽仔); offered below anything the definitions give
    for eid in order:
        e = entries[eid]
        h = e["hanji"]
        if e["type"] == T_MAIN and len(h) >= 2 and h.endswith("仔") and e["readings"] and PURE_HAN.match(h):
            put(h[:-1] + "子", h, e["readings"][0], SRC_SAME, 3.0, 0, eid)

    # 詞彙比較 (dialect comparison table keyed by 華語)
    _, pk = load("詞彙比較")
    pri = {"高雄混合腔": 4.0, "臺南混合腔": 2.0, "臺北偏泉腔": 1.5}
    for r in pk:
        w = re.sub(r"[（(].*?[）)]", "", col(r, 1)).strip()
        h, t, dia = nfc(col(r, 3)), nfc(col(r, 4)), col(r, 2)
        if not w or not h or not t or dia not in pri or not PURE_HAN.match(w):
            continue
        if not PURE_HAN.match(h):
            continue
        eid = resolve(h, t)
        if eid is None:
            # 高雄/臺南 write the vowel of 刀 as "or"; the headwords write "o"
            t2 = nfc(re.sub("(o[\u0300-\u036f]?)r", "\\1", unicodedata.normalize("NFD", t)))
            eid = resolve(h, t2)
            if eid is None and dia == "高雄混合腔" and t2 == t and len(syllables(t)) == len(h):
                put(w, h, t, SRC_PK, 2.0, -1, None)
            if eid is None:
                continue
        put(w, h, entries[eid]["readings"][0], SRC_PK, pri[dia], -1, eid)

    # ---- association from the example sentences --------------------------
    # The same sentence is often listed under several entries: count each pair once.
    seen_pair, uniq = set(), []
    for i, ex in enumerate(examples):
        key = (ex[0], ex[2])
        if key in seen_pair or not ex_tokens[i]:
            continue
        seen_pair.add(key)
        uniq.append(i)
    hua_ngrams = {}            # example index -> set of 華語 n-grams (1..4)
    cW = collections.Counter()
    for i in uniq:
        grams = set()
        for run in re.findall(f"[{HAN}]+", examples[i][2]):
            for n in range(1, 5):
                for j in range(len(run) - n + 1):
                    grams.add(run[j:j + n])
        hua_ngrams[i] = grams
        for g in grams:
            cW[g] += 1
    tok_ex = collections.defaultdict(list)    # token -> example indices
    for i in uniq:
        for k in set(ex_tokens[i]):
            tok_ex[k].append(i)

    assoc = {}         # (W, token) -> (c, dice, pTW, pWT)
    per_tok = {}
    best_w = collections.defaultdict(float)
    for k, idxs in tok_ex.items():
        cT = len(idxs)
        cnt = collections.Counter()
        for i in idxs:
            cnt.update(hua_ngrams[i])
        rows = {}
        for w, c in cnt.items():
            dice = 2.0 * c / (cW[w] + cT)
            if c >= 2 or w in cand:
                assoc[(w, k)] = rows[w] = (c, dice, c / cW[w], c / cT)
            if c >= 3 and dice > best_w[w]:
                best_w[w] = dice
        per_tok[k] = rows
    def is_fragment(w, idxs):
        """True when w always has the same neighbour: it is cut out of a longer fixed phrase."""
        left, right = set(), set()
        for i in idxs:
            text = examples[i][2]
            j = text.find(w)
            while j >= 0:
                a = text[j - 1] if j > 0 else ""
                b = text[j + len(w)] if j + len(w) < len(text) else ""
                left.add(a if HAN_RE.match(a or " ") else "")
                right.add(b if HAN_RE.match(b or " ") else "")
                j = text.find(w, j + 1)
        return (len(left) == 1 and "" not in left) or (len(right) == 1 and "" not in right)

    discovered = []
    new_keys = set()
    for k, rows in per_tok.items():
        h = k[0]
        cT = len(tok_ex[k])

        def strength(w):
            """Dice, pulled down for small counts, nudged up for words we already know."""
            c = rows[w][0]
            d = 2.0 * c / (cW[w] + cT + 2)
            return d * (1.25 if w in cand else 1.0) * (1.1 if w == h else 1.0)

        best_t = max((strength(w) for w, r in rows.items() if r[0] >= 3), default=0.0)
        same_seen = h in rows and rows[h][0] >= 2
        for w, (c, dice, p_tw, p_wt) in rows.items():
            known = w in cand
            st = strength(w)
            if w == h:
                ok = c >= 2 and (known or w[-1] not in EDGE_R)
            elif same_seen and (w in h or h in w):
                ok = False     # a piece of, or a stretch around, the identically spelled word
            elif known:
                ok = (c >= 3 and st >= 0.3 and p_tw >= 0.35 and p_wt >= 0.2
                      and dice >= 0.6 * best_w[w] and st >= 0.6 * best_t)
            else:      # a 華語 word seen nowhere else: needs strong, two-way evidence,
                # and must be about as long as the 台語 word (件衣服 ↔ 領 is a classifier, not a translation)
                ok = (2 <= len(w) <= 3 and abs(len(w) - len(h)) <= 1
                      and w[0] not in EDGE_L and w[-1] not in EDGE_R
                      and ((c >= 5 and p_tw >= 0.7 and p_wt >= 0.5) or (c >= 3 and p_tw >= 0.8 and p_wt >= 0.6))
                      and not is_fragment(w, tok_ex[k]))
            if not ok:
                continue
            # a fragment (or an over-long stretch) of a better matching n-gram is noise
            if w != h and any(w2 != w and (w in w2 or w2 in w) and r2[0] >= 2 and
                              (strength(w2) > st or (strength(w2) == st and len(w2) > len(w)))
                              for w2, r2 in rows.items()):
                continue
            eid = tok_entry.get(k)
            t = entries[eid]["readings"][0] if eid and tl_key(entries[eid]["readings"][0]) == k[1] else spelling(k)
            for v in hua_variants(w):
                if v not in cand:
                    new_keys.add(v)
                if (h, tl_key(t)) not in cand[v]:
                    discovered.append((v, h, t))
                put(v, h, t, SRC_EX, 1.0, -1, eid)
    print(f"sentence pairs {len(uniq)}  association pairs {len(assoc)}  learned from examples {len(discovered)}"
          f"  (new 華語 words: {len(new_keys)})")

    # ---- hand table (function words etc.) --------------------------------
    hand_missing = []
    hand_path = os.path.join(TOOLS, "hand_map.tsv")
    hand = collections.defaultdict(list)
    if os.path.exists(hand_path):
        for line in open(hand_path, encoding="utf-8"):
            line = line.rstrip("\n")
            if not line.strip() or line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) < 3:
                continue
            w, h, t = parts[0].strip(), nfc(parts[1].strip()), nfc(parts[2].strip())
            note = parts[3].strip() if len(parts) > 3 else ""
            hand[w].append((h, t, note))
            if " " not in t and resolve(h, t) is None:
                hand_missing.append((w, h, t))      # phrases (with a space) are checked word by word in the site
        for w, lst in hand.items():
            for i, (h, t, note) in enumerate(lst):
                eid = resolve(h, t)                  # some headwords are phrases too: 彼个 hit ê, 查埔囡仔 tsa-poo gín-á
                put(w, h, t, SRC_HAND, 100.0 - i, -1, eid)
                if note:
                    cand[w][(h, tl_key(t))]["note"] = note
        print(f"hand table: {sum(len(v) for v in hand.values())} rows, not found in dictionary: {len(hand_missing)}")
        for m in hand_missing:
            print("   ?", m)

    # ---- final scores ----------------------------------------------------
    index = {}
    for w, cs in cand.items():
        rows = []
        for k, c in cs.items():
            h, t = k
            a = assoc.get((w, k))
            dice = a[1] if a else 0.0
            eid = c["eid"]
            f = tok_freq.get(k, 0)
            if eid:
                f = max(f, freq.get(eid, 0))
            if c["src"] & SRC_HAND:
                score = c["base"]          # the hand table fixes the order
            else:
                score = c["base"] + 6.0 * dice + 0.5 * math.log2(1 + f)
            ref = eid if eid else f"{h}|{disp.get((w, k), t)}"
            tl_over = ""
            if eid:
                main = tl_key(entries[eid]["readings"][0])
                if t != main and (t.startswith("--") != main.startswith("--") or tl_bare(t) != tl_bare(main)):
                    tl_over = disp.get((w, k), t)
            sense = c["sense"]
            if eid and sense < 0:
                # hand table / examples: the first sense whose definition mentions the 華語 word
                for si_, sn in enumerate(entries[eid]["senses"]):
                    if w in sn["def"]:
                        sense = si_
                        break
            row = [ref, sense, c["src"], round(score, 2)]
            if tl_over or c.get("note"):
                row.append(tl_over)
            if c.get("note"):
                row.append(c["note"])
            rows.append(row)
        rows.sort(key=lambda r: -r[3])
        index[w] = rows[:8]

    # ---- sandhi class hint for entries without senses (臺華共同詞) --------
    def cat_pos(cat):
        cats = cat.split(",")
        if "副詞" in cats:
            return "副詞"
        if "連詞、介詞" in cats:
            return "連詞"
        if "代名詞" in cats:
            return "代詞"
        if any(c.startswith("一般動詞") for c in cats):
            return "動詞"
        if "助詞、嘆詞" in cats:
            return "助詞"
        return ""

    over_path = os.path.join(TOOLS, "pos_overrides.tsv")
    pos_over = {}
    if os.path.exists(over_path):
        for line in open(over_path, encoding="utf-8"):
            p = line.rstrip("\n").split("\t")
            if len(p) >= 2 and not line.startswith("#"):
                for w in p[1].split():
                    pos_over[w] = p[0]
    n_hint = 0
    for eid in order:
        e = entries[eid]
        if e["senses"] and any(pos_list[s["pos"]] for s in e["senses"]):
            continue
        p = pos_over.get(e["hanji"]) or cat_pos(e["cat"])
        if not p and e["type"] == T_SHARED and "時間節令" in e["cat"].split(","):
            p = "時間詞"
        if p:
            e["x"]["p"] = p
            n_hint += 1
    print(f"POS hints for entries without senses: {n_hint}")

    # ---- daily list -------------------------------------------------------
    BAD = re.compile(r"粗俗|罵人|詈|不雅|髒話|性器|生殖器|性行為|性交|陰莖|陰道|睪丸|妓|嫖|屎|尿|屁|精液|姦")
    daily = []
    for eid in order:
        e = entries[eid]
        if e["type"] != T_MAIN or not e["senses"] or not PURE_HAN.match(e["hanji"]):
            continue
        if e["readings"][0].startswith("--"):      # sentence particles make poor flashcards
            continue
        s0 = e["senses"][0]
        if not s0["ex"] or len(s0["def"]) > 60 or BAD.search(" ".join(s["def"] for s in e["senses"])):
            continue
        ex = examples[s0["ex"][0]]
        if len(HAN_RE.findall(ex[0])) < 4 or BAD.search(ex[2]):
            continue
        if "詈語" in e["cat"]:
            continue
        daily.append(eid)
    rnd = random.Random(20240924)
    rnd.shuffle(daily)
    # the more common a word is in the examples the earlier it tends to appear
    daily.sort(key=lambda i: -min(freq.get(i, 0), 30) + rnd.random() * 30)
    print(f"daily candidates {len(daily)}")

    # ---- write ------------------------------------------------------------
    os.makedirs(OUT, exist_ok=True)

    def dump(name, obj):
        p = os.path.join(OUT, name)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        print(f"  {name}: {os.path.getsize(p) / 1024:.0f} KB")

    out_entries = []
    for eid in order:
        e = entries[eid]
        senses = []
        for s in e["senses"]:
            row = [s["pos"], s["def"], s["ex"][0] if s["ex"] else 0, len(s["ex"])]
            if s["syn"] or s["ant"]:
                row.append(s["syn"])
                row.append(s["ant"])
            senses.append(row)
        x = dict(e["x"])
        if e["cat"]:
            x["c"] = e["cat"]
        row = [eid, e["type"], e["hanji"], e["tailo"], e["mark"], senses]
        if x:
            row.append(x)
        out_entries.append(row)

    print("writing:")
    dump("dict.json", {
        "meta": {
            "source": "教育部《臺灣台語常用詞辭典》",
            "url": "https://sutian.moe.edu.tw/",
            "license": "創用CC 姓名標示-禁止改作 3.0 臺灣",
            "built": datetime.date.today().isoformat(),
            "entries": len(out_entries), "examples": len(examples),
        },
        "types": TYPES, "pos": pos_list, "e": out_entries,
    })
    dump("examples.json", [ex[:3] for ex in examples])
    dump("huayu.json", index)
    chars = {}
    for ch, cnt in char_read.items():
        chars[ch] = " ".join(s for s, _ in cnt.most_common(4))
    dump("chars.json", chars)
    dump("daily.json", daily[:730])       # two years of 今日一詞; the widget embeds the same list

    if report:
        rnd2 = random.Random(5)
        print("sample of pairs learned from examples (* = 華語 word not known from elsewhere):")
        smp = rnd2.sample(discovered, min(150, len(discovered)))
        print("   " + "; ".join(f"{'*' if v in new_keys else ''}{v}→{h} {t}" for v, h, t in smp))
        tests = ("吃 喝 漂亮 喜歡 知道 現在 今天 明天 昨天 什麼 怎麼 哪裡 誰 多少 謝謝 對不起 不好意思 再見 "
                 "我 你 他 她 我們 你們 他們 這 那 這裡 那裡 這個 那個 很 非常 太 也 都 不 沒 沒有 可以 不可以 要 不要 想 會 不會 "
                 "給 在 和 跟 的 了 嗎 呢 吧 是 不是 有 東西 房子 小孩 男人 女人 老師 學生 學校 工作 朋友 家 回家 睡覺 起床 "
                 "洗澡 吃飯 吃飽 早餐 午餐 晚餐 下雨 天氣 冷 熱 快 慢 大 小 多 少 好 壞 高 矮 胖 瘦 高興 生氣 難過 害怕 累 餓 渴 痛 "
                 "生病 醫生 醫院 錢 買 賣 貴 便宜 走 跑 跳 坐 站 看 聽 說 講話 讀書 寫字 玩 笑 哭 一起 一點 已經 還沒 常常 有時候 "
                 "馬上 剛才 等一下 以前 以後 早上 中午 下午 晚上 腳踏車 機車 汽車 火車 電話 手機 電腦 電視 冰箱 廁所 廚房 筷子 "
                 "湯匙 碗 衣服 褲子 鞋子 帽子 眼睛 鼻子 嘴巴 耳朵 手 腳 頭 肚子 太陽 月亮 星星 蟑螂 蚊子 狗 貓 雞 鴨 魚 豬 牛 "
                 "蔬菜 水果 香蕉 鳳梨 番茄 花生 馬鈴薯 玉米 地瓜 稀飯 肥皂 傘 垃圾 聊天 丟 拿 放 找 穿 打 開 關 懂 忘記 記得 "
                 "覺得 希望 幫忙 小心 厲害 奇怪 麻煩 簡單 困難 熱鬧 乾淨 骯髒 台灣 台語 爸爸 媽媽 哥哥 姊姊 弟弟 妹妹 阿公 "
                 "阿嬤 先生 太太 兒子 女兒 為什麼 因為 所以 但是 如果 還 又 再 就 才 把 被 讓 比 從 到 去 來 回來 出去 上班 下班 "
                 "上課 一個 兩個 三 十 百 千 萬 年 月 日 星期 小時 分鐘 時候 地方 事情 問題 意思 名字 聲音 顏色 紅 白 黑").split()
        src_name = {1: "釋", 2: "同", 4: "比", 8: "例", 16: "手"}
        for w in tests:
            rows = index.get(w, [])
            out = []
            for r in rows[:6]:
                if isinstance(r[0], int):
                    e = entries[r[0]]
                    lab = f"{e['hanji']} {r[4] if len(r) > 4 and r[4] else e['readings'][0]}"
                else:
                    lab = r[0].replace("|", " ")
                s = "".join(v for b, v in src_name.items() if r[2] & b)
                out.append(f"{lab} [{s} {r[3]}]")
            print(f"{w}: " + "; ".join(out))
    return entries, index


if __name__ == "__main__":
    main()

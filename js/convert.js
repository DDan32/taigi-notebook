/* 把輸入的句子變成一段一段的「詞」，每段附上可能的台語說法。
 *
 *   mode "huayu"  華語句子：用華語→台語索引斷詞、逐詞對應
 *   mode "taigi"  台語漢字：用辭典詞目斷詞、標音
 *   mode "tailo"  台羅：逐詞查漢字與詞性
 *
 * 這是逐詞對應，不是翻譯：語序和句型不會自動調整，所以每一段都可以換詞、改音、移動。
 */
(function (root) {
  "use strict";
  var TG = (root.TG = root.TG || {});
  var req = typeof require !== "undefined" ? require : null;
  var T = TG.tailo || req("./tailo.js").tailo;
  var D = TG.dict || req("./dict.js").dict;
  var S = TG.sandhi || req("./sandhi.js").sandhi;

  var MAX_WORD = 7;
  var HAN_RUN = /((?:[〇㐀-鿿豈-﫿]|[\ud840-\ud88f][\udc00-\udfff])+)/;
  // characters that only (or almost only) appear in written Taiwanese
  var TAIGI_MARKERS = "欲毋袂佇咧矣𪜶阮恁啥佗遮遐媠囡𠢕𨑨迌閣攏嘛予佮濟偌啉睏厝跤喙揣捌拄𤆬𫝛𬦰𫞼𥴊个爿囝翁歹挵搝𢯾毋甘焦𧮙𤺪𣁳粿箍";

  function detectMode(text) {
    if (T.looksRomanized(text)) return "tailo";
    var chars = Array.from(text);
    for (var i = 0; i < chars.length; i++) if (TAIGI_MARKERS.indexOf(chars[i]) >= 0) return "taigi";
    return "huayu";
  }

  // ---- candidates -----------------------------------------------------------

  function entryCandidate(e, reading, extra) {
    var c = { entry: e, hanji: e.hanji, tailo: reading || e.tailo, sense: -1, src: 0, score: 0, note: "" };
    if (extra) for (var k in extra) c[k] = extra[k];
    return c;
  }

  function sameCand(a, b) {
    return a.hanji === b.hanji && D.sameReading(a.tailo, b.tailo) && /^--/.test(a.tailo) === /^--/.test(b.tailo);
  }

  function dedupe(list) {
    var out = [];
    list.forEach(function (c) {
      if (c && !out.some(function (o) { return sameCand(o, c); })) out.push(c);
    });
    return out;
  }

  /** 使用者的更正排在最前面。fix.word[華語] = {h,t}；fix.read[漢字] = 台羅。 */
  function applyFixes(src, cands, fix) {
    if (!fix) return cands;
    var out = cands.slice();
    var w = fix.word && fix.word[src];
    if (w) {
      var mine = null;
      out = out.filter(function (c) {
        if (!mine && c.hanji === w.h && D.sameReading(c.tailo, w.t)) { mine = c; return false; }
        return true;
      });
      if (!mine) mine = { entry: D.findWord(w.h, w.t), hanji: w.h, tailo: w.t, sense: -1, src: 0, score: 0, note: "" };
      mine.fixed = true;
      out.unshift(mine);
    }
    if (fix.read) {
      out = out.map(function (c) {
        var r = fix.read[c.hanji];
        if (!r || c.fixed || D.sameReading(r, c.tailo)) return c;
        var copy = {};
        for (var k in c) copy[k] = c[k];
        copy.tailo = r; copy.fixed = true; copy.was = c.tailo;
        return copy;
      });
    }
    return out;
  }

  function huayuCands(w) {
    var c = D.huayuCandidates(w);
    if (!c.length && w.length >= 2 && /[子兒]$/.test(w)) {
      // 鞋子 -> 鞋：辭典沒有收「X子」時用 X 的說法
      c = D.huayuCandidates(w.slice(0, -1)).map(function (x) {
        x.note = x.note || "華語的「" + w.slice(-1) + "」不譯";
        return x;
      });
    }
    return c;
  }

  var DEGREE = /^(很|太|最|更|非常|比較)(.+)$/;

  function hasHuayu(w, fix) {
    if (fix && fix.word && fix.word[w]) return true;
    // 很好、太貴…：程度副詞和後面的詞分開對應（辭典有些釋義整個寫成「很好」）
    var m = DEGREE.exec(w);
    if (m && (D.huayu[m[2]] || m[2].length === 1)) return false;
    if (D.huayu[w]) return true;
    return w.length >= 2 && /[子兒]$/.test(w) && !!D.huayu[w.slice(0, -1)];
  }

  function taigiCands(w) {
    var out = [];
    (D.byHanji.get(w) || []).forEach(function (e) {
      if (!e.readings.length) return;
      out.push(entryCandidate(e, e.tailo));
      e.readings.slice(1).forEach(function (r) { out.push(entryCandidate(e, r, { note: "又音" })); });
    });
    // words that only exist in the example sentences (臺灣, 食飯 …)
    D.huayuCandidates(w).forEach(function (c) { if (c.hanji === w) out.push(c); });
    return dedupe(out);
  }

  function hasTaigi(w) {
    if (D.byHanji.has(w)) return (D.byHanji.get(w) || []).some(function (e) { return e.readings.length; });
    var rows = D.huayu[w];
    return !!rows && D.huayuCandidates(w).some(function (c) { return c.hanji === w; });
  }

  /** 辭典沒有的字：用字音表逐字拼。 */
  function charFallback(ch) {
    var r = (D.chars[ch] || "").split(" ").filter(Boolean);
    if (!r.length) return [{ entry: null, hanji: ch, tailo: "", sense: -1, src: 0, score: 0, note: "辭典沒有這個字的讀音", unknown: true }];
    return r.map(function (t) {
      return { entry: null, hanji: ch, tailo: t, sense: -1, src: 0, score: 0, note: "逐字讀音，請確認", guess: true };
    });
  }

  // ---- segmentation ---------------------------------------------------------

  /** Best split of a run of 漢字: longer known words win, ties go to the longer first word. */
  function splitRun(chars, has, weight) {
    var n = chars.length;
    var best = new Array(n + 1);
    var step = new Array(n + 1);
    best[n] = 0;
    for (var i = n - 1; i >= 0; i--) {
      best[i] = -Infinity;
      for (var len = Math.min(MAX_WORD, n - i); len >= 1; len--) {
        var w = chars.slice(i, i + len).join("");
        var known = has(w);
        if (!known && len > 1) continue;
        var sc = (known ? len * len + weight(w) : -0.5) + best[i + len];
        if (sc > best[i]) { best[i] = sc; step[i] = len; }
      }
    }
    var out = [];
    for (var p = 0; p < n; p += step[p]) out.push(chars.slice(p, p + step[p]).join(""));
    return out;
  }

  function topScoreWeight(w) {
    var rows = D.huayu[w];
    return rows && rows.length ? Math.min(rows[0][3], 20) / 40 : 0;
  }

  function seg(src, cands) {
    return { kind: "seg", src: src, cands: cands, pick: 0, ov: {} };
  }

  function punct(text) { return { kind: "punct", text: text }; }

  /** 不是台羅的拉丁字（T-shirt、LINE）：照原樣放著，不標調。 */
  function foreign(text) {
    return seg(text, [{ entry: null, hanji: text, tailo: "", sense: -1, src: 0, score: 0, note: "不是台羅，照原文", unknown: true }]);
  }

  /** 標點照放；數字自成一格，讀音留給使用者填（2 可以是 nn̄g 也可以是 jī）。 */
  function pushOther(out, text) {
    text.split(/(\d+)/).forEach(function (part) {
      if (!part) return;
      if (/^\d+$/.test(part)) {
        out.push(seg(part, [{ entry: null, hanji: part, tailo: "", sense: -1, src: 0, score: 0, note: "數字的讀音請自己填", unknown: true }]));
      } else out.push(punct(part));
    });
  }

  function splitText(text, each) {
    var out = [];
    T.nfc(text).split(HAN_RUN).forEach(function (part, i) {
      if (!part) return;
      if (i % 2 === 1) { each(Array.from(part), out); return; }
      // not 漢字: romanized words stay as words, the rest is punctuation
      T.tokenize(part).forEach(function (t) {
        if (t.kind === "word") out.push(T.isRomanization(t.text) ? seg(t.text, romanCands(T.toDiacritic(t.text))) : foreign(t.text));
        else if (/\S/.test(t.text)) pushOther(out, t.text);
      });
    });
    return out;
  }

  function fromHuayu(text, fix) {
    var out = splitText(text, function (chars, acc) {
      splitRun(chars, function (w) { return hasHuayu(w, fix); }, topScoreWeight).forEach(function (w) {
        var c = applyFixes(w, huayuCands(w), fix);
        if (!c.length) c = applyFixes(w, charFallback(w), fix);
        acc.push(seg(w, c));
      });
    });
    joinGuesses(out);
    contextual(out, fix);
    return out;
  }

  function fromTaigi(text, fix) {
    return splitText(text, function (chars, acc) {
      splitRun(chars, hasTaigi, function (w) {
        var l = D.byHanji.get(w);
        return l && l.length ? Math.min(l[0].freq, 200) / 800 : 0;
      }).forEach(function (w) {
        var c = taigiCands(w);
        if (!c.length) c = charFallback(w);
        if (fix && fix.read) c = applyFixes(w, c, { read: fix.read });
        acc.push(seg(w, c));
      });
    });
  }

  // ---- romanized input ------------------------------------------------------

  function romanCands(tailo) {
    var hits = D.search(T.toNumeric(tailo), 12).filter(function (r) {
      return D.sameReading(r.reading, tailo);
    });
    var c = hits.map(function (r) {
      return entryCandidate(r.entry, keepCase(tailo, r.reading));
    });
    if (!c.length) c = [{ entry: null, hanji: "", tailo: tailo, sense: -1, src: 0, score: 0, note: "辭典查不到這個讀音的詞", noHanji: true }];
    if (/^--/.test(tailo)) {
      // 輕聲詞多半是助詞：矣、的、咧、未…排在同音的實詞前面
      var rank = function (x) {
        if (!x.entry) return 3;
        if (/^--/.test(x.entry.tailo)) return 0;
        return x.entry.senses.some(function (s) { return D.pos[s[0]] === "助詞"; }) ? 1 : 2;
      };
      c = c.map(function (x, i) { return [x, i]; }).sort(function (a, b) { return rank(a[0]) - rank(b[0]) || a[1] - b[1]; })
        .map(function (x) { return x[0]; });
    }
    return dedupe(c);
  }

  /** The dictionary's spelling (capitals for proper nouns), with the neutral-tone "--" exactly as typed. */
  function keepCase(typed, reading) {
    var bare = reading.replace(/^--/, "");
    return /^--/.test(typed) ? "--" + bare : bare;
  }

  function fromTailo(text) {
    var out = [];
    T.tokenize(text).forEach(function (t) {
      if (t.kind === "punct") { pushOther(out, t.text); return; }
      if (!T.isRomanization(t.text)) { out.push(foreign(t.text)); return; }
      // "tsia̍h-pá--buē": the neutral-tone part is a word of its own unless the whole thing is a headword
      var whole = T.toDiacritic(t.text);
      var c = romanCands(whole);
      if (c[0].noHanji && whole.replace(/^--/, "").indexOf("--") > 0) {
        whole.split(/(?=--)/).forEach(function (p) { if (p) out.push(seg(p, romanCands(p))); });
      } else out.push(seg(t.text, c));
    });
    return out;
  }

  // ---- small context rules for 華語 function words ---------------------------

  function topPos(s) {
    if (!s || s.kind !== "seg" || !s.cands.length) return "";
    var c = s.cands[0];
    return c.entry ? D.sandhiPos(c.entry, c.sense) : "";
  }

  function pickWhere(s, test) {
    for (var i = 0; i < s.cands.length; i++) if (test(s.cands[i])) { s.pick = i; return true; }
    return false;
  }

  function contextual(segs, fix) {
    segs.forEach(function (s, i) {
      if (s.kind !== "seg" || (fix && fix.word && fix.word[s.src])) return;
      var nx = segs[i + 1];
      var atEnd = !nx || nx.kind === "punct";
      var is = function (h, t) { return function (c) { return c.hanji === h && T.toPlain(c.tailo) === t; }; };
      if (s.src === "的" && atEnd) pickWhere(s, is("的", "--e"));
      else if (s.src === "了" && !atEnd) pickWhere(s, is("了", "liau"));
      else if ((s.src === "這" || s.src === "那") && (atEnd || nx.src === "是" || nx.src === "不是")) {
        pickWhere(s, s.src === "這" ? is("這", "tse") : is("彼", "he"));
      } else if (s.src === "在" && topPos(nx) === "動詞") pickWhere(s, is("咧", "teh"));
      else if (s.src === "不" && topPos(nx) === "形容詞") pickWhere(s, is("無", "bo"));
    });
  }

  /** 連續的「逐字讀音」併成一個詞，例如辭典沒收的專有名詞。 */
  function joinGuesses(segs) {
    for (var i = 0; i < segs.length - 1; i++) {
      var a = segs[i], b = segs[i + 1];
      if (a.kind !== "seg" || b.kind !== "seg") continue;
      if (!isGuess(a) || !isGuess(b) || !a.cands[0].tailo || !b.cands[0].tailo) continue;
      var c = a.cands[0], d = b.cands[0];
      segs.splice(i, 2, seg(a.src + b.src, [{
        entry: null, hanji: c.hanji + d.hanji, tailo: c.tailo + "-" + d.tailo, sense: -1, src: 0, score: 0,
        note: "逐字讀音，請確認", guess: true
      }]));
      i--;
    }
  }

  function isGuess(s) { return s.cands.length > 0 && !!s.cands[0].guess; }

  // ---- segments -> words for the sandhi engine ------------------------------

  function current(s) { return s.cands[s.pick] || s.cands[0]; }

  /**
   * 辭典沒有收的台語詞（看著、講煞、摔破…多半是動詞加補語）：用第一個字的詞性猜。
   * 逐字拼出來的華語詞（專有名詞之類）不猜，當名詞。
   */
  function guessPos(c) {
    if (c.guess || c.unknown || !c.hanji || !c.tailo) return "";
    var ch = Array.from(c.hanji)[0];
    var syl = T.parseWord(c.tailo)[0];
    if (!syl || Array.from(c.hanji).length < 2) return "";
    var e = D.findWord(ch, T.compose(syl.base, syl.tone));
    var p = e ? D.sandhiPos(e, -1) : "";
    return p === "動詞" || p === "形容詞" || p === "副詞" ? p : "";
  }

  /** 一個候選詞可能是詞組（台羅有空白）：拆成詞，各自查詞性。 */
  function candWords(c) {
    var tl = (c.tailo || "").trim();
    if (!tl) return [{ kind: "word", hanji: c.hanji, tailo: "", pos: "" }];
    var parts = tl.split(/\s+/);
    if (parts.length === 1) {
      var e = c.entry || D.findWord(c.hanji, tl);
      // a candidate that came with a specific sense keeps that sense's 詞性
      return [{ kind: "word", hanji: c.hanji, tailo: tl, pos: e ? D.sandhiPos(e, c.sense) : guessPos(c), posAll: D.allPos(e), posFixed: c.sense >= 0 }];
    }
    var chars = Array.from(c.hanji);
    var counts = parts.map(function (p) { return T.parseWord(p).length; });
    var total = counts.reduce(function (a, b) { return a + b; }, 0);
    if (total !== chars.length) return [{ kind: "word", hanji: c.hanji, tailo: parts.join("-"), pos: "" }];
    var k = 0;
    return parts.map(function (p, i) {
      var h = chars.slice(k, k + counts[i]).join("");
      k += counts[i];
      var e = D.findWord(h, p);
      return { kind: "word", hanji: h, tailo: p, pos: e ? D.sandhiPos(e, -1) : guessPos({ hanji: h, tailo: p }), posAll: D.allPos(e) };
    });
  }

  /** segments -> flat tokens (each word remembers its segment), tone sandhi applied. */
  function analyse(segs, opts, mode) {
    var tokens = [];
    opts = { t5: opts && opts.t5, joinNouns: mode === "huayu" };
    segs.forEach(function (s, si) {
      if (s.kind === "punct") { tokens.push({ kind: "punct", text: s.text, seg: si }); return; }
      var c = current(s);
      if (!c) return;
      candWords(c).forEach(function (w, wi) {
        w.seg = si; w.wi = wi;
        w.override = s.ov && s.ov[wi];
        tokens.push(w);
      });
    });
    S.apply(tokens, opts);
    return tokens;
  }

  function convert(text, mode, fix) {
    mode = mode && mode !== "auto" ? mode : detectMode(text);
    var segs = mode === "tailo" ? fromTailo(text) : mode === "taigi" ? fromTaigi(text, fix) : fromHuayu(text, fix);
    return { mode: mode, segs: segs };
  }

  TG.convert = {
    detectMode: detectMode,
    convert: convert,
    fromHuayu: fromHuayu,
    fromTaigi: fromTaigi,
    fromTailo: fromTailo,
    analyse: analyse,
    candWords: candWords,
    current: current,
    huayuCands: huayuCands,
    taigiCands: taigiCands,
    romanCands: romanCands,
    applyFixes: applyFixes
  };

  if (typeof module !== "undefined" && module.exports) module.exports = TG;
})(typeof window !== "undefined" ? window : globalThis);

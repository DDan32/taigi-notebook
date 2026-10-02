/* 台羅（臺灣台語羅馬字拼音方案）的解析與轉換。
 *
 *   TG.tailo.parseSyllable("tsia̍h")  -> { base: "tsiah", tone: 8, stop: "h", ... }
 *   TG.tailo.toDiacritic("gau5")      -> "gâu"
 *   TG.tailo.toNumeric("Tâi-pak")     -> "Tai5-pak4"
 *   TG.tailo.tokenize("Guá beh khì Tâi-pak.") -> words / punctuation
 */
(function (root) {
  "use strict";
  var TG = (root.TG = root.TG || {});

  var MARK_OF_TONE = { 2: "́", 3: "̀", 5: "̂", 6: "̌", 7: "̄", 8: "̍", 9: "̋" };
  var TONE_OF_MARK = {};
  Object.keys(MARK_OF_TONE).forEach(function (t) { TONE_OF_MARK[MARK_OF_TONE[t]] = +t; });
  var MARK_RE = /[́̀̂̌̄̍̋]/g;
  var LETTER = "A-Za-z\\u00c0-\\u024f\\u0300-\\u036f\\u1e00-\\u1eff";
  var SYL_RE = new RegExp("[" + LETTER + "]+[1-9]?", "g");
  // a word: optional leading "--", syllables joined by "-" or "--"
  var WORD_RE = new RegExp("(?:--)?[" + LETTER + "]+[1-9]?(?:--?[" + LETTER + "]+[1-9]?)*", "g");

  function nfc(s) { return s.normalize("NFC"); }

  /** One syllable, written with a tone mark or with a trailing digit. */
  function parseSyllable(text) {
    var s = text.normalize("NFD");
    var tone = 0;
    var m = s.match(MARK_RE);
    if (m) tone = TONE_OF_MARK[m[0]];
    s = s.replace(MARK_RE, "");
    var d = s.match(/[1-9]$/);
    if (d) { tone = +d[0]; s = s.slice(0, -1); }
    var base = nfc(s);
    var lower = base.toLowerCase();
    var stop = /[ptkh]$/.test(lower) && lower.length > 1 ? lower.slice(-1) : "";
    if (!tone) tone = stop ? 4 : 1;
    return {
      base: base,                    // letters without the tone, original capitals
      key: lower,                    // lower-case, toneless
      tone: tone,
      stop: stop,                    // "p" "t" "k" "h" or ""
      cap: base.charAt(0) !== lower.charAt(0)
    };
  }

  /** Index of the letter that carries the tone mark. */
  function markIndex(lower) {
    var i;
    if ((i = lower.indexOf("a")) >= 0) return i;
    if ((i = lower.indexOf("oo")) >= 0) return i;
    if ((i = lower.indexOf("ee")) >= 0) return i;
    if ((i = lower.indexOf("ere")) >= 0) return i + 2;
    if ((i = lower.indexOf("e")) >= 0) return i;
    if ((i = lower.indexOf("o")) >= 0) return i;
    if ((i = lower.indexOf("iu")) >= 0) return i + 1;
    if ((i = lower.indexOf("ui")) >= 0) return i + 1;
    if ((i = lower.indexOf("i")) >= 0) return i;
    if ((i = lower.indexOf("u")) >= 0) return i;
    if ((i = lower.indexOf("ng")) >= 0) return i;
    if ((i = lower.indexOf("m")) >= 0) return i;
    if ((i = lower.indexOf("n")) >= 0) return i;
    return -1;
  }

  /** ("tsiah", 8) -> "tsia̍h" */
  function compose(base, tone) {
    var mark = MARK_OF_TONE[tone];
    if (!mark) return nfc(base);
    var i = markIndex(base.toLowerCase());
    if (i < 0) return nfc(base);
    return nfc(base.slice(0, i + 1) + mark + base.slice(i + 1));
  }

  function mapSyllables(text, fn) {
    return nfc(text).replace(SYL_RE, function (syl) { return fn(parseSyllable(syl), syl); });
  }

  /** Any mix of "gau5 tsing3" / "gâu tsìng" -> tone marks. */
  function toDiacritic(text) {
    return mapSyllables(text, function (p) { return compose(p.base, p.tone); });
  }

  /** -> trailing digits. `explicit14` writes tones 1 and 4 too (the default). */
  function toNumeric(text, explicit14) {
    return mapSyllables(text, function (p) {
      if (explicit14 === false && (p.tone === 1 || p.tone === 4)) return p.base;
      return p.base + p.tone;
    });
  }

  /** Lower-case, no tones: the form used for loose matching. */
  function toPlain(text) {
    return mapSyllables(text, function (p) { return p.key; }).toLowerCase();
  }

  function syllables(text) {
    return (nfc(text).match(SYL_RE) || []).map(parseSyllable);
  }

  /** A romanized word -> syllables with their neutral-tone flag ("--" in front). */
  function parseWord(text) {
    var out = [];
    var neutral = false;
    var re = new RegExp("(--?)?([" + LETTER + "]+[1-9]?)", "g");
    var m;
    var s = nfc(text);
    while ((m = re.exec(s))) {
      if (m[1] === "--") neutral = true;
      var p = parseSyllable(m[2]);
      p.neutral = neutral;
      p.sep = out.length ? m[1] || "-" : m[1] || "";
      out.push(p);
    }
    return out;
  }

  var PUNCT_MAP = { "，": ",", "。": ".", "？": "?", "！": "!", "、": ",", "；": ";", "：": ":", "「": "“", "」": "”", "『": "‘", "』": "’", "（": "(", "）": ")" };

  /** Split romanized running text into words and punctuation. */
  function tokenize(text) {
    var out = [];
    var s = nfc(text);
    var last = 0;
    var m;
    WORD_RE.lastIndex = 0;
    while ((m = WORD_RE.exec(s))) {
      pushPunct(s.slice(last, m.index));
      out.push({ kind: "word", text: m[0] });
      last = m.index + m[0].length;
    }
    pushPunct(s.slice(last));
    return out;

    function pushPunct(gap) {
      var t = gap.replace(/\s+/g, "");
      if (t) out.push({ kind: "punct", text: t });
    }
  }

  var INITIAL = "(?:ph|p|b|m|tsh|ts|th|t|n|l|kh|k|g|ng|h|s|j)?";
  var VALID = new RegExp("^" + INITIAL + "(?:[aeiour]{1,4}(?:nn)?(?:m|ng|n|p|t|k|h)?|m|ng)h?$");

  /** Could this word be 台羅? ("shirt" and "xyz" could not.) */
  function isRomanization(word) {
    var syls = syllables(word);
    return syls.length > 0 && syls.every(function (s) { return VALID.test(s.key); });
  }

  /** Does this string look like romanization rather than 漢字? */
  function looksRomanized(text) {
    var letters = (text.match(/[A-Za-zÀ-ɏ]/g) || []).length;
    var han = (text.match(/[㐀-鿿]|[\ud840-\ud88f][\udc00-\udfff]/g) || []).length;
    return letters > 0 && letters >= han * 2;
  }

  TG.tailo = {
    MARK_OF_TONE: MARK_OF_TONE,
    PUNCT_MAP: PUNCT_MAP,
    parseSyllable: parseSyllable,
    parseWord: parseWord,
    compose: compose,
    toDiacritic: toDiacritic,
    toNumeric: toNumeric,
    toPlain: toPlain,
    syllables: syllables,
    tokenize: tokenize,
    looksRomanized: looksRomanized,
    isRomanization: isRomanization,
    nfc: nfc
  };

  if (typeof module !== "undefined" && module.exports) module.exports = TG;
})(typeof window !== "undefined" ? window : globalThis);

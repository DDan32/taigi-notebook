/* 變調：算出句子裡每個音節的本調、變調後的聲調，以及哪些音節保留本調。
 *
 * 台語的書寫一律寫本調。說話時，一個「變調組」裡只有最後一個音節讀本調，
 * 前面的音節都要變調。變調組在哪裡結束由句法決定，這裡用詞性做近似判斷：
 *
 *   - 句尾、標點前、輕聲（--）前：讀本調
 *   - 名詞、時間詞、方位詞的最後一個音節：讀本調（後面緊接方位詞時除外）
 *   - 「的」(ê) 前面的詞：讀本調（人稱代名詞除外：我的 guá ê → gua1）
 *   - 人稱代名詞、限定詞（這 tsit／彼 hit／啥 siánn…）、數詞、動詞、形容詞、副詞、介詞…：變調
 *   - opts.joinNouns：相鄰的兩個名詞當成複合詞（前一個變調）。華語逐詞對應時開啟。
 *
 * 這只是預設值。句法判斷不可能全對，所以每個音節都可以由使用者手動改（word.override）。
 */
(function (root) {
  "use strict";
  var TG = (root.TG = root.TG || {});
  var T = TG.tailo || (typeof require !== "undefined" ? require("./tailo.js").tailo : null);

  /** 一般變調。opts.t5: 第 5 聲變成 7（高雄、臺南等，預設）或 3（臺北等偏泉腔）。 */
  function sandhiTone(tone, stop, opts) {
    switch (tone) {
      case 1: return 7;
      case 2: return 1;
      case 3: return 2;
      case 4: return stop === "h" ? 2 : 8;
      case 5: return opts && opts.t5 === 3 ? 3 : 7;
      case 6: return 3;
      case 7: return 3;
      case 8: return stop === "h" ? 3 : 4;
      default: return tone;
    }
  }

  /** 「仔」(á) 前面的音節另有一套變調。 */
  function sandhiBeforeA(tone, stop) {
    switch (tone) {
      case 1: return 7;
      case 2: return 1;
      case 3: return 1;
      case 4: return stop === "h" ? 1 : 8;
      case 5: return 7;
      case 6: return 7;
      case 7: return 7;
      case 8: return stop === "h" ? 7 : 4;
      default: return tone;
    }
  }

  var PERSONAL = set(["我|gua", "你|li", "伊|i", "阮|guan", "咱|lan", "恁|lin", "𪜶|in"]);
  // 指示、疑問的限定詞：後面一定還接著別的詞，自己不讀本調
  var DETERMINER = set(["這|tsit", "彼|hit", "佗|to", "逐|tak", "每|mui", "啥|siann", "幾|kui", "各|kok", "別|pat", "規|kui",
    "哪|na", "遮|tsiah", "遐|hiah", "偌|gua"]);
  var LOCALIZER = set(["頂|ting", "內|lai", "外|gua", "邊|pinn", "中|tiong", "前|tsing", "後|au", "底|te", "下|e", "跤|kha", "裡|li", "內底|lai-te", "頂面|ting-bin"]);
  // 虛詞：後面還有詞就變調。辭典同一個寫法常有名詞的義項排在前面（甲、上、才…），所以直接指定
  var FUNCTION = set(["甲|kah", "閣|koh", "才|tsiah", "就|to", "咧|teh", "欲|beh", "共|ka", "佮|kah", "予|hoo", "對|tui", "按|an",
    "較|khah", "上|siong", "若|na", "敢|kam", "攏|long", "嘛|ma", "也|ia", "猶|iau", "無|bo", "毋|m", "袂|be", "會|e", "是|si", "有|u",
    "佇|ti", "傷|siunn", "真|tsin", "足|tsiok", "誠|tsiann", "和|ham", "參|tsham", "莫|mai", "免|bian", "愛|ai", "捌|bat", "著|tioh"]);
  // 直接修飾後面名詞的詞：啥物人、偌濟錢、這款代誌
  var PRENOMINAL = set(["啥物|siann-mih", "偌濟|gua-tse", "這款|tsit-khuan", "彼款|hit-khuan", "啥款|siann-khuan", "這種|tsit-tsiong",
    "彼種|hit-tsiong", "各種|kok-tsiong", "逐項|tak-hang", "別項|pat-hang", "規个|kui-e", "逐个|tak-e"]);
  var NOUNISH = { "名詞": 1, "代詞": 1, "疑問詞": 1, "": 1 };
  var NUMERAL = /^[一二兩三四五六七八九十百千萬億零〇半幾廿卅卌]+$/;

  function set(list) { var o = Object.create(null); list.forEach(function (k) { o[k] = 1; }); return o; }

  /**
   * 詞的類別，決定它的最後一個音節預設讀不讀本調。
   * P 人稱代名詞  D 限定詞  M 數詞  C 量詞  N 名詞類  T 時間詞  L 方位詞  E 的(ê)  V 其他
   */
  function classify(word) {
    var key = (word.hanji || "") + "|" + T.toPlain(word.tailo || "").replace(/^-+/, "");
    var pos = word.pos || "";
    if (word.hanji === "的" && /^(--)?e$/.test(T.toPlain(word.tailo))) return "E";
    if (PERSONAL[key]) return "P";
    if (DETERMINER[key]) return "D";
    if (FUNCTION[key]) return "V";
    if (LOCALIZER[key]) return "L";       // 頂、內、外… 接在名詞後面當方位詞
    if (pos === "數詞" || (pos !== "量詞" && NUMERAL.test(word.hanji || ""))) return "M";
    if (pos === "量詞") return "C";
    if (pos === "時間詞") return "T";
    if (pos === "方位詞") return "L";
    if (NOUNISH[pos]) return "N";
    return "V";
  }

  /**
   * 同一個字可以當名詞也可以當動詞時（簽、鎖、畫…），辭典第一個義項不一定是句子裡的用法。
   * 看前一個詞：前面是主語、副詞，它多半是動詞；前面是量詞、指示詞、「的」，它多半是名詞。
   */
  function refine(tokens) {
    var prev = null;
    tokens.forEach(function (w, i) {
      if (w.kind !== "word") { prev = null; return; }
      var all = w.posAll;
      if (w.hanji === "人" && T.toPlain(w.tailo || "") === "lang") {
        // 單獨的「人」像代名詞（有人來、予人拍、人講…）要變調；彼个人、好人、高雄人的「人」是名詞
        var head = prev && (prev.cls === "C" || prev.cls === "D" || prev.cls === "M" || prev.cls === "E" || prev.cls === "N" || prev.pos === "形容詞" ||
          PRENOMINAL[(prev.hanji || "") + "|" + T.toPlain(prev.tailo || "")]);
        w.cls = head ? "N" : "P";
      } else if (prev && all && all.length > 1 && !w.posFixed) {
        var first = all[0];
        var has = function (p) { return all.indexOf(p) >= 0; };
        var nx = tokens[i + 1] && tokens[i + 1].kind === "word" ? tokens[i + 1] : null;
        var pc = prev.cls;
        if (w.cls !== "C" && has("量詞") && (pc === "D" || pc === "M")) w.cls = "C";            // 這味藥、一擺
        else if (first === "名詞" && has("動詞") && w.cls === "N") {
          if (pc === "N" || pc === "T" || pc === "L" || prev.pos === "副詞" || prev.pos === "助動詞") w.cls = "V";   // 名 簽 蹛遮
          else if (pc === "P" && nx && nx.cls === "N") w.cls = "V";                                // 我 鎖 門；但「你 車 駛…」的車是名詞
        } else if (first === "動詞" && has("名詞") && w.cls === "V") {
          if (pc === "C" || pc === "M" || pc === "D" || pc === "E") w.cls = "N";
        }
      }
      prev = w;
    });
  }

  /** 把一個詞解析成音節，並配上對應的漢字（字數與音節數相同時）。 */
  function prepare(word) {
    var syls = T.parseWord(word.tailo || "");
    var chars = Array.from(word.hanji || "");
    var aligned = chars.length === syls.length;
    syls.forEach(function (s, i) { s.hanji = aligned ? chars[i] : ""; });
    word.syls = syls;
    word.aligned = aligned;
    word.cls = classify(word);
    word.neutralStart = syls.length > 0 && syls[0].neutral;
    return word;
  }

  function nextToken(tokens, i) {
    return i + 1 < tokens.length ? tokens[i + 1] : null;
  }

  /** 這個詞的最後一個（非輕聲）音節預設是否讀本調。 */
  function autoKeep(tokens, i, opts) {
    var w = tokens[i];
    var nx = nextToken(tokens, i);
    if (!nx || nx.kind !== "word") return { keep: true, why: "句尾或標點前" };
    if (nx.neutralStart) return { keep: true, why: "輕聲前" };
    var c = w.cls;
    var n = nx.cls;
    var nkey = (nx.hanji || "") + "|" + T.toPlain(nx.tailo || "");
    if (c === "D") return { keep: false, why: "限定詞" };
    if (n === "E") {
      return c === "P" || c === "M"
        ? { keep: false, why: "代名詞接「的」" }
        : { keep: true, why: "「的」前面" };
    }
    if (c === "P") return { keep: false, why: "人稱代名詞" };
    if (c === "M") return { keep: false, why: "數詞" };
    if (c === "E") return { keep: false, why: "「的」後面還有詞" };
    if (c === "C") {
      return n === "N" || n === "T" || n === "L" || nx.pos === "形容詞"
        ? { keep: false, why: "量詞接名詞" }
        : { keep: true, why: "數量詞組結尾" };
    }
    if (c === "N" || c === "L") {
      if (LOCALIZER[nkey] || n === "L") return { keep: false, why: "後接方位詞" };
      var key = (w.hanji || "") + "|" + T.toPlain(w.tailo || "");
      if (PRENOMINAL[key] && (n === "N" || n === "T")) return { keep: false, why: "修飾後面的名詞" };
      // 華語的複合詞（台灣菜、台語老師）常被拆成兩段對應，接起來讀；台語原文已經用連字號接好了
      if (n === "N" && opts.joinNouns) return { keep: false, why: "名詞修飾名詞" };
      return { keep: true, why: "名詞結尾" };
    }
    if (c === "T") {
      return n === "T" ? { keep: false, why: "時間詞連用" } : { keep: true, why: "時間詞結尾" };
    }
    return { keep: false, why: "後面還有詞" };
  }

  /**
   * tokens: [{kind:"word", hanji, tailo, pos, override?}, {kind:"punct", text}]
   * override: { <音節索引>: "base" | "sandhi" }，使用者手動指定。
   * 回傳同一個陣列，每個詞多了 syls[]：
   *   { base, key, tone, stop, neutral, hanji, sandhi, keep, actual, manual, why }
   */
  function apply(tokens, opts) {
    opts = opts || {};
    var i;
    for (i = 0; i < tokens.length; i++) if (tokens[i].kind === "word") prepare(tokens[i]);
    refine(tokens);
    for (i = 0; i < tokens.length; i++) {
      var w = tokens[i];
      if (w.kind !== "word") continue;
      var syls = w.syls;
      var lastFull = -1;
      syls.forEach(function (s, j) { if (!s.neutral) lastFull = j; });
      var auto = lastFull >= 0 ? autoKeep(tokens, i, opts) : null;
      for (var j = 0; j < syls.length; j++) {
        var s = syls[j];
        var nxt = syls[j + 1];
        s.manual = false;
        if (s.neutral) {
          s.sandhi = 0; s.keep = false; s.actual = 0; s.why = "輕聲";
          continue;
        }
        var beforeA = nxt && !nxt.neutral && nxt.key === "a" && nxt.tone === 2 && (nxt.hanji === "仔" || !nxt.hanji);
        var triple = j + 2 < syls.length && same(s, syls[j + 1]) && same(s, syls[j + 2]) && !(j > 0 && same(s, syls[j - 1]));
        if (triple && (s.tone === 1 || s.tone === 5 || s.tone === 7 || s.tone === 8)) s.sandhi = 9;
        else if (beforeA) s.sandhi = sandhiBeforeA(s.tone, s.stop);
        else s.sandhi = sandhiTone(s.tone, s.stop, opts);

        if (nxt && nxt.neutral) { s.keep = true; s.why = "輕聲前"; }
        else if (j === lastFull) { s.keep = auto.keep; s.why = auto.why; }
        else { s.keep = false; s.why = triple ? "三連音" : beforeA ? "「仔」前變調" : "詞內變調"; }

        var ov = w.override && w.override[j];
        if (ov === "base" || ov === "sandhi") {
          var k = ov === "base";
          s.manual = k !== s.keep;
          s.keep = k;
          if (s.manual) s.why = "手動更正";
        }
        s.actual = s.keep ? s.tone : s.sandhi;
      }
    }
    return tokens;
  }

  function same(a, b) { return a.key === b.key && a.tone === b.tone && !b.neutral; }

  // ---- output ---------------------------------------------------------------

  /**
   * mode: "tailo"  本調，調符（一般書寫）
   *       "num"    本調，數字
   *       "actual" 實際讀音（變調後），數字
   */
  function format(tokens, mode) {
    var out = "";
    var capNext = true;
    tokens.forEach(function (t, i) {
      if (t.kind === "punct") {
        var p = t.text.split("").map(function (ch) { return T.PUNCT_MAP[ch] || ch; }).join("");
        var opening = /^[“‘(]/.test(p);
        out += (opening && out && !/\s$/.test(out) ? " " : "") + p;
        if (/[.?!]/.test(p)) capNext = true;
        return;
      }
      var text = "";
      if (!t.syls || !t.syls.length) {
        // no reading yet (a number, an unknown character): keep it visible in the line
        if (!t.hanji) return;
        out += (out && !/[\s“‘(]$/.test(out) ? " " : "") + t.hanji;
        capNext = false;
        return;
      }
      t.syls.forEach(function (s, j) {
        var body;
        if (mode === "tailo") body = T.compose(s.base, s.tone);
        else if (mode === "num") body = s.base + s.tone;
        else body = s.base + (s.neutral ? 0 : s.actual);
        text += (j === 0 ? s.sep : s.sep || "-") + body;
      });
      if (capNext && mode === "tailo") {
        text = text.replace(/^(-*)(.)/, function (_, d, ch) { return d + ch.toUpperCase(); });
      }
      capNext = false;
      var prev = out.slice(-1);
      var glue = !out || /[\s“‘(]/.test(prev) || t.neutralStart ? "" : " ";
      out += glue + text;
    });
    return T.nfc(out.trim());
  }

  function formatHanji(tokens) {
    return tokens.map(function (t) { return t.kind === "punct" ? t.text : t.hanji || ""; }).join("");
  }

  TG.sandhi = {
    sandhiTone: sandhiTone,
    sandhiBeforeA: sandhiBeforeA,
    classify: classify,
    prepare: prepare,
    apply: apply,
    format: format,
    formatHanji: formatHanji
  };

  if (typeof module !== "undefined" && module.exports) module.exports = TG;
})(typeof window !== "undefined" ? window : globalThis);

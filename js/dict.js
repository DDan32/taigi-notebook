/* 辭典資料：載入 data/*.json，提供查詢。
 * 內容來自教育部《臺灣台語常用詞辭典》（創用CC 姓名標示-禁止改作 3.0 臺灣），未經改寫。
 */
(function (root) {
  "use strict";
  var TG = (root.TG = root.TG || {});
  var T = TG.tailo || (typeof require !== "undefined" ? require("./tailo.js").tailo : null);

  var TYPE_RANK = [0, 1, 4, 2, 3]; // 主詞目, 臺華共同詞, 單字不成詞者, 近反義詞…, 附錄 -> sort order
  var SRC = { GLOSS: 1, SAME: 2, PK: 4, EX: 8, HAND: 16 };
  var MOE = "https://sutian.moe.edu.tw";

  var D = {
    ready: false,
    meta: {},
    pos: [],
    types: [],
    entries: [],
    byId: new Map(),
    byHanji: new Map(),
    huayu: {},
    chars: {},
    daily: [],
    examples: null,
    SRC: SRC
  };

  function Entry(raw) {
    this.id = raw[0];
    this.type = raw[1];
    this.hanji = raw[2];
    this.readings = raw[3] ? raw[3].split("/") : [];
    this.tailo = this.readings[0] || "";
    this.mark = raw[4] || "";
    this.senses = raw[5] || [];
    this.x = raw[6] || {};
    this.freq = this.x.f || 0;
  }

  /** dict: parsed dict.json; the others are optional and can arrive later through set(). */
  function init(dict) {
    D.meta = dict.meta || {};
    D.pos = dict.pos;
    D.types = dict.types;
    D.entries = dict.e.map(function (r) { return new Entry(r); });
    D.byId = new Map();
    D.byHanji = new Map();
    D.entries.forEach(function (e) {
      D.byId.set(e.id, e);
      push(D.byHanji, e.hanji, e);
    });
    D.byHanji.forEach(function (list) { list.sort(byPreference); });
    D.variants = null;
    D.roman = null;
    D.ready = true;
    return D;
  }

  // 這兩張表用「使用者輸入的字」當鍵查詢；沒有原型，constructor、__proto__ 之類的字串就只是查不到。
  var NO_PROTO = { huayu: 1, chars: 1, synonyms: 1, proverbKw: 1 };
  function set(name, value) {
    if (NO_PROTO[name] === 1 && value && typeof value === "object") Object.setPrototypeOf(value, null);
    D[name] = value;
  }

  function push(map, key, v) {
    var a = map.get(key);
    if (a) a.push(v); else map.set(key, [v]);
  }

  function nExamples(e) {
    var n = 0;
    for (var i = 0; i < e.senses.length; i++) n += e.senses[i][3];
    return n;
  }

  function byPreference(a, b) {
    return TYPE_RANK[a.type] - TYPE_RANK[b.type] || b.freq - a.freq || nExamples(b) - nExamples(a) || a.id - b.id;
  }

  function get(id) { return D.byId.get(id) || null; }

  /** 辭典標的詞性：指定義項，否則取第一個有標詞性的義項。 */
  function posOf(e, sense) {
    if (!e) return "";
    if (sense >= 0 && e.senses[sense] && D.pos[e.senses[sense][0]]) return D.pos[e.senses[sense][0]];
    for (var i = 0; i < e.senses.length; i++) if (D.pos[e.senses[i][0]]) return D.pos[e.senses[i][0]];
    return "";
  }

  /** 各義項的詞性（不重複，依義項順序）。 */
  function allPos(e) {
    var out = [];
    if (!e) return out;
    e.senses.forEach(function (s) {
      var p = D.pos[s[0]];
      if (p && out.indexOf(p) < 0) out.push(p);
    });
    return out;
  }

  /** 判斷變調用的詞性：辭典沒標時（臺華共同詞）用建檔時另外加的提示，不對外顯示。 */
  function sandhiPos(e, sense) {
    return posOf(e, sense) || (e && e.x.p) || "";
  }

  function sameReading(a, b) {
    return T.toNumeric(a).toLowerCase().replace(/^-+/, "") === T.toNumeric(b).toLowerCase().replace(/^-+/, "");
  }

  function hasReading(e, tailo) {
    for (var i = 0; i < e.readings.length; i++) if (sameReading(e.readings[i], tailo)) return true;
    var alt = e.x.a || [];
    for (var j = 0; j < alt.length; j++) if (sameReading(alt[j][1], tailo)) return true;
    return false;
  }

  /** 以漢字（加上讀音，若有）找詞目。 */
  function findWord(hanji, tailo) {
    var list = D.byHanji.get(hanji);
    if (!list) return null;
    if (tailo) {
      var hit = list.filter(function (e) { return hasReading(e, tailo); });
      if (hit.length) return hit.slice().sort(function (a, b) {
        return TYPE_RANK[a.type] - TYPE_RANK[b.type] || nExamples(b) - nExamples(a) || a.id - b.id;
      })[0];
      return null;
    }
    return list[0];
  }

  function shortDef(e, sense) {
    var s = e.senses[sense >= 0 ? sense : 0];
    if (!s) return e.type === 1 ? "與華語同義" : "";
    return s[1];
  }

  function examplesOf(e, sense) {
    if (!D.examples) return [];
    var s = e.senses[sense];
    if (!s || !s[3]) return [];
    return D.examples.slice(s[2], s[2] + s[3]);
  }

  function firstExample(e) {
    if (!D.examples) return null;
    for (var i = 0; i < e.senses.length; i++) if (e.senses[i][3]) return D.examples[e.senses[i][2]];
    return null;
  }

  function url(e) { return MOE + "/zh-hant/su/" + e.id + "/"; }

  // ---- search ---------------------------------------------------------------

  var HAN_RE = /[〇㐀-鿿豈-﫿]|[\ud840-\ud88f][\udc00-\udfff]/;

  function buildVariants() {
    D.variants = new Map();
    D.entries.forEach(function (e) {
      (e.x.v || []).forEach(function (v) { push(D.variants, v, e); });
    });
  }

  function buildRoman() {
    // first syllable (toneless) -> [[entry, keys[], tones[], kind]]
    D.roman = new Map();
    D.entries.forEach(function (e) {
      var all = e.readings.map(function (r) { return [r, ""]; })
        .concat((e.x.a || []).map(function (a) { return [a[1], a[0]]; }));
      all.forEach(function (r) {
        var syls = T.syllables(r[0]);
        if (!syls.length || syls.length > 8) return;
        push(D.roman, syls[0].key, [e, syls.map(function (s) { return s.key; }), syls.map(function (s) { return s.tone; }), r[0]]);
      });
    });
  }

  /** 輸入的每個音節：有沒有寫出聲調（調符或數字）。 */
  function parseQuerySyllables(q) {
    var parts = T.nfc(q).toLowerCase().split(/[\s\-]+/).filter(Boolean);
    return parts.map(function (p) {
      var explicit = /[1-9]$/.test(p) || /[̀-ͯ]/.test(p.normalize("NFD"));
      var s = T.parseSyllable(p);
      return { key: s.key, tone: explicit ? s.tone : 0 };
    });
  }

  function searchRoman(q, limit) {
    if (!D.roman) buildRoman();
    var qs = parseQuerySyllables(q);
    if (!qs.length) return [];
    var out = [];
    var last = qs.length - 1;
    D.roman.forEach(function (rows, first) {
      var firstOk = qs.length === 1 && !qs[0].tone ? first.indexOf(qs[0].key) === 0 : first === qs[0].key;
      if (!firstOk) return;
      rows.forEach(function (row) {
        var keys = row[1], tones = row[2];
        if (keys.length < qs.length) return;
        var exactTone = true;
        for (var i = 0; i < qs.length; i++) {
          var k = qs[i].key;
          if (i === last && !qs[i].tone ? keys[i].indexOf(k) !== 0 : keys[i] !== k) return;
          if (qs[i].tone && qs[i].tone !== tones[i]) return;
          if (keys[i] !== k) exactTone = false;
        }
        var whole = keys.length === qs.length && exactTone;
        out.push({ entry: row[0], reading: row[3], rank: (whole ? 0 : 10) + (keys.length - qs.length) + TYPE_RANK[row[0].type] * 0.5 });
      });
    });
    out.sort(function (a, b) { return a.rank - b.rank || b.entry.freq - a.entry.freq || a.entry.id - b.entry.id; });
    var seen = new Set();
    var res = [];
    for (var i = 0; i < out.length && res.length < limit; i++) {
      if (seen.has(out[i].entry.id)) continue;
      seen.add(out[i].entry.id);
      res.push({ entry: out[i].entry, why: out[i].rank < 10 ? "讀音" : "讀音開頭", reading: out[i].reading });
    }
    return res;
  }

  function searchHan(q, limit) {
    if (!D.variants) buildVariants();
    var res = [];
    var seen = new Set();
    function add(e, why, extra) {
      if (!e || seen.has(e.id) || res.length >= limit) return;
      seen.add(e.id);
      var r = { entry: e, why: why };
      if (extra) for (var k in extra) r[k] = extra[k];
      res.push(r);
    }
    (D.byHanji.get(q) || []).forEach(function (e) { add(e, "詞目"); });
    (D.variants.get(q) || []).forEach(function (e) { add(e, "異用字"); });
    huayuCandidates(q).forEach(function (c) {
      if (c.entry) add(c.entry, "華語「" + q + "」", { sense: c.sense, tailo: c.tailo });
    });
    if (res.length < limit) {
      var starts = [], contains = [];
      D.entries.forEach(function (e) {
        if (seen.has(e.id) || e.type === 4 && e.hanji.length > 8) return;
        var i = e.hanji.indexOf(q);
        if (i === 0) starts.push(e); else if (i > 0) contains.push(e);
      });
      var order = function (a, b) { return a.hanji.length - b.hanji.length || byPreference(a, b); };
      starts.sort(order).forEach(function (e) { add(e, "開頭"); });
      contains.sort(order).forEach(function (e) { add(e, "包含"); });
    }
    if (res.length < limit) {
      var hits = [];
      D.entries.forEach(function (e) {
        if (seen.has(e.id)) return;
        for (var i = 0; i < e.senses.length; i++) {
          if (e.senses[i][1].indexOf(q) >= 0) { hits.push([e, i]); return; }
        }
      });
      hits.sort(function (a, b) { return a[0].senses[a[1]][1].length - b[0].senses[b[1]][1].length || byPreference(a[0], b[0]); });
      hits.forEach(function (h) { add(h[0], "釋義", { sense: h[1] }); });
    }
    return res;
  }

  /** 查詞：漢字（台語或華語）或台羅（調符、數字調、不標調都可以）。 */
  function search(q, limit) {
    q = (q || "").trim().slice(0, 100);
    if (!q || !D.ready) return [];
    limit = limit || 60;
    return HAN_RE.test(q) ? searchHan(q, limit) : searchRoman(q, limit);
  }

  /** 例句：華語翻譯或台語漢字含有 q。 */
  function searchExamples(q, limit) {
    if (!D.examples || !q) return [];
    q = String(q).slice(0, 100);
    var out = [];
    for (var i = 0; i < D.examples.length && out.length < (limit || 20); i++) {
      var ex = D.examples[i];
      if (ex[2].indexOf(q) >= 0 || ex[0].indexOf(q) >= 0) out.push(ex);
    }
    out.sort(function (a, b) { return a[0].length - b[0].length; });
    return out;
  }

  // ---- 華語 -> 台語 candidates ------------------------------------------------

  /** huayu.json 的一列 -> 候選詞物件。 */
  function candidateFromRow(row) {
    var ref = row[0];
    var c = { sense: row[1], src: row[2], score: row[3], note: row[5] || "" };
    if (typeof ref === "number") {
      var e = get(ref);
      if (!e) return null;
      c.entry = e;
      c.hanji = e.hanji;
      c.tailo = row[4] || e.tailo;
    } else {
      var i = ref.indexOf("|");
      c.entry = null;
      c.hanji = ref.slice(0, i);
      c.tailo = ref.slice(i + 1);
    }
    return c;
  }

  function huayuCandidates(w) {
    var rows = D.huayu[w];
    if (!rows) return [];
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var c = candidateFromRow(rows[i]);
      if (c) out.push(c);
    }
    return out;
  }

  function srcLabel(bits) {
    var out = [];
    if (bits & SRC.HAND) out.push("常用");
    if (bits & SRC.GLOSS) out.push("釋義");
    if (bits & SRC.SAME) out.push("同形");
    if (bits & SRC.PK) out.push("詞彙比較");
    if (bits & SRC.EX) out.push("例句");
    return out;
  }

  D.init = init;
  D.set = set;
  D.get = get;
  D.posOf = posOf;
  D.sandhiPos = sandhiPos;
  D.allPos = allPos;
  D.findWord = findWord;
  D.hasReading = hasReading;
  D.sameReading = sameReading;
  D.shortDef = shortDef;
  D.examplesOf = examplesOf;
  D.firstExample = firstExample;
  D.url = url;
  D.search = search;
  D.searchExamples = searchExamples;
  D.huayuCandidates = huayuCandidates;
  D.srcLabel = srcLabel;
  D.nExamples = nExamples;
  D.HAN_RE = HAN_RE;

  TG.dict = D;
  if (typeof module !== "undefined" && module.exports) module.exports = TG;
})(typeof window !== "undefined" ? window : globalThis);

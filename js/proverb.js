/* 諺語搜尋：用「意思」、相近的意思、台語漢字或台羅找教育部辭典附錄裡的諺語（468 句）。
 *
 * 做法（資料很小，全部在瀏覽器裡算）：
 *   1. 每句諺語的檢索文字 = 諺語本身 + 辭典的釋義。
 *   2. 把輸入拆成 2–4 字的片段；片段出現在越少句的釋義裡，分數越高（IDF），片段越長加權越多。
 *   3. 輸入裡認得的華語詞，再用同義詞表（data/synonyms.json）擴充成相近的說法，權重較低：
 *      輸入「反悔」，也找釋義寫「變卦」「出爾反爾」的句子。
 *   4. 輸入如果直接是諺語的一段（台語漢字）或台羅（調符、數字調、不標調都可以），排在最前面。
 *   這是關鍵字加同義詞，不是真的理解語意：換個說法有時找不到，找到的也請看釋義確認。
 */
(function (root) {
  "use strict";
  var TG = (root.TG = root.TG || {});
  var T = TG.tailo || (typeof require !== "undefined" ? require("./tailo.js").tailo : null);
  var D = TG.dict || (typeof require !== "undefined" ? require("./dict.js").dict : null);

  var HAN = "\\u3007\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff";
  var HAN_RUN = new RegExp("[" + HAN + "\\ud840-\\ud88f\\udc00-\\udfff]+", "g");
  var ENDS = /[。！？]$/;
  var EXPANSION_WEIGHT = 0.55;
  var KEYWORD_BONUS = 1.4;
  var MAX_QUERY = 100;
  var MAX_RESULTS = 30;

  var P = { ready: false, docs: [], byId: Object.create(null), variants: Object.create(null), related: Object.create(null) };
  var dfCache = Object.create(null);

  function plainTailo(t) {
    return T.toPlain(t).replace(/[-\s]+/g, " ").replace(/[^a-z0-9 ]/g, "").trim();
  }

  function strip(s) { return (s.match(HAN_RUN) || []).join(""); }

  /** Build the index from the dictionary entries. Call again after the dictionary is (re)loaded. */
  function init() {
    P.docs = []; P.byId = Object.create(null); P.variants = Object.create(null); P.related = Object.create(null);
    dfCache = Object.create(null);
    D.entries.forEach(function (e) {
      if (!ENDS.test(e.hanji)) return;
      if (e.type === 3) { P.variants[e.id] = e; return; }               // 只有說法，沒有釋義
      if (e.type !== 4 || !e.senses.length) return;
      var meaning = e.senses.map(function (s) { return s[1]; }).join("　");
      var kw = ((D.proverbKw && D.proverbKw[e.id]) || "").split(/\s+/).filter(Boolean);
      var doc = {
        id: e.id, entry: e, hanji: e.hanji, tailo: e.tailo, meaning: meaning,
        kw: kw, kwSet: Object.create(null),
        // \u0001 separates the parts (and each keyword), so a 2–4 character piece never spans two of them
        text: strip(e.hanji) + "\u0001" + strip(meaning) + "\u0001" + kw.join("\u0001"),
        textPlain: strip(e.hanji) + "\u0001" + strip(meaning),
        plain: plainTailo(e.tailo), plainVariants: [],
        syn: [], ant: []
      };
      e.senses.forEach(function (s) {
        (s[4] || []).forEach(function (id) { if (doc.syn.indexOf(id) < 0) doc.syn.push(id); });
        (s[5] || []).forEach(function (id) { if (doc.ant.indexOf(id) < 0) doc.ant.push(id); });
      });
      kw.forEach(function (k) { doc.kwSet[k] = 1; });
      P.docs.push(doc);
      P.byId[e.id] = doc;
    });
    // 別的說法（type 3）和它們的諺語互相對應：輸入變體的字也找得到原句
    P.docs.forEach(function (d) {
      d.syn.forEach(function (id) {
        var v = P.variants[id];
        if (!v) return;
        d.plainVariants.push(plainTailo(v.tailo));
        (P.related[id] = P.related[id] || []).push(d.id);
      });
    });
    P.ready = P.docs.length > 0;
    return P;
  }

  function df(term) {
    var c = dfCache[term];
    if (c === undefined) {
      c = 0;
      for (var i = 0; i < P.docs.length; i++) if (hasTerm(P.docs[i].text, term)) c++;
      dfCache[term] = c;
    }
    return c;
  }

  function idf(term) {
    var n = df(term);
    return n ? Math.log((P.docs.length + 1) / (n + 0.5)) : 0;
  }

  /** substrings of length 2..4 of each 漢字 run of s; a single character stands for itself. */
  function pieces(s) {
    var out = [];
    (s.match(HAN_RUN) || []).forEach(function (run) {
      var chars = Array.from(run);
      if (chars.length === 1) { out.push(run); return; }
      for (var n = 2; n <= 4; n++) for (var i = 0; i + n <= chars.length; i++) out.push(chars.slice(i, i + n).join(""));
    });
    return out;
  }

  /** The words of the query that the synonym table knows, longest first, without overlap. */
  function knownWords(q) {
    var syn = D.synonyms || {};
    var found = [];
    (q.match(HAN_RUN) || []).forEach(function (run) {
      var chars = Array.from(run), taken = [];
      for (var n = Math.min(4, chars.length); n >= 1; n--) {
        for (var i = 0; i + n <= chars.length; i++) {
          var w = chars.slice(i, i + n).join("");
          if (syn[w] && !taken.slice(i, i + n).some(Boolean) && (n > 1 || chars.length === 1)) {
            found.push(w);
            for (var k = i; k < i + n; k++) taken[k] = true;
          }
        }
      }
    });
    return found;
  }

  var UNI_WEIGHT = 0.3, SKIP_WEIGHT = 0.45;
  var SKIP = /^(.)\u0002(.)$/;

  /** a skip-bigram "沒\u0002用" is stored as a term and matched as: 沒 then 用 within 3 characters. */
  function hasTerm(text, t) {
    var m = SKIP.exec(t);
    if (!m) return text.indexOf(t) >= 0;
    var at = text.indexOf(m[1]);
    while (at >= 0) {
      var end = text.indexOf(m[2], at + 1);
      if (end >= 0 && end - at <= 3) return true;
      at = text.indexOf(m[1], at + 1);
    }
    return false;
  }

  /** term -> weight for a query string. Returns { terms: {term: weight}, words: [recognised words] } */
  function termsOf(q, expand, loose) {
    var terms = Object.create(null);
    pieces(q).forEach(function (p) {
      var len = Array.from(p).length;
      terms[p] = Math.max(terms[p] || 0, len === 1 ? 1 : len / 2);
    });
    if (loose !== false) {
      (q.match(HAN_RUN) || []).forEach(function (run) {
        var chars = Array.from(run);
        if (chars.length < 2) return;
        chars.forEach(function (c) { if (!(c in terms)) terms[c] = UNI_WEIGHT; });
        for (var i = 0; i + 2 < chars.length; i++) {
          var k = chars[i] + "\u0002" + chars[i + 2];
          if (!(k in terms)) terms[k] = SKIP_WEIGHT;
        }
      });
    }
    var words = knownWords(q);
    var syn = D.synonyms || {};
    if (expand === false) return { terms: terms, words: words };
    words.forEach(function (w) {
      (syn[w] || []).forEach(function (n) {
        var len = Array.from(n).length;
        var weight = EXPANSION_WEIGHT * (len === 1 ? 0.7 : len / 2);
        if (!(n in terms) || terms[n] < weight) terms[n] = weight;
      });
    });
    return { terms: terms, words: words };
  }

  function scoreDoc(doc, terms, noKeywords) {
    var s = 0, hit = [];
    var text = noKeywords ? doc.textPlain : doc.text;
    for (var t in terms) {
      if (hasTerm(text, t)) {
        var v = terms[t] * idf(t);
        if (!noKeywords && doc.kwSet[t]) v *= KEYWORD_BONUS;               // the whole term is one of the proverb's keywords
        if (v > 0) { s += v; hit.push(t); }
      }
    }
    // a long explanation matches more things by chance
    var len = doc.meaning.length;
    return { score: s / (1 + 0.004 * len), hits: hit };
  }

  /**
   * search(q) -> [{ doc, score, why, hits }]
   *   why: "text"（諺語本身有這段）, "romanization"（台羅），"meaning"（意思）
   */
  function search(q, limit, opts) {
    q = (q || "").normalize("NFC").trim().slice(0, MAX_QUERY);
    if (!q || !P.ready) return [];
    limit = limit || MAX_RESULTS;
    var out = [];
    var seen = Object.create(null);
    function add(doc, score, why, hits) {
      if (seen[doc.id]) { if (score > seen[doc.id].score) { seen[doc.id].score = score; seen[doc.id].why = why; } return; }
      var r = { doc: doc, score: score, why: why, hits: hits || [] };
      seen[doc.id] = r; out.push(r);
    }

    var hanQ = strip(q);
    HAN_RUN.lastIndex = 0;
    var roman = !hanQ && /[A-Za-zÀ-ɏ]/.test(q);
    if (roman) {
      var pq = plainTailo(q);
      if (pq) {
        P.docs.forEach(function (d) {
          var at = (" " + d.plain + " ").indexOf(" " + pq);
          var inVariant = d.plainVariants.some(function (v) { return (" " + v + " ").indexOf(" " + pq) >= 0; });
          if (at >= 0) add(d, 1000 - at * 0.01, "romanization");
          else if (d.plain.indexOf(pq) >= 0) add(d, 900, "romanization");
          else if (inVariant) add(d, 800, "romanization");
        });
      }
    } else if (hanQ.length >= 2) {
      // the query is part of a proverb as written
      P.docs.forEach(function (d) {
        var h = strip(d.hanji);
        var at = h.indexOf(hanQ);
        if (at >= 0) add(d, 1000 - at * 0.01 + hanQ.length, "text", [hanQ]);
      });
      Object.keys(P.variants).forEach(function (id) {
        if (strip(P.variants[id].hanji).indexOf(hanQ) >= 0) (P.related[id] || []).forEach(function (pid) { add(P.byId[pid], 800, "text", [hanQ]); });
      });
    }

    var parsed = termsOf(q, !(opts && opts.expand === false), !(opts && opts.loose === false));
    var scored = [];
    P.docs.forEach(function (d) {
      var r = scoreDoc(d, parsed.terms, opts && opts.keywords === false);
      if (r.score > 0) scored.push([d, r]);
    });
    scored.sort(function (a, b) { return b[1].score - a[1].score || a[0].id - b[0].id; });
    var top = scored.length ? scored[0][1].score : 0;
    scored.forEach(function (x) {
      if (x[1].score >= 0.3 * top) add(x[0], x[1].score, "meaning", x[1].hits);
    });

    out.sort(function (a, b) { return b.score - a.score || a.doc.id - b.doc.id; });
    return out.slice(0, limit);
  }

  /** proverbs whose explanation is closest to this one's (not itself, not its listed variants). */
  function similar(id, limit) {
    var doc = P.byId[id];
    if (!doc) return [];
    var skip = Object.create(null);
    skip[id] = 1;
    var terms = Object.create(null);
    pieces(strip(doc.meaning)).forEach(function (p) {
      var len = Array.from(p).length;
      if (len >= 3) terms[p] = len / 2;                 // 3–4 character pieces only: shared phrases, not shared common words
    });
    var scored = [];
    P.docs.forEach(function (d) {
      if (skip[d.id]) return;
      var r = scoreDoc(d, terms);
      if (r.score > 0) scored.push([d, r.score]);
    });
    scored.sort(function (a, b) { return b[1] - a[1] || a[0].id - b[0].id; });
    var top = scored.length ? scored[0][1] : 0;
    return scored.filter(function (x) { return x[1] >= 0.5 * top && x[1] > 0.5; }).slice(0, limit || 4).map(function (x) { return x[0]; });
  }

  /** Split text into [{text, hit}] so matched terms can be highlighted without building HTML. */
  function highlight(text, terms) {
    var list = (terms || []).filter(function (t) { return t && text.indexOf(t) >= 0; });
    if (!list.length) return [{ text: text, hit: false }];
    var mark = new Array(text.length + 1).join("0").split("");
    list.forEach(function (t) {
      var at = text.indexOf(t);
      while (at >= 0) { for (var i = at; i < at + t.length; i++) mark[i] = "1"; at = text.indexOf(t, at + 1); }
    });
    var out = [], cur = "", on = false;
    for (var i = 0; i < text.length; i++) {
      var m = mark[i] === "1";
      if (m !== on && cur) { out.push({ text: cur, hit: on }); cur = ""; }
      on = m; cur += text[i];
    }
    if (cur) out.push({ text: cur, hit: on });
    return out;
  }

  P.init = init;
  P.search = search;
  P.similar = similar;
  P.highlight = highlight;
  P.termsOf = termsOf;
  P.strip = strip;
  P.plainTailo = plainTailo;
  P.isProverb = function (e) { return !!e && ENDS.test(e.hanji) && (e.type === 4 || e.type === 3); };

  TG.proverb = P;
  if (typeof module !== "undefined" && module.exports) module.exports = TG;
})(typeof window !== "undefined" ? window : globalThis);

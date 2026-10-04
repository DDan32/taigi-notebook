/* 「諺語」分頁：用意思（或相近的意思）、諺語裡的字、台羅，找教育部辭典附錄的諺語。 */
(function (root) {
  "use strict";
  var TG = root.TG;
  var U = TG.ui, h = U.h, P = TG.proverb, D = TG.dict;

  var THEMES = ["夫妻", "孩子", "孝順", "金錢", "賺錢", "做人處事", "說話", "努力", "懶惰", "運氣", "報應",
    "朋友", "吃飯", "做生意", "天氣", "小心", "吹牛", "貪心", "忍耐", "知恩圖報"];
  var TRY = ["努力才會成功", "夫妻吵架", "做事半途而廢", "看不起窮人", "多管閒事", "忍耐是有限度的"];
  var els = {};
  var timer = 0;

  function marks(text, hits) {
    // only whole words that read well when highlighted: not the loose single-character and skip-gram pieces
    var terms = (hits || []).filter(function (t) { return t.length >= 2 && t.indexOf("\u0002") < 0; });
    return P.highlight(text, terms).map(function (p) { return p.hit ? h("mark", { text: p.text }) : p.text; });
  }

  function why(r) {
    var d = r.doc;
    if (r.why === "text") return "諺語裡有這段字";
    if (r.why === "romanization") return "台羅符合";
    var kw = (r.hits || []).filter(function (t) { return d.kwSet[t] && d.meaning.indexOf(t) < 0; }).slice(0, 3);
    return kw.length ? "相近的說法：" + kw.join("、") : "";
  }

  function row(r) {
    var d = r.doc;
    var reason = why(r);
    return h("li.proverb", null,
      h("button.proverb-main", { type: "button", onclick: function () { TG.views.dict.openEntry(d.entry); } },
        h("span.hj.proverb-hj", { lang: "nan-Hant", text: d.hanji }),
        h("span.tl.proverb-tl", { lang: "nan-Latn", text: d.tailo }),
        h("span.proverb-meaning", null, marks(d.meaning, r.hits)),
        reason ? h("span.proverb-why", { text: reason }) : null),
      U.playButton(TG.audio.word(d.id), "播放「" + d.hanji + "」"));
  }

  function renderIntro() {
    var box = els.results;
    U.clear(box);
    if (!P.ready) { U.add(box, h("p.muted", { text: "辭典載入中…" })); return; }
    U.add(box, h("div.intro", null,
      h("p", { text: "辭典附錄收了 " + P.docs.length + " 句諺語。用你自己的話描述意思就找得到，不必知道原句：" }),
      h("div.row.wrap", null, TRY.map(function (t) { return chip(t); })),
      h("h3.section", { text: "依主題找" }),
      h("div.row.wrap", null, THEMES.map(function (t) { return chip(t); })),
      h("div.row.wrap", null,
        h("button.btn.ghost", { type: "button", onclick: function () {
          var d = P.docs[Math.floor(Math.random() * P.docs.length)];
          TG.views.dict.openEntry(d.entry);
        } }, U.icon("swap"), "隨機來一句")),
      h("p.hint", { text: "也可以直接打台語漢字（肉欲予人食）或台羅（jiu、tsia̍h-pn̄g）。" })));
  }

  function chip(text) {
    return h("button.chip", { type: "button", onclick: function () { els.q.value = text; search(text); } }, text);
  }

  function search(q) {
    var box = els.results;
    q = (q || "").trim();
    if (!q) { renderIntro(); return; }
    if (!P.ready) { U.clear(box); U.add(box, h("p.muted", { text: "辭典載入中…" })); return; }
    var rows = P.search(q, 30);
    U.clear(box);
    var degraded = TG.app.missing && (TG.app.missing.indexOf("data/proverb_kw.json") >= 0 || TG.app.missing.indexOf("data/synonyms.json") >= 0);
    if (degraded) U.add(box, h("p.note.warn", { role: "alert", text: "有一部分資料沒有載入成功，用意思找的準確度會變差。請重新整理頁面。" }));
    if (!rows.length) {
      U.add(box, h("div.empty", null,
        h("p", { text: "沒有找到跟「" + q + "」相關的諺語。" }),
        h("p.muted", { text: "換個說法試試：用比較白話、短一點的詞，例如「欺負」「反悔」「勢利」。" })));
      return;
    }
    U.add(box, [
      h("p.count", { text: "找到 " + rows.length + " 句，最相關的在最上面" }),
      h("ul.proverb-list", null, rows.map(row)),
      h("p.hint", { text: "這是用關鍵字和相近說法找的，不是真的理解語意；沒找到想要的，換個說法再試。找到的請看釋義確認。" })
    ]);
  }

  function mount(el) {
    els.q = h("input", {
      id: "pv-q", type: "search", autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false", maxlength: "100",
      placeholder: "輸入意思，例如：夫妻吵架", "aria-label": "用意思找諺語"
    });
    els.q.addEventListener("input", function () {
      root.clearTimeout(timer);
      timer = root.setTimeout(function () { search(els.q.value); }, 200);
    });
    els.results = h("div.results", { id: "pv-results", "aria-live": "polite" });
    U.add(el, [
      h("div.searchbar", null, U.icon("search"), els.q,
        h("button.icon-btn", { type: "button", "aria-label": "清除", onclick: function () { els.q.value = ""; search(""); els.q.focus(); } }, U.icon("close"))),
      els.results
    ]);
    renderIntro();
  }

  function onData(what) {
    if (what === "proverb" && els.q) search(els.q.value);
  }

  TG.views = TG.views || {};
  TG.views.proverb = { mount: mount, onData: onData, row: row, search: function (q) { els.q.value = q; search(q); } };
})(window);

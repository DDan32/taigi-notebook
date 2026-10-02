/* 「辭典」分頁：用漢字、華語或台羅（調符／數字調／不標調）查教育部辭典。 */
(function (root) {
  "use strict";
  var TG = root.TG;
  var U = TG.ui, h = U.h, T = TG.tailo, S = TG.sandhi, D = TG.dict, store = TG.store;

  var els = {};
  var timer = 0;
  var TYPE_NOTE = {
    1: "臺華共同詞：寫法和意思與華語相同，辭典只收讀音。",
    2: "單字不成詞者：這個讀音只出現在詞裡，不單獨使用。",
    3: "辭典在近義、反義詞裡提到這個詞，沒有另外立詞條。"
  };
  var MARK = { b: "白", l: "文", s: "俗", t: "替" };
  var MARK_TITLE = { b: "白話音", l: "文言音", s: "俗讀音", t: "替代字" };
  var ALT = { iu: "又唸作", ha: "合音唸作", sio: "俗唸作" };

  function marks(e) {
    return e.mark.split("").map(function (m) { return h("span.mark", { title: MARK_TITLE[m], text: MARK[m] }); });
  }

  // ---- result list ----------------------------------------------------------------

  function resultRow(r) {
    var e = r.entry;
    var def = D.shortDef(e, r.sense == null ? -1 : r.sense);
    return h("li", null, h("button.entry-row", { type: "button", onclick: function () { openEntry(e); } },
      h("span.entry-head", null,
        h("span.hj", { lang: "nan-Hant", text: e.hanji }), marks(e),
        h("span.tl", { lang: "nan-Latn", text: r.reading || r.tailo || e.tailo })),
      h("span.entry-def", null, r.why && r.why !== "詞目" ? h("span.tag", { text: r.why }) : null, def)));
  }

  function search(q) {
    var box = els.results;
    U.clear(box);
    q = (q || "").trim();
    if (!D.ready) { U.add(box, h("p.muted", { text: "辭典載入中…" })); return; }
    if (!q) { renderIntro(); return; }
    var rows = D.search(q, 60);
    var isHan = D.HAN_RE.test(q);
    if (!rows.length) {
      U.add(box, h("div.empty", null,
        h("p", { text: "查不到「" + q + "」。" }),
        h("p.muted", { text: isHan ? "試試別的寫法，或用華語的說法查。" : "台羅可以不標調（tsiah）、標數字（tsiah8）或用調符（tsia̍h）；多音節用空白或連字號分開。" })));
      return;
    }
    U.add(box, h("p.count", { text: (rows.length >= 60 ? "前 60 筆" : rows.length + " 筆") + (isHan ? "" : "｜依讀音 " + T.toDiacritic(q)) }));
    U.add(box, h("ul.entry-list", null, rows.map(resultRow)));
    if (isHan && D.examples) {
      var ex = D.searchExamples(q, 5);
      if (ex.length) {
        U.add(box, [h("h3.section", { text: "含有「" + q + "」的例句" }),
          h("ul.ex-list", null, ex.map(function (x) { return TG.views.convert.exampleItem(x); }))]);
      }
    }
  }

  function renderIntro() {
    var box = els.results;
    var tries = ["漂亮", "食飯", "gau5", "tsiah8-png7", "siann-mih", "歹勢"];
    U.add(box, h("div.intro", null,
      h("p", { text: "可以打台語漢字、華語，或台羅。台羅不必打調符：" }),
      h("div.row.wrap", null, tries.map(function (t) {
        return h("button.chip", { type: "button", onclick: function () { els.q.value = t; search(t); } }, t);
      })),
      h("p.muted", { text: "gau5 這樣的數字調、gâu 這樣的調符、或完全不標調的 gau 都查得到。" })));
  }

  // ---- entry sheet -------------------------------------------------------------------

  function exampleBlock(ex) {
    return TG.views.convert.exampleItem(ex);
  }

  function relatedChips(ids) {
    return h("span.row.wrap", null, ids.map(function (id) {
      var e = D.get(id);
      if (!e) return null;
      return h("button.chip", { type: "button", onclick: function () { openEntry(e); } },
        h("span.hj", { lang: "nan-Hant", text: e.hanji }), e.tailo ? h("span.tl", { lang: "nan-Latn", text: " " + e.tailo }) : null);
    }));
  }

  function entryBody(e) {
    var o = { t5: store.state.settings.t5 };
    var a = e.tailo ? U.analysePair(e.hanji, e.tailo, o) : null;
    var inBook = store.findWord(e.hanji, e.tailo);
    var num = e.tailo ? T.toNumeric(e.tailo) : "";
    var alts = e.x.a || [];
    return h("div.stack.entry", null,
      h("div.entry-top", null,
        h("div", null,
          h("div.entry-hanji", { lang: "nan-Hant" }, e.hanji, marks(e)),
          e.tailo ? h("div.entry-tailo", { lang: "nan-Latn" }, e.tailo, h("span.num", { text: num })) : null,
          e.readings.length > 1 ? h("div.muted", null, "第二優勢腔：", h("span.tl", { lang: "nan-Latn", text: e.readings.slice(1).join("、") })) : null),
        e.tailo ? h("div.col", null, U.copyButton(e.tailo, "台羅", "台羅"), U.copyButton(num, "數字調", "數字調")) : null),
      a && a.tokens.length ? h("div", null, U.renderLine(a.tokens, { segs: a.segs, contour: store.state.settings.contour }),
        h("p.hint", { text: "單獨唸這個詞時的本調與變調。" })) : null,
      TYPE_NOTE[e.type] ? h("p.note", { text: TYPE_NOTE[e.type] }) : null,
      e.senses.length ? h("ol.senses", null, e.senses.map(function (s, i) {
        var exs = D.examplesOf(e, i);
        return h("li", null,
          h("p.def", null, D.pos[s[0]] ? h("span.pos", { text: D.pos[s[0]] }) : null, s[1]),
          exs.length ? h("ul.ex-list", null, exs.map(exampleBlock)) : null,
          s[4] && s[4].length ? h("p.rel", null, h("span.rel-label", { text: "近義" }), relatedChips(s[4])) : null,
          s[5] && s[5].length ? h("p.rel", null, h("span.rel-label", { text: "反義" }), relatedChips(s[5])) : null);
      })) : null,
      !D.examples && e.senses.some(function (s) { return s[3]; }) ? h("p.muted", { text: "例句載入中…" }) : null,
      alts.length ? h("p.rel", null, alts.map(function (x) {
        return h("span.alt", null, h("span.rel-label", { text: ALT[x[0]] || "又音" }), h("span.tl", { lang: "nan-Latn", text: x[1] }));
      })) : null,
      e.x.s ? h("p.rel", null, h("span.rel-label", { text: "近義詞" }), relatedChips(e.x.s)) : null,
      e.x.n ? h("p.rel", null, h("span.rel-label", { text: "反義詞" }), relatedChips(e.x.n)) : null,
      e.x.v ? h("p.rel", null, h("span.rel-label", { text: "異用字" }), h("span.hj", { lang: "nan-Hant", text: e.x.v.join("、") })) : null,
      h("div.row.wrap", null,
        e.tailo ? h("button.btn" + (inBook ? ".ghost" : ""), { type: "button", disabled: !!inBook, onclick: function () {
          store.addWord({ h: e.hanji, t: e.tailo, m: D.shortDef(e, -1), ref: e.id });
          U.toast("已加入生字簿：" + e.hanji);
          U.refreshSheet();
        } }, U.icon(inBook ? "check" : "note"), inBook ? "已在生字簿" : "加入生字簿") : null,
        h("a.btn.ghost", { href: D.url(e), target: "_blank", rel: "noopener" }, U.icon("out"), "教育部辭典（可聽發音）")),
      h("p.source", { text: "詞條內容：教育部《臺灣台語常用詞辭典》，創用CC 姓名標示-禁止改作 3.0 臺灣。變調標示為本站推算。" }));
  }

  function openEntry(e) {
    if (typeof e === "number") e = D.get(e);
    if (!e) return;
    U.openSheet({ title: e.hanji, render: function () { return entryBody(e); } });
  }

  // ---- mount ---------------------------------------------------------------------------

  function mount(el) {
    els.q = h("input", {
      id: "dict-q", type: "search", autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false", maxlength: "100",
      placeholder: "漢字、華語，或 gau5、tsing3", "aria-label": "查辭典"
    });
    els.q.addEventListener("input", function () {
      root.clearTimeout(timer);
      timer = root.setTimeout(function () { search(els.q.value); }, 160);
    });
    els.results = h("div.results", { id: "dict-results", "aria-live": "polite" });
    U.add(el, [
      h("div.searchbar", null, U.icon("search"), els.q,
        h("button.icon-btn", { type: "button", "aria-label": "清除", onclick: function () { els.q.value = ""; search(""); els.q.focus(); } }, U.icon("close"))),
      els.results
    ]);
    search("");
  }

  function onData(what) {
    if (what === "dict" || what === "examples") search(els.q ? els.q.value : "");
  }

  TG.views = TG.views || {};
  TG.views.dict = { mount: mount, onData: onData, openEntry: openEntry, search: function (q) { els.q.value = q; search(q); } };
})(window);

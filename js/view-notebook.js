/* 「生字簿」分頁：上課遇到的詞自己記；辭典裡有的詞可以直接引用。也放收藏的句子。 */
(function (root) {
  "use strict";
  var TG = root.TG;
  var U = TG.ui, h = U.h, T = TG.tailo, S = TG.sandhi, D = TG.dict, C = TG.convert, store = TG.store;

  var els = {};
  var tab = "words";
  var draft = { ref: 0 };
  var timer = 0;

  // ---- add form ---------------------------------------------------------------------

  function suggestions() {
    var box = els.suggest;
    U.clear(box);
    if (!D.ready) return;
    var hanji = els.h.value.trim();
    var tailo = els.t.value.trim();
    if (!hanji && !tailo) return;
    var rows = hanji ? D.search(hanji, 8) : D.search(tailo, 8);
    if (hanji && tailo) {
      var match = rows.filter(function (r) { return D.hasReading(r.entry, T.toDiacritic(tailo)); });
      if (match.length) rows = match;
    }
    rows = rows.filter(function (r) { return r.entry.tailo; }).slice(0, 6);
    if (!rows.length) {
      U.add(box, h("p.hint", { text: "辭典裡沒有找到，照你聽到的記下來就可以，之後隨時能改。" }));
      return;
    }
    var exact = hanji && rows[0].entry.hanji === hanji;
    U.add(box, h("p.hint", { text: exact ? "辭典有這個詞，點一下直接引用：" : "辭典裡相近的詞，點一下引用：" }));
    U.add(box, h("div.row.wrap", null, rows.map(function (r) {
      var e = r.entry;
      var reading = r.reading || r.tailo || e.tailo;
      return h("button.chip.cite", { type: "button", onclick: function () { cite(e, reading, r.sense); } },
        h("span.hj", { lang: "nan-Hant", text: e.hanji }), " ",
        h("span.tl", { lang: "nan-Latn", text: reading }),
        h("span.muted", { text: "｜" + clip(D.shortDef(e, r.sense == null ? -1 : r.sense), 12) }));
    })));
  }

  function clip(s, n) { return s.length > n ? s.slice(0, n) + "…" : s; }

  function cite(e, reading, sense) {
    els.h.value = e.hanji;
    els.t.value = reading || e.tailo;
    if (!els.m.value.trim()) els.m.value = D.shortDef(e, sense == null ? -1 : sense);
    draft.ref = e.id;
    preview();
    U.clear(els.suggest);
    U.add(els.suggest, h("p.hint.ok", null, "已引用辭典的「" + e.hanji + "」。",
      h("button.link", { type: "button", onclick: function () { TG.views.dict.openEntry(e); } }, "看詞條")));
  }

  function preview() {
    var v = els.t.value.trim();
    els.preview.textContent = v && /[1-9]/.test(v) ? "→ " + T.toDiacritic(v) : "";
  }

  function addWord() {
    var hanji = els.h.value.trim();
    var tailo = T.toDiacritic(els.t.value.trim());
    if (!hanji && !tailo) { U.toast("至少填漢字或台羅"); return; }
    if (hanji && store.findWord(hanji, tailo)) { U.toast("生字簿裡已經有「" + hanji + "」"); return; }
    var e = draft.ref ? D.get(draft.ref) : null;
    if (e && (e.hanji !== hanji || !D.hasReading(e, tailo))) e = null;   // edited after citing
    if (!e && hanji && tailo && D.ready) e = D.findWord(hanji, tailo);
    store.addWord({ h: hanji, t: tailo, m: els.m.value.trim(), n: els.n.value.trim(), ref: e ? e.id : 0 });
    els.h.value = els.t.value = els.m.value = els.n.value = "";
    draft.ref = 0;
    preview();
    U.clear(els.suggest);
    U.toast("已加入生字簿");
    els.h.focus();
  }

  // ---- lists -----------------------------------------------------------------------------

  function levelDots(w) {
    var lv = w.lv || 0;
    var dots = [];
    for (var i = 1; i <= 7; i++) dots.push(h("i" + (i <= lv ? ".on" : "")));
    return h("span.level", { title: "熟悉度 " + lv + " / 7", "aria-label": "熟悉度 " + lv + " / 7" }, dots);
  }

  function wordRow(w) {
    return h("li", null, h("button.entry-row", { type: "button", onclick: function () { editWord(w.id); } },
      h("span.entry-head", null,
        h("span.hj", { lang: "nan-Hant", text: w.h || "（未填漢字）" }),
        h("span.tl", { lang: "nan-Latn", text: w.t }),
        h("span.tag" + (w.ref ? ".ok" : ""), { text: w.ref ? "辭典" : "自己記的" })),
      h("span.entry-def", null, w.m || h("span.muted", { text: "（還沒寫意思）" }), levelDots(w))));
  }

  function renderWords() {
    var q = (els.filter.value || "").trim().toLowerCase();
    var all = store.listWords();
    var list = !q ? all : all.filter(function (w) {
      return (w.h + " " + w.m + " " + w.n).toLowerCase().indexOf(q) >= 0 ||
        T.toPlain(w.t).replace(/-/g, " ").indexOf(T.toPlain(q).replace(/-/g, " ")) >= 0;
    });
    var box = els.list;
    U.clear(box);
    if (!all.length) {
      U.add(box, h("div.empty", null,
        h("p", { text: "生字簿還是空的。" }),
        h("p.muted", { text: "在上面填一個上課聽到的詞；發音和意思不確定也沒關係，之後可以改。在「轉換」和「辭典」裡也能把詞加進來。" })));
      return;
    }
    if (!list.length) { U.add(box, h("p.muted", { text: "沒有符合「" + q + "」的生詞。" })); return; }
    U.add(box, h("ul.entry-list", null, list.map(wordRow)));
  }

  function renderSents() {
    var box = els.list;
    U.clear(box);
    var list = store.listSents();
    if (!list.length) {
      U.add(box, h("div.empty", null,
        h("p", { text: "還沒有收藏的句子。" }),
        h("p.muted", { text: "在「轉換」頁把句子調整好之後按「收藏這句」，連同你改過的聲調一起留在這裡。" })));
      return;
    }
    U.add(box, h("ul.sent-list", null, list.map(function (s) {
      return h("li.sent", null,
        h("button.sent-main", { type: "button", onclick: function () { openSent(s); } },
          h("span.hj", { lang: "nan-Hant", text: s.h }),
          h("span.tl", { lang: "nan-Latn", text: s.t }),
          s.src && s.src !== s.h ? h("span.zh", { text: s.src }) : null),
        h("div.row", null, U.copyButton(s.t, "台羅"), confirmButton("刪除", function () { store.removeSent(s.id); U.toast("已刪除"); })));
    })));
  }

  function openSent(s) {
    var segs = TG.views.convert.unpack(s.segs, s.mode);
    TG.views.convert.load(s.src || s.h, s.mode, segs);
  }

  /** 兩段式刪除：第一次按變成「確定刪除？」，幾秒內再按一次才真的刪。 */
  function confirmButton(label, fn) {
    var armed = false, t = 0;
    var b = h("button.btn.ghost.sm.danger", { type: "button" }, U.icon("trash"), h("span", { text: label }));
    b.addEventListener("click", function (ev) {
      ev.stopPropagation();
      if (armed) { root.clearTimeout(t); fn(); return; }
      armed = true;
      b.lastChild.textContent = "確定" + label + "？";
      b.classList.add("armed");
      t = root.setTimeout(function () { armed = false; b.lastChild.textContent = label; b.classList.remove("armed"); }, 3500);
    });
    return b;
  }

  function render() {
    var nW = store.listWords().length, nS = store.listSents().length;
    els.tabW.textContent = "生詞 " + nW;
    els.tabS.textContent = "句子 " + nS;
    els.tabW.classList.toggle("on", tab === "words");
    els.tabS.classList.toggle("on", tab === "sents");
    els.tabW.setAttribute("aria-pressed", tab === "words" ? "true" : "false");
    els.tabS.setAttribute("aria-pressed", tab === "sents" ? "true" : "false");
    els.form.hidden = tab !== "words";
    els.filterWrap.hidden = tab !== "words" || nW < 6;
    if (tab === "words") renderWords(); else renderSents();
  }

  // ---- edit sheet ------------------------------------------------------------------------------

  function editWord(id) {
    U.openSheet({
      title: "生詞",
      render: function () {
        var w = store.state.words[id];
        if (!w || w.del) return h("p.muted", { text: "這個生詞已經刪除。" });
        var e = w.ref && D.ready ? D.get(w.ref) : null;
        var o = { t5: store.state.settings.t5 };
        var a = w.t && D.ready ? U.analysePair(w.h, w.t, o) : null;
        var fh = h("input", { id: "ed-h", type: "text", value: w.h, autocomplete: "off", lang: "nan-Hant", maxlength: store.LIMIT.hanji });
        var ft = h("input", { id: "ed-t", type: "text", value: w.t, autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false", lang: "nan-Latn", maxlength: store.LIMIT.tailo });
        var fm = h("input", { id: "ed-m", type: "text", value: w.m, autocomplete: "off", maxlength: store.LIMIT.meaning });
        var fn = h("textarea", { id: "ed-n", rows: "2", maxlength: store.LIMIT.note });
        fn.value = w.n || "";
        return h("div.stack", null,
          a && a.tokens.length ? U.renderLine(a.tokens, { segs: a.segs, contour: store.state.settings.contour }) : null,
          w.t ? h("div.row.wrap", null, U.playButton(e ? TG.audio.word(e.id) : null, "播放發音", "發音"), U.copyButton(w.t, "台羅", "複製台羅"), U.copyButton(T.toNumeric(w.t), "數字調", "複製數字調")) : null,
          h("div.form-grid", null,
            h("label", { for: "ed-h", text: "漢字" }), fh,
            h("label", { for: "ed-t", text: "台羅" }), ft,
            h("label", { for: "ed-m", text: "意思" }), fm,
            h("label", { for: "ed-n", text: "備註" }), fn),
          h("p.hint", { text: "台羅可以打數字調（gau5），儲存時會轉成調符。" }),
          h("div.row.wrap", null,
            h("button.btn.primary", { type: "button", onclick: function () {
              var t = T.toDiacritic(ft.value.trim());
              var hz = fh.value.trim();
              var still = e && e.hanji === hz && D.hasReading(e, t);
              store.updateWord(id, { h: hz, t: t, m: fm.value.trim(), n: fn.value.trim(), ref: still ? e.id : 0 });
              U.toast("已儲存");
              U.closeAll();
            } }, U.icon("check"), "儲存"),
            e ? h("button.btn.ghost", { type: "button", onclick: function () { TG.views.dict.openEntry(e); } }, U.icon("book"), "看辭典") : null,
            confirmButton("刪除", function () { store.removeWord(id); U.closeAll(); U.toast("已刪除"); })),
          h("p.muted", { text: "熟悉度 " + (w.lv || 0) + " / 7" + (w.due ? "，下次複習 " + w.due : "，還沒複習過") }));
      }
    });
  }

  // ---- mount -----------------------------------------------------------------------------------

  function mount(el) {
    var field = function (id, label, attrs) {
      attrs = attrs || {};
      attrs.id = id; attrs.type = "text"; attrs.autocomplete = "off"; attrs.autocapitalize = "off";
      attrs.maxlength = id === "nb-h" ? store.LIMIT.hanji : id === "nb-t" ? store.LIMIT.tailo : id === "nb-m" ? store.LIMIT.meaning : store.LIMIT.note;
      var input = h("input", attrs);
      return { input: input, wrap: h("div.field", null, h("label", { for: id, text: label }), input) };
    };
    var fh = field("nb-h", "漢字", { placeholder: "例：媠", lang: "nan-Hant" });
    var ft = field("nb-t", "台羅", { placeholder: "例：sui2 或 suí", autocorrect: "off", spellcheck: "false", lang: "nan-Latn" });
    var fm = field("nb-m", "意思", { placeholder: "例：漂亮" });
    var fn = field("nb-n", "備註", { placeholder: "例：第 3 課，老師補充的說法" });
    els.h = fh.input; els.t = ft.input; els.m = fm.input; els.n = fn.input;
    els.preview = h("span.preview.muted");
    ft.wrap.appendChild(els.preview);
    els.suggest = h("div.suggest", { id: "nb-suggest", "aria-live": "polite" });
    var onType = function () {
      draft.ref = 0;
      preview();
      root.clearTimeout(timer);
      timer = root.setTimeout(suggestions, 200);
    };
    els.h.addEventListener("input", onType);
    els.t.addEventListener("input", onType);
    [els.h, els.t, els.m, els.n].forEach(function (i) {
      i.addEventListener("keydown", function (ev) { if (ev.key === "Enter") { ev.preventDefault(); addWord(); } });
    });
    els.form = h("div.card", null,
      h("div.card-head", null, h("h2", { text: "記一個生詞" })),
      h("div.fields", null, fh.wrap, ft.wrap, fm.wrap, fn.wrap),
      els.suggest,
      h("button.btn.primary", { type: "button", onclick: addWord }, U.icon("plus"), "加入生字簿"));
    els.tabW = h("button", { type: "button", onclick: function () { tab = "words"; render(); } });
    els.tabS = h("button", { type: "button", onclick: function () { tab = "sents"; render(); } });
    els.filter = h("input", { id: "nb-filter", type: "search", placeholder: "在生字簿裡找", autocomplete: "off", maxlength: "100", "aria-label": "在生字簿裡找" });
    els.filter.addEventListener("input", renderWords);
    els.filterWrap = h("div.searchbar.small", null, U.icon("search"), els.filter);
    els.list = h("div", { id: "nb-list" });
    U.add(el, [h("div.seg-toggle.wide", { role: "group", "aria-label": "生字簿內容" }, els.tabW, els.tabS), els.form, els.filterWrap, els.list]);
    render();
  }

  store.on(function (what) { if ((what === "words" || what === "sents") && els.list) render(); });

  TG.views = TG.views || {};
  TG.views.notebook = { mount: mount, onData: function () { if (els.list) render(); }, editWord: editWord, confirmButton: confirmButton };
})(window);

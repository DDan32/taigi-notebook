/* 「轉換」分頁：華語／台語漢字／台羅 → 逐詞對應、本調與變調，並可逐詞更正。 */
(function (root) {
  "use strict";
  var TG = root.TG;
  var U = TG.ui, h = U.h, T = TG.tailo, S = TG.sandhi, D = TG.dict, C = TG.convert, store = TG.store;

  var SAMPLE = "我今天要去學校上課。";
  var MAX_INPUT = 500;      // 一次轉換的字數上限：太長會畫出幾千個格子，整頁卡住
  var MODES = [["auto", "自動判斷"], ["huayu", "華語"], ["taigi", "台語漢字"], ["tailo", "台羅"]];
  var MODE_NAME = { huayu: "華語逐詞對應", taigi: "台語漢字標音", tailo: "台羅標調" };

  var cur = { src: "", mode: "auto", used: "", segs: [], tokens: [], sample: false, restored: false };
  var els = {};

  function opts() { return { t5: store.state.settings.t5 }; }

  // ---- (de)serialising a converted sentence -------------------------------------

  function pack(segs) {
    return segs.map(function (s) {
      if (s.kind === "punct") return { p: s.text };
      var c = C.current(s);
      return { src: s.src, h: c.hanji, t: c.tailo, e: c.entry ? c.entry.id : 0, s: c.sense, ov: s.ov };
    });
  }

  function candsFor(src, mode) {
    if (!src) return [];
    if (mode === "taigi") return C.taigiCands(src);
    if (mode === "tailo") return C.romanCands(T.toDiacritic(src));
    return C.applyFixes(src, C.huayuCands(src), store.state.fix);
  }

  function unpack(packed, mode) {
    return packed.map(function (p) {
      if (p.p != null) return { kind: "punct", text: p.p };
      var cands = candsFor(p.src, mode);
      var i = -1;
      cands.forEach(function (c, k) { if (i < 0 && c.hanji === p.h && D.sameReading(c.tailo, p.t) && /^--/.test(c.tailo) === /^--/.test(p.t)) i = k; });
      if (i < 0) {
        cands.unshift({ entry: p.e ? D.get(p.e) : D.findWord(p.h, p.t), hanji: p.h, tailo: p.t, sense: p.s == null ? -1 : p.s, src: 0, note: "", custom: true });
        i = 0;
      }
      return { kind: "seg", src: p.src, cands: cands, pick: i, ov: p.ov || {} };
    });
  }

  // ---- running a conversion ---------------------------------------------------------

  function run(text, mode, fresh) {
    text = (text || "").trim();
    if (!text) return;
    if (!D.ready) { U.toast("辭典還在載入，稍等一下"); return; }
    if (text.length > MAX_INPUT) { U.toast("一次最多 " + MAX_INPUT + " 個字，請分段轉換（現在 " + text.length + " 個字）"); return; }
    cur.sample = false;
    cur.src = text;
    cur.mode = mode || cur.mode;
    var saved = fresh ? null : store.recall(text);
    if (saved && (cur.mode === "auto" || saved.mode === cur.mode)) {
      cur.used = saved.mode;
      cur.segs = unpack(saved.segs, saved.mode);
      cur.restored = !!saved.edited;
    } else {
      var r = C.convert(text, cur.mode, store.state.fix);
      cur.used = r.mode;
      cur.segs = r.segs;
      cur.restored = false;
    }
    refresh(false);
  }

  /** Re-analyse after any change and redraw. `edited` marks the sentence as hand-corrected. */
  function refresh(edited) {
    cur.tokens = C.analyse(cur.segs, opts(), cur.used);
    if (!cur.sample && cur.src) {
      var prev = store.recall(cur.src);
      store.remember({ src: cur.src, mode: cur.used, segs: pack(cur.segs), edited: edited || (prev && prev.edited && cur.restored) || false });
      if (edited) cur.restored = true;
    }
    renderResult();
  }

  // The sample line, spelled out so the first screen has something to show before the dictionary arrives.
  var SAMPLE_WORDS = [
    ["我", "我", "guá", "代詞"], ["今天", "今仔日", "kin-á-ji̍t", "時間詞"], ["要", "欲", "beh", "助動詞"], ["去", "去", "khì", "動詞"],
    ["學校", "學校", "ha̍k-hāu", "名詞"], ["上課", "上課", "siōng-khò", "動詞"]
  ];

  function showStaticSample() {
    var segs = SAMPLE_WORDS.map(function (w) {
      return { kind: "seg", src: w[0], pick: 0, ov: {}, cands: [{ entry: null, hanji: w[1], tailo: w[2], sense: -1, src: 0, note: "" }] };
    });
    segs.push({ kind: "punct", text: "。" });
    var tokens = SAMPLE_WORDS.map(function (w, i) { return { kind: "word", hanji: w[1], tailo: w[2], pos: w[3], seg: i, wi: 0 }; });
    tokens.push({ kind: "punct", text: "。", seg: SAMPLE_WORDS.length });
    S.apply(tokens, opts());
    cur = { src: SAMPLE, mode: cur.mode, used: "huayu", segs: segs, tokens: tokens, sample: true, restored: false };
    renderResult();
  }

  function showSample() {
    if (!D.ready) return;
    var r = C.convert(SAMPLE, "huayu", null);
    cur = { src: SAMPLE, mode: cur.mode, used: r.mode, segs: r.segs, tokens: [], sample: true, restored: false };
    cur.tokens = C.analyse(cur.segs, opts(), cur.used);
    renderResult();
  }

  // ---- result -------------------------------------------------------------------------

  function outputRow(label, mode, what) {
    var text = mode === "hanji" ? S.formatHanji(cur.tokens) : S.format(cur.tokens, mode);
    return h("div.out-row", null,
      h("div.out-main", null, h("span.out-label", { text: label }),
        h("span.out-text" + (mode === "hanji" ? ".hj" : ".tl"), { lang: mode === "hanji" ? "nan-Hant" : "nan-Latn", text: text })),
      U.copyButton(text, what));
  }

  function hasCand(flag) {
    return cur.segs.some(function (x) { return x.kind === "seg" && C.current(x) && C.current(x)[flag]; });
  }

  function renderResult() {
    var box = els.result;
    U.clear(box);
    if (!cur.tokens.length) return;
    var head = h("div.card-head", null,
      h("h2", { text: cur.sample ? "範例" : "本調與變調" }),
      h("span.tag", { text: cur.sample ? SAMPLE : MODE_NAME[cur.used] || "" }));
    var line = U.renderLine(cur.tokens, {
      segs: cur.segs, caption: cur.used === "huayu", contour: store.state.settings.contour,
      onPick: function (i) { openSeg(i); }
    });
    var legend = h("p.legend", null,
      h("span.lg.keep", null, h("u", { text: "底線" }), " 讀本調"),
      h("span.lg.chg", null, "1", h("span.arrow", { text: "›" }), h("i", { text: "7" }), " 本調 › 變調後"),
      h("span.lg", null, "輕 輕聲"),
      hasCand("guess") || hasCand("unknown") ? h("span.lg", null, h("span.lg-box.dashed"), " 辭典沒收，逐字拼的，請確認") : null,
      hasCand("fixed") || hasCand("custom") ? h("span.lg", null, h("span.lg-box.marked"), " 我的更正") : null,
      h("span.lg.muted", { text: "點任何一個詞可以更正" }));
    var outs = h("div.outs", null,
      outputRow("台羅", "tailo", "台羅"),
      outputRow("數字調", "num", "數字調台羅"),
      outputRow("實際讀音", "actual", "變調後讀音"),
      outputRow("漢字", "hanji", "漢字"));
    var actions = h("div.row.wrap", null,
      cur.sample ? null : h("button.btn", { type: "button", onclick: saveSentence }, U.icon("star"), "收藏這句"),
      cur.restored ? h("button.btn.ghost", { type: "button", onclick: function () { run(cur.src, cur.mode, true); U.toast("已重新對應"); } }, U.icon("undo"), "丟掉我的更正，重新對應") : null);
    var note = cur.used === "huayu"
      ? h("p.note", { text: "這是逐詞對應，不是翻譯：語序和句型要自己調整。每個詞都可以換說法、改發音、改聲調、前後移動。" })
      : null;
    U.add(box, [head, cur.restored ? h("p.note.ok", { text: "已套用你上次對這句話的更正。" }) : null, line, legend, outs, actions, note]);
    renderRelated();
  }

  function saveSentence() {
    store.addSent({
      src: cur.src, mode: cur.used, segs: pack(cur.segs),
      h: S.formatHanji(cur.tokens), t: S.format(cur.tokens, "tailo")
    });
    U.toast("已收藏到生字簿的「句子」");
  }

  // ---- related examples from the dictionary -------------------------------------------

  function renderRelated() {
    var box = els.related;
    U.clear(box);
    if (!D.examples || cur.sample || !cur.segs.length) return;
    var keys = [];
    cur.segs.forEach(function (s) {
      if (s.kind !== "seg") return;
      var c = C.current(s);
      if (c && c.hanji && c.hanji.length >= 2 && keys.indexOf(c.hanji) < 0) keys.push(c.hanji);
    });
    keys.sort(function (a, b) { return b.length - a.length; });
    var seen = {}, rows = [];
    keys.slice(0, 4).forEach(function (k) {
      D.searchExamples(k, 3).forEach(function (ex) {
        if (seen[ex[0]] || rows.length >= 6) return;
        seen[ex[0]] = 1;
        rows.push(ex);
      });
    });
    if (!rows.length) return;
    U.add(box, h("div.card", null,
      h("div.card-head", null, h("h2", { text: "辭典裡的相關例句" }), h("span.tag", { text: "教育部辭典" })),
      h("ul.ex-list", null, rows.map(function (ex) { return exampleItem(ex); }))));
  }

  function exampleItem(ex) {
    return h("li", null, h("button.ex", { type: "button", onclick: function () { openExample(ex); } },
      h("span.hj", { lang: "nan-Hant", text: ex[0] }),
      h("span.tl", { lang: "nan-Latn", text: ex[1] }),
      h("span.zh", { text: ex[2] })));
  }

  /** 例句面板：用辭典給的台羅標出變調。 */
  function openExample(ex) {
    var a = U.analysePair(ex[0], ex[1], opts());
    U.openSheet({
      title: "例句的變調",
      render: function () {
        return h("div.stack", null,
          U.renderLine(a.tokens, { segs: a.segs, contour: store.state.settings.contour }),
          h("p.zh", { text: ex[2] }),
          h("div.outs", null,
            h("div.out-row", null, h("div.out-main", null, h("span.out-label", { text: "台羅" }), h("span.out-text.tl", { lang: "nan-Latn", text: ex[1] })), U.copyButton(ex[1], "台羅")),
            h("div.out-row", null, h("div.out-main", null, h("span.out-label", { text: "實際讀音" }), h("span.out-text.tl", { text: S.format(a.tokens, "actual") })), U.copyButton(S.format(a.tokens, "actual"), "變調後讀音"))),
          h("div.row.wrap", null,
            h("button.btn", { type: "button", onclick: function () { load(ex[0], "taigi", a.segs); U.closeAll(); } }, U.icon("pen"), "拿到轉換頁更正聲調")),
          h("p.note", { text: "例句和台羅出自教育部辭典；變調是本站依規則推算的，可能有誤。" }));
      }
    });
  }

  /** Put an already analysed sentence into the converter (examples, saved sentences). */
  function load(src, mode, segs) {
    cur = { src: src, mode: "auto", used: mode, segs: segs, tokens: [], sample: false, restored: false };
    els.text.value = src;
    setMode("auto");
    refresh(false);
    TG.app.go("convert");
    root.scrollTo(0, 0);
  }

  // ---- the correction sheet ----------------------------------------------------------------

  function candRow(seg, c, i) {
    var picked = i === seg.pick;
    var e = c.entry;
    var pos = e ? D.posOf(e, c.sense) : "";
    var def = e ? D.shortDef(e, c.sense) : "";
    var tags = D.srcLabel(c.src);
    if (c.fixed) tags.unshift("我的更正");
    if (c.custom) tags.unshift("自訂");
    if (c.guess) tags.unshift("逐字讀音");
    return h("li", null,
      h("button.cand" + (picked ? ".on" : ""), { type: "button", "aria-pressed": picked ? "true" : "false", onclick: function () { pick(seg, i); } },
        h("span.cand-main", null,
          h("span.hj", { lang: "nan-Hant", text: c.hanji || "（無漢字）" }),
          h("span.tl", { lang: "nan-Latn", text: c.tailo || "?" })),
        h("span.cand-def", null, pos ? h("span.pos", { text: pos }) : null, c.note ? c.note + (def ? "｜" : "") : "", def),
        tags.length ? h("span.cand-tags", null, tags.map(function (t) { return h("span.tag", { text: t }); })) : null),
      e ? h("button.link.cand-more", { type: "button", "aria-label": "看「" + e.hanji + "」的詞條", onclick: function () { TG.views.dict.openEntry(e); } }, "詞條") : null);
  }

  function pick(seg, i) {
    seg.pick = i;
    seg.ov = {};
    var c = C.current(seg);
    if (store.state.settings.remember !== false && cur.used === "huayu" && seg.src && c.tailo) {
      store.fixWord(seg.src, c.hanji, c.tailo);
    }
    refresh(true);
    U.refreshSheet();
  }

  function toneRows(seg, si) {
    var words = cur.tokens.filter(function (t) { return t.kind === "word" && t.seg === si; });
    var rows = [];
    var manual = false;
    words.forEach(function (w) {
      (w.syls || []).forEach(function (s, j) {
        if (s.manual) manual = true;
        var set = function (v) {
          seg.ov[w.wi] = seg.ov[w.wi] || {};
          seg.ov[w.wi][j] = v;
          refresh(true);
          U.refreshSheet();
        };
        rows.push(h("li.tone-row", null,
          h("span.tone-syl", null,
            h("span.hj", { lang: "nan-Hant", text: s.hanji || "" }),
            h("span.tl", { lang: "nan-Latn", text: T.compose(s.base, s.tone) })),
          s.neutral
            ? h("span.tone-fixed", { text: "輕聲" })
            : h("span.seg-toggle", { role: "group", "aria-label": (s.hanji || s.key) + " 的聲調" },
              h("button" + (s.keep ? ".on" : ""), { type: "button", "aria-pressed": s.keep ? "true" : "false", onclick: function () { set("base"); } },
                "本調 ", h("b", { text: String(s.tone) })),
              h("button" + (!s.keep ? ".on.chg" : ""), { type: "button", "aria-pressed": !s.keep ? "true" : "false", onclick: function () { set("sandhi"); } },
                "變調 ", h("b", { text: String(s.sandhi) }))),
          h("span.tone-why" + (s.manual ? ".manual" : ""), { text: s.why || "" })));
      });
    });
    return { rows: rows, manual: manual };
  }

  function openSeg(si) {
    var seg = cur.segs[si];
    if (!seg || seg.kind !== "seg") return;
    if (!D.ready) { U.toast("辭典還在載入，稍等一下"); return; }
    if (cur.sample) { cur.sample = false; cur.src = SAMPLE; els.text.value = SAMPLE; }
    U.openSheet({
      title: (cur.used === "huayu" && seg.src ? "「" + seg.src + "」" : "") + "更正",
      render: function () {
        var c = C.current(seg);
        si = cur.segs.indexOf(seg);
        var tones = toneRows(seg, si);
        var hInput = h("input", { id: "fix-hanji", type: "text", value: c.hanji, autocomplete: "off", autocapitalize: "off", lang: "nan-Hant", maxlength: store.LIMIT.hanji });
        var tInput = h("input", { id: "fix-tailo", type: "text", value: c.tailo, autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false", inputmode: "text", lang: "nan-Latn", maxlength: store.LIMIT.tailo });
        var preview = h("span.muted", { text: "" });
        tInput.addEventListener("input", function () { preview.textContent = tInput.value ? "→ " + T.toDiacritic(tInput.value) : ""; });
        var remember = store.state.settings.remember !== false;
        return h("div.stack", null,
          h("section", null,
            h("h3", { text: "聲調" }),
            tones.rows.length ? h("ul.tone-list", null, tones.rows) : h("p.muted", { text: "還沒有讀音，請在下面填台羅。" }),
            tones.manual ? h("button.btn.ghost.sm", { type: "button", onclick: function () { seg.ov = {}; refresh(true); U.refreshSheet(); } }, U.icon("undo"), "改回自動判斷") : null),
          h("section", null,
            h("h3", { text: seg.cands.length > 1 ? "換一個說法" : "說法" }),
            h("ul.cand-list", null, seg.cands.map(function (x, i) { return candRow(seg, x, i); })),
            cur.used === "huayu" ? h("label.check", null,
              h("input", { id: "fix-remember", type: "checkbox", checked: remember, onchange: function (ev) { store.setSetting("remember", ev.target.checked); } }),
              "記住我的選擇，以後「" + seg.src + "」都這樣對應") : null),
          h("section", null,
            h("h3", { text: "自己填" }),
            h("div.form-grid", null,
              h("label", { for: "fix-hanji", text: "漢字" }), hInput,
              h("label", { for: "fix-tailo", text: "台羅" }), h("div", null, tInput, preview)),
            h("p.hint", { text: "台羅可以打數字調，例如 gau5、tsiah8-png7；輕聲在前面加 --。" }),
            h("button.btn", { type: "button", onclick: function () { applyCustom(seg, hInput.value, tInput.value); } }, U.icon("check"), "套用")),
          h("section", null,
            h("h3", { text: "這個詞" }),
            h("div.row.wrap", null,
              h("button.btn.ghost", { type: "button", disabled: si === 0, onclick: function () { move(seg, -1); } }, U.icon("left"), "往前移"),
              h("button.btn.ghost", { type: "button", disabled: si >= cur.segs.length - 1, onclick: function () { move(seg, 1); } }, "往後移", U.icon("right")),
              h("button.btn.ghost", { type: "button", onclick: function () { insertAfter(seg); } }, U.icon("plus"), "後面加一個詞"),
              h("button.btn.ghost.danger", { type: "button", onclick: function () { remove(seg); } }, U.icon("trash"), "刪掉"),
              c.tailo ? h("button.btn", { type: "button", onclick: function () { addToNotebook(seg); } }, U.icon("note"), "加入生字簿") : null)));
      }
    });
  }

  function applyCustom(seg, hanji, tailo) {
    hanji = (hanji || "").trim();
    tailo = T.toDiacritic((tailo || "").trim());
    if (!tailo) { U.toast("請填台羅"); return; }
    var same = -1;
    seg.cands.forEach(function (x, i) {
      if (same < 0 && x.hanji === hanji && D.sameReading(x.tailo, tailo) && /^--/.test(x.tailo) === /^--/.test(tailo)) same = i;
    });
    if (same >= 0) seg.pick = same;      // already offered: just choose it
    else {
      seg.cands = seg.cands.filter(function (x) { return !x.custom; });
      seg.cands.unshift({ entry: D.findWord(hanji, tailo), hanji: hanji, tailo: tailo, sense: -1, src: 0, score: 0, note: "", custom: true });
      seg.pick = 0;
    }
    seg.ov = {};
    if (store.state.settings.remember !== false) {
      if (cur.used === "huayu" && seg.src) store.fixWord(seg.src, hanji, tailo);
      else if (cur.used === "taigi" && hanji) store.fixReading(hanji, tailo);
    }
    refresh(true);
    U.refreshSheet();
    U.toast("已套用");
  }

  function move(seg, dir) {
    var i = cur.segs.indexOf(seg), j = i + dir;
    if (j < 0 || j >= cur.segs.length) return;
    cur.segs.splice(i, 1);
    cur.segs.splice(j, 0, seg);
    refresh(true);
    U.refreshSheet();
  }

  function remove(seg) {
    cur.segs.splice(cur.segs.indexOf(seg), 1);
    refresh(true);
    U.closeAll();
  }

  function insertAfter(seg) {
    var input = h("input", { id: "ins-text", type: "text", autocomplete: "off", autocapitalize: "off", maxlength: "100", placeholder: "華語、台語漢字或台羅" });
    U.openSheet({
      title: "加一個詞",
      render: function () {
        return h("div.stack", null,
          h("label", { for: "ins-text", text: "要加在後面的詞" }), input,
          h("button.btn", { type: "button", onclick: function () {
            var text = input.value.trim();
            if (!text) return;
            var r = C.convert(text, "auto", store.state.fix);
            var at = cur.segs.indexOf(seg) + 1;
            Array.prototype.splice.apply(cur.segs, [at, 0].concat(r.segs));
            refresh(true);
            U.closeSheet();
            U.refreshSheet();
          } }, U.icon("plus"), "加入"));
      }
    });
    root.setTimeout(function () { input.focus(); }, 50);
  }

  function addToNotebook(seg) {
    var c = C.current(seg);
    if (store.findWord(c.hanji, c.tailo)) { U.toast("生字簿裡已經有「" + c.hanji + "」"); return; }
    var def = c.entry ? D.shortDef(c.entry, c.sense) : "";
    store.addWord({ h: c.hanji, t: c.tailo, m: def || (cur.used === "huayu" ? seg.src : ""), ref: c.entry ? c.entry.id : 0 });
    U.toast("已加入生字簿：" + c.hanji);
  }

  // ---- input card -----------------------------------------------------------------------------

  function setMode(m) {
    cur.mode = m;
    Array.prototype.forEach.call(els.modes.children, function (b) {
      var on = b.getAttribute("data-mode") === m;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function renderHistory() {
    var box = els.history;
    U.clear(box);
    var list = store.state.history.slice(0, 8);
    if (!list.length) return;
    U.add(box, [h("span.muted", { text: "最近：" })].concat(list.map(function (it) {
      return h("button.chip", { type: "button", onclick: function () { els.text.value = it.src; run(it.src, "auto"); } },
        it.src.length > 14 ? it.src.slice(0, 14) + "…" : it.src);
    })));
  }

  function mount(el) {
    els.text = h("textarea", {
      id: "src-text", rows: "3", autocomplete: "off", autocapitalize: "off", spellcheck: "false", maxlength: String(MAX_INPUT * 4),
      placeholder: "輸入華語句子、台語漢字，或台羅（例：gua2 beh4 khi3 tai5-pak4）",
      "aria-label": "要轉換的句子"
    });
    els.text.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); go(); }
    });
    els.modes = h("div.modes", { role: "group", "aria-label": "輸入的是" }, MODES.map(function (m) {
      return h("button.chip", { type: "button", "data-mode": m[0], "aria-pressed": "false", onclick: function () { setMode(m[0]); if (els.text.value.trim()) go(); } }, m[1]);
    }));
    els.result = h("div.card.result", { id: "result", "aria-live": "polite" });
    els.loading = h("p.muted", { id: "loading", text: "辭典載入中…第一次開啟要下載約 7 MB。" });
    els.related = h("div", { id: "related" });
    els.history = h("div.history.row.wrap", { id: "history" });
    var go = function () {
      var text = els.text.value.trim();
      if (!text) { U.toast("先輸入一句話"); return; }
      run(text, cur.mode);
      renderHistory();
    };
    els.go = go;
    U.add(el, [
      h("div.card.input", null,
        els.text,
        h("div.row.between.wrap", null, els.modes,
          h("div.row", null,
            h("button.btn.ghost", { type: "button", onclick: function () { els.text.value = ""; els.text.focus(); } }, "清除"),
            h("button.btn.primary", { type: "button", id: "go", onclick: go }, "轉換")))),
      els.history, els.loading, els.result, els.related
    ]);
    setMode("auto");
    renderHistory();
    showStaticSample();
  }

  function onData(what) {
    if (what === "dict") {
      els.loading.hidden = true;
      if (cur.sample) showSample();
    }
    if (what === "examples") renderRelated();
  }

  store.on(function (what) {
    if (what !== "settings" || !cur.segs.length || !els.result) return;
    if (!D.ready) { showStaticSample(); return; }
    cur.tokens = C.analyse(cur.segs, opts(), cur.used);
    renderResult();
  });

  TG.views = TG.views || {};
  TG.views.convert = { mount: mount, onData: onData, run: run, load: load, openExample: openExample, exampleItem: exampleItem, unpack: unpack };
})(window);

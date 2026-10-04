/* 「複習」分頁：今日一詞（每天換一個辭典裡的詞），以及生字簿的間隔複習。 */
(function (root) {
  "use strict";
  var TG = root.TG;
  var U = TG.ui, h = U.h, T = TG.tailo, D = TG.dict, store = TG.store, srs = TG.srs;

  var els = {};
  var session = null;   // { queue: [id], shown: bool, done: n, extra: bool }

  function opts() { return { t5: store.state.settings.t5 }; }

  // ---- 今日一詞 ---------------------------------------------------------------------

  function dailyEntry(date) {
    if (!D.ready || !D.daily.length) return null;
    return D.get(D.daily[srs.dailyIndex(D.daily.length, date)]);
  }

  function renderDaily() {
    var box = els.daily;
    U.clear(box);
    var e = dailyEntry();
    if (!e) { U.add(box, h("p.muted", { text: "辭典載入中…" })); return; }
    var ex = D.firstExample(e);
    var a = U.analysePair(e.hanji, e.tailo, opts());
    var inBook = store.findWord(e.hanji, e.tailo);
    var d = new Date();
    U.add(box, [
      h("div.card-head", null, h("h2", { text: "今日一詞" }), h("span.tag", { text: (d.getMonth() + 1) + " 月 " + d.getDate() + " 日" })),
      h("button.daily-word", { type: "button", "aria-label": "看「" + e.hanji + "」的詞條", onclick: function () { TG.views.dict.openEntry(e); } },
        U.renderLine(a.tokens, { segs: a.segs, contour: store.state.settings.contour })),
      h("p.def", null, D.posOf(e, 0) ? h("span.pos", { text: D.posOf(e, 0) }) : null, D.shortDef(e, 0)),
      ex ? h("ul.ex-list", null, TG.views.convert.exampleItem(ex)) : null,
      h("div.row.wrap", null,
        h("button.btn" + (inBook ? ".ghost" : ""), { type: "button", disabled: !!inBook, onclick: function () {
          store.addWord({ h: e.hanji, t: e.tailo, m: D.shortDef(e, 0), ref: e.id });
          U.toast("已加入生字簿：" + e.hanji);
        } }, U.icon(inBook ? "check" : "note"), inBook ? "已在生字簿" : "加入生字簿"),
        U.playButton(TG.audio.word(e.id), "播放「" + e.hanji + "」的發音", "發音"),
        U.copyButton(e.tailo, "台羅", "複製台羅"))
    ]);
  }

  // ---- 複習 -------------------------------------------------------------------------

  function startSession(extra) {
    var words = store.listWords();
    var queue = extra
      ? words.slice().sort(function (a, b) { return (a.lv || 0) - (b.lv || 0) || (a.due || "") .localeCompare(b.due || ""); }).slice(0, 10)
      : srs.dueWords(words);
    session = { queue: queue.map(function (w) { return w.id; }), shown: false, done: 0, extra: !!extra };
    renderSession();
  }

  function answer(grade) {
    var id = session.queue.shift();
    var w = store.state.words[id];
    if (w && !w.del) {
      store.updateWord(id, srs.schedule(w, grade));
      store.setMeta(srs.touchStreak(store.state.meta));
      if (grade === "again") session.queue.push(id);
    }
    session.done++;
    session.shown = false;
    renderSession();
  }

  function stats() {
    var words = store.listWords();
    var m = store.state.meta;
    var today = srs.dayKey();
    var alive = m.lastDay === today || m.lastDay === srs.addDays(today, -1);
    return h("dl.stats", null,
      h("div", null, h("dt", { text: "生詞" }), h("dd", { text: String(words.length) })),
      h("div", null, h("dt", { text: "今天要複習" }), h("dd", { text: String(srs.dueWords(words).length) })),
      h("div", null, h("dt", { text: "今天已複習" }), h("dd", { text: String(m.doneDay === today ? m.done || 0 : 0) })),
      h("div", null, h("dt", { text: "連續天數" }), h("dd", { text: String(alive ? m.streak || 0 : 0) })));
  }

  function card(w) {
    var front = store.state.settings.front === "meaning" && w.m ? "meaning" : "hanji";
    var a = w.t && D.ready ? U.analysePair(w.h, w.t, opts()) : null;
    var e = w.ref && D.ready ? D.get(w.ref) : null;
    var ex = e ? D.firstExample(e) : null;
    var question = front === "meaning"
      ? h("div.fc-q", null, h("p.fc-meaning", { text: w.m }), h("p.muted", { text: "台語怎麼說？" }))
      : h("div.fc-q", null, h("p.fc-hanji", { lang: "nan-Hant", text: w.h || w.t }), h("p.muted", { text: w.h ? "怎麼唸？什麼意思？" : "什麼意思？" }));
    if (!session.shown) {
      return h("div.flashcard", null, question,
        h("button.btn.primary.block", { type: "button", onclick: function () { session.shown = true; renderSession(); } }, "看答案"));
    }
    return h("div.flashcard", null,
      a && a.tokens.length ? U.renderLine(a.tokens, { segs: a.segs, contour: store.state.settings.contour })
        : h("p.fc-hanji", { lang: "nan-Hant", text: w.h }),
      h("p.def", { text: w.m || "（還沒寫意思）" }),
      w.n ? h("p.muted", { text: w.n }) : null,
      ex ? h("ul.ex-list", null, TG.views.convert.exampleItem(ex)) : null,
      h("div.grade", { role: "group", "aria-label": "記得多少" },
        h("button.btn.again", { type: "button", onclick: function () { answer("again"); } }, "忘記", h("small", { text: "等一下再來" })),
        h("button.btn.hard", { type: "button", onclick: function () { answer("hard"); } }, "模糊", h("small", { text: "明天" })),
        h("button.btn.good", { type: "button", onclick: function () { answer("good"); } }, "記得",
          h("small", { text: srs.INTERVALS[Math.min((w.lv || 0) + 1, 7)] + " 天後" }))),
      h("div.row.between", null,
        h("button.link", { type: "button", onclick: function () { TG.views.notebook.editWord(w.id); } }, "修改這個生詞"),
        h("span.row", null, U.playButton(e ? TG.audio.word(e.id) : null, "播放發音"), w.t ? U.copyButton(w.t, "台羅") : null)));
  }

  function renderSession() {
    var box = els.session;
    U.clear(box);
    var words = store.listWords();
    U.add(box, h("div.card-head", null, h("h2", { text: "生字簿複習" }),
      session && session.queue.length ? h("span.tag", { text: "還有 " + session.queue.length + " 個" }) : null));
    U.add(box, stats());
    if (!words.length) {
      U.add(box, h("div.empty", null,
        h("p", { text: "生字簿裡還沒有詞。" }),
        h("p.muted", { text: "把上課遇到的詞加進生字簿，這裡每天會挑該複習的出來。" }),
        h("button.btn", { type: "button", onclick: function () { TG.app.go("notebook"); } }, U.icon("note"), "去記生詞")));
      return;
    }
    if (session && session.queue.length) {
      var w = store.state.words[session.queue[0]];
      if (!w || w.del) { session.queue.shift(); renderSession(); return; }
      U.add(box, card(w));
      return;
    }
    var due = srs.dueWords(words).length;
    if (session && session.done) {
      U.add(box, h("p.note.ok", { text: "這一輪複習了 " + session.done + " 次。" }));
    }
    if (due) {
      U.add(box, h("button.btn.primary.block", { type: "button", onclick: function () { startSession(false); } }, "開始複習（" + due + " 個）"));
    } else {
      U.add(box, [h("p", { text: "今天該複習的都看完了。" }),
        h("button.btn.ghost", { type: "button", onclick: function () { startSession(true); } }, "再多看幾個")]);
    }
    U.add(box, h("label.check", null,
      h("input", { id: "rv-front", type: "checkbox", checked: store.state.settings.front === "meaning",
        onchange: function (ev) { store.setSetting("front", ev.target.checked ? "meaning" : "hanji"); } }),
      "先看意思，回想台語怎麼說"));
  }

  function mount(el) {
    els.daily = h("div.card.daily", { id: "daily" });
    els.session = h("div.card", { id: "session" });
    U.add(el, [els.daily, els.session]);
    renderDaily();
    renderSession();
  }

  function onData() { if (els.daily) { renderDaily(); renderSession(); } }

  store.on(function (what) {
    if (!els.daily) return;
    if (what === "words") { renderDaily(); if (!session || !session.queue.length) renderSession(); }
    if (what === "settings") { renderDaily(); renderSession(); }
  });

  TG.views = TG.views || {};
  TG.views.review = { mount: mount, onData: onData, dailyEntry: dailyEntry };
})(window);

/* 啟動：分頁、載入辭典資料、連上雲端同步（如果有）。 */
(function (root) {
  "use strict";
  var TG = root.TG;
  var U = TG.ui, h = U.h, D = TG.dict, store = TG.store;
  var doc = root.document;

  var TABS = [
    ["convert", "轉換", "pen"], ["dict", "辭典", "book"], ["proverb", "諺語", "quote"], ["notebook", "生字簿", "note"],
    ["review", "複習", "cards"], ["more", "更多", "more"]
  ];
  var current = "convert";

  function go(name) {
    if (!TABS.some(function (t) { return t[0] === name; })) name = "convert";
    current = name;
    TABS.forEach(function (t) {
      doc.getElementById("view-" + t[0]).hidden = t[0] !== name;
      var b = doc.getElementById("tab-" + t[0]);
      if (t[0] === name) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    try { if (root.location.hash !== "#" + name) root.history.replaceState(null, "", "#" + name); } catch (e) { /* sandboxed */ }
  }

  function buildTabs() {
    var nav = doc.getElementById("tabs");
    TABS.forEach(function (t) {
      nav.appendChild(h("button.tab", { type: "button", id: "tab-" + t[0], onclick: function () { U.closeAll(); go(t[0]); root.scrollTo(0, 0); } },
        U.icon(t[2]), h("span", { text: t[1] })));
    });
  }

  /** One retry after a short pause: a phone on a weak connection often fails the first request. */
  function getJSON(path, retried) {
    return root.fetch(path).then(function (r) {
      if (!r.ok) throw new Error(path + " " + r.status);
      return r.json();
    }).catch(function (e) {
      if (retried) throw e;
      return new Promise(function (done) { root.setTimeout(done, 800); }).then(function () { return getJSON(path, true); });
    });
  }

  function notify(what) {
    Object.keys(TG.views).forEach(function (k) {
      try { if (TG.views[k].onData) TG.views[k].onData(what); } catch (e) { root.console && console.error(e); }
    });
  }

  function loadData() {
    // the proverb words and the clip list are extras: the site still works without them
    TG.app.missing = [];
    var optional = function (p) { return getJSON(p).catch(function () { TG.app.missing.push(p); return null; }); };
    return Promise.all([getJSON("data/dict.json"), getJSON("data/huayu.json"), getJSON("data/chars.json"), getJSON("data/daily.json"),
      optional("data/synonyms.json"), optional("data/audio.json"), optional("data/proverb_kw.json")])
      .then(function (r) {
        D.init(r[0]);
        D.set("huayu", r[1]);
        D.set("chars", r[2]);
        D.set("daily", r[3]);
        if (r[4]) D.set("synonyms", r[4]);
        if (r[5]) D.set("audio", r[5]);
        if (r[6]) D.set("proverbKw", r[6]);
        notify("dict");
        TG.proverb.init();
        notify("proverb");
        return getJSON("data/examples.json");
      })
      .then(function (ex) {
        D.set("examples", ex);
        notify("examples");
      });
  }

  function boot() {
    buildTabs();
    U.initSheet();
    TABS.forEach(function (t) { TG.views[t[0]].mount(doc.getElementById("view-" + t[0])); });
    go((root.location.hash || "").replace("#", "") || "convert");
    root.addEventListener("hashchange", function () {
      var name = (root.location.hash || "").replace("#", "");
      if (name && name !== current) { U.closeAll(); go(name); }
    });
    loadData().catch(function (e) {
      var box = doc.getElementById("loading");
      if (box) {
        box.hidden = false;
        U.clear(box);
        U.add(box, [h("p", { text: "辭典資料沒有載入成功。" }), h("p.muted", { text: "請檢查網路後重新整理。（" + (e && e.message ? e.message : "未知錯誤") + "）" }),
          h("button.btn", { type: "button", onclick: function () { root.location.reload(); } }, "重新整理")]);
      }
    });
    var warned = false;
    store.on(function (what) {
      if (what === "storage" && !store.storage.ok && !warned) {
        warned = true;
        U.toast("這個瀏覽器存不下資料，請到「更多」複製備份");
      }
    });
    if (!store.storage.ok) { warned = true; U.toast("這個瀏覽器不讓網頁存資料，請到「更多」複製備份"); }
    store.connect();
  }

  TG.app = { go: go };
  boot();
})(window);

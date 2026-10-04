/* 「更多」分頁：聲調設定與聲調表、我的更正、備份、iPhone／iPad 小工具、資料來源。 */
(function (root) {
  "use strict";
  var TG = root.TG;
  var U = TG.ui, h = U.h, T = TG.tailo, S = TG.sandhi, D = TG.dict, store = TG.store, srs = TG.srs;

  var el = null;
  var widgetCode = "";
  var backupDraft = "";
  // 傳統的八音口訣：君滾棍骨裙滾郡滑
  var TONES = [
    [1, "君", "kun", "高平", ""], [2, "滾", "kun", "高降", ""], [3, "棍", "kun", "低降", ""],
    [4, "骨", "kut", "中促", "-h 結尾的變 2"], [5, "裙", "kun", "上升", ""],
    [7, "郡", "kun", "中平", ""], [8, "滑", "kut", "高促", "-h 結尾的變 3"]
  ];

  function toneTable() {
    var o = { t5: store.state.settings.t5 };
    return h("div.table-wrap", null, h("table.tone-table", null,
      h("thead", null, h("tr", null, ["調", "例字", "音高", "變調後"].map(function (t) { return h("th", { text: t }); }))),
      h("tbody", null, TONES.map(function (r) {
        var after = S.sandhiTone(r[0], r[2].slice(-1) === "t" ? "t" : "", o);
        return h("tr", null,
          h("td.num", { text: String(r[0]) }),
          h("td", null, h("span.hj", { lang: "nan-Hant", text: r[1] }), " ", h("span.tl", { lang: "nan-Latn", text: T.compose(r[2], r[0]) })),
          h("td", null, U.contour(r[0]), " ", r[3]),
          h("td", null, h("i", { text: String(after) }), r[4] ? h("span.muted.sub", { text: r[4] }) : null));
      }))));
  }

  function settingsCard() {
    var t5 = store.state.settings.t5;
    return h("div.card", null,
      h("div.card-head", null, h("h2", { text: "聲調" })),
      h("div.col", null,
        h("span", { text: "第 5 聲變調之後" }),
        h("div.seg-toggle", { role: "group", "aria-label": "第 5 聲變調之後" },
          h("button" + (t5 !== 3 ? ".on" : ""), { type: "button", "aria-pressed": t5 !== 3 ? "true" : "false", onclick: function () { store.setSetting("t5", 7); } }, "讀第 7 聲"),
          h("button" + (t5 === 3 ? ".on" : ""), { type: "button", "aria-pressed": t5 === 3 ? "true" : "false", onclick: function () { store.setSetting("t5", 3); } }, "讀第 3 聲")),
        h("p.hint", { text: "高雄、臺南等地讀第 7 聲（教育部辭典的主音讀腔調）；臺北等偏泉腔讀第 3 聲。照你老師教的選。" })),
      h("label.check", null,
        h("input", { id: "set-contour", type: "checkbox", checked: store.state.settings.contour !== false,
          onchange: function (ev) { store.setSetting("contour", ev.target.checked); } }),
        "在每個音節下面畫出實際讀出來的音高"),
      toneTable(),
      h("p.hint", { text: "台語寫的時候一律寫本調。說話時，一個詞組裡只有最後一個音節讀本調，前面的都照上表變調；「仔」前面和三疊字另有規則。本站用詞性推算哪裡讀本調，推錯的地方請在「轉換」頁點那個詞更正。" }));
  }

  function fixesCard() {
    var fw = store.state.fix.word, fr = store.state.fix.read;
    var rows = [];
    Object.keys(fw).forEach(function (k) {
      rows.push(h("li", null,
        h("span", null, "華語「" + k + "」→ ", h("span.hj", { lang: "nan-Hant", text: fw[k].h }), " ", h("span.tl", { lang: "nan-Latn", text: fw[k].t })),
        h("button.btn.ghost.sm", { type: "button", onclick: function () { store.removeFix("word", k); } }, U.icon("trash"), "移除")));
    });
    Object.keys(fr).forEach(function (k) {
      rows.push(h("li", null,
        h("span", null, h("span.hj", { lang: "nan-Hant", text: k }), " 讀作 ", h("span.tl", { lang: "nan-Latn", text: fr[k] })),
        h("button.btn.ghost.sm", { type: "button", onclick: function () { store.removeFix("read", k); } }, U.icon("trash"), "移除")));
    });
    return h("div.card", null,
      h("div.card-head", null, h("h2", { text: "我的更正" }), h("span.tag", { text: rows.length + " 筆" })),
      rows.length ? h("ul.fix-list", null, rows)
        : h("p.muted", { text: "在「轉換」頁換過說法或改過發音之後，會記在這裡，以後自動套用。聲調的更正跟著那一句話，收藏句子就會留下來。" }));
  }

  // ---- backup -----------------------------------------------------------------------

  function saveFile(name, text) {
    var viaLink = function () {
      try {
        var url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
        var a = h("a", { href: url, download: name });
        root.document.body.appendChild(a);
        a.click();
        root.document.body.removeChild(a);
        root.setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      } catch (e) { U.toast("這裡不能存檔，請改用「複製備份」"); }
    };
    if (root.claude && typeof root.claude.use === "function") {
      root.claude.use("downloads").then(function (dl) {
        if (!dl) { U.toast("這裡不能存檔，請改用「複製備份」"); return; }
        dl.save({ filename: name, data: text }).then(function () { U.toast("已存檔"); }, function (e) {
          if (!e || e.code !== "declined") U.toast("存檔沒有成功，請改用「複製備份」");
        });
      });
      return;
    }
    viaLink();
  }

  function backupCard() {
    var status = store.cloud.status;
    var text = status === "synced" ? "已同步到你的 Claude 帳號：手機、平板開這個頁面，看到的是同一份生字簿。"
      : status === "syncing" ? "同步中…"
      : status === "error" ? store.cloud.error
      : "資料存在這台裝置的瀏覽器裡。清除瀏覽資料會一起清掉，建議偶爾備份。";
    var area = h("textarea.backup", { id: "backup-text", rows: "4", maxlength: String(store.LIMIT.backup), placeholder: "把備份的內容貼在這裡", "aria-label": "要匯入的備份內容" });
    area.value = backupDraft;      // this card is redrawn whenever the data changes; keep what was pasted
    area.addEventListener("input", function () { backupDraft = area.value; });
    return h("div.card", null,
      h("div.card-head", null, h("h2", { text: "資料與備份" })),
      store.storage.ok ? null : h("p.note.warn", { role: "alert", text: "這個瀏覽器不讓網頁存資料（可能是無痕模式，或空間已滿）。現在記的東西關掉頁面就會消失，請先按「複製備份」。" }),
      h("p.status", null, h("span.dot" + (status === "synced" ? ".on" : status === "error" ? ".err" : "")), text),
      h("div.row.wrap", null,
        h("button.btn", { type: "button", onclick: function () { U.copy(store.exportAll(), "備份"); } }, U.icon("copy"), "複製備份"),
        h("button.btn.ghost", { type: "button", onclick: function () { saveFile("taigi-backup-" + srs.dayKey().replace(/-/g, "") + ".json", store.exportAll()); } }, "存成檔案")),
      h("p.hint", { text: "備份包含生字簿、收藏的句子、更正和設定，不含辭典。" }),
      area,
      h("button.btn.ghost", { type: "button", onclick: function () {
        if (!area.value.trim()) { U.toast("先貼上備份內容"); return; }
        var text = area.value;
        backupDraft = "";          // importing redraws this card
        try { U.toast("已匯入 " + store.importAll(text) + " 筆"); }
        catch (e) { backupDraft = text; U.toast("沒有匯入：" + (e.message || "格式不對")); }
      } }, "匯入備份"));
  }

  // ---- widget -------------------------------------------------------------------------

  function widgetCard() {
    var words = store.listWords().filter(function (w) { return w.h && w.t; }).slice(0, 400)
      .map(function (w) { return { h: w.h, t: w.t, m: w.m || "" }; });
    return h("div.card", null,
      h("div.card-head", null, h("h2", { text: "iPhone／iPad 主畫面小工具" })),
      h("p", { text: "網頁本身沒辦法變成主畫面小工具，那是 App 才有的功能。免費的 Scriptable App 可以用一段程式做出小工具：每天換一個詞，顯示漢字、台羅、意思和例句，和這裡的「今日一詞」是同一個詞。" }),
      h("ol.steps", null,
        h("li", { text: "在 App Store 安裝 Scriptable。" }),
        h("li", { text: "按下面的「複製小工具程式」。" }),
        h("li", { text: "打開 Scriptable，按右上角的 ＋，把程式貼上；點最上面的名稱，改成「台語每日一詞」。" }),
        h("li", { text: "回主畫面，長按空白處 → 左上角的編輯／＋ → 找 Scriptable → 選大小 → 加入小工具。" }),
        h("li", { text: "長按剛加的小工具 → 編輯小工具 → Script 選「台語每日一詞」。" })),
      h("div.row.wrap", null,
        h("button.btn.primary", { type: "button", disabled: !widgetCode, onclick: function () { U.copy(widgetCode, "小工具程式"); } }, U.icon("copy"), widgetCode ? "複製小工具程式" : "程式載入中…"),
        h("button.btn.ghost", { type: "button", disabled: !words.length, onclick: function () {
          U.copy("TAIGI-NOTEBOOK:" + JSON.stringify(words), "生字簿（" + words.length + " 個詞）");
        } }, "複製生字簿給小工具")),
      h("p.hint", { text: "想讓小工具輪流出現你生字簿裡的詞：按「複製生字簿給小工具」，再到 Scriptable 裡點一下那支程式，選「從剪貼簿匯入生字簿」。生字簿有更新時再做一次。" }));
  }

  function aboutCard() {
    var m = D.meta || {};
    return h("div.card", null,
      h("div.card-head", null, h("h2", { text: "資料來源" })),
      h("p", null, "詞條、釋義、例句出自",
        h("a", { href: "https://sutian.moe.edu.tw/zh-hant/", target: "_blank", rel: "noopener" }, "教育部《臺灣台語常用詞辭典》"),
        "，依創用CC 姓名標示-禁止改作 3.0 臺灣授權使用，內容沒有改寫。" + (m.entries ? "收錄 " + m.entries + " 筆詞目、" + m.examples + " 句例句。" : "")),
      h("p", { text: "詞條和例句的錄音也是教育部的，為了能放上網站，轉成了較小的檔案（單聲道、32 kbps），聲音內容沒有改。" }),
      h("p", { text: "華語和台語的對應表、變調的標示、今日一詞的挑選、諺語搜尋用的同義詞和關鍵詞，是這個網站用辭典的釋義和例句自動整理、推算或另外撰寫的，不是辭典原有的內容，會有錯。諺語的「意思」搜尋找的是關鍵字和相近說法，不是真的理解語意。拿不準的地方以老師和辭典為準。" }),
      h("p.muted", { text: "這不是教育部的網站。" }));
  }

  function render() {
    if (!el) return;
    U.clear(el);
    U.add(el, [settingsCard(), fixesCard(), widgetCard(), backupCard(), aboutCard()]);
  }

  function loadWidget() {
    if (widgetCode || !root.fetch) return;
    root.fetch("widget/TaigiDaily.js").then(function (r) { return r.ok ? r.text() : ""; }).then(function (t) {
      widgetCode = t || "";
      render();
    }).catch(function () { /* the button stays disabled */ });
  }

  function mount(node) {
    el = node;
    render();
    loadWidget();
  }

  store.on(function () { render(); });

  TG.views = TG.views || {};
  TG.views.more = { mount: mount, onData: render };
})(window);

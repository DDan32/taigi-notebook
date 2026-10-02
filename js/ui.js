/* 共用的畫面元件：建立元素、提示訊息、底部面板、音節格、音高線。 */
(function (root) {
  "use strict";
  var TG = (root.TG = root.TG || {});
  var T = TG.tailo, S = TG.sandhi, D = TG.dict;
  var doc = root.document;

  // 屬性名稱一律是程式裡寫死的；這裡再擋一層，以後改程式時就算不小心把資料接進來，也不會變成事件屬性或腳本網址。
  var ATTR_OK = /^[a-z][a-z0-9-]*$/;
  var URL_ATTRS = { href: 1, src: 1, action: 1, formaction: 1 };
  function attrAllowed(k, v) {
    if (!ATTR_OK.test(k) || k === "style" || k === "srcdoc" || k.slice(0, 2) === "on") return false;
    if (URL_ATTRS[k] === 1 && !/^(https:\/\/|blob:|#|[^:]*$)/i.test(String(v).trim())) return false;
    return true;
  }

  /** h("button.btn", {onclick: fn, "aria-label": "…"}, "文字", child, …) */
  function h(spec, attrs) {
    var parts = spec.split(".");
    var el = doc.createElement(parts[0] || "div");
    if (parts.length > 1) el.className = parts.slice(1).join(" ");
    var start = 1;
    if (attrs && typeof attrs === "object" && !attrs.nodeType && !Array.isArray(attrs)) {
      start = 2;
      for (var k in attrs) {
        var v = attrs[k];
        if (v == null || v === false) continue;
        if (k.slice(0, 2) === "on") { if (typeof v === "function") el.addEventListener(k.slice(2), v); }
        else if (k === "text") el.textContent = v;
        else if (k === "value") el.value = v;
        else if (k === "checked" || k === "disabled" || k === "hidden" || k === "selected") el[k] = !!v;
        else if (attrAllowed(k, v)) el.setAttribute(k, v === true ? "" : v);
      }
      // 開新分頁的連結一律不帶來源網址、不給新分頁控制權
      if (el.getAttribute("target") === "_blank") el.setAttribute("rel", "noopener noreferrer");
    }
    for (var i = start; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }

  function add(el, child) {
    if (child == null || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { add(el, c); }); return; }
    el.appendChild(child.nodeType ? child : doc.createTextNode(String(child)));
  }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  function $(sel, scope) { return (scope || doc).querySelector(sel); }

  // ---- icons (24px, stroked) --------------------------------------------------

  var ICONS = {
    copy: "M9 9h10v11H9zM5 15V4h10",
    check: "M5 12.5l4.5 4.5L19 7.5",
    close: "M6 6l12 12M18 6L6 18",
    search: "M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13zM15.5 15.5L20 20",
    plus: "M12 5v14M5 12h14",
    trash: "M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v6M14 11v6",
    out: "M14 5h5v5M19 5l-8 8M11 6H5v13h13v-6",
    back: "M14 6l-6 6 6 6",
    left: "M14 6l-6 6 6 6",
    right: "M10 6l6 6-6 6",
    star: "M12 4l2.5 5.2 5.5.8-4 4 1 5.6-5-2.7-5 2.7 1-5.6-4-4 5.5-.8z",
    edit: "M5 19l1-4L16.5 4.5l3 3L9 18zM14 7l3 3",
    swap: "M7 7h11l-3-3M17 17H6l3 3",
    pen: "M4 20l1-5L16 4l4 4L9 19zM13.5 6.5l4 4",
    book: "M5 4h9a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4zM5 16a4 4 0 0 1 4-4h9",
    note: "M6 3h12v18H6zM9 8h6M9 12h6M9 16h3",
    cards: "M4 7h13v12H4zM7 7V4h13v12h-3",
    more: "M5 7h14M5 12h14M5 17h14",
    undo: "M8 5L4 9l4 4M4 9h10a5 5 0 0 1 0 10h-3"
  };

  function icon(name) {
    var svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "ic");
    svg.setAttribute("aria-hidden", "true");
    var p = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", ICONS[name] || "");
    svg.appendChild(p);
    return svg;
  }

  // ---- toast ----------------------------------------------------------------

  var toastTimer = 0;
  function toast(msg) {
    var el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    el.classList.add("show");
    root.clearTimeout(toastTimer);
    toastTimer = root.setTimeout(function () { el.classList.remove("show"); el.hidden = true; }, 2200);
  }

  /** Copy inside the click handler; falls back to a selected textarea when the browser refuses. */
  function copy(text, what) {
    var done = function () { toast((what || "內容") + "已複製"); };
    var fallback = function () {
      var ta = h("textarea.offscreen", { readonly: true });
      ta.value = text;
      doc.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = doc.execCommand("copy"); } catch (e) { ok = false; }
      doc.body.removeChild(ta);
      if (ok) done(); else toast("這個瀏覽器不讓網頁複製，請長按文字自行複製");
    };
    try {
      if (root.navigator.clipboard && root.navigator.clipboard.writeText) {
        root.navigator.clipboard.writeText(text).then(done, fallback);
        return;
      }
    } catch (e) { /* fall through */ }
    fallback();
  }

  function copyButton(getText, what, label) {
    return h("button.btn.ghost.sm", {
      type: "button", "aria-label": "複製" + (what || ""),
      onclick: function (ev) { ev.stopPropagation(); copy(typeof getText === "function" ? getText() : getText, what); }
    }, icon("copy"), label || "複製");
  }

  // ---- bottom sheet (a stack, so one sheet can open another) -------------------

  var stack = [];

  function sheetRoot() { return $("#sheet"); }

  function renderSheet() {
    var rootEl = sheetRoot();
    var top = stack[stack.length - 1];
    if (!top) {
      rootEl.hidden = true;
      doc.documentElement.classList.remove("sheet-open");
      return;
    }
    var panel = $(".sheet-panel", rootEl);
    clear(panel);
    add(panel, h("div.sheet-head", null,
      stack.length > 1 ? h("button.icon-btn", { type: "button", "aria-label": "返回", onclick: closeSheet }, icon("back")) : null,
      h("h2.sheet-title", { id: "sheet-title", text: top.title || "" }),
      h("button.icon-btn", { type: "button", "aria-label": "關閉", onclick: closeAll }, icon("close"))
    ));
    var body = h("div.sheet-body");
    add(body, top.render());
    add(panel, body);
    rootEl.hidden = false;
    doc.documentElement.classList.add("sheet-open");
    body.scrollTop = top.scroll || 0;
  }

  /** openSheet({ title, render: () => node, onClose }) */
  function openSheet(opts) {
    var top = stack[stack.length - 1];
    if (top) top.scroll = ($(".sheet-body", sheetRoot()) || {}).scrollTop || 0;
    stack.push(opts);
    renderSheet();
  }

  function closeSheet() {
    var top = stack.pop();
    if (top && top.onClose) top.onClose();
    renderSheet();
  }

  function closeAll() {
    while (stack.length) { var t = stack.pop(); if (t.onClose) t.onClose(); }
    renderSheet();
  }

  /** Re-render the open sheet in place (after its data changed). */
  function refreshSheet(title) {
    var top = stack[stack.length - 1];
    if (!top) return;
    if (title) top.title = title;
    top.scroll = ($(".sheet-body", sheetRoot()) || {}).scrollTop || 0;
    renderSheet();
  }

  function initSheet() {
    var rootEl = sheetRoot();
    rootEl.addEventListener("click", function (ev) { if (ev.target === rootEl) closeAll(); });
    doc.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && stack.length) closeSheet(); });
  }

  // ---- tones ------------------------------------------------------------------

  // 五度音高：[起點, 終點, 促聲]
  var CONTOUR = { 1: [5, 5], 2: [5, 2], 3: [2, 1], 4: [3, 2, 1], 5: [2, 4], 6: [3, 3], 7: [3, 3], 8: [4, 4, 1], 9: [3, 5] };
  var TONE_NAME = { 0: "輕聲", 1: "高平", 2: "高降", 3: "低降", 4: "中促", 5: "上升", 6: "中平", 7: "中平", 8: "高促", 9: "高升" };

  function contour(tone, cls) {
    var ns = "http://www.w3.org/2000/svg";
    var svg = doc.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 28 16");
    svg.setAttribute("class", "ct" + (cls ? " " + cls : ""));
    svg.setAttribute("aria-hidden", "true");
    var c = CONTOUR[tone];
    var y = function (lv) { return 14.5 - (lv - 1) * 3.25; };
    if (!c) {
      var dot = doc.createElementNS(ns, "circle");
      dot.setAttribute("cx", 14); dot.setAttribute("cy", y(2)); dot.setAttribute("r", 1.6);
      svg.appendChild(dot);
      return svg;
    }
    var x1 = c[2] ? 9 : 4, x2 = c[2] ? 19 : 24;
    var line = doc.createElementNS(ns, "path");
    line.setAttribute("d", "M" + x1 + " " + y(c[0]) + "L" + x2 + " " + y(c[1]));
    svg.appendChild(line);
    return svg;
  }

  /** "5›7" 或保留本調的 "5"；輕聲 "輕"。 */
  function toneLabel(s) {
    if (s.neutral) return h("span.tn", null, "輕");
    if (s.keep) return h("span.tn", null, h("b", { text: String(s.tone) }));
    return h("span.tn", null, String(s.tone), h("span.arrow", { text: "›" }), h("i", { text: String(s.sandhi) }));
  }

  // ---- the annotated line ---------------------------------------------------------

  /**
   * tokens: output of TG.convert.analyse().  opts: { segs, onPick(segIndex, wordIndex, sylIndex), caption, contour }
   */
  function renderLine(tokens, opts) {
    opts = opts || {};
    var line = h("div.line" + (opts.caption ? ".cap" : ""));
    var bySeg = [];
    tokens.forEach(function (t) {
      var last = bySeg[bySeg.length - 1];
      if (last && last.seg === t.seg && t.kind === "word" && last.kind === "word") last.words.push(t);
      else bySeg.push({ seg: t.seg, kind: t.kind, words: [t] });
    });
    bySeg.forEach(function (g) {
      if (g.kind === "punct") { add(line, h("span.punct", { text: g.words[0].text })); return; }
      var seg = opts.segs ? opts.segs[g.seg] : null;
      var cand = seg ? TG.convert.current(seg) : null;
      var hanji = g.words.map(function (w) { return w.hanji; }).join("");
      var box = h(opts.onPick ? "button.seg" : "span.seg", opts.onPick ? {
        type: "button",
        "aria-label": (seg && seg.src ? seg.src + "：" : "") + hanji + " " + g.words.map(function (w) { return w.tailo; }).join(" ") + "，點一下更正",
        onclick: function () { opts.onPick(g.seg); }
      } : null);
      if (opts.caption && seg && seg.src && seg.src !== hanji) add(box, h("span.seg-src", { text: seg.src }));
      else if (opts.caption) add(box, h("span.seg-src.same", { text: " " }));
      var row = h("span.syls" + (cand && (cand.guess || cand.unknown) ? ".guess" : "") + (cand && (cand.fixed || cand.custom) ? ".fixed" : ""));
      g.words.forEach(function (w, wi) {
        if (!w.syls || !w.syls.length) {
          add(row, h("span.syl.unknown" + (wi ? ".w-start" : ""), null,
            h("span.hj", { text: w.hanji || "?" }), h("span.tl", { text: "?" }), h("span.tn", { text: " " })));
          return;
        }
        w.syls.forEach(function (s, si) {
          var cls = s.neutral ? ".neutral" : s.keep ? ".keep" : ".chg";
          if (s.manual) cls += ".manual";
          if (si === 0 && wi > 0) cls += ".w-start";
          var hj = w.aligned ? s.hanji : si === 0 ? w.hanji : "";
          var cell = h("span.syl" + cls, null,
            h("span.hj", { lang: "nan-Hant", text: hj || " " }),
            h("span.tl", { text: (s.neutral && si === 0 ? "--" : "") + T.compose(s.base, s.tone) }),
            toneLabel(s),
            opts.contour === false ? null : contour(s.neutral ? 0 : s.actual));
          add(row, cell);
        });
      });
      add(box, row);
      add(line, box);
    });
    return line;
  }

  /** A plain (漢字, 台羅) pair analysed on the spot: dictionary examples, notebook words. */
  function analysePair(hanji, tailo, opts) {
    var segs;
    var words = T.tokenize(tailo).filter(function (t) { return t.kind === "word"; });
    var chars = Array.from(hanji).filter(function (ch) { return D.HAN_RE.test(ch); });
    var total = words.reduce(function (n, w) { return n + T.parseWord(w.text).length; }, 0);
    if (total === chars.length && total > 0) {
      // 例句：漢字與台羅一字一音，照台羅的分詞切漢字
      segs = [];
      var k = 0;
      var hi = 0;
      var hs = Array.from(hanji);
      T.tokenize(tailo).forEach(function (t) {
        if (t.kind === "punct") return;
        t.text.split(/(?=--)/).forEach(function (part) {
          if (!part) return;
          var n = T.parseWord(part).length;
          // carry the punctuation that sits between the characters
          while (hi < hs.length && !D.HAN_RE.test(hs[hi])) { segs.push({ kind: "punct", text: hs[hi] }); hi++; }
          var w = "";
          var got = 0;
          while (hi < hs.length && got < n) { if (D.HAN_RE.test(hs[hi])) got++; w += hs[hi]; hi++; }
          k += n;
          var e = D.findWord(w, part);
          segs.push({ kind: "seg", src: w, pick: 0, ov: {}, cands: [{ entry: e, hanji: w, tailo: part, sense: -1, src: 0, note: "" }] });
        });
      });
      while (hi < hs.length) { if (!D.HAN_RE.test(hs[hi])) segs.push({ kind: "punct", text: hs[hi] }); hi++; }
    } else {
      segs = TG.convert.fromTailo(tailo);
    }
    return { segs: segs, tokens: TG.convert.analyse(segs, opts) };
  }

  TG.ui = {
    h: h, add: add, clear: clear, $: $, icon: icon,
    toast: toast, copy: copy, copyButton: copyButton,
    openSheet: openSheet, closeSheet: closeSheet, closeAll: closeAll, refreshSheet: refreshSheet, initSheet: initSheet,
    contour: contour, toneLabel: toneLabel, TONE_NAME: TONE_NAME,
    renderLine: renderLine, analysePair: analysePair
  };
})(window);

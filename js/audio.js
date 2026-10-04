/* 發音：教育部辭典的錄音（詞目、例句），放在同一個 GitHub 帳號的 taigi-audio 網站。
 *
 *   TG.audio.word(entryId)            詞目的音檔網址，沒有錄音就是 null
 *   TG.audio.example(entryId, "3-1")  例句的音檔網址（"義項-序號"，來自 data/examples.json）
 *   TG.audio.play(url, button)        播放；再按一次同一個鈕就停止
 *
 * 網址只用驗證過的數字拼出來，網址的開頭固定（同一個網域，所以內容安全政策的 media-src 'self' 就夠）。
 * 在別的環境（例如 Claude 的 Artifact）沒有這批音檔，base 是 null，所有播放鈕都不會出現。
 */
(function (root) {
  "use strict";
  var TG = (root.TG = root.TG || {});
  var D = TG.dict || (typeof require !== "undefined" ? require("./dict.js").dict : null);

  /** 音檔網站的位置：GitHub Pages 上是同一帳號的 /taigi-audio/；本機測試用旁邊的 audio/；其他地方沒有。 */
  function baseUrl(loc) {
    if (!loc) return null;
    // exactly <account>.github.io: one label in front, letters, digits and hyphens only
    if (/^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.github\.io$/i.test(loc.hostname)) return "https://" + loc.hostname.toLowerCase() + "/taigi-audio/";
    if (loc.hostname === "localhost" || loc.hostname === "127.0.0.1") return "audio/";
    return null;
  }

  var A = { base: baseUrl(root.location), bits: null, current: null };
  var EX = /^\d{1,3}-\d{1,3}$/;

  function loadBits() {
    if (A.bits || !D.audio || typeof D.audio.w !== "string") return A.bits;
    try {
      var raw = typeof atob === "function" ? atob(D.audio.w) : Buffer.from(D.audio.w, "base64").toString("binary");
      var bytes = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      A.bits = bytes;
    } catch (e) { A.bits = null; }
    return A.bits;
  }

  function hasWord(id) {
    var bits = loadBits();
    return !!bits && Number.isInteger(id) && id >= 0 && (id >> 3) < bits.length && (bits[id >> 3] & (1 << (id & 7))) !== 0;
  }

  A.available = function () { return !!A.base; };

  A.word = function (id) {
    return A.base && hasWord(id) ? A.base + "w/" + Math.floor(id / 1000) + "/" + id + ".mp3" : null;
  };

  A.example = function (id, suffix) {
    if (!A.base || !Number.isInteger(id) || id < 0 || typeof suffix !== "string" || !EX.test(suffix)) return null;
    return A.base + "s/" + Math.floor(id / 1000) + "/" + id + "-" + suffix + ".mp3";
  };

  /** 播放這個網址。button（可省略）會在載入和播放時加上 busy／playing，讓人看得到。 */
  A.play = function (url, button, onFail) {
    if (!url || typeof Audio === "undefined") return;
    var cur = A.current;
    if (cur) {
      A.current = null;
      cur.el.pause();
      cur.done();
      if (cur.url === url) return;                       // the same button again: stop
    }
    var el = new Audio();
    var state = { el: el, url: url, done: function () { if (button) { button.classList.remove("busy"); button.classList.remove("playing"); button.setAttribute("aria-pressed", "false"); } } };
    A.current = state;
    if (button) { button.classList.add("busy"); button.setAttribute("aria-pressed", "true"); }
    el.addEventListener("playing", function () { if (button) { button.classList.remove("busy"); button.classList.add("playing"); } });
    el.addEventListener("ended", function () { if (A.current === state) A.current = null; state.done(); });
    el.addEventListener("error", function () { if (A.current === state) A.current = null; state.done(); if (onFail) onFail(); });
    el.preload = "auto";
    el.src = url;
    var p = el.play();                                   // must be called from the tap itself (iPhone Safari)
    if (p && p.catch) p.catch(function (e) { if (e && e.name !== "AbortError") { if (A.current === state) A.current = null; state.done(); if (onFail) onFail(); } });
  };

  A.stop = function () {
    var cur = A.current;
    if (cur) { A.current = null; cur.el.pause(); cur.done(); }
  };

  A.baseUrl = baseUrl;
  TG.audio = A;
  if (typeof module !== "undefined" && module.exports) module.exports = TG;
})(typeof window !== "undefined" ? window : globalThis);

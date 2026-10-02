/* 防點擊劫持：別人把這個網站塞進自己網頁的 <iframe>，再蓋上假按鈕騙你點。
 *
 * GitHub Pages 沒辦法設定 X-Frame-Options 或 CSP 的 frame-ancestors（那兩個只能用 HTTP 標頭），
 * 所以改在頁面裡自己擋：發現自己被嵌在別的頁面裡，就整頁隱藏（樣式表裡有
 * html.framed body { display: none }），並試著跳出去。對方用 sandbox 擋住跳出時，頁面仍是空白的。
 */
(function () {
  "use strict";
  if (window.top === window.self) return;
  document.documentElement.className += " framed";
  try { window.top.location.replace(window.self.location.href); } catch (e) { /* 被擋住就維持隱藏 */ }
})();

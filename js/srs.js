/* 每日複習的排程，以及「今日一詞」。
 *
 * 生詞有 0–7 級，每級隔的天數是 0、1、2、4、8、16、32、64。
 * 記得 → 升一級；模糊 → 留在原級、明天再看；忘記 → 回到 0 級、今天再看一次。
 */
(function (root) {
  "use strict";
  var TG = (root.TG = root.TG || {});
  var INTERVALS = [0, 1, 2, 4, 8, 16, 32, 64];
  var EPOCH = Date.UTC(2024, 0, 1);

  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  /** 當地日期 YYYY-MM-DD。 */
  function dayKey(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function addDays(key, n) {
    var p = key.split("-");
    var d = new Date(+p[0], +p[1] - 1, +p[2] + n);
    return dayKey(d);
  }

  /** 從 2024-01-01 起算的第幾天（當地日期）；網站和小工具用同一個算法，所以同一天會是同一個詞。 */
  function dayNumber(d) {
    d = d || new Date();
    return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EPOCH) / 86400000);
  }

  function dailyIndex(count, d) {
    if (!count) return -1;
    var n = dayNumber(d) % count;
    return n < 0 ? n + count : n;
  }

  function isDue(word, today) {
    return !word.due || word.due <= (today || dayKey());
  }

  function dueWords(words, today) {
    today = today || dayKey();
    return words.filter(function (w) { return isDue(w, today); })
      .sort(function (a, b) { return (a.due || "") < (b.due || "") ? -1 : (a.due || "") > (b.due || "") ? 1 : a.c - b.c; });
  }

  /** grade: "again" | "hard" | "good" -> 要寫回生詞的欄位。 */
  function schedule(word, grade, today) {
    today = today || dayKey();
    var lv = word.lv || 0;
    if (grade === "good") lv = Math.min(lv + 1, INTERVALS.length - 1);
    else if (grade === "again") lv = 0;
    var days = grade === "again" ? 0 : grade === "hard" ? 1 : INTERVALS[lv];
    return { lv: lv, due: addDays(today, days), seen: (word.seen || 0) + 1 };
  }

  /** 連續天數：今天第一次複習時更新。 */
  function touchStreak(meta, today) {
    today = today || dayKey();
    if (meta.lastDay === today) return { done: (meta.doneDay === today ? meta.done || 0 : 0) + 1, doneDay: today };
    var streak = meta.lastDay === addDays(today, -1) ? (meta.streak || 0) + 1 : 1;
    return { streak: streak, lastDay: today, doneDay: today, done: 1 };
  }

  TG.srs = {
    INTERVALS: INTERVALS,
    dayKey: dayKey,
    addDays: addDays,
    dayNumber: dayNumber,
    dailyIndex: dailyIndex,
    isDue: isDue,
    dueWords: dueWords,
    schedule: schedule,
    touchStreak: touchStreak
  };

  if (typeof module !== "undefined" && module.exports) module.exports = TG;
})(typeof window !== "undefined" ? window : globalThis);

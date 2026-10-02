// 台語每日一詞 — Scriptable 小工具
//
// 每天換一個詞：漢字、台羅、本調與變調後的數字調、意思、例句。
// 點小工具會打開教育部辭典的那個詞條（可以聽發音）。
//
// 詞條、釋義、例句：教育部《臺灣台語常用詞辭典》https://sutian.moe.edu.tw/
// 創用CC 姓名標示-禁止改作 3.0 臺灣。變調後的讀音是依規則推算的。
// 資料日期 /*__BUILT__*/
//
// 用法：
//   1. 在 Scriptable 新增一支程式，把這整份貼上，名稱取「台語每日一詞」。
//   2. 主畫面加入 Scriptable 小工具，長按 → 編輯小工具 → Script 選這支程式。
//   3. 想改成顯示自己生字簿裡的詞：在網站「更多」按「複製生字簿給小工具」，
//      回 Scriptable 點這支程式 → 「從剪貼簿匯入生字簿」。
//      小工具的 Parameter 填 notebook 就只顯示生字簿的詞；不填則顯示辭典的每日一詞，
//      中、大尺寸另外附一個生字簿的詞。

// 第 5 聲變調後讀第 7 聲（高雄、臺南等）或第 3 聲（臺北等偏泉腔）
const TONE5_BECOMES = 7;

// [詞目id, 漢字, 台羅, 數字調, 詞性, 釋義, 例句漢字, 例句台羅, 例句華語]
const WORDS = /*__WORDS__*/[];

const NOTEBOOK_FILE = "taigi-notebook.json";
const NOTEBOOK_PREFIX = "TAIGI-NOTEBOOK:";

// ---- 日期 → 第幾個詞（和網站的「今日一詞」同一個算法） ----

function dayNumber(d) {
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(2024, 0, 1)) / 86400000);
}

function pick(list, d, salt) {
  if (!list.length) return null;
  const n = (dayNumber(d) + (salt || 0)) % list.length;
  return list[n < 0 ? n + list.length : n];
}

// ---- 單獨一個詞的變調：最後一個音節讀本調，前面的變調 ----

function sandhi(tone, stop, beforeA) {
  if (beforeA) {
    return { 1: 7, 2: 1, 3: 1, 4: stop === "h" ? 1 : 8, 5: 7, 7: 7, 8: stop === "h" ? 7 : 4 }[tone] || tone;
  }
  return { 1: 7, 2: 1, 3: 2, 4: stop === "h" ? 2 : 8, 5: TONE5_BECOMES, 7: 3, 8: stop === "h" ? 3 : 4 }[tone] || tone;
}

/** "kin1-a2-jit8" → "kin7-a1-jit8"；空白分開的每個詞各自算；"--" 之後是輕聲。 */
function spoken(numeric) {
  return numeric.split(" ").map((word) => {
    const parts = word.split(/(--|-)/);            // syllable, separator, syllable …
    const syl = [];
    let neutral = false;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p === "--") { neutral = true; continue; }
      if (p === "-" || p === "") continue;
      const m = p.match(/^(.*?)([1-9])$/);
      if (!m) { syl.push({ text: p, raw: true, neutral }); continue; }
      const base = m[1];
      const low = base.toLowerCase();
      syl.push({ base, tone: +m[2], stop: /[ptkh]$/.test(low) && low.length > 1 ? low.slice(-1) : "", neutral });
    }
    let last = -1;
    syl.forEach((s, i) => { if (!s.neutral && !s.raw) last = i; });
    let out = "";
    syl.forEach((s, i) => {
      let text;
      if (s.raw) text = s.text;
      else if (s.neutral) text = s.base + "0";
      else {
        const next = syl[i + 1];
        const keep = i === last || (next && next.neutral);
        const beforeA = next && !next.neutral && !next.raw && next.base.toLowerCase() === "a" && next.tone === 2;
        text = s.base + (keep ? s.tone : sandhi(s.tone, s.stop, beforeA));
      }
      const sep = i === 0 ? (s.neutral ? "--" : "") : (s.neutral && !syl[i - 1].neutral ? "--" : "-");
      out += sep + text;
    });
    return out;
  }).join(" ");
}

// ---- 生字簿（存在 Scriptable 自己的資料夾） ----

function notebookPath() {
  const fm = FileManager.local();
  return fm.joinPath(fm.documentsDirectory(), NOTEBOOK_FILE);
}

// 剪貼簿和檔案裡的東西不一定是自己放的：只收字串，限制長度和數量，其餘丟掉。
const MAX_WORDS = 400;
const MAX_CLIPBOARD = 200000;

function clip(v, n) {
  return typeof v === "string" ? v.slice(0, n) : "";
}

function cleanList(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (let i = 0; i < list.length && out.length < MAX_WORDS; i++) {
    const w = list[i];
    if (!w || typeof w !== "object") continue;
    const h = clip(w.h, 60), t = clip(w.t, 120);
    if (h && t) out.push({ h: h, t: t, m: clip(w.m, 120) });
  }
  return out;
}

function loadNotebook() {
  try {
    const fm = FileManager.local();
    const p = notebookPath();
    if (!fm.fileExists(p)) return [];
    return cleanList(JSON.parse(fm.readString(p)));
  } catch (e) {
    return [];
  }
}

function importNotebook() {
  const text = (Pasteboard.paste() || "").trim();
  if (text.length > MAX_CLIPBOARD || text.indexOf(NOTEBOOK_PREFIX) !== 0) return -1;
  const list = cleanList(JSON.parse(text.slice(NOTEBOOK_PREFIX.length)));
  if (!list.length) return -1;
  FileManager.local().writeString(notebookPath(), JSON.stringify(list));
  return list.length;
}

// ---- 畫面 ----

const C = {
  paper: Color.dynamic(new Color("#F6FAF3"), new Color("#13201A")),
  ink: Color.dynamic(new Color("#1C2A30"), new Color("#EEF3EC")),
  soft: Color.dynamic(new Color("#586970"), new Color("#A3B4AA")),
  blue: Color.dynamic(new Color("#1B52A4"), new Color("#A3C8FF")),
  red: Color.dynamic(new Color("#CF3324"), new Color("#FF9787")),
  green: Color.dynamic(new Color("#256F45"), new Color("#86D3A3")),
};

function text(parent, str, font, color, lines) {
  const t = parent.addText(str);
  t.font = font;
  t.textColor = color;
  if (lines) t.lineLimit = lines;
  t.minimumScaleFactor = 0.6;
  return t;
}

function fromDictionary(row) {
  return {
    id: row[0], hanji: row[1], tailo: row[2], numeric: row[3], pos: row[4], meaning: row[5],
    exHanji: row[6], exTailo: row[7], exHuayu: row[8], label: "今日一詞",
  };
}

function fromNotebook(w) {
  return { id: 0, hanji: w.h, tailo: w.t, numeric: "", pos: "", meaning: w.m || "", exHanji: "", exTailo: "", exHuayu: "", label: "生字簿" };
}

function tonesLine(word) {
  if (!word.numeric) return "";
  const after = spoken(word.numeric);
  return after === word.numeric ? word.numeric : word.numeric + "  →  " + after;
}

function buildWidget(family, word, extra) {
  const w = new ListWidget();
  w.backgroundColor = C.paper;
  if (word.id) w.url = "https://sutian.moe.edu.tw/zh-hant/su/" + word.id + "/";
  const tomorrow = new Date();
  tomorrow.setHours(24, 5, 0, 0);
  w.refreshAfterDate = tomorrow;

  if (family === "accessoryInline") {
    text(w, word.hanji + " " + word.tailo, Font.systemFont(14), C.ink, 1);
    return w;
  }
  if (family === "accessoryRectangular" || family === "accessoryCircular") {
    text(w, word.hanji, Font.boldSystemFont(18), C.ink, 1);
    text(w, word.tailo, Font.systemFont(13), C.ink, 1);
    if (family === "accessoryRectangular" && word.meaning) text(w, word.meaning, Font.systemFont(11), C.ink, 1);
    return w;
  }

  const small = family === "small";
  const large = family === "large" || family === "extraLarge";
  w.setPadding(14, 16, 14, 16);

  const head = w.addStack();
  head.layoutHorizontally();
  text(head, word.label, Font.mediumSystemFont(11), C.green, 1);
  head.addSpacer();
  const d = new Date();
  text(head, (d.getMonth() + 1) + "/" + d.getDate(), Font.systemFont(11), C.soft, 1);
  w.addSpacer(small ? 4 : 6);

  text(w, word.hanji, Font.boldSystemFont(small ? 30 : 36), C.ink, 1);
  text(w, word.tailo, Font.mediumSystemFont(small ? 16 : 19), C.blue, 1);
  const tones = tonesLine(word);
  if (tones && !small) text(w, tones, Font.regularMonospacedSystemFont(12), C.red, 1);
  w.addSpacer(small ? 4 : 6);
  if (word.meaning) {
    text(w, (word.pos ? "〔" + word.pos + "〕" : "") + word.meaning, Font.systemFont(small ? 12 : 14), C.ink, small ? 2 : large ? 3 : 2);
  }

  if (!small && word.exHanji) {
    w.addSpacer(6);
    text(w, word.exHanji, Font.systemFont(13), C.ink, large ? 2 : 1);
    if (large) {
      text(w, word.exTailo, Font.systemFont(12), C.blue, 2);
      text(w, word.exHuayu, Font.systemFont(12), C.soft, 2);
    }
  }
  if (large && extra) {
    w.addSpacer(10);
    text(w, "生字簿", Font.mediumSystemFont(11), C.green, 1);
    text(w, extra.hanji + "  " + extra.tailo, Font.mediumSystemFont(17), C.ink, 1);
    if (extra.meaning) text(w, extra.meaning, Font.systemFont(12), C.soft, 2);
  }
  w.addSpacer();
  return w;
}

function todaysWords() {
  const now = new Date();
  const notebook = loadNotebook();
  const onlyNotebook = String(args.widgetParameter || "").trim().toLowerCase() === "notebook";
  const mine = notebook.length ? fromNotebook(pick(notebook, now, 0)) : null;
  const row = pick(WORDS, now, 0);
  const daily = row ? fromDictionary(row) : null;
  if (onlyNotebook && mine) return { word: mine, extra: null };
  return { word: daily || mine, extra: mine };
}

async function menu() {
  const notebook = loadNotebook();
  const a = new Alert();
  a.title = "台語每日一詞";
  a.message = "生字簿：" + (notebook.length ? notebook.length + " 個詞" : "還沒匯入");
  a.addAction("預覽：小");
  a.addAction("預覽：中");
  a.addAction("預覽：大");
  a.addAction("從剪貼簿匯入生字簿");
  if (notebook.length) a.addDestructiveAction("清除小工具裡的生字簿");
  a.addCancelAction("取消");
  const i = await a.presentSheet();
  if (i < 0) return;
  if (i <= 2) {
    const family = ["small", "medium", "large"][i];
    const t = todaysWords();
    const w = buildWidget(family, t.word, t.extra);
    if (i === 0) await w.presentSmall(); else if (i === 1) await w.presentMedium(); else await w.presentLarge();
    return;
  }
  const done = new Alert();
  if (i === 3) {
    let n = -1;
    try { n = importNotebook(); } catch (e) { n = -1; }
    done.title = n >= 0 ? "已匯入 " + n + " 個詞" : "剪貼簿裡沒有生字簿";
    done.message = n >= 0 ? "小工具下次更新時會用到。" : "先到網站的「更多」按「複製生字簿給小工具」，再回來按一次。";
  } else {
    const fm = FileManager.local();
    if (fm.fileExists(notebookPath())) fm.remove(notebookPath());
    done.title = "已清除";
  }
  done.addAction("好");
  await done.presentAlert();
}

if (config.runsInWidget || config.runsInAccessoryWidget) {
  const t = todaysWords();
  if (t.word) Script.setWidget(buildWidget(config.widgetFamily, t.word, t.extra));
} else {
  await menu();
}
Script.complete();

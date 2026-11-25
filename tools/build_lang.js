/* 產生 data/lang.json：轉換頁判斷「輸入的是華語還是台語漢字」用的字頻模型。
 *
 *   node tools/build_lang.js            寫出 data/lang.json
 *   node tools/build_lang.js --eval     先用八成例句訓練、兩成測試，印出準確率（不寫檔）
 *
 * 訓練資料是 data/examples.json 的每一句：台語漢字原文算台語，華語翻譯算華語。
 * 特徵和網頁用同一個函式（TG.convert.langFeatures）：單字、相鄰兩字、句尾字。
 * 權重是兩邊出現頻率的對數比（加 K 平滑），只留下出現夠多、差距夠大的特徵。
 */
const fs = require("fs");
const path = require("path");
const TG = require("../tests/load.js");
const C = TG.convert;

const K = 0.5;        // 平滑
const MIN_COUNT = 5;  // 兩邊合計至少出現幾次
const MIN_WEIGHT = 1.2;

const root = path.join(__dirname, "..");
const rows = JSON.parse(fs.readFileSync(path.join(root, "data", "examples.json"), "utf8")).filter((r) => r[0] && r[2]);

function train(list) {
  const tg = new Map(), hy = new Map();
  let nT = 0, nH = 0;
  for (const r of list) {
    for (const f of C.langFeatures(r[0])) { tg.set(f, (tg.get(f) || 0) + 1); nT++; }
    for (const f of C.langFeatures(r[2])) { hy.set(f, (hy.get(f) || 0) + 1); nH++; }
  }
  const keys = new Set([...tg.keys(), ...hy.keys()]);
  const V = keys.size;
  const w = {};
  for (const k of [...keys].sort()) {
    const a = tg.get(k) || 0, b = hy.get(k) || 0;
    if (a + b < MIN_COUNT) continue;
    const v = Math.log((a + K) / (nT + K * V)) - Math.log((b + K) / (nH + K * V));
    if (Math.abs(v) >= MIN_WEIGHT) w[k] = Math.round(v * 10) / 10;
  }
  return w;
}

if (process.argv.includes("--eval")) {
  const test = rows.filter((r, i) => i % 5 === 0);
  const old = TG.dict.lang;
  TG.dict.set("lang", train(rows.filter((r, i) => i % 5 !== 0)));
  const han = (s) => Array.from(s).filter((c) => /[〇㐀-鿿豈-﫿]|[\ud840-\ud88f][\udc00-\udfff]/u.test(c)).length;
  const bins = {};
  for (const r of test) {
    for (const [s, want] of [[r[0], "taigi"], [r[2], "huayu"]]) {
      const b = (han(s) >= 5 ? "5 字以上" : "4 字以下") + " " + want;
      bins[b] = bins[b] || [0, 0];
      bins[b][0]++;
      if (C.detectMode(s) === want) bins[b][1]++;
    }
  }
  for (const b of Object.keys(bins).sort()) console.log(b.padEnd(14), String(bins[b][0]).padStart(5), (100 * bins[b][1] / bins[b][0]).toFixed(1) + "%");
  TG.dict.set("lang", old);
} else {
  const w = train(rows);
  const out = { v: 1, note: "華語／台語判斷用的字頻對數比；由 tools/build_lang.js 從 data/examples.json 產生", w };
  fs.writeFileSync(path.join(root, "data", "lang.json"), JSON.stringify(out));
  console.log("data/lang.json", Object.keys(w).length, "features", (fs.statSync(path.join(root, "data", "lang.json")).size / 1024).toFixed(0) + " KB");
}

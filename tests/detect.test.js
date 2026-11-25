/* 自動判斷輸入的種類，和單一個詞的另一種讀法、單字諺語搜尋。 */
const fs = require("fs");
const path = require("path");
const TG = require("./load.js");
const C = TG.convert, D = TG.dict;

let fail = 0, n = 0;
function check(ok, msg) { n++; if (!ok) { fail++; console.log("FAIL " + msg); } }

check(!!D.lang, "data/lang.json is loaded (node tools/build_lang.js)");

// sentences without any of the old marker characters (欲、佇、咧…): the old check called all of these 華語
const taigi = [
  "伊一面做工，一面讀冊。", "做牛著拖，做人著磨。", "你才食一點仔物件哪會飽？", "這間店的物件真俗。",
  "伊講伊明仔載欲來。", "我今仔日真忝。", "阿公閣咧睏。", "囡仔人有耳無喙。", "伊逐工都足早起來。",
  "這款代誌你免煩惱。", "外口咧落雨，你愛紮雨傘。", "我昨昏去市場買菜。",
];
const huayu = [
  "我今天要去學校上課。", "你吃飽了嗎？", "這個多少錢？", "我很喜歡吃台灣菜。", "他正在睡覺。",
  "明天會下雨，記得帶傘。", "我們一起去公園散步吧。", "請問廁所在哪裡？", "這件事情你不用擔心。",
  "我是高雄人。", "他不甘心輸給對手。", "經濟狀況不太好。",
];
taigi.forEach((s) => check(C.detectMode(s) === "taigi", `should be 台語: ${s} (score ${C.langScore(s).toFixed(1)})`));
huayu.forEach((s) => check(C.detectMode(s) === "huayu", `should be 華語: ${s} (score ${C.langScore(s).toFixed(1)})`));
for (const s of ["gua2 beh4 khi3", "Lí tsia̍h-pá--buē?", "tsia̍h"]) check(C.detectMode(s) === "tailo", `should be 台羅: ${s}`);

// one word: the dictionary decides when it can
for (const [w, want] of [["睏", "taigi"], ["媠", "taigi"], ["食", "taigi"], ["讀冊", "taigi"], ["吃", "huayu"], ["漂亮", "huayu"]]) {
  check(C.detectMode(w) === want, `word ${w} should be ${want}, got ${C.detectMode(w)}`);
}

// the other reading of a single word
const alt = (w) => { const m = C.detectMode(w); const o = C.otherReading(w, m); return o ? o.cand.hanji + " " + o.cand.tailo : ""; };
check(alt("走") === "走 tsáu", "走 as 華語 (行) also offers 台語 走 tsáu, got " + alt("走"));
check(alt("便宜").startsWith("便宜 pân-gî"), "便宜 also offers 台語 便宜 pân-gî, got " + alt("便宜"));
for (const w of ["學校", "食", "睏", "看", "我今天要去學校上課。"]) check(alt(w) === "", `no other reading for ${w}, got ${alt(w)}`);

// proverbs: one character is enough to find the ones written with it
TG.dict.set("proverbKw", JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "proverb_kw.json"), "utf8")));
require("../js/proverb.js");
TG.proverb.init();
for (const w of ["食", "錢", "狗", "雨"]) {
  const hits = TG.proverb.search(w, 50).filter((r) => r.why === "text");
  check(hits.length >= 3 && hits.slice(0, 3).every((r) => r.doc.hanji.includes(w)), `proverbs with ${w}: ${hits.length}`);
}

if (fail) { console.log(fail + " failed"); process.exit(1); }
console.log(`detect ok (${n} checks)`);

/* End-to-end checks with the real data: 華語 / 台語漢字 / 台羅 in, annotated sentence out. */
const TG = require("./load.js");
const { convert: C, sandhi: S } = TG;

function run(text, mode, fix) {
  const r = C.convert(text, mode || "auto", fix || null);
  const tokens = C.analyse(r.segs, { t5: 7 }, r.mode);
  return { mode: r.mode, segs: r.segs, hanji: S.formatHanji(tokens), tailo: S.format(tokens, "tailo"), actual: S.format(tokens, "actual"), tokens };
}

const cases = [
  ["我今天要去學校上課。", "huayu", "我今仔日欲去學校上課。", "Guá kin-á-ji̍t beh khì ha̍k-hāu siōng-khò.", "gua1 kin7-a1-jit8 beh2 khi2 hak4-hau7 siong3-kho3."],
  ["你吃飽了嗎？", "huayu", "你食飽未？", "Lí tsia̍h-pá--buē?", "li1 tsiah3-pa2--bue0?"],
  ["這個多少錢？", "huayu", "這个偌濟錢？", "Tsit ê guā-tsē tsînn?", "tsit8 e7 gua3-tse3 tsinn5?"],
  ["這本書是我的。", "huayu", "這本冊是我的。", "Tsit pún tsheh sī guá--ê.", "tsit8 pun1 tsheh4 si3 gua2--e0."],
  ["伊欲去佗位？", "taigi", "伊欲去佗位？", "I beh khì tó-uī?", "i7 beh2 khi2 to1-ui7?"],
  ["gua2 beh4 khi3 tai5-pak4", "tailo", "我欲去臺北", "Guá beh khì Tâi-pak", "gua1 beh2 khi2 Tai7-pak4"],
  ["Lí tsia̍h-pá--buē?", "tailo", "你食飽未?", "Lí tsia̍h-pá--buē?", "li1 tsiah3-pa2--bue0?"],
  ["gua2 e5 tsheh4", "tailo", "我的冊", "Guá ê tsheh", "gua1 e7 tsheh4"],
  ["我是高雄人。", "huayu", "我是高雄人。", "Guá sī Ko-hiông lâng.", "gua1 si3 Ko7-hiong7 lang5."],
  ["有人說他很忙。", "huayu", "有人講伊真無閒。", "Ū lâng kóng i tsin bô-îng.", "u3 lang7 kong1 i7 tsin7 bo7-ing5."],
];
let fail = 0;
for (const [src, mode, hanji, tailo, actual] of cases) {
  const r = run(src);
  if (r.mode !== mode || r.hanji !== hanji || r.tailo !== tailo || r.actual !== actual) {
    fail++;
    console.log(`FAIL ${src}\n   got  [${r.mode}] ${r.hanji} | ${r.tailo} | ${r.actual}\n   want [${mode}] ${hanji} | ${tailo} | ${actual}`);
  }
}

// a saved word choice wins; a saved reading replaces the dictionary's
let r = run("我喜歡你。", "huayu", { word: { "喜歡": { h: "愛", t: "ài" } }, read: {} });
if (r.hanji !== "我愛你。") { fail++; console.log("FAIL fix.word:", r.hanji); }
r = run("我喜歡你。", "huayu", { word: { "喜歡": { h: "合意", t: "kah-ì" } }, read: {} });
if (r.hanji !== "我合意你。") { fail++; console.log("FAIL fix.word custom:", r.hanji); }
r = run("學校", "huayu", { word: {}, read: { "學校": "ha̍k-hàu" } });
if (r.tailo !== "Ha̍k-hàu") { fail++; console.log("FAIL fix.read:", r.tailo); }

// a manual tone correction on one syllable
r = C.convert("學校真大。", "huayu", null);
r.segs[0].ov = { 0: { 1: "sandhi" } };
let tokens = C.analyse(r.segs, { t5: 7 }, r.mode);
if (S.format(tokens, "actual") !== "hak4-hau3 tsin7 tua7.") { fail++; console.log("FAIL override:", S.format(tokens, "actual")); }

// things without a reading stay visible instead of vanishing
r = run("我買2件T-shirt。");
if (!/2/.test(r.tailo) || !/T-shirt/.test(r.tailo)) { fail++; console.log("FAIL passthrough:", r.tailo); }

// dictionary search by romanization: tone marks, digits, no tones
const D = TG.dict;
const first = (q) => { const x = D.search(q, 5)[0]; return x ? x.entry.hanji : ""; };
for (const [q, want] of [["gau5", "𠢕"], ["gâu", "𠢕"], ["siann2-mih4", "啥物"], ["siann mih", "啥物"], ["tsia̍h", "食"], ["漂亮", "媠"], ["媠", "媠"]]) {
  if (first(q) !== want) { fail++; console.log(`FAIL search ${q}: got ${first(q)}, want ${want}`); }
}
console.log(fail ? `${fail} failed` : `convert ok (${cases.length + 12} checks)`);
process.exit(fail ? 1 : 0);

/* Sandhi engine: sentences whose tone groups are well established. */
const TG = require("../js/tailo.js");
require("../js/sandhi.js");
const S = TG.sandhi;

const W = (hanji, tailo, pos) => ({ kind: "word", hanji, tailo, pos });
const P = (text) => ({ kind: "punct", text });

// [name, tokens, expected actual reading (numeric), expected kept syllables (漢字)]
const cases = [
  ["我欲去台北", [W("我", "guá", "代詞"), W("欲", "beh", "助動詞"), W("去", "khì", "動詞"), W("台北", "Tâi-pak", "名詞"), P("。")],
    "gua1 beh2 khi2 Tai7-pak4.", "北"],
  ["伊是學生", [W("伊", "i", "代詞"), W("是", "sī", "動詞"), W("學生", "ha̍k-sing", "名詞"), P("。")],
    "i7 si3 hak4-sing1.", "生"],
  ["今仔日天氣真好", [W("今仔日", "kin-á-ji̍t", "時間詞"), W("天氣", "thinn-khì", "名詞"), W("真", "tsin", "副詞"), W("好", "hó", "形容詞"), P("。")],
    "kin7-a1-jit8 thinn7-khi3 tsin7 ho2.", "日氣好"],
  ["阮阿母咧煮飯", [W("阮", "guán", "代詞"), W("阿母", "a-bú", "名詞"), W("咧", "teh", "助詞"), W("煮飯", "tsú-pn̄g", "動詞")],
    "guan1 a7-bu2 teh2 tsu1-png7", "母飯"],
  ["這本冊是我的", [W("這", "tsit", "代詞"), W("本", "pún", "量詞"), W("冊", "tsheh", "名詞"), W("是", "sī", "動詞"), W("我", "guá", "代詞"), W("的", "--ê", "助詞"), P("。")],
    "tsit8 pun1 tsheh4 si3 gua2--e0.", "冊我"],
  ["你食飽未", [W("你", "lí", "代詞"), W("食飽", "tsia̍h-pá", "動詞"), W("未", "--buē", "助詞"), P("？")],
    "li1 tsiah3-pa2--bue0?", "飽"],
  ["我的冊", [W("我", "guá", "代詞"), W("的", "ê", "助詞"), W("冊", "tsheh", "名詞")],
    "gua1 e7 tsheh4", "冊"],
  ["阿明的厝", [W("阿明", "A-bîng", "名詞"), W("的", "ê", "助詞"), W("厝", "tshù", "名詞")],
    "A7-bing5 e7 tshu3", "明厝"],
  ["媠的衫", [W("媠", "suí", "形容詞"), W("的", "ê", "助詞"), W("衫", "sann", "名詞")],
    "sui2 e7 sann1", "媠衫"],
  ["囡仔", [W("囡仔", "gín-á", "名詞")], "gin1-a2", "仔"],
  ["桌仔頂有冊", [W("桌仔", "toh-á", "名詞"), W("頂", "tíng", "形容詞"), W("有", "ū", "動詞"), W("冊", "tsheh", "名詞")],
    "toh1-a1 ting2 u3 tsheh4", "頂冊"],
  ["店仔 帽仔 葉仔 竹仔 賊仔 魚仔", [W("店仔", "tiàm-á", "名詞"), P("、"), W("帽仔", "bō-á", "名詞"), P("、"), W("葉仔", "hio̍h-á", "名詞"), P("、"),
    W("竹仔", "tik-á", "名詞"), P("、"), W("賊仔", "tsha̍t-á", "名詞"), P("、"), W("魚仔", "hî-á", "名詞")],
    "tiam1-a2, bo7-a2, hioh7-a2, tik8-a2, tshat4-a2, hi7-a2", "仔仔仔仔仔仔"],
  ["紅紅紅", [W("紅紅紅", "âng-âng-âng", "形容詞")], "ang9-ang7-ang5", "紅"],
  ["轉來", [W("伊", "i", "代詞"), W("轉來", "tńg--lâi", "動詞"), W("矣", "--ah", "助詞")], "i7 tng2--lai0--ah0", "轉"],
  ["三本冊", [W("三", "sann", "數詞"), W("本", "pún", "量詞"), W("冊", "tsheh", "名詞")], "sann7 pun1 tsheh4", "冊"],
  ["台語老師", [W("台語", "Tâi-gí", "名詞"), W("老師", "lāu-su", "名詞")], "Tai7-gi1 lau3-su1", "師", { joinNouns: true }],
  ["阿明冊讀了矣", [W("阿明", "A-bîng", "名詞"), W("冊", "tsheh", "名詞"), W("讀了", "tha̍k-liáu", "動詞"), W("矣", "--ah", "助詞")], "A7-bing5 tsheh4 thak4-liau2--ah0", "明冊了"],
  ["有人來", [W("有", "ū", "動詞"), W("人", "lâng", "名詞"), W("來", "lâi", "動詞")], "u3 lang7 lai5", "來"],
  ["彼个人真好", [W("彼", "hit", "代詞"), W("个", "ê", "量詞"), W("人", "lâng", "名詞"), W("真", "tsin", "副詞"), W("好", "hó", "形容詞")], "hit8 e7 lang5 tsin7 ho2", "人好"],
  ["煩惱甲袂食袂睏", [W("煩惱", "huân-ló", "動詞"), W("甲", "kah", "名詞"), W("袂食袂睏", "bē-tsia̍h-bē-khùn", "動詞")], "huan7-lo1 kah2 be3-tsiah3-be3-khun3", "睏"],
  ["啥物人", [W("啥物", "siánn-mih", "疑問詞"), W("人", "lâng", "名詞"), W("來", "lâi", "動詞")], "siann1-mih2 lang5 lai5", "人來"],
  ["八十歲", [W("八十", "peh-tsa̍p", ""), W("歲", "huè", "量詞")], "peh2-tsap4 hue3", "歲"],
  ["無啥好", [W("無", "bô", "副詞"), W("啥", "siánn", "疑問詞"), W("好", "hó", "形容詞")], "bo7 siann1 ho2", "好"],
  ["名簽蹛遮", [W("名", "miâ", "名詞"), Object.assign(W("簽", "tshiam", "名詞"), { posAll: ["名詞", "動詞"] }), W("蹛", "tuà", "動詞"), W("遮", "tsia", "代詞")], "mia5 tshiam7 tua2 tsia1", "名遮"],
  ["阿明今仔日無來", [W("阿明", "A-bîng", "名詞"), W("今仔日", "kin-á-ji̍t", "時間詞"), W("無", "bô", "副詞"), W("來", "lâi", "動詞")],
    "A7-bing5 kin7-a1-jit8 bo7 lai5", "明日來"],
  ["伊佇學校讀冊", [W("伊", "i", "代詞"), W("佇", "tī", "介詞"), W("學校", "ha̍k-hāu", "名詞"), W("讀冊", "tha̍k-tsheh", "動詞")],
    "i7 ti3 hak4-hau7 thak4-tsheh4", "校冊"],
];

let fail = 0;
for (const [name, tokens, wantActual, wantKept, extra] of cases) {
  S.apply(tokens, Object.assign({ t5: 7 }, extra));
  const actual = S.format(tokens, "actual");
  const kept = tokens.filter(t => t.kind === "word").map(t => t.syls.filter(s => s.keep).map(s => s.hanji).join("")).join("");
  const ok = actual === wantActual && kept === wantKept;
  if (!ok) { fail++; console.log(`FAIL ${name}\n   got  ${actual}  kept=${kept}\n   want ${wantActual}  kept=${wantKept}`); }
}
// northern accent: tone 5 -> 3
const t = [W("台北", "Tâi-pak", "名詞")];
S.apply(t, { t5: 3 });
if (S.format(t, "actual") !== "Tai3-pak4") { fail++; console.log("FAIL t5=3", S.format(t, "actual")); }
// manual override flips the last syllable
const o = [W("學校", "ha̍k-hāu", "名詞"), W("真", "tsin", "副詞"), W("大", "tuā", "形容詞")];
o[0].override = { 1: "sandhi" };
S.apply(o);
if (S.format(o, "actual") !== "hak4-hau3 tsin7 tua7" || !o[0].syls[1].manual) { fail++; console.log("FAIL override", S.format(o, "actual")); }
// writing: capitalised sentence, punctuation mapped
const f = [W("我", "guá", "代詞"), W("欲", "beh", "助動詞"), W("去", "khì", "動詞"), W("台北", "Tâi-pak", "名詞"), P("，"), W("你", "lí", "代詞"), W("咧", "--leh", "助詞"), P("？")];
S.apply(f);
if (S.format(f, "tailo") !== "Guá beh khì Tâi-pak, lí--leh?") { fail++; console.log("FAIL format tailo:", S.format(f, "tailo")); }
if (S.format(f, "num") !== "gua2 beh4 khi3 Tai5-pak4, li2--leh4?") { fail++; console.log("FAIL format num:", S.format(f, "num")); }
console.log(fail ? `${fail} failed` : `sandhi ok (${cases.length + 4} checks)`);
process.exit(fail ? 1 : 0);

/* Not a pass/fail test: prints conversions so the output can be read. */
const TG = require("./load.js");
const { convert: C, sandhi: S } = TG;
const sentences = process.argv.slice(2).length ? process.argv.slice(2) : [
  "我今天要去學校上課。", "你吃飽了嗎？", "這個多少錢？", "我不知道他在哪裡。", "謝謝你的幫忙！", "他們家的小孩很可愛。",
  "我很喜歡吃台灣菜。", "今天天氣很好，我們一起去公園散步吧。", "你叫什麼名字？", "我是台灣人，我會說台語。",
  "媽媽在廚房煮飯。", "對不起，我聽不懂。", "明天會下雨，記得帶傘。", "這本書是我的。", "他比我高。", "我已經吃過了。",
  "老師說這個字要變調。", "請問廁所在哪裡？", "阿嬤昨天去醫院看醫生。", "我想買一雙鞋子。", "坐捷運去台北很方便。",
  "伊欲去佗位？", "阮阿母咧煮飯。", "Guá beh khì Tâi-pak.", "li2 tsiah8-pa2--bue7?", "gau5 tsing3",
];
for (const s of sentences) {
  const r = C.convert(s, "auto", null);
  const tokens = C.analyse(r.segs, { t5: 7 }, r.mode);
  const segs = r.segs.map(x => x.kind === "punct" ? x.text : `${x.src}→${C.current(x).hanji || "∅"}${x.cands.length > 1 ? "(+" + (x.cands.length - 1) + ")" : ""}`).join(" ");
  const kept = tokens.filter(t => t.kind === "word").map(t => t.syls.map(y => (y.keep ? "_" : "") + (y.hanji || y.key)).join("")).join(" ");
  console.log(`\n[${r.mode}] ${s}\n  ${segs}\n  ${S.formatHanji(tokens)}\n  ${S.format(tokens, "tailo")}\n  ${S.format(tokens, "actual")}\n  ${kept}`);
}

/* Prints dictionary example sentences with the syllables the engine keeps in base tone
 * marked [like this], for reading through by eye. Not a pass/fail test. */
const TG = require("./load.js");
const { convert: C, sandhi: S, dict: D, tailo: T } = TG;
const HAN = D.HAN_RE;
function analyse(hanji, tailo) {
  const segs = [];
  const hs = Array.from(hanji);
  let hi = 0;
  T.tokenize(tailo).forEach((t) => {
    if (t.kind === "punct") return;
    t.text.split(/(?=--)/).forEach((part) => {
      if (!part) return;
      const n = T.parseWord(part).length;
      while (hi < hs.length && !HAN.test(hs[hi])) { segs.push({ kind: "punct", text: hs[hi] }); hi++; }
      let w = "", got = 0;
      while (hi < hs.length && got < n) { if (HAN.test(hs[hi])) got++; w += hs[hi]; hi++; }
      segs.push({ kind: "seg", src: w, pick: 0, ov: {}, cands: [{ entry: D.findWord(w, part), hanji: w, tailo: part, sense: -1 }] });
    });
  });
  while (hi < hs.length) { if (!HAN.test(hs[hi])) segs.push({ kind: "punct", text: hs[hi] }); hi++; }
  return C.analyse(segs, { t5: 7 });
}
const n = +process.argv[2] || 30, seed = +process.argv[3] || 7;
let x = seed;
const rnd = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
const pool = D.examples.filter(e => Array.from(e[0]).length >= 7 && Array.from(e[0]).length <= 16 && /。|？|！/.test(e[0]));
for (let i = 0; i < n; i++) {
  const ex = pool[Math.floor(rnd() * pool.length)];
  const tokens = analyse(ex[0], ex[1]);
  const marked = tokens.map(t => t.kind === "punct" ? t.text : t.syls.map(s => s.neutral ? "·" + s.hanji : s.keep ? "[" + s.hanji + "]" : s.hanji).join("")).join(" ");
  const pos = tokens.filter(t => t.kind === "word").map(t => t.hanji + "/" + (t.cls || "?")).join(" ");
  console.log(`${marked}\n   ${S.format(tokens, "actual")}\n   ${pos}\n   ${ex[2]}`);
}

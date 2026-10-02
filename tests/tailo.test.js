/* Round-trip every romanization in the dictionary: tone marks -> digits -> tone marks. */
const fs = require("fs");
const path = require("path");
const TG = require("../js/tailo.js");
const T = TG.tailo;
const root = path.join(__dirname, "..");
const dict = JSON.parse(fs.readFileSync(path.join(root, "data/dict.json"), "utf8"));
const examples = JSON.parse(fs.readFileSync(path.join(root, "data/examples.json"), "utf8"));

let n = 0, bad = [];
function check(s) {
  const want = s.normalize("NFC");
  const got = T.toDiacritic(T.toNumeric(want));
  n++;
  if (got !== want && bad.length < 40) bad.push([want, T.toNumeric(want), got]);
  if (got !== want) check.fail = (check.fail || 0) + 1;
}
for (const e of dict.e) {
  if (e[3]) check(e[3]);
  const x = e[6];
  if (x && x.a) for (const [, t] of x.a) check(t);
}
for (const ex of examples) check(ex[1]);
console.log(`round trip: ${n} strings, ${check.fail || 0} differ`);
for (const b of bad) console.log("  ", b.join("  |  "));

const cases = [
  ["gau5", "gâu"], ["tsing3", "tsìng"], ["tsiah8", "tsia̍h"], ["gua2 beh4 khi3 tai5-pak4", "guá beh khì tâi-pak"],
  ["m7", "m̄"], ["ng5", "n̂g"], ["tng2", "tńg"], ["hmh8", "hm̍h"], ["oo5", "ôo"], ["ue7", "uē"], ["tui3", "tuì"],
  ["khiu5", "khiû"], ["Tai5-uan5", "Tâi-uân"], ["kin1-a2-jit8", "kin-á-ji̍t"], ["sann1", "sann"], ["mih8", "mi̍h"],
  ["siann2-mih4", "siánn-mih"], ["hoo7", "hōo"], ["kuainn1", "kuainn"], ["a9", "a̋"], ["--ah4", "--ah"], ["tng2--lai5", "tńg--lâi"],
];
let fail = 0;
for (const [a, b] of cases) {
  const got = T.toDiacritic(a);
  if (got !== b.normalize("NFC")) { fail++; console.log("FAIL toDiacritic", a, "->", got, "want", b); }
}
const p = T.parseSyllable("tsia̍h");
if (!(p.key === "tsiah" && p.tone === 8 && p.stop === "h")) { fail++; console.log("FAIL parse", p); }
const w = T.parseWord("tńg--lâi-khì");
if (!(w.length === 3 && !w[0].neutral && w[1].neutral && w[2].neutral)) { fail++; console.log("FAIL parseWord", w); }
const tk = T.tokenize("Guá beh khì Tâi-pak, lí--leh?");
if (tk.map(t => t.text).join("|") !== "Guá|beh|khì|Tâi-pak|,|lí--leh|?") { fail++; console.log("FAIL tokenize", tk); }
console.log(fail ? `${fail} case(s) failed` : `cases ok (${cases.length + 3})`);
// the source has two misplaced tone marks (Tūa-, aì); the standard placement differs there
if (fail || (check.fail || 0) > 2) process.exitCode = 1;

// every romanization in the dictionary must pass the "could this be 台羅" test; English must not
{
  let bad = [];
  for (const e of dict.e) {
    if (e[1] === 4 || !e[3]) continue;                 // 附錄 has loanwords written in kana-style romanization
    for (const r of e[3].split("/")) for (const w of r.split(/\s+/)) if (w && !T.isRomanization(w.replace(/[.,?!()“”]/g, ""))) bad.push(w);
  }
  console.log(`isRomanization: ${bad.length} dictionary words rejected`, bad.slice(0, 12).join(" "));
  for (const w of ["shirt", "xyz", "abc", "LINE", "T"]) if (T.isRomanization(w)) { console.log("FAIL accepted", w); process.exitCode = 1; }
  if (bad.length > 5) process.exitCode = 1;
}

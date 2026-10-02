/* Throw a lot of strange text at the whole text pipeline. It must never throw and never take long.
 * The generator is seeded, so a failure can be reproduced:  node tests/fuzz.test.js [rounds] [seed]
 */
const TG = require("./load.js");
const { convert: C, sandhi: S, dict: D, tailo: T } = TG;

const rounds = +process.argv[2] || 2500;
let seed = (+process.argv[3] || 20261003) >>> 0;
function rnd() {   // mulberry32
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (a) => a[Math.floor(rnd() * a.length)];

const HAN = Array.from(new Set(D.entries.slice(0, 6000).flatMap((e) => Array.from(e.hanji)))).filter((c) => D.HAN_RE.test(c));
const POOLS = [
  HAN, HAN, HAN,                                                       // mostly 漢字
  Array.from("abcdefghijklmnopqrstuvwxyz"), Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ"), Array.from("0123456789"),
  Array.from("áàâǎāőéèêēíìîīóòôōúùûūḿńň"), ["́", "̀", "̂", "̌", "̄", "̍", "̋", "̈"],   // tone marks, also on their own
  Array.from("，。？！、；：「」『』（）,.?!;:\"'()[]{}<>/\\|&*#@%^~`=+_"), ["-", "--", "---", "/", " ", "  ", "\n", "\t", "\r\n", "　"],
  ["😀", "👨\u200d👩\u200d👧", "🇹🇼", "𠀀", "𪜶", "𰣻", "\ud800", "\udc00", "\ud83d"],            // emoji, rare 漢字, lone surrogates
  ["\u200b", "\u200d", "\ufeff", "\u202e", "\u202d", "\u0000", "\u0007", "\u001b", "\u007f", "\u0085"],   // zero-width, bidi, control
  ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf", "prototype", "<script>", "</script>", "<img src=x onerror=1>", "${1+1}", "{{x}}"],
  ["tsia̍h", "tsiah8", "gâu", "gau5", "kin-á-ji̍t", "tńg--lâi", "--ah", "ng", "m", "hm", "nn", "ooh", "tsh", "kh", "ph", "th"],
];
function gen() {
  const n = 1 + Math.floor(rnd() * (rnd() < 0.1 ? 400 : 40));
  let s = "";
  const mix = rnd() < 0.5;
  const main = pick(POOLS);
  for (let i = 0; i < n; i++) s += pick(mix ? pick(POOLS) : main);
  return s;
}

const FIX = { word: Object.create(null), read: Object.create(null) };
FIX.word["我"] = { h: "我", t: "guá" }; FIX.word["constructor"] = { h: "x", t: "y" }; FIX.read["學校"] = "ha̍k-hāu";

let fail = 0, slowest = 0, slowestIn = "";
function bad(msg, input, e) {
  fail++;
  if (fail <= 8) console.log("FAIL", msg, JSON.stringify(input.slice(0, 80)), e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e);
}

function one(text) {
  const t0 = process.hrtime.bigint();
  for (const mode of ["auto", "huayu", "taigi", "tailo"]) {
    try {
      const r = C.convert(text, mode, FIX);
      if (!r || !Array.isArray(r.segs)) throw new Error("no segs");
      // pick random candidates and random tone overrides, as a user tapping around would
      r.segs.forEach((s) => {
        if (s.kind !== "seg") return;
        s.pick = Math.floor(rnd() * Math.max(1, s.cands.length));
        if (rnd() < 0.3) s.ov = { 0: { 0: pick(["base", "sandhi"]), 1: pick(["base", "sandhi"]) } };
      });
      const tokens = C.analyse(r.segs, { t5: rnd() < 0.5 ? 3 : 7 }, r.mode);
      for (const m of ["tailo", "num", "actual"]) if (typeof S.format(tokens, m) !== "string") throw new Error("format " + m);
      if (typeof S.formatHanji(tokens) !== "string") throw new Error("formatHanji");
      tokens.forEach((t) => { if (t.kind === "word") t.syls.forEach((y) => { if (!(y.actual >= 0 && y.actual <= 9)) throw new Error("tone out of range " + y.actual); }); });
    } catch (e) { bad("convert/" + mode, text, e); }
  }
  try {
    const found = D.search(text, 60);
    if (!Array.isArray(found)) throw new Error("search");
    D.searchExamples(text, 20);
    for (const f of [T.toDiacritic, T.toNumeric, T.toPlain, (x) => T.tokenize(x), (x) => T.syllables(x), (x) => T.parseWord(x), T.isRomanization]) f(text);
  } catch (e) { bad("search/tailo", text, e); }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  if (ms > slowest) { slowest = ms; slowestIn = text; }
}

// fixed hostile inputs first
for (const s of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf", "prototype", "漢constructor", "__proto__漢", "constructor 漢 __proto__",
  "", " ", "\n", "-", "--", "---", "--a", "a--", "tsiah--", "--tsiah--", "1", "99999999999999999999", "a1b2c3", "́", "á́́", "ṅ", "𠀀𪜶𰣻"]) one(s);
const t0 = Date.now();
for (let i = 0; i < rounds; i++) one(gen());
// size: the page limits input to 500 characters, but the engine itself must cope with much more
const big = "我愛你，今天天氣很好。".repeat(2000);
const tb = Date.now();
one(big);
const bigMs = Date.now() - tb;
if (bigMs > 20000) bad("a 22,000 character input took " + bigMs + " ms", big);

console.log(`fuzz: ${rounds} random inputs + fixed cases in ${((Date.now() - t0) / 1000).toFixed(1)} s; slowest single input ${slowest.toFixed(0)} ms (${JSON.stringify(slowestIn.slice(0, 20))}…, ${slowestIn.length} chars)`);
console.log(fail ? `${fail} failure(s)` : "fuzz ok");
process.exit(fail ? 1 : 0);

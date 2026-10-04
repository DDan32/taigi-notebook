/* Proverb search: the behaviours that must not regress. (How good it is at finding by meaning is measured by
 * tests/proverb.eval.js; this file only pins the floor so that a change cannot quietly make it much worse.) */
const TG = require("./load.js");
const P = TG.proverb;
const { run, dictionaryCheck } = require("./proverb.eval.js");
let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; console.log("FAIL", msg); } };
const top = (q, n) => P.search(q, n || 5).map((r) => r.doc.hanji);

check(P.docs.length === 468, "468 proverbs expected, got " + P.docs.length);
check(P.docs.every((d) => d.kw.length >= 4), "every proverb needs search words: " + P.docs.filter((d) => d.kw.length < 4).map((d) => d.hanji));

// searching by what the proverb says
check(top("肉欲予人食", 1)[0].startsWith("肉欲予人食"), "a piece of the proverb itself must come first");
check(top("jiu", 5).length > 0 && P.search("jiu", 1)[0].why === "romanization", "romanization query");
check(P.search("ang-bóo nā kāng-sim", 1)[0].doc.hanji.startsWith("翁某若仝心"), "romanization with tone marks");
check(P.search("ang5 boo2 na7 kang7 sim1", 1)[0].doc.hanji.startsWith("翁某若仝心"), "romanization with tone digits");
check(top("夫妻吵架是前世欠的", 3).some((h) => h.startsWith("翁仔某是相欠債")), "meaning query");
check(top("反悔", 5).some((h) => h.startsWith("暗頭仔食西瓜")), "a synonym of the word in the explanation (變卦)");

// nothing sensible to say: say nothing rather than guess
check(P.search("", 5).length === 0 && P.search("   ", 5).length === 0, "empty query");
check(P.search("xyzzy", 5).length === 0, "nonsense romanization returns nothing: " + top("xyzzy"));

// hostile text never breaks it
for (const q of ["__proto__", "constructor", "toString", "<img src=x onerror=1>", "\u0000", "𠀀", "漢".repeat(5000), "(".repeat(300), "\\", "[", ".*", "^$"]) {
  try { const r = P.search(q, 5); check(Array.isArray(r), "search returns a list for " + JSON.stringify(q.slice(0, 20))); }
  catch (e) { check(false, "search threw for " + JSON.stringify(q.slice(0, 20)) + ": " + e.message); }
}
check(P.highlight("夫妻和諧", ["夫妻", "諧"]).map((p) => p.text).join("") === "夫妻和諧", "highlight keeps the text intact");
check(P.highlight("abc", ["z"]).length === 1 && !P.highlight("abc", ["z"])[0].hit, "highlight without a match");

// the floor for the meaning search (measured: set A 14/14, set B 12/12; the independent check 70/116)
const r = run({});
check(r.A.top5 >= 11 && r.B.top5 >= 9, `meaning search got worse: A ${r.A.top5}/${r.A.n}, B ${r.B.top5}/${r.B.n}`);
const d = dictionaryCheck(5);
check(d.hit >= 55, `similar proverbs found the dictionary's own near-synonyms for only ${d.hit} of ${d.proverbs}`);

// the converter only shows a proverb when the match is strong
const strong = (q) => P.search(q, 3).some((x) => x.score >= 28);
check(strong("他看不起窮人") && strong("夫妻吵架是前世欠的"), "a real match is above the converter's threshold");
for (const q of ["我已經吃過了", "請問廁所在哪裡", "你叫什麼名字", "今天天氣很好我們去公園", "我想買一雙鞋子"]) check(!strong(q), `an ordinary sentence must not pull in a proverb: ${q} -> ${top(q, 1)}`);

console.log(fail ? `${fail} failed` : `proverb ok (A ${r.A.top5}/${r.A.n}, B ${r.B.top5}/${r.B.n}, dictionary ${d.hit}/${d.proverbs})`);
process.exit(fail ? 1 : 0);

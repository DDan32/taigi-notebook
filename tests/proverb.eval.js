/* How well does the proverb search find a proverb from a description of its meaning?
 *
 *   node tests/proverb.eval.js              score the two sets below
 *   node tests/proverb.eval.js 努力 賺錢     look at your own queries (top 5 each)
 *
 * Each query below was written from the proverb's dictionary explanation but in other words.
 * Set A was written while the hand synonym list (tools/synonyms_hand.tsv) was being made, so it is the
 * optimistic one. Set B was drawn at random afterwards (seed 77) and is the fairer number.
 * "expected" lists every proverb that would be a correct answer.
 */
const TG = require("./load.js");
const P = TG.proverb;

const SETS = {
  A: [
    ["聽不懂別人在說什麼", ["鴨仔聽雷"]], ["要打拚才能成功", ["愛拚才會贏"]], ["為了漂亮不怕寒冷", ["愛媠毋驚流鼻水"]],
    ["做事做到一半又反悔", ["暗頭仔食西瓜"]], ["晚餐不要吃太多對身體好", ["暗頓減食一口"]], ["夫妻吵架是前世欠的", ["翁仔某是相欠債"]],
    ["夫妻齊心協力就能變富有", ["翁某若仝心"]], ["被神棍騙了", ["尪姨順話尾"]], ["只愛老婆不孝順父母", ["翁親某親"]],
    ["再怎麼讓也不能被人欺負過頭", ["肉欲予人食"]], ["愛賒帳的客人", ["䆀猴𠢕欠數"]], ["把東西看錯了", ["目睭花花"]],
    ["看不起窮人的勢利眼", ["目睭看懸", "目睭生佇頭殼頂", "目睭大細蕊", "激一个參仔氣"]], ["穿紅色好看還是黑色", ["紅媠，烏大範"]],
  ],
  B: [
    ["做事要認真徹底不可敷衍", ["掃地掃壁角"]], ["賣東西的人都說自己的最好", ["賣茶講茶芳"]], ["做事抓不到重點", ["牛鼻毋拎"]],
    ["孩子長大有自己的想法父母管不動", ["會生得囝身"]], ["沒用的人什麼都做不成", ["爛塗袂糊得壁"]], ["條件差卻很挑剔", ["歪喙雞食好米"]],
    ["已經過期沒有價值了", ["過時賣曆日"]], ["別人的閒話擋不住", ["人的喙，掩袂密"]], ["多管閒事自找麻煩", ["食飽換枵"]],
    ["當事人都和解了旁人卻還想看熱鬧", ["做戲的欲煞"]], ["手下騙上司不會成功", ["水鬼騙城隍"]], ["吵架先反省自己", ["是毋是，罵家己"]],
  ],
};

function run(opts) {
  const out = {};
  for (const [name, set] of Object.entries(SETS)) {
    let t1 = 0, t3 = 0, t5 = 0, mrr = 0; const miss = [];
    for (const [q, exp] of set) {
      const res = P.search(q, 30, opts);
      const rank = res.findIndex((r) => exp.some((e) => r.doc.hanji.startsWith(e)));
      if (rank === 0) t1++;
      if (rank >= 0 && rank < 3) t3++;
      if (rank >= 0 && rank < 5) t5++;
      if (rank >= 0) mrr += 1 / (rank + 1);
      if (rank < 0 || rank >= 5) miss.push(`${q} -> ${rank < 0 ? "not found" : "rank " + (rank + 1)}${res[0] ? " (top: " + res[0].doc.hanji + ")" : ""}`);
    }
    out[name] = { n: set.length, top1: t1, top3: t3, top5: t5, mrr: +(mrr / set.length).toFixed(2), miss };
  }
  return out;
}

if (require.main === module) {
  const mine = process.argv.slice(2);
  if (mine.length) {
    for (const q of mine) {
      console.log(`\n「${q}」  recognised: ${JSON.stringify(P.termsOf(q).words)}`);
      P.search(q, 5).forEach((r, i) => console.log(`  ${i + 1}. [${r.why} ${r.score.toFixed(1)}] ${r.doc.hanji}  ${r.doc.meaning.slice(0, 40)}`));
    }
  } else {
    for (const [label, opts] of [["default", {}], ["no keywords", { keywords: false }], ["no synonyms", { expand: false }], ["no keywords, no synonyms", { keywords: false, expand: false }]]) {
      const r = run(opts);
      console.log(`\n${label}`);
      for (const [k, v] of Object.entries(r)) {
        console.log(`  set ${k} (${v.n} queries): top-1 ${v.top1}, top-3 ${v.top3}, top-5 ${v.top5}, MRR ${v.mrr}`);
        v.miss.forEach((m) => console.log("     miss: " + m));
      }
    }
  }
}
module.exports = { run, SETS };

/* An independent check, because the sets above were written by the same author as the keywords:
 * the dictionary itself lists near-synonym proverbs (教育部's own judgement). Given proverb A's explanation,
 * how often is a proverb the dictionary calls near-synonymous in the first k results of similar()? */
function dictionaryCheck(k) {
  const pairs = [];
  for (const d of P.docs) for (const id of d.syn) if (P.byId[id]) pairs.push([d.id, id]);   // type-4 neighbours only
  const bySource = new Map();
  for (const [a, b] of pairs) bySource.set(a, (bySource.get(a) || new Set()).add(b));
  let hit = 0, random = 0;
  for (const [a, set] of bySource) {
    const res = P.similar(a, k).map((d) => d.id);
    if (res.some((id) => set.has(id))) hit++;
    random += 1 - Math.pow(1 - Math.min(1, set.size / (P.docs.length - 1)), k);          // chance of at least one hit by picking k at random
  }
  return { proverbs: bySource.size, pairs: pairs.length, hit, k, expectedByChance: +random.toFixed(1) };
}
module.exports.dictionaryCheck = dictionaryCheck;
if (require.main === module && !process.argv.slice(2).length) {
  const r = dictionaryCheck(5);
  console.log(`\ndictionary's own near-synonym proverbs (${r.pairs} pairs among ${r.proverbs} proverbs): found in top-${r.k} for ${r.hit} of ${r.proverbs} (random picking would find about ${r.expectedByChance})`);
}

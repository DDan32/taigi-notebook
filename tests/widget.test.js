/* Runs the generated Scriptable widget against a stand-in for Scriptable's API.
 * It cannot prove how the widget looks on a phone; it proves the script runs for every
 * widget size, picks the same word as the site, and computes the same tones as the engine. */
const fs = require("fs");
const path = require("path");
const TG = require("./load.js");
require("../js/srs.js");
const code = fs.readFileSync(path.join(__dirname, "..", "widget", "TaigiDaily.js"), "utf8");

function makeEnv(opts) {
  const files = opts.files || {};
  const log = { set: null, alerts: [], presented: [] };
  class Node {
    constructor(kind) { this.kind = kind; this.children = []; }
    addText(s) { const t = new Node("text"); t.text = s; this.children.push(t); return t; }
    addStack() { const t = new Node("stack"); this.children.push(t); return t; }
    addSpacer() { return this; }
    layoutHorizontally() {} layoutVertically() {} centerAlignContent() {} setPadding() {}
    texts() { return this.children.flatMap(c => c.kind === "text" ? [c.text] : c.texts()); }
    async presentSmall() { log.presented.push("small"); } async presentMedium() { log.presented.push("medium"); } async presentLarge() { log.presented.push("large"); }
  }
  class Color { constructor(hex) { this.hex = hex; } static dynamic(a, b) { return a; } }
  const Font = new Proxy({}, { get: () => (n) => ({ size: n }) });
  const fm = {
    documentsDirectory: () => "/docs", joinPath: (a, b) => a + "/" + b,
    fileExists: (p) => p in files, readString: (p) => files[p], writeString: (p, s) => { files[p] = s; }, remove: (p) => { delete files[p]; },
  };
  class Alert {
    constructor() { this.actions = []; }
    addAction(a) { this.actions.push(a); } addDestructiveAction(a) { this.actions.push(a); } addCancelAction() {}
    async presentSheet() { log.alerts.push(this); return opts.choice; }
    async presentAlert() { log.alerts.push(this); return 0; }
  }
  return {
    log, files,
    globals: {
      ListWidget: function () { return new Node("widget"); }, Color, Font, Alert,
      FileManager: { local: () => fm }, Pasteboard: { paste: () => opts.clipboard || "" },
      Script: { setWidget: (w) => { log.set = w; }, complete: () => {} },
      config: { runsInWidget: !!opts.family, runsInAccessoryWidget: false, widgetFamily: opts.family },
      args: { widgetParameter: opts.param || null },
      Date: opts.Date || Date,
    },
  };
}

async function run(opts) {
  const env = makeEnv(opts);
  const names = Object.keys(env.globals);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const fn = new AsyncFunction(...names, code + "\nreturn { spoken, WORDS, dayNumber };");
  env.api = await fn(...names.map(n => env.globals[n]));
  return env;
}

(async () => {
  let fail = 0;
  const check = (ok, msg) => { if (!ok) { fail++; console.log("FAIL", msg); } };

  // every widget size renders something sensible
  for (const family of ["small", "medium", "large", "extraLarge", "accessoryRectangular", "accessoryInline", "accessoryCircular"]) {
    const env = await run({ family });
    const texts = env.log.set ? env.log.set.texts() : [];
    check(texts.length >= 1 && texts.every(t => typeof t === "string" && t.length), `${family}: ${JSON.stringify(texts)}`);
    if (family === "medium") console.log("medium widget:", texts.join(" | "));
    if (family === "large") console.log("large widget:", texts.join(" | "));
  }

  // same word as the site on the same day
  const env = await run({ family: "small" });
  const today = TG.dict.get(TG.dict.daily[TG.srs.dailyIndex(TG.dict.daily.length)]);
  check(env.log.set.texts().includes(today.hanji), `widget shows ${env.log.set.texts()} but the site shows ${today.hanji}`);
  check(env.api.WORDS.length === TG.dict.daily.length, "list length differs from data/daily.json");

  // tones match the engine for every word in the list
  let diff = 0;
  for (const row of env.api.WORDS) {
    const tokens = TG.convert.analyse(TG.convert.fromTailo(row[2]), { t5: 7 });
    const want = TG.sandhi.format(tokens, "actual");
    const got = env.api.spoken(row[3]);
    if (got !== want) { diff++; if (diff <= 5) console.log("   tone mismatch", row[1], row[3], "widget:", got, "engine:", want); }
  }
  check(diff === 0, `${diff} words differ from the engine`);

  // import the notebook from the clipboard, then show it
  const files = {};
  const imp = await run({ choice: 3, clipboard: 'TAIGI-NOTEBOOK:[{"h":"媠","t":"suí","m":"漂亮"}]', files });
  check(/已匯入 1/.test(imp.log.alerts[1].title), "import: " + imp.log.alerts[1].title);
  const nb = await run({ family: "medium", param: "notebook", files });
  check(nb.log.set.texts().includes("媠"), "notebook widget: " + nb.log.set.texts());
  // hostile clipboard: wrong types, prototype keys, giant strings, too many words
  const many = Array.from({ length: 900 }, (_, i) => ({ h: "字" + i, t: "tsi" + i, m: "x".repeat(150) }));   // under the 200 KB clipboard cap
  many.unshift({ h: ["array"], t: 7 }, { "__proto__": { h: "x", t: "y" } }, null, "str", { h: "媠", t: "suí", m: { not: "string" } });
  const hostileFiles = {};
  const hostile = await run({ choice: 3, clipboard: "TAIGI-NOTEBOOK:" + JSON.stringify(many), files: hostileFiles });
  const stored = JSON.parse(Object.values(hostileFiles)[0]);
  check(stored.length === 400, "word count capped at 400, got " + stored.length);
  check(stored.every(w => typeof w.h === "string" && typeof w.t === "string" && typeof w.m === "string" && w.m.length <= 120), "stored words are plain short strings");
  check(stored[0].h === "媠" && stored[0].m === "", "bad entries dropped, bad field emptied");
  const huge = await run({ choice: 3, clipboard: "TAIGI-NOTEBOOK:" + "[" + "0,".repeat(150000) + "0]" });
  check(/沒有生字簿/.test(huge.log.alerts[1].title), "oversize clipboard refused: " + huge.log.alerts[1].title);
  const bad = await run({ choice: 3, clipboard: "hello" });
  check(/沒有生字簿/.test(bad.log.alerts[1].title), "bad clipboard: " + bad.log.alerts[1].title);
  const prev = await run({ choice: 1 });
  check(prev.log.presented[0] === "medium", "preview");

  console.log(fail ? `${fail} failed` : "widget ok");
  process.exit(fail ? 1 : 0);
})();

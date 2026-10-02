/* Writes widget/TaigiDaily.js: a Scriptable (iOS) home-screen widget with the daily word list built in.
 *
 *   node tools/build_widget.js
 *
 * The list is data/daily.json, in the same order the site uses, so the widget and the
 * site's 今日一詞 show the same word on the same day.
 */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const TG = require("../js/tailo.js");
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, "data", f), "utf8"));

const dict = read("dict.json");
const examples = read("examples.json");
const daily = read("daily.json");
const byId = new Map(dict.e.map((e) => [e[0], e]));

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

const words = daily.map((id) => {
  const e = byId.get(id);
  const tailo = e[3].split("/")[0];
  const sense = e[5][0];
  const ex = sense[3] ? examples[sense[2]] : ["", "", ""];
  return [id, e[2], tailo, TG.tailo.toNumeric(tailo), dict.pos[sense[0]] || "", clip(sense[1], 60), ex[0], ex[1], ex[2]];
});

const TEMPLATE = fs.readFileSync(path.join(__dirname, "widget_template.js"), "utf8");
const out = TEMPLATE
  .replace("/*__BUILT__*/", dict.meta.built)
  .replace("/*__WORDS__*/[]", JSON.stringify(words).replace(/\],\[/g, "],\n["));
fs.mkdirSync(path.join(root, "widget"), { recursive: true });
fs.writeFileSync(path.join(root, "widget", "TaigiDaily.js"), out);
console.log(`widget/TaigiDaily.js: ${words.length} words, ${(out.length / 1024).toFixed(0)} KB`);

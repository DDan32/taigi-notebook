/* Loads the data and the modules the way the page does; returns TG. */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const TG = require("../js/tailo.js");
require("../js/sandhi.js");
require("../js/dict.js");
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, "data", f), "utf8"));
TG.dict.init(read("dict.json"));
TG.dict.set("huayu", read("huayu.json"));
TG.dict.set("chars", read("chars.json"));
TG.dict.set("examples", read("examples.json"));
TG.dict.set("daily", read("daily.json"));
require("../js/convert.js");
module.exports = TG;

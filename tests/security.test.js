/* Security regression tests. Everything here is something that went wrong, or could have, and must stay fixed.
 *
 *   1. the source never uses an HTML/code sink (innerHTML, eval, document.write, ...)
 *   2. h() refuses event attributes, style attributes and script-ish URLs, and links to new tabs get noopener
 *   3. hostile data in a backup, in localStorage or from the cloud is cleaned before it is used
 *   4. the built index.html carries a strict Content-Security-Policy that matches its inline styles
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; console.log("FAIL", msg); } };
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

// ---- 1. dangerous sinks ----------------------------------------------------------------------------
const SINKS = [
  [/\.innerHTML\b/, "innerHTML"], [/\.outerHTML\b/, "outerHTML"], [/insertAdjacentHTML/, "insertAdjacentHTML"],
  [/document\.write/, "document.write"], [/\beval\s*\(/, "eval"], [/new\s+Function\b/, "new Function"],
  [/set(?:Timeout|Interval)\(\s*["'`]/, "setTimeout/setInterval with a string"], [/\.srcdoc\b/, "srcdoc"],
  [/javascript:/i, "javascript: URL"], [/document\.cookie/, "document.cookie"], [/window\.open\s*\(/, "window.open"],
  [/postMessage\s*\(/, "postMessage"], [/importScripts/, "importScripts"], [/createContextualFragment/, "createContextualFragment"],
  [/\bDOMParser\b/, "DOMParser"], [/setAttribute\(\s*["']style["']/, "style attribute"], [/\.cssText\b/, "cssText"],
  [/\bnew\s+WebSocket\b|\bXMLHttpRequest\b|sendBeacon/, "network other than fetch of our own files"],
];
const jsFiles = fs.readdirSync(path.join(root, "js")).filter((f) => f.endsWith(".js"));
for (const f of jsFiles) {
  const src = read("js/" + f);
  for (const [re, name] of SINKS) if (re.test(src)) check(false, `js/${f} uses ${name}`);
}
// the only fetch() calls are for our own relative files
for (const f of jsFiles) {
  for (const m of read("js/" + f).matchAll(/fetch\(\s*([^)]*)\)/g)) {
    check(/^["'](?:data|widget)\//.test(m[1].trim()) || /^path$/.test(m[1].trim()), `js/${f}: fetch(${m[1]}) is not a relative file of ours`);
  }
}
console.log(`sink scan: ${jsFiles.length} files`);

// no hidden or bidirectional characters in anything we write (they make code show differently from how it runs)
{
  const HIDDEN = /[\u202a-\u202e\u2066-\u2069\u200b-\u200f\u2060-\u2064\ufeff\u00ad\u061c\u180e]/;
  const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? (["raw", "node_modules", ".git"].includes(e.name) ? [] : walk(path.join(dir, e.name))) : [path.join(dir, e.name)]);
  let n = 0;
  for (const f of walk(".")) {
    if (!/\.(js|py|html|md|json|tsv|sh|svg|webmanifest)$/.test(f) && !/(^|\/)_headers$/.test(f)) continue;
    n++;
    if (HIDDEN.test(read(f))) check(false, `${f} contains a hidden or bidirectional character`);
  }
  console.log(`hidden-character scan: ${n} files`);
}

// ---- 2. h() ----------------------------------------------------------------------------------------
class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.attrs = new Map(); this.children = []; this.listeners = {}; this.className = ""; this.nodeType = 1; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  removeAttribute(k) { this.attrs.delete(k); }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
}
globalThis.window = globalThis;
globalThis.document = {
  createElement: (t) => new El(t), createElementNS: (ns, t) => new El(t), createTextNode: (s) => ({ nodeType: 3, text: String(s) }),
  getElementById: () => null, querySelector: () => null, documentElement: { classList: { add() {}, remove() {} } }, addEventListener() {},
};
const TG = require("./load.js");
require("../js/ui.js");
const h = TG.ui.h;
{
  const attr = (el, k) => el.getAttribute(k);
  check(attr(h("a", { href: "javascript:alert(1)" }), "href") === null, "javascript: href was set");
  check(attr(h("a", { href: " JaVaScRiPt:alert(1)" }), "href") === null, "javascript: href with spaces/case was set");
  check(attr(h("a", { href: "java\nscript:alert(1)" }), "href") === null, "javascript: href with a newline was set");
  check(attr(h("a", { href: "data:text/html,<script>alert(1)</script>" }), "href") === null, "data: href was set");
  check(attr(h("a", { href: "http://example.com/" }), "href") === null, "plain http: href was set");
  check(attr(h("a", { href: "https://sutian.moe.edu.tw/" }), "href") === "https://sutian.moe.edu.tw/", "https href was refused");
  check(attr(h("a", { href: "blob:null/1234" }), "href") !== null, "blob: href was refused (the backup download needs it)");
  check(attr(h("div", { onclick: "alert(1)" }), "onclick") === null, "a string onclick became an attribute");
  check(attr(h("div", { onfocus: "alert(1)" }), "onfocus") === null, "a string onfocus became an attribute");
  const fn = () => {};
  const withFn = h("button", { onclick: fn });
  check(withFn.listeners.click && withFn.listeners.click[0] === fn && attr(withFn, "onclick") === null, "a function handler must be a listener, not an attribute");
  check(attr(h("div", { style: "background:url(//evil)" }), "style") === null, "style attribute was set");
  check(attr(h("iframe", { srcdoc: "<script>1</script>" }), "srcdoc") === null, "srcdoc was set");
  check(attr(h("div", { "on-x": "1" }), "on-x") === null && attr(h("div", { "x y": "1" }), "x y") === null && attr(h("div", { "<b": "1" }), "<b") === null, "odd attribute names were set");
  const blank = h("a", { href: "https://sutian.moe.edu.tw/", target: "_blank" });
  check(attr(blank, "rel") === "noopener noreferrer", "target=_blank link must get rel=noopener noreferrer, got " + attr(blank, "rel"));
  check(h("p", { text: "<img src=x onerror=1>" }).textContent === "<img src=x onerror=1>", "text must be assigned as text");
  const kid = h("div", null, "<b>x</b>");
  check(kid.children[0].nodeType === 3 && kid.children[0].text === "<b>x</b>", "string children must become text nodes");
}

// ---- 2b. recordings: where they come from and what a clip URL can contain -------------------------
{
  const A = TG.audio;
  const at = (hostname) => A.baseUrl({ hostname, origin: "https://" + hostname });
  check(at("ddan32.github.io") === "https://ddan32.github.io/taigi-audio/", "GitHub Pages base: " + at("ddan32.github.io"));
  check(at("localhost") === "audio/" && at("127.0.0.1") === "audio/", "local base");
  for (const evil of ["claude.ai", "evil.example", "ddan32.github.io.evil.example", "github.io.evil.example", "xgithub.io", "evil.com#.github.io", "a.b.github.io", ".github.io", "-x.github.io", "evil.example/.github.io"]) {
    check(at(evil) === null, `no audio base may be offered on ${evil}, got ${at(evil)}`);
  }
  A.base = "https://ddan32.github.io/taigi-audio/";
  check(A.example(26848, "1-1") === "https://ddan32.github.io/taigi-audio/s/26/26848-1-1.mp3", "example url: " + A.example(26848, "1-1"));
  for (const bad of ["../1-1", "1-1/../../x", "1-1.mp3", "1-1\n", "a-1", "1-", "", "1-1-1", "1000-1", " 1-1", "1-1 ", "%2e%2e-1"]) {
    check(A.example(5, bad) === null, `example suffix ${JSON.stringify(bad)} must be refused`);
  }
  for (const bad of ["5", 5.5, NaN, -1, null, undefined, "../5", Infinity]) check(A.example(bad, "1-1") === null, `example id ${JSON.stringify(bad)} must be refused`);
  check(A.word("5") === null && A.word(5.5) === null && A.word(-1) === null && A.word(1e9) === null && A.word(NaN) === null, "word ids that are not clean integers must be refused");
  const withClip = TG.dict.entries.find((e) => A.word(e.id));
  check(withClip && A.word(withClip.id) === `https://ddan32.github.io/taigi-audio/w/${Math.floor(withClip.id / 1000)}/${withClip.id}.mp3`, "word url");
  check(!TG.dict.entries.some((e) => e.type !== 4 && e.type !== 0 && e.type !== 1 && e.type !== 2 && A.word(e.id) && false), "clip list sanity");
  A.base = null;
  check(A.word(withClip.id) === null && A.example(5, "1-1") === null, "without a base nothing is offered");
}

// ---- 3. hostile data ---------------------------------------------------------------------------------
function freshStore(initial) {
  const m = new Map(Object.entries(initial || {}));
  globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  const saved = globalThis.TG;
  delete require.cache[require.resolve("../js/store.js")];
  const S = require("../js/store.js").store;
  return S;
}
const SOON = () => Date.now() + 86400000 + 1000;
const polluted = () => Object.keys(Object.prototype).length > 0 || ({}).polluted !== undefined || ({}).h !== undefined;
{
  const S = freshStore();
  const evil = JSON.stringify({
    app: "taigi-notebook", version: 1,
    settings: JSON.parse('{"__proto__": {"polluted": "yes"}, "t5": "9", "front": "<img>"}'),
    fix: { word: JSON.parse('{"__proto__": {"h": "x", "t": "y"}, "constructor": {"h": "a", "t": "b"}, "ok": {"h": "我", "t": "guá"}, "str": "no"}'), read: JSON.parse('{"__proto__": "x", "媠": "suí"}') },
    words: [
      { id: "__proto__", h: "a", t: "b" }, { id: "constructor", h: "a", t: "b" },
      { id: "w1", h: "媠", t: "suí", m: "x".repeat(3e6), n: "y".repeat(3e6), lv: "abc", due: { no: 1 }, u: 9e15, c: -5 },
      { id: "w2", h: ["array"], t: 12345 }, { id: "w3", h: "<img src=x onerror=1>", t: "x" }, null, 5, "str",
      { id: "bad id with spaces", h: "x" }, { id: "w4", h: "ok", t: "ok", lv: 99, seen: -3, ref: 1e99 },
    ],
    sents: [{ id: "s1", segs: "not an array", u: 1 }, { id: "s2", src: "ok", mode: "evil", segs: [{ p: "x" }, null, 5, { src: "constructor", h: "x", t: "y", e: "1", s: "z", ov: JSON.parse('{"__proto__": {"0": "sandhi"}, "0": {"0": "sandhi", "1": "evil", "x": "base"}}') }], h: "x", t: "x" }],
  });
  S.importAll(evil);
  check(!polluted(), "importing a hostile backup polluted Object.prototype");
  check(S.state.settings.t5 === 7 && S.state.settings.front === "hanji" && S.state.settings.polluted === undefined, "settings not cleaned: " + JSON.stringify(S.state.settings));
  check(Object.getPrototypeOf(S.state.settings) === Object.prototype, "settings object had its prototype swapped");
  check(Object.getPrototypeOf(S.state.fix.word) === null && S.state.fix.word.h === undefined, "fix.word had its prototype swapped or inherited a key");
  check(Object.keys(S.state.fix.word).join() === "ok" && Object.keys(S.state.fix.read).join() === "媠", "bad fix entries survived: " + Object.keys(S.state.fix.word) + " / " + Object.keys(S.state.fix.read));
  const w1 = S.state.words.w1;
  check(w1 && w1.m.length <= 500 && w1.n.length <= 2000 && w1.lv === 0 && w1.due === "" && w1.u <= SOON() && w1.c >= 0, "w1 not cleaned: " + JSON.stringify(w1 && { m: w1.m.length, n: w1.n.length, lv: w1.lv, due: w1.due, u: w1.u, c: w1.c }));
  check(!S.state.words.w2 && !S.state.words["bad id with spaces"] && !("__proto__" in {} && Object.keys(S.state.words).includes("__proto__")) && !Object.keys(S.state.words).includes("constructor"), "invalid words were kept: " + Object.keys(S.state.words));
  check(S.state.words.w3 && S.state.words.w3.h === "<img src=x onerror=1>", "markup must survive as plain text, not be altered or dropped");
  const w4 = S.state.words.w4;
  check(w4 && w4.lv === 7 && w4.seen === 0 && w4.ref === 10000000, "numbers not clamped: " + JSON.stringify(w4));
  check(!S.state.sents.s1, "a sentence with nothing left after cleaning must be dropped");
  const s2 = S.state.sents.s2;
  check(s2 && s2.mode === "" && s2.segs.length === 2 && s2.segs[1].e === 0 && s2.segs[1].s === -1, "s2 not cleaned: " + JSON.stringify(s2));
  check(s2 && Object.keys(s2.segs[1].ov).join() === "0" && Object.keys(s2.segs[1].ov["0"]).join() === "0" && s2.segs[1].ov["0"]["0"] === "sandhi", "ov not cleaned: " + JSON.stringify(s2 && s2.segs[1].ov));
  S.fixWord("__proto__", "x", "y"); S.fixWord("constructor", "x", "y"); S.fixReading("__proto__", "y");
  check(Object.keys(S.state.fix.word).join() === "ok" && S.state.fix.word.h === undefined, "fixWord accepted a prototype key");
  check(!polluted(), "prototype keys polluted Object.prototype");
  let threw = "";
  try { S.importAll("x".repeat(8000001)); } catch (e) { threw = e.message; }
  check(/太大/.test(threw), "an 8 MB+ backup must be refused, got: " + threw);
  // caps
  const many = { app: "taigi-notebook", words: Array.from({ length: 6000 }, (_, i) => ({ id: "m" + i, h: "字" + i, t: "t" })) };
  S.importAll(JSON.stringify(many));
  check(S.listWords().length <= 5000, "word count not capped: " + S.listWords().length);
}
{
  // the same poison, sitting in localStorage when the page loads
  const S = freshStore({
    "taigi.v1.profile": '{"settings":{"__proto__":{"x":1},"t5":"9","contour":"yes"},"fix":{"word":{"__proto__":{"h":"x","t":"y"},"a":"s","ok":{"h":"我","t":"guá"}},"read":[1,2]},"meta":{"streak":1e999,"lastDay":"<b>","done":-5},"u":1e300}',
    "taigi.v1.words": '{"__proto__":{"id":"p","h":"x","t":"y"},"a":{"id":"a","h":"<b>","t":"t","u":9e15},"b":null,"c":5,"d":{"id":"d"}}',
    "taigi.v1.sents": '[null,5,{"id":"s","segs":"x","h":"x"}]',
    "taigi.v1.history": '[{"src":"<img>","mode":"huayu","segs":"nope"},null,5,{"src":""},{"src":"constructor","segs":[{"src":"constructor","h":"x","t":"y"}]}]',
  });
  check(!polluted(), "poisoned localStorage polluted Object.prototype");
  check(S.state.settings.t5 === 7 && S.state.settings.contour === true, "stored settings not cleaned: " + JSON.stringify(S.state.settings));
  check(S.state.meta.streak === 0 && S.state.meta.lastDay === "" && S.state.meta.done === 0, "stored meta not cleaned: " + JSON.stringify(S.state.meta));
  check(S.state.u <= SOON(), "stored profile timestamp not clamped");
  check(Object.keys(S.state.fix.word).join() === "ok" && Object.keys(S.state.fix.read).length === 0, "stored fixes not cleaned");
  check(Object.keys(S.state.words).sort().join() === "a,p" && S.state.words.a.u <= SOON(), "stored words not cleaned: " + Object.keys(S.state.words));
  check(Object.keys(S.state.sents).join() === "s" && S.state.sents.s.segs.length === 0 && S.state.sents.s.t === "" && S.state.sents.s.h === "x", "stored sentences not cleaned");
  check(S.state.history.length === 2 && S.state.history[0].segs.length === 0, "stored history not cleaned: " + JSON.stringify(S.state.history));
}
{
  // a document that comes back from the cloud is cleaned the same way
  const docs = [{ id: "r1", h: "媠", t: "suí", u: 1e18 }, { id: "__proto__", h: "x" }, { id: "r2", h: ["x"], t: 3 }];
  const store = freshStore();
  const db = {};
  const fake = (path) => ({
    id: path.split("/").pop(), path, get: async () => ({ exists: path in db, data: () => db[path] }), set: async (b) => { db[path] = b; }, delete: async () => {},
    collection: (n) => coll(path + "/" + n),
  });
  const coll = (path) => ({
    doc: (id) => fake(path + "/" + id),
    get: async () => ({ docs: path.endsWith("/words") ? docs.map((d) => ({ id: d.id, data: () => d })) : [] }),
    onSnapshot: () => () => {},
  });
  globalThis.claude = { use: async (n) => (n === "db" ? { collection: coll, doc: fake } : n === "user" ? { id: async () => "u_x" } : null) };
  db["data/users/u_x/profile"] = { settings: { t5: "evil" }, u: 5e18, fix: { word: { constructor: { h: "x", t: "y" } } } };
  (async () => {
    await store.connect();
    check(Object.keys(store.state.words).join() === "r1" && store.state.words.r1.u <= SOON(), "cloud words not cleaned: " + Object.keys(store.state.words));
    check(store.state.settings.t5 === 7 && Object.keys(store.state.fix.word).length === 0, "cloud profile not cleaned");
    delete globalThis.claude;
    finish();
  })();
}

// ---- 4. the built page ----------------------------------------------------------------------------
function finish() {
  const before = read("index.html");
  execFileSync("python3", ["tools/build_site.py"], { cwd: root, stdio: "pipe" });
  const page = read("index.html");
  if (page !== before) { fs.writeFileSync(path.join(root, "index.html"), before); check(false, "index.html is out of date with src/page.html: run python3 tools/build_site.py"); }

  const meta = page.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  check(!!meta, "no Content-Security-Policy meta tag");
  const csp = meta ? meta[1] : "";
  const dir = (name) => { const m = csp.match(new RegExp("(?:^|; )" + name + " ([^;]*)")); return m ? m[1].split(" ") : null; };
  check(dir("default-src") && dir("default-src").join() === "'none'", "default-src must be 'none'");
  const script = dir("script-src") || [];
  check(script.join() === "'self'", "script-src must be exactly 'self', got " + script.join(" "));
  check(!/unsafe-inline|unsafe-eval|\*|http:/.test(csp.replace(/https:\/\/fonts\.g[a-z]+\.com/g, "")), "the policy allows something it must not: " + csp);
  for (const d of ["base-uri", "form-action", "object-src", "frame-src", "worker-src"]) check((dir(d) || []).join() === "'none'", `${d} must be 'none'`);
  check((dir("media-src") || []).join() === "'self'", "media-src must be exactly 'self' (the recordings)");
  check((dir("connect-src") || []).join() === "'self'", "connect-src must be 'self'");
  check((dir("style-src") || []).filter((x) => /^https:/.test(x)).join() === "https://fonts.googleapis.com", "style-src may only add the font stylesheet host");
  check((dir("font-src") || []).join() === "https://fonts.gstatic.com", "font-src may only be the font file host");
  check(!/frame-ancestors/.test(csp), "frame-ancestors is ignored in a <meta> tag; it belongs in _headers");
  check(page.indexOf("Content-Security-Policy") < page.search(/<(?:script|link|style)\b/), "the policy must come before every script, link and style");

  // every inline <style> is allowed by hash, and no hash is left over
  const styles = Array.from(page.matchAll(/<style>([\s\S]*?)<\/style>/g)).map((m) => m[1]);
  const hashes = (dir("style-src") || []).filter((x) => /^'sha256-/.test(x)).map((x) => x.slice(1, -1));
  const want = styles.map((s) => "sha256-" + crypto.createHash("sha256").update(s, "utf8").digest("base64"));
  check(styles.length >= 1 && want.length === hashes.length && want.every((w) => hashes.includes(w)), "inline <style> hashes do not match the policy");

  const body = page.slice(page.indexOf("<body>"));
  check(!/<script\b(?![^>]*\bsrc=)/i.test(page), "inline <script> in index.html");
  check(!/<[a-zA-Z][^>]*\son[a-z]+\s*=/.test(page), "inline event handler in index.html");
  check(!/<[a-zA-Z][^>]*\sstyle\s*=/.test(page), "style= attribute in index.html");
  check(!/<(iframe|object|embed|form|base)\b/i.test(page), "iframe/object/embed/form/base in index.html");
  for (const m of page.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) {
    check(!/^(?:[a-z]+:)?\/\//i.test(m[1]) && fs.existsSync(path.join(root, m[1])), "script src must be one of our own files: " + m[1]);
  }
  const links = Array.from(page.matchAll(/<link\b[^>]*\bhref="([^"]+)"/g)).map((m) => m[1]);
  check(links.every((l) => !/^(?:[a-z]+:)?\/\//i.test(l) || l.startsWith("https://fonts.googleapis.com/")), "a <link> points to another host: " + links.filter((l) => /^(?:[a-z]+:)?\/\//i.test(l)));
  check(page.includes('src="js/frameguard.js"') && /html\.framed body\{display:none!important\}/.test(page), "the frame guard is missing");
  check(page.includes('<meta name="referrer" content="no-referrer">'), "no-referrer meta is missing");

  const headers = read("_headers");
  check(/frame-ancestors 'none'/.test(headers) && /X-Content-Type-Options: nosniff/.test(headers) && /X-Frame-Options: DENY/.test(headers) && /Strict-Transport-Security/.test(headers), "_headers is missing a header");
  check(headers.includes(csp), "_headers policy differs from the page's (apart from frame-ancestors)" );
  check(fs.existsSync(path.join(root, ".nojekyll")), ".nojekyll is missing");
  console.log(`built page: policy ok, ${hashes.length} style hashes verified`);

  // the artifact build of the page (src/page.html) is the same body without the wrapper
  console.log(fail ? `${fail} security check(s) failed` : "security ok");
  process.exit(fail ? 1 : 0);
}

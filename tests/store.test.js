/* The sync logic in store.js against an in-memory stand-in for the Artifact database.
 * It checks the merge rules; it cannot stand in for the real service. */
function fakeStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}

function fakeDb(docs, opts) {
  opts = opts || {};
  const listeners = [];
  const log = { sets: [], deletes: [], active: 0, maxActive: 0 };
  const snap = (path) => ({ id: path.split("/").pop(), exists: path in docs, data: () => (path in docs ? Object.freeze(JSON.parse(JSON.stringify(docs[path]))) : undefined) });
  const collSnap = (prefix) => ({ docs: Object.keys(docs).filter(p => p.startsWith(prefix + "/") && p.slice(prefix.length + 1).indexOf("/") < 0).map(snap) });
  const doc = (path) => ({
    id: path.split("/").pop(), path,
    get: async () => snap(path),
    set: async (body) => {
      log.active++; log.maxActive = Math.max(log.maxActive, log.active);
      await new Promise(r => setTimeout(r, 2));
      log.active--;
      if (opts.failOnce && opts.failOnce[path]) { const code = opts.failOnce[path]; delete opts.failOnce[path]; throw { code, message: code }; }
      docs[path] = JSON.parse(JSON.stringify(body)); log.sets.push(path);
      listeners.forEach(l => { if (path.startsWith(l.prefix + "/")) l.fn(collSnap(l.prefix)); });
    },
    delete: async () => { delete docs[path]; log.deletes.push(path); },
    collection: (name) => coll(path + "/" + name),
  });
  const coll = (path) => ({
    path, doc: (id) => doc(path + "/" + id),
    get: async () => collSnap(path),
    onSnapshot: (fn) => { listeners.push({ prefix: path, fn }); return () => {}; },
  });
  return { api: { doc, collection: coll }, log, docs };
}

async function load(storage, claude) {
  delete require.cache[require.resolve("../js/store.js")];
  globalThis.TG = {};
  globalThis.localStorage = storage;
  globalThis.claude = claude;
  return require("../js/store.js").store;
}

const settle = () => new Promise(r => setTimeout(r, 120));

(async () => {
  let fail = 0;
  const check = (ok, msg) => { if (!ok) { fail++; console.log("FAIL", msg); } };
  const UID = "u_test";
  const base = `data/users/${UID}/profile`;

  // 1. local only: no window.claude at all
  let store = await load(fakeStorage(), undefined);
  check((await store.connect()) === false && store.cloud.status === "local", "standalone stays local");
  const w = store.addWord({ h: "媠", t: "suí", m: "漂亮" });
  check(store.listWords().length === 1 && store.findWord("媠", "suí").id === w.id, "add word locally");
  store.removeWord(w.id);
  check(store.listWords().length === 0 && store.state.words[w.id].del === true, "delete leaves a tombstone");

  // 2. first connect: local words go up, remote words come down, the newer copy wins
  const now = Date.now();
  const storage = fakeStorage({
    "taigi.v1.words": JSON.stringify({
      a: { id: "a", h: "食", t: "tsia̍h", c: 1, u: now - 5000 },
      b: { id: "b", h: "啉", t: "lim", m: "local edit", c: 2, u: now - 1000 },
      old: { id: "old", del: true, c: 1, u: now - 40 * 86400000 },
    }),
    "taigi.v1.profile": JSON.stringify({ settings: { t5: 3 }, fix: { word: {}, read: {} }, meta: {}, u: 10 }),
  });
  const db = fakeDb({
    [`${base}/words/b`]: { id: "b", h: "啉", t: "lim", m: "remote, older", c: 2, u: now - 9000 },
    [`${base}/words/c`]: { id: "c", h: "睏", t: "khùn", c: 3, u: now - 100 },
    [`${base}/words/old`]: { id: "old", del: true, c: 1, u: now - 40 * 86400000 },
    [`data/users/${UID}/profile`]: { settings: { t5: 7, contour: false }, fix: { word: { "喜歡": { h: "愛", t: "ài" } }, read: {} }, meta: { streak: 4 }, u: 99 },
  });
  const claude = { use: async (name) => (name === "db" ? db.api : name === "user" ? { id: async () => UID } : null) };
  store = await load(storage, claude);
  check((await store.connect()) === true, "connect resolves true");
  await settle();
  check(store.cloud.status === "synced", "status synced, got " + store.cloud.status);
  check(store.listWords().map(x => x.id).sort().join() === "a,b,c", "merged words: " + store.listWords().map(x => x.id));
  check(store.state.words.b.m === "local edit" && db.docs[`${base}/words/b`].m === "local edit", "newer local copy wins and is pushed");
  check(!!db.docs[`${base}/words/a`], "local-only word pushed");
  check(!(`${base}/words/old` in db.docs) && !store.state.words.old, "old tombstone purged on both sides");
  check(store.state.settings.t5 === 7 && store.state.settings.contour === false && store.state.fix.word["喜歡"].h === "愛" && store.state.meta.streak === 4, "newer remote profile adopted");

  // 3. later changes are written through, one at a time
  const added = store.addWord({ h: "行", t: "kiânn" });
  store.updateWord(added.id, { m: "走" });
  store.setSetting("t5", 3);
  store.removeWord("a");
  await settle();
  check(db.docs[`${base}/words/${added.id}`].m === "走", "add+update reaches the cloud");
  check(db.docs[`data/users/${UID}/profile`].settings.t5 === 3, "settings reach the cloud");
  check(db.docs[`${base}/words/a`].del === true, "delete is synced as a tombstone");
  check(db.log.maxActive === 1, "writes are serialized, max concurrent = " + db.log.maxActive);

  // 4. a change made on another device arrives through the subscription
  await db.api.doc(`${base}/words/z`).set({ id: "z", h: "厝", t: "tshù", c: 9, u: Date.now() + 5 });
  await settle();
  check(!!store.findWord("厝"), "remote addition shows up");
  await db.api.doc(`${base}/words/z`).set({ id: "z", del: true, c: 9, u: Date.now() + 50 });
  await settle();
  check(!store.findWord("厝"), "remote deletion shows up");

  // 5. a passing failure is retried
  const db2 = fakeDb({}, { failOnce: { [`${base}/words/r1`]: "unavailable" } });
  store = await load(fakeStorage({ "taigi.v1.words": JSON.stringify({ r1: { id: "r1", h: "雨", t: "hōo", c: 1, u: 5 } }) }),
    { use: async (name) => (name === "db" ? db2.api : name === "user" ? { id: async () => UID } : null) });
  await store.connect();
  await new Promise(r => setTimeout(r, 1800));
  check(!!db2.docs[`${base}/words/r1`] && store.cloud.status === "synced", "retry after 'unavailable': " + store.cloud.status);

  // 6. signed out / capability missing: stay local without throwing
  store = await load(fakeStorage(), { use: async () => null });
  check((await store.connect()) === false && store.cloud.status === "local", "null capability stays local");
  store = await load(fakeStorage(), { use: async (n) => (n === "db" ? fakeDb({}).api : { id: async () => null }) });
  check((await store.connect()) === false && store.cloud.status === "local", "no user id stays local");

  // 7. backup round trip
  store = await load(fakeStorage(), undefined);
  store.addWord({ h: "媠", t: "suí", m: "漂亮" });
  store.fixWord("喜歡", "佮意", "kah-ì");
  const backup = store.exportAll();
  store = await load(fakeStorage(), undefined);
  check(store.importAll(backup) === 1 && store.listWords()[0].h === "媠" && store.state.fix.word["喜歡"].t === "kah-ì", "backup round trip");
  let threw = false;
  try { store.importAll('{"app":"other"}'); } catch (e) { threw = true; }
  check(threw, "foreign backup is refused");
  threw = "";
  try { store.importAll("not json"); } catch (e) { threw = e.message; }
  check(/不完整/.test(threw), "broken backup gets a readable message: " + threw);
  // a word deleted after the backup was taken comes back when the backup is imported
  store.removeWord(store.listWords()[0].id);
  check(store.listWords().length === 0 && store.importAll(backup) === 1 && store.listWords().length === 1, "import restores a deleted word");

  console.log(fail ? `${fail} failed` : "store ok");
  process.exit(fail ? 1 : 0);
})();

/* 使用者資料：設定、更正、生字簿、收藏的句子。
 *
 * 永遠先寫進這台裝置的 localStorage（畫面立刻更新）。
 * 頁面如果是在 Claude 的 Artifact 裡開啟，另外同步到帳號專屬的資料庫
 * （data/users/<自己的 id>/…，只有本人讀得到），手機和平板就會看到同一份生字簿。
 * 放在一般網站上則只有 localStorage。
 *
 * 安全：資料有三個來源不是這支程式自己寫的——瀏覽器儲存空間、匯入的備份、雲端資料庫。
 * 它們一律先經過下面的 clean*() 才會進到 state：欄位型別、長度、數值範圍都檢查過，
 * 用 null 原型的物件裝（__proto__、constructor 這類名字只是普通的鍵），
 * 時間戳不能超過「現在 + 1 天」（否則一筆偽造的資料可以永遠蓋過之後所有的修改）。
 * 畫面只用 textContent 顯示這些資料，所以就算有人塞了 HTML，也只會看到文字。
 */
(function (root) {
  "use strict";
  var TG = (root.TG = root.TG || {});
  var PREFIX = "taigi.v1.";
  var TOMBSTONE_DAYS = 30;
  var RETRY_MS = 1500;

  // ---- validation ------------------------------------------------------------------

  var LIMIT = {
    id: 80, hanji: 100, tailo: 200, meaning: 500, note: 2000, src: 500, text: 4000,
    segs: 200, words: 5000, sents: 2000, fixes: 2000, history: 40, backup: 8000000
  };
  var MODES = ["", "huayu", "taigi", "tailo"];
  var FRONTS = ["hanji", "meaning"];
  var ID = /^[A-Za-z0-9_.:@+~-]{1,80}$/;
  var DAY = /^\d{4}-\d{2}-\d{2}$/;
  var NUM_KEY = /^\d{1,3}$/;
  var hasOwn = Object.prototype.hasOwnProperty;

  function dict() { return Object.create(null); }
  function bad(k) { return k === "__proto__" || k === "constructor" || k === "prototype"; }
  function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }

  function str(v, max) {
    if (typeof v !== "string") return "";
    if (v.length <= max) return v;
    return Array.from(v.slice(0, max * 2)).slice(0, max).join("");
  }

  function int(v, lo, hi, fallback) {
    if (typeof v !== "number" || !isFinite(v)) return fallback;
    v = Math.floor(v);
    return v < lo ? lo : v > hi ? hi : v;
  }

  function day(v) { return typeof v === "string" && DAY.test(v) ? v : ""; }
  function stamp(v) { return int(v, 0, Date.now() + 86400000, 0); }
  function oneOf(list, v, fallback) { return typeof v === "string" && list.indexOf(v) >= 0 ? v : fallback; }
  function goodId(v) { return typeof v === "string" && ID.test(v) && !bad(v); }

  function cleanSettings(s) {
    s = isObj(s) ? s : {};
    return { t5: s.t5 === 3 ? 3 : 7, contour: s.contour !== false, front: oneOf(FRONTS, s.front, "hanji"), remember: s.remember !== false };
  }

  function cleanMeta(m) {
    m = isObj(m) ? m : {};
    return { streak: int(m.streak, 0, 100000, 0), lastDay: day(m.lastDay), doneDay: day(m.doneDay), done: int(m.done, 0, 1000000, 0) };
  }

  function cleanFix(f) {
    var out = { word: dict(), read: dict() };
    if (!isObj(f)) return out;
    var n = 0, k, v, t;
    if (isObj(f.word)) {
      for (k in f.word) {
        if (n >= LIMIT.fixes) break;
        if (!hasOwn.call(f.word, k) || bad(k) || !k || k.length > LIMIT.src) continue;
        v = f.word[k];
        t = isObj(v) ? str(v.t, LIMIT.tailo) : "";
        if (!t) continue;
        out.word[k] = { h: str(v.h, LIMIT.hanji), t: t };
        n++;
      }
    }
    n = 0;
    if (isObj(f.read)) {
      for (k in f.read) {
        if (n >= LIMIT.fixes) break;
        if (!hasOwn.call(f.read, k) || bad(k) || !k || k.length > LIMIT.hanji) continue;
        t = str(f.read[k], LIMIT.tailo);
        if (!t) continue;
        out.read[k] = t;
        n++;
      }
    }
    return out;
  }

  /** ov: { 詞序號: { 音節序號: "base" | "sandhi" } } */
  function cleanOv(o) {
    var out = dict();
    if (!isObj(o)) return out;
    for (var a in o) {
      if (!hasOwn.call(o, a) || !NUM_KEY.test(a) || !isObj(o[a])) continue;
      var inner = dict(), any = false;
      for (var b in o[a]) {
        if (hasOwn.call(o[a], b) && NUM_KEY.test(b) && (o[a][b] === "base" || o[a][b] === "sandhi")) { inner[b] = o[a][b]; any = true; }
      }
      if (any) out[a] = inner;
    }
    return out;
  }

  function cleanSeg(p) {
    if (!isObj(p)) return null;
    if (typeof p.p === "string") return { p: str(p.p, 20) };
    return { src: str(p.src, LIMIT.hanji), h: str(p.h, LIMIT.hanji), t: str(p.t, LIMIT.tailo), e: int(p.e, 0, 10000000, 0), s: int(p.s, -1, 99, -1), ov: cleanOv(p.ov) };
  }

  function cleanSegs(list) {
    var out = [];
    if (!Array.isArray(list)) return out;
    for (var i = 0; i < list.length && out.length < LIMIT.segs; i++) {
      var s = cleanSeg(list[i]);
      if (s) out.push(s);
    }
    return out;
  }

  function cleanWord(x) {
    if (!isObj(x) || !goodId(x.id)) return null;
    if (x.del === true) return { id: x.id, del: true, c: stamp(x.c), u: stamp(x.u) };
    var w = {
      id: x.id, h: str(x.h, LIMIT.hanji), t: str(x.t, LIMIT.tailo), m: str(x.m, LIMIT.meaning), n: str(x.n, LIMIT.note),
      ref: int(x.ref, 0, 10000000, 0), ex: str(x.ex, LIMIT.meaning), c: stamp(x.c), u: stamp(x.u),
      lv: int(x.lv, 0, 7, 0), due: day(x.due), seen: int(x.seen, 0, 1000000, 0)
    };
    return w.h || w.t ? w : null;        // nothing to show or review
  }

  function cleanSent(x) {
    if (!isObj(x) || !goodId(x.id)) return null;
    if (x.del === true) return { id: x.id, del: true, c: stamp(x.c), u: stamp(x.u) };
    var s = {
      id: x.id, src: str(x.src, LIMIT.src), mode: oneOf(MODES, x.mode, ""), segs: cleanSegs(x.segs),
      h: str(x.h, LIMIT.text), t: str(x.t, LIMIT.text), c: stamp(x.c), u: stamp(x.u)
    };
    return s.h || s.t || s.segs.length ? s : null;
  }

  function cleanHistoryEntry(x) {
    if (!isObj(x) || typeof x.src !== "string" || !x.src) return null;
    return { src: str(x.src, LIMIT.src), mode: oneOf(MODES, x.mode, ""), segs: cleanSegs(x.segs), edited: x.edited === true };
  }

  function cleanHistory(list) {
    var out = [];
    if (!Array.isArray(list)) return out;
    for (var i = 0; i < list.length && out.length < LIMIT.history; i++) {
      var e = cleanHistoryEntry(list[i]);
      if (e) out.push(e);
    }
    return out;
  }

  var CLEAN = { words: cleanWord, sents: cleanSent };
  var CAP = { words: LIMIT.words, sents: LIMIT.sents };

  /** array or {id: item} -> null-prototype map of cleaned items; at most `cap` entries. */
  function cleanCollection(kind, raw, cap) {
    var out = dict();
    if (!raw || typeof raw !== "object") return out;
    var items = Array.isArray(raw) ? raw : Object.keys(raw).map(function (k) { return raw[k]; });
    var n = 0;
    for (var i = 0; i < items.length && n < cap; i++) {
      var c = CLEAN[kind](items[i]);
      if (c) { out[c.id] = c; n++; }
    }
    return out;
  }

  function merge(dst, src) {
    Object.keys(src).forEach(function (k) { if (!bad(k)) dst[k] = src[k]; });
    return dst;
  }

  // ---- state -----------------------------------------------------------------------

  var state = {
    settings: cleanSettings(),
    fix: cleanFix(),                  // word: 華語詞 -> {h,t}；read: 漢字 -> 台羅
    meta: cleanMeta(),
    words: dict(),                    // id -> 生詞
    sents: dict(),                    // id -> 句子
    history: [],                      // 最近轉換過的句子（只留在這台裝置）
    u: 0                              // settings/fix/meta 最後修改時間
  };
  var listeners = [];
  var cloud = { on: false, status: "local", error: "" };
  var storage = { ok: true };         // false: 這個瀏覽器存不進資料（無痕模式、空間已滿）

  // ---- local ----------------------------------------------------------------

  function read(key) {
    try {
      var s = root.localStorage.getItem(PREFIX + key);
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  }

  function write(key, value) {
    var ok = true;
    try { root.localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { ok = false; }
    if (ok !== storage.ok) { storage.ok = ok; emit("storage"); }
    return ok;
  }

  function probe() {
    try { var k = PREFIX + "probe"; root.localStorage.setItem(k, "1"); root.localStorage.removeItem(k); return true; }
    catch (e) { return false; }
  }

  function load() {
    storage.ok = probe();
    var p = read("profile");
    if (isObj(p)) {
      state.settings = cleanSettings(p.settings);
      state.fix = cleanFix(p.fix);
      state.meta = cleanMeta(p.meta);
      state.u = stamp(p.u);
    }
    state.words = cleanCollection("words", read("words"), CAP.words * 2);     // room for tombstones
    state.sents = cleanCollection("sents", read("sents"), CAP.sents * 2);
    state.history = cleanHistory(read("history"));
  }

  function saveProfile(local) {
    if (!local) state.u = Date.now();
    write("profile", { settings: state.settings, fix: state.fix, meta: state.meta, u: state.u });
    if (!local) pushProfile();
  }

  function emit(what) {
    listeners.forEach(function (fn) { try { fn(what); } catch (e) { root.console && console.error(e); } });
  }

  function on(fn) { listeners.push(fn); }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ---- settings / fixes -------------------------------------------------------

  function setSetting(key, value) {
    var next = merge({}, state.settings);
    if (!bad(key)) next[key] = value;
    state.settings = cleanSettings(next);
    saveProfile();
    emit("settings");
  }

  /** 記住：這個華語詞以後都用這個說法。 */
  function fixWord(src, hanji, tailo) {
    if (typeof src !== "string" || !src || bad(src) || src.length > LIMIT.src) return;
    var t = str(tailo, LIMIT.tailo);
    if (!t) return;
    state.fix.word[src] = { h: str(hanji, LIMIT.hanji), t: t };
    saveProfile();
    emit("fix");
  }

  /** 記住：這個台語詞的讀音。 */
  function fixReading(hanji, tailo) {
    if (typeof hanji !== "string" || !hanji || bad(hanji) || hanji.length > LIMIT.hanji) return;
    var t = str(tailo, LIMIT.tailo);
    if (!t) return;
    state.fix.read[hanji] = t;
    saveProfile();
    emit("fix");
  }

  function removeFix(kind, key) {
    if (kind !== "word" && kind !== "read") return;
    delete state.fix[kind][key];
    saveProfile();
    emit("fix");
  }

  function setMeta(patch) {
    state.meta = cleanMeta(merge(merge({}, state.meta), isObj(patch) ? patch : {}));
    saveProfile();
    emit("meta");
  }

  // ---- collections: words / sentences ---------------------------------------

  function live(map) {
    return Object.keys(map).map(function (k) { return map[k]; }).filter(function (x) { return !x.del; });
  }

  function listWords() {
    return live(state.words).sort(function (a, b) { return b.c - a.c; });
  }

  function listSents() {
    return live(state.sents).sort(function (a, b) { return b.c - a.c; });
  }

  /** Everything written by the app goes through the same cleaning as outside data. */
  function put(kind, item) {
    var clean = CLEAN[kind](item);
    if (!clean) return null;
    clean.u = Date.now();
    state[kind][clean.id] = clean;
    write(kind, state[kind]);
    pushDoc(kind, clean);
    emit(kind);
    return clean;
  }

  function addWord(w) {
    var now = Date.now();
    return put("words", {
      id: newId(), h: w.h || "", t: w.t || "", m: w.m || "", n: w.n || "", ref: w.ref || 0,
      ex: w.ex || "", c: now, lv: 0, due: "", seen: 0
    });
  }

  function updateWord(id, patch) {
    var w = state.words[id];
    if (!w || w.del) return null;
    return put("words", merge(merge({}, w), isObj(patch) ? patch : {}));
  }

  function removeWord(id) {
    var w = state.words[id];
    if (!w) return;
    put("words", { id: id, del: true, c: w.c });
  }

  function findWord(hanji, tailo) {
    var list = live(state.words);
    for (var i = 0; i < list.length; i++) {
      if (list[i].h === hanji && (!tailo || !list[i].t || list[i].t === tailo)) return list[i];
    }
    return null;
  }

  function addSent(s) {
    return put("sents", { id: newId(), src: s.src || "", mode: s.mode || "", segs: s.segs || [], h: s.h || "", t: s.t || "", c: Date.now() });
  }

  function removeSent(id) {
    var s = state.sents[id];
    if (!s) return;
    put("sents", { id: id, del: true, c: s.c });
  }

  // ---- history (local only) ---------------------------------------------------

  function remember(entry) {
    var e = cleanHistoryEntry(entry);
    if (!e) return;
    state.history = state.history.filter(function (h) { return h.src !== e.src; });
    state.history.unshift(e);
    if (state.history.length > LIMIT.history) state.history.length = LIMIT.history;
    write("history", state.history);
  }

  function recall(src) {
    for (var i = 0; i < state.history.length; i++) if (state.history[i].src === src) return state.history[i];
    return null;
  }

  // ---- backup -------------------------------------------------------------------

  function exportAll() {
    return JSON.stringify({
      app: "taigi-notebook", version: 1, exported: new Date().toISOString(),
      settings: state.settings, fix: state.fix, meta: state.meta,
      words: listWords(), sents: listSents()
    }, null, 1);
  }

  /**
   * 匯入備份：備份裡有、這裡沒有（或已經刪掉）的加回來；兩邊都有的留較新的那一筆。
   * 不會刪除現有資料。回傳加回來或更新的筆數。
   * 備份可能是別人給的，所以一切照「外來資料」處理：太大的不收，每個欄位都過 clean*()。
   */
  function importAll(text) {
    if (typeof text !== "string" || text.length > LIMIT.backup) throw new Error("這份備份太大了（超過 8 MB），不像是這個網站匯出的");
    var data;
    try { data = JSON.parse(text); } catch (e) { throw new Error("內容不完整，請貼上整份備份"); }
    if (!isObj(data) || data.app !== "taigi-notebook") throw new Error("這不是台語生字簿的備份");
    var n = 0;
    ["words", "sents"].forEach(function (kind) {
      var incoming = Array.isArray(data[kind]) ? data[kind].slice(0, CAP[kind]) : [];
      var room = CAP[kind] - live(state[kind]).length;
      incoming.forEach(function (raw) {
        var item = CLEAN[kind](raw);
        if (!item || item.del) return;
        var mine = state[kind][item.id];
        var restore = !!mine && mine.del;
        if (!mine && room <= 0) return;
        if (!mine || restore || item.u > mine.u) {
          if (restore) item.u = Date.now();      // newer than the deletion, so other devices bring it back too
          if (!mine) room--;
          state[kind][item.id] = item;
          pushDoc(kind, item);
          n++;
        }
      });
      write(kind, state[kind]);
      emit(kind);
    });
    if (isObj(data.fix)) {
      var fix = cleanFix(data.fix);
      merge(state.fix.word, fix.word);
      merge(state.fix.read, fix.read);
    }
    if (isObj(data.settings)) state.settings = cleanSettings(data.settings);
    saveProfile();
    emit("settings");
    emit("fix");
    return n;
  }

  // ---- cloud (Claude Artifact database) ----------------------------------------

  var refs = null;          // { profile, words, sents }
  var queue = Promise.resolve();   // cloud writes go out one at a time
  var pending = {};         // key -> latest write for that document (a newer write replaces a waiting one)

  function setCloud(status, error) {
    cloud.status = status;
    cloud.on = status === "synced" || status === "syncing";
    cloud.error = error || "";
    emit("cloud");
  }

  function wait(ms) { return new Promise(function (r) { root.setTimeout(r, ms); }); }

  /** One write at a time; a transient failure is retried once, and whatever still fails
   *  is picked up again by reconcile() the next time the page opens. */
  function chain(key, fn) {
    var fresh = !(key in pending);
    pending[key] = fn;
    if (!fresh) return;
    queue = queue.then(function () {
      var job = pending[key];
      delete pending[key];
      return job().catch(function (e) {
        var code = e && e.code;
        if (code === "unavailable" || code === "resource_exhausted") return wait(RETRY_MS).then(job);
        throw e;
      });
    }).catch(function (e) {
      var code = e && e.code;
      if (code === "revoked" || code === "not_granted" || code === "capability_disabled" || code === "capability_removed") {
        refs = null;
        setCloud("local");
      } else if (code === "quota_exceeded") setCloud("error", "雲端空間滿了，新的資料只存在這台裝置。");
      else setCloud("error", "有些資料還沒同步上去，下次開啟會再試一次。");
    });
  }

  function pushDoc(kind, item) {
    if (!refs) return;
    var body = JSON.parse(JSON.stringify(item));
    chain(kind + "/" + item.id, function () { return refs[kind].doc(item.id).set(body); });
  }

  function pushProfile() {
    if (!refs) return;
    var body = JSON.parse(JSON.stringify({ settings: state.settings, fix: state.fix, meta: state.meta, u: state.u }));
    chain("profile", function () { return refs.profile.set(body); });
  }

  function mergeRemote(kind, docs) {
    var changed = false;
    var room = CAP[kind] - live(state[kind]).length;
    docs.forEach(function (d) {
      var r = CLEAN[kind](d.data());
      if (!r) return;
      var mine = state[kind][r.id];
      if (!mine && r.del) return;          // a deletion of something this device never had
      if (!mine && room <= 0) return;
      if (!mine || r.u > mine.u) {
        if (!mine) room--;
        state[kind][r.id] = r;
        changed = true;
      }
    });
    if (changed) { write(kind, state[kind]); emit(kind); }
  }

  function reconcile(kind) {
    return refs[kind].get().then(function (snap) {
      var remote = dict();
      snap.docs.forEach(function (d) { var r = CLEAN[kind](d.data()); if (r) remote[r.id] = r; });
      mergeRemote(kind, snap.docs);
      var cutoff = Date.now() - TOMBSTONE_DAYS * 86400000;
      Object.keys(state[kind]).forEach(function (id) {
        var mine = state[kind][id];
        var theirs = remote[id];
        if (mine.del && mine.u < cutoff) {
          delete state[kind][id];
          if (theirs) chain(kind + "/" + id, function () { return refs[kind].doc(id).delete(); });
          return;
        }
        if (!theirs || mine.u > theirs.u) pushDoc(kind, mine);
      });
      write(kind, state[kind]);
      refs[kind].onSnapshot(function (s) { mergeRemote(kind, s.docs); }, function () { setCloud("local"); });
    });
  }

  function connect() {
    var claude = root.claude;
    if (!claude || typeof claude.use !== "function") return Promise.resolve(false);
    setCloud("syncing");
    return Promise.all([claude.use("db"), claude.use("user")]).then(function (caps) {
      var db = caps[0], user = caps[1];
      if (!db || !user) { setCloud("local"); return false; }
      return user.id().then(function (uid) {
        if (typeof uid !== "string" || !ID.test(uid)) { setCloud("local"); return false; }
        var profile = db.collection("data/users/" + uid).doc("profile");
        refs = { profile: profile, words: profile.collection("words"), sents: profile.collection("sents") };
        return profile.get().then(function (snap) {
          var r = snap.exists ? snap.data() : null;
          var ru = isObj(r) ? stamp(r.u) : 0;
          if (ru > state.u) {
            state.settings = cleanSettings(r.settings);
            state.fix = cleanFix(r.fix);
            state.meta = cleanMeta(r.meta);
            state.u = ru;
            saveProfile(true);
            emit("settings"); emit("fix"); emit("meta");
          } else if (state.u > ru) pushProfile();
          return Promise.all([reconcile("words"), reconcile("sents")]);
        }).then(function () { setCloud("synced"); return true; });
      });
    }).catch(function (e) {
      refs = null;
      setCloud("local", e && e.message ? e.message : "");
      return false;
    });
  }

  load();

  TG.store = {
    state: state,
    cloud: cloud,
    storage: storage,
    LIMIT: LIMIT,
    on: on,
    connect: connect,
    setSetting: setSetting,
    fixWord: fixWord,
    fixReading: fixReading,
    removeFix: removeFix,
    setMeta: setMeta,
    listWords: listWords,
    listSents: listSents,
    addWord: addWord,
    updateWord: updateWord,
    removeWord: removeWord,
    findWord: findWord,
    addSent: addSent,
    removeSent: removeSent,
    remember: remember,
    recall: recall,
    exportAll: exportAll,
    importAll: importAll
  };

  if (typeof module !== "undefined" && module.exports) module.exports = TG;
})(typeof window !== "undefined" ? window : globalThis);

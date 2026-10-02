/* Attack the running page with hostile text and check that none of it runs.
 *
 * Open the site in a browser, open the developer console, paste this whole file and press Enter.
 * It returns a JSON report; "problems" must be an empty list. (On a page with the Content-Security-Policy
 * the console may refuse pasted code; load the file instead with a <script src="tests/browser-xss.js">
 * element and read window.__xssReport when it has finished, about 20 seconds.)
 *
 * Every payload tries to run  window.__xss++  if the page ever treats text as HTML or code.
 * Each step feeds the payloads into one place that accepts text, then scans the page for things that
 * must never exist here: inline scripts, on*= attributes, <img>/<iframe>/<form>, javascript: links,
 * and links that open a new tab without rel="noopener". The page builds its screen from text nodes
 * only, so every one of these should show up as plain text.
 *
 * Run it against a copy WITHOUT the Content-Security-Policy to test the page's own code (the policy
 * would hide a bug by blocking the script), and again against the real page to test the policy.
 * It adds words, sentences and corrections to the notebook of the browser you run it in.
 */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__xss = 0;
  const PAYLOADS = [
    '<img src=x onerror="window.__xss++">',
    '<script>window.__xss++<\/script>',
    '"><svg onload="window.__xss++">',
    '\'><iframe srcdoc="<script>parent.__xss++<\/script>">',
    'javascript:window.__xss++',
    '</textarea></title></style><img src=x onerror="window.__xss++">',
    "' autofocus onfocus='window.__xss++' x='",
    '<a href="javascript:window.__xss++">x</a>',
    '<details open ontoggle="window.__xss++">',
    '${window.__xss++} {{constructor.constructor("window.__xss++")()}}',
    '\u202e<b onmouseover=window.__xss++>',
    '__proto__', 'constructor', 'toString',
  ];
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  const press = (text, scope) => {
    const b = $$('button, a.btn', scope || document).find((x) => x.textContent.includes(text));
    if (!b) throw new Error('no button: ' + text);
    b.click();
  };
  const report = { steps: {}, problems: [], errors: [] };
  window.addEventListener('error', (e) => report.errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => report.errors.push('promise: ' + String(e.reason)));

  const injected = () => {
    const bad = [];
    $$('*').forEach((el) => {
      const tag = el.tagName.toLowerCase();
      for (const a of Array.from(el.attributes)) if (/^on/i.test(a.name)) bad.push(tag + '[' + a.name + ']');
      if (tag === 'script' && !el.getAttribute('src')) bad.push('inline script');
      if (['iframe', 'object', 'embed', 'img', 'form'].includes(tag)) bad.push(tag);
      if (el.hasAttribute('srcdoc')) bad.push('srcdoc');
      const href = el.getAttribute('href');
      if (href && !/^(https:\/\/|blob:|#|[^:]*$)/i.test(href)) bad.push('href=' + href.slice(0, 30));
      if (tag === 'a' && el.getAttribute('target') === '_blank' && !/noopener/.test(el.rel || '') && !/noreferrer/.test(el.rel || '')) bad.push('a[_blank] without noopener noreferrer');
    });
    return bad;
  };
  const check = (step) => {
    const bad = injected();
    report.steps[step] = { executed: window.__xss, injected: bad.length };
    if (window.__xss) report.problems.push(step + ': a payload ran (' + window.__xss + ')');
    if (bad.length) report.problems.push(step + ': ' + bad.slice(0, 5).join(', '));
  };
  const shown = (needle) => document.body.innerText.includes(needle);

  // Negative control: the detector must catch an injection if one happens.
  const probe = document.createElement('img');
  probe.setAttribute('onerror', 'void 0');
  document.body.appendChild(probe);
  report.detectorCatchesInjection = injected().length >= 1;
  probe.remove();
  if (!report.detectorCatchesInjection) report.problems.push('the DOM scan cannot detect an injected element, so this run proves nothing');
  const positive = (name, ok) => { report.steps[name] = ok; if (!ok) report.problems.push(name + ': the payload never reached the screen, so that step proves nothing'); };

  // 1. converter, every input mode
  TG.app.go('convert');
  for (const mode of ['auto', 'huayu', 'taigi', 'tailo']) {
    $$('.modes .chip').find((c) => c.dataset.mode === mode).click();
    for (const p of PAYLOADS) { set('src-text', p); document.getElementById('go').click(); await sleep(15); }
    await sleep(60);
    check('converter/' + mode);
  }
  // Positive control: a payload typed into the converter must come out on screen as characters.
  set('src-text', PAYLOADS[0]); document.getElementById('go').click(); await sleep(60);
  positive('converter shows the payload as text', $$('#result .out-text').some((e) => e.textContent.includes('onerror')));

  // 2. dictionary search
  TG.app.go('dict');
  for (const p of PAYLOADS) { set('dict-q', p); await sleep(200); }
  check('dictionary search');
  set('dict-q', PAYLOADS[0]); await sleep(250);
  positive('dictionary shows the payload as text', shown(PAYLOADS[0]));

  // 3. notebook: add, list, edit sheet, filter
  TG.app.go('notebook');
  for (const p of PAYLOADS) {
    set('nb-h', p); set('nb-t', p); set('nb-m', p); set('nb-n', p);
    await sleep(250);
    press('加入生字簿', $('#view-notebook'));
    await sleep(30);
  }
  check('notebook add');
  positive('notebook list shows the payload as text', $('#nb-list').innerText.includes(PAYLOADS[0]));
  for (const row of $$('#nb-list .entry-row').slice(0, 8)) { row.click(); await sleep(30); check('word edit sheet'); TG.ui.closeAll(); }
  set('nb-filter', PAYLOADS[0]); await sleep(30); check('notebook filter');

  // 4. review: daily word and flashcards of the hostile words
  TG.app.go('review');
  const startBtn = $$('#session .btn').find((b) => b.textContent.includes('開始複習'));
  if (startBtn) {
    startBtn.click();
    for (let i = 0; i < 40; i++) {
      await sleep(10);
      const next = $$('#session .btn').find((b) => b.textContent.includes('看答案')) || $$('#session .grade .btn')[2];
      if (!next) break;
      next.click();
    }
  }
  check('review');

  // 5. saved sentences
  TG.app.go('notebook');
  for (const p of PAYLOADS) {
    TG.store.addSent({ src: p, mode: 'huayu', segs: [{ p: p }, { src: p, h: p, t: p, e: 0, s: -1, ov: { 0: { 0: 'sandhi' } } }], h: p, t: p });
  }
  $$('#view-notebook .seg-toggle button').find((b) => b.textContent.includes('句子')).click();
  await sleep(60);
  check('sentence list');
  positive('sentence list shows the payload as text', $('#nb-list').innerText.includes(PAYLOADS[0]));
  for (const row of $$('#nb-list .sent-main').slice(0, 14)) { row.click(); await sleep(40); check('open saved sentence'); TG.app.go('notebook'); }

  // 6. correction sheet with hostile custom entries
  TG.app.go('convert');
  $$('.modes .chip').find((c) => c.dataset.mode === 'huayu').click();
  set('src-text', '我愛你'); document.getElementById('go').click(); await sleep(100);
  for (const p of PAYLOADS) {
    $('#result button.seg').click(); await sleep(40);
    set('fix-hanji', p); set('fix-tailo', p);
    press('套用', $('#sheet')); await sleep(40);
    TG.ui.closeAll();
  }
  check('correction sheet');

  // 7. backup import: hostile fields, hostile keys, hostile types
  TG.app.go('more');
  const evil = {
    app: 'taigi-notebook', version: 1,
    settings: JSON.parse('{"__proto__":{"polluted":1},"t5":"9"}'),
    fix: { word: JSON.parse('{"__proto__":{"h":"x","t":"y"},"constructor":{"h":"a","t":"b"}}'), read: {} },
    words: PAYLOADS.map((p, i) => ({ id: 'e' + i, h: p, t: p, m: p, n: p, c: 1, u: 1, lv: p, due: p, ref: p })),
    sents: PAYLOADS.map((p, i) => ({ id: 's' + i, src: p, mode: p, segs: p, h: p, t: p, c: 1, u: 1 })),
  };
  set('backup-text', JSON.stringify(evil));
  press('匯入備份', $('#view-more')); await sleep(80);
  check('backup import');
  TG.app.go('notebook'); await sleep(60); check('notebook after import');
  TG.app.go('more'); await sleep(60); check('more after import');

  // 8. the address bar
  location.hash = '#<img src=x onerror=window.__xss++>'; await sleep(80); check('url hash');
  location.hash = '#convert'; await sleep(30);

  report.global = {
    objectPrototypeKeys: Object.keys(Object.prototype),
    emptyObjectHasPolluted: ({}).polluted !== undefined,
    settingsT5: TG.store.state.settings.t5,
  };
  if (report.global.objectPrototypeKeys.length || report.global.emptyObjectHasPolluted) report.problems.push('Object.prototype was changed');
  if (report.errors.length) report.problems.push('uncaught errors: ' + report.errors.slice(0, 3).join(' | '));
  window.__xssReport = report;     // also readable after loading this file with <script src>, where a return value is lost
  return JSON.stringify(report, null, 1);
})()

/* White Cube demo kit — shared helpers (no dependencies, works offline). */
(function () {
  const WC = {};

  /* ---------- Speech (Web Speech API, uses the Mac's built-in voices) ---------- */
  let voicesReady = null;
  WC.voices = function () {
    if (!('speechSynthesis' in window)) return Promise.resolve([]);
    if (voicesReady) return voicesReady;
    voicesReady = new Promise((resolve) => {
      const have = speechSynthesis.getVoices();
      if (have.length) return resolve(have);
      speechSynthesis.onvoiceschanged = () => resolve(speechSynthesis.getVoices());
      setTimeout(() => resolve(speechSynthesis.getVoices()), 1500);
    });
    return voicesReady;
  };

  /**
   * Pick the best voice for a BCP-47 language tag.
   * prefer: list of voice-name fragments in order of preference, e.g. ["Daniel", "Serena"].
   */
  WC.pickVoice = async function (lang, prefer = []) {
    const all = await WC.voices();
    const base = lang.split('-')[0];
    const norm = (s) => s.replace('_', '-').toLowerCase();
    const exact = all.filter((v) => norm(v.lang) === lang.toLowerCase());
    const loose = all.filter((v) => norm(v.lang).startsWith(base));
    const pool = exact.length ? exact : loose;
    for (const p of prefer) {
      const hit = pool.find((v) => v.name.includes(p));
      if (hit) return hit;
    }
    // Avoid the novelty macOS voices
    const novelty = /Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Wobble|Jester|Zarvox|Trinoids|Whisper|Organ|Superstar|Good News|Albert|Fred|Junior|Ralph|Kathy|Grandma|Grandpa|Rocko/;
    return pool.find((v) => !novelty.test(v.name)) || pool[0] || null;
  };

  /**
   * Speak text. Returns a promise that resolves when finished (or is cancelled).
   * opts: { lang, prefer, rate, pitch, onBoundary }
   */
  WC.speak = async function (text, opts = {}) {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = opts.lang || 'en-GB';
    const v = await WC.pickVoice(u.lang, opts.prefer || ['Daniel', 'Serena', 'Kate']);
    if (v) u.voice = v;
    u.rate = opts.rate ?? 1;
    u.pitch = opts.pitch ?? 1;
    if (opts.onBoundary) u.onboundary = opts.onBoundary;
    return new Promise((resolve) => {
      u.onend = resolve;
      u.onerror = resolve;
      speechSynthesis.speak(u);
    });
  };
  WC.stopSpeaking = function () { if ('speechSynthesis' in window) speechSynthesis.cancel(); };

  /* ---------- Small utilities ---------- */
  WC.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  WC.$ = (sel, root = document) => root.querySelector(sel);
  WC.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  WC.el = function (tag, attrs = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c != null) n.append(c.nodeType ? c : document.createTextNode(c));
    return n;
  };

  /** Type text into an element character by character (for "agent is writing" moments). */
  WC.typeInto = async function (node, text, cps = 60) {
    node.textContent = '';
    for (const ch of text) {
      node.textContent += ch;
      await WC.sleep(1000 / cps);
    }
  };

  WC.money = (n, cur = 'GBP', locale = 'en-GB') =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n);

  /** Presenter shortcut: press "." to toggle a small help overlay listing key bindings. */
  WC.keys = function (map) {
    document.addEventListener('keydown', (e) => {
      if (e.target && e.target.matches && e.target.matches('input, textarea')) return;
      const fn = map[e.key];
      if (fn) { e.preventDefault(); fn(e); }
    });
  };

  /* ---------- Demo switcher ----------
     Five small cubes in every demo's header: the current demo is solid. Click to jump,
     or press [ and ] for the previous / next demo. Skipped when a demo is deployed on its
     own (<html data-standalone>), so a standalone mini-golf site has no dead links. */
  WC.DEMOS = [
    { n: '00', dir: '00-white-cube', name: 'White Cube at a glance' },
    { n: '01', dir: '01-assistant', name: 'Atelier, your morning assistant' },
    { n: '02', dir: '02-morning-brief', name: 'The gallery morning brief' },
    { n: '03', dir: '03-month-end', name: 'Month-end close agent' },
    { n: '04', dir: '04-mini-golf', name: 'Mini Golf Open' },
  ];
  WC.demoNav = function () {
    if (document.documentElement.hasAttribute('data-standalone')) return;
    const header = document.querySelector('.wc-header');
    const m = location.pathname.match(/\/(0\d-[\w-]+)\/?/);
    if (!header || !m) return;
    const i = WC.DEMOS.findIndex((d) => d.dir === m[1]);
    if (i < 0) return;
    const nav = document.createElement('div');   // a div, so demos' own "header nav" rules don't restyle it
    nav.className = 'wc-demos';
    nav.setAttribute('role', 'navigation');
    nav.setAttribute('aria-label', 'Demos');
    const go = (j) => { location.href = '../' + WC.DEMOS[j].dir + '/'; };
    const btn = (label, title, j, cls) => {
      const a = document.createElement(j === undefined ? 'span' : 'a');
      a.className = cls; a.title = title; a.innerHTML = label;
      if (j !== undefined) a.href = j === null ? '../' : '../' + WC.DEMOS[j].dir + '/';
      return a;
    };
    const last = WC.DEMOS.length - 1;
    nav.append(
      i > 0 ? btn('‹', `Previous: ${WC.DEMOS[i - 1].n} · ${WC.DEMOS[i - 1].name}  [`, i - 1, 'wc-demos-arrow') : btn('‹', '', undefined, 'wc-demos-arrow is-off'),
      btn(`<b>${WC.DEMOS[i].n}</b><span>/0${last}</span>`, 'All demos', null, 'wc-demos-here'),
      i < last ? btn('›', `Next: ${WC.DEMOS[i + 1].n} · ${WC.DEMOS[i + 1].name}  ]`, i + 1, 'wc-demos-arrow') : btn('›', '', undefined, 'wc-demos-arrow is-off'));
    // place it right after the brand block
    const first = header.firstElementChild;
    first.after(nav);
    document.addEventListener('keydown', (e) => {
      const t = e.target;
      if (e.metaKey || e.ctrlKey || e.altKey || (t && t.closest && t.closest('input, textarea, select, [contenteditable]'))) return;
      if (e.key === '[' && i > 0) go(i - 1);
      if (e.key === ']' && i < WC.DEMOS.length - 1) go(i + 1);
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', WC.demoNav);
  else WC.demoNav();

  window.WC = WC;
})();

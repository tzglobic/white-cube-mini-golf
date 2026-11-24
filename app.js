/* White Cube Mini Golf Open 2026 — scoring, leaderboard, stats, scorecard photo, commentary.
   Plain JS, no build step. State lives in this browser's localStorage. */
(function () {
  'use strict';
  const { $, $$ } = WC;
  const C = window.MGCommentary;
  const AI = window.MGAI;

  const KEY = 'wc-minigolf:v1';
  const SKEY = 'wc-minigolf:settings';
  const BKEY = 'wc-minigolf:backup';
  const MAX_TEAMS = 12;
  const MAX_HOLES = 18;
  const MINUS = '−';

  const HOLE_NAMES = ['The Plinth', 'Turbine Hall', 'Shark Tank', 'Infinity Room', 'Unmade Bed', 'The White Cube',
    'Spot Painting', 'The Crate', 'Private View', 'Readymade', 'Black Square', 'Balloon Dog', 'Fourth Plinth',
    'Hanging Committee', 'Red Dot', 'Salon Hang', 'Wet Paint', 'Gift Shop'];

  const DEMO = {
    pars: [2, 3, 3, 4, 3, 2, 3, 3, 4],
    teams: [
      ['The Readymades', 'Sam, Priya, Jonah', [3, 3, 4, 5, 3, 2, 3, 4, 4]],
      ['Negative Space', 'Ines, Tom', [2, 4, 3, 6, 2, 3, 3, 3, 4]],
      ['Impasto Kings', 'Kofi, Bea, Ollie', [4, 4, 3, 5, 3, 2, 2, 3, 3]],
      ['Chiaroscuro Club', 'Marta, Leo, Hana', [2, 3, 3, 6, 4, 1, 3, 3, 5]],
      ['Putt Art', 'Freya, Dev', [3, 3, 3, 4, 3, 3, 4, 4, 5]],
      ['The Brutalists', 'Gus, Noor, Ed', [3, 5, 4, 7, 4, 3, 3, 4, 5]],
    ],
  };

  const DEFAULT_SETTINGS = {
    claudeKey: '', elevenKey: '', model: 'claude-opus-5-5', qrUrl: '',
    style: 'golf', sound: false, forceOffline: false,
  };

  /* ====================================================================== state */
  const uid = () => Math.random().toString(36).slice(2, 9);
  const blank = () => ({ v: 1, holes: Array.from({ length: 9 }, () => ({ par: 3, name: '' })), teams: [], updatedAt: Date.now() });

  function normalize(st) {
    if (!st || !Array.isArray(st.holes) || !Array.isArray(st.teams)) return null;
    st.holes = st.holes.slice(0, MAX_HOLES).map((h) => ({ par: clampInt(h && h.par, 1, 9, 3), name: String((h && h.name) || '').slice(0, 40) }));
    if (!st.holes.length) st.holes = blank().holes;
    st.teams = st.teams.slice(0, MAX_TEAMS * 4).map((t) => ({
      id: t.id || uid(),
      name: String(t.name || 'Team').slice(0, 40),
      players: String(t.players || ''),
      updatedAt: t.updatedAt || 0,
      scores: st.holes.map((_, i) => {
        const v = t.scores && t.scores[i];
        return v == null || v === '' ? null : clampInt(v, 1, 20, null);
      }),
    }));
    st.v = 1;
    return st;
  }
  function clampInt(v, lo, hi, dflt) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
  }
  function readJSON(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } }

  let state = normalize(readJSON(KEY)) || blank();
  let settings = Object.assign({}, DEFAULT_SETTINGS, readJSON(SKEY) || {});

  function save() {
    state.updatedAt = Date.now();
    if (!writeJSON(KEY, state)) toast('Could not save (storage full or blocked).', 'alert');
  }
  function saveSettings() { writeJSON(SKEY, settings); }
  function backup(label) { writeJSON(BKEY, { label, at: Date.now(), state: JSON.parse(JSON.stringify(state)) }); }
  function restoreBackup() {
    const b = readJSON(BKEY);
    const st = b && normalize(b.state);
    if (!st) return toast('Nothing to undo.');
    const cur = JSON.parse(JSON.stringify(state));
    state = st; save();
    writeJSON(BKEY, { label: 'undo', at: Date.now(), state: cur });
    toast('Restored the previous tournament.');
    render();
  }

  /* ====================================================================== maths */
  const parOf = (i) => state.holes[i].par;

  function lineFor(t, upTo = state.holes.length) {
    let strokes = 0, par = 0, thru = 0, aces = 0;
    for (let i = 0; i < upTo; i++) {
      const s = t.scores[i];
      if (s == null) continue;
      strokes += s; par += parOf(i); thru++;
      if (s === 1) aces++;
    }
    return { team: t, id: t.id, strokes, toPar: strokes - par, thru, aces };
  }

  function standings(upTo) {
    const lines = state.teams.map((t) => lineFor(t, upTo));
    lines.sort((a, b) => (b.thru > 0) - (a.thru > 0) || a.toPar - b.toPar || b.thru - a.thru
      || a.strokes - b.strokes || a.team.name.localeCompare(b.team.name));
    let rank = 0;
    lines.forEach((l, i) => {
      const p = lines[i - 1];
      if (!p || l.thru === 0 || p.thru === 0 || l.toPar !== p.toPar) rank = i + 1;
      l.rank = l.thru ? rank : null;
    });
    lines.forEach((l) => { l.tied = l.rank != null && lines.filter((o) => o.rank === l.rank).length > 1; });
    return lines;
  }

  function holeStats() {
    return state.holes.map((h, i) => {
      const scores = state.teams.filter((t) => t.scores[i] != null).map((t) => ({ team: t, s: t.scores[i] }));
      const avg = scores.length ? scores.reduce((a, b) => a + b.s, 0) / scores.length : null;
      return { i, hole: i + 1, par: h.par, name: h.name, scores, avg, vsPar: avg == null ? null : avg - h.par };
    });
  }

  const fmtPar = (n) => (n === 0 ? 'E' : n > 0 ? `+${n}` : `${MINUS}${Math.abs(n)}`);
  const fmtAvg = (n) => (Math.round(n * 10) / 10).toFixed(1);
  const fmtSigned = (n) => (Math.abs(n) < 0.05 ? '0.0' : (n > 0 ? '+' : MINUS) + fmtAvg(Math.abs(n)));

  function scoreLabel(s, par) {
    if (s == null) return '';
    if (s === 1) return 'Hole in one';
    const d = s - par;
    return d <= -3 ? 'Albatross' : d === -2 ? 'Eagle' : d === -1 ? 'Birdie' : d === 0 ? 'Par'
      : d === 1 ? 'Bogey' : d === 2 ? 'Double bogey' : `+${d}`;
  }

  /** All the derived "story" numbers: used by Stats, the board footer and the commentary. */
  function computeFacts() {
    const st = standings();
    const playing = st.filter((l) => l.thru > 0);
    const hs = holeStats();
    const played = hs.filter((h) => h.scores.length);
    const N = state.holes.length;
    const f = {
      teamCount: state.teams.length, totalHoles: N,
      holesPlayed: playing.length ? Math.max(...playing.map((l) => l.thru)) : 0,
      finished: playing.length > 0 && state.teams.every((t) => t.scores.every((s) => s != null)),
      standings: playing.map((l) => ({ rank: l.rank, name: l.team.name, toPar: l.toPar, strokes: l.strokes, thru: l.thru })),
    };
    if (!playing.length) return f;

    const lead = playing[0];
    f.leader = { name: lead.team.name, toPar: lead.toPar, strokes: lead.strokes };
    const tied = playing.filter((l) => l.rank === 1);
    f.tieForLead = tied.length > 1;
    if (f.tieForLead) f.tieNames = joinNames(tied.map((l) => l.team.name));
    const second = playing.find((l) => l.rank > 1);
    if (second) f.runnerUp = { name: joinNames(playing.filter((l) => l.rank === second.rank).map((l) => l.team.name)), gap: second.toPar - lead.toPar };

    if (playing.length > 1) {
      const last = playing[playing.length - 1];
      if (last.rank !== 1) f.spoon = { name: last.team.name, toPar: last.toPar };
    }

    const withAvg = played.filter((h) => h.scores.length >= Math.min(2, playing.length));
    if (withAvg.length) {
      const hard = withAvg.reduce((a, b) => (b.vsPar > a.vsPar ? b : a));
      const easy = withAvg.reduce((a, b) => (b.vsPar < a.vsPar ? b : a));
      f.hardest = { hole: hard.hole, name: hard.name, par: hard.par, avg: +fmtAvg(hard.avg), avgText: fmtAvg(hard.avg), overPar: +fmtAvg(hard.vsPar) };
      if (easy.hole !== hard.hole) f.easiest = { hole: easy.hole, name: easy.name, par: easy.par, avg: +fmtAvg(easy.avg), avgText: fmtAvg(easy.avg), overPar: +fmtAvg(easy.vsPar) };
    }

    let best = null;
    const aces = [];
    hs.forEach((h) => h.scores.forEach(({ team, s }) => {
      const d = s - h.par;
      if (s === 1) aces.push({ team: team.name, hole: h.hole, name: h.name });
      if (!best || d < best.diff || (d === best.diff && s < best.strokes)) {
        best = { team: team.name, hole: h.hole, name: h.name, strokes: s, par: h.par, diff: d };
      }
    }));
    f.best = best;
    f.aces = aces;

    const cons = playing.filter((l) => l.thru >= 3).map((l) => {
      const ds = l.team.scores.map((s, i) => (s == null ? null : s - parOf(i))).filter((v) => v != null);
      const m = ds.reduce((a, b) => a + b, 0) / ds.length;
      const sd = Math.sqrt(ds.reduce((a, b) => a + (b - m) ** 2, 0) / ds.length);
      return { name: l.team.name, sd };
    }).sort((a, b) => a.sd - b.sd);
    if (cons.length) f.consistent = { name: cons[0].name, sd: +cons[0].sd.toFixed(2) };

    // Comeback: rank at the halfway point of the holes everyone has played vs now.
    const common = Math.min(...playing.map((l) => l.thru));
    const mid = Math.floor(Math.min(common, N) / 2);
    if (mid >= 2 && playing.length >= 3) {
      const then = standings(mid).filter((l) => l.thru > 0);
      const thenRank = Object.fromEntries(then.map((l) => [l.id, l.rank]));
      let cb = null;
      playing.forEach((l) => {
        const climb = (thenRank[l.id] || 0) - l.rank;
        if (climb >= 2 && (!cb || climb > cb.climb)) cb = { name: l.team.name, from: thenRank[l.id], to: l.rank, atHole: mid, climb };
      });
      if (cb) f.comeback = cb;
      f.earlyLeader = then[0] ? { name: then[0].team.name, atHole: mid } : null;
    }
    return f;
  }
  const joinNames = (a) => (a.length <= 2 ? a.join(' and ') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

  /* ====================================================================== ui state */
  const params = new URLSearchParams(location.search);
  const VIEWS = ['setup', 'scores', 'photo', 'board', 'stats', 'report'];
  const ui = {
    view: VIEWS.includes(params.get('view')) ? params.get('view') : (state.teams.length ? 'scores' : 'setup'),
    hole: 0,
    scoreMode: 'hole',
    teamId: null,
    photo: { status: 'idle' },
    report: { status: 'idle', text: '', by: '' },
    board: { ranks: null, leader: null, aces: null, strokes: {} },
    sample: null,
  };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hasClaude = () => !!settings.claudeKey.trim();
  const hasEleven = () => !!settings.elevenKey.trim();

  function go(view) {
    ui.view = view;
    const u = new URL(location.href);
    u.searchParams.set('view', view);
    history.replaceState(null, '', u);
    stopAudio();
    render();
    window.scrollTo(0, 0);
  }

  /* ====================================================================== render */
  const app = $('#app');

  function render() {
    document.body.classList.toggle('is-board', ui.view === 'board');
    $$('#nav [data-view]').forEach((b) => b.setAttribute('aria-current', b.dataset.view === ui.view ? 'page' : 'false'));
    const prevRects = ui.view === 'board' ? captureBoard() : null;
    const fn = { setup: viewSetup, scores: viewScores, photo: viewPhoto, board: viewBoard, stats: viewStats, report: viewReport }[ui.view];
    app.innerHTML = fn();
    if (ui.view === 'board') afterBoard(prevRects);
    if (ui.view === 'stats') bindTips();
  }

  function rerenderKeepScroll() {
    const y = window.scrollY;
    const hb = $('.mg-holebar');
    const hx = hb ? hb.scrollLeft : 0;
    render();
    window.scrollTo(0, y);
    const hb2 = $('.mg-holebar');
    if (hb2) hb2.scrollLeft = hx;
  }

  function hero(eyebrow, title, lede) {
    return `<section class="mg-hero"><p class="wc-eyebrow">${eyebrow}</p><h1 class="wc-h1">${title}</h1>${lede ? `<p class="wc-lede wc-mute">${lede}</p>` : ''}</section>`;
  }

  function emptyTeams() {
    return `<div class="mg-empty"><span class="mg-ball is-big"></span><p class="wc-h2">No teams yet.</p>
      <p class="wc-mute">Add the teams first, or load the demo tournament.</p>
      <div class="wc-row"><button class="wc-btn" data-act="goto" data-view="setup">Set up teams</button>
      <button class="wc-btn is-ghost" data-act="demo">Load demo data</button></div></div>`;
  }

  /* ---------------------------------------------------------------- setup */
  function viewSetup() {
    const n = state.teams.length;
    const b = readJSON(BKEY);
    const teams = state.teams.map((t, i) => `
      <li class="mg-team-row" data-id="${t.id}">
        <span class="mg-ball">${i + 1}</span>
        <input class="mg-inline mg-team-name" data-field="team-name" value="${esc(t.name)}" maxlength="40" aria-label="Team name">
        <input class="mg-inline mg-team-players" data-field="team-players" value="${esc(t.players)}" placeholder="Players (optional)" aria-label="Players">
        <button class="mg-icon" data-act="del-team" aria-label="Remove ${esc(t.name)}">&times;</button>
      </li>`).join('');
    const holes = state.holes.map((h, i) => `
      <div class="mg-hole-card">
        <div class="wc-spread"><span class="wc-eyebrow">Hole ${i + 1}</span><span class="wc-eyebrow">Par</span></div>
        <div class="mg-hole-card-row">
          <input class="mg-inline" data-field="hole-name" data-i="${i}" value="${esc(h.name)}" placeholder="Name (optional)" maxlength="40" aria-label="Hole ${i + 1} name">
          <div class="mg-mini-stepper">
            <button data-act="par" data-i="${i}" data-d="-1" aria-label="Par down">${MINUS}</button>
            <output class="wc-num">${h.par}</output>
            <button data-act="par" data-i="${i}" data-d="1" aria-label="Par up">+</button>
          </div>
        </div>
      </div>`).join('');
    return `
      ${hero('Step 1 &middot; Setup', 'Who&rsquo;s playing?', 'Shout out team names. Enter adds one and keeps the cursor there for the next.')}
      <section class="wc-section">
        <div class="wc-spread"><h2 class="wc-h2">Teams <span class="wc-mute wc-num">${n}/${MAX_TEAMS}</span></h2>
          ${n && n < 2 ? '<span class="wc-tag is-alert">Add at least 2 teams</span>' : ''}</div>
        <form class="mg-add" data-form="add-team" autocomplete="off">
          <input id="team-name" class="wc-input mg-input-xl" placeholder="${n >= MAX_TEAMS ? 'Twelve teams: that’s the lot' : 'Team name'}" maxlength="40" enterkeyhint="next" ${n >= MAX_TEAMS ? 'disabled' : ''} aria-label="New team name">
          <button class="wc-btn" ${n >= MAX_TEAMS ? 'disabled' : ''}>Add team</button>
        </form>
        <details class="mg-bulk"><summary class="wc-small">Paste several at once</summary>
          <textarea id="bulk-teams" class="wc-input" rows="4" placeholder="One per line, or comma separated"></textarea>
          <button class="wc-btn is-ghost" data-act="bulk-add">Add all</button></details>
        <ol class="mg-teams">${teams}</ol>
      </section>
      <section class="wc-section">
        <div class="wc-spread"><h2 class="wc-h2">Course</h2><span class="wc-mute wc-small wc-num">Par ${state.holes.reduce((a, h) => a + h.par, 0)}</span></div>
        <div class="mg-course-controls">
          <div class="mg-control"><span class="wc-eyebrow">Holes</span>
            <div class="wc-row mg-gap-s">
              <button class="wc-chip" data-act="holes" data-n="9" aria-pressed="${state.holes.length === 9}">9</button>
              <button class="wc-chip" data-act="holes" data-n="18" aria-pressed="${state.holes.length === 18}">18</button>
              <div class="mg-mini-stepper"><button data-act="holes-step" data-d="-1" aria-label="One fewer hole">${MINUS}</button>
                <output class="wc-num">${state.holes.length}</output><button data-act="holes-step" data-d="1" aria-label="One more hole">+</button></div>
            </div></div>
          <div class="mg-control"><span class="wc-eyebrow">Par for every hole</span>
            <div class="wc-row mg-gap-s">${[2, 3, 4].map((p) => `<button class="wc-chip" data-act="par-all" data-p="${p}" aria-pressed="${state.holes.every((h) => h.par === p)}">Par ${p}</button>`).join('')}</div></div>
          <div class="mg-control"><span class="wc-eyebrow">Hole names</span>
            <div class="wc-row mg-gap-s"><button class="wc-chip" data-act="name-holes">Art-world names</button><button class="wc-chip" data-act="clear-names">Clear</button></div></div>
        </div>
        <div class="mg-holes-grid">${holes}</div>
      </section>
      <section class="wc-section">
        <h2 class="wc-h2">Data</h2>
        <p class="wc-mute wc-small mg-measure">Scores are saved in this browser only. Phones don&rsquo;t sync: each scorer exports, the presenter merges.</p>
        <div class="wc-row mg-data-row">
          <button class="wc-btn is-ghost" data-act="demo">Load demo data</button>
          <button class="wc-btn is-ghost" data-act="export">Export JSON</button>
          <button class="wc-btn is-ghost" data-act="import">Import (replace)</button>
          <button class="wc-btn is-ghost" data-act="merge">Merge phone exports</button>
          <button class="wc-btn is-ghost mg-danger" data-act="reset">Reset</button>
          ${b ? `<button class="wc-btn is-ghost" data-act="undo">Undo ${esc(b.label)} (${new Date(b.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })})</button>` : ''}
        </div>
      </section>
      <section class="wc-section mg-cta-row">
        <button class="wc-btn mg-btn-xl" data-act="goto" data-view="scores" ${n < 2 ? 'disabled' : ''}>Start scoring &rarr;</button>
      </section>`;
  }

  /* ---------------------------------------------------------------- scores */
  function stepper(t, i) {
    const v = t.scores[i];
    const lbl = scoreLabel(v, parOf(i));
    return `
      <span class="mg-entry-tag ${v === 1 ? 'is-ace' : ''}">${lbl}</span>
      <div class="mg-stepper" data-team="${t.id}" data-i="${i}">
        <button data-act="dec" aria-label="One fewer stroke">${MINUS}</button>
        <output class="mg-val wc-num ${v == null ? 'is-empty' : ''}" aria-live="polite">${v == null ? '&ndash;' : v}</output>
        <button data-act="inc" aria-label="One more stroke">+</button>
      </div>`;
  }

  function viewScores() {
    if (!state.teams.length) return hero('Step 2 &middot; Scores', 'Score entry') + emptyTeams();
    const N = state.holes.length;
    ui.hole = Math.min(ui.hole, N - 1);
    if (ui.teamId && !state.teams.find((t) => t.id === ui.teamId)) ui.teamId = null;
    const h = state.holes[ui.hole];
    const holeBar = state.holes.map((hh, i) => {
      const done = state.teams.every((t) => t.scores[i] != null);
      const some = state.teams.some((t) => t.scores[i] != null);
      return `<button class="mg-holebtn ${done ? 'is-done' : some ? 'is-some' : ''}" data-act="pick-hole" data-i="${i}" aria-current="${i === ui.hole}" aria-label="Hole ${i + 1}">${i + 1}</button>`;
    }).join('');

    let body;
    if (ui.scoreMode === 'hole') {
      body = `
        <div class="mg-holebar" role="tablist">${holeBar}</div>
        <div class="mg-hole-title">
          <button class="mg-icon is-big" data-act="prev-hole" ${ui.hole === 0 ? 'disabled' : ''} aria-label="Previous hole">&larr;</button>
          <div><p class="wc-eyebrow">Hole ${ui.hole + 1} of ${N} &middot; Par ${h.par}</p>
            <h2 class="wc-h1">${esc(h.name || `Hole ${ui.hole + 1}`)}</h2></div>
          <button class="mg-icon is-big" data-act="next-hole" ${ui.hole === N - 1 ? 'disabled' : ''} aria-label="Next hole">&rarr;</button>
        </div>
        <ul class="mg-entry">${state.teams.map((t) => `
          <li class="mg-entry-row">
            <div class="mg-entry-name"><strong>${esc(t.name)}</strong>${t.players ? `<span class="wc-mute wc-small">${esc(t.players)}</span>` : ''}</div>
            ${stepper(t, ui.hole)}
          </li>`).join('')}</ul>`;
    } else {
      const team = state.teams.find((t) => t.id === ui.teamId) || state.teams[0];
      ui.teamId = team.id;
      const l = lineFor(team);
      body = `
        <div class="mg-team-pick">${state.teams.map((t) => `<button class="wc-chip" data-act="pick-team" data-id="${t.id}" aria-pressed="${t.id === team.id}">${esc(t.name)}</button>`).join('')}</div>
        <div class="mg-hole-title"><div><p class="wc-eyebrow">Scoring for</p><h2 class="wc-h1">${esc(team.name)}</h2></div>
          <div class="mg-team-sum wc-num"><span>${l.thru ? l.strokes : '&ndash;'}</span><span class="wc-mute">${l.thru ? fmtPar(l.toPar) : ''}</span></div></div>
        <ul class="mg-entry">${state.holes.map((hh, i) => `
          <li class="mg-entry-row">
            <div class="mg-entry-name"><strong>Hole ${i + 1}${hh.name ? ` &middot; ${esc(hh.name)}` : ''}</strong><span class="wc-mute wc-small">Par ${hh.par}</span></div>
            ${stepper(team, i)}
          </li>`).join('')}</ul>`;
    }

    const st = standings();
    const grid = `
      <div class="mg-grid-wrap"><table class="wc-table mg-grid">
        <thead><tr><th class="mg-sticky">Team</th>${state.holes.map((hh, i) => `<th class="c ${i === ui.hole && ui.scoreMode === 'hole' ? 'is-cur' : ''}">${i + 1}<span>par ${hh.par}</span></th>`).join('')}<th class="r">Tot</th><th class="r">&plusmn;</th></tr></thead>
        <tbody>${state.teams.map((t) => {
          const l = st.find((x) => x.id === t.id);
          return `<tr><th class="mg-sticky" scope="row">${esc(t.name)}</th>${t.scores.map((s, i) => `<td class="c ${s != null && s < parOf(i) ? 'is-under' : ''} ${s === 1 ? 'is-ace' : ''}"><button data-act="cell" data-id="${t.id}" data-i="${i}" aria-label="${esc(t.name)} hole ${i + 1}">${s == null ? '&middot;' : s}</button></td>`).join('')}
            <td class="r"><strong>${l.thru ? l.strokes : ''}</strong></td><td class="r">${l.thru ? fmtPar(l.toPar) : ''}</td></tr>`;
        }).join('')}</tbody>
      </table></div>`;

    return `
      <section class="mg-hero mg-hero-tight">
        <div class="wc-spread">
          <div><p class="wc-eyebrow">Step 2 &middot; Scores</p><h1 class="wc-h1">Score entry</h1></div>
          <div class="wc-row mg-gap-s">
            <button class="wc-chip" data-act="mode" data-mode="hole" aria-pressed="${ui.scoreMode === 'hole'}">By hole</button>
            <button class="wc-chip" data-act="mode" data-mode="team" aria-pressed="${ui.scoreMode === 'team'}">By team</button>
          </div>
        </div>
      </section>
      <section class="mg-scoring">${body}</section>
      <section class="wc-section">
        <div class="wc-spread"><h2 class="wc-h2">Scorecard</h2>
          <div class="wc-row mg-gap-s"><button class="wc-btn is-ghost" data-act="goto" data-view="photo">Scan a paper card</button>
          <button class="wc-btn" data-act="goto" data-view="board">Leaderboard &rarr;</button></div></div>
        ${grid}
        <p class="wc-small wc-mute">Tap a cell to jump to it. ${MINUS} on 1 clears a score. Saved on this device automatically.</p>
      </section>`;
  }

  function setScore(teamId, i, v, opts = {}) {
    const t = state.teams.find((x) => x.id === teamId);
    if (!t) return;
    const before = t.scores[i];
    t.scores[i] = v;
    t.updatedAt = Date.now();
    save();
    if (v === 1 && before !== 1 && !opts.silent) celebrateAce(t, i);
  }

  function celebrateAce(t, i) {
    toast(`Hole in one! ${t.name} at hole ${i + 1}.`, 'ace');
    burst();
    if (settings.sound) playStinger('ace');
  }

  /* ---------------------------------------------------------------- photo */
  function viewPhoto() {
    const live = hasClaude();
    const p = ui.photo;
    const banner = live
      ? `<div class="mg-mode is-live"><span class="wc-cube is-solid"></span><div><strong>Live</strong> &middot; Claude reads the photo (<span class="wc-mono">${esc(settings.model)}</span>). You check every number before it&rsquo;s applied.</div></div>`
      : `<div class="mg-mode is-rehearsal"><span class="wc-cube"></span><div><strong>Rehearsal mode</strong> &middot; no Claude API key. This uses the bundled sample card and its <em>known</em> values. Nothing is being read from any photo. <button class="mg-link" data-act="settings">Add a key</button></div></div>`;

    let left = '';
    if (p.dataUrl) {
      left = `<figure class="mg-photo"><img src="${p.dataUrl}" alt="Scorecard photo"><figcaption class="wc-small wc-mute">${p.origin === 'sample' ? 'Bundled sample card' : 'Your photo'}</figcaption></figure>`;
    } else {
      left = `<div class="mg-photo is-empty"><span class="mg-ball is-big"></span><p class="wc-mute">Snap the paper scorecard, or use the sample card.</p></div>`;
    }

    const canRead = p.dataUrl && (live || p.origin === 'sample');
    const actions = `
      <div class="wc-row mg-gap-s">
        <label class="wc-btn ${p.dataUrl ? 'is-ghost' : ''}">Take photo / choose image
          <input type="file" accept="image/*" capture="environment" data-field="photo-file" hidden></label>
        <button class="wc-btn is-ghost" data-act="sample">Use sample card</button>
      </div>
      ${p.dataUrl && p.origin === 'upload' && !live ? `<p class="mg-warn">No Claude key, so this photo can&rsquo;t be read. Rehearsal mode only works with the sample card. Add a key in Settings to read real photos.</p>` : ''}
      ${p.dataUrl ? `<button class="wc-btn mg-btn-xl" data-act="read-card" ${canRead && p.status !== 'reading' ? '' : 'disabled'}>${live ? 'Read scorecard with Claude' : 'Load rehearsal values'}</button>` : ''}`;

    let right = actions;
    if (p.status === 'reading') {
      right += `<div class="mg-status"><span class="wc-thinking"><span></span><span></span><span></span></span>
        ${live ? `Claude is reading the card&hellip; <span class="wc-num" id="elapsed">0.0s</span>` : 'Rehearsal: loading the sample card&rsquo;s known values&hellip;'}</div>`;
    }
    if (p.status === 'error') right += `<div class="mg-error" role="alert"><strong>That didn&rsquo;t work.</strong> ${esc(p.error)}</div>`;
    if (p.status === 'review') right += reviewPanel(p);
    if (p.status === 'applied') {
      right += `<div class="mg-ok"><strong>Applied.</strong> ${esc(p.appliedMsg)}
        <div class="wc-row mg-gap-s"><button class="wc-btn" data-act="goto" data-view="board">See the leaderboard &rarr;</button>
        <button class="wc-btn is-ghost" data-act="photo-reset">Scan another</button></div></div>`;
    }

    return `
      ${hero('Multimodal &middot; Scorecard', 'Photo of the paper card', 'Point a phone at the scorecard. Claude turns handwriting into scores; you confirm.')}
      ${banner}
      <section class="mg-photo-grid">${left}<div class="mg-photo-side">${right}</div></section>`;
  }

  function reviewPanel(p) {
    const r = p.result;
    const N = state.holes.length;
    const match = r.matchId ? state.teams.find((t) => t.id === r.matchId) : null;
    const opts = state.teams.map((t) => `<option value="${t.id}" ${r.matchId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
    const cells = state.holes.map((h, i) => {
      const cur = match ? match.scores[i] : null;
      const v = r.scores[i];
      const diff = match && cur != null && v != null && cur !== v;
      return `<label class="mg-rev-cell ${diff ? 'is-diff' : ''}"><span class="wc-eyebrow">${i + 1} &middot; p${h.par}</span>
        <input type="number" inputmode="numeric" min="1" max="20" data-field="rev-score" data-i="${i}" value="${v == null ? '' : v}" aria-label="Hole ${i + 1}">
        <span class="wc-small wc-mute">${match ? (cur == null ? 'new' : `was ${cur}`) : '&nbsp;'}</span></label>`;
    }).join('');
    const total = r.scores.reduce((a, s) => a + (s || 0), 0);
    return `
      <div class="mg-review">
        <p class="wc-eyebrow">${p.source === 'claude'
          ? `Read by Claude &middot; <span class="wc-mono">${esc(p.model)}</span> &middot; ${(p.ms / 1000).toFixed(1)}s${p.notes && p.notes.length ? ` &middot; ${esc(p.notes.join(', '))}` : ''}`
          : 'Rehearsal values &middot; bundled sample card &middot; not read from a photo'}</p>
        <h3 class="wc-h2">Check, then apply</h3>
        <div class="mg-rev-team">
          <label><span class="wc-eyebrow">Team</span>
            <select class="wc-input" data-field="rev-team">${opts}<option value="__new__" ${!r.matchId ? 'selected' : ''}>New team: ${esc(r.team || 'Unnamed')}</option></select></label>
          ${!r.matchId ? `<label><span class="wc-eyebrow">New team name</span><input class="wc-input" data-field="rev-name" value="${esc(r.team)}" maxlength="40"></label>` : ''}
        </div>
        <div class="mg-rev-grid">${cells}</div>
        <p class="wc-small"><span class="wc-mute">Total on card:</span> <strong class="wc-num">${total}</strong>${r.players.length ? ` <span class="wc-mute">&middot; Players:</span> ${esc(r.players.join(', '))}` : ''}</p>
        ${r.notes ? `<p class="wc-small mg-note">&ldquo;${esc(r.notes)}&rdquo;</p>` : ''}
        ${r.extraHoles ? `<p class="mg-warn">The card had ${r.extraHoles} more hole(s) than this course; they were ignored.</p>` : ''}
        ${N > r.scores.filter((s) => s != null).length ? '<p class="wc-small wc-mute">Blank holes are left untouched.</p>' : ''}
        <div class="wc-row mg-gap-s"><button class="wc-btn" data-act="apply-card">Apply to scores</button><button class="wc-btn is-ghost" data-act="photo-reset">Discard</button></div>
      </div>`;
  }

  const normName = (s) => String(s || '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');
  function matchTeam(name) {
    const n = normName(name);
    if (!n) return null;
    return state.teams.find((t) => normName(t.name) === n)
      || state.teams.find((t) => { const m = normName(t.name); return m.length > 3 && (m.includes(n) || n.includes(m)); }) || null;
  }

  async function loadSample() {
    if (!ui.sample) {
      try {
        ui.sample = await (await fetch('assets/sample-scorecard.json')).json();
      } catch (_) {
        ui.sample = { team: 'The Sfumatos', players: ['Ada', 'Remi', 'Tilly'], scores: [3, 3, 3, 5, 2, 2, 3, 3, 4], notes: 'Hole 4: a 6 was crossed out and corrected to 5.' };
      }
    }
    return ui.sample;
  }

  async function readCard() {
    const p = ui.photo;
    p.status = 'reading';
    render();
    const live = hasClaude();
    try {
      let r;
      if (live) {
        const t0 = performance.now();
        const timer = setInterval(() => { const e = $('#elapsed'); if (e) e.textContent = ((performance.now() - t0) / 1000).toFixed(1) + 's'; }, 100);
        try {
          r = await AI.readScorecard({ key: settings.claudeKey.trim(), model: settings.model, image: p.image, pars: state.holes.map((h) => h.par), teamNames: state.teams.map((t) => t.name) });
        } finally { clearInterval(timer); }
        p.source = 'claude'; p.model = r.model; p.ms = r.ms; p.notes = r.notes2;
      } else {
        const s = await loadSample();
        await WC.sleep(900);
        r = { team: s.team, players: s.players, notes: s.notes, scores: state.holes.map((_, i) => (s.scores[i] == null ? null : s.scores[i])), extraHoles: Math.max(0, s.scores.length - state.holes.length) };
        p.source = 'rehearsal';
      }
      const m = matchTeam(r.team);
      r.matchId = m ? m.id : null;
      p.result = r;
      p.status = 'review';
    } catch (e) {
      p.status = 'error';
      p.error = e.message;
    }
    if (ui.view === 'photo') render();
  }

  function applyCard() {
    const r = ui.photo.result;
    backup('scorecard');
    let t = r.matchId ? state.teams.find((x) => x.id === r.matchId) : null;
    if (!t) {
      if (state.teams.length >= MAX_TEAMS) return toast(`Already ${MAX_TEAMS} teams: pick an existing team.`, 'alert');
      const name = (r.team || '').trim() || `Team ${state.teams.length + 1}`;
      t = { id: uid(), name, players: r.players.join(', '), updatedAt: 0, scores: state.holes.map(() => null) };
      state.teams.push(t);
    } else if (!t.players && r.players.length) t.players = r.players.join(', ');
    let n = 0, ace = null;
    r.scores.forEach((s, i) => {
      if (s == null || i >= state.holes.length) return;
      if (s === 1 && t.scores[i] !== 1) ace = i;
      t.scores[i] = s; n++;
    });
    t.updatedAt = Date.now();
    save();
    ui.photo.status = 'applied';
    ui.photo.appliedMsg = `${n} score${n === 1 ? '' : 's'} for ${t.name}${ui.photo.source === 'rehearsal' ? ' (rehearsal values)' : ''}.`;
    render();
    if (ace != null) celebrateAce(t, ace);
  }

  /* ---------------------------------------------------------------- board */
  function viewBoard() {
    const st = standings();
    const N = state.holes.length;
    const f = computeFacts();
    if (!state.teams.length) return `<section class="mg-board">${emptyTeams()}</section>`;
    const n = st.length;
    const rows = st.map((l) => {
      const thru = l.thru === 0 ? '&ndash;' : l.thru === N ? 'F' : l.thru;
      const holesDots = l.team.scores.map((s, i) => `<i class="${s == null ? '' : s === 1 ? 'is-ace' : s < parOf(i) ? 'is-under' : 'is-played'}"></i>`).join('');
      return `
        <li class="mg-brow ${l.rank === 1 ? 'is-leader' : ''} ${l.thru === 0 ? 'is-idle' : ''}" data-id="${l.id}">
          <span class="mg-brank wc-num">${l.rank == null ? '' : (l.tied ? 'T' : '') + l.rank}</span>
          <span class="mg-bmove" data-move></span>
          <span class="mg-bname">${esc(l.team.name)}${l.aces ? ` <span class="mg-ace-badge" title="Hole in one">ACE${l.aces > 1 ? ' &times;' + l.aces : ''}</span>` : ''}</span>
          <span class="mg-btrack" aria-hidden="true"><span class="mg-bholes" style="--n:${N}">${holesDots}</span><i class="mg-bcup ${l.thru === N ? 'is-in' : ''}"></i></span>
          <span class="mg-bthru wc-num"><small>Thru</small>${thru}</span>
          <span class="mg-bstrokes wc-num">${l.thru ? l.strokes : ''}</span>
          <span class="mg-btopar wc-num ${l.toPar < 0 ? 'is-under' : ''}">${l.thru ? fmtPar(l.toPar) : '&ndash;'}</span>
        </li>`;
    }).join('');
    const foot = [];
    if (f.hardest) foot.push(`<span><b>Hardest</b> ${f.hardest.name ? esc(f.hardest.name) : 'Hole ' + f.hardest.hole} &middot; ${fmtSigned(f.hardest.overPar)} vs par</span>`);
    if (f.aces && f.aces.length) foot.push(`<span><b>Aces</b> ${f.aces.map((a) => `${esc(a.team)} (${a.hole})`).join(', ')}</span>`);
    if (f.best && f.best.strokes !== 1) foot.push(`<span><b>Best hole</b> ${esc(f.best.team)} &middot; ${f.best.strokes} on par ${f.best.par}</span>`);
    return `
      <section class="mg-board" style="--rows:${n}">
        <div class="mg-board-head">
          <div><p class="wc-eyebrow"><span class="mg-live"><i></i>Live</span> Leaderboard</p>
            <h1 class="mg-board-title">Mini Golf Open 2026</h1></div>
          <div class="mg-board-meta">
            <span class="wc-num mg-board-thru">${f.finished ? 'Final' : `Thru ${f.holesPlayed} of ${N}`}</span>
            <div class="mg-board-btns">
              <button class="wc-chip" data-act="sound" aria-pressed="${settings.sound}">Sound ${settings.sound ? 'on' : 'off'}</button>
              <button class="wc-chip" data-act="fullscreen">Fullscreen</button>
              <button class="wc-chip" data-act="goto" data-view="scores">Exit</button>
            </div>
          </div>
        </div>
        <div class="mg-board-cols" aria-hidden="true"><span>Pos</span><span></span><span>Team</span><span>Progress</span><span>Thru</span><span>Strokes</span><span>To par</span></div>
        <ol class="mg-board-list">${rows}</ol>
        <div class="mg-board-foot">${foot.join('')}</div>
        <div class="mg-ace-flash" id="ace-flash" hidden></div>
      </section>`;
  }

  function captureBoard() {
    const m = {};
    $$('.mg-brow').forEach((r) => { m[r.dataset.id] = r.getBoundingClientRect().top; });
    return m;
  }

  function afterBoard(prevRects) {
    const st = standings();
    const B = ui.board;
    // Size rows so up to 12 teams fit a 1080p projector without scrolling.
    const list = $('.mg-board-list');
    if (list && window.innerWidth > 760) {
      const top = list.getBoundingClientRect().top + window.scrollY;
      const avail = window.innerHeight - top - 64;
      const rowh = Math.max(56, Math.min(132, Math.floor(avail / Math.max(st.length, 4))));
      $('.mg-board').style.setProperty('--rowh', rowh + 'px');
    }
    // FLIP: slide rows from where they were.
    if (prevRects) {
      $$('.mg-brow').forEach((r) => {
        const old = prevRects[r.dataset.id];
        if (old == null) return;
        const dy = old - r.getBoundingClientRect().top;
        if (Math.abs(dy) < 2) return;
        r.style.transition = 'none';
        r.style.transform = `translateY(${dy}px)`;
        r.getBoundingClientRect();
        r.style.transition = 'transform .9s cubic-bezier(.2,.7,.1,1)';
        r.style.transform = '';
      });
    }
    // Movement arrows + score flashes.
    const ranks = Object.fromEntries(st.map((l) => [l.id, l.rank]));
    if (B.ranks) {
      st.forEach((l) => {
        const was = B.ranks[l.id];
        const row = $(`.mg-brow[data-id="${l.id}"]`);
        if (!row) return;
        if (was != null && l.rank != null && was !== l.rank) {
          const up = was > l.rank;
          const mv = row.querySelector('[data-move]');
          mv.textContent = `${up ? '▲' : '▼'}${Math.abs(was - l.rank)}`;
          mv.classList.add(up ? 'is-up' : 'is-down', 'is-show');
        }
        if (B.strokes[l.id] != null && B.strokes[l.id] !== l.strokes) row.classList.add('is-flash');
      });
    }
    // Stingers: new leader / new ace (only for changes while the board is open).
    const leader = st[0] && st[0].rank === 1 && !st[0].tied && st[0].thru ? st[0].id : null;
    const aces = st.reduce((a, l) => a + l.aces, 0);
    if (B.ranks) {
      if (aces > (B.aces || 0)) {
        flashAce();
        if (settings.sound) playStinger('ace');
      } else if (leader && B.leader !== leader && settings.sound) playStinger('new_leader');
    }
    B.ranks = ranks; B.leader = leader; B.aces = aces;
    B.strokes = Object.fromEntries(st.map((l) => [l.id, l.strokes]));
  }

  function flashAce() {
    const f = computeFacts();
    const a = f.aces && f.aces[f.aces.length - 1];
    const el = $('#ace-flash');
    if (!el || !a) return;
    el.innerHTML = `<span class="wc-eyebrow">Hole ${a.hole}${a.name ? ' &middot; ' + esc(a.name) : ''}</span><strong>Hole in one</strong><span>${esc(a.team)}</span>`;
    el.hidden = false;
    burst();
    setTimeout(() => { el.hidden = true; }, 4200);
  }

  /* ---------------------------------------------------------------- stats */
  function viewStats() {
    const f = computeFacts();
    if (!f.holesPlayed) return hero('Stats', 'The numbers') + (state.teams.length ? '<p class="wc-mute">No scores yet.</p>' : emptyTeams());
    const holeName = (h) => (h.name ? `${esc(h.name)} <span class="wc-mute">&middot; Hole ${h.hole}</span>` : `Hole ${h.hole}`);
    const tiles = [
      f.hardest && tile('Hardest hole', holeName(f.hardest), `${fmtSigned(f.hardest.overPar)}`, `avg ${f.hardest.avgText} on par ${f.hardest.par}`),
      f.easiest && tile('Easiest hole', holeName(f.easiest), `${fmtSigned(f.easiest.overPar)}`, `avg ${f.easiest.avgText} on par ${f.easiest.par}`),
      f.best && tile('Best single hole', esc(f.best.team), f.best.strokes === 1 ? 'Ace' : fmtPar(f.best.diff), `${f.best.strokes} on hole ${f.best.hole}${f.best.name ? ` (${esc(f.best.name)})` : ''}, par ${f.best.par}`),
      f.consistent && tile('Most consistent', esc(f.consistent.name), `&sigma; ${f.consistent.sd.toFixed(2)}`, 'spread of strokes vs par, lower is steadier'),
    ].filter(Boolean).join('');
    const totals = state.teams.reduce((a, t) => a + t.scores.reduce((x, s) => x + (s || 0), 0), 0);
    const strip = `
      <div class="mg-statline wc-num">
        <div><b>${totals}</b><span>strokes played</span></div>
        <div><b>${f.aces.length}</b><span>hole${f.aces.length === 1 ? '' : 's'} in one</span></div>
        <div><b>${f.comeback ? esc(f.comeback.name) : '&ndash;'}</b><span>${f.comeback ? `comeback: ${ordinal(f.comeback.from)} &rarr; ${ordinal(f.comeback.to)}` : 'no comeback (yet)'}</span></div>
        <div><b>${f.spoon ? esc(f.spoon.name) : '&ndash;'}</b><span>wooden spoon</span></div>
      </div>`;
    return `
      ${hero('Stats', 'The numbers', f.finished ? 'Final round, all holes in.' : `After ${f.holesPlayed} of ${f.totalHoles} holes.`)}
      <section class="mg-tiles">${tiles}</section>
      ${strip}
      <section class="wc-section">
        <div class="wc-spread"><div><p class="wc-eyebrow">Per hole</p><h2 class="wc-h2">Every team&rsquo;s strokes, hole by hole</h2></div>
          <div class="mg-legend wc-small"><span><i class="mg-k-sq"></i>one team</span><span><i class="mg-k-avg"></i>average</span><span><i class="mg-k-par"></i>par</span></div></div>
        <div class="mg-chart-wrap">${chartSVG()}</div>
        <details class="mg-table-toggle"><summary class="wc-small">Show as table</summary>${avgTable()}</details>
      </section>`;
  }
  const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

  function tile(label, who, big, sub) {
    return `<div class="mg-tile"><p class="wc-eyebrow">${label}</p><div class="mg-tile-big wc-num">${big}</div><p class="mg-tile-who">${who}</p><p class="wc-small wc-mute">${sub}</p></div>`;
  }

  function chartSVG() {
    const hs = holeStats();
    const f = computeFacts();
    const N = hs.length;
    const maxS = Math.max(5, ...hs.flatMap((h) => h.scores.map((s) => s.s)), ...hs.map((h) => h.par + 2));
    const W = 1200, H = 440, L = 44, R = 12, T = 34, B = 64;
    const cw = (W - L - R) / N;
    const y = (v) => T + (H - T - B) * (1 - (v - 0.5) / (maxS));
    let g = '';
    for (let v = 1; v <= maxS; v++) {
      g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 12}" y="${y(v) + 4}" class="ax" text-anchor="end">${v}</text>`;
    }
    hs.forEach((h, i) => {
      const cx = L + cw * i + cw / 2;
      const isHard = f.hardest && f.hardest.hole === h.hole;
      const isEasy = f.easiest && f.easiest.hole === h.hole;
      if (isHard || isEasy) {
        g += `<rect x="${L + cw * i + 2}" y="${T - 22}" width="${cw - 4}" height="${H - B - T + 22}" class="${isHard ? 'band-hard' : 'band-easy'}"/>
          <text x="${cx}" y="${T - 8}" text-anchor="middle" class="flag">${isHard ? 'HARDEST' : 'EASIEST'}</text>`;
      }
      if (h.avg != null) {
        g += `<rect x="${L + cw * i}" y="${T}" width="${cw}" height="${H - B - T}" class="hit" data-tip="Hole ${h.hole}${h.name ? ' · ' + esc(h.name) : ''}: avg ${fmtAvg(h.avg)} on par ${h.par} (${fmtSigned(h.vsPar)})"/>`;
      }
      const pw = Math.min(cw * 0.78, 64);
      g += `<line x1="${cx - pw / 2}" x2="${cx + pw / 2}" y1="${y(h.par)}" y2="${y(h.par)}" class="par"/>`;
      if (h.avg != null) {
        const aw = Math.min(cw * 0.62, 50);
        g += `<line x1="${cx - aw / 2}" x2="${cx + aw / 2}" y1="${y(h.avg)}" y2="${y(h.avg)}" class="avg"/>`;
      }
      // team squares (the cube motif): group equal values and spread them sideways
      const byVal = {};
      h.scores.forEach((s) => { (byVal[s.s] = byVal[s.s] || []).push(s); });
      const sq = Math.max(7, Math.min(12, cw / 7));
      Object.entries(byVal).forEach(([v, arr]) => {
        arr.forEach((s, k) => {
          const ox = (k - (arr.length - 1) / 2) * (sq + 3);
          const ace = s.s === 1;
          g += `<rect x="${cx + ox - sq / 2}" y="${y(+v) - sq / 2}" width="${sq}" height="${sq}" class="${ace ? 'sq ace' : 'sq'}" data-tip="${esc(s.team.name)} · hole ${h.hole}: ${s.s} stroke${s.s === 1 ? '' : 's'}${ace ? ' (hole in one!)' : ''}"/>`;
        });
      });
      g += `<text x="${cx}" y="${H - B + 24}" text-anchor="middle" class="hole">${h.hole}</text>`;
      g += `<text x="${cx}" y="${H - B + 46}" text-anchor="middle" class="delta ${h.vsPar > 0.05 ? 'over' : ''}">${h.avg == null ? '' : fmtSigned(h.vsPar)}</text>`;
    });
    return `<svg class="mg-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Strokes per hole for every team, with par and the average">${g}
      <text x="${L}" y="${H - 4}" class="ax">HOLE &middot; avg vs par</text></svg>`;
  }

  function avgTable() {
    return `<table class="wc-table"><thead><tr><th>Hole</th><th>Name</th><th class="r">Par</th><th class="r">Avg</th><th class="r">vs par</th><th class="r">Best</th></tr></thead><tbody>${holeStats().map((h) =>
      `<tr><td>${h.hole}</td><td>${esc(h.name)}</td><td class="r">${h.par}</td><td class="r">${h.avg == null ? '' : fmtAvg(h.avg)}</td><td class="r">${h.avg == null ? '' : fmtSigned(h.vsPar)}</td><td class="r">${h.scores.length ? Math.min(...h.scores.map((s) => s.s)) : ''}</td></tr>`).join('')}</tbody></table>`;
  }

  let tipEl = null;
  function bindTips() {
    if (!tipEl) { tipEl = WC.el('div', { class: 'mg-tip', role: 'tooltip' }); document.body.append(tipEl); }
    const svg = $('.mg-chart');
    if (!svg) return;
    svg.addEventListener('pointermove', (e) => {
      const t = e.target.closest('[data-tip]');
      if (!t) { tipEl.hidden = true; return; }
      tipEl.textContent = t.getAttribute('data-tip');
      tipEl.hidden = false;
      const x = Math.min(window.innerWidth - tipEl.offsetWidth - 8, e.clientX + 14);
      tipEl.style.transform = `translate(${x}px, ${e.clientY + 16}px)`;
    });
    svg.addEventListener('pointerleave', () => { tipEl.hidden = true; });
  }

  /* ---------------------------------------------------------------- report */
  function viewReport() {
    const r = ui.report;
    const style = C.STYLES[settings.style] || C.STYLES.golf;
    const useClaude = hasClaude() && !settings.forceOffline;
    const voice = hasEleven() ? `ElevenLabs &middot; ${style.voiceName} (live API)` : 'Mac voice (Web Speech, offline)';
    const styles = Object.values(C.STYLES).map((s) => `<button class="mg-style ${s.id === style.id ? 'is-on' : ''}" data-act="style" data-style="${s.id}" aria-pressed="${s.id === style.id}"><strong>${s.label}</strong><span>${s.sub}</span></button>`).join('');
    const manifest = ui.manifest;
    const board = manifest ? Object.entries(manifest.lines).map(([id, l]) => `<button class="wc-chip" data-act="stinger" data-id="${id}">${esc(l.label)}</button>`).join('') : '<span class="wc-small wc-mute">Loading&hellip;</span>';
    let out = '';
    if (r.status === 'writing') out = `<div class="mg-status"><span class="wc-thinking"><span></span><span></span><span></span></span>${useClaude ? 'Claude is writing the report&hellip;' : 'Writing&hellip;'}</div>`;
    if (r.error) out += `<div class="mg-error" role="alert">${esc(r.error)}</div>`;
    if (r.text) {
      out += `<article class="mg-report-text">${renderTagged(r.text)}</article>
        <p class="wc-eyebrow mg-byline">${esc(r.by)}</p>
        <div class="wc-row mg-gap-s">
          ${r.playing ? '<button class="wc-btn" data-act="stop">Stop</button>' : '<button class="wc-btn mg-btn-xl" data-act="play">&#9654;&nbsp; Play with commentary</button>'}
          <span class="wc-small wc-mute">Voice: ${voice}</span>
        </div>
        ${r.voiceNote ? `<p class="mg-warn">${esc(r.voiceNote)}</p>` : ''}`;
    }
    return `
      ${hero('Commentary', 'The match report', 'Pick a commentator. The report is built from the actual scores.')}
      <section class="mg-styles">${styles}</section>
      <section class="wc-section mg-report">
        <div class="wc-row mg-gap-s">
          <button class="wc-btn mg-btn-xl" data-act="write" ${r.status === 'writing' ? 'disabled' : ''}>${r.text ? 'Write it again' : 'Write the match report'}</button>
          <span class="wc-small wc-mute">${useClaude ? `Writer: Claude (<span class="wc-mono">${esc(settings.model)}</span>)` : hasClaude() ? 'Writer: offline templates (forced in Settings)' : 'Writer: offline templates (no Claude key)'}</span>
        </div>
        ${out}
      </section>
      <section class="wc-section">
        <p class="wc-eyebrow">Soundboard &middot; pre-rendered, works offline</p>
        <div class="wc-row mg-gap-s">${board}</div>
      </section>`;
  }

  function renderTagged(text) {
    return esc(text).replace(/\[([^\]\n]{1,30})\]/g, '<span class="mg-atag">$1</span>');
  }

  async function writeReport() {
    const r = ui.report;
    const style = C.STYLES[settings.style] || C.STYLES.golf;
    const facts = computeFacts();
    stopAudio();
    r.status = 'writing'; r.error = ''; r.voiceNote = ''; r.text = r.text || '';
    render();
    if (hasClaude() && !settings.forceOffline && facts.holesPlayed) {
      try {
        const out = await AI.writeReport({ key: settings.claudeKey.trim(), model: settings.model, facts: factsForPrompt(facts), style });
        r.text = out.text;
        r.by = `Written by Claude · ${out.model} · ${(out.ms / 1000).toFixed(1)}s · ${style.label}`;
      } catch (e) {
        r.text = C.write(facts, style.id);
        r.by = `Written offline from templates · ${style.label}`;
        r.error = `Claude couldn't write it, so this is the offline version. ${e.message}`;
      }
    } else {
      await WC.sleep(350);
      r.text = C.write(facts, style.id);
      r.by = `Written offline from templates · ${style.label}`;
    }
    r.style = style.id;
    r.status = 'done';
    if (ui.view === 'report') render();
  }

  function factsForPrompt(f) {
    const o = JSON.parse(JSON.stringify(f));
    delete o.tieNames;
    o.course = state.holes.map((h, i) => ({ hole: i + 1, name: h.name || null, par: h.par }));
    return o;
  }

  /* ====================================================================== audio */
  let audioToken = 0;
  let currentAudio = null;

  async function loadManifest() {
    try {
      ui.manifest = await (await fetch('audio/manifest.json')).json();
    } catch (_) { ui.manifest = { lines: {} }; }
    if (ui.view === 'report') render();
  }

  function playFile(src, token) {
    return new Promise((resolve) => {
      if (token !== audioToken) return resolve();
      const a = new Audio(src);
      currentAudio = a;
      a.onended = a.onerror = () => resolve();
      a.play().catch(() => resolve());
    });
  }

  function playStinger(id) {
    const l = ui.manifest && ui.manifest.lines[id];
    if (!l) return Promise.resolve();
    return playFile(l.file, audioToken);
  }

  function stopAudio() {
    audioToken++;
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    WC.stopSpeaking();
    if (ui.report.playing) { ui.report.playing = false; if (ui.view === 'report') render(); }
  }

  async function playReport() {
    const r = ui.report;
    if (!r.text) return;
    stopAudio();
    const token = audioToken;
    const style = C.STYLES[r.style || settings.style] || C.STYLES.golf;
    const facts = computeFacts();
    const M = (ui.manifest && ui.manifest.lines) || {};
    r.playing = true; r.voiceNote = '';
    render();

    // Start fetching the live voice while the intro stinger plays.
    let ttsPromise = null;
    if (hasEleven()) {
      ttsPromise = AI.elevenTTS({ key: settings.elevenKey.trim(), voiceId: style.voice, text: r.text })
        .then((blob) => ({ url: URL.createObjectURL(blob) }))
        .catch((e) => ({ error: e.message }));
    }
    if (M[style.intro]) await playFile(M[style.intro].file, token);
    if (style.id !== 'nature' && facts.aces && facts.aces.length && M.ace) await playFile(M.ace.file, token);
    if (token !== audioToken) return;

    let spoke = false;
    if (ttsPromise) {
      const t = await ttsPromise;
      if (token !== audioToken) return;
      if (t.url) { await playFile(t.url, token); spoke = true; }
      else { r.voiceNote = `ElevenLabs failed, so the Mac voice is reading it instead. ${t.error}`; render(); }
    }
    if (!spoke && token === audioToken) {
      await WC.speak(C.stripTags(r.text), { lang: 'en-GB', prefer: ['Daniel', 'Arthur', 'Oliver', 'Serena', 'Kate'], rate: style.rate, pitch: style.pitch });
    }
    if (token !== audioToken) return;
    if (M[style.outro]) await playFile(M[style.outro].file, token);
    if (token === audioToken) { r.playing = false; if (ui.view === 'report') render(); }
  }

  /* ====================================================================== actions */
  function addTeams(names) {
    let added = 0;
    for (const raw of names) {
      const name = raw.trim().slice(0, 40);
      if (!name) continue;
      if (state.teams.length >= MAX_TEAMS) { toast(`${MAX_TEAMS} teams maximum.`, 'alert'); break; }
      if (state.teams.some((t) => t.name.toLowerCase() === name.toLowerCase())) { toast(`“${name}” is already in.`); continue; }
      state.teams.push({ id: uid(), name, players: '', updatedAt: 0, scores: state.holes.map(() => null) });
      added++;
    }
    if (added) save();
    return added;
  }

  function setHoleCount(n) {
    n = Math.max(1, Math.min(MAX_HOLES, n));
    const cur = state.holes.length;
    if (n === cur) return;
    if (n < cur && state.teams.some((t) => t.scores.slice(n).some((s) => s != null))
      && !confirm(`Holes ${n + 1}–${cur} have scores. Remove them?`)) return;
    if (n < cur) backup('hole change');
    const lastPar = state.holes[cur - 1] ? state.holes[cur - 1].par : 3;
    const named = state.holes.some((h) => h.name);
    while (state.holes.length < n) state.holes.push({ par: state.holes.length < 9 ? 3 : lastPar, name: named ? (HOLE_NAMES[state.holes.length] || '') : '' });
    state.holes.length = n;
    state.teams.forEach((t) => { t.scores = state.holes.map((_, i) => (t.scores[i] == null ? null : t.scores[i])); });
    ui.hole = Math.min(ui.hole, n - 1);
    save();
    render();
  }

  function loadDemo() {
    const hasScores = state.teams.some((t) => t.scores.some((s) => s != null));
    if (hasScores && !confirm('Replace the current tournament with demo data? (You can undo.)')) return;
    backup('demo load');
    state = {
      v: 1,
      holes: DEMO.pars.map((p, i) => ({ par: p, name: HOLE_NAMES[i] })),
      teams: DEMO.teams.map(([name, players, scores], k) => ({ id: uid(), name, players, scores: scores.slice(), updatedAt: Date.now() - (6 - k) * 1000 })),
      updatedAt: Date.now(),
    };
    save();
    ui.board.ranks = null;
    ui.photo = { status: 'idle' };
    ui.report = { status: 'idle', text: '', by: '' };
    toast('Demo tournament loaded: 6 teams, 9 holes.');
    if (ui.view === 'setup') go('scores'); else render();
  }

  function doReset() {
    if (!confirm('Reset everything? Teams and scores will be cleared. (You can undo once.)')) return;
    backup('reset');
    const holes = state.holes.map((h) => ({ par: h.par, name: h.name }));
    state = blank();
    state.holes = holes;
    save();
    ui.board.ranks = null;
    ui.report = { status: 'idle', text: '', by: '' };
    ui.photo = { status: 'idle' };
    toast('Cleared. Course kept.');
    go('setup');
  }

  function exportJSON() {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/(\d{8})(\d{4})/, '$1-$2');
    const blob = new Blob([JSON.stringify({ app: 'wc-minigolf', version: 1, exportedAt: new Date().toISOString(), state }, null, 2)], { type: 'application/json' });
    const a = WC.el('a', { href: URL.createObjectURL(blob), download: `mini-golf-${stamp}.json` });
    document.body.append(a); a.click(); a.remove();
    toast('Exported. Send the file to the presenter to merge.');
  }

  async function readFiles(files) {
    const out = [];
    for (const f of files) {
      try {
        const j = JSON.parse(await f.text());
        const st = normalize(JSON.parse(JSON.stringify(j && j.state ? j.state : j)));
        if (!st) throw new Error('not a Mini Golf export');
        out.push({ name: f.name, st });
      } catch (e) { toast(`${f.name}: ${e.message}`, 'alert'); }
    }
    return out;
  }

  async function importReplace(files) {
    const [first] = await readFiles(files);
    if (!first) return;
    if (!confirm(`Replace this tournament with ${first.name}? (You can undo.)`)) return;
    backup('import');
    state = first.st; save();
    ui.board.ranks = null;
    toast(`Imported ${state.teams.length} teams.`);
    render();
  }

  /** Merge several phones' exports: new teams are added; empty cells filled; on a clash the more recently edited team wins. */
  async function importMerge(files) {
    const loaded = await readFiles(files);
    if (!loaded.length) return;
    backup('merge');
    let newTeams = 0, filled = 0, clashes = 0, skipped = 0;
    for (const { st } of loaded) {
      if (st.holes.length > state.holes.length) skipped += st.holes.length - state.holes.length;
      for (const it of st.teams) {
        let t = state.teams.find((x) => normName(x.name) === normName(it.name));
        if (!t) {
          if (state.teams.length >= MAX_TEAMS) { toast(`Skipped ${it.name}: ${MAX_TEAMS} teams max.`, 'alert'); continue; }
          t = { id: uid(), name: it.name, players: it.players, updatedAt: 0, scores: state.holes.map(() => null) };
          state.teams.push(t); newTeams++;
        }
        if (!t.players && it.players) t.players = it.players;
        const theirsNewer = (it.updatedAt || 0) > (t.updatedAt || 0);
        it.scores.forEach((s, i) => {
          if (s == null || i >= state.holes.length) return;
          if (t.scores[i] == null) { t.scores[i] = s; filled++; }
          else if (t.scores[i] !== s) { clashes++; if (theirsNewer) t.scores[i] = s; }
        });
        t.updatedAt = Math.max(t.updatedAt || 0, it.updatedAt || 0);
      }
    }
    save();
    toast(`Merged ${loaded.length} file${loaded.length > 1 ? 's' : ''}: ${newTeams} new team${newTeams === 1 ? '' : 's'}, ${filled} scores added${clashes ? `, ${clashes} clash${clashes === 1 ? '' : 'es'} (newest edit won)` : ''}${skipped ? `, extra holes ignored` : ''}.`);
    render();
  }

  function pickFiles({ multiple, onPick }) {
    const inp = WC.el('input', { type: 'file', accept: 'application/json,.json' });
    if (multiple) inp.multiple = true;
    inp.addEventListener('change', () => { if (inp.files.length) onPick(Array.from(inp.files)); });
    inp.click();
  }

  const actions = {
    goto: (el) => go(el.dataset.view),
    settings: () => openSettings(),
    demo: loadDemo,
    reset: doReset,
    undo: restoreBackup,
    export: exportJSON,
    import: () => pickFiles({ multiple: false, onPick: importReplace }),
    merge: () => pickFiles({ multiple: true, onPick: importMerge }),
    'bulk-add': () => {
      const ta = $('#bulk-teams');
      const n = addTeams(ta.value.split(/[\n,;]+/));
      if (n) toast(`Added ${n} team${n === 1 ? '' : 's'}.`);
      render();
    },
    'del-team': (el) => {
      const id = el.closest('[data-id]').dataset.id;
      const t = state.teams.find((x) => x.id === id);
      if (t.scores.some((s) => s != null) && !confirm(`Remove ${t.name} and their scores?`)) return;
      backup('team removal');
      state.teams = state.teams.filter((x) => x.id !== id);
      save(); render();
    },
    par: (el) => {
      const i = +el.dataset.i;
      state.holes[i].par = Math.max(1, Math.min(9, state.holes[i].par + +el.dataset.d));
      save(); rerenderKeepScroll();
    },
    'par-all': (el) => { state.holes.forEach((h) => { h.par = +el.dataset.p; }); save(); rerenderKeepScroll(); },
    holes: (el) => setHoleCount(+el.dataset.n),
    'holes-step': (el) => setHoleCount(state.holes.length + +el.dataset.d),
    'name-holes': () => { state.holes.forEach((h, i) => { h.name = HOLE_NAMES[i] || h.name; }); save(); rerenderKeepScroll(); },
    'clear-names': () => { state.holes.forEach((h) => { h.name = ''; }); save(); rerenderKeepScroll(); },
    mode: (el) => { ui.scoreMode = el.dataset.mode; render(); },
    'pick-hole': (el) => { ui.hole = +el.dataset.i; rerenderKeepScroll(); },
    'prev-hole': () => { ui.hole = Math.max(0, ui.hole - 1); rerenderKeepScroll(); },
    'next-hole': () => { ui.hole = Math.min(state.holes.length - 1, ui.hole + 1); rerenderKeepScroll(); },
    'pick-team': (el) => { ui.teamId = el.dataset.id; rerenderKeepScroll(); },
    cell: (el) => {
      ui.scoreMode = 'hole'; ui.hole = +el.dataset.i;
      render();
      const s = $('.mg-scoring'); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    inc: (el) => {
      const s = el.closest('.mg-stepper');
      const t = state.teams.find((x) => x.id === s.dataset.team), i = +s.dataset.i;
      const v = t.scores[i];
      setScore(t.id, i, v == null ? parOf(i) : Math.min(20, v + 1));
      rerenderKeepScroll();
    },
    dec: (el) => {
      const s = el.closest('.mg-stepper');
      const t = state.teams.find((x) => x.id === s.dataset.team), i = +s.dataset.i;
      const v = t.scores[i];
      setScore(t.id, i, v == null ? Math.max(1, parOf(i) - 1) : v <= 1 ? null : v - 1);
      rerenderKeepScroll();
    },
    sample: async () => {
      try {
        const blob = await (await fetch('assets/sample-scorecard.png')).blob();
        const image = await AI.prepareImage(blob);
        ui.photo = { status: 'idle', origin: 'sample', dataUrl: image.dataUrl, image };
      } catch (e) { ui.photo = { status: 'error', error: 'Could not load the sample card: ' + e.message }; }
      render();
    },
    'read-card': () => readCard(),
    'apply-card': applyCard,
    'photo-reset': () => { ui.photo = { status: 'idle' }; render(); },
    sound: () => { settings.sound = !settings.sound; saveSettings(); if (settings.sound) playStinger('r_crowd'); render(); },
    fullscreen: () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    },
    style: (el) => { settings.style = el.dataset.style; saveSettings(); stopAudio(); render(); },
    write: () => writeReport(),
    play: () => playReport(),
    stop: () => stopAudio(),
    stinger: (el) => { stopAudio(); playStinger(el.dataset.id); },
  };

  document.addEventListener('click', (e) => {
    const nav = e.target.closest('#nav [data-view]');
    if (nav) { e.preventDefault(); go(nav.dataset.view); return; }
    const a = e.target.closest('[data-act]');
    if (!a || a.disabled) return;
    const fn = actions[a.dataset.act];
    if (fn) { e.preventDefault(); fn(a, e); }
  });

  document.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-form="add-team"]');
    if (!f) return;
    e.preventDefault();
    const inp = $('#team-name');
    if (addTeams([inp.value])) {
      render();
      const again = $('#team-name');
      if (again && !again.disabled) again.focus();
    } else inp.select();
  });

  // Field edits that should not re-render (keeps focus while typing).
  document.addEventListener('input', (e) => {
    const el = e.target;
    const f = el.dataset && el.dataset.field;
    if (!f) return;
    if (f === 'team-name' || f === 'team-players') {
      const t = state.teams.find((x) => x.id === el.closest('[data-id]').dataset.id);
      if (f === 'team-name') t.name = el.value.slice(0, 40) || t.name; else t.players = el.value;
      save();
    } else if (f === 'hole-name') {
      state.holes[+el.dataset.i].name = el.value; save();
    } else if (f === 'rev-score') {
      const v = parseInt(el.value, 10);
      ui.photo.result.scores[+el.dataset.i] = Number.isFinite(v) && v >= 1 && v <= 20 ? v : null;
    } else if (f === 'rev-name') {
      ui.photo.result.team = el.value;
    }
  });

  document.addEventListener('change', async (e) => {
    const el = e.target;
    const f = el.dataset && el.dataset.field;
    if (f === 'rev-team') {
      ui.photo.result.matchId = el.value === '__new__' ? null : el.value;
      render();
    } else if (f === 'photo-file' && el.files && el.files[0]) {
      try {
        const image = await AI.prepareImage(el.files[0]);
        ui.photo = { status: 'idle', origin: 'upload', dataUrl: image.dataUrl, image };
      } catch (err) { ui.photo = { status: 'error', error: err.message }; }
      render();
    }
  });

  // Live updates from another tab/window on this machine (e.g. the projector board).
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      const st = normalize(readJSON(KEY));
      if (st) { state = st; if (!document.activeElement || !document.activeElement.matches('input, textarea, select')) rerenderKeepScroll(); }
    } else if (e.key === SKEY) {
      settings = Object.assign({}, DEFAULT_SETTINGS, readJSON(SKEY) || {});
    }
  });
  window.addEventListener('resize', () => { if (ui.view === 'board') render(); });

  /* ====================================================================== settings + QR */
  const dlg = $('#settings');
  function openSettings() {
    $('#set-claude').value = settings.claudeKey;
    $('#set-eleven').value = settings.elevenKey;
    $('#set-model').value = settings.model;
    $('#set-qr').value = settings.qrUrl;
    $('#set-qr').placeholder = defaultUrl();
    $('#set-offline').checked = settings.forceOffline;
    $('#set-sound').checked = settings.sound;
    $('#set-status').textContent = '';
    $('#set-status').className = 'mg-set-status';
    dlg.showModal();
  }
  function readSettingsForm() {
    settings.claudeKey = $('#set-claude').value.trim();
    settings.elevenKey = $('#set-eleven').value.trim();
    settings.model = $('#set-model').value;
    settings.qrUrl = $('#set-qr').value.trim();
    settings.forceOffline = $('#set-offline').checked;
    settings.sound = $('#set-sound').checked;
    saveSettings();
  }
  function setStatus(msg, kind) {
    const s = $('#set-status');
    s.textContent = msg;
    s.className = 'mg-set-status' + (kind ? ' is-' + kind : '');
  }
  dlg.addEventListener('input', readSettingsForm);
  dlg.addEventListener('change', readSettingsForm);
  dlg.addEventListener('close', () => { readSettingsForm(); render(); });
  $('#set-show').addEventListener('click', () => {
    const show = $('#set-claude').type === 'password';
    $('#set-claude').type = $('#set-eleven').type = show ? 'text' : 'password';
    $('#set-show').textContent = show ? 'Hide keys' : 'Show keys';
  });
  $('#set-forget').addEventListener('click', () => {
    $('#set-claude').value = ''; $('#set-eleven').value = '';
    readSettingsForm(); setStatus('Keys removed from this browser.', 'ok');
  });
  $('#set-test-claude').addEventListener('click', async () => {
    readSettingsForm();
    if (!hasClaude()) return setStatus('Paste a Claude API key first.', 'alert');
    setStatus('Testing Claude…');
    try {
      const out = await AI.testClaude({ key: settings.claudeKey, model: settings.model });
      setStatus(`Claude works: ${out.model}, ${(out.ms / 1000).toFixed(1)}s${out.notes.length ? ' (' + out.notes.join(', ') + ')' : ''}.`, 'ok');
    } catch (e) { setStatus(e.message, 'alert'); }
  });
  $('#set-test-eleven').addEventListener('click', async () => {
    readSettingsForm();
    if (!hasEleven()) return setStatus('Paste an ElevenLabs key first.', 'alert');
    setStatus('Testing ElevenLabs…');
    try {
      const blob = await AI.elevenTTS({ key: settings.elevenKey, voiceId: C.STYLES.golf.voice, text: '[excited] Testing, testing! The White Cube Mini Golf Open is on air.' });
      stopAudio();
      playFile(URL.createObjectURL(blob), audioToken);
      setStatus('ElevenLabs works: you should hear Barnaby.', 'ok');
    } catch (e) { setStatus(e.message, 'alert'); }
  });

  function defaultUrl() {
    const u = new URL(location.href);
    u.search = ''; u.hash = '';
    return u.href;
  }
  function qrSVG(text) {
    const qr = qrcode(0, text.length > 300 ? 'L' : 'M'); // long join links: lower ECC keeps the code scannable
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount(), m = 2;
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
    return `<svg viewBox="0 0 ${n + 2 * m} ${n + 2 * m}" shape-rendering="crispEdges" role="img" aria-label="QR code for ${esc(text)}"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }
  /* The QR can carry the setup (teams + course, no scores) so phones open ready to score. */
  const b64u = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64u = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
  function joinUrl(base) {
    const pack = { h: state.holes.map((h) => (h.name ? [h.par, h.name] : [h.par])), t: state.teams.map((t) => (t.players ? [t.name, t.players] : [t.name])) };
    const u = new URL(base, location.href);
    u.searchParams.set('join', b64u(JSON.stringify(pack)));
    return u.href;
  }
  function handleJoin() {
    const raw = params.get('join');
    if (!raw) return;
    const u = new URL(location.href);
    u.searchParams.delete('join');
    history.replaceState(null, '', u);
    let pack;
    try { pack = JSON.parse(unb64u(raw)); } catch (_) { return toast('That QR link was damaged. Ask for a fresh one.', 'alert'); }
    if (!pack || !Array.isArray(pack.h) || !Array.isArray(pack.t)) return;
    const holes = pack.h.slice(0, MAX_HOLES).map(([par, name]) => ({ par: clampInt(par, 1, 9, 3), name: String(name || '').slice(0, 40) }));
    const sameCourse = holes.length === state.holes.length && holes.every((h, i) => h.par === state.holes[i].par);
    const hasScores = state.teams.some((t) => t.scores.some((s) => s != null));
    if (hasScores && !sameCourse && !confirm('This phone already has scores for a different course. Replace them with the shared setup?')) return;
    if (hasScores) backup('join');
    const teams = pack.t.slice(0, MAX_TEAMS).map(([name, players]) => {
      const old = state.teams.find((t) => normName(t.name) === normName(name));
      return { id: old ? old.id : uid(), name: String(name).slice(0, 40), players: String(players || (old && old.players) || ''), updatedAt: old ? old.updatedAt : 0,
        scores: holes.map((_, i) => (sameCourse && old && old.scores[i] != null ? old.scores[i] : null)) };
    });
    state = normalize({ v: 1, holes, teams, updatedAt: Date.now() });
    save();
    ui.view = 'scores';
    ui.scoreMode = 'team';
    toast(`Ready: ${teams.length} teams, ${holes.length} holes. Pick your team.`);
  }

  const qrDlg = $('#qr');
  function drawQR() {
    const base = settings.qrUrl || defaultUrl();
    const url = $('#qr-include').checked && state.teams.length ? joinUrl(base) : base;
    $('#qr-code').innerHTML = qrSVG(url);
    $('#qr-url').textContent = url.length > 90 ? url.slice(0, 70) + '…' : url;
    $('#qr-url').title = url;
    $('#qr-warn').hidden = !/\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(url);
  }
  function openQR() {
    drawQR();
    qrDlg.showModal();
  }
  $('#qr-include').addEventListener('change', drawQR);
  $('#btn-qr').addEventListener('click', openQR);
  $('#btn-settings').addEventListener('click', openSettings);
  $('#qr-settings').addEventListener('click', () => { qrDlg.close(); openSettings(); });
  [dlg, qrDlg].forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

  /* ====================================================================== bits */
  let toastTimer = null;
  function toast(msg, kind) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'mg-toast is-show' + (kind ? ' is-' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'mg-toast'; }, kind === 'alert' ? 6000 : 3600);
  }

  function burst() {
    const box = WC.el('div', { class: 'mg-burst', 'aria-hidden': 'true' });
    for (let k = 0; k < 18; k++) {
      const c = WC.el('i');
      const a = (k / 18) * Math.PI * 2;
      const r = 120 + Math.random() * 160;
      c.style.setProperty('--x', `${Math.cos(a) * r}px`);
      c.style.setProperty('--y', `${Math.sin(a) * r}px`);
      c.style.setProperty('--r', `${Math.random() * 360}deg`);
      if (k % 3 === 0) c.className = 'is-solid';
      box.append(c);
    }
    document.body.append(box);
    setTimeout(() => box.remove(), 1400);
  }

  WC.keys({
    b: () => go('board'), s: () => go('scores'), r: () => go('report'), t: () => go('stats'),
    p: () => go('photo'), f: () => actions.fullscreen(), Escape: () => { if (ui.view === 'board') go('scores'); },
  });

  handleJoin();
  loadManifest();
  render();
})();

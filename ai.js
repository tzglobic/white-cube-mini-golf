/* Mini Golf Open: live AI calls made straight from the browser.
   - Claude Messages API (vision scorecard reading, match report)
   - ElevenLabs text-to-speech
   Keys come from Settings (this browser's localStorage only) and are sent only to
   api.anthropic.com / api.elevenlabs.io. Every failure throws an Error whose message
   is safe to show on screen (it never contains the key). */
(function () {
  const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
  const API_VERSION = '2026-10-21';
  const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

  /**
   * One Messages API call with graceful degradation:
   *  1) full request: fallbacks:"default" (+ beta header) and, if given, a JSON schema;
   *  2) a 400 that blames the fallback/beta -> retry without it;
   *  3) a 400 that blames output_config.format -> retry with a "JSON only" instruction.
   * Returns { text, json, model, ms, notes }.
   */
  async function claude({ key, model, system, content, effort = 'low', schema = null, maxTokens = 16000 }) {
    if (!key) throw new Error('No Claude API key set. Open Settings to add one.');
    const t0 = performance.now();
    const notes = [];
    let useFallback = true;
    let useSchema = !!schema;

    for (let attempt = 0; attempt < 3; attempt++) {
      let userContent = content;
      if (schema && !useSchema) {
        userContent = content.concat([{ type: 'text', text:
          'Reply with ONLY a JSON object matching this JSON Schema, no prose, no code fences:\n' + JSON.stringify(schema) }]);
      }
      const body = {
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: userContent }],
        output_config: { effort },
      };
      if (useSchema) body.output_config.format = { type: 'json_schema', schema };
      if (useFallback) body.fallbacks = 'default';

      const headers = {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': API_VERSION,
        // Required for CORS when calling the API directly from a browser page.
        'anthropic-dangerous-direct-browser-access': 'true',
      };
      if (useFallback) headers['anthropic-beta'] = FALLBACK_BETA;

      let res;
      try {
        res = await fetch(CLAUDE_URL, { method: 'POST', headers, body: JSON.stringify(body) });
      } catch (e) {
        throw new Error(`Could not reach api.anthropic.com (${e.message}). Check the network / Wi-Fi.`);
      }
      let data = null;
      try { data = await res.json(); } catch (_) { /* non-JSON error page */ }

      if (!res.ok) {
        const msg = (data && data.error && data.error.message) || res.statusText || 'request failed';
        const type = (data && data.error && data.error.type) || '';
        if (res.status === 400 && useFallback && /fallback|beta/i.test(msg)) {
          useFallback = false; notes.push('retried without server-side fallback'); continue;
        }
        if (res.status === 400 && useSchema && /output_config|format|schema/i.test(msg)) {
          useSchema = false; notes.push('retried without structured output'); continue;
        }
        let hint = '';
        if (res.status === 401) hint = ' Check the Claude key in Settings.';
        else if (res.status === 404) hint = ' Check the model id in Settings.';
        else if (res.status === 429) hint = ' Rate limited: wait a few seconds and try again.';
        else if (res.status >= 500) hint = ' Anthropic API is having a moment: try again.';
        const err = new Error(`Claude API ${res.status}${type ? ' ' + type : ''}: ${msg}.${hint}`);
        err.status = res.status;
        throw err;
      }

      if (data.stop_reason === 'refusal') {
        const cat = data.stop_details && data.stop_details.category;
        throw new Error(`Claude declined this request${cat ? ` (${cat})` : ''}.`);
      }
      if (data.stop_reason === 'max_tokens') throw new Error('Claude ran out of output tokens before finishing.');

      const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
      let json = null;
      if (schema) {
        json = parseJson(text);
        if (!json) throw new Error('Claude replied, but not with readable JSON: ' + text.slice(0, 160));
      }
      return { text, json, model: data.model || model, ms: Math.round(performance.now() - t0), notes };
    }
    throw new Error('Claude request failed after retries.');
  }

  function parseJson(text) {
    try { return JSON.parse(text); } catch (_) { /* try to find an object in prose */ }
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch (_) { /* fall through */ } }
    return null;
  }

  /* ---------- Scorecard (vision) ---------- */
  const SCORECARD_SCHEMA = {
    type: 'object',
    properties: {
      team: { type: 'string' },
      players: { type: 'array', items: { type: 'string' } },
      scores: { type: 'array', items: { anyOf: [{ type: 'integer' }, { type: 'null' }] } },
      notes: { type: 'string' },
    },
    required: ['team', 'players', 'scores', 'notes'],
    additionalProperties: false,
  };

  async function readScorecard({ key, model, image, pars, teamNames }) {
    const n = pars.length;
    const system = 'You transcribe photos of hand-filled mini golf scorecards exactly as written. You never guess a number you cannot see.';
    const text = [
      `Transcribe this mini golf scorecard. The course has ${n} holes with pars [${pars.join(', ')}].`,
      teamNames.length ? `Teams already registered: ${teamNames.map((t) => `"${t}"`).join(', ')}.` : '',
      'Return:',
      '- team: the team name as written. If it clearly matches a registered team, use that exact spelling.',
      '- players: player names if written, otherwise an empty array.',
      `- scores: exactly ${n} entries, the strokes for holes 1 to ${n} in order, as integers. Use null for a blank or unreadable hole. If a number is crossed out, use the corrected value. Ignore the PAR row and any TOTAL column.`,
      '- notes: one short sentence about anything corrected, smudged or uncertain (empty string if nothing).',
    ].filter(Boolean).join('\n');
    const content = [
      { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.b64 } },
      { type: 'text', text },
    ];
    const out = await claude({ key, model, system, content, effort: 'medium', schema: SCORECARD_SCHEMA, maxTokens: 16000 });
    const j = out.json || {};
    const scores = Array.from({ length: n }, (_, i) => {
      const v = Array.isArray(j.scores) ? j.scores[i] : null;
      const num = typeof v === 'number' ? Math.round(v) : parseInt(v, 10);
      return Number.isFinite(num) && num >= 1 && num <= 20 ? num : null;
    });
    return {
      team: String(j.team || '').trim(),
      players: Array.isArray(j.players) ? j.players.map(String).filter(Boolean) : [],
      scores,
      notes: String(j.notes || ''),
      extraHoles: Array.isArray(j.scores) && j.scores.length > n ? j.scores.length - n : 0,
      model: out.model, ms: out.ms, notes2: out.notes,
    };
  }

  /* ---------- Match report ---------- */
  async function writeReport({ key, model, facts, style }) {
    const system = [
      'You are a sports commentator delivering a short spoken match report for a company mini golf tournament (White Cube, the contemporary art gallery, staff day out).',
      `Style: ${style.brief}`,
      'Rules:',
      '- 110 to 160 words, to be read aloud in about 50 seconds. One paragraph of plain spoken prose: no markdown, no headings, no lists, no emoji.',
      '- Use only the facts provided. Never invent scores, players or events. Cover: the leader, the comeback (if there is one), the hardest hole, the best single hole, and the wooden spoon (last place).',
      '- Say scores in words relative to par ("two under par", "level par"). Spell numbers as words.',
      '- You may add 3 to 5 inline ElevenLabs audio tags in square brackets to direct the voice, e.g. [excited], [whispers], [softly], [laughs], [gasps], [sighs], [shouting]. Nothing else in square brackets.',
      '- Warm, good-natured, office-appropriate teasing only. British English.',
      facts.finished ? '' : '- The round is still in progress: report it as a mid-round update.',
    ].filter(Boolean).join('\n');
    const content = [{ type: 'text', text: 'Tournament facts (JSON):\n' + JSON.stringify(facts, null, 1) + '\n\nWrite the match report now.' }];
    const out = await claude({ key, model, system, content, effort: 'low', maxTokens: 16000 });
    const text = out.text.replace(/[*#_`]/g, '').replace(/\n+/g, ' ').trim();
    if (!text) throw new Error('Claude returned an empty report.');
    return { text, model: out.model, ms: out.ms, notes: out.notes };
  }

  async function testClaude({ key, model }) {
    const out = await claude({ key, model, system: 'Reply with the single word OK.', content: [{ type: 'text', text: 'Ping.' }], effort: 'low', maxTokens: 1024 });
    return out;
  }

  /* ---------- ElevenLabs TTS ---------- */
  async function elevenTTS({ key, voiceId, text }) {
    if (!key) throw new Error('No ElevenLabs key set.');
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({
          text,
          model_id: 'eleven_v3',
          // eleven_v3 accepts stability 0.0 (creative), 0.5 (natural) or 1.0 (robust).
          voice_settings: { stability: 0.5, similarity_boost: 0.8 },
        }),
      });
    } catch (e) {
      throw new Error(`Could not reach api.elevenlabs.io (${e.message}).`);
    }
    if (!res.ok) {
      let msg = res.statusText;
      try {
        const j = await res.json();
        const d = j && j.detail;
        msg = (d && (d.message || d.status)) || (typeof d === 'string' ? d : JSON.stringify(j).slice(0, 200));
      } catch (_) { /* keep statusText */ }
      throw new Error(`ElevenLabs ${res.status}: ${msg}${res.status === 401 ? ' (check the key in Settings)' : ''}`);
    }
    const blob = await res.blob();
    if (!blob.size) throw new Error('ElevenLabs returned empty audio.');
    return blob;
  }

  /* ---------- Image prep: downscale phone photos before upload ---------- */
  async function prepareImage(blob, maxSide = 1568) {
    let src;
    try {
      src = await createImageBitmap(blob);
    } catch (_) {
      src = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('This browser cannot open that image type (try a JPEG or PNG; HEIC only works in Safari).'));
        img.src = URL.createObjectURL(blob);
      });
    }
    const w = src.width, h = src.height;
    const s = Math.min(1, maxSide / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * s); c.height = Math.round(h * s);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(src, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL('image/jpeg', 0.86);
    return { dataUrl, b64: dataUrl.split(',')[1], mediaType: 'image/jpeg', width: c.width, height: c.height };
  }

  window.MGAI = { claude, readScorecard, writeReport, testClaude, elevenTTS, prepareImage, SCORECARD_SCHEMA };
})();

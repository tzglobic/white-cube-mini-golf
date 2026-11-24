/* Mini Golf Open: commentator styles + offline, template-based match reports.
   Text may contain ElevenLabs v3 audio tags like [excited]; they are stripped for
   on-screen reading styles and for the Web Speech fallback. */
(function () {
  const BARNABY = 'QYrOVogqhHWUzdZFXf0E';
  const GEORGE = 'JBFqnCBsd6RMkjVDRZzb';

  const STYLES = {
    golf: {
      id: 'golf', label: 'Classic golf', sub: 'Hushed, BBC',
      voice: BARNABY, voiceName: 'Barnaby', rate: 0.94, pitch: 1,
      intro: 'intro', outro: 'outro',
      brief: 'Classic British television golf commentary: hushed, understated, reverent, dry wit, long pauses (use "..."), gentle irony. Think of a quiet Sunday afternoon at a links course.',
    },
    football: {
      id: 'football', label: 'Excitable football', sub: 'Full volume',
      voice: BARNABY, voiceName: 'Barnaby', rate: 1.12, pitch: 1.05,
      intro: 'intro', outro: 'outro',
      brief: 'Excitable British football commentary: breathless, hyperbolic, shouting at big moments, football cliches (a game of two halves, what a hit, they will not want to see that again), treat putts like goals.',
    },
    nature: {
      id: 'nature', label: 'Nature documentary', sub: 'Whispered wonder',
      voice: GEORGE, voiceName: 'George', rate: 0.9, pitch: 0.95,
      intro: 'n_intro', outro: 'n_outro',
      brief: 'A hushed British wildlife-documentary narrator observing the teams as if they were animals in the wild: herds, packs, migration, survival, the watering hole, wonder at ordinary behaviour. Do not name or imitate any real presenter.',
    },
    f1: {
      id: 'f1', label: 'Formula 1', sub: 'Lights out',
      voice: BARNABY, voiceName: 'Barnaby', rate: 1.15, pitch: 1,
      intro: 'intro', outro: 'outro',
      brief: 'Formula 1 race commentary: fast, technical, urgent. Lights out, pole position, tyres, pit wall, undercut, DRS, fastest lap, chequered flag. Treat holes as laps and strokes as lap time.',
    },
  };

  const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
    'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  const words = (n) => (n >= 0 && n < NUM.length ? NUM[n] : String(n));
  const ord = (n) => ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'][n] || `${n}th`;
  const par = (n) => (n === 0 ? 'level par' : `${words(Math.abs(n))} ${n < 0 ? 'under' : 'over'} par`);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const holeRef = (h) => (h.name ? `hole ${h.hole}, ${h.name}` : `hole ${h.hole}`);
  const holeShort = (h) => (h.name ? h.name : `hole ${h.hole}`);
  // "the Infinity Room" but never "the The Plinth"; plain "hole 4" when unnamed
  const theHole = (h) => (!h.name ? `hole ${h.hole}` : /^the\s/i.test(h.name) ? h.name : `the ${h.name}`);
  const strokesWord = (s) => (s === 1 ? 'one stroke' : `${words(s)} strokes`);
  const gapText = (f) => (f.runnerUp && f.runnerUp.gap > 0
    ? `, ${words(f.runnerUp.gap)} ${f.runnerUp.gap === 1 ? 'shot' : 'shots'} clear of ${f.runnerUp.name}` : '');

  /* Each style: functions returning a sentence (or '' to skip). f = facts from app.js. */
  const T = {
    golf: {
      open: (f) => f.finished
        ? pick([
          `[softly] Good afternoon from the White Cube Mini Golf Open. ${cap(words(f.teamCount))} teams, ${words(f.totalHoles)} holes, and not a breath of wind.`,
          `[softly] A quiet, almost reverent afternoon here at the White Cube Open, where ${words(f.teamCount)} teams have done battle over ${words(f.totalHoles)} holes.`])
        : `[softly] We join the White Cube Mini Golf Open after ${words(f.holesPlayed)} of ${words(f.totalHoles)} holes. The galleries are hushed.`,
      leader: (f) => f.tieForLead
        ? `At the top, it is all square: ${f.tieNames}, each ${par(f.leader.toPar)}. [whispers] Nobody dares breathe.`
        : pick([
          `At the summit of the leaderboard, ${f.leader.name}: ${par(f.leader.toPar)}${gapText(f)}. Composed. Unhurried. Rather lovely to watch.`,
          `${f.leader.name} lead the way, ${par(f.leader.toPar)}${gapText(f)}. [whispers] One senses they know it.`]),
      comeback: (f) => f.comeback ? pick([
        `But the story of the day belongs to ${f.comeback.name}. ${cap(ord(f.comeback.from))} after ${words(f.comeback.atHole)} holes... ${ord(f.comeback.to)} now. Quite remarkable.`,
        `And a word for ${f.comeback.name}, who were ${ord(f.comeback.from)} at the halfway mark and have quietly climbed to ${ord(f.comeback.to)}. Patience, rewarded.`]) : '',
      hardest: (f) => f.hardest ? pick([
        `${cap(holeRef(f.hardest))} proved the sternest examination, averaging ${f.hardest.avgText} against a par of ${words(f.hardest.par)}. [sighs] A cruel, cruel hole.`,
        `${cap(theHole(f.hardest))} took no prisoners: an average of ${f.hardest.avgText} on a par ${words(f.hardest.par)}. Grown adults were seen staring at the carpet.`]) : '',
      best: (f) => f.best ? (f.best.strokes === 1
        ? `[gasps] And a hole in one for ${f.best.team} at ${holeShort(f.best)}. One does not see that every day. One does not see that most days.`
        : `Shot of the day: ${f.best.team} at ${holeShort(f.best)}, ${strokesWord(f.best.strokes)} on a par ${words(f.best.par)}. Exquisite.`) : '',
      spoon: (f) => f.spoon ? pick([
        `And the wooden spoon, I'm afraid, goes to ${f.spoon.name}, ${par(f.spoon.toPar)}. [laughs] Tremendous company, by all accounts.`,
        `Spare a thought for ${f.spoon.name}, propping up the leaderboard at ${par(f.spoon.toPar)}. Character-building stuff.`]) : '',
      close: (f) => f.finished ? pick(['[softly] A fine day for it. Back to the studio.', 'Marvellous. Simply marvellous.'])
        : '[whispers] Plenty of golf still to play.',
    },
    football: {
      open: (f) => f.finished
        ? pick([
          `[excited] WHAT an afternoon at the White Cube Mini Golf Open! ${cap(words(f.teamCount))} teams, ${words(f.totalHoles)} holes, and absolutely no mercy!`,
          `[shouting] It's been a game of ${words(f.totalHoles)} halves here at the White Cube Open, and we have seen EVERYTHING!`])
        : `[excited] We're ${words(f.holesPlayed)} holes in at the White Cube Open and the atmosphere is ELECTRIC!`,
      leader: (f) => f.tieForLead
        ? `It's level at the top! ${f.tieNames}, ${par(f.leader.toPar)}, and you could cut the tension with a putter!`
        : pick([
          `${f.leader.name} are top of the table, ${par(f.leader.toPar)}${gapText(f)}, and they are playing like champions, Clive!`,
          `[excited] ${f.leader.name}! ${cap(par(f.leader.toPar))}${gapText(f)}! You simply cannot coach that!`]),
      comeback: (f) => f.comeback ? pick([
        `[shouting] And what about ${f.comeback.name}?! ${cap(ord(f.comeback.from))} at half-time, ${ord(f.comeback.to)} now! That's a comeback, that is!`,
        `${f.comeback.name} were dead and buried in ${ord(f.comeback.from)}, and now look at them, ${ord(f.comeback.to)}! Never write them off!`]) : '',
      hardest: (f) => f.hardest ? pick([
        `${cap(holeRef(f.hardest))} has been an absolute nightmare, averaging ${f.hardest.avgText} on a par ${words(f.hardest.par)}. [groans] They won't want to see the replays of that.`,
        `${cap(theHole(f.hardest))}, honestly, it's been a graveyard: ${f.hardest.avgText} on average on a par ${words(f.hardest.par)}!`]) : '',
      best: (f) => f.best ? (f.best.strokes === 1
        ? `[shouting] And a HOLE IN ONE for ${f.best.team} at ${holeShort(f.best)}! Get in! GET IN!`
        : `Goal of the day: ${f.best.team} at ${holeShort(f.best)}, ${strokesWord(f.best.strokes)} on a par ${words(f.best.par)}. Top bins!`) : '',
      spoon: (f) => f.spoon ? pick([
        `And down at the bottom, ${f.spoon.name}, ${par(f.spoon.toPar)}. [laughs] Sacked in the morning? Not a chance, they bring the snacks.`,
        `${f.spoon.name} prop up the table on ${par(f.spoon.toPar)}. It's a relegation battle, but the fans are still singing!`]) : '',
      close: (f) => f.finished ? pick(['[excited] And the referee blows for full time! Unbelievable scenes!', 'They think it\'s all over... it is now!'])
        : '[excited] Still all to play for!',
    },
    nature: {
      open: (f) => f.finished
        ? pick([
          `[softly] Here, on the closely cropped grasslands of the White Cube Open, ${words(f.teamCount)} groups have completed their long migration across ${words(f.totalHoles)} holes.`,
          `[whispers] Every year, as the light shortens, the gallery staff leave their white rooms and gather here, putters in hand. ${cap(words(f.teamCount))} groups. ${cap(words(f.totalHoles))} holes.`])
        : `[softly] ${cap(words(f.holesPlayed))} holes into their migration, the groups are beginning to separate.`,
      leader: (f) => f.tieForLead
        ? `Two groups, ${f.tieNames}, share the high ground at ${par(f.leader.toPar)}. Neither will yield.`
        : pick([
          `At the head of the herd, ${f.leader.name}, ${par(f.leader.toPar)}${gapText(f)}. Calm. Efficient. Perfectly adapted to the carpet.`,
          `${f.leader.name} have established dominance, ${par(f.leader.toPar)}${gapText(f)}. [whispers] The others watch, and learn.`]),
      comeback: (f) => f.comeback ? `But nature favours the persistent. ${f.comeback.name}, once ${ord(f.comeback.from)} and seemingly lost, have climbed to ${ord(f.comeback.to)}. Extraordinary.` : '',
      hardest: (f) => f.hardest ? pick([
        `At ${holeRef(f.hardest)}, the terrain turns hostile. An average of ${f.hardest.avgText} strokes, on a par ${words(f.hardest.par)}. [sighs] Not every ball returns.`,
        `${cap(theHole(f.hardest))} is a place of hardship, where even the strongest needed ${f.hardest.avgText} strokes on average.`]) : '',
      best: (f) => f.best ? (f.best.strokes === 1
        ? `[whispers] And then, at ${holeShort(f.best)}... a single stroke. A hole in one, for ${f.best.team}. Rarely captured on film.`
        : `At ${holeShort(f.best)}, ${f.best.team} display a rare precision: ${strokesWord(f.best.strokes)}, on a par ${words(f.best.par)}.`) : '',
      spoon: (f) => f.spoon ? `And at the rear of the herd, ${f.spoon.name}, ${par(f.spoon.toPar)}. Slower, perhaps. But they have found something the others have not: [softly] each other.` : '',
      close: (f) => f.finished ? '[softly] The season is over. The herd rests.' : '[softly] The journey continues.',
    },
    f1: {
      open: (f) => f.finished
        ? pick([
          `[excited] Chequered flag at the White Cube Grand Prix! ${cap(words(f.teamCount))} teams, ${words(f.totalHoles)} laps, and a proper race!`,
          `[excited] It's lights out and away we went, ${words(f.totalHoles)} holes ago, and what a race it's been!`])
        : `[excited] Lap ${words(f.holesPlayed)} of ${words(f.totalHoles)} at the White Cube Grand Prix, and the strategy calls are coming in!`,
      leader: (f) => f.tieForLead
        ? `Identical times at the front! ${f.tieNames}, both ${par(f.leader.toPar)}! You couldn't split them with a stopwatch!`
        : pick([
          `${f.leader.name} on pole, ${par(f.leader.toPar)}${gapText(f)}. Clean air, fresh tyres, total control.`,
          `[excited] ${f.leader.name} lead the race, ${par(f.leader.toPar)}${gapText(f)}. Purple sectors everywhere!`]),
      comeback: (f) => f.comeback ? `And look at the pace of ${f.comeback.name}! ${cap(ord(f.comeback.from))} at the halfway mark, up to ${ord(f.comeback.to)}! The undercut has absolutely worked!` : '',
      hardest: (f) => f.hardest ? pick([
        `${cap(holeRef(f.hardest))} has been the tyre-killer: an average of ${f.hardest.avgText} on a par ${words(f.hardest.par)}. [groans] Lots of lock-ups there.`,
        `Sector trouble at ${theHole(f.hardest)}: ${f.hardest.avgText} average on a par ${words(f.hardest.par)}. That's where the race was lost.`]) : '',
      best: (f) => f.best ? (f.best.strokes === 1
        ? `[shouting] Fastest lap of the day: a HOLE IN ONE for ${f.best.team} at ${holeShort(f.best)}! Mega! Absolutely mega!`
        : `Fastest lap: ${f.best.team} at ${holeShort(f.best)}, ${strokesWord(f.best.strokes)} on a par ${words(f.best.par)}.`) : '',
      spoon: (f) => f.spoon ? `And at the back, ${f.spoon.name}, ${par(f.spoon.toPar)}. [laughs] Box, box, they need a new strategy.` : '',
      close: (f) => f.finished ? '[excited] And that is the chequered flag!' : '[excited] Plenty of laps to go!',
    },
  };

  function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

  function write(facts, styleId) {
    const t = T[styleId] || T.golf;
    if (!facts || !facts.holesPlayed) {
      return '[softly] No scores yet. The course waits, and so do we.';
    }
    return ['open', 'leader', 'comeback', 'hardest', 'best', 'spoon', 'close']
      .map((k) => t[k](facts)).filter(Boolean).join(' ');
  }

  const stripTags = (s) => String(s || '').replace(/\s*\[[^\]\n]{1,30}\]\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();

  window.MGCommentary = { STYLES, write, stripTags, words };
})();

// ===== 게임 모듈: 원카드 (2~5인) =====
// OCRules(games/one-card/js/rules.js)는 build-gs.mjs가 이름공간으로 감싸 넣어 줌
// 남의 손패와 뽑을 더미 순서는 서버에만! view()는 내 패와 남은 장수만 내려보냄
// 대기방 옵션(room.ocOpts): 처음 장수 5/6/7 · 파산 장수 15/20/25 · 조커 포함 · 순위 끝까지/1등만

registerGame('one-card', {
  title: '원카드',
  minPlayers: 2,
  maxPlayers: 5,
  bots: [
    { name: '다람쥐 봇', emoji: '🐿️' },
    { name: '부엉이 봇', emoji: '🦉' },
    { name: '판다 봇', emoji: '🐼' },
    { name: '오리 봇', emoji: '🦆' },
    { name: '고슴도치 봇', emoji: '🦔' },
  ],

  config(room, req) {
    const cur = room.ocOpts || OCRules.normOpts({});
    room.ocOpts = OCRules.normOpts({
      hand: req.hand != null ? req.hand : cur.hand,
      bust: req.bust != null ? req.bust : cur.bust,
      jokers: req.jokers != null ? req.jokers : cur.jokers,
      mode: req.ocMode != null ? req.ocMode : cur.mode,
    });
  },

  reset(room) {
    room.oc = null;
    room.ocOpts = OCRules.normOpts(room.ocOpts || {});
  },

  start(room) {
    room.oc = OCRules.newGame(room.players.length, room.ocOpts);
    room.status = 'playing';
    pushEvent(room, { type: 'start', turn: room.oc.turn, top: OCRules.topOf(room.oc), hand: room.oc.opts.hand });
  },

  act(room, seat, req) {
    if (room.status !== 'playing' || !room.oc) fail('지금은 할 수 없어요.');
    const g = room.oc;
    const a = req.action;
    if (a === 'play') ocApply(room, () => OCRules.play(g, seat, String(req.card || ''), { suit: req.suit, call: !!req.call }));
    else if (a === 'draw') ocApply(room, () => OCRules.draw(g, seat));
    else if (a === 'pass') ocApply(room, () => OCRules.pass(g, seat));
    else if (a === 'call') ocApply(room, () => OCRules.callLast(g, seat));
    else if (a === 'catch') ocApply(room, () => OCRules.catchLast(g, seat));
    else fail('알 수 없는 요청이에요.');
  },

  actor(room) {
    const g = room.oc;
    if (room.status !== 'playing' || !g || g.phase === 'over') return -1;
    const catcher = ocCatcher(room);
    if (catcher >= 0) return catcher;
    return g.turn;
  },
  botDelay(room) {
    const g = room.oc;
    if (g && ocCatcher(room) >= 0) return 2400; // 사람이 '원카드!'를 누를 시간
    if (g && g.attack > 0) return 1300;
    return g && g.phase === 'drawn' ? 700 : 1100;
  },
  botMove(room, seat) {
    const g = room.oc;
    const p = room.players[seat];
    if (ocCatcher(room) === seat) {
      const pr = OCRules.CATCH_P[p.difficulty] || OCRules.CATCH_P.normal;
      if (Math.random() < pr) ocApply(room, () => OCRules.catchLast(g, seat));
      else g.catchTried = true;
      return;
    }
    ocApply(room, () => OCRules.botStep(g, seat, p.bot ? p.difficulty : 'easy'));
  },

  playerView(room, p, i) {
    return { count: room.oc ? room.oc.hands[i].length : 0 };
  },

  view(room, mySeat) {
    const g = room.oc;
    return { ocOpts: room.ocOpts, oc: g ? OCRules.publicView(g, mySeat) : null };
  },

  onLeave(room) {
    if (room.oc) room.oc.catchTried = false;
  },

  offline: {
    deck: () => OCRules.makeDeck(true),
    deal: 7,
    zones: [{ id: 'discard', name: '버린 더미', kind: 'pile' }],
    name: (c) => OCRules.cardName(c),
    sort: (a, b) => OCRules.compareCodes(a, b),
    setup(ot) {
      const i = ot.draw.findIndex((c) => OCRules.isPlain(c.f));
      const card = ot.draw.splice(i < 0 ? 0 : i, 1)[0];
      card.up = true;
      ot.zones.discard.push([card]);
    },
    actions: ['draw', 'play', 'take', 'give', 'recycle'],
  },
});

/** 깜빡한 사람(unsafe)을 지적할 봇 자리 (없으면 -1) */
function ocCatcher(room) {
  const g = room.oc;
  if (!g || g.unsafe < 0 || g.catchTried) return -1;
  for (let k = 1; k < g.n; k++) {
    const s = (g.unsafe + k) % g.n;
    const p = room.players[s];
    if (p && p.bot && !p.left && g.status[s] === 'in') return s;
  }
  return -1;
}

function ocApply(room, fn) {
  let evs;
  try {
    evs = fn();
  } catch (e) {
    fail(e.message);
  }
  const g = room.oc;
  evs.forEach((ev) => pushEvent(room, ev));
  if (g.phase === 'over' && room.status === 'playing') {
    room.status = 'finished';
    room.resultText = '순위: ' + g.ranking.map((s) => room.players[s].name).join(' > ') + ' (' + g.moves + '수)';
  }
}

// ===== 게임 모듈: 컬러 러시 (2~6인) =====
// CRRules(games/color-rush/js/rules.js)는 build-gs.mjs가 이름공간으로 감싸 넣어 줌
// 남의 손패와 뽑을 더미 순서는 서버에만! view()는 내 패와 남은 장수만 내려보냄

registerGame('color-rush', {
  title: '컬러 러시',
  minPlayers: 2,
  maxPlayers: 6,
  bots: [
    { name: '지우개 봇', emoji: '🧽' },
    { name: '연필 봇', emoji: '✏️' },
    { name: '자 봇', emoji: '📏' },
    { name: '풀 봇', emoji: '🧴' },
    { name: '가위 봇', emoji: '✂️' },
  ],

  reset(room) {
    room.cr = null;
  },

  start(room) {
    room.cr = CRRules.newGame(room.players.length);
    room.status = 'playing';
    pushEvent(room, { type: 'start', turn: room.cr.turn, top: CRRules.topOf(room.cr) });
  },

  act(room, seat, req) {
    if (room.status !== 'playing' || !room.cr) fail('지금은 할 수 없어요.');
    const g = room.cr;
    const a = req.action;
    if (a === 'play') crApply(room, () => CRRules.play(g, seat, String(req.card || ''), { color: req.color, call: !!req.call }));
    else if (a === 'draw') crApply(room, () => CRRules.draw(g, seat));
    else if (a === 'pass') crApply(room, () => CRRules.pass(g, seat));
    else if (a === 'call') crApply(room, () => CRRules.callLast(g, seat));
    else if (a === 'catch') crApply(room, () => CRRules.catchLast(g, seat));
    else fail('알 수 없는 요청이에요.');
  },

  /** 지금 움직일 사람: 깜빡한 사람이 있으면 지적할 봇이 먼저, 아니면 차례인 사람 */
  actor(room) {
    const g = room.cr;
    if (room.status !== 'playing' || !g || g.phase === 'over') return -1;
    const catcher = crCatcher(room);
    if (catcher >= 0) return catcher;
    return g.turn;
  },
  botDelay(room) {
    const g = room.cr;
    if (g && crCatcher(room) >= 0) return 2400; // 사람이 '마지막!'을 누를 시간
    return g && g.phase === 'drawn' ? 700 : 1100;
  },
  botMove(room, seat) {
    const g = room.cr;
    const p = room.players[seat];
    if (crCatcher(room) === seat) {
      const pr = CRRules.CATCH_P[p.difficulty] || CRRules.CATCH_P.normal;
      if (Math.random() < pr) crApply(room, () => CRRules.catchLast(g, seat));
      else g.catchTried = true;
      return;
    }
    crApply(room, () => CRRules.botStep(g, seat, p.bot ? p.difficulty : 'easy'));
  },

  playerView(room, p, i) {
    return { count: room.cr ? room.cr.hands[i].length : 0 };
  },

  view(room, mySeat) {
    const g = room.cr;
    if (!g) return { cr: null };
    return { cr: CRRules.publicView(g, mySeat) };
  },

  offline: {
    deck: () => CRRules.makeDeck(),
    deal: 7,
    zones: [{ id: 'discard', name: '버린 더미', kind: 'pile' }],
    name: (c) => CRRules.cardName(c),
    sort: (a, b) => CRRules.compareCodes(a, b),
    setup(ot) {
      const i = ot.draw.findIndex((c) => CRRules.isNumber(c.f));
      const card = ot.draw.splice(i < 0 ? 0 : i, 1)[0];
      card.up = true;
      ot.zones.discard.push([card]);
    },
    actions: ['draw', 'play', 'take', 'give', 'recycle'],
  },
});

/** 깜빡한 사람(unsafe)을 지적할 봇 자리 (없으면 -1) */
function crCatcher(room) {
  const g = room.cr;
  if (!g || g.unsafe < 0 || g.catchTried) return -1;
  let best = -1;
  for (let k = 1; k < g.n; k++) {
    const s = (g.unsafe + k) % g.n;
    const p = room.players[s];
    if (p && p.bot && !p.left) {
      best = s;
      break;
    }
  }
  return best;
}

function crApply(room, fn) {
  let evs;
  try {
    evs = fn();
  } catch (e) {
    fail(e.message);
  }
  const g = room.cr;
  evs.forEach((ev) => pushEvent(room, ev));
  if (g.phase === 'over' && room.status === 'playing') {
    room.status = 'finished';
    room.resultText = '승리: ' + room.players[g.winner].name + ' (' + g.moves + '수)';
  }
}

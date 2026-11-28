// ===== 게임 모듈: 보석 공방 (2~4인) =====
// GWRules(games/gem-workshop/js/rules.js)는 build-gs.mjs가 이름공간으로 감싸 넣어 줌
// 덱 순서와 남이 덱에서 찜한 카드는 서버에만! view()는 publicView로 걸러서 내려보냄

registerGame('gem-workshop', {
  title: '보석 공방',
  minPlayers: 2,
  maxPlayers: 4,
  bots: [
    { name: '두더지 봇', emoji: '🦫' },
    { name: '까치 봇', emoji: '🐦‍⬛' },
    { name: '수달 봇', emoji: '🦦' },
    { name: '여우 봇', emoji: '🦊' },
  ],

  reset(room) {
    room.gw = null;
  },

  start(room) {
    room.gw = GWRules.newGame(room.players.length);
    room.status = 'playing';
    pushEvent(room, { type: 'start', turn: 0 });
  },

  act(room, seat, req) {
    if (room.status !== 'playing' || !room.gw) fail('지금은 할 수 없어요.');
    const g = room.gw;
    const a = req.action;
    if (a === 'take') gwApply(room, () => GWRules.takeGems(g, seat, req.gems));
    else if (a === 'buy') gwApply(room, () => GWRules.buy(g, seat, String(req.card || '')));
    else if (a === 'reserve') gwApply(room, () => GWRules.reserve(g, seat, String(req.card || '')));
    else if (a === 'discard') gwApply(room, () => GWRules.discard(g, seat, req.gems));
    else fail('알 수 없는 요청이에요.');
  },

  actor(room) {
    const g = room.gw;
    if (room.status !== 'playing' || !g || g.phase === 'over') return -1;
    return g.turn;
  },
  botDelay(room) {
    return room.gw && room.gw.phase === 'discard' ? 700 : 1300;
  },
  botMove(room, seat) {
    const p = room.players[seat];
    gwApply(room, () => GWRules.botStep(room.gw, seat, p.bot ? p.difficulty : 'easy'));
  },

  playerView(room, p, i) {
    const g = room.gw;
    return g ? { pts: GWRules.pointsOf(g.players[i]) } : {};
  },

  view(room, mySeat) {
    return { gw: room.gw ? GWRules.publicView(room.gw, mySeat) : null };
  },
});

function gwApply(room, fn) {
  let evs;
  try {
    evs = fn();
  } catch (e) {
    fail(e.message);
  }
  const g = room.gw;
  evs.forEach((ev) => pushEvent(room, ev));
  if (g.phase === 'over' && room.status === 'playing') {
    room.status = 'finished';
    room.resultText = '승리: ' + room.players[g.winner].name + ' / ' + g.ranking.map((s) => room.players[s].name + ' ' + GWRules.pointsOf(g.players[s]) + '점').join(', ');
  }
}

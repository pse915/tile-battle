// ===== 게임 모듈: 서라벌학교여행 (2~4인) =====
// STRules(games/school-trip/js/rules.js)는 build-gs.mjs가 이름공간으로 감싸 넣어 줌
// 숨긴 정보가 거의 없어서(다음 행운 쪽지 순서만 숨김) 오프라인 테이블 대신 '한 기기 여러 명'을 씀
// 이동·카드·통행료는 모두 여기서 계산하고 이벤트로 보내 화면이 순서대로 연출

registerGame('school-trip', {
  title: '서라벌학교여행',
  minPlayers: 2,
  maxPlayers: 4,
  bots: [
    { name: '교감 봇', emoji: '🧑‍🏫' },
    { name: '급식 봇', emoji: '🍱' },
    { name: '도서 봇', emoji: '📚' },
    { name: '체육 봇', emoji: '⚽' },
  ],

  config(room, req) {
    room.rounds = STRules.ROUND_CHOICES.indexOf(Number(req.rounds)) >= 0 ? Number(req.rounds) : 15;
  },

  reset(room) {
    room.st = null;
    if (STRules.ROUND_CHOICES.indexOf(room.rounds) < 0) room.rounds = 15;
  },

  start(room) {
    room.st = STRules.newGame(room.players.length, room.rounds);
    room.status = 'playing';
    pushEvent(room, { type: 'start', rounds: room.st.maxRounds });
  },

  act(room, seat, req) {
    if (room.status !== 'playing' || !room.st) fail('지금은 할 수 없어요.');
    const g = room.st;
    const a = req.action;
    if (a === 'roll') stApply(room, () => STRules.roll(g, seat));
    else if (a === 'buy') stApply(room, () => STRules.buy(g, seat));
    else if (a === 'build') stApply(room, () => STRules.build(g, seat));
    else if (a === 'skip') stApply(room, () => STRules.skip(g, seat));
    else if (a === 'bail') stApply(room, () => STRules.payBail(g, seat));
    else if (a === 'fly') stApply(room, () => STRules.fly(g, seat, Number(req.to)));
    else fail('알 수 없는 요청이에요.');
  },

  actor(room) {
    return room.status === 'playing' && room.st && room.st.phase !== 'over' ? room.st.turn : -1;
  },
  botDelay(room) {
    const g = room.st;
    return g && (g.phase === 'buy' || g.phase === 'build') ? 900 : 1300;
  },
  botMove(room, seat) {
    const p = room.players[seat];
    stApply(room, () => STRules.botStep(room.st, seat, p.bot ? p.difficulty || 'normal' : 'away'));
  },

  playerView(room, p, i) {
    const g = room.st;
    if (!g) return {};
    return { cash: g.players[i].cash, out: g.players[i].out };
  },

  view(room) {
    return { st: room.st ? STRules.publicView(room.st) : null };
  },

  onLeave(room, p) {
    /* 나간 사람은 봇이 이어서 함 (core.js가 bot으로 바꿈) */
  },
});

function stApply(room, fn) {
  let evs;
  try {
    evs = fn();
  } catch (e) {
    fail(e.message);
  }
  evs.forEach((ev) => pushEvent(room, ev));
  const g = room.st;
  if (g.phase === 'over' && room.status === 'playing') {
    room.status = 'finished';
    room.resultText = '승리: ' + room.players[g.winner].name + (g.endReason === 'rounds' ? ' (' + g.maxRounds + '바퀴 끝, 총자산 1등)' : ' (마지막까지 남음)');
  }
}

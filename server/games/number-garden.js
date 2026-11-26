// ===== 게임 모듈: 숫자 블록 정원 (2~4인) =====
// NGRules(games/number-garden/js/rules.js)는 build-gs.mjs가 이름공간으로 감싸 넣어 줌
// 남의 손패와 더미 순서는 서버에만! view()는 내 패와 남은 장수만 내려보냄
// 턴 중 임시 배치는 클라이언트가 만들고 '턴 끝내기' 때 { board, played }를 한 번에 보내면 서버가 검사

registerGame('number-garden', {
  title: '숫자 블록 정원',
  minPlayers: NGRules.MIN_PLAYERS,
  maxPlayers: NGRules.MAX_PLAYERS,
  bots: [
    { name: '꿀벌 봇', emoji: '🐝' },
    { name: '무당벌레 봇', emoji: '🐞' },
    { name: '달팽이 봇', emoji: '🐌' },
  ],

  // 오프라인 테이블 모드: 타일만 공유하고 판정은 말로
  offline: {
    deck: () => {
      const out = [];
      for (let id = 0; id < NGRules.TOTAL_TILES; id++) out.push(String(NGRules.kindOf(id)));
      return out;
    },
    deal: () => NGRules.HAND_SIZE,
    zones: [{ id: 'table', name: '판', kind: 'rows' }],
    name: (c) => NGRules.kindName(Number(c)),
    sort: (a, b) => Number(a) - Number(b),
    sortRow: (a, b) => (NGRules.kindNum(Number(a)) || 99) - (NGRules.kindNum(Number(b)) || 99) || Number(a) - Number(b),
    actions: { draw: true, play: true, move: true, take: true },
  },

  reset(room) {
    room.ng = null;
  },

  start(room) {
    room.ng = NGRules.newGame(room.players.length);
    room.status = 'playing';
    pushEvent(room, { type: 'start', turn: room.ng.turn });
  },

  act(room, seat, req) {
    if (room.status !== 'playing' || !room.ng) fail('지금은 할 수 없어요.');
    if (req.action === 'endTurn') {
      const board = Array.isArray(req.board) ? req.board.map((s) => (Array.isArray(s) ? s.map(Number) : s)) : null;
      const played = Array.isArray(req.played) ? req.played.map(Number) : null;
      ngPlay(room, seat, board, played);
    } else if (req.action === 'draw') ngDraw(room, seat);
    else fail('알 수 없는 요청이에요.');
  },

  actor(room) {
    return room.status === 'playing' && room.ng && !room.ng.over ? room.ng.turn : -1;
  },
  botDelay(room) {
    // 판이 클수록 사람이 따라 볼 시간을 조금 더
    return 1300 + Math.min(900, (room.ng ? room.ng.board.length : 0) * 40);
  },
  botMove(room, seat) {
    const p = room.players[seat];
    const mv = NGRules.botTurn(room.ng, seat, p.bot ? p.difficulty : 'easy');
    if (mv && p.bot) ngPlay(room, seat, mv.board, mv.played);
    else ngDraw(room, seat); // 자리 비운 사람은 뽑고 넘기기만
  },

  playerView(room, p, i) {
    const g = room.ng;
    if (!g) return { count: 0, opened: false };
    const out = { count: g.hands[i].length, opened: g.opened[i] };
    if (g.over) out.score = g.scores[i];
    return out;
  },

  view(room, mySeat) {
    const g = room.ng;
    if (!g) return { ng: null };
    return {
      ng: {
        board: g.board,
        hand: mySeat >= 0 && g.hands[mySeat] ? g.hands[mySeat] : [],
        counts: g.hands.map((h) => h.length),
        opened: g.opened,
        pool: g.pool.length,
        turn: g.turn,
        turnNo: g.turnNo,
        passes: g.passes,
        last: g.last,
        over: g.over,
        winner: g.winner,
        scores: g.scores,
        // 끝나면 모두의 남은 패 공개
        hands: g.over ? g.hands : null,
      },
    };
  },
});

function ngPlay(room, seat, board, played) {
  const g = room.ng;
  let res;
  try {
    res = NGRules.playTurn(g, seat, board, played);
  } catch (e) {
    fail(e.message);
  }
  pushEvent(room, { type: 'play', seat, ids: played.slice(), firstMeld: res.firstMeld, meld: res.meld });
  if (res.over) ngEnd(room);
}

function ngDraw(room, seat) {
  const g = room.ng;
  let res;
  try {
    res = NGRules.drawTurn(g, seat);
  } catch (e) {
    fail(e.message);
  }
  // 뽑은 타일은 알리지 않음 (장수만)
  pushEvent(room, { type: res.drawn != null ? 'draw' : 'pass', seat });
  if (res.over) ngEnd(room);
}

function ngEnd(room) {
  const g = room.ng;
  room.status = 'finished';
  room.resultText = '승리: ' + room.players[g.winner].name + ' / 남은 점수 ' + room.players.map((p, i) => p.name + ' ' + g.scores[i]).join(', ');
  pushEvent(room, { type: 'end', winner: g.winner, scores: g.scores });
}

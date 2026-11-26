// ===== 게임 모듈: 흑백 뒤집기 대전 (2인) =====
// FDRules(games/flip-duel/js/rules.js)는 build-gs.mjs가 이름공간으로 감싸 넣어 줌
// 숨긴 정보가 없어서 오프라인 테이블 모드 대신 '한 기기 2인 대전'(브라우저 안 서버)을 씀

registerGame('flip-duel', {
  title: '흑백 뒤집기 대전',
  minPlayers: 2,
  maxPlayers: 2,
  bots: [
    { name: '판다 봇', emoji: '🐼' },
    { name: '펭귄 봇', emoji: '🐧' },
  ],

  reset(room) {
    room.fd = null;
  },

  start(room) {
    room.fd = FDRules.newGame();
    room.status = 'playing';
    pushEvent(room, { type: 'start' });
  },

  act(room, seat, req) {
    if (room.status !== 'playing') fail('지금은 둘 수 없어요.');
    if (req.action !== 'place') fail('알 수 없는 요청이에요.');
    fdPlace(room, seat, Number(req.idx));
  },

  actor(room) {
    return room.status === 'playing' && room.fd ? room.fd.turn - 1 : -1;
  },
  botDelay() {
    return 900;
  },
  botMove(room, seat) {
    const p = room.players[seat];
    const idx = FDRules.bestMove(room.fd.board, seat + 1, p.bot ? p.difficulty : 'easy');
    fdPlace(room, seat, idx);
  },

  playerView(room, p, i) {
    const c = room.fd ? FDRules.count(room.fd.board) : { 1: 2, 2: 2 };
    return { color: i + 1, discs: c[i + 1] };
  },

  view(room) {
    const g = room.fd;
    if (!g) return { fd: null };
    return {
      fd: {
        board: g.board,
        turn: g.turn,
        last: g.last,
        flips: g.flips,
        passed: g.passed,
        over: g.over,
        winner: g.winner,
        moves: g.moves,
        legal: g.over ? [] : FDRules.legalMoves(g.board, g.turn),
      },
    };
  },
});

function fdPlace(room, seat, idx) {
  const g = room.fd;
  let res;
  try {
    res = FDRules.play(g, seat + 1, idx);
  } catch (e) {
    fail(e.message);
  }
  pushEvent(room, { type: 'place', seat, idx, flips: res.flips, passed: res.passed });
  if (res.over) {
    room.status = 'finished';
    const c = FDRules.count(g.board);
    room.resultText = '흑 ' + c[1] + ' : 백 ' + c[2] + (g.winner ? ' / 승리: ' + room.players[g.winner - 1].name : ' / 무승부');
    pushEvent(room, { type: 'end', winner: g.winner });
  }
}

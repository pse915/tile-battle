// ===== 게임 모듈: 비밀번호 해독반 (2~4인 숫자 타일 추리) =====
// CBRules(games/code-breaker/js/rules.js)는 build-gs.mjs가 이름공간으로 감싸 넣어 줌
// 숨김 정보: 남의 숨긴 타일 숫자, 뽑을 더미 순서. view()는 색·자리·공개된 숫자만 내려보냄.

registerGame('code-breaker', {
  title: '비밀번호 해독반',
  minPlayers: 2,
  maxPlayers: 4,
  bots: [
    { name: '부엉이 봇', emoji: '🦉' },
    { name: '여우 봇', emoji: '🦊' },
    { name: '고양이 봇', emoji: '🐱' },
  ],

  reset(room) {
    room.cb = null;
  },

  start(room) {
    room.cb = CBRules.newGame(room.players.length);
    room.status = 'playing';
    pushEvent(room, { type: 'start', gid: room.cb.gid });
    // 봇은 처음 받은 조커를 바로 놓음
    room.players.forEach((p, i) => {
      while (p.bot && room.cb.hold[i].length) cbApply(room, i, CBRules.botAction(room.cb, i, p.difficulty));
    });
  },

  act(room, seat, req) {
    if (room.status !== 'playing' || !room.cb) fail('지금은 할 수 없어요.');
    const a = req.action;
    if (a === 'draw') cbApply(room, seat, { action: 'draw', color: String(req.color) });
    else if (a === 'place') cbApply(room, seat, { action: 'place', idx: Number(req.idx) });
    else if (a === 'guess') cbApply(room, seat, { action: 'guess', target: Number(req.target), id: Number(req.id), value: Number(req.value) });
    else if (a === 'decide') cbApply(room, seat, { action: 'decide', more: !!req.more });
    else if (a === 'penalty') cbApply(room, seat, { action: 'penalty', id: Number(req.id) });
    else fail('알 수 없는 요청이에요.');
  },

  actor(room) {
    return room.status === 'playing' && room.cb ? CBRules.actorOf(room.cb) : -1;
  },
  botDelay(room) {
    const ph = room.cb && room.cb.phase;
    return ph === 'guess' ? 1500 : ph === 'decide' ? 1100 : 800;
  },
  botMove(room, seat) {
    const p = room.players[seat];
    cbApply(room, seat, CBRules.botAction(room.cb, seat, p.bot ? p.difficulty : 'easy'));
  },

  onLeave(room) {
    // 처음 조커 놓기 중에 나가면 대신 놓아 줌
    const g = room.cb;
    if (!g || room.status !== 'playing') return;
    room.players.forEach((p, i) => {
      while (p.bot && g.phase === 'setup' && g.hold[i].length) cbApply(room, i, CBRules.botAction(g, i, 'easy'));
    });
  },

  playerView(room, p, i) {
    const g = room.cb;
    if (!g) return { count: 0, hidden: 0, out: false };
    return { count: g.rows[i].length + g.hold[i].length, hidden: CBRules.hiddenCount(g.rows[i]) + g.hold[i].length, out: !!g.out[i] };
  },

  view(room, mySeat) {
    const g = room.cb;
    if (!g) return { cb: null };
    const over = g.phase === 'over';
    const tile = (t, s) => ({ id: t.id, c: t.c, up: !!t.up, n: t.up || s === mySeat || over ? t.n : null });
    return {
      cb: {
        gid: g.gid,
        phase: g.phase,
        turn: g.turn,
        actor: CBRules.actorOf(g),
        streak: g.streak,
        fresh: g.turn === mySeat ? g.fresh : 0,
        rows: g.rows.map((r, s) => r.map((t) => tile(t, s))),
        hold: g.hold.map((h, s) => (s === mySeat ? h.map((t) => tile(t, s)) : h.length)),
        out: g.out,
        pile: CBRules.pileCount(g),
        history: g.history,
        winner: g.winner,
      },
    };
  },

  offline: {
    keepOrder: true, // ◀▶로 옮긴 조커 자리를 뽑을 때마다 풀지 않게
    deck() {
      const out = [];
      ['b', 'w'].forEach((c) => {
        for (let n = 0; n <= 11; n++) out.push(c + n);
        out.push(c + 'J');
      });
      return out;
    },
    deal: (n) => (n <= 3 ? 4 : 3),
    name: (code) => (code[0] === 'b' ? '검정 ' : '흰색 ') + (code.slice(1) === 'J' ? '조커' : code.slice(1)),
    back: (code) => code[0],
    backName: (b) => (b === 'b' ? '검정' : '흰색'),
    sort(a, b) {
      const k = (c) => (c.slice(1) === 'J' ? 100 : Number(c.slice(1)) * 2) + (c[0] === 'w' ? 1 : 0);
      return k(a) - k(b);
    },
    zones: [],
    actions: { draw: true, reveal: true, order: true },
  },
});

function cbApply(room, seat, a) {
  const g = room.cb;
  let res;
  try {
    res = CBRules.applyAction(g, seat, a);
  } catch (e) {
    fail(e.message);
  }
  // 이벤트에는 공개 정보만: 뽑은 타일은 색과 자리, 맞힌/공개된 타일만 숫자
  const ev = { type: res.type, seat: res.seat };
  ['id', 'c', 'idx', 'target', 'pos', 'guess', 'ok', 'reveal', 'out'].forEach((k) => res[k] != null && (ev[k] = res[k]));
  if (res.type === 'reveal' || (res.type === 'guess' && res.ok)) ev.n = res.n;
  pushEvent(room, ev);
  if (res.over) {
    room.status = 'finished';
    const w = room.players[g.winner];
    room.resultText = '비밀번호 해독반 / 승리: ' + (w ? w.name : '없음');
    pushEvent(room, { type: 'end', winner: g.winner });
  }
}

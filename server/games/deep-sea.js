// ===== 게임 모듈: 심해 보물섬 탐험대 =====
// DSRules(games/deep-sea/js/rules.js), DSBot(…/bot.js)은 build-gs.mjs가 이름공간으로 감싸 넣어 줌
// 역할과 카드 위치는 서버에만! view()는 본인 역할과 본인 카드 '구성'만 내려보냄

registerGame('deep-sea', {
  title: '심해 보물섬 탐험대',
  minPlayers: 4,
  maxPlayers: 6,
  bots: [
    { name: '갈매기 봇', emoji: '🐦' },
    { name: '거북이 봇', emoji: '🐢' },
    { name: '물개 봇', emoji: '🦭' },
    { name: '복어 봇', emoji: '🐡' },
    { name: '꽃게 봇', emoji: '🦀' },
  ],

  reset(room) {
    room.ds = null;
    room.claims = {};
    room.sus = {};
    room.lastSay = {};
  },

  start(room) {
    room.ds = DSRules.newGame(room.players.length);
    room.status = 'playing';
    room.claims = {};
    room.sus = {};
    room.lastSay = {};
    pushEvent(room, { type: 'start', keyHolder: room.ds.keyHolder });
    dsNewRound(room);
  },

  act(room, seat, req) {
    if (room.status !== 'playing') fail('지금은 할 수 없어요.');
    if (req.action === 'flip') {
      dsFlip(room, seat, Number(req.target), Number(req.index));
    } else if (req.action === 'say') {
      const now = Date.now();
      if (now - (room.lastSay[seat] || 0) < 1200) fail('조금 천천히 말해 주세요.');
      room.lastSay[seat] = now;
      dsSay(room, seat, String(req.msg), req.target);
    } else fail('알 수 없는 요청이에요.');
  },

  actor(room) {
    return room.status === 'playing' && room.ds ? room.ds.keyHolder : -1;
  },
  botDelay() {
    return 2600; // 사람들이 말풍선을 읽을 시간
  },

  botMove(room, seat) {
    const g = room.ds;
    const p = room.players[seat];
    const counts = g.hands.map((h) => h.length);
    let target;
    let index;
    if (p.bot) {
      const flipped = {};
      g.revealed.filter((r) => r.round === g.round).forEach((r) => {
        flipped[r.target] = flipped[r.target] || {};
        flipped[r.target][r.card.type] = (flipped[r.target][r.card.type] || 0) + 1;
      });
      ({ target, index } = DSBot.botChooseFlip({ me: seat, role: g.roles[seat], counts, claims: room.claims, sus: room.sus, flipped }));
    } else {
      // 자리 비운 사람: 아무 카드나
      const options = counts.map((c, i) => i).filter((i) => i !== seat && counts[i] > 0);
      target = options[Math.floor(Math.random() * options.length)];
      index = 0;
    }
    dsFlip(room, seat, target, index);
  },

  playerView(room, p, i) {
    const g = room.ds;
    const out = { count: g ? g.hands[i].length : 0 };
    if (g && g.winner) out.role = g.roles[i];
    return out;
  },

  view(room, mySeat) {
    const g = room.ds;
    if (!g) return { ds: null };
    const me = mySeat >= 0 ? g.hands[mySeat] : [];
    return {
      ds: {
        round: g.round,
        maxRounds: DSRules.MAX_ROUNDS,
        keyHolder: g.keyHolder,
        found: g.found,
        totalTreasure: g.n,
        flipsThisRound: g.flipsThisRound,
        flipsPerRound: g.n,
        myRole: mySeat >= 0 ? g.roles[mySeat] : null,
        mySummary: DSRules.summarize(me),
        revealed: g.revealed.map((r) => ({ round: r.round, by: r.by, target: r.target, type: r.card.type })),
        claims: room.claims,
        winner: g.winner,
        reason: g.reason,
        roles: g.winner ? g.roles : null,
        hiddenRole: g.winner ? g.hiddenRole : null,
      },
    };
  },
});

function dsNewRound(room) {
  const g = room.ds;
  room.claims = {};
  pushEvent(room, { type: 'round', round: g.round, keyHolder: g.keyHolder, handSize: DSRules.handSizeFor(g.round) });
  // 봇은 라운드 시작에 바로 자기 카드에 대해 말함
  room.players.forEach((p, i) => {
    if (!p.bot) return;
    DSBot.botClaims(g.roles[i], g.hands[i]).forEach((msg) => dsSay(room, i, msg));
  });
}

function dsSay(room, seat, msg, target) {
  if (!DSRules.SAYINGS[msg]) fail('보낼 수 없는 말이에요.');
  const claim = DSRules.claimOf(msg);
  if (claim) room.claims[seat] = Object.assign({}, room.claims[seat], claim);
  const t = Number(target);
  const hasTarget = msg === 'sus' && Number.isInteger(t) && t >= 0 && t < room.players.length && t !== seat;
  if (hasTarget) room.sus[t] = (room.sus[t] || 0) + 1;
  pushEvent(room, { type: 'say', seat, msg, target: hasTarget ? t : null, round: room.ds.round });
}

function dsFlip(room, seat, target, index) {
  const g = room.ds;
  let res;
  try {
    res = DSRules.flip(g, seat, target, index);
  } catch (e) {
    fail(e.message);
  }
  pushEvent(room, { type: 'flip', by: seat, target, index: res.index, card: res.card.type, round: g.revealed[g.revealed.length - 1].round, found: g.found });
  if (res.winner) {
    room.status = 'finished';
    room.resultText = DSRules.winText(g.winner, g.reason) + ' / 해적: ' + room.players.filter((_, i) => g.roles[i] === 'pirate').map((p) => p.name).join(', ');
    pushEvent(room, { type: 'end', winner: g.winner, reason: g.reason, roles: g.roles, hiddenRole: g.hiddenRole });
  } else if (res.roundEnded) {
    dsNewRound(room);
  }
}

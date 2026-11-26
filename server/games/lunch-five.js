// ===== 게임 모듈: 급식 다섯! (2~6인) =====
// LFRules(games/lunch-five/js/rules.js)는 build-gs.mjs가 이름공간으로 감싸 넣어 줌
// 뒤집힌 더미의 순서는 서버에만! view()는 장수와 공개 더미 맨 위 카드만 내려보냄
// 종은 서버가 받은 순서대로 판정. 요청에 tick(본 판 번호)을 붙여 '한 발 늦은' 종은 벌칙 없이 거절

registerGame('lunch-five', {
  title: '급식 다섯!',
  minPlayers: LFRules.MIN_PLAYERS,
  maxPlayers: LFRules.MAX_PLAYERS,
  bots: [
    { name: '영양사 봇', emoji: '👩‍🍳' },
    { name: '배식 봇', emoji: '🍱' },
    { name: '우유 봇', emoji: '🥛' },
    { name: '젓가락 봇', emoji: '🥢' },
    { name: '숟가락 봇', emoji: '🥄' },
  ],

  offline: {
    deck: () => LFRules.makeDeck(),
    deal: (n) => Math.floor(LFRules.DECK_SIZE / n),
    blind: true,
    zones: [{ id: 'open', name: '공개 더미', kind: 'pile', perSeat: true }],
    flipPassesTurn: true,
    actions: { flipTop: true, collect: true, give: true },
    name: (c) => LFRules.cardName(c),
  },

  reset(room) {
    room.lf = null;
    room.lfPlan = null;
  },

  start(room) {
    room.lf = LFRules.newGame(room.players.length);
    room.status = 'playing';
    pushEvent(room, { type: 'start' });
    lfReplan(room);
  },

  act(room, seat, req) {
    if (room.status !== 'playing' || !room.lf) fail('지금은 할 수 없어요.');
    if (req.action === 'flip') lfFlip(room, seat);
    else if (req.action === 'ring') lfRing(room, seat, req.tick);
    else fail('알 수 없는 요청이에요.');
  },

  /** 종 칠 봇이 있으면 그 봇, 아니면 차례인 사람 */
  actor(room) {
    const g = room.lf;
    if (room.status !== 'playing' || !g || g.over) return -1;
    if (room.lfPlan && room.lfPlan.tick === g.tick) return room.lfPlan.seat;
    return g.turn;
  },
  botDelay(room) {
    const g = room.lf;
    if (g && room.lfPlan && room.lfPlan.tick === g.tick) return room.lfPlan.delay;
    const p = g && room.players[g.turn];
    return LFRules.botFlipDelay(p && p.difficulty);
  },
  botMove(room, seat) {
    const g = room.lf;
    const plan = room.lfPlan;
    if (plan && plan.tick === g.tick && plan.seat === seat) {
      room.lfPlan = null;
      lfRing(room, seat, g.tick);
      return;
    }
    if (seat === g.turn) lfFlip(room, seat);
    else lfReplan(room);
  },

  playerView(room, p, i) {
    const g = room.lf;
    if (!g) return { pile: 0, cards: 0, out: false };
    return { pile: g.piles[i].length, cards: LFRules.cardsOf(g, i), out: !!g.out[i] };
  },

  view(room) {
    const g = room.lf;
    if (!g) return { lf: null };
    return {
      lf: {
        piles: g.piles.map((p) => p.length),
        open: g.open.map((o) => ({ top: o.length ? o[o.length - 1] : null, count: o.length })),
        out: g.out,
        turn: g.turn,
        tick: g.tick,
        flips: g.flips,
        maxFlips: LFRules.MAX_FLIPS,
        over: g.over,
        winner: g.winner,
        reason: g.reason,
        total: g.total,
      },
    };
  },

  onLeave(room) {
    lfReplan(room);
  },
});

/** 판이 바뀔 때마다 봇이 종을 칠지 미리 정해 둠 (폴링마다 다시 뽑지 않게) */
function lfReplan(room) {
  const g = room.lf;
  const bots = [];
  room.players.forEach((p, i) => p.bot && bots.push({ seat: i, difficulty: p.difficulty }));
  const plan = g && !g.over ? LFRules.planBots(g, bots) : null;
  room.lfPlan = plan ? { seat: plan.seat, delay: plan.delay, wrong: plan.wrong, tick: g.tick } : null;
}

function lfFlip(room, seat) {
  const g = room.lf;
  let res;
  try {
    res = LFRules.flip(g, seat);
  } catch (e) {
    fail(e.message);
  }
  pushEvent(room, { type: 'flip', seat, card: res.card, tick: g.tick });
  lfAfter(room, res.outs);
}

function lfRing(room, seat, tick) {
  const g = room.lf;
  let res;
  try {
    res = LFRules.ring(g, seat, tick);
  } catch (e) {
    fail(e.message);
  }
  pushEvent(room, { type: 'ring', seat, ok: res.ok, menu: res.menu, got: res.got, gave: res.gave, tick: g.tick });
  lfAfter(room, res.outs);
}

function lfAfter(room, outs) {
  const g = room.lf;
  (outs || []).forEach((s) => pushEvent(room, { type: 'out', seat: s }));
  if (g.over) {
    room.status = 'finished';
    room.lfPlan = null;
    const w = room.players[g.winner];
    room.resultText = (g.reason === 'limit' ? '제한 도달 · ' : '') + '승리: ' + (w ? w.name : '-') + ' / ' + room.players.map((p, i) => p.name + ' ' + LFRules.cardsOf(g, i) + '장').join(', ');
    pushEvent(room, { type: 'end', winner: g.winner, reason: g.reason });
    return;
  }
  lfReplan(room);
}

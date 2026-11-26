// ===== 게임 모듈: 시험 끝! 타일 배틀 =====
// TileRules(games/tile-battle/js/rules.js), TileAI(…/ai.js)는 build-gs.mjs가 이름공간으로 감싸 넣어 줌
// 예전 클라이언트와 같은 모양의 상태를 내려보내야 하므로 필드 이름을 바꾸지 말 것

registerGame('tile-battle', {
  title: '시험 끝! 타일 배틀',
  minPlayers: 3,
  maxPlayers: 5,

  // 🪑 오프라인 테이블 모드: 인원에 맞는 타일을 모두 나눠 주고, 가운데에 내기만 공유 (족보 판정은 말로)
  offline: {
    deck: (n) => TileRules.makeDeck(TileRules.maxNForPlayers(n)).map((t) => t.id),
    deal: (n) => TileRules.handSizeForPlayers(n),
    zones: [{ id: 'center', name: '가운데', kind: 'pile' }],
    name: (code) => TileRules.tileLabel(tbTileOf(code)),
    sort: (a, b) => {
      const x = tbTileOf(a);
      const y = tbTileOf(b);
      return TileRules.valueOf(x, 15) - TileRules.valueOf(y, 15);
    },
  },

  config(room, req) {
    room.rounds = [3, 5, 7].indexOf(Number(req.rounds)) >= 0 ? Number(req.rounds) : 5;
  },

  reset(room) {
    room.round = 0;
    room.table = null;
    room.tableTiles = [];
    room.result = null;
    room.players.forEach((p) => {
      p.hand = [];
      p.chips = 60;
    });
  },

  start(room) {
    room.players.forEach((p) => {
      p.chips = 60;
      p.hand = [];
    });
    room.round = 0;
    tbStartRound(room);
  },

  act(room, seat, req, isHost) {
    const me = room.players[seat];
    if (req.action === 'play') tbPlay(room, seat, me, req.tiles || []);
    else if (req.action === 'pass') tbPass(room, seat);
    else if (req.action === 'next') {
      if (!isHost) fail('방장만 할 수 있어요.');
      if (room.status !== 'roundEnd') fail('아직 라운드가 끝나지 않았어요.');
      tbStartRound(room);
    } else fail('알 수 없는 요청이에요.');
  },

  actor(room) {
    return room.status === 'playing' ? room.current : -1;
  },
  botDelay() {
    return 1100;
  },

  botMove(room, seat) {
    const p = room.players[seat];
    const tiles = TileAI.chooseMove({
      hand: p.hand,
      table: room.table,
      maxN: room.maxN,
      mustId: room.mustId,
      difficulty: p.bot ? p.difficulty : 'easy',
      oppCounts: room.players.filter((_, k) => k !== seat).map((q) => q.hand.length),
    });
    if (tiles) tbApplyPlay(room, seat, tiles);
    else if (room.table) tbApplyPass(room, seat);
    else tbApplyPlay(room, seat, TileRules.legalPlays(p.hand, null, room.maxN, room.mustId)[0].tiles);
  },

  playerView(room, p) {
    return { chips: p.chips, count: (p.hand || []).length };
  },

  view(room, mySeat) {
    return {
      round: room.round,
      hand: mySeat >= 0 ? room.players[mySeat].hand || [] : [],
      table: room.table || null,
      tableTiles: room.tableTiles || [],
      current: room.status === 'playing' ? room.current : -1,
      mustId: room.mustId || null,
      lastPlayer: room.lastPlayer,
      result: room.result || null,
    };
  },
});

function tbStartRound(room) {
  const n = room.players.length;
  room.round++;
  room.maxN = TileRules.maxNForPlayers(n);
  const per = TileRules.handSizeForPlayers(n);
  const deck = TileRules.shuffle(TileRules.makeDeck(room.maxN));
  room.players.forEach((p, i) => (p.hand = TileRules.sortTiles(deck.slice(i * per, (i + 1) * per), room.maxN)));
  room.table = null;
  room.tableTiles = [];
  room.lastPlayer = null;
  room.passCount = 0;
  room.mustId = '3-0';
  room.current = room.players.findIndex((p) => p.hand.some((t) => t.id === '3-0'));
  room.status = 'playing';
  room.result = null;
  room.lastActionAt = Date.now();
  pushEvent(room, { type: 'round', round: room.round, starter: room.current });
}

function tbPlay(room, seat, me, ids) {
  if (room.status !== 'playing') fail('지금은 낼 수 없어요.');
  if (room.current !== seat) fail('아직 내 차례가 아니에요.');
  const uniq = ids.filter((id, i) => ids.indexOf(id) === i);
  const tiles = uniq.map((id) => me.hand.find((t) => t.id === id));
  if (!tiles.length || tiles.some((t) => !t) || uniq.length !== ids.length) fail('손에 없는 타일이에요.');
  const check = TileRules.checkPlay(tiles, room.table, room.maxN, room.mustId);
  if (!check.ok) fail(check.reason);
  tbApplyPlay(room, seat, tiles);
}

function tbApplyPlay(room, seat, tiles) {
  const p = room.players[seat];
  const ids = tiles.map((t) => t.id);
  p.hand = p.hand.filter((t) => ids.indexOf(t.id) < 0);
  const ordered = TileRules.sortTiles(tiles, room.maxN);
  const combo = TileRules.analyze(ordered, room.maxN);
  room.table = combo;
  room.tableTiles = ordered;
  room.lastPlayer = seat;
  room.passCount = 0;
  room.mustId = null;
  pushEvent(room, { type: 'play', seat, tiles: ordered, name: combo.name, size: combo.size });
  if (!p.hand.length) tbEndRound(room, seat);
  else room.current = (seat + 1) % room.players.length;
}

function tbPass(room, seat) {
  if (room.status !== 'playing') fail('지금은 패스할 수 없어요.');
  if (room.current !== seat) fail('아직 내 차례가 아니에요.');
  if (!room.table) fail('바닥이 비어 있을 때는 패스할 수 없어요. 아무 조합이나 내세요.');
  tbApplyPass(room, seat);
}

function tbApplyPass(room, seat) {
  room.passCount++;
  pushEvent(room, { type: 'pass', seat });
  if (room.passCount >= room.players.length - 1) {
    room.table = null;
    room.tableTiles = [];
    room.passCount = 0;
    room.current = room.lastPlayer;
    pushEvent(room, { type: 'sweep', leader: room.current });
  } else {
    room.current = (seat + 1) % room.players.length;
  }
}

function tbEndRound(room, winner) {
  const scores = room.players.map((p) => TileRules.roundScore(p.hand));
  const s = TileRules.settle(scores.map((x) => x.score));
  room.players.forEach((p, i) => (p.chips += s.delta[i]));
  const over = room.round >= room.rounds || room.players.some((p) => p.chips <= 0);
  room.status = over ? 'finished' : 'roundEnd';
  room.current = -1;
  room.result = { round: room.round, winner, scores, delta: s.delta, transfers: s.transfers, over, chips: room.players.map((p) => p.chips) };
  pushEvent(room, Object.assign({ type: 'roundEnd' }, room.result));
  if (over) room.resultText = room.players.map((p) => p.name + ' ' + p.chips).join(' / ');
}

function tbTileOf(code) {
  const p = String(code).split('-');
  return { id: code, n: Number(p[0]), s: Number(p[1]) };
}

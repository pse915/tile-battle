// 보석 공방 — 규칙 엔진 (브라우저·서버 공용, 순수 함수)
// 보석을 모아 공방 카드를 사고, 카드가 주는 '할인 보석'으로 더 비싼 카드를 사서 15점을 먼저 모으는 게임
// 보석 5색(r 루비 · b 사파이어 · g 에메랄드 · w 진주 · k 흑요석) + y 황금(만능)
// 카드 목록과 후원자 목록은 이 게임을 위해 새로 짠 것

export const COLORS = ['r', 'b', 'g', 'w', 'k'];
export const ALL = ['r', 'b', 'g', 'w', 'k', 'y'];
export const GEM_NAME = { r: '루비', b: '사파이어', g: '에메랄드', w: '진주', k: '흑요석', y: '황금' };
export const GOAL = 15;
export const HAND_MAX = 10;
export const RESERVE_MAX = 3;

// 비용 패턴: [자기 색, 다음 색, 그다음, …] (색 순서를 돌려 가며 5색에 똑같이 적용)
const PATTERNS = [
  // 1단계: 8장씩 → 40장
  [
    [[0, 1, 1, 1, 1], 0],
    [[0, 1, 2, 1, 1], 0],
    [[0, 2, 0, 2, 1], 0],
    [[1, 0, 3, 0, 1], 0],
    [[0, 0, 2, 0, 2], 0],
    [[0, 0, 0, 3, 0], 0],
    [[0, 2, 1, 0, 0], 0],
    [[0, 4, 0, 0, 0], 1],
  ],
  // 2단계: 6장씩 → 30장
  [
    [[2, 0, 3, 2, 0], 1],
    [[0, 3, 0, 2, 3], 1],
    [[0, 0, 1, 4, 2], 2],
    [[0, 5, 0, 0, 0], 2],
    [[3, 0, 0, 0, 5], 2],
    [[6, 0, 0, 0, 0], 3],
  ],
  // 3단계: 4장씩 → 20장
  [
    [[0, 3, 5, 3, 3], 3],
    [[0, 0, 0, 0, 7], 4],
    [[3, 0, 0, 3, 6], 4],
    [[3, 0, 0, 0, 7], 5],
  ],
];

/** 카드 목록 (id: 'c1-r-3' 단계-색-번호) */
export function makeCards() {
  const cards = [];
  PATTERNS.forEach((list, t) => {
    COLORS.forEach((c, ci) => {
      list.forEach(([pat, pts], k) => {
        const cost = {};
        pat.forEach((v, off) => {
          if (v) cost[COLORS[(ci + off) % 5]] = v;
        });
        cards.push({ id: `c${t + 1}-${c}-${k}`, tier: t + 1, color: c, pts, cost });
      });
    });
  });
  return cards;
}
const CARD_BY_ID = Object.fromEntries(makeCards().map((c) => [c.id, c]));
export const cardOf = (id) => CARD_BY_ID[id] || null;

/** 후원자: 할인 보석이 조건만큼 모이면 차례 끝에 저절로 찾아와 3점 */
export function makePatrons() {
  const list = [];
  COLORS.forEach((c, i) => list.push({ id: 'p4-' + c, pts: 3, need: { [c]: 4, [COLORS[(i + 1) % 5]]: 4 } }));
  COLORS.forEach((c, i) => list.push({ id: 'p3-' + c, pts: 3, need: { [c]: 3, [COLORS[(i + 2) % 5]]: 3, [COLORS[(i + 3) % 5]]: 3 } }));
  return list;
}
const PATRON_BY_ID = Object.fromEntries(makePatrons().map((p) => [p.id, p]));
export const patronOf = (id) => PATRON_BY_ID[id] || null;

export const PATRON_NAME = { 'p4-r': '대장장이 할머니', 'p4-b': '항해사', 'p4-g': '숲지기', 'p4-w': '진주 상인', 'p4-k': '광부 대장', 'p3-r': '왕실 요리사', 'p3-b': '천문학자', 'p3-g': '정원사', 'p3-w': '도서관장', 'p3-k': '시계공' };
export const PATRON_EMOJI = { 'p4-r': '👵', 'p4-b': '🧭', 'p4-g': '🌲', 'p4-w': '🦪', 'p4-k': '⛏️', 'p3-r': '👨‍🍳', 'p3-b': '🔭', 'p3-g': '🌷', 'p3-w': '📚', 'p3-k': '⏰' };

export function shuffle(a, rnd = Math.random) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const emptyGems = () => ({ r: 0, b: 0, g: 0, w: 0, k: 0, y: 0 });
export const sumGems = (o) => ALL.reduce((s, c) => s + (o[c] || 0), 0);

export function newGame(n, rnd = Math.random) {
  if (n < 2 || n > 4) throw new Error('2~4명이 할 수 있어요.');
  const per = n === 2 ? 4 : n === 3 ? 5 : 7;
  const bank = { r: per, b: per, g: per, w: per, k: per, y: 5 };
  const cards = makeCards();
  const decks = [1, 2, 3].map((t) => shuffle(cards.filter((c) => c.tier === t).map((c) => c.id), rnd));
  const market = decks.map((d) => d.splice(0, 4));
  const patrons = shuffle(makePatrons(), rnd)
    .slice(0, n + 1)
    .map((p) => p.id);
  return {
    n,
    bank,
    decks,
    market,
    patrons,
    players: Array.from({ length: n }, () => ({ gems: emptyGems(), cards: [], reserved: [], patrons: [] })),
    turn: 0,
    phase: 'play', // play | discard | over
    finalRound: false,
    winner: -1,
    ranking: null,
    moves: 0,
    rnd,
  };
}

/** 할인 보석 (산 카드 색별 개수) */
export function bonusOf(p) {
  const o = { r: 0, b: 0, g: 0, w: 0, k: 0 };
  p.cards.forEach((id) => o[cardOf(id).color]++);
  return o;
}
export function pointsOf(p) {
  return p.cards.reduce((s, id) => s + cardOf(id).pts, 0) + p.patrons.reduce((s, id) => s + patronOf(id).pts, 0);
}

/** 이 카드를 살 때 실제로 낼 보석 (못 사면 null). 할인 → 같은 색 보석 → 모자란 만큼 황금 */
export function payment(p, card) {
  const bonus = bonusOf(p);
  const pay = emptyGems();
  let gold = 0;
  for (const c of COLORS) {
    const need = Math.max(0, (card.cost[c] || 0) - bonus[c]);
    const use = Math.min(need, p.gems[c]);
    pay[c] = use;
    gold += need - use;
  }
  if (gold > p.gems.y) return null;
  pay.y = gold;
  return pay;
}
export const canAfford = (p, card) => !!payment(p, card);

function need(cond, msg) {
  if (!cond) throw new Error(msg);
}
function checkTurn(g, seat) {
  need(g.phase !== 'over', '게임이 끝났어요.');
  need(seat === g.turn, '내 차례가 아니에요.');
}

/** 보석 가져오기: 서로 다른 색 최대 3개, 또는 같은 색 2개(그 색이 4개 이상 남았을 때) */
export function takeGems(g, seat, gems) {
  checkTurn(g, seat);
  need(g.phase === 'play', '먼저 보석을 돌려놓아 주세요.');
  const list = (gems || []).filter((c) => COLORS.includes(c));
  need(list.length === (gems || []).length && list.length > 0, '가져올 보석을 골라 주세요.');
  const uniq = [...new Set(list)];
  const avail = COLORS.filter((c) => g.bank[c] > 0);
  if (uniq.length === 1 && list.length === 2) {
    need(g.bank[uniq[0]] >= 4, '같은 색 2개는 그 보석이 4개 이상 남아 있을 때만 가져올 수 있어요.');
  } else {
    need(uniq.length === list.length, '같은 색은 2개를 가져갈 때만 겹칠 수 있어요.');
    need(list.length <= 3, '서로 다른 색 3개까지 가져올 수 있어요.');
    need(list.every((c) => g.bank[c] > 0), '다 떨어진 보석이 있어요.');
    need(list.length === 3 || list.length === Math.min(3, avail.length), '서로 다른 색 3개를 골라 주세요. (남은 색이 모자랄 때만 덜 가져올 수 있어요)');
  }
  const p = g.players[seat];
  list.forEach((c) => {
    g.bank[c]--;
    p.gems[c]++;
  });
  return [{ type: 'take', seat, gems: list }, ...afterAction(g, seat)];
}

/** 카드 찜하기: 시장 카드(id) 또는 덱 맨 위('deck1'~'deck3'). 황금 1개를 받음(남아 있으면) */
export function reserve(g, seat, target) {
  checkTurn(g, seat);
  need(g.phase === 'play', '먼저 보석을 돌려놓아 주세요.');
  const p = g.players[seat];
  need(p.reserved.length < RESERVE_MAX, '찜은 3장까지만 할 수 있어요.');
  let id;
  let blind = false;
  const m = /^deck([123])$/.exec(target || '');
  if (m) {
    const d = g.decks[m[1] - 1];
    need(d.length > 0, '그 덱은 다 떨어졌어요.');
    id = d.shift();
    blind = true;
  } else {
    const t = g.market.findIndex((row) => row.includes(target));
    need(t >= 0, '시장에 없는 카드예요.');
    id = target;
    refill(g, t, g.market[t].indexOf(id));
  }
  p.reserved.push({ id, blind });
  let gold = false;
  if (g.bank.y > 0) {
    g.bank.y--;
    p.gems.y++;
    gold = true;
  }
  return [{ type: 'reserve', seat, card: blind ? null : id, tier: cardOf(id).tier, gold }, ...afterAction(g, seat)];
}

function refill(g, t, i) {
  const next = g.decks[t].shift();
  if (next) g.market[t][i] = next;
  else g.market[t].splice(i, 1);
}

/** 카드 사기: 시장 카드 또는 내가 찜한 카드 */
export function buy(g, seat, id) {
  checkTurn(g, seat);
  need(g.phase === 'play', '먼저 보석을 돌려놓아 주세요.');
  const p = g.players[seat];
  const card = cardOf(id);
  need(card, '없는 카드예요.');
  const t = g.market.findIndex((row) => row.includes(id));
  const r = p.reserved.findIndex((x) => x.id === id);
  need(t >= 0 || r >= 0, '시장이나 내 찜 목록에 있는 카드만 살 수 있어요.');
  const pay = payment(p, card);
  need(pay, '보석이 모자라요.');
  ALL.forEach((c) => {
    p.gems[c] -= pay[c];
    g.bank[c] += pay[c];
  });
  if (r >= 0) p.reserved.splice(r, 1);
  else refill(g, t, g.market[t].indexOf(id));
  p.cards.push(id);
  return [{ type: 'buy', seat, card: id, from: r >= 0 ? 'reserved' : 'market', pay }, ...afterAction(g, seat)];
}

/** 10개 넘게 들고 있으면 돌려놓기 */
export function discard(g, seat, gems) {
  checkTurn(g, seat);
  need(g.phase === 'discard', '지금은 돌려놓을 필요가 없어요.');
  const p = g.players[seat];
  const over = sumGems(p.gems) - HAND_MAX;
  const list = (gems || []).filter((c) => ALL.includes(c));
  need(list.length === over, `보석 ${over}개를 돌려놓아야 해요.`);
  const cnt = {};
  list.forEach((c) => (cnt[c] = (cnt[c] || 0) + 1));
  need(Object.keys(cnt).every((c) => p.gems[c] >= cnt[c]), '없는 보석은 돌려놓을 수 없어요.');
  list.forEach((c) => {
    p.gems[c]--;
    g.bank[c]++;
  });
  g.phase = 'play';
  return [{ type: 'discard', seat, gems: list }, ...endTurn(g, seat)];
}

function afterAction(g, seat) {
  g.moves++;
  if (sumGems(g.players[seat].gems) > HAND_MAX) {
    g.phase = 'discard';
    return [{ type: 'mustDiscard', seat, over: sumGems(g.players[seat].gems) - HAND_MAX }];
  }
  return endTurn(g, seat);
}

function endTurn(g, seat) {
  const evs = [];
  const p = g.players[seat];
  const bonus = bonusOf(p);
  const visit = g.patrons.find((id) => Object.entries(patronOf(id).need).every(([c, v]) => bonus[c] >= v));
  if (visit) {
    g.patrons = g.patrons.filter((id) => id !== visit);
    p.patrons.push(visit);
    evs.push({ type: 'patron', seat, patron: visit });
  }
  if (!g.finalRound && pointsOf(p) >= GOAL) {
    g.finalRound = true;
    evs.push({ type: 'finalRound', seat });
  }
  // 마지막 바퀴: 첫 사람(0번) 바로 앞 사람까지 하고 끝 → 모두 같은 횟수
  if (g.finalRound && seat === g.n - 1) {
    finish(g);
    evs.push({ type: 'over', winner: g.winner, ranking: g.ranking });
    return evs;
  }
  g.turn = (seat + 1) % g.n;
  // 아무것도 못 하는 사람은 건너뜀 (거의 없음)
  for (let k = 0; k < g.n && !canDoAnything(g, g.turn); k++) {
    evs.push({ type: 'pass', seat: g.turn });
    if (g.finalRound && g.turn === g.n - 1) {
      finish(g);
      evs.push({ type: 'over', winner: g.winner, ranking: g.ranking });
      return evs;
    }
    g.turn = (g.turn + 1) % g.n;
  }
  evs.push({ type: 'turn', seat: g.turn });
  return evs;
}

function canDoAnything(g, seat) {
  const p = g.players[seat];
  if (COLORS.some((c) => g.bank[c] > 0)) return true;
  if (p.reserved.length < RESERVE_MAX && (g.market.some((r) => r.length) || g.decks.some((d) => d.length))) return true;
  return allBuyable(g, seat).length > 0;
}

function finish(g) {
  g.phase = 'over';
  const order = g.players.map((p, i) => i);
  order.sort((a, b) => pointsOf(g.players[b]) - pointsOf(g.players[a]) || g.players[a].cards.length - g.players[b].cards.length || a - b);
  g.ranking = order;
  g.winner = order[0];
}

export function allBuyable(g, seat) {
  const p = g.players[seat];
  return g.market
    .flat()
    .concat(p.reserved.map((x) => x.id))
    .filter((id) => canAfford(p, cardOf(id)));
}

/** 화면용: 남의 덱에서 찜한 카드는 단계만 보임, 덱 순서는 숨김 */
export function publicView(g, mySeat) {
  return {
    n: g.n,
    bank: g.bank,
    market: g.market,
    deckCounts: g.decks.map((d) => d.length),
    patrons: g.patrons,
    turn: g.turn,
    phase: g.phase,
    finalRound: g.finalRound,
    winner: g.winner,
    ranking: g.ranking,
    moves: g.moves,
    players: g.players.map((p, i) => ({
      gems: p.gems,
      cards: p.cards,
      bonus: bonusOf(p),
      pts: pointsOf(p),
      patrons: p.patrons,
      reserved: p.reserved.map((x) => (i === mySeat || !x.blind ? { id: x.id, blind: x.blind } : { id: null, tier: cardOf(x.id).tier, blind: true })),
    })),
  };
}

// ---------- 봇 ----------
/** 카드 가치: 점수 + 후원자에 도움 되는 색 + 싸게 살 수 있는 정도 */
function cardValue(g, seat, id, level) {
  const p = g.players[seat];
  const c = cardOf(id);
  const bonus = bonusOf(p);
  let v = c.pts * 3 + 1;
  if (level !== 'easy') {
    g.patrons.forEach((pid) => {
      const n = patronOf(pid).need[c.color] || 0;
      if (n && bonus[c.color] < n) v += 0.8;
    });
    // 남들이 많이 원하는 색 할인은 조금 더
    v += Object.values(c.cost).reduce((s, x) => s + x, 0) > 0 ? 0 : 0;
  }
  return v;
}
/** 이 카드를 사려면 더 필요한 보석 수 (황금 고려) */
function shortfall(p, card) {
  const bonus = bonusOf(p);
  let miss = 0;
  COLORS.forEach((c) => (miss += Math.max(0, (card.cost[c] || 0) - bonus[c] - p.gems[c])));
  return Math.max(0, miss - p.gems.y);
}

/** 봇 한 수: 이벤트 배열을 돌려줌 */
export function botStep(g, seat, level = 'normal') {
  const p = g.players[seat];
  const rnd = g.rnd || Math.random;
  if (g.phase === 'discard') {
    const over = sumGems(p.gems) - HAND_MAX;
    const target = botTarget(g, seat, level);
    const want = target ? cardOf(target).cost : {};
    const pool = [];
    ALL.forEach((c) => {
      for (let i = 0; i < p.gems[c]; i++) pool.push(c);
    });
    // 목표 카드에 덜 필요한 보석부터, 황금은 마지막
    pool.sort((a, b) => (a === 'y') - (b === 'y') || (want[a] || 0) - p.gems[a] - ((want[b] || 0) - p.gems[b]));
    return discard(g, seat, pool.slice(0, over));
  }
  const buyable = allBuyable(g, seat);
  if (buyable.length && (level !== 'easy' || rnd() < 0.7)) {
    buyable.sort((a, b) => cardValue(g, seat, b, level) - cardValue(g, seat, a, level) || cardOf(a).tier - cardOf(b).tier);
    const best = level === 'easy' ? buyable[Math.floor(rnd() * buyable.length)] : buyable[0];
    return buy(g, seat, best);
  }
  const target = botTarget(g, seat, level);
  const card = target && cardOf(target);
  const avail = COLORS.filter((c) => g.bank[c] > 0);
  if (avail.length) {
    const bonus = bonusOf(p);
    const needOf = (c) => (card ? Math.max(0, (card.cost[c] || 0) - bonus[c] - p.gems[c]) : 0);
    const ranked = avail.slice().sort((a, b) => needOf(b) - needOf(a) || g.bank[b] - g.bank[a] || rnd() - 0.5);
    // 같은 색 2개가 더 좋을 때
    const two = ranked.find((c) => needOf(c) >= 2 && g.bank[c] >= 4);
    const take = two && level !== 'easy' && needOf(ranked[1] || two) < 1 ? [two, two] : ranked.slice(0, Math.min(3, avail.length));
    if (sumGems(p.gems) + take.length <= HAND_MAX + 1 || level === 'easy') return takeGems(g, seat, take);
  }
  // 보석이 거의 없거나 손이 가득 → 찜하기
  if (p.reserved.length < RESERVE_MAX) {
    const pick = target && g.market.some((r) => r.includes(target)) ? target : g.market.flat()[0] || ['deck1', 'deck2', 'deck3'].find((d, i) => g.decks[i].length);
    if (pick) return reserve(g, seat, pick);
  }
  if (avail.length) return takeGems(g, seat, avail.slice(0, Math.min(3, avail.length)));
  if (buyable.length) return buy(g, seat, buyable[0]);
  throw new Error('봇이 둘 수가 없어요.');
}

function botTarget(g, seat, level) {
  const p = g.players[seat];
  const opts = g.market.flat().concat(p.reserved.map((x) => x.id));
  if (!opts.length) return null;
  const score = (id) => {
    const c = cardOf(id);
    const miss = shortfall(p, c);
    return cardValue(g, seat, id, level) / (1 + miss * (level === 'hard' ? 0.9 : 1.4));
  };
  return opts.sort((a, b) => score(b) - score(a))[0];
}

// ---------- 자가 테스트 ----------
export function runSelfTests() {
  const results = [];
  const ok = (name, pass) => results.push({ name, pass: !!pass });
  const throws = (fn) => {
    try {
      fn();
    } catch (e) {
      return true;
    }
    return false;
  };
  const cards = makeCards();
  ok('카드 90장 (40·30·20)', cards.length === 90 && cards.filter((c) => c.tier === 1).length === 40 && cards.filter((c) => c.tier === 3).length === 20);
  ok('카드 id가 겹치지 않음', new Set(cards.map((c) => c.id)).size === 90);
  ok('후원자 10명', makePatrons().length === 10);
  const g = newGame(3, () => 0.3);
  ok('3인: 보석 5개씩 + 황금 5', g.bank.r === 5 && g.bank.y === 5 && newGame(2).bank.r === 4 && newGame(4).bank.k === 7);
  ok('시장 4장씩, 후원자 4명', g.market.every((r) => r.length === 4) && g.patrons.length === 4);
  ok('남의 차례엔 못 함', throws(() => takeGems(g, 1, ['r', 'b', 'g'])));
  ok('다른 색 3개 가져오기', takeGems(g, 0, ['r', 'b', 'g'])[0].type === 'take' && g.players[0].gems.r === 1 && g.bank.r === 4 && g.turn === 1);
  ok('같은 색 3개는 안 됨', throws(() => takeGems(g, 1, ['w', 'w', 'w'])));
  ok('2개만 다른 색은 안 됨 (색이 남아 있으면)', throws(() => takeGems(g, 1, ['w', 'k'])));
  g.bank.r = 3;
  ok('같은 색 2개는 4개 이상일 때만', throws(() => takeGems(g, 1, ['r', 'r'])) && !throws(() => takeGems(g, 1, ['w', 'w'])));
  const before = g.bank.y;
  reserve(g, 2, g.market[0][0]);
  ok('찜하면 황금 1개 + 시장 다시 채움', g.players[2].gems.y === 1 && g.bank.y === before - 1 && g.market[0].length === 4);
  // 사기: 할인 + 황금
  const p = { gems: { r: 0, b: 1, g: 0, w: 0, k: 0, y: 1 }, cards: ['c1-b-0'], reserved: [], patrons: [] };
  const card = { cost: { b: 2, g: 1 } };
  const pay = payment(p, card);
  ok('할인 → 보석 → 황금 순서로 냄', pay && pay.b === 1 && pay.y === 1 && pay.g === 0);
  ok('모자라면 못 삼', !payment({ ...p, gems: { ...p.gems, y: 0 } }, card));
  // 10개 제한
  const h = newGame(2, () => 0.5);
  h.players[0].gems = { r: 3, b: 3, g: 2, w: 1, k: 0, y: 0 };
  takeGems(h, 0, ['w', 'k', 'g']);
  ok('10개 넘으면 돌려놓기 단계', h.phase === 'discard' && h.turn === 0);
  ok('돌려놓는 개수가 맞아야 함', throws(() => discard(h, 0, ['r'])) && !throws(() => discard(h, 0, ['r', 'r'])) && h.phase === 'play' && h.turn === 1);
  // 후원자
  const v = newGame(2, () => 0.1);
  const pid = v.patrons[0];
  const req = patronOf(pid).need;
  v.players[0].cards = cards.filter((c) => c.tier === 1 && req[c.color]).reduce((acc, c) => (acc.filter((x) => cardOf(x).color === c.color).length < req[c.color] ? acc.concat(c.id) : acc), []);
  takeGems(v, 0, ['r', 'b', 'g']);
  ok('조건을 채우면 후원자가 찾아옴', v.players[0].patrons.includes(pid) && !v.patrons.includes(pid));
  // 끝: 15점 → 마지막 바퀴 → 모두 같은 횟수
  const e = newGame(3, () => 0.2);
  e.players[1].cards = cards.filter((c) => c.tier === 3).slice(0, 4).map((c) => c.id); // 3+4+4+5 = 16점
  takeGems(e, 0, ['r', 'b', 'g']);
  takeGems(e, 1, ['r', 'b', 'g']);
  ok('15점이면 마지막 바퀴', e.finalRound && e.phase === 'play' && e.turn === 2);
  takeGems(e, 2, ['w', 'k', 'r']);
  ok('마지막 사람까지 하고 끝, 1등은 점수 순', e.phase === 'over' && e.winner === 1 && e.ranking[0] === 1);
  const pv = publicView(e, 0);
  ok('화면용 상태에 덱 순서 없음', !pv.decks && pv.deckCounts.length === 3);
  const s = newGame(2, () => 0.4);
  reserve(s, 0, 'deck2');
  ok('덱에서 찜한 카드는 남에게 단계만 보임', publicView(s, 1).players[0].reserved[0].id === null && publicView(s, 0).players[0].reserved[0].id);
  // 봇끼리 끝까지
  let done = 0;
  for (let t = 0; t < 20; t++) {
    const b = newGame(2 + (t % 3));
    let guard = 0;
    while (b.phase !== 'over' && guard++ < 600) botStep(b, b.turn, ['easy', 'normal', 'hard'][t % 3]);
    if (b.phase === 'over' && pointsOf(b.players[b.winner]) >= GOAL) done++;
  }
  ok('봇끼리 20판 모두 끝까지 감', done === 20);
  const passed = results.filter((r) => r.pass).length;
  if (typeof console !== 'undefined' && console.table) console.table(results);
  return { passed, total: results.length, results };
}

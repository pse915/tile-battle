// 서라벌학교여행 — 규칙 엔진 + 봇 (브라우저와 앱스크립트 서버가 같이 씀)
// 주사위 땅따먹기 보드게임 규칙을 참고해 독자적으로 만든 게임. 땅 = 서라벌여중의 실(교실).
// 돈 단위: 만 원. 은행(bank)·복지 기부함(fund)·모든 사람 현금의 합은 늘 처음과 같음(돈 보존).
// 상태를 바꾸는 함수는 이벤트 배열을 돌려줌 → 서버가 pushEvent, 화면이 순서대로 연출.

export const START_MONEY = 1200;
export const SALARY = 200;
export const BAIL = 50;
export const DONATION = 100;
export const JAIL_TURNS = 3;
export const BANK_START = 20000;
export const ROUND_CHOICES = [10, 15, 20];
export const BUILD_NAMES = ['', '🪑 책상', '📚 책장', '🏫 리모델링'];
export const RENT_MULT = [1, 5, 15, 30];
export const FLOOR_COLORS = ['#ff9db0', '#ffc46b', '#7fd6a4', '#8fb6ff'];
export const GROUP_COLORS = ['#ff8fa3', '#ffb3c6', '#ffb347', '#ffd77a', '#5fcf8f', '#a4e6b8', '#6f9dff', '#b49cff'];
export const BUILD_COST = [50, 100, 150, 200];

// kind: start · room · mark(명소) · card · jail(숙직실) · welfare(복지실) · elev(엘리베이터) · fund(복지 기부함)
const R = (name, group, price) => ({ name, kind: 'room', group, price });
const M = (name, price, rent, icon) => ({ name, kind: 'mark', group: -1, price, rent, icon });
const C = () => ({ name: '행운 쪽지', kind: 'card', icon: '💌' });
export const CELLS = [
  { name: '교문', kind: 'start', icon: '🏫' },
  R('보건실', 0, 60), C(), R('방송실', 0, 60), R('행정실', 0, 80), M('교정 분수대', 200, 50, '⛲'), R('과학실1', 1, 100), C(), R('과학실3', 1, 100), R('교장실', 1, 120),
  { name: '숙직실', kind: 'jail', icon: '🛏️' },
  R('미술실', 2, 140), C(), R('기술실', 2, 140), R('가정실', 2, 160), M('체력단련실', 220, 60, '🏋️'), R('1학년 1반', 3, 180), R('영어활동실', 3, 180), C(), R('교무센터', 3, 200),
  { name: '복지실', kind: 'welfare', icon: '💝' },
  R('2학년 1반', 4, 220), C(), R('컴퓨터실', 4, 220), R('다목적실', 4, 240), M('자기주도배움터', 250, 70, '📖'), R('진로상담실', 5, 260), R('2학년 교무실', 5, 260), C(), R('수학교과지원실', 5, 280),
  { name: '엘리베이터', kind: 'elev', icon: '🛗' },
  R('음악실1', 6, 300), C(), R('음악실2', 6, 300), R('3학년 1반', 6, 320), M('홈베이스', 280, 90, '🏠'), R('3학년 교무실', 7, 350), R('글빛소회의실', 7, 350), { name: '복지 기부함', kind: 'fund', icon: '🪙' }, R('글빛도서관', 7, 400),
];
CELLS.forEach((c, i) => {
  c.i = i;
  c.floor = i % 10 ? Math.floor(i / 10) : -1; // 1층=0 … 4층=3, 모서리 칸은 -1
});
export const GROUPS = [0, 1, 2, 3, 4, 5, 6, 7].map((g) => CELLS.filter((c) => c.group === g).map((c) => c.i));
export const isProp = (i) => CELLS[i].kind === 'room' || CELLS[i].kind === 'mark';
export const buildCost = (i) => BUILD_COST[CELLS[i].floor] || 50;
export const floorName = (i) => (CELLS[i].kind === 'room' || CELLS[i].kind === 'mark' || CELLS[i].kind === 'card' || CELLS[i].kind === 'fund' ? CELLS[i].floor + 1 + '층' : '');

export const CARDS = [
  { id: 0, title: '장학금 받기', text: '성실상! 장학금 100만 원을 받아요.', good: true, fx: 'gain', v: 100 },
  { id: 1, title: '급식 당번 간식비', text: '급식 당번 간식비 50만 원을 복지 기부함에 내요.', fx: 'fine', v: 50 },
  { id: 2, title: '교문으로 바로 가기', text: '교문으로 바로 가서 용돈을 받아요.', good: true, fx: 'goto', v: 0 },
  { id: 3, title: '숙직실로!', text: '복도에서 뛰다 걸렸어요. 숙직실로 바로 가요. (교문을 지나도 용돈 없음)', fx: 'jail' },
  { id: 4, title: '뒤로 3칸', text: '준비물을 두고 왔어요! 뒤로 3칸 가요.', fx: 'back', v: 3 },
  { id: 5, title: '엘리베이터 타기', text: '엘리베이터로 가요. 다음 차례에 원하는 칸으로 이동!', good: true, fx: 'goto', v: 30 },
  { id: 6, title: '친구들에게 간식', text: '모든 친구에게 간식값 20만 원씩 사 줘요.', fx: 'payall', v: 20 },
  { id: 7, title: '건물 수리비', text: '내 건물 한 단계마다 수리비 25만 원을 복지 기부함에 내요.', fx: 'repair', v: 25 },
  { id: 8, title: '통행료 면제권', text: '통행료를 한 번 안 내도 돼요. (가지고 있다가 자동으로 써요)', good: true, fx: 'pass' },
  { id: 9, title: '생일 축하!', text: '오늘 내 생일! 모든 친구에게 20만 원씩 받아요.', good: true, fx: 'getall', v: 20 },
  { id: 10, title: '교내 대회 우승', text: '교내 과학 대회 우승 상금 150만 원!', good: true, fx: 'gain', v: 150 },
  { id: 11, title: '분실물 찾아 주기', text: '친구 지갑을 찾아 줬어요. 보상 30만 원.', good: true, fx: 'gain', v: 30 },
  { id: 12, title: '체육복 분실', text: '체육복을 잃어버렸어요. 40만 원을 복지 기부함에 내요.', fx: 'fine', v: 40 },
  { id: 13, title: '글빛도서관으로', text: '책 반납일! 글빛도서관으로 가요. (교문을 지나면 용돈)', fx: 'goto', v: 39 },
  { id: 14, title: '복지실로', text: '복지실로 가요. 쌓인 기부금이 있으면 내 것!', good: true, fx: 'goto', v: 20 },
  { id: 15, title: '앞으로 2칸', text: '복도를 빠르게! 앞으로 2칸 가요.', good: true, fx: 'fwd', v: 2 },
  { id: 16, title: '현장학습비', text: '현장학습비 80만 원을 복지 기부함에 내요.', fx: 'fine', v: 80 },
  { id: 17, title: '바자회 수익', text: '학급 바자회 수익 60만 원을 받아요.', good: true, fx: 'gain', v: 60 },
];

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function newGame(n, maxRounds = 15) {
  if (n < 2 || n > 4) throw new Error('2~4명이 필요해요.');
  return {
    n,
    players: Array.from({ length: n }, () => ({ cash: START_MONEY, pos: 0, jail: 0, elev: false, pass: 0, out: false })),
    own: new Array(40).fill(-1),
    lvl: new Array(40).fill(0),
    bank: BANK_START - START_MONEY * n,
    fund: 0,
    turn: 0,
    phase: 'roll',
    again: false,
    dbl: 0,
    dice: [1, 1],
    round: 1,
    maxRounds: ROUND_CHOICES.indexOf(maxRounds) >= 0 ? maxRounds : maxRounds > 0 ? maxRounds : 15,
    deck: shuffle(CARDS.map((c) => c.id)),
    deckPos: 0,
    winner: -1,
    endReason: '',
    moves: 0,
  };
}

/** 돈 총합 (보존 확인용) */
export const totalMoney = (g) => g.bank + g.fund + g.players.reduce((s, p) => s + p.cash, 0);

/** 통행료 (주인이 없으면 0) */
export function rentOf(g, i) {
  const c = CELLS[i];
  const o = g.own[i];
  if (o < 0) return 0;
  if (c.kind === 'mark') return c.rent;
  const base = Math.round(c.price / 10) * RENT_MULT[g.lvl[i]];
  return hasMonopoly(g, o, c.group) ? base * 2 : base;
}
export const hasMonopoly = (g, seat, group) => group >= 0 && GROUPS[group].every((k) => g.own[k] === seat);
/** 한 실의 값어치 (땅값 + 지은 건물값) */
export const propValue = (g, i) => CELLS[i].price + g.lvl[i] * buildCost(i);
export function assetsOf(g, seat) {
  const p = g.players[seat];
  if (p.out) return 0;
  let v = p.cash;
  for (let i = 0; i < 40; i++) if (g.own[i] === seat) v += propValue(g, i);
  return v;
}
/** 통행료표: [기본, 책상, 책장, 리모델링] (독점 전) */
export function rentTable(i) {
  const c = CELLS[i];
  if (c.kind === 'mark') return [c.rent];
  return RENT_MULT.map((m) => Math.round(c.price / 10) * m);
}

// ---------- 돈 옮기기 ----------
function credit(g, to, amt) {
  if (to === 'bank') g.bank += amt;
  else if (to === 'fund') g.fund += amt;
  else g.players[to].cash += amt;
}
function fromBank(g, seat, amt, evs, why) {
  g.bank -= amt;
  g.players[seat].cash += amt;
  evs.push({ type: 'gain', seat, amount: amt, why });
}

/** 모자라면 건물 → 땅 순으로 반값에 팔기 */
function liquidate(g, seat, need, evs) {
  const p = g.players[seat];
  while (p.cash < need) {
    let best = -1;
    for (let i = 0; i < 40; i++) if (g.own[i] === seat && g.lvl[i] > 0 && (best < 0 || g.lvl[i] > g.lvl[best] || (g.lvl[i] === g.lvl[best] && buildCost(i) < buildCost(best)))) best = i;
    if (best >= 0) {
      const amt = Math.floor(buildCost(best) / 2);
      g.lvl[best]--;
      g.bank -= amt;
      p.cash += amt;
      evs.push({ type: 'sell', seat, cell: best, what: 'build', lvl: g.lvl[best], amount: amt });
      continue;
    }
    for (let i = 0; i < 40; i++) if (g.own[i] === seat && (best < 0 || CELLS[i].price < CELLS[best].price)) best = i;
    if (best < 0) return false;
    const amt = Math.floor(CELLS[best].price / 2);
    g.own[best] = -1;
    g.bank -= amt;
    p.cash += amt;
    evs.push({ type: 'sell', seat, cell: best, what: 'land', amount: amt });
  }
  return true;
}

/** seat이 to('bank'|'fund'|자리)에 amt를 냄. 못 내면 파산. 실제 낸 돈을 돌려줌 */
function pay(g, seat, amt, to, evs) {
  const p = g.players[seat];
  if (p.out || amt <= 0) return 0;
  if (p.cash < amt) liquidate(g, seat, amt, evs);
  if (p.cash >= amt) {
    p.cash -= amt;
    credit(g, to, amt);
    return amt;
  }
  const paid = p.cash;
  credit(g, to, paid);
  p.cash = 0;
  bankrupt(g, seat, evs, to);
  return paid;
}

function bankrupt(g, seat, evs, to) {
  const p = g.players[seat];
  p.out = true;
  p.elev = false;
  p.jail = 0;
  for (let i = 0; i < 40; i++)
    if (g.own[i] === seat) {
      g.own[i] = -1;
      g.lvl[i] = 0;
    }
  evs.push({ type: 'bankrupt', seat, to: typeof to === 'number' ? to : -1 });
  const alive = g.players.map((q, k) => (q.out ? -1 : k)).filter((k) => k >= 0);
  if (alive.length === 1) endGame(g, alive[0], 'last', evs);
}

function endGame(g, winner, reason, evs) {
  g.phase = 'over';
  g.winner = winner;
  g.endReason = reason;
  evs.push({ type: 'end', winner, reason, assets: g.players.map((_, k) => assetsOf(g, k)) });
}

// ---------- 이동 ----------
function stepMove(g, seat, steps, evs) {
  const p = g.players[seat];
  const from = p.pos;
  const dir = steps < 0 ? -1 : 1;
  let salary = 0;
  for (let k = 0; k < Math.abs(steps); k++) {
    p.pos = (p.pos + dir + 40) % 40;
    if (dir > 0 && p.pos === 0) salary += SALARY;
  }
  evs.push({ type: 'move', seat, from, to: p.pos, steps });
  if (salary) fromBank(g, seat, salary, evs, 'salary');
}
/** 앞으로 target 칸까지 (교문 지나면 용돈) */
function moveForwardTo(g, seat, target, evs) {
  const d = (target - g.players[seat].pos + 40) % 40;
  if (d) stepMove(g, seat, d, evs);
}

function sendToJail(g, seat, evs) {
  const p = g.players[seat];
  if (p.pos !== 10) evs.push({ type: 'jump', seat, from: p.pos, to: 10 });
  p.pos = 10;
  p.jail = JAIL_TURNS;
  p.elev = false;
  g.again = false;
  evs.push({ type: 'jail', seat });
}

function land(g, seat, evs, depth = 0) {
  const p = g.players[seat];
  const i = p.pos;
  const c = CELLS[i];
  g.pending = -1;
  if (c.kind === 'room' || c.kind === 'mark') {
    const o = g.own[i];
    if (o < 0) {
      if (p.cash >= c.price) {
        g.phase = 'buy';
        g.pending = i;
      } else evs.push({ type: 'poor', seat, cell: i });
    } else if (o === seat) {
      if (c.kind === 'room' && g.lvl[i] < 3 && p.cash >= buildCost(i)) {
        g.phase = 'build';
        g.pending = i;
      }
    } else if (!g.players[o].out) {
      const amt = rentOf(g, i);
      if (p.pass > 0) {
        p.pass--;
        evs.push({ type: 'rent', seat, to: o, cell: i, amount: 0, free: true });
      } else {
        const paid = pay(g, seat, amt, o, evs);
        evs.push({ type: 'rent', seat, to: o, cell: i, amount: paid });
      }
    }
  } else if (c.kind === 'card') drawCard(g, seat, evs, depth);
  else if (c.kind === 'jail') sendToJail(g, seat, evs); // 주사위로 숙직실에 멈춰도 쉬어가기
  else if (c.kind === 'welfare') {
    if (g.fund > 0) {
      const amt = g.fund;
      g.fund = 0;
      p.cash += amt;
      evs.push({ type: 'welfare', seat, amount: amt });
    } else evs.push({ type: 'welfare', seat, amount: 0 });
  } else if (c.kind === 'elev') {
    p.elev = true;
    g.again = false;
    evs.push({ type: 'elev', seat });
  } else if (c.kind === 'fund') {
    const paid = pay(g, seat, DONATION, 'fund', evs);
    evs.push({ type: 'donate', seat, amount: paid });
  }
}

function drawCard(g, seat, evs, depth) {
  if (g.deckPos >= g.deck.length) {
    g.deck = shuffle(g.deck);
    g.deckPos = 0;
  }
  const card = CARDS[g.deck[g.deckPos++]];
  const p = g.players[seat];
  evs.push({ type: 'card', seat, card: card.id });
  const others = g.players.map((q, k) => k).filter((k) => k !== seat && !g.players[k].out);
  switch (card.fx) {
    case 'gain':
      fromBank(g, seat, card.v, evs, 'card');
      break;
    case 'fine':
      pay(g, seat, card.v, 'fund', evs);
      break;
    case 'goto':
      moveForwardTo(g, seat, card.v, evs);
      if (card.v !== 0 && depth < 3) land(g, seat, evs, depth + 1);
      break;
    case 'jail':
      sendToJail(g, seat, evs);
      break;
    case 'back':
      stepMove(g, seat, -card.v, evs);
      if (depth < 3) land(g, seat, evs, depth + 1);
      break;
    case 'fwd':
      stepMove(g, seat, card.v, evs);
      if (depth < 3) land(g, seat, evs, depth + 1);
      break;
    case 'payall':
      for (const k of others) if (!p.out) pay(g, seat, card.v, k, evs);
      break;
    case 'getall':
      for (const k of others) if (g.phase !== 'over') pay(g, k, card.v, seat, evs);
      break;
    case 'repair': {
      let n = 0;
      for (let i = 0; i < 40; i++) if (g.own[i] === seat) n += g.lvl[i];
      if (n) pay(g, seat, n * card.v, 'fund', evs);
      break;
    }
    case 'pass':
      p.pass++;
      break;
  }
}

// ---------- 차례 ----------
function check(g, seat) {
  if (g.phase === 'over') throw new Error('이미 끝난 판이에요.');
  if (seat !== g.turn) throw new Error('지금은 다른 사람 차례예요.');
}

/** 할 일이 끝나면 차례 넘기기 (더블이면 한 번 더) */
function finishTurn(g, evs) {
  if (g.phase === 'over') return;
  if (g.phase === 'buy' || g.phase === 'build') return;
  const p = g.players[g.turn];
  g.pending = -1;
  if (!p.out && g.again) {
    g.phase = 'roll';
    return;
  }
  g.again = false;
  g.dbl = 0;
  let k = g.turn;
  for (let s = 0; s < g.n; s++) {
    k = (k + 1) % g.n;
    if (!g.players[k].out) break;
  }
  if (k <= g.turn) g.round++;
  if (g.round > g.maxRounds) {
    g.round = g.maxRounds;
    let best = -1;
    for (let s = 0; s < g.n; s++) if (!g.players[s].out && (best < 0 || assetsOf(g, s) > assetsOf(g, best))) best = s;
    endGame(g, best, 'rounds', evs);
    return;
  }
  g.turn = k;
  g.phase = 'roll';
  evs.push({ type: 'turn', seat: k, round: g.round });
}

export function roll(g, seat, dice) {
  check(g, seat);
  if (g.phase !== 'roll') throw new Error('지금은 주사위를 굴릴 때가 아니에요.');
  const p = g.players[seat];
  if (p.elev) throw new Error('엘리베이터에 탔어요! 가고 싶은 칸을 골라 주세요.');
  const d = dice || [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
  const evs = [{ type: 'roll', seat, d }];
  g.dice = d;
  g.moves++;
  const dbl = d[0] === d[1];
  const sum = d[0] + d[1];
  if (p.jail > 0) {
    g.again = false;
    if (dbl) {
      p.jail = 0;
      evs.push({ type: 'free', seat, how: 'double' });
    } else {
      // 더블이 아니면 이번 턴은 쉼. 3턴을 다 쉬면 다음 턴부터 자유롭게 움직임
      p.jail--;
      evs.push({ type: 'stay', seat, left: p.jail });
      if (p.jail === 0) evs.push({ type: 'free', seat, how: 'time' });
      finishTurn(g, evs);
      return evs;
    }
  } else if (dbl) {
    g.dbl++;
    if (g.dbl >= 3) {
      evs.push({ type: 'triple', seat });
      sendToJail(g, seat, evs);
      finishTurn(g, evs);
      return evs;
    }
    g.again = true;
  } else g.again = false;
  stepMove(g, seat, sum, evs);
  land(g, seat, evs);
  finishTurn(g, evs);
  return evs;
}

/** 숙직실에서 돈 내고 바로 나오기 (그다음 주사위를 굴림) */
export function payBail(g, seat) {
  check(g, seat);
  const p = g.players[seat];
  if (g.phase !== 'roll' || p.jail <= 0) throw new Error('숙직실에 있을 때만 낼 수 있어요.');
  if (p.cash < BAIL) throw new Error('돈이 모자라요.');
  p.cash -= BAIL;
  g.fund += BAIL;
  p.jail = 0;
  return [{ type: 'free', seat, how: 'pay', amount: BAIL }];
}

/** 엘리베이터: 원하는 칸으로 */
export function fly(g, seat, to) {
  check(g, seat);
  const p = g.players[seat];
  if (g.phase !== 'roll' || !p.elev) throw new Error('엘리베이터를 탄 사람만 고를 수 있어요.');
  to = Number(to);
  if (!(to >= 0 && to < 40) || to !== Math.floor(to) || to === 30) throw new Error('갈 수 없는 칸이에요.');
  p.elev = false;
  g.again = false;
  g.moves++;
  const evs = [{ type: 'fly', seat, from: p.pos, to }];
  const salary = to < p.pos || to === 0;
  p.pos = to;
  if (salary) fromBank(g, seat, SALARY, evs, 'salary');
  land(g, seat, evs);
  finishTurn(g, evs);
  return evs;
}

export function buy(g, seat) {
  check(g, seat);
  if (g.phase !== 'buy') throw new Error('지금은 살 수 없어요.');
  const i = g.pending;
  const p = g.players[seat];
  const price = CELLS[i].price;
  if (p.cash < price) throw new Error('돈이 모자라요.');
  p.cash -= price;
  g.bank += price;
  g.own[i] = seat;
  g.phase = 'roll';
  const evs = [{ type: 'buy', seat, cell: i, price }];
  finishTurn(g, evs);
  return evs;
}

export function build(g, seat) {
  check(g, seat);
  if (g.phase !== 'build') throw new Error('지금은 지을 수 없어요.');
  const i = g.pending;
  const p = g.players[seat];
  const cost = buildCost(i);
  if (p.cash < cost) throw new Error('돈이 모자라요.');
  if (g.lvl[i] >= 3) throw new Error('더 지을 수 없어요.');
  p.cash -= cost;
  g.bank += cost;
  g.lvl[i]++;
  g.phase = 'roll';
  const evs = [{ type: 'build', seat, cell: i, lvl: g.lvl[i], cost }];
  finishTurn(g, evs);
  return evs;
}

/** 안 사기 / 안 짓기 */
export function skip(g, seat) {
  check(g, seat);
  if (g.phase !== 'buy' && g.phase !== 'build') throw new Error('지금은 넘길 게 없어요.');
  const evs = [{ type: 'skip', seat, cell: g.pending, what: g.phase }];
  g.phase = 'roll';
  finishTurn(g, evs);
  return evs;
}

// ---------- 봇 ----------
const RESERVE = { easy: 50, normal: 150, hard: 120 };

function wantsBuy(g, seat, i, diff) {
  const p = g.players[seat];
  const c = CELLS[i];
  if (diff === 'away') return false;
  if (diff === 'easy') return p.cash - c.price >= 0 && Math.random() < 0.65;
  let reserve = RESERVE[diff] || 150;
  if (c.group >= 0) {
    const mine = GROUPS[c.group].filter((k) => g.own[k] === seat).length;
    const theirs = GROUPS[c.group].filter((k) => g.own[k] >= 0 && g.own[k] !== seat);
    if (mine === GROUPS[c.group].length - 1) reserve = diff === 'hard' ? 0 : 40; // 독점 완성
    if (diff === 'hard' && theirs.length === GROUPS[c.group].length - 1 && new Set(theirs.map((k) => g.own[k])).size === 1) reserve = 30; // 남의 독점 막기
  }
  if (c.kind === 'mark') reserve = Math.min(reserve, 100);
  return p.cash - c.price >= reserve;
}
function wantsBuild(g, seat, i, diff) {
  const p = g.players[seat];
  if (diff === 'away') return false;
  if (diff === 'easy') return Math.random() < 0.5 && p.cash - buildCost(i) >= 50;
  const reserve = diff === 'hard' ? (hasMonopoly(g, seat, CELLS[i].group) ? 100 : 180) : 220;
  return p.cash - buildCost(i) >= reserve;
}

/** 엘리베이터로 갈 칸 점수 */
export function flyScore(g, seat, to) {
  const p = g.players[seat];
  const c = CELLS[to];
  let s = to < p.pos || to === 0 ? SALARY : 0;
  if (isProp(to)) {
    const o = g.own[to];
    if (o < 0) s += p.cash >= c.price ? 120 + c.price * 0.3 + (c.group >= 0 && GROUPS[c.group].filter((k) => g.own[k] === seat).length * 80) : 0;
    else if (o === seat) s += c.kind === 'room' && g.lvl[to] < 3 && p.cash >= buildCost(to) ? 90 + rentOf(g, to) : 10;
    else s -= g.players[o].out ? 0 : rentOf(g, to) * (p.pass ? 0 : 1);
  } else if (c.kind === 'welfare') s += g.fund;
  else if (c.kind === 'fund') s -= DONATION;
  else if (c.kind === 'card') s += 20;
  else if (c.kind === 'jail') s -= 10;
  return s;
}
export function bestFly(g, seat, diff = 'normal') {
  if (diff === 'away') return 0;
  let best = 0;
  let bv = -Infinity;
  for (let i = 0; i < 40; i++) {
    if (i === 30) continue;
    const v = flyScore(g, seat, i) + (diff === 'easy' ? Math.random() * 300 : 0);
    if (v > bv) {
      bv = v;
      best = i;
    }
  }
  return best;
}

/** 봇 한 걸음 (자리 비운 사람은 diff='away': 사지 않고 넘기기) */
export function botStep(g, seat, diff = 'normal') {
  const p = g.players[seat];
  if (g.phase === 'buy') return wantsBuy(g, seat, g.pending, diff) ? buy(g, seat) : skip(g, seat);
  if (g.phase === 'build') return wantsBuild(g, seat, g.pending, diff) ? build(g, seat) : skip(g, seat);
  if (p.elev) return fly(g, seat, bestFly(g, seat, diff));
  if (p.jail > 0 && diff !== 'away' && diff !== 'easy' && p.cash >= BAIL + 300 && g.round < g.maxRounds * 0.6) {
    const evs = payBail(g, seat);
    return evs.concat(roll(g, seat));
  }
  return roll(g, seat);
}

/** 화면용 공개 상태 (다음 카드 순서만 숨김) */
export function publicView(g) {
  return {
    n: g.n,
    players: g.players,
    own: g.own,
    lvl: g.lvl,
    fund: g.fund,
    turn: g.turn,
    phase: g.phase,
    pending: g.pending == null ? -1 : g.pending,
    dice: g.dice,
    again: g.again,
    round: g.round,
    maxRounds: g.maxRounds,
    winner: g.winner,
    endReason: g.endReason,
    moves: g.moves,
  };
}

export const won = (v) => (v >= 10000 ? (v / 10000).toFixed(v % 10000 ? 1 : 0) + '억' : v + '만');

// ---------- 자가 테스트 ----------
export function runSelfTests(n) {
  const games = typeof n === 'number' ? n : 2000;
  const results = [];
  const ok = (name, cond) => results.push({ name, pass: !!cond });
  ok('판은 40칸', CELLS.length === 40);
  ok('행운 쪽지 7칸', CELLS.filter((c) => c.kind === 'card').length === 7);
  ok('명소 4곳', CELLS.filter((c) => c.kind === 'mark').length === 4);
  ok('색 그룹 8개 × 3칸', GROUPS.length === 8 && GROUPS.every((x) => x.length === 3));
  ok('그룹은 같은 층', GROUPS.every((x) => x.every((k) => CELLS[k].floor === CELLS[x[0]].floor)));
  ok('글빛도서관이 가장 비쌈', CELLS[39].price === Math.max(...CELLS.filter((c) => c.price).map((c) => c.price)));
  ok('행운 쪽지 15~20종', CARDS.length >= 15 && CARDS.length <= 20);
  // 정해진 주사위로 흐름 확인
  let g = newGame(2);
  const T0 = totalMoney(g);
  roll(g, 0, [1, 2]); // 3칸 → 방송실
  ok('주인 없는 실에 멈추면 사기 단계', g.phase === 'buy' && g.pending === 3);
  let threw = false;
  try {
    roll(g, 1, [1, 2]);
  } catch {
    threw = true;
  }
  ok('남의 차례에는 못 굴림', threw);
  buy(g, 0);
  ok('사면 내 땅, 차례 넘어감', g.own[3] === 0 && g.turn === 1 && g.players[0].cash === START_MONEY - 60);
  roll(g, 1, [1, 2]);
  ok('남의 실이면 통행료 자동', g.players[1].cash === START_MONEY - 6 && g.players[0].cash === START_MONEY - 54);
  ok('돈 보존', totalMoney(g) === T0);
  // 더블은 한 번 더, 세 번이면 숙직실
  g = newGame(2);
  roll(g, 0, [2, 2]);
  if (g.phase === 'buy') skip(g, 0);
  ok('더블이면 같은 사람 한 번 더', g.turn === 0 && g.phase === 'roll');
  roll(g, 0, [5, 5]); // 4+10=14 가정실 (숙직실·행운 쪽지 칸은 피함)
  if (g.phase === 'buy') skip(g, 0);
  roll(g, 0, [1, 1]);
  ok('더블 세 번이면 숙직실', g.players[0].pos === 10 && g.players[0].jail === JAIL_TURNS && g.turn === 1);
  // 숙직실 3턴
  g = newGame(2);
  g.players[0].pos = 10;
  g.players[0].jail = 3;
  roll(g, 0, [1, 2]);
  ok('숙직실에서 더블 아니면 그대로', g.players[0].pos === 10 && g.players[0].jail === 2);
  g.turn = 0;
  roll(g, 0, [3, 3]);
  ok('더블이면 탈출', g.players[0].jail === 0 && g.players[0].pos === 16);
  // 주사위로 숙직실 칸에 멈춰도 갇힘
  g = newGame(2);
  g.players[0].pos = 4;
  roll(g, 0, [2, 4]);
  ok('주사위로 숙직실에 멈추면 갇힘', g.players[0].pos === 10 && g.players[0].jail === JAIL_TURNS);
  // 3턴을 꼬박 쉬고 4번째 턴에 움직임
  g = newGame(2);
  g.players[0].pos = 10;
  g.players[0].jail = JAIL_TURNS;
  let rested = 0;
  for (let k = 0; k < 3; k++) {
    g.turn = 0;
    g.phase = 'roll';
    roll(g, 0, [1, 2]);
    if (g.players[0].pos === 10) rested++;
  }
  g.turn = 0;
  g.phase = 'roll';
  roll(g, 0, [1, 2]);
  ok('숙직실 3턴 쉬고 4번째 턴에 이동', rested === 3 && g.players[0].jail === 0 && g.players[0].pos === 13);
  // 엘리베이터
  g = newGame(2);
  g.players[0].pos = 30;
  g.players[0].elev = true;
  const c0 = g.players[0].cash;
  fly(g, 0, 5);
  ok('엘리베이터: 교문 지나면 용돈 + 원하는 칸', g.players[0].pos === 5 && g.players[0].cash === c0 + SALARY && g.phase === 'buy');
  // 독점 2배 + 건물
  g = newGame(2);
  GROUPS[0].forEach((k) => (g.own[k] = 1));
  ok('독점하면 통행료 2배', rentOf(g, 1) === 12);
  g.lvl[1] = 3;
  ok('리모델링 통행료', rentOf(g, 1) === 6 * 30 * 2);
  // 파산: 건물→땅 팔고도 못 내면 탈락
  g = newGame(2);
  g.own[39] = 1;
  g.lvl[39] = 3;
  g.bank += g.players[0].cash - 10;
  g.players[0].cash = 10;
  const T1 = totalMoney(g);
  g.own[1] = 0;
  g.lvl[1] = 2;
  g.players[0].pos = 37;
  roll(g, 0, [1, 1]);
  ok('못 내면 파산하고 승리 결정', g.players[0].out && g.phase === 'over' && g.winner === 1 && g.own[1] === -1);
  ok('파산 뒤에도 돈 보존', totalMoney(g) === T1);
  // 복지 기부함 → 복지실
  g = newGame(2);
  g.players[0].pos = 35;
  roll(g, 0, [1, 2]);
  ok('복지 기부함에 내면 쌓임', g.fund === DONATION);
  g.turn = 0;
  g.phase = 'roll';
  g.players[0].pos = 18;
  const c1 = g.players[0].cash;
  roll(g, 0, [1, 1]);
  ok('복지실에 멈추면 기부금을 받음', g.players[0].cash === c1 + DONATION && g.fund === 0);
  // 라운드 제한
  g = newGame(2, 10);
  let guard = 0;
  while (g.phase !== 'over' && guard++ < 5000) botStep(g, g.turn, 'away');
  ok('라운드 제한으로 끝남', g.phase === 'over' && (g.endReason === 'rounds' || g.endReason === 'last') && g.round <= 10);
  // 무작위 봇 대전
  let errors = 0;
  let leaks = 0;
  let unfinished = 0;
  let bankrupts = 0;
  const diffs = ['easy', 'normal', 'hard'];
  for (let k = 0; k < games; k++) {
    const n = 2 + (k % 3);
    const t = newGame(n, k % 10 === 9 ? 100 : ROUND_CHOICES[k % 3]); // 열 판에 한 번은 아주 길게 (파산까지)
    const total = totalMoney(t);
    const dif = Array.from({ length: n }, (_, s) => diffs[(k + s) % 3]);
    let steps = 0;
    try {
      while (t.phase !== 'over' && steps++ < 20000) {
        botStep(t, t.turn, dif[t.turn]);
        if (totalMoney(t) !== total || t.players.some((p) => p.cash < 0)) {
          leaks++;
          break;
        }
      }
    } catch (e) {
      errors++;
      if (errors < 3 && typeof console !== 'undefined') console.log('봇 대전 오류', e && e.message);
    }
    if (t.phase !== 'over') unfinished++;
    if (t.players.some((p) => p.out)) bankrupts++;
  }
  ok(`봇끼리 ${games}판 오류 0`, errors === 0);
  ok(`봇끼리 ${games}판 돈 보존`, leaks === 0);
  ok(`봇끼리 ${games}판 모두 끝남`, unfinished === 0);
  ok('파산이 일어나는 판도 있음', bankrupts > 0);
  const passed = results.filter((r) => r.pass).length;
  if (typeof console !== 'undefined') console.table?.(results);
  return { passed, total: results.length, results };
}

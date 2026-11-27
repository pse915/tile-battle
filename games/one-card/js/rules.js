// 원카드 — 규칙 엔진 + 봇 (브라우저와 서버가 같이 씀, DOM·import 없음)
// 카드 코드: 무늬 1글자 + 숫자/문자 1글자
//   무늬: s ♠ · h ♥ · d ♦ · c ♣      숫자: A 2 3 4 5 6 7 8 9 T(10) J Q K
//   조커: 'XB' 흑백 조커(+5) · 'XC' 컬러 조커(+7)
// 규칙(한국에서 흔히 하는 방식):
//   - 맨 위 카드와 무늬 또는 숫자/문자가 같으면 냄. 조커는 아무 때나. 조커 다음엔 아무 카드나.
//   - 낼 게 없으면 1장 뽑음. 뽑은 카드를 낼 수 있으면 '내기' 또는 '넘기기'를 고름.
//   - 공격: 2 +2, A +3, ♠A +5, 흑백 조커 +5, 컬러 조커 +7.
//     공격을 받으면 같은 숫자 공격(무늬 상관없음), 같은 무늬의 더 센 공격, 또는 (더 센) 조커로 막고 넘김 → 쌓임.
//     못 막으면 쌓인 만큼 뽑고 차례 끝.
//   - J 건너뛰기, Q 방향 바꾸기(2명이면 건너뛰기), K 한 번 더, 7 무늬 바꾸기.
//   - 한 장 남으면 '원카드!'. 안 외친 채로 남이 먼저 지적하면 1장 벌칙.
//   - 손패가 파산 장수 이상이 되면 파산(탈락, 카드는 뽑을 더미 밑으로). 손패를 다 내면 순위 확정.
//   - 옵션: 처음 장수 5/6/7, 파산 장수 15/20/25, 조커 포함, 끝까지 순위 / 1등만

export const SUITS = ['s', 'h', 'd', 'c'];
export const SUIT_SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
export const SUIT_NAME = { s: '스페이드', h: '하트', d: '다이아', c: '클로버' };
export const SUIT_RED = { s: false, h: true, d: true, c: false };
export const RANKS = 'A23456789TJQK';
export const RANK_LABEL = { A: 'A', T: '10', J: 'J', Q: 'Q', K: 'K' };
export const MAX_PLAYERS = 5;
export const HAND_CHOICES = [5, 6, 7];
export const BUST_CHOICES = [15, 20, 25];
export const DEFAULT_OPTS = { hand: 7, bust: 20, jokers: true, mode: 'all' };
export const CALL_P = { easy: 0.55, normal: 0.82, hard: 0.96 }; // 봇이 '원카드!'를 잊지 않을 확률
export const CATCH_P = { easy: 0.45, normal: 0.8, hard: 1 }; // 봇이 깜빡한 사람을 지적할 확률

export const isJoker = (c) => c === 'XB' || c === 'XC';
export const rankOf = (c) => (isJoker(c) ? c : c[1]);
export const suitOf = (c) => (isJoker(c) ? null : c[0]);

/** 공격 세기 (공격 카드가 아니면 0) */
export function power(c) {
  if (c === 'XC') return 7;
  if (c === 'XB') return 5;
  if (c === 'sA') return 5;
  if (c[1] === 'A') return 3;
  if (c[1] === '2') return 2;
  return 0;
}
export const isAttack = (c) => power(c) > 0;
/** 첫 카드로 쓸 수 있는 '일반 숫자 카드' (공격·특수 아님) */
export const isPlain = (c) => !isJoker(c) && '345689T'.indexOf(c[1]) >= 0;

export function makeDeck(jokers = true) {
  const d = [];
  SUITS.forEach((s) => [...RANKS].forEach((r) => d.push(s + r)));
  if (jokers) d.push('XB', 'XC');
  return d;
}

export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/** 로그용 이름: '♠ 7', '♥ 10', '흑백 조커' */
export function cardName(c) {
  if (!c) return '';
  if (c === 'XB') return '흑백 조커';
  if (c === 'XC') return '컬러 조커';
  return SUIT_SYM[c[0]] + ' ' + (RANK_LABEL[c[1]] || c[1]);
}

/** 패 정렬: 무늬 → 숫자, 조커는 맨 끝 */
export function compareCodes(a, b) {
  const sa = isJoker(a) ? 9 : SUITS.indexOf(a[0]);
  const sb = isJoker(b) ? 9 : SUITS.indexOf(b[0]);
  if (sa !== sb) return sa - sb;
  if (isJoker(a)) return a === 'XB' ? -1 : 1;
  return RANKS.indexOf(a[1]) - RANKS.indexOf(b[1]);
}

/** 평소(공격 없음)에 낼 수 있나. suit: 지금 무늬(null이면 아무거나) */
export function canPlay(c, top, suit) {
  if (isJoker(c) || !top || isJoker(top) || !suit) return true;
  return c[0] === suit || c[1] === top[1];
}

/** 공격을 막을 수 있나 */
export function canDefend(c, top, suit) {
  if (!isAttack(c) || !top) return false;
  if (isJoker(c)) return !isJoker(top) || power(c) >= power(top);
  if (isJoker(top)) return false;
  if (c[1] === top[1]) return true; // 같은 숫자 공격
  return power(c) > power(top) && c[0] === suit; // 같은 무늬 더 센 공격
}

export function topOf(g) {
  return g.discard[g.discard.length - 1];
}
export const alive = (g, s) => g.status[s] === 'in';
export const aliveCount = (g) => g.status.filter((x) => x === 'in').length;

/** from 다음 자리 (끝난 사람 건너뜀) */
export function nextSeat(g, from, steps = 1) {
  let s = from;
  for (let k = 0; k < steps; k++) {
    for (let t = 0; t < g.n; t++) {
      s = (((s + g.dir) % g.n) + g.n) % g.n;
      if (alive(g, s)) break;
    }
  }
  return s;
}

export function totalCards(g) {
  return g.draw.length + g.discard.length + g.hands.reduce((s, h) => s + h.length, 0);
}

export function playableCodes(g, seat) {
  const hand = g.hands[seat] || [];
  const top = topOf(g);
  const out = [];
  hand.forEach((c) => {
    const ok = g.attack > 0 ? canDefend(c, top, g.suit) : canPlay(c, top, g.suit);
    if (ok && out.indexOf(c) < 0) out.push(c);
  });
  return out;
}

export function normOpts(o = {}) {
  return {
    hand: HAND_CHOICES.indexOf(Number(o.hand)) >= 0 ? Number(o.hand) : DEFAULT_OPTS.hand,
    bust: BUST_CHOICES.indexOf(Number(o.bust)) >= 0 ? Number(o.bust) : DEFAULT_OPTS.bust,
    jokers: o.jokers === undefined ? DEFAULT_OPTS.jokers : !!o.jokers,
    mode: o.mode === 'first' ? 'first' : 'all',
  };
}

export function newGame(n, opts, deck) {
  if (n < 2 || n > MAX_PLAYERS) throw new Error('2~5명이 할 수 있어요.');
  const o = normOpts(opts);
  const draw = deck ? deck.slice() : shuffle(makeDeck(o.jokers));
  const g = {
    n,
    opts: o,
    deckSize: draw.length,
    hands: [],
    draw,
    discard: [],
    suit: null,
    dir: 1,
    turn: 0,
    phase: 'play',
    attack: 0,
    drawn: null,
    unsafe: -1,
    catchTried: false,
    status: new Array(n).fill('in'),
    places: [], // 다 낸 순서
    busted: [], // 파산한 순서
    ranking: null,
    winner: -1,
    moves: 0,
  };
  for (let i = 0; i < n; i++) g.hands.push(g.draw.splice(0, o.hand));
  let guard = 0;
  while (!isPlain(g.draw[0]) && guard++ < 60) g.draw.push(g.draw.shift());
  const first = g.draw.shift();
  g.discard.push(first);
  g.suit = first[0];
  g.turn = Math.floor(Math.random() * n);
  return g;
}

function err(msg) {
  throw new Error(msg);
}

/** k장 뽑기 (더미가 떨어지면 버린 더미를 섞어 재활용) */
function drawCards(g, seat, k, evs) {
  const got = [];
  for (let i = 0; i < k; i++) {
    if (!g.draw.length && g.discard.length > 1) {
      const top = g.discard.pop();
      g.draw = shuffle(g.discard);
      g.discard = [top];
      evs.push({ type: 'recycle', n: g.draw.length });
    }
    if (!g.draw.length) break;
    got.push(g.draw.shift());
  }
  g.hands[seat] = g.hands[seat].concat(got);
  return got;
}

/** 파산 확인: 파산이면 카드는 뽑을 더미 밑에 섞어 넣음 */
function checkBust(g, seat, evs) {
  if (!alive(g, seat) || g.hands[seat].length < g.opts.bust) return false;
  g.status[seat] = 'bust';
  g.busted.push(seat);
  const back = shuffle(g.hands[seat]);
  g.hands[seat] = [];
  g.draw = g.draw.concat(back);
  if (g.unsafe === seat) g.unsafe = -1;
  evs.push({ type: 'bust', seat, n: back.length });
  return true;
}

/** 끝났는지 확인하고 순위 정리. 끝났으면 true */
function checkEnd(g, evs) {
  const left = aliveCount(g);
  const over = left <= 1 || (g.opts.mode === 'first' && g.places.length >= 1);
  if (!over) return false;
  const rest = [];
  for (let i = 0; i < g.n; i++) if (alive(g, i)) rest.push(i);
  rest.sort((a, b) => g.hands[a].length - g.hands[b].length);
  g.ranking = g.places.concat(rest, g.busted.slice().reverse());
  g.winner = g.ranking[0];
  g.phase = 'over';
  g.unsafe = -1;
  evs.push({ type: 'end', winner: g.winner, ranking: g.ranking.slice() });
  return true;
}

/** 차례를 다음 사람에게 (자리가 끝났으면 그다음) */
function passTurn(g, from, steps = 1) {
  g.turn = nextSeat(g, from, steps);
}

function checkTurn(g, seat) {
  if (g.phase === 'over') err('이미 끝난 판이에요.');
  if (seat !== g.turn) err('내 차례가 아니에요.');
}

/** 카드 내기. opts: { suit: 7을 낼 때 고른 무늬, call: 한 장 남을 때 '원카드!'를 같이 외침 } */
export function play(g, seat, code, opts = {}) {
  checkTurn(g, seat);
  code = String(code || '');
  if (g.phase === 'drawn' && code !== g.drawn) err('방금 뽑은 카드만 낼 수 있어요. 아니면 넘기세요.');
  const hand = g.hands[seat];
  const at = hand.indexOf(code);
  if (at < 0) err('그 카드가 손에 없어요.');
  const top = topOf(g);
  const defending = g.attack > 0;
  if (defending && !canDefend(code, top, g.suit)) err('공격 중이에요! 같은 숫자 공격이나 더 센 공격(같은 무늬), 조커로만 막을 수 있어요.');
  if (!defending && !canPlay(code, top, g.suit)) err('무늬나 숫자/문자가 같은 카드만 낼 수 있어요.');
  const seven = !isJoker(code) && code[1] === '7';
  if (seven && SUITS.indexOf(opts.suit) < 0) err('바꿀 무늬를 골라 주세요.');
  const evs = [];
  hand.splice(at, 1);
  g.discard.push(code);
  if (isJoker(code)) g.suit = null;
  else g.suit = seven ? opts.suit : code[0];
  g.unsafe = -1;
  g.drawn = null;
  g.phase = 'play';
  g.moves++;
  const pw = power(code);
  if (pw) g.attack += pw;
  evs.push({ type: 'play', seat, code, suit: g.suit, attack: g.attack, defend: defending, left: hand.length });
  if (!hand.length) {
    g.status[seat] = 'done';
    g.places.push(seat);
    evs.push({ type: 'finish', seat, place: g.places.length });
    if (checkEnd(g, evs)) return evs;
    passTurn(g, seat);
    if (g.attack) evs.push({ type: 'attack', to: g.turn, total: g.attack });
    return evs;
  }
  if (hand.length === 1) {
    if (opts.call) evs.push({ type: 'call', seat });
    else {
      g.unsafe = seat;
      g.catchTried = false;
    }
  }
  const r = code[1];
  if (pw) {
    passTurn(g, seat);
    evs.push({ type: 'attack', to: g.turn, total: g.attack });
  } else if (r === 'J' || (r === 'Q' && aliveCount(g) === 2)) {
    const nx = nextSeat(g, seat);
    if (r === 'Q') evs.push({ type: 'reverse', seat, dir: g.dir, asSkip: true });
    evs.push({ type: 'skip', seat: nx });
    passTurn(g, nx);
  } else if (r === 'Q') {
    g.dir = -g.dir;
    evs.push({ type: 'reverse', seat, dir: g.dir });
    passTurn(g, seat);
  } else if (r === 'K') {
    evs.push({ type: 'again', seat });
    g.turn = seat;
  } else passTurn(g, seat);
  return evs;
}

/** 뽑기: 공격 중이면 쌓인 만큼 받고 차례 끝. 아니면 1장, 낼 수 있으면 phase 'drawn' */
export function draw(g, seat) {
  checkTurn(g, seat);
  if (g.phase !== 'play') err('이미 뽑았어요. 내거나 넘기세요.');
  const evs = [];
  g.unsafe = -1;
  g.moves++;
  if (g.attack > 0) {
    const k = g.attack;
    g.attack = 0;
    const got = drawCards(g, seat, k, evs);
    evs.push({ type: 'take', seat, n: got.length, forced: k });
    if (checkBust(g, seat, evs) && checkEnd(g, evs)) return evs;
    passTurn(g, seat);
    return evs;
  }
  const got = drawCards(g, seat, 1, evs);
  evs.push({ type: 'draw', seat, n: got.length });
  if (checkBust(g, seat, evs)) {
    if (!checkEnd(g, evs)) passTurn(g, seat);
    return evs;
  }
  if (got.length && canPlay(got[0], topOf(g), g.suit)) {
    g.phase = 'drawn';
    g.drawn = got[0];
  } else {
    evs.push({ type: 'pass', seat });
    passTurn(g, seat);
  }
  return evs;
}

/** 뽑은 카드를 내지 않고 넘기기 */
export function pass(g, seat) {
  checkTurn(g, seat);
  if (g.phase !== 'drawn') err('먼저 카드를 내거나 뽑으세요.');
  g.phase = 'play';
  g.drawn = null;
  passTurn(g, seat);
  return [{ type: 'pass', seat }];
}

/** '원카드!' 외치기 */
export function callLast(g, seat) {
  if (g.phase === 'over') err('이미 끝난 판이에요.');
  if (g.unsafe === seat) {
    g.unsafe = -1;
    return [{ type: 'call', seat }];
  }
  if (g.hands[seat] && g.hands[seat].length <= 2) return [];
  err('카드가 한 장 남았을 때 외치는 거예요.');
}

/** 깜빡한 사람 지적하기 → 그 사람이 1장 */
export function catchLast(g, by) {
  if (g.phase === 'over') err('이미 끝난 판이에요.');
  const t = g.unsafe;
  if (t < 0) err('지적할 사람이 없어요.');
  if (t === by) err('나 자신은 지적할 수 없어요. 원카드!를 눌러요.');
  if (!alive(g, by)) err('끝난 사람은 지적할 수 없어요.');
  const evs = [];
  const got = drawCards(g, t, 1, evs);
  g.unsafe = -1;
  evs.push({ type: 'catch', by, target: t, n: got.length });
  if (checkBust(g, t, evs) && !checkEnd(g, evs) && g.turn === t) passTurn(g, t);
  return evs;
}

// ---------- 화면용 상태 ----------
export function publicView(g, seat) {
  const mine = seat >= 0 && g.hands[seat] ? g.hands[seat].slice() : [];
  const myTurn = seat === g.turn && g.phase !== 'over';
  let playable = [];
  if (myTurn) playable = g.phase === 'drawn' ? [g.drawn] : playableCodes(g, seat);
  return {
    hand: mine,
    counts: g.hands.map((h) => h.length),
    status: g.status.slice(),
    pile: g.discard.slice(-6),
    drawCount: g.draw.length,
    suit: g.suit,
    dir: g.dir,
    turn: g.turn,
    phase: g.phase,
    attack: g.attack,
    drawn: myTurn && g.phase === 'drawn' ? g.drawn : null,
    playable,
    unsafe: g.unsafe,
    places: g.places.slice(),
    ranking: g.ranking ? g.ranking.slice() : null,
    winner: g.winner,
    moves: g.moves,
    opts: Object.assign({}, g.opts),
  };
}

// ---------- 봇 ----------
function suitCounts(hand) {
  const n = { s: 0, h: 0, d: 0, c: 0 };
  hand.forEach((c) => !isJoker(c) && n[c[0]]++);
  return n;
}

/** 내 패에 가장 많은 무늬 */
export function botSuit(hand) {
  const n = suitCounts(hand);
  let best = SUITS[Math.floor(Math.random() * 4)];
  SUITS.forEach((s) => n[s] > n[best] && (best = s));
  return best;
}

function scoreCard(g, seat, code, difficulty) {
  const hand = g.hands[seat];
  const rest = hand.slice();
  rest.splice(rest.indexOf(code), 1);
  const cnt = suitCounts(rest);
  const nextN = g.hands[nextSeat(g, seat)].length;
  let minOpp = 99;
  g.hands.forEach((h, i) => i !== seat && alive(g, i) && (minOpp = Math.min(minOpp, h.length)));
  const danger = nextN <= 2 ? 2 : minOpp <= 3 ? 1 : 0;
  const pw = power(code);
  if (pw) {
    // 공격 카드: 상대가 적을 때 쓰고, 평소엔 방어용으로 아껴 둠
    if (isJoker(code)) return danger === 2 ? 60 + pw : rest.length === 0 ? 50 : -5;
    return danger === 2 ? 45 + pw : danger === 1 ? 18 + pw : rest.length <= 1 ? 20 : -2 + (difficulty === 'easy' ? 8 : 0);
  }
  let s = 10 + (code[1] === '7' ? 4 : cnt[code[0]] * 3);
  const r = code[1];
  if (r === 'K') s += rest.length ? 8 : -20; // 한 번 더 (마지막 장이면 그냥)
  else if (r === 'J') s += danger ? 12 : 2;
  else if (r === 'Q') s += g.n > 2 && danger === 1 && nextN > 2 ? -6 : danger ? 8 : 1;
  else if (r === '7') s -= difficulty === 'hard' ? 3 : 0; // 7은 무늬가 막혔을 때를 위해 조금 아낌
  else s += RANKS.indexOf(r) * 0.2;
  return s;
}

/** 봇의 한 수: { action:'play', code, suit, call } | { action:'draw' } | { action:'pass' } */
export function botChoose(g, seat, difficulty = 'normal') {
  const hand = g.hands[seat];
  const callP = CALL_P[difficulty] || CALL_P.normal;
  const mk = (code) => {
    const rest = hand.slice();
    rest.splice(rest.indexOf(code), 1);
    const seven = !isJoker(code) && code[1] === '7';
    return { action: 'play', code, suit: seven ? botSuit(rest) : null, call: hand.length === 2 && Math.random() < callP };
  };
  if (g.phase === 'drawn') {
    const c = g.drawn;
    if (isAttack(c) && difficulty === 'hard' && hand.length > 3 && g.hands[nextSeat(g, seat)].length > 3) return { action: 'pass' };
    return mk(c);
  }
  const opts = playableCodes(g, seat);
  if (!opts.length) return { action: 'draw' };
  if (g.attack > 0) {
    if (difficulty === 'easy' && Math.random() < 0.25) return { action: 'draw' };
    // 가장 약한 방어 카드로 막음 (조커는 마지막에)
    const sorted = opts.slice().sort((a, b) => power(a) + (isJoker(a) ? 10 : 0) - (power(b) + (isJoker(b) ? 10 : 0)));
    return mk(difficulty === 'easy' ? opts[Math.floor(Math.random() * opts.length)] : sorted[0]);
  }
  if (difficulty === 'easy' && Math.random() < 0.45) return mk(opts[Math.floor(Math.random() * opts.length)]);
  let best = opts[0];
  let bs = -1e9;
  opts.forEach((c) => {
    const s = scoreCard(g, seat, c, difficulty) + Math.random() * (difficulty === 'hard' ? 0.5 : 2);
    if (s > bs) {
      bs = s;
      best = c;
    }
  });
  return mk(best);
}

export function botStep(g, seat, difficulty) {
  const m = botChoose(g, seat, difficulty);
  if (m.action === 'draw') return draw(g, seat);
  if (m.action === 'pass') return pass(g, seat);
  return play(g, seat, m.code, { suit: m.suit, call: m.call });
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
  const deck = makeDeck();
  ok('카드는 54장 (조커 2)', deck.length === 54 && makeDeck(false).length === 52);
  ok('이름: ♠ 7, ♥ 10, 컬러 조커', cardName('s7') === '♠ 7' && cardName('hT') === '♥ 10' && cardName('XC') === '컬러 조커');
  ok('공격 세기', power('h2') === 2 && power('dA') === 3 && power('sA') === 5 && power('XB') === 5 && power('XC') === 7 && power('h7') === 0);
  ok('정렬: 무늬 → 숫자, 조커 끝', ['XC', 'h3', 'sK', 'sA', 'XB'].sort(compareCodes).join() === 'sA,sK,h3,XB,XC');
  ok('같은 무늬 / 같은 숫자면 냄', canPlay('s2', 's9', 's') && canPlay('h9', 's9', 's') && !canPlay('h2', 's9', 's'));
  ok('7 다음엔 고른 무늬', canPlay('d4', 's7', 'd') && !canPlay('s4', 's7', 'd') && canPlay('h7', 's7', 'd'));
  ok('조커는 언제나, 조커 다음엔 아무거나', canPlay('XB', 's9', 's') && canPlay('h4', 'XB', null));
  ok('방어: 같은 숫자 공격', canDefend('d2', 's2', 's') && canDefend('hA', 'sA', 's'));
  ok('방어: 같은 무늬 더 센 공격', canDefend('sA', 's2', 's') && !canDefend('hA', 's2', 's') && !canDefend('s2', 'sA', 's'));
  ok('방어: 조커', canDefend('XB', 'h2', 'h') && canDefend('XC', 'XB', null) && !canDefend('XB', 'XC', null) && !canDefend('sA', 'XB', null));
  ok('일반 카드로는 못 막음', !canDefend('s9', 's2', 's'));

  const g0 = newGame(4);
  ok('7장씩 나눔', g0.hands.every((h) => h.length === 7));
  ok('첫 카드는 일반 숫자', isPlain(topOf(g0)) && g0.suit === topOf(g0)[0]);
  ok('처음 카드 수 보존', totalCards(g0) === 54);
  const g5 = newGame(5, { hand: 5, jokers: false });
  ok('옵션: 5장, 조커 없음', g5.hands.every((h) => h.length === 5) && totalCards(g5) === 52);

  const fixed = (n, hands, top, rest, extra = {}) => {
    const g = newGame(n);
    g.hands = hands.map((h) => h.slice());
    g.discard = [top];
    g.suit = isJoker(top) ? null : top[0];
    g.draw = rest || ['s3', 's4', 's5', 's6', 'h3', 'h4', 'h5', 'h6', 'd3', 'd4', 'd5', 'd6', 'c3', 'c4', 'c5', 'c6', 'c8', 'c9', 'd8', 'd9', 'h8', 'h9', 's8', 's9', 'sT', 'hT', 'dT', 'cT'];
    g.turn = 0;
    g.dir = 1;
    Object.assign(g, extra);
    if (extra.opts) g.opts = normOpts(extra.opts);
    return g;
  };
  // 공격 쌓기·방어
  let g = fixed(3, [['s2', 'h5', 'h6'], ['d2', 'c9', 'c8'], ['h9', 'h8']], 's9');
  play(g, 0, 's2');
  ok('2: +2 공격, 다음 사람 차례', g.attack === 2 && g.turn === 1);
  ok('공격 중엔 일반 카드 못 냄', throws(() => play(g, 1, 'c9')));
  play(g, 1, 'd2');
  ok('같은 숫자로 막으면 쌓임 (+4)', g.attack === 4 && g.turn === 2);
  draw(g, 2);
  ok('못 막으면 쌓인 만큼 뽑고 끝', g.hands[2].length === 6 && g.attack === 0 && g.turn === 0);
  g = fixed(2, [['s2', 'h5'], ['sA', 'XC', 'c8']], 's9');
  play(g, 0, 's2');
  play(g, 1, 'sA');
  ok('♠A로 막기: +2 +5 = 7', g.attack === 7 && g.turn === 0);
  g = fixed(2, [['XB', 'h5'], ['XC', 'c8']], 's9');
  play(g, 0, 'XB');
  play(g, 1, 'XC');
  ok('조커 쌓기: +5 +7 = 12', g.attack === 12);
  // 7 무늬 바꾸기
  g = fixed(2, [['s7', 'h5', 'h6'], ['d3', 'c8']], 's9');
  ok('7은 무늬를 골라야 함', throws(() => play(g, 0, 's7')));
  play(g, 0, 's7', { suit: 'd' });
  ok('7: 무늬가 다이아로', g.suit === 'd' && g.turn === 1 && canPlay('d3', 's7', g.suit));
  // J / Q / K
  g = fixed(3, [['sJ', 'h5'], ['c8'], ['h9']], 's9');
  play(g, 0, 'sJ');
  ok('J: 다음 사람 건너뜀', g.turn === 2);
  g = fixed(3, [['sQ', 'h5'], ['c8'], ['h9']], 's9');
  play(g, 0, 'sQ');
  ok('Q: 방향 바꾸기', g.turn === 2 && g.dir === -1);
  g = fixed(2, [['sQ', 'h5', 'h6'], ['c8']], 's9');
  play(g, 0, 'sQ');
  ok('2명이면 Q = 건너뛰기', g.turn === 0);
  g = fixed(3, [['sK', 's5', 'h6'], ['c8'], ['h9']], 's9');
  const ek = play(g, 0, 'sK');
  ok('K: 한 번 더', g.turn === 0 && ek.some((e) => e.type === 'again'));
  // 원카드 / 지적
  g = fixed(3, [['s3', 'h5'], ['c8', 'c9', 'cT'], ['h9', 'h8']], 's9');
  play(g, 0, 's3');
  ok('안 외치면 지적 대상', g.unsafe === 0);
  catchLast(g, 2);
  ok('지적당하면 1장 벌칙', g.hands[0].length === 2 && g.unsafe === -1);
  g = fixed(3, [['s3', 'h5'], ['c8', 'c9', 'cT'], ['h9', 'h8']], 's9');
  play(g, 0, 's3', { call: true });
  ok('같이 외치면 안전', g.unsafe === -1);
  g = fixed(3, [['s3', 'h5'], ['c8', 'c9', 'cT'], ['h9', 'h8']], 's9');
  play(g, 0, 's3');
  callLast(g, 0);
  ok('내고 나서 외쳐도 안전', g.unsafe === -1 && throws(() => catchLast(g, 1)));
  // 뽑기
  g = fixed(2, [['h3'], ['c8']], 's9', ['s4', 'h4']);
  draw(g, 0);
  ok('뽑은 카드를 낼 수 있으면 고르기', g.phase === 'drawn' && g.drawn === 's4' && g.turn === 0);
  ok('뽑은 뒤엔 그 카드만', throws(() => play(g, 0, 'h3')));
  pass(g, 0);
  ok('넘기면 다음 사람', g.turn === 1 && g.phase === 'play');
  // 재활용
  g = fixed(2, [['h3', 'h4'], ['c8']], 's9', []);
  g.discard = ['d3', 'd4', 'd5', 's9'];
  draw(g, 0);
  ok('더미가 없으면 버린 더미를 섞어 씀', g.discard.length === 1 && g.discard[0] === 's9' && g.draw.length === 2);
  // 파산
  g = fixed(3, [['XC', 'h5'], Array(14).fill('c8'), ['h9', 'h8']], 's9', null, { opts: { bust: 15 } });
  play(g, 0, 'XC');
  const eb = draw(g, 1);
  ok('파산: 15장 넘으면 탈락, 카드는 더미로', g.status[1] === 'bust' && g.hands[1].length === 0 && eb.some((e) => e.type === 'bust') && g.turn === 2);
  // 1등 / 순위
  g = fixed(3, [['s3'], ['c8', 'c9'], ['h9', 'h8', 'h7']], 's9');
  play(g, 0, 's3');
  ok('다 내면 1등, 끝까지 모드는 계속', g.status[0] === 'done' && g.places[0] === 0 && g.phase === 'play' && g.turn === 1);
  g = fixed(3, [['s3'], ['c8', 'c9'], ['h9', 'h8', 'h7']], 's9', null, { opts: { mode: 'first' } });
  play(g, 0, 's3');
  ok('1등만 모드: 바로 끝', g.phase === 'over' && g.winner === 0 && g.ranking.join() === '0,1,2');
  g = fixed(2, [['s3'], ['c8', 'c9']], 's9');
  play(g, 0, 's3');
  ok('2명: 한 명 다 내면 끝', g.phase === 'over' && g.ranking.join() === '0,1');
  g = fixed(3, [['s2'], ['c8', 'c9'], ['h9', 'h8', 'h7']], 's9');
  play(g, 0, 's2');
  ok('공격으로 끝내도 공격은 다음 사람에게', g.attack === 2 && g.turn === 1);
  // 봇
  g = fixed(3, [['h2', 'h5', 'h6', 'c3'], ['h4'], ['c4', 'c5', 'c6']], 'h9');
  ok('다음 사람이 1장이면 공격', botChoose(g, 0, 'hard').code === 'h2');
  g = fixed(3, [['h2', 'h5', 'h6', 'c3'], ['h4', 'h3', 's3', 'd3', 'c3'], ['c4', 'c5', 'c6', 'd6', 'd5']], 'h9');
  ok('평소엔 공격 카드 아낌', botChoose(g, 0, 'hard').code !== 'h2');
  ok('7은 많은 무늬로', botSuit(['d1', 'd2', 'c3', 'XB']) === 'd');

  // 무작위 2,000판 봇끼리
  let bad = 0;
  let unfinished = 0;
  let firstErr = '';
  let busts = 0;
  for (let k = 0; k < 2000; k++) {
    const n = 2 + (k % 4);
    const opts = { hand: HAND_CHOICES[k % 3], bust: BUST_CHOICES[(k >> 2) % 3], jokers: k % 2 === 0, mode: k % 5 === 0 ? 'first' : 'all' };
    const t = newGame(n, opts);
    const size = t.deckSize;
    const diffs = ['easy', 'normal', 'hard'];
    let guard = 0;
    try {
      while (t.phase !== 'over' && guard++ < 5000) {
        if (t.unsafe >= 0 && Math.random() < 0.3) {
          if (Math.random() < 0.5) callLast(t, t.unsafe);
          else {
            const by = nextSeat(t, t.unsafe);
            if (by !== t.unsafe) catchLast(t, by);
          }
          if (t.phase === 'over') break;
        }
        if (!alive(t, t.turn)) bad++;
        botStep(t, t.turn, diffs[(t.turn + k) % 3]);
        if (totalCards(t) !== size) bad++;
      }
      if (t.phase !== 'over') unfinished++;
      else {
        if (t.ranking.length !== n || new Set(t.ranking).size !== n) bad++;
        if (t.status[t.winner] === 'done' && t.hands[t.winner].length) bad++;
      }
      busts += t.busted.length;
    } catch (e) {
      bad++;
      firstErr = firstErr || e.message;
    }
  }
  ok('봇끼리 무작위 2,000판 오류 0 · 카드 보존' + (firstErr ? ' (' + firstErr + ')' : ''), bad === 0);
  ok('2,000판 모두 끝까지 감 (미완 ' + unfinished + ', 파산 ' + busts + '번)', unfinished === 0);
  const passed = results.filter((r) => r.pass).length;
  return { passed, total: results.length, results };
}

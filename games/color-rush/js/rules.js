// 컬러 러시 — 규칙 엔진 + 봇 (브라우저와 앱스크립트 서버가 같이 씀)
// 카드 코드: 색 1글자 + 값 1글자
//   색: c 분필(민트) · p 형광(핑크) · o 크레용(주황) · v 잉크(보라) · w 무지개(색 바꾸기 계열)
//   값: 0~9 숫자, S 건너뛰기, R 방향 바꾸기, D +2, W 색 바꾸기, F +4
// 규칙: 맨 위 카드와 색 또는 숫자/기호가 같으면 냄. 색 바꾸기·+4는 언제나.
//       낼 게 없으면 1장 뽑고, 뽑은 카드를 낼 수 있으면 내거나 넘김.
//       +2/+4를 받으면 그만큼 뽑고 차례를 넘김 (쌓기 없음). 2인이면 방향 바꾸기 = 건너뛰기.
//       한 장이 남으면 '마지막!'을 외쳐야 함. 안 외친 채로 남에게 지적당하면 2장 벌칙.
//       손패를 다 내면 승리.

export const COLORS = ['c', 'p', 'o', 'v'];
export const COLOR_NAME = { c: '분필', p: '형광', o: '크레용', v: '잉크', w: '무지개' };
export const COLOR_HEX = { c: '#3ad6b4', p: '#ff5ca8', o: '#ff9a2e', v: '#9b7bff', w: '#ffffff' };
export const COLOR_ICON = { c: '▲', p: '★', o: '◆', v: '💧' };
export const VALUE_NAME = { S: '건너뛰기', R: '방향 바꾸기', D: '+2', W: '색 바꾸기', F: '+4' };
export const VALUE_ORDER = '0123456789SRDWF';
export const HAND_SIZE = 7;
export const DECK_SIZE = 108; // 4색 × (0 1장 + 1~9 2장씩 + 기능 3종 2장씩) = 100, 색 바꾸기 4 + +4 4
export const MAX_PLAYERS = 6;
export const CALL_P = { easy: 0.55, normal: 0.82, hard: 0.96 }; // 봇이 '마지막!'을 잊지 않을 확률
export const CATCH_P = { easy: 0.5, normal: 0.85, hard: 1 }; // 봇이 깜빡한 사람을 지적할 확률

export function makeDeck() {
  const d = [];
  COLORS.forEach((c) => {
    d.push(c + '0');
    for (let k = 0; k < 2; k++) {
      for (let v = 1; v <= 9; v++) d.push(c + v);
      d.push(c + 'S', c + 'R', c + 'D');
    }
  });
  for (let k = 0; k < 4; k++) d.push('wW', 'wF');
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

export const isWild = (code) => code[0] === 'w';
export const isNumber = (code) => code[1] >= '0' && code[1] <= '9';
export const isAction = (code) => !isWild(code) && !isNumber(code);

/** 로그용 한국어 이름: '분필 7', '형광 건너뛰기', '+4' */
export function cardName(code) {
  if (!code) return '';
  if (code === 'wW') return '색 바꾸기';
  if (code === 'wF') return '+4';
  return COLOR_NAME[code[0]] + ' ' + (isNumber(code) ? code[1] : VALUE_NAME[code[1]]);
}

/** 패 정렬: 색 → 숫자/기호 */
export function compareCodes(a, b) {
  const ca = 'cpovw'.indexOf(a[0]);
  const cb = 'cpovw'.indexOf(b[0]);
  if (ca !== cb) return ca - cb;
  return VALUE_ORDER.indexOf(a[1]) - VALUE_ORDER.indexOf(b[1]);
}

/** 맨 위 카드(top)와 지금 색(color)에 code를 낼 수 있나 */
export function canPlay(code, top, color) {
  if (isWild(code)) return true;
  if (!top) return true;
  return code[0] === color || code[1] === top[1];
}

export function playableCodes(hand, top, color) {
  const out = [];
  hand.forEach((c) => canPlay(c, top, color) && out.indexOf(c) < 0 && out.push(c));
  return out;
}

export function topOf(g) {
  return g.discard[g.discard.length - 1];
}

export function nextSeat(g, from, steps = 1) {
  return (((from + g.dir * steps) % g.n) + g.n) % g.n;
}

export function totalCards(g) {
  return g.draw.length + g.discard.length + g.hands.reduce((s, h) => s + h.length, 0);
}

export function newGame(n, deck) {
  if (n < 2 || n > MAX_PLAYERS) throw new Error('2~6명이 할 수 있어요.');
  const draw = deck ? deck.slice() : shuffle(makeDeck());
  const g = { n, hands: [], draw, discard: [], color: 'c', dir: 1, turn: 0, phase: 'play', drawn: null, unsafe: -1, catchTried: false, winner: -1, moves: 0 };
  for (let i = 0; i < n; i++) g.hands.push(g.draw.splice(0, HAND_SIZE));
  // 첫 버린 카드는 숫자 카드가 나올 때까지 (기능 카드는 더미 맨 아래로)
  let guard = 0;
  while (!isNumber(g.draw[0]) && guard++ < DECK_SIZE) g.draw.push(g.draw.shift());
  const first = g.draw.shift();
  g.discard.push(first);
  g.color = first[0];
  g.turn = Math.floor(Math.random() * n);
  return g;
}

function err(msg) {
  throw new Error(msg);
}

/** k장 뽑기 (더미가 떨어지면 버린 더미를 섞어 재활용). 뽑은 카드 목록을 돌려줌 */
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

function checkTurn(g, seat) {
  if (g.phase === 'over') err('이미 끝난 판이에요.');
  if (seat !== g.turn) err('내 차례가 아니에요.');
}

/** 카드 내기. opts: { color: 색 바꾸기/+4일 때 고른 색, call: 한 장 남을 때 '마지막!'을 같이 외침 } */
export function play(g, seat, code, opts = {}) {
  checkTurn(g, seat);
  code = String(code || '');
  if (g.phase === 'drawn' && code !== g.drawn) err('방금 뽑은 카드만 낼 수 있어요. 아니면 넘기세요.');
  const hand = g.hands[seat];
  const at = hand.indexOf(code);
  if (at < 0) err('그 카드가 손에 없어요.');
  if (!canPlay(code, topOf(g), g.color)) err('색이나 숫자/기호가 같은 카드만 낼 수 있어요.');
  const wild = isWild(code);
  if (wild && COLORS.indexOf(opts.color) < 0) err('바꿀 색을 골라 주세요.');
  const evs = [];
  hand.splice(at, 1);
  g.discard.push(code);
  g.color = wild ? opts.color : code[0];
  g.unsafe = -1; // 앞사람의 '지적' 기회는 여기서 끝
  g.drawn = null;
  g.phase = 'play';
  g.moves++;
  evs.push({ type: 'play', seat, code, color: g.color, left: hand.length });
  if (!hand.length) {
    g.winner = seat;
    g.phase = 'over';
    evs.push({ type: 'end', winner: seat });
    return evs;
  }
  if (hand.length === 1) {
    if (opts.call) evs.push({ type: 'call', seat });
    else {
      g.unsafe = seat;
      g.catchTried = false;
    }
  }
  const v = code[1];
  const nx = nextSeat(g, seat);
  if (v === 'S' || (v === 'R' && g.n === 2)) {
    if (v === 'R') evs.push({ type: 'reverse', seat, dir: g.dir, asSkip: true });
    evs.push({ type: 'skip', seat: nx });
    g.turn = nextSeat(g, nx);
  } else if (v === 'R') {
    g.dir = -g.dir;
    evs.push({ type: 'reverse', seat, dir: g.dir });
    g.turn = nextSeat(g, seat);
  } else if (v === 'D' || v === 'F') {
    const k = v === 'D' ? 2 : 4;
    const got = drawCards(g, nx, k, evs);
    evs.push({ type: 'draw', seat: nx, n: got.length, forced: k });
    evs.push({ type: 'skip', seat: nx });
    g.turn = nextSeat(g, nx);
  } else g.turn = nx;
  return evs;
}

/** 1장 뽑기. 뽑은 카드를 낼 수 있으면 phase 'drawn' (내거나 넘기기), 아니면 차례 넘어감 */
export function draw(g, seat) {
  checkTurn(g, seat);
  if (g.phase !== 'play') err('이미 뽑았어요. 내거나 넘기세요.');
  const evs = [];
  g.unsafe = -1;
  g.moves++;
  const got = drawCards(g, seat, 1, evs);
  evs.push({ type: 'draw', seat, n: got.length });
  if (got.length && canPlay(got[0], topOf(g), g.color)) {
    g.phase = 'drawn';
    g.drawn = got[0];
  } else {
    evs.push({ type: 'pass', seat });
    g.turn = nextSeat(g, seat);
  }
  return evs;
}

/** 뽑은 카드를 내지 않고 넘기기 */
export function pass(g, seat) {
  checkTurn(g, seat);
  if (g.phase !== 'drawn') err('먼저 카드를 내거나 뽑으세요.');
  g.phase = 'play';
  g.drawn = null;
  g.turn = nextSeat(g, seat);
  return [{ type: 'pass', seat }];
}

/** '마지막!' 외치기 (내고 나서 다음 사람이 움직이기 전까지) */
export function callLast(g, seat) {
  if (g.phase === 'over') err('이미 끝난 판이에요.');
  if (g.unsafe === seat) {
    g.unsafe = -1;
    return [{ type: 'call', seat }];
  }
  if (g.hands[seat] && g.hands[seat].length <= 2) return []; // 이미 안전하거나 미리 누름: 그냥 넘어감
  err('카드가 한 장 남았을 때 외치는 거예요.');
}

/** 깜빡한 사람 지적하기 → 그 사람이 2장 */
export function catchLast(g, by) {
  if (g.phase === 'over') err('이미 끝난 판이에요.');
  const t = g.unsafe;
  if (t < 0) err('지적할 사람이 없어요.');
  if (t === by) err('나 자신은 지적할 수 없어요. 마지막!을 눌러요.');
  const evs = [];
  const got = drawCards(g, t, 2, evs);
  g.unsafe = -1;
  evs.push({ type: 'catch', by, target: t, n: got.length });
  return evs;
}

// ---------- 화면용 상태 (서버 view와 튜토리얼이 같이 씀) ----------
/** seat 자리 사람에게 보여 줄 상태: 내 패만, 남은 장수만 (seat -1: 관전) */
export function publicView(g, seat) {
  const mine = seat >= 0 && g.hands[seat] ? g.hands[seat].slice() : [];
  const myTurn = seat === g.turn && g.phase !== 'over';
  let playable = [];
  if (myTurn) playable = g.phase === 'drawn' ? [g.drawn] : playableCodes(mine, topOf(g), g.color);
  return {
    hand: mine,
    counts: g.hands.map((h) => h.length),
    pile: g.discard.slice(-6),
    discardCount: g.discard.length,
    drawCount: g.draw.length,
    color: g.color,
    dir: g.dir,
    turn: g.turn,
    phase: g.phase,
    drawn: myTurn && g.phase === 'drawn' ? g.drawn : null,
    playable,
    unsafe: g.unsafe,
    winner: g.winner,
    moves: g.moves,
  };
}

// ---------- 봇 ----------
function colorCounts(hand) {
  const n = { c: 0, p: 0, o: 0, v: 0 };
  hand.forEach((c) => !isWild(c) && n[c[0]]++);
  return n;
}

/** 내 패에 가장 많은 색 */
export function botColor(hand) {
  const n = colorCounts(hand);
  let best = COLORS[Math.floor(Math.random() * 4)];
  COLORS.forEach((c) => n[c] > n[best] && (best = c));
  return best;
}

function scoreCard(g, seat, code, difficulty) {
  const hand = g.hands[seat];
  const rest = hand.slice();
  rest.splice(rest.indexOf(code), 1);
  const cnt = colorCounts(rest);
  const nextN = g.hands[nextSeat(g, seat)].length;
  let minOpp = 99;
  g.hands.forEach((h, i) => i !== seat && (minOpp = Math.min(minOpp, h.length)));
  const danger = nextN <= 2 ? 2 : minOpp <= 2 ? 1 : 0;
  if (isWild(code)) {
    if (code === 'wF') return danger === 2 ? 70 : danger ? 12 : 2;
    return danger ? 6 : 1; // 색 바꾸기는 아껴 둠
  }
  let s = 10 + cnt[code[0]] * 3; // 같은 색이 많이 남는 쪽
  if (isNumber(code)) s += Number(code[1]) * 0.3;
  else {
    s += danger === 2 ? 35 : danger === 1 ? 14 : -4;
    if (difficulty === 'hard' && danger === 2 && code[1] === 'D') s += 6;
    if (code[1] === 'R' && g.n > 2 && danger === 1 && nextN > 2) s -= 10; // 방향을 바꾸면 위험한 사람에게 차례가 감
  }
  return s;
}

/** 봇의 한 수: { action:'play', code, color, call } | { action:'draw' } | { action:'pass' } */
export function botChoose(g, seat, difficulty = 'normal') {
  const hand = g.hands[seat];
  const callP = CALL_P[difficulty] || CALL_P.normal;
  const mk = (code) => {
    const rest = hand.slice();
    rest.splice(rest.indexOf(code), 1);
    return { action: 'play', code, color: isWild(code) ? botColor(rest) : null, call: hand.length === 2 && Math.random() < callP };
  };
  if (g.phase === 'drawn') return mk(g.drawn);
  const opts = playableCodes(hand, topOf(g), g.color);
  if (!opts.length) return { action: 'draw' };
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

/** 봇의 한 수를 바로 적용 (이벤트 목록 반환) */
export function botStep(g, seat, difficulty) {
  const m = botChoose(g, seat, difficulty);
  if (m.action === 'draw') return draw(g, seat);
  if (m.action === 'pass') return pass(g, seat);
  return play(g, seat, m.code, { color: m.color, call: m.call });
}

// ---------- 자가 테스트 ----------
export function runSelfTests() {
  const results = [];
  const ok = (name, pass) => results.push({ name, pass: !!pass });
  const deck = makeDeck();
  ok('카드는 모두 108장', deck.length === DECK_SIZE);
  ok('숫자 0은 색마다 1장', COLORS.every((c) => deck.filter((x) => x === c + '0').length === 1));
  ok('숫자 7은 색마다 2장', COLORS.every((c) => deck.filter((x) => x === c + '7').length === 2));
  ok('+2는 색마다 2장', COLORS.every((c) => deck.filter((x) => x === c + 'D').length === 2));
  ok('색 바꾸기 4장, +4 4장', deck.filter((x) => x === 'wW').length === 4 && deck.filter((x) => x === 'wF').length === 4);
  ok('이름: 분필 7', cardName('c7') === '분필 7' && cardName('pS') === '형광 건너뛰기' && cardName('wF') === '+4');
  ok('정렬: 색 → 숫자', ['wW', 'p3', 'c9', 'cS', 'c1'].sort(compareCodes).join() === 'c1,c9,cS,p3,wW');
  ok('같은 색이면 냄', canPlay('c2', 'c9', 'c'));
  ok('같은 숫자면 냄', canPlay('p9', 'c9', 'c'));
  ok('같은 기호면 냄', canPlay('pS', 'cS', 'c'));
  ok('다르면 못 냄', !canPlay('p2', 'c9', 'c'));
  ok('색 바꾸기 뒤에는 고른 색', canPlay('o4', 'wW', 'o') && !canPlay('c4', 'wW', 'o'));
  ok('색 바꾸기는 언제나', canPlay('wF', 'c9', 'c'));

  // 처음 판
  const g0 = newGame(4);
  ok('7장씩 나눔', g0.hands.every((h) => h.length === HAND_SIZE));
  ok('첫 버린 카드는 숫자', isNumber(topOf(g0)) && g0.color === topOf(g0)[0]);
  ok('처음 카드 수 보존', totalCards(g0) === DECK_SIZE);

  // 꾸민 판으로 기능 카드 확인
  const fixed = (n, hands, top, rest) => {
    const g = newGame(n);
    g.hands = hands.map((h) => h.slice());
    g.discard = [top];
    g.color = top[0];
    g.draw = rest || makeDeck().slice(0, 30);
    g.turn = 0;
    g.dir = 1;
    return g;
  };
  let g = fixed(3, [['cS', 'c1', 'c2'], ['p1', 'p2'], ['o1', 'o2']], 'c5');
  play(g, 0, 'cS');
  ok('건너뛰기: 1번 건너 2번 차례', g.turn === 2);
  g = fixed(3, [['cR', 'c1', 'c2'], ['p1'], ['o1']], 'c5');
  play(g, 0, 'cR');
  ok('3인 방향 바꾸기: 거꾸로 2번 차례', g.turn === 2 && g.dir === -1);
  g = fixed(2, [['cR', 'c1', 'c2'], ['p1']], 'c5');
  play(g, 0, 'cR');
  ok('2인 방향 바꾸기 = 건너뛰기', g.turn === 0);
  g = fixed(3, [['cD', 'c1', 'c2'], ['p1'], ['o1']], 'c5');
  play(g, 0, 'cD');
  ok('+2: 다음 사람 2장 뽑고 건너뜀', g.hands[1].length === 3 && g.turn === 2);
  g = fixed(3, [['wF', 'c1', 'c2'], ['p1'], ['o1']], 'c5');
  let threw = false;
  try {
    play(g, 0, 'wF');
  } catch (e) {
    threw = true;
  }
  ok('+4는 색을 골라야 함', threw);
  play(g, 0, 'wF', { color: 'v' });
  ok('+4: 4장 뽑고 건너뜀, 색은 잉크', g.hands[1].length === 5 && g.turn === 2 && g.color === 'v');
  threw = false;
  try {
    play(g, 1, 'p1');
  } catch (e) {
    threw = true;
  }
  ok('남의 차례에는 못 냄', threw);
  // 마지막! / 지적
  g = fixed(3, [['c1', 'c2'], ['p1', 'p3', 'p5'], ['o1', 'o2']], 'c5');
  play(g, 0, 'c1');
  ok('안 외치면 지적 대상', g.unsafe === 0);
  catchLast(g, 2);
  ok('지적당하면 2장', g.hands[0].length === 3 && g.unsafe === -1);
  g = fixed(3, [['c1', 'c2'], ['p1', 'p3', 'p5'], ['o1', 'o2']], 'c5');
  play(g, 0, 'c1', { call: true });
  ok('같이 외치면 안전', g.unsafe === -1);
  g = fixed(3, [['c1', 'c2'], ['p1', 'p3', 'p5'], ['o1', 'o2']], 'c5');
  play(g, 0, 'c1');
  callLast(g, 0);
  ok('내고 나서 외쳐도 안전', g.unsafe === -1);
  g = fixed(3, [['c1', 'c2'], ['p1', 'p3', 'p5'], ['o1', 'o2']], 'c5');
  play(g, 0, 'c1');
  draw(g, 1);
  ok('다음 사람이 움직이면 지적 기회 끝', g.unsafe === -1);
  // 뽑기: 낼 수 있으면 'drawn'
  g = fixed(2, [['p1'], ['o1']], 'c5', ['c7', 'p2', 'p3']);
  draw(g, 0);
  ok('뽑은 카드를 낼 수 있으면 고르기', g.phase === 'drawn' && g.drawn === 'c7' && g.turn === 0);
  threw = false;
  try {
    play(g, 0, 'p1');
  } catch (e) {
    threw = true;
  }
  ok('뽑은 뒤엔 그 카드만', threw);
  pass(g, 0);
  ok('넘기면 다음 사람', g.turn === 1 && g.phase === 'play');
  g = fixed(2, [['p1'], ['o1']], 'c5', ['o2', 'p2', 'p3']);
  draw(g, 0);
  ok('낼 수 없으면 바로 넘어감', g.turn === 1);
  // 재활용
  g = fixed(2, [['p1', 'p2'], ['o1', 'o2']], 'c5', []);
  g.discard = ['c1', 'c2', 'c3', 'c5'];
  draw(g, 0);
  ok('더미가 없으면 버린 더미를 섞어 씀', g.discard.length === 1 && g.discard[0] === 'c5' && g.hands[0].length === 3 && g.draw.length === 2);
  // 승리
  g = fixed(2, [['c1'], ['o1']], 'c5');
  const evs = play(g, 0, 'c1');
  ok('손패를 다 내면 승리', g.winner === 0 && g.phase === 'over' && evs.some((e) => e.type === 'end'));
  // 봇 선택
  g = fixed(3, [['wF', 'c1', 'c2', 'c3'], ['p1'], ['o1', 'o2', 'o3']], 'c5');
  ok('다음 사람이 1장이면 +4를 씀', botChoose(g, 0, 'hard').code === 'wF');
  g = fixed(3, [['c1', 'pS', 'p7', 'p8', 'p9'], ['p1', 'p2', 'p3', 'p4'], ['o1', 'o2', 'o3']], 'c5');
  g.discard = ['p1'];
  g.color = 'p';
  ok('평소엔 같은 색 많은 쪽 숫자', ['p7', 'p8', 'p9'].indexOf(botChoose(g, 0, 'hard').code) >= 0);
  ok('색은 내 패에 많은 색', botColor(['o1', 'o2', 'c1', 'wW']) === 'o');

  // 무작위 2,000판 봇끼리
  let bad = 0;
  let unfinished = 0;
  let firstErr = '';
  for (let k = 0; k < 2000; k++) {
    const n = 2 + (k % 5);
    const t = newGame(n);
    const diffs = ['easy', 'normal', 'hard'];
    let guard = 0;
    try {
      while (t.phase !== 'over' && guard++ < 4000) {
        // 가끔 지적 / 외치기
        if (t.unsafe >= 0 && Math.random() < 0.3) {
          if (Math.random() < 0.5) callLast(t, t.unsafe);
          else catchLast(t, (t.unsafe + 1) % n);
        }
        const before = totalCards(t);
        botStep(t, t.turn, diffs[(t.turn + k) % 3]);
        if (totalCards(t) !== before || totalCards(t) !== DECK_SIZE) bad++;
        if (t.turn < 0 || t.turn >= n) bad++;
      }
      if (t.phase !== 'over') unfinished++;
      else if (t.hands[t.winner].length !== 0) bad++;
    } catch (e) {
      bad++;
      firstErr = firstErr || e.message;
    }
  }
  ok('봇끼리 무작위 2,000판 오류 0 · 카드 보존' + (firstErr ? ' (' + firstErr + ')' : ''), bad === 0);
  ok('2,000판 모두 끝까지 감 (미완 ' + unfinished + ')', unfinished === 0);
  const passed = results.filter((r) => r.pass).length;
  return { passed, total: results.length, results };
}

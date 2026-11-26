// 심해 보물섬 탐험대 — 규칙 엔진 (순수 함수). 서버(앱스크립트)와 튜토리얼이 같이 씀
// 카드는 데이터: { id, type }. 모든 카드는 언제나 '누군가의 손' 또는 '공개된 카드' 중 정확히 한 곳에만 있음

export const CARD = { EMPTY: 'empty', TREASURE: 'treasure', MONSTER: 'monster' };
export const ROLE = { CREW: 'crew', PIRATE: 'pirate' };
export const MAX_ROUNDS = 4;
export const CARDS_PER_PLAYER = 5;
export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 6;

export const CARD_NAME = { empty: '빈 방', treasure: '보물', monster: '심해 대왕문어' };
export const ROLE_NAME = { crew: '탐험대', pirate: '해적' };

/** 인원별 역할 카드: 4명은 5장 중 4장을 나누고 1장은 아무도 모르게 빠짐 */
export function roleCards(n) {
  if (n === 4) return { crew: 3, pirate: 2 };
  if (n === 5) return { crew: 3, pirate: 2 };
  if (n === 6) return { crew: 4, pirate: 2 };
  throw new Error('인원은 4~6명이에요.');
}

export function shuffleArr(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 방 카드: 인원 × 5장 = 보물(인원 수) + 대왕문어 1 + 나머지 빈 방 */
export function makeRoomCards(n) {
  const cards = [];
  for (let i = 0; i < n; i++) cards.push(CARD.TREASURE);
  cards.push(CARD.MONSTER);
  while (cards.length < n * CARDS_PER_PLAYER) cards.push(CARD.EMPTY);
  return cards.map((type, i) => ({ id: 'c' + i, type }));
}

/** 라운드별 한 사람당 카드 수: 5 → 4 → 3 → 2 */
export function handSizeFor(round) {
  return CARDS_PER_PLAYER + 1 - round;
}

export function summarize(hand) {
  const s = { treasure: 0, monster: 0, empty: 0, total: hand.length };
  for (const c of hand) s[c.type]++;
  return s;
}

function dealCards(cards, n, rnd) {
  const deck = shuffleArr(cards, rnd);
  const per = deck.length / n;
  return Array.from({ length: n }, (_, i) => deck.slice(i * per, (i + 1) * per));
}

/** 새 게임 상태 */
export function newGame(n, rnd = Math.random) {
  const rc = roleCards(n);
  const pool = shuffleArr([...Array(rc.crew).fill(ROLE.CREW), ...Array(rc.pirate).fill(ROLE.PIRATE)], rnd);
  return {
    n,
    round: 1,
    roles: pool.slice(0, n),
    hiddenRole: pool[n] || null,
    hands: dealCards(makeRoomCards(n), n, rnd),
    revealed: [], // { round, by, target, card }
    found: 0,
    keyHolder: Math.floor(rnd() * n),
    flipsThisRound: 0,
    winner: null,
    reason: null,
  };
}

/**
 * 열쇠를 가진 사람(by)이 target의 index번째 카드를 뒤집음.
 * 반환: { card, index, roundEnded, winner } — 잘못된 요청이면 Error
 */
export function flip(g, by, target, index, rnd = Math.random) {
  if (g.winner) throw new Error('이미 게임이 끝났어요.');
  if (by !== g.keyHolder) throw new Error('열쇠를 가진 사람만 뒤집을 수 있어요.');
  if (target === by) throw new Error('자기 카드는 뒤집을 수 없어요.');
  const hand = g.hands[target];
  if (!hand) throw new Error('그런 사람이 없어요.');
  if (!hand.length) throw new Error('그 사람은 남은 카드가 없어요.');
  const i = Number.isInteger(index) && index >= 0 && index < hand.length ? index : Math.floor(rnd() * hand.length);
  const card = hand.splice(i, 1)[0];
  g.revealed.push({ round: g.round, by, target, card });
  g.flipsThisRound++;
  g.keyHolder = target;
  if (card.type === CARD.TREASURE) g.found++;

  let roundEnded = false;
  if (card.type === CARD.MONSTER) {
    g.winner = ROLE.PIRATE;
    g.reason = 'monster';
  } else if (g.found >= g.n) {
    g.winner = ROLE.CREW;
    g.reason = 'treasure';
  } else if (g.flipsThisRound >= g.n) {
    roundEnded = true;
    if (g.round >= MAX_ROUNDS) {
      g.winner = ROLE.PIRATE;
      g.reason = 'time';
    } else {
      g.round++;
      g.flipsThisRound = 0;
      g.hands = dealCards(g.hands.flat(), g.n, rnd);
    }
  }
  return { card, index: i, roundEnded, winner: g.winner };
}

export function winText(winner, reason) {
  if (winner === ROLE.CREW) return '탐험대 승리! 보물을 모두 찾았어요';
  if (reason === 'monster') return '해적 승리! 심해 대왕문어가 깨어났어요';
  return '해적 승리! 4라운드 안에 보물을 다 찾지 못했어요';
}

// ---------- 빠른 말풍선 (고정 문구만) ----------
export const SAYINGS = {
  t0: '보물 0장 있어',
  t1: '보물 1장 있어',
  t2: '보물 2장 있어',
  t3: '보물 3장 있어',
  m1: '문어 있어!',
  m0: '문어 없어',
  sus: '너 수상해',
  trust: '믿어 줘',
  pass: '패스',
};

/** 말풍선을 '주장'으로 바꿈: { treasure?, monster? } */
export function claimOf(msg) {
  if (/^t[0-3]$/.test(msg)) return { treasure: Number(msg[1]) };
  if (msg === 'm1') return { monster: true };
  if (msg === 'm0') return { monster: false };
  return null;
}

// ---------- 자가 테스트 (?test) ----------
export function runSelfTests(log = true) {
  const results = [];
  const check = (name, cond) => results.push({ name, pass: !!cond });
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  check('역할 수: 4명 3/2(1장 빠짐), 5명 3/2, 6명 4/2', ['4:3:2', '5:3:2', '6:4:2'].every((s) => {
    const [n, c, p] = s.split(':').map(Number);
    const r = roleCards(n);
    return r.crew === c && r.pirate === p;
  }));
  for (const n of [4, 5, 6]) {
    const g = newGame(n, rnd);
    const all = g.hands.flat();
    const s = summarize(all);
    check(`${n}명 카드 구성: 총 ${n * 5}장, 보물 ${n}, 문어 1`, all.length === n * 5 && s.treasure === n && s.monster === 1 && s.empty === n * 4 - 1);
    check(`${n}명 역할 배정 수`, g.roles.length === n && g.roles.filter((r) => r === 'pirate').length <= 2 && (n === 4 ? !!g.hiddenRole : !g.hiddenRole));
    check(`${n}명 1라운드 한 사람당 5장`, g.hands.every((h) => h.length === 5));
  }
  check('라운드별 장수 5→4→3→2', [1, 2, 3, 4].map(handSizeFor).join() === '5,4,3,2');

  const g = newGame(4, rnd);
  let err = '';
  try {
    flip(g, g.keyHolder, g.keyHolder, 0);
  } catch (e) {
    err = e.message;
  }
  check('자기 카드 선택 금지', err.includes('자기 카드'));
  err = '';
  try {
    flip(g, (g.keyHolder + 1) % 4, (g.keyHolder + 2) % 4, 0);
  } catch (e) {
    err = e.message;
  }
  check('열쇠 없는 사람은 못 뒤집음', err.includes('열쇠'));

  // 승리 조건: 강제로 만든 상황
  const m = newGame(4, rnd);
  m.hands[1] = [{ id: 'x', type: 'monster' }];
  m.keyHolder = 0;
  flip(m, 0, 1, 0);
  check('문어가 뒤집히면 해적 즉시 승리', m.winner === 'pirate' && m.reason === 'monster');
  const t = newGame(4, rnd);
  t.found = 3;
  t.hands[2] = [{ id: 'y', type: 'treasure' }];
  t.keyHolder = 0;
  flip(t, 0, 2, 0);
  check('보물을 모두 찾으면 탐험대 즉시 승리', t.winner === 'crew');

  // 무작위 2,000판: 카드 보존, 라운드 진행, 4라운드 안에 끝남
  let ok = true, ended = true, roundsOk = true;
  for (let k = 0; k < 2000; k++) {
    const n = 4 + (k % 3);
    const s = newGame(n, rnd);
    const ids = new Set(s.hands.flat().map((c) => c.id));
    let steps = 0;
    while (!s.winner && steps++ < 200) {
      const r0 = s.round;
      const targets = s.hands.map((h, i) => i).filter((i) => i !== s.keyHolder && s.hands[i].length);
      const tgt = targets[Math.floor(rnd() * targets.length)];
      flip(s, s.keyHolder, tgt, 0, rnd);
      const zone = [...s.hands.flat(), ...s.revealed.map((r) => r.card)].map((c) => c.id);
      if (zone.length !== n * 5 || new Set(zone).size !== n * 5 || zone.some((id) => !ids.has(id))) ok = false;
      if (!s.winner && s.round !== r0 && !s.hands.every((h) => h.length === handSizeFor(s.round))) roundsOk = false;
    }
    if (!s.winner || s.round > MAX_ROUNDS) ended = false;
  }
  check('카드 보존: 모든 카드가 정확히 한 곳에만 있음 (2,000판)', ok);
  check('새 라운드마다 장수가 줄어듦 (2,000판)', roundsOk);
  check('모든 판이 4라운드 안에 끝남 (2,000판)', ended);

  const passed = results.filter((r) => r.pass).length;
  if (log) {
    console.group(`%c심해 보물섬 자가 테스트: ${passed}/${results.length} 통과`, `color:${passed === results.length ? '#15803d' : '#dc2626'};font-weight:bold`);
    for (const r of results) console.log(`${r.pass ? '✅' : '❌'} ${r.name}`);
    console.groupEnd();
  }
  return { passed, total: results.length, results };
}

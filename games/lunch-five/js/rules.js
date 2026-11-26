// 급식 다섯! — 순수 규칙 엔진 + 봇 + 자가 테스트 (브라우저·앱스크립트 공용, 다른 파일 import 금지)
// 카드 코드: 메뉴 id + 개수 ('tteok3' = 떡볶이 3개)
// 더미(piles[seat])는 0번이 맨 위, 공개 더미(open[seat])는 마지막이 맨 위

export const MENUS = ['tteok', 'donkatsu', 'gimbap', 'milk', 'pudding'];
export const MENU_NAME = { tteok: '떡볶이', donkatsu: '돈가스', gimbap: '김밥', milk: '우유', pudding: '푸딩' };
export const MENU_EMOJI = { tteok: '🌶️', donkatsu: '🍖', gimbap: '🍙', milk: '🥛', pudding: '🍮' };
/** 메뉴 한 종류마다: 개수 → 장수 (1개×5, 2개×3, 3개×3, 4개×2, 5개×1 = 14장) */
export const COPIES = { 1: 5, 2: 3, 3: 3, 4: 2, 5: 1 };
export const TARGET = 5; // 보이는 맨 위 카드에서 한 메뉴의 합이 정확히 이만큼이면 종!
export const CARDS_PER_MENU = Object.keys(COPIES).reduce((n, k) => n + COPIES[k], 0);
export const DECK_SIZE = MENUS.length * CARDS_PER_MENU; // 5종 → 70장 (4종이면 56장)
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const MAX_FLIPS = 220; // 이만큼 뒤집으면 끝 → 카드가 가장 많은 사람 승리

export function makeDeck(menus = MENUS) {
  const out = [];
  menus.forEach((m) => {
    Object.keys(COPIES).forEach((k) => {
      for (let i = 0; i < COPIES[k]; i++) out.push(m + k);
    });
  });
  return out;
}

export function cardMenu(c) {
  return String(c).replace(/[0-9]+$/, '');
}
export function cardCount(c) {
  return Number(String(c).match(/[0-9]+$/)[0]);
}
export function cardName(c) {
  return (MENU_NAME[cardMenu(c)] || cardMenu(c)) + ' ' + cardCount(c) + '개';
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

/** 새 판: n명에게 똑같이 나눔 (나머지는 상자에 넣고 안 씀) */
export function newGame(n, deck) {
  if (!(n >= MIN_PLAYERS && n <= MAX_PLAYERS)) throw new Error(MIN_PLAYERS + '~' + MAX_PLAYERS + '명이 할 수 있어요.');
  const cards = deck ? deck.slice() : shuffle(makeDeck());
  const per = Math.floor(cards.length / n);
  const piles = [];
  for (let i = 0; i < n; i++) piles.push(cards.slice(i * per, (i + 1) * per));
  const open = [];
  const out = [];
  for (let i = 0; i < n; i++) {
    open.push([]);
    out.push(false);
  }
  return { n, piles, open, out, turn: 0, tick: 0, flips: 0, over: false, winner: -1, reason: '', total: per * n };
}

/** 자리마다 공개 더미 맨 위 카드 (없으면 null) */
export function tops(g) {
  return g.open.map((o) => (o.length ? o[o.length - 1] : null));
}

/** 보이는 맨 위 카드들의 메뉴별 합 */
export function sums(g) {
  const s = {};
  tops(g).forEach((c) => {
    if (!c) return;
    const m = cardMenu(c);
    s[m] = (s[m] || 0) + cardCount(c);
  });
  return s;
}

/** 합이 정확히 5인 메뉴 (없으면 null) */
export function fiveMenu(g) {
  const s = sums(g);
  return MENUS.find((m) => s[m] === TARGET) || Object.keys(s).find((m) => s[m] === TARGET) || null;
}
export function hasFive(g) {
  return !!fiveMenu(g);
}

export function activeSeats(g) {
  const a = [];
  for (let i = 0; i < g.n; i++) if (!g.out[i]) a.push(i);
  return a;
}

/** 내 카드 수 (더미 + 공개 더미) */
export function cardsOf(g, seat) {
  return g.piles[seat].length + g.open[seat].length;
}

export function countAll(g) {
  let n = 0;
  for (let i = 0; i < g.n; i++) n += cardsOf(g, i);
  return n;
}

function nextActive(g, from) {
  for (let k = 1; k <= g.n; k++) {
    const s = (from + k) % g.n;
    if (!g.out[s]) return s;
  }
  return from;
}

/** 더미가 빈 사람은 탈락 (공개 더미 카드는 탁자에 남아 누군가 가져갈 수 있음). 탈락한 자리 목록 */
function updateOut(g) {
  const newly = [];
  for (let i = 0; i < g.n; i++) {
    if (!g.out[i] && g.piles[i].length === 0) {
      g.out[i] = true;
      newly.push(i);
    }
  }
  const act = activeSeats(g);
  if (act.length <= 1) {
    g.over = true;
    g.winner = act.length ? act[0] : leader(g);
    g.reason = 'last';
  } else if (g.out[g.turn]) {
    g.turn = nextActive(g, g.turn);
  }
  return newly;
}

/** 카드가 가장 많은 사람 (같으면 더미가 많은 사람, 그래도 같으면 앞자리) */
export function leader(g) {
  let best = -1;
  for (let i = 0; i < g.n; i++) {
    if (g.out[i] && activeSeats(g).length) continue;
    if (best < 0) best = i;
    else {
      const a = cardsOf(g, i);
      const b = cardsOf(g, best);
      if (a > b || (a === b && g.piles[i].length > g.piles[best].length)) best = i;
    }
  }
  return best;
}

/** 차례인 사람이 자기 더미 맨 위를 뒤집어 공개 더미에 놓음 */
export function flip(g, seat) {
  if (g.over) throw new Error('게임이 끝났어요.');
  if (seat !== g.turn) throw new Error('지금은 다른 사람 차례예요.');
  if (g.out[seat] || !g.piles[seat].length) throw new Error('뒤집을 카드가 없어요.');
  const card = g.piles[seat].shift();
  g.open[seat].push(card);
  g.tick++;
  g.flips++;
  g.turn = nextActive(g, seat);
  const outs = updateOut(g);
  if (!g.over && g.flips >= MAX_FLIPS) {
    g.over = true;
    g.winner = leader(g);
    g.reason = 'limit';
  }
  return { card, outs };
}

/**
 * 종 치기. tick은 친 사람이 본 판 번호 — 그 사이 판이 바뀌었으면 '한 발 늦음'(벌칙 없음)
 * 맞으면 공개된 카드를 모두 가져가 내 더미 아래에, 틀리면 다른 모든 사람에게 1장씩
 */
export function ring(g, seat, tick) {
  if (g.over) throw new Error('게임이 끝났어요.');
  if (seat < 0 || seat >= g.n) throw new Error('누구인지 알 수 없어요.');
  if (g.out[seat]) throw new Error('탈락해서 종을 칠 수 없어요.');
  if (tick != null && tick !== '' && Number(tick) !== g.tick) throw new Error('한 발 늦었어요!');
  const menu = fiveMenu(g);
  if (menu) {
    const got = [];
    for (let i = 0; i < g.n; i++) {
      for (const c of g.open[i]) got.push(c);
      g.open[i] = [];
    }
    for (const c of got) g.piles[seat].push(c);
    g.tick++;
    g.turn = seat;
    const outs = updateOut(g);
    return { ok: true, menu, got: got.length, gave: [], outs };
  }
  const gave = [];
  for (const t of activeSeats(g)) {
    if (t === seat) continue;
    if (!g.piles[seat].length) break;
    g.piles[t].push(g.piles[seat].shift());
    gave.push(t);
  }
  const outs = updateOut(g);
  return { ok: false, menu: null, got: 0, gave, outs };
}

// ---------- 봇 ----------
export const BOT_REACT = { easy: [1600, 2400], normal: [900, 1500], hard: [500, 900] };
const BOT_MISS = { easy: 0.15, normal: 0.04, hard: 0 }; // 5인데 못 봄
const BOT_OOPS = { easy: 0.08, normal: 0.02, hard: 0 }; // 5가 아닌데 잘못 침

export function botReaction(difficulty) {
  const r = BOT_REACT[difficulty] || BOT_REACT.normal;
  return Math.round(r[0] + Math.random() * (r[1] - r[0]));
}

/**
 * 판이 바뀔 때마다: 이번 판에 종을 칠 가장 빠른 봇 { seat, delay, wrong } 또는 null
 * bots: [{ seat, difficulty }]
 */
export function planBots(g, bots) {
  if (g.over) return null;
  const five = hasFive(g);
  let best = null;
  for (const b of bots) {
    if (g.out[b.seat]) continue;
    const d = b.difficulty || 'normal';
    let delay = null;
    let wrong = false;
    if (five) {
      if (Math.random() >= (BOT_MISS[d] || 0)) delay = botReaction(d);
    } else if (tops(g).some((c) => c) && Math.random() < (BOT_OOPS[d] || 0)) {
      delay = Math.round(botReaction(d) * 1.1);
      wrong = true;
    }
    if (delay != null && (!best || delay < best.delay)) best = { seat: b.seat, delay, wrong };
  }
  return best;
}

/** 봇이 자기 차례에 뒤집기까지 기다리는 시간 (사람이 볼 시간) */
export function botFlipDelay(difficulty) {
  return difficulty === 'hard' ? 900 : difficulty === 'easy' ? 1400 : 1100;
}

// ---------- 자가 테스트 ----------
export function runSelfTests() {
  const results = [];
  const t = (name, fn) => {
    try {
      fn();
      results.push({ name, ok: true });
    } catch (e) {
      results.push({ name, ok: false, error: String((e && e.message) || e) });
    }
  };
  const eq = (a, b, m) => {
    if (a !== b) throw new Error((m || '') + ' 기대 ' + b + ' 실제 ' + a);
  };
  const throws = (fn, m) => {
    let ok = false;
    try {
      fn();
    } catch (e) {
      ok = true;
    }
    if (!ok) throw new Error(m || '예외가 나야 함');
  };

  t('덱 장수 (5종 70장, 4종 56장)', () => {
    eq(makeDeck().length, 70);
    eq(makeDeck(MENUS.slice(0, 4)).length, 56);
    eq(DECK_SIZE, 70);
    eq(makeDeck().filter((c) => c === 'milk5').length, 1);
    eq(makeDeck().filter((c) => c === 'milk1').length, 5);
  });
  t('카드 이름', () => {
    eq(cardName('tteok3'), '떡볶이 3개');
    eq(cardMenu('pudding5'), 'pudding');
    eq(cardCount('gimbap2'), 2);
  });
  t('똑같이 나누기', () => {
    for (let n = 2; n <= 6; n++) {
      const g = newGame(n);
      g.piles.forEach((p) => eq(p.length, Math.floor(70 / n)));
      eq(countAll(g), g.total);
    }
    throws(() => newGame(1));
    throws(() => newGame(7));
  });
  t('합 5 판정', () => {
    const g = newGame(3);
    g.open = [['tteok2'], ['tteok3'], ['milk4']];
    eq(fiveMenu(g), 'tteok');
    g.open = [['tteok2'], ['tteok4'], ['milk1']];
    eq(hasFive(g), false);
    g.open = [['milk5', 'tteok1'], [], ['gimbap5']];
    eq(fiveMenu(g), 'gimbap', '맨 위만 셈');
    g.open = [['tteok5'], ['tteok1'], []];
    eq(hasFive(g), false, '6은 안 됨');
  });
  t('차례·뒤집기', () => {
    const g = newGame(2);
    throws(() => flip(g, 1));
    const top = g.piles[0][0];
    const r = flip(g, 0);
    eq(r.card, top);
    eq(g.open[0][0], top);
    eq(g.turn, 1);
    eq(g.tick, 1);
  });
  t('맞게 치면 모두 가져감', () => {
    const g = newGame(3);
    g.open = [['tteok2'], ['milk1', 'tteok3'], ['gimbap4']];
    const before = g.piles[2].length;
    const tot = countAll(g);
    const r = ring(g, 2, g.tick);
    eq(r.ok, true);
    eq(r.got, 4);
    eq(g.piles[2].length, before + 4);
    eq(g.open.every((o) => o.length === 0), true);
    eq(g.turn, 2);
    eq(countAll(g), tot);
  });
  t('틀리게 치면 1장씩', () => {
    const g = newGame(4);
    g.open = [['tteok2'], [], [], []];
    const tot = countAll(g);
    const b = g.piles.map((p) => p.length);
    const r = ring(g, 1, g.tick);
    eq(r.ok, false);
    eq(r.gave.length, 3);
    eq(g.piles[1].length, b[1] - 3);
    eq(g.piles[0].length, b[0] + 1);
    eq(countAll(g), tot);
  });
  t('늦은 종은 거절 (벌칙 없음)', () => {
    const g = newGame(2);
    g.open = [['tteok2'], ['tteok3']];
    const old = g.tick;
    ring(g, 0, old);
    const b = g.piles[1].length;
    throws(() => ring(g, 1, old));
    eq(g.piles[1].length, b);
  });
  t('더미가 비면 탈락 → 마지막 1명 승리', () => {
    const g = newGame(2);
    g.piles[0] = ['milk1'];
    flip(g, 0);
    eq(g.out[0], true);
    eq(g.over, true);
    eq(g.winner, 1);
  });
  t('틀린 종으로 카드가 다 떨어지면 탈락', () => {
    const g = newGame(3);
    g.piles[0] = ['milk1'];
    const tot = countAll(g);
    ring(g, 0, g.tick);
    eq(g.out[0], true);
    eq(g.over, false);
    eq(countAll(g), tot);
    eq(g.turn !== 0, true);
  });
  t('봇 계획', () => {
    const g = newGame(3);
    g.open = [['tteok2'], ['tteok3'], []];
    const p = planBots(g, [
      { seat: 1, difficulty: 'hard' },
      { seat: 2, difficulty: 'hard' },
    ]);
    eq(!!p, true);
    eq(p.wrong, false);
    eq(p.delay >= 500 && p.delay <= 900, true);
    g.open = [['tteok2'], ['tteok1'], []];
    eq(planBots(g, [{ seat: 1, difficulty: 'hard' }]), null);
  });
  t('무작위 2,000판 끝까지 (오류 0, 카드 보존)', () => {
    let errors = 0;
    for (let k = 0; k < 2000; k++) {
      const n = 2 + (k % 5);
      const g = newGame(n);
      const tot = g.total;
      let guard = 0;
      while (!g.over && guard++ < 5000) {
        const act = activeSeats(g);
        const r = Math.random();
        if (hasFive(g) && r < 0.7) ring(g, act[Math.floor(Math.random() * act.length)], g.tick);
        else if (r < 0.04) ring(g, act[Math.floor(Math.random() * act.length)], g.tick);
        else flip(g, g.turn);
        if (countAll(g) !== tot) throw new Error('카드 수가 변함');
        if (!g.over && (g.out[g.turn] || !g.piles[g.turn].length)) throw new Error('탈락한 사람 차례');
      }
      if (!g.over) errors++;
      if (g.winner < 0 || g.winner >= n) errors++;
    }
    eq(errors, 0, '끝나지 않은 판/잘못된 승자');
  });

  const passed = results.filter((r) => r.ok).length;
  return { passed, total: results.length, results };
}

// 비밀번호 해독반 — 순수 규칙 엔진 + 봇 + 자가 테스트 (브라우저·앱스크립트 공용, import 없음)
// 타일: { id, c: 'b'|'w', n: 0..11 | 12(조커), up: 공개됨 }
// 줄(row)은 언제나 조커를 뺀 타일이 오름차순 (같은 숫자면 검정이 왼쪽). 조커는 아무 자리나.

export const JOKER = 12;
export const COLORS = ['b', 'w'];
export const COLOR_NAME = { b: '검정', w: '흰색' };
export const PHASE = { SETUP: 'setup', DRAW: 'draw', PLACE: 'place', GUESS: 'guess', DECIDE: 'decide', PENALTY: 'penalty', OVER: 'over' };

export const dealCount = (n) => (n <= 3 ? 4 : 3);
export const tileKey = (t) => t.n * 2 + (t.c === 'w' ? 1 : 0);
export const numName = (n) => (n === JOKER ? '조커' : String(n));
export const tileName = (t) => COLOR_NAME[t.c] + ' ' + numName(t.n);

/** 26개 타일 (검정 0~11, 흰색 0~11, 조커 2) */
export function fullSet() {
  const out = [];
  COLORS.forEach((c) => {
    for (let n = 0; n <= 11; n++) out.push({ c, n });
    out.push({ c, n: JOKER });
  });
  return out;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/** 조커가 아닌 타일 t를 줄에 넣을 자리: t보다 큰 첫 번째 숫자 타일 바로 앞 (없으면 맨 끝) */
export function sortedIndex(row, t) {
  const k = tileKey(t);
  for (let i = 0; i < row.length; i++) if (row[i].n !== JOKER && tileKey(row[i]) > k) return i;
  return row.length;
}

/** 줄이 규칙대로 정렬돼 있는지 (조커 제외) */
export function rowSorted(row) {
  let last = -1;
  for (const t of row) {
    if (t.n === JOKER) continue;
    if (tileKey(t) <= last) return false;
    last = tileKey(t);
  }
  return true;
}

export function newGame(n) {
  if (n < 2 || n > 4) throw new Error('2~4명이 할 수 있어요.');
  const pile = shuffle(fullSet()).map((t, i) => ({ id: i + 1, c: t.c, n: t.n, up: false }));
  const g = {
    gid: Math.floor(Math.random() * 1e9),
    n,
    pile,
    rows: [],
    hold: [],
    out: [],
    turn: Math.floor(Math.random() * n),
    phase: PHASE.SETUP,
    streak: 0,
    fresh: 0, // 이번 차례에 뽑은 타일 id (0: 없음)
    history: [], // { by, target, id, pos, guess, ok }
    winner: -1,
    turns: 0,
  };
  const per = dealCount(n);
  for (let s = 0; s < n; s++) {
    const got = pile.splice(0, per);
    const row = [];
    const hold = [];
    got.forEach((t) => (t.n === JOKER ? hold.push(t) : row.splice(sortedIndex(row, t), 0, t)));
    g.rows.push(row);
    g.hold.push(hold);
    g.out.push(false);
  }
  if (!g.hold.some((h) => h.length)) beginTurn(g);
  return g;
}

export const hiddenCount = (row) => row.filter((t) => !t.up).length;
export const alive = (g) => g.out.map((o, i) => (o ? -1 : i)).filter((i) => i >= 0);
export const pileCount = (g) => ({ b: g.pile.filter((t) => t.c === 'b').length, w: g.pile.filter((t) => t.c === 'w').length });

function beginTurn(g) {
  g.streak = 0;
  g.fresh = 0;
  g.phase = g.pile.length ? PHASE.DRAW : PHASE.GUESS;
}

function nextTurn(g) {
  g.turns++;
  for (let k = 1; k <= g.n; k++) {
    const s = (g.turn + k) % g.n;
    if (!g.out[s]) {
      g.turn = s;
      break;
    }
  }
  beginTurn(g);
}

function checkOut(g, seat, res) {
  if (!g.out[seat] && g.rows[seat].length && hiddenCount(g.rows[seat]) === 0 && !g.hold[seat].length) {
    g.out[seat] = true;
    res.out = (res.out || []).concat(seat);
  }
  const live = alive(g);
  if (live.length <= 1) {
    g.winner = live.length ? live[0] : -1;
    g.phase = PHASE.OVER;
    res.over = true;
  }
}

/** 조커 자리 고르기 (처음 나눔 또는 뽑은 직후). idx: 0..줄 길이 */
export function placeJoker(g, seat, idx) {
  const h = g.hold[seat];
  if (!h || !h.length) throw new Error('자리를 고를 조커가 없어요.');
  if (g.phase === PHASE.PLACE) {
    if (seat !== g.turn) throw new Error('내 차례가 아니에요.');
  } else if (g.phase !== PHASE.SETUP) throw new Error('지금은 조커를 놓을 수 없어요.');
  const row = g.rows[seat];
  const i = Number(idx);
  if (!Number.isInteger(i) || i < 0 || i > row.length) throw new Error('그 자리에는 놓을 수 없어요.');
  const t = h.shift();
  row.splice(i, 0, t);
  const res = { type: 'place', seat, id: t.id, idx: i, c: t.c };
  if (g.phase === PHASE.PLACE) {
    if (!h.length) g.phase = PHASE.GUESS;
  } else if (!g.hold.some((x) => x.length)) beginTurn(g);
  return res;
}

/** 가운데 더미에서 원하는 색 1개 뽑기 */
export function draw(g, seat, color) {
  if (g.phase !== PHASE.DRAW) throw new Error('지금은 뽑을 수 없어요.');
  if (seat !== g.turn) throw new Error('내 차례가 아니에요.');
  if (!COLORS.includes(color)) throw new Error('검정이나 흰색을 고르세요.');
  const i = g.pile.findIndex((t) => t.c === color);
  if (i < 0) throw new Error(COLOR_NAME[color] + ' 타일이 다 떨어졌어요. 다른 색을 고르세요.');
  const t = g.pile.splice(i, 1)[0];
  g.fresh = t.id;
  const res = { type: 'draw', seat, id: t.id, c: color };
  if (t.n === JOKER) {
    g.hold[seat].push(t);
    g.phase = PHASE.PLACE;
    res.idx = -1;
  } else {
    const row = g.rows[seat];
    res.idx = sortedIndex(row, t);
    row.splice(res.idx, 0, t);
    g.phase = PHASE.GUESS;
  }
  return res;
}

/** 다른 사람의 숨긴 타일 하나를 골라 숫자(또는 조커=12) 추측 */
export function guess(g, seat, target, id, value) {
  if (g.phase !== PHASE.GUESS) throw new Error('지금은 추리할 수 없어요.');
  if (seat !== g.turn) throw new Error('내 차례가 아니에요.');
  const ts = Number(target);
  if (!Number.isInteger(ts) || ts < 0 || ts >= g.n || ts === seat) throw new Error('다른 사람의 타일을 고르세요.');
  if (g.out[ts]) throw new Error('이미 탈락한 사람이에요.');
  const row = g.rows[ts];
  const pos = row.findIndex((t) => t.id === Number(id));
  if (pos < 0) throw new Error('그 타일을 찾을 수 없어요.');
  const t = row[pos];
  if (t.up) throw new Error('이미 공개된 타일이에요.');
  const v = Number(value);
  if (!Number.isInteger(v) || v < 0 || v > JOKER) throw new Error('0~11 또는 조커를 고르세요.');
  const ok = t.n === v;
  g.history.push({ by: seat, target: ts, id: t.id, pos: pos + 1, guess: v, ok });
  const res = { type: 'guess', seat, target: ts, id: t.id, pos: pos + 1, guess: v, ok };
  if (ok) {
    t.up = true;
    res.c = t.c;
    res.n = t.n;
    g.streak++;
    checkOut(g, ts, res);
    if (!res.over) g.phase = PHASE.DECIDE;
  } else {
    const mine = g.rows[seat].find((x) => x.id === g.fresh);
    if (mine) {
      mine.up = true;
      res.reveal = { id: mine.id, c: mine.c, n: mine.n };
      checkOut(g, seat, res);
      if (!res.over) nextTurn(g);
    } else g.phase = PHASE.PENALTY;
  }
  return res;
}

/** 틀렸는데 뽑은 타일이 없으면: 내 숨긴 타일 하나를 직접 공개 */
export function penalty(g, seat, id) {
  if (g.phase !== PHASE.PENALTY) throw new Error('지금은 공개할 필요가 없어요.');
  if (seat !== g.turn) throw new Error('내 차례가 아니에요.');
  const t = g.rows[seat].find((x) => x.id === Number(id));
  if (!t || t.up) throw new Error('내 숨긴 타일을 고르세요.');
  t.up = true;
  const res = { type: 'reveal', seat, id: t.id, c: t.c, n: t.n };
  checkOut(g, seat, res);
  if (!res.over) nextTurn(g);
  return res;
}

/** 맞힌 뒤: 계속 추리(true) / 멈추기(false) */
export function decide(g, seat, more) {
  if (g.phase !== PHASE.DECIDE) throw new Error('지금은 고를 수 없어요.');
  if (seat !== g.turn) throw new Error('내 차례가 아니에요.');
  if (more) {
    g.phase = PHASE.GUESS;
    return { type: 'more', seat };
  }
  nextTurn(g);
  return { type: 'stop', seat };
}

/** 지금 행동해야 하는 자리 (처음 조커 놓기는 조커가 남은 첫 자리) */
export function actorOf(g) {
  if (g.phase === PHASE.OVER) return -1;
  if (g.phase === PHASE.SETUP) return g.hold.findIndex((h) => h.length);
  return g.turn;
}

// ---------------- 추리 (봇과 힌트가 같이 씀) ----------------

/**
 * seat가 아는 정보만으로 각 숨긴 타일의 후보 숫자 목록을 구함
 * rows: [[{id,c,n|null,up}]] — n은 '보이는 경우'만 (내 타일 / 공개된 타일)
 * history: [{id, guess, ok}] 틀린 추측은 그 타일의 후보에서 뺌
 * 돌려줌: { [id]: [숫자…] }
 */
export function candidates(rows, seat, history, holdMine) {
  const known = new Set();
  const mark = (t) => t.n != null && known.add(t.c + t.n);
  rows.forEach((r) => r.forEach(mark));
  (holdMine || []).forEach(mark);
  const wrong = {};
  (history || []).forEach((h) => {
    if (!h.ok) (wrong[h.id] = wrong[h.id] || []).push(h.guess);
  });
  const out = {};
  rows.forEach((row, s) => {
    if (s === seat) return;
    // 처음 후보: 같은 색 중 아직 모르는 숫자
    const cand = row.map((t) => {
      if (t.n != null) return null;
      const list = [];
      for (let v = 0; v <= JOKER; v++) if (!known.has(t.c + v) && !(wrong[t.id] || []).includes(v)) list.push(v);
      return list;
    });
    // 정렬 규칙으로 좁히기: 조커일 수 없는 이웃은 경계가 됨 (몇 번 반복)
    const keyOf = (t, v) => v * 2 + (t.c === 'w' ? 1 : 0);
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < row.length; i++) {
        if (!cand[i]) continue;
        let lo = -1;
        for (let j = i - 1; j >= 0; j--) {
          const t = row[j];
          if (t.n != null) {
            if (t.n === JOKER) continue;
            lo = tileKey(t);
            break;
          }
          if (cand[j].includes(JOKER)) continue;
          lo = Math.min(...cand[j].map((v) => keyOf(t, v)));
          break;
        }
        let hi = 999;
        for (let j = i + 1; j < row.length; j++) {
          const t = row[j];
          if (t.n != null) {
            if (t.n === JOKER) continue;
            hi = tileKey(t);
            break;
          }
          if (cand[j].includes(JOKER)) continue;
          hi = Math.max(...cand[j].map((v) => keyOf(t, v)));
          break;
        }
        const t = row[i];
        const next = cand[i].filter((v) => v === JOKER || (keyOf(t, v) > lo && keyOf(t, v) < hi));
        cand[i] = next.length ? next : cand[i];
      }
    }
    row.forEach((t, i) => cand[i] && (out[t.id] = cand[i]));
  });
  return out;
}

/** 엔진 상태 g를 seat 눈높이로 가린 줄 */
export function rowsSeenBy(g, seat) {
  return g.rows.map((r, s) => r.map((t) => ({ id: t.id, c: t.c, n: t.up || s === seat ? t.n : null, up: t.up })));
}

const pickOne = (a) => a[Math.floor(Math.random() * a.length)];

/**
 * 봇이 지금 할 일. 돌려줌: { action: 'draw'|'place'|'guess'|'decide'|'penalty', ... }
 * difficulty: easy | normal | hard
 */
export function botAction(g, seat, difficulty = 'normal') {
  const d = difficulty;
  if (g.phase === PHASE.SETUP || g.phase === PHASE.PLACE) {
    return { action: 'place', idx: Math.floor(Math.random() * (g.rows[seat].length + 1)) };
  }
  if (g.phase === PHASE.DRAW) {
    const pc = pileCount(g);
    let color;
    if (!pc.b) color = 'w';
    else if (!pc.w) color = 'b';
    else color = d === 'hard' ? (pc.b >= pc.w ? 'b' : 'w') : pickOne(COLORS);
    return { action: 'draw', color };
  }
  if (g.phase === PHASE.PENALTY) {
    const hid = g.rows[seat].filter((t) => !t.up);
    // 어려움: 가장 큰 숫자(맞히기 쉬운 끝자리)보다 가운데 타일을 공개해 정보를 덜 줌
    return { action: 'penalty', id: (d === 'hard' && hid.length > 2 ? hid[Math.floor(hid.length / 2)] : pickOne(hid)).id };
  }
  const opts = targetsWithCandidates(g, seat);
  if (g.phase === PHASE.DECIDE) {
    if (!opts.length) return { action: 'decide', more: false };
    const best = Math.min(...opts.map((o) => o.cand.length));
    let more;
    if (d === 'easy') more = Math.random() < 0.3;
    else if (d === 'normal') more = best <= 2 ? Math.random() < 0.7 : Math.random() < 0.25;
    else {
      const p = 1 / best;
      const myHidden = hiddenCount(g.rows[seat]);
      // 뽑은 타일이 없으면 틀려도 고를 수 있지만, 숨긴 게 적으면 조심
      more = p >= 0.99 || (p >= 0.5 && myHidden >= 2) || (p >= 0.34 && myHidden >= 4 && g.streak < 2);
    }
    return { action: 'decide', more };
  }
  // GUESS
  let o;
  if (d === 'hard') {
    const best = Math.min(...opts.map((x) => x.cand.length));
    o = pickOne(opts.filter((x) => x.cand.length === best));
  } else o = pickOne(opts);
  let v;
  if (d === 'easy' && Math.random() < 0.6) {
    v = Math.random() < 0.08 ? JOKER : Math.floor(Math.random() * 12);
  } else {
    // 조커 후보는 확률이 낮으니 숫자를 먼저 (어려움)
    const nums = o.cand.filter((x) => x !== JOKER);
    v = d === 'hard' && nums.length ? pickOne(nums) : pickOne(o.cand);
  }
  return { action: 'guess', target: o.seat, id: o.id, value: v };
}

function targetsWithCandidates(g, seat) {
  const cand = candidates(rowsSeenBy(g, seat), seat, g.history, g.hold[seat]);
  const opts = [];
  g.rows.forEach((row, s) => {
    if (s === seat || g.out[s]) return;
    row.forEach((t) => !t.up && opts.push({ seat: s, id: t.id, cand: cand[t.id] || [t.n] }));
  });
  return opts;
}

/** 봇 행동을 실제로 적용 (자가 테스트·서버 공용) */
export function applyAction(g, seat, a) {
  switch (a.action) {
    case 'place':
      return placeJoker(g, seat, a.idx);
    case 'draw':
      return draw(g, seat, a.color);
    case 'guess':
      return guess(g, seat, a.target, a.id, a.value);
    case 'decide':
      return decide(g, seat, !!a.more);
    case 'penalty':
      return penalty(g, seat, a.id);
    default:
      throw new Error('알 수 없는 동작이에요.');
  }
}

// ---------------- 자가 테스트 ----------------
export function runSelfTests(games = 2000) {
  const results = [];
  const check = (name, fn) => {
    try {
      const r = fn();
      results.push({ name, ok: r !== false });
    } catch (e) {
      results.push({ name, ok: false, error: String(e && e.message) });
    }
  };
  check('타일 26개', () => fullSet().length === 26);
  check('정렬 자리', () => {
    const row = [
      { c: 'b', n: 2 },
      { c: 'w', n: 5 },
    ];
    return sortedIndex(row, { c: 'w', n: 2 }) === 1 && sortedIndex(row, { c: 'b', n: 5 }) === 1 && sortedIndex(row, { c: 'b', n: 9 }) === 2;
  });
  check('후보 좁히기', () => {
    // 상대 줄: 흰3(공개) [검정 ?] 흰5(공개), 내가 검정4를 가짐 → 검정 5 또는 조커
    const rows = [
      [{ id: 1, c: 'b', n: 4, up: false }],
      [
        { id: 2, c: 'w', n: 3, up: true },
        { id: 3, c: 'b', n: null, up: false },
        { id: 4, c: 'w', n: 5, up: true },
      ],
    ];
    const c = candidates(rows, 0, [], []);
    return c[3].join(',') === '5,12';
  });
  check('처음 나눔 장수', () => {
    const g2 = newGame(2);
    const g4 = newGame(4);
    const cnt = (g) => g.rows.map((r, i) => r.length + g.hold[i].length);
    return cnt(g2).every((x) => x === 4) && cnt(g4).every((x) => x === 3) && g4.pile.length === 14;
  });
  check(`봇끼리 ${games}판 (오류 0, 타일 보존, 정렬 유지)`, () => {
    const diffs = ['easy', 'normal', 'hard'];
    for (let k = 0; k < games; k++) {
      const n = 2 + (k % 3);
      const g = newGame(n);
      const lv = Array.from({ length: n }, () => diffs[Math.floor(Math.random() * 3)]);
      let guard = 0;
      while (g.phase !== PHASE.OVER) {
        if (++guard > 400) throw new Error('끝나지 않음');
        const s = actorOf(g);
        applyAction(g, s, botAction(g, s, lv[s]));
        const total = g.pile.length + g.rows.reduce((a, r) => a + r.length, 0) + g.hold.reduce((a, h) => a + h.length, 0);
        if (total !== 26) throw new Error('타일 수가 바뀜: ' + total);
        if (!g.rows.every(rowSorted)) throw new Error('정렬이 깨짐');
        if (guard % 7 === 0 && g.phase !== PHASE.OVER) {
          const t = actorOf(g);
          const c = candidates(rowsSeenBy(g, t), t, g.history, g.hold[t]);
          g.rows.forEach((r, s) => s !== t && r.forEach((x) => !x.up && !c[x.id].includes(x.n) && (() => { throw new Error('후보에서 정답이 빠짐'); })()));
        }
      }
      if (g.winner < 0 || g.out[g.winner] || alive(g).length !== 1) throw new Error('승자 판정 오류');
    }
    return true;
  });
  const passed = results.filter((r) => r.ok).length;
  return { passed, total: results.length, results };
}

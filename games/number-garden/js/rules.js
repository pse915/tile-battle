// 숫자 블록 정원 — 순수 규칙 엔진 + 봇 + 자가 테스트 (브라우저와 앱스크립트 서버가 같이 씀)
// 타일 id: 0~103 = 벌(0/1)*52 + 꽃색(0~3)*13 + (숫자-1),  104·105 = 새싹(조커)
// 종류(kind): 0~51 = 꽃색*13 + (숫자-1), 52 = 새싹. 같은 종류는 그림이 같음.
// 판(board): 세트 배열 [[id, …], …]. 세트는 순서 없이 검사하고, 보여 줄 때만 orderSet으로 정렬.
//   꽃줄(런): 같은 꽃색 연속 숫자 3개 이상 / 꽃다발(그룹): 같은 숫자 서로 다른 꽃색 3~4개
//   새싹은 아무 타일 대신. 첫 등록은 내 패만으로 30점 이상, 그전엔 판을 건드릴 수 없음.

export const COLORS = [
  { key: 'r', name: '동백', color: '#d1343c', light: '#fde3e3', mark: '●' },
  { key: 'y', name: '개나리', color: '#c77700', light: '#fff1cc', mark: '✚' },
  { key: 'b', name: '수국', color: '#2160c4', light: '#dfeaff', mark: '◆' },
  { key: 'p', name: '제비꽃', color: '#7a3bbf', light: '#eee2fb', mark: '▲' },
];
export const JOKER_KIND = 52;
export const TOTAL_TILES = 106;
export const HAND_SIZE = 14;
export const FIRST_MELD = 30;
export const JOKER_POINTS = 30;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

export const isJoker = (id) => id >= 104;
export const kindOf = (id) => (id >= 104 ? JOKER_KIND : id % 52);
export const numOf = (id) => (id >= 104 ? 0 : (id % 13) + 1);
export const colorOf = (id) => (id >= 104 ? -1 : Math.floor((id % 52) / 13));
export const kindNum = (k) => (k >= JOKER_KIND ? 0 : (k % 13) + 1);
export const kindColor = (k) => (k >= JOKER_KIND ? -1 : Math.floor(k / 13));

export function kindName(k) {
  k = Number(k);
  if (k >= JOKER_KIND) return '새싹(조커)';
  const c = COLORS[kindColor(k)];
  return c.name + c.mark + ' ' + kindNum(k);
}
export const tileName = (id) => kindName(kindOf(id));

/** 손패 정렬: mode 'color' = 꽃색→숫자, 'num' = 숫자→꽃색. 새싹은 맨 뒤 */
export function sortTiles(ids, mode) {
  const key = (id) => {
    if (isJoker(id)) return 10000 + id;
    return mode === 'num' ? numOf(id) * 100 + colorOf(id) * 10 + (id >= 52 ? 1 : 0) : colorOf(id) * 100 + numOf(id) * 2 + (id >= 52 ? 1 : 0);
  };
  return ids.slice().sort((a, b) => key(a) - key(b));
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

// ---------- 세트 판정 ----------
const BAD = '같은 꽃색 연속 숫자(꽃줄)나 같은 숫자 다른 꽃색(꽃다발)이 아니에요.';

/**
 * 세트 하나 검사 → { ok, kind:'run'|'group', value(점수 합, 새싹은 대신하는 숫자), reason }
 * 둘 다 되면 점수가 큰 쪽으로 봄
 */
export function analyzeSet(ids) {
  const n = ids.length;
  if (n < 3) return { ok: false, value: 0, reason: '세트는 3개 이상이어야 해요.' };
  const real = [];
  for (const id of ids) if (!isJoker(id)) real.push(id);
  if (!real.length) return { ok: false, value: 0, reason: BAD };
  let best = null;
  // 꽃다발: 같은 숫자, 꽃색이 모두 다름, 3~4개
  if (n <= 4) {
    const num = numOf(real[0]);
    let mask = 0;
    let ok = true;
    for (const id of real) {
      const bit = 1 << colorOf(id);
      if (numOf(id) !== num || mask & bit) {
        ok = false;
        break;
      }
      mask |= bit;
    }
    if (ok) best = { ok: true, kind: 'group', value: num * n, num };
  }
  // 꽃줄: 같은 꽃색, 숫자가 겹치지 않고, 새싹으로 빈칸을 메워 이어지게
  if (n <= 13) {
    const c = colorOf(real[0]);
    let ok = true;
    let lo = 14;
    let hi = 0;
    let mask = 0;
    for (const id of real) {
      const v = numOf(id);
      if (colorOf(id) !== c || mask & (1 << v)) {
        ok = false;
        break;
      }
      mask |= 1 << v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (ok && hi - lo + 1 <= n) {
      const extra = n - (hi - lo + 1);
      const up = Math.min(extra, 13 - hi);
      hi += up;
      lo -= extra - up;
      const value = ((lo + hi) * n) / 2;
      if (!best || value > best.value) best = { ok: true, kind: 'run', value, lo, hi, color: c };
    }
  }
  return best || { ok: false, value: 0, reason: BAD };
}

/** 보여 줄 순서: 꽃줄은 숫자순(새싹은 대신하는 자리), 꽃다발은 꽃색순 */
export function orderSet(ids) {
  const a = analyzeSet(ids);
  const jokers = ids.filter(isJoker).sort((x, y) => x - y);
  const real = ids.filter((id) => !isJoker(id));
  if (a.ok && a.kind === 'run') {
    const out = [];
    const byNum = {};
    real.forEach((id) => (byNum[numOf(id)] = id));
    let j = 0;
    for (let v = a.lo; v <= a.hi; v++) out.push(byNum[v] != null ? byNum[v] : jokers[j++]);
    return out;
  }
  if (a.ok) return real.sort((x, y) => colorOf(x) - colorOf(y)).concat(jokers);
  return real.sort((x, y) => numOf(x) - numOf(y) || colorOf(x) - colorOf(y)).concat(jokers);
}

/** 새싹이 대신하는 숫자 (보여 주기용): { jokerId: 숫자 } */
export function jokerValues(ids) {
  const a = analyzeSet(ids);
  const out = {};
  if (!a.ok) return out;
  if (a.kind === 'group') ids.filter(isJoker).forEach((id) => (out[id] = a.num));
  else orderSet(ids).forEach((id, i) => isJoker(id) && (out[id] = a.lo + i));
  return out;
}

export function handScore(hand) {
  let s = 0;
  for (const id of hand) s += isJoker(id) ? JOKER_POINTS : numOf(id);
  return s;
}

const setKey = (set) => set.slice().sort((a, b) => a - b).join(',');

// ---------- 게임 진행 ----------
export function newGame(n, first) {
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new Error('2~4명이 할 수 있어요.');
  const pool = shuffle(Array.from({ length: TOTAL_TILES }, (_, i) => i));
  const hands = [];
  for (let i = 0; i < n; i++) hands.push(pool.splice(0, HAND_SIZE));
  return {
    n,
    hands,
    pool,
    board: [],
    turn: first == null ? Math.floor(Math.random() * n) : first,
    opened: new Array(n).fill(false),
    passes: 0,
    over: false,
    winner: -1,
    scores: null,
    turnNo: 1,
    last: null,
  };
}

/**
 * 턴 끝내기 검사 (게임을 바꾸지 않음) → { ok, reason, meld }
 * board: 턴이 끝난 뒤 판 전체, played: 이번 턴에 손에서 낸 id들
 */
export function checkTurn(g, seat, board, played) {
  const no = (reason) => ({ ok: false, reason });
  if (g.over) return no('이미 끝난 판이에요.');
  if (seat !== g.turn) return no('아직 내 차례가 아니에요.');
  if (!Array.isArray(board) || !Array.isArray(played)) return no('잘못된 요청이에요.');
  if (!played.length) return no('손에서 1개 이상 내야 해요. 낼 게 없으면 ‘뽑고 넘기기’를 누르세요.');
  const hand = g.hands[seat];
  const handSet = {};
  hand.forEach((id) => (handSet[id] = 1));
  const playedSet = {};
  for (const id of played) {
    if (!Number.isInteger(id) || !handSet[id]) return no('내 패에 없는 타일이에요. 화면이 바뀌었을 수 있어요.');
    if (playedSet[id]) return no('같은 타일을 두 번 낼 수 없어요.');
    playedSet[id] = 1;
  }
  const oldSet = {};
  let oldCount = 0;
  g.board.forEach((s) => s.forEach((id) => ((oldSet[id] = 1), oldCount++)));
  const seen = {};
  let count = 0;
  for (const set of board) {
    if (!Array.isArray(set)) return no('잘못된 요청이에요.');
    for (const id of set) {
      if (!Number.isInteger(id) || seen[id]) return no('판의 타일이 이상해요. 되돌리기 후 다시 해 보세요.');
      if (!oldSet[id] && !playedSet[id]) return no('판에 없던 타일이 들어 있어요.');
      seen[id] = 1;
      count++;
    }
  }
  if (count !== oldCount + played.length) return no('판의 타일을 가져가거나 낸 타일이 빠졌어요. 판의 타일은 내 패로 가져올 수 없어요.');
  for (let i = 0; i < board.length; i++) {
    const a = analyzeSet(board[i]);
    if (!a.ok) return no(i + 1 + '번째 줄: ' + a.reason);
  }
  if (!g.opened[seat]) {
    const want = {};
    board.forEach((s) => {
      const k = setKey(s);
      want[k] = (want[k] || 0) + 1;
    });
    for (const s of g.board) {
      const k = setKey(s);
      if (!want[k]) return no('첫 등록 전에는 판의 세트를 건드릴 수 없어요.');
      want[k]--;
    }
    // 남은 세트 = 내 패로만 만든 새 세트
    const left = {};
    Object.keys(want).forEach((k) => (left[k] = want[k]));
    let meld = 0;
    board.forEach((s) => {
      const k = setKey(s);
      if (left[k] > 0) {
        left[k]--;
        meld += analyzeSet(s).value;
      }
    });
    if (meld < FIRST_MELD) return no('첫 등록은 내 패만으로 ' + FIRST_MELD + '점 이상이어야 해요 (지금 ' + meld + '점).');
    return { ok: true, meld };
  }
  return { ok: true, meld: 0 };
}

function nextTurn(g) {
  g.turn = (g.turn + 1) % g.n;
  g.turnNo++;
}

function finish(g, winner) {
  g.over = true;
  g.scores = g.hands.map(handScore);
  if (winner >= 0) g.winner = winner;
  else {
    let w = 0;
    for (let i = 1; i < g.n; i++) if (g.scores[i] < g.scores[w] || (g.scores[i] === g.scores[w] && g.hands[i].length < g.hands[w].length)) w = i;
    g.winner = w;
  }
}

/** 턴 끝내기 (검사 통과해야 함). 실패하면 예외 */
export function playTurn(g, seat, board, played) {
  const c = checkTurn(g, seat, board, played);
  if (!c.ok) throw new Error(c.reason);
  const ps = {};
  played.forEach((id) => (ps[id] = 1));
  g.board = board.map((s) => orderSet(s));
  g.hands[seat] = g.hands[seat].filter((id) => !ps[id]);
  const firstMeld = !g.opened[seat];
  g.opened[seat] = true;
  g.passes = 0;
  g.last = { seat, type: 'play', ids: played.slice(), firstMeld, meld: c.meld };
  if (!g.hands[seat].length) finish(g, seat);
  else nextTurn(g);
  return { played: played.length, firstMeld, meld: c.meld, over: g.over };
}

/** 뽑고 넘기기 (더미가 비었으면 그냥 넘기기). 아무도 못 내고 한 바퀴 돌면 끝 */
export function drawTurn(g, seat) {
  if (g.over) throw new Error('이미 끝난 판이에요.');
  if (seat !== g.turn) throw new Error('아직 내 차례가 아니에요.');
  let drawn = null;
  if (g.pool.length) {
    drawn = g.pool.pop();
    g.hands[seat].push(drawn);
    g.passes = 0;
    g.last = { seat, type: 'draw' };
  } else {
    g.passes++;
    g.last = { seat, type: 'pass' };
    if (g.passes >= g.n) {
      finish(g, -1);
      return { drawn, over: true };
    }
  }
  nextTurn(g);
  return { drawn, over: false };
}

// ---------- 봇 ----------
const BUDGET = { easy: 150, normal: 1500, hard: 6000 };

/** 손패(종류별 개수)로 만들 수 있는 세트 후보: { kinds, j(새싹 수), size, value } */
function candidates(cnt, jokers) {
  const out = [];
  // 꽃다발
  for (let num = 1; num <= 13; num++) {
    const cols = [];
    for (let c = 0; c < 4; c++) if (cnt[c * 13 + num - 1]) cols.push(c);
    const m = cols.length;
    for (let mask = 1; mask < 1 << m; mask++) {
      const kinds = [];
      for (let b = 0; b < m; b++) if (mask & (1 << b)) kinds.push(cols[b] * 13 + num - 1);
      for (let size = Math.max(3, kinds.length); size <= 4; size++) {
        const j = size - kinds.length;
        if (j <= jokers) out.push({ kinds, j, size, value: num * size });
      }
    }
  }
  // 꽃줄
  for (let c = 0; c < 4; c++) {
    for (let lo = 1; lo <= 11; lo++) {
      let miss = 0;
      const kinds = [];
      for (let hi = lo; hi <= 13; hi++) {
        const k = c * 13 + hi - 1;
        if (cnt[k]) kinds.push(k);
        else miss++;
        if (miss > jokers) break;
        if (hi - lo >= 2 && (cnt[c * 13 + lo - 1] || cnt[k])) out.push({ kinds: kinds.slice(), j: miss, size: hi - lo + 1, value: ((lo + hi) * (hi - lo + 1)) / 2 });
      }
    }
  }
  out.sort((a, b) => b.size - a.size || b.value - a.value);
  return out;
}

/** 서로 겹치지 않는 세트 조합 고르기 (예산 안에서): 낸 타일 수 최대, 같으면 점수 최대 */
function chooseSets(cands, cnt, jokers, minValue, budget) {
  let nodes = 0;
  let best = null;
  const pick = [];
  const dfs = (start, tiles, value, jUsed) => {
    if (value >= minValue && tiles > 0 && (!best || tiles > best.tiles || (tiles === best.tiles && value > best.value))) best = { tiles, value, sets: pick.slice() };
    for (let i = start; i < cands.length; i++) {
      if (++nodes > budget) return;
      const cd = cands[i];
      if (cd.j + jUsed > jokers) continue;
      let ok = true;
      for (const k of cd.kinds) if (!cnt[k]) ok = false;
      if (!ok) continue;
      for (const k of cd.kinds) cnt[k]--;
      pick.push(cd);
      dfs(i, tiles + cd.size, value + cd.value, jUsed + cd.j);
      pick.pop();
      for (const k of cd.kinds) cnt[k]++;
    }
  };
  dfs(0, 0, 0, 0);
  return best;
}

/** 끝 타일을 빼도 남은 세트가 유효한 '빌릴 수 있는' 타일들 */
function spareTiles(set) {
  if (set.length < 4) return [];
  const a = analyzeSet(set);
  if (!a.ok) return [];
  if (a.kind === 'group') return set.slice();
  const o = orderSet(set);
  return [o[0], o[o.length - 1]];
}

/**
 * 봇의 한 턴 → { board, played } 또는 null(뽑고 넘기기)
 * 쉬움: 탐색 얕게, 가끔 붙이기를 놓침 / 보통: 세트 + 붙이기 / 어려움: 깊게 + 판의 끝 타일 빌려 새 세트
 */
export function botTurn(g, seat, difficulty) {
  const diff = BUDGET[difficulty] ? difficulty : 'normal';
  const hand = g.hands[seat].slice();
  const opened = g.opened[seat];
  const jokerIds = hand.filter(isJoker);
  const cnt = new Array(53).fill(0);
  hand.forEach((id) => isJoker(id) || cnt[kindOf(id)]++);
  const cands = candidates(cnt, jokerIds.length);
  const best = chooseSets(cands, cnt, jokerIds.length, opened ? 0 : FIRST_MELD, BUDGET[diff]);
  if (!opened && !best) return null;
  // 고른 세트를 실제 id로
  const left = hand.slice();
  const take = (pred) => {
    const i = left.findIndex(pred);
    return i >= 0 ? left.splice(i, 1)[0] : null;
  };
  const newSets = [];
  if (best)
    for (const cd of best.sets) {
      const set = cd.kinds.map((k) => take((id) => !isJoker(id) && kindOf(id) === k));
      for (let j = 0; j < cd.j; j++) set.push(take(isJoker));
      newSets.push(set);
    }
  const board = g.board.map((s) => s.slice());
  const oldCount = board.length;
  newSets.forEach((s) => board.push(s));
  // 붙이기: 남은 타일을 판의 세트에 (첫 등록 전엔 이번에 만든 세트에만)
  const attachFrom = opened ? 0 : oldCount;
  const sloppy = diff === 'easy';
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 30) {
    changed = false;
    for (let t = 0; t < left.length; t++) {
      const id = left[t];
      if (isJoker(id) && left.some((x) => !isJoker(x))) continue; // 새싹은 마지막에
      if (sloppy && Math.random() < 0.35) continue;
      for (let b = attachFrom; b < board.length; b++) {
        if (analyzeSet(board[b].concat([id])).ok) {
          board[b].push(id);
          left.splice(t, 1);
          t--;
          changed = true;
          break;
        }
      }
    }
    // 어려움: 판의 끝 타일을 빌려 손의 두 장과 새 세트
    if (!changed && diff === 'hard' && opened && left.length >= 2) {
      outer: for (let b = 0; b < board.length; b++) {
        for (const sp of spareTiles(board[b])) {
          for (let x = 0; x < left.length; x++) {
            if (isJoker(left[x])) continue;
            for (let y = x + 1; y < left.length; y++) {
              if (isJoker(left[y])) continue;
              const trio = [left[x], left[y], sp];
              if (analyzeSet(trio).ok) {
                board[b] = board[b].filter((id) => id !== sp);
                board.push(trio);
                left.splice(y, 1);
                left.splice(x, 1);
                changed = true;
                break outer;
              }
            }
          }
        }
      }
    }
  }
  const leftSet = {};
  left.forEach((id) => (leftSet[id] = 1));
  const played = hand.filter((id) => !leftSet[id]);
  if (!played.length) return null;
  const out = { board, played };
  return checkTurn(g, seat, board, played).ok ? out : null;
}

// ---------- 자가 테스트 ----------
const T = (c, n, copy = 0) => copy * 52 + c * 13 + n - 1;

export function runSelfTests(games = 2000) {
  const results = [];
  const ok = (name, cond) => results.push({ name, pass: !!cond });
  const J1 = 104;
  const J2 = 105;
  ok('타일 106개, 종류 53가지', TOTAL_TILES === 106 && kindOf(J2) === 52 && kindOf(T(3, 13, 1)) === 51);
  ok('꽃줄 동백 3-4-5 = 12점', analyzeSet([T(0, 3), T(0, 4), T(0, 5)]).value === 12);
  ok('꽃다발 7 세 색 = 21점', analyzeSet([T(0, 7), T(1, 7), T(2, 7)]).kind === 'group');
  ok('같은 색 7 두 개 꽃다발은 안 됨', !analyzeSet([T(0, 7), T(0, 7, 1), T(2, 7)]).ok);
  ok('두 개짜리는 세트 아님', !analyzeSet([T(0, 3), T(0, 4)]).ok);
  ok('다른 색 섞인 꽃줄은 안 됨', !analyzeSet([T(0, 3), T(1, 4), T(0, 5)]).ok);
  ok('새싹이 빈칸 메움 3-새싹-5', analyzeSet([T(2, 3), J1, T(2, 5)]).value === 12);
  ok('새싹은 높은 쪽으로 12-13-새싹 → 11~13', analyzeSet([T(1, 12), T(1, 13), J1]).value === 36);
  ok('꽃다발 5장은 안 됨', !analyzeSet([T(0, 7), T(1, 7), T(2, 7), T(3, 7), J1]).ok);
  ok('13 다음 1은 이어지지 않음', !analyzeSet([T(0, 12), T(0, 13), T(0, 1)]).ok);
  ok('보여 주기 순서: 새싹이 가운데', orderSet([T(2, 5), J1, T(2, 3)])[1] === J1);
  ok('새싹 값 표시', jokerValues([T(2, 5), J1, T(2, 3)])[J1] === 4);
  // 첫 등록
  const g = newGame(2, 0);
  g.hands[0] = [T(0, 10), T(0, 11), T(0, 12), T(1, 1), T(1, 2), T(1, 3), T(2, 9)];
  g.hands[1] = [T(3, 1)];
  ok('첫 등록 33점 통과', checkTurn(g, 0, [[T(0, 10), T(0, 11), T(0, 12)]], [T(0, 10), T(0, 11), T(0, 12)]).ok);
  ok('첫 등록 6점은 거절', !checkTurn(g, 0, [[T(1, 1), T(1, 2), T(1, 3)]], [T(1, 1), T(1, 2), T(1, 3)]).ok);
  ok('남의 차례 거절', !checkTurn(g, 1, [[T(3, 1)]], [T(3, 1)]).ok);
  ok('아무것도 안 내면 거절', !checkTurn(g, 0, [], []).ok);
  ok('내 패에 없는 타일 거절', !checkTurn(g, 0, [[T(3, 4), T(3, 5), T(3, 6)]], [T(3, 4), T(3, 5), T(3, 6)]).ok);
  playTurn(g, 0, [[T(0, 10), T(0, 11), T(0, 12)]], [T(0, 10), T(0, 11), T(0, 12)]);
  ok('첫 등록 뒤 차례 넘어감', g.turn === 1 && g.opened[0] && g.hands[0].length === 4);
  // 첫 등록 전 판 건드리기 금지
  g.hands[1] = [T(0, 13), T(1, 13), T(2, 13), T(3, 13), T(0, 9)];
  ok('첫 등록 전엔 판에 붙일 수 없음', !checkTurn(g, 1, [[T(0, 9), T(0, 10), T(0, 11), T(0, 12)]], [T(0, 9)]).ok);
  ok('첫 등록 전 새 세트 52점 OK', checkTurn(g, 1, [[T(0, 10), T(0, 11), T(0, 12)], [T(0, 13), T(1, 13), T(2, 13), T(3, 13)]], [T(0, 13), T(1, 13), T(2, 13), T(3, 13)]).ok);
  drawTurn(g, 1);
  // 재배치: 판 10-11-12 를 쪼개고 내 9와 합치기
  g.hands[0] = [T(0, 9), T(1, 10), T(2, 10), T(3, 3)];
  const re = [[T(0, 9), T(0, 11), T(0, 12)], [T(0, 10), T(1, 10), T(2, 10)]];
  ok('재배치 9-11-12는 안 이어짐 → 거절', !checkTurn(g, 0, re, [T(0, 9), T(1, 10), T(2, 10)]).ok);
  ok('판 타일을 손으로 가져가기 거절', !checkTurn(g, 0, [[T(0, 9), T(0, 10), T(0, 11)]], [T(0, 9)]).ok);
  g.hands[0].push(T(0, 13));
  const re2 = [[T(0, 11), T(0, 12), T(0, 13)], [T(0, 10), T(1, 10), T(2, 10)]];
  ok('재배치(쪼개서 꽃다발 만들기) 통과', checkTurn(g, 0, re2, [T(0, 13), T(1, 10), T(2, 10)]).ok);
  // 끝: 더미가 비고 모두 넘기면 점수 적은 사람
  const e = newGame(2, 0);
  e.pool = [];
  e.hands[0] = [T(0, 13), J1];
  e.hands[1] = [T(0, 1), T(1, 2)];
  drawTurn(e, 0);
  drawTurn(e, 1);
  ok('모두 넘기면 손패 점수 적은 사람 승리', e.over && e.winner === 1 && e.scores[0] === 43);
  // 봇 첫 등록 찾기
  const bg = newGame(2, 0);
  bg.hands[0] = [T(0, 5), T(1, 5), T(2, 5), T(3, 8), T(3, 9), T(3, 10), T(1, 1), T(2, 13)];
  const bt = botTurn(bg, 0, 'normal');
  ok('봇이 첫 등록 조합(15+27) 찾음', bt && bt.played.length === 6);
  bg.hands[0] = [T(0, 1), T(0, 2), T(0, 3), T(2, 9)];
  ok('30점 안 되면 봇은 뽑음', botTurn(bg, 0, 'hard') === null);
  // 무작위 봇 대전
  let bad = 0;
  let unfinished = 0;
  let botFail = 0;
  const diffs = ['easy', 'normal', 'normal', 'hard'];
  for (let k = 0; k < games; k++) {
    const n = 2 + (k % 3);
    const t = newGame(n);
    const d = t.hands.map((_, i) => diffs[(k + i) % 4]);
    let guard = 0;
    while (!t.over && guard++ < 1500) {
      const s = t.turn;
      const mv = botTurn(t, s, d[s]);
      try {
        if (mv) playTurn(t, s, mv.board, mv.played);
        else drawTurn(t, s);
      } catch (err) {
        botFail++;
        drawTurn(t, s);
      }
      let total = t.pool.length;
      t.hands.forEach((h) => (total += h.length));
      t.board.forEach((st) => (total += st.length));
      if (total !== TOTAL_TILES) bad++;
    }
    if (!t.over) unfinished++;
    if (t.board.some((st) => !analyzeSet(st).ok)) bad++;
  }
  ok('봇끼리 ' + games + '판: 타일 106개 보존·판 항상 유효', bad === 0);
  ok('봇끼리 ' + games + '판: 모두 끝남', unfinished === 0);
  ok('봇 수는 항상 규칙에 맞음', botFail === 0);
  const passed = results.filter((r) => r.pass).length;
  return { passed, total: results.length, results };
}

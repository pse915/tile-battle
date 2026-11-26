// 흑백 뒤집기 대전 — 규칙 엔진 + minimax 봇 (브라우저와 앱스크립트 서버가 같이 씀)
// 판: 길이 64 배열, 0 빈칸 · 1 흑 · 2 백. 흑이 먼저 둠.
// 규칙: 상대 돌을 내 돌 두 개 사이에 (가로·세로·대각선) 끼우면 뒤집힘. 뒤집을 수 없는 곳엔 못 둠.
//       둘 곳이 없으면 차례가 넘어가고, 둘 다 못 두면 끝 → 돌이 많은 쪽 승리.

export const N = 8;
export const BLACK = 1;
export const WHITE = 2;
export const COLOR_NAME = { 1: '흑', 2: '백' };
const DIRS = [-9, -8, -7, -1, 1, 7, 8, 9];

export const other = (p) => 3 - p;

export function newBoard() {
  const b = new Array(64).fill(0);
  b[27] = WHITE;
  b[36] = WHITE;
  b[28] = BLACK;
  b[35] = BLACK;
  return b;
}

/** idx에 p가 두면 뒤집히는 칸들 */
export function flipsFor(b, p, idx) {
  if (b[idx] !== 0) return [];
  const out = [];
  const r0 = Math.floor(idx / 8);
  const c0 = idx % 8;
  for (const d of DIRS) {
    const dr = Math.sign(Math.round(d / 8));
    const dc = d - dr * 8;
    let r = r0 + dr;
    let c = c0 + dc;
    const line = [];
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && b[r * 8 + c] === other(p)) {
      line.push(r * 8 + c);
      r += dr;
      c += dc;
    }
    if (line.length && r >= 0 && r < 8 && c >= 0 && c < 8 && b[r * 8 + c] === p) out.push(...line);
  }
  return out;
}

export function legalMoves(b, p) {
  const out = [];
  for (let i = 0; i < 64; i++) if (b[i] === 0 && flipsFor(b, p, i).length) out.push(i);
  return out;
}

export function count(b) {
  let x = 0;
  let o = 0;
  for (const v of b) {
    if (v === BLACK) x++;
    else if (v === WHITE) o++;
  }
  return { 1: x, 2: o };
}

/** 새 게임 상태 */
export function newGame() {
  return { board: newBoard(), turn: BLACK, last: -1, flips: [], passed: false, over: false, winner: 0, moves: 0 };
}

/**
 * 두기. 상태를 바꾸고 { flips, passed(다음 사람이 못 둬서 넘어감), over } 를 돌려줌
 */
export function play(g, p, idx) {
  if (g.over) throw new Error('이미 끝난 판이에요.');
  if (p !== g.turn) throw new Error('지금은 상대 차례예요.');
  const flips = flipsFor(g.board, p, idx);
  if (!flips.length) throw new Error('거기는 둘 수 없어요. 상대 돌을 끼워야 해요.');
  g.board[idx] = p;
  for (const f of flips) g.board[f] = p;
  g.last = idx;
  g.flips = flips;
  g.moves++;
  const opp = other(p);
  g.passed = false;
  if (legalMoves(g.board, opp).length) g.turn = opp;
  else if (legalMoves(g.board, p).length) {
    g.turn = p; // 상대가 둘 곳이 없어 한 번 쉼
    g.passed = true;
  } else finish(g);
  return { flips, passed: g.passed, over: g.over };
}

export function finish(g) {
  g.over = true;
  const c = count(g.board);
  g.winner = c[1] > c[2] ? BLACK : c[2] > c[1] ? WHITE : 0;
}

/** 지금 둘 사람이 둘 곳이 없는지 (첫 수 등에서 생길 일은 없지만 안전장치) */
export function ensureMovable(g) {
  if (g.over) return;
  if (!legalMoves(g.board, g.turn).length) {
    if (legalMoves(g.board, other(g.turn)).length) {
      g.turn = other(g.turn);
      g.passed = true;
    } else finish(g);
  }
}

// ---------- 봇 ----------
// 자리 가중치: 모서리는 최고, 모서리 옆(X·C 칸)은 위험
const W = [
  120, -25, 20, 5, 5, 20, -25, 120,
  -25, -45, -4, -4, -4, -4, -45, -25,
  20, -4, 15, 3, 3, 15, -4, 20,
  5, -4, 3, 3, 3, 3, -4, 5,
  5, -4, 3, 3, 3, 3, -4, 5,
  20, -4, 15, 3, 3, 15, -4, 20,
  -25, -45, -4, -4, -4, -4, -45, -25,
  120, -25, 20, 5, 5, 20, -25, 120,
];

function evaluate(b, p) {
  const o = other(p);
  let pos = 0;
  let mine = 0;
  let theirs = 0;
  for (let i = 0; i < 64; i++) {
    if (b[i] === p) {
      pos += W[i];
      mine++;
    } else if (b[i] === o) {
      pos -= W[i];
      theirs++;
    }
  }
  const empties = 64 - mine - theirs;
  const mob = legalMoves(b, p).length - legalMoves(b, o).length;
  // 끝으로 갈수록 돌 개수가 중요
  return pos + mob * 6 + (empties < 14 ? (mine - theirs) * (14 - empties) : 0);
}

function apply(b, p, idx) {
  const nb = b.slice();
  nb[idx] = p;
  for (const f of flipsFor(b, p, idx)) nb[f] = p;
  return nb;
}

function negamax(b, p, depth, alpha, beta, passed) {
  const moves = legalMoves(b, p);
  if (depth === 0) return evaluate(b, p);
  if (!moves.length) {
    if (passed) {
      const c = count(b);
      return (c[p] - c[other(p)]) * 1000;
    }
    return -negamax(b, other(p), depth - 1, -beta, -alpha, true);
  }
  // 좋은 자리부터 보면 가지치기가 잘 됨
  moves.sort((x, y) => W[y] - W[x]);
  let best = -Infinity;
  for (const m of moves) {
    const v = -negamax(apply(b, p, m), other(p), depth - 1, -beta, -alpha, false);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

export const DEPTH = { easy: 1, normal: 3, hard: 5 };

/** 봇이 둘 자리. easy는 가끔 실수, hard는 끝판에 끝까지 읽음 */
export function bestMove(b, p, difficulty = 'normal') {
  const moves = legalMoves(b, p);
  if (!moves.length) return -1;
  if (difficulty === 'easy' && Math.random() < 0.35) return moves[Math.floor(Math.random() * moves.length)];
  const empties = b.filter((v) => v === 0).length;
  let depth = DEPTH[difficulty] || 3;
  if (difficulty === 'hard' && empties <= 10) depth = empties;
  let best = moves[0];
  let bestV = -Infinity;
  for (const m of moves.sort((x, y) => W[y] - W[x])) {
    const v = -negamax(apply(b, p, m), other(p), depth - 1, -Infinity, Infinity, false) + (difficulty === 'easy' ? Math.random() * 30 : 0);
    if (v > bestV) {
      bestV = v;
      best = m;
    }
  }
  return best;
}

export const cellName = (i) => 'ABCDEFGH'[i % 8] + (Math.floor(i / 8) + 1);

// ---------- 자가 테스트 ----------
export function runSelfTests() {
  const results = [];
  const ok = (name, cond) => results.push({ name, pass: !!cond });
  const g = newGame();
  ok('첫 판 흑의 둘 곳 4개', legalMoves(g.board, BLACK).length === 4);
  ok('D3(19)에 두면 1개 뒤집힘', flipsFor(g.board, BLACK, 19).length === 1);
  ok('빈칸 아닌 곳은 못 둠', flipsFor(g.board, BLACK, 27).length === 0);
  play(g, BLACK, 19);
  const c = count(g.board);
  ok('두고 나면 흑 4 백 1', c[1] === 4 && c[2] === 1);
  ok('차례가 백으로', g.turn === WHITE);
  let threw = false;
  try {
    play(g, WHITE, 0);
  } catch {
    threw = true;
  }
  ok('못 두는 곳은 오류', threw);
  // 무작위 판 끝까지: 돌 개수는 늘 (두어진 수 + 4)
  let bad = 0;
  for (let k = 0; k < 300; k++) {
    const t = newGame();
    let guard = 0;
    while (!t.over && guard++ < 70) {
      const ms = legalMoves(t.board, t.turn);
      const before = count(t.board);
      play(t, t.turn, ms[Math.floor(Math.random() * ms.length)]);
      const after = count(t.board);
      if (after[1] + after[2] !== before[1] + before[2] + 1) bad++;
    }
    if (!t.over) bad++;
  }
  ok('무작위 300판 오류 없음', bad === 0);
  // 봇은 모서리를 잡음
  const b = new Array(64).fill(0);
  b[9] = WHITE;
  b[18] = BLACK;
  b[1] = WHITE;
  b[2] = BLACK;
  ok('보통 봇은 모서리(A1)를 잡음', bestMove(b, BLACK, 'normal') === 0);
  ok('봇은 늘 둘 수 있는 곳을 고름', (() => {
    const t = newGame();
    for (let k = 0; k < 20 && !t.over; k++) {
      const m = bestMove(t.board, t.turn, ['easy', 'normal', 'hard'][k % 3]);
      if (!legalMoves(t.board, t.turn).includes(m)) return false;
      play(t, t.turn, m);
    }
    return true;
  })());
  const passed = results.filter((r) => r.pass).length;
  if (typeof console !== 'undefined') console.table?.(results);
  return { passed, total: results.length, results };
}

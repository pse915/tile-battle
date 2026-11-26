// 족보 판정과 비교 — DOM/Three.js에 의존하지 않는 순수 함수 모음

export const SUITS = [
  { key: 'cloud', name: '구름', symbol: '☁', color: '#6b7280' },
  { key: 'star', name: '별', symbol: '★', color: '#2563eb' },
  { key: 'moon', name: '달', symbol: '☾', color: '#15803d' },
  { key: 'sun', name: '해', symbol: '☀', color: '#dc2626' },
];

export const COMBO_NAMES = {
  single: '싱글',
  pair: '페어',
  triple: '트리플',
  straight: '스트레이트',
  flush: '플러시',
  fullhouse: '풀하우스',
  fourkind: '포카드',
  straightflush: '스트레이트 플러시',
};

const FIVE_TIER = { straight: 1, flush: 2, fullhouse: 3, fourkind: 4, straightflush: 5 };

/** 인원수에 따른 최대 숫자 */
export function maxNForPlayers(p) {
  return p <= 3 ? 9 : p === 4 ? 13 : 15;
}

/** 인원수에 따른 1인당 타일 수 (사용하는 타일을 모두 나눔: 3인 12, 4인 13, 5인 12) */
export function handSizeForPlayers(p) {
  return Math.floor((maxNForPlayers(p) * 4) / p);
}

export function makeTile(n, s) {
  return { id: `${n}-${s}`, n, s };
}

export function makeDeck(maxN) {
  const deck = [];
  for (let n = 1; n <= maxN; n++) for (let s = 0; s < 4; s++) deck.push(makeTile(n, s));
  return deck;
}

export function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 숫자 서열: 3이 0, …, 최대숫자, 1, 2(가장 높음) */
export function rankOf(n, maxN) {
  if (n === 1) return maxN - 2;
  if (n === 2) return maxN - 1;
  return n - 3;
}

/** 한 장의 세기 (숫자 서열 → 문양) */
export function valueOf(t, maxN) {
  return rankOf(t.n, maxN) * 4 + t.s;
}

export function sortTiles(tiles, maxN, mode = 'num') {
  return tiles.slice().sort((a, b) =>
    mode === 'suit' ? a.s - b.s || valueOf(a, maxN) - valueOf(b, maxN) : valueOf(a, maxN) - valueOf(b, maxN),
  );
}

export function tileLabel(t) {
  return `${SUITS[t.s].symbol}${t.n}`;
}

/** 스트레이트의 숫자 세기. 1-2-3-4-5 최강, 2-3-4-5-6 두 번째, 나머지는 가장 높은 숫자. 아니면 null */
function straightPower(nums) {
  const s = nums.slice().sort((a, b) => a - b);
  for (let i = 1; i < 5; i++) if (s[i] !== s[i - 1] + 1) return null;
  const low = s[0];
  if (low === 1) return 100;
  if (low === 2) return 99;
  return low + 4;
}

/**
 * 조합 분석. 낼 수 없는 조합이면 null.
 * 반환: { type, size, key, name }  — 같은 size끼리 key가 클수록 강함
 */
export function analyze(tiles, maxN) {
  const k = tiles.length;
  if (k === 0) return null;
  const counts = new Map();
  for (const t of tiles) counts.set(t.n, (counts.get(t.n) || 0) + 1);
  const top = tiles.reduce((m, t) => (valueOf(t, maxN) > valueOf(m, maxN) ? t : m), tiles[0]);
  const mk = (type, key) => ({ type, size: k, key, name: COMBO_NAMES[type] });

  if (k === 1) return mk('single', valueOf(tiles[0], maxN));
  if (k === 2) {
    if (counts.size !== 1) return null;
    return mk('pair', rankOf(tiles[0].n, maxN) * 4 + Math.max(tiles[0].s, tiles[1].s));
  }
  if (k === 3) {
    if (counts.size !== 1) return null;
    return mk('triple', rankOf(tiles[0].n, maxN));
  }
  if (k !== 5) return null;

  const isFlush = tiles.every((t) => t.s === tiles[0].s);
  const sp = counts.size === 5 ? straightPower(tiles.map((t) => t.n)) : null;
  const five = (type, primary, secondary = 0) => mk(type, FIVE_TIER[type] * 10000 + primary * 4 + secondary);

  if (sp !== null && isFlush) return five('straightflush', sp, top.s);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (groups[0][1] === 4) return five('fourkind', rankOf(groups[0][0], maxN));
  if (groups[0][1] === 3 && groups[1][1] === 2) return five('fullhouse', rankOf(groups[0][0], maxN));
  if (isFlush) return five('flush', valueOf(top, maxN));
  if (sp !== null) return five('straight', sp, top.s);
  return null;
}

/** a가 바닥 b를 이길 수 있는가 */
export function beats(a, b) {
  if (!a) return false;
  if (!b) return true;
  return a.size === b.size && a.key > b.key;
}

function combinations(arr, k, start = 0, cur = [], out = []) {
  if (cur.length === k) {
    out.push(cur.slice());
    return out;
  }
  for (let i = start; i <= arr.length - (k - cur.length); i++) {
    cur.push(arr[i]);
    combinations(arr, k, i + 1, cur, out);
    cur.pop();
  }
  return out;
}

/** 손패로 만들 수 있는 모든 조합 */
export function allPlays(hand, maxN) {
  const plays = [];
  for (const k of [1, 2, 3, 5]) {
    if (hand.length < k) continue;
    for (const c of combinations(hand, k)) {
      const combo = analyze(c, maxN);
      if (combo) plays.push({ tiles: c, combo });
    }
  }
  return plays;
}

/** 지금 낼 수 있는 조합 (바닥, 첫 수에 꼭 넣어야 할 타일 고려) */
export function legalPlays(hand, table, maxN, mustId = null) {
  return allPlays(hand, maxN).filter(
    (p) => beats(p.combo, table) && (!mustId || p.tiles.some((t) => t.id === mustId)),
  );
}

/** 선택한 타일을 낼 수 있는지와 그 이유 */
export function checkPlay(tiles, table, maxN, mustId = null) {
  if (!tiles.length) return { ok: false, reason: '낼 타일을 먼저 골라 주세요.' };
  const combo = analyze(tiles, maxN);
  if (!combo) {
    if (tiles.length === 4) return { ok: false, reason: '4장 조합은 없어요. 1·2·3·5장으로 내세요.' };
    return { ok: false, reason: '족보가 되지 않는 조합이에요.' };
  }
  if (mustId && !tiles.some((t) => t.id === mustId))
    return { ok: false, reason: '첫 수에는 구름 3이 꼭 들어가야 해요.' };
  if (table && combo.size !== table.size)
    return { ok: false, reason: `바닥과 같은 ${table.size}장으로 내야 해요.` };
  if (table && !beats(combo, table)) {
    if (combo.size === 5 && Math.floor(combo.key / 10000) < Math.floor(table.key / 10000))
      return { ok: false, reason: `${combo.name}는 ${table.name}보다 약한 족보예요.` };
    return { ok: false, reason: '바닥보다 센 조합을 내야 해요.' };
  }
  return { ok: true, combo };
}

/** 라운드 끝 점수: 남은 장수 × 2^(손에 남은 2의 수) */
export function roundScore(hand) {
  const twos = hand.filter((t) => t.n === 2).length;
  return { left: hand.length, twos, score: hand.length * 2 ** twos };
}

/** 모든 쌍마다 점수 차이만큼 칩 이동. 반환: 각 플레이어 칩 변화량과 이동 목록 */
export function settle(scores) {
  const delta = scores.map(() => 0);
  const transfers = [];
  for (let i = 0; i < scores.length; i++)
    for (let j = i + 1; j < scores.length; j++) {
      const d = scores[i] - scores[j];
      if (d === 0) continue;
      const [from, to, amt] = d > 0 ? [i, j, d] : [j, i, -d];
      delta[from] -= amt;
      delta[to] += amt;
      transfers.push({ from, to, amount: amt });
    }
  return { delta, transfers };
}

// ---------- 자가 테스트 (?test) ----------
export function runSelfTests() {
  const T = (n, s) => makeTile(n, s);
  const C = 0, S = 1, M = 2, H = 3; // 구름 별 달 해
  const results = [];
  const check = (name, cond) => results.push({ name, pass: !!cond });
  const A = (tiles, maxN = 15) => analyze(tiles, maxN);

  check('숫자 서열: 2 > 1 > 15 > 3', valueOf(T(2, C), 15) > valueOf(T(1, H), 15) && valueOf(T(1, C), 15) > valueOf(T(15, H), 15) && valueOf(T(3, H), 15) < valueOf(T(4, C), 15));
  check('3인(최대 9): 1 > 9', valueOf(T(1, C), 9) > valueOf(T(9, H), 9));
  check('문양 비교: 해7 > 달7 > 별7 > 구름7', A([T(7, H)]).key > A([T(7, M)]).key && A([T(7, M)]).key > A([T(7, S)]).key && A([T(7, S)]).key > A([T(7, C)]).key);
  check('페어 문양 비교: 7(해포함) > 7(달포함)', beats(A([T(7, H), T(7, C)]), A([T(7, M), T(7, S)])));
  check('페어 판정 실패: 7+8', A([T(7, C), T(8, C)]) === null);
  check('4장은 족보 아님', A([T(7, C), T(7, S), T(7, M), T(7, H)]) === null);

  const s12345 = A([T(1, C), T(2, S), T(3, M), T(4, H), T(5, C)]);
  const s23456 = A([T(2, C), T(3, S), T(4, M), T(5, H), T(6, C)]);
  const s9to13 = A([T(9, C), T(10, S), T(11, M), T(12, H), T(13, C)]);
  const s11to15 = A([T(11, C), T(12, S), T(13, M), T(14, H), T(15, C)]);
  check('1-2-3-4-5는 스트레이트', s12345 && s12345.type === 'straight');
  check('1-2-3-4-5가 최강 스트레이트', beats(s12345, s23456) && beats(s12345, s11to15));
  check('2-3-4-5-6이 두 번째', beats(s23456, s11to15) && !beats(s23456, s12345));
  check('그 외 스트레이트는 가장 높은 숫자로 비교', beats(s11to15, s9to13));
  check('랩어라운드 13-14-15-1-2 불가', A([T(13, C), T(14, S), T(15, M), T(1, H), T(2, C)]) === null);
  check('같은 숫자 스트레이트는 최고 타일 문양으로', beats(A([T(4, C), T(5, S), T(6, M), T(7, C), T(8, H)]), A([T(4, H), T(5, H), T(6, S), T(7, M), T(8, M)])));

  const fh7 = A([T(7, C), T(7, S), T(7, M), T(4, C), T(4, S)]);
  const fh5 = A([T(5, C), T(5, S), T(5, M), T(2, C), T(2, S)]);
  const fh2 = A([T(2, C), T(2, S), T(2, M), T(3, C), T(3, S)]);
  check('풀하우스 판정', fh7 && fh7.type === 'fullhouse');
  check('풀하우스끼리: 트리플 숫자로 비교 (7 > 5, 페어 무시)', beats(fh7, fh5) && !beats(fh5, fh7));
  check('풀하우스끼리: 2 트리플이 최강', beats(fh2, fh7));

  const flush = A([T(3, M), T(6, M), T(8, M), T(10, M), T(12, M)]);
  const four = A([T(6, C), T(6, S), T(6, M), T(6, H), T(3, C)]);
  const sf = A([T(3, C), T(4, C), T(5, C), T(6, C), T(7, C)]);
  check('족보 서열: 스트레이트 < 플러시 < 풀하우스 < 포카드 < 스트레이트 플러시',
    beats(flush, s12345) && beats(fh5, flush) && beats(four, fh2) && beats(sf, four));
  check('다른 장수는 이길 수 없음', !beats(A([T(2, H)]), A([T(3, C), T(3, S)])));

  const sc = settle([0, 3, 8]);
  check('정산: [0,3,8] → [+11, +2, -13]', sc.delta[0] === 11 && sc.delta[1] === 2 && sc.delta[2] === -13);
  check('2를 들고 있으면 2배: 4장(2 하나) = 8점', roundScore([T(2, C), T(5, C), T(6, C), T(7, C)]).score === 8);
  check('인원별 타일 수', handSizeForPlayers(3) === 12 && handSizeForPlayers(4) === 13 && handSizeForPlayers(5) === 12);

  const passed = results.filter((r) => r.pass).length;
  console.group(`%c족보 자가 테스트: ${passed}/${results.length} 통과`, `color:${passed === results.length ? '#15803d' : '#dc2626'};font-weight:bold`);
  for (const r of results) console.log(`${r.pass ? '✅' : '❌'} ${r.name}`);
  console.groupEnd();
  return { passed, total: results.length, results };
}

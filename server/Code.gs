// ⚠️ 자동 생성 파일입니다. 직접 고치지 말고 tools/build-gs.mjs를 다시 실행하세요.
// 시험 끝! 타일 배틀 — 온라인 대기방 서버 (Google Apps Script)
// 설정 방법은 README.md의 '온라인 대기방 설정'을 보세요.

// ==================== 규칙 (js/rules.js와 같은 코드) ====================
// 족보 판정과 비교 — DOM/Three.js에 의존하지 않는 순수 함수 모음

const SUITS = [
  { key: 'cloud', name: '구름', symbol: '☁', color: '#6b7280' },
  { key: 'star', name: '별', symbol: '★', color: '#2563eb' },
  { key: 'moon', name: '달', symbol: '☾', color: '#15803d' },
  { key: 'sun', name: '해', symbol: '☀', color: '#dc2626' },
];

const COMBO_NAMES = {
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
function maxNForPlayers(p) {
  return p <= 3 ? 9 : p === 4 ? 13 : 15;
}

/** 인원수에 따른 1인당 타일 수 (사용하는 타일을 모두 나눔: 3인 12, 4인 13, 5인 12) */
function handSizeForPlayers(p) {
  return Math.floor((maxNForPlayers(p) * 4) / p);
}

function makeTile(n, s) {
  return { id: `${n}-${s}`, n, s };
}

function makeDeck(maxN) {
  const deck = [];
  for (let n = 1; n <= maxN; n++) for (let s = 0; s < 4; s++) deck.push(makeTile(n, s));
  return deck;
}

function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 숫자 서열: 3이 0, …, 최대숫자, 1, 2(가장 높음) */
function rankOf(n, maxN) {
  if (n === 1) return maxN - 2;
  if (n === 2) return maxN - 1;
  return n - 3;
}

/** 한 장의 세기 (숫자 서열 → 문양) */
function valueOf(t, maxN) {
  return rankOf(t.n, maxN) * 4 + t.s;
}

function sortTiles(tiles, maxN, mode = 'num') {
  return tiles.slice().sort((a, b) =>
    mode === 'suit' ? a.s - b.s || valueOf(a, maxN) - valueOf(b, maxN) : valueOf(a, maxN) - valueOf(b, maxN),
  );
}

function tileLabel(t) {
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
function analyze(tiles, maxN) {
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
function beats(a, b) {
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
function allPlays(hand, maxN) {
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
function legalPlays(hand, table, maxN, mustId = null) {
  return allPlays(hand, maxN).filter(
    (p) => beats(p.combo, table) && (!mustId || p.tiles.some((t) => t.id === mustId)),
  );
}

/** 선택한 타일을 낼 수 있는지와 그 이유 */
function checkPlay(tiles, table, maxN, mustId = null) {
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
function roundScore(hand) {
  const twos = hand.filter((t) => t.n === 2).length;
  return { left: hand.length, twos, score: hand.length * 2 ** twos };
}

/** 모든 쌍마다 점수 차이만큼 칩 이동. 반환: 각 플레이어 칩 변화량과 이동 목록 */
function settle(scores) {
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
function runSelfTests() {
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

// ==================== AI (js/ai.js와 같은 코드) ====================
// AI 플레이어 — 쉬움 / 보통 / 어려움

/** 조합의 '아까움' 정도: 높은 숫자와 2를 많이 쓸수록 큼 */
function cost(play, maxN) {
  let c = 0;
  for (const t of play.tiles) {
    const r = rankOf(t.n, maxN) / (maxN - 1); // 0..1
    c += r * r * 3 + (t.n === 2 ? 3 : 0);
  }
  return c / play.tiles.length;
}

/** 이 조합을 내면 다른 페어·트리플이 깨지는가 */
function breaksGroups(play, hand) {
  let broken = 0;
  for (const n of new Set(play.tiles.map((t) => t.n))) {
    const total = hand.filter((t) => t.n === n).length;
    const usedN = play.tiles.filter((t) => t.n === n).length;
    if (total - usedN === 1) broken++; // 묶음을 쪼개 한 장만 외톨이로 남김
  }
  return broken;
}

/**
 * @param {object} p
 * @param {Array} p.hand  AI 손패
 * @param {object|null} p.table  바닥 조합 (null이면 선)
 * @param {number} p.maxN
 * @param {string|null} p.mustId  첫 수 필수 타일
 * @param {'easy'|'normal'|'hard'} p.difficulty
 * @param {number[]} p.oppCounts  다른 플레이어 남은 타일 수
 * @returns {Array|null} 낼 타일 배열, 패스면 null
 */
function chooseMove({ hand, table, maxN, mustId = null, difficulty = 'normal', oppCounts = [], rnd = Math.random }) {
  const plays = legalPlays(hand, table, maxN, mustId);
  if (!plays.length) return null;
  const leading = !table;

  // 한 번에 다 털 수 있으면 무조건 낸다
  const finisher = plays.find((p) => p.tiles.length === hand.length);
  if (finisher) return finisher.tiles;

  if (difficulty === 'easy') {
    if (!leading && rnd() < 0.3) return null;
    // 무작위지만 너무 센 패는 조금 덜 고르게
    const weighted = plays.map((p) => ({ p, w: 1 / (1 + cost(p, maxN)) }));
    let r = rnd() * weighted.reduce((s, x) => s + x.w, 0);
    for (const x of weighted) if ((r -= x.w) <= 0) return x.p.tiles;
    return plays[0].tiles;
  }

  const minOpp = oppCounts.length ? Math.min(...oppCounts) : 13;
  const danger = difficulty === 'hard' && minOpp <= 2;

  const score = (p) => {
    let s = cost(p, maxN) + breaksGroups(p, hand) * 0.8;
    if (leading) s -= p.tiles.length * 0.9; // 선일 때는 여러 장을 한 번에 털기
    if (danger) {
      s -= p.combo.key / 10000; // 위험할 때는 센 패로 막기
      if (leading && p.tiles.length === minOpp) s += 2; // 상대가 낼 수 있는 장수는 피하기
    }
    return s;
  };

  const sorted = plays.slice().sort((a, b) => score(a) - score(b));
  const best = sorted[0];

  if (difficulty === 'hard' && !leading && !danger) {
    // 2나 아주 센 패를 아직 많이 남은 상황에서 쓰지 않기
    const usesTwo = best.tiles.some((t) => t.n === 2);
    const strong = best.tiles.every((t) => valueOf(t, maxN) >= (maxN - 2) * 4);
    if ((usesTwo || strong) && hand.length > 4 && minOpp > 4) return null;
  }
  if (difficulty === 'normal' && !leading && best.tiles.some((t) => t.n === 2) && hand.length > 6 && rnd() < 0.5) return null;

  return best.tiles;
}

/** 힌트: 사람에게 추천할 가장 약한 조합 */
function hintMove(hand, table, maxN, mustId) {
  const plays = legalPlays(hand, table, maxN, mustId);
  if (!plays.length) return null;
  plays.sort((a, b) => cost(a, maxN) - cost(b, maxN) - (table ? 0 : (b.tiles.length - a.tiles.length) * 0.4));
  return plays[0].tiles;
}

// ==================== 대기방 서버 ====================
// ===== 온라인 대기방 서버 (Google Apps Script 웹 앱) =====
// 이 파일은 tools/build-gs.mjs가 rules.js, ai.js와 합쳐 server/Code.gs로 만듭니다.
// 실시간 방 상태는 CacheService(빠름)에, 방 기록은 연결된 구글 시트에 남깁니다.

// 방 기록을 남길 구글 시트 ID (주소의 /d/와 /edit 사이). 시트에서 연 스크립트라면 비워 둬도 됨
const SHEET_ID = '';
const ROOM_TTL = 21600; // 방 상태 보관 시간(초): 6시간
const BOT_DELAY_MS = 1100; // 봇이 생각하는 시간
const AWAY_SEC = 45; // 이 시간 동안 소식이 없으면 '자리 비움' → 봇이 대신 둠
const MAX_EVENTS = 60;
const HUMAN_EMOJI = ['🙂', '😎', '🤓', '😺', '🐥'];
const BOT_CAST = [
  { name: '토끼 봇', emoji: '🐰' },
  { name: '곰 봇', emoji: '🐻' },
  { name: '여우 봇', emoji: '🦊' },
  { name: '펭귄 봇', emoji: '🐧' },
];

function doGet() {
  return toJson({ ok: true, service: 'tile-battle', time: Date.now() });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return toJson({ ok: false, error: '잘못된 요청이에요.' });
  }
  try {
    return toJson(handleRequest(req));
  } catch (err) {
    return toJson({ ok: false, error: String((err && err.message) || err) });
  }
}

function toJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- 저장소 ----------
function roomCache() {
  return CacheService.getScriptCache();
}
function loadRoom(code) {
  const raw = roomCache().get('room_' + code);
  return raw ? JSON.parse(raw) : null;
}
function saveRoom(room) {
  room.version++;
  roomCache().put('room_' + room.code, JSON.stringify(room), ROOM_TTL);
}
function deleteRoom(code) {
  roomCache().remove('room_' + code);
}
function markSeen(code, pid) {
  roomCache().put('seen_' + code + '_' + pid, '1', AWAY_SEC);
}
function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
function fail(msg) {
  throw new Error(msg);
}
function newId() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 16);
}
function cleanName(name) {
  return String(name || '').replace(/[<>]/g, '').trim().slice(0, 8) || '친구';
}

/** 시트에 방 기록 남기기 (시트에 연결되지 않은 스크립트면 조용히 건너뜀) */
function logRoom(room, event, detail) {
  try {
    if (typeof SpreadsheetApp === 'undefined') return;
    const ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return;
    const sh = ss.getSheetByName('방 기록') || ss.insertSheet('방 기록');
    if (sh.getLastRow() === 0) sh.appendRow(['시간', '방 코드', '일', '참가자', '내용']);
    sh.appendRow([new Date(), "'" + room.code, event, room.players.map((p) => p.name).join(', '), detail || '']);
  } catch (err) {
    /* 기록 실패는 게임에 영향 없음 */
  }
}

// ---------- 요청 처리 ----------
function handleRequest(req) {
  const action = req.action;
  if (action === 'create') return withLock(() => createRoom(req));
  const code = String(req.code || '').trim();
  if (!/^\d{4}$/.test(code)) fail('방 코드는 숫자 4자리예요.');
  if (action === 'join') return withLock(() => joinRoom(code, req));
  if (action === 'poll') return pollRoom(code, req);

  return withLock(() => {
    const room = loadRoom(code);
    if (!room) fail('방이 사라졌어요. 새로 만들어 주세요.');
    const me = room.players.find((p) => p.id === req.pid);
    if (!me) fail('이 방의 참가자가 아니에요.');
    markSeen(code, me.id);
    const isHost = room.hostId === me.id;
    const hostOnly = () => isHost || fail('방장만 할 수 있어요.');
    switch (action) {
      case 'leave':
        if (leaveRoom(room, me)) return { ok: true, left: true };
        break;
      case 'addBot':
        hostOnly();
        addBot(room, req.difficulty);
        break;
      case 'removeBot':
        hostOnly();
        removeBot(room, req.botId);
        break;
      case 'config':
        hostOnly();
        room.rounds = [3, 5, 7].indexOf(Number(req.rounds)) >= 0 ? Number(req.rounds) : 5;
        break;
      case 'start':
        hostOnly();
        startGame(room);
        break;
      case 'play':
        playTiles(room, me, req.tiles || []);
        break;
      case 'pass':
        passTurn(room, me);
        break;
      case 'next':
        hostOnly();
        if (room.status !== 'roundEnd') fail('아직 라운드가 끝나지 않았어요.');
        startRound(room);
        break;
      case 'lobby':
        hostOnly();
        backToLobby(room);
        break;
      default:
        fail('알 수 없는 요청이에요.');
    }
    saveRoom(room);
    return roomView(room, me.id);
  });
}

function createRoom(req) {
  let code = '';
  for (let i = 0; i < 30 && !code; i++) {
    const c = String(Math.floor(1000 + Math.random() * 9000));
    if (!loadRoom(c)) code = c;
  }
  if (!code) fail('지금은 방을 만들 수 없어요. 잠시 뒤 다시 해 보세요.');
  const host = makePlayer(req.name, []);
  const room = {
    code,
    version: 0,
    created: Date.now(),
    status: 'lobby',
    hostId: host.id,
    rounds: 5,
    round: 0,
    players: [host],
    events: [],
    seq: 0,
  };
  saveRoom(room);
  markSeen(code, host.id);
  logRoom(room, '방 만듦');
  return roomView(room, host.id);
}

function makePlayer(name, players) {
  const used = players.map((p) => p.emoji);
  let n = cleanName(name);
  const names = players.map((p) => p.name);
  for (let k = 2; names.indexOf(n) >= 0; k++) n = cleanName(name).slice(0, 6) + k;
  return {
    id: newId(),
    name: n,
    emoji: HUMAN_EMOJI.find((e) => used.indexOf(e) < 0) || '🙂',
    bot: false,
    chips: 60,
    hand: [],
  };
}

function joinRoom(code, req) {
  const room = loadRoom(code);
  if (!room) fail('그런 방이 없어요. 코드를 확인해 주세요.');
  const again = req.pid && room.players.find((p) => p.id === req.pid && !p.left);
  if (again) {
    markSeen(code, again.id);
    return roomView(room, again.id);
  }
  if (room.status !== 'lobby') fail('이미 게임이 시작된 방이에요.');
  if (room.players.length >= 5) fail('방이 가득 찼어요 (최대 5명).');
  const p = makePlayer(req.name, room.players);
  room.players.push(p);
  saveRoom(room);
  markSeen(code, p.id);
  return roomView(room, p.id);
}

/** true를 돌려주면 방이 없어진 것 */
function leaveRoom(room, me) {
  if (room.status === 'lobby') {
    room.players = room.players.filter((p) => p.id !== me.id);
  } else {
    // 게임 중에 나가면 봇이 대신 둠
    me.left = true;
    me.bot = true;
    me.difficulty = 'normal';
    me.name = me.name.slice(0, 6) + '(봇)';
  }
  const humans = room.players.filter((p) => !p.bot);
  if (!humans.length) {
    deleteRoom(room.code);
    return true;
  }
  if (room.hostId === me.id) room.hostId = humans[0].id;
  return false;
}

function addBot(room, difficulty) {
  if (room.status !== 'lobby') fail('대기방에서만 봇을 넣을 수 있어요.');
  if (room.players.length >= 5) fail('방이 가득 찼어요 (최대 5명).');
  const used = room.players.map((p) => p.name);
  const cast = BOT_CAST.find((c) => used.indexOf(c.name) < 0) || BOT_CAST[0];
  room.players.push({
    id: 'bot' + newId(),
    name: cast.name,
    emoji: cast.emoji,
    bot: true,
    difficulty: ['easy', 'normal', 'hard'].indexOf(difficulty) >= 0 ? difficulty : 'normal',
    chips: 60,
    hand: [],
  });
}

function removeBot(room, botId) {
  if (room.status !== 'lobby') fail('대기방에서만 뺄 수 있어요.');
  room.players = room.players.filter((p) => !(p.bot && p.id === botId));
}

// ---------- 게임 진행 ----------
function pushEvent(room, ev) {
  ev.seq = ++room.seq;
  room.events.push(ev);
  while (room.events.length > MAX_EVENTS) room.events.shift();
}

function startGame(room) {
  if (room.status !== 'lobby') fail('이미 시작했어요.');
  if (room.players.length < 3) fail('3명 이상 모여야 시작할 수 있어요. 봇을 넣어 보세요.');
  room.players.forEach((p) => (p.chips = 60));
  room.round = 0;
  logRoom(room, '게임 시작', room.rounds + '판');
  startRound(room);
}

function startRound(room) {
  const n = room.players.length;
  room.round++;
  room.maxN = maxNForPlayers(n);
  const per = handSizeForPlayers(n);
  const deck = shuffle(makeDeck(room.maxN));
  room.players.forEach((p, i) => (p.hand = sortTiles(deck.slice(i * per, (i + 1) * per), room.maxN)));
  room.table = null;
  room.tableTiles = [];
  room.lastPlayer = null;
  room.passCount = 0;
  room.mustId = '3-0';
  room.current = room.players.findIndex((p) => p.hand.some((t) => t.id === '3-0'));
  room.status = 'playing';
  room.result = null;
  room.lastActionAt = Date.now();
  pushEvent(room, { type: 'round', round: room.round, starter: room.current });
}

function seatOf(room, me) {
  return room.players.findIndex((p) => p.id === me.id);
}

function playTiles(room, me, ids) {
  if (room.status !== 'playing') fail('지금은 낼 수 없어요.');
  const seat = seatOf(room, me);
  if (room.current !== seat) fail('아직 내 차례가 아니에요.');
  const uniq = ids.filter((id, i) => ids.indexOf(id) === i);
  const tiles = uniq.map((id) => me.hand.find((t) => t.id === id));
  if (!tiles.length || tiles.some((t) => !t) || uniq.length !== ids.length) fail('손에 없는 타일이에요.');
  const check = checkPlay(tiles, room.table, room.maxN, room.mustId);
  if (!check.ok) fail(check.reason);
  applyPlay(room, seat, tiles);
}

function applyPlay(room, seat, tiles) {
  const p = room.players[seat];
  const ids = tiles.map((t) => t.id);
  p.hand = p.hand.filter((t) => ids.indexOf(t.id) < 0);
  const ordered = sortTiles(tiles, room.maxN);
  const combo = analyze(ordered, room.maxN);
  room.table = combo;
  room.tableTiles = ordered;
  room.lastPlayer = seat;
  room.passCount = 0;
  room.mustId = null;
  room.lastActionAt = Date.now();
  pushEvent(room, { type: 'play', seat, tiles: ordered, name: combo.name, size: combo.size });
  if (!p.hand.length) endRound(room, seat);
  else room.current = (seat + 1) % room.players.length;
}

function passTurn(room, me) {
  if (room.status !== 'playing') fail('지금은 패스할 수 없어요.');
  const seat = seatOf(room, me);
  if (room.current !== seat) fail('아직 내 차례가 아니에요.');
  if (!room.table) fail('바닥이 비어 있을 때는 패스할 수 없어요. 아무 조합이나 내세요.');
  applyPass(room, seat);
}

function applyPass(room, seat) {
  room.passCount++;
  room.lastActionAt = Date.now();
  pushEvent(room, { type: 'pass', seat });
  if (room.passCount >= room.players.length - 1) {
    room.table = null;
    room.tableTiles = [];
    room.passCount = 0;
    room.current = room.lastPlayer;
    pushEvent(room, { type: 'sweep', leader: room.current });
  } else {
    room.current = (seat + 1) % room.players.length;
  }
}

function endRound(room, winner) {
  const scores = room.players.map((p) => roundScore(p.hand));
  const s = settle(scores.map((x) => x.score));
  room.players.forEach((p, i) => (p.chips += s.delta[i]));
  const over = room.round >= room.rounds || room.players.some((p) => p.chips <= 0);
  room.status = over ? 'finished' : 'roundEnd';
  room.current = -1;
  room.result = {
    round: room.round,
    winner,
    scores,
    delta: s.delta,
    transfers: s.transfers,
    over,
    chips: room.players.map((p) => p.chips),
  };
  pushEvent(room, Object.assign({ type: 'roundEnd' }, room.result));
  if (over) logRoom(room, '게임 끝', room.players.map((p) => p.name + ' ' + p.chips).join(' / '));
}

function backToLobby(room) {
  if (room.status === 'playing') fail('게임 중에는 대기방으로 갈 수 없어요.');
  room.players = room.players.filter((p) => !p.left);
  room.players.forEach((p) => {
    p.hand = [];
    p.chips = 60;
  });
  room.status = 'lobby';
  room.round = 0;
  room.table = null;
  room.tableTiles = [];
  room.result = null;
  pushEvent(room, { type: 'lobby' });
}

// ---------- 폴링 (봇 / 자리 비운 사람 대신 두기) ----------
function isAway(room, p, seenMap) {
  return !p.bot && !seenMap['seen_' + room.code + '_' + p.id];
}

function seenMapFor(room) {
  return roomCache().getAll(room.players.filter((p) => !p.bot).map((p) => 'seen_' + room.code + '_' + p.id)) || {};
}

function needsAutoMove(room, seenMap) {
  if (room.status !== 'playing') return false;
  const p = room.players[room.current];
  if (!p || (!p.bot && !isAway(room, p, seenMap))) return false;
  return Date.now() - room.lastActionAt >= (p.bot ? BOT_DELAY_MS : 3000);
}

function autoMove(room) {
  const seat = room.current;
  const p = room.players[seat];
  const tiles = chooseMove({
    hand: p.hand,
    table: room.table,
    maxN: room.maxN,
    mustId: room.mustId,
    difficulty: p.bot ? p.difficulty : 'easy',
    oppCounts: room.players.filter((_, k) => k !== seat).map((q) => q.hand.length),
  });
  if (tiles) applyPlay(room, seat, tiles);
  else if (room.table) applyPass(room, seat);
  else applyPlay(room, seat, legalPlays(p.hand, null, room.maxN, room.mustId)[0].tiles);
}

function pollRoom(code, req) {
  let room = loadRoom(code);
  if (!room) return { ok: false, gone: true, error: '방이 사라졌어요.' };
  const me = room.players.find((p) => p.id === req.pid);
  if (!me) return { ok: false, gone: true, error: '방에서 나가졌어요.' };
  markSeen(code, me.id);
  if (needsAutoMove(room, seenMapFor(room))) {
    room = withLock(() => {
      const r = loadRoom(code);
      if (r && needsAutoMove(r, seenMapFor(r))) {
        autoMove(r);
        saveRoom(r);
      }
      return r;
    });
    if (!room) return { ok: false, gone: true, error: '방이 사라졌어요.' };
  }
  if (Number(req.since) === room.version) return { ok: true, same: true, version: room.version };
  return roomView(room, me.id);
}

/** 각 참가자에게 보내는 화면용 상태 (남의 손패는 장수만) */
function roomView(room, pid) {
  const seen = seenMapFor(room);
  const mySeat = room.players.findIndex((p) => p.id === pid);
  return {
    ok: true,
    version: room.version,
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    rounds: room.rounds,
    round: room.round,
    me: pid,
    mySeat,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      bot: !!p.bot,
      difficulty: p.difficulty || null,
      chips: p.chips,
      count: p.hand.length,
      away: isAway(room, p, seen),
    })),
    hand: mySeat >= 0 ? room.players[mySeat].hand : [],
    table: room.table || null,
    tableTiles: room.tableTiles || [],
    current: room.status === 'playing' ? room.current : -1,
    mustId: room.mustId || null,
    lastPlayer: room.lastPlayer,
    result: room.result || null,
    events: room.events,
    seq: room.seq,
  };
}

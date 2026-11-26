// ⚠️ 자동 생성 파일입니다. 직접 고치지 말고 tools/build-gs.mjs를 다시 실행하세요.
// 학교 게임 모음 — 공용 온라인 대기방 서버 (Google Apps Script)
// 포함된 게임: tile-battle, deep-sea
// 설정 방법은 README.md의 '온라인 대기방 설정'을 보세요.

// ==================== 공용 대기방 (server/core.js) ====================
// ===== 공용 온라인 대기방 서버 (Google Apps Script 웹 앱) =====
// 방 만들기·참여·나가기, 4자리 코드, 방장, 봇, 폴링, 자리 비움 처리를 맡고
// 실제 규칙은 server/games/*.js 의 게임 모듈이 처리합니다.
// tools/build-gs.mjs가 이 파일과 게임 모듈을 합쳐 server/Code.gs로 만듭니다.

// 방 기록을 남길 구글 시트 ID (주소의 /d/와 /edit 사이). 시트에서 연 스크립트라면 비워 둬도 됨
const SHEET_ID = '';
const ROOM_TTL = 21600; // 방 상태 보관 시간(초): 6시간
const AWAY_SEC = 45; // 이 시간 동안 소식이 없으면 '자리 비움' → 봇이 대신 둠
const AWAY_MOVE_MS = 3000;
const MAX_EVENTS = 80;
const DEFAULT_GAME = 'tile-battle'; // game 필드가 없는 예전 클라이언트용
const HUMAN_EMOJI = ['🙂', '😎', '🤓', '😺', '🐥', '🦄'];
const DEFAULT_BOTS = [
  { name: '토끼 봇', emoji: '🐰' },
  { name: '곰 봇', emoji: '🐻' },
  { name: '여우 봇', emoji: '🦊' },
  { name: '펭귄 봇', emoji: '🐧' },
  { name: '고양이 봇', emoji: '🐱' },
];

/**
 * 게임 모듈 등록. 모듈 인터페이스:
 *  title, minPlayers, maxPlayers, bots?            기본 정보
 *  config(room, req)                               대기방 설정 (선택)
 *  start(room)                                     게임 시작: room.status = 'playing'
 *  act(room, seat, req)                            그 밖의 요청 (내기, 뒤집기 …)
 *  actor(room) → seat | -1                         지금 대신 둘 필요가 있는 사람
 *  botDelay(room) → ms                             봇이 생각하는 시간
 *  botMove(room, seat)                             봇 / 자리 비운 사람 대신 두기
 *  view(room, seat) → {}                           참가자 한 명에게 보낼 상태 (숨김 정보 주의!)
 *  playerView(room, p, i) → {}                     공개해도 되는 참가자별 정보
 *  reset(room)                                     대기방으로 돌아갈 때 정리
 *  onLeave(room, p)                                게임 중에 나갔을 때 (선택)
 */
const GAMES = {};
function registerGame(id, mod) {
  GAMES[id] = mod;
}
function gameOf(room) {
  return GAMES[room.game] || fail('알 수 없는 게임이에요.');
}

function doGet() {
  return toJson({ ok: true, service: 'school-games', games: Object.keys(GAMES), time: Date.now() });
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
  if (!raw) return null;
  const room = JSON.parse(raw);
  if (!room.game) room.game = DEFAULT_GAME; // 업데이트 전에 만들어진 방
  return room;
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
function pushEvent(room, ev) {
  ev.seq = ++room.seq;
  room.events.push(ev);
  while (room.events.length > MAX_EVENTS) room.events.shift();
}

/** 시트에 방 기록 남기기 (시트를 못 열면 조용히 건너뜀) */
function logRoom(room, event, detail) {
  try {
    if (typeof SpreadsheetApp === 'undefined') return;
    const ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return;
    const sh = ss.getSheetByName('방 기록') || ss.insertSheet('방 기록');
    if (sh.getLastRow() === 0) sh.appendRow(['시간', '방 코드', '게임', '일', '참가자', '내용']);
    sh.appendRow([new Date(), "'" + room.code, gameOf(room).title, event, room.players.map((p) => p.name).join(', '), detail || '']);
  } catch (err) {
    /* 기록 실패는 게임에 영향 없음 */
  }
}

// ---------- 요청 처리 ----------
function handleRequest(req) {
  const action = req.action;
  if (action === 'create') return withLock(() => createRoom(req));
  const code = String(req.code || '').trim();
  if (!/^[0-9]{4}$/.test(code)) fail('방 코드는 숫자 4자리예요.');
  if (action === 'lookup') return lookupRoom(code);
  if (action === 'join') return withLock(() => joinRoom(code, req));
  if (action === 'poll') return pollRoom(code, req);

  return withLock(() => {
    const room = loadRoom(code);
    if (!room) fail('방이 사라졌어요. 새로 만들어 주세요.');
    const me = room.players.find((p) => p.id === req.pid);
    if (!me) fail('이 방의 참가자가 아니에요.');
    markSeen(code, me.id);
    const g = gameOf(room);
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
        if (room.status !== 'lobby') fail('대기방에서만 뺄 수 있어요.');
        room.players = room.players.filter((p) => !(p.bot && p.id === req.botId));
        break;
      case 'config':
        hostOnly();
        if (room.status !== 'lobby') fail('대기방에서만 바꿀 수 있어요.');
        if (g.config) g.config(room, req);
        break;
      case 'start':
        hostOnly();
        if (room.status !== 'lobby') fail('이미 시작했어요.');
        if (room.players.length < g.minPlayers) fail(g.minPlayers + '명 이상 모여야 시작할 수 있어요. 봇을 넣어 보세요.');
        g.start(room);
        room.lastActionAt = Date.now();
        logRoom(room, '게임 시작');
        break;
      case 'lobby':
        hostOnly();
        if (room.status === 'playing') fail('게임 중에는 대기방으로 갈 수 없어요.');
        room.players = room.players.filter((p) => !p.left);
        g.reset(room);
        room.status = 'lobby';
        pushEvent(room, { type: 'lobby' });
        break;
      default: {
        const wasPlaying = room.status === 'playing';
        g.act(room, room.players.indexOf(me), req, isHost);
        room.lastActionAt = Date.now();
        if (wasPlaying && room.status === 'finished' && room.resultText) logRoom(room, '게임 끝', room.resultText);
      }
    }
    saveRoom(room);
    return roomView(room, me.id);
  });
}

function createRoom(req) {
  const game = req.game || DEFAULT_GAME;
  if (!GAMES[game]) fail('알 수 없는 게임이에요.');
  let code = '';
  for (let i = 0; i < 30 && !code; i++) {
    const c = String(Math.floor(1000 + Math.random() * 9000));
    if (!loadRoom(c)) code = c;
  }
  if (!code) fail('지금은 방을 만들 수 없어요. 잠시 뒤 다시 해 보세요.');
  const host = makePlayer(req.name, []);
  const room = {
    code,
    game,
    version: 0,
    created: Date.now(),
    status: 'lobby',
    hostId: host.id,
    rounds: 5,
    players: [host],
    events: [],
    seq: 0,
  };
  GAMES[game].reset(room);
  saveRoom(room);
  markSeen(code, host.id);
  logRoom(room, '방 만듦');
  return roomView(room, host.id);
}

function lookupRoom(code) {
  const room = loadRoom(code);
  if (!room) fail('그런 방이 없어요. 코드를 확인해 주세요.');
  return { ok: true, code, game: room.game, title: gameOf(room).title, status: room.status, count: room.players.length };
}

function makePlayer(name, players) {
  const used = players.map((p) => p.emoji);
  const names = players.map((p) => p.name);
  let n = cleanName(name);
  for (let k = 2; names.indexOf(n) >= 0; k++) n = cleanName(name).slice(0, 6) + k;
  return { id: newId(), name: n, emoji: HUMAN_EMOJI.find((e) => used.indexOf(e) < 0) || '🙂', bot: false };
}

function joinRoom(code, req) {
  const room = loadRoom(code);
  if (!room) fail('그런 방이 없어요. 코드를 확인해 주세요.');
  if (req.game && req.game !== room.game) fail('다른 게임의 방이에요. 첫 화면에서 코드를 넣어 보세요.');
  const again = req.pid && room.players.find((p) => p.id === req.pid && !p.left);
  if (again) {
    markSeen(code, again.id);
    return roomView(room, again.id);
  }
  const g = gameOf(room);
  if (room.status !== 'lobby') fail('이미 게임이 시작된 방이에요.');
  if (room.players.length >= g.maxPlayers) fail('방이 가득 찼어요 (최대 ' + g.maxPlayers + '명).');
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
    const g = gameOf(room);
    if (g.onLeave) g.onLeave(room, me);
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
  const g = gameOf(room);
  if (room.status !== 'lobby') fail('대기방에서만 봇을 넣을 수 있어요.');
  if (room.players.length >= g.maxPlayers) fail('방이 가득 찼어요 (최대 ' + g.maxPlayers + '명).');
  const cast = g.bots || DEFAULT_BOTS;
  const used = room.players.map((p) => p.name);
  const pick = cast.find((c) => used.indexOf(c.name) < 0) || cast[0];
  room.players.push({
    id: 'bot' + newId(),
    name: pick.name,
    emoji: pick.emoji,
    bot: true,
    difficulty: ['easy', 'normal', 'hard'].indexOf(difficulty) >= 0 ? difficulty : 'normal',
  });
}

// ---------- 폴링 (봇 / 자리 비운 사람 대신 두기) ----------
function seenMapFor(room) {
  return roomCache().getAll(room.players.filter((p) => !p.bot).map((p) => 'seen_' + room.code + '_' + p.id)) || {};
}
function isAway(room, p, seenMap) {
  return !p.bot && !seenMap['seen_' + room.code + '_' + p.id];
}

function needsAutoMove(room, seenMap) {
  if (room.status !== 'playing') return false;
  const g = gameOf(room);
  const seat = g.actor(room);
  const p = room.players[seat];
  if (!p || (!p.bot && !isAway(room, p, seenMap))) return false;
  return Date.now() - (room.lastActionAt || 0) >= (p.bot ? g.botDelay(room) : AWAY_MOVE_MS);
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
        const g = gameOf(r);
        g.botMove(r, g.actor(r));
        r.lastActionAt = Date.now();
        if (r.status === 'finished' && r.resultText) logRoom(r, '게임 끝', r.resultText);
        saveRoom(r);
      }
      return r;
    });
    if (!room) return { ok: false, gone: true, error: '방이 사라졌어요.' };
  }
  if (Number(req.since) === room.version) return { ok: true, same: true, version: room.version };
  return roomView(room, me.id);
}

/** 각 참가자에게 보내는 화면용 상태 — 숨김 정보는 게임 모듈의 view가 걸러 냄 */
function roomView(room, pid) {
  const g = gameOf(room);
  const seen = seenMapFor(room);
  const mySeat = room.players.findIndex((p) => p.id === pid);
  const base = {
    ok: true,
    version: room.version,
    code: room.code,
    game: room.game,
    title: g.title,
    minPlayers: g.minPlayers,
    maxPlayers: g.maxPlayers,
    status: room.status,
    hostId: room.hostId,
    rounds: room.rounds,
    me: pid,
    mySeat,
    players: room.players.map((p, i) =>
      Object.assign(
        { id: p.id, name: p.name, emoji: p.emoji, bot: !!p.bot, difficulty: p.difficulty || null, away: isAway(room, p, seen) },
        g.playerView(room, p, i),
      ),
    ),
    events: g.filterEvents ? g.filterEvents(room, mySeat) : room.events,
    seq: room.seq,
  };
  return Object.assign(base, g.view(room, mySeat));
}

// ==================== TileRules (games/tile-battle/js/rules.js) ====================
const TileRules = (() => {
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

return { SUITS, COMBO_NAMES, maxNForPlayers, handSizeForPlayers, makeTile, makeDeck, shuffle, rankOf, valueOf, sortTiles, tileLabel, analyze, beats, allPlays, legalPlays, checkPlay, roundScore, settle, runSelfTests };
})();

// ==================== TileAI (games/tile-battle/js/ai.js) ====================
const TileAI = (() => {
// AI 플레이어 — 쉬움 / 보통 / 어려움
const { legalPlays, valueOf, rankOf } = TileRules;
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

return { chooseMove, hintMove };
})();

// ==================== DSRules (games/deep-sea/js/rules.js) ====================
const DSRules = (() => {
// 심해 보물섬 탐험대 — 규칙 엔진 (순수 함수). 서버(앱스크립트)와 튜토리얼이 같이 씀
// 카드는 데이터: { id, type }. 모든 카드는 언제나 '누군가의 손' 또는 '공개된 카드' 중 정확히 한 곳에만 있음

const CARD = { EMPTY: 'empty', TREASURE: 'treasure', MONSTER: 'monster' };
const ROLE = { CREW: 'crew', PIRATE: 'pirate' };
const MAX_ROUNDS = 4;
const CARDS_PER_PLAYER = 5;
const MIN_PLAYERS = 4;
const MAX_PLAYERS = 6;

const CARD_NAME = { empty: '빈 방', treasure: '보물', monster: '심해 대왕문어' };
const ROLE_NAME = { crew: '탐험대', pirate: '해적' };

/** 인원별 역할 카드: 4명은 5장 중 4장을 나누고 1장은 아무도 모르게 빠짐 */
function roleCards(n) {
  if (n === 4) return { crew: 3, pirate: 2 };
  if (n === 5) return { crew: 3, pirate: 2 };
  if (n === 6) return { crew: 4, pirate: 2 };
  throw new Error('인원은 4~6명이에요.');
}

function shuffleArr(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 방 카드: 인원 × 5장 = 보물(인원 수) + 대왕문어 1 + 나머지 빈 방 */
function makeRoomCards(n) {
  const cards = [];
  for (let i = 0; i < n; i++) cards.push(CARD.TREASURE);
  cards.push(CARD.MONSTER);
  while (cards.length < n * CARDS_PER_PLAYER) cards.push(CARD.EMPTY);
  return cards.map((type, i) => ({ id: 'c' + i, type }));
}

/** 라운드별 한 사람당 카드 수: 5 → 4 → 3 → 2 */
function handSizeFor(round) {
  return CARDS_PER_PLAYER + 1 - round;
}

function summarize(hand) {
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
function newGame(n, rnd = Math.random) {
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
function flip(g, by, target, index, rnd = Math.random) {
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

function winText(winner, reason) {
  if (winner === ROLE.CREW) return '탐험대 승리! 보물을 모두 찾았어요';
  if (reason === 'monster') return '해적 승리! 심해 대왕문어가 깨어났어요';
  return '해적 승리! 4라운드 안에 보물을 다 찾지 못했어요';
}

// ---------- 빠른 말풍선 (고정 문구만) ----------
const SAYINGS = {
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
function claimOf(msg) {
  if (/^t[0-3]$/.test(msg)) return { treasure: Number(msg[1]) };
  if (msg === 'm1') return { monster: true };
  if (msg === 'm0') return { monster: false };
  return null;
}

// ---------- 자가 테스트 (?test) ----------
function runSelfTests(log = true) {
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

return { CARD, ROLE, MAX_ROUNDS, CARDS_PER_PLAYER, MIN_PLAYERS, MAX_PLAYERS, CARD_NAME, ROLE_NAME, roleCards, shuffleArr, makeRoomCards, handSizeFor, summarize, newGame, flip, winText, SAYINGS, claimOf, runSelfTests };
})();

// ==================== DSBot (games/deep-sea/js/bot.js) ====================
const DSBot = (() => {
// 심해 보물섬 탐험대 — 봇 (서버와 튜토리얼 공용, 순수 함수)
const { ROLE, summarize } = DSRules;
/**
 * 라운드 시작에 봇이 할 말. 탐험대는 대체로 정직, 해적은 가끔 거짓말.
 * 반환: 말풍선 키 배열 (예: ['t1', 'm0'])
 */
function botClaims(role, hand, rnd = Math.random) {
  const s = summarize(hand);
  let t = s.treasure;
  let m = s.monster > 0;
  if (role === ROLE.PIRATE) {
    if (m && rnd() < 0.75) m = false; // 문어를 숨김
    if (rnd() < 0.5) t = Math.max(0, Math.min(3, t + (rnd() < 0.5 ? 1 : -1)));
  } else if (rnd() < 0.08) {
    t = Math.max(0, t - 1); // 탐험대도 아주 가끔 헷갈림
  }
  return [`t${Math.min(3, t)}`, m ? 'm1' : 'm0'];
}

/**
 * 누구 카드를 뒤집을지 고름.
 * @param {object} p
 * @param {number} p.me        봇 자리
 * @param {string} p.role      봇 역할
 * @param {number[]} p.counts  자리별 남은 카드 수
 * @param {object} p.claims    { seat: { treasure, monster } } 이번 라운드 주장
 * @param {object} p.sus       { seat: 의심 점수 }  ("너 수상해"를 받은 횟수 등)
 * @param {object} p.flipped   { seat: { treasure, empty, monster } } 이번 라운드 그 자리에서 나온 카드
 * @returns {{target:number, index:number}}
 */
function botChooseFlip({ me, role, counts, claims = {}, sus = {}, flipped = {}, rnd = Math.random }) {
  let best = -1;
  let bestScore = -Infinity;
  counts.forEach((cnt, seat) => {
    if (seat === me || !cnt) return;
    const c = claims[seat] || {};
    const f = flipped[seat] || {};
    // 남았을 것으로 보이는 보물 = 주장한 보물 - 이미 나온 보물
    const leftTreasure = Math.max(0, (c.treasure ?? 0.8) - (f.treasure || 0));
    const saysMonster = c.monster === true ? 1 : 0;
    const lied = (f.treasure || 0) > (c.treasure ?? 9) || (f.monster && c.monster === false) ? 1 : 0;
    let score;
    if (role === ROLE.CREW) {
      score = (leftTreasure / cnt) * 6 - saysMonster * 4 - (sus[seat] || 0) * 1.2 - lied * 2;
    } else {
      // 해적: 문어가 있을 법한 곳, 보물이 적은 곳을 노림
      score = saysMonster * 3 + (1 - leftTreasure / cnt) * 2 + (sus[seat] || 0) * 0.3;
    }
    score += rnd() * 1.5;
    if (score > bestScore) {
      bestScore = score;
      best = seat;
    }
  });
  return { target: best, index: Math.floor(rnd() * Math.max(1, counts[best] || 1)) };
}

return { botClaims, botChooseFlip };
})();

// ==================== server/games/tile-battle.js ====================
// ===== 게임 모듈: 시험 끝! 타일 배틀 =====
// TileRules(games/tile-battle/js/rules.js), TileAI(…/ai.js)는 build-gs.mjs가 이름공간으로 감싸 넣어 줌
// 예전 클라이언트와 같은 모양의 상태를 내려보내야 하므로 필드 이름을 바꾸지 말 것

registerGame('tile-battle', {
  title: '시험 끝! 타일 배틀',
  minPlayers: 3,
  maxPlayers: 5,

  config(room, req) {
    room.rounds = [3, 5, 7].indexOf(Number(req.rounds)) >= 0 ? Number(req.rounds) : 5;
  },

  reset(room) {
    room.round = 0;
    room.table = null;
    room.tableTiles = [];
    room.result = null;
    room.players.forEach((p) => {
      p.hand = [];
      p.chips = 60;
    });
  },

  start(room) {
    room.players.forEach((p) => {
      p.chips = 60;
      p.hand = [];
    });
    room.round = 0;
    tbStartRound(room);
  },

  act(room, seat, req, isHost) {
    const me = room.players[seat];
    if (req.action === 'play') tbPlay(room, seat, me, req.tiles || []);
    else if (req.action === 'pass') tbPass(room, seat);
    else if (req.action === 'next') {
      if (!isHost) fail('방장만 할 수 있어요.');
      if (room.status !== 'roundEnd') fail('아직 라운드가 끝나지 않았어요.');
      tbStartRound(room);
    } else fail('알 수 없는 요청이에요.');
  },

  actor(room) {
    return room.status === 'playing' ? room.current : -1;
  },
  botDelay() {
    return 1100;
  },

  botMove(room, seat) {
    const p = room.players[seat];
    const tiles = TileAI.chooseMove({
      hand: p.hand,
      table: room.table,
      maxN: room.maxN,
      mustId: room.mustId,
      difficulty: p.bot ? p.difficulty : 'easy',
      oppCounts: room.players.filter((_, k) => k !== seat).map((q) => q.hand.length),
    });
    if (tiles) tbApplyPlay(room, seat, tiles);
    else if (room.table) tbApplyPass(room, seat);
    else tbApplyPlay(room, seat, TileRules.legalPlays(p.hand, null, room.maxN, room.mustId)[0].tiles);
  },

  playerView(room, p) {
    return { chips: p.chips, count: (p.hand || []).length };
  },

  view(room, mySeat) {
    return {
      round: room.round,
      hand: mySeat >= 0 ? room.players[mySeat].hand || [] : [],
      table: room.table || null,
      tableTiles: room.tableTiles || [],
      current: room.status === 'playing' ? room.current : -1,
      mustId: room.mustId || null,
      lastPlayer: room.lastPlayer,
      result: room.result || null,
    };
  },
});

function tbStartRound(room) {
  const n = room.players.length;
  room.round++;
  room.maxN = TileRules.maxNForPlayers(n);
  const per = TileRules.handSizeForPlayers(n);
  const deck = TileRules.shuffle(TileRules.makeDeck(room.maxN));
  room.players.forEach((p, i) => (p.hand = TileRules.sortTiles(deck.slice(i * per, (i + 1) * per), room.maxN)));
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

function tbPlay(room, seat, me, ids) {
  if (room.status !== 'playing') fail('지금은 낼 수 없어요.');
  if (room.current !== seat) fail('아직 내 차례가 아니에요.');
  const uniq = ids.filter((id, i) => ids.indexOf(id) === i);
  const tiles = uniq.map((id) => me.hand.find((t) => t.id === id));
  if (!tiles.length || tiles.some((t) => !t) || uniq.length !== ids.length) fail('손에 없는 타일이에요.');
  const check = TileRules.checkPlay(tiles, room.table, room.maxN, room.mustId);
  if (!check.ok) fail(check.reason);
  tbApplyPlay(room, seat, tiles);
}

function tbApplyPlay(room, seat, tiles) {
  const p = room.players[seat];
  const ids = tiles.map((t) => t.id);
  p.hand = p.hand.filter((t) => ids.indexOf(t.id) < 0);
  const ordered = TileRules.sortTiles(tiles, room.maxN);
  const combo = TileRules.analyze(ordered, room.maxN);
  room.table = combo;
  room.tableTiles = ordered;
  room.lastPlayer = seat;
  room.passCount = 0;
  room.mustId = null;
  pushEvent(room, { type: 'play', seat, tiles: ordered, name: combo.name, size: combo.size });
  if (!p.hand.length) tbEndRound(room, seat);
  else room.current = (seat + 1) % room.players.length;
}

function tbPass(room, seat) {
  if (room.status !== 'playing') fail('지금은 패스할 수 없어요.');
  if (room.current !== seat) fail('아직 내 차례가 아니에요.');
  if (!room.table) fail('바닥이 비어 있을 때는 패스할 수 없어요. 아무 조합이나 내세요.');
  tbApplyPass(room, seat);
}

function tbApplyPass(room, seat) {
  room.passCount++;
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

function tbEndRound(room, winner) {
  const scores = room.players.map((p) => TileRules.roundScore(p.hand));
  const s = TileRules.settle(scores.map((x) => x.score));
  room.players.forEach((p, i) => (p.chips += s.delta[i]));
  const over = room.round >= room.rounds || room.players.some((p) => p.chips <= 0);
  room.status = over ? 'finished' : 'roundEnd';
  room.current = -1;
  room.result = { round: room.round, winner, scores, delta: s.delta, transfers: s.transfers, over, chips: room.players.map((p) => p.chips) };
  pushEvent(room, Object.assign({ type: 'roundEnd' }, room.result));
  if (over) room.resultText = room.players.map((p) => p.name + ' ' + p.chips).join(' / ');
}

// ==================== server/games/deep-sea.js ====================
// ===== 게임 모듈: 심해 보물섬 탐험대 =====
// DSRules(games/deep-sea/js/rules.js), DSBot(…/bot.js)은 build-gs.mjs가 이름공간으로 감싸 넣어 줌
// 역할과 카드 위치는 서버에만! view()는 본인 역할과 본인 카드 '구성'만 내려보냄

registerGame('deep-sea', {
  title: '심해 보물섬 탐험대',
  minPlayers: 4,
  maxPlayers: 6,
  bots: [
    { name: '갈매기 봇', emoji: '🐦' },
    { name: '거북이 봇', emoji: '🐢' },
    { name: '물개 봇', emoji: '🦭' },
    { name: '복어 봇', emoji: '🐡' },
    { name: '꽃게 봇', emoji: '🦀' },
  ],

  reset(room) {
    room.ds = null;
    room.claims = {};
    room.sus = {};
    room.lastSay = {};
  },

  start(room) {
    room.ds = DSRules.newGame(room.players.length);
    room.status = 'playing';
    room.claims = {};
    room.sus = {};
    room.lastSay = {};
    pushEvent(room, { type: 'start', keyHolder: room.ds.keyHolder });
    dsNewRound(room);
  },

  act(room, seat, req) {
    if (room.status !== 'playing') fail('지금은 할 수 없어요.');
    if (req.action === 'flip') {
      dsFlip(room, seat, Number(req.target), Number(req.index));
    } else if (req.action === 'say') {
      const now = Date.now();
      if (now - (room.lastSay[seat] || 0) < 1200) fail('조금 천천히 말해 주세요.');
      room.lastSay[seat] = now;
      dsSay(room, seat, String(req.msg), req.target);
    } else fail('알 수 없는 요청이에요.');
  },

  actor(room) {
    return room.status === 'playing' && room.ds ? room.ds.keyHolder : -1;
  },
  botDelay() {
    return 2600; // 사람들이 말풍선을 읽을 시간
  },

  botMove(room, seat) {
    const g = room.ds;
    const p = room.players[seat];
    const counts = g.hands.map((h) => h.length);
    let target;
    let index;
    if (p.bot) {
      const flipped = {};
      g.revealed.filter((r) => r.round === g.round).forEach((r) => {
        flipped[r.target] = flipped[r.target] || {};
        flipped[r.target][r.card.type] = (flipped[r.target][r.card.type] || 0) + 1;
      });
      ({ target, index } = DSBot.botChooseFlip({ me: seat, role: g.roles[seat], counts, claims: room.claims, sus: room.sus, flipped }));
    } else {
      // 자리 비운 사람: 아무 카드나
      const options = counts.map((c, i) => i).filter((i) => i !== seat && counts[i] > 0);
      target = options[Math.floor(Math.random() * options.length)];
      index = 0;
    }
    dsFlip(room, seat, target, index);
  },

  playerView(room, p, i) {
    const g = room.ds;
    const out = { count: g ? g.hands[i].length : 0 };
    if (g && g.winner) out.role = g.roles[i];
    return out;
  },

  view(room, mySeat) {
    const g = room.ds;
    if (!g) return { ds: null };
    const me = mySeat >= 0 ? g.hands[mySeat] : [];
    return {
      ds: {
        round: g.round,
        maxRounds: DSRules.MAX_ROUNDS,
        keyHolder: g.keyHolder,
        found: g.found,
        totalTreasure: g.n,
        flipsThisRound: g.flipsThisRound,
        flipsPerRound: g.n,
        myRole: mySeat >= 0 ? g.roles[mySeat] : null,
        mySummary: DSRules.summarize(me),
        revealed: g.revealed.map((r) => ({ round: r.round, by: r.by, target: r.target, type: r.card.type })),
        claims: room.claims,
        winner: g.winner,
        reason: g.reason,
        roles: g.winner ? g.roles : null,
        hiddenRole: g.winner ? g.hiddenRole : null,
      },
    };
  },
});

function dsNewRound(room) {
  const g = room.ds;
  room.claims = {};
  pushEvent(room, { type: 'round', round: g.round, keyHolder: g.keyHolder, handSize: DSRules.handSizeFor(g.round) });
  // 봇은 라운드 시작에 바로 자기 카드에 대해 말함
  room.players.forEach((p, i) => {
    if (!p.bot) return;
    DSBot.botClaims(g.roles[i], g.hands[i]).forEach((msg) => dsSay(room, i, msg));
  });
}

function dsSay(room, seat, msg, target) {
  if (!DSRules.SAYINGS[msg]) fail('보낼 수 없는 말이에요.');
  const claim = DSRules.claimOf(msg);
  if (claim) room.claims[seat] = Object.assign({}, room.claims[seat], claim);
  const t = Number(target);
  const hasTarget = msg === 'sus' && Number.isInteger(t) && t >= 0 && t < room.players.length && t !== seat;
  if (hasTarget) room.sus[t] = (room.sus[t] || 0) + 1;
  pushEvent(room, { type: 'say', seat, msg, target: hasTarget ? t : null, round: room.ds.round });
}

function dsFlip(room, seat, target, index) {
  const g = room.ds;
  let res;
  try {
    res = DSRules.flip(g, seat, target, index);
  } catch (e) {
    fail(e.message);
  }
  pushEvent(room, { type: 'flip', by: seat, target, index: res.index, card: res.card.type, round: g.revealed[g.revealed.length - 1].round, found: g.found });
  if (res.winner) {
    room.status = 'finished';
    room.resultText = DSRules.winText(g.winner, g.reason) + ' / 해적: ' + room.players.filter((_, i) => g.roles[i] === 'pirate').map((p) => p.name).join(', ');
    pushEvent(room, { type: 'end', winner: g.winner, reason: g.reason, roles: g.roles, hiddenRole: g.hiddenRole });
  } else if (res.roundEnded) {
    dsNewRound(room);
  }
}

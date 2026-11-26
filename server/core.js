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

// ⚠️ 자동 생성 파일입니다. 직접 고치지 말고 tools/build-gs.mjs를 다시 실행하세요.
// 학교 게임 모음 — 공용 온라인 대기방 서버 (Google Apps Script)
// 포함된 게임: tile-battle, deep-sea, flip-duel, color-rush, code-breaker, number-garden, lunch-five, school-trip
// 설정 방법은 README.md의 '온라인 대기방 설정'을 보세요.

// ==================== server/core.js ====================
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
/** 지금 방에서 규칙을 맡는 모듈: 오프라인 테이블 모드면 공용 엔진(server/offline-table.js) */
function modOf(room) {
  const g = gameOf(room);
  if (room.mode !== 'offline' || !g.offline) return g;
  if (!g.offlineMod) g.offlineMod = offlineModule(g);
  return g.offlineMod;
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
  if (action === 'watch') return watchRoom(code, req);

  return withLock(() => {
    const room = loadRoom(code);
    if (!room) fail('방이 사라졌어요. 새로 만들어 주세요.');
    const me = room.players.find((p) => p.id === req.pid);
    if (!me) fail('이 방의 참가자가 아니에요.');
    markSeen(code, me.id);
    const g = modOf(room);
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
        if (room.status === 'playing' && room.mode !== 'offline') fail('게임 중에는 대기방으로 갈 수 없어요.');
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
    mode: req.mode === 'offline' && GAMES[game].offline ? 'offline' : 'online',
    hostId: host.id,
    rounds: 5,
    players: [host],
    events: [],
    seq: 0,
  };
  modOf(room).reset(room);
  saveRoom(room);
  markSeen(code, host.id);
  logRoom(room, '방 만듦');
  return roomView(room, host.id);
}

function lookupRoom(code) {
  const room = loadRoom(code);
  if (!room) fail('그런 방이 없어요. 코드를 확인해 주세요.');
  return { ok: true, code, game: room.game, mode: room.mode || 'online', title: gameOf(room).title, status: room.status, count: room.players.length };
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
  const g = modOf(room);
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
    me.name = me.name.slice(0, 6) + (room.mode === 'offline' ? '(나감)' : '(봇)');
    const g = modOf(room);
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
  if (room.mode === 'offline') fail('오프라인 테이블 모드는 봇 없이 사람끼리 모여서 해요.');
  const g = modOf(room);
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
  if (room.status !== 'playing' || room.mode === 'offline') return false;
  const g = modOf(room);
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
        const g = modOf(r);
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
/** 📺 테이블 화면: 참가하지 않고 공용 판만 보기 (숨김 정보 없음) */
function watchRoom(code, req) {
  const room = loadRoom(code);
  if (!room) return { ok: false, gone: true, error: '방이 사라졌어요.' };
  if (Number(req.since) === room.version) return { ok: true, same: true, version: room.version };
  return roomView(room, null);
}

function roomView(room, pid) {
  const g = modOf(room);
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
    mode: room.mode || 'online',
    hasOffline: !!gameOf(room).offline,
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

// ==================== server/offline-table.js ====================
// ===== 공용 오프라인 테이블 모드 =====
// 패드·폰은 있는데 실물 카드가 없을 때: 서버는 섞기, 나눠주기, 비공개 패, 공용 영역만 관리.
// 규칙 판정·힌트·봇·승패 판정은 하지 않고, 모든 동작을 로그로 모두에게 공개함.
//
// 게임 모듈은 offline: { … } 으로 '구성품 정의'만 넘김:
//   deck(n) → ['카드코드', …]           전체 카드 (엔진이 섞음)
//   deal(n) → 한 사람당 처음 나눠줄 장수
//   zones: [{ id, name, kind: 'pile' | 'rows', perSeat? }]
//        pile: 낼 때마다 한 묶음씩 쌓임(맨 위 묶음이 크게 보임) / rows: 줄을 자유롭게 만들고 고침
//   name(code) → 로그에 쓸 이름 ('빨강 7')
//   back(code)? → 남들에게 보이는 뒷면 정보 ('b' 검정 타일 등). 기본 ''
//   sort(a, b)? → 패 자동 정렬 비교 함수 (코드끼리)
//   keepOrder? → 새 카드만 정렬 자리에 끼우고 기존 순서(손으로 옮긴 조커 등)는 유지
//   secret(n)? → 한 사람에 1장씩 비밀로 받는 카드 (역할 카드)
//   blind? → 내 패도 못 봄 (뒤집어 쌓아 둔 더미)
//   hideOrder? → 내 패 구성은 보이지만 자리는 모름 (남이 자리로 고름)
//   pickPassesTurn? → 남의 카드를 뒤집으면 그 사람 차례로
//   setup(ot, n)? → 처음 판 꾸미기 (버린 더미에 1장 뒤집기 등)
//   actions: 화면에 보일 동작 목록 (클라이언트 참고용)
//   minPlayers?, maxPlayers?

const OT_UNDO = 6;

function otShuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

function offlineModule(g) {
  const cfg = g.offline;
  const zoneDefs = cfg.zones || [];
  const nameOf = (c) => (cfg.name ? cfg.name(c.f) : c.f);
  const backOf = (f) => (cfg.back ? cfg.back(f) : '');
  const sortHand = (h) => {
    if (cfg.sort && !cfg.hideOrder) h.sort((a, b) => cfg.sort(a.f, b.f));
  };
  // keepOrder: 이미 손으로 옮겨 둔 순서(조커 자리 등)는 그대로 두고, 새 카드만 정렬된 자리에 끼워 넣음
  const addToHand = (ot, seat, cards) => {
    const h = ot.hands[seat];
    if (cfg.keepOrder && cfg.sort && !cfg.hideOrder) {
      cards.forEach((c) => {
        const i = h.findIndex((x) => cfg.sort(c.f, x.f) < 0);
        h.splice(i < 0 ? h.length : i, 0, c);
      });
    } else {
      ot.hands[seat] = h.concat(cards);
      sortHand(ot.hands[seat]);
    }
  };
  const zoneDef = (zid) => zoneDefs.find((z) => z.id === String(zid).split(':')[0]);
  const zoneTitle = (room, zid) => {
    const d = zoneDef(zid);
    const seat = String(zid).split(':')[1];
    return (d ? d.name : zid) + (seat != null && room.players[seat] ? '(' + room.players[seat].name + ')' : '');
  };
  const listNames = (cards) => {
    const names = cards.map(nameOf);
    return names.length > 4 ? names.slice(0, 4).join(', ') + ' 외 ' + (names.length - 4) + '장' : names.join(', ');
  };

  function newTable(n) {
    const codes = otShuffle(cfg.deck(n).slice());
    let uid = 1;
    const ot = { draw: [], hands: [], secrets: [], zones: {}, turn: 0, round: 1, undo: [], lastBy: -1, winner: null };
    ot.draw = codes.map((f) => ({ id: uid++, f, up: false }));
    zoneDefs.forEach((z) => {
      if (z.perSeat) for (let i = 0; i < n; i++) ot.zones[z.id + ':' + i] = [];
      else ot.zones[z.id] = [];
    });
    const per = typeof cfg.deal === 'function' ? cfg.deal(n) : cfg.deal || 0;
    for (let i = 0; i < n; i++) {
      ot.hands.push(ot.draw.splice(0, per));
      sortHand(ot.hands[i]);
    }
    if (cfg.secret) ot.secrets = otShuffle(cfg.secret(n).slice()).map((f) => ({ id: uid++, f, up: false }));
    ot.uid = uid;
    if (cfg.setup) cfg.setup(ot, n);
    return ot;
  }

  function log(room, seat, text) {
    pushEvent(room, { type: 'ot', seat, text: (seat >= 0 ? room.players[seat].name + ': ' : '') + text });
  }

  /** 카드 id로 위치 찾기: 내 패 또는 테이블 영역 */
  function takeFrom(ot, seat, ids, allowHand, allowZones) {
    const want = ids.map(Number);
    const got = [];
    want.forEach((id) => {
      let card = null;
      if (allowHand) {
        const h = ot.hands[seat];
        const i = h.findIndex((c) => c.id === id);
        if (i >= 0) card = h.splice(i, 1)[0];
      }
      if (!card && allowZones) {
        Object.keys(ot.zones).some((zid) =>
          ot.zones[zid].some((row, r) => {
            const i = row.findIndex((c) => c.id === id);
            if (i < 0) return false;
            card = row.splice(i, 1)[0];
            if (!row.length) ot.zones[zid].splice(r, 1);
            return true;
          }),
        );
      }
      if (!card) fail('그 카드를 찾을 수 없어요. 화면이 바뀌었을 수 있어요.');
      got.push(card);
    });
    return got;
  }

  function putTo(room, ot, zid, row, cards) {
    if (!ot.zones[zid]) fail('그런 자리가 없어요.');
    const rows = ot.zones[zid];
    const d = zoneDef(zid);
    cards.forEach((c) => (c.up = true));
    const r = Number(row);
    if (d && d.kind === 'rows' && Number.isInteger(r) && r >= 0 && r < rows.length) {
      rows[r] = rows[r].concat(cards);
      if (cfg.sortRow) rows[r].sort((a, b) => cfg.sortRow(a.f, b.f));
    } else rows.push(cards);
  }

  function snapshot(ot) {
    const copy = JSON.parse(JSON.stringify(ot));
    delete copy.undo;
    ot.undo.push(copy);
    while (ot.undo.length > OT_UNDO) ot.undo.shift();
  }

  function seatArg(room, v) {
    const s = Number(v);
    if (!Number.isInteger(s) || s < 0 || s >= room.players.length) fail('누구인지 알 수 없어요.');
    return s;
  }

  return {
    title: g.title,
    minPlayers: cfg.minPlayers || g.minPlayers,
    maxPlayers: cfg.maxPlayers || g.maxPlayers,
    reset(room) {
      room.ot = null;
      g.reset(room);
    },
    start(room) {
      room.ot = newTable(room.players.length);
      room.status = 'playing';
      log(room, -1, '카드를 섞어 나눠 줬어요. 규칙은 직접 말로 지켜 주세요!');
    },
    act(room, seat, req, isHost) {
      const ot = room.ot;
      if (!ot) fail('아직 시작하지 않았어요.');
      const a = req.action;
      const hostOnly = () => isHost || fail('방장만 할 수 있어요.');
      if (room.status === 'finished' && a !== 'ot_reshuffle') fail('끝난 판이에요. 방장이 다시 섞을 수 있어요.');
      if (a === 'ot_undo') {
        if (!isHost && ot.lastBy !== seat) fail('되돌리기는 방장이나 방금 움직인 사람만 할 수 있어요.');
        const prev = ot.undo.pop();
        if (!prev) fail('더 되돌릴 수 없어요.');
        prev.undo = ot.undo;
        room.ot = prev;
        room.ot.lastBy = -1;
        log(room, seat, '↩️ 방금 동작을 되돌렸어요');
        return;
      }
      if (a !== 'ot_reshuffle' && a !== 'ot_end') snapshot(ot);
      ot.lastBy = seat;
      switch (a) {
        case 'ot_play': {
          if (cfg.blind) fail('이 게임은 맨 위 카드 뒤집기로 내요.');
          const cards = takeFrom(ot, seat, req.ids || [], true, false);
          if (!cards.length) fail('낼 카드를 고르세요.');
          putTo(room, ot, String(req.zone), req.row, cards);
          log(room, seat, listNames(cards) + ' → ' + zoneTitle(room, req.zone));
          break;
        }
        case 'ot_move': {
          const cards = takeFrom(ot, seat, req.ids || [], true, true);
          if (!cards.length) fail('옮길 카드를 고르세요.');
          putTo(room, ot, String(req.zone), req.row, cards);
          log(room, seat, listNames(cards) + ' 옮김 → ' + zoneTitle(room, req.zone));
          break;
        }
        case 'ot_take': {
          const cards = takeFrom(ot, seat, req.ids || [], false, true);
          cards.forEach((c) => (c.up = false));
          addToHand(ot, seat, cards);
          log(room, seat, listNames(cards) + ' 가져감');
          break;
        }
        case 'ot_draw': {
          const n = Math.max(1, Math.min(10, Number(req.n) || 1));
          const back = req.back == null ? null : String(req.back);
          const got = [];
          for (let k = 0; k < n; k++) {
            const i = back == null ? 0 : ot.draw.findIndex((c) => backOf(c.f) === back);
            if (i < 0 || !ot.draw.length) break;
            got.push(ot.draw.splice(i, 1)[0]);
          }
          if (!got.length) fail('뽑을 카드가 없어요.');
          addToHand(ot, seat, got);
          log(room, seat, '카드 ' + got.length + '장 뽑음' + (back ? ' (' + (cfg.backName ? cfg.backName(back) : back) + ')' : ''));
          break;
        }
        case 'ot_reveal': {
          const c = ot.hands[seat].find((x) => x.id === Number(req.id));
          if (!c) fail('내 카드가 아니에요.');
          c.up = !!req.up;
          log(room, seat, (c.up ? '🔓 공개: ' : '🔒 다시 숨김: ') + (c.up ? nameOf(c) : '카드 1장'));
          break;
        }
        case 'ot_order': {
          const ids = (req.ids || []).map(Number);
          const h = ot.hands[seat];
          if (ids.length !== h.length) fail('순서를 바꿀 수 없어요.');
          const next = ids.map((id) => h.find((c) => c.id === id));
          if (next.some((c) => !c)) fail('순서를 바꿀 수 없어요.');
          ot.hands[seat] = next;
          log(room, seat, '패 순서를 바꿈');
          break;
        }
        case 'ot_give': {
          const to = seatArg(room, req.to);
          if (to === seat) fail('다른 사람을 고르세요.');
          const h = ot.hands[seat];
          let card;
          if (req.top || cfg.blind) card = h.shift();
          else {
            const i = h.findIndex((c) => c.id === Number(req.id));
            if (i >= 0) card = h.splice(i, 1)[0];
          }
          if (!card) fail('줄 카드가 없어요.');
          card.up = false;
          addToHand(ot, to, [card]);
          log(room, seat, room.players[to].name + '에게 카드 1장 줌');
          break;
        }
        case 'ot_pick': {
          const t = seatArg(room, req.target);
          if (t === seat) fail('다른 사람의 카드를 고르세요.');
          const h = ot.hands[t];
          const i = Number(req.index);
          if (!Number.isInteger(i) || i < 0 || i >= h.length) fail('그 자리에 카드가 없어요.');
          const card = h.splice(i, 1)[0];
          const zid = String(req.zone || (zoneDefs[0] && zoneDefs[0].id));
          putTo(room, ot, zid, -1, [card]);
          if (cfg.pickPassesTurn) ot.turn = t;
          log(room, seat, room.players[t].name + '의 카드를 뒤집음 → ' + nameOf(card));
          break;
        }
        case 'ot_flipTop': {
          const card = ot.hands[seat].shift();
          if (!card) fail('뒤집을 카드가 없어요.');
          const def = zoneDefs[0];
          const zid = req.zone ? String(req.zone) : def.perSeat ? def.id + ':' + seat : def.id;
          putTo(room, ot, zid, -1, [card]);
          if (cfg.flipPassesTurn) ot.turn = nextSeat(room, seat);
          log(room, seat, '뒤집음 → ' + nameOf(card));
          break;
        }
        case 'ot_collect': {
          const to = seatArg(room, req.to);
          let got = [];
          Object.keys(ot.zones).forEach((zid) => {
            if (req.zone && zid.split(':')[0] !== String(req.zone)) return;
            ot.zones[zid].forEach((row) => (got = got.concat(row)));
            ot.zones[zid] = [];
          });
          if (!got.length) fail('가져갈 카드가 없어요.');
          got.forEach((c) => (c.up = false));
          addToHand(ot, to, got);
          log(room, seat, '테이블 카드 ' + got.length + '장 → ' + room.players[to].name);
          break;
        }
        case 'ot_recycle': {
          const zid = String(req.zone || zoneDefs[0].id);
          const rows = ot.zones[zid] || fail('그런 자리가 없어요.');
          if (rows.length < 2) fail('다시 섞을 카드가 부족해요.');
          const keep = rows.pop();
          let back = [];
          rows.forEach((r) => (back = back.concat(r)));
          back.forEach((c) => (c.up = false));
          ot.zones[zid] = [keep];
          ot.draw = otShuffle(ot.draw.concat(back));
          log(room, seat, zoneTitle(room, zid) + ' 아래 카드 ' + back.length + '장을 섞어 뽑을 더미로');
          break;
        }
        case 'ot_redeal': {
          hostOnly();
          const per = Math.max(1, Math.min(20, Number(req.count) || 1));
          let all = [];
          ot.hands.forEach((h) => (all = all.concat(h)));
          otShuffle(all);
          if (all.length < per * room.players.length) fail('카드가 모자라요. 장수를 줄여 주세요.');
          ot.hands = room.players.map(() => all.splice(0, per));
          ot.draw = ot.draw.concat(all); // 남는 카드는 뽑을 더미로 (사라지지 않게)
          ot.hands.forEach((h) => sortHand(h));
          ot.round++;
          log(room, seat, '🔄 ' + ot.round + '라운드: 모은 카드를 섞어 ' + per + '장씩 다시 나눔');
          break;
        }
        case 'ot_turn': {
          ot.turn = req.to != null ? seatArg(room, req.to) : nextSeat(room, ot.turn);
          log(room, seat, '➡️ ' + room.players[ot.turn].name + ' 차례');
          break;
        }
        case 'ot_end': {
          hostOnly();
          const w = Number(req.winner);
          ot.winner = Number.isInteger(w) && w >= 0 && w < room.players.length ? w : -1;
          room.status = 'finished';
          room.resultText = '오프라인 모드 · ' + (ot.winner >= 0 ? '승자: ' + room.players[ot.winner].name : '승자 없음');
          log(room, seat, '🏁 게임 끝! ' + (ot.winner >= 0 ? room.players[ot.winner].name + ' 승리' : ''));
          break;
        }
        case 'ot_reshuffle': {
          hostOnly();
          room.ot = newTable(room.players.length);
          room.status = 'playing';
          log(room, seat, '🔀 처음부터 다시 섞어 나눔');
          break;
        }
        default:
          fail('오프라인 모드에서 할 수 없는 동작이에요.');
      }
    },
    actor() {
      return -1; // 오프라인 모드는 봇·자리 비움 대신 두기 없음
    },
    botDelay() {
      return 999999;
    },
    botMove() {},
    playerView(room, p, i) {
      const ot = room.ot;
      if (!ot) return { count: 0 };
      return { count: ot.hands[i].length };
    },
    view(room, mySeat) {
      const ot = room.ot;
      if (!ot) return { ot: null };
      const finished = room.status === 'finished';
      const pub = (c) => ({ id: c.id, b: backOf(c.f), f: c.up ? c.f : null, up: c.up });
      let mine = [];
      if (mySeat >= 0) {
        const h = ot.hands[mySeat];
        if (cfg.blind) mine = [];
        else if (cfg.hideOrder) mine = h.map((c) => ({ f: c.f, up: c.up })).sort((a, b) => (cfg.sort ? cfg.sort(a.f, b.f) : a.f < b.f ? -1 : 1));
        else mine = h.map((c) => ({ id: c.id, f: c.f, up: c.up, b: backOf(c.f) }));
      }
      const drawBacks = {};
      if (cfg.back) ot.draw.forEach((c) => (drawBacks[backOf(c.f)] = (drawBacks[backOf(c.f)] || 0) + 1));
      const zones = {};
      Object.keys(ot.zones).forEach((zid) => (zones[zid] = ot.zones[zid].map((row) => row.map((c) => ({ id: c.id, f: c.f })))));
      return {
        ot: {
          drawCount: ot.draw.length,
          drawBacks,
          zones,
          hand: mine,
          hands: ot.hands.map((h) => h.map(pub)),
          secret: mySeat >= 0 && ot.secrets[mySeat] ? ot.secrets[mySeat].f : null,
          secrets: finished && ot.secrets.length ? ot.secrets.map((c) => c.f) : null,
          turn: ot.turn,
          round: ot.round,
          winner: ot.winner,
          lastBy: ot.lastBy,
          undoCount: ot.undo.length,
        },
      };
    },
    onLeave() {},
  };
}

function nextSeat(room, s) {
  return (s + 1) % room.players.length;
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

// ==================== FDRules (games/flip-duel/js/rules.js) ====================
const FDRules = (() => {
// 흑백 뒤집기 대전 — 규칙 엔진 + minimax 봇 (브라우저와 앱스크립트 서버가 같이 씀)
// 판: 길이 64 배열, 0 빈칸 · 1 흑 · 2 백. 흑이 먼저 둠.
// 규칙: 상대 돌을 내 돌 두 개 사이에 (가로·세로·대각선) 끼우면 뒤집힘. 뒤집을 수 없는 곳엔 못 둠.
//       둘 곳이 없으면 차례가 넘어가고, 둘 다 못 두면 끝 → 돌이 많은 쪽 승리.

const N = 8;
const BLACK = 1;
const WHITE = 2;
const COLOR_NAME = { 1: '흑', 2: '백' };
const DIRS = [-9, -8, -7, -1, 1, 7, 8, 9];

const other = (p) => 3 - p;

function newBoard() {
  const b = new Array(64).fill(0);
  b[27] = WHITE;
  b[36] = WHITE;
  b[28] = BLACK;
  b[35] = BLACK;
  return b;
}

/** idx에 p가 두면 뒤집히는 칸들 */
function flipsFor(b, p, idx) {
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

function legalMoves(b, p) {
  const out = [];
  for (let i = 0; i < 64; i++) if (b[i] === 0 && flipsFor(b, p, i).length) out.push(i);
  return out;
}

function count(b) {
  let x = 0;
  let o = 0;
  for (const v of b) {
    if (v === BLACK) x++;
    else if (v === WHITE) o++;
  }
  return { 1: x, 2: o };
}

/** 새 게임 상태 */
function newGame() {
  return { board: newBoard(), turn: BLACK, last: -1, flips: [], passed: false, over: false, winner: 0, moves: 0 };
}

/**
 * 두기. 상태를 바꾸고 { flips, passed(다음 사람이 못 둬서 넘어감), over } 를 돌려줌
 */
function play(g, p, idx) {
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

function finish(g) {
  g.over = true;
  const c = count(g.board);
  g.winner = c[1] > c[2] ? BLACK : c[2] > c[1] ? WHITE : 0;
}

/** 지금 둘 사람이 둘 곳이 없는지 (첫 수 등에서 생길 일은 없지만 안전장치) */
function ensureMovable(g) {
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

const DEPTH = { easy: 1, normal: 3, hard: 5 };

/** 봇이 둘 자리. easy는 가끔 실수, hard는 끝판에 끝까지 읽음 */
function bestMove(b, p, difficulty = 'normal') {
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

const cellName = (i) => 'ABCDEFGH'[i % 8] + (Math.floor(i / 8) + 1);

// ---------- 자가 테스트 ----------
function runSelfTests() {
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

return { N, BLACK, WHITE, COLOR_NAME, other, newBoard, flipsFor, legalMoves, count, newGame, play, finish, ensureMovable, DEPTH, bestMove, cellName, runSelfTests };
})();

// ==================== CRRules (games/color-rush/js/rules.js) ====================
const CRRules = (() => {
// 컬러 러시 — 규칙 엔진 + 봇 (브라우저와 앱스크립트 서버가 같이 씀)
// 카드 코드: 색 1글자 + 값 1글자
//   색: c 분필(민트) · p 형광(핑크) · o 크레용(주황) · v 잉크(보라) · w 무지개(색 바꾸기 계열)
//   값: 0~9 숫자, S 건너뛰기, R 방향 바꾸기, D +2, W 색 바꾸기, F +4
// 규칙: 맨 위 카드와 색 또는 숫자/기호가 같으면 냄. 색 바꾸기·+4는 언제나.
//       낼 게 없으면 1장 뽑고, 뽑은 카드를 낼 수 있으면 내거나 넘김.
//       +2/+4를 받으면 그만큼 뽑고 차례를 넘김 (쌓기 없음). 2인이면 방향 바꾸기 = 건너뛰기.
//       한 장이 남으면 '마지막!'을 외쳐야 함. 안 외친 채로 남에게 지적당하면 2장 벌칙.
//       손패를 다 내면 승리.

const COLORS = ['c', 'p', 'o', 'v'];
const COLOR_NAME = { c: '분필', p: '형광', o: '크레용', v: '잉크', w: '무지개' };
const COLOR_HEX = { c: '#3ad6b4', p: '#ff5ca8', o: '#ff9a2e', v: '#9b7bff', w: '#ffffff' };
const COLOR_ICON = { c: '▲', p: '★', o: '◆', v: '💧' };
const VALUE_NAME = { S: '건너뛰기', R: '방향 바꾸기', D: '+2', W: '색 바꾸기', F: '+4' };
const VALUE_ORDER = '0123456789SRDWF';
const HAND_SIZE = 7;
const DECK_SIZE = 108; // 4색 × (0 1장 + 1~9 2장씩 + 기능 3종 2장씩) = 100, 색 바꾸기 4 + +4 4
const MAX_PLAYERS = 6;
const CALL_P = { easy: 0.55, normal: 0.82, hard: 0.96 }; // 봇이 '마지막!'을 잊지 않을 확률
const CATCH_P = { easy: 0.5, normal: 0.85, hard: 1 }; // 봇이 깜빡한 사람을 지적할 확률

function makeDeck() {
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

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

const isWild = (code) => code[0] === 'w';
const isNumber = (code) => code[1] >= '0' && code[1] <= '9';
const isAction = (code) => !isWild(code) && !isNumber(code);

/** 로그용 한국어 이름: '분필 7', '형광 건너뛰기', '+4' */
function cardName(code) {
  if (!code) return '';
  if (code === 'wW') return '색 바꾸기';
  if (code === 'wF') return '+4';
  return COLOR_NAME[code[0]] + ' ' + (isNumber(code) ? code[1] : VALUE_NAME[code[1]]);
}

/** 패 정렬: 색 → 숫자/기호 */
function compareCodes(a, b) {
  const ca = 'cpovw'.indexOf(a[0]);
  const cb = 'cpovw'.indexOf(b[0]);
  if (ca !== cb) return ca - cb;
  return VALUE_ORDER.indexOf(a[1]) - VALUE_ORDER.indexOf(b[1]);
}

/** 맨 위 카드(top)와 지금 색(color)에 code를 낼 수 있나 */
function canPlay(code, top, color) {
  if (isWild(code)) return true;
  if (!top) return true;
  return code[0] === color || code[1] === top[1];
}

function playableCodes(hand, top, color) {
  const out = [];
  hand.forEach((c) => canPlay(c, top, color) && out.indexOf(c) < 0 && out.push(c));
  return out;
}

function topOf(g) {
  return g.discard[g.discard.length - 1];
}

function nextSeat(g, from, steps = 1) {
  return (((from + g.dir * steps) % g.n) + g.n) % g.n;
}

function totalCards(g) {
  return g.draw.length + g.discard.length + g.hands.reduce((s, h) => s + h.length, 0);
}

function newGame(n, deck) {
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
function play(g, seat, code, opts = {}) {
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
function draw(g, seat) {
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
function pass(g, seat) {
  checkTurn(g, seat);
  if (g.phase !== 'drawn') err('먼저 카드를 내거나 뽑으세요.');
  g.phase = 'play';
  g.drawn = null;
  g.turn = nextSeat(g, seat);
  return [{ type: 'pass', seat }];
}

/** '마지막!' 외치기 (내고 나서 다음 사람이 움직이기 전까지) */
function callLast(g, seat) {
  if (g.phase === 'over') err('이미 끝난 판이에요.');
  if (g.unsafe === seat) {
    g.unsafe = -1;
    return [{ type: 'call', seat }];
  }
  if (g.hands[seat] && g.hands[seat].length <= 2) return []; // 이미 안전하거나 미리 누름: 그냥 넘어감
  err('카드가 한 장 남았을 때 외치는 거예요.');
}

/** 깜빡한 사람 지적하기 → 그 사람이 2장 */
function catchLast(g, by) {
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
function publicView(g, seat) {
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
function botColor(hand) {
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
function botChoose(g, seat, difficulty = 'normal') {
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
function botStep(g, seat, difficulty) {
  const m = botChoose(g, seat, difficulty);
  if (m.action === 'draw') return draw(g, seat);
  if (m.action === 'pass') return pass(g, seat);
  return play(g, seat, m.code, { color: m.color, call: m.call });
}

// ---------- 자가 테스트 ----------
function runSelfTests() {
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

return { COLORS, COLOR_NAME, COLOR_HEX, COLOR_ICON, VALUE_NAME, VALUE_ORDER, HAND_SIZE, DECK_SIZE, MAX_PLAYERS, CALL_P, CATCH_P, makeDeck, shuffle, isWild, isNumber, isAction, cardName, compareCodes, canPlay, playableCodes, topOf, nextSeat, totalCards, newGame, play, draw, pass, callLast, catchLast, publicView, botColor, botChoose, botStep, runSelfTests };
})();

// ==================== CBRules (games/code-breaker/js/rules.js) ====================
const CBRules = (() => {
// 비밀번호 해독반 — 순수 규칙 엔진 + 봇 + 자가 테스트 (브라우저·앱스크립트 공용, import 없음)
// 타일: { id, c: 'b'|'w', n: 0..11 | 12(조커), up: 공개됨 }
// 줄(row)은 언제나 조커를 뺀 타일이 오름차순 (같은 숫자면 검정이 왼쪽). 조커는 아무 자리나.

const JOKER = 12;
const COLORS = ['b', 'w'];
const COLOR_NAME = { b: '검정', w: '흰색' };
const PHASE = { SETUP: 'setup', DRAW: 'draw', PLACE: 'place', GUESS: 'guess', DECIDE: 'decide', PENALTY: 'penalty', OVER: 'over' };

const dealCount = (n) => (n <= 3 ? 4 : 3);
const tileKey = (t) => t.n * 2 + (t.c === 'w' ? 1 : 0);
const numName = (n) => (n === JOKER ? '조커' : String(n));
const tileName = (t) => COLOR_NAME[t.c] + ' ' + numName(t.n);

/** 26개 타일 (검정 0~11, 흰색 0~11, 조커 2) */
function fullSet() {
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
function sortedIndex(row, t) {
  const k = tileKey(t);
  for (let i = 0; i < row.length; i++) if (row[i].n !== JOKER && tileKey(row[i]) > k) return i;
  return row.length;
}

/** 줄이 규칙대로 정렬돼 있는지 (조커 제외) */
function rowSorted(row) {
  let last = -1;
  for (const t of row) {
    if (t.n === JOKER) continue;
    if (tileKey(t) <= last) return false;
    last = tileKey(t);
  }
  return true;
}

function newGame(n) {
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

const hiddenCount = (row) => row.filter((t) => !t.up).length;
const alive = (g) => g.out.map((o, i) => (o ? -1 : i)).filter((i) => i >= 0);
const pileCount = (g) => ({ b: g.pile.filter((t) => t.c === 'b').length, w: g.pile.filter((t) => t.c === 'w').length });

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
function placeJoker(g, seat, idx) {
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
function draw(g, seat, color) {
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
function guess(g, seat, target, id, value) {
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
function penalty(g, seat, id) {
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
function decide(g, seat, more) {
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
function actorOf(g) {
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
function candidates(rows, seat, history, holdMine) {
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
function rowsSeenBy(g, seat) {
  return g.rows.map((r, s) => r.map((t) => ({ id: t.id, c: t.c, n: t.up || s === seat ? t.n : null, up: t.up })));
}

const pickOne = (a) => a[Math.floor(Math.random() * a.length)];

/**
 * 봇이 지금 할 일. 돌려줌: { action: 'draw'|'place'|'guess'|'decide'|'penalty', ... }
 * difficulty: easy | normal | hard
 */
function botAction(g, seat, difficulty = 'normal') {
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
function applyAction(g, seat, a) {
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
function runSelfTests(games = 2000) {
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

return { JOKER, COLORS, COLOR_NAME, PHASE, dealCount, tileKey, numName, tileName, fullSet, sortedIndex, rowSorted, newGame, hiddenCount, alive, pileCount, placeJoker, draw, guess, penalty, decide, actorOf, candidates, rowsSeenBy, botAction, applyAction, runSelfTests };
})();

// ==================== NGRules (games/number-garden/js/rules.js) ====================
const NGRules = (() => {
// 숫자 블록 정원 — 순수 규칙 엔진 + 봇 + 자가 테스트 (브라우저와 앱스크립트 서버가 같이 씀)
// 타일 id: 0~103 = 벌(0/1)*52 + 꽃색(0~3)*13 + (숫자-1),  104·105 = 새싹(조커)
// 종류(kind): 0~51 = 꽃색*13 + (숫자-1), 52 = 새싹. 같은 종류는 그림이 같음.
// 판(board): 세트 배열 [[id, …], …]. 세트는 순서 없이 검사하고, 보여 줄 때만 orderSet으로 정렬.
//   꽃줄(런): 같은 꽃색 연속 숫자 3개 이상 / 꽃다발(그룹): 같은 숫자 서로 다른 꽃색 3~4개
//   새싹은 아무 타일 대신. 첫 등록은 내 패만으로 30점 이상, 그전엔 판을 건드릴 수 없음.

const COLORS = [
  { key: 'r', name: '동백', color: '#d1343c', light: '#fde3e3', mark: '●' },
  { key: 'y', name: '개나리', color: '#c77700', light: '#fff1cc', mark: '✚' },
  { key: 'b', name: '수국', color: '#2160c4', light: '#dfeaff', mark: '◆' },
  { key: 'p', name: '제비꽃', color: '#7a3bbf', light: '#eee2fb', mark: '▲' },
];
const JOKER_KIND = 52;
const TOTAL_TILES = 106;
const HAND_SIZE = 14;
const FIRST_MELD = 30;
const JOKER_POINTS = 30;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;

const isJoker = (id) => id >= 104;
const kindOf = (id) => (id >= 104 ? JOKER_KIND : id % 52);
const numOf = (id) => (id >= 104 ? 0 : (id % 13) + 1);
const colorOf = (id) => (id >= 104 ? -1 : Math.floor((id % 52) / 13));
const kindNum = (k) => (k >= JOKER_KIND ? 0 : (k % 13) + 1);
const kindColor = (k) => (k >= JOKER_KIND ? -1 : Math.floor(k / 13));

function kindName(k) {
  k = Number(k);
  if (k >= JOKER_KIND) return '새싹(조커)';
  const c = COLORS[kindColor(k)];
  return c.name + c.mark + ' ' + kindNum(k);
}
const tileName = (id) => kindName(kindOf(id));

/** 손패 정렬: mode 'color' = 꽃색→숫자, 'num' = 숫자→꽃색. 새싹은 맨 뒤 */
function sortTiles(ids, mode) {
  const key = (id) => {
    if (isJoker(id)) return 10000 + id;
    return mode === 'num' ? numOf(id) * 100 + colorOf(id) * 10 + (id >= 52 ? 1 : 0) : colorOf(id) * 100 + numOf(id) * 2 + (id >= 52 ? 1 : 0);
  };
  return ids.slice().sort((a, b) => key(a) - key(b));
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

// ---------- 세트 판정 ----------
const BAD = '같은 꽃색 연속 숫자(꽃줄)나 같은 숫자 다른 꽃색(꽃다발)이 아니에요.';

/**
 * 세트 하나 검사 → { ok, kind:'run'|'group', value(점수 합, 새싹은 대신하는 숫자), reason }
 * 둘 다 되면 점수가 큰 쪽으로 봄
 */
function analyzeSet(ids) {
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
function orderSet(ids) {
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
function jokerValues(ids) {
  const a = analyzeSet(ids);
  const out = {};
  if (!a.ok) return out;
  if (a.kind === 'group') ids.filter(isJoker).forEach((id) => (out[id] = a.num));
  else orderSet(ids).forEach((id, i) => isJoker(id) && (out[id] = a.lo + i));
  return out;
}

function handScore(hand) {
  let s = 0;
  for (const id of hand) s += isJoker(id) ? JOKER_POINTS : numOf(id);
  return s;
}

const setKey = (set) => set.slice().sort((a, b) => a - b).join(',');

// ---------- 게임 진행 ----------
function newGame(n, first) {
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
function checkTurn(g, seat, board, played) {
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
function playTurn(g, seat, board, played) {
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
function drawTurn(g, seat) {
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
function botTurn(g, seat, difficulty) {
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

function runSelfTests(games = 2000) {
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

return { COLORS, JOKER_KIND, TOTAL_TILES, HAND_SIZE, FIRST_MELD, JOKER_POINTS, MIN_PLAYERS, MAX_PLAYERS, isJoker, kindOf, numOf, colorOf, kindNum, kindColor, kindName, tileName, sortTiles, shuffle, analyzeSet, orderSet, jokerValues, handScore, newGame, checkTurn, playTurn, drawTurn, botTurn, runSelfTests };
})();

// ==================== LFRules (games/lunch-five/js/rules.js) ====================
const LFRules = (() => {
// 급식 다섯! — 순수 규칙 엔진 + 봇 + 자가 테스트 (브라우저·앱스크립트 공용, 다른 파일 import 금지)
// 카드 코드: 메뉴 id + 개수 ('tteok3' = 떡볶이 3개)
// 더미(piles[seat])는 0번이 맨 위, 공개 더미(open[seat])는 마지막이 맨 위

const MENUS = ['tteok', 'donkatsu', 'gimbap', 'milk', 'pudding'];
const MENU_NAME = { tteok: '떡볶이', donkatsu: '돈가스', gimbap: '김밥', milk: '우유', pudding: '푸딩' };
const MENU_EMOJI = { tteok: '🌶️', donkatsu: '🍖', gimbap: '🍙', milk: '🥛', pudding: '🍮' };
/** 메뉴 한 종류마다: 개수 → 장수 (1개×5, 2개×3, 3개×3, 4개×2, 5개×1 = 14장) */
const COPIES = { 1: 5, 2: 3, 3: 3, 4: 2, 5: 1 };
const TARGET = 5; // 보이는 맨 위 카드에서 한 메뉴의 합이 정확히 이만큼이면 종!
const CARDS_PER_MENU = Object.keys(COPIES).reduce((n, k) => n + COPIES[k], 0);
const DECK_SIZE = MENUS.length * CARDS_PER_MENU; // 5종 → 70장 (4종이면 56장)
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const MAX_FLIPS = 220; // 이만큼 뒤집으면 끝 → 카드가 가장 많은 사람 승리

function makeDeck(menus = MENUS) {
  const out = [];
  menus.forEach((m) => {
    Object.keys(COPIES).forEach((k) => {
      for (let i = 0; i < COPIES[k]; i++) out.push(m + k);
    });
  });
  return out;
}

function cardMenu(c) {
  return String(c).replace(/[0-9]+$/, '');
}
function cardCount(c) {
  return Number(String(c).match(/[0-9]+$/)[0]);
}
function cardName(c) {
  return (MENU_NAME[cardMenu(c)] || cardMenu(c)) + ' ' + cardCount(c) + '개';
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

/** 새 판: n명에게 똑같이 나눔 (나머지는 상자에 넣고 안 씀) */
function newGame(n, deck) {
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
function tops(g) {
  return g.open.map((o) => (o.length ? o[o.length - 1] : null));
}

/** 보이는 맨 위 카드들의 메뉴별 합 */
function sums(g) {
  const s = {};
  tops(g).forEach((c) => {
    if (!c) return;
    const m = cardMenu(c);
    s[m] = (s[m] || 0) + cardCount(c);
  });
  return s;
}

/** 합이 정확히 5인 메뉴 (없으면 null) */
function fiveMenu(g) {
  const s = sums(g);
  return MENUS.find((m) => s[m] === TARGET) || Object.keys(s).find((m) => s[m] === TARGET) || null;
}
function hasFive(g) {
  return !!fiveMenu(g);
}

function activeSeats(g) {
  const a = [];
  for (let i = 0; i < g.n; i++) if (!g.out[i]) a.push(i);
  return a;
}

/** 내 카드 수 (더미 + 공개 더미) */
function cardsOf(g, seat) {
  return g.piles[seat].length + g.open[seat].length;
}

function countAll(g) {
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
function leader(g) {
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
function flip(g, seat) {
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
function ring(g, seat, tick) {
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
const BOT_REACT = { easy: [1600, 2400], normal: [900, 1500], hard: [500, 900] };
const BOT_MISS = { easy: 0.15, normal: 0.04, hard: 0 }; // 5인데 못 봄
const BOT_OOPS = { easy: 0.08, normal: 0.02, hard: 0 }; // 5가 아닌데 잘못 침

function botReaction(difficulty) {
  const r = BOT_REACT[difficulty] || BOT_REACT.normal;
  return Math.round(r[0] + Math.random() * (r[1] - r[0]));
}

/**
 * 판이 바뀔 때마다: 이번 판에 종을 칠 가장 빠른 봇 { seat, delay, wrong } 또는 null
 * bots: [{ seat, difficulty }]
 */
function planBots(g, bots) {
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
function botFlipDelay(difficulty) {
  return difficulty === 'hard' ? 900 : difficulty === 'easy' ? 1400 : 1100;
}

// ---------- 자가 테스트 ----------
function runSelfTests() {
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

return { MENUS, MENU_NAME, MENU_EMOJI, COPIES, TARGET, CARDS_PER_MENU, DECK_SIZE, MIN_PLAYERS, MAX_PLAYERS, MAX_FLIPS, makeDeck, cardMenu, cardCount, cardName, shuffle, newGame, tops, sums, fiveMenu, hasFive, activeSeats, cardsOf, countAll, leader, flip, ring, BOT_REACT, botReaction, planBots, botFlipDelay, runSelfTests };
})();

// ==================== STRules (games/school-trip/js/rules.js) ====================
const STRules = (() => {
// 서라벌학교여행 — 규칙 엔진 + 봇 (브라우저와 앱스크립트 서버가 같이 씀)
// 주사위 땅따먹기 보드게임 규칙을 참고해 독자적으로 만든 게임. 땅 = 서라벌여중의 실(교실).
// 돈 단위: 만 원. 은행(bank)·복지 기부함(fund)·모든 사람 현금의 합은 늘 처음과 같음(돈 보존).
// 상태를 바꾸는 함수는 이벤트 배열을 돌려줌 → 서버가 pushEvent, 화면이 순서대로 연출.

const START_MONEY = 1200;
const SALARY = 200;
const BAIL = 50;
const DONATION = 100;
const JAIL_TURNS = 3;
const BANK_START = 20000;
const ROUND_CHOICES = [10, 15, 20];
const BUILD_NAMES = ['', '🪑 책상', '📚 책장', '🏫 리모델링'];
const RENT_MULT = [1, 5, 15, 30];
const FLOOR_COLORS = ['#ff9db0', '#ffc46b', '#7fd6a4', '#8fb6ff'];
const GROUP_COLORS = ['#ff8fa3', '#ffb3c6', '#ffb347', '#ffd77a', '#5fcf8f', '#a4e6b8', '#6f9dff', '#b49cff'];
const BUILD_COST = [50, 100, 150, 200];

// kind: start · room · mark(명소) · card · jail(숙직실) · welfare(복지실) · elev(엘리베이터) · fund(복지 기부함)
const R = (name, group, price) => ({ name, kind: 'room', group, price });
const M = (name, price, rent, icon) => ({ name, kind: 'mark', group: -1, price, rent, icon });
const C = () => ({ name: '행운 쪽지', kind: 'card', icon: '💌' });
const CELLS = [
  { name: '교문', kind: 'start', icon: '🏫' },
  R('보건실', 0, 60), C(), R('방송실', 0, 60), R('행정실', 0, 80), M('교정 분수대', 200, 50, '⛲'), R('과학실1', 1, 100), C(), R('과학실3', 1, 100), R('교장실', 1, 120),
  { name: '숙직실', kind: 'jail', icon: '🛏️' },
  R('미술실', 2, 140), C(), R('기술실', 2, 140), R('가정실', 2, 160), M('체력단련실', 220, 60, '🏋️'), R('1학년 1반', 3, 180), R('영어활동실', 3, 180), C(), R('교무센터', 3, 200),
  { name: '복지실', kind: 'welfare', icon: '💝' },
  R('2학년 1반', 4, 220), C(), R('컴퓨터실', 4, 220), R('다목적실', 4, 240), M('자기주도배움터', 250, 70, '📖'), R('진로상담실', 5, 260), R('2학년 교무실', 5, 260), C(), R('수학교과지원실', 5, 280),
  { name: '엘리베이터', kind: 'elev', icon: '🛗' },
  R('음악실1', 6, 300), C(), R('음악실2', 6, 300), R('3학년 1반', 6, 320), M('홈베이스', 280, 90, '🏠'), R('3학년 교무실', 7, 350), R('글빛소회의실', 7, 350), { name: '복지 기부함', kind: 'fund', icon: '🪙' }, R('글빛도서관', 7, 400),
];
CELLS.forEach((c, i) => {
  c.i = i;
  c.floor = i % 10 ? Math.floor(i / 10) : -1; // 1층=0 … 4층=3, 모서리 칸은 -1
});
const GROUPS = [0, 1, 2, 3, 4, 5, 6, 7].map((g) => CELLS.filter((c) => c.group === g).map((c) => c.i));
const isProp = (i) => CELLS[i].kind === 'room' || CELLS[i].kind === 'mark';
const buildCost = (i) => BUILD_COST[CELLS[i].floor] || 50;
const floorName = (i) => (CELLS[i].kind === 'room' || CELLS[i].kind === 'mark' || CELLS[i].kind === 'card' || CELLS[i].kind === 'fund' ? CELLS[i].floor + 1 + '층' : '');

const CARDS = [
  { id: 0, title: '장학금 받기', text: '성실상! 장학금 100만 원을 받아요.', good: true, fx: 'gain', v: 100 },
  { id: 1, title: '급식 당번 간식비', text: '급식 당번 간식비 50만 원을 복지 기부함에 내요.', fx: 'fine', v: 50 },
  { id: 2, title: '교문으로 바로 가기', text: '교문으로 바로 가서 용돈을 받아요.', good: true, fx: 'goto', v: 0 },
  { id: 3, title: '숙직실로!', text: '복도에서 뛰다 걸렸어요. 숙직실로 바로 가요. (교문을 지나도 용돈 없음)', fx: 'jail' },
  { id: 4, title: '뒤로 3칸', text: '준비물을 두고 왔어요! 뒤로 3칸 가요.', fx: 'back', v: 3 },
  { id: 5, title: '엘리베이터 타기', text: '엘리베이터로 가요. 다음 차례에 원하는 칸으로 이동!', good: true, fx: 'goto', v: 30 },
  { id: 6, title: '친구들에게 간식', text: '모든 친구에게 간식값 20만 원씩 사 줘요.', fx: 'payall', v: 20 },
  { id: 7, title: '건물 수리비', text: '내 건물 한 단계마다 수리비 25만 원을 복지 기부함에 내요.', fx: 'repair', v: 25 },
  { id: 8, title: '통행료 면제권', text: '통행료를 한 번 안 내도 돼요. (가지고 있다가 자동으로 써요)', good: true, fx: 'pass' },
  { id: 9, title: '생일 축하!', text: '오늘 내 생일! 모든 친구에게 20만 원씩 받아요.', good: true, fx: 'getall', v: 20 },
  { id: 10, title: '교내 대회 우승', text: '교내 과학 대회 우승 상금 150만 원!', good: true, fx: 'gain', v: 150 },
  { id: 11, title: '분실물 찾아 주기', text: '친구 지갑을 찾아 줬어요. 보상 30만 원.', good: true, fx: 'gain', v: 30 },
  { id: 12, title: '체육복 분실', text: '체육복을 잃어버렸어요. 40만 원을 복지 기부함에 내요.', fx: 'fine', v: 40 },
  { id: 13, title: '글빛도서관으로', text: '책 반납일! 글빛도서관으로 가요. (교문을 지나면 용돈)', fx: 'goto', v: 39 },
  { id: 14, title: '복지실로', text: '복지실로 가요. 쌓인 기부금이 있으면 내 것!', good: true, fx: 'goto', v: 20 },
  { id: 15, title: '앞으로 2칸', text: '복도를 빠르게! 앞으로 2칸 가요.', good: true, fx: 'fwd', v: 2 },
  { id: 16, title: '현장학습비', text: '현장학습비 80만 원을 복지 기부함에 내요.', fx: 'fine', v: 80 },
  { id: 17, title: '바자회 수익', text: '학급 바자회 수익 60만 원을 받아요.', good: true, fx: 'gain', v: 60 },
];

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newGame(n, maxRounds = 15) {
  if (n < 2 || n > 4) throw new Error('2~4명이 필요해요.');
  return {
    n,
    players: Array.from({ length: n }, () => ({ cash: START_MONEY, pos: 0, jail: 0, elev: false, pass: 0, out: false })),
    own: new Array(40).fill(-1),
    lvl: new Array(40).fill(0),
    bank: BANK_START - START_MONEY * n,
    fund: 0,
    turn: 0,
    phase: 'roll',
    again: false,
    dbl: 0,
    dice: [1, 1],
    round: 1,
    maxRounds: ROUND_CHOICES.indexOf(maxRounds) >= 0 ? maxRounds : maxRounds > 0 ? maxRounds : 15,
    deck: shuffle(CARDS.map((c) => c.id)),
    deckPos: 0,
    winner: -1,
    endReason: '',
    moves: 0,
  };
}

/** 돈 총합 (보존 확인용) */
const totalMoney = (g) => g.bank + g.fund + g.players.reduce((s, p) => s + p.cash, 0);

/** 통행료 (주인이 없으면 0) */
function rentOf(g, i) {
  const c = CELLS[i];
  const o = g.own[i];
  if (o < 0) return 0;
  if (c.kind === 'mark') return c.rent;
  const base = Math.round(c.price / 10) * RENT_MULT[g.lvl[i]];
  return hasMonopoly(g, o, c.group) ? base * 2 : base;
}
const hasMonopoly = (g, seat, group) => group >= 0 && GROUPS[group].every((k) => g.own[k] === seat);
/** 한 실의 값어치 (땅값 + 지은 건물값) */
const propValue = (g, i) => CELLS[i].price + g.lvl[i] * buildCost(i);
function assetsOf(g, seat) {
  const p = g.players[seat];
  if (p.out) return 0;
  let v = p.cash;
  for (let i = 0; i < 40; i++) if (g.own[i] === seat) v += propValue(g, i);
  return v;
}
/** 통행료표: [기본, 책상, 책장, 리모델링] (독점 전) */
function rentTable(i) {
  const c = CELLS[i];
  if (c.kind === 'mark') return [c.rent];
  return RENT_MULT.map((m) => Math.round(c.price / 10) * m);
}

// ---------- 돈 옮기기 ----------
function credit(g, to, amt) {
  if (to === 'bank') g.bank += amt;
  else if (to === 'fund') g.fund += amt;
  else g.players[to].cash += amt;
}
function fromBank(g, seat, amt, evs, why) {
  g.bank -= amt;
  g.players[seat].cash += amt;
  evs.push({ type: 'gain', seat, amount: amt, why });
}

/** 모자라면 건물 → 땅 순으로 반값에 팔기 */
function liquidate(g, seat, need, evs) {
  const p = g.players[seat];
  while (p.cash < need) {
    let best = -1;
    for (let i = 0; i < 40; i++) if (g.own[i] === seat && g.lvl[i] > 0 && (best < 0 || g.lvl[i] > g.lvl[best] || (g.lvl[i] === g.lvl[best] && buildCost(i) < buildCost(best)))) best = i;
    if (best >= 0) {
      const amt = Math.floor(buildCost(best) / 2);
      g.lvl[best]--;
      g.bank -= amt;
      p.cash += amt;
      evs.push({ type: 'sell', seat, cell: best, what: 'build', lvl: g.lvl[best], amount: amt });
      continue;
    }
    for (let i = 0; i < 40; i++) if (g.own[i] === seat && (best < 0 || CELLS[i].price < CELLS[best].price)) best = i;
    if (best < 0) return false;
    const amt = Math.floor(CELLS[best].price / 2);
    g.own[best] = -1;
    g.bank -= amt;
    p.cash += amt;
    evs.push({ type: 'sell', seat, cell: best, what: 'land', amount: amt });
  }
  return true;
}

/** seat이 to('bank'|'fund'|자리)에 amt를 냄. 못 내면 파산. 실제 낸 돈을 돌려줌 */
function pay(g, seat, amt, to, evs) {
  const p = g.players[seat];
  if (p.out || amt <= 0) return 0;
  if (p.cash < amt) liquidate(g, seat, amt, evs);
  if (p.cash >= amt) {
    p.cash -= amt;
    credit(g, to, amt);
    return amt;
  }
  const paid = p.cash;
  credit(g, to, paid);
  p.cash = 0;
  bankrupt(g, seat, evs, to);
  return paid;
}

function bankrupt(g, seat, evs, to) {
  const p = g.players[seat];
  p.out = true;
  p.elev = false;
  p.jail = 0;
  for (let i = 0; i < 40; i++)
    if (g.own[i] === seat) {
      g.own[i] = -1;
      g.lvl[i] = 0;
    }
  evs.push({ type: 'bankrupt', seat, to: typeof to === 'number' ? to : -1 });
  const alive = g.players.map((q, k) => (q.out ? -1 : k)).filter((k) => k >= 0);
  if (alive.length === 1) endGame(g, alive[0], 'last', evs);
}

function endGame(g, winner, reason, evs) {
  g.phase = 'over';
  g.winner = winner;
  g.endReason = reason;
  evs.push({ type: 'end', winner, reason, assets: g.players.map((_, k) => assetsOf(g, k)) });
}

// ---------- 이동 ----------
function stepMove(g, seat, steps, evs) {
  const p = g.players[seat];
  const from = p.pos;
  const dir = steps < 0 ? -1 : 1;
  let salary = 0;
  for (let k = 0; k < Math.abs(steps); k++) {
    p.pos = (p.pos + dir + 40) % 40;
    if (dir > 0 && p.pos === 0) salary += SALARY;
  }
  evs.push({ type: 'move', seat, from, to: p.pos, steps });
  if (salary) fromBank(g, seat, salary, evs, 'salary');
}
/** 앞으로 target 칸까지 (교문 지나면 용돈) */
function moveForwardTo(g, seat, target, evs) {
  const d = (target - g.players[seat].pos + 40) % 40;
  if (d) stepMove(g, seat, d, evs);
}

function sendToJail(g, seat, evs) {
  const p = g.players[seat];
  evs.push({ type: 'jump', seat, from: p.pos, to: 10 });
  p.pos = 10;
  p.jail = JAIL_TURNS;
  p.elev = false;
  g.again = false;
  evs.push({ type: 'jail', seat });
}

function land(g, seat, evs, depth = 0) {
  const p = g.players[seat];
  const i = p.pos;
  const c = CELLS[i];
  g.pending = -1;
  if (c.kind === 'room' || c.kind === 'mark') {
    const o = g.own[i];
    if (o < 0) {
      if (p.cash >= c.price) {
        g.phase = 'buy';
        g.pending = i;
      } else evs.push({ type: 'poor', seat, cell: i });
    } else if (o === seat) {
      if (c.kind === 'room' && g.lvl[i] < 3 && p.cash >= buildCost(i)) {
        g.phase = 'build';
        g.pending = i;
      }
    } else if (!g.players[o].out) {
      const amt = rentOf(g, i);
      if (p.pass > 0) {
        p.pass--;
        evs.push({ type: 'rent', seat, to: o, cell: i, amount: 0, free: true });
      } else {
        const paid = pay(g, seat, amt, o, evs);
        evs.push({ type: 'rent', seat, to: o, cell: i, amount: paid });
      }
    }
  } else if (c.kind === 'card') drawCard(g, seat, evs, depth);
  else if (c.kind === 'welfare') {
    if (g.fund > 0) {
      const amt = g.fund;
      g.fund = 0;
      p.cash += amt;
      evs.push({ type: 'welfare', seat, amount: amt });
    } else evs.push({ type: 'welfare', seat, amount: 0 });
  } else if (c.kind === 'elev') {
    p.elev = true;
    g.again = false;
    evs.push({ type: 'elev', seat });
  } else if (c.kind === 'fund') {
    const paid = pay(g, seat, DONATION, 'fund', evs);
    evs.push({ type: 'donate', seat, amount: paid });
  }
}

function drawCard(g, seat, evs, depth) {
  if (g.deckPos >= g.deck.length) {
    g.deck = shuffle(g.deck);
    g.deckPos = 0;
  }
  const card = CARDS[g.deck[g.deckPos++]];
  const p = g.players[seat];
  evs.push({ type: 'card', seat, card: card.id });
  const others = g.players.map((q, k) => k).filter((k) => k !== seat && !g.players[k].out);
  switch (card.fx) {
    case 'gain':
      fromBank(g, seat, card.v, evs, 'card');
      break;
    case 'fine':
      pay(g, seat, card.v, 'fund', evs);
      break;
    case 'goto':
      moveForwardTo(g, seat, card.v, evs);
      if (card.v !== 0 && depth < 3) land(g, seat, evs, depth + 1);
      break;
    case 'jail':
      sendToJail(g, seat, evs);
      break;
    case 'back':
      stepMove(g, seat, -card.v, evs);
      if (depth < 3) land(g, seat, evs, depth + 1);
      break;
    case 'fwd':
      stepMove(g, seat, card.v, evs);
      if (depth < 3) land(g, seat, evs, depth + 1);
      break;
    case 'payall':
      for (const k of others) if (!p.out) pay(g, seat, card.v, k, evs);
      break;
    case 'getall':
      for (const k of others) if (g.phase !== 'over') pay(g, k, card.v, seat, evs);
      break;
    case 'repair': {
      let n = 0;
      for (let i = 0; i < 40; i++) if (g.own[i] === seat) n += g.lvl[i];
      if (n) pay(g, seat, n * card.v, 'fund', evs);
      break;
    }
    case 'pass':
      p.pass++;
      break;
  }
}

// ---------- 차례 ----------
function check(g, seat) {
  if (g.phase === 'over') throw new Error('이미 끝난 판이에요.');
  if (seat !== g.turn) throw new Error('지금은 다른 사람 차례예요.');
}

/** 할 일이 끝나면 차례 넘기기 (더블이면 한 번 더) */
function finishTurn(g, evs) {
  if (g.phase === 'over') return;
  if (g.phase === 'buy' || g.phase === 'build') return;
  const p = g.players[g.turn];
  g.pending = -1;
  if (!p.out && g.again) {
    g.phase = 'roll';
    return;
  }
  g.again = false;
  g.dbl = 0;
  let k = g.turn;
  for (let s = 0; s < g.n; s++) {
    k = (k + 1) % g.n;
    if (!g.players[k].out) break;
  }
  if (k <= g.turn) g.round++;
  if (g.round > g.maxRounds) {
    g.round = g.maxRounds;
    let best = -1;
    for (let s = 0; s < g.n; s++) if (!g.players[s].out && (best < 0 || assetsOf(g, s) > assetsOf(g, best))) best = s;
    endGame(g, best, 'rounds', evs);
    return;
  }
  g.turn = k;
  g.phase = 'roll';
  evs.push({ type: 'turn', seat: k, round: g.round });
}

function roll(g, seat, dice) {
  check(g, seat);
  if (g.phase !== 'roll') throw new Error('지금은 주사위를 굴릴 때가 아니에요.');
  const p = g.players[seat];
  if (p.elev) throw new Error('엘리베이터에 탔어요! 가고 싶은 칸을 골라 주세요.');
  const d = dice || [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
  const evs = [{ type: 'roll', seat, d }];
  g.dice = d;
  g.moves++;
  const dbl = d[0] === d[1];
  const sum = d[0] + d[1];
  if (p.jail > 0) {
    g.again = false;
    if (dbl) {
      p.jail = 0;
      evs.push({ type: 'free', seat, how: 'double' });
    } else {
      p.jail--;
      if (p.jail > 0) {
        evs.push({ type: 'stay', seat, left: p.jail });
        finishTurn(g, evs);
        return evs;
      }
      pay(g, seat, BAIL, 'fund', evs);
      evs.push({ type: 'free', seat, how: 'time' });
      if (p.out) {
        finishTurn(g, evs);
        return evs;
      }
    }
  } else if (dbl) {
    g.dbl++;
    if (g.dbl >= 3) {
      evs.push({ type: 'triple', seat });
      sendToJail(g, seat, evs);
      finishTurn(g, evs);
      return evs;
    }
    g.again = true;
  } else g.again = false;
  stepMove(g, seat, sum, evs);
  land(g, seat, evs);
  finishTurn(g, evs);
  return evs;
}

/** 숙직실에서 돈 내고 바로 나오기 (그다음 주사위를 굴림) */
function payBail(g, seat) {
  check(g, seat);
  const p = g.players[seat];
  if (g.phase !== 'roll' || p.jail <= 0) throw new Error('숙직실에 있을 때만 낼 수 있어요.');
  if (p.cash < BAIL) throw new Error('돈이 모자라요.');
  p.cash -= BAIL;
  g.fund += BAIL;
  p.jail = 0;
  return [{ type: 'free', seat, how: 'pay', amount: BAIL }];
}

/** 엘리베이터: 원하는 칸으로 */
function fly(g, seat, to) {
  check(g, seat);
  const p = g.players[seat];
  if (g.phase !== 'roll' || !p.elev) throw new Error('엘리베이터를 탄 사람만 고를 수 있어요.');
  to = Number(to);
  if (!(to >= 0 && to < 40) || to !== Math.floor(to) || to === 30) throw new Error('갈 수 없는 칸이에요.');
  p.elev = false;
  g.again = false;
  g.moves++;
  const evs = [{ type: 'fly', seat, from: p.pos, to }];
  const salary = to < p.pos || to === 0;
  p.pos = to;
  if (salary) fromBank(g, seat, SALARY, evs, 'salary');
  land(g, seat, evs);
  finishTurn(g, evs);
  return evs;
}

function buy(g, seat) {
  check(g, seat);
  if (g.phase !== 'buy') throw new Error('지금은 살 수 없어요.');
  const i = g.pending;
  const p = g.players[seat];
  const price = CELLS[i].price;
  if (p.cash < price) throw new Error('돈이 모자라요.');
  p.cash -= price;
  g.bank += price;
  g.own[i] = seat;
  g.phase = 'roll';
  const evs = [{ type: 'buy', seat, cell: i, price }];
  finishTurn(g, evs);
  return evs;
}

function build(g, seat) {
  check(g, seat);
  if (g.phase !== 'build') throw new Error('지금은 지을 수 없어요.');
  const i = g.pending;
  const p = g.players[seat];
  const cost = buildCost(i);
  if (p.cash < cost) throw new Error('돈이 모자라요.');
  if (g.lvl[i] >= 3) throw new Error('더 지을 수 없어요.');
  p.cash -= cost;
  g.bank += cost;
  g.lvl[i]++;
  g.phase = 'roll';
  const evs = [{ type: 'build', seat, cell: i, lvl: g.lvl[i], cost }];
  finishTurn(g, evs);
  return evs;
}

/** 안 사기 / 안 짓기 */
function skip(g, seat) {
  check(g, seat);
  if (g.phase !== 'buy' && g.phase !== 'build') throw new Error('지금은 넘길 게 없어요.');
  const evs = [{ type: 'skip', seat, cell: g.pending, what: g.phase }];
  g.phase = 'roll';
  finishTurn(g, evs);
  return evs;
}

// ---------- 봇 ----------
const RESERVE = { easy: 50, normal: 150, hard: 120 };

function wantsBuy(g, seat, i, diff) {
  const p = g.players[seat];
  const c = CELLS[i];
  if (diff === 'away') return false;
  if (diff === 'easy') return p.cash - c.price >= 0 && Math.random() < 0.65;
  let reserve = RESERVE[diff] || 150;
  if (c.group >= 0) {
    const mine = GROUPS[c.group].filter((k) => g.own[k] === seat).length;
    const theirs = GROUPS[c.group].filter((k) => g.own[k] >= 0 && g.own[k] !== seat);
    if (mine === GROUPS[c.group].length - 1) reserve = diff === 'hard' ? 0 : 40; // 독점 완성
    if (diff === 'hard' && theirs.length === GROUPS[c.group].length - 1 && new Set(theirs.map((k) => g.own[k])).size === 1) reserve = 30; // 남의 독점 막기
  }
  if (c.kind === 'mark') reserve = Math.min(reserve, 100);
  return p.cash - c.price >= reserve;
}
function wantsBuild(g, seat, i, diff) {
  const p = g.players[seat];
  if (diff === 'away') return false;
  if (diff === 'easy') return Math.random() < 0.5 && p.cash - buildCost(i) >= 50;
  const reserve = diff === 'hard' ? (hasMonopoly(g, seat, CELLS[i].group) ? 100 : 180) : 220;
  return p.cash - buildCost(i) >= reserve;
}

/** 엘리베이터로 갈 칸 점수 */
function flyScore(g, seat, to) {
  const p = g.players[seat];
  const c = CELLS[to];
  let s = to < p.pos || to === 0 ? SALARY : 0;
  if (isProp(to)) {
    const o = g.own[to];
    if (o < 0) s += p.cash >= c.price ? 120 + c.price * 0.3 + (c.group >= 0 && GROUPS[c.group].filter((k) => g.own[k] === seat).length * 80) : 0;
    else if (o === seat) s += c.kind === 'room' && g.lvl[to] < 3 && p.cash >= buildCost(to) ? 90 + rentOf(g, to) : 10;
    else s -= g.players[o].out ? 0 : rentOf(g, to) * (p.pass ? 0 : 1);
  } else if (c.kind === 'welfare') s += g.fund;
  else if (c.kind === 'fund') s -= DONATION;
  else if (c.kind === 'card') s += 20;
  else if (c.kind === 'jail') s -= 10;
  return s;
}
function bestFly(g, seat, diff = 'normal') {
  if (diff === 'away') return 0;
  let best = 0;
  let bv = -Infinity;
  for (let i = 0; i < 40; i++) {
    if (i === 30) continue;
    const v = flyScore(g, seat, i) + (diff === 'easy' ? Math.random() * 300 : 0);
    if (v > bv) {
      bv = v;
      best = i;
    }
  }
  return best;
}

/** 봇 한 걸음 (자리 비운 사람은 diff='away': 사지 않고 넘기기) */
function botStep(g, seat, diff = 'normal') {
  const p = g.players[seat];
  if (g.phase === 'buy') return wantsBuy(g, seat, g.pending, diff) ? buy(g, seat) : skip(g, seat);
  if (g.phase === 'build') return wantsBuild(g, seat, g.pending, diff) ? build(g, seat) : skip(g, seat);
  if (p.elev) return fly(g, seat, bestFly(g, seat, diff));
  if (p.jail > 0 && diff !== 'away' && diff !== 'easy' && p.cash >= BAIL + 300 && g.round < g.maxRounds * 0.6) {
    const evs = payBail(g, seat);
    return evs.concat(roll(g, seat));
  }
  return roll(g, seat);
}

/** 화면용 공개 상태 (다음 카드 순서만 숨김) */
function publicView(g) {
  return {
    n: g.n,
    players: g.players,
    own: g.own,
    lvl: g.lvl,
    fund: g.fund,
    turn: g.turn,
    phase: g.phase,
    pending: g.pending == null ? -1 : g.pending,
    dice: g.dice,
    again: g.again,
    round: g.round,
    maxRounds: g.maxRounds,
    winner: g.winner,
    endReason: g.endReason,
    moves: g.moves,
  };
}

const won = (v) => (v >= 10000 ? (v / 10000).toFixed(v % 10000 ? 1 : 0) + '억' : v + '만');

// ---------- 자가 테스트 ----------
function runSelfTests(n) {
  const games = typeof n === 'number' ? n : 2000;
  const results = [];
  const ok = (name, cond) => results.push({ name, pass: !!cond });
  ok('판은 40칸', CELLS.length === 40);
  ok('행운 쪽지 7칸', CELLS.filter((c) => c.kind === 'card').length === 7);
  ok('명소 4곳', CELLS.filter((c) => c.kind === 'mark').length === 4);
  ok('색 그룹 8개 × 3칸', GROUPS.length === 8 && GROUPS.every((x) => x.length === 3));
  ok('그룹은 같은 층', GROUPS.every((x) => x.every((k) => CELLS[k].floor === CELLS[x[0]].floor)));
  ok('글빛도서관이 가장 비쌈', CELLS[39].price === Math.max(...CELLS.filter((c) => c.price).map((c) => c.price)));
  ok('행운 쪽지 15~20종', CARDS.length >= 15 && CARDS.length <= 20);
  // 정해진 주사위로 흐름 확인
  let g = newGame(2);
  const T0 = totalMoney(g);
  roll(g, 0, [1, 2]); // 3칸 → 방송실
  ok('주인 없는 실에 멈추면 사기 단계', g.phase === 'buy' && g.pending === 3);
  let threw = false;
  try {
    roll(g, 1, [1, 2]);
  } catch {
    threw = true;
  }
  ok('남의 차례에는 못 굴림', threw);
  buy(g, 0);
  ok('사면 내 땅, 차례 넘어감', g.own[3] === 0 && g.turn === 1 && g.players[0].cash === START_MONEY - 60);
  roll(g, 1, [1, 2]);
  ok('남의 실이면 통행료 자동', g.players[1].cash === START_MONEY - 6 && g.players[0].cash === START_MONEY - 54);
  ok('돈 보존', totalMoney(g) === T0);
  // 더블은 한 번 더, 세 번이면 숙직실
  g = newGame(2);
  roll(g, 0, [2, 2]);
  if (g.phase === 'buy') skip(g, 0);
  ok('더블이면 같은 사람 한 번 더', g.turn === 0 && g.phase === 'roll');
  roll(g, 0, [3, 3]);
  if (g.phase === 'buy') skip(g, 0);
  roll(g, 0, [1, 1]);
  ok('더블 세 번이면 숙직실', g.players[0].pos === 10 && g.players[0].jail === JAIL_TURNS && g.turn === 1);
  // 숙직실 3턴
  g = newGame(2);
  g.players[0].pos = 10;
  g.players[0].jail = 3;
  roll(g, 0, [1, 2]);
  ok('숙직실에서 더블 아니면 그대로', g.players[0].pos === 10 && g.players[0].jail === 2);
  g.turn = 0;
  roll(g, 0, [3, 3]);
  ok('더블이면 탈출', g.players[0].jail === 0 && g.players[0].pos === 16);
  // 엘리베이터
  g = newGame(2);
  g.players[0].pos = 30;
  g.players[0].elev = true;
  const c0 = g.players[0].cash;
  fly(g, 0, 5);
  ok('엘리베이터: 교문 지나면 용돈 + 원하는 칸', g.players[0].pos === 5 && g.players[0].cash === c0 + SALARY && g.phase === 'buy');
  // 독점 2배 + 건물
  g = newGame(2);
  GROUPS[0].forEach((k) => (g.own[k] = 1));
  ok('독점하면 통행료 2배', rentOf(g, 1) === 12);
  g.lvl[1] = 3;
  ok('리모델링 통행료', rentOf(g, 1) === 6 * 30 * 2);
  // 파산: 건물→땅 팔고도 못 내면 탈락
  g = newGame(2);
  g.own[39] = 1;
  g.lvl[39] = 3;
  g.bank += g.players[0].cash - 10;
  g.players[0].cash = 10;
  const T1 = totalMoney(g);
  g.own[1] = 0;
  g.lvl[1] = 2;
  g.players[0].pos = 37;
  roll(g, 0, [1, 1]);
  ok('못 내면 파산하고 승리 결정', g.players[0].out && g.phase === 'over' && g.winner === 1 && g.own[1] === -1);
  ok('파산 뒤에도 돈 보존', totalMoney(g) === T1);
  // 복지 기부함 → 복지실
  g = newGame(2);
  g.players[0].pos = 35;
  roll(g, 0, [1, 2]);
  ok('복지 기부함에 내면 쌓임', g.fund === DONATION);
  g.turn = 0;
  g.phase = 'roll';
  g.players[0].pos = 18;
  const c1 = g.players[0].cash;
  roll(g, 0, [1, 1]);
  ok('복지실에 멈추면 기부금을 받음', g.players[0].cash === c1 + DONATION && g.fund === 0);
  // 라운드 제한
  g = newGame(2, 10);
  let guard = 0;
  while (g.phase !== 'over' && guard++ < 5000) botStep(g, g.turn, 'away');
  ok('라운드 제한으로 끝남', g.phase === 'over' && (g.endReason === 'rounds' || g.endReason === 'last') && g.round <= 10);
  // 무작위 봇 대전
  let errors = 0;
  let leaks = 0;
  let unfinished = 0;
  let bankrupts = 0;
  const diffs = ['easy', 'normal', 'hard'];
  for (let k = 0; k < games; k++) {
    const n = 2 + (k % 3);
    const t = newGame(n, k % 10 === 9 ? 100 : ROUND_CHOICES[k % 3]); // 열 판에 한 번은 아주 길게 (파산까지)
    const total = totalMoney(t);
    const dif = Array.from({ length: n }, (_, s) => diffs[(k + s) % 3]);
    let steps = 0;
    try {
      while (t.phase !== 'over' && steps++ < 20000) {
        botStep(t, t.turn, dif[t.turn]);
        if (totalMoney(t) !== total || t.players.some((p) => p.cash < 0)) {
          leaks++;
          break;
        }
      }
    } catch (e) {
      errors++;
      if (errors < 3 && typeof console !== 'undefined') console.log('봇 대전 오류', e && e.message);
    }
    if (t.phase !== 'over') unfinished++;
    if (t.players.some((p) => p.out)) bankrupts++;
  }
  ok(`봇끼리 ${games}판 오류 0`, errors === 0);
  ok(`봇끼리 ${games}판 돈 보존`, leaks === 0);
  ok(`봇끼리 ${games}판 모두 끝남`, unfinished === 0);
  ok('파산이 일어나는 판도 있음', bankrupts > 0);
  const passed = results.filter((r) => r.pass).length;
  if (typeof console !== 'undefined') console.table?.(results);
  return { passed, total: results.length, results };
}

return { START_MONEY, SALARY, BAIL, DONATION, JAIL_TURNS, BANK_START, ROUND_CHOICES, BUILD_NAMES, RENT_MULT, FLOOR_COLORS, GROUP_COLORS, BUILD_COST, CELLS, GROUPS, isProp, buildCost, floorName, CARDS, newGame, totalMoney, rentOf, hasMonopoly, propValue, assetsOf, rentTable, roll, payBail, fly, buy, build, skip, flyScore, bestFly, botStep, publicView, won, runSelfTests };
})();

// ==================== server/games/tile-battle.js ====================
// ===== 게임 모듈: 시험 끝! 타일 배틀 =====
// TileRules(games/tile-battle/js/rules.js), TileAI(…/ai.js)는 build-gs.mjs가 이름공간으로 감싸 넣어 줌
// 예전 클라이언트와 같은 모양의 상태를 내려보내야 하므로 필드 이름을 바꾸지 말 것

registerGame('tile-battle', {
  title: '시험 끝! 타일 배틀',
  minPlayers: 3,
  maxPlayers: 5,

  // 🪑 오프라인 테이블 모드: 인원에 맞는 타일을 모두 나눠 주고, 가운데에 내기만 공유 (족보 판정은 말로)
  offline: {
    deck: (n) => TileRules.makeDeck(TileRules.maxNForPlayers(n)).map((t) => t.id),
    deal: (n) => TileRules.handSizeForPlayers(n),
    zones: [{ id: 'center', name: '가운데', kind: 'pile' }],
    name: (code) => TileRules.tileLabel(tbTileOf(code)),
    sort: (a, b) => {
      const x = tbTileOf(a);
      const y = tbTileOf(b);
      return TileRules.valueOf(x, 15) - TileRules.valueOf(y, 15);
    },
  },

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

function tbTileOf(code) {
  const p = String(code).split('-');
  return { id: code, n: Number(p[0]), s: Number(p[1]) };
}

// ==================== server/games/deep-sea.js ====================
// ===== 게임 모듈: 심해 보물섬 탐험대 =====
// DSRules(games/deep-sea/js/rules.js), DSBot(…/bot.js)은 build-gs.mjs가 이름공간으로 감싸 넣어 줌
// 역할과 카드 위치는 서버에만! view()는 본인 역할과 본인 카드 '구성'만 내려보냄

registerGame('deep-sea', {
  title: '심해 보물섬 탐험대',
  minPlayers: 4,
  maxPlayers: 6,

  // 🪑 오프라인 테이블 모드: 역할은 비밀로 1장씩, 방 카드는 5장씩 (내 구성만 보이고 자리는 섞여 있음)
  // 열쇠를 가진 사람이 남의 카드를 고르면 뒤집혀 가운데로, 뒤집힌 사람에게 열쇠(차례)가 넘어감
  offline: {
    deck: (n) => DSRules.makeRoomCards(n).map((c) => c.type),
    deal: 5,
    secret: (n) => {
      const r = DSRules.roleCards(n);
      const out = [];
      for (let i = 0; i < r.crew; i++) out.push('crew');
      for (let i = 0; i < r.pirate; i++) out.push('pirate');
      return out;
    },
    hideOrder: true,
    pickPassesTurn: true,
    zones: [{ id: 'found', name: '뒤집힌 카드', kind: 'pile' }],
    name: (c) => DSRules.CARD_NAME[c] || DSRules.ROLE_NAME[c] || c,
    sort: (a, b) => ['treasure', 'monster', 'empty'].indexOf(a) - ['treasure', 'monster', 'empty'].indexOf(b),
  },
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

// ==================== server/games/flip-duel.js ====================
// ===== 게임 모듈: 흑백 뒤집기 대전 (2인) =====
// FDRules(games/flip-duel/js/rules.js)는 build-gs.mjs가 이름공간으로 감싸 넣어 줌
// 숨긴 정보가 없어서 오프라인 테이블 모드 대신 '한 기기 2인 대전'(브라우저 안 서버)을 씀

registerGame('flip-duel', {
  title: '흑백 뒤집기 대전',
  minPlayers: 2,
  maxPlayers: 2,
  bots: [
    { name: '판다 봇', emoji: '🐼' },
    { name: '펭귄 봇', emoji: '🐧' },
  ],

  reset(room) {
    room.fd = null;
  },

  start(room) {
    room.fd = FDRules.newGame();
    room.status = 'playing';
    pushEvent(room, { type: 'start' });
  },

  act(room, seat, req) {
    if (room.status !== 'playing') fail('지금은 둘 수 없어요.');
    if (req.action !== 'place') fail('알 수 없는 요청이에요.');
    fdPlace(room, seat, Number(req.idx));
  },

  actor(room) {
    return room.status === 'playing' && room.fd ? room.fd.turn - 1 : -1;
  },
  botDelay() {
    return 900;
  },
  botMove(room, seat) {
    const p = room.players[seat];
    const idx = FDRules.bestMove(room.fd.board, seat + 1, p.bot ? p.difficulty : 'easy');
    fdPlace(room, seat, idx);
  },

  playerView(room, p, i) {
    const c = room.fd ? FDRules.count(room.fd.board) : { 1: 2, 2: 2 };
    return { color: i + 1, discs: c[i + 1] };
  },

  view(room) {
    const g = room.fd;
    if (!g) return { fd: null };
    return {
      fd: {
        board: g.board,
        turn: g.turn,
        last: g.last,
        flips: g.flips,
        passed: g.passed,
        over: g.over,
        winner: g.winner,
        moves: g.moves,
        legal: g.over ? [] : FDRules.legalMoves(g.board, g.turn),
      },
    };
  },
});

function fdPlace(room, seat, idx) {
  const g = room.fd;
  let res;
  try {
    res = FDRules.play(g, seat + 1, idx);
  } catch (e) {
    fail(e.message);
  }
  pushEvent(room, { type: 'place', seat, idx, flips: res.flips, passed: res.passed });
  if (res.over) {
    room.status = 'finished';
    const c = FDRules.count(g.board);
    room.resultText = '흑 ' + c[1] + ' : 백 ' + c[2] + (g.winner ? ' / 승리: ' + room.players[g.winner - 1].name : ' / 무승부');
    pushEvent(room, { type: 'end', winner: g.winner });
  }
}

// ==================== server/games/color-rush.js ====================
// ===== 게임 모듈: 컬러 러시 (2~6인) =====
// CRRules(games/color-rush/js/rules.js)는 build-gs.mjs가 이름공간으로 감싸 넣어 줌
// 남의 손패와 뽑을 더미 순서는 서버에만! view()는 내 패와 남은 장수만 내려보냄

registerGame('color-rush', {
  title: '컬러 러시',
  minPlayers: 2,
  maxPlayers: 6,
  bots: [
    { name: '지우개 봇', emoji: '🧽' },
    { name: '연필 봇', emoji: '✏️' },
    { name: '자 봇', emoji: '📏' },
    { name: '풀 봇', emoji: '🧴' },
    { name: '가위 봇', emoji: '✂️' },
  ],

  reset(room) {
    room.cr = null;
  },

  start(room) {
    room.cr = CRRules.newGame(room.players.length);
    room.status = 'playing';
    pushEvent(room, { type: 'start', turn: room.cr.turn, top: CRRules.topOf(room.cr) });
  },

  act(room, seat, req) {
    if (room.status !== 'playing' || !room.cr) fail('지금은 할 수 없어요.');
    const g = room.cr;
    const a = req.action;
    if (a === 'play') crApply(room, () => CRRules.play(g, seat, String(req.card || ''), { color: req.color, call: !!req.call }));
    else if (a === 'draw') crApply(room, () => CRRules.draw(g, seat));
    else if (a === 'pass') crApply(room, () => CRRules.pass(g, seat));
    else if (a === 'call') crApply(room, () => CRRules.callLast(g, seat));
    else if (a === 'catch') crApply(room, () => CRRules.catchLast(g, seat));
    else fail('알 수 없는 요청이에요.');
  },

  /** 지금 움직일 사람: 깜빡한 사람이 있으면 지적할 봇이 먼저, 아니면 차례인 사람 */
  actor(room) {
    const g = room.cr;
    if (room.status !== 'playing' || !g || g.phase === 'over') return -1;
    const catcher = crCatcher(room);
    if (catcher >= 0) return catcher;
    return g.turn;
  },
  botDelay(room) {
    const g = room.cr;
    if (g && crCatcher(room) >= 0) return 2400; // 사람이 '마지막!'을 누를 시간
    return g && g.phase === 'drawn' ? 700 : 1100;
  },
  botMove(room, seat) {
    const g = room.cr;
    const p = room.players[seat];
    if (crCatcher(room) === seat) {
      const pr = CRRules.CATCH_P[p.difficulty] || CRRules.CATCH_P.normal;
      if (Math.random() < pr) crApply(room, () => CRRules.catchLast(g, seat));
      else g.catchTried = true;
      return;
    }
    crApply(room, () => CRRules.botStep(g, seat, p.bot ? p.difficulty : 'easy'));
  },

  playerView(room, p, i) {
    return { count: room.cr ? room.cr.hands[i].length : 0 };
  },

  view(room, mySeat) {
    const g = room.cr;
    if (!g) return { cr: null };
    return { cr: CRRules.publicView(g, mySeat) };
  },

  offline: {
    deck: () => CRRules.makeDeck(),
    deal: 7,
    zones: [{ id: 'discard', name: '버린 더미', kind: 'pile' }],
    name: (c) => CRRules.cardName(c),
    sort: (a, b) => CRRules.compareCodes(a, b),
    setup(ot) {
      const i = ot.draw.findIndex((c) => CRRules.isNumber(c.f));
      const card = ot.draw.splice(i < 0 ? 0 : i, 1)[0];
      card.up = true;
      ot.zones.discard.push([card]);
    },
    actions: ['draw', 'play', 'take', 'give', 'recycle'],
  },
});

/** 깜빡한 사람(unsafe)을 지적할 봇 자리 (없으면 -1) */
function crCatcher(room) {
  const g = room.cr;
  if (!g || g.unsafe < 0 || g.catchTried) return -1;
  let best = -1;
  for (let k = 1; k < g.n; k++) {
    const s = (g.unsafe + k) % g.n;
    const p = room.players[s];
    if (p && p.bot && !p.left) {
      best = s;
      break;
    }
  }
  return best;
}

function crApply(room, fn) {
  let evs;
  try {
    evs = fn();
  } catch (e) {
    fail(e.message);
  }
  const g = room.cr;
  evs.forEach((ev) => pushEvent(room, ev));
  if (g.phase === 'over' && room.status === 'playing') {
    room.status = 'finished';
    room.resultText = '승리: ' + room.players[g.winner].name + ' (' + g.moves + '수)';
  }
}

// ==================== server/games/code-breaker.js ====================
// ===== 게임 모듈: 비밀번호 해독반 (2~4인 숫자 타일 추리) =====
// CBRules(games/code-breaker/js/rules.js)는 build-gs.mjs가 이름공간으로 감싸 넣어 줌
// 숨김 정보: 남의 숨긴 타일 숫자, 뽑을 더미 순서. view()는 색·자리·공개된 숫자만 내려보냄.

registerGame('code-breaker', {
  title: '비밀번호 해독반',
  minPlayers: 2,
  maxPlayers: 4,
  bots: [
    { name: '부엉이 봇', emoji: '🦉' },
    { name: '여우 봇', emoji: '🦊' },
    { name: '고양이 봇', emoji: '🐱' },
  ],

  reset(room) {
    room.cb = null;
  },

  start(room) {
    room.cb = CBRules.newGame(room.players.length);
    room.status = 'playing';
    pushEvent(room, { type: 'start', gid: room.cb.gid });
    // 봇은 처음 받은 조커를 바로 놓음
    room.players.forEach((p, i) => {
      while (p.bot && room.cb.hold[i].length) cbApply(room, i, CBRules.botAction(room.cb, i, p.difficulty));
    });
  },

  act(room, seat, req) {
    if (room.status !== 'playing' || !room.cb) fail('지금은 할 수 없어요.');
    const a = req.action;
    if (a === 'draw') cbApply(room, seat, { action: 'draw', color: String(req.color) });
    else if (a === 'place') cbApply(room, seat, { action: 'place', idx: Number(req.idx) });
    else if (a === 'guess') cbApply(room, seat, { action: 'guess', target: Number(req.target), id: Number(req.id), value: Number(req.value) });
    else if (a === 'decide') cbApply(room, seat, { action: 'decide', more: !!req.more });
    else if (a === 'penalty') cbApply(room, seat, { action: 'penalty', id: Number(req.id) });
    else fail('알 수 없는 요청이에요.');
  },

  actor(room) {
    return room.status === 'playing' && room.cb ? CBRules.actorOf(room.cb) : -1;
  },
  botDelay(room) {
    const ph = room.cb && room.cb.phase;
    return ph === 'guess' ? 1500 : ph === 'decide' ? 1100 : 800;
  },
  botMove(room, seat) {
    const p = room.players[seat];
    cbApply(room, seat, CBRules.botAction(room.cb, seat, p.bot ? p.difficulty : 'easy'));
  },

  onLeave(room) {
    // 처음 조커 놓기 중에 나가면 대신 놓아 줌
    const g = room.cb;
    if (!g || room.status !== 'playing') return;
    room.players.forEach((p, i) => {
      while (p.bot && g.phase === 'setup' && g.hold[i].length) cbApply(room, i, CBRules.botAction(g, i, 'easy'));
    });
  },

  playerView(room, p, i) {
    const g = room.cb;
    if (!g) return { count: 0, hidden: 0, out: false };
    return { count: g.rows[i].length + g.hold[i].length, hidden: CBRules.hiddenCount(g.rows[i]) + g.hold[i].length, out: !!g.out[i] };
  },

  view(room, mySeat) {
    const g = room.cb;
    if (!g) return { cb: null };
    const over = g.phase === 'over';
    const tile = (t, s) => ({ id: t.id, c: t.c, up: !!t.up, n: t.up || s === mySeat || over ? t.n : null });
    return {
      cb: {
        gid: g.gid,
        phase: g.phase,
        turn: g.turn,
        actor: CBRules.actorOf(g),
        streak: g.streak,
        fresh: g.turn === mySeat ? g.fresh : 0,
        rows: g.rows.map((r, s) => r.map((t) => tile(t, s))),
        hold: g.hold.map((h, s) => (s === mySeat ? h.map((t) => tile(t, s)) : h.length)),
        out: g.out,
        pile: CBRules.pileCount(g),
        history: g.history,
        winner: g.winner,
      },
    };
  },

  offline: {
    keepOrder: true, // ◀▶로 옮긴 조커 자리를 뽑을 때마다 풀지 않게
    deck() {
      const out = [];
      ['b', 'w'].forEach((c) => {
        for (let n = 0; n <= 11; n++) out.push(c + n);
        out.push(c + 'J');
      });
      return out;
    },
    deal: (n) => (n <= 3 ? 4 : 3),
    name: (code) => (code[0] === 'b' ? '검정 ' : '흰색 ') + (code.slice(1) === 'J' ? '조커' : code.slice(1)),
    back: (code) => code[0],
    backName: (b) => (b === 'b' ? '검정' : '흰색'),
    sort(a, b) {
      const k = (c) => (c.slice(1) === 'J' ? 100 : Number(c.slice(1)) * 2) + (c[0] === 'w' ? 1 : 0);
      return k(a) - k(b);
    },
    zones: [],
    actions: { draw: true, reveal: true, order: true },
  },
});

function cbApply(room, seat, a) {
  const g = room.cb;
  let res;
  try {
    res = CBRules.applyAction(g, seat, a);
  } catch (e) {
    fail(e.message);
  }
  // 이벤트에는 공개 정보만: 뽑은 타일은 색과 자리, 맞힌/공개된 타일만 숫자
  const ev = { type: res.type, seat: res.seat };
  ['id', 'c', 'idx', 'target', 'pos', 'guess', 'ok', 'reveal', 'out'].forEach((k) => res[k] != null && (ev[k] = res[k]));
  if (res.type === 'reveal' || (res.type === 'guess' && res.ok)) ev.n = res.n;
  pushEvent(room, ev);
  if (res.over) {
    room.status = 'finished';
    const w = room.players[g.winner];
    room.resultText = '비밀번호 해독반 / 승리: ' + (w ? w.name : '없음');
    pushEvent(room, { type: 'end', winner: g.winner });
  }
}

// ==================== server/games/number-garden.js ====================
// ===== 게임 모듈: 숫자 블록 정원 (2~4인) =====
// NGRules(games/number-garden/js/rules.js)는 build-gs.mjs가 이름공간으로 감싸 넣어 줌
// 남의 손패와 더미 순서는 서버에만! view()는 내 패와 남은 장수만 내려보냄
// 턴 중 임시 배치는 클라이언트가 만들고 '턴 끝내기' 때 { board, played }를 한 번에 보내면 서버가 검사

registerGame('number-garden', {
  title: '숫자 블록 정원',
  minPlayers: NGRules.MIN_PLAYERS,
  maxPlayers: NGRules.MAX_PLAYERS,
  bots: [
    { name: '꿀벌 봇', emoji: '🐝' },
    { name: '무당벌레 봇', emoji: '🐞' },
    { name: '달팽이 봇', emoji: '🐌' },
  ],

  // 오프라인 테이블 모드: 타일만 공유하고 판정은 말로
  offline: {
    deck: () => {
      const out = [];
      for (let id = 0; id < NGRules.TOTAL_TILES; id++) out.push(String(NGRules.kindOf(id)));
      return out;
    },
    deal: () => NGRules.HAND_SIZE,
    zones: [{ id: 'table', name: '판', kind: 'rows' }],
    name: (c) => NGRules.kindName(Number(c)),
    sort: (a, b) => Number(a) - Number(b),
    sortRow: (a, b) => (NGRules.kindNum(Number(a)) || 99) - (NGRules.kindNum(Number(b)) || 99) || Number(a) - Number(b),
    actions: { draw: true, play: true, move: true, take: true },
  },

  reset(room) {
    room.ng = null;
  },

  start(room) {
    room.ng = NGRules.newGame(room.players.length);
    room.status = 'playing';
    pushEvent(room, { type: 'start', turn: room.ng.turn });
  },

  act(room, seat, req) {
    if (room.status !== 'playing' || !room.ng) fail('지금은 할 수 없어요.');
    if (req.action === 'endTurn') {
      const board = Array.isArray(req.board) ? req.board.map((s) => (Array.isArray(s) ? s.map(Number) : s)) : null;
      const played = Array.isArray(req.played) ? req.played.map(Number) : null;
      ngPlay(room, seat, board, played);
    } else if (req.action === 'draw') ngDraw(room, seat);
    else fail('알 수 없는 요청이에요.');
  },

  actor(room) {
    return room.status === 'playing' && room.ng && !room.ng.over ? room.ng.turn : -1;
  },
  botDelay(room) {
    // 판이 클수록 사람이 따라 볼 시간을 조금 더
    return 1300 + Math.min(900, (room.ng ? room.ng.board.length : 0) * 40);
  },
  botMove(room, seat) {
    const p = room.players[seat];
    const mv = NGRules.botTurn(room.ng, seat, p.bot ? p.difficulty : 'easy');
    if (mv && p.bot) ngPlay(room, seat, mv.board, mv.played);
    else ngDraw(room, seat); // 자리 비운 사람은 뽑고 넘기기만
  },

  playerView(room, p, i) {
    const g = room.ng;
    if (!g) return { count: 0, opened: false };
    const out = { count: g.hands[i].length, opened: g.opened[i] };
    if (g.over) out.score = g.scores[i];
    return out;
  },

  view(room, mySeat) {
    const g = room.ng;
    if (!g) return { ng: null };
    return {
      ng: {
        board: g.board,
        hand: mySeat >= 0 && g.hands[mySeat] ? g.hands[mySeat] : [],
        counts: g.hands.map((h) => h.length),
        opened: g.opened,
        pool: g.pool.length,
        turn: g.turn,
        turnNo: g.turnNo,
        passes: g.passes,
        last: g.last,
        over: g.over,
        winner: g.winner,
        scores: g.scores,
        // 끝나면 모두의 남은 패 공개
        hands: g.over ? g.hands : null,
      },
    };
  },
});

function ngPlay(room, seat, board, played) {
  const g = room.ng;
  let res;
  try {
    res = NGRules.playTurn(g, seat, board, played);
  } catch (e) {
    fail(e.message);
  }
  pushEvent(room, { type: 'play', seat, ids: played.slice(), firstMeld: res.firstMeld, meld: res.meld });
  if (res.over) ngEnd(room);
}

function ngDraw(room, seat) {
  const g = room.ng;
  let res;
  try {
    res = NGRules.drawTurn(g, seat);
  } catch (e) {
    fail(e.message);
  }
  // 뽑은 타일은 알리지 않음 (장수만)
  pushEvent(room, { type: res.drawn != null ? 'draw' : 'pass', seat });
  if (res.over) ngEnd(room);
}

function ngEnd(room) {
  const g = room.ng;
  room.status = 'finished';
  room.resultText = '승리: ' + room.players[g.winner].name + ' / 남은 점수 ' + room.players.map((p, i) => p.name + ' ' + g.scores[i]).join(', ');
  pushEvent(room, { type: 'end', winner: g.winner, scores: g.scores });
}

// ==================== server/games/lunch-five.js ====================
// ===== 게임 모듈: 급식 다섯! (2~6인) =====
// LFRules(games/lunch-five/js/rules.js)는 build-gs.mjs가 이름공간으로 감싸 넣어 줌
// 뒤집힌 더미의 순서는 서버에만! view()는 장수와 공개 더미 맨 위 카드만 내려보냄
// 종은 서버가 받은 순서대로 판정. 요청에 tick(본 판 번호)을 붙여 '한 발 늦은' 종은 벌칙 없이 거절

registerGame('lunch-five', {
  title: '급식 다섯!',
  minPlayers: LFRules.MIN_PLAYERS,
  maxPlayers: LFRules.MAX_PLAYERS,
  bots: [
    { name: '영양사 봇', emoji: '👩‍🍳' },
    { name: '배식 봇', emoji: '🍱' },
    { name: '우유 봇', emoji: '🥛' },
    { name: '젓가락 봇', emoji: '🥢' },
    { name: '숟가락 봇', emoji: '🥄' },
  ],

  offline: {
    deck: () => LFRules.makeDeck(),
    deal: (n) => Math.floor(LFRules.DECK_SIZE / n),
    blind: true,
    zones: [{ id: 'open', name: '공개 더미', kind: 'pile', perSeat: true }],
    flipPassesTurn: true,
    actions: { flipTop: true, collect: true, give: true },
    name: (c) => LFRules.cardName(c),
  },

  reset(room) {
    room.lf = null;
    room.lfPlan = null;
  },

  start(room) {
    room.lf = LFRules.newGame(room.players.length);
    room.status = 'playing';
    pushEvent(room, { type: 'start' });
    lfReplan(room);
  },

  act(room, seat, req) {
    if (room.status !== 'playing' || !room.lf) fail('지금은 할 수 없어요.');
    if (req.action === 'flip') lfFlip(room, seat);
    else if (req.action === 'ring') lfRing(room, seat, req.tick);
    else fail('알 수 없는 요청이에요.');
  },

  /** 종 칠 봇이 있으면 그 봇, 아니면 차례인 사람 */
  actor(room) {
    const g = room.lf;
    if (room.status !== 'playing' || !g || g.over) return -1;
    if (room.lfPlan && room.lfPlan.tick === g.tick) return room.lfPlan.seat;
    return g.turn;
  },
  botDelay(room) {
    const g = room.lf;
    if (g && room.lfPlan && room.lfPlan.tick === g.tick) return room.lfPlan.delay;
    const p = g && room.players[g.turn];
    return LFRules.botFlipDelay(p && p.difficulty);
  },
  botMove(room, seat) {
    const g = room.lf;
    const plan = room.lfPlan;
    if (plan && plan.tick === g.tick && plan.seat === seat) {
      room.lfPlan = null;
      lfRing(room, seat, g.tick);
      return;
    }
    if (seat === g.turn) lfFlip(room, seat);
    else lfReplan(room);
  },

  playerView(room, p, i) {
    const g = room.lf;
    if (!g) return { pile: 0, cards: 0, out: false };
    return { pile: g.piles[i].length, cards: LFRules.cardsOf(g, i), out: !!g.out[i] };
  },

  view(room) {
    const g = room.lf;
    if (!g) return { lf: null };
    return {
      lf: {
        piles: g.piles.map((p) => p.length),
        open: g.open.map((o) => ({ top: o.length ? o[o.length - 1] : null, count: o.length })),
        out: g.out,
        turn: g.turn,
        tick: g.tick,
        flips: g.flips,
        maxFlips: LFRules.MAX_FLIPS,
        over: g.over,
        winner: g.winner,
        reason: g.reason,
        total: g.total,
      },
    };
  },

  onLeave(room) {
    lfReplan(room);
  },
});

/** 판이 바뀔 때마다 봇이 종을 칠지 미리 정해 둠 (폴링마다 다시 뽑지 않게) */
function lfReplan(room) {
  const g = room.lf;
  const bots = [];
  room.players.forEach((p, i) => p.bot && bots.push({ seat: i, difficulty: p.difficulty }));
  const plan = g && !g.over ? LFRules.planBots(g, bots) : null;
  room.lfPlan = plan ? { seat: plan.seat, delay: plan.delay, wrong: plan.wrong, tick: g.tick } : null;
}

function lfFlip(room, seat) {
  const g = room.lf;
  let res;
  try {
    res = LFRules.flip(g, seat);
  } catch (e) {
    fail(e.message);
  }
  pushEvent(room, { type: 'flip', seat, card: res.card, tick: g.tick });
  lfAfter(room, res.outs);
}

function lfRing(room, seat, tick) {
  const g = room.lf;
  let res;
  try {
    res = LFRules.ring(g, seat, tick);
  } catch (e) {
    fail(e.message);
  }
  pushEvent(room, { type: 'ring', seat, ok: res.ok, menu: res.menu, got: res.got, gave: res.gave, tick: g.tick });
  lfAfter(room, res.outs);
}

function lfAfter(room, outs) {
  const g = room.lf;
  (outs || []).forEach((s) => pushEvent(room, { type: 'out', seat: s }));
  if (g.over) {
    room.status = 'finished';
    room.lfPlan = null;
    const w = room.players[g.winner];
    room.resultText = (g.reason === 'limit' ? '제한 도달 · ' : '') + '승리: ' + (w ? w.name : '-') + ' / ' + room.players.map((p, i) => p.name + ' ' + LFRules.cardsOf(g, i) + '장').join(', ');
    pushEvent(room, { type: 'end', winner: g.winner, reason: g.reason });
    return;
  }
  lfReplan(room);
}

// ==================== server/games/school-trip.js ====================
// ===== 게임 모듈: 서라벌학교여행 (2~4인) =====
// STRules(games/school-trip/js/rules.js)는 build-gs.mjs가 이름공간으로 감싸 넣어 줌
// 숨긴 정보가 거의 없어서(다음 행운 쪽지 순서만 숨김) 오프라인 테이블 대신 '한 기기 여러 명'을 씀
// 이동·카드·통행료는 모두 여기서 계산하고 이벤트로 보내 화면이 순서대로 연출

registerGame('school-trip', {
  title: '서라벌학교여행',
  minPlayers: 2,
  maxPlayers: 4,
  bots: [
    { name: '교감 봇', emoji: '🧑‍🏫' },
    { name: '급식 봇', emoji: '🍱' },
    { name: '도서 봇', emoji: '📚' },
    { name: '체육 봇', emoji: '⚽' },
  ],

  config(room, req) {
    room.rounds = STRules.ROUND_CHOICES.indexOf(Number(req.rounds)) >= 0 ? Number(req.rounds) : 15;
  },

  reset(room) {
    room.st = null;
    if (STRules.ROUND_CHOICES.indexOf(room.rounds) < 0) room.rounds = 15;
  },

  start(room) {
    room.st = STRules.newGame(room.players.length, room.rounds);
    room.status = 'playing';
    pushEvent(room, { type: 'start', rounds: room.st.maxRounds });
  },

  act(room, seat, req) {
    if (room.status !== 'playing' || !room.st) fail('지금은 할 수 없어요.');
    const g = room.st;
    const a = req.action;
    if (a === 'roll') stApply(room, () => STRules.roll(g, seat));
    else if (a === 'buy') stApply(room, () => STRules.buy(g, seat));
    else if (a === 'build') stApply(room, () => STRules.build(g, seat));
    else if (a === 'skip') stApply(room, () => STRules.skip(g, seat));
    else if (a === 'bail') stApply(room, () => STRules.payBail(g, seat));
    else if (a === 'fly') stApply(room, () => STRules.fly(g, seat, Number(req.to)));
    else fail('알 수 없는 요청이에요.');
  },

  actor(room) {
    return room.status === 'playing' && room.st && room.st.phase !== 'over' ? room.st.turn : -1;
  },
  botDelay(room) {
    const g = room.st;
    return g && (g.phase === 'buy' || g.phase === 'build') ? 900 : 1300;
  },
  botMove(room, seat) {
    const p = room.players[seat];
    stApply(room, () => STRules.botStep(room.st, seat, p.bot ? p.difficulty || 'normal' : 'away'));
  },

  playerView(room, p, i) {
    const g = room.st;
    if (!g) return {};
    return { cash: g.players[i].cash, out: g.players[i].out };
  },

  view(room) {
    return { st: room.st ? STRules.publicView(room.st) : null };
  },

  onLeave(room, p) {
    /* 나간 사람은 봇이 이어서 함 (core.js가 bot으로 바꿈) */
  },
});

function stApply(room, fn) {
  let evs;
  try {
    evs = fn();
  } catch (e) {
    fail(e.message);
  }
  evs.forEach((ev) => pushEvent(room, ev));
  const g = room.st;
  if (g.phase === 'over' && room.status === 'playing') {
    room.status = 'finished';
    room.resultText = '승리: ' + room.players[g.winner].name + (g.endReason === 'rounds' ? ' (' + g.maxRounds + '바퀴 끝, 총자산 1등)' : ' (마지막까지 남음)');
  }
}

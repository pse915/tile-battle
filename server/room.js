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

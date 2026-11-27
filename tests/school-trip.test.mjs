// 서라벌학교여행 서버 흐름 테스트: node tests/school-trip.test.mjs
import { createServer } from '../tools/server-harness.mjs';
import assert from 'node:assert/strict';

const srv = createServer();
const G = 'school-trip';

// 1) 온라인 2인 + 봇 1, 라운드 10 → 끝까지
const a = srv.must('create', { game: G, name: '가' });
assert.equal(a.maxPlayers, 4);
assert.equal(a.rounds, 15, '기본 15바퀴');
const b = srv.must('join', { game: G, code: a.code, name: '나' });
assert.equal(srv.req('config', { code: a.code, pid: b.me, rounds: 10 }).ok, false, '방장만 설정');
assert.equal(srv.must('config', { code: a.code, pid: a.me, rounds: 10 }).rounds, 10);
srv.must('addBot', { code: a.code, pid: a.me, difficulty: 'hard' });
let s = srv.must('start', { code: a.code, pid: a.me });
assert.equal(s.st.maxRounds, 10);
assert.equal(srv.req('roll', { code: a.code, pid: b.me }).ok, false, '남의 차례에는 못 굴림');
assert.equal(srv.req('buy', { code: a.code, pid: a.me }).ok, false, '굴리기 전엔 못 삼');
assert.equal(srv.req('teleport', { code: a.code, pid: a.me }).ok, false, '모르는 요청 거절');
const pids = [a.me, b.me];
let guard = 0;
let bought = 0;
while (s.status === 'playing' && guard++ < 3000) {
  const t = s.st.turn;
  if (t === 2) {
    srv.advance(1500);
    s = srv.must('poll', { code: a.code, pid: a.me, since: -1 });
    continue;
  }
  const pid = pids[t];
  const me = s.st.players[t];
  let r;
  if (s.st.phase === 'buy') {
    r = srv.must(bought++ % 2 ? 'skip' : 'buy', { code: a.code, pid });
  } else if (s.st.phase === 'build') r = srv.must('build', { code: a.code, pid });
  else if (me.elev) {
    assert.equal(srv.req('roll', { code: a.code, pid }).ok, false, '엘리베이터면 굴리기 대신 칸 고르기');
    assert.equal(srv.req('fly', { code: a.code, pid, to: 30 }).ok, false, '엘리베이터 칸으로는 못 감');
    r = srv.must('fly', { code: a.code, pid, to: 0 });
  } else r = srv.must('roll', { code: a.code, pid });
  s = r;
}
assert.equal(s.status, 'finished', '라운드 제한으로 끝남');
assert.ok(s.events.some((e) => e.type === 'end'));
assert.ok(['rounds', 'last'].includes(s.st.endReason));
assert.ok(JSON.stringify(srv.raw(a.code)).length < 60000, '방 상태가 작음');

// 2) 돈 없는데 사기 → 거절, 파산 처리
const p = srv.must('create', { game: G, name: '혼자' });
srv.must('addBot', { code: p.code, pid: p.me, difficulty: 'easy' });
s = srv.must('start', { code: p.code, pid: p.me });
const ST = srv.ns('STRules');
{
  const cache = srv.ctx.CacheService.getScriptCache();
  const room = srv.raw(p.code);
  // 내 돈을 거의 없애고(은행으로) 봇의 리모델링 도서관 바로 앞에 세움
  room.st.bank += room.st.players[0].cash - 5;
  room.st.players[0].cash = 5;
  room.st.players[0].pos = 37;
  room.st.own[39] = 1;
  room.st.lvl[39] = 3;
  room.st.phase = 'buy';
  room.st.pending = 1;
  cache.put('room_' + p.code, JSON.stringify(room));
}
assert.equal(srv.req('buy', { code: p.code, pid: p.me }).ok, false, '돈 없으면 못 삼');
srv.must('skip', { code: p.code, pid: p.me });
// 봇 차례가 끝날 때까지 기다렸다가, 내가 2칸 → 도서관에 멈추게 주사위 고정
for (let k = 0; k < 20; k++) {
  srv.advance(1500);
  s = srv.must('poll', { code: p.code, pid: p.me, since: -1 });
  if (s.st.turn === 0 && s.st.phase === 'roll') break;
  if (s.status !== 'playing') break;
}
if (s.status === 'playing') {
  const room = srv.raw(p.code);
  room.st.players[0].pos = 37;
  room.st.players[0].jail = 0;
  room.st.players[0].elev = false;
  room.st.own[39] = 1;
  room.st.lvl[39] = 3;
  srv.ctx.CacheService.getScriptCache().put('room_' + p.code, JSON.stringify(room));
  const g = room.st;
  const evs = ST.roll(g, 0, [1, 1]);
  assert.ok(evs.some((e) => e.type === 'bankrupt'), '못 내면 파산');
  assert.equal(g.phase, 'over');
  assert.equal(g.winner, 1);
}

// 3) 한 기기 여러 명 (hotseat): 3명이 같은 기기, 각자 pid로
const h = srv.must('create', { game: G, name: '하나' });
const h2 = srv.must('join', { game: G, code: h.code, name: '둘' });
const h3 = srv.must('join', { game: G, code: h.code, name: '셋' });
s = srv.must('start', { code: h.code, pid: h.me });
const hp = [h.me, h2.me, h3.me];
for (let k = 0; k < 30 && s.status === 'playing'; k++) {
  const t = s.st.turn;
  const pid = hp[t];
  const ph = s.st.phase;
  s = srv.must(ph === 'buy' ? 'buy' : ph === 'build' ? 'skip' : s.st.players[t].elev ? 'fly' : 'roll', { code: h.code, pid, to: 5 });
}
assert.ok(s.st.moves > 10, 'hotseat 진행');
assert.equal(srv.must('create', { game: G, name: 'x', mode: 'offline' }).mode, 'online', '오프라인 모드 없음');

// 4) 자리 비운 사람: 사지 않고 넘김
const w = srv.must('create', { game: G, name: '비움' });
const w2 = srv.must('join', { game: G, code: w.code, name: '있음' });
s = srv.must('start', { code: w.code, pid: w.me });
srv.ctx.CacheService.getScriptCache().remove('seen_' + w.code + '_' + w.me);
srv.advance(4000);
s = srv.must('poll', { code: w.code, pid: w2.me, since: -1 });
assert.ok(s.st.moves >= 1 && s.st.own.every((o) => o !== 0), '자리 비운 사람 대신 굴리고 사지 않음');
console.log('school-trip 서버 테스트 통과');

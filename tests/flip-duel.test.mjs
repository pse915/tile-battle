// 흑백 뒤집기 대전 서버 흐름 테스트: node tests/flip-duel.test.mjs
import { createServer } from '../tools/server-harness.mjs';
import assert from 'node:assert/strict';

const srv = createServer();
// 2인 온라인
const a = srv.must('create', { game: 'flip-duel', name: '가' });
assert.equal(a.maxPlayers, 2);
const b = srv.must('join', { game: 'flip-duel', code: a.code, name: '나' });
assert.equal(srv.req('join', { game: 'flip-duel', code: a.code, name: '다' }).ok, false, '3번째는 못 들어옴');
let s = srv.must('start', { code: a.code, pid: a.me });
let guard = 0;
while (s.status === 'playing' && guard++ < 80) {
  const seat = s.fd.turn - 1;
  const pid = seat === 0 ? a.me : b.me;
  const wrong = seat === 0 ? b.me : a.me;
  assert.equal(srv.req('place', { code: a.code, pid: wrong, idx: s.fd.legal[0] }).ok, false, '상대 차례에는 못 둠');
  s = srv.must('place', { code: a.code, pid, idx: s.fd.legal[Math.floor(Math.random() * s.fd.legal.length)] });
}
assert.equal(s.status, 'finished');
assert.ok(s.events.some((e) => e.type === 'end'));
// 봇 연습: 봇이 폴링 때 둠
const p = srv.must('create', { game: 'flip-duel', name: '혼자' });
srv.must('addBot', { code: p.code, pid: p.me, difficulty: 'hard' });
s = srv.must('start', { code: p.code, pid: p.me });
s = srv.must('place', { code: p.code, pid: p.me, idx: s.fd.legal[0] });
assert.equal(s.fd.turn, 2);
srv.advance(1000);
s = srv.must('poll', { code: p.code, pid: p.me, since: -1 });
assert.equal(s.fd.turn, 1, '봇이 뒀음');
// 오프라인 모드는 없음 → online으로 만들어짐
assert.equal(srv.must('create', { game: 'flip-duel', name: 'x', mode: 'offline' }).mode, 'online');
console.log('flip-duel 서버 테스트 통과');

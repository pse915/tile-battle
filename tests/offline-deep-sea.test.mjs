// 심해 보물섬 탐험대 오프라인 테이블 모드 + 공용 엔진 테스트: node tests/offline-deep-sea.test.mjs
import { createServer } from '../tools/server-harness.mjs';
import assert from 'node:assert/strict';

const srv = createServer();
const a = srv.must('create', { game: 'deep-sea', name: '가', mode: 'offline' });
assert.equal(a.mode, 'offline');
assert.equal(srv.req('addBot', { code: a.code, pid: a.me }).ok, false, '오프라인은 봇 불가');
const pids = [a.me];
for (const n of ['나', '다', '라']) pids.push(srv.must('join', { game: 'deep-sea', code: a.code, name: n }).me);
let s = srv.must('start', { code: a.code, pid: a.me });
assert.equal(s.status, 'playing');
assert.equal(s.ot.hand.length, 5);
assert.ok(s.ot.secret === 'crew' || s.ot.secret === 'pirate');
// 숨김: 남의 비밀 카드·패가 안 보임
const raw = srv.raw(a.code);
const v1 = srv.must('poll', { code: a.code, pid: pids[1], since: -1 });
assert.equal(v1.ot.secret, raw.ot.secrets[1].f);
assert.equal(v1.ot.secrets, null);
assert.ok(v1.ot.hands[0].every((c) => c.f === null), '남의 패 앞면 안 보임');
assert.ok(v1.ot.hand.every((c) => c.id === undefined), 'hideOrder: 내 패 id 없음(자리 모름)');
// 열쇠: 0번이 1번의 2번째 카드를 뒤집음 → 1번 차례
s = srv.must('ot_pick', { code: a.code, pid: pids[0], target: 1, index: 2 });
assert.equal(s.ot.turn, 1);
assert.equal(s.ot.zones.found.flat().length, 1);
assert.equal(s.ot.hands[1].length, 4);
assert.ok(s.events.some((e) => e.type === 'ot' && e.text.includes('뒤집음')));
// 되돌리기: 방금 움직인 사람 또는 방장
assert.equal(srv.req('ot_undo', { code: a.code, pid: pids[2] }).ok, false);
s = srv.must('ot_undo', { code: a.code, pid: pids[0] });
assert.equal(s.ot.hands[1].length, 5);
// 다시 나누기 (방장만)
assert.equal(srv.req('ot_redeal', { code: a.code, pid: pids[1], count: 4 }).ok, false);
s = srv.must('ot_redeal', { code: a.code, pid: a.me, count: 4 });
assert.equal(s.ot.round, 2);
assert.ok(s.ot.hands.every((h) => h.length === 4));
// 카드 보존: 패 + 가운데 = 20
const total = (st) => st.ot.hands.reduce((n, h) => n + h.length, 0) + Object.values(st.ot.zones).flat(2).length + st.ot.drawCount;
assert.equal(total(s), 20, '다시 나눠도 남는 카드는 뽑을 더미로 (카드 보존)');
// 턴 넘기기
s = srv.must('ot_turn', { code: a.code, pid: pids[3] });
// 테이블 화면(watch): 아무 패도 없음
const w = srv.must('watch', { code: a.code, since: -1 });
assert.equal(w.mySeat, -1);
assert.equal(w.ot.hand.length, 0);
assert.equal(w.ot.secret, null);
// 끝내기 → 비밀 카드 공개
s = srv.must('ot_end', { code: a.code, pid: a.me, winner: 2 });
assert.equal(s.status, 'finished');
assert.equal(s.ot.secrets.length, 5);
s = srv.must('ot_reshuffle', { code: a.code, pid: a.me });
assert.equal(s.status, 'playing');
s = srv.must('lobby', { code: a.code, pid: a.me });
assert.equal(s.status, 'lobby');
console.log('오프라인 테이블(심해 보물섬) 테스트 통과');

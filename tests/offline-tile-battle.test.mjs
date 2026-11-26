// 타일 배틀 오프라인 테이블 모드 + 예전 온라인 흐름 호환 테스트: node tests/offline-tile-battle.test.mjs
import { createServer } from '../tools/server-harness.mjs';
import assert from 'node:assert/strict';

const srv = createServer();
// 오프라인
const a = srv.must('create', { game: 'tile-battle', name: '가', mode: 'offline' });
const b = srv.must('join', { game: 'tile-battle', code: a.code, name: '나' });
const c = srv.must('join', { game: 'tile-battle', code: a.code, name: '다' });
let s = srv.must('start', { code: a.code, pid: a.me });
assert.equal(s.ot.hand.length, 12, '3인은 12개씩');
assert.equal(s.ot.drawCount, 0);
const raw = srv.raw(a.code);
const bView = srv.must('poll', { code: a.code, pid: b.me, since: -1 });
const aCodes = raw.ot.hands[0].map((t) => t.f);
assert.ok(!JSON.stringify(bView.ot.hands).includes('"f":"'), '남의 패 앞면 없음');
assert.ok(bView.ot.hand.every((t) => !aCodes.includes(t.f)));
// 정렬 확인: 숫자 낮은 것부터(3이 제일 약함, 2가 제일 셈)
const nums = s.ot.hand.map((t) => Number(t.f.split('-')[0]));
assert.ok(nums.indexOf(2) === -1 || nums.indexOf(2) >= nums.length - 4);
s = srv.must('ot_play', { code: a.code, pid: a.me, ids: [s.ot.hand[0].id, s.ot.hand[1].id], zone: 'center' });
assert.equal(s.ot.zones.center.length, 1);
assert.equal(s.ot.zones.center[0].length, 2);
assert.ok(s.events.at(-1).text.includes('가운데'));
s = srv.must('ot_turn', { code: a.code, pid: a.me });
assert.equal(s.ot.turn, 1);
// 예전 클라이언트(게임 이름·모드 없이) 온라인 흐름은 그대로
const o = srv.must('create', { name: '옛날' });
assert.equal(o.game, 'tile-battle');
assert.equal(o.mode, 'online');
srv.must('addBot', { code: o.code, pid: o.me, difficulty: 'easy' });
srv.must('addBot', { code: o.code, pid: o.me, difficulty: 'easy' });
s = srv.must('start', { code: o.code, pid: o.me });
assert.equal(s.status, 'playing');
assert.ok(Array.isArray(s.hand) && s.hand.length === 12);
console.log('타일 배틀 오프라인/호환 테스트 통과');

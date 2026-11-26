// 오프라인 엔진 keepOrder: 손으로 옮긴 순서가 뽑기 후에도 유지되는지 (비밀번호 해독반 조커 자리)
import { createServer } from '../tools/server-harness.mjs';
import assert from 'node:assert/strict';

const srv = createServer();
const a = srv.must('create', { game: 'code-breaker', name: '가', mode: 'offline' });
srv.must('join', { game: 'code-breaker', code: a.code, name: '나' });
let s = srv.must('start', { code: a.code, pid: a.me });
const ids = s.ot.hand.map((c) => c.id);
const moved = ids.shift();
ids.push(moved); // 맨 앞 타일을 맨 끝으로 (조커를 옮기듯)
s = srv.must('ot_order', { code: a.code, pid: a.me, ids });
s = srv.must('ot_draw', { code: a.code, pid: a.me, n: 1, back: 'b' });
assert.equal(s.ot.hand.length, 5);
const after = s.ot.hand.map((c) => c.id).filter((id) => ids.includes(id));
assert.deepEqual(after, ids, '기존 순서 유지');
console.log('오프라인 keepOrder 테스트 통과');

// 비밀번호 해독반 서버 흐름 테스트: node tools/build-gs.mjs && node tests/code-breaker.test.mjs
import { createServer } from '../tools/server-harness.mjs';
import assert from 'node:assert/strict';

const srv = createServer();
const R = srv.ns('CBRules');
const G = 'code-breaker';

/** 한 사람 view에 남의 숨긴 숫자가 하나도 없는지 (원본 상태와 비교) */
function assertNoLeak(code, s) {
  const raw = srv.raw(code).cb;
  const me = s.mySeat;
  raw.rows.forEach((row, seat) => {
    if (seat === me) return;
    row.forEach((t) => {
      const v = s.cb.rows[seat].find((x) => x.id === t.id);
      assert.ok(v, '타일 자리가 보여야 함');
      assert.equal(v.c, t.c, '색은 보임');
      if (!t.up && raw.phase !== 'over') assert.equal(v.n, null, '남의 숨긴 숫자가 새면 안 됨');
    });
    if (seat !== me) assert.equal(typeof s.cb.hold[seat], 'number', '남이 든 조커는 개수만');
  });
  assert.equal(JSON.stringify(s.cb.pile).includes('['), false, '더미는 색별 개수만');
  // 이벤트에도 숨긴 숫자가 없어야 함
  for (const e of s.events) {
    if (e.type === 'draw' || e.type === 'place') assert.equal(e.n, undefined, '뽑은 타일 숫자는 이벤트에 없음');
    if (e.type === 'guess' && !e.ok) assert.equal(e.n, undefined);
  }
}

/** 사람 한 명(pid) 차례면 그 사람 대신 봇 머리로 한 수 */
function humanStep(code, pid, s) {
  const raw = srv.raw(code).cb;
  const seat = s.mySeat;
  const a = R.botAction(raw, seat, 'normal');
  const map = {
    draw: () => srv.must('draw', { code, pid, color: a.color }),
    place: () => srv.must('place', { code, pid, idx: a.idx }),
    guess: () => srv.must('guess', { code, pid, target: a.target, id: a.id, value: a.value }),
    decide: () => srv.must('decide', { code, pid, more: a.more }),
    penalty: () => srv.must('penalty', { code, pid, id: a.id }),
  };
  return map[a.action]();
}

// ---- 1) 온라인: 사람 2 + 봇 1 ----
const a = srv.must('create', { game: G, name: '민수' });
assert.equal(a.maxPlayers, 4);
const b = srv.must('join', { game: G, code: a.code, name: '지아' });
srv.must('addBot', { code: a.code, pid: a.me, difficulty: 'hard' });
let s = srv.must('start', { code: a.code, pid: a.me });
assert.equal(s.status, 'playing');
assert.equal(s.cb.rows.reduce((n, r) => n + r.length, 0) + s.cb.hold.reduce((n, h) => n + (typeof h === 'number' ? h : h.length), 0), 12, '3명 × 4개');
const pids = [a.me, b.me];
let guard = 0;
let rejected = 0;
while (s.status === 'playing' && guard++ < 600) {
  const raw = srv.raw(a.code).cb;
  const actor = R.actorOf(raw);
  if (actor >= 2) {
    srv.advance(2000);
    s = srv.must('poll', { code: a.code, pid: a.me, since: -1 });
    continue;
  }
  // 남의 차례 요청은 거절
  if (raw.phase !== 'setup') {
    const other = pids[1 - actor];
    const r = srv.req('draw', { code: a.code, pid: other, color: 'b' });
    assert.equal(r.ok, false, '남의 차례에는 못 뽑음');
    rejected++;
  }
  if (raw.phase === 'guess') {
    // 규칙 위반: 내 타일 추측, 공개된 타일 추측
    const mine = raw.rows[actor][0];
    assert.equal(srv.req('guess', { code: a.code, pid: pids[actor], target: actor, id: mine.id, value: 1 }).ok, false, '내 타일은 추측 못 함');
    assert.equal(srv.req('draw', { code: a.code, pid: pids[actor], color: 'b' }).ok, false, '추리 단계에선 못 뽑음');
    rejected += 2;
  }
  const view0 = srv.must('poll', { code: a.code, pid: pids[actor], since: -1 });
  assertNoLeak(a.code, view0);
  assertNoLeak(a.code, srv.must('poll', { code: a.code, pid: pids[1 - actor], since: -1 }));
  s = humanStep(a.code, pids[actor], view0);
}
assert.equal(s.status, 'finished', '끝까지 진행');
assert.ok(s.events.some((e) => e.type === 'end'));
assert.ok(s.cb.winner >= 0);
const watch = srv.must('watch', { code: a.code, since: -1 });
assert.equal(watch.mySeat, -1);
console.log(`온라인 3인 판 끝 (승자 자리 ${s.cb.winner}, 거절 확인 ${rejected}회)`);

// 관전(📺) 화면도 숨김 정보 없음: 진행 중인 판에서 확인
const c = srv.must('create', { game: G, name: '혼자' });
srv.must('addBot', { code: c.code, pid: c.me, difficulty: 'easy' });
srv.must('addBot', { code: c.code, pid: c.me, difficulty: 'normal' });
srv.must('addBot', { code: c.code, pid: c.me, difficulty: 'hard' });
s = srv.must('start', { code: c.code, pid: c.me });
const w = srv.must('watch', { code: c.code, since: -1 });
const rawc = srv.raw(c.code).cb;
rawc.rows.forEach((row, seat) => row.forEach((t) => !t.up && assert.equal(w.cb.rows[seat].find((x) => x.id === t.id).n, null, '관전 화면에 숨긴 숫자 없음')));
assert.equal(srv.req('addBot', { code: c.code, pid: c.me }).ok, false, '가득 참');
// 봇 연습 끝까지
guard = 0;
while (s.status === 'playing' && guard++ < 800) {
  const raw = srv.raw(c.code).cb;
  if (R.actorOf(raw) === 0) s = humanStep(c.code, c.me, srv.must('poll', { code: c.code, pid: c.me, since: -1 }));
  else {
    srv.advance(2000);
    s = srv.must('poll', { code: c.code, pid: c.me, since: -1 });
  }
}
assert.equal(s.status, 'finished', '봇 연습 4인 끝까지');
console.log('봇 연습 4인 판 끝');

// ---- 2) 오프라인 테이블 모드 ----
const o = srv.must('create', { game: G, name: '가', mode: 'offline' });
assert.equal(o.mode, 'offline');
const o2 = srv.must('join', { game: G, code: o.code, name: '나' });
assert.equal(srv.req('addBot', { code: o.code, pid: o.me }).ok, false, '오프라인은 봇 없음');
s = srv.must('start', { code: o.code, pid: o.me });
assert.equal(s.ot.hand.length, 4);
assert.equal(s.ot.drawBacks.b + s.ot.drawBacks.w, 18);
s = srv.must('ot_draw', { code: o.code, pid: o.me, n: 1, back: 'w' });
assert.equal(s.ot.hand.length, 5);
assert.equal(s.ot.drawBacks.w, srv.must('poll', { code: o.code, pid: o2.me, since: -1 }).ot.drawBacks.w);
// 정렬: 조커 빼고 오름차순
const key = (f) => (f.slice(1) === 'J' ? 100 : Number(f.slice(1)) * 2) + (f[0] === 'w' ? 1 : 0);
assert.ok(s.ot.hand.every((c2, i, h) => i === 0 || key(h[i - 1].f) <= key(c2.f)), '내 패 정렬');
// 남(나)의 view에 가의 숫자가 없어야 함
let v2 = srv.must('poll', { code: o.code, pid: o2.me, since: -1 });
const rawO = srv.raw(o.code).ot;
rawO.hands[0].forEach((card) => {
  const pub = v2.ot.hands[0].find((x) => x.id === card.id);
  assert.equal(pub.f, null, '숨긴 타일 숫자 안 보임');
  assert.equal(pub.b, card.f[0], '뒷면 색은 보임');
});
// 공개(맞혀짐) → 남에게 숫자 보임
const first = s.ot.hand[0];
srv.must('ot_reveal', { code: o.code, pid: o.me, id: first.id, up: true });
v2 = srv.must('poll', { code: o.code, pid: o2.me, since: -1 });
assert.equal(v2.ot.hands[0].find((x) => x.id === first.id).f, first.f, '공개한 타일은 보임');
// 조커 자리 옮기기(순서 바꾸기)
const ids = s.ot.hand.map((x) => x.id).reverse();
s = srv.must('ot_order', { code: o.code, pid: o.me, ids });
assert.deepEqual(s.ot.hand.map((x) => x.id), ids);
s = srv.must('ot_undo', { code: o.code, pid: o.me });
assert.notDeepEqual(s.ot.hand.map((x) => x.id), ids, '되돌리기');
s = srv.must('ot_end', { code: o.code, pid: o.me, winner: 1 });
assert.equal(s.status, 'finished');
console.log('오프라인 테이블 모드 통과');
console.log('code-breaker 서버 테스트 통과');

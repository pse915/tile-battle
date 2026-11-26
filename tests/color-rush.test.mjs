// 컬러 러시 서버 흐름 테스트: node tools/build-gs.mjs && node tests/color-rush.test.mjs
import { createServer } from '../tools/server-harness.mjs';
import assert from 'node:assert/strict';

const srv = createServer();
const G = 'color-rush';

/** view JSON 안에 다른 사람의 손패가 그대로 들어 있지 않은지 (손패 배열 비교) */
function assertNoLeak(view, raw, mySeat) {
  const cr = view.cr;
  assert.ok(cr, 'cr 있음');
  assert.equal(cr.draw, undefined, '뽑을 더미 순서 없음');
  assert.equal(cr.hands, undefined, '전체 손패 없음');
  assert.deepEqual(cr.hand, mySeat >= 0 ? raw.cr.hands[mySeat] : [], '내 패만');
  assert.deepEqual(cr.counts, raw.cr.hands.map((h) => h.length));
  const json = JSON.stringify(view);
  assert.ok(!json.includes('"draw":['), '더미 배열 없음');
  raw.cr.hands.forEach((h, i) => {
    if (i === mySeat || h.length < 3) return;
    assert.ok(!json.includes(JSON.stringify(h)), `${i}번 자리 패가 새지 않음`);
  });
  // 이벤트에 숨김 카드가 없는지: draw 이벤트는 장수만
  for (const e of view.events) {
    if (e.type === 'draw') assert.equal(e.code, undefined);
  }
}

// ---------- 온라인 3인 (사람 2 + 봇 1) ----------
const a = srv.must('create', { game: G, name: '가' });
assert.equal(a.maxPlayers, 6);
assert.equal(a.hasOffline, true);
const b = srv.must('join', { game: G, code: a.code, name: '나' });
srv.must('addBot', { code: a.code, pid: a.me, difficulty: 'hard' });
let s = srv.must('start', { code: a.code, pid: a.me });
assert.equal(s.status, 'playing');
assert.equal(s.cr.hand.length, 7);
const pids = [a.me, b.me];
let raw = srv.raw(a.code);
assertNoLeak(s, raw, 0);
assertNoLeak(srv.must('poll', { code: a.code, pid: b.me, since: -1 }), raw, 1);
assertNoLeak(srv.must('watch', { code: a.code, since: -1 }), raw, -1);
assert.equal(srv.must('watch', { code: a.code, since: -1 }).cr.hand.length, 0, '관전은 패 없음');

let guard = 0;
let rejected = 0;
let caught = 0;
let botMoves = 0;
while (s.status === 'playing' && guard++ < 3000) {
  raw = srv.raw(a.code);
  const g = raw.cr;
  // 깜빡한 사람이 있으면 사람 쪽에서 가끔 지적
  if (g.unsafe >= 0 && g.unsafe !== 2 && Math.random() < 0.5) {
    const by = g.unsafe === 0 ? 1 : 0;
    s = srv.must('catch', { code: a.code, pid: pids[by] });
    caught++;
    continue;
  }
  const seat = g.turn;
  if (seat === 2) {
    srv.advance(3000);
    s = srv.must('poll', { code: a.code, pid: a.me, since: -1 });
    botMoves++;
    continue;
  }
  const pid = pids[seat];
  const other = pids[1 - seat];
  // 남의 차례에는 못 냄
  const r1 = srv.req('draw', { code: a.code, pid: other });
  assert.equal(r1.ok, false, '남의 차례 뽑기 거절');
  const me = srv.must('poll', { code: a.code, pid, since: -1 });
  assertNoLeak(me, raw, seat);
  const cr = me.cr;
  // 규칙 위반: 낼 수 없는 카드
  const bad = cr.hand.find((c) => !cr.playable.includes(c));
  if (bad) {
    assert.equal(srv.req('play', { code: a.code, pid, card: bad }).ok, false, '규칙 위반 거절');
    rejected++;
  }
  if (cr.playable.length) {
    const card = cr.playable[Math.floor(Math.random() * cr.playable.length)];
    const color = card[0] === 'w' ? 'cpov'[Math.floor(Math.random() * 4)] : undefined;
    if (card[0] === 'w') assert.equal(srv.req('play', { code: a.code, pid, card }).ok, false, '색 안 고르면 거절');
    s = srv.must('play', { code: a.code, pid, card, color, call: Math.random() < 0.5 });
  } else if (cr.phase === 'drawn') {
    s = srv.must('pass', { code: a.code, pid });
  } else {
    s = srv.must('draw', { code: a.code, pid });
  }
}
assert.equal(s.status, 'finished', '끝까지 진행');
assert.ok(s.events.some((e) => e.type === 'end'));
raw = srv.raw(a.code);
const total = raw.cr.draw.length + raw.cr.discard.length + raw.cr.hands.reduce((n, h) => n + h.length, 0);
assert.equal(total, 108, '카드 보존');
assert.ok(rejected > 0, '규칙 위반 시도가 있었음');
console.log(`온라인 3인: ${guard}번 움직임, 봇 ${botMoves}번, 지적 ${caught}번, 거절 확인 ${rejected}번`);

// 끝난 판엔 못 냄, 한 판 더
assert.equal(srv.req('draw', { code: a.code, pid: a.me }).ok, false);
srv.must('lobby', { code: a.code, pid: a.me });
s = srv.must('start', { code: a.code, pid: a.me });
assert.equal(s.status, 'playing');

// ---------- 봇 연습 (사람 1 + 봇 5) ----------
const p = srv.must('create', { game: G, name: '혼자' });
for (let i = 0; i < 5; i++) srv.must('addBot', { code: p.code, pid: p.me, difficulty: 'hard' }); // 어려움 봇은 꼭 지적함
assert.equal(srv.req('addBot', { code: p.code, pid: p.me }).ok, false, '7명은 안 됨');
s = srv.must('start', { code: p.code, pid: p.me });
guard = 0;
let botCaughtMe = false;
let wasUnsafe = 0;
while (s.status === 'playing' && guard++ < 4000) {
  const g = srv.raw(p.code).cr;
  if (g.turn === 0 && g.unsafe < 0) {
    const cr = srv.must('poll', { code: p.code, pid: p.me, since: -1 }).cr;
    if (cr.playable.length) s = srv.must('play', { code: p.code, pid: p.me, card: cr.playable[0], color: 'c', call: false }); // 일부러 깜빡
    else if (cr.phase === 'drawn') s = srv.must('pass', { code: p.code, pid: p.me });
    else s = srv.must('draw', { code: p.code, pid: p.me });
  } else {
    srv.advance(3000);
    s = srv.must('poll', { code: p.code, pid: p.me, since: -1 });
  }
  if (srv.raw(p.code).cr.unsafe === 0) wasUnsafe++;
  if (s.events.some((e) => e.type === 'catch' && e.target === 0)) botCaughtMe = true;
}
assert.equal(s.status, 'finished', '봇 연습 끝까지');
assert.ok(botCaughtMe || !wasUnsafe, '봇이 깜빡한 나를 지적함');
console.log(`봇 연습 6인: ${guard}번 폴링, 승자 ${s.players[s.cr.winner].name}, 봇이 지적함: ${botCaughtMe}`);

// ---------- 오프라인 테이블 모드 ----------
const o = srv.must('create', { game: G, name: '방장', mode: 'offline' });
assert.equal(o.mode, 'offline');
const o2 = srv.must('join', { game: G, code: o.code, name: '친구' });
assert.equal(srv.req('addBot', { code: o.code, pid: o.me }).ok, false, '오프라인은 봇 없음');
s = srv.must('start', { code: o.code, pid: o.me });
assert.equal(s.ot.hand.length, 7);
assert.equal(s.ot.zones.discard.length, 1);
const firstTop = s.ot.zones.discard[0][0].f;
assert.match(firstTop, /^[cpov][0-9]$/, '첫 버린 카드는 숫자');
const sorted = s.ot.hand.map((c) => c.f);
const order = (x) => 'cpovw'.indexOf(x[0]) * 100 + '0123456789SRDWF'.indexOf(x[1]);
assert.deepEqual(sorted, sorted.slice().sort((x, y) => order(x) - order(y)), '색→숫자 정렬');
s = srv.must('ot_play', { code: o.code, pid: o.me, ids: [s.ot.hand[0].id], zone: 'discard' });
assert.equal(s.ot.hand.length, 6);
s = srv.must('ot_draw', { code: o.code, pid: o2.me, n: 1 });
assert.equal(s.ot.hand.length, 8);
const v1 = srv.must('poll', { code: o.code, pid: o.me, since: -1 });
const rawO = srv.raw(o.code).ot;
const json = JSON.stringify(v1.ot.hands);
rawO.hands[1].forEach((c) => assert.ok(!json.includes(`"f":"${c.f}","up":false`) || false, '남의 패 안 보임'));
assert.ok(v1.ot.hands[1].every((c) => c.f === null), '남의 패는 뒷면');
assert.ok(v1.events.some((e) => e.type === 'ot' && /분필|형광|크레용|잉크|색 바꾸기|\+4/.test(e.text)), '한국어 카드 이름 로그');
s = srv.must('ot_undo', { code: o.code, pid: o2.me });
assert.equal(srv.must('poll', { code: o.code, pid: o2.me, since: -1 }).ot.hand.length, 7, '되돌리기');
s = srv.must('ot_end', { code: o.code, pid: o.me, winner: 0 });
assert.equal(s.status, 'finished');
console.log('color-rush 서버 테스트 통과');

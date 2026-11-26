// 숫자 블록 정원 서버 흐름 테스트: node tools/build-gs.mjs && node tests/number-garden.test.mjs
import { createServer } from '../tools/server-harness.mjs';
import assert from 'node:assert/strict';

const srv = createServer();
const NG = srv.ns('NGRules');
const G = 'number-garden';

// ---------- 온라인: 사람 2 + 봇 1 ----------
const a = srv.must('create', { game: G, name: '가' });
assert.equal(a.maxPlayers, 4);
const b = srv.must('join', { game: G, code: a.code, name: '나' });
srv.must('addBot', { code: a.code, pid: a.me, difficulty: 'hard' });
let s = srv.must('start', { code: a.code, pid: a.me });
assert.equal(s.status, 'playing');
assert.equal(s.ng.hand.length, 14);
assert.deepEqual(s.ng.counts, [14, 14, 14]);
assert.equal(s.ng.pool, 106 - 42);

// 숨김 정보: 내 view에 남의 패가 없어야 함
{
  const raw = srv.raw(a.code);
  const va = srv.must('poll', { code: a.code, pid: a.me, since: -1 });
  const vb = srv.must('poll', { code: a.code, pid: b.me, since: -1 });
  assert.deepEqual(va.ng.hand, raw.ng.hands[0]);
  assert.deepEqual(vb.ng.hand, raw.ng.hands[1]);
  assert.equal(va.ng.hands, null);
  const json = JSON.stringify(va);
  assert.ok(!json.includes(JSON.stringify(raw.ng.hands[1])), '남의 패 배열이 보이면 안 됨');
  assert.ok(!('pool' in va.ng && Array.isArray(va.ng.pool)), '더미 순서는 안 보임');
  const w = srv.must('watch', { code: a.code, since: -1 });
  assert.equal(w.mySeat, -1);
  assert.deepEqual(w.ng.hand, []);
}

const pidOf = (seat) => [a.me, b.me][seat];
// 잘못된 요청들
{
  const raw = srv.raw(a.code);
  const turn = raw.ng.turn;
  if (turn < 2) {
    const other = pidOf(1 - turn);
    assert.equal(srv.req('draw', { code: a.code, pid: other }).ok, false, '남의 차례엔 못 뽑음');
    const mine = raw.ng.hands[turn];
    // 30점 안 되는 첫 등록 / 세트 아닌 것 / 남의 타일
    const bad1 = srv.req('endTurn', { code: a.code, pid: pidOf(turn), board: [mine.slice(0, 2)], played: mine.slice(0, 2) });
    assert.equal(bad1.ok, false);
    const theirs = raw.ng.hands[1 - turn].slice(0, 3);
    assert.equal(srv.req('endTurn', { code: a.code, pid: pidOf(turn), board: [theirs], played: theirs }).ok, false, '남의 타일은 못 냄');
    assert.equal(srv.req('endTurn', { code: a.code, pid: pidOf(turn), board: [], played: [] }).ok, false, '아무것도 안 내면 거절');
  }
}

// 끝까지: 사람 차례면 봇 전략으로 대신 계산해서 보내거나 뽑기, 봇 차례면 시간을 넘겨 폴링
let guard = 0;
let plays = 0;
while (s.status === 'playing' && guard++ < 2000) {
  const raw = srv.raw(a.code);
  const turn = raw.ng.turn;
  if (turn === 2) {
    srv.advance(3000);
    s = srv.must('poll', { code: a.code, pid: a.me, since: -1 });
    continue;
  }
  const mv = NG.botTurn(raw.ng, turn, 'normal');
  if (mv) {
    s = srv.must('endTurn', { code: a.code, pid: pidOf(turn), board: mv.board, played: mv.played });
    plays++;
  } else s = srv.must('draw', { code: a.code, pid: pidOf(turn) });
  // 보존: 판 + 손 + 더미 = 106
  const r2 = srv.raw(a.code).ng;
  const total = r2.pool.length + r2.hands.reduce((n, h) => n + h.length, 0) + r2.board.reduce((n, x) => n + x.length, 0);
  assert.equal(total, 106);
}
assert.equal(s.status, 'finished', '끝까지 진행');
assert.ok(plays > 0);
assert.ok(s.events.some((e) => e.type === 'end'));
assert.ok(Array.isArray(s.ng.hands), '끝나면 패 공개');
// 이벤트에 뽑은 타일이 새지 않음
assert.ok(s.events.filter((e) => e.type === 'draw').every((e) => !('id' in e) && !('ids' in e)));

// ---------- 봇 연습: 봇 3명 (어려움) 끝까지 ----------
{
  const p = srv.must('create', { game: G, name: '혼자' });
  for (let i = 0; i < 3; i++) srv.must('addBot', { code: p.code, pid: p.me, difficulty: ['easy', 'normal', 'hard'][i] });
  let t = srv.must('start', { code: p.code, pid: p.me });
  let g2 = 0;
  while (t.status === 'playing' && g2++ < 3000) {
    if (t.ng.turn === 0) t = srv.must('draw', { code: p.code, pid: p.me });
    else {
      srv.advance(3000);
      t = srv.must('poll', { code: p.code, pid: p.me, since: -1 });
    }
  }
  assert.equal(t.status, 'finished', '봇 연습 끝까지');
  // 한 판 더
  srv.must('lobby', { code: p.code, pid: p.me });
  t = srv.must('start', { code: p.code, pid: p.me });
  assert.equal(t.ng.hand.length, 14);
}

// ---------- 오프라인 테이블 모드 ----------
{
  const h = srv.must('create', { game: G, name: '방장', mode: 'offline' });
  assert.equal(h.mode, 'offline');
  const g = srv.must('join', { game: G, code: h.code, name: '손님' });
  assert.equal(srv.req('addBot', { code: h.code, pid: h.me }).ok, false, '오프라인은 봇 없음');
  let o = srv.must('start', { code: h.code, pid: h.me });
  assert.equal(o.ot.hand.length, 14);
  assert.equal(o.ot.drawCount, 106 - 28);
  const three = o.ot.hand.slice(0, 3).map((c) => c.id);
  o = srv.must('ot_play', { code: h.code, pid: h.me, ids: three, zone: 'table', row: -1 });
  assert.equal(o.ot.zones.table.length, 1);
  assert.equal(o.ot.zones.table[0].length, 3);
  o = srv.must('ot_draw', { code: h.code, pid: g.me });
  const og = srv.must('poll', { code: h.code, pid: g.me, since: -1 });
  assert.equal(og.ot.hand.length, 15);
  // 남의 패는 안 보임
  const raw = srv.raw(h.code);
  const hostIds = raw.ot.hands[0].map((c) => c.id);
  assert.ok(og.ot.hands[0].every((c) => c.f === null), '남의 패 앞면 안 보임');
  assert.ok(hostIds.length === og.ot.hands[0].length);
  // 판 타일 옮기기 (새 줄로)
  o = srv.must('ot_move', { code: h.code, pid: h.me, ids: [three[0]], zone: 'table', row: -1 });
  assert.equal(o.ot.zones.table.length, 2);
  o = srv.must('ot_undo', { code: h.code, pid: h.me });
  assert.equal(o.ot.zones.table.length, 1);
  o = srv.must('ot_take', { code: h.code, pid: h.me, ids: [three[1]] });
  o = srv.must('ot_turn', { code: h.code, pid: h.me });
  o = srv.must('ot_end', { code: h.code, pid: h.me, winner: 0 });
  assert.equal(o.status, 'finished');
}

console.log('number-garden 서버 테스트 통과');

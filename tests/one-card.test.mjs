// 원카드 서버 흐름 테스트: node tools/build-gs.mjs && node tests/one-card.test.mjs
import { createServer } from '../tools/server-harness.mjs';
import assert from 'node:assert/strict';

const srv = createServer();
const G = 'one-card';

/** view 안에 남의 손패·뽑을 더미 순서가 없는지 (srv.raw 원본과 비교) */
function assertNoLeak(view, raw, mySeat) {
  const oc = view.oc;
  assert.ok(oc, 'oc 있음');
  assert.equal(oc.draw, undefined, '뽑을 더미 순서 없음');
  assert.equal(oc.hands, undefined, '전체 손패 없음');
  assert.deepEqual(oc.hand, mySeat >= 0 ? raw.oc.hands[mySeat] : [], '내 패만');
  assert.deepEqual(oc.counts, raw.oc.hands.map((h) => h.length));
  const json = JSON.stringify(view);
  assert.ok(!json.includes(JSON.stringify(raw.oc.draw.slice(0, 3))) || raw.oc.draw.length < 3, '더미 순서 없음');
  raw.oc.hands.forEach((h, i) => {
    if (i === mySeat || h.length < 3) return;
    assert.ok(!json.includes(JSON.stringify(h)), `${i}번 자리 패가 새지 않음`);
  });
  for (const e of view.events) {
    if (['draw', 'take', 'catch', 'bust', 'recycle'].includes(e.type)) {
      assert.equal(e.code, undefined);
      assert.equal(e.cards, undefined);
    }
  }
}

// ---------- 대기방 옵션 ----------
const a = srv.must('create', { game: G, name: '가' });
assert.equal(a.maxPlayers, 5);
assert.equal(a.hasOffline, true);
assert.deepEqual(a.ocOpts, { hand: 7, bust: 20, jokers: true, mode: 'all' });
const b = srv.must('join', { game: G, code: a.code, name: '나' });
assert.equal(srv.req('config', { code: a.code, pid: b.me, hand: 5 }).ok, false, '방장만 옵션');
let s = srv.must('config', { code: a.code, pid: a.me, hand: 6, bust: 25 });
s = srv.must('config', { code: a.code, pid: a.me, jokers: false, ocMode: 'all' });
assert.deepEqual(s.ocOpts, { hand: 6, bust: 25, jokers: false, mode: 'all' });
s = srv.must('config', { code: a.code, pid: a.me, hand: 99 });
assert.equal(s.ocOpts.hand, 7, '이상한 값은 기본값');
srv.must('config', { code: a.code, pid: a.me, hand: 7, jokers: true });

// ---------- 온라인 3인 (사람 2 + 봇 1) ----------
srv.must('addBot', { code: a.code, pid: a.me, difficulty: 'hard' });
s = srv.must('start', { code: a.code, pid: a.me });
assert.equal(s.status, 'playing');
assert.equal(s.oc.hand.length, 7);
assert.equal(srv.req('config', { code: a.code, pid: a.me, hand: 5 }).ok, false, '게임 중엔 옵션 못 바꿈');
const pids = [a.me, b.me];
let raw = srv.raw(a.code);
assertNoLeak(s, raw, 0);
assertNoLeak(srv.must('poll', { code: a.code, pid: b.me, since: -1 }), raw, 1);
assertNoLeak(srv.must('watch', { code: a.code, since: -1 }), raw, -1);

let guard = 0;
let rejected = 0;
let caught = 0;
let botMoves = 0;
let defends = 0;
let takes = 0;
let maxAttack = 0;
while (s.status === 'playing' && guard++ < 4000) {
  raw = srv.raw(a.code);
  const g = raw.oc;
  maxAttack = Math.max(maxAttack, g.attack);
  if (g.unsafe >= 0 && g.unsafe !== 2 && Math.random() < 0.5) {
    const by = g.unsafe === 0 ? 1 : 0;
    if (g.status[by] === 'in') {
      s = srv.must('catch', { code: a.code, pid: pids[by] });
      caught++;
      continue;
    }
  }
  const seat = g.turn;
  if (seat === 2) {
    srv.advance(3000);
    s = srv.must('poll', { code: a.code, pid: g.status[0] === 'in' ? a.me : b.me, since: -1 });
    botMoves++;
    continue;
  }
  const pid = pids[seat];
  const other = pids[1 - seat];
  assert.equal(srv.req('draw', { code: a.code, pid: other }).ok, false, '남의 차례 뽑기 거절');
  const me = srv.must('poll', { code: a.code, pid, since: -1 });
  assertNoLeak(me, raw, seat);
  const oc = me.oc;
  const bad = oc.hand.find((c) => !oc.playable.includes(c));
  if (bad) {
    assert.equal(srv.req('play', { code: a.code, pid, card: bad, suit: 's' }).ok, false, '규칙 위반 거절');
    rejected++;
  }
  assert.equal(srv.req('play', { code: a.code, pid, card: 'ZZ' }).ok, false, '없는 카드 거절');
  if (oc.playable.length) {
    const card = oc.playable[Math.floor(Math.random() * oc.playable.length)];
    const seven = card[1] === '7' && card[0] !== 'X';
    if (seven) assert.equal(srv.req('play', { code: a.code, pid, card }).ok, false, '무늬 안 고르면 거절');
    if (oc.attack > 0) defends++;
    s = srv.must('play', { code: a.code, pid, card, suit: seven ? 'shdc'[Math.floor(Math.random() * 4)] : undefined, call: Math.random() < 0.5 });
  } else if (oc.phase === 'drawn') {
    s = srv.must('pass', { code: a.code, pid });
  } else {
    if (oc.attack > 0) takes++;
    s = srv.must('draw', { code: a.code, pid });
  }
}
assert.equal(s.status, 'finished', '끝까지 진행');
assert.ok(s.events.some((e) => e.type === 'end'));
assert.equal(s.oc.ranking.length, 3);
raw = srv.raw(a.code);
const total = raw.oc.draw.length + raw.oc.discard.length + raw.oc.hands.reduce((n, h) => n + h.length, 0);
assert.equal(total, 54, '카드 보존');
assert.ok(rejected > 0, '규칙 위반 시도가 있었음');
console.log(`온라인 3인: ${guard}번, 봇 ${botMoves}번, 막기 ${defends} · 받기 ${takes} · 최대 공격 +${maxAttack}, 지적 ${caught}, 거절 ${rejected}`);
assert.equal(srv.req('draw', { code: a.code, pid: a.me }).ok, false, '끝난 판엔 못 냄');
srv.must('lobby', { code: a.code, pid: a.me });
s = srv.must('start', { code: a.code, pid: a.me });
assert.equal(s.status, 'playing');

// ---------- 공격 쌓기·방어 흐름 (판을 직접 꾸며서) ----------
{
  const c = srv.must('create', { game: G, name: '공' });
  const d = srv.must('join', { game: G, code: c.code, name: '수' });
  srv.must('start', { code: c.code, pid: c.me });
  // 판 꾸미기: 원본 상태를 고쳐 저장
  const room = srv.raw(c.code);
  room.oc.hands = [['s2', 'h5', 'h6'], ['d2', 'c9', 'c8']];
  room.oc.discard = ['s9'];
  room.oc.suit = 's';
  room.oc.turn = 0;
  room.oc.attack = 0;
  room.oc.draw = room.oc.draw.concat(['XB', 'XC', 'sA']).filter((x, i, arr) => arr.indexOf(x) === i && !['s2', 'h5', 'h6', 'd2', 'c9', 'c8', 's9'].includes(x));
  srv.ctx.CacheService.getScriptCache().put('room_' + c.code, JSON.stringify(room), 600);
  s = srv.must('play', { code: c.code, pid: c.me, card: 's2' });
  assert.equal(s.oc.attack, 2);
  let v = srv.must('poll', { code: c.code, pid: d.me, since: -1 });
  assert.deepEqual(v.oc.playable, ['d2'], '공격 중엔 방어 카드만');
  assert.equal(srv.req('play', { code: c.code, pid: d.me, card: 'c9' }).ok, false, '일반 카드로 못 막음');
  v = srv.must('play', { code: c.code, pid: d.me, card: 'd2' });
  assert.equal(v.oc.attack, 4, '막으면 쌓임');
  assert.ok(v.events.some((e) => e.type === 'attack' && e.total === 4));
  v = srv.must('draw', { code: c.code, pid: c.me });
  assert.equal(v.oc.attack, 0);
  assert.equal(v.oc.hand.length, 6, '쌓인 4장 받음');
  assert.ok(v.events.some((e) => e.type === 'take' && e.n === 4 && e.code === undefined));
  console.log('공격 쌓기·방어 흐름 통과');
}

// ---------- 원카드 / 지적 (봇이 지적) ----------
{
  const p = srv.must('create', { game: G, name: '혼자' });
  for (let i = 0; i < 4; i++) srv.must('addBot', { code: p.code, pid: p.me, difficulty: 'hard' });
  assert.equal(srv.req('addBot', { code: p.code, pid: p.me }).ok, false, '6명은 안 됨');
  s = srv.must('start', { code: p.code, pid: p.me });
  guard = 0;
  let botCaughtMe = false;
  let wasUnsafe = 0;
  while (s.status === 'playing' && guard++ < 5000) {
    const g = srv.raw(p.code).oc;
    const botCanCatch = g.unsafe >= 0 && !g.catchTried && g.status.some((st, i) => i > 0 && i !== g.unsafe && st === 'in');
    if (g.turn === 0 && !botCanCatch && g.status[0] === 'in') {
      const oc = srv.must('poll', { code: p.code, pid: p.me, since: -1 }).oc;
      if (oc.playable.length) s = srv.must('play', { code: p.code, pid: p.me, card: oc.playable[0], suit: 'h', call: false });
      else if (oc.phase === 'drawn') s = srv.must('pass', { code: p.code, pid: p.me });
      else s = srv.must('draw', { code: p.code, pid: p.me });
    } else {
      srv.advance(3000);
      s = srv.must('poll', { code: p.code, pid: p.me, since: -1 });
    }
    if (srv.raw(p.code).oc.unsafe === 0) wasUnsafe++;
    if (s.events.some((e) => e.type === 'catch' && e.target === 0)) botCaughtMe = true;
  }
  assert.equal(s.status, 'finished', '봇 연습 끝까지');
  assert.ok(botCaughtMe || !wasUnsafe, '봇이 깜빡한 나를 지적함');
  console.log(`봇 연습 5인: ${guard}번 폴링, 1등 ${s.players[s.oc.winner].name}, 봇이 지적함: ${botCaughtMe}`);

  // 직접 원카드 외치기
  const c = srv.must('create', { game: G, name: '외침' });
  const d = srv.must('join', { game: G, code: c.code, name: '친구' });
  srv.must('start', { code: c.code, pid: c.me });
  const room = srv.raw(c.code);
  room.oc.hands = [['s3', 's4'], ['h8', 'h9', 'hT']];
  room.oc.discard = ['s9'];
  room.oc.suit = 's';
  room.oc.turn = 0;
  srv.ctx.CacheService.getScriptCache().put('room_' + c.code, JSON.stringify(room), 600);
  s = srv.must('play', { code: c.code, pid: c.me, card: 's3' });
  assert.equal(s.oc.unsafe, 0);
  assert.equal(srv.req('catch', { code: c.code, pid: c.me }).ok, false, '나는 나를 지적 못 함');
  s = srv.must('catch', { code: c.code, pid: d.me });
  assert.equal(s.oc.counts[0], 2, '지적 → 1장 벌칙');
  assert.equal(srv.req('catch', { code: c.code, pid: d.me }).ok, false, '두 번 지적 안 됨');
  console.log('원카드/지적 통과');
}

// ---------- 오프라인 테이블 모드 ----------
{
  const o = srv.must('create', { game: G, name: '방장', mode: 'offline' });
  assert.equal(o.mode, 'offline');
  const o2 = srv.must('join', { game: G, code: o.code, name: '친구' });
  assert.equal(srv.req('addBot', { code: o.code, pid: o.me }).ok, false, '오프라인은 봇 없음');
  s = srv.must('start', { code: o.code, pid: o.me });
  assert.equal(s.ot.hand.length, 7);
  const first = s.ot.zones.discard[0][0].f;
  assert.match(first, /^[shdc][3456890T]$/, '첫 카드는 일반 숫자');
  const rawO = srv.raw(o.code).ot;
  assert.equal(rawO.draw.length + 14 + 1, 54, '덱 54장');
  s = srv.must('ot_play', { code: o.code, pid: o.me, ids: [s.ot.hand[0].id], zone: 'discard' });
  assert.equal(s.ot.hand.length, 6);
  s = srv.must('ot_draw', { code: o.code, pid: o2.me, n: 1 });
  assert.equal(s.ot.hand.length, 8);
  const v1 = srv.must('poll', { code: o.code, pid: o.me, since: -1 });
  assert.ok(v1.ot.hands[1].every((c) => c.f === null), '남의 패는 뒷면');
  assert.ok(v1.events.some((e) => e.type === 'ot' && /[♠♥♦♣] |조커/.test(e.text)), '한국어 카드 이름 로그');
  s = srv.must('ot_end', { code: o.code, pid: o.me, winner: 0 });
  assert.equal(s.status, 'finished');
  console.log('오프라인 테이블 통과');
}

// ---------- 한 기기 여러 명 (hotseat: 같은 방에 사람 3명) ----------
{
  const h = srv.must('create', { game: G, name: '친구 1' });
  const h2 = srv.must('join', { game: G, code: h.code, name: '친구 2' });
  const h3 = srv.must('join', { game: G, code: h.code, name: '친구 3' });
  const hp = [h.me, h2.me, h3.me];
  s = srv.must('start', { code: h.code, pid: h.me });
  guard = 0;
  while (s.status === 'playing' && guard++ < 3000) {
    const g = srv.raw(h.code).oc;
    const seat = g.turn;
    const v = srv.must('poll', { code: h.code, pid: hp[seat], since: -1 });
    assertNoLeak(v, srv.raw(h.code), seat);
    const oc = v.oc;
    if (oc.playable.length) s = srv.must('play', { code: h.code, pid: hp[seat], card: oc.playable[0], suit: 'c', call: true });
    else if (oc.phase === 'drawn') s = srv.must('pass', { code: h.code, pid: hp[seat] });
    else s = srv.must('draw', { code: h.code, pid: hp[seat] });
  }
  assert.equal(s.status, 'finished', 'hotseat 끝까지');
  assert.equal(s.oc.ranking.length, 3);
  console.log(`한 기기 3명: ${guard}번, 순위 ${s.oc.ranking.map((i) => s.players[i].name).join(' > ')}`);
}
console.log('one-card 서버 테스트 통과');

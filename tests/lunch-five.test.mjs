// 급식 다섯! 서버 흐름 테스트: node tools/build-gs.mjs && node tests/lunch-five.test.mjs
import { createServer } from '../tools/server-harness.mjs';
import assert from 'node:assert/strict';

const srv = createServer();
const LF = srv.ns('LFRules');
const G = 'lunch-five';

// ---------- 온라인: 사람 2 + 봇 1 ----------
const a = srv.must('create', { game: G, name: '가' });
assert.equal(a.maxPlayers, 6);
const b = srv.must('join', { game: G, code: a.code, name: '나' });
assert.equal(srv.req('addBot', { code: a.code, pid: b.me }).ok, false, '방장만 봇 추가');
srv.must('addBot', { code: a.code, pid: a.me, difficulty: 'hard' });
let s = srv.must('start', { code: a.code, pid: a.me });
assert.equal(s.status, 'playing');
assert.equal(s.lf.piles[0], Math.floor(70 / 3));
const pids = [a.me, b.me];

// 숨김 정보: 내 view에 뒤집힌 더미 카드가 하나도 없어야 함
{
  const raw = srv.raw(a.code);
  const hidden = raw.lf.piles.flat();
  const json = JSON.stringify(srv.must('poll', { code: a.code, pid: a.me, since: -1 }));
  for (const c of new Set(hidden)) {
    // 공개 더미 맨 위에 있는 카드와 같은 코드면 건너뜀 (같은 코드 카드가 여러 장)
    const openTops = raw.lf.open.map((o) => o[o.length - 1]);
    if (openTops.includes(c)) continue;
    assert.ok(!json.includes(`"${c}"`), '뒤집힌 카드가 view에 새면 안 됨: ' + c);
  }
  assert.ok(s.lf.piles.every((n) => typeof n === 'number'), '더미는 장수만');
  const watch = srv.must('watch', { code: a.code, since: -1 });
  assert.equal(watch.mySeat, -1);
  assert.ok(watch.lf);
}

// 남의 차례에는 못 뒤집음
assert.equal(srv.req('flip', { code: a.code, pid: b.me }).ok, false, '남의 차례');
// 틀린 종 / 늦은 종
{
  const raw = srv.raw(a.code);
  assert.equal(LF.hasFive(raw.lf), false);
  const before = raw.lf.piles[1].length;
  s = srv.must('ring', { code: a.code, pid: b.me, tick: raw.lf.tick });
  const ev = s.events[s.events.length - 1];
  assert.equal(ev.type, 'ring');
  assert.equal(ev.ok, false);
  assert.equal(srv.raw(a.code).lf.piles[1].length, before - 2, '틀리면 다른 두 사람에게 1장씩');
  const late = srv.req('ring', { code: a.code, pid: a.me, tick: raw.lf.tick - 1 });
  assert.equal(late.ok, false);
  assert.match(late.error, /늦었/);
}

// 끝까지: 사람은 5가 보이면 치고, 아니면 뒤집고, 봇 차례면 시간을 넘겨 폴링
let guard = 0;
let rings = 0;
while (s.status === 'playing' && guard++ < 5000) {
  const raw = srv.raw(a.code);
  const g = raw.lf;
  if (LF.hasFive(g) && Math.random() < 0.6) {
    const who = [0, 1].filter((i) => !g.out[i]);
    if (who.length) {
      const r = srv.req('ring', { code: a.code, pid: pids[who[0]], tick: g.tick });
      if (r.ok) {
        s = r;
        rings++;
        continue;
      }
    }
  }
  if (g.turn < 2 && !g.out[g.turn]) {
    s = srv.must('flip', { code: a.code, pid: pids[g.turn] });
  } else {
    srv.advance(2600);
    s = srv.must('poll', { code: a.code, pid: a.me, since: -1 });
    srv.must('poll', { code: a.code, pid: b.me, since: -1 }); // 둘 다 접속 중으로
  }
  const r2 = srv.raw(a.code);
  if (r2.lf) assert.equal(LF.countAll(r2.lf), r2.lf.total, '카드 보존');
}
assert.equal(s.status, 'finished', '끝까지 감');
assert.ok(s.events.some((e) => e.type === 'end'));
assert.ok(s.lf.winner >= 0);
console.log('  온라인 판 끝:', s.lf.flips, '번 뒤집기, 사람 종', rings, '번, 이유', s.lf.reason);

// ---------- 봇 연습: 봇이 5를 보면 종을 침 ----------
{
  const p = srv.must('create', { game: G, name: '혼자' });
  srv.must('addBot', { code: p.code, pid: p.me, difficulty: 'hard' });
  srv.must('addBot', { code: p.code, pid: p.me, difficulty: 'hard' });
  s = srv.must('start', { code: p.code, pid: p.me });
  let botRang = false;
  let n = 0;
  while (s.status === 'playing' && n++ < 3000 && !botRang) {
    const g = srv.raw(p.code).lf;
    if (g.turn === 0 && !g.out[0] && !LF.hasFive(g)) s = srv.must('flip', { code: p.code, pid: p.me });
    else {
      srv.advance(2600);
      s = srv.must('poll', { code: p.code, pid: p.me, since: -1 });
    }
    botRang = s.events.some((e) => e.type === 'ring' && e.seat > 0 && e.ok);
  }
  assert.ok(botRang || s.status === 'finished', '봇이 종을 쳤음');
}

// ---------- 한 기기 모드: 사람 3명이 각자 pid로 ----------
{
  const h = srv.must('create', { game: G, name: 'A' });
  const p2 = srv.must('join', { game: G, code: h.code, name: 'B' });
  const p3 = srv.must('join', { game: G, code: h.code, name: 'C' });
  s = srv.must('start', { code: h.code, pid: h.me });
  s = srv.must('flip', { code: h.code, pid: h.me });
  assert.equal(s.lf.turn, 1);
  s = srv.must('flip', { code: h.code, pid: p2.me });
  s = srv.must('flip', { code: h.code, pid: p3.me });
  assert.equal(s.lf.open.filter((o) => o.top).length, 3);
}

// ---------- 오프라인 테이블 모드 ----------
{
  const o = srv.must('create', { game: G, name: '방장', mode: 'offline' });
  assert.equal(o.mode, 'offline');
  const o2 = srv.must('join', { game: G, code: o.code, name: '친구' });
  const o3 = srv.must('join', { game: G, code: o.code, name: '셋째' });
  assert.equal(srv.req('addBot', { code: o.code, pid: o.me }).ok, false, '오프라인은 봇 없음');
  s = srv.must('start', { code: o.code, pid: o.me });
  assert.equal(s.ot.hands[0].length, 23);
  assert.equal(s.ot.hand.length, 0, '내 더미도 못 봄 (blind)');
  assert.ok(s.ot.hands.every((h) => h.every((c) => c.f === null)), '남의 더미 안 보임');
  s = srv.must('ot_flipTop', { code: o.code, pid: o.me });
  assert.equal(s.ot.zones['open:0'].length, 1);
  assert.equal(s.ot.turn, 1, '뒤집으면 다음 차례');
  s = srv.must('ot_flipTop', { code: o.code, pid: o2.me });
  assert.ok(s.events.some((e) => e.type === 'ot' && /개/.test(e.text)), '로그에 메뉴 이름');
  s = srv.must('ot_give', { code: o.code, pid: o3.me, to: 0, top: true });
  assert.equal(s.ot.hands[2].length, 22);
  assert.equal(s.ot.hands[0].length, 23);
  s = srv.must('ot_collect', { code: o.code, pid: o.me, to: 2 });
  assert.equal(s.ot.hands[2].length, 24);
  const json = JSON.stringify(srv.must('poll', { code: o.code, pid: o2.me, since: -1 }).ot.hands);
  assert.ok(!/"f":"[a-z]+[0-9]"/.test(json), '오프라인: 더미 카드 앞면이 새지 않음');
  s = srv.must('ot_undo', { code: o.code, pid: o.me });
  assert.equal(s.ot.hands[2].length, 22);
  s = srv.must('ot_end', { code: o.code, pid: o.me, winner: 1 });
  assert.equal(s.status, 'finished');
}

// 1명으로는 시작 못 함
{
  const x = srv.must('create', { game: G, name: '외톨이' });
  assert.equal(srv.req('start', { code: x.code, pid: x.me }).ok, false);
}
console.log('lunch-five 서버 테스트 통과');

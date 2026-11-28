// 보석 공방 서버 흐름 테스트: node tests/gem-workshop.test.mjs
import { createServer } from '../tools/server-harness.mjs';
import assert from 'node:assert/strict';

const srv = createServer();
const G = 'gem-workshop';

// 사람 2 + 봇 1 → 직접 몇 수 두고, 나머지는 봇/자리 비움 대신 두기로 끝까지
const a = srv.must('create', { game: G, name: '가' });
assert.equal(a.maxPlayers, 4);
const b = srv.must('join', { game: G, code: a.code, name: '나' });
srv.must('addBot', { code: a.code, pid: a.me, difficulty: 'hard' });
const s = srv.must('start', { code: a.code, pid: a.me });
assert.equal(s.status, 'playing');
assert.equal(s.gw.market.length, 3);
assert.ok(!('decks' in s.gw), '덱 순서는 안 보임');
assert.equal(srv.req('take', { code: a.code, pid: b.me, gems: ['r', 'b', 'g'] }).ok, false, '내 차례 아님');
const t = srv.must('take', { code: a.code, pid: a.me, gems: ['r', 'b', 'g'] });
assert.equal(t.gw.players[0].gems.r, 1);
assert.equal(t.gw.turn, 1);
// 덱에서 찜 → 남에게는 숨김
srv.must('reserve', { code: a.code, pid: b.me, card: 'deck1' });
const seenByA = srv.must('poll', { code: a.code, pid: a.me, since: -1 });
assert.equal(seenByA.gw.players[1].reserved[0].id, null, '남이 덱에서 찜한 카드는 안 보임');
const seenByB = srv.must('poll', { code: a.code, pid: b.me, since: -1 });
assert.ok(seenByB.gw.players[1].reserved[0].id, '내 찜은 보임');
assert.equal(seenByB.gw.players[1].gems.y, 1);

// 나머지는 시간을 흘려 봇·자리 비움 대신 두기로 끝까지
let st = seenByB;
for (let i = 0; i < 800; i++) {
  srv.advance(50000); // 차례인 사람은 자리 비움이 되도록, 차례 아닌 사람으로만 폴링
  st = srv.must('poll', { code: a.code, pid: st.gw && st.gw.turn === 0 ? b.me : a.me, since: -1 });
  if (st.status === 'finished') break;
}
assert.equal(st.status, 'finished', '끝까지 감');
assert.ok(st.gw.players[st.gw.winner].pts >= 15);
assert.match(srv.raw(a.code).resultText, /^승리: /);
assert.ok(JSON.stringify(srv.raw(a.code)).length < 90000, '방 저장 크기 100KB 아래');

console.log('✅ gem-workshop.test.mjs: 보석 공방 서버 테스트 통과');

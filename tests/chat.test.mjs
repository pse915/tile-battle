// 채팅 서버 테스트: node tests/chat.test.mjs
import { createServer } from '../tools/server-harness.mjs';
import assert from 'node:assert/strict';

const srv = createServer();
const a = srv.must('create', { game: 'one-card', name: '가' });
const b = srv.must('join', { game: 'one-card', code: a.code, name: '나' });
const say = (who, text) => srv.req('chat', { code: a.code, pid: who.me, text });

// 보내기 → poll로 받기
const r = say(a, '안녕!');
assert.ok(r.ok);
assert.deepEqual(r.chat.map((m) => [m.name, m.text]), [['가', '안녕!']]);
const seen = srv.must('poll', { code: a.code, pid: b.me, since: -1 });
assert.equal(seen.chat.at(-1).text, '안녕!');
assert.equal(seen.chat.at(-1).type, 'chat');

// 속도 제한: 2초에 1개
assert.equal(say(a, '또').ok, false, '2초 안에 두 번은 막힘');
assert.ok(say(b, '나는 됨').ok, '다른 사람은 따로 셈');
srv.advance(2100);
assert.ok(say(a, '이제 됨').ok);

// 길이 제한
srv.advance(2100);
assert.ok(say(a, 'ㄱ'.repeat(60)).ok, '60자는 됨');
srv.advance(2100);
assert.equal(say(a, 'ㄱ'.repeat(61)).ok, false, '61자는 막힘');
assert.equal(say(a, '   ').ok, false, '빈 말은 막힘');

// 욕설은 ＊ 처리, 개인정보는 막음
srv.advance(2100);
assert.equal(say(a, '야 씨 1 발').chat.at(-1).text, '야 ＊ ＊ ＊');
srv.advance(2100);
assert.equal(say(a, 'ㅂㅅ아 fuck').chat.at(-1).text, '＊＊아 ＊＊＊＊');
srv.advance(2100);
assert.equal(say(a, '새끼 고양이 귀여워').chat.at(-1).text, '새끼 고양이 귀여워', '평범한 말은 그대로');
srv.advance(2100);
assert.equal(say(a, '내 번호 010-1234-5678').ok, false);
assert.equal(say(a, 'abc.com 들어와').ok, false);
assert.equal(say(a, '<b>태그</b>').chat.at(-1).text, 'b태그/b', '태그 기호는 지움');

// 관전자(테이블 화면)는 읽기만
const w = srv.must('watch', { code: a.code, since: -1 });
assert.ok(w.chat.length > 0, '관전자도 채팅을 봄');
assert.equal(srv.req('chat', { code: a.code, pid: 'nobody', text: '안녕' }).ok, false, '참가자가 아니면 못 보냄');

// 방장 음소거
assert.equal(srv.req('chatMute', { code: a.code, pid: b.me, target: a.me, mute: true }).ok, false, '방장만 음소거');
srv.must('chatMute', { code: a.code, pid: a.me, target: b.me, mute: true });
srv.advance(2100);
assert.equal(say(b, '말할래').ok, false, '음소거되면 못 보냄');
srv.must('chatMute', { code: a.code, pid: a.me, target: b.me, mute: false });
assert.ok(say(b, '풀렸다').ok);

// 최근 50개만 보관 + 캐시 크기
for (let i = 0; i < 70; i++) {
  srv.advance(2100);
  say(i % 2 ? a : b, '메시지 ' + i + ' ' + 'ㅋ'.repeat(40));
}
const last = srv.must('poll', { code: a.code, pid: a.me, since: -1 });
assert.equal(last.chat.length, 50);
assert.match(last.chat.at(-1).text, /^메시지 69/);
assert.ok(JSON.stringify(srv.raw(a.code)).length < 60000, '방 저장 크기가 넉넉히 100KB 아래');

// 게임 중에도 채팅 + 게임 진행에 영향 없음
srv.must('start', { code: a.code, pid: a.me });
srv.advance(2100);
const g = srv.must('chat', { code: a.code, pid: a.me, text: '시작!' });
assert.equal(g.status, 'playing');

console.log('✅ chat.test.mjs: 채팅 서버 테스트 통과');

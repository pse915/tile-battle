// 게임 고르기 허브: 방 코드 → 어떤 게임인지 찾아서 이동, 예전 초대 링크(?room=) 호환
import { api, onlineReady } from './shared/net.js';
import { $, toast } from './shared/ui-core.js';

const GAMES = ['tile-battle', 'deep-sea', 'flip-duel', 'color-rush', 'code-breaker', 'number-garden', 'lunch-five', 'school-trip', 'one-card', 'gem-workshop'];
const GAME_PATH = Object.fromEntries(GAMES.map((g) => [g, `./games/${g}/`]));
const keep = () => {
  // 개발용 ?api= 값은 이동할 때도 유지
  const api = new URLSearchParams(location.search).get('api');
  return api ? `&api=${encodeURIComponent(api)}` : '';
};

async function goToRoom(code, { fallback = null } = {}) {
  const note = $('#hub-join-note');
  note.textContent = '방을 찾는 중…';
  try {
    if (!onlineReady()) throw new Error('온라인 서버가 아직 설정되지 않았어요.');
    const r = await api('lookup', { code });
    location.href = `${GAME_PATH[r.game] || GAME_PATH['tile-battle']}?room=${code}${keep()}`;
  } catch (err) {
    if (fallback) {
      location.href = `${fallback}?room=${code}${keep()}`;
      return;
    }
    note.textContent = '어떤 게임 방인지 자동으로 찾아서 이동해요.';
    toast(err.message, 2600);
  }
}

$('#hub-code').addEventListener('input', (e) => (e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 4)));
const join = () => {
  const code = $('#hub-code').value.trim();
  if (!/^[0-9]{4}$/.test(code)) return toast('방 코드 숫자 4자리를 입력해 주세요.');
  goToRoom(code);
};
$('#btn-hub-join').addEventListener('click', join);
$('#hub-code').addEventListener('keydown', (e) => e.key === 'Enter' && join());

// 예전 초대 링크: 루트?room=1234 → 해당 게임으로 (못 찾으면 타일 배틀로)
const room = new URLSearchParams(location.search).get('room');
if (room && /^[0-9]{4}$/.test(room)) {
  $('#hub-code').value = room;
  goToRoom(room, { fallback: GAME_PATH['tile-battle'] });
}

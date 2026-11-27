// 서라벌학교여행 — 시작, 메뉴, 모드 연결
import { createShell, bootFailed } from '../../../shared/shell.js';
import { ensureFonts } from '../../../shared/table3d.js';
import { Lobby } from '../../../shared/lobby.js';
import { common } from '../../../shared/storage.js';
import * as ui from '../../../shared/ui-core.js';
import { SchoolStage } from './scene.js';
import { SchoolGame } from './game.js';
import { audio } from './audio.js';
import { startTutorial } from './tutorial.js';
import { runSelfTests, START_MONEY, SALARY, ROUND_CHOICES } from './rules.js';

const RULES = `
  <h3>목표</h3><p>서라벌여중의 실(교실)을 사 모아 친구들에게 통행료를 받아요. <b>한 명 빼고 모두 파산</b>하거나, 정한 <b>바퀴 수가 끝났을 때 총자산 1등</b>이 승리!</p>
  <h3>하는 법</h3>
  <ul>
    <li>모두 ${START_MONEY}만 원으로 시작. 주사위 2개를 굴려 시계 방향으로 가요. 더블이면 한 번 더 (세 번 연속이면 숙직실).</li>
    <li>🏫 교문을 지나거나 멈추면 용돈 ${SALARY}만 원.</li>
    <li>주인 없는 실 → 살지 말지 선택. 남의 실 → 통행료 자동.</li>
    <li>같은 층 같은 색 3칸을 모두 가지면 통행료 2배.</li>
    <li>내 실에 다시 멈추면 🪑 책상 → 📚 책장 → 🏫 리모델링을 한 단계씩 지어요.</li>
    <li>⭐ 명소(교정 분수대·체력단련실·자기주도배움터·홈베이스)는 건물 없이 통행료가 정해져 있어요.</li>
    <li>돈이 모자라면 건물 → 땅 순으로 반값에 자동으로 팔아요. 그래도 못 내면 파산.</li>
  </ul>
  <h3>특별한 칸</h3>
  <ul>
    <li>🛏️ 숙직실: 3턴 쉬기. 더블이 나오거나 50만 원을 내면 바로 탈출.</li>
    <li>💝 복지실: 복지 기부함에 쌓인 돈을 모두 받아요.</li>
    <li>🛗 엘리베이터: 다음 차례에 원하는 칸으로 이동 (교문을 지나면 용돈).</li>
    <li>🪙 복지 기부함: 100만 원을 내요 (복지실에 쌓임).</li>
    <li>💌 행운 쪽지: 장학금, 급식 당번비, 통행료 면제권 등 18가지.</li>
  </ul>
  <h3>모드</h3>
  <ul>
    <li>🤖 봇과 연습: 봇 1~3명, 쉬움·보통·어려움 (인터넷 없이도 됨)</li>
    <li>👥 한 기기 여러 명: 2~4명이 패드 하나로 번갈아</li>
    <li>🌐 온라인 방: 코드로 친구와 각자 기기에서 (방장이 10·15·20바퀴 선택)</li>
  </ul>`;

let view;
let lobby;
let game;
let tutorial = null;

const shell = createShell({
  prefix: 'schooltrip:',
  title: '🏫 서라벌학교여행 🎲',
  kicker: '주사위 굴려 학교 한 바퀴',
  titleHtml: '서라벌<br />학교여행',
  sub: '1층부터 4층까지, 교실을 모아라!',
  startLabel: '교문 들어가기',
  loadingText: '복도를 청소하는 중…',
  menu: [
    { go: 'practice', label: '🤖 봇과 연습', small: '봇 1~3명 · 쉬움 · 보통 · 어려움', primary: true },
    { go: 'hotseat', label: '👥 한 기기 여러 명', small: '2~4명이 패드 하나로 번갈아' },
    { go: 'online', label: '🌐 온라인 방', small: '코드로 친구와 각자 기기에서' },
  ],
  rulesHtml: RULES,
  audio,
  handlers: {
    practice: () => practice(),
    hotseat: () => hotseat(),
    online: () => lobby.open(),
    room: (code) => lobby.open(code),
    tutorial: () => runTutorial(),
    pause: () => pause(),
    quality: (q) => view.setQuality(q),
  },
});

async function boot() {
  if (new URLSearchParams(location.search).has('test')) {
    const r = runSelfTests(300);
    setTimeout(() => ui.toast(`자가 테스트 ${r.passed}/${r.total} 통과`, 4000), 1500);
  }
  await ensureFonts();
  view = new SchoolStage(document.getElementById('stage'));
  view.setQuality(shell.quality());
  view.setPlayers(4);
  view.setTitleMode(true);
  lobby = new Lobby({
    game: 'school-trip',
    title: '서라벌학교여행',
    audio,
    onGameState: (s, first) => game.onState(s, first),
    onLeaveGame: () => toMenu(),
    onBack: () => toMenu(),
  });
  addRoundPicker();
  game = new SchoolGame(view, lobby, shell, audio);
  game.onMenu = () => toMenu();
  window.__schooltrip = { stage: view, lobby, game, shell };
  shell.ready();
}

/** 대기방에 '몇 바퀴' 고르기 (방장만 바꿀 수 있음) */
function addRoundPicker() {
  const host = document.getElementById('lobby-host');
  host.insertAdjacentHTML(
    'afterbegin',
    `<div class="field st-rounds"><label>몇 바퀴 할까요? (끝나면 총자산 1등 승리)</label><div class="bot-row">${ROUND_CHOICES.map(
      (r) => `<button class="btn small" data-rounds="${r}">${r}바퀴</button>`,
    ).join('')}</div></div>`,
  );
  host.querySelectorAll('[data-rounds]').forEach((b) => b.addEventListener('click', () => lobby.send('config', { rounds: Number(b.dataset.rounds) })));
  const orig = lobby.renderLobby.bind(lobby);
  lobby.renderLobby = (s) => {
    orig(s);
    host.querySelectorAll('[data-rounds]').forEach((b) => b.classList.toggle('primary', Number(b.dataset.rounds) === s.rounds));
  };
}

function toMenu() {
  lobby.leave();
  game.exit();
  tutorial = null;
  view.setPlayers(4);
  view.sync({ n: 4, players: [0, 1, 2, 3].map(() => ({ pos: 0, out: false })), own: new Array(40).fill(-1), lvl: new Array(40).fill(0), turn: -1, phase: 'over' });
  view.setTitleMode(true);
  shell.showMenu();
}

async function practice() {
  const bots = await ui.modal({
    title: '🤖 봇 몇 명과 할까요?',
    html: '<p>나는 <b>빨간 말(먼저)</b>이에요.</p>',
    buttons: [
      { label: '봇 1명', value: 1 },
      { label: '봇 2명', value: 2, primary: true },
      { label: '봇 3명', value: 3 },
      { label: '취소', value: null },
    ],
  });
  if (!bots) return;
  const difficulty = await ui.modal({
    title: '🤖 봇 난이도',
    html: '<p>쉬움 봇은 아무렇게나, 어려움 봇은 독점을 노리고 건물을 잘 지어요.</p>',
    buttons: [
      { label: '쉬움', value: 'easy' },
      { label: '보통', value: 'normal', primary: true },
      { label: '어려움', value: 'hard' },
      { label: '취소', value: null },
    ],
  });
  if (!difficulty) return;
  try {
    await lobby.practice(common.load('nick', '') || '나', bots, difficulty);
  } catch (err) {
    audio.error();
    ui.toast(err.message, 2600);
  }
}

async function hotseat() {
  const n = await ui.modal({
    title: '👥 몇 명이 할까요?',
    html: '<p>패드 하나로 차례대로 주사위를 굴려요.</p>',
    buttons: [
      { label: '2명', value: 2 },
      { label: '3명', value: 3, primary: true },
      { label: '4명', value: 4 },
      { label: '취소', value: null },
    ],
  });
  if (!n) return;
  const defaults = ['친구 A', '친구 B', '친구 C', '친구 D'];
  const names = await ui.modal({
    title: '이름 정하기',
    html: `<div class="st-names">${defaults
      .slice(0, n)
      .map((d, k) => `<label><span class="dot" style="background:${['#ff6b8a', '#4fa3ff', '#52c97a', '#ffb02e'][k]}"></span><input class="input" maxlength="8" id="st-name-${k}" value="${d}" /></label>`)
      .join('')}</div>`,
    buttons: [
      { label: '취소', value: null },
      { label: '시작!', value: 'go', primary: true },
    ],
  }).then((v) => (v ? defaults.slice(0, n).map((d, k) => (document.getElementById(`st-name-${k}`)?.value || '').trim() || d) : null));
  if (!names) return;
  try {
    await lobby.hotseat(names);
  } catch (err) {
    audio.error();
    ui.toast(err.message, 2600);
  }
}

function runTutorial() {
  ui.showScreen(null);
  view.setPlayers(2);
  tutorial = startTutorial({
    view,
    store: shell.store,
    audio,
    shell,
    onDone: () => {
      tutorial = null;
      toMenu();
    },
  });
}

async function pause() {
  const choice = await ui.modal({
    title: '잠깐 멈춤',
    html: tutorial ? '<p>튜토리얼을 그만둘까요?</p>' : lobby.local ? '<p>이 판을 그만두고 메뉴로 갈까요?</p>' : '<p>방에서 나갈까요? 내 자리는 봇이 이어서 해요.</p>',
    buttons: [
      { label: '메뉴로 나가기', value: 'exit' },
      { label: '계속하기', value: 'resume', primary: true },
    ],
  });
  if (choice !== 'exit') return;
  if (tutorial) tutorial.finish(true);
  else toMenu();
}

boot().catch(bootFailed);

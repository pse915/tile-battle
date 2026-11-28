// 보석 공방 — 시작, 메뉴, 모드 연결
import { createShell, bootFailed } from '../../../shared/shell.js';
import { ensureFonts } from '../../../shared/table3d.js';
import { Lobby } from '../../../shared/lobby.js';
import { common } from '../../../shared/storage.js';
import * as ui from '../../../shared/ui-core.js';
import { GWStage } from './scene.js';
import { GWGame, gemDot, cardHtml, patronHtml } from './game.js';
import { audio } from './audio.js';
import { startTutorial } from './tutorial.js';
import { runSelfTests, GOAL } from './rules.js';

const rulesHtml = () => `
  <h3>목표</h3><p>보석으로 공방 카드를 사서 <b>${GOAL}점</b>을 먼저 모으세요. 누군가 ${GOAL}점이 되면 그 바퀴를 끝까지 하고 점수가 가장 높은 사람이 이겨요. (같으면 카드를 적게 산 사람)</p>
  <h3>보석</h3>
  <p>${gemDot('r')} 루비 · ${gemDot('b')} 사파이어 · ${gemDot('g')} 에메랄드 · ${gemDot('w')} 진주 · ${gemDot('k')} 흑요석 · ${gemDot('y')} 황금(만능)</p>
  <h3>내 차례에 하나만!</h3>
  <ul>
    <li>💎 <b>보석 가져오기</b>: 서로 다른 색 3개, 또는 같은 색 2개(그 색이 4개 이상 남았을 때). 황금은 이렇게 못 가져와요.</li>
    <li>🃏 <b>카드 사기</b>: 시장 카드나 내가 찜한 카드. 왼쪽 위 숫자가 점수, 오른쪽 위 보석이 <b>할인</b>이에요.</li>
    <li>🔖 <b>찜하기</b>: 카드 1장을 내 앞에 맡겨 두고(최대 3장) 황금 1개를 받아요. 덱 맨 위 카드를 몰래 찜할 수도 있어요.</li>
  </ul>
  <h3>할인</h3>
  <p>산 카드는 다시 쓰지 않고, 그 색 보석을 <b>영원히 1개씩 깎아 줘요</b>. 할인이 쌓이면 비싼 카드도 공짜! ${cardHtml('c1-r-0')}</p>
  <h3>후원자</h3>
  <p>할인이 조건만큼 모이면 차례 끝에 저절로 찾아와 <b>+3점</b>. ${patronHtml('p4-r')}</p>
  <h3>보석은 10개까지</h3><p>넘으면 넘친 만큼 골라서 돌려놓아요.</p>
  <h3>모드</h3>
  <ul>
    <li>🤖 봇과 연습: 봇 1~3명, 쉬움·보통·어려움 (인터넷 없이도 됨)</li>
    <li>👥 한 기기 여러 명: 2~4명이 기기를 돌려 가며 (차례마다 가림막)</li>
    <li>🌐 온라인 방: 코드로 친구와 각자 기기에서</li>
  </ul>`;

let view;
let lobby;
let game;
let tutorial = null;

const shell = createShell({
  prefix: 'gemworkshop:',
  title: '💎 보석 공방',
  kicker: '보석을 모아 카드를 사고, 할인으로 더 큰 카드를!',
  titleHtml: '보석<br />공방',
  sub: '💎 보석 3개 · 🃏 카드 사기 · 🔖 찜하기 — 먼저 15점',
  startLabel: '공방 열기',
  loadingText: '보석 닦는 중…',
  menu: [
    { go: 'practice', label: '🤖 봇과 연습', small: '봇 1~3명 · 인터넷 없이도 OK', primary: true },
    { go: 'hotseat', label: '👥 한 기기 여러 명', small: '2~4명이 돌려 가며' },
    { go: 'online', label: '🌐 온라인 방', small: '코드로 친구와' },
  ],
  rulesHtml: rulesHtml(),
  audio,
  handlers: {
    practice: () => practice(),
    hotseat: () => hotseat(),
    online: () => lobby.open(),
    room: (code) => lobby.open(code),
    watch: (code) => watch(code),
    tutorial: () => runTutorial(),
    pause: () => pause(),
    quality: (q) => view.setQuality(q),
  },
});

async function boot() {
  if (new URLSearchParams(location.search).has('test')) {
    const r = runSelfTests();
    setTimeout(() => ui.toast(`자가 테스트 ${r.passed}/${r.total} 통과`, 4000), 1500);
  }
  await ensureFonts();
  view = new GWStage(document.getElementById('stage'));
  view.setQuality(shell.quality());
  view.setBank({ r: 7, b: 7, g: 7, w: 7, k: 7, y: 5 });
  view.setTitleMode(true);
  lobby = new Lobby({
    game: 'gem-workshop',
    title: '보석 공방',
    audio,
    offline: false,
    onGameState: (s, first) => game.onState(s, first),
    onLeaveGame: () => toMenu(),
    onBack: () => toMenu(),
  });
  game = new GWGame(view, lobby, shell, audio);
  game.onMenu = () => toMenu();
  window.__gem = { stage: view, lobby, game, shell };
  shell.ready();
}

function toMenu() {
  tutorial?.finish(true);
  tutorial = null;
  lobby.leave();
  game.exit();
  view.setBank({ r: 7, b: 7, g: 7, w: 7, k: 7, y: 5 });
  view.setTitleMode(true);
  shell.showMenu();
}

async function practice() {
  const bots = await ui.modal({
    title: '🤖 봇 몇 명과 할까요?',
    html: '<p>나 + 봇 = 2~4명이에요.</p>',
    buttons: [1, 2, 3].map((n) => ({ label: `${n}명`, value: n, primary: n === 2 })).concat([{ label: '취소', value: null }]),
  });
  if (!bots) return;
  const difficulty = await ui.modal({
    title: '🤖 봇 난이도',
    html: '<p>쉬운 봇은 아무 카드나 사요. 어려운 봇은 후원자를 노리고 할인을 쌓아요.</p>',
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
    html: '<p>한 기기를 차례마다 돌려 가며 해요. 내 차례가 오면 가림막의 버튼을 눌러요.</p>',
    buttons: [2, 3, 4].map((k) => ({ label: `${k}명`, value: k, primary: k === 2 })).concat([{ label: '취소', value: null }]),
  });
  if (!n) return;
  try {
    await lobby.hotseat(Array.from({ length: n }, (_, i) => `친구 ${i + 1}`));
  } catch (err) {
    audio.error();
    ui.toast(err.message, 2600);
  }
}

async function watch(code) {
  try {
    await lobby.watch(code);
  } catch (err) {
    audio.error();
    ui.toast(err.message, 2600);
    shell.showMenu();
  }
}

async function runTutorial() {
  try {
    await lobby.practice('나', 2, 'easy');
  } catch (err) {
    return ui.toast(err.message, 2600);
  }
  tutorial = startTutorial({
    store: shell.store,
    onDone: () => {
      tutorial = null;
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
  if (choice === 'exit') toMenu();
}

boot().catch(bootFailed);

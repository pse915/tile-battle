// 컬러 러시 — 시작, 메뉴, 모드 연결
import { createShell, bootFailed } from '../../../shared/shell.js';
import { ensureFonts } from '../../../shared/table3d.js';
import { Lobby } from '../../../shared/lobby.js';
import { common } from '../../../shared/storage.js';
import * as ui from '../../../shared/ui-core.js';
import { CRStage } from './scene.js';
import { CRGame } from './game.js';
import { audio } from './audio.js';
import { startTutorial } from './tutorial.js';
import { runSelfTests, cardName } from './rules.js';
import { cardImg } from './cards.js';

const img = (c) => `<img src="${cardImg(c)}" alt="${cardName(c)}">`;

const rulesHtml = () => `
  <h3>목표</h3><p>손에 든 카드를 <b>가장 먼저 다 내면</b> 승리! (한 판 단위)</p>
  <h3>카드</h3>
  <ul>
    <li>4색: ${img('c7')} 분필 ▲ · ${img('p7')} 형광 ★ · ${img('o7')} 크레용 ◆ · ${img('v7')} 잉크 💧</li>
    <li>숫자 0~9 (0은 색마다 1장, 1~9는 2장씩)</li>
    <li>${img('pS')} 건너뛰기 · ${img('pR')} 방향 바꾸기 · ${img('pD')} +2 (색마다 2장씩)</li>
    <li>${img('wW')} 색 바꾸기 4장 · ${img('wF')} +4 4장 — 모두 108장</li>
  </ul>
  <h3>하는 법</h3>
  <ul>
    <li>7장씩 받고, 버린 더미 맨 위 카드와 <b>색</b> 또는 <b>숫자/기호</b>가 같은 카드를 1장 내요.</li>
    <li>색 바꾸기·+4는 언제나 낼 수 있고, 다음 색을 골라요.</li>
    <li>낼 게 없으면 1장 뽑아요. 뽑은 카드를 낼 수 있으면 <b>내기</b> 또는 <b>넘기기</b>.</li>
    <li>+2·+4를 받으면 그만큼 뽑고 차례가 넘어가요 (쌓기 없음).</li>
    <li>2명일 때 방향 바꾸기는 건너뛰기와 같아요.</li>
    <li>뽑을 더미가 떨어지면 버린 더미를 섞어 다시 써요.</li>
  </ul>
  <h3>📣 마지막!</h3>
  <ul>
    <li>2장에서 1장을 낼 때 <b>마지막!</b> 버튼을 누르고 내거나, 내고 나서 바로 눌러요.</li>
    <li>안 누른 채로 다음 사람이 움직이기 전에 누군가 <b>👉 지적하기</b>를 누르면 <b>2장 벌칙</b>!</li>
  </ul>
  <h3>모드</h3>
  <ul>
    <li>🤖 봇과 연습: 봇 1~5명, 쉬움·보통·어려움 (인터넷 없이도 됨)</li>
    <li>🌐 온라인 방: 코드로 친구와 각자 기기에서 (봇 추가 가능)</li>
    <li>🪑 오프라인 테이블: 패만 공유하고 판정은 얼굴 보며 말로</li>
  </ul>`;

let view;
let lobby;
let game;
let tutorial = null;

const shell = createShell({
  prefix: 'colorrush:',
  title: '🖍️ 컬러 러시',
  kicker: '색 맞추고 숫자 맞추고, 먼저 비우면 승리!',
  titleHtml: '컬러<br />러시',
  sub: '분필 · 형광 · 크레용 · 잉크, 마지막 한 장엔 “마지막!”',
  startLabel: '카드 섞기',
  loadingText: '칠판 지우는 중…',
  menu: [
    { go: 'practice', label: '🤖 봇과 연습', small: '봇 1~5명 · 인터넷 없이도 OK', primary: true },
    { go: 'online', label: '🌐 온라인 방', small: '코드로 친구와 · 오프라인 테이블 모드도' },
  ],
  rulesHtml: '<div id="cr-rules"></div>',
  audio,
  handlers: {
    practice: () => practice(),
    online: () => lobby.open(),
    room: (code) => lobby.open(code),
    watch: (code) => watch(code),
    tutorial: () => runTutorial(),
    pause: () => pause(),
    quality: (q) => view.setQuality(q),
  },
});

/** 타이틀 뒤 3D: 4명이 하고 있는 듯한 판 */
function demoTable() {
  view.sync({ counts: [5, 7, 3, 6], drawCount: 50, pile: ['c3', 'p3', 'pS', 'o3', 'wW', 'o8'], color: 'o', dir: 1, turn: 2, phase: 'play' }, 4, -1);
}

async function boot() {
  if (new URLSearchParams(location.search).has('test')) {
    const r = runSelfTests();
    setTimeout(() => ui.toast(`자가 테스트 ${r.passed}/${r.total} 통과`, 4000), 1500);
  }
  await ensureFonts();
  ui.$('#cr-rules').outerHTML = rulesHtml();
  view = new CRStage(document.getElementById('stage'));
  view.setQuality(shell.quality());
  demoTable();
  view.setTitleMode(true);
  lobby = new Lobby({
    game: 'color-rush',
    title: '컬러 러시',
    audio,
    offline: true,
    onGameState: (s, first) => game.onState(s, first),
    onLeaveGame: () => toMenu(),
    onBack: () => toMenu(),
  });
  game = new CRGame(view, lobby, shell, audio);
  game.onMenu = () => toMenu();
  window.__colorrush = { stage: view, lobby, game, shell };
  shell.ready();
}

function toMenu() {
  lobby.leave();
  game.exit();
  tutorial = null;
  demoTable();
  view.setTitleMode(true);
  shell.showMenu();
}

async function practice() {
  const bots = await ui.modal({
    title: '🤖 봇 몇 명과 할까요?',
    html: '<p>나 + 봇 = 2~6명이에요.</p>',
    buttons: [1, 2, 3, 4, 5].map((n) => ({ label: `${n}명`, value: n, primary: n === 3 })).concat([{ label: '취소', value: null }]),
  });
  if (!bots) return;
  const difficulty = await ui.modal({
    title: '🤖 봇 난이도',
    html: '<p>쉬운 봇은 “마지막!”을 자주 깜빡하고, 어려운 봇은 깜빡한 사람을 꼭 지적해요.</p>',
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

async function watch(code) {
  try {
    await lobby.watch(code);
  } catch (err) {
    audio.error();
    ui.toast(err.message, 2600);
    shell.showMenu();
  }
}

function runTutorial() {
  ui.showScreen(null);
  view.setTitleMode(false);
  tutorial = startTutorial({
    game,
    store: shell.store,
    audio,
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

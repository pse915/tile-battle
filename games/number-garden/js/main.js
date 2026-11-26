// 숫자 블록 정원 — 시작, 메뉴, 모드 연결
import { createShell, bootFailed } from '../../../shared/shell.js';
import { ensureFonts } from '../../../shared/table3d.js';
import { Lobby } from '../../../shared/lobby.js';
import { common } from '../../../shared/storage.js';
import * as ui from '../../../shared/ui-core.js';
import { GardenStage } from './scene.js';
import { GardenGame } from './game.js';
import { audio } from './audio.js';
import { startTutorial } from './tutorial.js';
import { runSelfTests } from './rules.js';

const RULES = `
  <h3>목표</h3><p>내 받침대의 숫자 꽃 블록을 판에 세트로 내려놓아 <b>먼저 다 내면</b> 승리!</p>
  <h3>블록</h3>
  <ul>
    <li>1~13 숫자 × 네 가지 꽃(●동백 · ✚개나리 · ◆수국 · ▲제비꽃) × 2벌 + 🌱새싹 2개 = 106개</li>
    <li>처음에 한 사람당 14개씩 받아요.</li>
    <li>🌱 <b>새싹</b>은 아무 블록 대신 쓸 수 있어요 (대신하는 숫자가 점수).</li>
  </ul>
  <h3>세트</h3>
  <ul>
    <li><b>꽃줄</b>: 같은 꽃, 이어지는 숫자 3개 이상 (예: ●3 ●4 ●5). 13 다음 1은 안 이어져요.</li>
    <li><b>꽃다발</b>: 같은 숫자, 서로 다른 꽃 3~4개 (예: ●7 ✚7 ◆7).</li>
  </ul>
  <h3>내 차례에 할 일</h3>
  <ul>
    <li><b>첫 등록</b>: 처음에는 내 패만으로 만든 세트의 합이 <b>30점 이상</b>이어야 해요. 그전엔 판을 건드릴 수 없어요.</li>
    <li>첫 등록 뒤에는 판의 세트를 <b>쪼개고, 합치고, 내 블록을 더해도</b> 돼요. 단 턴이 끝날 때 <b>모든 줄이 맞는 세트</b>여야 하고, 판의 블록을 내 패로 가져올 수는 없어요. 내 패에서 1개 이상은 꼭 내기!</li>
    <li>낼 게 없거나 아끼고 싶으면 <b>🌱 뽑고 넘기기</b> (더미에서 1개).</li>
    <li>잘못 놓았으면 <b>↩️ 되돌리기</b>로 턴 시작 상태로.</li>
  </ul>
  <h3>끝</h3>
  <ul>
    <li>받침대를 다 비우면 바로 승리.</li>
    <li>더미가 비고 아무도 못 내면 남은 점수(숫자 합, 새싹 30점)가 가장 적은 사람이 승리.</li>
  </ul>
  <h3>조작</h3>
  <ul>
    <li>블록을 <b>탭해서 고르고</b>(여러 개 가능) → 판의 줄이나 <b>‘＋ 새 세트’</b>를 탭하면 거기 놓여요.</li>
    <li>꾹 누른 채 끌어서 놓아도 돼요 (마우스는 바로 끌기).</li>
    <li>이번 턴에 놓은 블록은 고른 뒤 내 받침대를 탭하면 되돌아와요.</li>
  </ul>
  <h3>모드</h3>
  <ul>
    <li>🤖 봇과 연습: 봇 1~3명, 쉬움·보통·어려움 (인터넷 없이도 됨)</li>
    <li>🌐 온라인 방: 코드로 친구와 각자 기기에서. 🪑 오프라인 테이블 모드는 블록만 나눠 갖고 판정은 말로!</li>
  </ul>`;

let stage;
let lobby;
let game;
let tutorial = null;

const shell = createShell({
  prefix: 'numgarden:',
  title: '🌷 숫자 블록 정원 🌱',
  kicker: '학교 화단에 숫자 꽃 심기',
  titleHtml: '숫자 블록<br />정원',
  sub: '꽃줄과 꽃다발을 만들어 받침대를 먼저 비워라!',
  startLabel: '화단으로 가기',
  loadingText: '화단에 물 주는 중…',
  menu: [
    { go: 'practice', label: '🤖 봇과 연습', small: '봇 1~3명 · 쉬움 · 보통 · 어려움', primary: true },
    { go: 'online', label: '🌐 온라인 방', small: '코드로 친구와 · 오프라인 테이블 모드도 있어요' },
  ],
  rulesHtml: RULES,
  audio,
  handlers: {
    practice: () => practice(),
    online: () => lobby.open(),
    room: (code) => lobby.open(code),
    watch: (code) => watch(code),
    tutorial: () => runTutorial(),
    pause: () => pause(),
    quality: (q) => stage.setQuality(q),
  },
});

async function boot() {
  if (new URLSearchParams(location.search).has('test')) {
    setTimeout(() => {
      const r = runSelfTests(300);
      ui.toast(`자가 테스트 ${r.passed}/${r.total} 통과`, 4000);
    }, 1500);
  }
  await ensureFonts();
  stage = new GardenStage(document.getElementById('stage'));
  stage.setQuality(shell.quality());
  stage.setTitleMode(true);
  lobby = new Lobby({
    game: 'number-garden',
    title: '숫자 블록 정원',
    audio,
    offline: true,
    onGameState: (s, first) => game.onState(s, first),
    onLeaveGame: () => {
      game.exit();
      shell.exitHud();
    },
    onBack: () => toMenu(),
  });
  game = new GardenGame(stage, lobby, shell, audio);
  game.onMenu = () => toMenu();
  window.__number_garden = { stage, lobby, game, shell };
  shell.ready();
}

function toMenu() {
  lobby.leave();
  game.exit();
  game.mode = null;
  tutorial = null;
  document.body.classList.remove('ng-tut');
  stage.setTitleMode(true);
  shell.showMenu();
}

async function practice() {
  const bots = await ui.modal({
    title: '🤖 봇 몇 명과 할까요?',
    html: '<p>나 + 봇으로 2~4명이 돼요.</p>',
    buttons: [
      { label: '1명 (2인)', value: 1 },
      { label: '2명 (3인)', value: 2, primary: true },
      { label: '3명 (4인)', value: 3 },
      { label: '취소', value: null },
    ],
  });
  if (!bots) return;
  const difficulty = await ui.modal({
    title: '🤖 봇 난이도',
    html: '<p><b>쉬움</b>: 가끔 붙일 곳을 놓쳐요 · <b>보통</b>: 세트와 붙이기 · <b>어려움</b>: 깊게 찾고 판의 끝 블록도 빌려 써요</p>',
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
  stage.setTitleMode(false);
  tutorial = startTutorial({
    game,
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
    html: tutorial ? '<p>튜토리얼을 그만둘까요?</p>' : lobby.local ? '<p>이 판을 그만두고 메뉴로 갈까요?</p>' : '<p>방에서 나갈까요? 내 자리는 봇이 이어서 둬요.</p>',
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

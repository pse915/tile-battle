// 흑백 뒤집기 대전 — 시작, 메뉴, 모드 연결
import { createShell, bootFailed } from '../../../shared/shell.js';
import { Lobby } from '../../../shared/lobby.js';
import { common } from '../../../shared/storage.js';
import * as ui from '../../../shared/ui-core.js';
import { FlipGame } from './game.js';
import { audio } from './audio.js';
import { startTutorial } from './tutorial.js';
import { runSelfTests, newBoard } from './rules.js';

const RULES = `
  <h3>목표</h3><p>판이 다 차거나 둘 다 둘 곳이 없을 때 <b>내 색 돌이 더 많으면</b> 승리.</p>
  <h3>두는 법</h3>
  <ul>
    <li>흑이 먼저, 번갈아 한 개씩 둬요.</li>
    <li>상대 돌을 내 돌 두 개 사이에 (가로·세로·대각선) <b>끼우면 뒤집혀서</b> 내 색이 돼요.</li>
    <li>상대 돌을 하나도 끼우지 못하는 칸에는 둘 수 없어요.</li>
    <li>둘 곳이 없으면 한 번 쉬어요. 둘 다 없으면 끝.</li>
  </ul>
  <h3>작전 팁</h3>
  <ul>
    <li>모서리는 다시 뒤집히지 않아요. 모서리를 노려요!</li>
    <li>모서리 바로 옆 칸은 상대에게 모서리를 내줄 수 있어 조심.</li>
    <li>초반에는 돌을 많이 뒤집는 것보다 상대가 둘 곳을 줄이는 게 좋아요.</li>
  </ul>
  <h3>모드</h3>
  <ul>
    <li>🤖 봇과 연습: 쉬움·보통·어려움 (인터넷 없이도 됨)</li>
    <li>👥 한 기기 2인: 패드 하나로 번갈아 두기</li>
    <li>🌐 온라인 방: 코드로 친구와 각자 기기에서</li>
  </ul>`;

let view;
let lobby;
let game;
let tutorial = null;

const shell = createShell({
  prefix: 'flipduel:',
  title: '⚫ 흑백 뒤집기 대전 ⚪',
  kicker: '두 사람의 돌 뒤집기 한판',
  titleHtml: '흑백 뒤집기<br />대전',
  sub: '끼우고, 뒤집고, 모서리를 차지하라!',
  startLabel: '판 펼치기',
  loadingText: '바둑판을 닦는 중…',
  menu: [
    { go: 'practice', label: '🤖 봇과 연습', small: '쉬움 · 보통 · 어려움', primary: true },
    { go: 'hotseat', label: '👥 한 기기 2인 대전', small: '패드 하나로 번갈아 두기' },
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
    const r = runSelfTests();
    setTimeout(() => ui.toast(`자가 테스트 ${r.passed}/${r.total} 통과`, 4000), 1500);
  }
  // 3D 엔진: 기본 Babylon.js, 비교용으로 ?engine=three 이면 예전 Three.js 장면
  const useThree = new URLSearchParams(location.search).get('engine') === 'three';
  const { FlipStage } = await import(useThree ? './scene.js' : './scene-babylon.js');
  const { ensureFonts } = await import(useThree ? '../../../shared/table3d.js' : '../../../shared/stage-babylon.js');
  await ensureFonts();
  view = new FlipStage(document.getElementById('stage'));
  view.setQuality(shell.quality());
  view.setBoard(newBoard());
  view.setTitleMode(true);
  lobby = new Lobby({
    game: 'flip-duel',
    title: '흑백 뒤집기 대전',
    audio,
    onGameState: (s, first) => game.onState(s, first),
    onLeaveGame: () => toMenu(),
    onBack: () => toMenu(),
  });
  game = new FlipGame(view, lobby, shell, audio);
  game.onMenu = () => toMenu();
  window.__flip = { view, lobby, game, shell };
  shell.ready();
}

function toMenu() {
  lobby.leave();
  game.exit();
  tutorial = null;
  view.setBoard(newBoard());
  view.setTitleMode(true);
  shell.showMenu();
}

async function practice() {
  const difficulty = await ui.modal({
    title: '🤖 봇 난이도',
    html: '<p>나는 <b>흑(먼저)</b>, 봇은 백이에요.</p>',
    buttons: [
      { label: '쉬움', value: 'easy' },
      { label: '보통', value: 'normal', primary: true },
      { label: '어려움', value: 'hard' },
      { label: '취소', value: null },
    ],
  });
  if (!difficulty) return;
  try {
    await lobby.practice(common.load('nick', '') || '나', 1, difficulty);
  } catch (err) {
    audio.error();
    ui.toast(err.message, 2600);
  }
}

async function hotseat() {
  try {
    await lobby.hotseat(['친구 A', '친구 B']);
  } catch (err) {
    audio.error();
    ui.toast(err.message, 2600);
  }
}

function runTutorial() {
  ui.showScreen(null);
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

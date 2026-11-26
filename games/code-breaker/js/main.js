// 비밀번호 해독반 — 시작, 메뉴, 모드 연결
import { createShell, bootFailed } from '../../../shared/shell.js';
import { ensureFonts } from '../../../shared/table3d.js';
import { Lobby } from '../../../shared/lobby.js';
import { common } from '../../../shared/storage.js';
import * as ui from '../../../shared/ui-core.js';
import { CodeStage } from './scene.js';
import { CodeGame } from './game.js';
import { audio } from './audio.js';
import { startTutorial } from './tutorial.js';
import { runSelfTests, newGame } from './rules.js';

const RULES = `
  <h3>목표</h3><p>남의 비밀번호(숫자 타일 줄)를 추리해서 모두 공개시키고, <b>마지막까지 내 타일을 지키면</b> 승리.</p>
  <h3>타일</h3>
  <ul>
    <li>검정 0~11, 흰색 0~11, 조커 검정·흰색 1개씩 (모두 26개).</li>
    <li>처음에 2~3명은 4개, 4명은 3개씩 받아요.</li>
    <li>내 줄은 <b>왼쪽부터 오름차순</b>. 숫자가 같으면 <b>검정이 왼쪽</b>.</li>
    <li>조커는 원하는 자리에 놓을 수 있어요.</li>
    <li>앞면은 나만, 남들은 <b>뒷면 색</b>만 봐요.</li>
  </ul>
  <h3>내 차례</h3>
  <ul>
    <li>① 가운데 더미에서 <b>원하는 색 타일 1개</b>를 뽑아요 (더미가 비면 건너뜀).</li>
    <li>② 다른 사람의 숨긴 타일 하나를 골라 <b>숫자(또는 조커)를 추측</b>해요.</li>
    <li>맞히면 그 타일이 공개! <b>계속 추리</b>하거나 <b>멈춰요</b>. 멈추면 뽑은 타일은 숨긴 채 내 줄로.</li>
    <li>틀리면 <b>뽑은 타일이 공개된 채</b> 내 줄로. 뽑은 게 없으면 내 숨긴 타일 하나를 골라 공개해요.</li>
    <li>타일이 모두 공개되면 탈락. 마지막 한 명이 승리!</li>
  </ul>
  <h3>추리 팁</h3>
  <ul>
    <li>공개된 타일 사이에 낀 숨긴 타일은 그 사이 숫자일 수밖에 없어요.</li>
    <li>내가 가진 타일, 이미 공개된 타일, 틀린 추측은 후보에서 지워요.</li>
    <li>후보가 하나뿐인 타일을 노려요. 확실하지 않으면 멈추는 것도 작전!</li>
  </ul>
  <h3>모드</h3>
  <ul>
    <li>🤖 봇과 연습: 봇 1~3명, 쉬움·보통·어려움 (인터넷 없이도 됨)</li>
    <li>🌐 온라인 방: 코드로 친구와 각자 기기에서. 🪑 오프라인 테이블 모드는 타일만 나눠 주고 판정은 말로!</li>
  </ul>`;

let stage;
let lobby;
let game;
let tutorial = null;

const shell = createShell({
  prefix: 'codebreaker:',
  title: '🔐 비밀번호 해독반',
  kicker: '방과 후 암호 동아리',
  titleHtml: '비밀번호<br />해독반',
  sub: '정렬 규칙을 단서로, 친구의 숫자 비밀번호를 풀어라!',
  startLabel: '동아리방 들어가기',
  loadingText: '암호 타일을 세우는 중…',
  menu: [
    { go: 'practice', label: '🤖 봇과 연습', small: '봇 1~3명 · 쉬움 · 보통 · 어려움', primary: true },
    { go: 'online', label: '🌐 온라인 방', small: '코드로 친구와 · 오프라인 테이블 모드도 가능' },
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

/** 타이틀 화면 뒤 분위기용 판 */
function showcase() {
  const g = newGame(4);
  g.rows.forEach((r, i) => g.hold[i].forEach((t) => r.push(t)));
  const rows = g.rows.map((r) =>
    r.map((t) => {
      const up = Math.random() < 0.25;
      return { id: t.id, c: t.c, up, n: up ? t.n : null };
    }),
  );
  stage.clear();
  stage.sync({ rows, hold: [], pile: { b: 7, w: 7 }, phase: 'guess', fresh: 0 }, -1, { instant: true });
}

async function boot() {
  if (new URLSearchParams(location.search).has('test')) {
    const r = runSelfTests();
    setTimeout(() => ui.toast(`자가 테스트 ${r.passed}/${r.total} 통과`, 4000), 1500);
  }
  await ensureFonts();
  stage = new CodeStage(document.getElementById('stage'));
  stage.setQuality(shell.quality());
  showcase();
  stage.setTitleMode(true);
  lobby = new Lobby({
    game: 'code-breaker',
    title: '비밀번호 해독반',
    audio,
    offline: true,
    onGameState: (s, first) => game.onState(s, first),
    onLeaveGame: () => {
      game.exit();
      shell.exitHud();
    },
    onBack: () => toMenu(),
  });
  game = new CodeGame(stage, lobby, shell, audio);
  game.onMenu = () => toMenu();
  window.__codebreaker = { stage, lobby, game, shell };
  shell.ready();
}

function toMenu() {
  lobby.leave();
  game.exit();
  tutorial = null;
  showcase();
  stage.setTitleMode(true);
  shell.showMenu();
}

async function practice() {
  const bots = await ui.modal({
    title: '🤖 봇 몇 명과 할까요?',
    html: '<p>나 + 봇으로 2~4명이 돼요.</p>',
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
    html: '<p><b>쉬움</b>: 거의 찍기 · <b>보통</b>: 후보 안에서 추리 · <b>어려움</b>: 후보가 가장 적은 타일을 노리고, 계속할지 확률로 판단</p>',
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
  tutorial = startTutorial({
    stage,
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
    html: tutorial ? '<p>튜토리얼을 그만둘까요?</p>' : lobby.local ? '<p>이 판을 그만두고 메뉴로 갈까요?</p>' : '<p>방에서 나갈까요? 온라인 모드에서는 내 자리를 봇이 이어서 해요.</p>',
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

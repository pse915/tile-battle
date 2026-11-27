// 원카드 — 시작, 메뉴, 모드 연결, 대기방 옵션
import { createShell, bootFailed } from '../../../shared/shell.js';
import { ensureFonts } from '../../../shared/table3d.js';
import { Lobby } from '../../../shared/lobby.js';
import { common } from '../../../shared/storage.js';
import * as ui from '../../../shared/ui-core.js';
import { OCStage } from './scene.js';
import { OCGame } from './game.js';
import { audio } from './audio.js';
import { startTutorial } from './tutorial.js';
import { runSelfTests, cardName, HAND_CHOICES, BUST_CHOICES } from './rules.js';
import { cardImg } from './cards.js';

const img = (c) => `<img src="${cardImg(c)}" alt="${cardName(c)}">`;

const rulesHtml = () => `
  <h3>목표</h3><p>손에 든 카드를 <b>가장 먼저 다 내면</b> 1등! 손패가 <b>파산 장수(기본 20장)</b>가 되면 탈락이에요.</p>
  <h3>카드</h3>
  <ul>
    <li>트럼프 52장 (♠ 스페이드 · ♥ 하트 · ♦ 다이아 · ♣ 클로버) + 조커 2장 ${img('XB')} ${img('XC')}</li>
    <li>♥♦는 빨강, ♠♣는 검정. 무늬 모양이 크게 그려져 있어서 색을 구분하기 어려워도 알아볼 수 있어요.</li>
  </ul>
  <h3>하는 법</h3>
  <ul>
    <li>버린 더미 맨 위 카드와 <b>무늬</b> 또는 <b>숫자/문자</b>가 같은 카드를 1장 내요. 조커는 언제나 낼 수 있고, 조커 다음엔 아무 카드나 돼요.</li>
    <li>낼 게 없으면 1장 뽑아요. 뽑은 카드를 낼 수 있으면 <b>내기</b> 또는 <b>넘기기</b>.</li>
    <li>뽑을 더미가 떨어지면 버린 더미(맨 위 빼고)를 섞어 다시 써요.</li>
  </ul>
  <h3>💥 공격 카드</h3>
  <ul>
    <li>${img('h2')} 2 → +2 · ${img('dA')} A → +3 · ${img('sA')} ♠A → +5 · ${img('XB')} 흑백 조커 → +5 · ${img('XC')} 컬러 조커 → +7</li>
    <li>공격을 받으면 <b>같은 숫자 공격</b>(무늬 상관없음), <b>같은 무늬의 더 센 공격</b>, 또는 <b>조커</b>로 막고 넘길 수 있어요. 막을 때마다 쌓여요!</li>
    <li>못 막으면 쌓인 장수만큼 받고 차례가 끝나요.</li>
  </ul>
  <h3>특수 카드</h3>
  <ul>
    <li>${img('sJ')} J: 다음 사람 건너뛰기 · ${img('hQ')} Q: 방향 바꾸기 (2명이면 건너뛰기)</li>
    <li>${img('dK')} K: 한 번 더 내기 · ${img('c7')} 7: 무늬 바꾸기 (원하는 무늬를 골라요)</li>
  </ul>
  <h3>📣 원카드!</h3>
  <ul>
    <li>2장에서 1장을 낼 때 <b>원카드!</b> 버튼을 누르고 내거나, 내고 나서 바로 눌러요.</li>
    <li>안 누른 채로 다음 사람이 움직이기 전에 누군가 <b>👉 지적하기</b>를 누르면 <b>1장 벌칙</b>!</li>
  </ul>
  <h3>방장 옵션 (대기방)</h3>
  <ul>
    <li>처음 장수 5/6/7 · 파산 장수 15/20/25 · 조커 넣기/빼기 · 순위 끝까지 / 1등만</li>
  </ul>
  <h3>모드</h3>
  <ul>
    <li>🤖 봇과 연습: 봇 1~4명, 쉬움·보통·어려움 (인터넷 없이도 됨)</li>
    <li>👥 한 기기 여러 명: 2~5명이 기기를 돌려 가며 (차례마다 가림막)</li>
    <li>🌐 온라인 방: 코드로 친구와 각자 기기에서 · 🪑 오프라인 테이블: 패만 공유하고 판정은 말로</li>
  </ul>`;

let view;
let lobby;
let game;
let tutorial = null;
let localOpts = { hand: 7, bust: 20, jokers: true, ocMode: 'all' };

const shell = createShell({
  prefix: 'onecard:',
  title: '🃏 원카드',
  kicker: '무늬 맞추고 숫자 맞추고, 공격은 막고 넘겨라!',
  titleHtml: '원<br />카드',
  sub: '♠ ♥ ♦ ♣ · 2·A·조커 공격 쌓기 · 한 장 남으면 “원카드!”',
  startLabel: '카드 섞기',
  loadingText: '카드 섞는 중…',
  menu: [
    { go: 'practice', label: '🤖 봇과 연습', small: '봇 1~4명 · 인터넷 없이도 OK', primary: true },
    { go: 'hotseat', label: '👥 한 기기 여러 명', small: '2~5명이 돌려 가며' },
    { go: 'online', label: '🌐 온라인 방', small: '코드로 친구와 · 오프라인 테이블 모드도' },
  ],
  rulesHtml: '<div id="oc-rules"></div>',
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

function demoTable() {
  view.sync({ counts: [5, 7, 3, 6], drawCount: 30, pile: ['h3', 'h9', 's9', 's2', 'XB', 'd8'], suit: 'd', attack: 0, dir: 1, turn: 2, phase: 'play' }, 4, -1);
}

async function boot() {
  if (new URLSearchParams(location.search).has('test')) {
    const r = runSelfTests();
    setTimeout(() => ui.toast(`자가 테스트 ${r.passed}/${r.total} 통과`, 4000), 1500);
  }
  await ensureFonts();
  ui.$('#oc-rules').outerHTML = rulesHtml();
  view = new OCStage(document.getElementById('stage'));
  view.setQuality(shell.quality());
  demoTable();
  view.setTitleMode(true);
  lobby = new Lobby({
    game: 'one-card',
    title: '원카드',
    audio,
    offline: true,
    onGameState: (s, first) => game.onState(s, first),
    onLeaveGame: () => toMenu(),
    onBack: () => toMenu(),
  });
  addOptionPicker();
  game = new OCGame(view, lobby, shell, audio);
  game.onMenu = () => toMenu();
  window.__onecard = { stage: view, lobby, game, shell };
  shell.ready();
}

/** 대기방에 방장 옵션 (처음 장수 · 파산 장수 · 조커 · 순위 방식) */
function addOptionPicker() {
  const host = document.getElementById('lobby-host');
  const row = (label, key, items) =>
    `<div class="field oc-opt"><label>${label}</label><div class="bot-row">${items.map(([v, t]) => `<button class="btn small" data-opt="${key}" data-val="${v}">${t}</button>`).join('')}</div></div>`;
  host.insertAdjacentHTML(
    'afterbegin',
    `<div class="oc-opts" id="oc-opts">
      ${row('처음 장수', 'hand', HAND_CHOICES.map((n) => [n, n + '장']))}
      ${row('파산 장수 (이만큼 쌓이면 탈락)', 'bust', BUST_CHOICES.map((n) => [n, n + '장']))}
      ${row('조커', 'jokers', [['1', '🃏 넣기'], ['0', '빼기']])}
      ${row('순위', 'ocMode', [['all', '끝까지 순위'], ['first', '1등만']])}
    </div>`,
  );
  host.querySelectorAll('[data-opt]').forEach((b) =>
    b.addEventListener('click', () => {
      const k = b.dataset.opt;
      const v = k === 'jokers' ? b.dataset.val === '1' : k === 'ocMode' ? b.dataset.val : Number(b.dataset.val);
      lobby.send('config', { [k]: v });
    }),
  );
  const orig = lobby.renderLobby.bind(lobby);
  lobby.renderLobby = (s) => {
    orig(s);
    const o = s.ocOpts || {};
    const cur = { hand: String(o.hand), bust: String(o.bust), jokers: o.jokers ? '1' : '0', ocMode: o.mode };
    host.querySelectorAll('[data-opt]').forEach((b) => b.classList.toggle('primary', cur[b.dataset.opt] === b.dataset.val));
    document.getElementById('oc-opts').hidden = s.mode === 'offline';
  };
}

function toMenu() {
  lobby.leave();
  game.exit();
  tutorial = null;
  demoTable();
  view.setTitleMode(true);
  shell.showMenu();
}

/** 이 기기 안 서버 방에 옵션 적용 (봇 연습 · 한 기기) */
async function askOptions() {
  const v = await ui.modal({
    title: '⚙️ 규칙 옵션',
    html: `<p>처음 <b>${localOpts.hand}장</b> · 파산 <b>${localOpts.bust}장</b> · 조커 <b>${localOpts.jokers ? '넣기' : '빼기'}</b> · <b>${localOpts.ocMode === 'first' ? '1등만' : '끝까지 순위'}</b></p>`,
    buttons: [
      { label: '이대로 시작', value: 'go', primary: true },
      { label: '처음 장수 바꾸기', value: 'hand' },
      { label: '파산 장수 바꾸기', value: 'bust' },
      { label: localOpts.jokers ? '조커 빼기' : '조커 넣기', value: 'jokers' },
      { label: localOpts.ocMode === 'first' ? '끝까지 순위로' : '1등만으로', value: 'mode' },
      { label: '취소', value: null },
    ],
  });
  if (!v) return false;
  if (v === 'go') return true;
  if (v === 'hand') localOpts.hand = HAND_CHOICES[(HAND_CHOICES.indexOf(localOpts.hand) + 1) % HAND_CHOICES.length];
  if (v === 'bust') localOpts.bust = BUST_CHOICES[(BUST_CHOICES.indexOf(localOpts.bust) + 1) % BUST_CHOICES.length];
  if (v === 'jokers') localOpts.jokers = !localOpts.jokers;
  if (v === 'mode') localOpts.ocMode = localOpts.ocMode === 'first' ? 'all' : 'first';
  shell.store.save('opts', localOpts);
  return askOptions();
}

/** lobby.practice/hotseat는 바로 시작하므로, 옵션은 'create' 직후 끼워 넣음 */
function withLocalOptions(fn) {
  const orig = lobby.call.bind(lobby);
  lobby.call = async (action, payload = {}) => {
    if (action === 'start') await orig('config', { code: payload.code, pid: payload.pid, ...localOpts });
    return orig(action, payload);
  };
  return fn().finally(() => (lobby.call = orig));
}

async function practice() {
  const bots = await ui.modal({
    title: '🤖 봇 몇 명과 할까요?',
    html: '<p>나 + 봇 = 2~5명이에요.</p>',
    buttons: [1, 2, 3, 4].map((n) => ({ label: `${n}명`, value: n, primary: n === 3 })).concat([{ label: '취소', value: null }]),
  });
  if (!bots) return;
  const difficulty = await ui.modal({
    title: '🤖 봇 난이도',
    html: '<p>쉬운 봇은 “원카드!”를 자주 깜빡하고 공격을 아무 때나 써요. 어려운 봇은 방어 카드를 아껴 두고 깜빡한 사람을 꼭 지적해요.</p>',
    buttons: [
      { label: '쉬움', value: 'easy' },
      { label: '보통', value: 'normal', primary: true },
      { label: '어려움', value: 'hard' },
      { label: '취소', value: null },
    ],
  });
  if (!difficulty) return;
  if (!(await askOptions())) return;
  try {
    await withLocalOptions(() => lobby.practice(common.load('nick', '') || '나', bots, difficulty));
  } catch (err) {
    audio.error();
    ui.toast(err.message, 2600);
  }
}

async function hotseat() {
  const n = await ui.modal({
    title: '👥 몇 명이 할까요?',
    html: '<p>한 기기를 차례마다 돌려 가며 해요. 내 차례가 오면 가림막의 버튼을 누르고 패를 봐요.</p>',
    buttons: [2, 3, 4, 5].map((k) => ({ label: `${k}명`, value: k, primary: k === 3 })).concat([{ label: '취소', value: null }]),
  });
  if (!n) return;
  if (!(await askOptions())) return;
  try {
    await withLocalOptions(() => lobby.hotseat(Array.from({ length: n }, (_, i) => `친구 ${i + 1}`)));
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

localOpts = { ...localOpts, ...shell.store.load('opts', {}) };

boot().catch(bootFailed);

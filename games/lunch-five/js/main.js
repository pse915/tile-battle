// 급식 다섯! — 시작, 메뉴, 모드 연결 (👥 한 기기 파티 · 🤖 봇과 연습 · 🌐 온라인/🪑 오프라인 테이블)
import { createShell, bootFailed } from '../../../shared/shell.js';
import { ensureFonts } from '../../../shared/table3d.js';
import { Lobby } from '../../../shared/lobby.js';
import { common } from '../../../shared/storage.js';
import * as ui from '../../../shared/ui-core.js';
import { LunchStage } from './scene.js';
import { LunchGame, NET_NOTE } from './game.js';
import { audio } from './audio.js';
import { startTutorial } from './tutorial.js';
import { runSelfTests, MENUS, MENU_NAME, makeDeck, shuffle } from './rules.js';
import { menuImage } from './cards.js';

const $ = ui.$;

const rulesHtml = () => `
  <h3>목표</h3><p>카드를 뒤집다가 <b>같은 급식 메뉴가 딱 5개</b> 보이면 가운데 종을 <b>가장 먼저</b> 쳐서 카드를 모아요. 마지막까지 카드가 남은 사람이 승리!</p>
  <h3>메뉴 카드</h3>
  <p class="lf-menus">${MENUS.map((m) => `<span><img src="${menuImage(m)}" alt="">${MENU_NAME[m]}</span>`).join('')}</p>
  <p>메뉴마다 1개짜리 5장, 2개 3장, 3개 3장, 4개 2장, 5개 1장 (모두 70장). 모두에게 똑같이 나눠 뒤집어 쌓아요.</p>
  <h3>하는 법</h3>
  <ul>
    <li>차례대로 내 더미 맨 위 카드를 뒤집어 내 앞 공개 더미에 올려요.</li>
    <li>사람마다 <b>공개 더미 맨 위 카드만</b> 세요.</li>
    <li>어떤 메뉴든 모두 더해 <b>정확히 5</b>면 🔔! 가장 먼저 친 사람이 공개된 카드를 <b>모두</b> 가져가 내 더미 아래에 넣어요.</li>
    <li>5가 아닌데 치면 다른 모든 사람에게 <b>1장씩</b> 줘요.</li>
    <li>내 더미가 다 떨어지면 탈락 (내 공개 더미는 테이블에 남아요).</li>
    <li>마지막 1명이 남거나, 모두 합쳐 220장을 뒤집으면 끝 → 카드가 가장 많은 사람이 승리.</li>
  </ul>
  <h3>모드</h3>
  <ul>
    <li>👥 <b>한 기기 파티</b>: 패드 하나에 2~4명이 둘러앉아요. 사람마다 자기 쪽 가장자리에 종과 뒤집기 버튼! 여러 손가락이 동시에 눌러도 먼저 누른 사람이 이겨요. (키보드: 1번 Q/W, 2번 O/P, 3번 Z/X, 4번 N/M)</li>
    <li>🤖 <b>봇과 연습</b>: 쉬움·보통·어려움 (키보드: 스페이스=종, 엔터=뒤집기)</li>
    <li>🌐 <b>온라인 방</b>: 각자 폰으로. ${NET_NOTE}</li>
    <li>🪑 <b>오프라인 테이블</b>: 각자 폰에서 카드를 뒤집고, 📺 테이블 화면(TV·패드)에 모두의 공개 카드가 크게 떠요. 종은 실물 종이나 손바닥으로!</li>
  </ul>`;

let view;
let lobby;
let game;
let tutorial = null;

const shell = createShell({
  prefix: 'lunchfive:',
  title: '🍱 급식 다섯! 🔔',
  kicker: '점심시간 반응 속도 대결',
  titleHtml: '급식<br />다섯!',
  sub: '같은 메뉴가 딱 5개? 누구보다 빨리 땡!',
  startLabel: '식판 들기',
  loadingText: '배식 준비 중…',
  menu: [
    { go: 'hotseat', label: '👥 한 기기 파티 모드', small: '패드 하나에 2~4명 둘러앉기 · 추천!', primary: true },
    { go: 'practice', label: '🤖 봇과 연습', small: '쉬움 · 보통 · 어려움' },
    { go: 'online', label: '🌐 온라인 방', small: '각자 폰으로 · 🪑 오프라인 테이블 모드도 여기서' },
  ],
  rulesHtml: '<div id="lf-rules"></div>',
  audio,
  handlers: {
    hotseat: () => hotseat(),
    practice: () => practice(),
    online: () => lobby.open(),
    room: (code) => lobby.open(code),
    watch: (code) => lobby.watch(code).catch((err) => ui.toast(err.message, 3000)),
    tutorial: () => runTutorial(),
    pause: () => pause(),
    quality: (q) => view.setQuality(q),
  },
});

function decorate() {
  // 타이틀 화면용: 테이블에 카드 몇 장
  const deck = shuffle(makeDeck());
  view.setLayout(4, { me: 0 });
  view.sync({ piles: [12, 9, 14, 7], open: [0, 1, 2, 3].map((i) => ({ top: deck[i], count: 3 })), out: [] });
}

async function boot() {
  if (new URLSearchParams(location.search).has('test')) {
    const r = runSelfTests();
    setTimeout(() => ui.toast(`자가 테스트 ${r.passed}/${r.total} 통과`, 4000), 1500);
  }
  await ensureFonts();
  $('#lf-rules').innerHTML = rulesHtml();
  view = new LunchStage(document.getElementById('stage'));
  view.setQuality(shell.quality());
  decorate();
  view.setTitleMode(true);
  lobby = new Lobby({
    game: 'lunch-five',
    title: '급식 다섯!',
    audio,
    offline: true,
    onGameState: (s, first) => game.onState(s, first),
    onLeaveGame: () => toMenu(),
    onBack: () => toMenu(),
  });
  // 온라인 방·대기방에 지연 안내
  const note = `<p class="note lf-net">📶 ${NET_NOTE}</p>`;
  $('#screen-online .sheet-head')?.insertAdjacentHTML('afterend', note);
  $('#lobby-mode')?.insertAdjacentHTML('afterend', note);
  game = new LunchGame(view, lobby, shell, audio);
  game.onMenu = () => toMenu();
  window['__lunch-five'] = window.__lunchFive = { stage: view, view, lobby, game, shell };
  shell.ready();
}

function toMenu() {
  lobby.leave();
  game.exit();
  if (tutorial) {
    const t = tutorial;
    tutorial = null;
    t.finish(true);
  }
  decorate();
  view.setTitleMode(true);
  shell.showMenu();
}

async function hotseat() {
  const saved = shell.store.load('names', null) || ['친구 1', '친구 2', '', ''];
  const v = await ui.modal({
    title: '👥 한 기기 파티 모드',
    html: `<p class="note">패드를 테이블 가운데 놓고 둘러앉아요. 1번은 아래, 2번은 위, 3번은 왼쪽, 4번은 오른쪽! 이름을 비우면 빠져요.</p>
      <div class="names-list lf-names">${[0, 1, 2, 3]
        .map((i) => `<label><span>${['⬇️', '⬆️', '⬅️', '➡️'][i]} ${i + 1}번</span><input id="lf-name${i}" maxlength="8" autocomplete="off" value="${ui.esc(saved[i] || '')}" placeholder="${i < 2 ? '이름 (필수)' : '비우면 빠짐'}" /></label>`)
        .join('')}</div>
      <fieldset class="field"><legend>봇 섞기</legend><div class="seg">
        ${[0, 1, 2].map((n) => `<label><input type="radio" name="lf-bots" value="${n}" ${n === 0 ? 'checked' : ''}/><span>${n ? `🤖 ${n}` : '없음'}</span></label>`).join('')}
      </div></fieldset>
      <fieldset class="field"><legend>봇 난이도</legend><div class="seg">
        ${['easy', 'normal', 'hard'].map((d) => `<label><input type="radio" name="lf-diff" value="${d}" ${d === 'normal' ? 'checked' : ''}/><span>${{ easy: '쉬움', normal: '보통', hard: '어려움' }[d]}</span></label>`).join('')}
      </div></fieldset>`,
    buttons: [
      { label: '취소', value: null },
      { label: '🍱 시작!', value: 'go', primary: true },
    ],
  });
  if (v !== 'go') return;
  const raw = [0, 1, 2, 3].map((i) => ($(`#lf-name${i}`).value || '').trim());
  const names = raw.filter(Boolean);
  if (names.length < 2) {
    audio.error();
    ui.toast('사람이 2명 이상 있어야 해요. 이름을 적어 주세요.', 2400);
    return hotseat();
  }
  shell.store.save('names', raw);
  const bots = Number(document.querySelector('input[name="lf-bots"]:checked')?.value || 0);
  const difficulty = document.querySelector('input[name="lf-diff"]:checked')?.value || 'normal';
  try {
    await lobby.hotseat(names, { bots, difficulty });
  } catch (err) {
    audio.error();
    ui.toast(err.message, 2600);
  }
}

async function practice() {
  const difficulty = await ui.modal({
    title: '🤖 봇 난이도',
    html: '<p>봇은 5를 보면 종을 쳐요. 쉬움 봇은 느리고 가끔 실수도 해요.</p>',
    buttons: [
      { label: '쉬움', value: 'easy' },
      { label: '보통', value: 'normal', primary: true },
      { label: '어려움', value: 'hard' },
      { label: '취소', value: null },
    ],
  });
  if (!difficulty) return;
  const bots = await ui.modal({
    title: '봇 몇 명이랑 할까요?',
    html: '<p class="note">많을수록 테이블이 북적북적!</p>',
    buttons: [1, 2, 3, 4, 5].map((n) => ({ label: `🤖 ${n}`, value: n, primary: n === 3 })),
  });
  if (!bots) return;
  try {
    await lobby.practice(common.load('nick', '') || '나', bots, difficulty);
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

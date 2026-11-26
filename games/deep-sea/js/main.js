// 심해 보물섬 탐험대 — 초기화와 화면 전환
import { SeaStage } from './scene.js';
import { ensureFonts, cardImage } from './cards.js';
import { audio } from './audio.js';
import { DeepSeaGame } from './game.js';
import { Tutorial } from './tutorial.js';
import { runSelfTests, CARD_NAME } from './rules.js';
import { Lobby } from '../../../shared/lobby.js';
import { createStore, common } from '../../../shared/storage.js';
import { onlineReady } from '../../../shared/net.js';
import * as ui from '../../../shared/ui-core.js';

const $ = ui.$;
const store = createStore('deepsea:');
let settings = store.loadSettings();
let stage;
let lobby;
let game;
let controller = null; // 카드 클릭·뒤집기·말풍선을 받는 쪽: game 또는 tutorial
let backTo = 'screen-menu';

async function boot() {
  if (new URLSearchParams(location.search).has('test')) {
    const r = runSelfTests();
    setTimeout(() => ui.toast(`자가 테스트 ${r.passed}/${r.total} 통과 (콘솔 확인)`, 4000), 1500);
  }
  audio.apply(settings);
  await ensureFonts();
  stage = new SeaStage($('#stage'));
  if (settings.quality === 'auto') settings.quality = detectQuality();
  stage.setQuality(settings.quality);
  stage.onCardClick = (seat, index) => controller?.onCardClick(seat, index);

  lobby = new Lobby({
    game: 'deep-sea',
    title: '심해 보물섬 탐험대',
    audio,
    onGameState: (s, first) => game.onState(s, first),
    onLeaveGame: () => game.exit(),
    onBack: () => goMenu(),
  });
  game = new DeepSeaGame(stage, lobby, {
    onEnter: () => (controller = game),
    onExit: () => goMenu(),
  });
  window.__deepSea = { stage, lobby, game }; // 디버깅용

  bindUi();
  ui.bindClickSounds(() => audio.click());
  $('#rules-body').innerHTML = rulesHtml();
  stage.setTitleMode(true);
  ui.showScreen('screen-title');
}

function detectQuality() {
  const cores = navigator.hardwareConcurrency || 4;
  return cores <= 4 || matchMedia('(pointer: coarse)').matches ? 'low' : 'high';
}

function goMenu() {
  lobby.leave();
  game.exit();
  controller = null;
  ui.closeModal();
  $('#hud').hidden = true;
  stage.setTitleMode(true);
  ui.showScreen('screen-menu');
}

async function enterFromTitle() {
  audio.unlock();
  audio.startBgm();
  const room = new URLSearchParams(location.search).get('room');
  if (room && /^[0-9]{4}$/.test(room)) return lobby.open(room);
  ui.showScreen('screen-menu');
  if (!store.load('tutorialDone', false)) {
    const go = await ui.modal({
      title: '처음 오셨네요!',
      html: '<p>튜토리얼을 볼까요? 2분이면 규칙을 다 익힐 수 있어요.</p><p class="note">언제든 건너뛸 수 있고, 메뉴에서 다시 볼 수 있어요.</p>',
      buttons: [
        { label: '건너뛰기', value: false },
        { label: '튜토리얼 시작', value: true, primary: true },
      ],
    });
    if (go) startTutorial();
    else store.save('tutorialDone', true);
  }
}

function startTutorial() {
  ui.showScreen(null);
  const tut = new Tutorial(stage, store, () => {
    controller = null;
    stage.setTitleMode(true);
    ui.showScreen('screen-menu');
  });
  controller = tut;
  tut.start();
}

async function startPractice() {
  if (!onlineReady()) return ui.toast('연습 모드도 온라인 서버가 필요해요. README의 설정을 확인해 주세요.', 3000);
  const nick = common.load('nick', '') || '나';
  ui.toast('봇들을 부르는 중…', 2500);
  try {
    await lobby.practice(nick, 3);
  } catch (err) {
    audio.error();
    ui.toast(err.message, 2600);
  }
}

async function pauseMenu() {
  const isTut = controller instanceof Tutorial;
  const choice = await ui.modal({
    title: '잠깐 멈춤',
    html: isTut ? '<p>튜토리얼을 그만둘까요?</p>' : '<p>방에서 나갈까요? 내 자리는 봇이 이어서 둬요.</p>',
    buttons: [
      { label: '메인으로 나가기', value: 'exit' },
      { label: '계속하기', value: 'resume', primary: true },
    ],
  });
  if (choice !== 'exit') return;
  if (isTut) controller.finish(true);
  else goMenu();
}

function rulesHtml() {
  const i = (k) => `<img src="${cardImage(k)}" alt="">`;
  return `
    <h3>목표</h3>
    <p>${i('crew')} <b>탐험대</b>는 보물을 모두 찾고, ${i('pirate')} <b>해적</b>은 대왕문어를 깨우거나 보물을 끝까지 숨겨요.</p>
    <h3>준비</h3>
    <ul>
      <li>4~6명. 역할: 4명·5명은 탐험대 3·해적 2 (4명은 역할 카드 1장이 아무도 모르게 빠짐), 6명은 탐험대 4·해적 2.</li>
      <li>방 카드는 사람 수 × 5장: ${i('treasure')} 보물(사람 수만큼), ${i('monster')} ${CARD_NAME.monster} 1장, 나머지 ${i('empty')} 빈 방.</li>
    </ul>
    <h3>진행 (최대 4라운드)</h3>
    <ul>
      <li>라운드마다 남은 카드를 섞어 똑같이 나눠요: 5 → 4 → 3 → 2장.</li>
      <li>내 카드 구성은 보이지만, 섞여서 어느 자리인지는 몰라요.</li>
      <li>자기 카드에 대해 말해요 (온라인은 빠른 말풍선). 해적은 거짓말을 해도 돼요.</li>
      <li>🔑 열쇠를 가진 사람이 다른 사람의 카드 1장을 뒤집어요. 뒤집힌 사람이 열쇠를 받아요.</li>
      <li>한 라운드에 사람 수만큼 뒤집으면 다음 라운드.</li>
    </ul>
    <h3>승리</h3>
    <ul>
      <li>보물을 모두 찾으면 탐험대 즉시 승리.</li>
      <li>대왕문어가 뒤집히면 해적 즉시 승리. 4라운드가 끝날 때까지 보물을 다 못 찾아도 해적 승리.</li>
    </ul>`;
}

// ---------- 설정 ----------
function syncSettings() {
  $('#vol-bgm').value = settings.bgm;
  $('#vol-sfx').value = settings.sfx;
  $('#out-bgm').textContent = `${Math.round(settings.bgm * 100)}%`;
  $('#out-sfx').textContent = `${Math.round(settings.sfx * 100)}%`;
  $('#chk-mute').checked = settings.muted;
  const q = document.querySelector(`input[name="quality"][value="${settings.quality}"]`);
  if (q) q.checked = true;
  $('#btn-sound').textContent = settings.muted ? '🔇' : '🔊';
}
function applySettings() {
  store.saveSettings(settings);
  audio.apply(settings);
  syncSettings();
}

function bindUi() {
  $('#btn-title-start').addEventListener('click', enterFromTitle);
  $('#screen-title').addEventListener('click', (e) => e.target.id !== 'btn-title-start' && enterFromTitle());
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

  document.querySelectorAll('[data-go]').forEach((b) =>
    b.addEventListener('click', () => {
      const go = b.dataset.go;
      if (go === 'online') lobby.open();
      else if (go === 'practice') startPractice();
      else if (go === 'tutorial') startTutorial();
      else if (go === 'settings') {
        syncSettings();
        ui.showScreen('screen-settings');
      } else if (go === 'rules') {
        backTo = 'screen-menu';
        ui.showScreen('screen-rules');
      } else if (go === 'back') {
        if (backTo === 'game') ui.showScreen(null);
        else ui.showScreen(backTo);
      } else if (go === 'menu') ui.showScreen('screen-menu');
    }),
  );

  $('#btn-pause').addEventListener('click', pauseMenu);
  $('#btn-help').addEventListener('click', () => {
    backTo = 'game';
    ui.showScreen('screen-rules');
  });
  $('#btn-sound').addEventListener('click', () => {
    settings.muted = !settings.muted;
    applySettings();
  });
  $('#btn-flip').addEventListener('click', () => controller?.flip());
  $('#log-toggle').addEventListener('click', () => {
    const open = $('#log-panel').classList.toggle('open');
    $('#log-toggle').setAttribute('aria-expanded', open);
  });
  $('#role-chip').addEventListener('click', () => {
    if (controller === game && game.state) game.showRole();
  });

  $('#tut-next').addEventListener('click', () => controller?.next?.());
  $('#tut-prev').addEventListener('click', () => controller?.prev?.());
  $('#tut-skip').addEventListener('click', () => controller?.finish?.(true));

  $('#vol-bgm').addEventListener('input', (e) => {
    settings.bgm = Number(e.target.value);
    applySettings();
  });
  $('#vol-sfx').addEventListener('input', (e) => {
    settings.sfx = Number(e.target.value);
    applySettings();
  });
  $('#chk-mute').addEventListener('change', (e) => {
    settings.muted = e.target.checked;
    applySettings();
  });
  document.querySelectorAll('input[name="quality"]').forEach((r) =>
    r.addEventListener('change', (e) => {
      settings.quality = e.target.value;
      applySettings();
      stage.setQuality(settings.quality);
    }),
  );
  $('#btn-reset-tutorial').addEventListener('click', () => {
    store.save('tutorialDone', false);
    ui.toast('다음에 시작할 때 튜토리얼 안내가 다시 떠요.');
  });
  syncSettings();
}

boot().catch((err) => {
  console.error(err);
  $('#loading').innerHTML = '<p class="loading-text">불러오기에 실패했어요. 인터넷 연결을 확인하고 새로고침해 주세요.</p>';
  $('#loading').classList.add('is-active');
});

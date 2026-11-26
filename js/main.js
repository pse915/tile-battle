// 초기화와 화면 전환
import { Stage } from './scene.js';
import { ensureFonts } from './tiles.js';
import { audio } from './audio.js';
import { Game } from './game.js';
import { Tutorial } from './tutorial.js';
import { runSelfTests } from './rules.js';
import { load, save, loadSettings, saveSettings } from './storage.js';
import * as ui from './ui.js';

const $ = ui.$;
const AI_CAST = [
  { name: '토끼 반장', emoji: '🐰' },
  { name: '곰 부장', emoji: '🐻' },
  { name: '여우 총무', emoji: '🦊' },
  { name: '펭귄 회장', emoji: '🐧' },
];
const HUMAN_EMOJI = ['🙂', '😎', '🤓', '😺', '🐥'];

let settings = loadSettings();
let stage;
let game;
let controller = null; // 지금 입력을 받는 쪽: game 또는 tutorial
let setupMode = 'solo';

async function boot() {
  if (new URLSearchParams(location.search).has('test')) {
    const r = runSelfTests();
    setTimeout(() => ui.toast(`족보 자가 테스트 ${r.passed}/${r.total} 통과 (콘솔 확인)`, 4000), 1500);
  }

  audio.apply(settings);
  await ensureFonts();
  stage = new Stage($('#stage'));
  if (settings.quality === 'auto') settings.quality = detectQuality();
  stage.setQuality(settings.quality);
  updateBottomInset();
  window.addEventListener('resize', updateBottomInset);

  game = new Game(stage, () => goMenu());
  window.__tileBattle = { stage, game }; // 디버깅용
  stage.onTileClick = (t) => controller?.onTileClick(t);

  bindUi();
  ui.bindClickSounds();
  $('#rules-body').innerHTML = ui.rulesHtml();
  $('#help-body').innerHTML = ui.helpHtml();

  stage.setTitleMode(true);
  ui.showScreen('screen-title');
}

function detectQuality() {
  const cores = navigator.hardwareConcurrency || 4;
  const coarse = matchMedia('(pointer: coarse)').matches;
  return cores <= 4 || coarse ? 'low' : 'high';
}

function updateBottomInset() {
  const bar = $('#action-bar');
  const h = bar && !$('#hud').hidden ? bar.getBoundingClientRect().height : 76;
  stage.bottomInsetPx = h + 36; // 액션 바 + '내 차례!' 표시 높이
}

// ---------- 화면 전환 ----------
function goMenu() {
  game.stop();
  controller = null;
  stage.setTitleMode(true);
  ui.closeModal();
  ui.showScreen('screen-menu');
}

async function enterMenuFromTitle() {
  audio.unlock();
  audio.startBgm();
  ui.showScreen('screen-menu');
  if (!load('tutorialDone', false)) {
    const go = await ui.modal({
      title: '처음 오셨네요!',
      html: '<p>튜토리얼을 볼까요? 2~3분이면 규칙을 다 익힐 수 있어요.</p><p class="note">언제든 건너뛸 수 있고, 메뉴에서 다시 볼 수 있어요.</p>',
      buttons: [
        { label: '건너뛰기', value: false },
        { label: '튜토리얼 시작', value: true, primary: true },
      ],
    });
    if (go) startTutorial();
    else save('tutorialDone', true);
  }
}

function startTutorial() {
  ui.showScreen(null);
  stage.setTitleMode(false);
  const tut = new Tutorial(stage, () => {
    controller = null;
    stage.setTitleMode(true);
    ui.showScreen('screen-menu');
  });
  controller = tut;
  ui.showHud(true);
  updateBottomInset();
  tut.start();
}

function openSetup(mode) {
  setupMode = mode;
  $('#setup-title').textContent = mode === 'solo' ? '혼자 하기' : '같이 하기 (한 기기)';
  $('#field-nick').hidden = mode !== 'solo';
  $('#field-diff').hidden = mode !== 'solo';
  $('#field-names').hidden = mode !== 'hot';
  $('#nick').value = load('nick', '나');
  const saved = load('setup', null);
  if (saved) {
    setRadio('count', saved.count);
    setRadio('diff', saved.diff);
    setRadio('rounds', saved.rounds);
  }
  renderNames();
  ui.showScreen('screen-setup');
}

function setRadio(name, value) {
  const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (el) el.checked = true;
}
const getRadio = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value;

function renderNames() {
  const count = Number(getRadio('count'));
  const names = load('hotNames', []);
  const list = $('#names-list');
  const prev = [...list.querySelectorAll('input')].map((i) => i.value);
  list.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const inp = document.createElement('input');
    inp.maxLength = 8;
    inp.autocomplete = 'off';
    inp.setAttribute('aria-label', `${i + 1}번 참가자 이름`);
    inp.value = prev[i] || names[i] || `친구 ${i + 1}`;
    list.appendChild(inp);
  }
}

async function startGame() {
  const count = Number(getRadio('count'));
  const diff = getRadio('diff');
  const rounds = Number(getRadio('rounds'));
  save('setup', { count, diff, rounds });
  let players;
  if (setupMode === 'solo') {
    const nick = ($('#nick').value || '').trim() || '나';
    save('nick', nick);
    players = [{ name: nick, emoji: '🙂', ai: false }];
    for (let i = 1; i < count; i++) players.push({ ...AI_CAST[i - 1], ai: true, difficulty: diff });
  } else {
    const names = [...$('#names-list').querySelectorAll('input')].map((inp, i) => (inp.value || '').trim() || `친구 ${i + 1}`);
    save('hotNames', names);
    players = names.map((name, i) => ({ name, emoji: HUMAN_EMOJI[i], ai: false }));
  }
  ui.showScreen(null);
  stage.setTitleMode(false);
  controller = game;
  ui.showHud(true);
  updateBottomInset();
  await game.start({ mode: setupMode, players, rounds });
}

async function pauseMenu() {
  const isTut = controller && controller !== game;
  const choice = await ui.modal({
    title: '잠깐 멈춤',
    html: isTut ? '<p>튜토리얼을 그만둘까요?</p>' : '<p>게임을 계속할까요? 나가면 이번 게임 기록은 사라져요.</p>',
    buttons: [
      { label: '메인으로 나가기', value: 'exit' },
      { label: '계속하기', value: 'resume', primary: true },
    ],
  });
  if (choice !== 'exit') return;
  if (isTut) controller.finish(true);
  else goMenu();
}

// ---------- 설정 ----------
function syncSettingsForm() {
  $('#vol-bgm').value = settings.bgm;
  $('#vol-sfx').value = settings.sfx;
  $('#out-bgm').textContent = `${Math.round(settings.bgm * 100)}%`;
  $('#out-sfx').textContent = `${Math.round(settings.sfx * 100)}%`;
  $('#chk-mute').checked = settings.muted;
  setRadio('quality', settings.quality);
  $('#btn-sound').textContent = settings.muted ? '🔇' : '🔊';
}

function applySettings() {
  saveSettings(settings);
  audio.apply(settings);
  syncSettingsForm();
}

// ---------- 이벤트 연결 ----------
function bindUi() {
  $('#btn-title-start').addEventListener('click', enterMenuFromTitle);
  // 타이틀은 아무 곳이나 눌러도 시작
  $('#screen-title').addEventListener('click', (e) => {
    if (e.target.id !== 'btn-title-start') enterMenuFromTitle();
  });
  // 첫 입력에 오디오 잠금 해제
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });

  document.querySelectorAll('[data-go]').forEach((b) =>
    b.addEventListener('click', () => {
      const go = b.dataset.go;
      if (go === 'solo' || go === 'hot') openSetup(go);
      else if (go === 'tutorial') startTutorial();
      else if (go === 'settings') {
        syncSettingsForm();
        ui.showScreen('screen-settings');
      } else if (go === 'rules') ui.showScreen('screen-rules');
      else if (go === 'menu') ui.showScreen('screen-menu');
    }),
  );

  document.querySelectorAll('input[name="count"]').forEach((r) => r.addEventListener('change', renderNames));
  $('#btn-start-game').addEventListener('click', startGame);

  // HUD
  $('#btn-play').addEventListener('click', () => controller?.handlePlay());
  $('#btn-pass').addEventListener('click', () => controller?.handlePass());
  $('#btn-hint').addEventListener('click', () => controller?.handleHint());
  $('#btn-sort').addEventListener('click', () => controller?.toggleSort());
  $('#btn-pause').addEventListener('click', pauseMenu);
  $('#btn-help').addEventListener('click', () => ($('#help-panel').hidden = !$('#help-panel').hidden));
  $('#btn-help-close').addEventListener('click', () => ($('#help-panel').hidden = true));
  $('#btn-sound').addEventListener('click', () => {
    settings.muted = !settings.muted;
    applySettings();
    ui.toast(settings.muted ? '소리를 껐어요' : '소리를 켰어요');
  });

  // 키보드: Enter 내기, P 패스, H 힌트
  window.addEventListener('keydown', (e) => {
    // 버튼에 포커스가 있을 때 Enter는 그 버튼을 누르는 것이므로 단축키로 쓰지 않음
    if ($('#hud').hidden || !$('#modal').hidden || ['INPUT', 'BUTTON'].includes(e.target.tagName)) return;
    if (e.key === 'Enter') controller?.handlePlay();
    else if (e.key.toLowerCase() === 'p') controller?.handlePass();
    else if (e.key.toLowerCase() === 'h') controller?.handleHint();
    else if (e.key === 'Escape') $('#help-panel').hidden = true;
  });

  // 튜토리얼 버튼
  $('#tut-next').addEventListener('click', () => controller?.next?.());
  $('#tut-prev').addEventListener('click', () => controller?.prev?.());
  $('#tut-skip').addEventListener('click', () => controller?.finish?.(true));

  // 설정
  $('#vol-bgm').addEventListener('input', (e) => {
    settings.bgm = Number(e.target.value);
    applySettings();
  });
  $('#vol-sfx').addEventListener('input', (e) => {
    settings.sfx = Number(e.target.value);
    applySettings();
  });
  $('#vol-sfx').addEventListener('change', () => audio.place());
  $('#chk-mute').addEventListener('change', (e) => {
    settings.muted = e.target.checked;
    applySettings();
  });
  document.querySelectorAll('input[name="quality"]').forEach((r) =>
    r.addEventListener('change', (e) => {
      settings.quality = e.target.value;
      applySettings();
      stage.setQuality(settings.quality);
      ui.toast(settings.quality === 'high' ? '그래픽: 높음' : '그래픽: 낮음 (그림자·안티앨리어싱 끔)');
    }),
  );
  $('#btn-reset-tutorial').addEventListener('click', () => {
    save('tutorialDone', false);
    ui.toast('다음에 시작할 때 튜토리얼 안내가 다시 떠요.');
  });

  syncSettingsForm();
}

boot().catch((err) => {
  console.error(err);
  $('#loading').innerHTML = '<p class="loading-text">불러오기에 실패했어요. 인터넷 연결을 확인하고 새로고침해 주세요.</p>';
  $('#loading').classList.add('is-active');
});

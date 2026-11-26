// 새 게임용 공용 껍데기: 로딩·타이틀·메뉴·설정·규칙·HUD·튜토리얼·모달 화면을 한 번에 만들고
// 설정 저장, 소리 켜고 끄기, 첫 방문 튜토리얼 안내, 초대 링크(?room=) / 테이블 화면(?view=table) 진입을 맡음.
// 게임은 handlers로 메뉴 버튼(data-go)에 할 일만 넘기면 됨.
import * as ui from './ui-core.js';
import { createStore } from './storage.js';

const $ = ui.$;

/**
 * @param {object} cfg
 * @param {string} cfg.prefix           저장소 접두어 ('colorrush:')
 * @param {string} cfg.title            게임 이름
 * @param {string} cfg.kicker           타이틀 위 작은 글씨
 * @param {string} cfg.titleHtml        타이틀 큰 글씨 (줄바꿈 <br> 가능)
 * @param {string} cfg.sub              타이틀 아래 한 줄
 * @param {string} cfg.startLabel       시작 버튼 글씨
 * @param {string} cfg.loadingText
 * @param {Array<{go:string,label:string,small?:string,primary?:boolean}>} cfg.menu  메뉴 큰 버튼
 * @param {string} cfg.rulesHtml
 * @param {object} cfg.audio            AudioCore 상속 객체
 * @param {object} cfg.handlers         { [go]: () => void, tutorial, room(code), watch(code), pause() }
 */
export function createShell(cfg) {
  const store = createStore(cfg.prefix);
  const settings = store.loadSettings();
  const audio = cfg.audio;
  const h = cfg.handlers;
  let backTo = 'screen-menu';

  document.body.insertAdjacentHTML(
    'afterbegin',
    `
  <div id="stage"></div>
  <div id="labels" aria-hidden="true"></div>
  <canvas id="confetti" aria-hidden="true"></canvas>
  <div id="loading" class="screen is-active"><p class="loading-text">${cfg.loadingText || '준비하는 중…'}</p></div>
  <section id="screen-title" class="screen" aria-label="타이틀">
    <div class="title-wrap">
      <p class="title-kicker">${cfg.kicker}</p>
      <h1 class="title">${cfg.titleHtml}</h1>
      <p class="title-sub">${cfg.sub}</p>
      <button class="btn primary big" id="btn-title-start">${cfg.startLabel || '시작하기'}</button>
    </div>
  </section>
  <section id="screen-menu" class="screen" aria-label="메인 메뉴">
    <div class="sheet menu-sheet">
      <header class="sheet-head">${cfg.title}</header>
      <div class="menu-list">
        ${cfg.menu.map((m) => `<button class="btn${m.primary ? ' primary' : ''}${m.small ? ' big' : ''}" data-go="${m.go}">${m.label}${m.small ? `<small>${m.small}</small>` : ''}</button>`).join('')}
        <button class="btn" data-go="tutorial">🎓 튜토리얼 다시 보기</button>
        <div class="menu-row">
          <button class="btn" data-go="rules">📜 규칙</button>
          <button class="btn" data-go="settings">⚙️ 설정</button>
        </div>
        <a class="btn" href="../../">🏠 다른 게임 고르기</a>
      </div>
    </div>
  </section>
  <section id="screen-settings" class="screen" aria-label="설정">
    <div class="sheet">
      <header class="sheet-head">설정</header>
      <div class="field"><label for="vol-bgm">배경음 <output id="out-bgm"></output></label><input type="range" id="vol-bgm" min="0" max="1" step="0.05" /></div>
      <div class="field"><label for="vol-sfx">효과음 <output id="out-sfx"></output></label><input type="range" id="vol-sfx" min="0" max="1" step="0.05" /></div>
      <label class="check"><input type="checkbox" id="chk-mute" /> 모든 소리 끄기</label>
      <fieldset class="field">
        <legend>그래픽 품질</legend>
        <div class="seg">
          <label><input type="radio" name="quality" value="high" /><span>높음</span></label>
          <label><input type="radio" name="quality" value="low" /><span>낮음 (느린 기기)</span></label>
        </div>
      </fieldset>
      <div class="sheet-actions">
        <button class="btn" id="btn-reset-tutorial">튜토리얼 안내 다시 띄우기</button>
        <button class="btn primary" data-go="menu">완료</button>
      </div>
    </div>
  </section>
  <section id="screen-rules" class="screen" aria-label="규칙">
    <div class="sheet rules-sheet">
      <header class="sheet-head">규칙 한눈에 보기</header>
      <div class="rules-body">${cfg.rulesHtml}</div>
      <div class="sheet-actions"><button class="btn primary" data-go="back">닫기</button></div>
    </div>
  </section>
  <div id="hud" hidden>
    <div class="hud-top">
      <button class="icon-btn" id="btn-pause" aria-label="메뉴">☰</button>
      <div class="hud-info">
        <div class="hud-round" id="hud-round"></div>
        <div class="hud-table" id="hud-table"></div>
      </div>
      <button class="icon-btn" id="btn-sound" aria-label="소리 켜기/끄기">🔊</button>
      <button class="icon-btn" id="btn-help" aria-label="규칙">?</button>
    </div>
    <div id="hud-body"></div>
  </div>
  <div id="tutorial-layer" hidden>
    <div class="tut-spot is-none" id="tut-spot"></div>
    <div class="tut-bubble" id="tut-bubble" role="dialog" aria-live="polite">
      <div class="tut-progress" id="tut-progress"></div>
      <h2 id="tut-title"></h2>
      <div id="tut-body"></div>
      <div class="tut-actions">
        <button class="btn small" id="tut-skip">튜토리얼 건너뛰기</button>
        <span class="spacer"></span>
        <button class="btn small" id="tut-prev">이전</button>
        <button class="btn small primary" id="tut-next">다음</button>
      </div>
    </div>
  </div>
  <div id="modal" class="modal" hidden>
    <div class="sheet modal-sheet" role="dialog" aria-modal="true">
      <header class="sheet-head" id="modal-title"></header>
      <div id="modal-body"></div>
      <div class="sheet-actions" id="modal-actions"></div>
    </div>
  </div>
  <div id="banner" class="banner" aria-live="polite"></div>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>`,
  );

  const shell = {
    store,
    settings,
    tutorialActive: false,
    /** 게임 HUD 보이기 (메뉴 화면 닫기) */
    enterHud() {
      ui.closeModal();
      ui.showScreen(null);
      $('#hud').hidden = false;
    },
    exitHud() {
      $('#hud').hidden = true;
      $('#hud-body').innerHTML = '';
      $('#hud-round').textContent = '';
      $('#hud-table').textContent = '';
      $('#labels').innerHTML = '';
    },
    showMenu() {
      ui.closeModal();
      shell.exitHud();
      ui.showScreen('screen-menu');
    },
    applySettings() {
      store.saveSettings(settings);
      audio.apply(settings);
      sync();
    },
    ready() {
      ui.showScreen('screen-title');
    },
    quality() {
      if (settings.quality === 'auto') {
        const cores = navigator.hardwareConcurrency || 4;
        settings.quality = cores <= 4 || matchMedia('(pointer: coarse)').matches ? 'low' : 'high';
      }
      return settings.quality;
    },
  };

  function sync() {
    $('#vol-bgm').value = settings.bgm;
    $('#vol-sfx').value = settings.sfx;
    $('#out-bgm').textContent = `${Math.round(settings.bgm * 100)}%`;
    $('#out-sfx').textContent = `${Math.round(settings.sfx * 100)}%`;
    $('#chk-mute').checked = settings.muted;
    const q = document.querySelector(`input[name="quality"][value="${settings.quality}"]`);
    if (q) q.checked = true;
    $('#btn-sound').textContent = settings.muted ? '🔇' : '🔊';
  }

  async function enterFromTitle() {
    audio.unlock();
    audio.startBgm();
    const q = new URLSearchParams(location.search);
    const room = q.get('room');
    if (room && /^[0-9]{4}$/.test(room)) {
      if (q.get('view') === 'table' && h.watch) return h.watch(room);
      return h.room(room);
    }
    ui.showScreen('screen-menu');
    if (!store.load('tutorialDone', false)) {
      const go = await ui.modal({
        title: '처음 오셨네요!',
        html: '<p>튜토리얼을 볼까요? 1~2분이면 규칙을 익힐 수 있어요.</p><p class="note">언제든 건너뛸 수 있고, 메뉴에서 다시 볼 수 있어요.</p>',
        buttons: [
          { label: '건너뛰기', value: false },
          { label: '튜토리얼 시작', value: true, primary: true },
        ],
      });
      if (go) h.tutorial();
      else store.save('tutorialDone', true);
    }
  }

  $('#btn-title-start').addEventListener('click', enterFromTitle);
  $('#screen-title').addEventListener('click', (e) => e.target.id !== 'btn-title-start' && enterFromTitle());
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  ui.bindClickSounds(() => audio.click());

  document.querySelectorAll('[data-go]').forEach((b) =>
    b.addEventListener('click', () => {
      const go = b.dataset.go;
      if (go === 'settings') {
        sync();
        ui.showScreen('screen-settings');
      } else if (go === 'rules') {
        backTo = 'screen-menu';
        ui.showScreen('screen-rules');
      } else if (go === 'back') ui.showScreen(backTo === 'game' ? null : backTo);
      else if (go === 'menu') ui.showScreen('screen-menu');
      else h[go]?.();
    }),
  );
  $('#btn-pause').addEventListener('click', () => h.pause?.());
  $('#btn-help').addEventListener('click', () => {
    backTo = 'game';
    ui.showScreen('screen-rules');
  });
  $('#btn-sound').addEventListener('click', () => {
    settings.muted = !settings.muted;
    shell.applySettings();
  });
  $('#vol-bgm').addEventListener('input', (e) => {
    settings.bgm = Number(e.target.value);
    shell.applySettings();
  });
  $('#vol-sfx').addEventListener('input', (e) => {
    settings.sfx = Number(e.target.value);
    shell.applySettings();
  });
  $('#chk-mute').addEventListener('change', (e) => {
    settings.muted = e.target.checked;
    shell.applySettings();
  });
  document.querySelectorAll('input[name="quality"]').forEach((r) =>
    r.addEventListener('change', (e) => {
      settings.quality = e.target.value;
      shell.applySettings();
      h.quality?.(settings.quality);
    }),
  );
  $('#btn-reset-tutorial').addEventListener('click', () => {
    store.save('tutorialDone', false);
    ui.toast('다음에 시작할 때 튜토리얼 안내가 다시 떠요.');
  });
  audio.apply(settings);
  sync();
  return shell;
}

/** 실패 화면 */
export function bootFailed(err) {
  console.error(err);
  const l = document.getElementById('loading');
  if (!l) return;
  l.innerHTML = '<p class="loading-text">불러오기에 실패했어요. 인터넷 연결을 확인하고 새로고침해 주세요.</p>';
  l.classList.add('is-active');
}

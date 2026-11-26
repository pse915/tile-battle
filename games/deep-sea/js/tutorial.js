// 심해 보물섬 탐험대 — 5단계 인터랙티브 튜토리얼 (서버 없이 실제 3D 테이블에서)
import { SAYINGS, CARD_NAME } from './rules.js';
import { cardImage } from './cards.js';
import { wait } from '../../../shared/anim.js';
import { audio } from './audio.js';
import * as ui from '../../../shared/ui-core.js';
import { buildLabels, clearLabels, updateLabel, seatBubble, positionLabels } from './labels.js';
import { renderSayBar, myCardsHtml, roleChipHtml } from './game.js';

const $ = ui.$;
const img = (k) => `<img src="${cardImage(k)}" alt="" style="width:22px;vertical-align:-6px;border-radius:3px">`;
const PLAYERS = [
  { name: '나', emoji: '🙂' },
  { name: '갈매기', emoji: '🐦' },
  { name: '거북이', emoji: '🐢' },
  { name: '물개', emoji: '🦭' },
];

export class Tutorial {
  constructor(stage, store, onDone) {
    this.stage = stage;
    this.store = store;
    this.onDone = onDone;
    this.token = 0;
    this.steps = this.buildSteps();
  }

  start() {
    this.active = true;
    this.stage.setTitleMode(false);
    this.stage.setSeats(4, 0);
    buildLabels(PLAYERS, 0);
    $('#hud').hidden = false;
    $('#tutorial-layer').hidden = false;
    $('#log-list').innerHTML = '';
    $('#hud-round').textContent = '튜토리얼';
    $('#hud-table').innerHTML = '';
    $('#role-chip').innerHTML = roleChipHtml('crew');
    $('#role-chip').className = 'role-chip crew';
    $('#my-cards').innerHTML = myCardsHtml({ treasure: 1, empty: 4, monster: 0, total: 5 });
    $('#turn-flag').hidden = true;
    $('#btn-flip').hidden = true;
    renderSayBar((k) => this.onSay(k));
    this.unsub = this.stage.onFrame(() => positionLabels(this.stage));
    this.go(0);
  }

  finish(skipped) {
    if (!this.active) return;
    this.active = false;
    this.token++;
    this.store.save('tutorialDone', true);
    this.unsub?.();
    this.stage.clickable = false;
    this.stage.clearShowcase();
    this.stage.clearRevealed();
    this.stage.setKey(null);
    this.stage.setSeats(0, 0);
    clearLabels();
    $('#hud').hidden = true;
    $('#tutorial-layer').hidden = true;
    if (skipped) ui.toast('튜토리얼은 메뉴에서 언제든 다시 볼 수 있어요.', 2400);
    this.onDone();
  }

  async go(idx) {
    const token = ++this.token;
    this.idx = idx;
    const step = this.steps[idx];
    this.done = !step.interactive;
    this.stage.clearShowcase();
    this.stage.clearRevealed();
    this.stage.clickable = false;
    this.stage.select(null);
    $('#btn-flip').hidden = true;
    $('#turn-flag').hidden = true;
    this.handler = {};
    [0, 1, 2, 3].forEach((i) => this.stage.setRowCount(i, 5));
    this.stage.setKey(0, true);
    PLAYERS.forEach((_, i) => updateLabel(i, { count: 5, key: i === 0 }));
    $('#tut-progress').textContent = `${idx + 1}/${this.steps.length}`;
    $('#tut-title').textContent = step.title;
    $('#tut-prev').disabled = idx === 0;
    $('#tut-prev').classList.toggle('is-off', idx === 0);
    $('#tut-next').textContent = idx === this.steps.length - 1 ? '튜토리얼 끝내기' : '다음';
    this.refreshNext();
    this.spot(null);
    await step.setup(token);
  }

  next() {
    if (!this.done) {
      audio.error();
      return ui.toast('먼저 안내대로 직접 해 보세요! (건너뛰기도 할 수 있어요)');
    }
    if (this.idx >= this.steps.length - 1) this.finish(false);
    else this.go(this.idx + 1);
  }
  prev() {
    if (this.idx > 0) this.go(this.idx - 1);
  }
  refreshNext() {
    $('#tut-next').classList.toggle('is-off', !this.done);
  }
  complete() {
    this.done = true;
    this.refreshNext();
    audio.yourTurn();
  }
  text(html) {
    $('#tut-body').innerHTML = html;
  }

  spot(sel) {
    const el = $('#tut-spot');
    if (!sel) {
      el.className = 'tut-spot is-none';
      Object.assign(el.style, { left: '50%', top: '50%', width: '0px', height: '0px' });
      return;
    }
    const b = $(sel).getBoundingClientRect();
    el.className = 'tut-spot';
    Object.assign(el.style, { left: `${b.left - 8}px`, top: `${b.top - 8}px`, width: `${b.width + 16}px`, height: `${b.height + 16}px` });
  }

  // main.js에서 연결
  onCardClick(seat, index) {
    if (this.handler.card) this.handler.card(seat, index);
  }
  onSay(k) {
    if (this.handler.say) this.handler.say(k);
    else ui.toast('이 단계에서는 안내를 먼저 읽어 보세요.');
  }
  flip() {
    if (this.handler.flip) this.handler.flip();
  }

  buildSteps() {
    return [
      {
        title: '비밀 역할',
        interactive: false,
        setup: async () => {
          this.stage.showcase(['crew', 'pirate'], { scale: 1.25 });
          this.text(`<p>게임을 시작하면 모두 비밀 역할을 받아요. 내 역할은 <b>나만</b> 볼 수 있어요.</p>
            <p>${img('crew')} <b>탐험대</b>: 보물을 모두 찾으면 승리<br>${img('pirate')} <b>해적</b>: 대왕문어를 깨우거나 4라운드 동안 보물을 숨기면 승리</p>
            <p class="note">4~5명은 해적 2명, 6명은 해적 2명·탐험대 4명. 누가 해적인지 말로 알아내야 해요!</p>`);
          this.spot('#role-chip');
        },
      },
      {
        title: '방 카드',
        interactive: false,
        setup: async () => {
          this.stage.showcase(['treasure', 'empty', 'monster'], { scale: 1.15 });
          this.text(`<p>방 카드는 세 종류예요: ${img('treasure')} 보물, ${img('empty')} 빈 방, ${img('monster')} 심해 대왕문어.</p>
            <p>4명이면 보물 4장, 문어 1장, 빈 방 15장을 5장씩 나눠요. 라운드마다 장수가 5 → 4 → 3 → 2장으로 줄어요.</p>
            <p>왼쪽 위 <b>내 카드</b>에서 내가 받은 구성을 볼 수 있어요. 하지만 카드가 섞여서 <b>어느 자리인지는 몰라요.</b></p>`);
          this.spot('#me-panel');
        },
      },
      {
        title: '열쇠로 뒤집기',
        interactive: true,
        setup: async (token) => {
          this.text(`<p>🔑 <b>열쇠</b>를 가진 사람이 다른 사람의 카드 1장을 골라 뒤집어요. 자기 카드는 못 골라요.</p>
            <p>지금 열쇠는 나에게 있어요. <b>다른 사람 앞의 카드를 눌러 고른 뒤</b> [뒤집기]를 누르세요.</p>`);
          $('#turn-flag').hidden = false;
          this.stage.clickable = true;
          this.handler = {
            card: (seat, index) => {
              if (seat === 0) return ui.toast('자기 카드는 뒤집을 수 없어요.');
              this.stage.select({ seat, index });
              audio.pick();
              $('#btn-flip').hidden = false;
              $('#btn-flip').textContent = `${PLAYERS[seat].name}의 카드 뒤집기`;
              this.spot('#btn-flip');
            },
            flip: async () => {
              const sel = this.stage.selected;
              if (!sel) return;
              this.handler = {};
              this.stage.select(null);
              this.stage.clickable = false;
              $('#btn-flip').hidden = true;
              $('#turn-flag').hidden = true;
              this.spot(null);
              audio.flip();
              const m = await this.stage.flipCard(sel.seat, sel.index, 'treasure', 0, 1);
              if (token !== this.token) return;
              this.stage.sparkle(m.position.clone());
              audio.treasure();
              updateLabel(sel.seat, { count: 4, key: true });
              updateLabel(0, { count: 5, key: false });
              audio.key();
              await this.stage.setKey(sel.seat);
              if (token !== this.token) return;
              this.text(`<p class="tut-ok">보물 발견! ✔</p><p>카드를 뒤집힌 <b>${PLAYERS[sel.seat].name}</b>이(가) 열쇠를 받아 다음에 뒤집어요. 한 라운드에 사람 수만큼 뒤집으면 남은 카드를 섞어 다시 나눠요.</p>`);
              this.complete();
            },
          };
        },
      },
      {
        title: '말풍선으로 말하기',
        interactive: false,
        setup: async (token) => {
          this.text(`<p>내 카드에 대해 말해서 서로 믿을 사람을 찾아요. 교실에서는 말로 해도 되고, 온라인에서는 아래 <b>빠른 말풍선</b>을 눌러요.</p>
            <p>하나 눌러 보세요! 해적은 거짓말을 할 수도 있어요.</p>
            <p class="note">‘너 수상해’는 의심 가는 사람의 카드를 먼저 누른 뒤 보내면 그 사람에게 말해요. 말풍선 기록은 오른쪽 📜 기록에 남아요.</p>`);
          this.spot('#say-bar');
          this.handler = {
            say: async (k) => {
              audio.say();
              seatBubble(0, SAYINGS[k]);
              $('#log-list').insertAdjacentHTML('beforeend', `<li>🙂 <b>나</b>: “${SAYINGS[k]}”</li>`);
              await wait(0.9);
              if (token !== this.token) return;
              seatBubble(2, SAYINGS.m0);
              updateLabel(2, { count: 5, claim: { monster: false } });
              $('#log-list').insertAdjacentHTML('beforeend', `<li>🐢 <b>거북이</b>: “${SAYINGS.m0}”</li>`);
              audio.say();
              this.text(`<p class="tut-ok">좋아요! ✔</p><p>이름표에도 주장이 남아요 (💬). 진짜인지는 카드를 뒤집어 봐야 알죠!</p>`);
              this.spot(null);
            },
          };
        },
      },
      {
        title: '승리 조건',
        interactive: false,
        setup: async () => {
          this.stage.showcase(['treasure', 'monster'], { scale: 1.2 });
          this.text(`<p>${img('treasure')} 보물을 <b>사람 수만큼 모두</b> 찾으면 → <b>탐험대 승리</b></p>
            <p>${img('monster')} ${CARD_NAME.monster}가 뒤집히면 → <b>해적 즉시 승리</b><br>4라운드가 끝날 때까지 보물을 다 못 찾아도 → <b>해적 승리</b></p>
            <p>게임이 끝나면 모두의 역할이 공개돼요. 이제 출항해 볼까요?</p>`);
        },
      },
    ];
  }
}

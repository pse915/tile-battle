// 심해 보물섬 탐험대 — 온라인 게임 화면 (규칙 판정은 서버, 여기서는 보여 주기와 입력)
import { CARD, CARD_NAME, ROLE_NAME, SAYINGS, winText } from './rules.js';
import { cardImage } from './cards.js';
import { wait } from '../../../shared/anim.js';
import { audio } from './audio.js';
import * as ui from '../../../shared/ui-core.js';
import { buildLabels, clearLabels, updateLabel, seatBubble, positionLabels } from './labels.js';
import { OfflineTable, createOfflineRoot, removeOfflineRoot } from '../../../shared/offline-table.js';

/** 🪑 오프라인 테이블 모드 화면 설정 (서버 구성품: server/games/deep-sea.js의 offline) */
const OFFLINE_CFG = {
  zones: [{ id: 'found', name: '뒤집힌 카드', kind: 'pile', spread: true }],
  actions: { pick: true, redeal: true },
  hideOrder: true,
  cardImg: (c) => cardImage(c),
  backImg: () => cardImage('back'),
  secretImg: (c) => cardImage(c),
  secretName: (c) => ROLE_NAME[c],
  redealDefault: (round) => Math.max(2, 5 - round),
  cardRatio: 1.44,
  tips: '역할은 🎭에서 몰래 확인! 말은 직접 얼굴 보며, 열쇠 가진 사람이 남의 카드를 골라 뒤집어요. 사람 수만큼 뒤집으면 방장이 ‘다시 나누기’',
};

const $ = ui.$;
const SAY_ORDER = ['t0', 't1', 't2', 't3', 'm0', 'm1', 'sus', 'trust', 'pass'];
export const ROLE_GOAL = {
  crew: '보물을 모두 찾으면 이겨요. 대왕문어는 절대 건드리면 안 돼요!',
  pirate: '대왕문어를 깨우거나, 4라운드가 끝날 때까지 보물을 숨기면 이겨요. 들키지 마세요!',
};

export function renderSayBar(onSay) {
  const bar = $('#say-bar');
  bar.innerHTML = SAY_ORDER.map((k) => `<button class="btn${k === 'sus' ? ' sus' : ''}" data-say="${k}">${SAYINGS[k]}</button>`).join('');
  bar.onclick = (e) => {
    const k = e.target.closest('[data-say]')?.dataset.say;
    if (k) onSay(k);
  };
}

export function myCardsHtml(sum) {
  const item = (type, n) => `<span class="mc${n ? '' : ' zero'}"><img src="${cardImage(type)}" alt="">${CARD_NAME[type].replace('심해 ', '')} ${n}</span>`;
  return `<span>내 카드 ${sum.total}장:</span>${item(CARD.TREASURE, sum.treasure)}${item(CARD.EMPTY, sum.empty)}${item(CARD.MONSTER, sum.monster)}`;
}

export function roleChipHtml(role) {
  return `<img src="${cardImage(role)}" alt="">내 역할: ${ROLE_NAME[role]}`;
}

export function roleRevealHtml(role) {
  return `<div class="role-reveal"><div class="role-card"><img class="back" src="${cardImage('back')}" alt=""><img class="front" src="${cardImage(role)}" alt="${ROLE_NAME[role]}"></div></div>
    <p class="role-goal"><b>${ROLE_NAME[role]}</b> — ${ROLE_GOAL[role]}</p>
    <p class="note" style="text-align:center">내 역할은 나만 봐요. 다른 사람에게 화면을 보여 주지 마세요!</p>`;
}

export class DeepSeaGame {
  constructor(stage, lobby, { onEnter, onExit }) {
    this.stage = stage;
    this.lobby = lobby;
    this.onEnter = onEnter;
    this.onExit = onExit;
    this.queue = [];
    this.inGame = false;
  }

  // ---------- 상태 받기 ----------
  onState(s, first) {
    this.state = s;
    if (s.mode === 'offline') return this.offlineState(s);
    if (s.mySeat < 0) {
      ui.toast('📺 테이블 화면은 오프라인 테이블 모드 방에서만 쓸 수 있어요.', 3000);
      return this.onExit();
    }
    if (first || !this.inGame) {
      this.enter(s);
      return;
    }
    for (const e of s.events) if (e.seq > this.lastSeq) this.queue.push(e);
    this.lastSeq = s.seq;
    this.drain();
  }

  enter(s) {
    this.inGame = true;
    this.queue = [];
    this.lastSeq = s.seq;
    this.mySeat = s.mySeat;
    this.susTarget = null;
    ui.showScreen(null);
    this.stage.setTitleMode(false);
    this.stage.setSeats(s.players.length, s.mySeat);
    buildLabels(s.players, s.mySeat);
    $('#hud').hidden = false;
    renderSayBar((k) => this.say(k));
    this.onEnter();
    this.unsub?.();
    this.unsub = this.stage.onFrame(() => positionLabels(this.stage));
    s.players.forEach((p, i) => this.stage.setRowCount(i, p.count));
    this.stage.placeRevealed(s.ds.revealed);
    this.stage.setKey(s.ds.keyHolder, true);
    this.rebuildLog(s);
    this.reconcile();
    if (s.status === 'finished') this.showEnd({ winner: s.ds.winner, reason: s.ds.reason, roles: s.ds.roles, hiddenRole: s.ds.hiddenRole });
    else if (s.ds.revealed.length === 0 && s.ds.round === 1) this.showRole();
  }

  /** 오프라인 테이블 모드: 공용 화면(shared/offline-table.js)에 맡기고 3D 바다는 배경으로 */
  offlineState(s) {
    if (!this.ot) {
      this.inGame = true;
      ui.showScreen(null);
      $('#hud').hidden = true;
      this.stage.setTitleMode(true);
      const root = createOfflineRoot('심해 보물섬 탐험대 · 🪑 오프라인 테이블', () => this.onExit());
      this.ot = new OfflineTable({ root, lobby: this.lobby, cfg: OFFLINE_CFG, audio });
      this.onEnter?.();
    }
    this.ot.render(s);
  }

  exit() {
    if (this.ot) {
      this.ot = null;
      removeOfflineRoot();
      ui.closeModal();
      this.inGame = false;
      return;
    }
    if (!this.inGame) return;
    this.inGame = false;
    this.queue = [];
    this.unsub?.();
    this.stage.clickable = false;
    this.stage.setSeats(0, 0);
    this.stage.clearRevealed();
    this.stage.setKey(null);
    clearLabels();
    $('#hud').hidden = true;
    ui.closeModal();
    this.stage.setTitleMode(true);
  }

  showRole() {
    const role = this.state.ds.myRole;
    ui.modal({ title: '당신의 비밀 역할', html: roleRevealHtml(role), buttons: [{ label: '확인했어요', value: true, primary: true }] });
    audio.flip();
  }

  async drain() {
    if (this.draining) return;
    this.draining = true;
    while (this.queue.length && this.inGame) await this.playEvent(this.queue.shift());
    this.draining = false;
    if (this.inGame) this.reconcile();
  }

  name(i) {
    return ui.esc(this.state.players[i]?.name || '');
  }

  // ---------- 이벤트 연출 ----------
  async playEvent(e) {
    const s = this.state;
    if (e.type === 'round') {
      this.log(`<li class="round">— ${e.round}라운드 (한 사람당 ${e.handSize}장) —</li>`);
      if (e.round > 1) {
        ui.banner(`${e.round}라운드`);
        audio.deal();
        await this.stage.dealRows(s.players.map(() => e.handSize), () => audio.deal());
        await wait(0.6);
      }
    } else if (e.type === 'say') {
      const t = e.target != null ? ` → ${this.name(e.target)}` : '';
      seatBubble(e.seat, SAYINGS[e.msg] + (e.target != null ? ` (${s.players[e.target]?.name})` : ''));
      this.log(`<li>${s.players[e.seat]?.emoji || ''} <b>${this.name(e.seat)}</b>: “${SAYINGS[e.msg]}”${t}</li>`);
      audio.say();
    } else if (e.type === 'flip') {
      const k = this.stage.revealedMeshes.filter((m, idx) => this.revealRounds?.[idx] === e.round).length;
      this.revealRounds = this.revealRounds || [];
      audio.flip();
      const m = await this.stage.flipCard(e.target, e.index, e.card, k, e.round);
      this.revealRounds.push(e.round);
      const at = m ? m.position.clone() : this.stage.seatPos(e.target, 2, 0.3);
      if (e.card === CARD.TREASURE) {
        this.stage.sparkle(at);
        audio.treasure();
      } else if (e.card === CARD.MONSTER) {
        audio.monster();
        $('#flash').classList.add('show');
        await this.stage.monster();
        $('#flash').classList.remove('show');
      } else {
        this.stage.dust(at);
        audio.empty();
      }
      this.log(`<li class="flip">${this.name(e.by)} → ${this.name(e.target)}: <img src="${cardImage(e.card)}" alt=""> ${CARD_NAME[e.card]}</li>`);
      ui.$('#hud-table').innerHTML = `<b>${this.name(e.by)}</b>님이 <b>${this.name(e.target)}</b>의 카드를 뒤집었어요: ${CARD_NAME[e.card]}`;
      audio.key();
      await this.stage.setKey(e.target);
      await wait(0.3);
    } else if (e.type === 'end') {
      await wait(0.4);
      this.showEnd(e);
    }
  }

  showEnd(e) {
    const s = this.state;
    const mine = e.roles?.[this.mySeat];
    const won = mine === e.winner;
    ui.banner(e.winner === 'crew' ? '탐험대 승리!' : '해적 승리!');
    if (won) {
      audio.win();
      ui.confetti(3.5, ['#e8c15a', '#ffffff', '#38bdf8', '#0f766e']);
    } else audio.lose();
    const list = s.players
      .map((p, i) => `<li class="${e.roles[i]}"><span>${p.emoji}</span><span class="who">${ui.esc(p.name)}${i === this.mySeat ? ' (나)' : ''}</span><img src="${cardImage(e.roles[i])}" alt="">${ROLE_NAME[e.roles[i]]}</li>`)
      .join('');
    const hidden = e.hiddenRole ? `<p class="note">아무도 받지 않고 빠진 역할 카드: <b>${ROLE_NAME[e.hiddenRole]}</b></p>` : '';
    const host = this.lobby.isHost();
    ui.modal({
      title: winText(e.winner, e.reason),
      html: `<p>${won ? '🎉 우리 편이 이겼어요!' : '아쉬워요, 다음엔 꼭!'}</p><ul class="end-roles">${list}</ul>${hidden}${host ? '' : '<p class="note">방장이 [대기방으로]를 누르면 같은 방에서 다시 할 수 있어요.</p>'}`,
      buttons: host
        ? [{ label: '나가기', value: 'exit' }, { label: '대기방으로', value: 'lobby', primary: true }]
        : [{ label: '나가기', value: 'exit' }, { label: '기다리기', value: 'wait', primary: true }],
    }).then((v) => {
      if (v === 'lobby') this.lobby.send('lobby');
      else if (v === 'exit') this.onExit();
    });
  }

  rebuildLog(s) {
    $('#log-list').innerHTML = '';
    this.revealRounds = s.ds.revealed.map((r) => r.round);
    const byRound = {};
    s.ds.revealed.forEach((r) => (byRound[r.round] = byRound[r.round] || []).push(r));
    for (let r = 1; r <= s.ds.round; r++) {
      this.log(`<li class="round">— ${r}라운드 —</li>`);
      for (const f of byRound[r] || []) this.log(`<li class="flip">${this.name(f.by)} → ${this.name(f.target)}: <img src="${cardImage(f.type)}" alt=""> ${CARD_NAME[f.type]}</li>`);
    }
    // 이번 라운드 말풍선은 남아 있는 이벤트에서 다시 채움
    for (const e of s.events) if (e.type === 'say' && e.round === s.ds.round) this.log(`<li>${s.players[e.seat]?.emoji || ''} <b>${this.name(e.seat)}</b>: “${SAYINGS[e.msg]}”</li>`);
  }

  log(html) {
    const list = $('#log-list');
    list.insertAdjacentHTML('beforeend', html);
    list.scrollTop = list.scrollHeight;
  }

  /** 연출이 끝난 뒤 서버 상태와 화면을 맞춤 */
  reconcile() {
    const s = this.state;
    const ds = s.ds;
    s.players.forEach((p, i) => {
      if (this.stage.rows[i] && this.stage.rows[i].length !== p.count) this.stage.setRowCount(i, p.count);
      updateLabel(i, { count: p.count, key: ds.keyHolder === i && s.status === 'playing', claim: ds.claims[i], away: p.away, role: p.role, target: this.susTarget === i });
    });
    $('#hud-round').textContent = `라운드 ${ds.round} / ${ds.maxRounds} · 보물 ${ds.found}/${ds.totalTreasure} · 이번 라운드 ${ds.flipsThisRound}/${ds.flipsPerRound}장`;
    if (!$('#hud-table').innerHTML) $('#hud-table').innerHTML = `🔑 <b>${this.name(ds.keyHolder)}</b>님이 열쇠를 가졌어요`;
    const role = ds.myRole;
    $('#role-chip').innerHTML = roleChipHtml(role);
    $('#role-chip').className = `role-chip ${role}`;
    $('#my-cards').innerHTML = myCardsHtml(ds.mySummary);
    const myTurn = this.myTurn();
    if (myTurn && !this.wasMyTurn) audio.yourTurn();
    this.wasMyTurn = myTurn;
    $('#turn-flag').hidden = !myTurn;
    this.stage.clickable = s.status === 'playing';
    $('#btn-flip').hidden = !(myTurn && this.stage.selected);
    if (!myTurn && this.stage.selected) this.stage.select(null);
    this.stage.setKey(s.status === 'playing' ? ds.keyHolder : null, !this.keyPlaced);
    this.keyPlaced = true;
  }

  myTurn() {
    const s = this.state;
    return !!s && s.status === 'playing' && s.ds.keyHolder === this.mySeat && !this.queue.length && !this.draining && !this.pending;
  }

  // ---------- 입력 ----------
  onCardClick(seat, index) {
    if (!this.inGame || this.state.status !== 'playing' || seat === this.mySeat) return;
    if (this.myTurn()) {
      const sel = this.stage.selected;
      if (sel && sel.seat === seat && sel.index === index) return this.flip();
      this.stage.select({ seat, index });
      audio.pick();
      $('#btn-flip').hidden = false;
      $('#btn-flip').textContent = `${this.state.players[seat].name}의 카드 뒤집기`;
    } else {
      this.susTarget = this.susTarget === seat ? null : seat;
      audio.pick();
      $('#say-bar .sus').classList.toggle('armed', this.susTarget != null);
      if (this.susTarget != null) ui.toast(`‘너 수상해’를 누르면 ${this.state.players[seat].name}에게 말해요`);
      this.reconcile();
    }
  }

  async flip() {
    const sel = this.stage.selected;
    if (!sel || !this.myTurn()) return;
    this.pending = true;
    this.stage.select(null);
    $('#btn-flip').hidden = true;
    await this.lobby.send('flip', { target: sel.seat, index: sel.index });
    this.pending = false;
    if (this.inGame) this.reconcile();
  }

  say(k) {
    if (!this.inGame || this.state.status !== 'playing') return;
    const payload = { msg: k };
    if (k === 'sus' && this.susTarget != null) payload.target = this.susTarget;
    this.lobby.send('say', payload);
    if (k === 'sus') {
      this.susTarget = null;
      $('#say-bar .sus').classList.remove('armed');
    }
  }
}

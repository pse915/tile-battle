// 보석 공방 — 서버 상태(온라인·봇 연습·한 기기)를 받아 3D 보석 더미와 카드 시장·내 공방을 그리고, 동작을 보냄
import { $, esc, banner, toast, modal, confetti } from '../../../shared/ui-core.js';
import { COLORS, ALL, GEM_NAME, GOAL, HAND_MAX, RESERVE_MAX, cardOf, patronOf, PATRON_NAME, PATRON_EMOJI, payment, sumGems } from './rules.js';
import { GEM_CSS } from './scene.js';

const PLACE = ['🥇', '🥈', '🥉', '4등'];
const TIER_NAME = ['', '견습', '장인', '명장'];

/** 보석 동그라미 (색 + 글자: 색을 구분하기 어려워도 알아보게) */
export const gemDot = (c, n = null, cls = '') => `<span class="gw-gem g-${c} ${cls}" title="${GEM_NAME[c]}">${n == null ? GEM_NAME[c][0] : n}</span>`;

/** 카드 HTML (button) */
export function cardHtml(id, { cls = '', act = 'card', mine = null } = {}) {
  const c = cardOf(id);
  if (!c) return '';
  const cost = COLORS.filter((k) => c.cost[k])
    .map((k) => gemDot(k, c.cost[k], 'cost'))
    .join('');
  const ok = mine && payment(mine, c) ? ' can' : '';
  return `<button type="button" class="gw-card t${c.tier} c-${c.color}${ok} ${cls}" data-${act}="${id}" aria-label="${TIER_NAME[c.tier]} ${GEM_NAME[c.color]} 카드 ${c.pts}점">
    <span class="gw-card-top"><b>${c.pts || ''}</b>${gemDot(c.color, null, 'bonus')}</span>
    <span class="gw-card-cost">${cost}</span></button>`;
}
export function patronHtml(id, cls = '') {
  const p = patronOf(id);
  return `<div class="gw-patron ${cls}" title="${PATRON_NAME[id]}"><span class="pe">${PATRON_EMOJI[id]}</span><b>${p.pts}</b><span class="need">${Object.entries(p.need)
    .map(([c, v]) => gemDot(c, v, 'cost'))
    .join('')}</span></div>`;
}

export class GWGame {
  constructor(view, lobby, shell, audio) {
    this.view = view;
    this.lobby = lobby;
    this.shell = shell;
    this.audio = audio;
    this.state = null;
    this.queue = [];
    this.busy = false;
    this.seq = 0;
    this.pick = [];
    this.returns = [];
    this.logs = [];
    this.endShown = -1;
    this.covered = false;
    this.view.onPickGem = (c) => this.toggleGem(c);
    this.view.stage.frame.add(() => this.placeBadges());
  }

  enter(mode) {
    this.mode = mode;
    this.shell.enterHud();
    this.view.setTitleMode(false);
    this.logs = [];
    this.seq = 0;
    this.pick = [];
    this.returns = [];
    this.endShown = -1;
    this.state = null;
    this.covered = false;
    $('#hud-body').innerHTML = `
      <div class="gw-players" id="gw-players"></div>
      <div class="gw-badges" id="gw-badges"></div>
      <div class="k-log" id="gw-log"><button type="button" id="gw-log-btn">📜 기록</button><ol id="gw-log-list"></ol></div>
      <section class="gw-market" id="gw-market" aria-label="카드 시장"></section>
      <div class="k-flag gw-flag" id="gw-flag" hidden></div>
      <section class="gw-me" id="gw-me" aria-label="내 공방">
        <div class="gw-me-row" id="gw-me-gems"></div>
        <div class="gw-me-row" id="gw-me-extra"></div>
        <div class="k-actions" id="gw-actions"></div>
      </section>
      <div class="gw-cover" id="gw-cover" hidden></div>`;
    $('#gw-log-btn').addEventListener('click', () => $('#gw-log').classList.toggle('open'));
    $('#hud-body').addEventListener('click', (e) => this.onClick(e));
    if (mode === 'hotseat') this.setupHotseat();
  }

  exit() {
    this.state = null;
    this.queue = [];
    this.pick = [];
    clearInterval(this.pingTimer);
    this.view.setPicked([]);
  }

  send(action, payload = {}) {
    return this.lobby.send(action, payload);
  }

  get me() {
    return this.state ? this.state.mySeat : -1;
  }
  myTurn() {
    const s = this.state;
    return !!(s && s.gw && s.status === 'playing' && s.gw.turn === s.mySeat && !this.covered);
  }
  pname(i) {
    const p = this.state?.players[i];
    return p ? `${p.emoji} ${p.name}` : '';
  }

  // ---------- 한 기기 여러 명 ----------
  setupHotseat() {
    const lb = this.lobby;
    this.viewSeat = 0;
    lb.pollPid = () => lb.seatPids[this.viewSeat];
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (!lb.active || !lb.seatPids) return clearInterval(this.pingTimer);
      lb.seatPids.forEach((pid, i) => i !== this.viewSeat && lb.call('poll', { code: lb.code, pid, since: lb.version }).catch(() => {}));
    }, 8000);
  }
  takeOver(seat) {
    const lb = this.lobby;
    this.viewSeat = seat;
    lb.pid = lb.seatPids[seat];
    this.covered = false;
    $('#gw-cover').hidden = true;
    lb.version = -1;
    clearTimeout(lb.timer);
    lb.poll();
  }
  showCover(s) {
    const next = s.players[s.gw.turn];
    this.covered = true;
    const el = $('#gw-cover');
    el.innerHTML = `<div class="gw-cover-box"><p class="big">🙈</p><h2>${esc(next.emoji)} ${esc(next.name)} 차례예요</h2>
      <p>찜한 카드가 보이지 않게 기기를 <b>${esc(next.name)}</b>에게 넘겨 주세요.</p>
      <button class="btn primary big" data-act="takeover">제가 ${esc(next.name)}이에요 ▶</button></div>`;
    el.hidden = false;
  }

  // ---------- 상태 받기 ----------
  onState(s, first) {
    if (first) this.enter(this.lobby.local ? (this.lobby.seatPids ? 'hotseat' : 'practice') : 'online');
    this.queue.push(s);
    this.pump();
  }

  async pump() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.queue.length) {
        const s = this.queue.shift();
        if (s.status === 'lobby' || !s.gw) {
          this.state = s;
          $('#hud-table').textContent = s.status === 'lobby' ? '📺 방장이 시작하길 기다리는 중…' : '';
          continue;
        }
        const evs = (s.events || []).filter((e) => e.seq > this.seq);
        const lastSeq = Math.max(this.seq, ...(s.events || []).map((e) => e.seq || 0));
        const wasMine = this.myTurn();
        if (evs.some((e) => e.type === 'start')) {
          this.endShown = -1;
          this.logs = [];
          this.addLog('💎 공방 문을 열었어요! 먼저 15점을 모으면 마지막 바퀴가 시작돼요.');
        }
        this.state = s;
        if (s.gw.turn !== s.mySeat || s.gw.phase !== 'play') this.pick = [];
        if (s.gw.phase !== 'discard') this.returns = [];
        for (const e of evs) this.onEvent(e, s);
        this.seq = lastSeq;
        this.render();
        if (this.mode === 'hotseat' && s.status === 'playing' && s.gw.turn !== s.mySeat && !s.players[s.gw.turn].bot) this.showCover(s);
        if (!wasMine && this.myTurn()) this.audio.myTurn();
        if (s.status === 'finished' && this.endShown !== lastSeq) {
          this.endShown = lastSeq;
          await this.showEnd(s);
        }
      }
    } finally {
      this.busy = false;
    }
  }

  onEvent(e, s) {
    const who = this.pname(e.seat);
    switch (e.type) {
      case 'take':
        this.audio.take(e.gems.length);
        this.addLog(`${who}: 보석 ${e.gems.map((c) => GEM_NAME[c]).join(' · ')}`);
        break;
      case 'buy': {
        const c = cardOf(e.card);
        this.audio.buy();
        this.addLog(`${who}: ${GEM_NAME[c.color]} 카드 사기${c.pts ? ` (+${c.pts}점)` : ''}${e.from === 'reserved' ? ' · 찜했던 카드' : ''}`);
        this.flash(e.seat);
        break;
      }
      case 'reserve':
        this.audio.reserve();
        this.addLog(`${who}: ${e.card ? GEM_NAME[cardOf(e.card).color] + ' 카드' : TIER_NAME[e.tier] + ' 덱 맨 위 카드'} 찜${e.gold ? ' + 황금 1' : ''}`);
        break;
      case 'discard':
        this.addLog(`${who}: 보석 ${e.gems.length}개 돌려놓음`);
        break;
      case 'mustDiscard':
        if (e.seat === s.mySeat && this.mode !== 'hotseat') toast(`보석은 ${HAND_MAX}개까지! ${e.over}개를 돌려놓아요.`, 2400);
        break;
      case 'patron':
        this.audio.patron();
        banner(`${PATRON_EMOJI[e.patron]} ${PATRON_NAME[e.patron]}이(가) ${s.players[e.seat].name}의 공방에 찾아왔어요! +3점`);
        this.addLog(`${who}: ${PATRON_EMOJI[e.patron]} ${PATRON_NAME[e.patron]} 방문 (+3점)`);
        break;
      case 'finalRound':
        banner(`🔔 ${s.players[e.seat].name} ${GOAL}점 달성! 이번 바퀴가 마지막이에요`);
        this.addLog(`🔔 ${who} ${GOAL}점! 마지막 바퀴`);
        break;
      case 'pass':
        this.addLog(`${who}: 할 수 있는 게 없어 넘어감`);
        break;
    }
  }

  addLog(t) {
    this.logs.push(t);
    if (this.logs.length > 60) this.logs.shift();
    const ol = $('#gw-log-list');
    if (ol) {
      ol.innerHTML = this.logs.map((x) => `<li>${esc(x)}</li>`).join('');
      ol.scrollTop = ol.scrollHeight;
    }
  }

  flash(seat) {
    const el = document.querySelector(`#gw-players [data-seat="${seat}"]`);
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  // ---------- 그리기 ----------
  render() {
    const s = this.state;
    if (!s || !s.gw) return;
    const g = s.gw;
    this.view.setBank(g.bank);
    this.view.setPicked(this.pick);
    $('#hud-round').textContent = g.finalRound ? '🔔 마지막 바퀴' : `목표 ${GOAL}점`;
    $('#hud-table').textContent = g.phase === 'over' ? '끝!' : g.turn === s.mySeat && !this.covered ? '내 차례' : `${this.pname(g.turn)} 차례`;
    this.renderPlayers();
    this.renderMarket();
    this.renderMe();
    this.renderBadges();
  }

  renderPlayers() {
    const s = this.state;
    const g = s.gw;
    $('#gw-players').innerHTML = s.players
      .map((p, i) => {
        const gp = g.players[i];
        const mine = i === s.mySeat;
        const bonus = COLORS.filter((c) => gp.bonus[c]).map((c) => gemDot(c, gp.bonus[c], 'mini bonus'));
        return `<button type="button" class="gw-pl ${g.turn === i && g.phase !== 'over' ? 'turn' : ''} ${mine ? 'me' : ''}" data-seat="${i}" aria-label="${esc(p.name)} ${gp.pts}점 자세히 보기">
          <span class="who">${p.emoji} ${esc(p.name)}${p.away ? ' 💤' : ''}</span>
          <span class="pts">${gp.pts}<small>점</small></span>
          <span class="mini-row">${bonus.join('') || '<i>카드 없음</i>'}</span>
          <span class="mini-row sub">💎${sumGems(gp.gems)} · 🔖${gp.reserved.length}${gp.patrons.length ? ' · ' + gp.patrons.map((x) => PATRON_EMOJI[x]).join('') : ''}</span>
        </button>`;
      })
      .join('');
  }

  renderMarket() {
    const s = this.state;
    const g = s.gw;
    const mine = s.mySeat >= 0 ? this.mineFull() : null;
    const rows = [2, 1, 0]
      .map((t) => {
        const deck = `<button type="button" class="gw-deck t${t + 1}" data-deck="deck${t + 1}" aria-label="${TIER_NAME[t + 1]} 덱 ${g.deckCounts[t]}장">${TIER_NAME[t + 1]}<b>${g.deckCounts[t]}</b></button>`;
        return `<div class="gw-row">${deck}${g.market[t].map((id) => cardHtml(id, { mine })).join('')}</div>`;
      })
      .join('');
    $('#gw-market').innerHTML = `<div class="gw-patrons" aria-label="후원자">${g.patrons.map((id) => patronHtml(id)).join('')}</div>${rows}`;
  }

  /** 내 상태 (rules.payment에 넘길 모양) */
  mineFull() {
    const s = this.state;
    const gp = s.gw.players[s.mySeat];
    if (!gp) return null;
    return { gems: gp.gems, cards: gp.cards, reserved: gp.reserved, patrons: gp.patrons };
  }

  renderMe() {
    const s = this.state;
    const g = s.gw;
    const box = $('#gw-me');
    if (s.mySeat < 0 || this.covered) {
      box.hidden = true;
      $('#gw-flag').hidden = true;
      return;
    }
    box.hidden = false;
    const gp = g.players[s.mySeat];
    const discarding = g.phase === 'discard' && g.turn === s.mySeat;
    const over = sumGems(gp.gems) - HAND_MAX;
    const left = { ...gp.gems };
    this.returns.forEach((c) => left[c]--);
    $('#gw-me-gems').innerHTML =
      `<span class="lbl">보석 ${sumGems(gp.gems)}/${HAND_MAX}</span>` +
      ALL.map((c) => `<button type="button" class="gw-mygem ${discarding && left[c] > 0 ? 'can-return' : ''}" data-mygem="${c}" ${discarding ? '' : 'tabindex="-1"'}>${gemDot(c, left[c], left[c] ? '' : 'zero')}${COLORS.includes(c) && gp.bonus[c] ? `<small>+${gp.bonus[c]}</small>` : ''}</button>`).join('');
    const reserved = gp.reserved.map((x) => cardHtml(x.id, { cls: 'small', act: 'card', mine: this.mineFull() })).join('');
    $('#gw-me-extra').innerHTML = `<span class="lbl">찜 ${gp.reserved.length}/${RESERVE_MAX}</span>${reserved || '<i class="hint">카드를 눌러 사거나 찜해요</i>'}`;
    // 버튼과 안내
    const flag = $('#gw-flag');
    let acts = '';
    if (discarding) {
      flag.hidden = false;
      flag.textContent = `보석 ${over}개를 골라 돌려놓아요 (${this.returns.length}/${over})`;
      acts = `<button class="btn" data-act="clearReturn">다시 고르기</button><button class="btn primary ${this.returns.length === over ? '' : 'is-off'}" data-act="discard">돌려놓기</button>`;
    } else if (this.myTurn()) {
      flag.hidden = false;
      flag.textContent = this.pick.length ? `고른 보석: ${this.pick.map((c) => GEM_NAME[c]).join(' · ')}` : '보석 더미를 누르거나 카드를 눌러요';
      const can = this.pickValid();
      const n = (c) => this.pick.filter((x) => x === c).length;
      acts =
        `<div class="gw-pickrow">${COLORS.map((c) => `<button type="button" class="gw-pickgem ${n(c) ? 'on' : ''}" data-gem="${c}" ${g.bank[c] ? '' : 'disabled'} aria-pressed="${!!n(c)}" aria-label="${GEM_NAME[c]} 고르기">${gemDot(c, n(c) > 1 ? '×2' : null)}</button>`).join('')}</div>` +
        (this.pick.length ? `<button class="btn" data-act="clearPick">취소</button><button class="btn primary ${can ? '' : 'is-off'}" data-act="take">가져오기</button>` : '');
    } else {
      flag.hidden = true;
    }
    $('#gw-actions').innerHTML = acts;
  }

  renderBadges() {
    const g = this.state.gw;
    $('#gw-badges').innerHTML = ALL.map((c) => `<span class="gw-badge" data-badge="${c}">${g.bank[c]}</span>`).join('');
    this.placeBadges();
  }
  placeBadges() {
    const wrap = $('#gw-badges');
    if (!wrap || !this.state || !this.state.gw) return;
    wrap.querySelectorAll('[data-badge]').forEach((el) => {
      const p = this.view.screenOf(el.dataset.badge);
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
    });
  }

  // ---------- 입력 ----------
  pickValid() {
    const g = this.state.gw;
    const p = this.pick;
    if (!p.length) return false;
    const avail = COLORS.filter((c) => g.bank[c] > 0).length;
    if (p.length === 2 && p[0] === p[1]) return g.bank[p[0]] >= 4;
    return new Set(p).size === p.length && (p.length === 3 || p.length === Math.min(3, avail));
  }

  toggleGem(c) {
    const s = this.state;
    if (!s || !s.gw) return;
    if (s.gw.phase === 'discard' && s.gw.turn === s.mySeat) return;
    if (!this.myTurn()) {
      this.audio.error();
      return toast('아직 내 차례가 아니에요.');
    }
    const g = s.gw;
    if (!g.bank[c]) {
      this.audio.error();
      return toast(`${GEM_NAME[c]}이(가) 다 떨어졌어요.`);
    }
    const p = this.pick;
    const n = p.filter((x) => x === c).length;
    if (n === 1 && p.length === 1) {
      // 같은 색을 한 번 더 → 2개 (4개 이상 남았을 때)
      if (g.bank[c] < 4) {
        this.audio.error();
        return toast('같은 색 2개는 그 보석이 4개 이상 남아 있을 때만 가져올 수 있어요.');
      }
      p.push(c);
    } else if (n >= 1) {
      this.pick = p.filter((x) => x !== c);
    } else if (p.length === 2 && p[0] === p[1]) {
      this.pick = [c];
    } else if (p.length >= 3) {
      this.audio.error();
      return toast('서로 다른 색은 3개까지예요.');
    } else p.push(c);
    this.audio.pick();
    this.view.setPicked(this.pick);
    this.renderMe();
  }

  async onClick(e) {
    const t = e.target;
    const s = this.state;
    if (!s || !s.gw) return;
    const act = t.closest('[data-act]')?.dataset.act;
    if (act) return this.onAct(act);
    const gem = t.closest('[data-gem]')?.dataset.gem;
    if (gem) return this.toggleGem(gem);
    const mg = t.closest('[data-mygem]')?.dataset.mygem;
    if (mg && s.gw.phase === 'discard' && s.gw.turn === s.mySeat) return this.toggleReturn(mg);
    const card = t.closest('[data-card]')?.dataset.card;
    if (card) return this.openCard(card);
    const deck = t.closest('[data-deck]')?.dataset.deck;
    if (deck) return this.openDeck(deck);
    const seat = t.closest('[data-seat]')?.dataset.seat;
    if (seat != null) return this.showPlayer(Number(seat));
  }

  toggleReturn(c) {
    const gp = this.state.gw.players[this.state.mySeat];
    const over = sumGems(gp.gems) - HAND_MAX;
    const used = this.returns.filter((x) => x === c).length;
    if (used >= gp.gems[c] || this.returns.length >= over) {
      this.audio.error();
      return;
    }
    this.returns.push(c);
    this.audio.pick();
    this.renderMe();
  }

  async onAct(act) {
    const s = this.state;
    if (act === 'takeover') return this.takeOver(s.gw.turn);
    if (act === 'clearPick') {
      this.pick = [];
      this.view.setPicked([]);
      return this.renderMe();
    }
    if (act === 'clearReturn') {
      this.returns = [];
      return this.renderMe();
    }
    if (this.sending) return;
    this.sending = true;
    try {
      if (act === 'take') {
        if (!this.pickValid()) {
          this.audio.error();
          return toast('서로 다른 색 3개, 또는 같은 색 2개를 골라요.');
        }
        const ok = await this.send('take', { gems: this.pick });
        if (ok) this.pick = [];
      } else if (act === 'discard') {
        const ok = await this.send('discard', { gems: this.returns });
        if (ok) this.returns = [];
      }
    } finally {
      this.sending = false;
      this.render();
    }
  }

  async openCard(id) {
    const s = this.state;
    const c = cardOf(id);
    const mine = s.mySeat >= 0 ? this.mineFull() : null;
    const isReserved = mine && mine.reserved.some((x) => x.id === id);
    const pay = mine && payment(mine, c);
    const turn = this.myTurn() && s.gw.phase === 'play';
    const payText = pay
      ? ALL.filter((k) => pay[k])
          .map((k) => gemDot(k, pay[k]))
          .join(' ') || '할인만으로 공짜!'
      : '';
    const canReserve = turn && !isReserved && mine.reserved.length < RESERVE_MAX;
    const v = await modal({
      title: `${TIER_NAME[c.tier]} 카드 · ${GEM_NAME[c.color]}`,
      html: `<div class="gw-zoom">${cardHtml(id, { cls: 'big', act: 'none', mine })}</div>
        <p>사면 <b>${c.pts}점</b>, 앞으로 ${GEM_NAME[c.color]} 비용이 <b>1개씩 할인</b>돼요.</p>
        ${mine ? (pay ? `<p>낼 보석: ${payText}</p>` : '<p class="note">보석이 모자라요. 찜해 두면 황금(만능) 1개도 받아요.</p>') : ''}
        ${turn ? '' : '<p class="note">내 차례에 살 수 있어요.</p>'}`,
      buttons: [
        ...(turn && pay ? [{ label: '💎 사기', value: 'buy', primary: true }] : []),
        ...(canReserve ? [{ label: '🔖 찜하기', value: 'reserve' }] : []),
        { label: '닫기', value: null },
      ],
    });
    if (v === 'buy') await this.send('buy', { card: id });
    if (v === 'reserve') await this.send('reserve', { card: id });
  }

  async openDeck(deck) {
    const s = this.state;
    const t = Number(deck.slice(-1));
    const mine = s.mySeat >= 0 ? this.mineFull() : null;
    if (!this.myTurn() || s.gw.phase !== 'play') return toast(`${TIER_NAME[t]} 덱: ${s.gw.deckCounts[t - 1]}장 남음`);
    if (mine.reserved.length >= RESERVE_MAX) return toast('찜은 3장까지예요.');
    const v = await modal({
      title: `${TIER_NAME[t]} 덱`,
      html: '<p>덱 맨 위 카드를 몰래 찜할 수 있어요. 다른 사람은 어떤 카드인지 못 봐요. 황금이 남아 있으면 1개 받아요.</p>',
      buttons: [{ label: '🔖 맨 위 카드 찜하기', value: 'go', primary: true }, { label: '닫기', value: null }],
    });
    if (v === 'go') await this.send('reserve', { card: deck });
  }

  async showPlayer(i) {
    const s = this.state;
    const p = s.players[i];
    const gp = s.gw.players[i];
    const cards = gp.cards.length ? gp.cards.map((id) => cardHtml(id, { cls: 'small', act: 'none' })).join('') : '<i>아직 없어요</i>';
    const res = gp.reserved.map((x) => (x.id ? cardHtml(x.id, { cls: 'small', act: 'none' }) : `<span class="gw-card back t${x.tier} small">${TIER_NAME[x.tier]}</span>`)).join('') || '<i>없음</i>';
    await modal({
      title: `${p.emoji} ${p.name} · ${gp.pts}점`,
      html: `<p>보석: ${ALL.map((c) => gemDot(c, gp.gems[c])).join(' ')}</p>
        <p>후원자: ${gp.patrons.map((x) => PATRON_EMOJI[x] + ' ' + PATRON_NAME[x]).join(', ') || '없음'}</p>
        <h3>산 카드 ${gp.cards.length}장</h3><div class="gw-wrap">${cards}</div>
        <h3>찜</h3><div class="gw-wrap">${res}</div>`,
      buttons: [{ label: '닫기', value: null, primary: true }],
    });
  }

  async showEnd(s) {
    const g = s.gw;
    const w = g.winner;
    const wp = s.players[w];
    const hot = this.mode === 'hotseat';
    const meWin = w === s.mySeat && !hot;
    this.covered = false;
    $('#gw-cover').hidden = true;
    banner(meWin ? '🏆 내 공방이 1등!' : `🏆 ${wp.name} 1등!`);
    if (meWin || hot || s.mySeat < 0) {
      this.audio.win();
      confetti(3, ['#e0475b', '#3a7bd5', '#2fae6a', '#f3eee2', '#f2b631']);
    } else this.audio.lose();
    await new Promise((r) => setTimeout(r, 1300));
    if (this.state !== s) return;
    const host = s.hostId === s.me || hot;
    const rows = g.ranking
      .map((i, k) => {
        const p = s.players[i];
        const gp = g.players[i];
        return `<li class="${k === 0 ? 'win' : ''}"><span>${PLACE[k]} ${p.emoji} ${esc(p.name)}${i === s.mySeat && !hot ? ' (나)' : ''}</span><b>${gp.pts}점 · 카드 ${gp.cards.length}장</b></li>`;
      })
      .join('');
    const v = await modal({
      title: `${wp.emoji} ${wp.name} 1등!`,
      html: `<ul class="gw-result">${rows}</ul><p class="note">점수가 같으면 카드를 적게 산 사람이 이겨요.</p>`,
      buttons:
        s.mySeat < 0
          ? [{ label: '확인', value: null, primary: true }]
          : [{ label: '메뉴로', value: 'menu' }, ...(host ? [{ label: '🔁 한 판 더', value: 'again', primary: true }] : [{ label: '방장을 기다릴게요', value: 'wait', primary: true }])],
    });
    if (v === 'menu') return this.onMenu?.();
    if (v === 'again') {
      try {
        const lb = this.lobby;
        const hostPid = hot ? lb.seatPids[0] : lb.pid;
        await lb.call('lobby', { code: lb.code, pid: hostPid });
        if (hot) {
          lb.pid = hostPid;
          this.viewSeat = 0;
        }
        await lb.send('start');
      } catch (err) {
        toast(err.message);
      }
    }
  }
}

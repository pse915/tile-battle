// 비밀번호 해독반 — 서버 상태(봇 연습·온라인·📺 테이블 화면·오프라인 테이블)를 받아 그리고, 동작을 보냄
import { $, esc, banner, toast, modal, confetti } from '../../../shared/ui-core.js';
import { OfflineTable } from '../../../shared/offline-table.js';
import { tileImg, backImg, codeImg, TILE_RATIO } from './cards.js';
import { COLOR_NAME, JOKER, numName, candidates } from './rules.js';

const OT_CFG = (audio) => ({
  zones: [],
  actions: { draw: true, reveal: true, order: true },
  backs: [
    { b: 'b', label: '⬛ 검정' },
    { b: 'w', label: '⬜ 흰색' },
  ],
  cardImg: codeImg,
  backImg: (b) => backImg(b),
  tips: '맞혀진 타일은 직접 🔓공개 · 조커는 ◀▶로 자리 옮기기',
  cardRatio: TILE_RATIO,
  onLog: () => audio.place(),
});

export class CodeGame {
  constructor(stage, lobby, shell, audio) {
    this.stage = stage;
    this.lobby = lobby;
    this.shell = shell;
    this.audio = audio;
    this.state = null;
    this.queue = [];
    this.busy = false;
    this.target = null;
    this.hint = false;
    this.sending = false;
    this.labels = [];
    this.ot = null;
    this.seq = 0;
    stage.onTile = (seat, id) => this.pickTarget(seat, id);
    stage.onPile = (c) => this.draw(c);
    stage.s.frame.add(() => this.placeLabels());
  }

  // ---------- 화면 만들기 ----------
  enter(offline) {
    this.shell.enterHud();
    this.stage.setTitleMode(false);
    this.stage.clear();
    this.ot = null;
    if (offline) {
      $('#hud-body').innerHTML = '';
      this.ot = new OfflineTable({ root: $('#hud-body'), lobby: this.lobby, cfg: OT_CFG(this.audio), audio: this.audio });
      return;
    }
    $('#hud-body').innerHTML = `
      <div class="k-log cb-log" id="cb-log"><button type="button" id="cb-log-btn">📜 추리 기록</button><ol id="cb-log-list"></ol></div>
      <div class="k-bottom cb-bottom" id="cb-bottom">
        <div class="cb-flag" id="cb-flag"></div>
        <div class="cb-targets" id="cb-targets" hidden></div>
        <div class="cb-pad" id="cb-pad" hidden></div>
        <div class="k-hand cb-hand" id="cb-hand"></div>
        <div class="k-actions" id="cb-actions"></div>
      </div>`;
    $('#cb-log-btn').addEventListener('click', () => $('#cb-log').classList.toggle('open'));
    $('#cb-bottom').addEventListener('click', (e) => this.onClick(e));
  }

  exit() {
    this.state = null;
    this.queue = [];
    this.ot = null;
    this.target = null;
    this.seq = 0;
    this.stage.clear();
    this.clearLabels();
  }

  onState(s, first) {
    if (first) this.enter(s.mode === 'offline');
    if (s.mode === 'offline') {
      if (!this.ot) this.enter(true);
      this.state = s;
      this.stage.setPile(s.ot ? s.ot.drawBacks || {} : {});
      $('#hud-round').textContent = '🪑 오프라인 테이블';
      this.ot.render(s);
      return;
    }
    this.queue.push(s);
    this.pump();
  }

  async pump() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.queue.length) {
        const s = this.queue.shift();
        const prev = this.state;
        this.state = s;
        if (!s.cb) {
          this.renderWaiting(s);
          continue;
        }
        const fresh = !prev || !prev.cb || prev.cb.gid !== s.cb.gid;
        if (fresh) {
          this.stage.clear();
          this.target = null;
          this.buildLabels(s.players, s.mySeat);
          this.stage.sync(s.cb, s.mySeat, { instant: true });
          this.seq = s.seq;
          this.render();
          if (s.status === 'finished') await this.showEnd(s);
          continue;
        }
        const evs = (s.events || []).filter((e) => e.seq > this.seq);
        this.seq = s.seq;
        for (const e of evs) await this.beforeSync(e, s);
        await this.stage.sync(s.cb, s.mySeat);
        for (const e of evs) this.afterSync(e, s);
        if (this.target && !this.targetValid()) this.target = null;
        this.render();
        if (s.status === 'finished' && prev.status !== 'finished') await this.showEnd(s);
      }
    } finally {
      this.busy = false;
    }
  }

  name(seat) {
    const p = this.state.players[seat];
    return p ? p.name : '?';
  }

  /** 3D가 바뀌기 전 연출: 말풍선, 째깍째깍, 들썩임 */
  async beforeSync(e, s) {
    if (e.type === 'guess') {
      this.bubble(e.seat, `${numName(e.guess)}?`);
      this.audio.dial();
      await this.stage.pulse(e.id);
      if (e.ok) {
        this.audio.ok();
        this.bubble(e.target, '들켰다!', 1400);
      } else {
        this.audio.ng();
        this.bubble(e.target, '땡!', 1400);
        await this.stage.shake(e.id);
      }
    } else if (e.type === 'draw') {
      this.audio.draw();
    } else if (e.type === 'more') {
      this.bubble(e.seat, '계속 추리!', 1300);
    } else if (e.type === 'stop') {
      this.bubble(e.seat, '여기까지', 1300);
    }
  }

  afterSync(e, s) {
    const me = s.mySeat;
    if (e.type === 'draw' || e.type === 'place') this.audio.place();
    if (e.type === 'guess') {
      if (e.ok) toast(`✓ ${this.name(e.seat)}: ${this.name(e.target)}의 ${COLOR_NAME[e.c]} ${numName(e.n)}을(를) 맞혔어요!`, 2000);
      else if (e.reveal) {
        this.audio.flip();
        toast(`✗ 틀림! ${this.name(e.seat)}의 뽑은 타일(${COLOR_NAME[e.reveal.c]} ${numName(e.reveal.n)})이 공개돼요.`, 2400);
      } else if (e.seat === me) toast('✗ 틀렸어요. 내 숨긴 타일 하나를 골라 공개해요.', 2400);
      else toast(`✗ ${this.name(e.seat)}의 추리가 빗나갔어요.`, 1800);
    }
    if (e.type === 'reveal') this.audio.flip();
    (e.out || []).forEach((seat) => {
      this.audio.out();
      banner(seat === me ? '내 비밀번호가 모두 풀렸어요…' : `${this.name(seat)} 탈락!`);
    });
  }

  // ---------- 이름표 ----------
  buildLabels(players, me) {
    const root = $('#labels');
    root.innerHTML = '';
    this.labels = players.map((p, i) => {
      const el = document.createElement('div');
      el.className = 'seat-label cb-label';
      el.innerHTML = `<span class="avatar">${p.emoji}</span><span><span class="name">${esc(p.name)}${i === me && p.name !== '나' ? ' (나)' : ''}</span><span class="meta"></span></span><span class="bubble"></span>`;
      root.appendChild(el);
      return el;
    });
  }

  clearLabels() {
    $('#labels').innerHTML = '';
    this.labels = [];
  }

  bubble(seat, text, ms = 1600) {
    const b = this.labels[seat]?.querySelector('.bubble');
    if (!b) return;
    b.textContent = text;
    b.classList.add('show');
    clearTimeout(b._t);
    b._t = setTimeout(() => b.classList.remove('show'), ms);
  }

  placeLabels() {
    const cb = this.stage.cb;
    if (!this.labels.length || !cb) return;
    const w = innerWidth;
    this.labels.forEach((el, i) => {
      const len = (cb.rows[i] || []).length;
      const p = this.stage.project(this.stage.labelPos(i, len));
      const half = (el.offsetWidth || 90) / 2 + 4;
      const x = Math.min(Math.max(p.x, half), w - half);
      const y = Math.max(p.y, 92);
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -50%)`;
    });
  }

  // ---------- 그리기 ----------
  get myAct() {
    const s = this.state;
    return !!s && !!s.cb && s.status === 'playing' && s.mySeat >= 0 && s.cb.actor === s.mySeat;
  }

  /** 조커 자리 고르기: 처음 나눔 때는 조커를 받은 사람 모두 동시에, 뽑은 뒤에는 내 차례에만 */
  get canPlace() {
    const s = this.state;
    if (!s || !s.cb || s.status !== 'playing' || s.mySeat < 0) return false;
    const hold = s.cb.hold[s.mySeat];
    if (!Array.isArray(hold) || !hold.length) return false;
    return s.cb.phase === 'setup' || (s.cb.phase === 'place' && this.myAct);
  }

  targetValid() {
    const t = this.target;
    const cb = this.state.cb;
    if (!t || !this.myAct || cb.phase !== 'guess') return false;
    const tile = (cb.rows[t.seat] || []).find((x) => x.id === t.id);
    return !!tile && !tile.up && !cb.out[t.seat];
  }

  renderWaiting(s) {
    $('#hud-round').textContent = '비밀번호 해독반';
    const f = $('#cb-flag');
    if (f) f.textContent = s.status === 'lobby' ? '방장이 게임을 시작하길 기다리는 중…' : '';
  }

  render() {
    const s = this.state;
    if (!s || !s.cb || this.ot) return;
    const cb = s.cb;
    const me = s.mySeat;
    const mine = this.myAct;
    const phase = cb.phase;
    $('#hud-round').textContent = `남은 더미 ⬛${cb.pile.b} · ⬜${cb.pile.w}`;
    const tp = s.players[cb.turn];
    $('#hud-table').textContent = s.status !== 'playing' ? '게임 끝' : phase === 'setup' ? '🔑 조커 자리 고르기' : `${tp.emoji} ${tp.name} 차례`;
    // 이름표
    this.labels.forEach((el, i) => {
      const p = s.players[i];
      const row = cb.rows[i] || [];
      const hid = row.filter((t) => !t.up).length + (Array.isArray(cb.hold[i]) ? cb.hold[i].length : cb.hold[i] || 0);
      el.querySelector('.meta').textContent = cb.out[i] ? '🔓 모두 풀림 · 탈락' : `🔒 숨김 ${hid} · 공개 ${row.length - row.filter((t) => !t.up).length}${p.away ? ' · 💤' : ''}`;
      el.classList.toggle('turn', s.status === 'playing' && (phase === 'setup' ? Array.isArray(cb.hold[i]) ? cb.hold[i].length > 0 : cb.hold[i] > 0 : cb.turn === i));
      el.classList.toggle('cb-out', !!cb.out[i]);
      el.classList.toggle('cb-target', !!this.target && this.target.seat === i);
    });
    this.renderLog(s);
    // 안내 줄
    let flag = '';
    if (s.status === 'playing') {
      if (this.canPlace) flag = phase === 'setup' ? '🔑 조커를 받았어요! 아래 ＋ 중 놓을 자리를 골라요' : '🔑 뽑은 조커를 놓을 자리를 골라요 (아래 ＋)';
      else if (mine) {
        flag = {
          setup: '🔑 조커를 받았어요! 아래 ＋ 중 놓을 자리를 골라요',
          place: '🔑 뽑은 조커를 놓을 자리를 골라요 (아래 ＋)',
          draw: '가운데 더미에서 타일 하나를 뽑아요 (색을 골라요)',
          guess: this.target ? `${this.name(this.target.seat)}의 ${this.posOf(this.target) + 1}번째 타일은 몇일까요?` : '🔍 다른 사람의 숨긴 타일을 하나 눌러요',
          decide: `✓ 정답! (연속 ${cb.streak}개) 계속 추리할까요?`,
          penalty: '✗ 틀렸어요! 내 숨긴 타일 하나를 눌러 공개해요',
        }[phase];
      } else if (phase === 'setup') flag = '🔑 조커를 받은 사람이 자리를 고르는 중…';
      else flag = `${tp.emoji} ${tp.name} ${phase === 'draw' ? '타일 뽑는 중…' : '추리 중…'}`;
    } else flag = cb.winner >= 0 ? `🏆 ${s.players[cb.winner].emoji} ${s.players[cb.winner].name} 승리!` : '게임 끝';
    $('#cb-flag').textContent = flag;
    $('#cb-flag').classList.toggle('mine', mine || this.canPlace);
    const spectator = me < 0;
    $('#cb-bottom').classList.toggle('is-watch', spectator);
    this.renderTargets(s, mine && phase === 'guess');
    this.renderPad(s, mine && phase === 'guess' && !!this.target);
    this.renderHand(s, spectator);
    this.renderActions(s, mine);
    this.stage.select(this.target ? this.target.id : 0);
  }

  posOf(t) {
    return (this.state.cb.rows[t.seat] || []).findIndex((x) => x.id === t.id);
  }

  renderLog(s) {
    const list = $('#cb-log-list');
    if (!list) return;
    const hist = s.cb.history || [];
    list.innerHTML = hist.length
      ? hist
          .slice(-40)
          .map((h) => `<li class="${h.ok ? 'ok' : 'ng'}">${esc(this.name(h.by))} → ${esc(this.name(h.target))}의 ${h.pos}번째 타일: ${numName(h.guess)}? <b>${h.ok ? '✓' : '✗'}</b></li>`)
          .join('')
      : '<li class="empty">아직 추리가 없어요</li>';
    list.scrollTop = 1e6;
  }

  renderTargets(s, on) {
    const box = $('#cb-targets');
    box.hidden = !on;
    if (!on) return;
    const cb = s.cb;
    box.innerHTML = s.players
      .map((p, seat) => {
        if (seat === s.mySeat || cb.out[seat]) return '';
        const tiles = cb.rows[seat]
          .map((t) => {
            if (t.up) return `<span class="cb-mt up"><img src="${tileImg(t.c, t.n)}" alt="${COLOR_NAME[t.c]} ${numName(t.n)}"></span>`;
            const sel = this.target && this.target.id === t.id;
            return `<button type="button" class="cb-mt${sel ? ' sel' : ''}" data-target="${seat}:${t.id}" aria-label="${esc(p.name)}의 ${COLOR_NAME[t.c]} 숨긴 타일"><img src="${backImg(t.c)}" alt=""></button>`;
          })
          .join('');
        return `<div class="cb-trow"><span class="who">${p.emoji} ${esc(p.name)}</span><div class="cb-mini">${tiles}</div></div>`;
      })
      .join('');
  }

  renderPad(s, on) {
    const pad = $('#cb-pad');
    pad.hidden = !on;
    if (!on) return;
    const cb = s.cb;
    const tile = cb.rows[this.target.seat].find((t) => t.id === this.target.id);
    let cand = null;
    if (this.hint) {
      const hold = Array.isArray(cb.hold[s.mySeat]) ? cb.hold[s.mySeat] : [];
      cand = candidates(cb.rows, s.mySeat, cb.history, hold)[tile.id] || null;
    }
    const nums = [];
    for (let v = 0; v <= JOKER; v++) {
      const off = cand && !cand.includes(v);
      nums.push(`<button type="button" class="btn cb-num${v === JOKER ? ' joker' : ''}${off ? ' is-off' : ''}" data-guess="${v}">${v === JOKER ? '🔑 조커' : v}</button>`);
    }
    pad.innerHTML = `
      <div class="cb-pad-head">
        <img src="${backImg(tile.c)}" alt=""><span><b>${esc(this.name(this.target.seat))}</b>의 ${this.posOf(this.target) + 1}번째 · ${COLOR_NAME[tile.c]}</span>
        <button type="button" class="btn small${this.hint ? ' is-on' : ''}" data-hint>💡 후보</button>
        <button type="button" class="btn small" data-cancel>취소</button>
      </div>
      <div class="cb-nums">${nums.join('')}</div>
      ${cand ? `<p class="cb-cand">정렬 규칙과 보이는 타일로 따져 본 후보: <b>${cand.map(numName).join(', ')}</b></p>` : ''}`;
  }

  renderHand(s, spectator) {
    const hand = $('#cb-hand');
    hand.hidden = spectator;
    if (spectator) return;
    const cb = s.cb;
    const me = s.mySeat;
    const row = cb.rows[me] || [];
    const hold = Array.isArray(cb.hold[me]) ? cb.hold[me] : [];
    const placing = this.canPlace;
    const penalty = this.myAct && cb.phase === 'penalty';
    const parts = [];
    if (placing) {
      parts.push(`<span class="cb-holding"><img src="${tileImg(hold[0].c, hold[0].n)}" alt="조커"><small>놓을<br>조커</small></span>`);
      parts.push(`<button type="button" class="cb-slot" data-slot="0" aria-label="맨 앞에 놓기">＋</button>`);
    }
    row.forEach((t, i) => {
      const cls = ['k-card', 'cb-tile'];
      if (t.up) cls.push('is-up');
      if (t.id === cb.fresh) cls.push('ok');
      if (penalty && !t.up) cls.push('pickable');
      parts.push(
        `<button type="button" class="${cls.join(' ')}" ${penalty && !t.up ? `data-penalty="${t.id}"` : 'tabindex="-1"'} aria-label="${COLOR_NAME[t.c]} ${numName(t.n)}${t.up ? ' (공개됨)' : ''}"><img src="${tileImg(t.c, t.n)}" alt="">${t.up ? '<span class="cb-badge">공개</span>' : ''}</button>`,
      );
      if (placing) parts.push(`<button type="button" class="cb-slot" data-slot="${i + 1}" aria-label="${i + 1}번째 뒤에 놓기">＋</button>`);
    });
    if (!placing && hold.length) parts.push(`<span class="cb-holding wait"><img src="${tileImg(hold[0].c, hold[0].n)}" alt="조커"><small>자리<br>고르기</small></span>`);
    hand.innerHTML = parts.join('') || '<span class="cb-empty">타일이 없어요</span>';
    hand.classList.toggle('placing', !!placing);
  }

  renderActions(s, mine) {
    const box = $('#cb-actions');
    const cb = s.cb;
    const b = [];
    if (mine && cb.phase === 'draw') {
      b.push(`<button type="button" class="btn cb-draw b${cb.pile.b ? '' : ' is-off'}" data-draw="b"><img src="${backImg('b')}" alt="">검정 뽑기 <small>${cb.pile.b}개</small></button>`);
      b.push(`<button type="button" class="btn cb-draw w${cb.pile.w ? '' : ' is-off'}" data-draw="w"><img src="${backImg('w')}" alt="">흰색 뽑기 <small>${cb.pile.w}개</small></button>`);
    } else if (mine && cb.phase === 'decide') {
      b.push(`<button type="button" class="btn primary" data-decide="1">🔍 계속 추리</button>`);
      b.push(`<button type="button" class="btn" data-decide="0">✋ 멈추기${cb.fresh ? ' (뽑은 타일은 숨긴 채)' : ''}</button>`);
    }
    box.innerHTML = b.join('');
    box.hidden = !b.length;
  }

  // ---------- 동작 ----------
  async onClick(e) {
    const t = e.target.closest('[data-target],[data-guess],[data-draw],[data-decide],[data-penalty],[data-slot],[data-hint],[data-cancel]');
    if (!t) return;
    const d = t.dataset;
    if (d.target) {
      const [seat, id] = d.target.split(':').map(Number);
      return this.pickTarget(seat, id);
    }
    if (d.hint != null) {
      this.hint = !this.hint;
      return this.render();
    }
    if (d.cancel != null) {
      this.target = null;
      return this.render();
    }
    if (d.guess != null) return this.guess(Number(d.guess));
    if (d.draw) return this.draw(d.draw);
    if (d.decide != null) return this.act('decide', { more: d.decide === '1' });
    if (d.penalty) return this.act('penalty', { id: Number(d.penalty) });
    if (d.slot != null) return this.act('place', { idx: Number(d.slot) });
  }

  pickTarget(seat, id) {
    const s = this.state;
    if (!this.myAct || s.cb.phase !== 'guess') return;
    if (seat === s.mySeat) return;
    const tile = (s.cb.rows[seat] || []).find((x) => x.id === id);
    if (!tile || tile.up || s.cb.out[seat]) return;
    this.target = { seat, id };
    this.audio.select();
    this.render();
  }

  draw(c) {
    const s = this.state;
    if (!this.myAct || s.cb.phase !== 'draw') return;
    if (!s.cb.pile[c]) {
      this.audio.error();
      return toast(`${COLOR_NAME[c]} 타일이 다 떨어졌어요. 다른 색을 골라요.`);
    }
    return this.act('draw', { color: c });
  }

  guess(v) {
    if (!this.target) return;
    const t = this.target;
    this.target = null;
    return this.act('guess', { target: t.seat, id: t.id, value: v });
  }

  async act(action, payload) {
    if (this.sending || this.busy) return;
    this.sending = true;
    try {
      const ok = await this.lobby.send(action, payload);
      if (!ok) this.render();
    } finally {
      this.sending = false;
    }
  }

  async showEnd(s) {
    const cb = s.cb;
    const w = cb.winner;
    const me = s.mySeat;
    const wp = s.players[w];
    banner(wp ? `${wp.name} 승리!` : '게임 끝');
    if (w === me) {
      this.audio.win();
      confetti(3, ['#6ff0c8', '#f3ecd9', '#1a1c24', '#ffd84d']);
      this.stage.celebrate();
    } else if (me >= 0) this.audio.lose();
    await new Promise((r) => setTimeout(r, 1400));
    if (this.state !== s) return;
    const host = s.hostId === s.me;
    const order = s.players.map((p, i) => ({ p, i, hid: (cb.rows[i] || []).filter((t) => !t.up).length })).sort((a, b) => (b.i === w) - (a.i === w) || b.hid - a.hid);
    const v = await modal({
      title: wp ? `🏆 ${wp.emoji} ${wp.name} 승리!` : '게임 끝',
      html: `<p class="note">마지막까지 비밀번호를 지킨 사람이 이겼어요.</p>
        <ul class="cb-result">${order.map(({ p, i, hid }) => `<li class="${i === w ? 'win' : ''}"><span>${p.emoji} ${esc(p.name)}${i === me ? ' (나)' : ''}</span><b>${i === w ? `숨김 ${hid}개 남김` : '탈락'}</b></li>`).join('')}</ul>`,
      buttons: [{ label: '메뉴로', value: 'menu' }, ...(host ? [{ label: '🔁 한 판 더', value: 'again', primary: true }] : [{ label: '방장을 기다릴게요', value: 'wait', primary: true }])],
    });
    if (v === 'menu') return this.onMenu?.();
    if (v === 'again') {
      try {
        await this.lobby.call('lobby', { code: this.lobby.code, pid: this.lobby.pid });
        await this.lobby.send('start');
      } catch (err) {
        toast(err.message);
      }
    }
  }

  // ---------- 튜토리얼용: 서버 없이 판만 보여 주기 ----------
  showLocal(cb, players, opts = {}) {
    if (!this.labels.length || this.labels.length !== players.length) this.buildLabels(players, 0);
    return this.stage.sync(cb, 0, opts);
  }
}

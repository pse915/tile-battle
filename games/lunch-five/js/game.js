// 급식 다섯! — 서버 상태(한 기기 파티·봇 연습·온라인·📺 테이블 화면·🪑 오프라인)를 받아 그리고, 뒤집기/종을 보냄
// 한 기기 파티: 화면 가장자리마다 큰 종 + 뒤집기 버튼, pointerdown이라 여러 손가락이 동시에 눌러도 따로 감
import { $, esc, banner, toast, modal, confetti } from '../../../shared/ui-core.js';
import { OfflineTable } from '../../../shared/offline-table.js';
import { MENU_NAME } from './rules.js';
import { EDGES } from './scene.js';
import { cardImage, backImage } from './cards.js';

const CORNERS = ['tl', 'tr', 'bl', 'br'];
const HOT_KEYS = [
  ['q', 'w'],
  ['o', 'p'],
  ['z', 'x'],
  ['n', 'm'],
];
export const NET_NOTE = '네트워크 지연이 있을 수 있어요. 공정한 대결은 한 기기 파티 모드나 오프라인 테이블 모드를 추천!';

const OFFLINE_CFG = (audio) => ({
  zones: [{ id: 'open', name: '공개 더미', kind: 'pile', perSeat: true }],
  actions: { flipTop: true, collect: true, give: true },
  cardImg: (c) => cardImage(c),
  backImg: () => backImage(),
  cardRatio: 1.4,
  tips: '종은 실물 종이나 손바닥으로! 맞으면 🧺 테이블 카드 가져가기, 틀리면 🎁 맨 위 1장씩 모두에게',
  onLog: (evs) => {
    const t = evs[evs.length - 1].text || '';
    if (t.includes('뒤집음')) audio.flip();
    else if (t.includes('테이블 카드')) {
      audio.bell();
      audio.correct();
    } else if (t.includes('카드 1장 줌')) audio.give();
    else audio.click();
  },
});

export class LunchGame {
  constructor(view, lobby, shell, audio) {
    this.view = view;
    this.lobby = lobby;
    this.shell = shell;
    this.audio = audio;
    this.state = null;
    this.latest = null;
    this.queue = [];
    this.busy = false;
    this.mode = null;
    this.ot = null;
    this.labels = [];
    this.pressed = {};
    this.pending = {};
    this.onKey = (e) => this.key(e);
    this.onDown = (e) => this.down(e);
    this.frameFn = () => this.placeLabels();
  }

  // ---------- 들어가기 / 나가기 ----------
  onState(s, first) {
    this.latest = s;
    if (s.mode === 'offline') return this.offlineState(s, first);
    if (first || !this.mode) this.enter(s);
    this.queue.push(s);
    this.pump();
  }

  modeFor(s) {
    if (s.mySeat < 0) return 'watch';
    if (this.lobby.local) return this.lobby.seatPids ? 'hotseat' : 'practice';
    return 'online';
  }

  enter(s) {
    this.mode = this.modeFor(s);
    this.state = null;
    this.queue = [];
    this.lastSeq = 0;
    this.shell.enterHud();
    this.view.setTitleMode(false);
    document.body.classList.toggle('lf-hot', this.mode === 'hotseat');
    document.body.classList.toggle('lf-watch', this.mode === 'watch');
    this.view.setCamera(this.mode === 'hotseat' ? 'top' : 'side');
    $('#hud-body').innerHTML = `
      <div class="lf-note" id="lf-note" ${this.mode === 'online' ? '' : 'hidden'}>📶 ${NET_NOTE}</div>
      <div class="lf-pads" id="lf-pads"></div>
      <div class="k-bottom lf-bottom" id="lf-me" hidden>
        <div class="lf-me-info" id="lf-me-info"></div>
        <div class="lf-me-row">
          <button class="lf-btn lf-flip" data-flip="me">🃏 뒤집기</button>
          <button class="lf-btn lf-bell" data-bell="me">🔔 종!</button>
        </div>
      </div>`;
    $('#hud-body').addEventListener('pointerdown', this.onDown);
    window.addEventListener('keydown', this.onKey);
    this.view.onPick = (d) => this.pick(d);
    this.view.s.frame.add(this.frameFn);
  }

  exit() {
    if (this.ot) this.ot = null;
    this.mode = null;
    this.state = null;
    this.latest = null;
    this.queue = [];
    this.view.onPick = null;
    this.view.s.frame.delete(this.frameFn);
    window.removeEventListener('keydown', this.onKey);
    $('#hud-body')?.removeEventListener('pointerdown', this.onDown);
    document.body.classList.remove('lf-hot', 'lf-watch', 'lf-offline');
    this.labels = [];
    $('#labels').innerHTML = '';
    this.view.setCamera('side');
  }

  /** 한 기기 파티: 사람은 위·아래·왼쪽·오른쪽, 봇은 남은 자리 */
  edgesFor(s) {
    if (this.mode !== 'hotseat') return null;
    const humans = this.lobby.seatPids.length;
    const free = EDGES.slice(humans).concat(CORNERS);
    return s.players.map((p, i) => (i < humans ? EDGES[i] : free[i - humans]));
  }

  layout(s) {
    const me = s.mySeat >= 0 && this.mode !== 'hotseat' ? s.mySeat : 0;
    this.edges = this.edgesFor(s);
    this.view.setLayout(s.players.length, { me, edges: this.edges });
    this.view.sync(s.lf);
    this.buildLabels(s);
    this.buildControls(s);
  }

  // ---------- 상태 큐 + 연출 ----------
  async pump() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.queue.length) {
        const s = this.queue.shift();
        if (!s.lf) continue;
        const fast = this.queue.length > 1;
        let evs = (s.events || []).filter((e) => e.seq > this.lastSeq);
        const startAt = evs.map((e) => e.type).lastIndexOf('start');
        if (!this.state || startAt >= 0) {
          // 처음이거나 새 판: 연출 없이 바로 맞춤
          this.state = s;
          this.layout(s);
          evs = startAt >= 0 ? evs.slice(startAt + 1) : [];
          if (!this.lastSeq) evs = [];
          this.endShown = false;
        }
        this.state = s;
        for (const ev of evs) await this.play(ev, s, fast);
        this.lastSeq = Math.max(this.lastSeq, s.seq || 0);
        this.view.sync(s.lf);
        this.render();
        if (s.status === 'finished' && !this.endShown) {
          this.endShown = true;
          await this.showEnd(s);
        }
      }
    } finally {
      this.busy = false;
    }
  }

  nameOf(s, seat) {
    const p = s.players[seat];
    return p ? p.name : '?';
  }

  async play(ev, s, fast) {
    if (ev.type === 'flip') {
      this.audio.flip();
      if (!fast) await this.view.animateFlip(ev.seat, ev.card, 0.28);
    } else if (ev.type === 'ring') {
      const mine = performance.now() - (this.pressed[ev.seat] || 0) < 1500;
      if (!mine) {
        this.audio.bell();
        this.view.ringBell(ev.ok);
      } else if (!ev.ok) this.view.s.shake = 0.35;
      if (ev.ok) {
        this.audio.correct();
        this.bubble(ev.seat, `+${ev.got}장! 🎉`);
        banner(`🔔 ${this.nameOf(s, ev.seat)} 정답! ${MENU_NAME[ev.menu] || ''} 5개`);
        const human = !s.players[ev.seat]?.bot && (this.mode === 'hotseat' || ev.seat === s.mySeat);
        if (human && !fast) confetti(1.2);
        if (!fast) await this.view.animateCollect(ev.seat, 0.5);
      } else {
        this.audio.wrong();
        this.bubble(ev.seat, '땡! 아니에요 😵', true);
        if (!fast) await this.view.animateGive(ev.seat, ev.gave || [], 0.4);
      }
    } else if (ev.type === 'out') {
      this.audio.out();
      toast(`${this.nameOf(s, ev.seat)} 카드가 다 떨어져서 탈락!`, 2200);
    }
  }

  // ---------- 화면 ----------
  buildLabels(s) {
    $('#labels').innerHTML = s.players
      .map(
        (p, i) => `<div class="seat-label lf-label" id="lf-l${i}">
          <span class="avatar">${p.emoji}</span>
          <span><span class="name">${esc(p.name)}${i === s.mySeat && this.mode !== 'hotseat' ? ' (나)' : ''}</span><span class="meta" id="lf-lm${i}"></span></span>
          <span class="bubble" id="lf-lb${i}"></span></div>`,
      )
      .join('');
    this.labels = s.players.map((_, i) => $(`#lf-l${i}`));
    // 한 기기 파티: 사람 이름표는 가장자리 패드가 대신함
    if (this.mode === 'hotseat') this.labels.forEach((el, i) => i < this.lobby.seatPids.length && (el.hidden = true));
  }

  placeLabels() {
    this.labels.forEach((el, i) => {
      if (!el || el.hidden) return;
      const p = this.view.labelPoint(i);
      if (p) el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
    });
  }

  buildControls(s) {
    const me = $('#lf-me');
    const pads = $('#lf-pads');
    me.hidden = !(this.mode === 'practice' || this.mode === 'online');
    pads.innerHTML = '';
    if (this.mode !== 'hotseat') return;
    pads.innerHTML = this.lobby.seatPids
      .map((_, i) => {
        const p = s.players[i];
        return `<div class="lf-pad e-${this.edges[i]}" id="lf-pad${i}">
          <div class="lf-pad-in">
            <div class="lf-pad-name"><span>${p.emoji} ${esc(p.name)}</span><b id="lf-pc${i}"></b></div>
            <button class="lf-btn lf-flip" data-flip="${i}">🃏 뒤집기</button>
            <button class="lf-btn lf-bell" data-bell="${i}">🔔</button>
            <div class="lf-pad-msg" id="lf-pm${i}"></div>
          </div></div>`;
      })
      .join('');
  }

  render() {
    const s = this.state;
    if (!s || !s.lf) return;
    const lf = s.lf;
    const tp = s.players[lf.turn];
    $('#hud-round').textContent = `🍱 ${lf.flips}/${lf.maxFlips}장 뒤집음`;
    $('#hud-table').textContent = lf.over ? '🏁 끝!' : tp ? `🃏 ${tp.emoji} ${tp.name} 차례` : '';
    s.players.forEach((p, i) => {
      const el = this.labels[i];
      if (!el) return;
      el.classList.toggle('turn', !lf.over && lf.turn === i);
      el.classList.toggle('lf-out', !!lf.out[i]);
      const m = $(`#lf-lm${i}`);
      if (m) m.textContent = lf.out[i] ? '탈락' : `🂠 ${lf.piles[i]}장`;
    });
    if (this.mode === 'practice' || this.mode === 'online') {
      const i = s.mySeat;
      const myTurn = !lf.over && lf.turn === i && !lf.out[i];
      $('#lf-me-info').innerHTML = lf.out[i]
        ? '😢 탈락했어요. 끝까지 구경해요!'
        : `내 더미 <b>${lf.piles[i]}</b>장 · ${myTurn ? '<b class="lf-go">내 차례! 뒤집으세요</b>' : `${tp ? esc(tp.name) : ''} 차례`}`;
      document.querySelector('#lf-me .lf-flip').classList.toggle('on', myTurn);
      document.querySelectorAll('#lf-me .lf-btn').forEach((b) => b.classList.toggle('off', !!lf.out[i] || lf.over));
    }
    if (this.mode === 'hotseat') {
      this.lobby.seatPids.forEach((_, i) => {
        const pad = $(`#lf-pad${i}`);
        if (!pad) return;
        pad.classList.toggle('turn', !lf.over && lf.turn === i);
        pad.classList.toggle('out', !!lf.out[i]);
        $(`#lf-pc${i}`).textContent = lf.out[i] ? '탈락' : `${lf.piles[i]}장`;
      });
    }
  }

  bubble(seat, text, bad = false) {
    const b = $(`#lf-lb${seat}`);
    if (b) {
      b.textContent = text;
      b.classList.add('show');
      clearTimeout(b._t);
      b._t = setTimeout(() => b.classList.remove('show'), 1600);
    }
    const label = this.labels[seat];
    if (label && bad) {
      label.classList.remove('lf-shake');
      void label.offsetWidth;
      label.classList.add('lf-shake');
    }
    const msg = $(`#lf-pm${seat}`);
    if (msg) {
      msg.textContent = text;
      msg.classList.remove('show', 'bad');
      void msg.offsetWidth;
      msg.classList.add('show');
      msg.classList.toggle('bad', bad);
      const pad = $(`#lf-pad${seat}`);
      if (bad && pad) {
        pad.classList.remove('lf-shake');
        void pad.offsetWidth;
        pad.classList.add('lf-shake');
      }
    }
  }

  // ---------- 입력 ----------
  seatOf(v) {
    if (v === 'me') return this.latest?.mySeat ?? -1;
    return Number(v);
  }

  down(e) {
    const b = e.target.closest('[data-flip],[data-bell]');
    if (!b) return;
    e.preventDefault();
    if (b.dataset.bell != null) this.ring(this.seatOf(b.dataset.bell), b);
    else this.flip(this.seatOf(b.dataset.flip), b);
  }

  key(e) {
    if (e.repeat || !this.latest || this.latest.status !== 'playing' || e.target.closest?.('input, textarea')) return;
    const k = e.key.toLowerCase();
    if (this.mode === 'hotseat') {
      HOT_KEYS.forEach(([f, r], i) => {
        if (i >= this.lobby.seatPids.length) return;
        if (k === f) this.flip(i);
        if (k === r) this.ring(i);
      });
    } else if (this.mode === 'practice' || this.mode === 'online') {
      if (k === ' ') {
        e.preventDefault();
        this.ring(this.latest.mySeat);
      } else if (k === 'enter' || k === 'f') this.flip(this.latest.mySeat);
    }
  }

  pick(d) {
    if (this.mode !== 'practice' && this.mode !== 'online') return;
    const me = this.latest?.mySeat;
    if (d.bell) this.ring(me);
    else if (d.seat === me) this.flip(me);
  }

  payload(seat, extra = {}) {
    if (this.mode === 'hotseat') extra.pid = this.lobby.seatPids[seat];
    return extra;
  }

  pressFx(btn) {
    if (!btn) return;
    btn.classList.remove('hit');
    void btn.offsetWidth;
    btn.classList.add('hit');
  }

  async ring(seat, btn) {
    const s = this.latest;
    if (!s || s.status !== 'playing' || !s.lf || seat < 0) return;
    if (s.lf.out[seat]) return toast('탈락해서 종을 칠 수 없어요.');
    const now = performance.now();
    if (now - (this.pressed[seat] || 0) < 300) return;
    this.pressed[seat] = now;
    this.pressFx(btn);
    this.audio.bell();
    this.view.ringBell(true);
    // 내가 '본' 판 번호로 보냄 → 그 사이 판이 바뀌었으면 벌칙 없이 '한 발 늦었어요'
    const tick = this.state?.lf ? this.state.lf.tick : s.lf.tick;
    await this.lobby.send('ring', this.payload(seat, { tick }));
  }

  async flip(seat, btn) {
    const s = this.latest;
    if (!s || s.status !== 'playing' || !s.lf || seat < 0 || this.pending[seat]) return;
    if (s.lf.out[seat]) return;
    if (s.lf.turn !== seat) {
      this.audio.error();
      const tp = s.players[s.lf.turn];
      return toast(`지금은 ${tp ? tp.name : '다른 사람'} 차례예요.`);
    }
    this.pressFx(btn);
    this.pending[seat] = true;
    try {
      await this.lobby.send('flip', this.payload(seat));
    } finally {
      this.pending[seat] = false;
    }
  }

  // ---------- 끝 ----------
  async showEnd(s) {
    const lf = s.lf;
    const w = s.players[lf.winner];
    const order = s.players.map((p, i) => ({ p, i, n: p.cards || 0 })).sort((a, b) => (a.i === lf.winner ? -1 : b.i === lf.winner ? 1 : b.n - a.n));
    const meWin = this.mode === 'hotseat' ? w && !w.bot : lf.winner === s.mySeat;
    banner(w ? `🏆 ${w.name} 승리!` : '끝!');
    if (meWin) {
      this.audio.win();
      confetti();
      this.view.celebrate();
    } else if (this.mode !== 'watch') this.audio.lose();
    await new Promise((r) => setTimeout(r, 1200));
    if (this.state !== s || !this.mode) return;
    const host = s.hostId === s.me;
    const rows = order
      .map(({ p, i, n }, k) => `<tr><td>${k + 1}. ${p.emoji} ${esc(p.name)}</td><td>${lf.out[i] ? '탈락' : `${n}장`}</td></tr>`)
      .join('');
    const v = await modal({
      title: w ? `🏆 ${w.emoji} ${w.name} 승리!` : '게임 끝',
      html: `<p class="note">${lf.reason === 'limit' ? `${lf.maxFlips}장을 다 뒤집어서 카드가 가장 많은 사람이 이겼어요.` : '마지막까지 카드가 남은 사람이 이겼어요!'}</p>
             <table class="result-table"><tr><th>순위</th><th>카드</th></tr>${rows}</table>`,
      buttons: [{ label: '메뉴로', value: 'menu' }, ...(host ? [{ label: '🔁 한 판 더', value: 'again', primary: true }] : [{ label: this.mode === 'watch' ? '확인' : '방장을 기다릴게요', value: 'wait', primary: true }])],
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

  // ---------- 🪑 오프라인 테이블 모드 ----------
  offlineState(s, first) {
    if (first || !this.ot) {
      this.exit();
      this.mode = 'offline';
      this.shell.enterHud();
      document.body.classList.add('lf-offline');
      this.view.setTitleMode(false);
      this.view.setCamera('side');
      $('#hud-round').textContent = '🪑 오프라인 테이블';
      $('#hud-body').innerHTML = '';
      this.ot = new OfflineTable({ root: $('#hud-body'), lobby: this.lobby, cfg: OFFLINE_CFG(this.audio), audio: this.audio });
      this.view.setLayout(s.players.length, { me: Math.max(0, s.mySeat) });
    }
    this.ot.render(s);
    // 3D 배경: 공개 더미 맨 위 카드와 더미 높이만 맞춤
    const ot = s.ot;
    if (!ot) return;
    if (this.view.seats.length !== s.players.length) this.view.setLayout(s.players.length, { me: Math.max(0, s.mySeat) });
    this.view.sync({
      piles: ot.hands.map((h) => h.length),
      open: s.players.map((_, i) => {
        const rows = ot.zones['open:' + i] || [];
        const all = [].concat(...rows);
        return { top: all.length ? all[all.length - 1].f : null, count: all.length };
      }),
      out: [],
    });
  }
}

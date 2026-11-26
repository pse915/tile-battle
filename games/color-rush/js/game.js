// 컬러 러시 — 서버 상태(온라인·봇 연습·튜토리얼)를 받아 3D 테이블과 손패를 그리고, 동작을 보냄
import { $, esc, banner, toast, modal, closeModal, confetti } from '../../../shared/ui-core.js';
import { OfflineTable } from '../../../shared/offline-table.js';
import { cardImg, backImg, swatchImg, CARD_RATIO } from './cards.js';
import { COLORS, COLOR_NAME, COLOR_HEX, COLOR_ICON, cardName, compareCodes, isWild } from './rules.js';

export class CRGame {
  constructor(view, lobby, shell, audio) {
    this.view = view;
    this.lobby = lobby;
    this.shell = shell;
    this.audio = audio;
    this.state = null;
    this.queue = [];
    this.busy = false;
    this.seq = 0;
    this.armed = false;
    this.logs = [];
    this.labels = [];
    this.localSend = null;
    this.ot = null;
    this.endShown = -1;
    this.view.onDraw = () => this.tapDrawPile();
    this.view.stage.frame.add(() => this.placeLabels());
  }

  enter(mode) {
    this.mode = mode;
    this.shell.enterHud();
    this.view.setTitleMode(false);
    this.ot = null;
    this.logs = [];
    this.seq = 0;
    this.armed = false;
    this.endShown = -1;
    this.state = null;
    $('#hud-body').innerHTML = `
      <div class="cr-top">
        <div class="cr-chip" id="cr-color"></div>
        <div class="cr-chip small" id="cr-dir"></div>
      </div>
      <div class="k-log" id="cr-log"><button type="button" id="cr-log-btn">📜 기록</button><ol id="cr-log-list"></ol></div>
      <div class="k-flag cr-flag" id="cr-flag" hidden></div>
      <div class="k-bottom cr-bottom" id="cr-bottom">
        <div class="k-actions" id="cr-actions"></div>
        <div class="k-hand" id="cr-hand"></div>
      </div>`;
    $('#cr-log-btn').addEventListener('click', () => $('#cr-log').classList.toggle('open'));
    $('#cr-hand').addEventListener('click', (e) => {
      const b = e.target.closest('[data-code]');
      if (b) this.onCard(b.dataset.code);
    });
    $('#cr-actions').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) this.onAct(b.dataset.act);
    });
  }

  exit() {
    this.state = null;
    this.queue = [];
    this.localSend = null;
    this.ot = null;
    this.labels = [];
    this.view.setDrawHint(false);
    this.view.setTurn(-1);
    $('#labels').innerHTML = '';
  }

  /** 튜토리얼: 서버 대신 이 함수로 보냄 */
  startLocal(sendFn) {
    this.enter('tutorial');
    this.localSend = sendFn;
  }

  send(action, payload = {}) {
    if (this.localSend) return Promise.resolve(this.localSend(action, payload));
    return this.lobby.send(action, payload);
  }

  get me() {
    return this.state ? this.state.mySeat : -1;
  }
  pname(seat) {
    const p = this.state?.players[seat];
    if (!p) return '';
    return seat === this.me ? '나' : p.name;
  }
  myTurn() {
    const s = this.state;
    return !!(s && s.cr && s.status === 'playing' && s.cr.phase !== 'over' && s.mySeat >= 0 && s.cr.turn === s.mySeat);
  }

  onState(s, first) {
    if (first) this.enter(this.localSend ? 'tutorial' : this.lobby.local ? 'practice' : 'online');
    this.queue.push(s);
    this.pump();
  }

  async pump() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.queue.length) {
        const s = this.queue.shift();
        if (s.mode === 'offline') {
          this.renderOffline(s);
          continue;
        }
        if (s.status === 'lobby' || !s.cr) {
          this.state = s;
          this.renderWaiting(s);
          continue;
        }
        const prev = this.state && this.state.cr ? this.state : null;
        const evs = (s.events || []).filter((e) => e.seq > this.seq);
        const lastSeq = Math.max(this.seq, ...(s.events || []).map((e) => e.seq || 0));
        const wasMine = this.myTurn();
        this.state = s;
        const gap = evs.length && evs[0].seq > this.seq + 1 && this.seq > 0;
        if (!prev || gap || evs.some((e) => e.type === 'start') || this.queue.length > 3) {
          if (evs.some((e) => e.type === 'start')) {
            this.endShown = -1;
            this.logs = [];
            this.addLog('🔀 카드를 섞어 7장씩 나눴어요!');
          }
          evs.forEach((e) => this.logEvent(e, s));
          this.view.sync(s.cr, s.players.length, s.mySeat);
          this.render();
        } else {
          this.renderHand(); // 내 패는 바로
          for (const e of evs) {
            await this.animateEvent(e, s);
            if (this.state !== s) break; // 그사이 메뉴로 나감
          }
          if (this.state !== s) continue;
          this.view.sync(s.cr, s.players.length, s.mySeat);
          this.render();
        }
        this.seq = lastSeq;
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

  // ---------- 연출 ----------
  async animateEvent(e, s) {
    const v = this.view;
    this.logEvent(e, s);
    switch (e.type) {
      case 'play': {
        this.audio.play();
        await v.animatePlay(e.seat, e.code);
        v.setColor(e.color);
        if (isWild(e.code)) {
          this.audio.colorPick();
          banner(`${COLOR_ICON[e.color]} ${COLOR_NAME[e.color]} 색으로!`);
        }
        this.renderTop(e.color);
        break;
      }
      case 'draw': {
        if (!e.n) break;
        if (e.forced) {
          this.audio.plus(e.forced);
          banner(e.seat === this.me ? `😱 내가 +${e.forced}장!` : `${this.pname(e.seat)} +${e.forced}장!`);
        }
        for (let i = 0; i < Math.min(e.n, 4); i++) this.audio.draw(i);
        await v.animateDraw(e.seat, e.n);
        break;
      }
      case 'skip':
        this.audio.skip();
        this.bubble(e.seat, '⊘ 건너뜀!');
        if (e.seat === this.me) banner('⊘ 내 차례를 건너뛰어요!');
        v.bump(e.seat);
        await v.wait(0.35);
        break;
      case 'reverse':
        this.audio.reverse();
        if (!e.asSkip) {
          banner('⇄ 방향 바꾸기!');
          await v.setDir(e.dir, true);
          this.renderDir(e.dir);
        }
        break;
      case 'pass':
        this.bubble(e.seat, '넘김');
        break;
      case 'call':
        this.audio.shout();
        this.bubble(e.seat, '📣 마지막!', 2000);
        if (e.seat === this.me) banner('📣 마지막!');
        await v.wait(0.3);
        break;
      case 'catch':
        this.audio.catchCall();
        banner(e.target === this.me ? '👉 지적당했어요! +2장' : `👉 ${this.pname(e.target)} 지적! +2장`);
        this.bubble(e.by, '👉 지적!');
        await v.wait(0.4);
        if (e.n) {
          for (let i = 0; i < e.n; i++) this.audio.draw(i);
          await v.animateDraw(e.target, e.n);
        }
        break;
      case 'recycle':
        toast('뽑을 카드가 떨어져서 버린 더미를 섞었어요 ♻️');
        await v.animateRecycle(e.n);
        break;
      default:
        break;
    }
  }

  logEvent(e, s) {
    const nm = (seat) => {
      const p = s.players[seat];
      return p ? `${p.emoji} ${seat === s.mySeat ? '나' : p.name}` : '';
    };
    let t = '';
    if (e.type === 'play') t = `${nm(e.seat)}: ${cardName(e.code)}${isWild(e.code) ? ` → ${COLOR_NAME[e.color]}` : ''}`;
    else if (e.type === 'draw') t = e.forced ? `${nm(e.seat)}: +${e.forced} 받아 ${e.n}장 뽑음` : `${nm(e.seat)}: 1장 뽑음`;
    else if (e.type === 'skip') t = `${nm(e.seat)}: 건너뜀`;
    else if (e.type === 'reverse' && !e.asSkip) t = '⇄ 방향이 바뀜';
    else if (e.type === 'pass') t = `${nm(e.seat)}: 넘김`;
    else if (e.type === 'call') t = `📣 ${nm(e.seat)}: 마지막!`;
    else if (e.type === 'catch') t = `👉 ${nm(e.by)} → ${nm(e.target)} 지적! +${e.n}장`;
    else if (e.type === 'recycle') t = '♻️ 버린 더미를 섞어 다시 씀';
    else if (e.type === 'end') t = `🏆 ${nm(e.winner)} 승리!`;
    if (t) this.addLog(t);
  }

  addLog(t) {
    this.logs.push(t);
    if (this.logs.length > 40) this.logs.shift();
    const ol = $('#cr-log-list');
    if (!ol) return;
    ol.innerHTML = this.logs.map((x) => `<li>${esc(x)}</li>`).join('');
    ol.scrollTop = 1e6;
  }

  // ---------- 그리기 ----------
  render() {
    const s = this.state;
    if (!s || !s.cr || !$('#cr-hand')) return;
    const cr = s.cr;
    this.renderTop(cr.color);
    this.renderDir(cr.dir);
    this.renderLabels();
    this.renderHand();
    const turnP = s.players[cr.turn];
    $('#hud-round').textContent = `뽑을 더미 ${cr.drawCount}장`;
    $('#hud-table').textContent = cr.phase === 'over' ? '🏁 판 끝!' : `${turnP.emoji} ${this.pname(cr.turn)} 차례`;
  }

  renderTop(col) {
    const el = $('#cr-color');
    if (!el) return;
    el.innerHTML = `<span class="dot" style="background:${COLOR_HEX[col]}"><img src="${swatchImg(col)}" alt=""></span>지금 색 <b>${COLOR_NAME[col]}</b>`;
    el.style.setProperty('--cc', COLOR_HEX[col]);
  }
  renderDir(dir) {
    const el = $('#cr-dir');
    if (el) el.textContent = dir === 1 ? '↻ 시계 방향' : '↺ 반대 방향';
  }

  renderHand() {
    const s = this.state;
    if (!s || !s.cr || !$('#cr-hand')) return;
    const cr = s.cr;
    const spectator = s.mySeat < 0;
    $('#cr-bottom').hidden = spectator;
    const mine = this.myTurn();
    this.view.setDrawHint(mine && cr.phase === 'play' && !cr.playable.length);
    if (!spectator) {
      const hand = cr.hand.slice().sort(compareCodes);
      const n = hand.length;
      const el = $('#cr-hand');
      el.style.setProperty('--k-cw', n > 14 ? '50px' : n > 10 ? '56px' : '64px');
      el.style.setProperty('--k-cw-m', n > 12 ? '42px' : '48px');
      let drawnMarked = false;
      el.innerHTML = hand
        .map((c) => {
          const ok = mine && cr.playable.includes(c);
          let cls = ok ? ' ok' : mine ? ' dim' : '';
          if (cr.drawn === c && !drawnMarked) {
            drawnMarked = true;
            cls += ' sel';
          }
          return `<button class="k-card${cls}" data-code="${c}" aria-label="${cardName(c)}"><img src="${cardImg(c)}" alt=""></button>`;
        })
        .join('');
      if (cr.drawn) el.querySelector('.sel')?.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    // 버튼
    const b = [];
    const me = s.mySeat;
    if (!spectator && cr.phase !== 'over') {
      if (cr.unsafe >= 0 && cr.unsafe !== me) b.push(`<button class="btn cr-catch" data-act="catch">👉 ${esc(this.pname(cr.unsafe))} 지적하기!</button>`);
      if (cr.unsafe === me) b.push('<button class="btn primary cr-last pulse" data-act="call">📣 마지막!</button>');
      else if (mine && cr.hand.length === 2 && cr.playable.length)
        b.push(`<button class="btn cr-last${this.armed ? ' is-armed' : ''}" data-act="arm">📣 마지막!${this.armed ? ' ✔' : ''}</button>`);
      if (mine && cr.phase === 'play') b.push(`<button class="btn${cr.playable.length ? '' : ' primary'}" data-act="draw">🃏 1장 뽑기</button>`);
      if (mine && cr.phase === 'drawn') {
        b.push('<button class="btn primary" data-act="playDrawn">▶ 뽑은 카드 내기</button>');
        b.push('<button class="btn" data-act="pass">⏭ 넘기기</button>');
      }
    }
    $('#cr-actions').innerHTML = b.join('');
    $('#cr-actions').hidden = !b.length;
    // 안내 깃발
    const flag = $('#cr-flag');
    const tp = s.players[cr.turn];
    flag.hidden = cr.phase === 'over';
    flag.classList.toggle('mine', mine);
    if (spectator) flag.textContent = `${tp.emoji} ${tp.name} 차례`;
    else if (mine && cr.phase === 'drawn') flag.textContent = '뽑은 카드를 낼 수 있어요! 낼까요?';
    else if (mine && cr.playable.length) flag.textContent = cr.hand.length === 2 ? '내 차례! 📣 마지막!을 누르고 내세요' : '내 차례! 초록 테두리 카드를 내세요';
    else if (mine) flag.textContent = '낼 카드가 없어요 · 1장 뽑기';
    else flag.textContent = `${tp.emoji} ${tp.name} 차례…`;
  }

  renderLabels() {
    const s = this.state;
    const n = s.players.length;
    if (this.labels.length !== n) {
      $('#labels').innerHTML = s.players.map((_, i) => `<div class="seat-label" data-seat="${i}"><span class="avatar"></span><span><span class="name"></span><span class="meta"></span></span><span class="bubble"></span></div>`).join('');
      this.labels = [...$('#labels').querySelectorAll('.seat-label')];
    }
    const cr = s.cr;
    s.players.forEach((p, i) => {
      const el = this.labels[i];
      el.hidden = i === s.mySeat;
      el.classList.toggle('turn', cr.phase !== 'over' && cr.turn === i);
      el.classList.toggle('danger', cr.counts[i] === 1);
      el.querySelector('.avatar').textContent = p.emoji;
      el.querySelector('.name').textContent = p.name + (p.away ? ' 💤' : '');
      el.querySelector('.meta').textContent = `🂠 ${cr.counts[i]}장${cr.counts[i] === 1 ? ' · 마지막!' : ''}`;
    });
  }

  placeLabels() {
    if (!this.labels.length || !this.state) return;
    this.labels.forEach((el, i) => {
      if (el.hidden) return;
      const p = this.view.stage.project(this.view.labelPos(i));
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
    });
  }

  bubble(seat, text, ms = 1300) {
    const el = this.labels[seat]?.querySelector('.bubble');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), ms);
  }

  renderWaiting(s) {
    $('#hud-round').textContent = '';
    $('#hud-table').textContent = s.status === 'lobby' ? '📺 방장이 시작하길 기다리는 중…' : '';
    const bottom = $('#cr-bottom');
    if (bottom) bottom.hidden = true;
  }

  // ---------- 입력 ----------
  async onCard(code) {
    const s = this.state;
    if (!s || !s.cr || this.sending) return;
    const cr = s.cr;
    if (!this.myTurn()) {
      this.audio.error();
      return toast('아직 내 차례가 아니에요.');
    }
    if (!cr.playable.includes(code)) {
      this.audio.error();
      return toast(cr.phase === 'drawn' ? '방금 뽑은 카드만 낼 수 있어요. 아니면 넘기세요.' : '맨 위 카드와 색이나 숫자/기호가 같은 카드만 낼 수 있어요.');
    }
    let color;
    if (isWild(code)) {
      color = await this.pickColor(code);
      if (!color) return;
    }
    const call = this.armed && cr.hand.length === 2;
    this.armed = false;
    this.sending = true;
    try {
      const ok = await this.send('play', { card: code, color, call });
      if (!ok) this.renderHand();
    } finally {
      this.sending = false;
    }
  }

  async onAct(act) {
    const s = this.state;
    if (!s || !s.cr) return;
    if (act === 'arm') {
      this.armed = !this.armed;
      if (this.armed) {
        this.audio.myTurn();
        toast('카드를 내면 “마지막!”을 같이 외쳐요');
      }
      return this.renderHand();
    }
    if (this.sending) return;
    if (act === 'playDrawn') return this.onCard(s.cr.drawn);
    this.sending = true;
    try {
      if (act === 'draw') await this.send('draw');
      else if (act === 'pass') await this.send('pass');
      else if (act === 'call') await this.send('call');
      else if (act === 'catch') await this.send('catch');
    } finally {
      this.sending = false;
    }
  }

  tapDrawPile() {
    const s = this.state;
    if (!s || !s.cr || !this.myTurn() || s.cr.phase !== 'play') return;
    this.onAct('draw');
  }

  pickColor(code) {
    const hand = this.state.cr.hand.slice();
    hand.splice(hand.indexOf(code), 1);
    const n = (c) => hand.filter((x) => x[0] === c).length;
    return new Promise((resolve) => {
      modal({
        title: '🎨 어떤 색으로 바꿀까요?',
        html: `<div class="k-swatches cr-swatches">${COLORS.map(
          (c) => `<button type="button" class="btn" data-col="${c}" style="--sw:${COLOR_HEX[c]}"><img src="${swatchImg(c)}" alt=""><span>${COLOR_NAME[c]}<small>내 패 ${n(c)}장</small></span></button>`,
        ).join('')}</div>`,
        buttons: [{ label: '취소', value: null }],
      }).then(() => resolve(null));
      $('#modal-body')
        .querySelectorAll('[data-col]')
        .forEach((b) =>
          b.addEventListener('click', () => {
            closeModal();
            resolve(b.dataset.col);
          }),
        );
    });
  }

  // ---------- 끝 ----------
  async showEnd(s) {
    const cr = s.cr;
    const w = cr.winner;
    const wp = s.players[w];
    const meWin = w === s.mySeat;
    banner(meWin ? '🏆 내가 이겼어요!' : `🏆 ${wp.name} 승리!`);
    if (meWin) {
      this.audio.win();
      confetti(3, ['#3ad6b4', '#ff5ca8', '#ff9a2e', '#9b7bff', '#ffffff']);
      this.view.celebrate();
    } else if (s.mySeat >= 0) this.audio.lose();
    else this.audio.win();
    if (this.mode === 'tutorial') return;
    await new Promise((r) => setTimeout(r, 1300));
    if (this.state !== s) return;
    const host = s.hostId === s.me;
    const rows = s.players
      .map((p, i) => ({ p, i, n: cr.counts[i] }))
      .sort((a, b) => a.n - b.n)
      .map((r) => `<li class="${r.i === w ? 'win' : ''}"><span>${r.p.emoji} ${esc(r.p.name)}${r.i === s.mySeat ? ' (나)' : ''}</span><b>${r.i === w ? '🏆 다 냄!' : `남은 카드 ${r.n}장`}</b></li>`)
      .join('');
    const v = await modal({
      title: `${wp.emoji} ${wp.name} 승리!`,
      html: `<ul class="cr-result">${rows}</ul><p class="note">${cr.moves}번 만에 끝났어요.</p>`,
      buttons:
        s.mySeat < 0
          ? [{ label: '확인', value: null, primary: true }]
          : [{ label: '메뉴로', value: 'menu' }, ...(host ? [{ label: '🔁 한 판 더', value: 'again', primary: true }] : [{ label: '방장을 기다릴게요', value: 'wait', primary: true }])],
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

  // ---------- 오프라인 테이블 모드 ----------
  renderOffline(s) {
    this.state = s;
    if (!this.ot) {
      $('#labels').innerHTML = '';
      this.labels = [];
      this.ot = new OfflineTable({
        root: $('#hud-body'),
        lobby: this.lobby,
        audio: this.audio,
        cfg: {
          zones: [{ id: 'discard', name: '버린 더미', kind: 'pile' }],
          actions: { draw: true, play: true, take: true, give: true, recycle: true },
          cardImg: (f) => cardImg(f),
          backImg: () => backImg(),
          tips: '색이나 숫자가 같으면 내요 · 한 장 남으면 “마지막!” 외치기',
          cardRatio: CARD_RATIO,
          onLog: (evs) => {
            const t = evs[evs.length - 1].text;
            if (t.includes('뽑음')) this.audio.draw();
            else if (t.includes('버린 더미') && t.includes('→')) this.audio.play();
            else if (t.includes('섞')) this.audio.reverse();
            else if (t.includes('끝')) this.audio.win();
            else this.audio.click();
          },
        },
      });
    }
    this.ot.render(s);
    $('#hud-round').textContent = '🪑 오프라인 테이블';
    // 뒤 3D: 공개된 것만 (버린 더미 맨 위, 장수)
    const ot = s.ot;
    if (!ot) return;
    const rows = ot.zones.discard || [];
    const pile = [];
    rows.forEach((r) => r.forEach((c) => pile.push(c.f)));
    this.view.setPlayers(s.players.length, s.mySeat);
    ot.hands.forEach((h, i) => this.view.setFan(i, h.length));
    this.view.setDrawCount(ot.drawCount);
    this.view.setPile(pile.slice(-6));
    const top = pile[pile.length - 1];
    if (top && top[0] !== 'w') this.view.setColor(top[0]);
    this.view.setTurn(ot.turn);
  }
}

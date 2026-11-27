// 원카드 — 서버 상태(온라인·봇 연습·한 기기·튜토리얼)를 받아 3D 테이블과 손패를 그리고, 동작을 보냄
import { $, esc, banner, toast, modal, closeModal, confetti } from '../../../shared/ui-core.js';
import { OfflineTable } from '../../../shared/offline-table.js';
import { cardImg, backImg, suitImg, CARD_RATIO } from './cards.js';
import { SUITS, SUIT_SYM, SUIT_NAME, cardName, compareCodes, isJoker, power } from './rules.js';

const PLACE = ['🥇', '🥈', '🥉', '4등', '5등'];

export class OCGame {
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
    this.covered = false;
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
    this.covered = false;
    $('#hud-body').innerHTML = `
      <div class="oc-top">
        <div class="oc-chip" id="oc-suit"></div>
        <div class="oc-chip small" id="oc-dir"></div>
      </div>
      <div class="oc-attack" id="oc-attack" hidden></div>
      <div class="k-log" id="oc-log"><button type="button" id="oc-log-btn">📜 기록</button><ol id="oc-log-list"></ol></div>
      <div class="k-flag oc-flag" id="oc-flag" hidden></div>
      <div class="k-bottom oc-bottom" id="oc-bottom">
        <div class="k-actions" id="oc-actions"></div>
        <div class="k-hand" id="oc-hand"></div>
      </div>
      <div class="oc-cover" id="oc-cover" hidden></div>`;
    $('#oc-log-btn').addEventListener('click', () => $('#oc-log').classList.toggle('open'));
    $('#oc-hand').addEventListener('click', (e) => {
      const b = e.target.closest('[data-code]');
      if (b) this.onCard(b.dataset.code);
    });
    $('#oc-actions').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) this.onAct(b.dataset.act);
    });
    $('#oc-cover').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) this.onAct(b.dataset.act);
    });
    if (mode === 'hotseat') this.setupHotseat();
  }

  exit() {
    this.state = null;
    this.queue = [];
    this.localSend = null;
    this.ot = null;
    this.labels = [];
    clearInterval(this.pingTimer);
    this.view.setDrawHint(false);
    this.view.setTurn(-1);
    this.view.setAttack(0);
    $('#labels').innerHTML = '';
  }

  startLocal(sendFn) {
    this.enter('tutorial');
    this.localSend = sendFn;
  }

  send(action, payload = {}) {
    if (this.localSend) return Promise.resolve(this.localSend(action, payload));
    return this.lobby.send(action, payload);
  }

  // ---------- 한 기기 여러 명 ----------
  /** 화면을 보는 사람(viewSeat)의 pid로만 폴링하고, 다른 사람은 '접속 중' 표시만 따로 보냄 */
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

  /** 기기를 넘겨받은 사람이 버튼을 누르면 그 사람 시점으로 바꿈 */
  takeOver(seat) {
    const lb = this.lobby;
    this.viewSeat = seat;
    lb.pid = lb.seatPids[seat];
    this.covered = false;
    $('#oc-cover').hidden = true;
    lb.version = -1;
    clearTimeout(lb.timer);
    lb.poll();
  }

  showCover(s) {
    const oc = s.oc;
    const next = s.players[oc.turn];
    const cur = s.players[s.mySeat];
    this.covered = true;
    const el = $('#oc-cover');
    const shout = oc.unsafe === s.mySeat ? `<button class="btn oc-last pulse" data-act="call">📣 ${esc(cur.name)}: 원카드!</button>` : '';
    el.innerHTML = `<div class="oc-cover-box">
      <p class="big">🙈</p>
      <h2>${esc(next.emoji)} ${esc(next.name)} 차례예요</h2>
      <p>패가 보이지 않게 기기를 <b>${esc(next.name)}</b>에게 넘겨 주세요.</p>
      ${shout}
      <button class="btn primary big" data-act="takeover">제가 ${esc(next.name)}이에요 ▶</button>
    </div>`;
    el.hidden = false;
    $('#oc-bottom').hidden = true;
  }

  get me() {
    return this.state ? this.state.mySeat : -1;
  }
  pname(seat) {
    const p = this.state?.players[seat];
    if (!p) return '';
    return seat === this.me && this.mode !== 'hotseat' ? '나' : p.name;
  }
  myTurn() {
    const s = this.state;
    return !!(s && s.oc && s.status === 'playing' && s.oc.phase !== 'over' && s.mySeat >= 0 && s.oc.turn === s.mySeat && !this.covered);
  }

  onState(s, first) {
    if (first) this.enter(this.localSend ? 'tutorial' : this.lobby.local ? (this.lobby.seatPids ? 'hotseat' : 'practice') : 'online');
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
        if (s.status === 'lobby' || !s.oc) {
          this.state = s;
          this.renderWaiting(s);
          continue;
        }
        const prev = this.state && this.state.oc ? this.state : null;
        const evs = (s.events || []).filter((e) => e.seq > this.seq);
        const lastSeq = Math.max(this.seq, ...(s.events || []).map((e) => e.seq || 0));
        const wasMine = this.myTurn();
        this.state = s;
        const gap = evs.length && evs[0].seq > this.seq + 1 && this.seq > 0;
        if (!prev || gap || evs.some((e) => e.type === 'start') || this.queue.length > 3) {
          if (evs.some((e) => e.type === 'start')) {
            this.endShown = -1;
            this.logs = [];
            this.addLog(`🔀 카드를 섞어 ${s.oc.opts.hand}장씩 나눴어요!`);
          }
          evs.forEach((e) => this.logEvent(e, s));
          this.view.sync(s.oc, s.players.length, s.mySeat);
          this.render();
        } else {
          this.renderHand();
          for (const e of evs) {
            await this.animateEvent(e, s);
            if (this.state !== s) break;
          }
          if (this.state !== s) continue;
          this.view.sync(s.oc, s.players.length, s.mySeat);
          this.render();
        }
        this.seq = lastSeq;
        // 한 기기: 차례가 다른 사람에게 가면 가림막
        if (this.mode === 'hotseat' && s.status === 'playing' && s.oc.turn !== s.mySeat && !s.players[s.oc.turn].bot) this.showCover(s);
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
        const pw = power(e.code);
        this.audio.play();
        await v.animatePlay(e.seat, e.code);
        v.setColor(e.suit);
        if (e.defend) {
          this.audio.block();
          v.block();
          this.bubble(e.seat, '🛡 막고 넘김!');
        } else if (pw) this.audio.attack(pw);
        if (!isJoker(e.code) && e.code[1] === '7') {
          this.audio.suitPick();
          banner(`${SUIT_SYM[e.suit]} ${SUIT_NAME[e.suit]}로 바꿈!`);
        }
        v.setAttack(e.attack);
        this.renderTop(e.suit);
        this.renderAttack(e.attack);
        break;
      }
      case 'attack':
        banner(e.to === this.me && this.mode !== 'hotseat' ? `💥 +${e.total} 공격이 나에게!` : `💥 ${this.pname(e.to)}에게 +${e.total} 공격!`);
        v.bump(e.to);
        await v.wait(0.25);
        break;
      case 'take': {
        this.audio.hit();
        await v.hit(e.seat, e.forced);
        banner(e.seat === this.me && this.mode !== 'hotseat' ? `😱 못 막아서 +${e.n}장!` : `${this.pname(e.seat)} +${e.n}장!`);
        for (let i = 0; i < Math.min(e.n, 5); i++) this.audio.draw(i);
        if (e.n) await v.animateDraw(e.seat, e.n);
        v.setAttack(0);
        this.renderAttack(0);
        break;
      }
      case 'draw':
        if (!e.n) break;
        this.audio.draw();
        await v.animateDraw(e.seat, e.n);
        break;
      case 'skip':
        this.audio.skip();
        this.bubble(e.seat, '⊘ 건너뜀!');
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
      case 'again':
        this.audio.again();
        this.bubble(e.seat, '👑 한 번 더!');
        await v.wait(0.25);
        break;
      case 'pass':
        this.bubble(e.seat, '넘김');
        break;
      case 'call':
        this.audio.shout();
        this.bubble(e.seat, '📣 원카드!', 2000);
        banner(`📣 ${this.pname(e.seat)}: 원카드!`);
        await v.wait(0.3);
        break;
      case 'catch':
        this.audio.catchCall();
        banner(e.target === this.me && this.mode !== 'hotseat' ? '👉 지적당했어요! +1장' : `👉 ${this.pname(e.target)} 지적! +1장`);
        this.bubble(e.by, '👉 지적!');
        await v.wait(0.4);
        if (e.n) {
          this.audio.draw();
          await v.animateDraw(e.target, e.n);
        }
        break;
      case 'finish':
        this.audio.win();
        banner(`${PLACE[e.place - 1]} ${this.pname(e.seat)} 다 냈어요!`);
        this.bubble(e.seat, `${PLACE[e.place - 1]} 끝!`, 2500);
        await v.wait(0.5);
        break;
      case 'bust':
        this.audio.bust();
        v.s.shake = 0.6;
        banner(`💥 ${this.pname(e.seat)} 파산! (${e.n}장)`);
        v.setFan(e.seat, 0);
        await v.wait(0.6);
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
      return p ? `${p.emoji} ${seat === s.mySeat && this.mode !== 'hotseat' ? '나' : p.name}` : '';
    };
    let t = '';
    if (e.type === 'play') t = `${nm(e.seat)}: ${cardName(e.code)}${e.defend ? ' 🛡 막기' : ''}${!isJoker(e.code) && e.code[1] === '7' ? ` → ${SUIT_SYM[e.suit]}` : ''}`;
    else if (e.type === 'attack') t = `💥 ${nm(e.to)}에게 +${e.total}`;
    else if (e.type === 'take') t = `${nm(e.seat)}: 공격 받아 ${e.n}장`;
    else if (e.type === 'draw') t = `${nm(e.seat)}: 1장 뽑음`;
    else if (e.type === 'skip') t = `${nm(e.seat)}: 건너뜀`;
    else if (e.type === 'reverse' && !e.asSkip) t = '⇄ 방향이 바뀜';
    else if (e.type === 'again') t = `${nm(e.seat)}: 한 번 더`;
    else if (e.type === 'pass') t = `${nm(e.seat)}: 넘김`;
    else if (e.type === 'call') t = `📣 ${nm(e.seat)}: 원카드!`;
    else if (e.type === 'catch') t = `👉 ${nm(e.by)} → ${nm(e.target)} 지적! +${e.n}장`;
    else if (e.type === 'finish') t = `${PLACE[e.place - 1]} ${nm(e.seat)} 다 냄`;
    else if (e.type === 'bust') t = `💥 ${nm(e.seat)} 파산`;
    else if (e.type === 'recycle') t = '♻️ 버린 더미를 섞어 다시 씀';
    else if (e.type === 'end') t = `🏆 ${nm(e.winner)} 1등!`;
    if (t) this.addLog(t);
  }

  addLog(t) {
    this.logs.push(t);
    if (this.logs.length > 40) this.logs.shift();
    const ol = $('#oc-log-list');
    if (!ol) return;
    ol.innerHTML = this.logs.map((x) => `<li>${esc(x)}</li>`).join('');
    ol.scrollTop = 1e6;
  }

  // ---------- 그리기 ----------
  render() {
    const s = this.state;
    if (!s || !s.oc || !$('#oc-hand')) return;
    const oc = s.oc;
    this.renderTop(oc.suit);
    this.renderDir(oc.dir);
    this.renderAttack(oc.attack);
    this.renderLabels();
    this.renderHand();
    const turnP = s.players[oc.turn];
    $('#hud-round').textContent = `뽑을 더미 ${oc.drawCount}장 · 파산 ${oc.opts.bust}장`;
    $('#hud-table').textContent = oc.phase === 'over' ? '🏁 판 끝!' : `${turnP.emoji} ${this.pname(oc.turn)} 차례`;
  }

  renderTop(suit) {
    const el = $('#oc-suit');
    if (!el) return;
    if (!suit) {
      el.innerHTML = `<span class="dot"><img src="${suitImg(null)}" alt=""></span>지금 무늬 <b>아무거나</b>`;
      el.dataset.red = '';
      return;
    }
    const red = suit === 'h' || suit === 'd';
    el.innerHTML = `<span class="dot"><img src="${suitImg(suit)}" alt=""></span>지금 무늬 <b class="${red ? 'red' : ''}">${SUIT_SYM[suit]} ${SUIT_NAME[suit]}</b>`;
    el.dataset.red = red ? '1' : '';
  }
  renderDir(dir) {
    const el = $('#oc-dir');
    if (el) el.textContent = dir === 1 ? '↻ 시계 방향' : '↺ 반대 방향';
  }
  renderAttack(n) {
    const el = $('#oc-attack');
    if (!el) return;
    el.hidden = !n;
    if (n) {
      const was = el.dataset.n;
      el.innerHTML = `<b>+${n}</b> 공격 중!`;
      el.dataset.n = n;
      if (was !== String(n)) {
        el.classList.remove('pop');
        void el.offsetWidth;
        el.classList.add('pop');
      }
    } else el.dataset.n = '';
  }

  renderHand() {
    const s = this.state;
    if (!s || !s.oc || !$('#oc-hand')) return;
    const oc = s.oc;
    const out = s.mySeat >= 0 && oc.status[s.mySeat] !== 'in';
    const spectator = s.mySeat < 0;
    $('#oc-bottom').hidden = spectator || this.covered;
    const mine = this.myTurn();
    this.view.setDrawHint(mine && oc.phase === 'play' && !oc.playable.length);
    if (!spectator) {
      const hand = oc.hand.slice().sort(compareCodes);
      const n = hand.length;
      const el = $('#oc-hand');
      el.style.setProperty('--k-cw', n > 14 ? '50px' : n > 10 ? '56px' : '64px');
      el.style.setProperty('--k-cw-m', n > 12 ? '40px' : n > 9 ? '44px' : '50px');
      let drawnMarked = false;
      el.innerHTML = hand
        .map((c) => {
          const ok = mine && oc.playable.includes(c);
          let cls = ok ? ' ok' : mine ? ' dim' : '';
          if (oc.drawn === c && !drawnMarked) {
            drawnMarked = true;
            cls += ' sel';
          }
          return `<button class="k-card${cls}" data-code="${c}" aria-label="${cardName(c)}"><img src="${cardImg(c)}" alt=""></button>`;
        })
        .join('');
      if (oc.drawn) el.querySelector('.sel')?.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    const b = [];
    const me = s.mySeat;
    if (!spectator && oc.phase !== 'over' && !out) {
      if (oc.unsafe >= 0 && oc.unsafe !== me) b.push(`<button class="btn oc-catch" data-act="catch">👉 ${esc(this.pname(oc.unsafe))} 지적하기!</button>`);
      if (oc.unsafe === me) b.push('<button class="btn primary oc-last pulse" data-act="call">📣 원카드!</button>');
      else if (mine && oc.hand.length === 2 && oc.playable.length)
        b.push(`<button class="btn oc-last${this.armed ? ' is-armed' : ''}" data-act="arm">📣 원카드!${this.armed ? ' ✔' : ''}</button>`);
      if (mine && oc.phase === 'play') {
        if (oc.attack > 0) b.push(`<button class="btn${oc.playable.length ? '' : ' primary'} oc-take" data-act="draw">😣 +${oc.attack}장 받기</button>`);
        else b.push(`<button class="btn${oc.playable.length ? '' : ' primary'}" data-act="draw">🃏 1장 뽑기</button>`);
      }
      if (mine && oc.phase === 'drawn') {
        b.push('<button class="btn primary" data-act="playDrawn">▶ 뽑은 카드 내기</button>');
        b.push('<button class="btn" data-act="pass">⏭ 넘기기</button>');
      }
    }
    $('#oc-actions').innerHTML = b.join('');
    $('#oc-actions').hidden = !b.length;
    const flag = $('#oc-flag');
    const tp = s.players[oc.turn];
    flag.hidden = oc.phase === 'over' || this.covered;
    flag.classList.toggle('mine', mine);
    flag.classList.toggle('danger', mine && oc.attack > 0);
    if (spectator) flag.textContent = `${tp.emoji} ${tp.name} 차례`;
    else if (out) flag.textContent = oc.status[me] === 'done' ? `🎉 다 냈어요! 나머지 순위를 구경해요 · ${tp.emoji} ${tp.name} 차례` : `💥 파산했어요… 구경 중 · ${tp.emoji} ${tp.name} 차례`;
    else if (mine && oc.attack > 0)
      flag.textContent = oc.playable.length ? `🛡 막을 수 있어요! 초록 카드로 막기 · 아니면 +${oc.attack}장 받기` : `막을 카드가 없어요 · +${oc.attack}장 받기`;
    else if (mine && oc.phase === 'drawn') flag.textContent = '뽑은 카드를 낼 수 있어요! 낼까요?';
    else if (mine && oc.playable.length) flag.textContent = oc.hand.length === 2 ? '내 차례! 📣 원카드!를 누르고 내세요' : '내 차례! 초록 테두리 카드를 내세요';
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
    const oc = s.oc;
    s.players.forEach((p, i) => {
      const el = this.labels[i];
      el.hidden = i === s.mySeat;
      el.classList.toggle('turn', oc.phase !== 'over' && oc.turn === i);
      el.classList.toggle('danger', oc.counts[i] === 1 && oc.status[i] === 'in');
      el.classList.toggle('out', oc.status[i] !== 'in');
      el.querySelector('.avatar').textContent = p.emoji;
      el.querySelector('.name').textContent = p.name + (p.away ? ' 💤' : '');
      let meta = `🂠 ${oc.counts[i]}장${oc.counts[i] === 1 ? ' · 원카드!' : ''}`;
      if (oc.status[i] === 'done') meta = `${PLACE[oc.places.indexOf(i)]} 다 냄`;
      else if (oc.status[i] === 'bust') meta = '💥 파산';
      else if (oc.counts[i] >= oc.opts.bust - 4) meta += ' ⚠️';
      el.querySelector('.meta').textContent = meta;
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
    const bottom = $('#oc-bottom');
    if (bottom) bottom.hidden = true;
  }

  // ---------- 입력 ----------
  async onCard(code) {
    const s = this.state;
    if (!s || !s.oc || this.sending) return;
    const oc = s.oc;
    if (!this.myTurn()) {
      this.audio.error();
      return toast('아직 내 차례가 아니에요.');
    }
    if (!oc.playable.includes(code)) {
      this.audio.error();
      if (oc.phase === 'drawn') return toast('방금 뽑은 카드만 낼 수 있어요. 아니면 넘기세요.');
      if (oc.attack > 0) return toast('공격 중! 같은 숫자 공격, 같은 무늬의 더 센 공격, 조커로만 막을 수 있어요.');
      return toast('맨 위 카드와 무늬나 숫자/문자가 같은 카드만 낼 수 있어요.');
    }
    let suit;
    if (!isJoker(code) && code[1] === '7') {
      suit = await this.pickSuit(code);
      if (!suit) return;
    }
    const call = this.armed && oc.hand.length === 2;
    this.armed = false;
    this.sending = true;
    try {
      const ok = await this.send('play', { card: code, suit, call });
      if (!ok) this.renderHand();
    } finally {
      this.sending = false;
    }
  }

  async onAct(act) {
    const s = this.state;
    if (!s || !s.oc) return;
    if (act === 'takeover') return this.takeOver(s.oc.turn);
    if (act === 'arm') {
      this.armed = !this.armed;
      if (this.armed) {
        this.audio.myTurn();
        toast('카드를 내면 “원카드!”를 같이 외쳐요');
      }
      return this.renderHand();
    }
    if (this.sending) return;
    if (act === 'playDrawn') return this.onCard(s.oc.drawn);
    this.sending = true;
    try {
      if (act === 'draw') await this.send('draw');
      else if (act === 'pass') await this.send('pass');
      else if (act === 'call') {
        await this.send('call');
        if (this.covered) $('#oc-cover').querySelector('.oc-last')?.remove();
      } else if (act === 'catch') await this.send('catch');
    } finally {
      this.sending = false;
    }
  }

  tapDrawPile() {
    const s = this.state;
    if (!s || !s.oc || !this.myTurn() || s.oc.phase !== 'play') return;
    this.onAct('draw');
  }

  pickSuit(code) {
    const hand = this.state.oc.hand.slice();
    hand.splice(hand.indexOf(code), 1);
    const n = (su) => hand.filter((x) => x[0] === su).length;
    return new Promise((resolve) => {
      modal({
        title: '7! 어떤 무늬로 바꿀까요?',
        html: `<div class="k-swatches oc-swatches">${SUITS.map(
          (su) =>
            `<button type="button" class="btn${su === 'h' || su === 'd' ? ' red' : ''}" data-suit="${su}"><img src="${suitImg(su)}" alt=""><span>${SUIT_SYM[su]} ${SUIT_NAME[su]}<small>내 패 ${n(su)}장</small></span></button>`,
        ).join('')}</div>`,
        buttons: [{ label: '취소', value: null }],
      }).then(() => resolve(null));
      $('#modal-body')
        .querySelectorAll('[data-suit]')
        .forEach((b) =>
          b.addEventListener('click', () => {
            closeModal();
            resolve(b.dataset.suit);
          }),
        );
    });
  }

  // ---------- 끝 ----------
  async showEnd(s) {
    const oc = s.oc;
    const w = oc.winner;
    const wp = s.players[w];
    const hot = this.mode === 'hotseat';
    const meWin = w === s.mySeat && !hot;
    this.covered = false;
    $('#oc-cover').hidden = true;
    banner(meWin ? '🏆 내가 1등!' : `🏆 ${wp.name} 1등!`);
    if (meWin || hot) {
      this.audio.win();
      confetti(3, ['#e2384d', '#1f2a3a', '#ffd84d', '#5cc8ff', '#ffffff']);
      this.view.celebrate();
    } else if (s.mySeat >= 0) this.audio.lose();
    else this.audio.win();
    if (this.mode === 'tutorial') return;
    await new Promise((r) => setTimeout(r, 1300));
    if (this.state !== s) return;
    const host = s.hostId === s.me || hot;
    const rows = (oc.ranking || [])
      .map((i, k) => {
        const p = s.players[i];
        const why = oc.status[i] === 'done' ? '다 냄!' : oc.status[i] === 'bust' ? '💥 파산' : `남은 카드 ${oc.counts[i]}장`;
        return `<li class="${k === 0 ? 'win' : ''}"><span>${PLACE[k]} ${p.emoji} ${esc(p.name)}${i === s.mySeat && !hot ? ' (나)' : ''}</span><b>${why}</b></li>`;
      })
      .join('');
    const v = await modal({
      title: `${wp.emoji} ${wp.name} 1등!`,
      html: `<ul class="oc-result">${rows}</ul><p class="note">${oc.moves}번 만에 끝났어요.</p>`,
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
          tips: '무늬나 숫자가 같으면 내요 · 2·A·조커는 공격 · 한 장 남으면 “원카드!”',
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
    if (top) this.view.setColor(isJoker(top) ? null : top[0]);
    this.view.setTurn(ot.turn);
  }
}

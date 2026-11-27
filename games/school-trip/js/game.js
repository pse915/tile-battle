// 서라벌학교여행 — 서버 상태(온라인·봇 연습·한 기기 여러 명)를 받아 이벤트를 차례로 연출하고, 버튼으로 요청을 보냄
import { $, esc, banner, toast, modal, confetti } from '../../../shared/ui-core.js';
import { CELLS, CARDS, BUILD_NAMES, BAIL, rentOf, rentTable, buildCost, assetsOf, hasMonopoly, won, isProp } from './rules.js';
import { PAWN_CSS } from './scene.js';

const KIND_TEXT = {
  start: '출발 칸이에요. 지나가거나 멈추면 용돈 200만 원!',
  jail: '숙직실: 여기로 보내지면 3턴 동안 쉬어요. 더블이 나오거나 50만 원을 내면 바로 나가요. (그냥 지나가면 구경만)',
  welfare: '복지실: 멈추면 복지 기부함에 쌓인 돈을 모두 받아요.',
  elev: '엘리베이터: 다음 차례에 주사위 대신 원하는 칸으로 이동해요. (교문을 지나면 용돈)',
  fund: '복지 기부함: 100만 원을 내요. 낸 돈은 복지실에 쌓여요.',
  card: '행운 쪽지: 좋은 일 또는 깜짝 일이 적힌 쪽지를 한 장 뽑아요.',
};

export class SchoolGame {
  constructor(view, lobby, shell, audio) {
    this.view = view;
    this.lobby = lobby;
    this.shell = shell;
    this.audio = audio;
    this.state = null;
    this.busy = false;
    this.queue = [];
    this.lastSeq = 0;
    this.mode = 'online';
    this.logs = [];
  }

  enter(mode) {
    this.mode = mode;
    this.shell.enterHud();
    this.view.setTitleMode(false);
    $('#hud-body').innerHTML = `
      <div class="st-chips" id="st-chips"></div>
      <div class="k-log st-log" id="st-log"><button type="button" id="st-log-btn">📜 기록</button><ol id="st-log-list"></ol></div>
      <div class="st-cardfx" id="st-cardfx" hidden><div class="st-card"><div class="st-card-in"><div class="st-card-back">💌<b>행운 쪽지</b></div><div class="st-card-face" id="st-card-face"></div></div></div></div>
      <div class="k-bottom st-bottom">
        <div class="st-flag" id="st-flag"></div>
        <div class="k-actions" id="st-actions"></div>
      </div>`;
    $('#st-log-btn').addEventListener('click', () => $('#st-log').classList.toggle('open'));
    $('#st-cardfx').addEventListener('click', () => this.hideCard());
    $('#st-actions').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) this.act(b.dataset.act);
    });
    this.view.onCell = (i) => this.onCell(i);
    this.logs = [];
  }

  exit() {
    this.state = null;
    this.queue = [];
    this.lastSeq = 0;
    this.view.onCell = null;
    this.view.showHints([]);
  }

  /** 지금 이 화면에서 움직일 수 있는 자리 (-1: 없음) */
  canActSeat() {
    const s = this.state;
    if (!s || !s.st || s.status !== 'playing' || s.st.phase === 'over' || this.busy) return -1;
    const seat = s.st.turn;
    if (this.mode === 'hotseat') return s.players[seat].bot ? -1 : seat;
    return seat === s.mySeat ? seat : -1;
  }

  onState(s, first) {
    if (first) this.enter(this.lobby.local ? (this.lobby.seatPids ? 'hotseat' : 'practice') : 'online');
    this.queue.push(s);
    this.pump();
  }

  async pump() {
    if (this.busy) return;
    this.busy = true;
    while (this.queue.length) {
      const s = this.queue.shift();
      if (!s.st) continue;
      const evs = (s.events || []).filter((e) => e.seq > this.lastSeq);
      const restart = evs.some((e) => e.type === 'start');
      const gap = evs.length && evs[0].seq > this.lastSeq + 1 && this.lastSeq > 0;
      if (!this.state || restart || gap) {
        this.state = s;
        this.lastSeq = s.seq;
        this.view.sync(s.st);
        if (restart) this.log(`🏫 서라벌학교여행 시작! (${s.st.maxRounds}바퀴)`);
        this.render();
        continue;
      }
      const prev = this.state;
      this.state = s;
      this.renderChips(prev.st); // 연출 중엔 이전 돈 그대로
      $('#st-actions').innerHTML = '';
      for (const e of evs) await this.play(e, s);
      this.lastSeq = s.seq;
      this.view.sync(s.st);
      this.busy = false;
      this.render();
      this.busy = true;
      if (s.status === 'finished' && evs.some((e) => e.type === 'end')) {
        this.busy = false;
        await this.showEnd(s);
        this.busy = true;
      }
    }
    this.busy = false;
    this.render();
  }

  name(seat) {
    const p = this.state.players[seat];
    return p ? `${p.emoji} ${p.name}` : '?';
  }

  log(text) {
    this.logs.unshift(text);
    this.logs.length = Math.min(this.logs.length, 40);
    const el = $('#st-log-list');
    if (el) el.innerHTML = this.logs.map((t) => `<li>${esc(t)}</li>`).join('');
  }

  flag(text) {
    const f = $('#st-flag');
    if (f) f.textContent = text;
  }

  /** 이벤트 한 개 연출 */
  async play(e, s) {
    const a = this.audio;
    const v = this.view;
    const nm = e.seat != null ? this.name(e.seat) : '';
    switch (e.type) {
      case 'roll': {
        a.dice();
        this.flag(`${nm} 주사위 굴리는 중…`);
        await v.rollDice(e.d, () => a.diceLand());
        const dbl = e.d[0] === e.d[1];
        this.flag(`🎲 ${e.d[0]} + ${e.d[1]} = ${e.d[0] + e.d[1]}${dbl ? ' 더블!' : ''}`);
        this.log(`🎲 ${nm}: ${e.d[0]}+${e.d[1]}${dbl ? ' (더블)' : ''}`);
        await v.wait(0.25);
        break;
      }
      case 'move':
        await v.hop(e.seat, e.from, e.steps, (k) => a.tap(k));
        break;
      case 'jump':
        await v.jump(e.seat, e.to);
        break;
      case 'fly':
        a.elev();
        this.log(`🛗 ${nm} → ${CELLS[e.to].name}`);
        await v.jump(e.seat, e.to);
        break;
      case 'gain':
        a.gain();
        if (e.why === 'salary') {
          this.log(`💵 ${nm} 용돈 +${won(e.amount)}`);
          toast(`💵 ${nm} 교문 통과! 용돈 +${won(e.amount)}`, 1400);
        } else this.log(`💰 ${nm} +${won(e.amount)}`);
        break;
      case 'buy':
        a.buy();
        v.setOwner(e.cell, e.seat, 0);
        banner(`${CELLS[e.cell].name} 구입!`);
        this.log(`🏷️ ${nm} ${CELLS[e.cell].name} 구입 (${won(e.price)})`);
        await v.wait(0.5);
        break;
      case 'build':
        a.build();
        v.setOwner(e.cell, e.seat, e.lvl);
        this.log(`🔨 ${nm} ${CELLS[e.cell].name}에 ${BUILD_NAMES[e.lvl]}`);
        await v.wait(0.5);
        break;
      case 'sell':
        v.setOwner(e.cell, e.what === 'land' ? -1 : e.seat, e.what === 'land' ? 0 : e.lvl);
        this.log(`💸 ${nm} ${CELLS[e.cell].name} ${e.what === 'land' ? '땅' : '건물'} 팔기 +${won(e.amount)}`);
        await v.wait(0.3);
        break;
      case 'rent':
        if (e.free) {
          a.gain();
          toast(`🎫 ${nm} 통행료 면제권 사용!`, 1800);
          this.log(`🎫 ${nm} 면제권으로 통행료 0`);
        } else {
          a.rent();
          toast(`💸 ${nm} → ${this.name(e.to)} 통행료 ${won(e.amount)}`, 2000);
          this.log(`💸 ${nm} → ${this.name(e.to)} ${won(e.amount)} (${CELLS[e.cell].name})`);
        }
        await v.wait(0.6);
        break;
      case 'card':
        a.card();
        this.log(`💌 ${nm}: ${CARDS[e.card].title}`);
        await this.showCard(CARDS[e.card], nm);
        break;
      case 'jail':
        a.jail();
        banner('숙직실로!');
        this.log(`🛏️ ${nm} 숙직실로 (3턴 쉬기)`);
        await v.wait(0.5);
        break;
      case 'triple':
        toast(`${nm} 더블 세 번! 숙직실로 가요.`, 2000);
        break;
      case 'stay':
        this.log(`🛏️ ${nm} 숙직실에서 쉬는 중 (${e.left}턴 남음)`);
        toast(`${nm} 숙직실에서 쉬어요 (${e.left}턴 남음)`, 1500);
        await v.wait(0.4);
        break;
      case 'free':
        this.log(`🚪 ${nm} 숙직실 탈출${e.how === 'pay' ? ` (${won(BAIL)} 냄)` : e.how === 'double' ? ' (더블!)' : ' (3턴 끝)'}`);
        break;
      case 'elev':
        a.elev();
        toast(`🛗 ${nm} 엘리베이터! 다음 차례에 원하는 칸으로 가요.`, 2000);
        this.log(`🛗 ${nm} 엘리베이터 탑승`);
        break;
      case 'welfare':
        if (e.amount) {
          a.gain();
          banner(`복지금 +${won(e.amount)}`);
        }
        this.log(`💝 ${nm} 복지실 ${e.amount ? '+' + won(e.amount) : '(쌓인 돈 없음)'}`);
        await v.wait(0.4);
        break;
      case 'donate':
        a.rent();
        this.log(`🪙 ${nm} 복지 기부함에 ${won(e.amount)}`);
        toast(`🪙 ${nm} 복지 기부함에 ${won(e.amount)}`, 1500);
        break;
      case 'poor':
        this.log(`😢 ${nm} 돈이 모자라 ${CELLS[e.cell].name}을(를) 못 사요`);
        break;
      case 'skip':
        if (e.what === 'buy') this.log(`🙅 ${nm} ${CELLS[e.cell].name} 안 사기`);
        break;
      case 'bankrupt':
        a.bankrupt();
        banner(`${s.players[e.seat].name} 파산!`);
        this.log(`💥 ${nm} 파산!`);
        await v.wait(1);
        break;
      case 'turn':
        this.log(`— ${e.round}바퀴 · ${nm} 차례 —`);
        break;
    }
  }

  showCard(card, who) {
    const fx = $('#st-cardfx');
    $('#st-card-face').innerHTML = `<div class="st-card-icon">${card.good ? '🍀' : '⚡'}</div><b>${esc(card.title)}</b><p>${esc(card.text)}</p><small>${esc(who)}</small>`;
    $('#st-card-face').classList.toggle('bad', !card.good);
    fx.hidden = false;
    fx.classList.remove('flip');
    void fx.offsetWidth;
    requestAnimationFrame(() => fx.classList.add('flip'));
    return new Promise((res) => {
      this.cardDone = res;
      this.cardTimer = setTimeout(() => this.hideCard(), 2600);
    });
  }
  hideCard() {
    clearTimeout(this.cardTimer);
    const fx = $('#st-cardfx');
    if (fx) fx.hidden = true;
    const d = this.cardDone;
    this.cardDone = null;
    d?.();
  }

  renderChips(st) {
    const s = this.state;
    if (!st) return;
    $('#st-chips').innerHTML = st.players
      .map((p, k) => {
        const P = s.players[k];
        const me = this.mode !== 'hotseat' && k === s.mySeat;
        const tags = [p.jail > 0 ? '🛏️' : '', p.elev ? '🛗' : '', p.pass ? '🎫' : ''].join('');
        return `<div class="st-chip${st.turn === k && st.phase !== 'over' ? ' turn' : ''}${p.out ? ' out' : ''}">
          <span class="dot" style="background:${PAWN_CSS[k]}"></span>
          <span class="nm">${P.emoji} ${esc(P.name)}${me ? ' (나)' : ''}${tags ? ' ' + tags : ''}</span>
          <b>${p.out ? '파산' : won(p.cash)}</b></div>`;
      })
      .join('');
  }

  render() {
    const s = this.state;
    if (!s || !s.st || !$('#st-chips')) return;
    const st = s.st;
    this.renderChips(st);
    $('#hud-round').textContent = `${st.round}/${st.maxRounds}바퀴 · 기부함 ${won(st.fund)}`;
    const seat = this.canActSeat();
    const acts = $('#st-actions');
    const turnName = this.name(st.turn);
    this.view.showHints([]);
    if (st.phase === 'over' || s.status !== 'playing') {
      acts.innerHTML = '';
      this.flag('게임 끝!');
      return;
    }
    if (seat < 0) {
      acts.innerHTML = '';
      this.flag(this.busy ? '' : `${turnName} 차례 · 기다리는 중…`);
      return;
    }
    const p = st.players[seat];
    const who = this.mode === 'hotseat' ? `${turnName} 차례 · ` : '내 차례 · ';
    const btn = (act, label, primary) => `<button class="btn${primary ? ' primary' : ''}" data-act="${act}">${label}</button>`;
    if (st.phase === 'buy') {
      const c = CELLS[st.pending];
      this.view.showHints([st.pending]);
      this.flag(`${who}${c.name} (${won(c.price)}) 살까요?`);
      acts.innerHTML = btn('buy', `🏷️ 사기 ${won(c.price)}`, true) + btn('skip', '🙅 안 사기');
    } else if (st.phase === 'build') {
      const i = st.pending;
      this.view.showHints([i]);
      this.flag(`${who}${CELLS[i].name}에 ${BUILD_NAMES[st.lvl[i] + 1]}을(를) 지을까요?`);
      acts.innerHTML = btn('build', `🔨 짓기 ${won(buildCost(i))}`, true) + btn('skip', '넘기기');
    } else if (p.elev) {
      this.view.showHints(CELLS.map((c) => c.i).filter((i) => i !== 30));
      this.flag(`${who}🛗 가고 싶은 칸을 눌러요!`);
      acts.innerHTML = '';
    } else {
      this.flag(p.jail > 0 ? `${who}숙직실 (${p.jail}턴 남음) · 더블이 나오면 탈출` : `${who}주사위를 굴려요!${st.again ? ' (더블 한 번 더)' : ''}`);
      acts.innerHTML = btn('roll', '🎲 주사위 굴리기', true) + (p.jail > 0 && p.cash >= BAIL ? btn('bail', `💸 ${won(BAIL)} 내고 나가기`) : '');
    }
  }

  async act(action, extra = {}) {
    const seat = this.canActSeat();
    if (seat < 0) return;
    const payload = { ...extra };
    if (this.mode === 'hotseat') payload.pid = this.lobby.seatPids[seat];
    $('#st-actions').innerHTML = '';
    const ok = await this.lobby.send(action, payload);
    if (!ok) this.render();
  }

  async onCell(i) {
    const s = this.state;
    if (!s || !s.st) return;
    const seat = this.canActSeat();
    if (seat >= 0 && s.st.phase === 'roll' && s.st.players[seat].elev) {
      if (i === 30) return toast('엘리베이터 칸으로는 갈 수 없어요.');
      const pass = i < s.st.players[seat].pos || i === 0;
      const v = await modal({
        title: `🛗 ${CELLS[i].name}(으)로 갈까요?`,
        html: this.cellInfo(i) + (pass ? '<p class="note">교문을 지나서 용돈 200만 원도 받아요!</p>' : ''),
        buttons: [
          { label: '취소', value: false },
          { label: '여기로 가기', value: true, primary: true },
        ],
      });
      if (v) this.act('fly', { to: i });
      return;
    }
    await modal({ title: `${CELLS[i].icon || '🚪'} ${CELLS[i].name}`, html: this.cellInfo(i) });
  }

  cellInfo(i) {
    const st = this.state?.st;
    const c = CELLS[i];
    if (!isProp(i)) return `<p>${KIND_TEXT[c.kind] || ''}</p>`;
    const owner = st ? st.own[i] : -1;
    const ownTxt = owner >= 0 ? `<span style="color:${PAWN_CSS[owner]}">●</span> ${esc(this.name(owner))}` : '없음 (살 수 있어요)';
    const rows = rentTable(i)
      .map((r, k) => `<tr${st && owner >= 0 && st.lvl[i] === k ? ' class="cur"' : ''}><td>${c.kind === 'mark' ? '명소 (고정)' : k ? BUILD_NAMES[k] : '땅만'}</td><td>${won(r)}</td></tr>`)
      .join('');
    const mono = owner >= 0 && c.group >= 0 && hasMonopoly(st, owner, c.group);
    return `<div class="st-info">
      <p><b>${c.floor + 1}층</b> ${c.kind === 'mark' ? '· ⭐ 명소 (건물 못 지음)' : ''}</p>
      <p>주인: ${ownTxt}</p>
      <p>땅값: <b>${won(c.price)}</b>${c.kind === 'room' ? ` · 짓기: 한 단계 ${won(buildCost(i))}` : ''}</p>
      <table class="st-rent"><tr><th>건물</th><th>통행료</th></tr>${rows}</table>
      ${c.kind === 'room' ? `<p class="note">같은 색 3칸을 모두 가지면 통행료 2배!${mono ? ' (지금 독점 중)' : ''}</p>` : ''}
      ${owner >= 0 ? `<p>지금 통행료: <b>${won(rentOf(st, i))}</b></p>` : ''}
    </div>`;
  }

  async showEnd(s) {
    const st = s.st;
    const w = st.winner;
    const meWin = this.mode !== 'hotseat' && w === s.mySeat;
    banner(`${s.players[w].name} 승리!`);
    if (meWin || this.mode === 'hotseat') {
      this.audio.win();
      confetti();
      this.view.celebrate();
    } else this.audio.lose();
    await new Promise((r) => setTimeout(r, 1200));
    if (this.state !== s) return;
    const rank = st.players
      .map((p, k) => ({ k, v: assetsOf(st, k), out: p.out }))
      .sort((x, y) => (x.out - y.out) || y.v - x.v)
      .map((r, n) => `<li><span class="dot" style="background:${PAWN_CSS[r.k]}"></span>${n + 1}등 ${esc(this.name(r.k))} <b>${r.out ? '파산' : won(r.v)}</b></li>`)
      .join('');
    const host = s.hostId === s.me;
    const v = await modal({
      title: `🏆 ${s.players[w].emoji} ${s.players[w].name} 승리!`,
      html: `<p class="note">${st.endReason === 'rounds' ? `${st.maxRounds}바퀴가 끝나 총자산(현금+땅값+건물값) 1등이 이겼어요.` : '마지막까지 파산하지 않고 남았어요!'}</p><ol class="st-rank">${rank}</ol>`,
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
}

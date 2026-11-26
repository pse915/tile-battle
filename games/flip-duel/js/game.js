// 흑백 뒤집기 대전 — 서버 상태(온라인·봇 연습·한 기기 2인)를 받아 그리고, 둘 곳을 보냄
import { $, esc, banner, toast, modal, confetti } from '../../../shared/ui-core.js';
import { COLOR_NAME, count } from './rules.js';

export class FlipGame {
  constructor(view, lobby, shell, audio) {
    this.view = view;
    this.lobby = lobby;
    this.shell = shell;
    this.audio = audio;
    this.state = null;
    this.board = null;
    this.busy = false;
    this.queue = [];
    this.mode = 'online';
  }

  enter(mode) {
    this.mode = mode;
    this.shell.enterHud();
    this.view.setTitleMode(false);
    $('#hud-body').innerHTML = `
      <div class="fd-chips">
        <div class="fd-chip black" id="fd-p1"></div>
        <div class="fd-chip white" id="fd-p2"></div>
      </div>
      <div class="k-flag fd-flag" id="fd-flag" hidden></div>`;
    this.view.onCell = (i) => this.onCell(i);
  }

  exit() {
    this.state = null;
    this.board = null;
    this.queue = [];
    this.view.onCell = null;
    this.view.showHints([]);
  }

  /** 지금 이 화면에서 둘 수 있는 사람의 자리 (한 기기 모드는 차례인 사람) */
  canMoveSeat() {
    const s = this.state;
    if (!s || !s.fd || s.fd.over || s.status !== 'playing') return -1;
    const seat = s.fd.turn - 1;
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
      if (!this.state && !this.board) {
        this.state = s;
        this.board = s.fd.board.slice();
        this.view.setBoard(this.board, s.fd.last);
        this.render();
        continue;
      }
      const prev = this.board;
      const next = s.fd.board;
      this.state = s;
      const changed = next.filter((v, i) => v !== prev[i]).length;
      if (s.fd.moves === 0 || changed > 30) {
        this.view.setBoard(next, s.fd.last);
      } else if (changed) {
        // 새로 놓인 돌 + 뒤집힌 돌 연출 (폴링 사이 여러 수가 있었으면 마지막 수 기준으로)
        this.view.showHints([]);
        const placed = next.findIndex((v, i) => v && !prev[i]);
        const flips = [];
        next.forEach((v, i) => prev[i] && v !== prev[i] && flips.push(i));
        const extra = next.filter((v, i) => v && !prev[i]).length > 1;
        if (extra) this.view.setBoard(next, s.fd.last);
        else
          await this.view.animateMove(placed, next[placed], flips, {
            place: () => this.audio.place(),
            flip: (k) => this.audio.flip(k),
          });
        if (s.fd.passed && !s.fd.over) {
          const who = s.players[s.fd.turn === 1 ? 1 : 0];
          this.audio.pass();
          banner(`${who.name} 쉼!`);
          toast(`${who.name}은(는) 둘 곳이 없어서 한 번 쉬어요.`, 2200);
        }
      }
      this.board = next.slice();
      this.render();
      if (s.status === 'finished') await this.showEnd(s);
    }
    this.busy = false;
  }

  render() {
    const s = this.state;
    const fd = s.fd;
    const c = count(fd.board);
    const chip = (seat) => {
      const p = s.players[seat];
      const me = seat === s.mySeat && this.mode !== 'hotseat';
      return `<span class="disc"></span><span class="nm">${p.emoji} ${esc(p.name)}${me ? ' (나)' : ''}</span><b>${c[seat + 1]}</b>`;
    };
    $('#fd-p1').innerHTML = chip(0);
    $('#fd-p2').innerHTML = chip(1);
    $('#fd-p1').classList.toggle('turn', !fd.over && fd.turn === 1);
    $('#fd-p2').classList.toggle('turn', !fd.over && fd.turn === 2);
    const mine = this.canMoveSeat();
    this.view.showHints(mine >= 0 ? fd.legal : []);
    const flag = $('#fd-flag');
    const turnP = s.players[fd.turn - 1];
    flag.hidden = fd.over;
    if (this.mode === 'hotseat') flag.textContent = `${fd.turn === 1 ? '⚫' : '⚪'} ${turnP.name} 차례 · 빛나는 칸에 두세요`;
    else if (mine >= 0) flag.textContent = `내 차례 (${COLOR_NAME[fd.turn]}) · 빛나는 칸에 두세요`;
    else flag.textContent = `${turnP.emoji} ${turnP.name} 생각 중…`;
    $('#hud-round').textContent = `${fd.moves}수째`;
  }

  async onCell(i) {
    const seat = this.canMoveSeat();
    if (seat < 0 || this.busy) return;
    if (!this.state.fd.legal.includes(i)) {
      this.audio.error();
      return toast('상대 돌을 끼울 수 있는 빛나는 칸에만 둘 수 있어요.');
    }
    this.view.showHints([]);
    const payload = { idx: i };
    if (this.mode === 'hotseat') payload.pid = this.lobby.seatPids[seat];
    const ok = await this.lobby.send('place', payload);
    if (!ok) this.render();
  }

  async showEnd(s) {
    const fd = s.fd;
    const c = count(fd.board);
    const w = fd.winner;
    const meWin = this.mode !== 'hotseat' && w && w - 1 === s.mySeat;
    if (w === 0) banner('무승부!');
    else banner(`${COLOR_NAME[w]} 승리!`);
    if (meWin || (this.mode === 'hotseat' && w)) {
      this.audio.win();
      confetti();
      this.view.celebrate();
    } else if (w) this.audio.lose();
    await new Promise((r) => setTimeout(r, 1200));
    if (this.state !== s) return;
    const host = s.hostId === s.me;
    const v = await modal({
      title: w ? `${s.players[w - 1].emoji} ${s.players[w - 1].name} 승리!` : '무승부',
      html: `<p class="fd-score"><span class="disc b"></span> ${c[1]} : ${c[2]} <span class="disc w"></span></p>
             <p class="note">${w ? `${COLOR_NAME[w]}이 ${Math.abs(c[1] - c[2])}개 더 많아요.` : '돌 개수가 같아요.'}</p>`,
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
  showLocal(board, legal, last = -1) {
    this.board = board.slice();
    this.view.setBoard(board, last);
    this.view.showHints(legal);
  }
}

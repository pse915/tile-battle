// 게임 진행: 딜, 차례, 내기/패스, 라운드 정산, 최종 순위
import {
  makeDeck, shuffle, maxNForPlayers, handSizeForPlayers, sortTiles, analyze,
  checkPlay, roundScore, settle,
} from './rules.js';
import { chooseMove, hintMove } from './ai.js';
import { wait } from './anim.js';
import { audio } from './audio.js';
import * as ui from './ui.js';

const FIRST_ID = '3-0'; // 구름 3

export class Game {
  constructor(stage, onExit) {
    this.stage = stage;
    this.onExit = onExit;
    this.sortMode = 'num';
    this.aborted = true;
  }

  // ---------- 시작 ----------
  async start(cfg) {
    this.cfg = cfg;
    this.aborted = false;
    const n = cfg.players.length;
    this.players = cfg.players.map((p) => ({ ...p, chips: 60, hand: [] }));
    this.n = n;
    this.maxN = maxNForPlayers(n);
    this.round = 0;
    this.hot = cfg.mode === 'hot';
    this.viewSeat = this.hot ? -1 : 0;
    this.stage.setSeats(n, Math.max(0, this.viewSeat));
    ui.buildLabels(this.players, this.viewSeat);
    ui.setSortLabel(this.sortMode);
    ui.showHud(true);
    this.unsubFrame?.();
    this.unsubFrame = this.stage.onFrame(() => ui.positionLabels(this.stage));
    await this.startRound();
  }

  stop() {
    this.aborted = true;
    this.humanResolve?.(null);
    this.humanResolve = null;
    this.unsubFrame?.();
    this.unsubFrame = null;
    this.stage.handEnabled = false;
    this.stage.setHand([]);
    this.stage.clearCenter();
    this.stage.setTurn(null);
    this.stage.setSeats(0, 0);
    ui.clearLabels();
    ui.showHud(false);
  }

  refreshBoard() {
    this.players.forEach((p, i) => {
      this.stage.setOppCount(i, p.hand.length);
      this.stage.setChips(i, p.chips);
      ui.updateLabel(i, { count: p.hand.length, chips: p.chips });
    });
    const me = this.players[Math.max(0, this.viewSeat)];
    ui.setMeBox(me, me.hand.length);
  }

  async startRound() {
    this.round++;
    const deck = shuffle(makeDeck(this.maxN));
    const per = handSizeForPlayers(this.n);
    this.players.forEach((p, i) => (p.hand = sortTiles(deck.slice(i * per, (i + 1) * per), this.maxN)));
    this.table = null;
    this.tableTiles = [];
    this.lastPlayer = null;
    this.passCount = 0;
    this.mustId = FIRST_ID;
    this.current = this.players.findIndex((p) => p.hand.some((t) => t.id === FIRST_ID));
    this.stage.clearCenter();
    ui.setRound(this.round, this.cfg.rounds);
    ui.setTableInfo(`<b>${ui.esc(this.players[this.current].name)}</b>부터 구름 3으로 시작해요`);

    if (this.hot) {
      this.viewSeat = -1; // 매 라운드 첫 차례에 화면 넘기기 가림막을 띄움
      this.stage.setHand([]);
      ui.setLabelVisibility(-1);
    } else {
      this.showHand(0);
    }
    this.refreshBoard();
    ui.banner(`라운드 ${this.round}`);
    audio.sweep();
    await wait(1.1);
    this.runTurns();
  }

  showHand(seat) {
    this.viewSeat = seat;
    this.stage.setSeats(this.n, seat);
    ui.setLabelVisibility(seat);
    this.stage.setHand(this.sorted(this.players[seat].hand));
    this.refreshBoard();
  }

  sorted(hand) {
    return sortTiles(hand, this.maxN, this.sortMode);
  }

  // ---------- 차례 ----------
  async runTurns() {
    while (!this.aborted) {
      const ended = await this.turn();
      if (ended || this.aborted) return;
    }
  }

  async turn() {
    const i = this.current;
    const p = this.players[i];
    this.stage.setTurn(i);
    ui.setTurnLabel(i);

    if (p.ai) {
      ui.setActions({ myTurn: false });
      ui.seatBubble(i, '생각 중…', 0);
      await wait(0.6 + Math.random() * 0.6);
      if (this.aborted) return true;
      ui.seatBubble(i, '');
      const tiles = chooseMove({
        hand: p.hand,
        table: this.table,
        maxN: this.maxN,
        mustId: this.mustId,
        difficulty: p.difficulty,
        oppCounts: this.players.filter((_, k) => k !== i).map((q) => q.hand.length),
      });
      return tiles ? this.applyPlay(i, tiles) : this.applyPass(i);
    }

    if (this.hot && this.viewSeat !== i) {
      this.stage.setHand([]);
      ui.setActions({ myTurn: false });
      await ui.modal({
        title: `${p.name}님 차례`,
        html: `<div class="handoff"><div class="avatar">${p.emoji}</div><p>화면을 <b>${ui.esc(p.name)}</b>님에게 넘겨주세요.<br>다른 사람은 보지 않기!</p></div>`,
        buttons: [{ label: '준비됐어요', value: true, primary: true }],
        opaque: true,
      });
      if (this.aborted) return true;
      this.showHand(i);
    }

    audio.yourTurn();
    const action = await this.waitHuman();
    if (!action || this.aborted) return true;
    return action.type === 'play' ? this.applyPlay(i, action.tiles) : this.applyPass(i);
  }

  waitHuman() {
    const p = new Promise((resolve) => (this.humanResolve = resolve));
    this.stage.handEnabled = true;
    this.updateActions();
    return p;
  }

  isHumanTurn() {
    return !!this.humanResolve && !this.aborted;
  }

  selectedTiles() {
    const p = this.players[this.viewSeat];
    return p ? p.hand.filter((t) => this.stage.selected.has(t.id)) : [];
  }

  updateActions() {
    const myTurn = this.isHumanTurn();
    const check = checkPlay(this.selectedTiles(), this.table, this.maxN, this.mustId);
    ui.setActions({ myTurn, canPlay: check.ok, canPass: !!this.table });
  }

  // ---------- 사람 입력 (main.js에서 연결) ----------
  onTileClick(tile) {
    if (this.aborted || this.viewSeat < 0) return;
    const was = this.stage.selected.has(tile.id);
    this.stage.toggleSelect(tile.id);
    was ? audio.unpick() : audio.pick();
    this.updateActions();
  }

  handlePlay() {
    if (!this.isHumanTurn()) return ui.toast('아직 내 차례가 아니에요.');
    const tiles = this.selectedTiles();
    const check = checkPlay(tiles, this.table, this.maxN, this.mustId);
    if (!check.ok) {
      audio.error();
      return ui.toast(check.reason);
    }
    this.resolveHuman({ type: 'play', tiles });
  }

  handlePass() {
    if (!this.isHumanTurn()) return ui.toast('아직 내 차례가 아니에요.');
    if (!this.table) {
      audio.error();
      return ui.toast('바닥이 비어 있을 때는 패스할 수 없어요. 아무 조합이나 내세요.');
    }
    this.resolveHuman({ type: 'pass' });
  }

  handleHint() {
    if (!this.isHumanTurn()) return ui.toast('내 차례에 쓸 수 있어요.');
    const tiles = hintMove(this.players[this.viewSeat].hand, this.table, this.maxN, this.mustId);
    if (!tiles) {
      ui.toast('낼 수 있는 조합이 없어요. 패스하세요.');
      return;
    }
    this.stage.setSelection(tiles.map((t) => t.id));
    audio.pick();
    this.updateActions();
  }

  toggleSort() {
    this.sortMode = this.sortMode === 'num' ? 'suit' : 'num';
    ui.setSortLabel(this.sortMode);
    const p = this.players?.[this.viewSeat];
    if (p) this.stage.orderHand(this.sorted(p.hand));
  }

  resolveHuman(action) {
    const r = this.humanResolve;
    this.humanResolve = null;
    this.stage.handEnabled = false;
    ui.setActions({ myTurn: false });
    r?.(action);
  }

  // ---------- 내기 / 패스 ----------
  async applyPlay(i, tiles) {
    const p = this.players[i];
    const ids = new Set(tiles.map((t) => t.id));
    p.hand = p.hand.filter((t) => !ids.has(t.id));
    const combo = analyze(tiles, this.maxN);
    const ordered = sortTiles(tiles, this.maxN);
    const meshes = i === this.viewSeat ? this.stage.detachFromHand(ordered.map((t) => t.id)) : this.stage.spawnAtSeat(i, ordered);
    this.table = combo;
    this.tableTiles = ordered;
    this.lastPlayer = i;
    this.passCount = 0;
    this.mustId = null;
    this.refreshBoard();
    ui.setTableInfo(`<b>${ui.esc(p.name)}</b> · ${combo.name} ${ui.comboText(ordered)}`);
    await this.stage.playToCenter(meshes, (j) => audio.place(j));
    if (this.aborted) return true;

    if (combo.size === 5) {
      ui.banner(combo.name);
      this.stage.burst(0xffd84d, true);
      audio.special();
    } else if (tiles.some((t) => t.n === 2)) {
      this.stage.burst(0xff8a3d);
      audio.special();
    }

    if (!p.hand.length) {
      await this.endRound(i);
      return true;
    }
    this.current = (i + 1) % this.n;
    return false;
  }

  async applyPass(i) {
    ui.seatBubble(i, '패스');
    audio.pass();
    this.passCount++;
    if (this.passCount >= this.n - 1) {
      await wait(0.45);
      audio.sweep();
      await this.stage.sweepCenter();
      if (this.aborted) return true;
      this.table = null;
      this.tableTiles = [];
      this.passCount = 0;
      this.current = this.lastPlayer;
      ui.setTableInfo(`모두 패스! <b>${ui.esc(this.players[this.current].name)}</b>부터 새로 시작해요`);
    } else {
      this.current = (i + 1) % this.n;
      await wait(0.25);
    }
    return false;
  }

  // ---------- 정산 ----------
  async endRound(winner) {
    this.stage.setTurn(null);
    ui.setTurnLabel(-1);
    ui.setActions({ myTurn: false });
    const w = this.players[winner];
    const humanWon = !w.ai;
    ui.banner(`${w.name} 승리!`);
    if (humanWon) {
      audio.win();
      ui.confetti(2.5);
    } else audio.lose();
    await wait(1.4);
    if (this.aborted) return;

    const scores = this.players.map((p) => roundScore(p.hand));
    const { delta, transfers } = settle(scores.map((s) => s.score));
    for (const tr of transfers) {
      if (this.aborted) return;
      this.stage.flyCoins(tr.from, tr.to, tr.amount, () => audio.chip());
      await wait(0.25);
    }
    await wait(0.6);
    this.players.forEach((p, k) => (p.chips += delta[k]));
    this.refreshBoard();

    const rows = this.players
      .map((p, k) => {
        const s = scores[k];
        const d = delta[k];
        return `<tr><td>${p.emoji} ${ui.esc(p.name)}${k === winner ? ' 🏆' : ''}</td><td>${s.left}</td><td>${s.twos ? `${s.twos}장 (×${2 ** s.twos})` : '-'}</td><td>${s.score}</td><td class="${d > 0 ? 'plus' : d < 0 ? 'minus' : ''}">${d > 0 ? '+' : ''}${d}</td><td><b>${p.chips}</b></td></tr>`;
      })
      .join('');
    const gameOver = this.round >= this.cfg.rounds || this.players.some((p) => p.chips <= 0);
    const go = await ui.modal({
      title: `라운드 ${this.round} 결과`,
      html: `<table class="result-table"><thead><tr><th>이름</th><th>남은 타일</th><th>2</th><th>점수</th><th>칩 변화</th><th>칩</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="note">점수 = 남은 장수 × 2<sup>(남은 2의 수)</sup>. 모든 두 사람이 점수 차이만큼 칩을 주고받아요.</p>`,
      buttons: [{ label: gameOver ? '최종 순위 보기' : '다음 라운드', value: true, primary: true }],
    });
    if (this.aborted || !go) return;
    if (gameOver) await this.finish();
    else await this.startRound();
  }

  async finish() {
    this.stage.setHand([]);
    const ranked = this.players.map((p, k) => ({ ...p, k })).sort((a, b) => b.chips - a.chips);
    const humanTop = !ranked[0].ai;
    if (humanTop) audio.win();
    ui.confetti(4);
    const step = (p, cls, place) =>
      p ? `<div class="step ${cls}"><div class="who"><span class="avatar">${p.emoji}</span>${ui.esc(p.name)}<br><small>🪙 ${p.chips}</small></div><div class="block">${place}</div></div>` : '';
    const rest = ranked.slice(3).map((p, idx) => `<li>${idx + 4}등 ${p.emoji} ${ui.esc(p.name)} · 🪙 ${p.chips}</li>`).join('');
    const choice = await ui.modal({
      title: '최종 순위',
      html: `<div class="podium">${step(ranked[1], 's2', 2)}${step(ranked[0], 's1', 1)}${step(ranked[2], 's3', 3)}</div>${rest ? `<ul class="rest-list">${rest}</ul>` : ''}`,
      buttons: [
        { label: '메인으로', value: 'menu' },
        { label: '다시 하기', value: 'again', primary: true },
      ],
    });
    if (this.aborted) return;
    if (choice === 'again') {
      this.stop();
      await this.start(this.cfg);
    } else {
      this.onExit();
    }
  }
}

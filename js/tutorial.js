// 단계형 인터랙티브 튜토리얼 — 실제 3D 테이블에서 정해진 패로 진행
import { makeTile, checkPlay, sortTiles, SUITS } from './rules.js';
import { suitIcon } from './tiles.js';
import { wait } from './anim.js';
import { audio } from './audio.js';
import { save } from './storage.js';
import * as ui from './ui.js';

const MAXN = 9;
const T = (n, s) => makeTile(n, s);
const C = 0, S = 1, M = 2, H = 3;
const suit = (i) => `<span class="suit-chip"><img src="${suitIcon(i, 20)}" alt="">${SUITS[i].name}</span>`;

export class Tutorial {
  constructor(stage, onDone) {
    this.stage = stage;
    this.onDone = onDone;
    this.players = [
      { name: '나', emoji: '🙂', chips: 60 },
      { name: '토끼 선생', emoji: '🐰', chips: 60 },
      { name: '곰 선배', emoji: '🐻', chips: 60 },
    ];
    this.steps = this.buildSteps();
    this.labels = [];
    this.token = 0;
  }

  start() {
    this.active = true;
    this.stage.setSeats(3, 0);
    this.stage.setOppCount(1, 8);
    this.stage.setOppCount(2, 8);
    this.stage.setChips(1, 60);
    this.stage.setChips(2, 60);
    this.stage.setChips(0, 60);
    ui.buildLabels(this.players, 0);
    ui.updateLabel(1, { count: 8, chips: 60 });
    ui.updateLabel(2, { count: 8, chips: 60 });
    ui.setRound(0, 0);
    ui.setMeBox(this.players[0], 0);
    ui.showHud(true);
    ui.setSortLabel('num');
    ui.$('#tutorial-layer').hidden = false;
    this.unsub = this.stage.onFrame(() => {
      ui.positionLabels(this.stage);
      this.positionTutLabels();
    });
    this.go(0);
  }

  finish(skipped) {
    if (!this.active) return;
    this.active = false;
    this.token++;
    save('tutorialDone', true);
    this.unsub?.();
    this.clearTutLabels();
    this.stage.clearShowcase();
    this.stage.clearCenter();
    this.stage.setHand([]);
    this.stage.handEnabled = false;
    this.stage.setTurn(null);
    this.stage.setSeats(0, 0);
    ui.clearLabels();
    ui.showHud(false);
    ui.$('#tutorial-layer').hidden = true;
    if (skipped) ui.toast('튜토리얼은 메뉴에서 언제든 다시 볼 수 있어요.', 2400);
    this.onDone();
  }

  // ---------- 단계 이동 ----------
  async go(idx) {
    const token = ++this.token;
    this.idx = idx;
    const step = this.steps[idx];
    this.done = !step.interactive;
    this.clearTutLabels();
    this.stage.clearShowcase();
    this.stage.clearCenter();
    this.stage.setHand([]);
    this.stage.handEnabled = false;
    this.stage.setTurn(null);
    this.handler = {};
    [0, 1, 2].forEach((i) => {
      this.stage.setChips(i, 60);
      if (i) ui.updateLabel(i, { count: 8, chips: 60 });
    });
    ui.setTableInfo('튜토리얼');
    ui.setActions({ myTurn: false });
    ui.$('#tut-progress').textContent = `${idx + 1}/${this.steps.length}`;
    ui.$('#tut-title').textContent = step.title;
    ui.$('#tut-prev').disabled = idx === 0;
    ui.$('#tut-prev').classList.toggle('is-off', idx === 0);
    ui.$('#tut-next').textContent = idx === this.steps.length - 1 ? '튜토리얼 끝내기' : '다음';
    this.refreshNext();
    this.spot(null);
    await step.setup(token);
  }

  next() {
    if (!this.done) {
      audio.error();
      ui.toast('먼저 안내대로 직접 해 보세요! (건너뛰기도 할 수 있어요)');
      return;
    }
    if (this.idx >= this.steps.length - 1) this.finish(false);
    else this.go(this.idx + 1);
  }

  prev() {
    if (this.idx > 0) this.go(this.idx - 1);
  }

  refreshNext() {
    ui.$('#tut-next').classList.toggle('is-off', !this.done);
  }

  complete() {
    this.done = true;
    this.refreshNext();
    audio.yourTurn();
  }

  text(html) {
    ui.$('#tut-body').innerHTML = html;
  }

  /** 스포트라이트: DOM 선택자, 'hand', 또는 null */
  spot(target) {
    const el = ui.$('#tut-spot');
    if (!target) {
      el.className = 'tut-spot is-none';
      Object.assign(el.style, { left: '50%', top: '50%', width: '0px', height: '0px' });
      return;
    }
    let r;
    if (target === 'hand') {
      const h = innerHeight;
      const bar = ui.$('#action-bar').getBoundingClientRect();
      const top = h * (innerWidth < innerHeight ? 0.6 : 0.56);
      r = { left: 6, top, width: innerWidth - 12, height: bar.top - top + 4 };
    } else {
      const b = ui.$(target).getBoundingClientRect();
      r = { left: b.left - 8, top: b.top - 8, width: b.width + 16, height: b.height + 16 };
    }
    el.className = 'tut-spot';
    Object.assign(el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  }

  // ---------- 진열 라벨 ----------
  addTutLabels(anchors, texts) {
    this.clearTutLabels();
    this.labels = anchors.map((a, i) => {
      const el = document.createElement('div');
      el.className = 'tut-label';
      el.textContent = texts[i];
      ui.$('#labels').appendChild(el);
      return { el, a };
    });
  }
  positionTutLabels() {
    for (const { el, a } of this.labels) {
      const p = this.stage.project(a);
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
    }
  }
  clearTutLabels() {
    for (const { el } of this.labels) el.remove();
    this.labels = [];
  }

  // ---------- 손패 / 바닥 도우미 ----------
  setHand(tiles) {
    this.hand = sortTiles(tiles, MAXN);
    this.stage.setHand(this.hand);
    this.stage.handEnabled = true;
    ui.setMeBox(this.players[0], this.hand.length);
  }

  async oppPlays(seat, tiles) {
    const meshes = this.stage.spawnAtSeat(seat, tiles);
    ui.setTableInfo(`<b>${this.players[seat].name}</b> · ${ui.comboText(tiles)}`);
    this.stage.setTurn(seat);
    await this.stage.playToCenter(meshes, (j) => audio.place(j));
    this.stage.setTurn(0);
  }

  async myPlay(tiles) {
    const ids = tiles.map((t) => t.id);
    this.hand = this.hand.filter((t) => !ids.includes(t.id));
    const meshes = this.stage.detachFromHand(ids);
    ui.setTableInfo(`<b>나</b> · ${ui.comboText(tiles)}`);
    ui.setMeBox(this.players[0], this.hand.length);
    await this.stage.playToCenter(meshes, (j) => audio.place(j));
  }

  /** 지금 선택한 타일로 바닥 이기기 시도 */
  tryPlay(table, mustId = null) {
    const sel = this.hand.filter((t) => this.stage.selected.has(t.id));
    const res = checkPlay(sel, table, MAXN, mustId);
    if (!res.ok) {
      audio.error();
      ui.toast(res.reason);
      return null;
    }
    return sel;
  }

  updateActions() {
    if (!this.handler.table && !this.handler.play) return ui.setActions({ myTurn: false });
    const sel = (this.hand || []).filter((t) => this.stage.selected.has(t.id));
    const res = checkPlay(sel, this.handler.table, MAXN, this.handler.mustId);
    ui.setActions({ myTurn: true, canPlay: res.ok, canPass: !!this.handler.pass });
  }

  // ---------- main.js에서 연결되는 입력 ----------
  onTileClick(tile) {
    const was = this.stage.selected.has(tile.id);
    this.stage.toggleSelect(tile.id);
    was ? audio.unpick() : audio.pick();
    this.updateActions();
  }
  handlePlay() {
    if (this.handler.play) this.handler.play();
    else ui.toast('지금은 낼 차례가 아니에요.');
  }
  handlePass() {
    if (this.handler.pass) this.handler.pass();
    else {
      audio.error();
      ui.toast(this.handler.passMsg || '지금은 패스할 필요가 없어요.');
    }
  }
  handleHint() {
    ui.toast('튜토리얼에서는 안내 말풍선을 따라 해 보세요.');
  }
  toggleSort() {
    ui.toast('정렬은 실제 게임에서 바꿀 수 있어요.');
  }

  // ---------- 단계 정의 ----------
  buildSteps() {
    return [
      {
        title: '타일 소개',
        interactive: false,
        setup: async () => {
          this.text(`<p>숫자는 <b>3이 가장 약하고</b> 3 → 4 → … → 9 → 1 → <b>2가 가장 세요</b>.</p>
            <p>숫자가 같으면 문양으로 겨뤄요: ${suit(0)} &lt; ${suit(1)} &lt; ${suit(2)} &lt; ${suit(3)}</p>
            <p class="note">사람 수가 많으면 숫자가 13이나 15까지 늘어나요. 1과 2는 언제나 가장 위예요.</p>`);
          const rows = [[3, 4, 5, 6, 7, 8, 9, 1, 2].map((n) => T(n, S)), [T(7, C), T(7, S), T(7, M), T(7, H)]];
          const anchors = this.stage.showcase(rows, { scale: 0.85, gapZ: 1.5, z0: 0.6 });
          this.addTutLabels(anchors, ['숫자 순서 →', '문양 순서 →']);
        },
      },
      {
        title: '구름 3으로 시작하기',
        interactive: true,
        setup: async (token) => {
          this.text(`<p>${suit(0)} <b>3</b>을 가진 사람이 먼저 내요. 첫 수에는 구름 3이 꼭 들어가야 해요.</p>
            <p>손패에서 <b>구름 3</b>을 눌러 고른 뒤 <b>[내기]</b>를 누르세요.</p>`);
          this.setHand([T(3, C), T(4, S), T(5, M), T(5, H), T(6, C), T(7, S), T(8, M), T(9, H), T(1, S), T(2, C)]);
          this.stage.setTurn(0);
          this.spot('hand');
          this.handler = {
            table: null,
            mustId: '3-0',
            play: async () => {
              const sel = this.tryPlay(null, '3-0');
              if (!sel) return;
              this.handler = {};
              this.spot(null);
              this.updateActions();
              await this.myPlay(sel);
              if (token !== this.token) return;
              this.text(`<p class="tut-ok">잘했어요! ✔</p><p>이제 다음 사람은 바닥보다 <b>같은 장수로 더 센</b> 조합을 내야 해요. [다음]을 누르세요.</p>`);
              this.complete();
            },
          };
          this.updateActions();
        },
      },
      {
        title: '싱글 · 페어 · 트리플',
        interactive: true,
        setup: async (token) => {
          const tasks = [
            {
              opp: [T(6, S)],
              hand: [T(4, C), T(5, S), T(5, M), T(8, C), T(9, M), T(1, H)],
              msg: `<p><b>(1/3) 싱글</b> — 한 장끼리 겨뤄요.</p><p>바닥의 별 6보다 <b>센 한 장</b>을 골라 [내기]를 누르세요.</p>`,
            },
            {
              opp: [T(7, C), T(7, S)],
              hand: [T(5, C), T(5, S), T(8, M), T(8, H), T(9, C), T(1, C), T(1, M)],
              msg: `<p><b>(2/3) 페어</b> — 같은 숫자 두 장이에요.</p><p>7 페어보다 <b>센 페어</b>를 두 장 골라 내 보세요. (5 페어는 약해서 안 돼요!)</p>`,
            },
            {
              opp: [T(4, C), T(4, S), T(4, H)],
              hand: [T(3, C), T(3, S), T(3, M), T(9, C), T(9, S), T(9, H), T(2, M)],
              msg: `<p><b>(3/3) 트리플</b> — 같은 숫자 세 장이에요.</p><p>4 트리플을 이길 <b>트리플</b>을 내 보세요.</p>`,
            },
          ];
          const run = async (k) => {
            if (token !== this.token) return;
            const task = tasks[k];
            this.stage.clearCenter();
            this.stage.setHand([]);
            this.text(task.msg);
            await this.oppPlays(1, task.opp);
            if (token !== this.token) return;
            this.setHand(task.hand);
            this.spot('hand');
            const table = { ...checkPlay(task.opp, null, MAXN).combo };
            this.handler = {
              table,
              play: async () => {
                const sel = this.tryPlay(table);
                if (!sel) return;
                this.handler = {};
                this.updateActions();
                await this.myPlay(sel);
                if (token !== this.token) return;
                audio.special();
                if (k < tasks.length - 1) {
                  this.text('<p class="tut-ok">좋아요! ✔</p>');
                  await wait(0.9);
                  run(k + 1);
                } else {
                  this.spot(null);
                  this.text(`<p class="tut-ok">완벽해요! ✔</p><p>장수가 다르면 겨룰 수 없어요. 싱글엔 싱글, 페어엔 페어로! [다음]을 누르세요.</p>`);
                  this.complete();
                }
              },
            };
            this.updateActions();
          };
          await run(0);
        },
      },
      {
        title: '5장 족보',
        interactive: false,
        setup: async () => {
          this.text(`<p>5장 조합은 다섯 가지예요. <b>위로 갈수록 셉니다.</b></p>
            <p>같은 족보끼리는 가장 높은 타일로 비교해요. 스트레이트는 <b>1-2-3-4-5</b>가 가장 세고 <b>2-3-4-5-6</b>이 그다음이에요.</p>`);
          const rows = [
            [T(5, M), T(6, M), T(7, M), T(8, M), T(9, M)],
            [T(6, C), T(6, S), T(6, M), T(6, H), T(3, C)],
            [T(8, C), T(8, S), T(8, H), T(4, C), T(4, M)],
            [T(3, H), T(5, H), T(7, H), T(9, H), T(1, H)],
            [T(3, S), T(4, M), T(5, C), T(6, H), T(7, S)],
          ];
          const anchors = this.stage.showcase(rows, { scale: 0.66, gapZ: 0.95, z0: -0.1 });
          this.addTutLabels(anchors, ['① 스트레이트 플러시', '② 포카드', '③ 풀하우스', '④ 플러시', '⑤ 스트레이트']);
        },
      },
      {
        title: '패스와 바닥 정리',
        interactive: true,
        setup: async (token) => {
          this.text(`<p>토끼 선생이 낸 걸 볼까요?</p>`);
          await this.oppPlays(1, [T(2, H)]);
          if (token !== this.token) return;
          this.setHand([T(4, C), T(6, S), T(8, M), T(9, H), T(1, C)]);
          this.text(`<p>해 2는 <b>가장 센 한 장</b>이라 이길 수 없어요.</p><p>이럴 땐 <b>[패스]</b>를 누르세요.</p>`);
          this.spot('#btn-pass');
          const table = checkPlay([T(2, H)], null, MAXN).combo;
          this.handler = {
            table,
            play: () => this.tryPlay(table),
            pass: async () => {
              this.handler = {};
              this.spot(null);
              this.updateActions();
              audio.pass();
              ui.seatBubble(0, '패스');
              this.stage.setTurn(2);
              await wait(0.7);
              if (token !== this.token) return;
              ui.seatBubble(2, '패스');
              audio.pass();
              await wait(0.7);
              if (token !== this.token) return;
              audio.sweep();
              await this.stage.sweepCenter();
              if (token !== this.token) return;
              this.stage.setTurn(1);
              ui.setTableInfo('모두 패스! <b>토끼 선생</b>부터 새로 시작해요');
              this.text(`<p class="tut-ok">바닥 정리! ✔</p><p>나머지 모두가 패스하면 <b>마지막에 낸 사람</b>이 바닥을 비우고 아무 조합이나 새로 시작해요.</p><p class="note">패스해도 다음 차례에 다시 낼 수 있어요. 바닥이 비어 있을 땐 패스할 수 없어요.</p>`);
              this.complete();
            },
          };
          this.updateActions();
        },
      },
      {
        title: '점수 계산',
        interactive: false,
        setup: async () => {
          this.text(`<p>누군가 타일을 다 내면 라운드 끝! <b>남은 장수가 점수</b>이고, 손에 남은 <b>2 한 장마다 ×2</b>예요.</p>
            <table class="score-ex">
              <tr><td>🙂 나</td><td>0장</td><td>0점 🏆</td></tr>
              <tr><td>🐰 토끼 선생</td><td>3장</td><td>3점</td></tr>
              <tr><td>🐻 곰 선배</td><td>4장 (2가 1장)</td><td>4 × 2 = 8점</td></tr>
            </table>
            <p>모든 두 사람이 <b>점수 차이만큼</b> 칩을 주고받아요: 토끼→나 3, 곰→나 8, 곰→토끼 5.<br>
            결과: 나 <span class="plus">+11</span>, 토끼 <span class="plus">+2</span>, 곰 <span class="minus">−13</span></p>
            <p class="note">2는 가장 세지만, 끝까지 들고 있으면 위험해요!</p>`);
          this.stage.setChips(0, 71);
          this.stage.setChips(1, 62);
          this.stage.setChips(2, 47);
          ui.updateLabel(1, { count: 3, chips: 62 });
          ui.updateLabel(2, { count: 4, chips: 47 });
          await wait(0.2);
          this.stage.flyCoins(2, 0, 8, () => audio.chip());
          this.stage.flyCoins(1, 0, 3, () => audio.chip());
        },
      },
    ];
  }
}

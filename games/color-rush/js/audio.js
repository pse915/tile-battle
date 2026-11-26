// 컬러 러시 소리: 카드 '탁', 뽑기 '스윽', 건너뛰기 '뿅', +2 '띠링띠링', 색 바꾸기 반짝이, '마지막!' 외침, 승리 팡파르
// 배경음: 쉬는 시간 종이 울린 듯한 신나는 칩튠 팝 (C - Am - F - G, 직접 만든 멜로디)
import { AudioCore } from '../../../shared/audio-core.js';

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

class CRAudio extends AudioCore {
  play() {
    this.noiseHit({ dur: 0.06, gain: 0.45, freq: 2200, q: 1.2, sweepTo: 900 });
    this.tone({ freq: 220, to: 120, dur: 0.09, gain: 0.25, type: 'triangle' });
  }
  draw(k = 0) {
    this.noiseHit({ dur: 0.14, gain: 0.22, filter: 'highpass', freq: 1800, sweepTo: 5200, q: 0.7, at: k * 0.08, attack: 0.05 });
  }
  skip() {
    this.tone({ freq: 880, to: 330, dur: 0.18, gain: 0.18, type: 'square' });
    this.tone({ freq: 660, to: 250, dur: 0.18, gain: 0.12, type: 'square', at: 0.12 });
  }
  reverse() {
    this.noiseHit({ dur: 0.35, gain: 0.25, freq: 600, sweepTo: 3200, q: 2, attack: 0.15 });
    this.tone({ freq: 392, to: 784, dur: 0.25, gain: 0.12, type: 'triangle' });
    this.tone({ freq: 784, to: 392, dur: 0.25, gain: 0.12, type: 'triangle', at: 0.22 });
  }
  plus(n = 2) {
    const base = n === 4 ? 523 : 659;
    for (let i = 0; i < n; i++) this.tone({ freq: base * (1 + i * 0.12), dur: 0.12, gain: 0.16, type: 'square', at: i * 0.09 });
    this.tone({ freq: 110, to: 70, dur: 0.3, gain: 0.3, type: 'sine', at: n * 0.09 });
  }
  colorPick() {
    [784, 988, 1175, 1568, 1976].forEach((f, i) => this.tone({ freq: f, dur: 0.18, gain: 0.08, type: 'sine', at: i * 0.05 }));
  }
  /** '마지막!' 외침: 목소리 비슷한 모음 소리 두 마디 */
  shout() {
    if (!this.ctx) return;
    const say = (f0, at, dur, formant) => {
      const t = this.ctx.currentTime + at;
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.linearRampToValueAtTime(f0 * 1.25, t + dur * 0.6);
      o.frequency.linearRampToValueAtTime(f0 * 0.9, t + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.28, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = o;
      formant.forEach((fr) => {
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'peaking';
        bp.frequency.value = fr;
        bp.gain.value = 14;
        bp.Q.value = 5;
        node.connect(bp);
        node = bp;
      });
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3200;
      node.connect(lp).connect(g).connect(this.sfxBus);
      o.start(t);
      o.stop(t + dur + 0.05);
    };
    say(260, 0, 0.12, [800, 1200]); // 마
    say(300, 0.12, 0.12, [300, 2300]); // 지
    say(360, 0.24, 0.28, [800, 1200]); // 막!
    this.tone({ freq: 1568, dur: 0.25, gain: 0.08, type: 'triangle', at: 0.4 });
  }
  catchCall() {
    // 호루라기
    this.tone({ freq: 2600, dur: 0.12, gain: 0.12, type: 'sine' });
    this.tone({ freq: 2500, dur: 0.35, gain: 0.12, type: 'sine', at: 0.14 });
    this.noiseHit({ dur: 0.45, gain: 0.05, freq: 2600, q: 8, at: 0.02 });
  }
  myTurn() {
    this.tone({ freq: 988, dur: 0.1, gain: 0.08, type: 'triangle' });
    this.tone({ freq: 1319, dur: 0.16, gain: 0.08, type: 'triangle', at: 0.08 });
  }
  win() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone({ freq: f, dur: i === 6 ? 0.6 : 0.16, gain: 0.16, type: 'square', at: i * 0.11 }));
    this.noiseHit({ dur: 0.6, gain: 0.12, filter: 'highpass', freq: 6000, at: 0.66 });
  }
  lose() {
    [392, 370, 349, 262].forEach((f, i) => this.tone({ freq: f, dur: i === 3 ? 0.5 : 0.22, gain: 0.12, type: 'triangle', at: i * 0.2 }));
  }

  stepLength() {
    return 0.14; // 16분음표 (약 107 BPM의 두 배 느낌)
  }
  scheduleStep(step, at) {
    const bus = this.bgmBus;
    const bar = Math.floor(step / 16) % 8;
    const s = step % 16;
    // C Am F G | C Am F G(올림)
    const roots = [48, 45, 41, 43, 48, 45, 41, 43];
    const third = [4, 3, 4, 4, 4, 3, 4, 4];
    const r = roots[bar];
    // 킥 · 스네어 · 하이햇
    if (s % 4 === 0) this.tone({ freq: 120, to: 45, dur: 0.12, gain: 0.32, type: 'sine', at, bus });
    if (s === 4 || s === 12) this.noiseHit({ dur: 0.1, gain: 0.14, freq: 1800, q: 0.8, at, bus });
    if (s % 2 === 1) this.noiseHit({ dur: 0.03, gain: 0.05, filter: 'highpass', freq: 7000, at, bus });
    // 통통 튀는 베이스
    if (s % 2 === 0) this.tone({ freq: NOTE(r - 12 + (s % 4 === 2 ? 12 : 0)), dur: 0.12, gain: 0.12, type: 'triangle', at, bus });
    // 화음 찍기
    if (s === 2 || s === 6 || s === 10 || s === 14)
      [0, third[bar], 7].forEach((iv) => this.tone({ freq: NOTE(r + 12 + iv), dur: 0.09, gain: 0.025, type: 'square', at, bus }));
    // 멜로디 (두 마디마다 같은 꼴, 마지막 4마디는 한 옥타브 위로 장식)
    const mel = [
      [72, null, 76, null, 79, null, 76, 77, 79, null, 81, null, 79, null, null, null],
      [76, null, 72, null, 76, null, 79, null, 77, 76, 74, null, 72, null, null, null],
    ];
    const line = mel[bar % 2];
    let n = line[s];
    if (n != null) {
      if (bar === 2 || bar === 6) n -= 3;
      if (bar === 3 || bar === 7) n -= 1;
      const hi = bar >= 4 ? 12 : 0;
      this.tone({ freq: NOTE(n + hi - 12), dur: 0.16, gain: 0.05, type: 'square', at, bus });
      if (bar >= 4) this.tone({ freq: NOTE(n + hi - 12), dur: 0.16, gain: 0.02, type: 'triangle', at: at + 0.07, bus, detune: 8 });
    }
  }
}

export const audio = new CRAudio();

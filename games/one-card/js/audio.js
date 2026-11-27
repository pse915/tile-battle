// 원카드 소리: 카드 '탁', 뽑기 '스윽', 공격 '쿵쿵', 막기 '챙!', 한 번 더 '뾰롱', 무늬 바꾸기 반짝이, '원카드!' 외침, 파산 '우르르', 승리 팡파르
// 배경음: 통통 튀는 스윙 셔플 (F - Dm - Bb - C, 직접 만든 멜로디)
import { AudioCore } from '../../../shared/audio-core.js';

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

class OCAudio extends AudioCore {
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
  /** 공격 카드: 세기만큼 쿵쿵 */
  attack(n = 2) {
    const k = Math.min(6, Math.ceil(n / 2));
    for (let i = 0; i < k; i++) this.tone({ freq: 160 - i * 12, to: 60, dur: 0.16, gain: 0.32, type: 'sine', at: i * 0.08 });
    this.tone({ freq: 880, to: 440, dur: 0.2, gain: 0.1, type: 'square', at: 0.02 });
    this.noiseHit({ dur: 0.25, gain: 0.18, freq: 400, q: 0.8, at: k * 0.08 });
  }
  /** 공격 맞음: 묵직한 쿵 */
  hit() {
    this.tone({ freq: 90, to: 40, dur: 0.4, gain: 0.45, type: 'sine' });
    this.noiseHit({ dur: 0.3, gain: 0.25, freq: 300, q: 0.6 });
  }
  /** 막기: '챙!' */
  block() {
    [1568, 2093, 2637].forEach((f, i) => this.tone({ freq: f, dur: 0.3, gain: 0.08, type: 'triangle', at: i * 0.015 }));
    this.noiseHit({ dur: 0.12, gain: 0.2, filter: 'highpass', freq: 3000, q: 1 });
  }
  again() {
    [659, 880, 1175].forEach((f, i) => this.tone({ freq: f, dur: 0.1, gain: 0.1, type: 'square', at: i * 0.06 }));
  }
  bust() {
    [392, 330, 262, 196, 131].forEach((f, i) => this.tone({ freq: f, dur: 0.22, gain: 0.14, type: 'sawtooth', at: i * 0.12 }));
    this.noiseHit({ dur: 0.8, gain: 0.2, freq: 200, sweepTo: 80, q: 0.5, at: 0.3 });
  }
  suitPick() {
    [784, 988, 1175, 1568, 1976].forEach((f, i) => this.tone({ freq: f, dur: 0.18, gain: 0.08, type: 'sine', at: i * 0.05 }));
  }
  /** '원카드!' 외침: 목소리 비슷한 모음 소리 세 마디 */
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
    say(250, 0, 0.14, [400, 800]); // 원
    say(320, 0.14, 0.12, [800, 1200]); // 카
    say(380, 0.26, 0.28, [350, 1000]); // 드!
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
    return 0.13;
  }
  scheduleStep(step, at) {
    const bus = this.bgmBus;
    const bar = Math.floor(step / 16) % 8;
    const s = step % 16;
    // F Dm Bb C | F Dm Bb C
    const roots = [41, 38, 46, 48, 41, 38, 46, 48];
    const third = [4, 3, 4, 4, 4, 3, 4, 4];
    const r = roots[bar];
    const swing = s % 2 === 1 ? 0.04 : 0;
    if (s % 4 === 0) this.tone({ freq: 110, to: 45, dur: 0.12, gain: 0.3, type: 'sine', at, bus });
    if (s === 4 || s === 12) this.noiseHit({ dur: 0.09, gain: 0.12, freq: 2000, q: 0.8, at, bus });
    if (s % 2 === 1) this.noiseHit({ dur: 0.03, gain: 0.045, filter: 'highpass', freq: 7500, at: at + swing, bus });
    if (s % 4 === 0) {
      const walk = [0, 4, 7, 9][(s / 4) | 0];
      this.tone({ freq: NOTE(r - 12 + walk), dur: 0.22, gain: 0.13, type: 'triangle', at, bus });
    }
    if (s % 4 === 2) [0, third[bar], 7].forEach((iv) => this.tone({ freq: NOTE(r + 12 + iv), dur: 0.08, gain: 0.022, type: 'square', at: at + 0.03, bus }));
    const mel = [
      [77, null, 81, 84, null, 81, 79, null, 77, null, 74, null, 77, null, null, null],
      [72, null, 74, 77, null, 79, 81, null, 79, 77, null, 74, 72, null, null, null],
    ];
    let n = mel[bar % 2][s];
    if (n != null) {
      if (bar === 2 || bar === 6) n += 5;
      if (bar === 3 || bar === 7) n += 7;
      const hi = bar >= 4 ? 12 : 0;
      this.tone({ freq: NOTE(n + hi - 12), dur: 0.15, gain: 0.05, type: 'square', at: at + swing, bus });
      if (bar >= 4) this.tone({ freq: NOTE(n + hi - 24), dur: 0.15, gain: 0.025, type: 'triangle', at: at + swing + 0.02, bus });
    }
  }
}

export const audio = new OCAudio();

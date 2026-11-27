// 서라벌학교여행 소리: 주사위 달그락, 말 톡톡, 구입 짤랑, 통행료, 카드, 파산, 승리 + 경쾌한 소풍 배경음
import { AudioCore } from '../../../shared/audio-core.js';

class SchoolAudio extends AudioCore {
  dice() {
    for (let k = 0; k < 6; k++) this.noiseHit({ dur: 0.03, gain: 0.3 - k * 0.04, freq: 1800 + Math.random() * 1500, q: 3, at: k * 0.07 + Math.random() * 0.03 });
  }
  diceLand() {
    this.tone({ freq: 220, to: 120, dur: 0.1, gain: 0.25, type: 'triangle' });
  }
  tap(k = 0) {
    this.tone({ freq: 520 + (k % 4) * 60, dur: 0.07, gain: 0.12, type: 'square' });
  }
  buy() {
    [1319, 1568, 2093].forEach((f, i) => this.tone({ freq: f, dur: 0.12, gain: 0.12, type: 'triangle', at: i * 0.07 }));
    this.noiseHit({ dur: 0.08, gain: 0.15, freq: 6000, q: 2, at: 0.05 });
  }
  build() {
    [0, 0.12, 0.24].forEach((t, i) => this.noiseHit({ dur: 0.05, gain: 0.35, freq: 900 + i * 200, q: 4, at: t }));
    this.tone({ freq: 784, dur: 0.2, gain: 0.12, type: 'triangle', at: 0.36 });
  }
  rent() {
    this.tone({ freq: 660, to: 330, dur: 0.3, gain: 0.15, type: 'sawtooth' });
    this.noiseHit({ dur: 0.06, gain: 0.15, freq: 5000, q: 2, at: 0.15 });
  }
  gain() {
    [880, 1175].forEach((f, i) => this.tone({ freq: f, dur: 0.12, gain: 0.13, type: 'triangle', at: i * 0.08 }));
  }
  card() {
    this.noiseHit({ dur: 0.12, gain: 0.2, freq: 3000, q: 1 });
    this.tone({ freq: 988, dur: 0.15, gain: 0.1, type: 'sine', at: 0.1 });
    this.tone({ freq: 1319, dur: 0.2, gain: 0.1, type: 'sine', at: 0.2 });
  }
  jail() {
    [392, 370, 349].forEach((f, i) => this.tone({ freq: f, dur: 0.2, gain: 0.14, type: 'square', at: i * 0.15 }));
  }
  elev() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone({ freq: f, dur: 0.12, gain: 0.1, type: 'sine', at: i * 0.06 }));
  }
  bankrupt() {
    [392, 330, 262, 196].forEach((f, i) => this.tone({ freq: f, dur: 0.35, gain: 0.16, type: 'sawtooth', at: i * 0.18 }));
  }
  win() {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone({ freq: f, dur: 0.3, gain: 0.18, type: 'triangle', at: i * 0.11 }));
  }
  lose() {
    [392, 330, 262].forEach((f, i) => this.tone({ freq: f, dur: 0.35, gain: 0.14, type: 'sine', at: i * 0.16 }));
  }
  stepLength() {
    return 0.2;
  }
  // 소풍 가는 길: C - Am - F - G 경쾌한 행진
  scheduleStep(step, at) {
    const chords = [
      [261.6, 329.6, 392],
      [220, 261.6, 329.6],
      [174.6, 220, 261.6],
      [196, 246.9, 293.7],
    ];
    const mel = [0, 2, 1, 2, 0, 1, 2, 1];
    const bar = Math.floor(step / 8) % 4;
    const s = step % 8;
    const ch = chords[bar];
    if (s % 4 === 0) this.tone({ freq: ch[0] / 2, dur: 0.25, gain: 0.07, type: 'triangle', at, bus: this.bgmBus });
    if (s % 4 === 2) ch.forEach((f) => this.tone({ freq: f, dur: 0.12, gain: 0.025, type: 'square', at, bus: this.bgmBus }));
    if (s % 2 === 0) this.tone({ freq: ch[mel[(s + bar) % 8]] * 2, dur: 0.16, gain: 0.035, type: 'sine', at, bus: this.bgmBus });
    if (s % 2 === 1) this.noiseHit({ dur: 0.03, gain: 0.025, freq: 7000, q: 1, at, bus: this.bgmBus });
  }
}

export const audio = new SchoolAudio();

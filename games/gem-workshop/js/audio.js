// 보석 공방 소리: 보석 '찰랑', 카드 사기 '착!', 찜하기 '스윽', 후원자 방문 종소리, 승리 팡파르
// 배경음: 오르골 느낌의 왈츠 (Am - F - C - G, 직접 만든 멜로디)
import { AudioCore } from '../../../shared/audio-core.js';

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

class GWAudio extends AudioCore {
  pick() {
    this.tone({ freq: 1760, to: 2093, dur: 0.06, gain: 0.08, type: 'triangle' });
  }
  take(n = 3) {
    for (let i = 0; i < n; i++) {
      this.tone({ freq: 2093 + i * 260, dur: 0.12, gain: 0.07, type: 'triangle', at: i * 0.07 });
      this.noiseHit({ dur: 0.05, gain: 0.12, filter: 'highpass', freq: 5200, at: i * 0.07 });
    }
  }
  buy() {
    this.noiseHit({ dur: 0.07, gain: 0.4, freq: 2000, q: 1.2, sweepTo: 800 });
    [784, 988, 1175].forEach((f, i) => this.tone({ freq: f, dur: 0.18, gain: 0.1, type: 'square', at: 0.05 + i * 0.06 }));
  }
  reserve() {
    this.noiseHit({ dur: 0.18, gain: 0.2, filter: 'highpass', freq: 1600, sweepTo: 4800, q: 0.7, attack: 0.06 });
    this.tone({ freq: 1568, dur: 0.2, gain: 0.08, type: 'triangle', at: 0.12 });
  }
  patron() {
    [1047, 1319, 1568, 2093].forEach((f, i) => this.tone({ freq: f, dur: 0.6, gain: 0.08, type: 'sine', at: i * 0.12 }));
  }
  myTurn() {
    this.tone({ freq: 988, dur: 0.1, gain: 0.08, type: 'triangle' });
    this.tone({ freq: 1319, dur: 0.16, gain: 0.08, type: 'triangle', at: 0.08 });
  }
  win() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone({ freq: f, dur: i === 6 ? 0.6 : 0.16, gain: 0.15, type: 'square', at: i * 0.11 }));
  }
  lose() {
    [440, 415, 392, 330].forEach((f, i) => this.tone({ freq: f, dur: i === 3 ? 0.5 : 0.22, gain: 0.11, type: 'triangle', at: i * 0.2 }));
  }

  stepLength() {
    return 0.2;
  }
  scheduleStep(step, at) {
    const bus = this.bgmBus;
    const bar = Math.floor(step / 6) % 8;
    const s = step % 6; // 3/4 박자, 8분음표 6개
    const roots = [57, 53, 48, 55, 57, 53, 55, 52];
    const r = roots[bar];
    if (s === 0) this.tone({ freq: NOTE(r - 12), dur: 0.5, gain: 0.12, type: 'triangle', at, bus });
    if (s === 2 || s === 4) [0, r % 12 === 9 || r % 12 === 4 ? 3 : 4, 7].forEach((iv) => this.tone({ freq: NOTE(r + iv), dur: 0.14, gain: 0.025, type: 'sine', at, bus }));
    const mel = [
      [76, null, 72, null, 74, 76],
      [77, null, 76, null, 74, null],
      [72, null, 74, null, 76, 79],
      [79, null, 77, null, 74, null],
    ];
    const n = mel[bar % 4][s];
    if (n != null) this.tone({ freq: NOTE(n + (bar >= 4 ? 12 : 0)), dur: 0.3, gain: 0.05, type: 'sine', at, bus });
  }
}

export const audio = new GWAudio();

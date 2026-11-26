// 급식 다섯! 소리: 카드 뒤집는 '착', 종 '땡!', 정답 팡파레, 오답 '뿌우', 신나는 점심시간 배경음 (직접 작곡)
import { AudioCore } from '../../../shared/audio-core.js';

class LunchAudio extends AudioCore {
  flip() {
    this.noiseHit({ dur: 0.06, gain: 0.35, freq: 2600, q: 1.2, sweepTo: 900 });
    this.tone({ freq: 520, to: 760, dur: 0.06, gain: 0.05, type: 'triangle' });
  }
  /** 금속 종: 어울리지 않는 배음 여러 개가 길게 울림 */
  bell() {
    const f = 1180;
    [
      [1, 0.28, 1.4],
      [2.76, 0.12, 0.9],
      [5.4, 0.07, 0.5],
      [8.93, 0.03, 0.3],
    ].forEach(([m, g, d]) => this.tone({ freq: f * m, dur: d, gain: g, type: 'sine', attack: 0.002 }));
    this.noiseHit({ dur: 0.03, gain: 0.25, freq: 5000, q: 2 });
  }
  correct() {
    [659, 784, 988, 1319].forEach((f, i) => this.tone({ freq: f, dur: 0.22, gain: 0.16, type: 'triangle', at: 0.12 + i * 0.08 }));
    this.tone({ freq: 1568, dur: 0.4, gain: 0.08, type: 'sine', at: 0.46 });
  }
  wrong() {
    this.tone({ freq: 233, to: 175, dur: 0.45, gain: 0.16, type: 'sawtooth', at: 0.1 });
    this.tone({ freq: 220, to: 165, dur: 0.45, gain: 0.1, type: 'square', at: 0.1, detune: 12 });
  }
  give() {
    this.noiseHit({ dur: 0.05, gain: 0.2, freq: 1800, q: 1 });
  }
  out() {
    [523, 440, 349].forEach((f, i) => this.tone({ freq: f, dur: 0.22, gain: 0.12, type: 'triangle', at: i * 0.12 }));
  }
  win() {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone({ freq: f, dur: 0.28, gain: 0.17, type: 'triangle', at: i * 0.1 }));
  }
  lose() {
    [392, 349, 294, 262].forEach((f, i) => this.tone({ freq: f, dur: 0.3, gain: 0.13, type: 'sine', at: i * 0.15 }));
  }
  stepLength() {
    return 0.14;
  }
  // 통통 튀는 마림바풍 점심시간 노래 (C - Am - F - G, 16분음표)
  scheduleStep(step, at) {
    const bus = this.bgmBus;
    const roots = [130.81, 110, 87.31, 98];
    const chords = [
      [523.25, 659.25, 783.99],
      [440, 523.25, 659.25],
      [349.23, 440, 523.25],
      [392, 493.88, 587.33],
    ];
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const ch = chords[bar];
    // 베이스: 쿵-짝
    if (s % 4 === 0) this.tone({ freq: roots[bar], dur: 0.18, gain: 0.1, type: 'triangle', at, bus });
    if (s % 4 === 2) this.tone({ freq: roots[bar] * 1.5, dur: 0.1, gain: 0.05, type: 'triangle', at, bus });
    // 손뼉·하이햇
    if (s % 8 === 4) this.noiseHit({ dur: 0.07, gain: 0.07, freq: 1500, q: 0.8, at, bus });
    if (s % 2 === 1) this.noiseHit({ dur: 0.025, gain: 0.025, freq: 7000, q: 1, at, bus });
    // 마림바 멜로디 (짧게 톡톡)
    const mel = [0, -1, 1, -1, 2, -1, 1, 0, -1, 2, -1, 1, 0, -1, 2, -1];
    const phrase = Math.floor(step / 64) % 2;
    const idx = mel[(s + phrase * 3) % 16];
    if (idx >= 0) {
      const f = ch[idx] * (phrase && s > 11 ? 2 : 1);
      this.tone({ freq: f, dur: 0.12, gain: 0.05, type: 'sine', at, bus });
      this.tone({ freq: f * 4, dur: 0.04, gain: 0.01, type: 'sine', at, bus });
    }
    // 마디 끝 작은 장식
    if (s === 14 && bar === 3) this.tone({ freq: 1046.5, dur: 0.15, gain: 0.03, type: 'triangle', at, bus });
  }
}

export const audio = new LunchAudio();

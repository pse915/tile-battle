// 흑백 뒤집기 대전 소리: 돌 놓는 '딱', 뒤집히는 '틱' 연쇄, 잔잔한 보드게임 카페 배경음
import { AudioCore } from '../../../shared/audio-core.js';

class FlipAudio extends AudioCore {
  place() {
    this.noiseHit({ dur: 0.05, gain: 0.5, freq: 2400, q: 3 });
    this.tone({ freq: 180, to: 90, dur: 0.12, gain: 0.35, type: 'triangle' });
  }
  flip(k = 0) {
    this.noiseHit({ dur: 0.03, gain: 0.25, freq: 3200 + k * 120, q: 4 });
    this.tone({ freq: 660 + k * 45, dur: 0.06, gain: 0.08, type: 'sine' });
  }
  pass() {
    this.tone({ freq: 523, dur: 0.12, gain: 0.12, type: 'triangle' });
    this.tone({ freq: 392, dur: 0.2, gain: 0.12, type: 'triangle', at: 0.12 });
  }
  win() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone({ freq: f, dur: 0.3, gain: 0.18, type: 'triangle', at: i * 0.11 }));
  }
  lose() {
    [392, 330, 262].forEach((f, i) => this.tone({ freq: f, dur: 0.35, gain: 0.14, type: 'sine', at: i * 0.16 }));
  }
  stepLength() {
    return 0.32;
  }
  // 느긋한 재즈풍 피아노 (Dm7 - G7 - Cmaj7 - A7)
  scheduleStep(step, at) {
    const chords = [
      [146.8, 174.6, 220, 261.6],
      [196, 246.9, 293.7, 349.2],
      [130.8, 164.8, 196, 246.9],
      [110, 138.6, 164.8, 196],
    ];
    const bar = Math.floor(step / 8) % 4;
    const s = step % 8;
    const ch = chords[bar];
    if (s === 0 || s === 5) ch.forEach((f, i) => this.tone({ freq: f * 2, dur: 0.9, gain: 0.035, type: 'sine', at: at + i * 0.012, bus: this.bgmBus }));
    if (s % 2 === 0) this.tone({ freq: ch[s / 2 % 4] / 2, dur: 0.3, gain: 0.06, type: 'triangle', at, bus: this.bgmBus });
    if (s === 3 || s === 7) this.noiseHit({ dur: 0.04, gain: 0.03, freq: 6000, q: 1, at, bus: this.bgmBus });
    if (step % 16 === 10) this.tone({ freq: ch[3] * 4, dur: 0.4, gain: 0.025, type: 'sine', at, bus: this.bgmBus });
  }
}

export const audio = new FlipAudio();

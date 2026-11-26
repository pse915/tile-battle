// 비밀번호 해독반 소리: 타일 '딸깍', 자물쇠 풀리는 소리, 틀림 '부웅', 미스터리한 밤의 동아리방 배경음
import { AudioCore } from '../../../shared/audio-core.js';

class CodeAudio extends AudioCore {
  draw() {
    this.noiseHit({ dur: 0.12, gain: 0.18, freq: 1400, sweepTo: 3800, q: 1.2 });
    this.tone({ freq: 520, dur: 0.06, gain: 0.06, type: 'triangle', at: 0.1 });
  }
  place() {
    this.noiseHit({ dur: 0.04, gain: 0.4, freq: 2600, q: 3 });
    this.tone({ freq: 210, to: 120, dur: 0.1, gain: 0.25, type: 'triangle' });
  }
  select() {
    this.tone({ freq: 880, dur: 0.05, gain: 0.08, type: 'sine' });
    this.tone({ freq: 1320, dur: 0.05, gain: 0.05, type: 'sine', at: 0.04 });
  }
  /** 추측 순간: 다이얼 돌아가는 째깍째깍 */
  dial() {
    for (let i = 0; i < 4; i++) this.noiseHit({ dur: 0.025, gain: 0.18, freq: 4200 - i * 300, q: 6, at: i * 0.11 });
  }
  /** 맞힘: 자물쇠 풀리는 소리 + 밝은 화음 */
  ok() {
    this.noiseHit({ dur: 0.05, gain: 0.35, freq: 1800, q: 2 });
    this.tone({ freq: 140, to: 70, dur: 0.12, gain: 0.25, type: 'square', at: 0.02 });
    [659, 880, 1175].forEach((f, i) => this.tone({ freq: f, dur: 0.35, gain: 0.12, type: 'triangle', at: 0.1 + i * 0.07 }));
  }
  /** 틀림: 낮은 경고음 */
  ng() {
    this.tone({ freq: 160, dur: 0.32, gain: 0.16, type: 'sawtooth' });
    this.tone({ freq: 151, dur: 0.32, gain: 0.12, type: 'sawtooth', at: 0.02 });
  }
  flip() {
    this.noiseHit({ dur: 0.06, gain: 0.3, freq: 2200, q: 2 });
    this.tone({ freq: 330, to: 180, dur: 0.14, gain: 0.14, type: 'triangle', at: 0.05 });
  }
  out() {
    [440, 370, 311, 233].forEach((f, i) => this.tone({ freq: f, dur: 0.3, gain: 0.13, type: 'square', at: i * 0.12 }));
  }
  win() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone({ freq: f, dur: 0.35, gain: 0.16, type: 'triangle', at: i * 0.1 }));
  }
  lose() {
    [392, 349, 294, 220].forEach((f, i) => this.tone({ freq: f, dur: 0.4, gain: 0.13, type: 'sine', at: i * 0.17 }));
  }
  stepLength() {
    return 0.36;
  }
  // 느린 단조 아르페지오 (Am - F - Dm - E) + 낮은 지속음 + 시계 초침 + 가끔 높은 종소리
  scheduleStep(step, at) {
    const bus = this.bgmBus;
    const chords = [
      [220, 261.6, 329.6],
      [174.6, 220, 261.6],
      [146.8, 174.6, 220],
      [164.8, 207.7, 246.9],
    ];
    const bar = Math.floor(step / 8) % 4;
    const s = step % 8;
    const ch = chords[bar];
    if (s === 0) {
      this.tone({ freq: ch[0] / 2, dur: 2.8, gain: 0.05, type: 'sine', at, attack: 0.4, bus });
      this.tone({ freq: ch[0] / 4, dur: 2.8, gain: 0.04, type: 'triangle', at, attack: 0.6, bus });
    }
    const arp = [0, 1, 2, 1, 0, 2, 1, 2];
    this.tone({ freq: ch[arp[s]] * 2, dur: 0.5, gain: s % 4 === 0 ? 0.04 : 0.025, type: 'sine', at, bus });
    if (s % 2 === 0) this.noiseHit({ dur: 0.02, gain: 0.025, freq: 5200, q: 8, at, bus });
    if (step % 32 === 13) this.tone({ freq: ch[2] * 4, dur: 1.4, gain: 0.02, type: 'sine', at, bus, detune: 8 });
    if (step % 32 === 29) this.tone({ freq: ch[1] * 3, dur: 1.2, gain: 0.018, type: 'triangle', at, bus });
  }
}

export const audio = new CodeAudio();

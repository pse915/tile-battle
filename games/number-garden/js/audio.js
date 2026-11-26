// 숫자 블록 정원 소리: 타일 '딸깍', 세트 완성 반짝, 오류, 승리 + 새소리 섞인 느긋한 정원 배경음
import { AudioCore } from '../../../shared/audio-core.js';

class GardenAudio extends AudioCore {
  /** 타일 내려놓기: 단단한 블록이 부딪히는 짧은 딸깍 */
  place(k = 0) {
    this.noiseHit({ dur: 0.035, gain: 0.45, freq: 2800 + k * 90, q: 5 });
    this.tone({ freq: 980 + k * 40, to: 620, dur: 0.05, gain: 0.08, type: 'triangle' });
  }
  pick() {
    this.noiseHit({ dur: 0.02, gain: 0.18, freq: 4200, q: 4 });
    this.tone({ freq: 1400, dur: 0.03, gain: 0.04 });
  }
  /** 세트가 유효해짐: 실로폰 세 음 */
  setDone() {
    [784, 988, 1175].forEach((f, i) => this.tone({ freq: f, dur: 0.22, gain: 0.1, type: 'sine', at: i * 0.06 }));
  }
  /** 첫 등록 / 턴 끝내기 성공: 꽃 피는 아르페지오 */
  bloom() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone({ freq: f, dur: 0.35, gain: 0.09, type: 'triangle', at: i * 0.07 }));
  }
  draw() {
    this.noiseHit({ dur: 0.12, gain: 0.18, freq: 1500, q: 1, sweepTo: 3500 });
    this.tone({ freq: 440, to: 660, dur: 0.12, gain: 0.05, type: 'sine', at: 0.04 });
  }
  myTurn() {
    this.tone({ freq: 880, dur: 0.12, gain: 0.08, type: 'sine' });
    this.tone({ freq: 1320, dur: 0.18, gain: 0.07, type: 'sine', at: 0.1 });
  }
  win() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone({ freq: f, dur: 0.32, gain: 0.15, type: 'triangle', at: i * 0.1 }));
    this.chirp(0.8);
  }
  lose() {
    [440, 392, 349, 330].forEach((f, i) => this.tone({ freq: f, dur: 0.35, gain: 0.12, type: 'sine', at: i * 0.15 }));
  }
  /** 작은 새 지저귐 */
  chirp(at = 0, bus = this.sfxBus, gain = 0.05) {
    const base = 2600 + Math.random() * 900;
    for (let i = 0; i < 3; i++) this.tone({ freq: base, to: base * 1.35, dur: 0.06, gain, type: 'sine', at: at + i * 0.09, bus });
  }
  stepLength() {
    return 0.36;
  }
  // 느긋한 왈츠풍 (C - Am - F - G), 오르골 같은 멜로디 + 가끔 새소리
  scheduleStep(step, at) {
    const bus = this.bgmBus;
    const chords = [
      [130.8, 164.8, 196],
      [110, 130.8, 164.8],
      [87.3, 110, 130.8],
      [98, 123.5, 146.8],
    ];
    const melody = [
      [784, 0, 659, 0, 698, 659],
      [659, 0, 523, 0, 587, 523],
      [523, 0, 587, 659, 698, 0],
      [587, 0, 494, 0, 523, 587],
    ];
    const bar = Math.floor(step / 6) % 4;
    const s = step % 6;
    const ch = chords[bar];
    if (s === 0) this.tone({ freq: ch[0], dur: 1.2, gain: 0.07, type: 'triangle', at, bus });
    if (s === 2 || s === 4) ch.slice(1).forEach((f) => this.tone({ freq: f * 2, dur: 0.4, gain: 0.025, type: 'sine', at, bus }));
    const phrase = Math.floor(step / 24) % 2;
    const m = melody[bar][s];
    if (m && phrase === 0) this.tone({ freq: m * 1.0, dur: 0.5, gain: 0.03, type: 'sine', at, bus });
    if (m && phrase === 1 && s % 2 === 0) this.tone({ freq: m * 2, dur: 0.6, gain: 0.018, type: 'sine', at, bus });
    if (step % 37 === 20 || step % 53 === 7) this.chirp(at, bus, 0.02);
  }
}

export const audio = new GardenAudio();

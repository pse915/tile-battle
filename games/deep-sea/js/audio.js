// 심해 보물섬 소리 — 파도, 카드, 보물, 대왕문어, 뱃노래풍 배경음 (모두 합성)
import { AudioCore } from '../../../shared/audio-core.js';

const D = 146.83; // 레
const semi = (f, n) => f * 2 ** (n / 12);

class SeaAudio extends AudioCore {
  onUnlock() {
    // 파도 앰비언스: 저역 통과 잡음의 크기를 천천히 출렁이게
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 480;
    const g = ctx.createGain();
    g.gain.value = 0.12;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.09;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(lp).connect(g).connect(this.bgmBus);
    src.start();
    lfo.start();
  }

  flip() {
    this.noiseHit({ dur: 0.18, gain: 0.25, freq: 900, sweepTo: 3000, q: 0.8 });
    this.tone({ freq: 500, to: 300, dur: 0.08, gain: 0.08, type: 'triangle', at: 0.12 });
  }
  pick() {
    this.tone({ freq: 760, to: 1100, dur: 0.07, gain: 0.08, type: 'triangle' });
  }
  deal() {
    this.noiseHit({ dur: 0.05, gain: 0.08, freq: 2400, q: 1.2 });
  }
  treasure() {
    [1046, 1318, 1568, 2093].forEach((f, i) => this.tone({ freq: f, dur: 0.35, gain: 0.08, type: 'triangle', at: i * 0.07 }));
    for (let i = 0; i < 6; i++) this.tone({ freq: 2600 + Math.random() * 1200, dur: 0.12, gain: 0.03, at: 0.25 + i * 0.05 });
  }
  empty() {
    this.noiseHit({ dur: 0.3, gain: 0.12, freq: 400, q: 0.6, filter: 'lowpass' });
    this.tone({ freq: 220, to: 180, dur: 0.25, gain: 0.06, type: 'sine' });
  }
  monster() {
    this.tone({ freq: 55, to: 38, dur: 2.2, gain: 0.5, type: 'sawtooth', attack: 0.3 });
    this.tone({ freq: 58, to: 41, dur: 2.2, gain: 0.3, type: 'sine', attack: 0.3 });
    this.noiseHit({ dur: 1.8, gain: 0.3, freq: 200, sweepTo: 900, filter: 'lowpass', q: 2, attack: 0.4 });
    [311, 330].forEach((f) => this.tone({ freq: f, dur: 1.4, gain: 0.05, type: 'square', at: 0.4, attack: 0.2 }));
  }
  key() {
    this.tone({ freq: 2200, dur: 0.25, gain: 0.06 });
    this.tone({ freq: 3300, dur: 0.18, gain: 0.04, at: 0.05 });
  }
  say() {
    this.tone({ freq: 520, to: 900, dur: 0.09, gain: 0.07, type: 'sine' });
  }
  yourTurn() {
    this.tone({ freq: 660, dur: 0.1, gain: 0.08 });
    this.tone({ freq: 990, dur: 0.16, gain: 0.08, at: 0.09 });
  }
  win() {
    [587, 740, 880, 1175, 880, 1175].forEach((f, i) => this.tone({ freq: f, dur: i === 5 ? 0.8 : 0.18, gain: 0.13, type: 'square', at: i * 0.13 }));
  }
  lose() {
    [440, 415, 392, 294].forEach((f, i) => this.tone({ freq: f, dur: 0.35, gain: 0.12, type: 'triangle', at: i * 0.24 }));
  }

  // 6/8 박자 뱃노래풍: Dm – C – B♭ – A (마디당 8분음표 6개)
  stepLength() {
    return 60 / 96 / 2;
  }
  scheduleStep(step, at, len) {
    const s = step % 24;
    const bar = Math.floor(s / 6);
    const b = this.bgmBus;
    const roots = [0, -2, -4, -5]; // D, C, B♭, A
    const root = semi(D, roots[bar]);
    // 베이스: 1, 4박
    if (s % 6 === 0 || s % 6 === 3) this.tone({ freq: root / 2, type: 'triangle', dur: len * 2.6, gain: 0.2, at, bus: b });
    // 화음 (아코디언 느낌: 톱니파 + 저역 통과는 버스에서)
    if (s % 6 === 0) {
      const third = bar === 3 ? 4 : bar === 0 ? 3 : 4;
      for (const n of [0, third, 7]) this.tone({ freq: semi(root, n + 12), type: 'sawtooth', dur: len * 5.5, gain: 0.025, attack: 0.08, at, bus: b, detune: 6 });
    }
    // 멜로디 (24스텝, null은 쉼)
    const mel = [7, null, 5, 3, null, 2, 0, null, 2, 3, 5, null, 5, null, 3, 2, null, 0, -1, null, 0, 2, null, null];
    const n = mel[s];
    if (n != null) this.tone({ freq: semi(D * 2, n), type: 'square', dur: len * 1.6, gain: 0.03, attack: 0.02, at, bus: b });
    // 북 (발 구르기)
    if (s % 3 === 0) this.noiseHit({ dur: 0.07, gain: s % 6 === 0 ? 0.14 : 0.06, freq: 160, filter: 'lowpass', q: 1, at, bus: b });
  }
}

export const audio = new SeaAudio();

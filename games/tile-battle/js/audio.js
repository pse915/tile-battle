// Web Audio로 합성하는 효과음과 로파이 배경음 — 외부 사운드 파일 없음

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.settings = { bgm: 0.35, sfx: 0.8, muted: false };
    this.bgmOn = false;
    this.step = 0;
  }

  /** 첫 사용자 입력 뒤에 호출 (브라우저 자동재생 정책) */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.bgmBus = ctx.createGain();
    // 배경음은 따뜻하게 저역 통과
    this.bgmFilter = ctx.createBiquadFilter();
    this.bgmFilter.type = 'lowpass';
    this.bgmFilter.frequency.value = 1800;
    this.bgmBus.connect(this.bgmFilter).connect(this.master);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.apply(this.settings);
    if (this.wantBgm) this.startBgm();
  }

  apply(s) {
    this.settings = { ...this.settings, ...s };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.muted ? 0 : 1, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.settings.sfx, t, 0.05);
    this.bgmBus.gain.setTargetAtTime(this.settings.bgm * 0.5, t, 0.1);
  }

  // ---------- 기본 재료 ----------
  tone({ freq = 440, to = null, type = 'sine', dur = 0.15, gain = 0.3, at = 0, attack = 0.005, bus = this.sfxBus, detune = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune;
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noiseHit({ dur = 0.08, gain = 0.3, filter = 'bandpass', freq = 1800, q = 1.5, at = 0, sweepTo = null, bus = this.sfxBus }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.01, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // ---------- 효과음 ----------
  pick() {
    this.tone({ freq: 880, to: 1320, dur: 0.07, gain: 0.12, type: 'triangle' });
  }
  unpick() {
    this.tone({ freq: 1100, to: 700, dur: 0.07, gain: 0.08, type: 'triangle' });
  }
  place(i = 0) {
    // 딱! 하는 나무 소리
    const at = 0;
    this.noiseHit({ dur: 0.05, gain: 0.5, freq: 2200 + i * 120, q: 4, at });
    this.tone({ freq: 240 - i * 6, to: 140, dur: 0.09, gain: 0.35, type: 'sine', at });
  }
  pass() {
    this.tone({ freq: 523, to: 392, dur: 0.28, gain: 0.12, type: 'triangle', attack: 0.02 });
  }
  sweep() {
    this.noiseHit({ dur: 0.45, gain: 0.22, freq: 500, sweepTo: 3200, q: 0.8 });
  }
  chip() {
    const f = 2400 + Math.random() * 500;
    this.tone({ freq: f, dur: 0.12, gain: 0.08, type: 'sine' });
    this.tone({ freq: f * 1.5, dur: 0.09, gain: 0.05, type: 'sine', at: 0.01 });
  }
  click() {
    this.noiseHit({ dur: 0.025, gain: 0.15, freq: 3500, q: 2 });
    this.tone({ freq: 1200, dur: 0.04, gain: 0.05 });
  }
  error() {
    this.tone({ freq: 220, dur: 0.12, gain: 0.12, type: 'square' });
    this.tone({ freq: 196, dur: 0.14, gain: 0.1, type: 'square', at: 0.09 });
  }
  yourTurn() {
    this.tone({ freq: 660, dur: 0.1, gain: 0.08, type: 'sine' });
    this.tone({ freq: 990, dur: 0.16, gain: 0.08, type: 'sine', at: 0.08 });
  }
  special() {
    [784, 988, 1175, 1568].forEach((f, i) => this.tone({ freq: f, dur: 0.25, gain: 0.09, type: 'triangle', at: i * 0.05 }));
  }
  win() {
    const seq = [523, 659, 784, 1047, 784, 1047];
    seq.forEach((f, i) => this.tone({ freq: f, dur: i === seq.length - 1 ? 0.7 : 0.18, gain: 0.14, type: 'square', at: i * 0.12 }));
    seq.forEach((f, i) => this.tone({ freq: f / 2, dur: 0.2, gain: 0.08, type: 'triangle', at: i * 0.12 }));
  }
  lose() {
    [392, 349, 311, 262].forEach((f, i) => this.tone({ freq: f, dur: 0.3, gain: 0.12, type: 'triangle', at: i * 0.22 }));
  }

  // ---------- 로파이 배경음 ----------
  startBgm() {
    this.wantBgm = true;
    if (!this.ctx || this.bgmOn) return;
    this.bgmOn = true;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.timer = setInterval(() => this.schedule(), 100);
  }
  stopBgm() {
    this.wantBgm = false;
    this.bgmOn = false;
    clearInterval(this.timer);
  }

  schedule() {
    const ctx = this.ctx;
    const spb = 60 / 76 / 2; // 8분음표 길이 (76 BPM)
    // Dm9 – G13 – Cmaj9 – Am7
    const chords = [
      [146.8, 174.6, 220, 261.6, 329.6],
      [98, 174.6, 246.9, 329.6, 349.2],
      [130.8, 164.8, 196, 246.9, 293.7],
      [110, 164.8, 196, 261.6, 329.6],
    ];
    while (this.nextTime < ctx.currentTime + 0.35) {
      const s = this.step % 32; // 한 코드당 8스텝
      const ci = Math.floor(s / 8);
      const at = this.nextTime - ctx.currentTime;
      const swing = s % 2 === 1 ? spb * 0.18 : 0;
      const b = this.bgmBus;
      if (s % 8 === 0) {
        for (const f of chords[ci].slice(1)) {
          this.tone({ freq: f, type: 'triangle', dur: spb * 8.2, gain: 0.05, attack: 0.25, at, bus: b, detune: (Math.random() - 0.5) * 12 });
        }
      }
      // 베이스
      if (s % 8 === 0 || s % 8 === 5) this.tone({ freq: chords[ci][0] / 2, type: 'sine', dur: spb * 2.5, gain: 0.22, attack: 0.02, at, bus: b });
      // 킥
      if (s % 8 === 0 || s % 8 === 3) this.tone({ freq: 110, to: 42, type: 'sine', dur: 0.22, gain: 0.35, at, bus: b });
      // 스네어 (2, 4박)
      if (s % 8 === 4) this.noiseHit({ dur: 0.16, gain: 0.12, freq: 1600, q: 0.8, at, bus: b });
      // 하이햇
      this.noiseHit({ dur: 0.035, gain: s % 2 ? 0.035 : 0.05, filter: 'highpass', freq: 7000, q: 0.5, at: at + swing, bus: b });
      // 반짝이는 멜로디 조각
      if (s % 8 === 6 && Math.random() < 0.55) {
        const f = chords[ci][2 + Math.floor(Math.random() * 3)] * 2;
        this.tone({ freq: f, type: 'sine', dur: 0.5, gain: 0.04, at: at + swing, bus: b });
      }
      // LP 판 지직거림
      if (Math.random() < 0.3) this.noiseHit({ dur: 0.01, gain: 0.02, filter: 'highpass', freq: 3000, at: at + Math.random() * spb, bus: b });
      this.nextTime += spb;
      this.step++;
    }
  }
}

export const audio = new AudioEngine();

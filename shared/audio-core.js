// Web Audio 합성 기본기 — 게임별 소리는 이 클래스를 상속해서 만듦 (외부 사운드 파일 없음)

export class AudioCore {
  constructor() {
    this.ctx = null;
    this.settings = { bgm: 0.35, sfx: 0.8, muted: false };
    this.bgmOn = false;
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
    this.bgmFilter = ctx.createBiquadFilter();
    this.bgmFilter.type = 'lowpass';
    this.bgmFilter.frequency.value = 2000;
    this.bgmBus.connect(this.bgmFilter).connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.apply(this.settings);
    this.onUnlock?.();
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

  noiseHit({ dur = 0.08, gain = 0.3, filter = 'bandpass', freq = 1800, q = 1.5, at = 0, sweepTo = null, attack = null, bus = this.sfxBus }) {
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
    g.gain.exponentialRampToValueAtTime(gain, t + (attack ?? Math.min(0.01, dur / 4)));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  click() {
    this.noiseHit({ dur: 0.025, gain: 0.15, freq: 3500, q: 2 });
    this.tone({ freq: 1200, dur: 0.04, gain: 0.05 });
  }
  error() {
    this.tone({ freq: 220, dur: 0.12, gain: 0.12, type: 'square' });
    this.tone({ freq: 196, dur: 0.14, gain: 0.1, type: 'square', at: 0.09 });
  }

  /** 배경음: 하위 클래스의 scheduleStep(step, at, stepLen)을 일정 간격으로 부름 */
  startBgm() {
    this.wantBgm = true;
    if (!this.ctx || this.bgmOn) return;
    this.bgmOn = true;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.timer = setInterval(() => {
      const len = this.stepLength();
      while (this.nextTime < this.ctx.currentTime + 0.35) {
        this.scheduleStep(this.step, this.nextTime - this.ctx.currentTime, len);
        this.nextTime += len;
        this.step++;
      }
    }, 100);
  }
  stopBgm() {
    this.wantBgm = false;
    this.bgmOn = false;
    clearInterval(this.timer);
  }
  stepLength() {
    return 0.25;
  }
  scheduleStep() {}
}

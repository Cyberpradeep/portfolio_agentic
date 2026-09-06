// Web Audio API Procedural Sound Synthesizer (No external audio files needed)

class SoundFX {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.hypnosisOsc = null;
    this.hypnosisGain = null;
    this.staticNode = null;
    this.staticGain = null;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) {
      if (this.hypnosisGain && this.ctx) this.hypnosisGain.gain.setValueAtTime(0, this.ctx.currentTime);
      if (this.staticGain && this.ctx) this.staticGain.gain.setValueAtTime(0, this.ctx.currentTime);
    }
    return this.muted;
  }

  // Button click blip
  playClick() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.05);

      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch (_) {}
  }

  // Futuristic glitch chirp
  playGlitch() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(240, this.ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(1400, this.ctx.currentTime + 0.08);
      osc.frequency.setValueAtTime(500, this.ctx.currentTime + 0.09);

      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.15);
    } catch (_) {}
  }

  // Mode change / energy power surge
  playPowerSurge() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(90, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, this.ctx.currentTime + 0.25);

      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.35);
    } catch (_) {}
  }

  // Hypnosis Ray hum loop
  setHypnosisHum(active) {
    if (this.muted || !active) {
      if (this.hypnosisGain && this.ctx) {
        this.hypnosisGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      }
      return;
    }

    this.init();
    if (!this.ctx) return;

    try {
      if (!this.hypnosisOsc) {
        this.hypnosisOsc = this.ctx.createOscillator();
        this.hypnosisGain = this.ctx.createGain();
        this.hypnosisOsc.type = 'sawtooth';
        this.hypnosisOsc.frequency.setValueAtTime(55, this.ctx.currentTime);

        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.frequency.setValueAtTime(3.5, this.ctx.currentTime);
        lfoGain.gain.setValueAtTime(25, this.ctx.currentTime);
        lfo.connect(this.hypnosisOsc.frequency);
        lfo.start();

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(180, this.ctx.currentTime);

        this.hypnosisOsc.connect(filter);
        filter.connect(this.hypnosisGain);
        this.hypnosisGain.connect(this.ctx.destination);
        this.hypnosisGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this.hypnosisOsc.start();
      }

      this.hypnosisGain.gain.setTargetAtTime(0.08, this.ctx.currentTime, 0.1);
    } catch (_) {}
  }

  // TV Static burst
  playStaticBurst(duration = 0.4) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const bufferSize = this.ctx.sampleRate * duration;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, this.ctx.currentTime);
      filter.Q.setValueAtTime(1.5, this.ctx.currentTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      whiteNoise.start();
    } catch (_) {}
  }
}

export const soundFX = new SoundFX();

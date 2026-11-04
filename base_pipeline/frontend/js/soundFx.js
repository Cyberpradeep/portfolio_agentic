// Web Audio API Procedural Sound Synthesizer (Analog Physicality & Tactile Sound Design)
// Zero external audio files needed; completely procedural Web Audio synthesis.

class SoundFX {
  constructor() {
    this.ctx = null;
    let savedMute = false;
    try {
      savedMute = localStorage.getItem('portfolio_sfx_muted') === 'true';
    } catch (_) {}
    this.muted = savedMute;
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
      this.ctx.resume().catch(() => {});
    }
  }

  isMuted() {
    return this.muted;
  }

  setMuted(muteState) {
    this.muted = !!muteState;
    try {
      localStorage.setItem('portfolio_sfx_muted', this.muted ? 'true' : 'false');
    } catch (_) {}
    if (this.muted) {
      this.silenceAll();
    }
    window.dispatchEvent(new CustomEvent('sfx:mute_changed', { detail: { muted: this.muted } }));
    return this.muted;
  }

  toggleMute() {
    return this.setMuted(!this.muted);
  }

  silenceAll() {
    try {
      if (this.hypnosisGain && this.ctx) {
        this.hypnosisGain.gain.setValueAtTime(0, this.ctx.currentTime);
      }
      if (this.staticGain && this.ctx) {
        this.staticGain.gain.setValueAtTime(0, this.ctx.currentTime);
      }
      if (this.hypnosisOsc) {
        try { this.hypnosisOsc.stop(); } catch (_) {}
        try { this.hypnosisOsc.disconnect(); } catch (_) {}
        this.hypnosisOsc = null;
        this.hypnosisGain = null;
      }
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 1. TACTILE MECHANICAL RELAY CLICK (Vintage Toggle / Microswitch Pop)
  // Dual-pulse acoustic transient with contact friction & secondary contact seating
  // --------------------------------------------------------------------------
  playRelayClick() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const t = this.ctx.currentTime;

      // Contact closure friction burst (micro-bandpassed noise)
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.008);
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
      }
      const noiseSrc = this.ctx.createBufferSource();
      noiseSrc.buffer = noiseBuffer;

      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(2200, t);
      noiseFilter.Q.setValueAtTime(2.5, t);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.045, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.008);

      noiseSrc.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);
      noiseSrc.start(t);

      // Armature snap pulse (rapid downward frequency transient)
      const snapOsc = this.ctx.createOscillator();
      const snapGain = this.ctx.createGain();
      snapOsc.type = 'triangle';
      snapOsc.frequency.setValueAtTime(1400, t);
      snapOsc.frequency.exponentialRampToValueAtTime(320, t + 0.012);

      snapGain.gain.setValueAtTime(0.07, t);
      snapGain.gain.exponentialRampToValueAtTime(0.001, t + 0.015);

      snapOsc.connect(snapGain);
      snapGain.connect(this.ctx.destination);
      snapOsc.start(t);
      snapOsc.stop(t + 0.015);

      // Secondary mechanical contact seat/bounce (t + 16ms)
      const bounceOsc = this.ctx.createOscillator();
      const bounceGain = this.ctx.createGain();
      bounceOsc.type = 'sine';
      bounceOsc.frequency.setValueAtTime(480, t + 0.016);
      bounceOsc.frequency.exponentialRampToValueAtTime(180, t + 0.028);

      bounceGain.gain.setValueAtTime(0.0001, t);
      bounceGain.gain.setValueAtTime(0.035, t + 0.016);
      bounceGain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

      bounceOsc.connect(bounceGain);
      bounceGain.connect(this.ctx.destination);
      bounceOsc.start(t + 0.016);
      bounceOsc.stop(t + 0.03);
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 2. TACTILE MECHANICAL SHUTTER (Aperture / Slate Open & Close)
  // Dual-action mechanism: iris slide burst + mechanical detent lock click
  // --------------------------------------------------------------------------
  playShutter() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const t = this.ctx.currentTime;

      // Shutter leaf slide (smooth filtered noise sweep)
      const slideDur = 0.032;
      const bufferSize = Math.floor(this.ctx.sampleRate * slideDur);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
      }
      const slideSrc = this.ctx.createBufferSource();
      slideSrc.buffer = buffer;

      const slideFilter = this.ctx.createBiquadFilter();
      slideFilter.type = 'bandpass';
      slideFilter.frequency.setValueAtTime(2600, t);
      slideFilter.frequency.linearRampToValueAtTime(1200, t + slideDur);
      slideFilter.Q.setValueAtTime(1.8, t);

      const slideGain = this.ctx.createGain();
      slideGain.gain.setValueAtTime(0.045, t);
      slideGain.gain.exponentialRampToValueAtTime(0.001, t + slideDur);

      slideSrc.connect(slideFilter);
      slideFilter.connect(slideGain);
      slideGain.connect(this.ctx.destination);
      slideSrc.start(t);

      // Mechanical detent lock click at t + 22ms
      const detentOsc = this.ctx.createOscillator();
      const detentGain = this.ctx.createGain();
      detentOsc.type = 'triangle';
      detentOsc.frequency.setValueAtTime(650, t + 0.022);
      detentOsc.frequency.exponentialRampToValueAtTime(220, t + 0.038);

      detentGain.gain.setValueAtTime(0.0001, t);
      detentGain.gain.setValueAtTime(0.05, t + 0.022);
      detentGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

      detentOsc.connect(detentGain);
      detentGain.connect(this.ctx.destination);
      detentOsc.start(t + 0.022);
      detentOsc.stop(t + 0.04);
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 3. CRT TUBE ENERGIZE & FLYBACK WARMUP (Vintage TV Screen Power-Up)
  // Sub-harmonic resonant cathode surge + high-frequency transformer whisper
  // --------------------------------------------------------------------------
  playCRTWarmup() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const t = this.ctx.currentTime;

      // Sub-harmonic resonant tube surge (45Hz -> 110Hz)
      const bassOsc = this.ctx.createOscillator();
      const bassGain = this.ctx.createGain();
      bassOsc.type = 'triangle';
      bassOsc.frequency.setValueAtTime(45, t);
      bassOsc.frequency.exponentialRampToValueAtTime(110, t + 0.28);

      bassGain.gain.setValueAtTime(0.075, t);
      bassGain.gain.linearRampToValueAtTime(0.055, t + 0.15);
      bassGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

      bassOsc.connect(bassGain);
      bassGain.connect(this.ctx.destination);
      bassOsc.start(t);
      bassOsc.stop(t + 0.35);

      // Flyback transformer high-pitch whisper (12.5kHz)
      const flybackOsc = this.ctx.createOscillator();
      const flybackGain = this.ctx.createGain();
      flybackOsc.type = 'sine';
      flybackOsc.frequency.setValueAtTime(12500, t);

      flybackGain.gain.setValueAtTime(0.0001, t);
      flybackGain.gain.linearRampToValueAtTime(0.016, t + 0.06);
      flybackGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

      flybackOsc.connect(flybackGain);
      flybackGain.connect(this.ctx.destination);
      flybackOsc.start(t);
      flybackOsc.stop(t + 0.22);

      // Gentle crackle burst
      this.playStaticBurst(0.12);
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 4. SUBTLE MICRO-TAP (Haptic-Style UI Confirmation)
  // Soft, warm wooden/ceramic micro-transient for chips and buttons
  // --------------------------------------------------------------------------
  playSubtleTap() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(190, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.024);

      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.025);
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 5. BUTTON CLICK BLIP (Backward Compatible UI Click)
  // --------------------------------------------------------------------------
  playClick() {
    this.playSubtleTap();
  }

  // --------------------------------------------------------------------------
  // 6. FUTURISTIC GLITCH CHIRP (Screen Jitter / Mode Distortion)
  // --------------------------------------------------------------------------
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

      gain.gain.setValueAtTime(0.07, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.15);
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 7. POWER SURGE (Stage Reveal / Major Transition)
  // --------------------------------------------------------------------------
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

      gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.35);
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 8. HYPNOSIS HUM (Hypnosis Mode Resonance)
  // --------------------------------------------------------------------------
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

      this.hypnosisGain.gain.setTargetAtTime(0.07, this.ctx.currentTime, 0.1);
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 9. TV STATIC BURST (Analog Noise Sweep)
  // --------------------------------------------------------------------------
  playStaticBurst(duration = 0.35) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const bufferSize = Math.floor(this.ctx.sampleRate * duration);
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
      gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      whiteNoise.start();
    } catch (_) {}
  }
}

export const soundFX = new SoundFX();

import * as THREE from 'three';
import { soundFX } from './soundFx.js';

export const ScreenModes = {
  LOADING: 'LOADING',
  IDLE: 'IDLE',
  LISTENING: 'LISTENING',
  THINKING: 'THINKING',
  SPEAKING: 'SPEAKING',
  HYPNOSIS_RED: 'HYPNOSIS_RED',
  TV_STATIC: 'TV_STATIC',
  EMOTE_GRIN: 'EMOTE_GRIN',
  EMOTE_RAGE: 'EMOTE_RAGE',
  EMOTE_XD: 'EMOTE_XD',
  MATRIX_RAIN: 'MATRIX_RAIN',
  AUDIO_WAVE: 'AUDIO_WAVE',
  CUSTOM_TEXT: 'CUSTOM_TEXT',
  IMAGE: 'IMAGE'
};

export class TVScreenManager {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 1024;
    this.ctx = this.canvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.anisotropy = 8;

    // High-fidelity Glass CRT Screen Material (PBR with Clearcoat & Emissive Glow)
    this.screenMaterial = new THREE.MeshPhysicalMaterial({
      map: this.texture,
      emissiveMap: this.texture,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 1.5,
      roughness: 0.12,
      metalness: 0.08,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      reflectivity: 0.85,
      toneMapped: false,
      side: THREE.FrontSide
    });

    this.currentMode = ScreenModes.LOADING;
    this.targetMode = ScreenModes.IDLE;
    this.time = 0;
    this.glitchTime = 0;
    this.isGlitching = false;

    // Live Speech Transcript State
    this.transcriptText = '';
    this.displayedTranscript = '';
    this.transcriptScrollY = 0;
    this.cursorBlink = 0;

    // Audio Reactive State (from Gemini / mic)
    this.audioFrequencyData = new Uint8Array(32);
    this.speechVolume = 0;
    this.speechVolumeSmoothed = 0;
    this.audioBars = 24;
    this.barHeights = new Array(this.audioBars).fill(0.1);

    // Eye Animation State
    this.blinkTimer = 0;
    this.isBlinking = false;
    this.eyeTargetX = 0;
    this.eyeTargetY = 0;
    this.eyeCurrentX = 0;
    this.eyeCurrentY = 0;
    this.saccadeTimer = 0;

    // Static noise buffer (256x256 scaled for authentic CRT grain)
    this.staticCanvas = document.createElement('canvas');
    this.staticCanvas.width = 256;
    this.staticCanvas.height = 256;
    this.staticCtx = this.staticCanvas.getContext('2d');
    this.noiseImageData = this.staticCtx.createImageData(256, 256);

    // Matrix rain state
    this.matrixChars = '0123456789ABCDEFｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ'.split('');
    this.matrixColumns = 28;
    this.matrixDrops = new Array(this.matrixColumns).fill(0).map(() => Math.floor(Math.random() * -30));

    // Custom message
    this.customMessage = 'PRADEEP AI';

    // Image display state
    this.currentImage = null;
    this.imageTitle = '';
    this.imageLoaded = false;

    // Point Light colors (synced to screen glow)
    this.lightColor = new THREE.Color(0x38bdf8);
    this.lightIntensity = 2.4;
  }

  setMode(mode) {
    if (this.currentMode === mode) return;
    this.triggerGlitch(0.18);
    this.currentMode = mode;

    switch (mode) {
      case ScreenModes.LOADING:
        this.lightColor.setHex(0x38bdf8);
        this.lightIntensity = 2.0;
        break;
      case ScreenModes.IDLE:
        this.lightColor.setHex(0x38bdf8); // Clean cyan
        this.lightIntensity = 2.2;
        break;
      case ScreenModes.LISTENING:
        this.lightColor.setHex(0x10b981); // Emerald pulse
        this.lightIntensity = 3.0;
        soundFX.playGlitch();
        break;
      case ScreenModes.THINKING:
        this.lightColor.setHex(0xa855f7); // Purple synaptic
        this.lightIntensity = 2.8;
        soundFX.playGlitch();
        break;
      case ScreenModes.SPEAKING:
        this.lightColor.setHex(0x38bdf8); // Cyan speech glow
        this.lightIntensity = 3.2;
        break;
      case ScreenModes.HYPNOSIS_RED:
        this.lightColor.setHex(0xff1e38);
        this.lightIntensity = 3.5;
        soundFX.setHypnosisHum(true);
        break;
      case ScreenModes.TV_STATIC:
        this.lightColor.setHex(0xdde3ea);
        this.lightIntensity = 2.0;
        soundFX.playStaticBurst(0.4);
        break;
      case ScreenModes.EMOTE_GRIN:
        this.lightColor.setHex(0xa855f7);
        this.lightIntensity = 2.5;
        break;
      case ScreenModes.EMOTE_RAGE:
        this.lightColor.setHex(0xf97316);
        this.lightIntensity = 3.2;
        break;
      case ScreenModes.EMOTE_XD:
        this.lightColor.setHex(0xeab308);
        this.lightIntensity = 2.6;
        break;
      case ScreenModes.MATRIX_RAIN:
        this.lightColor.setHex(0x10b981);
        this.lightIntensity = 2.5;
        break;
      case ScreenModes.AUDIO_WAVE:
        this.lightColor.setHex(0x06b6d4);
        this.lightIntensity = 2.6;
        break;
      case ScreenModes.IMAGE:
        this.lightColor.setHex(0x0ea5e9); // Azure sky blue glow
        this.lightIntensity = 3.2;
        break;
      default:
        this.lightColor.setHex(0x38bdf8);
        this.lightIntensity = 2.4;
    }

    if (mode !== ScreenModes.HYPNOSIS_RED) {
      soundFX.setHypnosisHum(false);
    }
  }

  triggerGlitch(duration = 0.2) {
    this.isGlitching = true;
    this.glitchTime = duration;
  }

  displayImage(url, title = '') {
    this.triggerGlitch(0.25);
    this.imageTitle = title || '';
    this.imageLoaded = false;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.currentImage = img;
      this.imageLoaded = true;
      this.setMode(ScreenModes.IMAGE);
    };
    img.onerror = (err) => {
      console.error('[TV_SCREEN] Failed to load image:', url, err);
    };
    img.src = url;
  }

  clearImage() {
    this.currentImage = null;
    this.imageLoaded = false;
    this.imageTitle = '';
    this.setMode(ScreenModes.IDLE);
  }

  setTranscript(text) {
    this.transcriptText = text || '';
    if (this.currentMode === ScreenModes.IDLE && this.transcriptText) {
      this.setMode(ScreenModes.SPEAKING);
    }
  }

  setAudioData(freqArray, volume01) {
    if (freqArray && freqArray.length > 0) {
      this.audioFrequencyData = freqArray;
    }
    if (typeof volume01 === 'number') {
      this.speechVolume = Math.min(1, Math.max(0, volume01));
    }
  }

  setPointerLook(x, y) {
    this.eyeTargetX = THREE.MathUtils.clamp(x * 24, -28, 28);
    this.eyeTargetY = THREE.MathUtils.clamp(-y * 18, -20, 20);
  }

  applyToModel(model) {
    let count = 0;
    model.traverse((child) => {
      if (child.isMesh) {
        const mat = child.material;
        const matName = mat ? (Array.isArray(mat) ? mat.map(m => m.name).join(' ') : mat.name) : '';
        const nodeName = child.name || '';

        const isStrictScreen =
          (matName === 'Static' || matName === 'RedLight' || matName === 'CanYouFeelTheStatic') ||
          (nodeName === '10' || nodeName === '12' || nodeName === '18');

        if (isStrictScreen) {
          child.material = this.screenMaterial;
          child.castShadow = false;
          child.receiveShadow = false;
          count++;
        } else if (matName.includes('gplast') || matName.includes('bplast') || matName.includes('naklejka')) {
          if (child.material) {
            child.material.side = THREE.FrontSide;
            if (child.material.color) {
              child.material.color.setRGB(0.12, 0.13, 0.15);
            }
            child.material.roughness = 0.8;
            child.material.metalness = 0.1;
          }
        }
      }
    });
    console.log(`[TVScreenManager] Mapped dynamic screen to ${count} display meshes.`);
  }

  update(deltaTime) {
    this.time += deltaTime;
    this.cursorBlink = (this.time * 3) % 1 > 0.5 ? 1 : 0;
    this.speechVolumeSmoothed = THREE.MathUtils.lerp(this.speechVolumeSmoothed, this.speechVolume, deltaTime * 12);

    // Glitch Countdown
    if (this.isGlitching) {
      this.glitchTime -= deltaTime;
      if (this.glitchTime <= 0) {
        this.isGlitching = false;
      }
    }

    // Eye Blink Timer
    this.blinkTimer += deltaTime;
    if (this.blinkTimer > 3.4) {
      this.isBlinking = true;
      if (this.blinkTimer > 3.6) {
        this.isBlinking = false;
        this.blinkTimer = (Math.random() - 0.5) * 1.5;
      }
    }

    // Natural Eye Saccades
    this.saccadeTimer += deltaTime;
    if (this.saccadeTimer > 2.2) {
      this.eyeTargetX += (Math.random() - 0.5) * 12;
      this.eyeTargetY += (Math.random() - 0.5) * 8;
      this.saccadeTimer = 0;
    }

    // Smooth Eye Interpolation
    this.eyeCurrentX = THREE.MathUtils.lerp(this.eyeCurrentX, this.eyeTargetX, deltaTime * 10);
    this.eyeCurrentY = THREE.MathUtils.lerp(this.eyeCurrentY, this.eyeTargetY, deltaTime * 10);

    const { ctx, canvas } = this;
    const w = 512;
    const h = 512;

    // Dynamic emissive pulse matching speech volume
    if (this.screenMaterial) {
      if (this.currentMode === ScreenModes.IMAGE) {
        this.screenMaterial.emissiveIntensity = 0.55;
      } else {
        this.screenMaterial.emissiveIntensity = 1.45 + this.speechVolumeSmoothed * 0.45;
      }
    }

    ctx.save();
    // 2x HiDPI vector scaling: renders all text, shapes, & curves at native 1024x1024 resolution
    ctx.scale(2, 2);
    ctx.clearRect(0, 0, w, h);

    // Render Mode Screen
    switch (this.currentMode) {
      case ScreenModes.LOADING:
        this.renderLoading(ctx, w, h);
        break;
      case ScreenModes.IDLE:
        this.renderIdleAttentive(ctx, w, h);
        break;
      case ScreenModes.LISTENING:
        this.renderListening(ctx, w, h);
        break;
      case ScreenModes.THINKING:
        this.renderThinking(ctx, w, h);
        break;
      case ScreenModes.SPEAKING:
        this.renderSpeakingTranscript(ctx, w, h);
        break;
      case ScreenModes.HYPNOSIS_RED:
        this.renderHypnosis(ctx, w, h);
        break;
      case ScreenModes.TV_STATIC:
        this.renderStatic(ctx, w, h);
        break;
      case ScreenModes.EMOTE_GRIN:
        this.renderGrin(ctx, w, h);
        break;
      case ScreenModes.EMOTE_RAGE:
        this.renderRage(ctx, w, h);
        break;
      case ScreenModes.EMOTE_XD:
        this.renderXD(ctx, w, h);
        break;
      case ScreenModes.MATRIX_RAIN:
        this.renderMatrix(ctx, w, h);
        break;
      case ScreenModes.AUDIO_WAVE:
        this.renderAudioWave(ctx, w, h);
        break;
      case ScreenModes.CUSTOM_TEXT:
        this.renderCustomText(ctx, w, h);
        break;
      case ScreenModes.IMAGE:
        this.renderImage(ctx, w, h);
        break;
      default:
        this.renderIdleAttentive(ctx, w, h);
    }

    // Glitch overlay if transitioning
    if (this.isGlitching) {
      this.renderGlitchOverlay(ctx, w, h);
    }

    // Global CRT Scanlines & Screen Vignette
    this.renderScanlines(ctx, w, h);
    this.renderCRTVignette(ctx, w, h);

    ctx.restore();

    this.texture.needsUpdate = true;
  }

  // --- 0. LOADING MODE (Retro Bootup Sequence & Calibration) ---
  renderLoading(ctx, w, h) {
    ctx.fillStyle = '#060a0f';
    ctx.fillRect(0, 0, w, h);

    this.renderTelemetryGrid(ctx, w, h);

    const cx = w / 2;
    const cy = h / 2;

    // Expanding Calibration Ring
    const pulseR = ((this.time * 60) % 90) + 30;
    ctx.beginPath();
    ctx.arc(cx, cy - 30, pulseR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(56, 189, 248, ${Math.max(0, 1 - pulseR / 120)})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Central Loading Glyph
    ctx.beginPath();
    ctx.arc(cx, cy - 30, 24, 0, Math.PI * 2);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.save();
    ctx.translate(cx, cy - 30);
    ctx.rotate(this.time * 4);
    ctx.beginPath();
    ctx.arc(0, 0, 36, 0, Math.PI * 1.2);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // Boot Telemetry
    ctx.fillStyle = '#38bdf8';
    ctx.font = '700 16px "Space Grotesk", "SF Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('NEURAL CHASSIS // BOOTING', cx, cy + 50);

    const stepPct = Math.min(100, Math.floor(((this.time * 45) % 100) + 1));
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 12px "SF Mono", monospace';
    ctx.fillText(`SYNCHRONIZING MEMORY MATRICES... ${stepPct}%`, cx, cy + 74);

    // Track
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 100, cy + 92, 200, 10);

    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(cx - 98, cy + 94, (stepPct / 100) * 196, 6);
  }

  // --- 1. IDLE ATTENTIVE MODE (Cyber Eyes + Telemetry) ---
  renderIdleAttentive(ctx, w, h) {
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2 + this.eyeCurrentX;
    const cy = h / 2 - 25 + this.eyeCurrentY;

    this.renderTelemetryGrid(ctx, w, h);

    // Draw Cyber Eyes
    this.drawCyberEyes(ctx, cx, cy, '#38bdf8', '#0284c7');

    // Bottom Telemetry Bar
    ctx.fillStyle = '#0284c7';
    ctx.font = '700 14px "Space Grotesk", "SF Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PRADEEP AI // STANDBY', w / 2, h - 36);

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.strokeRect(w / 2 - 120, h - 56, 240, 32);
  }

  // --- 2. LISTENING MODE (Receptive Pulse & Radar Eyes) ---
  renderListening(ctx, w, h) {
    ctx.fillStyle = '#06130e';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2 + this.eyeCurrentX;
    const cy = h / 2 - 35 + this.eyeCurrentY;

    // Concentric Sonar Rings
    const pulseCount = 4;
    for (let i = 0; i < pulseCount; i++) {
      const radius = ((this.time * 90 + i * 50) % 200) + 20;
      const alpha = Math.max(0, 1 - radius / 220) * 0.45;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2 - 20, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(16, 185, 129, ${alpha})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Wide, attentive emerald eyes
    this.drawCyberEyes(ctx, cx, cy, '#34d399', '#059669', 1.2);

    // Audio Intake Indicator
    const micVol = this.speechVolumeSmoothed;
    const barW = 8;
    const barGap = 4;
    const totalBars = 16;
    const startX = (w - (totalBars * (barW + barGap))) / 2;

    for (let i = 0; i < totalBars; i++) {
      const hVal = (Math.sin(this.time * 8 + i * 0.4) * 0.3 + 0.4 + micVol * 0.6) * 35;
      ctx.fillStyle = '#10b981';
      ctx.fillRect(startX + i * (barW + barGap), h - 85 - hVal / 2, barW, hVal);
    }

    ctx.fillStyle = '#10b981';
    ctx.font = '700 16px "Space Grotesk", "SF Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('● LISTENING...', w / 2, h - 35);
  }

  // --- 3. THINKING MODE (Synaptic Matrix & Glitch Stream) ---
  renderThinking(ctx, w, h) {
    ctx.fillStyle = '#11071f';
    ctx.fillRect(0, 0, w, h);

    // Matrix Rain Stream in background
    ctx.font = '13px monospace';
    const colWidth = w / this.matrixColumns;
    for (let i = 0; i < this.matrixColumns; i++) {
      const char = this.matrixChars[(Math.random() * this.matrixChars.length) | 0];
      const x = i * colWidth + 4;
      const y = this.matrixDrops[i] * 16;
      ctx.fillStyle = '#c084fc';
      ctx.fillText(char, x, y);
      if (y > h && Math.random() > 0.95) {
        this.matrixDrops[i] = 0;
      }
      this.matrixDrops[i]++;
    }

    // Thinking Eyes (Looking slightly up)
    const cx = w / 2;
    const cy = h / 2 - 50 + Math.sin(this.time * 6) * 4;
    this.drawCyberEyes(ctx, cx, cy, '#c084fc', '#7e22ce', 0.9);

    // Rotating Neural Arc
    ctx.save();
    ctx.translate(w / 2, h - 90);
    ctx.rotate(this.time * 5);
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 1.4);
    ctx.strokeStyle = '#e9d5ff';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#e9d5ff';
    ctx.font = '700 16px "Space Grotesk", "SF Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('REASONING // PIPECAT GEMINI', w / 2, h - 35);
  }

  // --- 4. SPEAKING & LIVE TRANSCRIPT MODE (Eyes + Transcript + Mouth Waveform) ---
  renderSpeakingTranscript(ctx, w, h) {
    ctx.fillStyle = '#081018';
    ctx.fillRect(0, 0, w, h);

    // Top Section: Expressive Speaking Eyes
    const eyeY = 95 + Math.sin(this.time * 4) * 3;
    const eyeX = w / 2 + this.eyeCurrentX * 0.7;
    const eyeGlow = 0.85 + Math.sin(this.time * 8) * 0.15;

    this.drawCyberEyes(ctx, eyeX, eyeY, `rgba(56, 189, 248, ${eyeGlow})`, '#0284c7', 0.95);

    // Middle Section: Real-Time Scrolling Transcript
    ctx.save();
    ctx.beginPath();
    ctx.rect(30, 160, w - 60, 220);
    ctx.clip();

    ctx.fillStyle = '#e0f2fe';
    ctx.font = '600 20px "Space Grotesk", "SF Pro Display", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const textToRender = this.transcriptText || 'Connecting to digital twin neural stream...';
    const lines = this.wrapText(ctx, textToRender, w - 80);

    const lineHeight = 28;
    const maxVisibleLines = 6;
    const totalContentHeight = lines.length * lineHeight;
    let targetScroll = 0;

    if (lines.length > maxVisibleLines) {
      targetScroll = (lines.length - maxVisibleLines) * lineHeight;
    }
    this.transcriptScrollY = THREE.MathUtils.lerp(this.transcriptScrollY, targetScroll, 0.15);

    const startY = 170 - this.transcriptScrollY;

    lines.forEach((line, i) => {
      const lineY = startY + i * lineHeight;
      if (lineY > 140 && lineY < 380) {
        ctx.fillStyle = (i === lines.length - 1) ? '#ffffff' : '#94a3b8';
        ctx.fillText(line, 40, lineY);

        if (i === lines.length - 1 && this.cursorBlink) {
          const lineMetrics = ctx.measureText(line);
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(40 + lineMetrics.width + 4, lineY + 3, 10, 20);
        }
      }
    });
    ctx.restore();

    // Divider Line
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(36, 395);
    ctx.lineTo(w - 36, 395);
    ctx.stroke();

    // Bottom Section: Audio Reactive Speech Equalizer Mouth
    const mouthY = 445;
    const vol = Math.max(this.speechVolumeSmoothed, 0.15);
    const bars = 22;
    const bWidth = 10;
    const bGap = 6;
    const fullW = bars * (bWidth + bGap);
    const startBX = (w - fullW) / 2;

    for (let i = 0; i < bars; i++) {
      const freqSample = this.audioFrequencyData[i % this.audioFrequencyData.length] / 255;
      const targetH = Math.max(6, (freqSample * 0.7 + vol * 0.6 + Math.sin(this.time * 12 + i * 0.6) * 0.2) * 55);
      this.barHeights[i] = THREE.MathUtils.lerp(this.barHeights[i], targetH, 0.25);

      const bh = this.barHeights[i];
      const bx = startBX + i * (bWidth + bGap);

      // Cyan to Emerald speech gradient
      const grad = ctx.createLinearGradient(0, mouthY - bh / 2, 0, mouthY + bh / 2);
      grad.addColorStop(0, '#38bdf8');
      grad.addColorStop(1, '#10b981');
      ctx.fillStyle = grad;

      ctx.beginPath();
      ctx.roundRect(bx, mouthY - bh / 2, bWidth, bh, 4);
      ctx.fill();
    }

    // Teleprompter Status
    ctx.fillStyle = '#38bdf8';
    ctx.font = '700 12px "Space Grotesk", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('LIVE VOX AI // 48kHz', w - 40, h - 22);
  }

  // --- CYBER EYES HELPER ---
  drawCyberEyes(ctx, cx, cy, primaryColor, secondaryColor, scale = 1.0) {
    const eyeSpacing = 85 * scale;
    const eyeW = 44 * scale;
    const eyeH = this.isBlinking ? 4 : (34 * scale);

    // Left Eye
    this.drawSingleEye(ctx, cx - eyeSpacing, cy, eyeW, eyeH, primaryColor, secondaryColor);
    // Right Eye
    this.drawSingleEye(ctx, cx + eyeSpacing, cy, eyeW, eyeH, primaryColor, secondaryColor);
  }

  drawSingleEye(ctx, x, y, ew, eh, primaryColor, secondaryColor) {
    ctx.save();
    ctx.shadowColor = primaryColor;
    ctx.shadowBlur = 18;
    ctx.fillStyle = primaryColor;

    ctx.beginPath();
    ctx.ellipse(x, y, ew, eh, 0, 0, Math.PI * 2);
    ctx.fill();

    if (!this.isBlinking) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(x + this.eyeCurrentX * 0.2, y + this.eyeCurrentY * 0.2, ew * 0.45, eh * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = secondaryColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - ew * 0.8, y);
      ctx.lineTo(x + ew * 0.8, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- TEXT WRAPPER UTILITY ---
  wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
      const testLine = currentLine + (currentLine ? ' ' : '') + words[i];
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && i > 0) {
        lines.push(currentLine);
        currentLine = words[i];
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    return lines;
  }

  // --- 5. HYPNOSIS RAY MODE ---
  renderHypnosis(ctx, w, h) {
    const cx = w / 2;
    const cy = h / 2;

    const bgGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 260);
    const pulse = 0.85 + Math.sin(this.time * 6) * 0.15;
    bgGrad.addColorStop(0, `rgba(240, 20, 50, ${pulse})`);
    bgGrad.addColorStop(0.5, '#7f1d1d');
    bgGrad.addColorStop(1, '#0f0507');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.time * 2.2);

    const arms = 8;
    for (let i = 0; i < arms; i++) {
      ctx.rotate((Math.PI * 2) / arms);
      ctx.beginPath();
      ctx.moveTo(0, 0);

      for (let r = 0; r < 240; r += 6) {
        const angle = (r * 0.04) + Math.sin(this.time * 3) * 0.15;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        ctx.lineTo(x, y);
      }

      ctx.lineWidth = 12;
      ctx.strokeStyle = (i % 2 === 0) ? '#ff2a4b' : '#ff6b81';
      ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('HYPNOSIS RAY // ACTIVE', cx, h - 30);
  }

  // --- 6. TV STATIC MODE ---
  renderStatic(ctx, w, h) {
    const data = this.noiseImageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const val = (Math.random() * 255) | 0;
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
      data[i + 3] = 255;
    }
    this.staticCtx.putImageData(this.noiseImageData, 0, 0);
    ctx.drawImage(this.staticCanvas, 0, 0, w, h);

    const barY = ((this.time * 260) % (h + 80)) - 40;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(0, barY, w, 28);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 22px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('CHANNEL 04', 36, 55);
  }

  // --- 7. EMOTE GRIN ---
  renderGrin(ctx, w, h) {
    ctx.fillStyle = '#140c1d';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2 - 10;
    const mainColor = '#f3e8ff';

    ctx.strokeStyle = mainColor;
    ctx.fillStyle = mainColor;
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Eyebrows
    ctx.beginPath();
    ctx.moveTo(cx - 130, cy - 70);
    ctx.lineTo(cx - 30, cy - 20);
    ctx.moveTo(cx + 130, cy - 70);
    ctx.lineTo(cx + 30, cy - 20);
    ctx.stroke();

    // Eyes
    if (this.isBlinking) {
      ctx.beginPath();
      ctx.moveTo(cx - 100, cy - 10);
      ctx.lineTo(cx - 40, cy - 10);
      ctx.moveTo(cx + 40, cy - 10);
      ctx.lineTo(cx + 100, cy - 10);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(cx - 70, cy - 5, 18, 0, Math.PI * 2);
      ctx.arc(cx + 70, cy - 5, 18, 0, Math.PI * 2);
      ctx.fill();
    }

    // Grin Smile
    const smilePulse = Math.sin(this.time * 4) * 6;
    ctx.fillStyle = mainColor;
    ctx.beginPath();
    ctx.moveTo(cx - 120, cy + 45);
    ctx.quadraticCurveTo(cx, cy + 140 + smilePulse, cx + 120, cy + 45);
    ctx.quadraticCurveTo(cx + 135, cy + 40, cx + 125, cy + 55);
    ctx.quadraticCurveTo(cx, cy + 155 + smilePulse, cx - 125, cy + 55);
    ctx.closePath();
    ctx.fill();
  }

  // --- 8. EMOTE RAGE ---
  renderRage(ctx, w, h) {
    const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, 260);
    bgGrad.addColorStop(0, `rgba(234, 88, 12, 0.9)`);
    bgGrad.addColorStop(1, '#1c0a00');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 14;

    // Slanted angry eyes
    ctx.beginPath();
    ctx.moveTo(cx - 140, cy - 80);
    ctx.lineTo(cx - 30, cy - 15);
    ctx.lineTo(cx - 120, cy + 10);
    ctx.closePath();
    ctx.fill();

    ctx.moveTo(cx + 140, cy - 80);
    ctx.lineTo(cx + 30, cy - 15);
    ctx.lineTo(cx + 120, cy + 10);
    ctx.closePath();
    ctx.fill();

    // Screaming mouth
    ctx.beginPath();
    ctx.moveTo(cx - 110, cy + 60);
    ctx.lineTo(cx - 55, cy + 120);
    ctx.lineTo(cx, cy + 75);
    ctx.lineTo(cx + 55, cy + 120);
    ctx.lineTo(cx + 110, cy + 60);
    ctx.closePath();
    ctx.fill();
  }

  // --- 9. EMOTE XD ---
  renderXD(ctx, w, h) {
    ctx.fillStyle = '#1c1608';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const bounce = Math.sin(this.time * 8) * 10;
    const color = '#fef08a';

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // X Eye
    ctx.beginPath();
    ctx.moveTo(cx - 130, cy - 70 + bounce);
    ctx.lineTo(cx - 40, cy + 10 + bounce);
    ctx.moveTo(cx - 40, cy - 70 + bounce);
    ctx.lineTo(cx - 130, cy + 10 + bounce);
    ctx.stroke();

    // D Mouth
    ctx.beginPath();
    ctx.arc(cx + 55, cy - 30 + bounce, 70, -Math.PI / 2, Math.PI / 2, false);
    ctx.lineTo(cx + 35, cy + 40 + bounce);
    ctx.lineTo(cx + 35, cy - 100 + bounce);
    ctx.closePath();
    ctx.fill();
  }

  // --- 10. MATRIX CODE RAIN ---
  renderMatrix(ctx, w, h) {
    ctx.fillStyle = 'rgba(6, 18, 12, 0.28)';
    ctx.fillRect(0, 0, w, h);

    ctx.font = '15px monospace';
    const colWidth = w / this.matrixColumns;

    for (let i = 0; i < this.matrixColumns; i++) {
      const char = this.matrixChars[(Math.random() * this.matrixChars.length) | 0];
      const x = i * colWidth + 4;
      const y = this.matrixDrops[i] * 18;

      ctx.fillStyle = '#ffffff';
      ctx.fillText(char, x, y);
      ctx.fillStyle = '#10b981';
      ctx.fillText(char, x, y - 18);

      if (y > h && Math.random() > 0.975) {
        this.matrixDrops[i] = 0;
      }
      this.matrixDrops[i]++;
    }
  }

  // --- 11. AUDIO WAVE OSCILLOSCOPE ---
  renderAudioWave(ctx, w, h) {
    ctx.fillStyle = '#08121a';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;

    for (let i = 0; i < this.audioBars; i++) {
      const target = Math.sin(this.time * 5 + i * 0.35) * 0.4 + 0.5 + Math.random() * 0.15;
      this.barHeights[i] = this.barHeights[i] * 0.7 + target * 0.3;
    }

    const barWidth = 10;
    const gap = 5;
    const totalW = this.audioBars * (barWidth + gap);
    const startX = (w - totalW) / 2;

    for (let i = 0; i < this.audioBars; i++) {
      const bh = this.barHeights[i] * 150;
      const x = startX + i * (barWidth + gap);

      ctx.fillStyle = '#06b6d4';
      ctx.fillRect(x, cy - bh / 2, barWidth, bh);
    }

    ctx.beginPath();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    for (let x = 0; x < w; x += 8) {
      const y = cy + Math.sin(x * 0.05 + this.time * 6) * 16;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // --- 12. CUSTOM TEXT ---
  renderCustomText(ctx, w, h) {
    ctx.fillStyle = '#160814';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;

    ctx.strokeStyle = '#ec4899';
    ctx.lineWidth = 4;
    ctx.strokeRect(36, 36, w - 72, h - 72);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 30px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.customMessage, cx, cy);
  }

  // --- CRT GLITCH & SCANLINES OVERLAYS ---
  renderGlitchOverlay(ctx, w, h) {
    const sliceCount = 6;
    for (let i = 0; i < sliceCount; i++) {
      const sy = Math.random() * h;
      const sh = Math.random() * 25 + 5;
      const offset = (Math.random() - 0.5) * 35;
      ctx.drawImage(this.canvas, 0, sy * 2, 1024, sh * 2, offset, sy, w, sh);
    }
  }

  renderTelemetryGrid(ctx, w, h) {
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.06)';
    ctx.lineWidth = 1;
    const step = 40;
    for (let x = 0; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }

  renderImage(ctx, w, h) {
    ctx.fillStyle = '#060a12';
    ctx.fillRect(0, 0, w, h);

    if (!this.currentImage || !this.imageLoaded) {
      this.renderLoading(ctx, w, h);
      return;
    }

    const img = this.currentImage;
    const imgAspect = img.width / img.height;

    // Fill screen maximally with minimal 6px padding
    const padding = 6;
    const availW = w - padding * 2;
    const availH = h - padding * 2;

    let drawW = availW;
    let drawH = availW / imgAspect;

    if (drawH > availH) {
      drawH = availH;
      drawW = availH * imgAspect;
    }

    const drawX = (w - drawW) / 2;
    const drawY = (h - drawH) / 2;

    this.renderTelemetryGrid(ctx, w, h);

    // Subtle glowing cyan frame around the certificate
    ctx.save();
    ctx.shadowColor = 'rgba(56, 189, 248, 0.45)';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(drawX - 1, drawY - 1, drawW + 2, drawH + 2);

    // Draw crisp image
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.restore();

    // Subtle sleek corner brackets
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    const corner = 16;
    // Top-left
    ctx.beginPath();
    ctx.moveTo(drawX - 4, drawY + corner);
    ctx.lineTo(drawX - 4, drawY - 4);
    ctx.lineTo(drawX + corner, drawY - 4);
    ctx.stroke();
    // Top-right
    ctx.beginPath();
    ctx.moveTo(drawX + drawW - corner, drawY - 4);
    ctx.lineTo(drawX + drawW + 4, drawY - 4);
    ctx.lineTo(drawX + drawW + 4, drawY + corner);
    ctx.stroke();
    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(drawX - 4, drawY + drawH - corner);
    ctx.lineTo(drawX - 4, drawY + drawH + 4);
    ctx.lineTo(drawX + corner, drawY + drawH + 4);
    ctx.stroke();
    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(drawX + drawW - corner, drawY + drawH + 4);
    ctx.lineTo(drawX + drawW + 4, drawY + drawH + 4);
    ctx.lineTo(drawX + drawW + 4, drawY + drawH - corner);
    ctx.stroke();
  }

  renderScanlines(ctx, w, h) {
    // Lighter scanlines in IMAGE mode so small text remains sharp and legible
    const alpha = this.currentMode === ScreenModes.IMAGE ? 0.05 : 0.16;
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    for (let y = 0; y < h; y += 3) {
      ctx.fillRect(0, y, w, 1.2);
    }
  }

  renderCRTVignette(ctx, w, h) {
    const grad = ctx.createRadialGradient(w / 2, h / 2, w * 0.35, w / 2, h / 2, w * 0.7);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
}

export const tvScreenManager = new TVScreenManager();

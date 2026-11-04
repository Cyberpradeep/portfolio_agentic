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

    // Image display and carousel state
    this.currentImage = null;
    this.imageTitle = '';
    this.imageLoaded = false;
    this.isImageLocked = false;
    this.isCarouselActive = false;
    this.carouselImages = [];
    this.carouselIndex = 0;
    this.carouselTimer = 0;
    this.carouselInterval = 3.8;
    this.onCarouselChange = null;

    // Preloaded Easter Egg Flash Image (Creator Photo)
    this.idleFlashList = [
      {
        id: 'creator',
        src: '/static/assests/profile_image-sketch.jpg',
        title: 'IDENTITY // PRADEEP SELLADURAI',
        subtitle: '● NEURAL ARCHETYPE // SYNCHRONIZED',
        color: '#38bdf8',
        shadowColor: 'rgba(56, 189, 248, 0.55)',
        statusColor: '#10b981',
        beamColor: 'rgba(56, 189, 248, 0.14)',
        img: null,
        loaded: false
      }
    ];

    this.currentFlashIndex = 0;
    this.activeFlashItem = this.idleFlashList[0];
    this.profileImage = null;
    this.profileImageLoaded = false;

    // Preload each flash image
    this.idleFlashList.forEach((item, idx) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        item.loaded = true;
        if (idx === 0) {
          this.profileImage = img;
          this.profileImageLoaded = true;
        }
      };
      img.src = item.src;
      item.img = img;
    });

    // Idle Easter Egg Flash State (periodically cycles images then returns to normal eyes)
    this.idleFlashTimer = 0;
    this.nextIdleFlashInterval = 45.0 + Math.random() * 15.0; // Easter egg flash every 45-60s
    this.isShowingIdleFlash = false;
    this.idleFlashRemaining = 0;

    // Listening duration timer (triggers kind & caring prompt when > 5s of silence)
    this.listeningTimer = 0;

    // Point Light colors (synced to screen glow)
    this.lightColor = new THREE.Color(0x38bdf8);
    this.lightIntensity = 2.4;
  }

  setMode(mode) {
    // When locked to certificate image display, do not allow speech/thinking/listening to overwrite screen
    if (this.isImageLocked && mode !== ScreenModes.IMAGE) {
      return;
    }
    if (this.currentMode === mode) return;
    this.triggerGlitch(0.18);
    this.currentMode = mode;

    // Abort active idle flash immediately if mode changes away from IDLE
    if (mode !== ScreenModes.IDLE) {
      this.isShowingIdleFlash = false;
      this.idleFlashRemaining = 0;
      this.idleFlashTimer = 0;
    }

    // Reset listening timer when leaving LISTENING mode
    if (mode !== ScreenModes.LISTENING) {
      this.listeningTimer = 0;
    }

    switch (mode) {
      case ScreenModes.LOADING:
        this.lightColor.setHex(0x38bdf8);
        this.lightIntensity = 2.0;
        break;
      case ScreenModes.IDLE:
        this.lightColor.setHex(0x38bdf8); // Clean cyan
        this.lightIntensity = 2.2;
        this.nextIdleFlashInterval = 45.0 + Math.random() * 15.0; // Easter egg flash every 45-60s
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

  displayImage(url, title = '', lock = true) {
    this.triggerGlitch(0.25);
    this.imageTitle = title || '';
    this.imageLoaded = false;
    if (lock) {
      this.isImageLocked = true;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.currentImage = img;
      this.imageLoaded = true;
      this.currentMode = ScreenModes.IMAGE;
      this.lightColor.setHex(0x0ea5e9);
      this.lightIntensity = 3.2;
    };
    img.onerror = (err) => {
      console.error('[TV_SCREEN] Failed to load image:', url, err);
    };
    img.src = url;
  }

  displayImageCarousel(imagesList, intervalSec = 3.8) {
    if (!imagesList || imagesList.length === 0) return;
    this.carouselImages = imagesList;
    this.carouselIndex = 0;
    this.carouselInterval = intervalSec || 3.8;
    this.carouselTimer = 0;
    this.isCarouselActive = true;
    this.isImageLocked = true;
    const first = imagesList[0];
    this.displayImage(first.url || first.image, first.title || first.name, true);
  }

  clearImage() {
    this.currentImage = null;
    this.imageLoaded = false;
    this.imageTitle = '';
    this.isImageLocked = false;
    this.isCarouselActive = false;
    this.carouselImages = [];
    this.currentMode = ScreenModes.IDLE;
    this.setMode(ScreenModes.IDLE);
  }

  unlockImageMode() {
    this.clearImage();
  }

  setTranscript(text) {
    this.transcriptText = text || '';
    if (this.currentMode === ScreenModes.IDLE && this.transcriptText && !this.isImageLocked) {
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
    // Expanded expressive gaze travel across CRT screen: ±52px horizontal, ±38px vertical
    this.eyeTargetX = THREE.MathUtils.clamp(x * 52, -52, 52);
    this.eyeTargetY = THREE.MathUtils.clamp(-y * 38, -38, 38);
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

    // Image Carousel / Slideshow Progression
    if (this.isCarouselActive && this.carouselImages.length > 1 && this.currentMode === ScreenModes.IMAGE) {
      this.carouselTimer += deltaTime;
      if (this.carouselTimer >= this.carouselInterval) {
        this.carouselTimer = 0;
        this.carouselIndex = (this.carouselIndex + 1) % this.carouselImages.length;
        const nextItem = this.carouselImages[this.carouselIndex];
        this.triggerGlitch(0.22);
        this.displayImage(nextItem.url || nextItem.image, nextItem.title || nextItem.name, true);
        if (typeof this.onCarouselChange === 'function') {
          this.onCarouselChange(this.carouselIndex, nextItem);
        }
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

    // Periodic Easter Egg Image Flash during IDLE (alternates between normal eyes and memories/memes)
    if (this.currentMode === ScreenModes.IDLE) {
      if (!this.isShowingIdleFlash) {
        this.idleFlashTimer += deltaTime;
        if (this.idleFlashTimer >= this.nextIdleFlashInterval) {
          const loadedItems = this.idleFlashList.filter(item => item.loaded);
          if (loadedItems.length > 0) {
            this.currentFlashIndex = (this.currentFlashIndex + 1) % loadedItems.length;
            this.activeFlashItem = loadedItems[this.currentFlashIndex];
            this.isShowingIdleFlash = true;
            this.idleFlashRemaining = 3.0; // Show full-screen image for 3.0s
            this.triggerGlitch(0.18);
            soundFX.playGlitch();
            this.idleFlashTimer = 0;
            this.nextIdleFlashInterval = 45.0 + Math.random() * 15.0; // Next flash in 45-60s
          }
        }
      } else {
        this.idleFlashRemaining -= deltaTime;
        if (this.idleFlashRemaining <= 0) {
          this.isShowingIdleFlash = false;
          this.idleFlashRemaining = 0;
          this.triggerGlitch(0.18);
          soundFX.playGlitch();
        }
      }
    } else {
      this.idleFlashTimer = 0;
      this.isShowingIdleFlash = false;
      this.idleFlashRemaining = 0;
    }

    // Track continuous listening duration (for caring prompts when silent > 5s)
    if (this.currentMode === ScreenModes.LISTENING) {
      if (this.speechVolumeSmoothed > 0.18) {
        this.listeningTimer = 0;
      } else {
        this.listeningTimer += deltaTime;
      }
    } else {
      this.listeningTimer = 0;
    }

    const { ctx, canvas } = this;
    const w = 512;
    const h = 512;

    // Dynamic emissive pulse matching speech volume
    if (this.screenMaterial) {
      if (this.currentMode === ScreenModes.IMAGE || (this.currentMode === ScreenModes.IDLE && this.isShowingIdleFlash)) {
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
        if (this.isShowingIdleFlash && this.activeFlashItem && this.activeFlashItem.loaded) {
          this.renderProfileFlash(ctx, w, h);
        } else {
          this.renderIdleAttentive(ctx, w, h);
        }
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

  // --- 1. IDLE ATTENTIVE MODE (Warm Glowing Eyes — no HUD) ---
  renderIdleAttentive(ctx, w, h) {
    // Deep vintage CRT glass background
    ctx.fillStyle = '#080c10';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2 + this.eyeCurrentX;
    const cy = h / 2 - 10 + this.eyeCurrentY;

    // Soft ambient screen glow
    const ambientGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, 280);
    ambientGrad.addColorStop(0, 'rgba(255, 230, 180, 0.06)');
    ambientGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ambientGrad;
    ctx.fillRect(0, 0, w, h);

    // Warm glowing orb eyes
    this.drawWarmGlowingEyes(ctx, cx, cy);
  }

  // --- 1B. IDLE EASTER EGG: CREATOR & MEME MEMORY FLASH (Full Screen CRT Fit) ---
  renderProfileFlash(ctx, w, h) {
    ctx.fillStyle = '#060a12';
    ctx.fillRect(0, 0, w, h);

    const flashItem = this.activeFlashItem || (this.idleFlashList && this.idleFlashList[0]);
    const img = (flashItem && flashItem.img && flashItem.loaded) ? flashItem.img : this.profileImage;
    if (!img) {
      this.renderIdleAttentive(ctx, w, h);
      return;
    }

    const iw = img.naturalWidth || img.width || 512;
    const ih = img.naturalHeight || img.height || 512;

    // Full screen fit / cover: fills the entire 512x512 CRT TV glass face seamlessly
    const scale = Math.max(w / iw, h / ih);
    const nw = iw * scale;
    const nh = ih * scale;
    const nx = (w - nw) / 2;
    const ny = (h - nh) / 2;

    ctx.save();
    // Draw full-bleed image across the entire screen
    ctx.drawImage(img, nx, ny, nw, nh);
    ctx.restore();

    const color = (flashItem && flashItem.color) || '#38bdf8';
    const shadowColor = (flashItem && flashItem.shadowColor) || 'rgba(56, 189, 248, 0.55)';
    const title = (flashItem && flashItem.title) || 'IDENTITY // PRADEEP SELLADURAI';
    const subtitle = (flashItem && flashItem.subtitle) || '● NEURAL ARCHETYPE // SYNCHRONIZED';
    const statusColor = (flashItem && flashItem.statusColor) || '#10b981';

    // Sleek broadcast HUD pill at top
    ctx.save();
    ctx.fillStyle = 'rgba(6, 10, 18, 0.78)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = 8;
    const badgeW = 290;
    const badgeH = 28;
    const badgeX = (w - badgeW) / 2;
    const badgeY = 16;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = '700 12px "Space Grotesk", "SF Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(title, w / 2, badgeY + 18);
    ctx.restore();

    // Sleek status pill at bottom
    ctx.save();
    ctx.fillStyle = 'rgba(6, 10, 18, 0.78)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1;
    const subW = 270;
    const subH = 24;
    const subX = (w - subW) / 2;
    const subY = h - 38;
    ctx.beginPath();
    ctx.roundRect(subX, subY, subW, subH, 5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = statusColor;
    ctx.font = '700 11px "Space Grotesk", "SF Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(subtitle, w / 2, subY + 16);
    ctx.restore();

    // Glowing cybernetic perimeter border around entire screen
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5;
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = 12;
    ctx.strokeRect(6, 6, w - 12, h - 12);

    // Corner HUD brackets on screen perimeter
    const corner = 26;
    ctx.lineWidth = 5;
    // Top-Left
    ctx.beginPath();
    ctx.moveTo(6, 6 + corner);
    ctx.lineTo(6, 6);
    ctx.lineTo(6 + corner, 6);
    ctx.stroke();
    // Top-Right
    ctx.beginPath();
    ctx.moveTo(w - 6 - corner, 6);
    ctx.lineTo(w - 6, 6);
    ctx.lineTo(w - 6, 6 + corner);
    ctx.stroke();
    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(6, h - 6 - corner);
    ctx.lineTo(6, h - 6);
    ctx.lineTo(6 + corner, h - 6);
    ctx.stroke();
    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(w - 6 - corner, h - 6);
    ctx.lineTo(w - 6, h - 6);
    ctx.lineTo(w - 6, h - 6 - corner);
    ctx.stroke();
    ctx.restore();

    // Subtle horizontal beam sweep across screen
    const beamY = (this.time * 260) % h;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(0, beamY, w, 5);
  }

  // --- 2. LISTENING MODE (Warm Attentive Eyes + 2-3 Word Full-Screen Caring Prompt + Image Loop) ---
  renderListening(ctx, w, h) {
    // If silence is under 5 seconds, simply display attentive warm glowing eyes
    if (this.listeningTimer <= 5.0) {
      ctx.fillStyle = '#070d0b';
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2 + this.eyeCurrentX;
      const cy = h / 2 - 10 + this.eyeCurrentY;

      const breathAlpha = 0.06 + Math.sin(this.time * 2.0) * 0.02;
      const ambientGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, 270);
      ambientGrad.addColorStop(0, `rgba(180, 255, 215, ${breathAlpha})`);
      ambientGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ambientGrad;
      ctx.fillRect(0, 0, w, h);

      this.drawWarmGlowingEyes(ctx, cx, cy, 1.05);
      return;
    }

    // Silence > 5s: Caring Words (0-3s) -> Attentive warm glowing eyes (3-9s)
    const elapsedAfter5s = this.listeningTimer - 5.0;
    const cycleDuration = 9.0;
    const cycleTime = elapsedAfter5s % cycleDuration;
    const cycleIndex = Math.floor(elapsedAfter5s / cycleDuration);

    const caringWords = [
      "I'M LISTENING",
      "TAKE YOUR TIME",
      "I'M RIGHT HERE",
      "NO RUSH",
      "STILL HERE",
      "HERE FOR YOU"
    ];

    // PHASE 1: Caring 2-3 Words capturing the full screen (0.0s - 3.0s) - EYES HIDDEN
    if (cycleTime < 3.0) {
      ctx.fillStyle = '#070d0b';
      ctx.fillRect(0, 0, w, h);

      const fadeIn = Math.min(1.0, cycleTime / 0.35);
      const fadeOut = Math.min(1.0, (3.0 - cycleTime) / 0.35);
      const textAlpha = Math.min(fadeIn, fadeOut);

      const promptWord = caringWords[cycleIndex % caringWords.length];

      ctx.save();
      ctx.globalAlpha = textAlpha;

      // Soft ambient radial glow behind the words
      const textGlow = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, 240);
      textGlow.addColorStop(0, 'rgba(52, 211, 153, 0.15)');
      textGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = textGlow;
      ctx.fillRect(0, 0, w, h);

      // 2 to 3 bold words capturing the full screen (NO background box, NO border)
      ctx.font = '800 46px "Space Grotesk", -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Radiant emerald CRT typography glow
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(52, 211, 153, 0.95)';
      ctx.shadowBlur = 28;
      ctx.fillText(promptWord, w / 2, h / 2);

      // Core crisp specular pass
      ctx.shadowColor = 'rgba(255, 255, 255, 0.85)';
      ctx.shadowBlur = 10;
      ctx.fillText(promptWord, w / 2, h / 2);

      ctx.restore();
      return;
    }

    // PHASE 2: Eyes become visible again (3.0s - 9.0s)
    ctx.fillStyle = '#070d0b';
    ctx.fillRect(0, 0, w, h);

    const fadeIn = Math.min(1.0, (cycleTime - 3.0) / 0.35);
    const fadeOut = Math.min(1.0, (9.0 - cycleTime) / 0.35);
    const eyeAlpha = Math.min(fadeIn, fadeOut);

    const cx = w / 2 + this.eyeCurrentX;
    const cy = h / 2 - 10 + this.eyeCurrentY;

    const breathAlpha = 0.06 + Math.sin(this.time * 2.0) * 0.02;
    const ambientGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, 270);
    ambientGrad.addColorStop(0, `rgba(180, 255, 215, ${breathAlpha})`);
    ambientGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ambientGrad;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalAlpha = eyeAlpha;
    this.drawWarmGlowingEyes(ctx, cx, cy, 1.05);
    ctx.restore();
  }

  // --- 3. THINKING MODE (Gentle upward glance — no matrix/arc) ---
  renderThinking(ctx, w, h) {
    ctx.fillStyle = '#09080f';
    ctx.fillRect(0, 0, w, h);

    // Gentle upward gaze during thinking
    const cx = w / 2 + this.eyeCurrentX * 0.5;
    // Eyes drift up slightly independent of cursor during thinking
    const cy = h / 2 - 20 + Math.sin(this.time * 1.2) * 6 + this.eyeCurrentY * 0.5;

    // Very subtle purple-warm ambient
    const breathAlpha = 0.04 + Math.sin(this.time * 1.8) * 0.015;
    const ambientGrad = ctx.createRadialGradient(w / 2, h / 2 - 20, 0, w / 2, h / 2, 260);
    ambientGrad.addColorStop(0, `rgba(220, 200, 255, ${breathAlpha})`);
    ambientGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ambientGrad;
    ctx.fillRect(0, 0, w, h);

    // Slightly narrowed eyes for contemplation
    this.drawWarmGlowingEyes(ctx, cx, cy, 0.88);
  }

  // --- 4. SPEAKING MODE (Warm eyes top + clean scrolling transcript + subtle mouth) ---
  renderSpeakingTranscript(ctx, w, h) {
    ctx.fillStyle = '#080c10';
    ctx.fillRect(0, 0, w, h);

    // Top Section: Warm Eyes while speaking (follows cursor gaze X and Y)
    const eyeY = 110 + Math.sin(this.time * 3.5) * 2 + this.eyeCurrentY * 0.6;
    const eyeX = w / 2 + this.eyeCurrentX * 0.75;
    this.drawWarmGlowingEyes(ctx, eyeX, eyeY, 0.88);

    // Thin separator
    ctx.strokeStyle = 'rgba(255, 220, 160, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, 178);
    ctx.lineTo(w - 40, 178);
    ctx.stroke();

    // Middle Section: Clean scrolling transcript
    ctx.save();
    ctx.beginPath();
    ctx.rect(30, 188, w - 60, 215);
    ctx.clip();

    ctx.fillStyle = '#e8e8e8';
    ctx.font = '500 19px "Space Grotesk", "SF Pro Display", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const textToRender = this.transcriptText || '';
    const lines = this.wrapText(ctx, textToRender, w - 80);

    const lineHeight = 27;
    const maxVisibleLines = 6;
    let targetScroll = 0;
    if (lines.length > maxVisibleLines) {
      targetScroll = (lines.length - maxVisibleLines) * lineHeight;
    }
    this.transcriptScrollY = THREE.MathUtils.lerp(this.transcriptScrollY, targetScroll, 0.15);
    const startY = 192 - this.transcriptScrollY;

    lines.forEach((line, i) => {
      const lineY = startY + i * lineHeight;
      if (lineY > 180 && lineY < 408) {
        ctx.fillStyle = (i === lines.length - 1) ? 'rgba(255,255,255,0.95)' : 'rgba(180,180,180,0.65)';
        ctx.fillText(line, 40, lineY);
        if (i === lines.length - 1 && this.cursorBlink) {
          const metrics = ctx.measureText(line);
          ctx.fillStyle = 'rgba(255, 210, 140, 0.8)';
          ctx.fillRect(40 + metrics.width + 3, lineY + 4, 2, 16);
        }
      }
    });
    ctx.restore();

    // Subtle minimal mouth — a single warm animated line at the bottom
    const vol = Math.max(this.speechVolumeSmoothed, 0.08);
    const mouthW = 80 + vol * 60;
    const mouthH = 3 + vol * 10;
    const mouthX = w / 2;
    const mouthY = h - 70;
    ctx.save();
    ctx.globalAlpha = 0.7 + vol * 0.3;
    const mGrad = ctx.createLinearGradient(mouthX - mouthW / 2, 0, mouthX + mouthW / 2, 0);
    mGrad.addColorStop(0, 'rgba(255,200,120,0)');
    mGrad.addColorStop(0.3, 'rgba(255,220,160,0.85)');
    mGrad.addColorStop(0.7, 'rgba(255,220,160,0.85)');
    mGrad.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = mGrad;
    ctx.beginPath();
    ctx.ellipse(mouthX, mouthY, mouthW / 2, mouthH / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // --- WARM GLOWING EYE HELPERS ---

  /**
   * Draw two warm, soft circular glowing orbs (Locomotive-style).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cx  - horizontal center (includes cursor offset)
   * @param {number} cy  - vertical center (includes cursor offset)
   * @param {number} scale - uniform scale multiplier (default 1.0)
   */
  drawWarmGlowingEyes(ctx, cx, cy, scale = 1.0) {
    const spacing = 88 * scale;
    const radius = 38 * scale;

    this.drawWarmEye(ctx, cx - spacing, cy, radius);
    this.drawWarmEye(ctx, cx + spacing, cy, radius);
  }

  drawWarmEye(ctx, x, y, radius) {
    const blinkRadius = this.isBlinking ? radius * 0.07 : radius;

    ctx.save();

    // Outer soft halo (large, very transparent)
    const halo = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.2);
    halo.addColorStop(0, 'rgba(255, 235, 180, 0.18)');
    halo.addColorStop(0.5, 'rgba(255, 220, 150, 0.07)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.ellipse(x, y, radius * 2.2, blinkRadius * 2.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Core warm orb gradient
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0,    'rgba(255, 255, 255, 0.97)');
    grad.addColorStop(0.22, 'rgba(255, 248, 225, 0.93)');
    grad.addColorStop(0.50, 'rgba(255, 225, 170, 0.70)');
    grad.addColorStop(0.78, 'rgba(245, 195, 120, 0.28)');
    grad.addColorStop(1.0,  'rgba(240, 180, 100, 0.0)');

    ctx.shadowColor = 'rgba(255, 220, 140, 0.65)';
    ctx.shadowBlur = 28;

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(x, y, radius, blinkRadius, 0, 0, Math.PI * 2);
    ctx.fill();

    // Inner bright specular highlight (top-left)
    if (!this.isBlinking) {
      const specX = x - radius * 0.28;
      const specY = y - radius * 0.28;
      const spec = ctx.createRadialGradient(specX, specY, 0, specX, specY, radius * 0.36);
      spec.addColorStop(0, 'rgba(255,255,255,0.70)');
      spec.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = spec;
      ctx.beginPath();
      ctx.arc(specX, specY, radius * 0.36, 0, Math.PI * 2);
      ctx.fill();
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

    // Allocate vertical space for HUD header & title footer
    const padding = 10;
    const headerH = 38;
    const footerH = 46;
    const availW = w - padding * 2;
    const availH = h - headerH - footerH;

    let drawW = availW;
    let drawH = availW / imgAspect;

    if (drawH > availH) {
      drawH = availH;
      drawW = availH * imgAspect;
    }

    const drawX = (w - drawW) / 2;
    const drawY = headerH + (availH - drawH) / 2;

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

    // Sleek corner brackets
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    const corner = 14;
    // Top-left
    ctx.beginPath();
    ctx.moveTo(drawX - 3, drawY + corner);
    ctx.lineTo(drawX - 3, drawY - 3);
    ctx.lineTo(drawX + corner, drawY - 3);
    ctx.stroke();
    // Top-right
    ctx.beginPath();
    ctx.moveTo(drawX + drawW - corner, drawY - 3);
    ctx.lineTo(drawX + drawW + 3, drawY - 3);
    ctx.lineTo(drawX + drawW + 3, drawY + corner);
    ctx.stroke();
    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(drawX - 3, drawY + drawH - corner);
    ctx.lineTo(drawX - 3, drawY + drawH + 3);
    ctx.lineTo(drawX + corner, drawY + drawH + 3);
    ctx.stroke();
    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(drawX + drawW - corner, drawY + drawH + 3);
    ctx.lineTo(drawX + drawW + 3, drawY + drawH + 3);
    ctx.lineTo(drawX + drawW + 3, drawY + drawH - corner);
    ctx.stroke();

    // --- Header HUD Banner ---
    ctx.fillStyle = 'rgba(10, 18, 30, 0.85)';
    ctx.fillRect(padding, 8, w - padding * 2, 24);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(padding, 8, w - padding * 2, 24);

    // Status Indicator Dot
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(padding + 12, 20, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#38bdf8';
    ctx.font = '700 10px "Space Grotesk", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('VERIFIED ACCREDITATION // PRADEEP', padding + 22, 23);

    if (this.isCarouselActive && this.carouselImages.length > 1) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#e0f2fe';
      ctx.fillText(`0${this.carouselIndex + 1} / 0${this.carouselImages.length}`, w - padding - 12, 23);
    } else {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('DIRECT SPECIFICATION', w - padding - 12, 23);
    }

    // --- Footer Title Banner ---
    if (this.imageTitle) {
      ctx.fillStyle = 'rgba(8, 14, 24, 0.92)';
      ctx.fillRect(padding, h - 40, w - padding * 2, 30);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(padding, h - 40, w - padding * 2, 30);

      ctx.fillStyle = '#ffffff';
      ctx.font = '700 11px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center';
      const cleanTitle = this.imageTitle.replace(/^Microsoft Certified:\s*/i, '');
      ctx.fillText(cleanTitle.toUpperCase(), w / 2, h - 21);
    }
  }

  renderScanlines(ctx, w, h) {
    // Lighter scanlines in IMAGE mode or during creator profile flash so images remain crisp
    const alpha = (this.currentMode === ScreenModes.IMAGE || (this.currentMode === ScreenModes.IDLE && this.isShowingIdleFlash)) ? 0.05 : 0.16;
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

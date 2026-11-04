import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

import { tvScreenManager, ScreenModes } from './tvScreenManager.js?v=67';
import { animationController } from './animationController.js?v=8';
import { mechanicalController } from './mechanicalController.js?v=7';
import { soundFX } from './soundFx.js';

let scene, camera, renderer, controls;
let screenPointLight, keyLight, fillLight, rimLight, hemiLight;
let shadowPlane;
let clock = new THREE.Clock();
let modelRoot = null;
let modelBasePos = new THREE.Vector3();
let modelBaseRot = new THREE.Euler();
let pointer = new THREE.Vector2();
let isInitialized = false;
let idleCameraTimer = null;
let isGenUIActive = false;
let isUserInteracting = false;
let userInteractionTimeout = null;

const CAMERA_PRESETS = {
  // Default: Upper-body bust framing — character fills right stage naturally
  BUST: { pos: new THREE.Vector3(0, 2.30, 2.60), lookAt: new THREE.Vector3(0, 2.10, 0) },
  // Full body fallback (not used by default)
  FULL_BODY: { pos: new THREE.Vector3(0, 1.88, 4.90), lookAt: new THREE.Vector3(0, 1.58, 0) },
  // Locomotive Passport-Size TV-Head Closeup (Centered overview with safe headroom)
  FACE_CAM: { pos: new THREE.Vector3(0, 2.22, 3.20), lookAt: new THREE.Vector3(0, 2.05, 0) },
  // Dedicated Screen Inspection Zoom
  SCREEN_CLOSEUP: { pos: new THREE.Vector3(0, 2.32, 2.00), lookAt: new THREE.Vector3(0, 2.25, 0) },
  // Studio 3-Quarter Angle
  STUDIO_3Q: { pos: new THREE.Vector3(-1.8, 1.95, 4.2), lookAt: new THREE.Vector3(0, 1.65, 0) }
};

let currentActivePreset = CAMERA_PRESETS.BUST;

function getResponsiveCameraPreset(preset) {
  if (!preset) return { pos: new THREE.Vector3(0, 1.85, 4.3), lookAt: new THREE.Vector3(0, 1.75, 0) };
  const width = window.innerWidth;
  const height = window.innerHeight;
  const aspect = width / height;

  const isFaceCam = (preset === CAMERA_PRESETS.FACE_CAM || preset === CAMERA_PRESETS.SCREEN_CLOSEUP);

  if (aspect < 0.55) {
    // Ultra-tall mobile portrait (Pixel 8, iPhone 14/15/16 Pro Max, Galaxy S series)
    if (isGenUIActive) {
      return {
        pos: new THREE.Vector3(0, 2.24, 3.80),
        lookAt: new THREE.Vector3(0, 2.04, 0)
      };
    }
    if (isFaceCam) {
      return {
        pos: new THREE.Vector3(0, 2.05, 3.80),
        lookAt: new THREE.Vector3(0, 1.85, 0)
      };
    }
    // Bust overview on ultra-tall mobile
    return {
      pos: new THREE.Vector3(0, 1.90, 4.20),
      lookAt: new THREE.Vector3(0, 1.70, 0)
    };
  } else if (aspect < 0.85) {
    // Standard mobile & phablet portrait (e.g. 375x667, 390x844, 412x915, 768px tablet portrait)
    if (isGenUIActive) {
      return {
        pos: new THREE.Vector3(0, 2.20, 3.75),
        lookAt: new THREE.Vector3(0, 2.00, 0)
      };
    }
    if (isFaceCam) {
      return {
        pos: new THREE.Vector3(0, 2.00, 3.70),
        lookAt: new THREE.Vector3(0, 1.80, 0)
      };
    }
    // Bust framing for standard mobile
    return {
      pos: new THREE.Vector3(0, 1.90, 4.00),
      lookAt: new THREE.Vector3(0, 1.70, 0)
    };
  } else if (aspect < 1.05) {
    // Tablets in portrait / Square foldables
    if (isGenUIActive) {
      return {
        pos: new THREE.Vector3(0, 2.20, 3.40),
        lookAt: new THREE.Vector3(0, 2.00, 0)
      };
    }
    if (isFaceCam) {
      return {
        pos: new THREE.Vector3(0, 2.15, 3.40),
        lookAt: new THREE.Vector3(0, 1.90, 0)
      };
    }
    return {
      pos: new THREE.Vector3(0, 1.75, 4.80),
      lookAt: new THREE.Vector3(0, 1.55, 0)
    };
  } else if (height < 540) {
    // Short landscape mobile screens
    return {
      pos: new THREE.Vector3(preset.pos.x, preset.pos.y - 0.05, preset.pos.z * 1.25),
      lookAt: new THREE.Vector3(preset.lookAt.x, preset.lookAt.y, preset.lookAt.z)
    };
  }

  // Desktop default
  return {
    pos: preset.pos.clone(),
    lookAt: preset.lookAt.clone()
  };
}

function applyResponsiveViewOffset() {
  if (!camera) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const aspect = width / height;

  if (aspect >= 1.15) {
    // Desktop 30/70 ocular weight:
    // Shift optical center so the robot frames in the right ~62% of the visual stage.
    // Reduced from 16.5% to 12% so the character isn't pushed too far into the corner.
    const offsetX = -Math.round(width * 0.12);
    camera.setViewOffset(width, height, offsetX, 0, width, height);
  } else {
    // Mobile & tablet portrait: centered vertical stage
    camera.clearViewOffset();
  }
}

const cameraTarget = {
  pos: new THREE.Vector3(0, 2.30, 2.60),
  lookAt: new THREE.Vector3(0, 2.10, 0)
};

function initScene(canvasId) {
  if (isInitialized) return;

  const canvas = document.getElementById(canvasId);
  const container = canvas ? canvas.parentElement : document.body;

  // 1. Scene
  scene = new THREE.Scene();
  scene.background = null;

  // 2. Camera with responsive distance calibration
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;
  camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 500);
  applyResponsiveViewOffset();

  const initial = getResponsiveCameraPreset(CAMERA_PRESETS.BUST);
  cameraTarget.pos.copy(initial.pos);
  cameraTarget.lookAt.copy(initial.lookAt);
  camera.position.copy(initial.pos);

  // 3. Renderer with Native Hardware MSAA & ACESFilmic Tone Mapping
  renderer = new THREE.WebGLRenderer({
    canvas: canvas || undefined,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  // Maximize texture anisotropy for crisp angles
  if (tvScreenManager && tvScreenManager.texture) {
    tvScreenManager.texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 16);
  }

  if (!canvas) {
    container.appendChild(renderer.domElement);
  }

  // 4. OrbitControls: camera drag rotation disabled to prevent 180° / side viewing
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false; // Keeps avatar centered in studio stage
  controls.enableRotate = false; // Disables orbital dragging so avatar stays front-facing

  controls.minDistance = 2.4; // Clamped close distance to prevent mesh clipping
  controls.maxDistance = 6.2; // Clamped far distance to keep model framed
  controls.target.copy(cameraTarget.lookAt);

  controls.addEventListener('start', () => {
    isUserInteracting = true;
    if (userInteractionTimeout) {
      clearTimeout(userInteractionTimeout);
      userInteractionTimeout = null;
    }
  });

  controls.addEventListener('end', () => {
    // When user finishes dragging/rotating, hold orientation for 3s before returning to active preset
    if (userInteractionTimeout) clearTimeout(userInteractionTimeout);
    userInteractionTimeout = setTimeout(() => {
      isUserInteracting = false;
    }, 3000);
  });

  // 5. Studio Lighting
  setupStudioLighting();

  // 6. Seamless Ground Shadow
  setupStudioStage();

  // 7. TV screen initial loading mode
  tvScreenManager.setMode(ScreenModes.LOADING);

  // 8. Load Titan GLB Model
  loadTitanModel();

  // 9. Window Listeners
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('orientationchange', () => setTimeout(onWindowResize, 120));
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('touchmove', onTouchMove, { passive: true });

  // 10. Start Animation Loop
  animate();

  isInitialized = true;
}

function setupStudioLighting() {
  hemiLight = new THREE.HemisphereLight(0xffffff, 0xc8c5be, 2.5);
  hemiLight.position.set(0, 20, 0);
  scene.add(hemiLight);

  keyLight = new THREE.DirectionalLight(0xfffdf7, 3.2);
  keyLight.position.set(3.8, 6.8, 4.8);
  keyLight.target.position.set(0, 1.8, 0);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 25;
  keyLight.shadow.camera.left = -3.5;
  keyLight.shadow.camera.right = 3.5;
  keyLight.shadow.camera.top = 4.5;
  keyLight.shadow.camera.bottom = -1.0;
  keyLight.shadow.bias = -0.0004;
  scene.add(keyLight);
  scene.add(keyLight.target);

  fillLight = new THREE.DirectionalLight(0xe5ecf7, 1.8);
  fillLight.position.set(-4.2, 3.8, 3.2);
  fillLight.target.position.set(0, 1.8, 0);
  scene.add(fillLight);
  scene.add(fillLight.target);

  rimLight = new THREE.DirectionalLight(0xffffff, 2.4);
  rimLight.position.set(0, 5.2, -4.2);
  rimLight.target.position.set(0, 1.8, 0);
  scene.add(rimLight);
  scene.add(rimLight.target);

  const chestFill = new THREE.PointLight(0xffffff, 1.2, 6, 1.2);
  chestFill.position.set(0, 1.8, 2.6);
  scene.add(chestFill);

  screenPointLight = new THREE.PointLight(0x38bdf8, 2.2, 5, 1.5);
  screenPointLight.position.set(0, 2.75, 0.45);
  scene.add(screenPointLight);
}

function setupStudioStage() {
  // Seamless soft contact shadow receiver on infinite studio floor
  const groundGeo = new THREE.PlaneGeometry(30, 30);
  const groundMat = new THREE.ShadowMaterial({
    opacity: 0.28
  });
  shadowPlane = new THREE.Mesh(groundGeo, groundMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.0;
  shadowPlane.receiveShadow = true;
  scene.add(shadowPlane);
}

function runIntroSequence() {
  const greetingEl = document.getElementById('introGreeting');
  const nameEl = document.getElementById('introName');
  const actionEl = document.getElementById('introAction');

  function splitIntoAnimatedWordsAndChars(element, text, startDelayMs, charStepMs = 50) {
    if (!element) return startDelayMs + (text.length * charStepMs);
    element.innerHTML = '';
    
    // Split by spaces so each word is wrapped in an unbreakable .intro-word container
    const words = text.split(' ');
    let currentDelay = startDelayMs;

    words.forEach((word, wordIdx) => {
      const wordSpan = document.createElement('span');
      wordSpan.className = 'intro-word';

      const chars = Array.from(word);
      chars.forEach((char) => {
        const charSpan = document.createElement('span');
        charSpan.className = 'intro-char';
        charSpan.textContent = char;
        charSpan.style.setProperty('--char-delay', `${currentDelay}ms`);
        wordSpan.appendChild(charSpan);
        currentDelay += charStepMs;
      });

      element.appendChild(wordSpan);

      // Add unbreakable space between words
      if (wordIdx < words.length - 1) {
        const spaceSpan = document.createElement('span');
        spaceSpan.className = 'intro-space';
        spaceSpan.innerHTML = '&nbsp;';
        element.appendChild(spaceSpan);
        currentDelay += Math.round(charStepMs * 0.7);
      }
    });

    return currentDelay;
  }

  // 1. "Vanakkam," (deliberate, warm character entrance)
  let delay = 250;
  delay = splitIntoAnimatedWordsAndChars(greetingEl, 'Vanakkam,', delay, 80);

  // 2. Deliberate pause, then "Pradeep Selladurai" (unbroken words, bold, confident pace)
  delay += 320;
  delay = splitIntoAnimatedWordsAndChars(nameEl, 'Pradeep Selladurai', delay, 65);

  // 3. Deliberate pause, then "Talk with me" (clean, rhythmic pace)
  delay += 380;
  delay = splitIntoAnimatedWordsAndChars(actionEl, 'Talk with me', delay, 55);

  return delay + 800; // Generous hold duration
}

function loadTitanModel() {
  const loadingProgress = document.getElementById('loadingProgress');
  const loadingScreen = document.getElementById('loadingOverlay');
  const percentEl = document.getElementById('introPercent');
  const statusTextEl = document.getElementById('introStatusText');
  const progressWrapper = document.querySelector('.intro-progress-wrapper');

  // Start the character-by-character intro animation
  const introDuration = runIntroSequence();
  let isModelLoaded = false;
  let isIntroFinished = false;
  let isDismissing = false;

  const startBtn = document.getElementById('startExperienceBtn');

  // Seamlessly activate "Talk with me" button and fade out loading bar
  function tryDismissLoading() {
    if (isModelLoaded && isIntroFinished && !isDismissing) {
      if (statusTextEl) statusTextEl.textContent = 'STAGE READY';

      // 1. Smoothly fade out progress bar without layout shifting
      if (progressWrapper) {
        progressWrapper.classList.add('is-finished');
      }

      // 2. Activate "Talk with me" button
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.classList.add('is-ready');
      }
    }
  }

  let hasRevealedStage = false;

  function reveal3DStage() {
    if (hasRevealedStage) return;
    hasRevealedStage = true;
    console.log('[AUTOGREET] Inbound voice active: smoothly revealing 3D Titan stage...');
    soundFX.playCRTWarmup();
    tvScreenManager.setMode(ScreenModes.SPEAKING);
    if (loadingScreen) {
      loadingScreen.classList.add('is-exiting');
      setTimeout(() => {
        loadingScreen.classList.add('is-hidden');
        window.dispatchEvent(new CustomEvent('stage:ready'));
      }, 550);
    }
  }

  // Reveal stage dynamically when Gemini Live starts audio turn
  window.addEventListener('session:ready_to_reveal', () => {
    reveal3DStage();
  });

  if (startBtn) {
    startBtn.addEventListener('click', () => {
      if (isDismissing || startBtn.disabled) return;
      isDismissing = true;
      soundFX.playRelayClick();
      startBtn.classList.add('is-connecting');
      startBtn.classList.remove('is-ready');

      // 1. Morph button into Option A: animated soundwave pulse
      const introActionText = document.getElementById('introAction');
      if (introActionText) {
        introActionText.innerHTML = `
          <span class="intro-soundwave" aria-hidden="true">
            <span class="sound-bar"></span>
            <span class="sound-bar"></span>
            <span class="sound-bar"></span>
            <span class="sound-bar"></span>
          </span>
          <span class="intro-connecting-label">Connecting Neural Link...</span>
        `;
      }

      // 2. Display live connection telemetry
      if (progressWrapper) {
        progressWrapper.classList.remove('is-finished');
        progressWrapper.classList.add('is-connecting');
      }
      if (statusTextEl) {
        statusTextEl.textContent = 'ESTABLISHING GEMINI AUDIO LINK...';
      }
      if (percentEl) {
        percentEl.textContent = 'SYNC';
      }

      // 3. Fire audio unlock immediately on direct user gesture
      window.dispatchEvent(new CustomEvent('session:unlock_audio'));

      // 4. Trigger Gemini connection and greeting turn in background
      window.dispatchEvent(new CustomEvent('session:start_greet'));

      // 5. Safety fallback: if no audio packet arrives within 6.5s, reveal stage anyway
      setTimeout(() => {
        if (!hasRevealedStage) {
          console.warn('[AUTOGREET] Safety timeout: revealing stage fallback');
          reveal3DStage();
        }
      }, 6500);
    });
  }

  setTimeout(() => {
    isIntroFinished = true;
    tryDismissLoading();
  }, introDuration);

  const manager = new THREE.LoadingManager(
    () => {
      isModelLoaded = true;
      if (loadingProgress) loadingProgress.style.width = '100%';
      if (percentEl) percentEl.textContent = '100%';
      tryDismissLoading();
    },
    (url, loaded, total) => {
      const pct = Math.round((loaded / total) * 100);
      if (loadingProgress) loadingProgress.style.width = `${pct}%`;
      if (percentEl) percentEl.textContent = `${pct}%`;
      if (statusTextEl) {
        if (pct < 50) statusTextEl.textContent = 'CALIBRATING NEURAL AUDIO';
        else if (pct < 90) statusTextEl.textContent = 'SYNCHRONIZING 3D STAGE';
        else statusTextEl.textContent = 'COMPILING SHADERS';
      }
    },
    (err) => {
      console.error('Error loading model asset:', err);
      isModelLoaded = true;
      tryDismissLoading();
    }
  );

  // Load 3D GLTF asset immediately
  const modelUrl = '/static/model/tv_man_titan.optimized.glb';
  setTimeout(() => {
    const loader = new GLTFLoader(manager);
    loader.setMeshoptDecoder(MeshoptDecoder);

    loader.load(
      modelUrl,
      (gltf) => {
        modelRoot = gltf.scene;

        modelRoot.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;

            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(m => optimizeMaterial(m));
              } else {
                optimizeMaterial(child.material);
              }
            }
          }
        });

        // Apply dynamic TV screen canvas
        tvScreenManager.applyToModel(modelRoot);

        // Phase 1: Remove external side speaker hardware, chest driver box, and hand claws
        // Hides bulky arm-mounted speakers, turbine assemblies, struts, and hand claws to reveal a slender, vertical silhouette
        const shouldHideNode = (child) => {
          const name = child.name || '';
          // 1. Material check for claws and acoustic hardware
          if (child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            if (mats.some(m => m && (m.name === 'Claw' || m.name === 'membrane' || m.name === 'pierscienczarn' || m.name === 'doof_speakerdark' || m.name === 'doof_speakerdarkMATTE' || m.name === 'doof_speakerlight'))) {
              return true;
            }
          }
          // 2. Side speaker collections
          if (name.startsWith('Collection')) return true;
          // 3. Hardware struts, braces, turbines, and claw mounts (Cube, Cube001, Cube002, Cylinder, Plane, etc.)
          if (name.startsWith('Cube') || name.startsWith('Cylinder') || name.startsWith('Plane')) return true;
          // 4. Claws & melee blade weapons on hands/forearms
          if (name.startsWith('melee') || name.includes('Claw')) return true;
          // 5. Chest speaker box
          if (name.includes('doof_speaker') || name.includes('doof_speakerside')) return true;
          return false;
        };

        modelRoot.traverse((child) => {
          if (shouldHideNode(child)) {
            console.log('[HIDE_NODE]', child.name, child.type);
            child.visible = false;
          }
        });

        window.__debugModel = modelRoot;



        // Normalize scale and center
        const bbox = new THREE.Box3().setFromObject(modelRoot);
        const size = bbox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const targetHeight = 3.35;
        const scaleFactor = maxDim > 0 ? (targetHeight / maxDim) : 1.0;
        modelRoot.scale.setScalar(scaleFactor);

        const scaledBbox = new THREE.Box3().setFromObject(modelRoot);
        const scaledCenter = scaledBbox.getCenter(new THREE.Vector3());

        modelRoot.position.x = -scaledCenter.x;
        modelRoot.position.z = -scaledCenter.z;
        modelRoot.position.y = -scaledBbox.min.y;

        modelBasePos.copy(modelRoot.position);
        modelBaseRot.copy(modelRoot.rotation);

        scene.add(modelRoot);

        if (screenPointLight) {
          screenPointLight.position.set(0, scaledBbox.max.y * 0.85, 0.45);
        }

        // Initialize animation and mechanics
        animationController.init(modelRoot, gltf.animations);
        mechanicalController.init(modelRoot);

        // Instantly transition TV screen to IDLE so eyes and images are immediately active
        if (tvScreenManager.currentMode === ScreenModes.LOADING) {
          tvScreenManager.setMode(ScreenModes.IDLE);
        }
      },
      undefined,
      (error) => {
        console.error('An error happened while loading GLTF:', error);
      }
    );
  }, 40);
}

function optimizeMaterial(mat) {
  if (!mat) return;
  if (mat.color && mat.color.r < 0.15 && mat.color.g < 0.15 && mat.color.b < 0.15) {
    mat.color.setRGB(0.24, 0.25, 0.28);
  }
  mat.roughness = Math.min(0.75, Math.max(0.3, mat.roughness ?? 0.5));
  mat.metalness = Math.min(0.65, mat.metalness ?? 0.2);
  mat.envMapIntensity = 1.2;
}

function onWindowResize() {
  if (!camera || !renderer) return;
  const container = renderer.domElement.parentElement || document.body;
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;

  camera.aspect = width / height;
  applyResponsiveViewOffset();
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);

  // Auto-adapt camera framing for the new aspect ratio
  if (currentActivePreset) {
    const responsive = getResponsiveCameraPreset(currentActivePreset);
    cameraTarget.pos.copy(responsive.pos);
    cameraTarget.lookAt.copy(responsive.lookAt);
  }
}

function onMouseMove(e) {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;

  if (tvScreenManager) {
    tvScreenManager.setPointerLook(pointer.x, pointer.y);
  }
}

function onTouchMove(e) {
  if (e.touches && e.touches.length > 0) {
    const touch = e.touches[0];
    pointer.x = (touch.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(touch.clientY / window.innerHeight) * 2 + 1;

    if (tvScreenManager) {
      tvScreenManager.setPointerLook(pointer.x, pointer.y);
    }
  }
}

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  // Smooth Camera Glide Interpolation (only when user is not actively rotating/dragging)
  if (!isUserInteracting) {
    camera.position.lerp(cameraTarget.pos, delta * 2.5);
    controls.target.lerp(cameraTarget.lookAt, delta * 2.5);
  }
  controls.update();

  // Avatar Whole-Body Subtle Cursor Movement & Gentle Lean (subtle front-facing presence)
  if (modelRoot && pointer) {
    const targetX = modelBasePos.x + pointer.x * 0.025;
    const targetY = modelBasePos.y + pointer.y * 0.015;
    const targetRotY = modelBaseRot.y + pointer.x * 0.020;
    const targetRotX = modelBaseRot.x - pointer.y * 0.015;
    const targetRotZ = modelBaseRot.z - pointer.x * 0.010;

    modelRoot.position.x = THREE.MathUtils.lerp(modelRoot.position.x, targetX, delta * 3.0);
    modelRoot.position.y = THREE.MathUtils.lerp(modelRoot.position.y, targetY, delta * 3.0);
    modelRoot.rotation.y = THREE.MathUtils.lerp(modelRoot.rotation.y, targetRotY, delta * 3.0);
    modelRoot.rotation.x = THREE.MathUtils.lerp(modelRoot.rotation.x, targetRotX, delta * 3.0);
    modelRoot.rotation.z = THREE.MathUtils.lerp(modelRoot.rotation.z, targetRotZ, delta * 3.0);
  }

  // Update Dynamic CRT TV Screen
  if (tvScreenManager) {
    tvScreenManager.update(delta);

    if (screenPointLight) {
      screenPointLight.color.lerp(tvScreenManager.lightColor, delta * 8);
      screenPointLight.intensity = THREE.MathUtils.lerp(
        screenPointLight.intensity,
        tvScreenManager.lightIntensity,
        delta * 8
      );
    }
  }

  // Update Skeletal Animations & Mechanics
  if (animationController) {
    animationController.update(delta, pointer);
  }

  if (mechanicalController) {
    mechanicalController.update(delta, pointer);
  }

  // Direct Hardware-accelerated Render with MSAA
  if (renderer) {
    renderer.render(scene, camera);
  }
}

function glideToTarget(preset) {
  isUserInteracting = false;
  if (userInteractionTimeout) {
    clearTimeout(userInteractionTimeout);
    userInteractionTimeout = null;
  }
  currentActivePreset = preset;
  if (idleCameraTimer) {
    clearTimeout(idleCameraTimer);
    idleCameraTimer = null;
  }
  const responsive = getResponsiveCameraPreset(preset);
  cameraTarget.pos.copy(responsive.pos);
  cameraTarget.lookAt.copy(responsive.lookAt);
}

function scheduleGlideToOverview(delayMs = 4000) {
  if (idleCameraTimer) clearTimeout(idleCameraTimer);
  idleCameraTimer = setTimeout(() => {
    glideToTarget(CAMERA_PRESETS.FULL_BODY);
  }, delayMs);
}

// Global Avatar Controller API
export const AvatarController = {
  isVoiceActive: false,

  initAvatar(canvasId = 'viewer') {
    initScene(canvasId);
  },

  setVoiceActive(active) {
    this.isVoiceActive = !!active;
    if (this.isVoiceActive) {
      if (!tvScreenManager.isImageLocked && (tvScreenManager.currentMode === ScreenModes.IDLE || tvScreenManager.currentMode === ScreenModes.LOADING)) {
        tvScreenManager.setMode(ScreenModes.LISTENING);
      }
    } else {
      if (!tvScreenManager.isImageLocked && tvScreenManager.currentMode === ScreenModes.LISTENING) {
        tvScreenManager.setMode(ScreenModes.IDLE);
      }
    }
  },

  setAvatarState(stateStr) {
    const s = (stateStr || 'idle').toLowerCase();
    if (s === 'listening') {
      if (!tvScreenManager.isImageLocked) {
        tvScreenManager.setMode(ScreenModes.LISTENING);
        // Camera locked — no glideToTarget
      }
      animationController.setSpeakingState(false);
      mechanicalController.setVoiceIntensity(0);
    } else if (s === 'thinking') {
      if (!tvScreenManager.isImageLocked) {
        tvScreenManager.setMode(ScreenModes.THINKING);
        // Camera locked — no glideToTarget
      }
      animationController.setSpeakingState(false);
      mechanicalController.setVoiceIntensity(0);
    } else if (s === 'speaking') {
      if (!tvScreenManager.isImageLocked) {
        tvScreenManager.setMode(ScreenModes.SPEAKING);
        // Camera locked — no glideToTarget
      }
      animationController.setSpeakingState(true);
    } else {
      if (!tvScreenManager.isImageLocked) {
        // When voice dialogue is active, 'idle' from pipeline means waiting for user speech -> LISTENING!
        if (this.isVoiceActive) {
          tvScreenManager.setMode(ScreenModes.LISTENING);
        } else {
          tvScreenManager.setMode(ScreenModes.IDLE);
        }
      }
      animationController.setSpeakingState(false);
      mechanicalController.setVoiceIntensity(0);
    }
  },

  setSpeaking(isSpeaking) {
    if (isSpeaking) {
      if (!tvScreenManager.isImageLocked) {
        tvScreenManager.setMode(ScreenModes.SPEAKING);
        // Camera locked — no glideToTarget
      }
      animationController.setSpeakingState(true);
    } else {
      if (!tvScreenManager.isImageLocked && tvScreenManager.currentMode === ScreenModes.SPEAKING) {
        if (this.isVoiceActive) {
          tvScreenManager.setMode(ScreenModes.LISTENING);
        } else {
          tvScreenManager.setMode(ScreenModes.IDLE);
        }
      }
      animationController.setSpeakingState(false);
      mechanicalController.setVoiceIntensity(0);
    }
  },

  setGenUIActive(active) {
    isGenUIActive = !!active;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspect = width / height;
    if (aspect < 0.88 || width <= 768) {
      if (isGenUIActive) {
        glideToTarget(CAMERA_PRESETS.FACE_CAM);
      } else {
        scheduleGlideToOverview(1800);
      }
    }
  },

  updateTranscript(text) {
    tvScreenManager.setTranscript(text);
  },

  updateAudioData(freqArray, volume) {
    tvScreenManager.setAudioData(freqArray, volume);
    mechanicalController.setVoiceIntensity(volume);
  },

  triggerEmote(modeName) {
    if (ScreenModes[modeName]) {
      tvScreenManager.setMode(ScreenModes[modeName]);
    }
  },

  displayImage(url, title = '', lock = true) {
    tvScreenManager.displayImage(url, title, lock);
    glideToTarget(CAMERA_PRESETS.SCREEN_CLOSEUP);
  },

  displayImageCarousel(images, interval = 3.8) {
    tvScreenManager.displayImageCarousel(images, interval);
    glideToTarget(CAMERA_PRESETS.SCREEN_CLOSEUP);
  },

  clearImage() {
    tvScreenManager.clearImage();
    glideToTarget(CAMERA_PRESETS.FULL_BODY);
  },

  unlockScreen() {
    tvScreenManager.unlockImageMode();
  },

  setCameraPreset(presetKey) {
    const preset = CAMERA_PRESETS[presetKey];
    if (preset) {
      soundFX.playClick();
      glideToTarget(preset);
    }
  },

  toggleAudio() {
    return soundFX.toggleMute();
  },

  setChestSpeakerVisible(visible) {
    if (!modelRoot) return;
    modelRoot.traverse((child) => {
      if (child.name && (child.name.includes('doof_speaker') || child.name.includes('doof_speakerside'))) {
        child.visible = !!visible;
      }
    });
  }
};

window.AvatarController = AvatarController;
export default AvatarController;
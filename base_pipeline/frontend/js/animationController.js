import * as THREE from 'three';

export class AnimationController {
  constructor() {
    this.mixer = null;
    this.clips = [];
    this.actions = new Map();
    this.currentAction = null;
    this.currentClipName = '';
    this.isPaused = false;
    this.timeScale = 1.0;
    this.loopMode = THREE.LoopRepeat;
    this.model = null;

    // Control flag: whether baked animation clips should play in the loop
    // Set to false per user request: avatar tracks cursor rather than playing baked animation
    this.enableClipAnimation = false;

    // Speaking state flag
    this.isSpeaking = false;
    this.speakingBoost = 1.0;

    // Bones located for expressive cursor look-at and full upper-body tracking
    this.headBone = null;
    this.neckBone = null;
    this.chestBone = null;
    this.spineBone = null;
    this.hipsBone = null;

    // Base resting rotations and positions for relative cursor offsets
    this.headBaseRot = new THREE.Euler();
    this.neckBaseRot = new THREE.Euler();
    this.chestBaseRot = new THREE.Euler();
    this.spineBaseRot = new THREE.Euler();
    this.hipsBaseRot = new THREE.Euler();
    this.hipsBasePos = new THREE.Vector3();

    // Natural breathing / micro-motion timekeeper
    this.lifeTime = 0;

    // Hand speaker fan turbines (preserved)
    this.leftFan = null;
    this.rightFan = null;
    this.fanSpinning = false;
    this.fanSpeed = 20.0; // Radians per second
  }

  init(model, animations) {
    this.model = model;
    this.mixer = new THREE.AnimationMixer(model);
    this.clips = animations || [];

    // Find and map animation clips (preserved completely)
    this.clips.forEach((clip, index) => {
      let alias = `Animation ${index + 1}`;
      if (clip.name.includes('Layer0')) {
        alias = 'Titan Action';
      } else if (clip.name.includes('FaceTest') && clip.name.includes('Armature')) {
        alias = 'Armature Pose';
      } else if (clip.name.includes('Tv|FaceTest')) {
        alias = 'TV Face Test';
      }

      const action = this.mixer.clipAction(clip);
      action.loop = this.loopMode;
      action.clampWhenFinished = false;

      this.actions.set(clip.name, {
        action,
        clip,
        alias,
        duration: clip.duration
      });
    });

    // Locate Head and Body Bones for Natural Look-At and Body Movement Tracking
    model.traverse((child) => {
      if (child.isBone) {
        const name = child.name;
        const nLow = name.toLowerCase();

        // 1. Head Bone
        if (name.includes('Head_09') || nLow.includes('head')) {
          if (!this.headBone || name.includes('Head_09')) {
            this.headBone = child;
          }
        }
        // 2. Neck Bone
        else if (name.includes('Neck_08') || nLow.includes('neck')) {
          if (!this.neckBone || name.includes('Neck_08')) {
            this.neckBone = child;
          }
        }
        // 3. Chest Bone (Upper Spine)
        else if (name.includes('Spine2_07') || name.includes('Spine1_06')) {
          if (!this.chestBone || name.includes('Spine2_07')) {
            this.chestBone = child;
          }
        }
        // 4. Lower Spine Bone
        else if (name.includes('Spine_05') || (nLow.includes('spine') && !nLow.includes('spine1') && !nLow.includes('spine2'))) {
          if (!this.spineBone || name.includes('Spine_05')) {
            this.spineBone = child;
          }
        }
        // 5. Hips / Pelvis Bone
        else if (name.includes('Hips_04') || nLow.includes('hips') || nLow.includes('pelvis')) {
          if (!this.hipsBone || name.includes('Hips_04')) {
            this.hipsBone = child;
          }
        }
      }
    });

    // Locate Left and Right Fan Turbine assemblies (preserved)
    this.leftFan = model.getObjectByName('Plane004') || model.getObjectByName('Plane004_Metal_0') || model.getObjectByName('Plane.004');
    this.rightFan = model.getObjectByName('Plane') || model.getObjectByName('Plane_Metal_0');

    // Setup resting upright pose from primary clip so character is naturally posed standing,
    // keeping animation clip playback paused by default per user instruction.
    if (this.clips.length > 0) {
      const firstClip = this.clips[0];
      const nextData = this.actions.get(firstClip.name);
      if (nextData) {
        this.currentAction = nextData.action;
        this.currentClipName = firstClip.name;
        this.currentAction.reset();
        this.currentAction.time = 0.05;
        this.currentAction.play();
        this.currentAction.paused = true;
        this.mixer.update(0);
      }

      // If clip animation is enabled, play clip continuously
      if (this.enableClipAnimation) {
        this.playClip(firstClip.name);
      }
    }

    // Capture base resting rotations and positions for relative cursor offsets
    if (this.headBone) this.headBaseRot.copy(this.headBone.rotation);
    if (this.neckBone) this.neckBaseRot.copy(this.neckBone.rotation);
    if (this.chestBone) this.chestBaseRot.copy(this.chestBone.rotation);
    if (this.spineBone) this.spineBaseRot.copy(this.spineBone.rotation);
    if (this.hipsBone) {
      this.hipsBaseRot.copy(this.hipsBone.rotation);
      this.hipsBasePos.copy(this.hipsBone.position);
    }
  }

  setClipAnimationEnabled(enabled) {
    this.enableClipAnimation = !!enabled;
    if (this.currentAction) {
      this.currentAction.paused = !this.enableClipAnimation;
    }
    return this.enableClipAnimation;
  }

  setSpeakingState(isSpeaking) {
    this.isSpeaking = !!isSpeaking;
    this.speakingBoost = this.isSpeaking ? 2.2 : 1.0;

    // Retained for clip animation compatibility
    if (this.currentAction) {
      if (this.isSpeaking) {
        this.currentAction.time = 0.05;
        this.currentAction.paused = true;
        if (this.mixer) {
          this.mixer.update(0);
        }
      } else {
        if (this.enableClipAnimation && !this.isPaused) {
          this.currentAction.paused = false;
        }
      }
    }
  }

  setSpeakingBoost(boost) {
    this.speakingBoost = boost;
    this.setSpeakingState(boost > 1.2);
  }

  setFanSpinning(active) {
    this.fanSpinning = active;
    return this.fanSpinning;
  }

  setFanSpeed(speedMultiplier) {
    this.fanSpeed = speedMultiplier * 20.0;
  }

  getClipList() {
    const list = [];
    this.actions.forEach((data, name) => {
      list.push({
        name,
        alias: data.alias,
        duration: data.duration
      });
    });
    return list;
  }

  playClip(name, fadeDuration = 0.5) {
    const nextData = this.actions.get(name);
    if (!nextData) return;

    const nextAction = nextData.action;

    if (this.currentAction && this.currentAction !== nextAction) {
      this.currentAction.fadeOut(fadeDuration);
      nextAction.reset().setEffectiveTimeScale(this.timeScale).setEffectiveWeight(1).fadeIn(fadeDuration).play();
    } else {
      nextAction.reset().setEffectiveTimeScale(this.timeScale).setEffectiveWeight(1).play();
    }

    this.currentAction = nextAction;
    this.currentClipName = name;
  }

  togglePlayPause() {
    this.isPaused = !this.isPaused;
    if (this.currentAction) {
      this.currentAction.paused = this.isPaused;
    }
    return !this.isPaused;
  }

  setTimeScale(speed) {
    this.timeScale = speed;
    if (this.currentAction) {
      this.currentAction.setEffectiveTimeScale(speed);
    }
  }

  update(deltaTime, pointerNormalized) {
    this.lifeTime += deltaTime;

    // 1. Skeletal Clip Animation Playback (ONLY if enabled)
    if (this.enableClipAnimation && this.mixer && !this.isPaused && !this.isSpeaking) {
      this.mixer.update(deltaTime);
    }

    // 2. Cursor tracking for Head and Body movement
    if (pointerNormalized) {
      const px = THREE.MathUtils.clamp(pointerNormalized.x, -1.0, 1.0);
      const py = THREE.MathUtils.clamp(pointerNormalized.y, -1.0, 1.0);

      // Subtle organic breathing micro-oscillation for lifelike presence
      const breath = Math.sin(this.lifeTime * 2.2) * 0.008;
      const breathChest = Math.sin(this.lifeTime * 2.2 + 0.3) * 0.010;

      // A. HEAD BONE — refined, subtle look-at tracking (keeps TV screen facing forward)
      if (this.headBone) {
        // Yaw (subtle turn left/right toward cursor: max ~6 degrees)
        const targetHeadYaw = this.headBaseRot.y + px * 0.11;
        // Pitch (subtle nod up/down toward cursor: max ~4.5 degrees)
        const targetHeadPitch = this.headBaseRot.x - py * 0.08 + breath;
        // Roll (very gentle natural tilt: max ~1.4 degrees)
        const targetHeadRoll = this.headBaseRot.z - px * 0.025;

        this.headBone.rotation.y = THREE.MathUtils.lerp(this.headBone.rotation.y, targetHeadYaw, deltaTime * 5.0);
        this.headBone.rotation.x = THREE.MathUtils.lerp(this.headBone.rotation.x, targetHeadPitch, deltaTime * 5.0);
        this.headBone.rotation.z = THREE.MathUtils.lerp(this.headBone.rotation.z, targetHeadRoll, deltaTime * 5.0);
      }

      // B. NECK BONE — gentle intermediate support (max ~2.5 degrees)
      if (this.neckBone) {
        const targetNeckYaw = this.neckBaseRot.y + px * 0.045;
        const targetNeckPitch = this.neckBaseRot.x - py * 0.035;
        const targetNeckRoll = this.neckBaseRot.z - px * 0.015;

        this.neckBone.rotation.y = THREE.MathUtils.lerp(this.neckBone.rotation.y, targetNeckYaw, deltaTime * 4.0);
        this.neckBone.rotation.x = THREE.MathUtils.lerp(this.neckBone.rotation.x, targetNeckPitch, deltaTime * 4.0);
        this.neckBone.rotation.z = THREE.MathUtils.lerp(this.neckBone.rotation.z, targetNeckRoll, deltaTime * 4.0);
      }

      // C. CHEST / UPPER SPINE BONE — subtle torso lean (max ~2.0 degrees)
      if (this.chestBone) {
        const targetChestYaw = this.chestBaseRot.y + px * 0.035;
        const targetChestPitch = this.chestBaseRot.x - py * 0.025 + breathChest;
        const targetChestRoll = this.chestBaseRot.z - px * 0.015;

        this.chestBone.rotation.y = THREE.MathUtils.lerp(this.chestBone.rotation.y, targetChestYaw, deltaTime * 3.5);
        this.chestBone.rotation.x = THREE.MathUtils.lerp(this.chestBone.rotation.x, targetChestPitch, deltaTime * 3.5);
        this.chestBone.rotation.z = THREE.MathUtils.lerp(this.chestBone.rotation.z, targetChestRoll, deltaTime * 3.5);
      }

      // D. LOWER SPINE BONE — very subtle foundation curvature (max ~1.1 degrees)
      if (this.spineBone) {
        const targetSpineYaw = this.spineBaseRot.y + px * 0.020;
        const targetSpinePitch = this.spineBaseRot.x - py * 0.015;
        const targetSpineRoll = this.spineBaseRot.z - px * 0.010;

        this.spineBone.rotation.y = THREE.MathUtils.lerp(this.spineBone.rotation.y, targetSpineYaw, deltaTime * 3.0);
        this.spineBone.rotation.x = THREE.MathUtils.lerp(this.spineBone.rotation.x, targetSpinePitch, deltaTime * 3.0);
        this.spineBone.rotation.z = THREE.MathUtils.lerp(this.spineBone.rotation.z, targetSpineRoll, deltaTime * 3.0);
      }

      // E. HIPS / PELVIS BONE — minimal weight shift (max ~0.6 degrees)
      if (this.hipsBone) {
        const targetHipsYaw = this.hipsBaseRot.y + px * 0.012;
        const targetHipsPosX = this.hipsBasePos.x + px * 0.008;

        this.hipsBone.rotation.y = THREE.MathUtils.lerp(this.hipsBone.rotation.y, targetHipsYaw, deltaTime * 2.5);
        this.hipsBone.position.x = THREE.MathUtils.lerp(this.hipsBone.position.x, targetHipsPosX, deltaTime * 2.5);
      }
    }

    // 3. Spin Hand Speaker Fan Turbines (preserved)
    if (this.fanSpinning) {
      const rotDelta = this.fanSpeed * this.speakingBoost * deltaTime;
      if (this.leftFan) {
        this.leftFan.rotation.z += rotDelta;
      }
      if (this.rightFan) {
        this.rightFan.rotation.z += rotDelta;
      }
    }
  }
}

export const animationController = new AnimationController();

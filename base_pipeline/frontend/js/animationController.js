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

    // Speaking state flag
    this.isSpeaking = false;
    this.speakingBoost = 1.0;

    // Head bone for level straight-ahead alignment
    this.headBone = null;

    // Hand speaker fan turbines
    this.leftFan = null;
    this.rightFan = null;
    this.fanSpinning = true;
    this.fanSpeed = 20.0; // Radians per second
  }

  init(model, animations) {
    this.model = model;
    this.mixer = new THREE.AnimationMixer(model);
    this.clips = animations || [];

    // Find and map animation clips
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

    // Locate Head Bone
    model.traverse((child) => {
      if (child.isBone) {
        const name = child.name;
        if (name.includes('Head_09') || name.toLowerCase().includes('head')) {
          this.headBone = child;
        }
      }
    });

    // Locate Left and Right Fan Turbine assemblies
    this.leftFan = model.getObjectByName('Plane004') || model.getObjectByName('Plane004_Metal_0') || model.getObjectByName('Plane.004');
    this.rightFan = model.getObjectByName('Plane') || model.getObjectByName('Plane_Metal_0');

    // Play default natural animation clip
    if (this.clips.length > 0) {
      this.playClip(this.clips[0].name);
    }
  }

  setSpeakingState(isSpeaking) {
    this.isSpeaking = !!isSpeaking;
    this.speakingBoost = this.isSpeaking ? 2.2 : 1.0;

    if (this.currentAction) {
      if (this.isSpeaking) {
        // FREEZE in the fixed, perfectly straight upright standing frame (0 movement, 0 turning, 0 sway)
        this.currentAction.time = 0.05;
        this.currentAction.paused = true;
        if (this.mixer) {
          this.mixer.update(0);
        }
      } else {
        // RESUME idle animation smoothly
        this.currentAction.paused = false;
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
    if (this.isSpeaking) {
      // SPEAKING STATE: Body is completely still and straight, TV head is locked 100% horizontal & level
      if (this.headBone) {
        this.headBone.rotation.set(0, 0, 0);
      }
    } else {
      // IDLE STATE: Normal skeletal animation playback
      if (this.mixer && !this.isPaused) {
        this.mixer.update(deltaTime);
      }

      // Subtle natural look-at parallax when in idle
      if (this.headBone && pointerNormalized) {
        this.headBone.rotation.y = THREE.MathUtils.lerp(
          this.headBone.rotation.y,
          pointerNormalized.x * 0.25,
          deltaTime * 3
        );
        this.headBone.rotation.x = THREE.MathUtils.lerp(
          this.headBone.rotation.x,
          -pointerNormalized.y * 0.18,
          deltaTime * 3
        );
        this.headBone.rotation.z = THREE.MathUtils.lerp(this.headBone.rotation.z, 0, deltaTime * 6);
      }
    }

    // Spin Hand Speaker Fan Turbines (faster during speech)
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

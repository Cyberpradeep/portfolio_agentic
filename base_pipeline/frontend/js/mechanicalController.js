import * as THREE from 'three';
import { soundFX } from './soundFx.js';

export const ClawModes = {
  STOWED: 'STOWED',
  DEPLOYED: 'DEPLOYED',
  PINCER_STRIKE: 'PINCER_STRIKE',
  WING_SHIELD: 'WING_SHIELD'
};

export const HandPoses = {
  RELAXED: 'RELAXED',
  COMBAT_FIST: 'COMBAT_FIST',
  CLAW_GRASP: 'CLAW_GRASP',
  POINT: 'POINT'
};

export class MechanicalController {
  constructor() {
    this.model = null;

    // 1. Giant Back Claws
    this.leftClaw = null;
    this.rightClaw = null;
    this.clawMode = ClawModes.STOWED;
    this.clawAnimTime = 0;
    this.leftClawInitialRot = new THREE.Euler();
    this.rightClawInitialRot = new THREE.Euler();

    // 2. Subwoofer Pure Acoustic Vibrator
    this.subwooferDrivers = [];
    this.chestLightMaterial = null;
    this.bassPulseActive = true;
    this.bassBPM = 120;
    this.bassPhase = 0;
    this.voiceIntensity = 0;
    this.voiceIntensitySmoothed = 0;

    // 3. Shoulder Satellite TVs
    this.shoulderTVs = [];
    this.shoulderTracking = true;

    // 4. Hand Finger Joints
    this.leftFingerBones = [];
    this.rightFingerBones = [];
    this.currentHandPose = HandPoses.RELAXED;
  }

  init(model) {
    this.model = model;

    // 1. Locate Giant Back Claws
    this.leftClaw = model.getObjectByName('melee') || model.getObjectByName('melee_Claw_0');
    this.rightClaw = model.getObjectByName('melee001') || model.getObjectByName('melee001_Claw_0');

    if (this.leftClaw) {
      this.leftClawInitialRot.copy(this.leftClaw.rotation);
    }
    if (this.rightClaw) {
      this.rightClawInitialRot.copy(this.rightClaw.rotation);
    }

    // 2. Locate Chest 9-Speaker Driver Grid and Forearm Membranes
    this.subwooferDrivers = [];
    model.traverse((child) => {
      if (child.isMesh) {
        const name = child.name;
        if (name.includes('doof_speakerdark_0') || name.includes('doof_speakerlight_0')) {
          this.subwooferDrivers.push({
            mesh: child,
            initialScale: child.scale.clone(),
            isChest: true
          });
          if (name.includes('doof_speakerlight_0') && child.material) {
            this.chestLightMaterial = child.material;
            if (!child.material.emissive) {
              child.material.emissive = new THREE.Color(0x000000);
            }
          }
        } else if (name.includes('membrane') || name.includes('pierscienczarn')) {
          this.subwooferDrivers.push({
            mesh: child,
            initialScale: child.scale.clone(),
            isChest: false
          });
        }
      }
    });

    // 3. Locate Shoulder Satellite TVs
    this.shoulderTVs = [];
    model.traverse((child) => {
      if (child.name === 'tv.L_0114' || child.name === 'tv.L.001_0140') {
        this.shoulderTVs.push({
          obj: child,
          initialRot: child.rotation.clone()
        });
      }
    });

    // 4. Locate Finger Bones
    this.leftFingerBones = [];
    this.rightFingerBones = [];
    model.traverse((child) => {
      if (child.isBone) {
        const nLow = child.name.toLowerCase();
        if (nLow.includes('lefthandthumb') || nLow.includes('lefthandindex') || nLow.includes('lefthandmiddle') || nLow.includes('lefthandring') || nLow.includes('lefthandpinky')) {
          this.leftFingerBones.push(child);
        } else if (nLow.includes('righthandthumb') || nLow.includes('righthandindex') || nLow.includes('righthandmiddle') || nLow.includes('righthandring') || nLow.includes('righthandpinky')) {
          this.rightFingerBones.push(child);
        }
      }
    });
  }

  setClawMode(mode) {
    this.clawMode = mode;
  }

  setVoiceIntensity(val) {
    this.voiceIntensity = Math.min(1, Math.max(0, val));
  }

  setBassPulse(active) {
    this.bassPulseActive = active;
    if (!active) {
      this.subwooferDrivers.forEach(item => {
        item.mesh.scale.copy(item.initialScale);
      });
      if (this.chestLightMaterial && this.chestLightMaterial.emissive) {
        this.chestLightMaterial.emissive.setHex(0x000000);
      }
    }
    return this.bassPulseActive;
  }

  setBassBPM(bpm) {
    this.bassBPM = bpm;
  }

  update(deltaTime, pointerNormalized) {
    this.clawAnimTime += deltaTime;

    // 1. Back Claws Interpolation
    if (this.leftClaw && this.rightClaw) {
      let targetRotL = this.leftClawInitialRot.clone();
      let targetRotR = this.rightClawInitialRot.clone();

      if (this.clawMode === ClawModes.DEPLOYED) {
        targetRotL.x += 0.85;
        targetRotL.z += 0.45;
        targetRotR.x += 0.85;
        targetRotR.z -= 0.45;
      } else if (this.clawMode === ClawModes.PINCER_STRIKE) {
        const strikeOffset = Math.sin(this.clawAnimTime * 8) * 0.15;
        targetRotL.x += 1.45 + strikeOffset;
        targetRotL.y -= 0.65;
        targetRotR.x += 1.45 + strikeOffset;
        targetRotR.y += 0.65;
      } else if (this.clawMode === ClawModes.WING_SHIELD) {
        targetRotL.x += 0.4;
        targetRotL.y -= 1.1;
        targetRotL.z += 0.6;
        targetRotR.x += 0.4;
        targetRotR.y += 1.1;
        targetRotR.z -= 0.6;
      }

      this.leftClaw.rotation.x = THREE.MathUtils.lerp(this.leftClaw.rotation.x, targetRotL.x, deltaTime * 5);
      this.leftClaw.rotation.y = THREE.MathUtils.lerp(this.leftClaw.rotation.y, targetRotL.y, deltaTime * 5);
      this.leftClaw.rotation.z = THREE.MathUtils.lerp(this.leftClaw.rotation.z, targetRotL.z, deltaTime * 5);

      this.rightClaw.rotation.x = THREE.MathUtils.lerp(this.rightClaw.rotation.x, targetRotR.x, deltaTime * 5);
      this.rightClaw.rotation.y = THREE.MathUtils.lerp(this.rightClaw.rotation.y, targetRotR.y, deltaTime * 5);
      this.rightClaw.rotation.z = THREE.MathUtils.lerp(this.rightClaw.rotation.z, targetRotR.z, deltaTime * 5);
    }

    // 2. Subwoofer Pure Acoustic Vibrations (Active ONLY during live speech)
    this.voiceIntensitySmoothed = THREE.MathUtils.lerp(
      this.voiceIntensitySmoothed,
      this.voiceIntensity,
      deltaTime * 18
    );

    const isActivelySpeaking = this.bassPulseActive && this.voiceIntensitySmoothed > 0.015;

    if (isActivelySpeaking && this.subwooferDrivers.length > 0) {
      // Rapid acoustic flutter vibration synced to voice
      this.bassPhase += deltaTime * 42.0;
      const acousticOsc = Math.sin(this.bassPhase) * 0.5 + 0.5;
      const pulseMagnitude = this.voiceIntensitySmoothed * (0.65 + acousticOsc * 0.35);

      this.subwooferDrivers.forEach(item => {
        if (!item.mesh || item.mesh.visible === false) return;
        // Tightly reduced pumping radius for chest speaker (subtle, tight, non-distended)
        const xyExpansion = 1.0 + (pulseMagnitude * (item.isChest ? 0.022 : 0.038));
        const zExcursion = 1.0 + (pulseMagnitude * (item.isChest ? 0.045 : 0.075));

        item.mesh.scale.set(
          item.initialScale.x * xyExpansion,
          item.initialScale.y * xyExpansion,
          item.initialScale.z * zExcursion
        );
      });

      if (this.chestLightMaterial && this.chestLightMaterial.emissive) {
        const pulseR = pulseMagnitude * 0.3;
        this.chestLightMaterial.emissive.setRGB(pulseR, pulseR * 0.15, pulseR * 0.06);
      }
    } else {
      // Return smoothly to resting static scale when NOT speaking (zero idle vibration)
      if (this.subwooferDrivers.length > 0) {
        this.subwooferDrivers.forEach(item => {
          if (!item.mesh || item.mesh.visible === false) return;
          item.mesh.scale.lerp(item.initialScale, deltaTime * 14);
        });
      }
      if (this.chestLightMaterial && this.chestLightMaterial.emissive) {
        this.chestLightMaterial.emissive.lerp(new THREE.Color(0x000000), deltaTime * 14);
      }
    }

    // 3. Shoulder Satellite TVs tracking
    if (this.shoulderTracking && pointerNormalized && this.shoulderTVs.length > 0) {
      this.shoulderTVs.forEach(tv => {
        tv.obj.rotation.y = tv.initialRot.y + pointerNormalized.x * 0.22;
        tv.obj.rotation.x = tv.initialRot.x - pointerNormalized.y * 0.15;
      });
    }
  }
}

export const mechanicalController = new MechanicalController();

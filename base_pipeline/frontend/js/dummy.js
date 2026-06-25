import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { VRMLoaderPlugin, VRMUtils, VRMHumanBoneName } from "@pixiv/three-vrm";
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from "@pixiv/three-vrm-animation";

const MODEL_URL = "/static/model/portfolio.vrm";
const MODEL_YAW = Math.PI;
const ANIMATIONS_BASE_URL = "/static/animations";
const VRMA_FILES = {
    Angry: "Angry.vrma",
    Blush: "Blush.vrma",
    Clapping: "Clapping.vrma",
    Goodbye: "Goodbye.vrma",
    Jump: "Jump.vrma",
    LookAround: "LookAround.vrma",
    Relax: "Relax.vrma",
    Sad: "Sad.vrma",
    Sleepy: "Sleepy.vrma",
    Surprised: "Surprised.vrma",
    Thinking: "Thinking.vrma",
};

const STATE_ANIMS = {
    listening: "LookAround",
    thinking: "Thinking",
};

const IDLE_SEQUENCE = [
    "LookAround",
    "Thinking",
    "Sad",
    "Angry",
    "LookAround",
    "Thinking",
    "Blush",
    "Thinking",
];
const IDLE_INITIAL_DELAY_RANGE = [0, 0];
const IDLE_GAP_SECONDS = 0;
const IDLE_FADE_SECONDS = 0.6;
const IDLE_TIME_SCALE = 0.7;
const IDLE_TRANSITION_SCALE = 0.45;
const IDLE_TRANSITION_RAMP_SECONDS = 0.8;
const IDLE_HOLD_SECONDS = 0;

const state = {
    mode: "idle",
    isSpeaking: false,
};

let renderer;
let scene;
let camera;
let controls;
let clock;
let statusEl;

let currentVrm;
let mixer;
let currentAction;
let animationGroup;
let timeScaleRamp = null;

let idleSequenceTimer = null;
let idleSequenceIndex = 0;

const rig = {
    head: null,
    neck: null,
    spine: null,
    lUpper: null,
    rUpper: null,
    lLower: null,
    rLower: null,
    lHand: null,
    rHand: null,
    lIndex: [],
    lMiddle: [],
    lRing: [],
    lLittle: [],
    lThumb: [],
    rIndex: [],
    rMiddle: [],
    rRing: [],
    rLittle: [],
    rThumb: [],
};
const baseRotations = new Map();
let manualReady = false;
let lipPhase = 0;

function setStatus(text) {
    if (statusEl) {
        statusEl.textContent = text;
    }
}

function stopCurrentAction() {
    if (mixer) {
        mixer.stopAllAction();
    }
    currentAction = null;
}

function clearIdleSequence() {
    if (idleSequenceTimer) {
        clearTimeout(idleSequenceTimer);
        idleSequenceTimer = null;
    }
}

function scheduleIdleStep(delaySeconds) {
    clearIdleSequence();
    idleSequenceTimer = setTimeout(runIdleStep, delaySeconds * 1000);
}

function runIdleStep() {
    if (!mixer || animationClips.size === 0) {
        return;
    }

    const name = IDLE_SEQUENCE[idleSequenceIndex % IDLE_SEQUENCE.length];
    idleSequenceIndex += 1;

    const clip = animationClips.get(name);
    if (!clip) {
        scheduleIdleStep(IDLE_GAP_SECONDS);
        return;
    }

    playClip(name, {
        loop: THREE.LoopOnce,
        fadeSeconds: IDLE_FADE_SECONDS,
        timeScale: IDLE_TIME_SCALE,
        startTimeScale: IDLE_TRANSITION_SCALE,
        rampDuration: IDLE_TRANSITION_RAMP_SECONDS,
        clampWhenFinished: false,
    });
    animationGroup = "idle";
    const clipDuration = clip.duration / IDLE_TIME_SCALE;
    const nextDelay = Math.max(clipDuration - IDLE_FADE_SECONDS * 1.2, 0.2) + IDLE_HOLD_SECONDS + IDLE_GAP_SECONDS;
    scheduleIdleStep(nextDelay);
}

function startIdleSequence() {
    if (idleSequenceTimer) {
        return;
    }
    idleSequenceIndex = 0;
    const [minDelay, maxDelay] = IDLE_INITIAL_DELAY_RANGE;
    const delay = minDelay + Math.random() * (maxDelay - minDelay);
    if (delay <= 0) {
        runIdleStep();
        return;
    }
    scheduleIdleStep(delay);
}

function playClip(name, options = {}) {
    const clip = animationClips.get(name);
    if (!clip || !mixer) {
        return;
    }

    const nextAction = mixer.clipAction(clip);
    if (currentAction === nextAction) {
        return;
    }

    const fadeSeconds = typeof options.fadeSeconds === "number" ? options.fadeSeconds : 0.25;

    nextAction.reset();
    nextAction.setLoop(options.loop || THREE.LoopRepeat, Infinity);
    const clamp = typeof options.clampWhenFinished === "boolean" ? options.clampWhenFinished : true;
    nextAction.clampWhenFinished = clamp;
    const startScale = typeof options.startTimeScale === "number" ? options.startTimeScale : options.timeScale;
    if (typeof startScale === "number") {
        nextAction.timeScale = startScale;
    }
    if (currentAction) {
        nextAction.crossFadeFrom(currentAction, fadeSeconds, false);
    } else {
        nextAction.fadeIn(fadeSeconds);
    }
    nextAction.play();

    currentAction = nextAction;

    if (typeof options.rampDuration === "number" && typeof options.timeScale === "number") {
        const startTime = clock ? clock.getElapsedTime() : 0;
        timeScaleRamp = {
            action: nextAction,
            startScale: typeof startScale === "number" ? startScale : options.timeScale,
            endScale: options.timeScale,
            startTime,
            duration: Math.max(options.rampDuration, 0.01),
        };
    }
}

function updateTimeScaleRamp(elapsed) {
    if (!timeScaleRamp || !timeScaleRamp.action) {
        return;
    }
    if (timeScaleRamp.action !== currentAction) {
        timeScaleRamp = null;
        return;
    }
    const t = (elapsed - timeScaleRamp.startTime) / timeScaleRamp.duration;
    if (t >= 1) {
        timeScaleRamp.action.timeScale = timeScaleRamp.endScale;
        timeScaleRamp = null;
        return;
    }
    const scale = timeScaleRamp.startScale + (timeScaleRamp.endScale - timeScaleRamp.startScale) * Math.max(0, t);
    timeScaleRamp.action.timeScale = scale;
}

function updateAnimationState() {
    if (!mixer || animationClips.size === 0) {
        return;
    }

    const group = state.isSpeaking ? "speaking" : state.mode;

    if (group === "speaking") {
        if (animationGroup !== "speaking") {
            clearIdleSequence();
            stopCurrentAction();
            animationGroup = "speaking";
        }
        return;
    }

    if (group === "idle") {
        if (animationGroup !== "idle") {
            stopCurrentAction();
            animationGroup = "idle";
        }
        startIdleSequence();
        return;
    }

    const clipName = STATE_ANIMS[group];
    if (clipName && animationGroup !== group) {
        clearIdleSequence();
        playClip(clipName, { loop: THREE.LoopRepeat, fadeSeconds: IDLE_FADE_SECONDS });
        animationGroup = group;
    }
}

function getHumanoidBone(vrm, name) {
    if (!vrm || !vrm.humanoid) {
        return null;
    }
    if (!name) {
        return null;
    }
    return vrm.humanoid.getNormalizedBoneNode?.(name) || vrm.humanoid.getBoneNode?.(name) || null;
}

function findBoneByName(root, names) {
    if (!root) {
        return null;
    }
    const targets = names.map((n) => n.toLowerCase());
    let found = null;
    root.traverse((obj) => {
        if (found || !obj.isBone) {
            return;
        }
        const low = obj.name.toLowerCase();
        if (targets.some((key) => low.includes(key))) {
            found = obj;
        }
    });
    return found;
}

function resolveBone(vrm, root, humanoidName, fallbackNames) {
    return getHumanoidBone(vrm, humanoidName) || findBoneByName(root, fallbackNames);
}

function saveBaseRotation(bone) {
    if (bone) {
        baseRotations.set(bone, bone.rotation.clone());
    }
}

function applyBoneOffset(bone, x, y, z) {
    const base = baseRotations.get(bone);
    if (!bone || !base) {
        return;
    }
    bone.rotation.set(base.x + x, base.y + y, base.z + z);
}

function setupManualRig(vrm) {
    const root = vrm?.scene;
    rig.head = resolveBone(vrm, root, VRMHumanBoneName.Head, ["j_bip_c_head", "head"]);
    rig.neck = resolveBone(vrm, root, VRMHumanBoneName.Neck, ["j_bip_c_neck", "neck"]);
    rig.spine =
        resolveBone(vrm, root, VRMHumanBoneName.UpperChest, ["j_bip_c_upperchest", "upperchest"]) ||
        resolveBone(vrm, root, VRMHumanBoneName.Chest, ["j_bip_c_chest", "chest"]) ||
        resolveBone(vrm, root, VRMHumanBoneName.Spine, ["j_bip_c_spine", "spine"]);
    rig.lUpper = resolveBone(vrm, root, VRMHumanBoneName.LeftUpperArm, ["j_bip_l_upperarm", "leftupperarm"]);
    rig.rUpper = resolveBone(vrm, root, VRMHumanBoneName.RightUpperArm, ["j_bip_r_upperarm", "rightupperarm"]);
    rig.lLower = resolveBone(vrm, root, VRMHumanBoneName.LeftLowerArm, ["j_bip_l_lowerarm", "leftlowerarm"]);
    rig.rLower = resolveBone(vrm, root, VRMHumanBoneName.RightLowerArm, ["j_bip_r_lowerarm", "rightlowerarm"]);
    rig.lHand = resolveBone(vrm, root, VRMHumanBoneName.LeftHand, ["j_bip_l_hand", "lefthand"]);
    rig.rHand = resolveBone(vrm, root, VRMHumanBoneName.RightHand, ["j_bip_r_hand", "righthand"]);

    rig.lIndex = [
        resolveBone(vrm, root, VRMHumanBoneName.LeftIndexProximal, ["j_bip_l_index1", "index1_l"]),
        resolveBone(vrm, root, VRMHumanBoneName.LeftIndexIntermediate, ["j_bip_l_index2", "index2_l"]),
    ].filter(Boolean);
    rig.rIndex = [
        resolveBone(vrm, root, VRMHumanBoneName.RightIndexProximal, ["j_bip_r_index1", "index1_r"]),
        resolveBone(vrm, root, VRMHumanBoneName.RightIndexIntermediate, ["j_bip_r_index2", "index2_r"]),
    ].filter(Boolean);

    rig.lMiddle = [
        resolveBone(vrm, root, VRMHumanBoneName.LeftMiddleProximal, ["j_bip_l_middle1", "middle1_l"]),
        resolveBone(vrm, root, VRMHumanBoneName.LeftMiddleIntermediate, ["j_bip_l_middle2", "middle2_l"]),
    ].filter(Boolean);
    rig.rMiddle = [
        resolveBone(vrm, root, VRMHumanBoneName.RightMiddleProximal, ["j_bip_r_middle1", "middle1_r"]),
        resolveBone(vrm, root, VRMHumanBoneName.RightMiddleIntermediate, ["j_bip_r_middle2", "middle2_r"]),
    ].filter(Boolean);

    rig.lRing = [
        resolveBone(vrm, root, VRMHumanBoneName.LeftRingProximal, ["j_bip_l_ring1", "ring1_l"]),
        resolveBone(vrm, root, VRMHumanBoneName.LeftRingIntermediate, ["j_bip_l_ring2", "ring2_l"]),
    ].filter(Boolean);
    rig.rRing = [
        resolveBone(vrm, root, VRMHumanBoneName.RightRingProximal, ["j_bip_r_ring1", "ring1_r"]),
        resolveBone(vrm, root, VRMHumanBoneName.RightRingIntermediate, ["j_bip_r_ring2", "ring2_r"]),
    ].filter(Boolean);

    rig.lLittle = [
        resolveBone(vrm, root, VRMHumanBoneName.LeftLittleProximal, ["j_bip_l_little1", "little1_l"]),
        resolveBone(vrm, root, VRMHumanBoneName.LeftLittleIntermediate, ["j_bip_l_little2", "little2_l"]),
    ].filter(Boolean);
    rig.rLittle = [
        resolveBone(vrm, root, VRMHumanBoneName.RightLittleProximal, ["j_bip_r_little1", "little1_r"]),
        resolveBone(vrm, root, VRMHumanBoneName.RightLittleIntermediate, ["j_bip_r_little2", "little2_r"]),
    ].filter(Boolean);

    rig.lThumb = [
        resolveBone(vrm, root, VRMHumanBoneName.LeftThumbProximal, ["j_bip_l_thumb1", "thumb1_l"]),
        resolveBone(vrm, root, VRMHumanBoneName.LeftThumbDistal, ["j_bip_l_thumb2", "thumb2_l"]),
    ].filter(Boolean);
    rig.rThumb = [
        resolveBone(vrm, root, VRMHumanBoneName.RightThumbProximal, ["j_bip_r_thumb1", "thumb1_r"]),
        resolveBone(vrm, root, VRMHumanBoneName.RightThumbDistal, ["j_bip_r_thumb2", "thumb2_r"]),
    ].filter(Boolean);

    Object.values(rig).forEach((value) => {
        if (Array.isArray(value)) {
            value.forEach(saveBaseRotation);
            return;
        }
        saveBaseRotation(value);
    });
    manualReady = true;
}

function setFinger(bones, curl, spreadZ, noise) {
    if (bones[0]) {
        applyBoneOffset(bones[0], curl * 0.4 + noise, 0, spreadZ);
    }
    if (bones[1]) {
        applyBoneOffset(bones[1], curl * 0.35 + noise * 0.5, 0, 0);
    }
}

function applyFingers(curlL, curlR, spread, noise) {
    setFinger(rig.lIndex, curlL + Math.sin(noise * 1.1) * 0.04, spread * 0.06, noise * 0.03);
    setFinger(rig.lMiddle, curlL + Math.sin(noise * 0.8) * 0.04, spread * 0.02, noise * 0.02);
    setFinger(rig.lRing, curlL + Math.sin(noise * 1.3) * 0.04, -spread * 0.02, noise * 0.02);
    setFinger(rig.lLittle, curlL + Math.sin(noise * 0.6) * 0.06, -spread * 0.07, noise * 0.04);
    setFinger(rig.lThumb, curlL * 0.3, -spread * 0.05, -noise * 0.02);

    setFinger(rig.rIndex, curlR + Math.sin(noise * 1.1) * 0.04, -spread * 0.06, -noise * 0.03);
    setFinger(rig.rMiddle, curlR + Math.sin(noise * 0.8) * 0.04, -spread * 0.02, -noise * 0.02);
    setFinger(rig.rRing, curlR + Math.sin(noise * 1.3) * 0.04, spread * 0.02, -noise * 0.02);
    setFinger(rig.rLittle, curlR + Math.sin(noise * 0.6) * 0.06, spread * 0.07, -noise * 0.04);
    setFinger(rig.rThumb, curlR * 0.3, spread * 0.05, noise * 0.02);
}

function resetPose() {
    if (!currentVrm || !currentVrm.humanoid) {
        return;
    }
    if (typeof currentVrm.humanoid.resetRawPose === "function") {
        currentVrm.humanoid.resetRawPose();
        return;
    }
    if (typeof currentVrm.humanoid.resetNormalizedPose === "function") {
        currentVrm.humanoid.resetNormalizedPose();
        return;
    }
    currentVrm.humanoid.resetPose();
}

function applyRestPose(elapsed) {
    if (!manualReady) {
        return;
    }
    resetPose();
    const sway = Math.sin(elapsed * 0.8) * 0.02;
    applyBoneOffset(rig.lUpper, 0.18 + sway, 0, 0.35);
    applyBoneOffset(rig.rUpper, 0.18 - sway, 0, -0.35);
    applyBoneOffset(rig.lLower, 0.22, 0, 0.12);
    applyBoneOffset(rig.rLower, 0.22, 0, -0.12);
    applyBoneOffset(rig.lHand, 0.05, 0, 0.04);
    applyBoneOffset(rig.rHand, 0.05, 0, -0.04);
    applyBoneOffset(rig.head, Math.sin(elapsed * 0.9) * 0.02, Math.sin(elapsed * 0.6) * 0.03, 0);
    applyBoneOffset(rig.neck, Math.sin(elapsed * 0.7) * 0.01, 0, 0);
}

function applySpeakingPose(elapsed) {
    if (!manualReady) {
        return;
    }
    resetPose();
    const beat = Math.sin(elapsed * 5.2);
    const pulse = Math.sin(elapsed * 7.6);
    applyBoneOffset(rig.head, 0.05 + beat * 0.04, Math.sin(elapsed * 1.1) * 0.05, 0);
    applyBoneOffset(rig.neck, beat * 0.02, Math.sin(elapsed * 1.1) * 0.03, 0);
    applyBoneOffset(rig.spine, Math.sin(elapsed * 1.0) * 0.02, 0, 0);
    applyBoneOffset(rig.lUpper, 0.32 + Math.max(0, beat) * 0.06, 0, 0.4 - Math.max(0, beat) * 0.06);
    applyBoneOffset(rig.rUpper, 0.32 + Math.max(0, pulse) * 0.06, 0, -0.4 + Math.max(0, pulse) * 0.06);
    applyBoneOffset(rig.lLower, 0.35 + pulse * 0.06, beat * 0.03, 0.08 + beat * 0.03);
    applyBoneOffset(rig.rLower, 0.35 + beat * 0.06, pulse * 0.03, -0.08 - pulse * 0.03);
    applyBoneOffset(rig.lHand, beat * 0.05, pulse * 0.04, 0.04 + pulse * 0.02);
    applyBoneOffset(rig.rHand, pulse * 0.05, beat * 0.04, -0.04 - beat * 0.02);

    const curlL = 0.28 - Math.max(0, beat) * 0.12;
    const curlR = 0.28 - Math.max(0, pulse) * 0.12;
    applyFingers(curlL, curlR, 0.16, beat * 0.2);
}

function setExpression(name, value) {
    if (!currentVrm || !currentVrm.expressionManager) {
        return;
    }
    currentVrm.expressionManager.setValue(name, value);
}

function updateLipSync(dt) {
    if (!currentVrm || !currentVrm.expressionManager) {
        return;
    }

    if (!state.isSpeaking) {
        setExpression("aa", 0);
        setExpression("ih", 0);
        setExpression("ou", 0);
        setExpression("ee", 0);
        setExpression("oh", 0);
        return;
    }

    lipPhase += dt * 9.0;
    const a = Math.max(0, Math.sin(lipPhase * 1.0)) * 0.75;
    const i = Math.max(0, Math.sin(lipPhase * 1.33 + 1.2)) * 0.55;
    const u = Math.max(0, Math.sin(lipPhase * 0.72 + 2.4)) * 0.5;
    const e = Math.max(0, Math.sin(lipPhase * 1.6 + 0.8)) * 0.45;
    const o = Math.max(0, Math.sin(lipPhase * 0.92 + 3.0)) * 0.6;

    setExpression("aa", a);
    setExpression("ih", i);
    setExpression("ou", u);
    setExpression("ee", e);
    setExpression("oh", o);
}

function frameModel(object3d) {
    object3d.updateWorldMatrix(true, true);
    const initialBox = new THREE.Box3().setFromObject(object3d);
    if (initialBox.isEmpty()) {
        return;
    }

    const initialSize = initialBox.getSize(new THREE.Vector3());
    const maxDim = Math.max(initialSize.x, initialSize.y, initialSize.z);
    const targetSize = 2.0;
    const scale = targetSize / maxDim;
    object3d.scale.setScalar(scale);

    object3d.updateWorldMatrix(true, true);
    const scaledBox = new THREE.Box3().setFromObject(object3d);
    const center = scaledBox.getCenter(new THREE.Vector3());

    object3d.position.x -= center.x;
    object3d.position.y -= scaledBox.min.y;
    object3d.position.z -= center.z;

    object3d.updateWorldMatrix(true, true);
    const finalBox = new THREE.Box3().setFromObject(object3d);
    const sphere = finalBox.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 0.5);
    const fitDist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov * 0.5));

    camera.near = Math.max(0.01, fitDist / 100);
    camera.far = fitDist * 100;
    camera.updateProjectionMatrix();

    camera.position.set(fitDist * 0.6, fitDist * 0.35, fitDist * 0.9);
    controls.target.set(0, radius * 0.5, 0);
    controls.maxDistance = fitDist * 20;
    controls.update();
}

async function loadVrm(loader) {
    return new Promise((resolve, reject) => {
        loader.load(
            MODEL_URL,
            (gltf) => {
                const vrm = gltf.userData.vrm;
                if (!vrm) {
                    reject(new Error("VRM data missing"));
                    return;
                }

                VRMUtils.removeUnnecessaryVertices(gltf.scene);
                VRMUtils.combineSkeletons(gltf.scene);
                VRMUtils.combineMorphs(vrm);

                vrm.scene.traverse((obj) => {
                    obj.frustumCulled = false;
                });

                if (currentVrm) {
                    scene.remove(currentVrm.scene);
                    currentVrm.dispose();
                }

                currentVrm = vrm;
                currentVrm.scene.rotation.y = MODEL_YAW;
                scene.add(currentVrm.scene);
                frameModel(currentVrm.scene);

                mixer = new THREE.AnimationMixer(currentVrm.scene);
                setupManualRig(currentVrm);
                resolve(currentVrm);
            },
            undefined,
            (error) => {
                reject(error);
            }
        );
    });
}

async function loadVrmaClip(loader, name, url) {
    return new Promise((resolve, reject) => {
        loader.load(
            url,
            (gltf) => {
                const vrmAnimation = gltf.userData.vrmAnimations && gltf.userData.vrmAnimations[0];
                if (!vrmAnimation) {
                    reject(new Error(`VRMA data missing for ${name}`));
                    return;
                }
                const clip = createVRMAnimationClip(vrmAnimation, currentVrm);
                if (!clip) {
                    reject(new Error(`Failed to build clip for ${name}`));
                    return;
                }
                animationClips.set(name, clip);
                resolve(clip);
            },
            undefined,
            (error) => {
                reject(error);
            }
        );
    });
}

const animationClips = new Map();

async function loadAnimations(loader) {
    const entries = Object.entries(VRMA_FILES);
    for (const [name, file] of entries) {
        const url = `${ANIMATIONS_BASE_URL}/${file}`;
        try {
            await loadVrmaClip(loader, name, url);
        } catch (error) {
            console.warn(`[Avatar] VRMA load failed: ${name}`, error);
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const elapsed = clock.getElapsedTime();

    if (state.isSpeaking) {
        applySpeakingPose(elapsed);
    }

    updateLipSync(delta);
    updateTimeScaleRamp(elapsed);

    if (mixer) {
        mixer.update(delta);
    }
    if (currentVrm) {
        currentVrm.update(delta);
    }

    controls.update();
    renderer.render(scene, camera);
}

async function initAvatar(canvasId, statusId) {
    const canvas = document.getElementById(canvasId);
    statusEl = document.getElementById(statusId);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf7f7f5);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 200);
    camera.position.set(1.8, 1.3, 2.6);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 1, 0);

    const hemi = new THREE.HemisphereLight(0xffffff, 0xefece7, 1.0);
    scene.add(hemi);

    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(3, 6, 3);
    key.castShadow = true;
    scene.add(key);

    clock = new THREE.Clock();

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

    try {
        setStatus("Avatar: loading model");
        await loadVrm(loader);
        setStatus("Avatar: loading animations");
        await loadAnimations(loader);
        setStatus("Avatar: idle");
        updateAnimationState();
    } catch (error) {
        setStatus("Avatar load failed");
        console.error(error);
    }

    window.addEventListener("resize", () => {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    });

    animate();
}

function setAvatarState(nextState) {
    state.mode = nextState;
    setStatus(`Avatar: ${nextState}`);
    updateAnimationState();
}

function setSpeaking(active) {
    state.isSpeaking = active;
    if (!active) {
        lipPhase = 0;
    }
    if (active) {
        setStatus("Avatar: speaking");
    }
    updateAnimationState();
}

window.AvatarController = {
    initAvatar,
    setAvatarState,
    setSpeaking,
};

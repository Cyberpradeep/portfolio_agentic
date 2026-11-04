import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * Locomotive-Style Photorealistic TV Character
 * 
 * Features matching locomotive.ca/en/contact:
 * 1. Heathered Oatmeal Knit Turtleneck with procedural weave normal mapping & cloth folds
 * 2. Human anatomical neck with warm skin tone visible above the turtleneck collar
 * 3. Brushed silver/white metallic TV cabinet with polished chrome screen rim
 * 4. Hanging black audio jack patch cables draped organically across the neck & shoulders
 * 5. Side circular speaker/audio capsule with coiled cable
 * 6. Self-luminous CRT screen displaying warm glowing eyes & mouth
 * 7. Independent TV head tracking with spring physics; static body
 */
export class ProceduralTvCharacter {
  constructor(tvScreenManager) {
    this.screenManager = tvScreenManager;
    this.root = new THREE.Group();
    this.root.name = 'LocomotiveTvCharacter';

    // Motion state
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.currentYaw = 0;
    this.currentPitch = 0;
    this.baseHeadY = 1.48;
    this.time = 0;
    this.isSpeaking = false;

    this.initTextures();
    this.initMaterials();
    this.buildCharacter();
  }

  initTextures() {
    // 1. Procedural Knit Fabric Normal Map (Micro-weave wool texture)
    const normCanvas = document.createElement('canvas');
    normCanvas.width = 128;
    normCanvas.height = 128;
    const normCtx = normCanvas.getContext('2d');
    const imgData = normCtx.createImageData(128, 128);
    const data = imgData.data;

    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        const i = (y * 128 + x) * 4;
        // Knit ribbing / interlocking loop pattern
        const rib = Math.sin(x * 0.35) * 0.6;
        const cross = Math.sin(y * 0.70 + Math.cos(x * 0.35) * 1.2) * 0.4;
        const nx = (rib + cross * 0.3) * 0.5;
        const ny = cross * 0.5;

        data[i] = Math.floor(128 + nx * 127);     // R (X normal)
        data[i + 1] = Math.floor(128 + ny * 127); // G (Y normal)
        data[i + 2] = 255;                       // B (Z normal)
        data[i + 3] = 255;                       // A
      }
    }
    normCtx.putImageData(imgData, 0, 0);

    this.knitNormalMap = new THREE.CanvasTexture(normCanvas);
    this.knitNormalMap.wrapS = THREE.RepeatWrapping;
    this.knitNormalMap.wrapT = THREE.RepeatWrapping;
    this.knitNormalMap.repeat.set(16, 16);

    // 2. Heathered Wool Melange Texture (Subtle tonal grain)
    const woolCanvas = document.createElement('canvas');
    woolCanvas.width = 256;
    woolCanvas.height = 256;
    const woolCtx = woolCanvas.getContext('2d');
    woolCtx.fillStyle = '#c5bfb6';
    woolCtx.fillRect(0, 0, 256, 256);

    const woolData = woolCtx.getImageData(0, 0, 256, 256);
    for (let p = 0; p < woolData.data.length; p += 4) {
      const noise = (Math.random() - 0.5) * 22;
      woolData.data[p] = Math.min(255, Math.max(0, woolData.data[p] + noise));
      woolData.data[p + 1] = Math.min(255, Math.max(0, woolData.data[p + 1] + noise * 0.9));
      woolData.data[p + 2] = Math.min(255, Math.max(0, woolData.data[p + 2] + noise * 0.8));
    }
    woolCtx.putImageData(woolData, 0, 0);

    this.woolTexture = new THREE.CanvasTexture(woolCanvas);
    this.woolTexture.wrapS = THREE.RepeatWrapping;
    this.woolTexture.wrapT = THREE.RepeatWrapping;
    this.woolTexture.repeat.set(8, 8);
  }

  initMaterials() {
    // 1. Heathered Oatmeal Knit Sweater (Locomotive exact wool aesthetic)
    this.sweaterMaterial = new THREE.MeshStandardMaterial({
      color: 0xc8c2b8,
      map: this.woolTexture,
      normalMap: this.knitNormalMap,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.94,
      metalness: 0.02
    });

    // 2. Human Skin (Warm flesh tone with soft sheen visible at the neck)
    this.skinMaterial = new THREE.MeshStandardMaterial({
      color: 0xdeb89e,
      roughness: 0.62,
      metalness: 0.04
    });

    // 3. TV Chassis (Brushed Silver-White Anodized Metal)
    this.tvCasingMaterial = new THREE.MeshStandardMaterial({
      color: 0xdfdfdb,
      roughness: 0.38,
      metalness: 0.35,
      envMapIntensity: 1.4
    });

    // 4. Polished Chrome Rim (Locomotive outer screen bezel trim)
    this.chromeTrimMaterial = new THREE.MeshStandardMaterial({
      color: 0xf5f7fa,
      roughness: 0.12,
      metalness: 0.98,
      envMapIntensity: 1.8
    });

    // 5. Inset Front CRT Bezel (Dark Graphite)
    this.tvBezelMaterial = new THREE.MeshStandardMaterial({
      color: 0x1c1d20,
      roughness: 0.72,
      metalness: 0.15
    });

    // 6. Audio Cables (Soft black matte rubber)
    this.cableMaterial = new THREE.MeshStandardMaterial({
      color: 0x141517,
      roughness: 0.55,
      metalness: 0.10
    });

    // 7. Metal Cable Jacks (Gold / Chrome 3.5mm plugs)
    this.jackMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4d8de,
      roughness: 0.20,
      metalness: 0.95
    });
  }

  buildCharacter() {
    // =============================================================
    // 1. HUMAN TORSO & TURTLENECK SWEATER (Locomotive Organic Bust)
    // =============================================================
    this.torsoGroup = new THREE.Group();
    this.torsoGroup.name = 'StaticTorso';

    // A. Main Shoulder & Chest Form
    // Sculpted organic human shoulders with natural slope and depth
    const shoulderShape = new THREE.Shape();
    shoulderShape.moveTo(-0.26, 0.20);
    shoulderShape.lineTo(0.26, 0.20);
    shoulderShape.quadraticCurveTo(0.36, 0.55, 0.48, 0.90);
    shoulderShape.quadraticCurveTo(0.60, 1.10, 0.62, 1.25); // Right shoulder
    shoulderShape.quadraticCurveTo(0.42, 1.34, 0.18, 1.30); // Right clavicle slope
    shoulderShape.lineTo(-0.18, 1.30);                      // Neckline
    shoulderShape.quadraticCurveTo(-0.42, 1.34, -0.62, 1.25); // Left clavicle slope & shoulder
    shoulderShape.quadraticCurveTo(-0.60, 1.10, -0.48, 0.90);
    shoulderShape.quadraticCurveTo(-0.36, 0.55, -0.26, 0.20);

    const extrudeSettings = {
      depth: 0.42,
      bevelEnabled: true,
      bevelSegments: 10,
      steps: 3,
      bevelSize: 0.10,
      bevelThickness: 0.10
    };

    const sweaterGeo = new THREE.ExtrudeGeometry(shoulderShape, extrudeSettings);
    sweaterGeo.translate(0, 0, -0.21);
    this.sweaterMesh = new THREE.Mesh(sweaterGeo, this.sweaterMaterial);
    this.sweaterMesh.castShadow = true;
    this.sweaterMesh.receiveShadow = true;
    this.torsoGroup.add(this.sweaterMesh);

    // B. Turtleneck Ribbed Collar (Wrinkled high collar)
    const collarGroup = new THREE.Group();
    collarGroup.position.set(0, 1.36, 0);

    // Main collar cylinder
    const collarGeo = new THREE.CylinderGeometry(0.175, 0.19, 0.26, 32);
    const collarMesh = new THREE.Mesh(collarGeo, this.sweaterMaterial);
    collarMesh.castShadow = true;
    collarGroup.add(collarMesh);

    // Realistic cloth fold rings around the collar
    const foldGeo1 = new THREE.TorusGeometry(0.182, 0.016, 12, 32);
    foldGeo1.rotateX(Math.PI / 2);
    const fold1 = new THREE.Mesh(foldGeo1, this.sweaterMaterial);
    fold1.position.y = -0.04;
    collarGroup.add(fold1);

    const foldGeo2 = new THREE.TorusGeometry(0.178, 0.014, 12, 32);
    foldGeo2.rotateX(Math.PI / 2);
    const fold2 = new THREE.Mesh(foldGeo2, this.sweaterMaterial);
    fold2.position.y = 0.06;
    collarGroup.add(fold2);

    this.torsoGroup.add(collarGroup);

    // C. Human Skin Neck (Visible peeking above the turtleneck collar)
    const neckGeo = new THREE.CylinderGeometry(0.155, 0.165, 0.22, 32);
    const neckMesh = new THREE.Mesh(neckGeo, this.skinMaterial);
    neckMesh.position.set(0, 1.48, 0);
    neckMesh.castShadow = true;
    neckMesh.receiveShadow = true;
    this.torsoGroup.add(neckMesh);

    // D. Pedestal Studio Mount Base
    const baseGeo = new THREE.CylinderGeometry(0.30, 0.36, 0.22, 32);
    const baseMesh = new THREE.Mesh(baseGeo, this.sweaterMaterial);
    baseMesh.position.set(0, 0.11, 0);
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    this.torsoGroup.add(baseMesh);

    this.root.add(this.torsoGroup);

    // =============================================================
    // 2. TV HEAD (Locomotive Vintage Monitor Pivot)
    // =============================================================
    this.headGroup = new THREE.Group();
    this.headGroup.name = 'TvHeadPivot';
    this.headGroup.position.set(0, this.baseHeadY, 0);

    const headOffset = new THREE.Group();
    headOffset.position.set(0, 0.42, 0);

    // A. Main TV Cabinet (Smooth Rounded Metallic Chassis)
    // Width: 1.02, Height: 0.82, Depth: 0.64
    const cabinetGeo = new RoundedBoxGeometry(1.02, 0.82, 0.64, 8, 0.08);
    this.cabinetMesh = new THREE.Mesh(cabinetGeo, this.tvCasingMaterial);
    this.cabinetMesh.castShadow = true;
    this.cabinetMesh.receiveShadow = true;
    headOffset.add(this.cabinetMesh);

    // B. Outer Polished Chrome Bezel Trim (The distinctive Locomotive metal rim)
    const chromeRimGeo = new RoundedBoxGeometry(0.96, 0.74, 0.05, 8, 0.04);
    const chromeRimMesh = new THREE.Mesh(chromeRimGeo, this.chromeTrimMaterial);
    chromeRimMesh.position.set(0, 0, 0.30);
    chromeRimMesh.castShadow = true;
    headOffset.add(chromeRimMesh);

    // C. Recessed Dark Screen Bezel Frame
    const innerBezelGeo = new RoundedBoxGeometry(0.88, 0.66, 0.04, 6, 0.03);
    const innerBezelMesh = new THREE.Mesh(innerBezelGeo, this.tvBezelMaterial);
    innerBezelMesh.position.set(0, 0, 0.315);
    headOffset.add(innerBezelMesh);

    // D. Curved Active CRT Display Screen
    const screenGeo = new THREE.PlaneGeometry(0.76, 0.58, 20, 20);
    const pos = screenGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i);
      const v = pos.getY(i);
      const distSq = (u * u) / (0.38 * 0.38) + (v * v) / (0.29 * 0.29);
      const bulge = Math.max(0, 0.024 * (1 - distSq));
      pos.setZ(i, bulge);
    }
    screenGeo.computeVertexNormals();

    this.screenMaterial = new THREE.MeshBasicMaterial({
      map: this.screenManager ? this.screenManager.texture : null,
      toneMapped: false
    });
    this.screenMesh = new THREE.Mesh(screenGeo, this.screenMaterial);
    this.screenMesh.name = 'LocomotiveScreen';
    this.screenMesh.position.set(0, 0, 0.328);
    headOffset.add(this.screenMesh);

    // E. Side Circular Audio Module (Right side of TV cabinet)
    const discGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.04, 32);
    discGeo.rotateZ(Math.PI / 2);
    const discMesh = new THREE.Mesh(discGeo, this.tvBezelMaterial);
    discMesh.position.set(0.52, 0.02, 0);
    headOffset.add(discMesh);

    const discCenterGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 24);
    discCenterGeo.rotateZ(Math.PI / 2);
    const discCenter = new THREE.Mesh(discCenterGeo, this.chromeTrimMaterial);
    discCenter.position.set(0.53, 0.02, 0);
    headOffset.add(discCenter);

    // F. Bottom Audio Ports (Where the patch cables plug in)
    const portGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.04, 16);
    portGeo.rotateX(Math.PI / 2);

    const port1 = new THREE.Mesh(portGeo, this.jackMaterial);
    port1.position.set(-0.16, -0.40, 0.24);
    headOffset.add(port1);

    const port2 = new THREE.Mesh(portGeo, this.jackMaterial);
    port2.position.set(0.16, -0.40, 0.24);
    headOffset.add(port2);

    this.headGroup.add(headOffset);
    this.root.add(this.headGroup);

    // =============================================================
    // 3. ORGANIC HANGING AUDIO CABLES (Signature Locomotive Element!)
    // =============================================================
    this.buildHangingCables();
  }

  buildHangingCables() {
    this.cablesGroup = new THREE.Group();
    this.cablesGroup.name = 'AudioCables';

    // Cable 1: Plugs into TV bottom-left, loops down over the left collarbone & chest
    const curve1 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.16, 1.48, 0.24), // TV bottom port
      new THREE.Vector3(-0.24, 1.32, 0.28), // Hanging droop
      new THREE.Vector3(-0.35, 1.15, 0.26), // Over left collar
      new THREE.Vector3(-0.28, 0.95, 0.24), // Across sweater
      new THREE.Vector3(-0.18, 0.80, 0.22)  // Tucked into fold
    ]);
    const cableGeo1 = new THREE.TubeGeometry(curve1, 32, 0.007, 8, false);
    const cable1 = new THREE.Mesh(cableGeo1, this.cableMaterial);
    cable1.castShadow = true;
    this.cablesGroup.add(cable1);

    // Cable 2: Plugs into TV bottom-right, drapes across neck & down right chest
    const curve2 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.16, 1.48, 0.24),  // TV bottom-right port
      new THREE.Vector3(0.26, 1.30, 0.29),  // Hanging loop
      new THREE.Vector3(0.38, 1.10, 0.27),  // Draping over right shoulder
      new THREE.Vector3(0.42, 0.92, 0.24),
      new THREE.Vector3(0.34, 0.78, 0.22)
    ]);
    const cableGeo2 = new THREE.TubeGeometry(curve2, 32, 0.007, 8, false);
    const cable2 = new THREE.Mesh(cableGeo2, this.cableMaterial);
    cable2.castShadow = true;
    this.cablesGroup.add(cable2);

    // Cable 3: Loops from the right circular side module and curves down over the shoulder
    const curve3 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.53, 1.88, 0),     // Side audio disc
      new THREE.Vector3(0.58, 1.65, 0.12),  // Looping outside
      new THREE.Vector3(0.48, 1.38, 0.22),  // Over right trapezius
      new THREE.Vector3(0.32, 1.22, 0.26)   // Resting on sweater
    ]);
    const cableGeo3 = new THREE.TubeGeometry(curve3, 32, 0.006, 8, false);
    const cable3 = new THREE.Mesh(cableGeo3, this.cableMaterial);
    cable3.castShadow = true;
    this.cablesGroup.add(cable3);

    // Cable 4: Looping wire on the left side (hanging free)
    const curve4 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.48, 1.80, 0.08),
      new THREE.Vector3(-0.55, 1.55, 0.18),
      new THREE.Vector3(-0.46, 1.35, 0.22),
      new THREE.Vector3(-0.38, 1.25, 0.25)
    ]);
    const cableGeo4 = new THREE.TubeGeometry(curve4, 32, 0.0055, 8, false);
    const cable4 = new THREE.Mesh(cableGeo4, this.cableMaterial);
    cable4.castShadow = true;
    this.cablesGroup.add(cable4);

    this.root.add(this.cablesGroup);
  }

  setPointerLook(normalizedX, normalizedY) {
    // Natural neck rotation limits
    this.targetYaw = THREE.MathUtils.clamp(normalizedX * 0.40, -0.40, 0.40);
    this.targetPitch = THREE.MathUtils.clamp(-normalizedY * 0.24, -0.22, 0.22);
  }

  setSpeakingState(isSpeaking) {
    this.isSpeaking = !!isSpeaking;
  }

  update(deltaTime) {
    this.time += deltaTime;

    // Smooth Spring Head Tracking
    const followSpeed = 4.2;
    this.currentYaw = THREE.MathUtils.lerp(this.currentYaw, this.targetYaw, deltaTime * followSpeed);
    this.currentPitch = THREE.MathUtils.lerp(this.currentPitch, this.targetPitch, deltaTime * followSpeed);

    if (this.headGroup) {
      this.headGroup.rotation.y = this.currentYaw;
      this.headGroup.rotation.x = this.currentPitch;
      this.headGroup.rotation.z = -this.currentYaw * 0.08;

      // Subtle Idle Breathing Micro-Float
      const breath = Math.sin(this.time * 1.5) * 0.007;
      this.headGroup.position.y = this.baseHeadY + breath;
    }
  }
}

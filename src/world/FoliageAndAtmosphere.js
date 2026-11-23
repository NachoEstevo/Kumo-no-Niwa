import * as THREE from 'three';
import {
  getCliffRockTexture,
  getGrassSprigTexture,
  getLeafClusterTexture,
} from '../engine/PixelTextures.js';
import { createPixelToonMaterial, globalToonUniforms } from '../engine/ToonMaterials.js';
import {
  BAMBOO_PUZZLE_CENTER,
  MOSS_BOULDERS,
  POND_WATER_Y,
  TREE_SPECS,
  getHeightAt,
  isGrassSpot,
  isLowerPondWater,
} from './TerrainData.js';

function seededRand(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const BILLBOARD_LEAF_VERTEX = /* glsl */ `
attribute vec2 aCorner;
attribute float aSize;
attribute vec3 aDomeNormal;
attribute vec3 aColor;

uniform float uTime;
uniform float uWindAmp;
uniform float uWindSpeed;

varying vec2 vUv;
varying vec3 vDomeNormal;
varying vec3 vColor;

void main() {
  vUv = uv;
  vColor = aColor;
  vDomeNormal = normalize(mat3(modelMatrix) * aDomeNormal);

  vec4 wp = modelMatrix * vec4(position, 1.0);
  float phase = wp.x * 0.52 + wp.z * 0.41;
  wp.x += sin(uTime * uWindSpeed + phase) * uWindAmp;
  wp.z += cos(uTime * uWindSpeed * 0.8 + phase * 1.2) * (uWindAmp * 0.65);

  vec4 mvCenter = viewMatrix * wp;
  mvCenter.xy += aCorner * aSize;
  gl_Position = projectionMatrix * mvCenter;
}
`;

const BILLBOARD_LEAF_FRAGMENT = /* glsl */ `
precision highp float;

uniform sampler2D uMap;
uniform vec3 uSunDir;
uniform vec3 uSunWarmth;
uniform float uSunScale;
uniform vec3 uShadowColor;
uniform vec3 uShadowTint;

varying vec2 vUv;
varying vec3 vDomeNormal;
varying vec3 vColor;

void main() {
  vec4 tex = texture2D(uMap, vUv);
  if (tex.a < 0.45) discard;

  vec3 baseAlb = tex.rgb * vColor;
  float ndl = dot(normalize(vDomeNormal), normalize(uSunDir));
  float cel = smoothstep(-0.22, 0.08, ndl) * 0.6 + smoothstep(0.32, 0.58, ndl) * 0.4;

  vec3 shadowBase = mix(baseAlb * uShadowTint, uShadowColor, 0.48);
  vec3 litCol = baseAlb * uSunWarmth * (uSunScale * 0.85);
  vec3 col = mix(shadowBase, max(litCol, shadowBase * 1.04), cel);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

function createBillboardLeafMaterial(map, windAmp = 0.08, windSpeed = 1.6) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uTime: globalToonUniforms.uTime,
      uWindAmp: { value: windAmp },
      uWindSpeed: { value: windSpeed },
      uSunDir: globalToonUniforms.uSunDir,
      uSunWarmth: globalToonUniforms.uSunWarmth,
      uSunScale: globalToonUniforms.uSunScale,
      uShadowColor: globalToonUniforms.uShadowColor,
      uShadowTint: globalToonUniforms.uShadowTint,
    },
    vertexShader: BILLBOARD_LEAF_VERTEX,
    fragmentShader: BILLBOARD_LEAF_FRAGMENT,
  });
}

function createOrganicDomeGeo(radius, seed) {
  const geo = new THREE.SphereGeometry(radius, 12, 9);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const bump =
      1.0 +
      0.14 * Math.sin(vx * 3.1 + seed) * Math.cos(vz * 2.8 - seed * 0.5) +
      0.09 * Math.cos(vy * 3.4 + seed * 1.3);
    pos.setXYZ(i, vx * bump * 1.15, vy * bump * 0.84, vz * bump * 1.1);
  }
  geo.computeVertexNormals();
  return geo;
}

export class FoliageAndAtmosphere {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.rand = seededRand(20261122);
    this.fireflyIntensity = 0;
    this.petalStormTimer = 0;

    this._initFoliageMaterials();
    this._buildStylizedTrees();
    this._buildBambooForest();
    this._buildMossyBoulders();
    this._buildGrassSprigs();
    this._buildWaterLilies();
    this._buildPetalParticles();
    this._buildWaterfallMist();
    this._buildFireflies();
  }

  _initFoliageMaterials() {
    this.sakuraBillboardMat = createBillboardLeafMaterial(getLeafClusterTexture('sakura'), 0.08, 1.55);
    this.momijiBillboardMat = createBillboardLeafMaterial(getLeafClusterTexture('momiji'), 0.08, 1.55);
    this.bambooBillboardMat = createBillboardLeafMaterial(getLeafClusterTexture('bamboo'), 0.14, 1.9);

    this.barkMat = createPixelToonMaterial({ color: '#4d352e' });
    this.cliffMat = createPixelToonMaterial({ color: '#ffffff', map: getCliffRockTexture() });
    this.mossMat = createPixelToonMaterial({ color: '#5c7830' });
  }

  _getTreeColors(type) {
    switch (type) {
      case 'momiji-red':
        return {
          dome: '#d63e22',
          tufts: ['#ff6a38', '#e84323', '#f75828', '#c7321c'],
        };
      case 'momiji-orange':
        return {
          dome: '#e56922',
          tufts: ['#ff9c38', '#f27422', '#ffb247', '#d8581d'],
        };
      case 'momiji-gold':
        return {
          dome: '#dfa226',
          tufts: ['#ffd64f', '#f0b12e', '#f8c13f', '#cc8620'],
        };
      case 'sakura':
      default:
        return {
          dome: '#ee9cb4',
          tufts: ['#fbc4d5', '#f5adc3', '#eb93ae', '#df7e9d'],
        };
    }
  }

  // Hybrid Sculpted Organic Crown Domes + Camera-Facing Billboard Leaf Tufts (zero flat edge-on slices!)
  _createStylizedTree(spec, idx) {
    const { x, z, type, scale = 1.0, ancient = false } = spec;
    const y = getHeightAt(x, z);
    const tree = new THREE.Group();
    tree.position.set(x, y, z);

    const pal = this._getTreeColors(type);
    const trunkH = (ancient ? 3.5 : 2.3) * scale;
    const trunkR = (ancient ? 0.5 : 0.27) * scale;

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(trunkR * 0.62, trunkR, trunkH, 8),
      this.barkMat
    );
    trunk.position.set(0, trunkH * 0.5, 0);
    trunk.rotation.z = (this.rand() - 0.5) * 0.1;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    tree.add(trunk);

    const branchCount = ancient ? 5 : 4;
    const lobeCenters = [new THREE.Vector3(0, trunkH + 1.05 * scale, 0)];
    for (let b = 0; b < branchCount; b++) {
      const ang = (b / branchCount) * Math.PI * 2 + this.rand() * 0.45;
      const bLen = (ancient ? 2.15 : 1.35) * scale;
      const br = new THREE.Mesh(
        new THREE.CylinderGeometry(trunkR * 0.28, trunkR * 0.48, bLen, 6),
        this.barkMat
      );
      const bx = Math.cos(ang) * bLen * 0.44;
      const bz = Math.sin(ang) * bLen * 0.44;
      const by = trunkH * 0.8 + bLen * 0.25;
      br.position.set(bx, by, bz);
      br.rotation.z = -Math.cos(ang) * 0.68;
      br.rotation.x = Math.sin(ang) * 0.68;
      br.castShadow = true;
      tree.add(br);

      lobeCenters.push(new THREE.Vector3(bx * 1.48, by + 0.62 * scale, bz * 1.48));
    }

    // 1. Inner Sculpted Organic Canopy Domes (solid volume & clean shadows)
    const domeMat = createPixelToonMaterial({
      color: pal.dome,
      windSway: { amp: 0.06, speed: 1.55, baseHeight: 1.2 * scale, topHeight: 6.5 * scale },
    });

    lobeCenters.forEach((lc, lIdx) => {
      const domeRad = (lIdx === 0 ? (ancient ? 1.85 : 1.22) : (ancient ? 1.45 : 0.96)) * scale;
      const domeMesh = new THREE.Mesh(createOrganicDomeGeo(domeRad, idx * 7 + lIdx), domeMat);
      domeMesh.position.copy(lc);
      domeMesh.castShadow = true;
      domeMesh.receiveShadow = true;
      tree.add(domeMesh);
    });

    // 2. Outer Camera-Facing Billboard Leaf Tufts hugging the canopy domes!
    const tuftCount = ancient ? 92 : 52;
    const positions = [];
    const corners = [];
    const sizes = [];
    const domeNormals = [];
    const uvs = [];
    const colors = [];
    const indices = [];

    const tuftColors = pal.tufts.map((hex) => new THREE.Color(hex));
    const crownCenter = new THREE.Vector3(0, trunkH + 0.7 * scale, 0);
    const localCorners = [
      [-0.5, -0.5, 0, 0],
      [0.5, -0.5, 1, 0],
      [0.5, 0.5, 1, 1],
      [-0.5, 0.5, 0, 1],
    ];

    for (let i = 0; i < tuftCount; i++) {
      const lobe = lobeCenters[i % lobeCenters.length];
      const theta = this.rand() * Math.PI * 2;
      const phi = Math.acos(1 - 1.45 * this.rand());
      const domeR = (lobe === lobeCenters[0] ? (ancient ? 1.75 : 1.15) : (ancient ? 1.38 : 0.92)) * scale;

      const cx = lobe.x + Math.sin(phi) * Math.cos(theta) * domeR * 1.05;
      const cy = lobe.y + Math.cos(phi) * domeR * 0.85;
      const cz = lobe.z + Math.sin(phi) * Math.sin(theta) * domeR * 1.05;

      const dn = new THREE.Vector3(
        cx - crownCenter.x,
        cy - crownCenter.y + 0.55 * scale,
        cz - crownCenter.z
      ).normalize();

      const sz = (ancient ? 1.42 : 1.12) * scale * (0.78 + this.rand() * 0.42);
      const hRatio = (cy - crownCenter.y) / (2.0 * scale);
      const col =
        hRatio > 0.35
          ? tuftColors[0]
          : hRatio > 0.0
          ? tuftColors[1]
          : hRatio > -0.35
          ? tuftColors[2]
          : tuftColors[3];

      const vBase = i * 4;
      for (let q = 0; q < 4; q++) {
        positions.push(cx, cy, cz);
        corners.push(localCorners[q][0], localCorners[q][1]);
        sizes.push(sz);
        domeNormals.push(dn.x, dn.y, dn.z);
        uvs.push(localCorners[q][2], localCorners[q][3]);
        colors.push(col.r, col.g, col.b);
      }
      indices.push(vBase + 0, vBase + 1, vBase + 2);
      indices.push(vBase + 0, vBase + 2, vBase + 3);
    }

    const tuftGeo = new THREE.BufferGeometry();
    tuftGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    tuftGeo.setAttribute('aCorner', new THREE.Float32BufferAttribute(corners, 2));
    tuftGeo.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    tuftGeo.setAttribute('aDomeNormal', new THREE.Float32BufferAttribute(domeNormals, 3));
    tuftGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    tuftGeo.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
    tuftGeo.setIndex(indices);

    const tuftMat = type === 'sakura' ? this.sakuraBillboardMat : this.momijiBillboardMat;
    const tuftMesh = new THREE.Mesh(tuftGeo, tuftMat);
    tuftMesh.frustumCulled = false;
    tree.add(tuftMesh);

    this.group.add(tree);
  }

  _buildStylizedTrees() {
    TREE_SPECS.forEach((spec, idx) => this._createStylizedTree(spec, idx));
  }

  _buildBambooForest() {
    const stalkMat = createPixelToonMaterial({
      color: '#7da840',
      windSway: { amp: 0.14, speed: 1.9, baseHeight: 0.0, topHeight: 6.5 },
    });

    const spots = [];
    for (let i = 0; i < 74; i++) {
      const gx = -38.5 + this.rand() * 14.5;
      const gz = -22.8 + this.rand() * 14.8;
      if (Math.hypot(gx - BAMBOO_PUZZLE_CENTER.x, gz - BAMBOO_PUZZLE_CENTER.z) < 5.6) continue;
      if (Math.hypot(gx - -35.5, gz - -19.6) < 2.6) continue;
      spots.push([gx, gz]);
    }
    for (let i = 0; i < 14; i++) {
      spots.push([-36.8 + this.rand() * 2.5, -3.5 + this.rand() * 11.0]);
    }

    const positions = [];
    const corners = [];
    const sizes = [];
    const domeNormals = [];
    const uvs = [];
    const colors = [];
    const indices = [];
    const localCorners = [
      [-0.5, -0.5, 0, 0],
      [0.5, -0.5, 1, 0],
      [0.5, 0.5, 1, 1],
      [-0.5, 0.5, 0, 1],
    ];
    const bCol = new THREE.Color('#ffffff');
    let quadIdx = 0;

    spots.forEach(([x, z], idx) => {
      const y = getHeightAt(x, z);
      const h = 4.6 + (idx % 5) * 0.72;

      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, h, 7), stalkMat);
      stalk.position.set(x, y + h * 0.5, z);
      stalk.rotation.z = ((idx % 3) - 1) * 0.045;
      stalk.castShadow = true;
      stalk.receiveShadow = true;
      this.group.add(stalk);

      // Camera-facing leaf tufts: bamboo carries its leafy twigs along the upper
      // ~40% of the culm, alternating sides and shrinking toward the crown.
      const tufts = 4;
      for (let c = 0; c < tufts; c++) {
        const t = c / (tufts - 1);
        const side = c % 2 === 0 ? 1 : -1;
        const cx = x + side * (0.32 - 0.16 * t) + -stalk.rotation.z * h * (0.1 + 0.4 * t);
        const cy = y + h * (0.6 + 0.4 * t) - 0.1;
        const cz = z + side * 0.12;
        const sz = (1.25 - 0.38 * t) * (1 + (idx % 3) * 0.08);
        const vBase = quadIdx * 4;
        for (let q = 0; q < 4; q++) {
          positions.push(cx, cy, cz);
          corners.push(localCorners[q][0], localCorners[q][1]);
          sizes.push(sz);
          domeNormals.push(0, 1, 0);
          uvs.push(localCorners[q][2], localCorners[q][3]);
          colors.push(bCol.r, bCol.g, bCol.b);
        }
        indices.push(vBase + 0, vBase + 1, vBase + 2);
        indices.push(vBase + 0, vBase + 2, vBase + 3);
        quadIdx++;
      }
    });

    const bGeo = new THREE.BufferGeometry();
    bGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    bGeo.setAttribute('aCorner', new THREE.Float32BufferAttribute(corners, 2));
    bGeo.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    bGeo.setAttribute('aDomeNormal', new THREE.Float32BufferAttribute(domeNormals, 3));
    bGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    bGeo.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
    bGeo.setIndex(indices);

    const bMesh = new THREE.Mesh(bGeo, this.bambooBillboardMat);
    bMesh.frustumCulled = false;
    this.group.add(bMesh);
  }

  _buildMossyBoulders() {
    // Shared with TerrainData so every boulder also blocks movement
    MOSS_BOULDERS.forEach(([x, z, s], i) => {
      const y = getHeightAt(x, z);
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 1), this.cliffMat);
      rock.position.set(x, y + s * 0.35, z);
      rock.rotation.set(i * 0.4, i * 1.1, 0);
      rock.scale.set(1.18, 0.78, 1.05);
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.group.add(rock);

      const moss = new THREE.Mesh(new THREE.DodecahedronGeometry(s * 0.65, 1), this.mossMat);
      moss.position.set(x - 0.12, y + s * 0.72, z + 0.08);
      moss.scale.set(1.22, 0.44, 1.12);
      moss.receiveShadow = true;
      this.group.add(moss);
    });
  }

  _buildGrassSprigs() {
    const bladeGeo = new THREE.PlaneGeometry(0.42, 0.42);
    bladeGeo.translate(0, 0.21, 0);

    const plainMat = createPixelToonMaterial({
      color: '#ffffff',
      map: getGrassSprigTexture(false),
      alphaTest: 0.4,
      side: THREE.DoubleSide,
      windSway: { amp: 0.07, speed: 2.35, baseHeight: 0.0, topHeight: 0.45 },
    });

    const flowerMat = createPixelToonMaterial({
      color: '#ffffff',
      map: getGrassSprigTexture(true),
      alphaTest: 0.4,
      side: THREE.DoubleSide,
      windSway: { amp: 0.07, speed: 2.35, baseHeight: 0.0, topHeight: 0.45 },
    });

    const plainList = [];
    const flowerList = [];
    let attempts = 0;

    while (plainList.length + flowerList.length < 1350 && attempts < 14000) {
      attempts++;
      const x = -40 + this.rand() * 66;
      const z = -42 + this.rand() * 82;
      if (!isGrassSpot(x, z)) continue;

      const y = getHeightAt(x, z);
      const item = { x, y, z, rot: this.rand() * Math.PI, sc: 0.8 + this.rand() * 0.65 };
      if (this.rand() < 0.14) flowerList.push(item);
      else plainList.push(item);
    }

    const populate = (list, mat) => {
      if (!list.length) return;
      const inst = new THREE.InstancedMesh(bladeGeo, mat, list.length * 2);
      inst.receiveShadow = true;
      const dummy = new THREE.Object3D();
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        dummy.position.set(p.x, p.y, p.z);
        dummy.scale.setScalar(p.sc);
        dummy.rotation.set(0, p.rot, 0);
        dummy.updateMatrix();
        inst.setMatrixAt(i * 2, dummy.matrix);

        dummy.rotation.set(0, p.rot + Math.PI * 0.5, 0);
        dummy.updateMatrix();
        inst.setMatrixAt(i * 2 + 1, dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      this.group.add(inst);
    };

    populate(plainList, plainMat);
    populate(flowerList, flowerMat);
  }

  _buildWaterLilies() {
    const padMat = createPixelToonMaterial({ color: '#4d8237' });
    const lotusMat = createPixelToonMaterial({ color: '#f9bbd0' });

    const lilySpots = [
      [-5.2, 20.4, true], [-6.1, 21.1, false],
      [-12.8, 12.6, true], [-13.6, 13.5, false],
      [3.8, 19.8, true], [4.5, 19.2, false],
      [7.8, 8.8, true], [8.5, 8.1, false],
      [-8.5, 9.8, false], [-3.4, 8.2, true],
      [14.2, 14.5, true], [15.5, 10.2, false],
      [-15.2, 21.0, true], [1.2, 11.4, false],
    ];

    lilySpots.forEach(([x, z, hasFlower], idx) => {
      if (!isLowerPondWater(x, z)) return;
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.05, 8), padMat);
      pad.position.set(x, POND_WATER_Y + 0.02, z);
      pad.rotation.y = idx * 1.1;
      pad.receiveShadow = true;
      this.group.add(pad);

      if (hasFlower) {
        const flower = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), lotusMat);
        flower.position.set(x + 0.06, POND_WATER_Y + 0.1, z);
        this.group.add(flower);
      }
    });
  }

  _buildPetalParticles() {
    this.petalCount = 260;
    const geo = new THREE.PlaneGeometry(0.18, 0.13);
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide });
    this.petalMesh = new THREE.InstancedMesh(geo, mat, this.petalCount);
    this.petalData = [];
    this.petalDummy = new THREE.Object3D();

    const sakuraCol = new THREE.Color('#ffb8cc');
    const paleSakura = new THREE.Color('#ffe2ec');
    const momijiCol = new THREE.Color('#f0662c');

    for (let i = 0; i < this.petalCount; i++) {
      const isLeaf = i % 5 === 0;
      this.petalMesh.setColorAt(i, isLeaf ? momijiCol : i % 2 === 0 ? sakuraCol : paleSakura);
      this.petalData.push({
        x: -38 + this.rand() * 64,
        y: 2.0 + this.rand() * 12.0,
        z: -44 + this.rand() * 84,
        vx: 0.48 + this.rand() * 0.58,
        vy: -(0.45 + this.rand() * 0.48),
        vz: 0.2 + this.rand() * 0.42,
        rot: this.rand() * Math.PI * 2,
        phase: this.rand() * Math.PI * 2,
      });
    }
    if (this.petalMesh.instanceColor) this.petalMesh.instanceColor.needsUpdate = true;
    this.group.add(this.petalMesh);
  }

  _buildWaterfallMist() {
    const mistMat = new THREE.MeshBasicMaterial({
      color: '#eefaff',
      transparent: true,
      opacity: 0.55,
    });
    this.mists = [];
    const tiers = [
      [15.6, 2.05, -15.4],
      [15.6, POND_WATER_Y + 0.1, -9.2],
    ];
    tiers.forEach(([bx, by, bz], tIdx) => {
      for (let i = 0; i < 8; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), mistMat.clone());
        m.position.set(bx + (this.rand() - 0.5) * 2.2, by, bz + (this.rand() - 0.5) * 1.4);
        m.userData = {
          phase: this.rand() * 3.0 + tIdx,
          baseX: m.position.x,
          baseY: by,
          baseZ: m.position.z,
        };
        this.group.add(m);
        this.mists.push(m);
      }
    });
  }

  _buildFireflies() {
    this.fireflyCount = 72;
    const geo = new THREE.BoxGeometry(0.13, 0.13, 0.13);
    const mat = new THREE.MeshBasicMaterial({
      color: '#ffea7d',
      transparent: true,
      opacity: 0.0,
    });
    this.fireflyMat = mat;
    this.fireflyMesh = new THREE.InstancedMesh(geo, mat, this.fireflyCount);
    this.fireflyData = [];
    this.fireflyDummy = new THREE.Object3D();

    const hubs = [
      [0, 14.5, 0.6],
      [-26.0, 5.0, 1.0],
      [-30.2, -15.2, 1.4],
      [15.6, -2.0, 0.8],
      [13.8, -28.5, 5.8],
      [-12.8, -31.0, 5.9],
      [-11.4, -13.0, 3.4],
    ];

    for (let i = 0; i < this.fireflyCount; i++) {
      const hub = hubs[i % hubs.length];
      this.fireflyData.push({
        bx: hub[0] + (this.rand() - 0.5) * 10.5,
        bz: hub[1] + (this.rand() - 0.5) * 9.5,
        by: hub[2] + 0.4 + this.rand() * 1.8,
        phase: this.rand() * Math.PI * 2,
        speed: 0.7 + this.rand() * 0.9,
      });
    }
    this.group.add(this.fireflyMesh);
  }

  triggerPetalStorm() {
    this.petalStormTimer = 6.5;
    for (let i = 0; i < this.petalCount; i++) {
      const p = this.petalData[i];
      p.y = 6.0 + this.rand() * 8.5;
      p.vx = 1.8 + this.rand() * 1.5;
    }
  }

  setFireflyIntensity(val) {
    this.fireflyIntensity = val;
  }

  update(dt, elapsed) {
    const stormBoost = this.petalStormTimer > 0 ? 1 + (this.petalStormTimer / 6.5) * 1.8 : 1;
    if (this.petalStormTimer > 0) this.petalStormTimer = Math.max(0, this.petalStormTimer - dt);

    for (let i = 0; i < this.petalCount; i++) {
      const p = this.petalData[i];
      p.x += (p.vx * stormBoost + Math.sin(elapsed * 1.4 + p.phase) * 0.35) * dt;
      p.y += p.vy * dt;
      p.z += (p.vz * stormBoost + Math.cos(elapsed * 1.1 + p.phase) * 0.25) * dt;
      p.rot += dt * 2.2 * stormBoost;

      if (p.y < -0.5 || p.x > 30 || p.z > 42) {
        p.x = -40 + ((i * 7.3) % 62);
        p.y = 8.5 + (i % 6) * 0.95;
        p.z = -46 + ((i * 11.1) % 80);
      }

      this.petalDummy.position.set(p.x, p.y, p.z);
      this.petalDummy.rotation.set(p.rot, p.rot * 0.7, p.rot * 0.5);
      this.petalDummy.scale.setScalar(1.0);
      this.petalDummy.updateMatrix();
      this.petalMesh.setMatrixAt(i, this.petalDummy.matrix);
    }
    this.petalMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < this.mists.length; i++) {
      const m = this.mists[i];
      const cycle = (elapsed * 0.85 + m.userData.phase) % 1.0;
      m.position.x = m.userData.baseX + Math.sin(elapsed * 2 + i) * 0.26;
      m.position.y = m.userData.baseY + cycle * 1.35;
      m.position.z = m.userData.baseZ + cycle * 0.5;
      m.scale.setScalar(0.65 + cycle * 0.95);
      m.material.opacity = Math.sin(cycle * Math.PI) * 0.55;
    }

    this.fireflyMesh.visible = this.fireflyIntensity > 0.02;
    if (this.fireflyMesh.visible) {
      this.fireflyMat.opacity = this.fireflyIntensity * 0.92;
      for (let i = 0; i < this.fireflyCount; i++) {
        const f = this.fireflyData[i];
        const t = elapsed * f.speed + f.phase;
        this.fireflyDummy.position.set(
          f.bx + Math.sin(t) * 1.0,
          f.by + Math.sin(t * 1.7) * 0.35,
          f.bz + Math.cos(t * 0.85) * 1.0
        );
        const pulse = 0.5 + 0.5 * Math.sin(elapsed * 4.5 + f.phase);
        this.fireflyDummy.scale.setScalar((0.55 + pulse * 0.9) * this.fireflyIntensity);
        this.fireflyDummy.updateMatrix();
        this.fireflyMesh.setMatrixAt(i, this.fireflyDummy.matrix);
      }
      this.fireflyMesh.instanceMatrix.needsUpdate = true;
    }
  }
}

import * as THREE from 'three';
import {
  buildAmbientWildlife,
  buildSculptedCumulusCluster,
  createBellResonanceManager,
} from './WorldKit.js';
import {
  getCliffRockTexture,
  getGrassTurfTexture,
  getRoofTileTexture,
  getStoneMasonryTexture,
  getWoodPlankTexture,
  createRakedGravelTexture,
} from '../engine/PixelTextures.js';
import {
  createCloudMaterial,
  createCloudSeaMaterial,
  createPixelToonMaterial,
  globalToonUniforms,
} from '../engine/ToonMaterials.js';
import {
  BAMBOO_PUZZLE_CENTER,
  BRAZIER_SPOTS,
  BRIDGES,
  LANTERN_SPOTS,
  MIRROR_WATER_Y,
  MOON_BRIDGE_STONES,
  MOON_ISLET,
  POND_BED_Y,
  POND_WATER_Y,
  PUSH_STONE_INITIAL,
  PUSH_STONE_TARGET,
  PUZZLE_JIZO_SPOTS,
  STEPPING_STONES,
  TORII_STAIR_Z,
  WORLD_BOUNDS,
  ZEN_FIXED_ROCKS,
  ZEN_GARDEN_BOUNDS,
  buildPondSDFTexture,
  getHeightAt,
} from './TerrainData.js';

const WATER_VERTEX_SHADER = /* glsl */ `
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const WATER_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform float uTime;
uniform sampler2D uPondSDF;
uniform vec4 uWorldBounds;
uniform vec3 uDeepColor;
uniform vec3 uShallowColor;
uniform vec3 uFoamColor;
uniform vec3 uHighlightColor;
uniform float uIsMirror;
uniform vec4 uRipples[8];

varying vec3 vWorldPos;

void main() {
  vec2 pos = vWorldPos.xz;

  vec2 sdfUv = vec2(
    (pos.x - uWorldBounds.x) / (uWorldBounds.y - uWorldBounds.x),
    (pos.y - uWorldBounds.z) / (uWorldBounds.w - uWorldBounds.z)
  );
  vec4 sdfSample = texture2D(uPondSDF, clamp(sdfUv, 0.002, 0.998));

  if (sdfSample.g < 0.35) discard;

  float shoreDist = sdfSample.r;
  float wave1 = sin(pos.x * 1.4 + uTime * 1.3) * cos(pos.y * 1.35 - uTime * 1.05);
  float wave2 = sin((pos.x + pos.y) * 2.1 - uTime * 1.7);
  float caustics = smoothstep(0.35, 0.85, (wave1 + wave2) * 0.3 + 0.5);

  vec3 waterCol = mix(uShallowColor, uDeepColor, smoothstep(0.14, 0.72, shoreDist));
  waterCol = mix(waterCol, uHighlightColor, caustics * (uIsMirror > 0.5 ? 0.34 : 0.22));

  if (uIsMirror > 0.5) {
    float skyBand = smoothstep(0.3, 0.9, sin(pos.y * 0.95 + pos.x * 0.35 + uTime * 0.55) * 0.5 + 0.5);
    waterCol = mix(waterCol, uHighlightColor, skyBand * 0.26);
  }

  // Silky shoreline foam & delicate inner ripple ring
  float foamThreshold = 0.075 + sin(uTime * 2.1 + pos.x * 2.2 + pos.y * 2.0) * 0.015;
  float foamEdge = 1.0 - smoothstep(foamThreshold - 0.018, foamThreshold + 0.012, shoreDist);
  float innerRipple = (1.0 - smoothstep(0.0, 0.016, abs(shoreDist - 0.14 - sin(uTime * 1.6 - pos.x * 1.5) * 0.012))) * 0.58;
  float foamMask = max(foamEdge, innerRipple);

  // Lower waterfall plunge pool froth around (15.6, -9.2)
  float plungeDist = length(pos - vec2(15.6, -9.2));
  float plungeFoam = 1.0 - smoothstep(1.35, 1.95 + sin(uTime * 4.5 + pos.x * 2.8) * 0.25, plungeDist);
  foamMask = max(foamMask, plungeFoam);

  // Expanding circular ripple rings
  for (int i = 0; i < 8; i++) {
    vec4 rip = uRipples[i];
    if (rip.w > 0.01) {
      float age = uTime - rip.z;
      if (age >= 0.0 && age < 2.2) {
        float rad = age * 1.85;
        float d = abs(length(pos - rip.xy) - rad);
        float ring = (1.0 - smoothstep(0.03, 0.11, d)) * (1.0 - age / 2.2) * rip.w;
        foamMask = max(foamMask, ring);
      }
    }
  }

  vec3 finalCol = mix(waterCol, uFoamColor, clamp(foamMask, 0.0, 1.0));
  float waterAlpha = mix(mix(0.42, 0.62, smoothstep(0.12, 0.72, shoreDist)), 1.0, clamp(foamMask, 0.0, 1.0));
  gl_FragColor = vec4(finalCol, waterAlpha);
}
`;

const WATERFALL_VERTEX_SHADER = /* glsl */ `
uniform float uTime;
uniform float uSeed;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position;
  float archMask = sin(uv.x * 3.14159265);
  float wave = sin(uv.y * 9.5 + uTime * 3.8 + uSeed * 6.0) * 0.055 * archMask;
  p.z += wave;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const WATERFALL_FRAGMENT_SHADER = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uSeed;
uniform vec3 uDeepColor;
uniform vec3 uFoamColor;
varying vec2 vUv;

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 41.3);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  float distFromCenter = abs(vUv.x - 0.5) * 2.0;
  float edgeWobble = (vnoise(vec2(vUv.y * 7.5 + uSeed * 4.2, uTime * 0.9)) - 0.5) * 0.24;
  float lipTaper = (1.0 - smoothstep(0.84, 1.0, vUv.y)) * 0.06;
  float splashSpread = (1.0 - smoothstep(0.0, 0.24, vUv.y)) * 0.14;
  float edgeAlpha = 1.0 - smoothstep(0.68 - splashSpread + lipTaper + edgeWobble, 0.96 + edgeWobble, distFromCenter);
  if (edgeAlpha < 0.40) discard;

  // Domain-warped vertically stretched flowing foam strands (organic current, zero dots)
  float warp = (vnoise(vec2(vUv.x * 5.0 + uSeed, vUv.y * 4.0 + uTime * 0.85)) - 0.5) * 0.65;
  float strandA = vnoise(vec2(vUv.x * 9.5 + warp + uSeed * 2.3, vUv.y * 2.8 + uTime * 1.45));
  float strandB = vnoise(vec2(vUv.x * 16.5 - warp * 0.6 + uSeed * 5.1, vUv.y * 4.6 + uTime * 2.15));
  float flow = strandA * 0.58 + strandB * 0.42;

  float crestFoam = smoothstep(0.86, 0.99, vUv.y) * (0.55 + strandB * 0.55);
  float plungeFoam = (1.0 - smoothstep(0.02, 0.25, vUv.y)) * (0.65 + strandA * 0.45);
  float sideSpray = smoothstep(0.45, 0.92, distFromCenter) * (0.45 + strandB * 0.55);

  float midBand = smoothstep(0.40, 0.58, flow + sideSpray * 0.22);
  float whiteRibbon = smoothstep(0.66, 0.78, flow + sideSpray * 0.35 + crestFoam * 0.82 + plungeFoam * 0.92);

  vec3 deepCol = uDeepColor * 0.92;
  vec3 midCol = mix(uDeepColor, uFoamColor, 0.44);
  vec3 col = mix(deepCol, midCol, midBand);
  col = mix(col, uFoamColor, whiteRibbon);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

function createBox(w, h, d, matOrColor, castShadow = true, receiveShadow = true) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = typeof matOrColor === 'string' ? createPixelToonMaterial({ color: matOrColor }) : matOrColor;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

function createCylinder(rTop, rBot, h, segs, matOrColor, castShadow = true, receiveShadow = true) {
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, segs);
  const mat = typeof matOrColor === 'string' ? createPixelToonMaterial({ color: matOrColor }) : matOrColor;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

function buildSculptedIsland({
  cx,
  cz,
  hx,
  hz,
  cornerR,
  topY,
  bottomY,
  topMaterial,
  cliffMaterial,
  seed = 1,
  perimCount = 64,
}) {
  const group = new THREE.Group();
  const hash = (n) => {
    const x = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  const perim = [];
  const innerX = Math.max(0.1, hx - cornerR);
  const innerZ = Math.max(0.1, hz - cornerR);

  for (let i = 0; i < perimCount; i++) {
    const a = (i / perimCount) * Math.PI * 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const sx = Math.abs(dx) / hx;
    const sz = Math.abs(dz) / hz;
    const scale = 1 / Math.max(sx, sz);
    const bx = dx * scale;
    const bz = dz * scale;
    const cxC = Math.max(-innerX, Math.min(innerX, bx));
    const czC = Math.max(-innerZ, Math.min(innerZ, bz));
    const ox = bx - cxC;
    const oz = bz - czC;
    const oLen = Math.hypot(ox, oz);
    let vx = bx;
    let vz = bz;
    if (oLen > 1e-4) {
      vx = cxC + (ox / oLen) * cornerR;
      vz = czC + (oz / oLen) * cornerR;
    }
    const jag = 1 + (hash(i) - 0.5) * 0.04;
    perim.push({ x: cx + vx * jag, z: cz + vz * jag, nx: dx, nz: dz });
  }

  const topPos = [cx, topY, cz];
  const topUv = [cx * 0.2, cz * 0.2];
  const topIdx = [];
  for (let i = 0; i < perimCount; i++) {
    const p = perim[i];
    topPos.push(p.x, topY, p.z);
    topUv.push(p.x * 0.2, p.z * 0.2);
  }
  for (let i = 0; i < perimCount; i++) {
    const next = (i + 1) % perimCount;
    topIdx.push(0, 1 + next, 1 + i);
  }
  const topGeo = new THREE.BufferGeometry();
  topGeo.setAttribute('position', new THREE.Float32BufferAttribute(topPos, 3));
  topGeo.setAttribute('uv', new THREE.Float32BufferAttribute(topUv, 2));
  topGeo.setIndex(topIdx);
  topGeo.computeVertexNormals();
  const topMesh = new THREE.Mesh(topGeo, topMaterial);
  topMesh.receiveShadow = true;
  topMesh.castShadow = true;
  group.add(topMesh);

  const rimMat = createPixelToonMaterial({ color: '#566d2e' });
  const rimPos = [];
  const rimIdx = [];
  for (let i = 0; i < perimCount; i++) {
    const p = perim[i];
    rimPos.push(p.x, topY, p.z);
  }
  for (let i = 0; i < perimCount; i++) {
    const p = perim[i];
    rimPos.push(
      cx + (p.x - cx) * 1.015,
      topY - 0.34 - hash(i + 7) * 0.14,
      cz + (p.z - cz) * 1.015
    );
  }
  for (let i = 0; i < perimCount; i++) {
    const next = (i + 1) % perimCount;
    const a0 = i;
    const a1 = next;
    const b0 = perimCount + i;
    const b1 = perimCount + next;
    rimIdx.push(a0, a1, b1);
    rimIdx.push(a0, b1, b0);
  }
  const rimGeo = new THREE.BufferGeometry();
  rimGeo.setAttribute('position', new THREE.Float32BufferAttribute(rimPos, 3));
  rimGeo.setIndex(rimIdx);
  rimGeo.computeVertexNormals();
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  rimMesh.castShadow = true;
  rimMesh.receiveShadow = true;
  group.add(rimMesh);

  const cliffPos = [];
  const cliffUv = [];
  const cliffIdx = [];
  const wallRings = [
    { scale: 1.01, y: topY - 0.32, v: 0.0 },
    { scale: 0.94, y: (topY + bottomY) * 0.54, v: 1.2 },
    { scale: 0.72, y: bottomY, v: 2.5 },
  ];
  for (let r = 0; r < wallRings.length; r++) {
    const wr = wallRings[r];
    for (let i = 0; i <= perimCount; i++) {
      const p = perim[i % perimCount];
      const noise = r > 0 ? (hash(i * 9 + r * 31) - 0.5) * 0.52 : 0;
      const rx = cx + (p.x - cx) * wr.scale + p.nx * noise;
      const rz = cz + (p.z - cz) * wr.scale + p.nz * noise;
      const ry = wr.y + (r === 1 ? (hash(i * 13) - 0.5) * 0.42 : 0);
      cliffPos.push(rx, ry, rz);
      cliffUv.push((i / perimCount) * 8.0, wr.v);
    }
  }
  const stride = perimCount + 1;
  for (let r = 0; r < wallRings.length - 1; r++) {
    for (let i = 0; i < perimCount; i++) {
      const a0 = r * stride + i;
      const a1 = r * stride + i + 1;
      const b0 = (r + 1) * stride + i;
      const b1 = (r + 1) * stride + i + 1;
      cliffIdx.push(a0, a1, b1);
      cliffIdx.push(a0, b1, b0);
    }
  }
  const cliffGeo = new THREE.BufferGeometry();
  cliffGeo.setAttribute('position', new THREE.Float32BufferAttribute(cliffPos, 3));
  cliffGeo.setAttribute('uv', new THREE.Float32BufferAttribute(cliffUv, 2));
  cliffGeo.setIndex(cliffIdx);
  cliffGeo.computeVertexNormals();
  const cliffMesh = new THREE.Mesh(cliffGeo, cliffMaterial);
  cliffMesh.castShadow = true;
  cliffMesh.receiveShadow = true;
  group.add(cliffMesh);

  return group;
}

export class WorldBuilder {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.pondSDF = buildPondSDFTexture(512);
    this.waterRipples = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -100, 0));
    this.rippleCursor = 0;
    this.waterMaterials = [];
    this.waterfallMaterials = [];
    this.shojiMaterials = [];
    this.chochinMaterials = [];
    this.chochins = [];
    this.lanterns = [];
    this.emaPlaques = [];
    this.emaGroup = null;
    this.shishiArm = null;
    this.shishiTimer = 4.0;
    this.shishiPhase = 'fill';
    this.onShishiKnock = null;
    this.bellGroup = null;
    this.strikerBeam = null;
    this.bellSwing = 0;
    this.strikerAnim = -1;
    this.bellFx = createBellResonanceManager(this.group);
    this.wildlife = null;
    this.clouds = [];
    this.gravelMarks = [];
    this.plungeFoams = [];

    // Puzzle prop visual handles
    this.pushStoneMesh = null;
    this.pushStoneTargetPos = new THREE.Vector3(PUSH_STONE_INITIAL.x, 0.5, PUSH_STONE_INITIAL.z);
    this.waterSocketMat = null;
    this.shishiRingMat = null;

    this.bambooCenterFlame = null;
    this.bambooCenterLight = null;
    this.bambooCenterRingMat = null;
    this.puzzleJizos = []; // { pivot, ringMat, targetYaw, currentYaw }

    this.braziers = []; // { id, flame, light, ringMat, lit }
    this.moonBridgeMeshes = []; // { mesh, mat, baseX, baseZ }

    this.sealObelisks = []; // { crystal, ringMat }
    this.bellLockGroup = null;
    this.flyingOrbs = [];

    this._waterSolved = false;
    this._bambooCenterLit = false;
    this.brazierFlashTimers = { sun: 0, amber: 0, moon: 0 };
    this.hintTimers = { water: 0, bamboo: 0, time: 0, belfry: 0 };

    this._initSharedMaterials();
    this._buildCloudSeaBackdrop();
    this._buildTerrainAndCliffs();
    this._buildWaterAndTwinWaterfall();
    this._buildStairsAndCourtyards();
    this._buildContinuousBridgesAndStones();
    this._buildToriiGates();
    this._buildTeaHouseAndZenGarden();
    this._buildShishiOdoshi();
    this._buildBambooPuzzleCenterAndJizos();
    this._buildBraziersAndMoonBridge();
    this._buildEmaPavilion();
    this._buildBellTowerAndObelisks();
    this._buildLanterns();
    this._buildLookoutsAndBenches();
    this._buildCumulusClouds();
  }

  _initSharedMaterials() {
    this.grassMat = createPixelToonMaterial({ color: '#ffffff', map: getGrassTurfTexture() });
    this.cliffMat = createPixelToonMaterial({ color: '#ffffff', map: getCliffRockTexture() });

    const stoneTex = getStoneMasonryTexture();
    this.stoneMat = createPixelToonMaterial({ color: '#ffffff', map: stoneTex });

    this.woodPlankMat = createPixelToonMaterial({ color: '#ffffff', map: getWoodPlankTexture() });

    const roofTex = getRoofTileTexture();
    roofTex.repeat.set(2, 2);
    this.roofTileMat = createPixelToonMaterial({ color: '#ffffff', map: roofTex });
  }

  _buildCloudSeaBackdrop() {
    this.cloudSeaMat = createCloudSeaMaterial();
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), this.cloudSeaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -12.8, 0);
    this.group.add(sea);
  }

  _buildTerrainAndCliffs() {
    this.group.add(
      buildSculptedIsland({
        cx: 0.5, cz: 31.5, hx: 13.5, hz: 7.2, cornerR: 3.6,
        topY: 0.0, bottomY: -10.5,
        topMaterial: this.grassMat, cliffMaterial: this.cliffMat, seed: 11,
      })
    );
    this.group.add(
      buildSculptedIsland({
        cx: -9.5, cz: 24.8, hx: 2.6, hz: 2.6, cornerR: 1.8,
        topY: 0.0, bottomY: -8.0,
        topMaterial: this.grassMat, cliffMaterial: this.cliffMat, seed: 12, perimCount: 28,
      })
    );
    this.group.add(
      buildSculptedIsland({
        cx: 11.6, cz: 23.0, hx: 2.3, hz: 2.2, cornerR: 0.8,
        topY: 0.0, bottomY: -7.5,
        topMaterial: this.grassMat, cliffMaterial: this.cliffMat, seed: 13, perimCount: 28,
      })
    );

    this.group.add(
      buildSculptedIsland({
        cx: -27.2, cz: 6.8, hx: 11.2, hz: 12.2, cornerR: 3.8,
        topY: 0.5, bottomY: -10.8,
        topMaterial: this.grassMat, cliffMaterial: this.cliffMat, seed: 22,
      })
    );

    this.group.add(
      buildSculptedIsland({
        cx: -29.0, cz: -15.5, hx: 10.5, hz: 8.8, cornerR: 3.2,
        topY: 0.65, bottomY: -10.6,
        topMaterial: this.grassMat, cliffMaterial: this.cliffMat, seed: 28,
      })
    );

    this.group.add(
      buildSculptedIsland({
        cx: 2.0, cz: 2.8, hx: 11.0, hz: 4.2, cornerR: 2.0,
        topY: 0.25, bottomY: -10.2,
        topMaterial: this.grassMat, cliffMaterial: this.cliffMat, seed: 33,
      })
    );

    this.group.add(
      buildSculptedIsland({
        cx: -11.4, cz: -13.0, hx: 8.2, hz: 4.5, cornerR: 1.8,
        topY: 2.9, bottomY: -10.5,
        topMaterial: this.grassMat, cliffMaterial: this.cliffMat, seed: 44,
      })
    );

    this.group.add(
      buildSculptedIsland({
        cx: 21.5, cz: 1.5, hx: 3.2, hz: 4.5, cornerR: 1.4,
        topY: 0.25, bottomY: -9.5,
        topMaterial: this.grassMat, cliffMaterial: this.cliffMat, seed: 48, perimCount: 36,
      })
    );
    this.group.add(
      buildSculptedIsland({
        cx: 21.5, cz: -11.2, hx: 3.2, hz: 3.2, cornerR: 1.4,
        topY: 2.9, bottomY: -10.0,
        topMaterial: this.grassMat, cliffMaterial: this.cliffMat, seed: 49, perimCount: 36,
      })
    );
    const slopeLen = Math.hypot(11.0, 2.65);
    const eastSlope = createBox(6.0, 1.8, slopeLen + 0.8, this.grassMat);
    eastSlope.position.set(21.5, 0.72, -4.0);
    eastSlope.rotation.x = Math.atan2(2.65, 11.0);
    this.group.add(eastSlope);

    const bamRampLen = Math.hypot(5.0, 2.25);
    const bamSlope = createBox(bamRampLen + 0.6, 2.2, 7.2, this.grassMat);
    bamSlope.position.set(-22.1, 0.72, -13.4);
    bamSlope.rotation.z = Math.atan2(2.25, 5.0);
    this.group.add(bamSlope);

    this.group.add(
      buildSculptedIsland({
        cx: -6.2, cz: -6.1, hx: 2.8, hz: 4.4, cornerR: 1.1,
        topY: 1.6, bottomY: -9.5,
        topMaterial: this.grassMat, cliffMaterial: this.cliffMat, seed: 51, perimCount: 36,
      })
    );
    this.group.add(
      buildSculptedIsland({
        cx: 6.8, cz: -6.1, hx: 3.2, hz: 4.5, cornerR: 1.3,
        topY: 1.8, bottomY: -9.5,
        topMaterial: this.grassMat, cliffMaterial: this.cliffMat, seed: 52, perimCount: 36,
      })
    );
    this.group.add(
      buildSculptedIsland({
        cx: 7.4, cz: -16.8, hx: 3.8, hz: 4.5, cornerR: 1.4,
        topY: 4.1, bottomY: -9.5,
        topMaterial: this.grassMat, cliffMaterial: this.cliffMat, seed: 53, perimCount: 36,
      })
    );

    this.group.add(
      buildSculptedIsland({
        cx: 0.0, cz: -30.5, hx: 23.5, hz: 9.8, cornerR: 4.2,
        topY: 5.4, bottomY: -11.2,
        topMaterial: this.grassMat, cliffMaterial: this.cliffMat, seed: 55, perimCount: 80,
      })
    );
    this.group.add(
      buildSculptedIsland({
        cx: 0.0, cz: -41.5, hx: 5.6, hz: 5.2, cornerR: 1.4,
        topY: 7.0, bottomY: -5.0,
        topMaterial: this.stoneMat, cliffMaterial: this.cliffMat, seed: 56, perimCount: 44,
      })
    );

    // Koi Lake Basin Bed tucked cleanly beneath lake
    const bedMat = createPixelToonMaterial({ color: '#919488' });
    const mainBed = createBox(42.0, 1.4, 24.5, bedMat, false, true);
    mainBed.position.set(1.0, POND_BED_Y - 0.7, 14.5);
    this.group.add(mainBed);

    const brookBed = createBox(8.5, 1.4, 16.0, bedMat, false, true);
    brookBed.position.set(15.6, POND_BED_Y - 0.7, -2.0);
    this.group.add(brookBed);

    this.group.add(
      buildSculptedIsland({
        cx: 1.0, cz: 14.5, hx: 21.8, hz: 12.2, cornerR: 6.5,
        topY: POND_BED_Y - 0.15, bottomY: -10.5,
        topMaterial: bedMat, cliffMaterial: this.cliffMat, seed: 65, perimCount: 64,
      })
    );
  }

  _buildWaterAndTwinWaterfall() {
    const sharedBounds = new THREE.Vector4(
      WORLD_BOUNDS.minX,
      WORLD_BOUNDS.maxX,
      WORLD_BOUNDS.minZ,
      WORLD_BOUNDS.maxZ
    );

    const makeWaterMat = (isMirror) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: globalToonUniforms.uTime,
          uPondSDF: { value: this.pondSDF },
          uWorldBounds: { value: sharedBounds },
          uDeepColor: { value: new THREE.Color('#5dc0e2') },
          uShallowColor: { value: new THREE.Color('#8ee1f7') },
          uFoamColor: { value: new THREE.Color('#f7fdff') },
          uHighlightColor: { value: new THREE.Color('#cef6ff') },
          uIsMirror: { value: isMirror ? 1.0 : 0.0 },
          uRipples: { value: this.waterRipples },
        },
        vertexShader: WATER_VERTEX_SHADER,
        fragmentShader: WATER_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: true,
      });
      this.waterMaterials.push(mat);
      return mat;
    };

    const pondW = WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX;
    const pondD = WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ;
    const lowerGeo = new THREE.PlaneGeometry(pondW, pondD, 1, 1);
    lowerGeo.rotateX(-Math.PI / 2);
    const lowerMesh = new THREE.Mesh(lowerGeo, makeWaterMat(false));
    lowerMesh.position.set(
      (WORLD_BOUNDS.minX + WORLD_BOUNDS.maxX) * 0.5,
      POND_WATER_Y,
      (WORLD_BOUNDS.minZ + WORLD_BOUNDS.maxZ) * 0.5
    );
    this.group.add(lowerMesh);

    // Mirror Sky Lagoon + Central Moon Sanctuary Islet
    const mirrorBed = createBox(14.5, 0.3, 11.5, createPixelToonMaterial({ color: '#6b94ab' }), false, true);
    mirrorBed.position.set(13.8, 5.02, -28.5);
    this.group.add(mirrorBed);

    const mirrorGeo = new THREE.PlaneGeometry(15.2, 12.2, 1, 1);
    mirrorGeo.rotateX(-Math.PI / 2);
    const mirrorMesh = new THREE.Mesh(mirrorGeo, makeWaterMat(true));
    mirrorMesh.position.set(13.8, MIRROR_WATER_Y, -28.5);
    this.group.add(mirrorMesh);

    // Central Moon Sanctuary Islet (14.2, -28.5)
    const moonIsletBase = createCylinder(MOON_ISLET.r, MOON_ISLET.r + 0.25, 0.55, 18, this.stoneMat);
    moonIsletBase.position.set(MOON_ISLET.x, 5.18, MOON_ISLET.z);
    this.group.add(moonIsletBase);

    const moonRing = new THREE.Mesh(
      new THREE.RingGeometry(MOON_ISLET.r - 0.22, MOON_ISLET.r - 0.05, 24),
      new THREE.MeshBasicMaterial({ color: '#9cc2ff', transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    moonRing.rotation.x = -Math.PI / 2;
    moonRing.position.set(MOON_ISLET.x, 5.47, MOON_ISLET.z);
    this.group.add(moonRing);

    // Two-Tier Organic Braided Waterfall + Animated Catch Basin & Moss Boulders
    const buildOrganicCascade = ({
      baseX,
      topY,
      botY,
      topZ,
      botZ,
      width,
      bendX,
      driftX,
      phase,
      seed,
    }) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: globalToonUniforms.uTime,
          uSeed: { value: seed },
          uDeepColor: { value: new THREE.Color('#5dc0e2') },
          uFoamColor: { value: new THREE.Color('#f7fdff') },
        },
        vertexShader: WATERFALL_VERTEX_SHADER,
        fragmentShader: WATERFALL_FRAGMENT_SHADER,
        side: THREE.DoubleSide,
      });
      this.waterfallMaterials.push(mat);

      const geo = new THREE.PlaneGeometry(1, 1, 14, 24);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i); // -0.5 .. +0.5 across width
        const vy = pos.getY(i); // +0.5 (top lip) .. -0.5 (bottom plunge)
        const t = Math.max(0, Math.min(1, 0.5 - vy));

        const cx = baseX + Math.sin(t * Math.PI * 1.35 + phase) * bendX + driftX * t;
        const wScale = 0.74 + Math.sin(t * Math.PI) * 0.14 + Math.pow(t, 1.45) * 0.52;
        const wy = THREE.MathUtils.lerp(topY - 0.02, botY - 0.14, Math.pow(t, 1.35));

        const archFwd = Math.sin(t * Math.PI * 0.5);
        const rockBump = Math.sin(t * Math.PI * 2.5 + seed) * 0.14 * Math.sin(t * Math.PI);
        const crossArch = Math.cos(vx * Math.PI) * 0.28 * (0.4 + 0.6 * Math.sin(t * Math.PI));
        const wz = THREE.MathUtils.lerp(topZ, botZ, archFwd) + rockBump + crossArch;

        pos.setXYZ(i, cx + vx * width * wScale, wy, wz);
      }
      geo.computeVertexNormals();
      this.group.add(new THREE.Mesh(geo, mat));
    };

    // Upper Tier Braided Streams (Mirror Lagoon -> Catch Basin)
    buildOrganicCascade({
      baseX: 15.15,
      topY: 5.35,
      botY: 1.98,
      topZ: -22.2,
      botZ: -16.4,
      width: 2.15,
      bendX: -0.52,
      driftX: 0.32,
      phase: 0.2,
      seed: 1.3,
    });
    buildOrganicCascade({
      baseX: 16.55,
      topY: 5.35,
      botY: 1.98,
      topZ: -22.1,
      botZ: -16.5,
      width: 1.15,
      bendX: 0.44,
      driftX: -0.22,
      phase: 1.1,
      seed: 3.7,
    });
    buildOrganicCascade({
      baseX: 13.85,
      topY: 5.33,
      botY: 1.98,
      topZ: -22.3,
      botZ: -16.7,
      width: 0.68,
      bendX: -0.34,
      driftX: 0.2,
      phase: 0.6,
      seed: 5.9,
    });

    // Middle Catch Basin Cliff + Animated Water Surface
    this.group.add(
      buildSculptedIsland({
        cx: 15.6,
        cz: -15.6,
        hx: 3.4,
        hz: 2.2,
        cornerR: 1.2,
        topY: 2.05,
        bottomY: -9.0,
        topMaterial: createPixelToonMaterial({ color: '#526c7d' }),
        cliffMaterial: this.cliffMat,
        seed: 71,
        perimCount: 28,
      })
    );
    const basinPoolGeo = new THREE.CircleGeometry(2.75, 24);
    basinPoolGeo.rotateX(-Math.PI / 2);
    const basinPool = new THREE.Mesh(basinPoolGeo, makeWaterMat(true));
    basinPool.position.set(15.6, 2.09, -15.6);
    basinPool.scale.set(1.26, 1.0, 0.84);
    this.group.add(basinPool);

    // Lower Tier Braided Streams (Catch Basin -> Lower Koi Pond under red bridge)
    buildOrganicCascade({
      baseX: 15.1,
      topY: 2.08,
      botY: -0.5,
      topZ: -13.9,
      botZ: -9.3,
      width: 2.35,
      bendX: 0.48,
      driftX: -0.25,
      phase: 0.4,
      seed: 2.4,
    });
    buildOrganicCascade({
      baseX: 16.6,
      topY: 2.06,
      botY: -0.5,
      topZ: -14.0,
      botZ: -9.5,
      width: 1.24,
      bendX: -0.38,
      driftX: 0.22,
      phase: 1.5,
      seed: 4.8,
    });

    // Moss-capped Cliff Framing & Stream-Splitting Boulders (strictly west of East Trail x <= 18.2)
    const mossCapMat = createPixelToonMaterial({ color: '#5c9c52' });
    const addMossBoulder = (x, y, z, r, rotY = 0) => {
      const bg = new THREE.Group();
      bg.position.set(x, y, z);
      bg.rotation.y = rotY;
      const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), this.cliffMat);
      rk.scale.set(1.18, 0.78, 1.06);
      rk.castShadow = true;
      rk.receiveShadow = true;
      bg.add(rk);

      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(r * 0.78, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
        mossCapMat
      );
      cap.position.set(0, r * 0.24, 0);
      cap.scale.set(1.08, 0.55, 0.98);
      bg.add(cap);
      this.group.add(bg);
    };

    const waterfallBoulders = [
      // Upper Mirror Lagoon lip & stream-divider boulder
      [12.6, 5.25, -22.0, 0.95, 0.4],
      [13.3, 5.18, -21.9, 0.65, 1.2],
      [15.95, 5.2, -21.95, 0.72, 2.1],
      [17.65, 5.26, -21.9, 0.92, 0.8],
      // Mid Catch-Basin rim & lower spillway divider boulder (capped below y=2.9 bridge)
      [12.9, 1.96, -16.6, 0.85, 1.6],
      [12.7, 1.92, -15.2, 0.72, 0.3],
      [17.8, 1.96, -15.9, 0.82, 2.5],
      [13.2, 1.88, -14.1, 0.78, 1.1],
      [15.95, 1.92, -14.0, 0.62, 0.7],
      [17.5, 1.9, -14.2, 0.72, 2.9],
      // Lower Plunge Pool rocky flanks
      [13.1, -0.3, -9.4, 0.82, 1.9],
      [17.7, -0.32, -9.6, 0.86, 0.5],
    ];
    waterfallBoulders.forEach(([x, y, z, r, rotY]) => addMossBoulder(x, y, z, r, rotY));

    // Crisp White Unlit Mist Puffs & Expanding Plunge Surface Foam Rings
    const mistMat = new THREE.MeshBasicMaterial({
      color: '#f3fcff',
      transparent: true,
      opacity: 0.74,
      depthWrite: false,
    });
    const foamCenters = [
      [15.45, 2.12, -15.95, 1.25],
      [15.45, POND_WATER_Y + 0.04, -9.2, 1.45],
    ];
    foamCenters.forEach(([fx, fy, fz, rad], cIdx) => {
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2;
        const size = 0.16 + (i % 3) * 0.075;
        const s = new THREE.Mesh(new THREE.SphereGeometry(size, 7, 6), mistMat.clone());
        s.position.set(fx + Math.cos(ang) * rad * 0.72, fy, fz + Math.sin(ang) * rad * 0.5);
        s.userData = {
          kind: 'mist',
          cx: fx,
          cy: fy,
          cz: fz,
          rad: rad * 0.78,
          baseAngle: ang,
          phase: i * 0.63 + cIdx * 2.1,
        };
        this.group.add(s);
        this.plungeFoams.push(s);
      }

      for (let rIdx = 0; rIdx < 3; rIdx++) {
        const rGeo = new THREE.RingGeometry(0.65, 0.95, 22);
        rGeo.rotateX(-Math.PI / 2);
        const rMat = new THREE.MeshBasicMaterial({
          color: '#f7fdff',
          transparent: true,
          opacity: 0.65,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const ring = new THREE.Mesh(rGeo, rMat);
        ring.position.set(fx, fy + 0.01, fz);
        ring.userData = {
          kind: 'ring',
          baseScale: 0.55 + rad * 0.45,
          phase: rIdx / 3 + cIdx * 0.18,
        };
        this.group.add(ring);
        this.plungeFoams.push(ring);
      }
    });

    const pondRocks = [
      [-6.2, POND_WATER_Y + 0.02, 12.6, 0.75],
      [2.4, POND_WATER_Y + 0.04, 9.5, 0.68],
      [-11.5, POND_WATER_Y + 0.03, 18.2, 0.72],
    ];
    pondRocks.forEach(([x, y, z, r], idx) => {
      const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), this.cliffMat);
      rk.position.set(x, y, z);
      rk.scale.set(1.2, 0.72, 1.05);
      rk.rotation.y = idx * 0.9;
      rk.castShadow = true;
      rk.receiveShadow = true;
      this.group.add(rk);
    });
  }

  _buildStairsAndCourtyards() {
    const cheekMat = createPixelToonMaterial({ color: '#a3977d' });

    const buildStairFlight = (width, zStart, zEnd, yStart, yEnd, steps) => {
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;
        const zMid = zStart + (zEnd - zStart) * ((t0 + t1) * 0.5);
        const yTop = yStart + (yEnd - yStart) * t1;
        const stepD = Math.abs(zEnd - zStart) / steps + 0.1;

        const block = new THREE.Mesh(new THREE.BoxGeometry(width, 0.55, stepD), this.stoneMat);
        block.position.set(0, yTop - 0.275, zMid);
        block.castShadow = true;
        block.receiveShadow = true;
        this.group.add(block);
      }
    };

    buildStairFlight(6.1, -1.2, -10.0, 0.25, 2.9, 18);
    const midLanding = createBox(8.6, 0.6, 2.8, this.stoneMat);
    midLanding.position.set(0, 2.9 - 0.3, -11.3);
    this.group.add(midLanding);
    buildStairFlight(6.1, -12.6, -20.7, 2.9, 5.4, 17);

    for (const side of [-1, 1]) {
      const lowWall = createBox(0.75, 1.35, 9.2, cheekMat);
      lowWall.position.set(side * 3.02, 1.25, -5.6);
      lowWall.rotation.x = Math.atan2(2.65, 8.8);
      this.group.add(lowWall);

      const upWall = createBox(0.75, 1.35, 8.6, cheekMat);
      upWall.position.set(side * 3.02, 3.85, -16.65);
      upWall.rotation.x = Math.atan2(2.5, 8.1);
      this.group.add(upWall);
    }

    buildStairFlight(5.4, -33.0, -37.0, 5.4, 7.0, 9);

    for (let i = 0; i < 10; i++) {
      const t1 = (i + 1) / 10;
      const xMid = -24.6 + ((i + 0.5) / 10) * 5.0;
      const yTop = 0.65 + t1 * 2.25;
      const step = createBox(0.62, 0.45, 6.2, this.stoneMat);
      step.position.set(xMid, yTop - 0.22, -13.4);
      this.group.add(step);
    }

    for (let i = 0; i < 16; i++) {
      const t1 = (i + 1) / 16;
      const zMid = 1.5 - ((i + 0.5) / 16) * 11.0;
      const yTop = 0.25 + t1 * 2.65;
      const step = createBox(5.4, 0.45, 0.8, this.stoneMat);
      step.position.set(21.5, yTop - 0.22, zMid);
      this.group.add(step);
    }

    const addStonePad = (cx, cz, y, w, d) => {
      const tex = getStoneMasonryTexture().clone();
      tex.needsUpdate = true;
      tex.repeat.set(Math.max(1, Math.round(w / 2.6)), Math.max(1, Math.round(d / 2.6)));
      const mat = createPixelToonMaterial({ color: '#ffffff', map: tex });
      const pad = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), mat);
      pad.position.set(cx, y - 0.05, cz);
      pad.receiveShadow = true;
      this.group.add(pad);
    };

    addStonePad(0.0, 32.0, 0.0, 7.2, 10.6);
    addStonePad(0.2, 2.0, 0.25, 13.5, 6.2);
    addStonePad(-9.2, -12.8, 2.9, 11.8, 5.2);
    addStonePad(0.0, -27.2, 5.4, 6.4, 12.2);
    addStonePad(0.0, -40.5, 7.0, 9.6, 8.2);

    // Bamboo Jizo Clearing stone courtyard
    const bambooRing = createCylinder(4.6, 4.7, 0.12, 20, this.stoneMat);
    bambooRing.position.set(BAMBOO_PUZZLE_CENTER.x, 0.65 - 0.03, BAMBOO_PUZZLE_CENTER.z);
    this.group.add(bambooRing);

    const medRing = createCylinder(4.2, 4.3, 0.12, 20, this.stoneMat);
    medRing.position.set(-12.8, 5.4 - 0.03, -31.2);
    this.group.add(medRing);

    addWoodenDeck(this.group, 0.0, 38.9, 0.14, 8.4, 3.0, this.woodPlankMat);
    addWoodenDeck(this.group, 11.6, 23.0, 0.1, 4.4, 4.2, this.woodPlankMat);
  }

  _buildContinuousBridgesAndStones() {
    const railRed = createPixelToonMaterial({ color: '#d83a2b' });
    const railWood = createPixelToonMaterial({ color: '#6b472e' });
    const railBamboo = createPixelToonMaterial({ color: '#7ea642' });
    const goldMat = createPixelToonMaterial({ color: '#f0c050' });

    BRIDGES.forEach((br) => {
      const segs = br.archLift > 0.5 ? 24 : 14;
      const dx = br.bx - br.ax;
      const dz = br.bz - br.az;
      const len = Math.hypot(dx, dz);
      const yaw = Math.atan2(dx, dz);
      const nx = Math.cos(yaw);
      const nz = -Math.sin(yaw);

      const positions = [];
      const uvs = [];
      const indices = [];
      const deckThick = 0.22;

      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const cx = br.ax + dx * t;
        const cz = br.az + dz * t;
        const cy = br.startY + (br.endY - br.startY) * t + br.archLift * 4 * t * (1 - t);
        const hw = br.halfWidth;

        positions.push(
          cx - nx * hw, cy, cz - nz * hw,
          cx + nx * hw, cy, cz + nz * hw,
          cx - nx * hw, cy - deckThick, cz - nz * hw,
          cx + nx * hw, cy - deckThick, cz + nz * hw
        );
        const vCoord = t * (len / 2.2);
        uvs.push(0, vCoord, 1, vCoord, 0, vCoord, 1, vCoord);
      }

      for (let i = 0; i < segs; i++) {
        const b0 = i * 4;
        const b1 = (i + 1) * 4;
        indices.push(b0 + 0, b0 + 1, b1 + 1);
        indices.push(b0 + 0, b1 + 1, b1 + 0);
        indices.push(b0 + 2, b1 + 3, b0 + 3);
        indices.push(b0 + 2, b1 + 2, b1 + 3);
        indices.push(b0 + 0, b1 + 0, b1 + 2);
        indices.push(b0 + 0, b1 + 2, b0 + 2);
        indices.push(b0 + 1, b1 + 3, b1 + 1);
        indices.push(b0 + 1, b0 + 3, b1 + 3);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();

      const deckMesh = new THREE.Mesh(geo, this.woodPlankMat);
      deckMesh.castShadow = true;
      deckMesh.receiveShadow = true;
      this.group.add(deckMesh);

      if (br.railingStyle === 'low-wood') {
        for (const side of [-1, 1]) {
          for (let i = 0; i <= segs; i += 5) {
            const t = i / segs;
            const px = br.ax + dx * t + nx * side * (br.halfWidth - 0.1);
            const pz = br.az + dz * t + nz * side * (br.halfWidth - 0.1);
            const py = br.startY + (br.endY - br.startY) * t;
            const post = createCylinder(0.08, 0.09, 0.85, 6, railWood);
            post.position.set(px, py - 0.35, pz);
            this.group.add(post);
          }
        }
        return;
      }

      const rMat = br.railingStyle === 'bamboo' ? railBamboo : railRed;
      const postStep = Math.max(2, Math.floor(segs / 5));
      for (const side of [-1, 1]) {
        let prevPt = null;
        for (let i = 0; i <= segs; i++) {
          const t = i / segs;
          const px = br.ax + dx * t + nx * side * (br.halfWidth - 0.08);
          const pz = br.az + dz * t + nz * side * (br.halfWidth - 0.08);
          const py = br.startY + (br.endY - br.startY) * t + br.archLift * 4 * t * (1 - t);

          if (i % postStep === 0 || i === segs) {
            const post = createBox(0.14, 0.78, 0.14, rMat);
            post.position.set(px, py + 0.36, pz);
            post.rotation.y = yaw;
            this.group.add(post);

            if (br.railingStyle === 'vermilion' && (i === 0 || i === segs || i === Math.floor(segs / 2))) {
              const cap = createBox(0.18, 0.13, 0.18, goldMat);
              cap.position.set(px, py + 0.8, pz);
              this.group.add(cap);
            }
          }

          const curPt = new THREE.Vector3(px, py + 0.66, pz);
          if (prevPt) {
            const segL = prevPt.distanceTo(curPt);
            const rail = createBox(0.12, 0.1, segL + 0.04, rMat);
            rail.position.copy(prevPt).lerp(curPt, 0.5);
            rail.lookAt(curPt);
            this.group.add(rail);
          }
          prevPt = curPt;
        }
      }
    });

    [
      [12.4, 17.6, 0.12],
      [10.6, 10.2, 0.12],
    ].forEach(([jx, jz, jy]) => {
      const pad = createCylinder(1.42, 1.42, 0.22, 12, this.woodPlankMat);
      pad.position.set(jx, jy - 0.11, jz);
      this.group.add(pad);
    });

    STEPPING_STONES.forEach((s, idx) => {
      const stone = new THREE.Mesh(
        new THREE.CylinderGeometry(s.visualR, s.visualR * 1.08, 0.65, 10),
        this.stoneMat
      );
      stone.position.set(s.x, s.y - 0.3, s.z);
      stone.rotation.y = idx * 0.85;
      stone.scale.set(1.06, 1, 0.92);
      stone.castShadow = true;
      stone.receiveShadow = true;
      this.group.add(stone);
    });
  }

  _createToriiGate(width = 6.04, height = 4.35, hasShimenawa = false) {
    const g = new THREE.Group();
    const vermilion = createPixelToonMaterial({ color: '#dc3a2b' });
    const darkBeam = createPixelToonMaterial({ color: '#24212c' });
    const gold = createPixelToonMaterial({ color: '#efc04c' });

    const halfW = width * 0.5;
    for (const side of [-1, 1]) {
      const col = createCylinder(0.24, 0.29, height, 10, vermilion);
      col.position.set(side * halfW, height * 0.5, 0);
      g.add(col);

      const boot = createCylinder(0.32, 0.35, 0.58, 10, darkBeam);
      boot.position.set(side * halfW, 0.29, 0);
      g.add(boot);
    }

    const nuki = createBox(width + 1.35, 0.26, 0.26, vermilion);
    nuki.position.set(0, height - 0.85, 0);
    g.add(nuki);

    const shimaki = createBox(width + 1.85, 0.28, 0.4, vermilion);
    shimaki.position.set(0, height - 0.08, 0);
    g.add(shimaki);

    const kasagiMid = createBox(width + 1.75, 0.28, 0.52, darkBeam);
    kasagiMid.position.set(0, height + 0.18, 0);
    g.add(kasagiMid);

    for (const side of [-1, 1]) {
      const tip = createBox(0.85, 0.24, 0.48, darkBeam);
      tip.position.set(side * (halfW + 1.05), height + 0.29, 0);
      tip.rotation.z = side * 0.22;
      g.add(tip);
    }

    const plaque = createBox(0.54, 0.68, 0.32, darkBeam);
    plaque.position.set(0, height - 0.45, 0);
    g.add(plaque);

    const emblem = createBox(0.22, 0.34, 0.35, gold);
    emblem.position.set(0, height - 0.45, 0);
    g.add(emblem);

    if (hasShimenawa) {
      const ropeMat = createPixelToonMaterial({ color: '#d9c58e' });
      const shideMat = createPixelToonMaterial({ color: '#faf7f0' });
      const ropeSegs = 9;
      for (let i = 0; i < ropeSegs; i++) {
        const t = (i / (ropeSegs - 1)) * 2 - 1;
        const rx = t * (halfW - 0.35);
        const sag = (1 - t * t) * 0.28;
        const thick = 0.09 + (1 - Math.abs(t)) * 0.08;
        const node = new THREE.Mesh(new THREE.SphereGeometry(thick, 7, 6), ropeMat);
        node.position.set(rx, height - 0.98 - sag, 0.18);
        g.add(node);

        if (i % 2 === 1) {
          const shide = createBox(0.11, 0.32, 0.03, shideMat);
          shide.position.set(rx, height - 1.25 - sag, 0.2);
          shide.rotation.z = (i % 4 === 1 ? 1 : -1) * 0.12;
          g.add(shide);
        }
      }
    }

    return g;
  }

  _buildToriiGates() {
    TORII_STAIR_Z.forEach((z, idx) => {
      const y = getHeightAt(0, z);
      const gate = this._createToriiGate(6.04, 4.35, idx === 0 || idx === TORII_STAIR_Z.length - 1);
      gate.position.set(0, y - 0.08, z);
      this.group.add(gate);
    });

    const wt1 = this._createToriiGate(3.4, 3.6, true);
    wt1.position.set(-1.5, POND_WATER_Y - 0.42, 15.8);
    wt1.rotation.y = -0.12;
    this.group.add(wt1);

    const wt2 = this._createToriiGate(3.2, 3.35, false);
    wt2.position.set(5.2, POND_WATER_Y - 0.42, 13.5);
    wt2.rotation.y = -0.22;
    this.group.add(wt2);
  }

  _buildTeaHouseAndZenGarden() {
    const woodDark = createPixelToonMaterial({ color: '#5e3e28' });
    const wallCream = createPixelToonMaterial({ color: '#ece1cc' });
    const tatamiMat = createPixelToonMaterial({ color: '#9eb162' });

    const shojiMat = createPixelToonMaterial({
      color: '#fff3d4',
      emissive: '#ffaa44',
      emissiveIntensity: 0.14,
    });
    this.shojiMaterials.push(shojiMat);

    const house = new THREE.Group();
    house.position.set(-29.7, 0.5, 2.4);

    const plinth = createBox(8.8, 0.36, 7.6, woodDark);
    plinth.position.set(0, 0.18, 0);
    house.add(plinth);

    const eastEngawa = createBox(2.9, 0.24, 6.8, this.woodPlankMat);
    eastEngawa.position.set(5.75, 0.1, 0.2);
    house.add(eastEngawa);

    const southEngawa = createBox(10.8, 0.24, 2.6, this.woodPlankMat);
    southEngawa.position.set(1.8, 0.1, 4.9);
    house.add(southEngawa);

    const step = createBox(1.8, 0.15, 0.8, this.stoneMat);
    step.position.set(2.2, 0.04, 6.45);
    house.add(step);

    const cushion = createBox(0.95, 0.1, 0.95, createPixelToonMaterial({ color: '#d04a36' }));
    cushion.position.set(5.8, 0.25, -0.3);
    house.add(cushion);
    const tray = createBox(0.7, 0.07, 0.52, woodDark);
    tray.position.set(5.8, 0.24, 0.85);
    house.add(tray);
    const teapot = createCylinder(0.13, 0.15, 0.18, 8, createPixelToonMaterial({ color: '#3b4e47' }));
    teapot.position.set(5.8, 0.35, 0.85);
    house.add(teapot);

    const room = createBox(8.0, 2.9, 6.9, wallCream);
    room.position.set(0, 1.8, 0);
    house.add(room);

    const eastShoji = createBox(0.16, 2.15, 5.2, shojiMat);
    eastShoji.position.set(4.0, 1.55, 0.0);
    house.add(eastShoji);

    const southShoji = createBox(5.2, 2.05, 0.16, shojiMat);
    southShoji.position.set(0.3, 1.6, 3.45);
    house.add(southShoji);

    // Timber frame & lattice mullions
    for (const px of [-3.9, 0, 3.9]) {
      for (const pz of [-3.35, 3.35]) {
        const post = createBox(0.24, 3.05, 0.24, woodDark);
        post.position.set(px, 1.85, pz);
        house.add(post);
      }
    }
    for (const pz of [-2.8, 0.4, 5.8]) {
      const p = createBox(0.2, 2.75, 0.2, woodDark);
      p.position.set(6.85, 1.6, pz);
      house.add(p);
    }

    // Layered Irimoya Japanese roof with timber rafters & ridge finials
    const eaveTrim = createBox(12.6, 0.24, 10.8, woodDark);
    eaveTrim.position.set(1.2, 3.25, 0.6);
    house.add(eaveTrim);

    const lowerRoof = createBox(13.0, 0.28, 11.2, this.roofTileMat);
    lowerRoof.position.set(1.2, 3.45, 0.6);
    house.add(lowerRoof);

    const upperHipRoof = new THREE.Mesh(new THREE.ConeGeometry(7.6, 2.35, 4), this.roofTileMat);
    upperHipRoof.position.set(0.6, 4.7, 0.4);
    upperHipRoof.rotation.y = Math.PI / 4;
    upperHipRoof.scale.set(1.28, 1.0, 1.02);
    upperHipRoof.castShadow = true;
    upperHipRoof.receiveShadow = true;
    house.add(upperHipRoof);

    const ridge = createBox(4.8, 0.34, 0.48, createPixelToonMaterial({ color: '#272f40' }));
    ridge.position.set(0.6, 5.88, 0.4);
    house.add(ridge);

    for (const sx of [-1.8, 3.0]) {
      const onigawara = createBox(0.4, 0.42, 0.56, createPixelToonMaterial({ color: '#394359' }));
      onigawara.position.set(sx, 5.95, 0.4);
      house.add(onigawara);
    }

    const chochinMat = createPixelToonMaterial({
      color: '#eb4934',
      emissive: '#ff5d38',
      emissiveIntensity: 0.45,
    });
    this.chochinMaterials.push(chochinMat);
    [
      [6.85, 2.55, 2.8],
      [2.6, 2.55, 5.85],
    ].forEach(([cx, cy, cz], idx) => {
      const ch = new THREE.Group();
      ch.position.set(cx, cy, cz);
      const cord = createCylinder(0.02, 0.02, 0.4, 4, woodDark);
      cord.position.set(0, -0.2, 0);
      ch.add(cord);
      const lanternBody = createCylinder(0.2, 0.2, 0.44, 10, chochinMat);
      lanternBody.position.set(0, -0.5, 0);
      ch.add(lanternBody);
      ch.userData = { phase: idx * 1.4 };
      house.add(ch);
      this.chochins.push(ch);
    });

    const tatami = createBox(0.5, 0.08, 4.8, tatamiMat);
    tatami.position.set(3.8, 0.39, 0);
    house.add(tatami);

    this.group.add(house);

    // Karesansui Zen Gravel Garden + Puzzle 1 (Water Rune Socket & Pushable Stone!)
    const gravelTex = createRakedGravelTexture(ZEN_GARDEN_BOUNDS, ZEN_FIXED_ROCKS);
    const gravelMat = createPixelToonMaterial({ color: '#ffffff', map: gravelTex });
    const gravelPlane = new THREE.Mesh(new THREE.PlaneGeometry(12.8, 7.2), gravelMat);
    gravelPlane.rotation.x = -Math.PI / 2;
    gravelPlane.position.set(-28.8, 0.515, 14.0);
    gravelPlane.receiveShadow = true;
    this.group.add(gravelPlane);

    const borderParts = [
      [-28.8, 10.35, 13.0, 0.18],
      [-28.8, 17.65, 13.0, 0.18],
      [-35.25, 14.0, 0.18, 7.4],
      [-22.35, 14.0, 0.18, 7.4],
    ];
    borderParts.forEach(([x, z, w, d]) => {
      const b = createBox(w, 0.18, d, woodDark);
      b.position.set(x, 0.56, z);
      this.group.add(b);
    });

    const mossMat = createPixelToonMaterial({ color: '#647f35' });
    ZEN_FIXED_ROCKS.forEach((rk, i) => {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(rk.r, 1), this.cliffMat);
      m.position.set(rk.x, 0.5 + rk.r * 0.45, rk.z);
      m.scale.set(1.1, 0.9, 0.95);
      m.rotation.y = i * 1.1;
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);

      const moss = new THREE.Mesh(new THREE.DodecahedronGeometry(rk.r * 0.55, 1), mossMat);
      moss.position.set(rk.x - 0.15, 0.65, rk.z + 0.15);
      moss.scale.set(1.2, 0.45, 1.1);
      this.group.add(moss);
    });

    // Etched Water Rune Socket at PUSH_STONE_TARGET
    this.waterSocketMat = new THREE.MeshBasicMaterial({
      color: '#5ad8ff',
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
    });
    const runeOuter = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.86, 16), this.waterSocketMat);
    runeOuter.rotation.x = -Math.PI / 2;
    runeOuter.position.set(PUSH_STONE_TARGET.x, 0.535, PUSH_STONE_TARGET.z);
    this.group.add(runeOuter);

    const runeCore = new THREE.Mesh(new THREE.CircleGeometry(0.35, 12), this.waterSocketMat);
    runeCore.rotation.x = -Math.PI / 2;
    runeCore.position.set(PUSH_STONE_TARGET.x, 0.538, PUSH_STONE_TARGET.z);
    this.group.add(runeCore);

    // Pushable Carved Iwakura Stone
    const pushG = new THREE.Group();
    pushG.position.set(PUSH_STONE_INITIAL.x, 0.5, PUSH_STONE_INITIAL.z);
    const pBase = createBox(1.06, 0.34, 1.06, this.stoneMat);
    pBase.position.set(0, 0.17, 0);
    pushG.add(pBase);

    const pCore = createCylinder(0.42, 0.48, 0.72, 8, createPixelToonMaterial({ color: '#78808a' }));
    pCore.position.set(0, 0.68, 0);
    pushG.add(pCore);

    const pSigil = createCylinder(
      0.44,
      0.44,
      0.12,
      8,
      createPixelToonMaterial({ color: '#5ad8ff', emissive: '#3dbfff', emissiveIntensity: 0.55 })
    );
    pSigil.position.set(0, 0.72, 0);
    pushG.add(pSigil);

    const pCap = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8), mossMat);
    pCap.position.set(0, 1.05, 0);
    pCap.scale.set(1.1, 0.52, 1.1);
    pushG.add(pCap);

    this.pushStoneMesh = pushG;
    this.group.add(pushG);
  }

  _buildShishiOdoshi() {
    const bambooMat = createPixelToonMaterial({ color: '#8ba848' });
    const bambooDark = createPixelToonMaterial({ color: '#6b8535' });
    const stoneMat = createPixelToonMaterial({ color: '#787d84' });

    const g = new THREE.Group();
    g.position.set(-18.6, 0.5, -1.2);

    const basin = createCylinder(0.68, 0.58, 0.36, 10, stoneMat);
    basin.position.set(0, 0.18, 0);
    g.add(basin);

    const waterDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.52, 0.52, 0.05, 10),
      createPixelToonMaterial({ color: '#8be0f7' })
    );
    waterDisc.position.set(0, 0.35, 0);
    g.add(waterDisc);

    for (const sx of [-0.26, 0.26]) {
      const fork = createCylinder(0.05, 0.055, 0.85, 6, bambooDark);
      fork.position.set(sx, 0.42, 0.28);
      g.add(fork);
    }

    const spout = createCylinder(0.055, 0.055, 0.78, 6, bambooDark);
    spout.position.set(0, 0.9, -0.4);
    spout.rotation.x = Math.PI * 0.35;
    g.add(spout);

    const pivot = new THREE.Group();
    pivot.position.set(0, 0.72, 0.28);
    const arm = createCylinder(0.085, 0.085, 1.25, 8, bambooMat);
    arm.rotation.x = Math.PI / 2;
    arm.position.set(0, 0, -0.12);
    pivot.add(arm);
    pivot.rotation.x = 0.28;
    g.add(pivot);
    this.shishiArm = pivot;

    const knockStone = createBox(0.28, 0.2, 0.28, stoneMat);
    knockStone.position.set(0, 0.1, 0.65);
    g.add(knockStone);

    this.shishiRingMat = new THREE.MeshBasicMaterial({
      color: '#5ad8ff',
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
    });
    const shishiRing = new THREE.Mesh(new THREE.RingGeometry(0.76, 0.94, 16), this.shishiRingMat);
    shishiRing.rotation.x = -Math.PI / 2;
    shishiRing.position.set(0, 0.03, 0);
    g.add(shishiRing);

    this.group.add(g);
  }

  _buildBambooPuzzleCenterAndJizos() {
    const stone = createPixelToonMaterial({ color: '#9c968b' });
    const stoneDark = createPixelToonMaterial({ color: '#78736a' });
    const bibRed = createPixelToonMaterial({ color: '#e23e2e' });
    const goldMat = createPixelToonMaterial({ color: '#f2c350' });

    // Central Bamboo Spirit Lantern at BAMBOO_PUZZLE_CENTER
    const cy = getHeightAt(BAMBOO_PUZZLE_CENTER.x, BAMBOO_PUZZLE_CENTER.z);
    const centerL = new THREE.Group();
    centerL.position.set(BAMBOO_PUZZLE_CENTER.x, cy, BAMBOO_PUZZLE_CENTER.z);

    this.bambooCenterRingMat = new THREE.MeshBasicMaterial({
      color: '#6effb8',
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
    });
    const centerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.68, 0.86, 16),
      this.bambooCenterRingMat
    );
    centerRing.rotation.x = -Math.PI / 2;
    centerRing.position.set(0, 0.03, 0);
    centerL.add(centerRing);

    const base = createCylinder(0.55, 0.65, 0.34, 8, stoneDark);
    base.position.set(0, 0.17, 0);
    centerL.add(base);

    const pillar = createCylinder(0.18, 0.22, 0.95, 8, stone);
    pillar.position.set(0, 0.8, 0);
    centerL.add(pillar);

    const firebox = createBox(0.58, 0.44, 0.58, stoneDark);
    firebox.position.set(0, 1.48, 0);
    centerL.add(firebox);

    this.bambooCenterFlame = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.24, 0),
      new THREE.MeshBasicMaterial({ color: '#6effb8' })
    );
    this.bambooCenterFlame.position.set(0, 1.48, 0);
    this.bambooCenterFlame.visible = false;
    centerL.add(this.bambooCenterFlame);

    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.65, 0.48, 6), stoneDark);
    cap.position.set(0, 1.94, 0);
    cap.castShadow = true;
    centerL.add(cap);

    this.bambooCenterLight = new THREE.PointLight('#6effb8', 0, 11, 1.5);
    this.bambooCenterLight.position.set(BAMBOO_PUZZLE_CENTER.x, cy + 1.6, BAMBOO_PUZZLE_CENTER.z);
    this.scene.add(this.bambooCenterLight);
    this.group.add(centerL);

    // 4 Rotatable Stone Jizo Statues around the Central Lantern
    PUZZLE_JIZO_SPOTS.forEach((sp) => {
      const y = getHeightAt(sp.x, sp.z);
      const root = new THREE.Group();
      root.position.set(sp.x, y, sp.z);

      const ringMat = new THREE.MeshBasicMaterial({
        color: '#889488',
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.56, 0.72, 16), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(0, 0.03, 0);
      root.add(ring);

      const pivot = new THREE.Group();
      const startYaw = sp.targetYaw + sp.initialSteps * (Math.PI * 0.5);
      pivot.rotation.y = startYaw;

      const turntable = createCylinder(0.52, 0.56, 0.22, 12, this.stoneMat);
      turntable.position.set(0, 0.11, 0);
      pivot.add(turntable);

      // Clear forward arrow cone on pedestal showing which way this Jizo faces!
      const pointer = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 4), goldMat);
      pointer.rotation.x = Math.PI * 0.5;
      pointer.position.set(0, 0.14, 0.58);
      pivot.add(pointer);

      const body = createCylinder(0.22, 0.28, 0.62, 10, stone);
      body.position.set(0, 0.52, 0);
      pivot.add(body);

      const bib = createCylinder(0.23, 0.26, 0.24, 10, bibRed);
      bib.position.set(0, 0.62, 0.03);
      pivot.add(bib);

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), stone);
      head.position.set(0, 0.96, 0);
      head.castShadow = true;
      pivot.add(head);

      const capJ = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
        bibRed
      );
      capJ.position.set(0, 1.0, 0);
      pivot.add(capJ);

      root.add(pivot);
      this.group.add(root);

      this.puzzleJizos.push({
        id: sp.id,
        pivot,
        ringMat,
        targetYaw: startYaw,
        currentYaw: startYaw,
      });
    });

    // Shimenawa ropes: each statue is tied to the one it drags along (clockwise ring).
    // A small paper shide near the far end shows which way the pull goes.
    this.jizoRopes = [];
    PUZZLE_JIZO_SPOTS.forEach((sp, i) => {
      const to = PUZZLE_JIZO_SPOTS[sp.link];
      const y0 = getHeightAt(sp.x, sp.z);
      const y1 = getHeightAt(to.x, to.z);
      const dir = new THREE.Vector3(to.x - sp.x, 0, to.z - sp.z).normalize();
      const a = new THREE.Vector3(sp.x + dir.x * 0.6, y0 + 0.32, sp.z + dir.z * 0.6);
      const b = new THREE.Vector3(to.x - dir.x * 0.6, y1 + 0.32, to.z - dir.z * 0.6);
      const mid = a.clone().lerp(b, 0.5);
      mid.y -= 0.18;
      const mat = createPixelToonMaterial({ color: '#c2412f', emissive: '#ff5a3c', emissiveIntensity: 0.12 });
      const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 14, 0.06, 5), mat);
      this.group.add(rope);
      // Zig-zag paper streamers hanging toward the dragged statue
      const shideMat = createPixelToonMaterial({ color: '#fbf6ea', side: THREE.DoubleSide });
      [0.62, 0.78].forEach((t) => {
        const p = new THREE.QuadraticBezierCurve3(a, mid, b).getPoint(t);
        const shide = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.3), shideMat);
        shide.position.set(p.x, p.y - 0.16, p.z);
        shide.rotation.y = Math.atan2(dir.x, dir.z);
        this.group.add(shide);
      });
      this.jizoRopes.push({ mat, glow: 0, index: i });
    });
  }

  pulseJizoRope(index) {
    const r = this.jizoRopes?.[index];
    if (r) r.glow = 1;
  }

  _buildBraziersAndMoonBridge() {
    const altarColors = {
      sun: { flame: '#ffd954', stone: '#c8b896' },
      amber: { flame: '#ff8a42', stone: '#b8a28c' },
      moon: { flame: '#9ecbff', stone: '#98a6c4' },
    };

    BRAZIER_SPOTS.forEach((sp) => {
      const y = getHeightAt(sp.x, sp.z);
      const pal = altarColors[sp.id];
      const g = new THREE.Group();
      g.position.set(sp.x, y, sp.z);

      const base = createCylinder(0.52, 0.62, 0.32, 8, this.stoneMat);
      base.position.set(0, 0.16, 0);
      g.add(base);

      const bowl = createCylinder(0.48, 0.3, 0.44, 8, createPixelToonMaterial({ color: pal.stone }));
      bowl.position.set(0, 0.54, 0);
      g.add(bowl);

      // Carved stone back stele with tactile Day / Dusk / Night emblem (no UI spoiler needed)
      const stele = createBox(0.76, 1.38, 0.18, this.stoneMat);
      stele.position.set(0, 0.69, -0.58);
      stele.castShadow = true;
      g.add(stele);

      const emblemMat = createPixelToonMaterial({
        color: pal.flame,
        emissive: pal.flame,
        emissiveIntensity: 0.28,
      });
      const emblemGroup = new THREE.Group();
      emblemGroup.position.set(0, 1.12, -0.45);
      if (sp.id === 'sun') {
        const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), emblemMat);
        const sunHalo = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.032, 6, 14), emblemMat);
        emblemGroup.add(sunDisc, sunHalo);
      } else if (sp.id === 'amber') {
        const horizonBar = createBox(0.44, 0.05, 0.06, this.stoneDarkMat || this.stoneMat);
        horizonBar.position.set(0, -0.05, 0);
        const halfSun = new THREE.Mesh(
          new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5),
          emblemMat
        );
        halfSun.position.set(0, -0.02, 0);
        emblemGroup.add(horizonBar, halfSun);
      } else {
        const crescent = new THREE.Mesh(
          new THREE.TorusGeometry(0.18, 0.044, 6, 14, Math.PI * 1.28),
          emblemMat
        );
        crescent.rotation.z = Math.PI * 0.72;
        emblemGroup.add(crescent);
      }
      g.add(emblemGroup);

      const flame = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.28, 0),
        new THREE.MeshBasicMaterial({ color: pal.flame })
      );
      flame.position.set(0, 0.95, 0);
      flame.visible = false;
      g.add(flame);

      const ringMat = new THREE.MeshBasicMaterial({
        color: pal.flame,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.65, 0.82, 16), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(0, 0.04, 0);
      g.add(ring);

      const light = new THREE.PointLight(pal.flame, 0, 10, 1.5);
      light.position.set(sp.x, y + 1.2, sp.z);
      this.scene.add(light);

      this.group.add(g);
      this.braziers.push({ id: sp.id, flame, light, ringMat, emblemMat, lit: false });
    });

    // 4 Moonlit Spirit Stepping-Stones across Mirror Sky Lagoon
    MOON_BRIDGE_STONES.forEach((m, idx) => {
      const mat = createPixelToonMaterial({
        color: '#c7dcff',
        emissive: '#6ea8ff',
        emissiveIntensity: 0.65,
      });
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.84, 0.36, 12), mat);
      stone.position.set(m.x, 4.65, m.z);
      stone.userData = { targetY: 4.65, phase: idx * 0.7 };
      this.group.add(stone);
      this.moonBridgeMeshes.push(stone);
    });
  }

  _buildEmaPavilion() {
    const wood = createPixelToonMaterial({ color: '#6b472e' });

    const rack = new THREE.Group();
    rack.position.set(-11.5, 2.9, -15.2);

    for (const sx of [-1.8, 0, 1.8]) {
      const post = createBox(0.2, 2.35, 0.2, wood);
      post.position.set(sx, 1.18, 0);
      rack.add(post);
    }
    const barTop = createBox(3.9, 0.14, 0.14, wood);
    barTop.position.set(0, 1.88, 0);
    rack.add(barTop);
    const barBot = createBox(3.9, 0.12, 0.12, wood);
    barBot.position.set(0, 1.25, 0);
    rack.add(barBot);

    const roof = createBox(4.3, 0.24, 1.25, this.roofTileMat);
    roof.position.set(0, 2.42, 0);
    rack.add(roof);

    this.emaGroup = rack;
    this.group.add(rack);

    const palette = ['#e8cb9d', '#f5b9c7', '#e9a36f', '#dcd0a8', '#f8dfa8'];
    for (let i = 0; i < 8; i++) {
      this._spawnEmaPlaqueAt(i, palette[i % palette.length]);
    }
  }

  _spawnEmaPlaqueAt(slotIndex, colorHex) {
    const row = Math.floor(slotIndex / 8);
    const col = slotIndex % 8;
    const x = -1.48 + col * 0.42;
    const y = row === 0 ? 1.65 : 1.04;
    const plaque = createBox(0.26, 0.3, 0.06, createPixelToonMaterial({ color: colorHex }));
    plaque.position.set(x, y, 0.09);
    plaque.userData = { phase: slotIndex * 1.1 };
    this.emaGroup.add(plaque);
    this.emaPlaques.push(plaque);
  }

  addEmaPlaque() {
    if (this.emaPlaques.length >= 16) {
      const idx = this.emaPlaques.length % 16;
      this.emaPlaques[idx].material.color.set('#f69fb6');
      return;
    }
    const colors = ['#f69fb6', '#f7cf86', '#f2e0b6', '#eda680'];
    this._spawnEmaPlaqueAt(this.emaPlaques.length, colors[this.emaPlaques.length % colors.length]);
  }

  _buildBellTowerAndObelisks() {
    const wood = createPixelToonMaterial({ color: '#5c3b26' });
    const bronze = createPixelToonMaterial({ color: '#4f6d60' });
    const logWood = createPixelToonMaterial({ color: '#8f6342' });

    const tower = new THREE.Group();
    tower.position.set(0, 7.0, -40.5);

    const pad = createBox(5.4, 0.24, 5.2, this.stoneMat);
    pad.position.set(0, 0.12, 0);
    tower.add(pad);

    for (const px of [-2.2, 2.2]) {
      for (const pz of [-1.9, 1.9]) {
        const post = createBox(0.3, 4.3, 0.3, wood);
        post.position.set(px, 2.25, pz);
        tower.add(post);
      }
    }

    const beamL = createBox(0.24, 0.28, 4.2, wood);
    beamL.position.set(-2.2, 4.05, 0);
    tower.add(beamL);
    const beamR = createBox(0.24, 0.28, 4.2, wood);
    beamR.position.set(2.2, 4.05, 0);
    tower.add(beamR);
    const crossBeam = createBox(4.8, 0.32, 0.32, wood);
    crossBeam.position.set(0, 4.1, 0);
    tower.add(crossBeam);

    const eave = createBox(6.6, 0.26, 6.2, this.roofTileMat);
    eave.position.set(0, 4.4, 0);
    tower.add(eave);

    const upperRoof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 2.15, 4), this.roofTileMat);
    upperRoof.position.set(0, 5.58, 0);
    upperRoof.rotation.y = Math.PI / 4;
    upperRoof.castShadow = true;
    upperRoof.receiveShadow = true;
    tower.add(upperRoof);

    const finial = createCylinder(0.08, 0.16, 0.65, 8, createPixelToonMaterial({ color: '#efc252' }));
    finial.position.set(0, 6.88, 0);
    tower.add(finial);

    const bellPivot = new THREE.Group();
    bellPivot.position.set(0, 3.98, 0);
    const hanger = createCylinder(0.08, 0.08, 0.55, 6, wood);
    hanger.position.set(0, -0.25, 0);
    bellPivot.add(hanger);

    const bellCrown = new THREE.Mesh(new THREE.SphereGeometry(0.58, 12, 8), bronze);
    bellCrown.position.set(0, -0.68, 0);
    bellCrown.castShadow = true;
    bellPivot.add(bellCrown);

    const bellBody = createCylinder(0.58, 0.72, 1.35, 14, bronze);
    bellBody.position.set(0, -1.32, 0);
    bellPivot.add(bellBody);

    const bellRim = createCylinder(0.74, 0.76, 0.2, 14, createPixelToonMaterial({ color: '#618070' }));
    bellRim.position.set(0, -1.98, 0);
    bellPivot.add(bellRim);

    tower.add(bellPivot);
    this.bellGroup = bellPivot;

    // Sacred Spirit Lock Rings around the Bonsho while sealed
    this.bellLockGroup = new THREE.Group();
    this.bellLockGroup.position.set(0, 2.45, 0);
    const lockMat = new THREE.MeshBasicMaterial({
      color: '#ffd782',
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 2; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.15 + i * 0.28, 0.045, 6, 24), lockMat);
      r.rotation.x = i === 0 ? 0.45 : -0.45;
      r.rotation.y = i * 0.8;
      this.bellLockGroup.add(r);
    }
    tower.add(this.bellLockGroup);

    const strikerPivot = new THREE.Group();
    strikerPivot.position.set(0, 3.85, 1.3);
    for (const rz of [-0.28, 0.28]) {
      const rope = createCylinder(0.03, 0.03, 1.75, 4, logWood);
      rope.position.set(0, -0.88, rz);
      strikerPivot.add(rope);
    }
    const strikerLog = createCylinder(0.13, 0.13, 1.45, 8, logWood);
    strikerLog.rotation.x = Math.PI / 2;
    strikerLog.position.set(0, -1.75, 0);
    strikerPivot.add(strikerLog);

    tower.add(strikerPivot);
    this.strikerBeam = strikerPivot;
    this.group.add(tower);

    // 3 Carved Seal Obelisks in front of Belfry Plaza (all 3 clearly visible on arrival)
    const obeliskDefs = [
      { x: -4.0, z: -37.6, color: '#5ad8ff' }, // Water Seal
      { x: 4.0, z: -37.6, color: '#6effb8' },  // Bamboo Seal
      { x: 0.0, z: -37.1, color: '#ffd978' },  // Time Seal
    ];
    obeliskDefs.forEach((ob) => {
      const obG = new THREE.Group();
      obG.position.set(ob.x, 7.0, ob.z);

      const ped = createBox(0.9, 0.35, 0.9, this.stoneMat);
      ped.position.set(0, 0.175, 0);
      obG.add(ped);

      const shaft = createBox(0.54, 1.5, 0.54, createPixelToonMaterial({ color: '#8f897d' }));
      shaft.position.set(0, 1.1, 0);
      obG.add(shaft);

      const cMat = new THREE.MeshBasicMaterial({ color: '#4c4f61' });
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), cMat);
      crystal.position.set(0, 2.28, 0);
      obG.add(crystal);

      const ringMat = new THREE.MeshBasicMaterial({
        color: ob.color,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
      });
      const baseRing = new THREE.Mesh(new THREE.RingGeometry(0.56, 0.72, 16), ringMat);
      baseRing.rotation.x = -Math.PI / 2;
      baseRing.position.set(0, 0.03, 0);
      obG.add(baseRing);

      const light = new THREE.PointLight(ob.color, 0, 7.5, 1.5);
      light.position.set(ob.x, 9.4, ob.z);
      this.scene.add(light);

      this.group.add(obG);
      this.sealObelisks.push({
        crystal,
        mat: cMat,
        ringMat,
        light,
        activeColor: ob.color,
        awakened: false,
        x: ob.x,
        y: 9.28,
        z: ob.z,
      });
    });
  }

  _buildLanterns() {
    const stone = createPixelToonMaterial({ color: '#9c9689' });
    const stoneDark = createPixelToonMaterial({ color: '#78736a' });

    LANTERN_SPOTS.forEach((sp, i) => {
      const y = getHeightAt(sp.x, sp.z);
      const g = new THREE.Group();
      g.position.set(sp.x, y, sp.z);

      const base = createBox(0.58, 0.24, 0.58, stoneDark);
      base.position.set(0, 0.12, 0);
      g.add(base);

      const post = createCylinder(0.15, 0.18, 0.78, 8, stone);
      post.position.set(0, 0.62, 0);
      g.add(post);

      const tray = createBox(0.54, 0.14, 0.54, stoneDark);
      tray.position.set(0, 1.05, 0);
      g.add(tray);

      for (const cx of [-0.18, 0.18]) {
        for (const cz of [-0.18, 0.18]) {
          const fp = createBox(0.075, 0.38, 0.075, stone);
          fp.position.set(cx, 1.3, cz);
          g.add(fp);
        }
      }

      const flame = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.24, 0.2),
        new THREE.MeshBasicMaterial({ color: '#ffbe58' })
      );
      flame.position.set(0, 1.29, 0);
      flame.visible = false;
      g.add(flame);

      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.36, 4), stoneDark);
      cap.position.set(0, 1.66, 0);
      cap.rotation.y = Math.PI / 4;
      cap.castShadow = true;
      g.add(cap);

      const knob = createCylinder(0.055, 0.095, 0.15, 8, stone);
      knob.position.set(0, 1.89, 0);
      g.add(knob);

      const light = new THREE.PointLight('#ffaa44', 0, 9.5, 1.65);
      light.position.set(sp.x, y + 1.45, sp.z);
      this.scene.add(light);

      this.group.add(g);
      this.lanterns.push({ index: i, x: sp.x, y, z: sp.z, light, flameMesh: flame, isLit: false });
    });
  }

  _buildLookoutsAndBenches() {
    const wood = createPixelToonMaterial({ color: '#8f603f' });
    const woodDark = createPixelToonMaterial({ color: '#5c3c26' });

    const buildRailing = (x0, x1, z0, z1, y, postsCount) => {
      const dx = x1 - x0;
      const dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      for (let i = 0; i <= postsCount; i++) {
        const t = i / postsCount;
        const post = createBox(0.15, 0.9, 0.15, woodDark);
        post.position.set(x0 + dx * t, y + 0.45, z0 + dz * t);
        this.group.add(post);
      }
      for (const h of [0.85, 0.5]) {
        const rail = createBox(0.12, 0.1, len + 0.1, wood);
        rail.position.set((x0 + x1) * 0.5, y + h, (z0 + z1) * 0.5);
        rail.lookAt(x1, y + h, z1);
        this.group.add(rail);
      }
    };

    buildRailing(-4.0, 4.0, 40.1, 40.1, 0.14, 5);
    buildRailing(-5.0, 5.0, -46.1, -46.1, 7.0, 6);

    const makeBench = (x, y, z, rotY) => {
      const b = new THREE.Group();
      b.position.set(x, y, z);
      b.rotation.y = rotY;
      const seat = createBox(2.0, 0.12, 0.65, wood);
      seat.position.set(0, 0.42, 0);
      b.add(seat);
      for (const lx of [-0.75, 0.75]) {
        const leg = createBox(0.14, 0.4, 0.52, woodDark);
        leg.position.set(lx, 0.2, 0);
        b.add(leg);
      }
      this.group.add(b);
    };

    makeBench(-1.5, 0.14, 39.0, 0);
    makeBench(-14.2, 2.9, -10.1, 0.2);
    makeBench(-35.5, 0.65, -19.6, 0.75);
  }

  _buildCumulusClouds() {
    this.cloudMaterial = createCloudMaterial();

    for (let i = 0; i < 60; i++) {
      const band = i % 3;
      const archetype = band === 0 ? 'tower' : band === 1 ? 'bank' : 'wisp';
      const cg = buildSculptedCumulusCluster(this.cloudMaterial, archetype, i * 3 + 1);

      const ringAngle = (i / 60) * Math.PI * 2 + band * 0.27;
      const dist =
        band === 0
          ? 46 + (i % 7) * 5.2
          : band === 1
          ? 24 + (i % 7) * 4.4
          : 28 + (i % 6) * 5.0;
      const x = Math.cos(ringAngle) * dist;
      const z = Math.sin(ringAngle) * dist - 4.0;
      const y =
        band === 0
          ? -7.6 - (i % 4) * 1.1
          : band === 1
          ? -9.8 - (i % 4) * 0.85
          : -3.2 - (i % 3) * 1.15;

      const sc = band === 0 ? 1.08 + (i % 3) * 0.16 : band === 1 ? 0.92 + (i % 3) * 0.12 : 0.85;
      cg.scale.setScalar(sc);
      cg.rotation.y = (i * 0.7) % (Math.PI * 2);
      cg.position.set(x, y, z);
      cg.userData = { speed: 0.42 + (i % 5) * 0.16, baseY: y, phase: i * 0.75 };
      this.group.add(cg);
      this.clouds.push(cg);
    }

    this.wildlife = buildAmbientWildlife(this.group, {
      butterflies: [
        { x: -3.5, y: 0.1, z: 32.0, color: '#ffe588', r: 2.8 },
        { x: 4.5, y: 0.2, z: 29.5, color: '#ffc0d9', r: 2.5 },
        { x: -24.5, y: 0.7, z: 8.5, color: '#a8f0ff', r: 2.6, kind: 'dragonfly' },
        { x: 21.5, y: 0.5, z: -4.0, color: '#fff2a6', r: 2.4 },
        { x: -8.5, y: 5.5, z: -29.5, color: '#ffd0df', r: 3.0 },
      ],
      sparrows: [
        { x: 3.4, y: 0.98, z: 40.1, yaw: -2.6 },
        { x: -12.6, y: 3.32, z: -9.8, yaw: 0.5 },
        { x: 18.6, y: 3.55, z: -12.2, yaw: -1.4 },
      ],
    });
  }

  // Puzzle Prop Visual Updaters
  setPushStoneTarget(x, z, isSolved) {
    this._waterSolved = Boolean(isSolved);
    this.pushStoneTargetPos.set(x, 0.5, z);
    if (this.pushStoneMesh && this._waterSolved) {
      this.pushStoneMesh.scale.setScalar(1);
    }
    if (this.waterSocketMat) {
      this.waterSocketMat.color.set(isSolved ? '#ffd76a' : '#5ad8ff');
      this.waterSocketMat.opacity = isSolved ? 0.98 : 0.78;
    }
  }

  setShishiActivated(active) {
    if (this.shishiRingMat) {
      this.shishiRingMat.opacity = active ? 0.94 : 0.34;
    }
  }

  setBambooCenterLit(lit) {
    this._bambooCenterLit = Boolean(lit);
    if (this.bambooCenterFlame) this.bambooCenterFlame.visible = lit;
    if (this.bambooCenterLight) this.bambooCenterLight.intensity = lit ? 4.2 : 0;
    if (this.bambooCenterRingMat) this.bambooCenterRingMat.opacity = lit ? 0.95 : 0.42;
  }

  setJizoRotation(index, yaw, aligned, immediate = false) {
    const j = this.puzzleJizos[index];
    if (!j) return;
    if (immediate) {
      j.targetYaw = yaw;
      j.currentYaw = yaw;
      j.pivot.rotation.y = yaw;
    } else {
      const TAU = Math.PI * 2;
      const delta = ((yaw - j.targetYaw) % TAU + TAU) % TAU;
      if (delta > 0.001) {
        j.targetYaw += delta;
      }
    }
    j.aligned = Boolean(aligned);
    j.ringMat.color.set(aligned ? '#6effb8' : '#889488');
    j.ringMat.opacity = aligned ? 0.95 : 0.65;
  }

  setBrazierLit(id, lit) {
    const b = this.braziers.find((item) => item.id === id);
    if (!b) return;
    b.lit = lit;
    b.flame.visible = lit;
    b.light.intensity = lit ? 4.0 : 0;
    b.ringMat.opacity = lit ? 0.95 : 0.45;
    if (b.emblemMat) {
      b.emblemMat.emissiveIntensity = lit ? 0.72 : 0.28;
    }
  }

  flashBrazierHint(brazierId) {
    if (brazierId in this.brazierFlashTimers) {
      this.brazierFlashTimers[brazierId] = 0.65;
    }
  }

  triggerHintPulse(puzzleKey) {
    if (puzzleKey in this.hintTimers) {
      this.hintTimers[puzzleKey] = 6.0;
    }
  }

  clearHintPulse(puzzleKey) {
    if (puzzleKey in this.hintTimers) {
      this.hintTimers[puzzleKey] = 0;
    }
  }

  setMoonBridgeVisual(active) {
    this.moonBridgeMeshes.forEach((m) => {
      m.userData.targetY = active ? 5.34 : 4.55;
    });
  }

  setSealAwakened(sealIndex, awakened) {
    const ob = this.sealObelisks[sealIndex];
    if (!ob) return;
    ob.awakened = Boolean(awakened);
    ob.mat.color.set(awakened ? ob.activeColor : '#4c4f61');
    if (ob.ringMat) ob.ringMat.opacity = awakened ? 0.95 : 0.34;
    if (ob.light) ob.light.intensity = awakened ? 2.6 : 0;
  }

  setBellUnsealed(unsealed) {
    if (this.bellLockGroup) {
      this.bellLockGroup.visible = !unsealed;
    }
  }

  launchSealOrb(fromPos, sealIndex) {
    const ob = this.sealObelisks[sealIndex];
    if (!ob) return;
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 10, 8),
      new THREE.MeshBasicMaterial({ color: ob.activeColor })
    );
    orb.position.copy(fromPos);
    this.scene.add(orb);
    this.flyingOrbs.push({
      mesh: orb,
      start: fromPos.clone(),
      end: new THREE.Vector3(ob.x, ob.y, ob.z),
      t: 0,
      sealIndex,
    });
  }

  addWaterRipple(x, z, time, strength = 1.0) {
    this.waterRipples[this.rippleCursor].set(x, z, time, strength);
    this.rippleCursor = (this.rippleCursor + 1) % this.waterRipples.length;
  }

  addGravelFootprint(x, z) {
    const geo = new THREE.RingGeometry(0.12, 0.28, 10);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: '#b4ab98',
      transparent: true,
      opacity: 0.65,
    });
    const mark = new THREE.Mesh(geo, mat);
    mark.position.set(x, 0.525, z);
    mark.userData = { age: 0, maxAge: 5.5 };
    this.group.add(mark);
    this.gravelMarks.push(mark);
    if (this.gravelMarks.length > 28) {
      const old = this.gravelMarks.shift();
      this.group.remove(old);
      old.geometry.dispose();
      old.material.dispose();
    }
  }

  toggleLantern(index, forceState = null) {
    const l = this.lanterns[index];
    if (!l) return false;
    l.isLit = forceState !== null ? forceState : !l.isLit;
    l.flameMesh.visible = l.isLit;
    l.light.intensity = l.isLit ? 3.5 : 0;
    return l.isLit;
  }

  getLitLanternCount() {
    return this.lanterns.reduce((acc, l) => acc + (l.isLit ? 1 : 0), 0);
  }

  triggerShishiOdoshi() {
    this.shishiPhase = 'tip';
    this.shishiTimer = 0;
  }

  ringBell() {
    this.strikerAnim = 0;
    this.bellFx.trigger(0, 7.2, -40.5, '#ffe29a');
  }

  update(dt, elapsed, playerPos) {
    // Smooth pushable zen stone slide
    if (this.pushStoneMesh) {
      this.pushStoneMesh.position.lerp(this.pushStoneTargetPos, 1 - Math.exp(-dt * 12));
    }

    // Smooth Jizo quarter-turn rotation
    for (let i = 0; i < this.puzzleJizos.length; i++) {
      const j = this.puzzleJizos[i];
      j.currentYaw += (j.targetYaw - j.currentYaw) * (1 - Math.exp(-dt * 11));
      j.pivot.rotation.y = j.currentYaw;
    }
    // Rope glow fades after a turn
    for (let i = 0; i < this.jizoRopes.length; i++) {
      const r = this.jizoRopes[i];
      if (r.glow > 0) {
        r.glow = Math.max(0, r.glow - dt * 1.6);
        r.mat.emissiveIntensity = 0.12 + r.glow * 0.9;
      }
    }

    // Moonlit stepping-stones float up/down cleanly
    for (let i = 0; i < this.moonBridgeMeshes.length; i++) {
      const m = this.moonBridgeMeshes[i];
      const bob = Math.sin(elapsed * 2.2 + m.userData.phase) * 0.04;
      m.position.y += (m.userData.targetY + bob - m.position.y) * (1 - Math.exp(-dt * 5.0));
    }

    // Belfry Seal Crystals & Lock Rings
    for (let i = 0; i < this.sealObelisks.length; i++) {
      const ob = this.sealObelisks[i];
      ob.crystal.rotation.y = elapsed * 1.4 + i;
      ob.crystal.position.y = 2.28 + Math.sin(elapsed * 2.4 + i) * 0.08;
    }
    if (this.bellLockGroup && this.bellLockGroup.visible) {
      this.bellLockGroup.rotation.y = elapsed * 0.7;
    }

    // Flying Spirit Orbs from solved puzzles -> Obelisks
    for (let i = this.flyingOrbs.length - 1; i >= 0; i--) {
      const fo = this.flyingOrbs[i];
      fo.t += dt * 0.65;
      if (fo.t >= 1) {
        this.setSealAwakened(fo.sealIndex, true);
        this.scene.remove(fo.mesh);
        fo.mesh.geometry.dispose();
        fo.mesh.material.dispose();
        this.flyingOrbs.splice(i, 1);
      } else {
        const s = fo.t;
        fo.mesh.position.lerpVectors(fo.start, fo.end, s);
        fo.mesh.position.y += Math.sin(s * Math.PI) * 9.5;
      }
    }

    // Braziers subtle flame bob, wrong-time hollow flash & dwell hint pulse
    for (let i = 0; i < this.braziers.length; i++) {
      const b = this.braziers[i];
      if (b.lit) {
        b.flame.rotation.y = elapsed * 2.2 + i;
        b.flame.scale.setScalar(0.95 + Math.sin(elapsed * 6.5 + i) * 0.1);
      } else {
        let lightBoost = 0;
        let ringOp = 0.45;
        let emblemGlow = 0.28;

        const ft = this.brazierFlashTimers[b.id] || 0;
        if (ft > 0) {
          this.brazierFlashTimers[b.id] = Math.max(0, ft - dt);
          const ratio = this.brazierFlashTimers[b.id] / 0.65;
          lightBoost = Math.max(lightBoost, 2.8 * ratio);
          ringOp = Math.max(ringOp, 0.45 + 0.52 * ratio);
          emblemGlow = Math.max(emblemGlow, 0.28 + 0.72 * ratio);
        }

        if (this.hintTimers.time > 0) {
          const wave = 0.5 + 0.5 * Math.sin(elapsed * 5.2 + i * 0.9);
          lightBoost = Math.max(lightBoost, 1.5 * wave);
          ringOp = Math.max(ringOp, 0.45 + 0.5 * wave);
          emblemGlow = Math.max(emblemGlow, 0.35 + 0.65 * wave);
        }

        b.light.intensity = lightBoost;
        b.ringMat.opacity = ringOp;
        if (b.emblemMat) b.emblemMat.emissiveIntensity = emblemGlow;
      }
    }

    // Subtle 3D hint shimmer pulses (triggered by Hint key/button or lingering in a puzzle zone)
    if (this.hintTimers.water > 0) {
      this.hintTimers.water = Math.max(0, this.hintTimers.water - dt);
      const wave = 0.5 + 0.5 * Math.sin(elapsed * 5.5);
      if (this.waterSocketMat) {
        this.waterSocketMat.opacity = this.hintTimers.water > 0 ? 0.55 + 0.45 * wave : (this._waterSolved ? 0.98 : 0.78);
      }
      if (this.pushStoneMesh && !this._waterSolved) {
        const sc = this.hintTimers.water > 0 ? 1 + 0.055 * wave : 1;
        this.pushStoneMesh.scale.setScalar(sc);
      }
    }

    if (this.hintTimers.bamboo > 0) {
      this.hintTimers.bamboo = Math.max(0, this.hintTimers.bamboo - dt);
      const wave = 0.5 + 0.5 * Math.sin(elapsed * 5.0);
      for (let i = 0; i < this.puzzleJizos.length; i++) {
        const j = this.puzzleJizos[i];
        j.ringMat.opacity =
          this.hintTimers.bamboo > 0 ? 0.45 + 0.55 * wave : j.aligned ? 0.95 : 0.65;
      }
      if (this.bambooCenterRingMat) {
        this.bambooCenterRingMat.opacity =
          this.hintTimers.bamboo > 0 ? 0.42 + 0.56 * wave : this._bambooCenterLit ? 0.95 : 0.42;
      }
      if (this.bambooCenterLight && !this._bambooCenterLit) {
        this.bambooCenterLight.intensity = this.hintTimers.bamboo > 0 ? 1.15 * wave : 0;
      }
    }

    if (this.hintTimers.time > 0) {
      this.hintTimers.time = Math.max(0, this.hintTimers.time - dt);
    }

    if (this.hintTimers.belfry > 0) {
      this.hintTimers.belfry = Math.max(0, this.hintTimers.belfry - dt);
      const wave = 0.5 + 0.5 * Math.sin(elapsed * 5.5);
      for (let i = 0; i < this.sealObelisks.length; i++) {
        const sc = this.hintTimers.belfry > 0 ? 1 + 0.22 * wave : 1;
        this.sealObelisks[i].crystal.scale.setScalar(sc);
      }
    }

    for (let i = 0; i < this.plungeFoams.length; i++) {
      const f = this.plungeFoams[i];
      const u = f.userData;
      if (u.kind === 'ring') {
        const cycle = (elapsed * 0.55 + u.phase) % 1;
        const sc = u.baseScale * (0.45 + cycle * 1.45);
        f.scale.set(sc, 1, sc * 0.72);
        f.material.opacity = (1 - cycle) * 0.62;
      } else {
        const cycle = (elapsed * 0.95 + u.phase) % 1;
        const ang = u.baseAngle + elapsed * 0.65;
        const rad = u.rad * (0.55 + cycle * 0.65);
        f.position.x = u.cx + Math.cos(ang) * rad;
        f.position.z = u.cz + Math.sin(ang) * rad * 0.62;
        f.position.y = u.cy + Math.sin(cycle * Math.PI) * 0.36;
        const puffScale = 0.65 + Math.sin(cycle * Math.PI) * 0.7;
        f.scale.setScalar(puffScale);
        f.material.opacity = Math.sin(cycle * Math.PI) * 0.76;
      }
    }

    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      c.position.x += c.userData.speed * dt;
      c.position.y = c.userData.baseY + Math.sin(elapsed * 0.42 + c.userData.phase) * 0.24;
      if (c.position.x > 96) c.position.x = -96;
    }

    this.wildlife?.update(dt, elapsed, playerPos);

    for (let i = 0; i < this.chochins.length; i++) {
      const ch = this.chochins[i];
      ch.rotation.z = Math.sin(elapsed * 1.9 + ch.userData.phase) * 0.08;
      ch.rotation.x = Math.cos(elapsed * 1.5 + ch.userData.phase) * 0.05;
    }

    for (let i = 0; i < this.emaPlaques.length; i++) {
      const p = this.emaPlaques[i];
      p.rotation.x = Math.sin(elapsed * 2.1 + p.userData.phase) * 0.12;
      p.rotation.z = Math.cos(elapsed * 1.7 + p.userData.phase) * 0.06;
    }

    if (this.shishiArm) {
      if (this.shishiPhase === 'fill') {
        this.shishiTimer -= dt;
        const fillProgress = 1 - Math.max(0, this.shishiTimer / 7.5);
        this.shishiArm.rotation.x = 0.28 - fillProgress * 0.34;
        if (this.shishiTimer <= 0) {
          this.shishiPhase = 'tip';
          this.shishiTimer = 0;
        }
      } else if (this.shishiPhase === 'tip') {
        this.shishiTimer += dt * 4.0;
        this.shishiArm.rotation.x = -0.06 - Math.sin(Math.min(1, this.shishiTimer) * Math.PI * 0.5) * 0.45;
        if (this.shishiTimer >= 1) {
          this.shishiPhase = 'return';
          this.shishiTimer = 0;
        }
      } else if (this.shishiPhase === 'return') {
        this.shishiTimer += dt * 5.2;
        this.shishiArm.rotation.x = -0.51 + Math.min(1, this.shishiTimer) * 0.79;
        if (this.shishiTimer >= 1) {
          this.shishiPhase = 'fill';
          this.shishiTimer = 7.5;
          if (this.onShishiKnock && playerPos) {
            const d = Math.hypot(playerPos.x - -18.6, playerPos.z - -1.2);
            if (d < 28) this.onShishiKnock(Math.max(0.15, 1 - d / 28));
          }
        }
      }
    }

    if (this.strikerAnim >= 0 && this.strikerBeam) {
      this.strikerAnim += dt;
      if (this.strikerAnim < 0.28) {
        this.strikerBeam.rotation.x = (this.strikerAnim / 0.28) * 0.38;
      } else if (this.strikerAnim < 0.46) {
        const k = (this.strikerAnim - 0.28) / 0.18;
        this.strikerBeam.rotation.x = 0.38 - k * 0.68;
        if (k > 0.85 && this.bellSwing === 0) this.bellSwing = 0.16;
      } else if (this.strikerAnim < 1.1) {
        const k = (this.strikerAnim - 0.46) / 0.64;
        this.strikerBeam.rotation.x = -0.3 * (1 - k);
      } else {
        this.strikerBeam.rotation.x = 0;
        this.strikerAnim = -1;
      }
    }

    if (this.bellGroup) {
      if (this.bellSwing > 0.001) {
        this.bellGroup.rotation.x = Math.sin(elapsed * 6.5) * this.bellSwing;
        this.bellSwing *= Math.exp(-dt * 1.4);
      } else {
        this.bellGroup.rotation.x = 0;
        this.bellSwing = 0;
      }
    }

    this.bellFx.update(dt);

    for (let i = 0; i < this.lanterns.length; i++) {
      const l = this.lanterns[i];
      if (l.isLit) {
        l.light.intensity = 3.3 + Math.sin(elapsed * 7.5 + i * 1.9) * 0.3;
        const s = 0.92 + Math.sin(elapsed * 11 + i) * 0.12;
        l.flameMesh.scale.set(1, s, 1);
      }
    }

    for (let i = this.gravelMarks.length - 1; i >= 0; i--) {
      const m = this.gravelMarks[i];
      m.userData.age += dt;
      const t = m.userData.age / m.userData.maxAge;
      if (t >= 1) {
        this.group.remove(m);
        m.geometry.dispose();
        m.material.dispose();
        this.gravelMarks.splice(i, 1);
      } else {
        m.material.opacity = 0.6 * (1 - t);
      }
    }
  }
}

function addWoodenDeck(group, x, z, y, w, d, mat) {
  const deck = createBox(w, 0.24, d, mat);
  deck.position.set(x, y - 0.11, z);
  group.add(deck);
}

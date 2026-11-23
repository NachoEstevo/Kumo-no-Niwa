import * as THREE from 'three';
import { getSnowGroundTexture } from '../../engine/PixelTextures.js';
import { createPixelToonMaterial } from '../../engine/ToonMaterials.js';
import {
  LevelTerrain,
  addStonePad,
  addWoodenDeck,
  buildAmbientWildlife,
  buildBambooCluster,
  buildBench,
  buildBridgeMesh,
  buildChochinGarland,
  buildCirclingBirds,
  buildCircularTerrace,
  buildCloudSeaAndCumulus,
  buildFenceLine,
  buildGroundFoliage,
  buildJapaneseBuilding,
  collectPropColliders,
  buildLanternProp,
  buildMossBoulders,
  buildNightAtmosphere,
  buildObelisksAndBell,
  buildOrganicCascade,
  buildOrganicTree,
  buildParticleField,
  buildProceduralPondSDF,
  buildSculptedTerrace,
  buildStairMesh,
  buildSteppingStoneMeshes,
  buildToriiGate,
  buildWaterPlane,
  createBox,
  createCylinder,
  createSharedMatSet,
  createTreeBillboardSet,
  disposeObject3D,
  roundedBoxSDF,
  updateCascades,
  updateClouds,
} from '../../world/WorldKit.js';

export function createChapter2({
  scene,
  audio,
  player,
  cat,
  dayCycle,
  onToast,
  onStateChange,
  onChapterComplete,
  onAction,
}) {
  const group = new THREE.Group();
  scene.add(group);
  const sceneLights = [];
  const mats = createSharedMatSet('#eef6fb', getSnowGroundTexture());
  const treeSet = createTreeBillboardSet();
  const cedarWoodMat = createPixelToonMaterial({ color: '#7a4f34' });
  const railMat = createPixelToonMaterial({ color: '#9c5a3c' });
  const bambooRailMat = createPixelToonMaterial({ color: '#6a8d52' });
  const vermMat = createPixelToonMaterial({ color: '#c44933' });
  const frostIceMat = createPixelToonMaterial({ color: '#ddf4ff', emissive: '#9ed8ff', emissiveIntensity: 0.12 });
  const shojiMat = createPixelToonMaterial({
    color: '#fff6de',
    emissive: '#ffbf6e',
    emissiveIntensity: 0.45,
  });
  const chochinMat = createPixelToonMaterial({
    color: '#ffdfd0',
    emissive: '#ff8a48',
    emissiveIntensity: 0.65,
  });

  // Puzzle 1: 3 Frozen Steam Valves snaking copper pipes into Steam Caldera
  const valvesOpen = [false, false, false];
  const frostCleared = () => valvesOpen[0] && valvesOpen[1] && valvesOpen[2];
  let sealSpring = false;

  // Puzzle 2: 3 Night Steam Vent Rune Altars (1, 2, 3 pips) around Central Caldera
  const ventsActivated = [false, false, false];
  let nextVentIdx = 0;
  let sealSteam = false;

  // Puzzle 3: Tiered Hinoki Bath + Mochi Warmth at Cedar Ryokan
  let bathWarmed = false;
  let sealHearth = false;

  let bellUnsealed = false;
  let chapterComplete = false;
  let progressVersion = 0;
  let curTimeId = dayCycle.getCurrentPreset().id;

  const CAT_HEARTH_SPOT = { x: 18.6, z: -10.6 };
  const BATH_POS = { x: 20.6, z: -5.2 };
  const BELFRY_BELL = { x: -19.2, z: -27.2 };

  const valveSpots = [
    { x: -17.8, y: 0.3, z: 28.2 },
    { x: -26.8, y: 1.0, z: 7.2 },
    { x: 22.8, y: 2.0, z: 19.2 },
  ];

  const ventSpots = [
    { x: -3.2, z: 14.2, y: 1.2, pips: 1 },
    { x: 4.6, z: 16.8, y: 1.2, pips: 2 },
    { x: 6.4, z: 7.2, y: 1.2, pips: 3 },
  ];

  const ONSEN_STONES = [
    { x: -7.4, z: 12.8, r: 1.65, visualR: 1.14, y: 0.98, surface: 'stone' },
    { x: -8.9, z: 13.7, r: 1.65, visualR: 1.1, y: 0.76, surface: 'stone' },
    { x: -10.5, z: 14.0, r: 1.65, visualR: 1.15, y: 0.6, surface: 'stone' },
    { x: -12.1, z: 13.6, r: 1.65, visualR: 1.1, y: 0.68, surface: 'stone' },
    { x: -13.4, z: 12.5, r: 1.65, visualR: 1.14, y: 0.84, surface: 'stone' },
    { x: -14.2, z: 11.1, r: 1.65, visualR: 1.12, y: 0.98, surface: 'stone' },
  ];

  const terraces = [
    {
      id: 'frost-gate',
      shape: 'box',
      cx: -14.0,
      cz: 32.0,
      hx: 9.5,
      hz: 5.8,
      cornerR: 2.8,
      y: 0.3,
      surface: 'grass',
      region: { id: 'frost-gate', jp: '雪の鳥居', en: 'Frost Gate' },
    },
    {
      id: 'steam-caldera',
      shape: 'circle',
      cx: 2.5,
      cz: 11.5,
      r: 10.8,
      y: 1.2,
      surface: 'stone',
      region: { id: 'steam-caldera', jp: '湯煙の釜', en: 'Steam Caldera' },
    },
    {
      id: 'monkey-springs',
      shape: 'circle',
      cx: -21.5,
      cz: 10.5,
      r: 9.2,
      y: 1.0,
      surface: 'grass',
      region: { id: 'monkey-springs', jp: '猿の湯だまり', en: 'Snow-Monkey Springs' },
    },
    {
      id: 'mineral-falls',
      shape: 'box',
      cx: 24.5,
      cz: 15.0,
      hx: 8.2,
      hz: 7.0,
      cornerR: 2.8,
      y: 2.0,
      surface: 'grass',
      region: { id: 'mineral-falls', jp: '湯滝の渓', en: 'Mineral Falls Gorge' },
    },
    {
      id: 'cedar-ryokan',
      shape: 'box',
      cx: 24.0,
      cz: -7.5,
      hx: 9.8,
      hz: 9.0,
      cornerR: 2.6,
      y: 3.1,
      surface: 'wood',
      region: { id: 'cedar-ryokan', jp: '杉の湯屋', en: 'Cedar Ryokan Cliff' },
    },
    {
      id: 'lantern-ridge',
      shape: 'circle',
      cx: 1.5,
      cz: -18.5,
      r: 7.4,
      y: 3.8,
      surface: 'stone',
      region: { id: 'lantern-ridge', jp: '灯籠の尾根', en: 'Lantern Ridge' },
    },
    {
      id: 'belfry-caldera',
      shape: 'circle',
      cx: -16.5,
      cz: -25.5,
      r: 9.6,
      y: 4.6,
      surface: 'stone',
      region: { id: 'belfry-caldera', jp: '雪見鐘楼', en: 'Snow-Cedar Belfry' },
    },
    {
      id: 'west-spur',
      shape: 'circle',
      cx: -21.5,
      cz: -7.5,
      r: 5.2,
      y: 2.6,
      surface: 'stone',
      region: { id: 'monkey-springs', jp: '猿の湯だまり', en: 'Snow-Monkey Springs' },
    },
  ];

  const terrain = new LevelTerrain({
    defaultRegion: { id: 'frost-gate', jp: '雪の鳥居', en: 'Frost Gate' },
    terraces,
    bridges: [
      // Zigzag Yatsuhashi deck (Frost Gate -> Steam Caldera)
      { ax: -6.6, az: 28.0, bx: -2.4, bz: 24.4, halfWidth: 1.5, startY: 0.3, endY: 0.6, archLift: 0.04, surface: 'wood' },
      { ax: -2.4, az: 24.4, bx: 2.2, bz: 23.8, halfWidth: 1.5, startY: 0.6, endY: 0.9, archLift: 0.04, surface: 'wood' },
      { ax: 2.2, az: 23.8, bx: 1.1, bz: 21.8, halfWidth: 1.5, startY: 0.9, endY: 1.2, archLift: 0.14, surface: 'wood' },
      // 2-segment Hidden Bamboo Footbridge (Steam Caldera -> Mineral Falls)
      { ax: 11.2, az: 13.6, bx: 15.2, bz: 15.8, halfWidth: 1.55, startY: 1.2, endY: 1.62, archLift: 0.16, surface: 'wood' },
      { ax: 15.2, az: 15.8, bx: 18.8, bz: 15.6, halfWidth: 1.55, startY: 1.62, endY: 2.0, archLift: 0.14, surface: 'wood' },
      // Elevated Cliffside Ryokan Loop
      { ax: 23.6, az: 8.2, bx: 23.2, bz: 1.35, halfWidth: 1.7, startY: 2.0, endY: 3.1, archLift: 0.04, surface: 'stone' },
      { ax: 9.2, az: 5.0, bx: 17.2, bz: -0.8, halfWidth: 1.75, startY: 1.2, endY: 3.1, archLift: 0.45, surface: 'wood' },
      // Gorge Skybridge -> Lantern Ridge -> Belfry Caldera
      { ax: 16.6, az: -13.2, bx: 6.8, bz: -17.2, halfWidth: 1.65, startY: 3.1, endY: 3.8, archLift: 0.38, surface: 'wood' },
      { ax: -5.2, az: -21.0, bx: -7.7, bz: -22.1, halfWidth: 1.9, startY: 3.8, endY: 4.6, archLift: 0.06, surface: 'stone' },
      // Western Return Shortcut Loop
      { ax: -19.1, az: -16.5, bx: -20.8, bz: -10.8, halfWidth: 1.55, startY: 4.6, endY: 2.6, archLift: 0.05, surface: 'wood' },
      { ax: -21.6, az: -2.5, bx: -21.8, bz: 3.0, halfWidth: 1.55, startY: 2.6, endY: 1.0, archLift: 0.05, surface: 'wood' },
    ],
    stones: ONSEN_STONES,
    circles: [
      ...valveSpots.map((v) => ({ x: v.x, z: v.z, r: 0.58 })),
      ...ventSpots.map((v) => ({ x: v.x, z: v.z, r: 0.6 })),
      // Central caldera cauldron manifold
      { x: 2.5, z: 11.5, r: 2.55 },
      // 2-tier snow monkey rock pools
      { x: -23.2, z: 12.2, r: 3.05 },
      { x: -20.4, z: 14.6, r: 2.05 },
      // Mineral falls plunge pool
      { x: 28.2, z: 14.8, r: 2.85 },
      // Ryokan rotenburo bath
      { x: BATH_POS.x, z: BATH_POS.z, r: 1.7 },
      // Obelisks & Onsen Bell
      { x: -14.6, z: -24.8, r: 0.56 },
      { x: -16.8, z: -22.2, r: 0.56 },
      { x: -15.0, z: -28.6, r: 0.52 },
      { x: BELFRY_BELL.x, z: BELFRY_BELL.z, r: 0.98 },
      // 4 Benches
      { x: -11.4, z: 35.6, r: 0.72 },
      { x: -17.6, z: 5.8, r: 0.72 },
      { x: 16.4, z: -13.2, r: 0.72 },
      { x: 3.2, z: -14.2, r: 0.72 },
    ],
    boxes: [
      { minX: 24.2, maxX: 33.2, minZ: -14.8, maxZ: -6.8 },
    ],
  });

  // Helper: frosted icicle eave trims
  const buildIcicleEaves = (x, y, z, width, yaw = 0, count = 8) => {
    const ig = new THREE.Group();
    ig.position.set(x, y, z);
    ig.rotation.y = yaw;
    for (let i = 0; i < count; i++) {
      const len = 0.28 + ((i * 7) % 4) * 0.08;
      const icicle = new THREE.Mesh(new THREE.ConeGeometry(0.055, len, 5), frostIceMat);
      icicle.rotation.x = Math.PI;
      icicle.position.set((i / (count - 1) - 0.5) * width, -len * 0.5, 0);
      ig.add(icicle);
    }
    group.add(ig);
  };

  // Cloud sea & cumulus
  const clouds = [];
  buildCloudSeaAndCumulus(group, clouds, -12.8, 54);

  // Sculpted organic snow & rock terraces
  group.add(buildSculptedTerrace({ cx: -14.0, cz: 32.0, hx: 9.5, hz: 5.8, cornerR: 2.8, topY: 0.3, topMat: mats.grassMat, cliffMat: mats.cliffMat, seed: 21 }));
  group.add(buildCircularTerrace({ cx: 2.5, cz: 11.5, r: 10.8, topY: 1.2, topMat: mats.stoneMat, cliffMat: mats.cliffMat, seed: 22 }));
  group.add(buildCircularTerrace({ cx: -21.5, cz: 10.5, r: 9.2, topY: 1.0, topMat: mats.grassMat, cliffMat: mats.cliffMat, seed: 23 }));
  group.add(buildSculptedTerrace({ cx: 24.5, cz: 15.0, hx: 8.2, hz: 7.0, cornerR: 2.8, topY: 2.0, topMat: mats.grassMat, cliffMat: mats.cliffMat, seed: 24 }));
  group.add(buildSculptedTerrace({ cx: 24.0, cz: -7.5, hx: 9.8, hz: 9.0, cornerR: 2.6, topY: 3.1, topMat: mats.woodPlankMat, cliffMat: mats.cliffMat, seed: 25 }));
  group.add(buildCircularTerrace({ cx: 1.5, cz: -18.5, r: 7.4, topY: 3.8, topMat: mats.stoneMat, cliffMat: mats.cliffMat, seed: 26 }));
  group.add(buildCircularTerrace({ cx: -16.5, cz: -25.5, r: 9.6, topY: 4.6, topMat: mats.stoneMat, cliffMat: mats.cliffMat, seed: 27 }));
  group.add(buildCircularTerrace({ cx: -21.5, cz: -7.5, r: 5.2, topY: 2.6, topMat: mats.stoneMat, cliffMat: mats.cliffMat, seed: 28 }));

  // Scenic stone & deck dressings
  addStonePad(group, -14.0, 32.0, 0.3, 8.0, 6.2);
  addStonePad(group, -16.5, -25.5, 4.6, 9.6, 8.6);
  addWoodenDeck(group, -11.4, 35.6, 0.3, 4.4, 2.8, mats.woodPlankMat);
  terrain.segments.push(buildFenceLine(group, { x0: -28.5, z0: 15.8, x1: -22.5, z1: 18.2, y: 1.0, posts: 4, mat: cedarWoodMat }));
  terrain.segments.push(buildFenceLine(group, { x0: 16.0, z0: -1.8, x1: 23.0, z1: 0.8, y: 3.1, posts: 5, mat: cedarWoodMat }));

  buildToriiGate(group, { x: -8.6, y: 0.3, z: 28.4, yaw: -0.58, color: '#c44933' });
  buildToriiGate(group, { x: -9.2, y: 4.6, z: -22.7, yaw: 1.15, scale: 0.92, color: '#c44933' });

  // Zigzag bend pilings & Bamboo elbow piling
  [
    [-2.4, 0.6, 24.4],
    [2.2, 0.9, 23.8],
    [15.2, 1.62, 15.8],
  ].forEach(([px, py, pz]) => {
    const pier = createCylinder(0.85, 1.05, py + 2.2, 8, mats.stoneMat);
    pier.position.set(px, (py - 2.2) * 0.5 - 0.06, pz);
    group.add(pier);
  });

  // Bridges, bamboo crossings & stairs
  buildBridgeMesh(group, { ax: -6.6, az: 28.0, bx: -2.4, bz: 24.4, halfWidth: 1.5, startY: 0.3, endY: 0.6, archLift: 0.04, woodMat: mats.woodPlankMat, railMat, railingStyle: 'low-wood' });
  buildBridgeMesh(group, { ax: -2.4, az: 24.4, bx: 2.2, bz: 23.8, halfWidth: 1.5, startY: 0.6, endY: 0.9, archLift: 0.04, woodMat: mats.woodPlankMat, railMat, railingStyle: 'low-wood' });
  buildBridgeMesh(group, { ax: 2.2, az: 23.8, bx: 1.1, bz: 21.8, halfWidth: 1.5, startY: 0.9, endY: 1.2, archLift: 0.14, woodMat: mats.woodPlankMat, railMat, railingStyle: 'low-wood' });
  buildBridgeMesh(group, { ax: 11.2, az: 13.6, bx: 15.2, bz: 15.8, halfWidth: 1.55, startY: 1.2, endY: 1.62, archLift: 0.16, woodMat: mats.woodPlankMat, railMat: bambooRailMat, railingStyle: 'low-wood' });
  buildBridgeMesh(group, { ax: 15.2, az: 15.8, bx: 18.8, bz: 15.6, halfWidth: 1.55, startY: 1.62, endY: 2.0, archLift: 0.14, woodMat: mats.woodPlankMat, railMat: bambooRailMat, railingStyle: 'low-wood' });
  buildStairMesh(group, { ax: 23.6, az: 8.2, bx: 23.2, bz: 1.35, width: 3.4, startY: 2.0, endY: 3.1, steps: 7, stoneMat: mats.stoneMat });
  buildBridgeMesh(group, { ax: 9.2, az: 5.0, bx: 17.2, bz: -0.8, halfWidth: 1.75, startY: 1.2, endY: 3.1, archLift: 0.45, woodMat: mats.woodPlankMat, railMat: vermMat, railingStyle: 'vermilion' });
  buildBridgeMesh(group, { ax: 16.6, az: -13.2, bx: 6.8, bz: -17.2, halfWidth: 1.65, startY: 3.1, endY: 3.8, archLift: 0.38, woodMat: mats.woodPlankMat, railMat: vermMat, railingStyle: 'vermilion' });
  buildStairMesh(group, { ax: -5.2, az: -21.0, bx: -7.7, bz: -22.1, width: 3.6, startY: 3.8, endY: 4.6, steps: 6, stoneMat: mats.stoneMat });
  buildBridgeMesh(group, { ax: -19.1, az: -16.5, bx: -20.8, bz: -10.8, halfWidth: 1.55, startY: 4.6, endY: 2.6, archLift: 0.05, woodMat: mats.woodPlankMat, railMat, railingStyle: 'low-wood' });
  buildBridgeMesh(group, { ax: -21.6, az: -2.5, bx: -21.8, bz: 3.0, halfWidth: 1.55, startY: 2.6, endY: 1.0, archLift: 0.05, woodMat: mats.woodPlankMat, railMat, railingStyle: 'low-wood' });

  // Sculpted curved stepping stones over hot spring river
  buildSteppingStoneMeshes(group, ONSEN_STONES, {
    stoneMat: mats.stoneMat,
    cliffMat: mats.cliffMat,
    capColor: '#eff7ff',
    height: 2.0,
  });

  // Steaming Geothermal River & Multi-Island SDF
  const bounds = { minX: -40, maxX: 40, minZ: -42, maxZ: 42 };
  const ripples = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -99, 0));
  const waterMaterials = [];
  const sdfTex = buildProceduralPondSDF(
    bounds,
    (wx, wz) => Math.hypot(wx * 0.92, wz * 0.88) < 36.5,
    (wx, wz) => {
      let d = 999;
      for (let i = 0; i < terraces.length; i++) {
        const t = terraces[i];
        const td =
          t.shape === 'circle'
            ? Math.hypot(wx - t.cx, wz - t.cz) - t.r
            : roundedBoxSDF(wx, wz, t.cx, t.cz, t.hx, t.hz, t.cornerR || 2.0);
        if (td < d) d = td;
      }
      return Math.max(0, d);
    }
  );
  buildWaterPlane({ group, w: 80, d: 84, cx: 0, cz: 0, y: -0.35, waterMaterials, sdfTex, bounds, ripples });

  // Mineral Falls Gorge: 2-Tier Basalt Waterfall
  const waterfallMaterials = [];
  const plungeFoams = [];
  group.add(buildSculptedTerrace({ cx: 31.2, cz: 11.8, hx: 3.4, hz: 2.8, cornerR: 1.4, topY: 7.4, topMat: mats.grassMat, cliffMat: mats.cliffMat, seed: 29 }));
  buildOrganicCascade(group, waterfallMaterials, plungeFoams, {
    x: 29.8,
    zTop: 12.6,
    yTop: 7.4,
    yBot: 2.02,
    dropDist: 2.6,
    width: 2.8,
    yaw: -0.42,
    seed: 1.7,
    cliffMat: mats.cliffMat,
    capColor: '#eff7ff',
  });
  buildOrganicCascade(group, waterfallMaterials, plungeFoams, {
    x: 27.6,
    zTop: 17.5,
    yTop: 2.02,
    yBot: -0.35,
    dropDist: 2.8,
    width: 2.3,
    yaw: 0.12,
    seed: 3.9,
    cliffMat: mats.cliffMat,
    capColor: '#eff7ff',
  });
  const fallsPool = new THREE.Mesh(
    new THREE.CylinderGeometry(2.75, 2.85, 0.24, 18),
    createPixelToonMaterial({ color: '#78dcf0', emissive: '#6ad2f0', emissiveIntensity: 0.16 })
  );
  fallsPool.position.set(28.2, 2.02, 14.8);
  const fallsRim = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.28, 7, 20), mats.cliffMat);
  fallsRim.rotation.x = Math.PI / 2;
  fallsRim.position.set(28.2, 2.06, 14.8);
  group.add(fallsPool, fallsRim);

  // Two-Tier Snow-Monkey Pools & 5 Bobbing Snow Macaques + Expanding Ripple Rings
  const monkeyWaterMat = createPixelToonMaterial({ color: '#7ad8f0', emissive: '#5ac8f0', emissiveIntensity: 0.18 });
  [
    [-23.2, 1.02, 12.2, 2.9],
    [-20.4, 0.92, 14.6, 1.9],
  ].forEach(([px, py, pz, pr]) => {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(pr, pr + 0.1, 0.24, 20), monkeyWaterMat);
    disc.position.set(px, py, pz);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(pr + 0.08, 0.3, 7, 20), mats.cliffMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(px, py + 0.08, pz);
    group.add(disc, rim);
  });

  // Sudare bamboo privacy fence + wooden bucket & folded towel on rock at Monkey Springs
  terrain.segments.push(buildFenceLine(group, { x0: -27.2, z0: 11.4, x1: -24.2, z1: 15.8, y: 1.0, posts: 4, mat: bambooRailMat, height: 1.35 }));
  const mBucket = createCylinder(0.24, 0.2, 0.28, 10, cedarWoodMat);
  mBucket.position.set(-22.2, 1.24, 9.2);
  const mTowel = createBox(0.32, 0.07, 0.24, createPixelToonMaterial({ color: '#fbfaf5' }));
  mTowel.position.set(-21.5, 1.18, 9.3);
  group.add(mBucket, mTowel);

  const monkeyFur = createPixelToonMaterial({ color: '#c4b29f' });
  const monkeyFace = createPixelToonMaterial({ color: '#ef9c8e' });
  const towelMat = createPixelToonMaterial({ color: '#fbfaf5' });
  const monkeys = [];
  const monkeyRipples = [];
  [
    [-24.2, 1.08, 11.4, 0.6],
    [-22.0, 1.08, 11.6, -0.8],
    [-23.9, 1.08, 13.4, 1.4],
    [-22.1, 1.08, 13.1, -1.9],
    [-20.4, 0.98, 14.5, 0.2],
  ].forEach(([mx, my, mz, myaw], idx) => {
    const mg = new THREE.Group();
    mg.position.set(mx, my, mz);
    mg.rotation.y = myaw;
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.36, 9, 8), monkeyFur);
    torso.position.y = 0.06;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 9, 8), monkeyFur);
    head.position.set(0, 0.42, 0.06);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 6), monkeyFace);
    face.position.set(0, 0.4, 0.21);
    const towel = createBox(0.26, 0.07, 0.22, towelMat);
    towel.position.set(0, 0.67, 0.02);
    mg.add(torso, head, face, towel);
    group.add(mg);
    monkeys.push({ mg, baseY: my, phase: idx * 1.3 });

    const rGeo = new THREE.RingGeometry(0.36, 0.44, 16);
    rGeo.rotateX(-Math.PI / 2);
    const rMat = new THREE.MeshBasicMaterial({ color: '#e8fbff', transparent: true, opacity: 0.45, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(rGeo, rMat);
    ring.position.set(mx, my + 0.08, mz);
    group.add(ring);
    monkeyRipples.push({ ring, rMat, phase: idx * 0.23 });
  });

  // Cedar Ryokan 2-Story Building + Frosted Icicle Eaves
  buildJapaneseBuilding(group, {
    x: 28.4,
    y: 3.1,
    z: -10.8,
    yaw: -0.48,
    w: 7.4,
    d: 5.8,
    h: 2.9,
    floors: 2,
    wallColor: '#eee3d1',
    woodColor: '#5c3c26',
    roofMat: mats.roofTileMat,
    woodPlankMat: mats.woodPlankMat,
    shojiMaterials: [shojiMat],
    engawa: true,
    norenColor: '#b83228',
  });
  buildIcicleEaves(25.4, 6.2, -9.2, 6.8, -0.48, 8);
  buildIcicleEaves(-19.2, 8.6, -24.8, 5.4, 0, 7);

  // Tiered Hinoki Cypress Rotenburo + Bamboo Kakehi Spout + Cedar Privacy Screen + Buckets & Towels
  const tubMat = createPixelToonMaterial({ color: '#613c24' });
  const tubWaterMat = createPixelToonMaterial({ color: '#588296', emissive: '#6ad2f0', emissiveIntensity: 0.16 });
  const bathGroup = new THREE.Group();
  bathGroup.position.set(BATH_POS.x, 3.1, BATH_POS.z);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.2, 8, 22), tubMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.24;
  const tubWater = new THREE.Mesh(new THREE.CylinderGeometry(1.44, 1.44, 0.16, 20), tubWaterMat);
  tubWater.position.y = 0.16;
  const headPool = createCylinder(0.82, 0.88, 0.45, 12, mats.stoneMat);
  headPool.position.set(1.2, 0.22, 1.0);
  const kakehi = createCylinder(0.06, 0.06, 1.4, 6, bambooRailMat);
  kakehi.rotation.z = Math.PI * 0.35;
  kakehi.position.set(1.1, 0.72, 0.65);
  const screen = createBox(3.4, 1.85, 0.14, cedarWoodMat);
  screen.position.set(0.8, 0.92, -1.65);
  screen.rotation.y = -0.3;
  for (const bx of [-0.5, 0.4]) {
    const oke = createCylinder(0.2, 0.18, 0.24, 10, cedarWoodMat);
    oke.position.set(bx, 0.12, 1.75);
    const fold = createBox(0.24, 0.06, 0.18, towelMat);
    fold.position.set(bx, 0.26, 1.75);
    bathGroup.add(oke, fold);
  }
  bathGroup.add(rim, tubWater, headPool, kakehi, screen);
  group.add(bathGroup);

  // Heated Hearth Cushion & Glowing Hibachi Brazier
  const hearthMat = createPixelToonMaterial({ color: '#d8553a', emissive: '#ff8a42', emissiveIntensity: 0.18 });
  const hearthRug = createBox(1.55, 0.12, 1.55, hearthMat);
  hearthRug.position.set(CAT_HEARTH_SPOT.x, 3.16, CAT_HEARTH_SPOT.z);
  const hibachi = createCylinder(0.32, 0.28, 0.38, 10, mats.stoneMat);
  hibachi.position.set(CAT_HEARTH_SPOT.x - 1.15, 3.3, CAT_HEARTH_SPOT.z);
  group.add(hearthRug, hibachi);

  // Grounded Chochin Garlands across Ryokan Arch, Gorge Skybridge & Courtyard
  buildChochinGarland(group, { ax: 9.8, az: 4.8, aGroundY: 1.2, bx: 17.0, bz: -0.6, bGroundY: 3.1, ay: 4.8, by: 6.4, sag: 0.6, count: 6, chochinMat });
  buildChochinGarland(group, { ax: 16.4, az: -12.8, aGroundY: 3.1, bx: 7.0, bz: -17.0, bGroundY: 3.8, ay: 6.4, by: 7.0, sag: 0.7, count: 7, chochinMat });
  buildChochinGarland(group, { ax: 17.6, az: -3.2, aGroundY: 3.1, bx: 24.4, bz: -12.8, bGroundY: 3.1, ay: 6.4, by: 6.4, sag: 0.65, count: 6, chochinMat });

  // Segmented Elbowed Copper Geothermal Pipes snaking into Central Steam Caldera Manifold (2.5, 1.2, 11.5)
  const pipeMats = [0, 1, 2].map(() =>
    createPixelToonMaterial({ color: '#5d92ad', emissive: '#407090', emissiveIntensity: 0.16 })
  );
  const pipePaths = [
    [
      [-17.8, 0.45, 28.2], [-9.0, 0.42, 27.6], [-2.4, 0.48, 24.4],
      [2.2, 0.78, 23.4], [1.2, 1.22, 17.5], [2.5, 1.25, 11.5],
    ],
    [
      [-26.8, 1.15, 7.2], [-18.0, 1.08, 9.6], [-13.8, 0.72, 12.2],
      [-7.4, 0.95, 12.8], [2.5, 1.25, 11.5],
    ],
    [
      [22.8, 2.12, 19.2], [18.6, 1.98, 16.4], [15.2, 1.5, 15.8],
      [10.6, 1.28, 13.4], [2.5, 1.25, 11.5],
    ],
  ];
  pipePaths.forEach((pts, idx) => {
    const pMat = pipeMats[idx];
    for (let k = 0; k < pts.length - 1; k++) {
      const a = new THREE.Vector3(...pts[k]);
      const b = new THREE.Vector3(...pts[k + 1]);
      const len = a.distanceTo(b);
      const seg = createCylinder(0.11, 0.11, len, 6, pMat, false, false);
      seg.position.copy(a).lerp(b, 0.5);
      seg.lookAt(b);
      seg.rotateX(Math.PI / 2);
      const joint = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 6), pMat);
      joint.position.copy(b);
      group.add(seg, joint);
    }
  });

  // Central Caldera Geothermal Cauldron Manifold at (2.5, 1.2, 11.5)
  const manifoldRim = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.28, 8, 22), mats.stoneMat);
  manifoldRim.rotation.x = Math.PI / 2;
  manifoldRim.position.set(2.5, 1.28, 11.5);
  const manifoldPool = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.2, 20), monkeyWaterMat);
  manifoldPool.position.set(2.5, 1.22, 11.5);
  const calderaRings = pipeMats.map((pMat, ri) => {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.95 + ri * 0.42, 0.06, 6, 18), pMat);
    r.rotation.x = Math.PI / 2;
    r.position.set(2.5, 1.38, 11.5);
    group.add(r);
    return r;
  });
  group.add(manifoldRim, manifoldPool);

  // Puzzle 1: 3 Steam Valves
  const valveMeshes = [];
  valveSpots.forEach((sp) => {
    const vg = new THREE.Group();
    vg.position.set(sp.x, sp.y, sp.z);
    const base = createCylinder(0.32, 0.4, 0.85, 8, mats.stoneMat);
    base.position.y = 0.42;
    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.06, 6, 12),
      createPixelToonMaterial({ color: '#d87a42' })
    );
    wheel.rotation.x = Math.PI / 2;
    wheel.position.y = 0.95;
    const frostCrystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.18, 0),
      new THREE.MeshBasicMaterial({ color: '#8de2ff' })
    );
    frostCrystal.position.y = 1.24;
    vg.add(base, wheel, frostCrystal);
    group.add(vg);
    valveMeshes.push({ wheel, frostCrystal, targetYaw: 0, sp });
  });

  // Puzzle 2: 3 Steam Vent Rune Altars (1, 2, 3 pips glowing at Night)
  const ventMeshes = [];
  ventSpots.forEach((sp) => {
    const g = new THREE.Group();
    g.position.set(sp.x, sp.y, sp.z);
    const ped = createCylinder(0.46, 0.56, 0.85, 8, mats.stoneMat);
    ped.position.y = 0.425;
    const ringMat = new THREE.MeshBasicMaterial({ color: '#82d8ff', transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.82, 16), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    g.add(ped, ring);

    const orbs = [];
    for (let p = 0; p < sp.pips; p++) {
      const om = new THREE.MeshBasicMaterial({ color: '#45556e' });
      const o = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), om);
      o.position.set((p - (sp.pips - 1) * 0.5) * 0.34, 1.25, 0);
      g.add(o);
      orbs.push(o);
    }
    group.add(g);
    ventMeshes.push({ ringMat, orbs });
  });

  // Animated Alpine Wildlife: Wading Tancho Crane, 3 Circling Cranes & 2 Hopping Snow Hares
  const tancho = new THREE.Group();
  tancho.position.set(25.4, 2.0, 12.2);
  tancho.rotation.y = 0.8;
  const craneWhite = createPixelToonMaterial({ color: '#fbfbf7' });
  const craneBlack = createPixelToonMaterial({ color: '#262933' });
  const craneCap = createPixelToonMaterial({ color: '#db382c' });
  for (const lx of [-0.07, 0.07]) {
    const leg = createCylinder(0.02, 0.025, 0.65, 5, craneBlack);
    leg.position.set(lx, 0.32, 0);
    tancho.add(leg);
  }
  const cBody = new THREE.Mesh(new THREE.SphereGeometry(0.24, 9, 8), craneWhite);
  cBody.position.set(0, 0.72, 0);
  cBody.scale.set(0.9, 0.85, 1.45);
  const cNeckPivot = new THREE.Group();
  cNeckPivot.position.set(0, 0.82, 0.22);
  const cNeck = createCylinder(0.045, 0.06, 0.55, 6, craneBlack);
  cNeck.position.set(0, 0.28, 0.04);
  const cHead = new THREE.Mesh(new THREE.SphereGeometry(0.09, 7, 6), craneWhite);
  cHead.position.set(0, 0.56, 0.08);
  const cCrown = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), craneCap);
  cCrown.position.set(0, 0.63, 0.07);
  const cBeak = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.22, 4), craneBlack);
  cBeak.rotation.x = Math.PI * 0.5;
  cBeak.position.set(0, 0.55, 0.22);
  cNeckPivot.add(cNeck, cHead, cCrown, cBeak);
  tancho.add(cBody, cNeckPivot);
  group.add(tancho);

  const flyingCranes = buildCirclingBirds(
    group,
    [0, 1, 2].map((i) => ({
      kind: 'crane',
      cx: 0,
      cz: 2,
      y: 12.8 + i * 1.2,
      rx: 19 + i * 3,
      rz: 16 + i * 3,
      speed: 0.24 + i * 0.03,
      phase: i * 2.1,
    }))
  );

  const snowHares = [
    [-0.8, 3.8, -16.8, -0.4],
    [-15.5, 0.3, 34.8, 1.2],
  ].map(([hx, hy, hz, hyaw], idx) => {
    const hg = new THREE.Group();
    hg.position.set(hx, hy, hz);
    hg.rotation.y = hyaw;
    const hb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 7), craneWhite);
    hb.position.y = 0.18;
    const hh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), craneWhite);
    hh.position.set(0, 0.34, 0.14);
    for (const ex of [-0.06, 0.06]) {
      const ear = createBox(0.05, 0.18, 0.04, craneWhite);
      ear.position.set(ex, 0.48, 0.12);
      hg.add(ear);
    }
    hg.add(hb, hh);
    group.add(hg);
    return { hg, baseY: hy, phase: idx * 2.5 };
  });

  // 4 Cozy Resting Benches
  const benches = [
    buildBench(group, { x: -11.4, y: 0.3, z: 35.6, yaw: 2.75, woodMat: cedarWoodMat, woodDarkMat: mats.darkWoodMat, cushionColor: '#b83228' }),
    buildBench(group, { x: -17.6, y: 1.0, z: 5.8, yaw: -0.6, woodMat: cedarWoodMat, woodDarkMat: mats.darkWoodMat, cushionColor: '#d99e48' }),
    buildBench(group, { x: 16.4, y: 3.1, z: -13.2, yaw: 0.72, woodMat: cedarWoodMat, woodDarkMat: mats.darkWoodMat, cushionColor: '#b83228' }),
    buildBench(group, { x: 3.2, y: 3.8, z: -14.2, yaw: -2.85, woodMat: cedarWoodMat, woodDarkMat: mats.darkWoodMat, cushionColor: '#d99e48' }),
  ];

  // Rich Winter Cedar & Crimson Momiji Forest (28 lush trees)
  [
    [-21.2, 0.3, 28.0, 'snow-cedar', 1.25], [-7.5, 0.3, 36.2, 'snow-cedar', 1.15],
    [-21.8, 0.3, 35.5, 'momiji-red', 1.05], [10.8, 1.2, 16.8, 'snow-cedar', 1.2],
    [1.8, 1.2, 2.2, 'cedar', 1.18], [-5.4, 1.2, 7.2, 'snow-cedar', 1.15],
    [-29.0, 1.0, 10.0, 'snow-cedar', 1.28], [-27.8, 1.0, 16.2, 'momiji-red', 1.05],
    [-24.2, 1.0, 3.2, 'cedar', 1.12], [-15.8, 1.0, 16.8, 'snow-cedar', 1.1],
    [18.2, 2.0, 20.4, 'snow-cedar', 1.18], [29.8, 2.0, 19.6, 'momiji-red', 1.08],
    [30.5, 2.0, 9.8, 'snow-cedar', 1.24], [18.4, 2.0, 10.6, 'cedar', 1.12],
    [31.8, 3.1, -2.5, 'snow-cedar', 1.25], [31.5, 3.1, -14.6, 'momiji-red', 1.1],
    [16.2, 3.1, -5.2, 'snow-cedar', 1.1], [-4.2, 3.8, -14.2, 'snow-cedar', 1.15],
    [6.8, 3.8, -22.8, 'cedar', 1.15], [-24.5, 2.6, -7.2, 'snow-cedar', 1.18],
    [-24.2, 4.6, -24.5, 'snow-cedar', 1.28], [-22.5, 4.6, -32.2, 'snow-cedar', 1.25],
    [-9.5, 4.6, -31.8, 'momiji-red', 1.1], [-18.2, 4.6, -18.2, 'cedar', 1.1],
    [-7.2, 0.3, 27.6, 'snow-cedar', 1.05], [7.8, 1.2, 11.4, 'momiji-red', 1.0],
    [29.2, 3.1, -13.8, 'cedar', 1.15], [-12.0, 4.6, -29.2, 'snow-cedar', 1.15],
  ].forEach(([x, y, z, type, s], idx) => buildOrganicTree(group, { type, x, y, z, scale: s, idx, treeSet }));

  // Snow-draped boulders, bamboo screens & winter undergrowth
  const boulderColliders = buildMossBoulders(
    group,
    [
      [-19.5, 0.3, 26.8, 0.72, 0.4], [-9.2, 0.3, 30.8, 0.65, 1.2],
      [-26.8, 1.0, 14.2, 0.82, 0.8], [-18.2, 1.0, 13.8, 0.68, 2.0],
      [25.6, 2.0, 19.6, 0.78, 0.5], [19.8, 2.0, 11.2, 0.7, 1.7],
      [-4.8, 3.8, -22.2, 0.75, 0.9], [-21.8, 4.6, -29.8, 0.85, 1.1],
    ],
    mats.cliffMat,
    '#eff7ff'
  );
  buildBambooCluster(
    group,
    [
      [-28.2, 1.0, 11.8, 5.0], [-27.8, 1.0, 13.0, 5.4],
      [21.6, 3.1, -3.2, 5.2], [22.4, 3.1, -3.8, 4.8],
      [11.8, 1.2, 9.8, 4.9], [12.4, 1.2, 10.6, 5.3],
    ],
    treeSet
  );

  buildGroundFoliage(group, terrain, bounds, {
    count: 720,
    allowedSurfaces: ['grass'],
    grassColor: '#d4e2ea',
    flowerColor: '#eef8ff',
    flowerRatio: 0.25,
    seed: 202,
  });

  // 6 Stone Lanterns (strictly within fragment light budget)
  const lanterns = [
    [-9.8, 0.3, 29.6],
    [-1.2, 1.2, 18.8],
    [-15.8, 1.0, 10.6],
    [20.2, 2.0, 14.2],
    [18.2, 3.1, -3.2],
    [-11.4, 4.6, -23.6],
  ].map(([x, y, z]) => buildLanternProp(group, scene, sceneLights, x, y, z, false));
  terrain.addColliders({ circles: [...boulderColliders, ...lanterns.map((l) => l.collider)] });
  terrain.addColliders(collectPropColliders(group));

  // Belfry Obelisks & Snow-Cedar Onsen Bell
  const belfry = buildObelisksAndBell(group, scene, sceneLights, {
    x: BELFRY_BELL.x,
    y: 4.6,
    z: BELFRY_BELL.z,
    obelisks: [
      { x: -14.6, z: -24.8, color: '#64d8ff' },
      { x: -16.8, z: -22.2, color: '#a8ffe0' },
      { x: -15.0, z: -28.6, color: '#ffb870' },
    ],
    roofMat: mats.roofTileMat,
    woodMat: cedarWoodMat,
    stoneMat: mats.stoneMat,
  });

  const snowField = buildParticleField(group, 'snow', { minX: -38, maxX: 38, minY: 0.5, maxY: 16, minZ: -40, maxZ: 38 }, 155);
  const steamField = buildParticleField(group, 'steam', { minX: -28, maxX: 30, minY: 0.2, maxY: 6.5, minZ: -12, maxZ: 20 }, 95);
  const wildlife = buildAmbientWildlife(group, {
    sparrows: [
      { x: -12.6, y: 0.32, z: 32.8, yaw: 0.4 },
      { x: 15.8, y: 3.12, z: -12.4, yaw: -0.9 },
      { x: -6.2, y: 4.62, z: -21.8, yaw: 1.1 },
    ],
  });

  const hintTimers = { spring: 0, steam: 0, hearth: 0 };

  const worldBuilder = {
    shojiMaterials: [shojiMat],
    chochinMaterials: [chochinMat],
    waterMaterials,
    waterfallMaterials,
    lanterns,
    addWaterRipple: () => {},
    addGravelFootprint: () => {},
    getLitLanternCount: () => lanterns.filter((l) => l.isLit).length,
    triggerHintPulse: (zone) => {
      if (zone === 'belfry') belfry.triggerHintPulse();
      else if (zone in hintTimers) hintTimers[zone] = 6.0;
    },
  };

  function checkUnseal() {
    if (!bellUnsealed && sealSpring && sealSteam && sealHearth) {
      bellUnsealed = true;
      belfry.setBellUnsealed(true);
      audio.playSealAwaken?.();
      progressVersion++;
      onToast?.('The Onsen Bell is unsealed.');
    }
    onStateChange?.(puzzleManager.getStatusSnapshot());
  }

  const puzzleManager = {
    get progressVersion() { return progressVersion; },
    get chapterComplete() { return chapterComplete; },
    get bellUnsealed() { return bellUnsealed; },
    getStatusSnapshot: () => ({
      seals: [sealSpring, sealSteam, sealHearth],
      bellUnsealed,
      chapterComplete,
    }),
    getPuzzleZoneForPos: (x, z) => {
      if (chapterComplete) return null;
      const reg = terrain.getRegionInfoAt(x, z).id;
      if (!sealHearth && reg === 'cedar-ryokan') return 'hearth';
      if (!sealSpring && (reg === 'frost-gate' || reg === 'monkey-springs' || reg === 'mineral-falls')) return 'spring';
      if (!sealSteam && reg === 'steam-caldera') return 'steam';
      if (reg === 'belfry-caldera' || reg === 'lantern-ridge') return 'belfry';
      return !sealSpring ? 'spring' : !sealSteam ? 'steam' : !sealHearth ? 'hearth' : 'belfry';
    },
    getHintText: (zone) => {
      if (zone === 'spring') return 'Steam always climbs. Thaw the three copper conduits from the lowest valve to the highest; the one ready to turn breathes.';
      if (zone === 'steam') return 'Under Night steam, counted glowing pips rise around the central cauldron in quiet order.';
      if (zone === 'hearth') return 'Warm the hinoki rotenburo beside the cedar ryokan, then call Mochi onto the hearth cushion.';
      return bellUnsealed
        ? 'Three seals gleam at the northwest caldera; ring the Snow-Cedar Onsen Bell.'
        : 'Three spirits bind the summit bell across Spring, Night Steam, and Hearth.';
    },
    getHintTargetPos: () => {
      if (!sealSpring) {
        const idx = valvesOpen.findIndex((v) => !v);
        if (idx >= 0) return valveSpots[idx];
      }
      if (!sealSteam) return ventSpots[nextVentIdx] || ventSpots[0];
      if (!sealHearth) return bathWarmed ? CAT_HEARTH_SPOT : BATH_POS;
      return BELFRY_BELL;
    },
  };

  const spots = [];
  valveSpots.forEach((sp, i) => {
    spots.push({
      id: `valve-${i}`,
      getPos: () => sp,
      radius: 2.5,
      getLabel: () => (valvesOpen[i] ? null : 'E · Steam Valve'),
      trigger: () => {
        if (valvesOpen[i]) return;
        // Steam rises: a valve thaws only once the lower conduit already carries heat
        // (Frost Gate 0.3 m → Snow-Monkey Springs 1.0 m → Mineral Falls 2.0 m)
        const lowerClosed = valvesOpen.findIndex((v) => !v);
        if (lowerClosed !== i) {
          audio.playLanternChime(false);
          valveMeshes[i].shake = 0.5;
          onToast?.('The wheel is frozen fast. Warm steam has to reach this pipe from below first.');
          return;
        }
        valvesOpen[i] = true;
        progressVersion++;
        valveMeshes[i].targetYaw += Math.PI * 2;
        valveMeshes[i].frostCrystal.material.color.set('#ffd770');
        pipeMats[i].color.set('#f29349');
        pipeMats[i].emissive.set('#ff7b2e');
        pipeMats[i].emissiveIntensity = 0.62;
        audio.playSteamValve?.();
        if (frostCleared() && !sealSpring) {
          sealSpring = true;
          belfry.launchSealOrb(new THREE.Vector3(sp.x, sp.y + 1.5, sp.z), 0);
          audio.playSealAwaken?.();
          onToast?.('Spring Seal awakened.');
          checkUnseal();
        } else {
          onStateChange?.(puzzleManager.getStatusSnapshot());
        }
      },
    });
  });

  ventSpots.forEach((sp, i) => {
    spots.push({
      id: `vent-${i}`,
      getPos: () => sp,
      radius: 2.5,
      getLabel: () => (sealSteam || ventsActivated[i] ? null : 'E · Steam Vent'),
      trigger: () => {
        if (sealSteam) return;
        if (curTimeId !== 'crepusculo') {
          audio.playLanternChime(false);
          hintTimers.steam = 1.0;
          return;
        }
        if (i === nextVentIdx) {
          ventsActivated[i] = true;
          nextVentIdx++;
          progressVersion++;
          audio.playLanternChime(true);
          if (nextVentIdx === 3) {
            sealSteam = true;
            belfry.launchSealOrb(new THREE.Vector3(sp.x, sp.y + 1.5, sp.z), 1);
            audio.playSealAwaken?.();
            onToast?.('Steam Seal awakened.');
            checkUnseal();
          }
        } else {
          ventsActivated.fill(false);
          nextVentIdx = 0;
          audio.playLanternChime(false);
        }
      },
    });
  });

  spots.push({
    id: 'warm-bath',
    getPos: () => BATH_POS,
    radius: 2.9,
    getLabel: () => (bathWarmed ? null : 'E · Warm Bath'),
    trigger: () => {
      bathWarmed = true;
      progressVersion++;
      tubWaterMat.color.set('#96f0ff');
      tubWaterMat.emissiveIntensity = 0.58;
      hearthMat.emissiveIntensity = 0.62;
      audio.playWaterGate?.();
      cat.goHoldSpot?.(CAT_HEARTH_SPOT, 22.0);
    },
  });

  spots.push({
    id: 'twin-hearth',
    getPos: () => ({ x: CAT_HEARTH_SPOT.x, z: CAT_HEARTH_SPOT.z + 2.2 }),
    radius: 2.6,
    getLabel: () => (sealHearth ? null : 'E · Share Warmth'),
    trigger: () => {
      if (sealHearth) return;
      if (!bathWarmed || !cat.isHoldingSpot?.(CAT_HEARTH_SPOT, 2.05)) {
        audio.playLanternChime(false);
        if (bathWarmed) cat.goHoldSpot?.(CAT_HEARTH_SPOT, 22.0);
        return;
      }
      sealHearth = true;
      progressVersion++;
      belfry.launchSealOrb(new THREE.Vector3(CAT_HEARTH_SPOT.x, 3.8, CAT_HEARTH_SPOT.z), 2);
      audio.playSealAwaken?.();
      onToast?.('Hearth Seal awakened.');
      checkUnseal();
    },
  });

  spots.push({
    id: 'onsen-bell',
    getPos: () => BELFRY_BELL,
    radius: 3.1,
    getLabel: () => 'E · Onsen Bell',
    trigger: () => {
      belfry.ringBell();
      if (!bellUnsealed) {
        audio.playLanternChime(false);
        belfry.triggerHintPulse();
        return;
      }
      audio.playBonshoBell();
      if (!chapterComplete) {
        chapterComplete = true;
        snowField.triggerStorm();
        audio.playChapterComplete?.();
        onStateChange?.(puzzleManager.getStatusSnapshot());
        setTimeout(() => onChapterComplete?.(), 1500);
      }
    },
  });

  benches.forEach((b, idx) => {
    spots.push({
      id: `bench-${idx}`,
      getPos: () => b,
      radius: 2.1,
      getLabel: () => (player.isSitting ? 'WASD · Stand' : 'E · Rest'),
      trigger: () => {
        if (player.isSitting) player.standUp();
        else player.sitAt(b.x, b.y + 0.08, b.z, b.yaw);
        onAction?.();
      },
    });
  });

  lanterns.forEach((l, idx) => {
    spots.push({
      id: `lantern-${idx}`,
      getPos: () => l,
      radius: 2.1,
      getLabel: () => 'E · Lantern',
      trigger: () => {
        l.setLit(!l.isLit);
        audio.playLanternChime(l.isLit);
      },
    });
  });

  const interactions = {
    spots,
    getNearestPrompt() {
      const px = player.position.x;
      const pz = player.position.z;
      let best = null;
      let bestLbl = null;
      let bestD = Infinity;
      for (let i = 0; i < spots.length; i++) {
        const lbl = spots[i].getLabel();
        if (!lbl) continue;
        const p = spots[i].getPos();
        const d = Math.hypot(p.x - px, p.z - pz);
        if (d <= spots[i].radius && d < bestD) {
          bestD = d;
          best = spots[i];
          bestLbl = lbl;
        }
      }
      if (best) return { spot: best, label: bestLbl };
      const dc = Math.hypot(cat.position.x - px, cat.position.z - pz);
      if (dc <= 2.9) return { spot: null, label: 'F · Mochi', canPetCat: true };
      return null;
    },
    interactPrimary() {
      const n = this.getNearestPrompt();
      if (!n) return false;
      if (n.spot) {
        n.spot.trigger();
        onAction?.();
        return true;
      }
      if (n.canPetCat) return this.petCat();
      return false;
    },
    petCat() {
      if (bathWarmed && Math.hypot(player.position.x - CAT_HEARTH_SPOT.x, player.position.z - CAT_HEARTH_SPOT.z) < 7.5) {
        cat.goHoldSpot?.(CAT_HEARTH_SPOT, 22.0);
        audio.playCatMeow();
        onAction?.();
        return true;
      }
      const d = Math.hypot(cat.position.x - player.position.x, cat.position.z - player.position.z);
      if (d <= 3.2) {
        player.triggerPet(cat.position);
        cat.pet(player.position);
      } else {
        cat.callToPlayer(player.position);
      }
      audio.playCatMeow();
      onAction?.();
      return true;
    },
  };

  const nightAtmo = buildNightAtmosphere(group, {
    fireflyBounds: { minX: -30, maxX: 30, minY: 0.8, maxY: 7.0, minZ: -32, maxZ: 34 },
    fireflyCount: 95,
    fireflyColor: '#ffda88',
    lightColor: '#ffd27d',
    kind: 'stone',
    pathLights: [
      { x: -8.0, y: terrain.getHeightAt(-8.0, 29.5), z: 29.5 },
      { x: 8.5, y: terrain.getHeightAt(8.5, 13.8), z: 13.8 },
      { x: -15.5, y: terrain.getHeightAt(-15.5, 11.2), z: 11.2 },
      { x: 22.0, y: terrain.getHeightAt(22.0, 12.2), z: 12.2 },
      { x: 18.8, y: terrain.getHeightAt(18.8, -3.5), z: -3.5 },
      { x: 5.0, y: terrain.getHeightAt(5.0, -17.5), z: -17.5 },
      { x: -12.5, y: terrain.getHeightAt(-12.5, -24.0), z: -24.0 },
      { x: -20.5, y: terrain.getHeightAt(-20.5, -7.2), z: -7.2 },
    ],
  });

  return {
    terrain,
    worldBuilder,
    foliage: {
      setFireflyIntensity: (v) => nightAtmo.setIntensity(v),
      triggerPetalStorm: () => snowField.triggerStorm(),
      update: (dt, elapsed) => {
        snowField.update(dt, elapsed);
        steamField.update(dt, elapsed);
        nightAtmo.update(dt, elapsed);
      },
    },
    puzzleManager,
    interactions,
    spawnPoint: { x: -19.2, z: 34.4, yaw: Math.PI * 0.78 },
    catSpawnPoint: { x: -20.6, z: 34.8 },
    titleFocusPos: new THREE.Vector3(2.5, 2.4, 8.0),
    biomeProfile: 'onsen',
    onTimeChanged(timeId) {
      curTimeId = timeId;
    },
    update(dt, elapsed, focusPos) {
      updateClouds(clouds, dt, elapsed);
      belfry.update(dt, elapsed);
      updateCascades(plungeFoams, elapsed);
      flyingCranes.update(elapsed);
      wildlife.update(dt, elapsed, focusPos);

      cNeckPivot.rotation.x = Math.max(0, Math.sin(elapsed * 0.85)) * 0.35;

      for (let i = 0; i < snowHares.length; i++) {
        const sh = snowHares[i];
        const hop = Math.max(0, Math.sin(elapsed * 3.1 + sh.phase));
        sh.hg.position.y = sh.baseY + hop * hop * 0.22;
      }

      for (let i = 0; i < monkeys.length; i++) {
        const m = monkeys[i];
        m.mg.position.y = m.baseY + Math.sin(elapsed * 2.1 + m.phase) * 0.05;
        m.mg.rotation.z = Math.sin(elapsed * 1.4 + m.phase) * 0.06;
        const mr = monkeyRipples[i];
        const c = (elapsed * 0.52 + mr.phase) % 1;
        const sc = 1.0 + c * 1.4;
        mr.ring.scale.set(sc, 1, sc);
        mr.rMat.opacity = (1 - c) * 0.45;
      }

      for (let i = 0; i < calderaRings.length; i++) {
        calderaRings[i].rotation.z = elapsed * (0.4 + i * 0.15);
      }

      for (let i = 0; i < valveMeshes.length; i++) {
        const v = valveMeshes[i];
        v.wheel.rotation.y += (v.targetYaw - v.wheel.rotation.y) * (1 - Math.exp(-dt * 8));
        v.frostCrystal.rotation.y = elapsed * 1.8 + i;
        // The next valve that can thaw "breathes"; a refused one shudders
        const thawing = !valvesOpen[i] && valvesOpen.findIndex((o) => !o) === i;
        const s = thawing ? 1 + Math.sin(elapsed * 4.2) * 0.18 : 1;
        v.frostCrystal.scale.setScalar(s);
        if (v.shake > 0) {
          v.shake = Math.max(0, v.shake - dt);
          v.wheel.position.x = Math.sin(elapsed * 60) * 0.05 * v.shake;
        } else {
          v.wheel.position.x = 0;
        }
      }

      const isNight = curTimeId === 'crepusculo';
      if (hintTimers.steam > 0) hintTimers.steam = Math.max(0, hintTimers.steam - dt);
      for (let i = 0; i < ventMeshes.length; i++) {
        const vm = ventMeshes[i];
        const done = ventsActivated[i];
        const lit = isNight || done;
        vm.ringMat.opacity = done ? 0.92 : hintTimers.steam > 0 ? 0.8 : isNight ? 0.55 : 0.22;
        vm.orbs.forEach((o, oi) => {
          o.material.color.set(done ? '#6effb8' : lit ? '#9ee8ff' : '#45556e');
          o.position.y = 1.25 + (lit ? Math.sin(elapsed * 3.5 + oi) * 0.08 : 0);
        });
      }
    },
    dispose() {
      belfry.dispose();
      sdfTex.dispose();
      disposeObject3D(group, scene, sceneLights);
    },
  };
}

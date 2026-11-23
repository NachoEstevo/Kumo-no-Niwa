import * as THREE from 'three';
import { getGoldenCraterTexture } from '../../engine/PixelTextures.js';
import { createPixelToonMaterial } from '../../engine/ToonMaterials.js';
import {
  LevelTerrain,
  addStonePad,
  addWoodenDeck,
  buildAmbientWildlife,
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
  buildSteppingStoneMeshes,
  buildToriiGate,
  buildWaterPlane,
  createBox,
  createCylinder,
  createSharedMatSet,
  createTreeBillboardSet,
  disposeObject3D,
  roundedBoxSDF,
  updateBuildings,
  updateCascades,
  updateChochins,
  updateClouds,
} from '../../world/WorldKit.js';

export function createChapter7({
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
  const mats = createSharedMatSet('#e6cf8e', getGoldenCraterTexture());
  const treeSet = createTreeBillboardSet();
  const woodMat = createPixelToonMaterial({ color: '#6b422b' });
  const silverRail = createPixelToonMaterial({ color: '#9ecbff' });
  const chochinMat = createPixelToonMaterial({ color: '#ffdfd0', emissive: '#ff8a48', emissiveIntensity: 0.68 });
  const shojiMaterials = [];

  let curTimeId = dayCycle.getCurrentPreset().id;

  // Puzzle 1: Living Day Altar + Ancient Night Altar on Golden Astrolabe Ring
  const eraAltars = { day: false, night: false };
  let sealEra = false;

  // Puzzle 2: 5 Constellation Star Plinths (2 Day, 2 Night, 1 Dusk Heart)
  const starsLit = [false, false, false, false, false];
  let sealStar = false;

  // Puzzle 3: Twin Duet Ceremony for Hana & Mochi at Grand Sky Belfry
  const MOCHI_DUET_SPOT = { x: 3.0, z: -32.2 };
  const HANA_DUET_SPOT = { x: 6.4, z: -29.0 };
  const BELFRY_BELL = { x: 9.2, z: -34.8 };
  let sealDuet = false;

  let bellUnsealed = false;
  let chapterComplete = false;
  let progressVersion = 0;

  const livingBridgeUp = () => curTimeId === 'tarde' || curTimeId === 'dorada';
  const ancientBridgeUp = () => curTimeId === 'crepusculo' || curTimeId === 'dorada';

  const starSpecs = [
    { x: -21.2, y: 1.35, z: 24.4, time: 'tarde', color: '#ffd954' },
    { x: -24.8, y: 2.45, z: -6.4, time: 'tarde', color: '#ffd954' },
    { x: 26.8, y: 1.45, z: 19.2, time: 'crepusculo', color: '#9ecbff' },
    { x: 14.2, y: 3.95, z: -26.4, time: 'crepusculo', color: '#9ecbff' },
    { x: -1.5, y: 2.0, z: 0.5, time: 'dorada', color: '#ff94a8' },
  ];

  const ASTRO_POS = { x: -1.5, y: 6.8, z: 0.5 };
  const LIVING_ALTAR = { x: -7.2, z: -1.2 };
  const ANCIENT_ALTAR = { x: 4.4, z: 2.4 };

  const ERA_STONES = [
    { x: -25.8, z: 20.6, r: 2.65, visualR: 2.45, y: 1.5, surface: 'stone', enabledFn: livingBridgeUp, era: 'day' },
    { x: -28.2, z: 17.6, r: 2.6, visualR: 2.4, y: 1.72, surface: 'stone', enabledFn: livingBridgeUp, era: 'day' },
    { x: -28.8, z: 14.0, r: 2.65, visualR: 2.45, y: 1.95, surface: 'stone', enabledFn: livingBridgeUp, era: 'day' },
    { x: -15.6, z: -4.8, r: 2.4, visualR: 2.2, y: 2.4, surface: 'wood', enabledFn: livingBridgeUp, era: 'day' },
    { x: 13.2, z: 5.6, r: 2.3, visualR: 2.15, y: 2.55, surface: 'stone', enabledFn: ancientBridgeUp, era: 'night' },
  ];

  const terraces = [
    { id: 'rim-sw', shape: 'circle', cx: -19.5, cz: 27.5, r: 8.6, y: 1.35, surface: 'grass', region: { id: 'rim', jp: '彗星の外輪', en: 'SW Crater Rim' } },
    { id: 'rim-south', shape: 'circle', cx: -6.5, cz: 32.5, r: 9.8, y: 1.05, surface: 'grass', region: { id: 'rim', jp: '彗星の外輪', en: 'SW Crater Rim' } },
    { id: 'rim-se', shape: 'box', cx: 8.2, cz: 30.2, hx: 8.8, hz: 5.4, cornerR: 2.6, y: 1.0, surface: 'stone', region: { id: 'rim', jp: '彗星の外輪', en: 'SW Crater Rim' } },
    { id: 'living-main', shape: 'circle', cx: -27.5, cz: 4.5, r: 8.6, y: 2.15, surface: 'grass', region: { id: 'living-wing', jp: '現世の桜宮', en: 'Living Day Sanctuary' } },
    { id: 'living-lobe', shape: 'circle', cx: -24.2, cz: -4.2, r: 5.8, y: 2.45, surface: 'grass', region: { id: 'living-wing', jp: '現世の桜宮', en: 'Living Day Sanctuary' } },
    { id: 'ancient-low', shape: 'circle', cx: 25.0, cz: 18.2, r: 6.2, y: 1.45, surface: 'stone', region: { id: 'ancient-wing', jp: '太古の星遺跡', en: 'Ancient Night Ruins' } },
    { id: 'ancient-high', shape: 'box', cx: 24.5, cz: 3.0, hx: 7.4, hz: 6.6, cornerR: 2.2, y: 2.85, surface: 'stone', region: { id: 'ancient-wing', jp: '太古の星遺跡', en: 'Ancient Night Ruins' } },
    { id: 'crater-ring', shape: 'circle', cx: -1.5, cz: 0.5, r: 10.6, y: 2.0, surface: 'stone', region: { id: 'crater-ring', jp: '星宮の天球儀', en: 'Golden Astrolabe Ring' } },
    { id: 'torii-landing', shape: 'circle', cx: -6.2, cz: -18.8, r: 4.8, y: 3.05, surface: 'stone', region: { id: 'causeway', jp: '星明かりの参道', en: 'Starlight Torii Causeway' } },
    { id: 'sky-belfry', shape: 'circle', cx: 5.5, cz: -31.5, r: 9.8, y: 4.2, surface: 'stone', region: { id: 'sky-belfry', jp: '天の鐘楼', en: 'Grand Sky Belfry' } },
    { id: 'belfry-spur', shape: 'circle', cx: 15.2, cz: -27.2, r: 5.2, y: 3.95, surface: 'grass', region: { id: 'sky-belfry', jp: '天の鐘楼', en: 'Grand Sky Belfry' } },
  ];

  const terrain = new LevelTerrain({
    defaultRegion: { id: 'rim', jp: '彗星の外輪', en: 'SW Crater Rim' },
    terraces,
    bridges: [
      { ax: -21.0, az: -4.8, bx: -15.6, bz: -4.8, halfWidth: 1.85, startY: 2.45, endY: 2.4, archLift: 0.35, surface: 'wood', enabledFn: livingBridgeUp },
      { ax: -15.6, az: -4.8, bx: -9.4, bz: -1.8, halfWidth: 1.85, startY: 2.4, endY: 2.0, archLift: 0.45, surface: 'wood', enabledFn: livingBridgeUp },
      { ax: 14.8, az: 28.6, bx: 23.2, bz: 20.6, halfWidth: 1.8, startY: 1.0, endY: 1.45, archLift: 0.28, surface: 'stone', enabledFn: ancientBridgeUp },
      { ax: 26.2, az: 13.8, bx: 24.8, bz: 9.45, halfWidth: 1.75, startY: 1.45, endY: 2.85, archLift: 0.22, surface: 'stone', enabledFn: ancientBridgeUp },
      { ax: 19.0, az: 4.8, bx: 13.2, bz: 5.6, halfWidth: 1.85, startY: 2.85, endY: 2.55, archLift: 0.25, surface: 'stone', enabledFn: ancientBridgeUp },
      { ax: 13.2, az: 5.6, bx: 6.8, bz: 2.8, halfWidth: 1.85, startY: 2.55, endY: 2.0, archLift: 0.3, surface: 'stone', enabledFn: ancientBridgeUp },
      // Starlight Torii Causeway (always solid)
      { ax: -3.2, az: -8.2, bx: -6.4, bz: -17.6, halfWidth: 2.15, startY: 2.0, endY: 3.05, archLift: 0.25, surface: 'stone' },
      { ax: -5.4, az: -20.2, bx: 0.6, bz: -26.4, halfWidth: 2.15, startY: 3.05, endY: 4.2, archLift: 0.3, surface: 'stone' },
    ],
    stones: ERA_STONES,
    circles: [
      { x: LIVING_ALTAR.x, z: LIVING_ALTAR.z, r: 0.6 },
      { x: ANCIENT_ALTAR.x, z: ANCIENT_ALTAR.z, r: 0.6 },
      ...starSpecs.map((s) => ({ x: s.x, z: s.z, r: 0.54 })),
      // Ancient Monolith Arch piers on East Wing
      { x: 27.4, z: 4.0, r: 0.85 },
      { x: 28.8, z: 0.8, r: 0.75 },
      // Belfry Obelisks & Bell
      { x: 5.2, z: -37.2, r: 0.56 },
      { x: 11.4, z: -30.2, r: 0.56 },
      { x: 8.6, z: -38.4, r: 0.52 },
      { x: BELFRY_BELL.x, z: BELFRY_BELL.z, r: 0.98 },
      // 4 Benches
      { x: -15.6, z: 30.8, r: 0.72 },
      { x: -21.6, z: 7.6, r: 0.72 },
      { x: 21.2, z: -1.6, r: 0.72 },
      { x: 16.8, z: -29.8, r: 0.72 },
    ],
    boxes: [
      { minX: -33.2, maxX: -27.4, minZ: 0.8, maxZ: 6.8 },
    ],
  });

  const clouds = [];
  buildCloudSeaAndCumulus(group, clouds, -12.8, 56);

  terraces.forEach((t, idx) => {
    const topMat = t.surface === 'stone' ? mats.stoneMat : mats.grassMat;
    if (t.shape === 'circle') {
      group.add(buildCircularTerrace({ cx: t.cx, cz: t.cz, r: t.r, topY: t.y, topMat, cliffMat: mats.cliffMat, seed: 70 + idx }));
    } else {
      group.add(buildSculptedTerrace({ cx: t.cx, cz: t.cz, hx: t.hx, hz: t.hz, cornerR: t.cornerR || 2.2, topY: t.y, topMat, cliffMat: mats.cliffMat, seed: 70 + idx }));
    }
  });

  // Decorative stone step slabs joining SW Rim lobes + golden Astrolabe ring inlay
  addStonePad(group, -1.5, 0.5, 2.0, 11.5, 11.5, '#e8dcb2');
  addStonePad(group, 5.5, -31.5, 4.2, 12.2, 11.6, '#e8dcb2');
  addWoodenDeck(group, 7.2, 30.0, 1.0, 6.2, 4.2, mats.woodPlankMat);
  terrain.segments.push(buildFenceLine(group, { x0: -12.8, z0: 40.0, x1: -2.8, z1: 41.0, y: 1.05, posts: 5, mat: woodMat }));

  // Era-Reactive Living & Ancient Bridges + Blossom Stepping Islets
  const livingBridgeGroup = new THREE.Group();
  buildBridgeMesh(livingBridgeGroup, { ax: -21.0, az: -4.8, bx: -15.6, bz: -4.8, halfWidth: 1.85, startY: 2.45, endY: 2.4, archLift: 0.35, woodMat: mats.woodPlankMat, railingStyle: 'vermilion' });
  buildBridgeMesh(livingBridgeGroup, { ax: -15.6, az: -4.8, bx: -9.4, bz: -1.8, halfWidth: 1.85, startY: 2.4, endY: 2.0, archLift: 0.45, woodMat: mats.woodPlankMat, railingStyle: 'vermilion' });
  const dayStoneMeshes = buildSteppingStoneMeshes(
    livingBridgeGroup,
    ERA_STONES.filter((s) => s.era === 'day'),
    { stoneMat: mats.stoneMat, cliffMat: mats.cliffMat, capColor: '#f5b8c8', height: 2.4 }
  );
  group.add(livingBridgeGroup);

  const ancientBridgeGroup = new THREE.Group();
  buildBridgeMesh(ancientBridgeGroup, { ax: 14.8, az: 28.6, bx: 23.2, bz: 20.6, halfWidth: 1.8, startY: 1.0, endY: 1.45, archLift: 0.28, woodMat: mats.stoneMat, railMat: silverRail, railingStyle: 'low-wood' });
  buildBridgeMesh(ancientBridgeGroup, { ax: 26.2, az: 13.8, bx: 24.8, bz: 9.45, halfWidth: 1.75, startY: 1.45, endY: 2.85, archLift: 0.22, woodMat: mats.stoneMat, railMat: silverRail, railingStyle: 'low-wood' });
  buildBridgeMesh(ancientBridgeGroup, { ax: 19.0, az: 4.8, bx: 13.2, bz: 5.6, halfWidth: 1.85, startY: 2.85, endY: 2.55, archLift: 0.25, woodMat: mats.stoneMat, railMat: silverRail, railingStyle: 'low-wood' });
  buildBridgeMesh(ancientBridgeGroup, { ax: 13.2, az: 5.6, bx: 6.8, bz: 2.8, halfWidth: 1.85, startY: 2.55, endY: 2.0, archLift: 0.3, woodMat: mats.stoneMat, railMat: silverRail, railingStyle: 'low-wood' });
  buildSteppingStoneMeshes(
    ancientBridgeGroup,
    ERA_STONES.filter((s) => s.era === 'night'),
    { stoneMat: mats.stoneMat, cliffMat: mats.cliffMat, capColor: '#9ecbff', height: 2.8 }
  );
  group.add(ancientBridgeGroup);

  // Subtle translucent water ghost rings when bridges/stones fold away by time-of-day
  const ghostRingMat = new THREE.MeshBasicMaterial({ color: '#ffdf88', transparent: true, opacity: 0.22, side: THREE.DoubleSide });
  ERA_STONES.forEach((es) => {
    const gr = new THREE.Mesh(new THREE.RingGeometry(es.r * 0.72, es.r * 0.88, 18), ghostRingMat);
    gr.rotation.x = -Math.PI / 2;
    gr.position.set(es.x, 0.04, es.z);
    group.add(gr);
  });

  // Always-Solid Starlight Torii Causeway + 5 Angled Ceremonial Vermilion Torii Gates
  buildBridgeMesh(group, { ax: -3.2, az: -8.2, bx: -6.4, bz: -17.6, halfWidth: 2.15, startY: 2.0, endY: 3.05, archLift: 0.25, woodMat: mats.stoneMat, railingStyle: 'vermilion' });
  buildBridgeMesh(group, { ax: -5.4, az: -20.2, bx: 0.6, bz: -26.4, halfWidth: 2.15, startY: 3.05, endY: 4.2, archLift: 0.3, woodMat: mats.stoneMat, railingStyle: 'vermilion' });

  buildToriiGate(group, { x: -6.2, y: 1.05, z: 29.0, yaw: -0.22, color: '#df4432' });
  const c1Yaw = Math.atan2(-6.4 - -3.2, -17.6 - -8.2);
  const c2Yaw = Math.atan2(0.6 - -5.4, -26.4 - -20.2);
  [
    [-4.0, 2.35, -10.55, c1Yaw],
    [-5.44, 2.82, -14.78, c1Yaw],
    [-5.6, 3.05, -20.0, -0.75],
    [-3.3, 3.56, -22.37, c2Yaw],
    [-0.72, 4.02, -25.04, c2Yaw],
  ].forEach(([tx, ty, tz, tyaw]) => buildToriiGate(group, { x: tx, y: ty, z: tz, yaw: tyaw, scale: 1.12, color: '#df4432' }));

  // Grand Reflective 39.5m Star-Mirror Crater Lake & Multi-Island SDF
  const bounds = { minX: -44, maxX: 44, minZ: -44, maxZ: 42 };
  const ripples = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -99, 0));
  const waterMaterials = [];
  const sdfTex = buildProceduralPondSDF(
    bounds,
    (wx, wz) => Math.hypot(wx, wz + 1.0) < 39.5,
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
  buildWaterPlane({ group, w: 92, d: 90, cx: 0, cz: -1, y: 0.0, waterMaterials, sdfTex, bounds, ripples, isMirror: true });

  // Twin Diagonal Crater Sky Cascades pouring off Golden Astrolabe Ring into Mirror Lake
  const waterfallMaterials = [];
  const plungeFoams = [];
  buildOrganicCascade(group, waterfallMaterials, plungeFoams, {
    x: -9.8,
    zTop: 6.8,
    yTop: 2.02,
    yBot: -0.05,
    dropDist: 3.1,
    width: 2.4,
    yaw: -2.25,
    seed: 7.1,
    cliffMat: mats.cliffMat,
    capColor: '#d9c272',
  });
  buildOrganicCascade(group, waterfallMaterials, plungeFoams, {
    x: 6.4,
    zTop: -6.4,
    yTop: 2.02,
    yBot: -0.05,
    dropDist: 3.1,
    width: 2.4,
    yaw: 0.78,
    seed: 9.4,
    cliffMat: mats.cliffMat,
    capColor: '#d9c272',
  });

  // Living Day Wing Shrine Hall + Grounded Chochin Garland
  const livingShrine = buildJapaneseBuilding(group, {
    x: -30.5,
    y: 2.15,
    z: 3.8,
    yaw: 1.15,
    w: 5.8,
    d: 4.8,
    h: 2.7,
    floors: 1,
    wallColor: '#faf2e1',
    woodColor: '#9c2c22',
    roofMat: mats.roofTileMat,
    woodPlankMat: mats.woodPlankMat,
    shojiMaterials,
    engawa: true,
    norenColor: '#d83f31',
  });
  const livingGarland = buildChochinGarland(group, { ax: -28.0, az: 5.5, aGroundY: 2.15, bx: -21.2, bz: 1.2, bGroundY: 2.15, ay: 5.0, by: 5.0, sag: 0.65, count: 6, chochinMat });

  // Ancient Night Wing: Jagged Obsidian Piers & Levitating Keystone Monolith Arch
  const ruinStoneMat = createPixelToonMaterial({ color: '#8a92aa', emissive: '#64b5ff', emissiveIntensity: 0.25 });
  const obP1 = createBox(1.5, 4.4, 1.3, ruinStoneMat);
  obP1.position.set(27.4, 5.05, 4.0);
  const obP2 = createBox(1.4, 3.8, 1.2, ruinStoneMat);
  obP2.position.set(28.8, 4.75, 0.8);
  const archKeystone = createBox(4.8, 0.72, 1.2, ruinStoneMat);
  archKeystone.position.set(28.0, 7.6, 2.4);
  archKeystone.rotation.y = 0.42;
  group.add(obP1, obP2, archKeystone);

  // 4-Ring Rotating Golden Celestial Astrolabe floating above Crater Ring (-1.5, 6.8, 0.5)
  const astrolabeGroup = new THREE.Group();
  astrolabeGroup.position.set(ASTRO_POS.x, ASTRO_POS.y, ASTRO_POS.z);
  const astroMat = createPixelToonMaterial({ color: '#ffd966', emissive: '#ffaa44', emissiveIntensity: 0.45 });
  const astroCoreMat = new THREE.MeshBasicMaterial({ color: '#ffe066' });
  const astroRings = [
    new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.09, 8, 36), astroMat),
    new THREE.Mesh(new THREE.TorusGeometry(2.55, 0.08, 8, 30), astroMat),
    new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.07, 8, 24), astroMat),
  ];
  for (let s = 0; s < 8; s++) {
    const a = (s / 8) * Math.PI * 2;
    const spike = createBox(0.14, 0.48, 0.14, astroMat);
    spike.position.set(Math.cos(a) * 3.65, Math.sin(a) * 3.65, 0);
    spike.rotation.z = a - Math.PI * 0.5;
    astroRings[0].add(spike);
  }
  const astroCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), astroCoreMat);
  const astroHalo = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.92, 1),
    new THREE.MeshBasicMaterial({ color: '#fff3d0', transparent: true, opacity: 0.25, wireframe: true })
  );
  astroRings[0].rotation.x = 0.55;
  astroRings[1].rotation.y = 0.85;
  astroRings[2].rotation.x = -0.48;
  astrolabeGroup.add(...astroRings, astroCore, astroHalo);
  group.add(astrolabeGroup);

  // 18 Levitating Fractured Crater Monolith Shards + Broken Comet-Rib Sky Arch behind Summit
  const floatingShards = [];
  for (let i = 0; i < 18; i++) {
    const ang = (i / 18) * Math.PI * 2 + 0.35;
    const rad = 29.0 + (i % 4) * 3.2;
    const fx = Math.cos(ang) * rad;
    const fz = Math.sin(ang) * rad;
    const fy = 4.0 + (i % 5) * 1.9;
    if (fx < -2 && fz > 20) continue; // Keep arrival panorama clean
    const shard = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75 + (i % 3) * 0.36, 0), ruinStoneMat);
    shard.position.set(fx, fy, fz);
    shard.scale.set(0.85, 1.65, 0.85);
    group.add(shard);
    floatingShards.push({ shard, baseY: fy, phase: i * 0.85 });
  }
  for (let k = 0; k < 4; k++) {
    const rib = createBox(1.8, 3.6 + (k % 2) * 1.4, 1.4, ruinStoneMat);
    rib.position.set(16 + k * 2.6, 10 + (k % 2) * 1.6, -39 - (k % 2) * 1.5);
    rib.rotation.z = -0.35 + k * 0.22;
    group.add(rib);
  }

  // Puzzle 1: Living Day Altar & Ancient Night Altar + Era Conduit Filaments
  const makeEraAltar = (pos, color) => {
    const ag = new THREE.Group();
    ag.position.set(pos.x, 2.0, pos.z);
    const ped = createBox(1.0, 0.88, 1.0, mats.stoneMat);
    ped.position.y = 0.44;
    const cMat = new THREE.MeshBasicMaterial({ color: '#4c4f61' });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), cMat);
    crystal.position.y = 1.35;
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.52, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.92, 16), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    ag.add(ped, crystal, ring);
    group.add(ag);
    return { crystal, cMat, ringMat };
  };
  const livingAltarMesh = makeEraAltar(LIVING_ALTAR, '#ffd954');
  const ancientAltarMesh = makeEraAltar(ANCIENT_ALTAR, '#9ecbff');

  const addLightBeam = (a, b, color, width = 0.12) => {
    const pA = new THREE.Vector3(a.x, a.y, a.z);
    const pB = new THREE.Vector3(b.x, b.y, b.z);
    const len = pA.distanceTo(pB);
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(width, width, len),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
    );
    bar.position.copy(pA).lerp(pB, 0.5);
    bar.lookAt(pB);
    bar.visible = false;
    group.add(bar);
    return bar;
  };
  const livingBeam = addLightBeam({ x: LIVING_ALTAR.x, y: 3.35, z: LIVING_ALTAR.z }, ASTRO_POS, '#ffd954', 0.14);
  const ancientBeam = addLightBeam({ x: ANCIENT_ALTAR.x, y: 3.35, z: ANCIENT_ALTAR.z }, ASTRO_POS, '#9ecbff', 0.14);

  // Puzzle 2: 5 Constellation Star Plinths -> Progressive Star Filaments + Full 52m Comet Crest
  const starMeshes = [];
  const starLiveBeams = [];
  starSpecs.forEach((sp) => {
    const sg = new THREE.Group();
    sg.position.set(sp.x, sp.y, sp.z);
    const post = createCylinder(0.3, 0.38, 0.85, 8, mats.stoneMat);
    post.position.y = 0.42;
    const sMat = new THREE.MeshBasicMaterial({ color: '#454e66' });
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), sMat);
    star.position.y = 1.18;
    const rMat = new THREE.MeshBasicMaterial({ color: sp.color, transparent: true, opacity: 0.48, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.48, 0.68, 14), rMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    sg.add(post, star, ring);
    group.add(sg);
    starMeshes.push({ star, sMat, rMat });
    starLiveBeams.push(addLightBeam({ x: sp.x, y: sp.y + 1.25, z: sp.z }, ASTRO_POS, sp.color, 0.1));
  });

  const constBeamGroup = new THREE.Group();
  [
    [0, 1], [1, 3], [3, 2], [2, 0], [0, 4], [1, 4], [2, 4], [3, 4],
  ].forEach(([a, b]) => {
    const sa = starSpecs[a];
    const sb = starSpecs[b];
    const pA = new THREE.Vector3(sa.x, sa.y + 1.25, sa.z);
    const pB = new THREE.Vector3(sb.x, sb.y + 1.25, sb.z);
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.14, pA.distanceTo(pB)),
      new THREE.MeshBasicMaterial({ color: '#ffe580', transparent: true, opacity: 0.88 })
    );
    bar.position.copy(pA).lerp(pB, 0.5);
    bar.lookAt(pB);
    constBeamGroup.add(bar);
  });
  constBeamGroup.visible = false;
  group.add(constBeamGroup);

  // Until the Dusk heart (star 4) binds the constellation, gold Day stars go out when
  // Night falls and silver Night stars go out when Day returns.
  const HEART = starSpecs.findIndex((s) => s.time === 'dorada');
  function setStarLit(i, lit) {
    starsLit[i] = lit;
    starMeshes[i].sMat.color.set(lit ? starSpecs[i].color : '#454e66');
    starLiveBeams[i].visible = lit;
  }
  function fadeUnboundStars(timeId) {
    if (sealStar || starsLit[HEART]) return;
    const opposite = timeId === 'crepusculo' ? 'tarde' : timeId === 'tarde' ? 'crepusculo' : null;
    if (!opposite) return;
    let faded = false;
    starSpecs.forEach((sp, i) => {
      if (sp.time === opposite && starsLit[i]) {
        setStarLit(i, false);
        faded = true;
      }
    });
    if (faded) onToast?.('Unbound by the heart, the stars of the other sky fade away.');
  }

  // Puzzle 3: Twin Duet Pads + Harmonic Thread Ribbon connecting Hana & Mochi
  const mochiPad = new THREE.Mesh(
    new THREE.RingGeometry(0.65, 0.96, 18),
    new THREE.MeshBasicMaterial({ color: '#ffd966', transparent: true, opacity: 0.82, side: THREE.DoubleSide })
  );
  mochiPad.rotation.x = -Math.PI / 2;
  mochiPad.position.set(MOCHI_DUET_SPOT.x, 4.23, MOCHI_DUET_SPOT.z);

  const hanaPad = new THREE.Mesh(
    new THREE.RingGeometry(0.65, 0.96, 18),
    new THREE.MeshBasicMaterial({ color: '#ff82a8', transparent: true, opacity: 0.82, side: THREE.DoubleSide })
  );
  hanaPad.rotation.x = -Math.PI / 2;
  hanaPad.position.set(HANA_DUET_SPOT.x, 4.23, HANA_DUET_SPOT.z);

  const duetThread = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.12, Math.hypot(HANA_DUET_SPOT.x - MOCHI_DUET_SPOT.x, HANA_DUET_SPOT.z - MOCHI_DUET_SPOT.z)),
    new THREE.MeshBasicMaterial({ color: '#ffadc6' })
  );
  duetThread.position.set((MOCHI_DUET_SPOT.x + HANA_DUET_SPOT.x) * 0.5, 4.65, (MOCHI_DUET_SPOT.z + HANA_DUET_SPOT.z) * 0.5);
  duetThread.lookAt(HANA_DUET_SPOT.x, 4.65, HANA_DUET_SPOT.z);
  duetThread.visible = false;
  group.add(mochiPad, hanaPad, duetThread);

  // 4 Scenic Rim, Sanctuary & Horizon Benches
  const benches = [
    buildBench(group, { x: -15.6, y: 1.35, z: 30.8, yaw: 2.55, woodMat, woodDarkMat: mats.darkWoodMat, cushionColor: '#df4432' }),
    buildBench(group, { x: -21.6, y: 2.15, z: 7.6, yaw: 1.25, woodMat, woodDarkMat: mats.darkWoodMat, cushionColor: '#f5b8c8' }),
    buildBench(group, { x: 21.2, y: 2.85, z: -1.6, yaw: -1.1, woodMat, woodDarkMat: mats.darkWoodMat, cushionColor: '#9ecbff' }),
    buildBench(group, { x: 16.8, y: 3.95, z: -29.8, yaw: -2.4, woodMat, woodDarkMat: mats.darkWoodMat, cushionColor: '#ffd966' }),
  ];

  // Asymmetrically Grouped Sakura, Golden Momiji (Rim/Living) vs Silver Snow-Cedar & Cypress (Ancient Wing) (~34 trees)
  [
    [-24.2, 1.35, 31.2, 'sakura', 1.22], [-22.4, 1.35, 21.2, 'momiji-gold', 1.12],
    [-12.5, 1.35, 22.8, 'sakura', 1.1], [-11.8, 1.05, 36.8, 'sakura', 1.18],
    [-2.5, 1.05, 36.2, 'momiji-gold', 1.15], [12.4, 1.0, 32.8, 'snow-cedar', 1.15],
    [13.6, 1.0, 26.8, 'momiji-gold', 1.08], [-32.8, 2.15, 9.8, 'sakura', 1.28],
    [-25.2, 2.15, 11.2, 'sakura', 1.18], [-22.8, 2.45, -8.5, 'momiji-gold', 1.15],
    [-28.8, 2.45, -3.5, 'sakura', 1.12], [-20.2, 2.15, 1.2, 'momiji-gold', 1.08],
    [29.5, 1.45, 19.2, 'snow-cedar', 1.22], [21.0, 1.45, 21.8, 'cypress', 1.15],
    [29.4, 2.85, 7.2, 'snow-cedar', 1.25], [20.4, 2.85, -1.8, 'snow-cedar', 1.15],
    [27.8, 2.85, -2.5, 'cypress', 1.18], [-7.5, 2.0, 5.8, 'sakura', 1.12],
    [5.8, 2.0, -5.8, 'momiji-gold', 1.12], [-7.8, 2.0, -4.2, 'sakura', 1.05],
    [-9.5, 3.05, -19.2, 'sakura', 1.08], [1.2, 4.2, -37.2, 'sakura', 1.25],
    [11.8, 4.2, -36.8, 'momiji-gold', 1.25], [12.6, 4.2, -26.5, 'sakura', 1.15],
    [18.8, 3.95, -26.2, 'snow-cedar', 1.18], [-1.8, 4.2, -29.8, 'momiji-gold', 1.1],
    [-16.8, 1.35, 33.8, 'sakura', 1.08], [3.5, 1.0, 32.8, 'momiji-gold', 1.08],
    [-30.5, 2.15, -1.8, 'sakura', 1.1], [23.8, 1.45, 14.0, 'snow-cedar', 1.12],
    [5.2, 2.0, 8.2, 'sakura', 1.05], [15.5, 3.95, -23.2, 'momiji-gold', 1.08],
    [2.5, 4.2, -38.8, 'snow-cedar', 1.18], [9.5, 4.2, -24.2, 'sakura', 1.08],
  ].forEach(([x, y, z, type, s], idx) => buildOrganicTree(group, { type, x, y, z, scale: s, idx, treeSet }));

  const boulderColliders = buildMossBoulders(
    group,
    [
      [-15.2, 1.35, 25.0, 0.72, 0.5], [3.8, 1.0, 27.0, 0.72, 1.4],
      [-23.5, 2.15, 3.2, 0.78, 0.9], [22.8, 2.85, 6.2, 0.85, 2.1],
      [-6.5, 2.0, 4.2, 0.72, 0.3], [11.2, 4.2, -34.2, 0.85, 2.3],
    ],
    mats.cliffMat,
    '#d9c272'
  );
  buildGroundFoliage(group, terrain, bounds, {
    count: 950,
    allowedSurfaces: ['grass', 'stone'],
    grassColor: '#e6d88e',
    flowerColor: '#ffe0ea',
    flowerRatio: 0.32,
    seed: 707,
  });

  // 6 Circling Sky-Cranes over the Mirror Caldera
  const skyCranes = buildCirclingBirds(
    group,
    [0, 1, 2, 3, 4, 5].map((i) => ({
      kind: 'crane',
      cx: -1.5,
      cz: 0.5,
      y: 11.0 + (i % 3) * 1.8,
      rx: 18 + (i % 3) * 4,
      rz: 18 + (i % 3) * 4,
      speed: 0.22 + i * 0.025,
      phase: i * 1.05,
    }))
  );

  // 6 Stone Lanterns (9 PointLights total w/ Obelisks)
  const lanterns = [
    [-9.5, 1.05, 26.8],
    [10.8, 1.0, 27.2],
    [-25.5, 2.15, 8.8],
    [22.4, 2.85, 2.2],
    [-4.8, 3.05, -17.2],
    [2.8, 4.2, -26.8],
  ].map(([x, y, z]) => buildLanternProp(group, scene, sceneLights, x, y, z, false));
  terrain.addColliders({ circles: [...boulderColliders, ...lanterns.map((l) => l.collider)] });
  terrain.addColliders(collectPropColliders(group));

  const belfry = buildObelisksAndBell(group, scene, sceneLights, {
    x: BELFRY_BELL.x,
    y: 4.2,
    z: BELFRY_BELL.z,
    obelisks: [
      { x: 5.2, z: -37.2, color: '#9ecbff' },
      { x: 11.4, z: -30.2, color: '#ffe580' },
      { x: 8.6, z: -38.4, color: '#ff94c2' },
    ],
    bellColor: '#ebc158',
    bellCapColor: '#fff0ad',
    roofMat: mats.roofTileMat,
    woodMat,
    stoneMat: mats.stoneMat,
  });

  const starParticles = buildParticleField(group, 'stars', { minX: -40, maxX: 40, minY: 0.5, maxY: 18, minZ: -40, maxZ: 40 }, 180);
  const nightAtmo = buildNightAtmosphere(group, {
    fireflyBounds: { minX: -36, maxX: 36, minY: 0.8, maxY: 10.5, minZ: -38, maxZ: 36 },
    fireflyCount: 95,
    fireflyColor: '#9ed8ff',
    lightColor: '#ffe07d',
    kind: 'star',
    pathLights: [
      { x: -16.5, y: terrain.getHeightAt(-16.5, 25.0), z: 25.0 },
      { x: 6.2, y: terrain.getHeightAt(6.2, 27.2), z: 27.2 },
      { x: -24.5, y: terrain.getHeightAt(-24.5, 1.5), z: 1.5 },
      { x: 24.5, y: terrain.getHeightAt(24.5, 16.0), z: 16.0 },
      { x: 21.8, y: terrain.getHeightAt(21.8, 5.2), z: 5.2 },
      { x: -4.2, y: terrain.getHeightAt(-4.2, 6.2), z: 6.2 },
      { x: -6.2, y: terrain.getHeightAt(-6.2, -16.2), z: -16.2 },
      { x: 2.5, y: terrain.getHeightAt(2.5, -28.0), z: -28.0 },
    ],
  });
  const wildlife = buildAmbientWildlife(group, {
    butterflies: [
      { x: -16.0, y: 1.35, z: 27.5, color: '#ffe082', r: 3.0 },
      { x: -27.5, y: 2.15, z: 4.5, color: '#ffc4de', r: 3.2 },
      { x: 24.5, y: 2.85, z: 3.0, color: '#a8d4ff', kind: 'dragonfly', r: 2.8 },
    ],
    sparrows: [
      { x: -14.2, y: 1.4, z: 30.2, yaw: 0.7 },
      { x: -1.5, y: 2.02, z: 5.2, yaw: -0.5 },
      { x: 15.2, y: 3.97, z: -27.0, yaw: -2.1 },
    ],
  });

  const worldBuilder = {
    shojiMaterials,
    chochinMaterials: [chochinMat],
    waterMaterials,
    waterfallMaterials,
    lanterns,
    addWaterRipple: () => {},
    addGravelFootprint: () => {},
    getLitLanternCount: () => lanterns.filter((l) => l.isLit).length,
    triggerHintPulse: (zone) => {
      if (zone === 'belfry') belfry.triggerHintPulse();
    },
  };

  function checkUnseal() {
    if (!bellUnsealed && sealEra && sealStar && sealDuet) {
      bellUnsealed = true;
      belfry.setBellUnsealed(true);
      audio.playSealAwaken?.();
      progressVersion++;
      onToast?.('The Grand Sky Bell is unsealed.');
    }
    onStateChange?.(puzzleManager.getStatusSnapshot());
  }

  const puzzleManager = {
    get progressVersion() { return progressVersion; },
    get chapterComplete() { return chapterComplete; },
    get bellUnsealed() { return bellUnsealed; },
    getStatusSnapshot: () => ({ seals: [sealEra, sealStar, sealDuet], bellUnsealed, chapterComplete }),
    getPuzzleZoneForPos: (x, z) => {
      if (chapterComplete) return null;
      const reg = terrain.getRegionInfoAt(x, z).id;
      if (!sealStar && reg === 'rim') return 'star';
      if (!sealEra && (reg === 'crater-ring' || reg === 'living-wing' || reg === 'ancient-wing')) return 'era';
      if (!sealDuet && reg === 'sky-belfry') return 'duet';
      return 'belfry';
    },
    getHintText: (zone) => {
      if (zone === 'era') return 'Bridge Living Day around the west spiral and Ancient Night around the east (Dusk opens both).';
      if (zone === 'star') return 'Gold stars wake by Day, silver by Night, and each fades in the other sky until the Dusk heart binds them. The heart needs a gold star to hold.';
      if (zone === 'duet') return 'Call Mochi onto the golden circle beside the Sky Bell, then step onto your crimson ring.';
      return bellUnsealed ? 'All eras and stars unite. Strike the Grand Sky Bell.' : 'Unite the Era Spirals, Star Constellation, and Twin Duet.';
    },
    getHintTargetPos: () => {
      if (!sealStar) {
        const si = starsLit.findIndex((s) => !s);
        return starSpecs[si >= 0 ? si : 0];
      }
      if (!sealEra) return !eraAltars.day ? LIVING_ALTAR : ANCIENT_ALTAR;
      if (!sealDuet) return HANA_DUET_SPOT;
      return BELFRY_BELL;
    },
  };

  const spots = [];
  spots.push({
    id: 'living-altar',
    getPos: () => LIVING_ALTAR,
    radius: 2.5,
    getLabel: () => (eraAltars.day ? null : 'E · Living Altar'),
    trigger: () => {
      if (curTimeId !== 'tarde' && curTimeId !== 'dorada') {
        audio.playLanternChime(false);
        return;
      }
      eraAltars.day = true;
      livingAltarMesh.cMat.color.set('#ffd954');
      livingBeam.visible = true;
      progressVersion++;
      audio.playEraShift?.();
      if (eraAltars.day && eraAltars.night && !sealEra) {
        sealEra = true;
        belfry.launchSealOrb(new THREE.Vector3(LIVING_ALTAR.x, 3.5, LIVING_ALTAR.z), 0);
        audio.playSealAwaken?.();
        onToast?.('Era Seal awakened.');
        checkUnseal();
      }
    },
  });

  spots.push({
    id: 'ancient-altar',
    getPos: () => ANCIENT_ALTAR,
    radius: 2.5,
    getLabel: () => (eraAltars.night ? null : 'E · Ancient Altar'),
    trigger: () => {
      if (curTimeId !== 'crepusculo' && curTimeId !== 'dorada') {
        audio.playLanternChime(false);
        return;
      }
      eraAltars.night = true;
      ancientAltarMesh.cMat.color.set('#9ecbff');
      ancientBeam.visible = true;
      progressVersion++;
      audio.playEraShift?.();
      if (eraAltars.day && eraAltars.night && !sealEra) {
        sealEra = true;
        belfry.launchSealOrb(new THREE.Vector3(ANCIENT_ALTAR.x, 3.5, ANCIENT_ALTAR.z), 0);
        audio.playSealAwaken?.();
        onToast?.('Era Seal awakened.');
        checkUnseal();
      }
    },
  });

  starSpecs.forEach((sp, i) => {
    spots.push({
      id: `star-${i}`,
      getPos: () => sp,
      radius: 2.5,
      getLabel: () => (starsLit[i] ? null : 'E · Star Plinth'),
      trigger: () => {
        if (curTimeId !== sp.time) {
          audio.playLanternChime(false);
          return;
        }
        // The heart needs a gold Day star still shining to bind to
        if (i === HEART && !starSpecs.some((s, k) => s.time === 'tarde' && starsLit[k])) {
          audio.playLanternChime(false);
          onToast?.('The heart finds nothing to bind. No Day star is shining.');
          return;
        }
        setStarLit(i, true);
        progressVersion++;
        audio.playPrismBeam?.();
        if (starsLit.every(Boolean) && !sealStar) {
          sealStar = true;
          constBeamGroup.visible = true;
          belfry.launchSealOrb(new THREE.Vector3(sp.x, sp.y + 1.8, sp.z), 1);
          audio.playSealAwaken?.();
          onToast?.('Star Seal awakened.');
          checkUnseal();
        }
      },
    });
  });

  spots.push({
    id: 'twin-duet',
    getPos: () => HANA_DUET_SPOT,
    radius: 2.6,
    getLabel: () => (sealDuet ? null : 'E · Harmonize'),
    trigger: () => {
      if (sealDuet) return;
      if (!cat.isHoldingSpot?.(MOCHI_DUET_SPOT, 2.05)) {
        audio.playLanternChime(false);
        cat.goHoldSpot?.(MOCHI_DUET_SPOT, 22.0);
        return;
      }
      sealDuet = true;
      duetThread.visible = true;
      progressVersion++;
      belfry.launchSealOrb(new THREE.Vector3(HANA_DUET_SPOT.x, 5.2, HANA_DUET_SPOT.z), 2);
      audio.playSealAwaken?.();
      onToast?.('Duet Seal awakened.');
      checkUnseal();
    },
  });

  spots.push({
    id: 'sky-bell',
    getPos: () => BELFRY_BELL,
    radius: 3.1,
    getLabel: () => 'E · Grand Sky Bell',
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
        starParticles.triggerStorm();
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
      if (Math.hypot(cat.position.x - px, cat.position.z - pz) <= 2.9) {
        return { spot: null, label: 'F · Mochi', canPetCat: true };
      }
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
      if (Math.hypot(player.position.x - MOCHI_DUET_SPOT.x, player.position.z - MOCHI_DUET_SPOT.z) < 8.0) {
        cat.goHoldSpot?.(MOCHI_DUET_SPOT, 22.0);
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

  return {
    terrain,
    worldBuilder,
    foliage: {
      setFireflyIntensity: (v) => nightAtmo.setIntensity(Math.max(0.22, v)),
      triggerPetalStorm: () => starParticles.triggerStorm(),
      update: (dt, elapsed) => {
        starParticles.update(dt, elapsed);
        nightAtmo.update(dt, elapsed);
      },
    },
    puzzleManager,
    interactions,
    spawnPoint: { x: -7.5, z: 36.2, yaw: 2.75 },
    catSpawnPoint: { x: -9.4, z: 36.6 },
    titleFocusPos: new THREE.Vector3(-1.5, 3.6, 2.0),
    biomeProfile: 'comet',
    // Staging for the ending film (EndingCinematic): the bell, the bench Hana rests on, the crater centre
    endingStage: {
      bell: { x: BELFRY_BELL.x, y: 4.2, z: BELFRY_BELL.z },
      bellAngle: -0.6, // the one side of the belfry with no tree between camera and bell
      bench: benches[3],
      center: { x: -1.5, y: 3.6, z: 2.0 },
      celebrate: () => starParticles.triggerStorm(),
    },
    onTimeChanged(timeId) {
      curTimeId = timeId;
      fadeUnboundStars(timeId);
      // Stranding on a vanished Era stone/bridge is handled for every chapter in main.js.
    },
    update(dt, elapsed, focusPos) {
      updateClouds(clouds, dt, elapsed);
      updateBuildings([livingShrine], elapsed);
      updateChochins(livingGarland.lanterns, dt, elapsed, focusPos);
      belfry.update(dt, elapsed);
      updateCascades(plungeFoams, elapsed);
      skyCranes.update(elapsed);
      wildlife.update(dt, elapsed, focusPos);

      livingBridgeGroup.visible = livingBridgeUp();
      ancientBridgeGroup.visible = ancientBridgeUp();

      // Morph Ancient Monolith Keystone & Core between Day, Dusk & Night
      const litSeals = (sealEra ? 1 : 0) + (sealStar ? 1 : 0) + (sealDuet ? 1 : 0);
      const speedMult = 1 + litSeals * 0.35;
      astrolabeGroup.rotation.y = elapsed * 0.32 * speedMult;
      astroRings[0].rotation.z = elapsed * 0.44 * speedMult;
      astroRings[1].rotation.x = -elapsed * 0.36 * speedMult;
      astroRings[2].rotation.z = elapsed * 0.58 * speedMult;

      const coreHex = curTimeId === 'crepusculo' ? '#9ed2ff' : curTimeId === 'dorada' ? '#ff9ab8' : '#ffe066';
      astroCoreMat.color.lerp(new THREE.Color(coreHex), 1 - Math.exp(-dt * 4));

      const ruinGlow = curTimeId === 'crepusculo' ? 0.85 : curTimeId === 'dorada' ? 0.55 : 0.08;
      const ruinTint = curTimeId === 'dorada' ? '#f0a4ff' : '#64b5ff';
      ruinStoneMat.emissive.lerp(new THREE.Color(ruinTint), 1 - Math.exp(-dt * 4));
      ruinStoneMat.emissiveIntensity += (ruinGlow - ruinStoneMat.emissiveIntensity) * (1 - Math.exp(-dt * 4));
      const keystoneY = curTimeId === 'crepusculo' ? 8.35 : 7.6;
      archKeystone.position.y += (keystoneY - archKeystone.position.y) * (1 - Math.exp(-dt * 3));

      floatingShards.forEach((fs) => {
        fs.shard.position.y = fs.baseY + Math.sin(elapsed * 0.9 + fs.phase) * 0.35;
        fs.shard.rotation.y = elapsed * 0.25 + fs.phase;
      });

      livingAltarMesh.crystal.rotation.y = elapsed * 1.5;
      ancientAltarMesh.crystal.rotation.y = -elapsed * 1.5;
      starMeshes.forEach((sm, i) => {
        sm.star.rotation.y = elapsed * 1.8 + i;
      });
    },
    dispose() {
      belfry.dispose();
      sdfTex.dispose();
      disposeObject3D(group, scene, sceneLights);
    },
  };
}

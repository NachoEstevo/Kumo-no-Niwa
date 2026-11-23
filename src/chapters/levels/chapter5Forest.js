import * as THREE from 'three';
import { getFernSprigTexture, getMossForestTexture } from '../../engine/PixelTextures.js';
import { createPixelToonMaterial } from '../../engine/ToonMaterials.js';
import {
  LevelTerrain,
  addStonePad,
  addWoodenDeck,
  buildAmbientWildlife,
  buildBambooCluster,
  buildBench,
  buildBridgeMesh,
  buildCircularTerrace,
  buildCloudSeaAndCumulus,
  buildGroundFoliage,
  buildLanternProp,
  buildMossBoulders,
  buildNightAtmosphere,
  buildObelisksAndBell,
  buildOrganicCascade,
  collectPropColliders,
  buildOrganicTree,
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

export function createChapter5({
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
  const mats = createSharedMatSet('#88ab7e', getMossForestTexture());
  const treeSet = createTreeBillboardSet();
  const darkWoodMat = createPixelToonMaterial({ color: '#423229' });
  const mossMat = createPixelToonMaterial({ color: '#4d7a42' });
  const mossVineMat = createPixelToonMaterial({ color: '#42783c' });

  // Puzzle 1: 3 Rotatable Crystal Prisms in Sunken Amphitheater (target steps [0, 0, 0] under Night firefly beam)
  const prismSteps = [1, 2, 3];
  let sealFirefly = false;

  // Puzzle 2: 4 Spiral Lotus Buds awakened 1..4 -> springs 5 blooming giant lily pads to Lagoon Island
  const lotusLit = [false, false, false, false];
  let nextLotusIdx = 0;
  let sealLotus = false;

  // Puzzle 3: 2 Guiding Chasm Lamps projecting Diagonal Night Shadow Bridge -> Shadow Totem
  const lampsLit = [false, false];
  let curTimeId = dayCycle.getCurrentPreset().id;
  const shadowWalkActive = () => lampsLit[0] && lampsLit[1] && curTimeId === 'crepusculo';
  let sealShadow = false;

  let bellUnsealed = false;
  let chapterComplete = false;
  let progressVersion = 0;

  const lotusCoords = [
    { x: 4.8, z: 23.6 },
    { x: 3.6, z: 19.2 },
    { x: -2.2, z: 18.8 },
    { x: -4.4, z: 23.0 },
  ];

  const EMITTER_POS = { x: -6.8, z: 5.4 };
  const RECEIVER_POS = { x: -0.6, z: 6.4 };
  const prismSpots = [
    { x: -7.2, z: -1.8, aimX: 0.8, aimZ: -4.2 },
    { x: 0.8, z: -4.2, aimX: 4.6, aimZ: 2.0 },
    { x: 4.6, z: 2.0, aimX: -0.6, aimZ: 6.4 },
  ];
  const guidingLamps = [
    { x: -7.8, z: -17.4 },
    { x: -1.4, z: -17.4 },
  ];
  const SHADOW_TOTEM = { x: -11.6, z: -29.8 };
  const BELFRY_BELL = { x: -10.8, z: -37.2 };

  const BROOK_STONES = [
    { x: 14.5, z: 25.8, r: 1.6, visualR: 1.18, y: 1.15, surface: 'stone' },
    { x: 13.0, z: 24.8, r: 1.6, visualR: 1.14, y: 1.12, surface: 'stone' },
    { x: 11.3, z: 24.1, r: 1.6, visualR: 1.16, y: 1.18, surface: 'stone' },
    { x: 9.6, z: 23.7, r: 1.6, visualR: 1.14, y: 1.26, surface: 'stone' },
    { x: 8.1, z: 23.3, r: 1.6, visualR: 1.18, y: 1.35, surface: 'stone' },
  ];

  const LILY_STONES = [
    { x: -12.3, z: 4.5, r: 1.68, y: 0.72, surface: 'grass', enabledFn: () => lotusLit[0] },
    { x: -14.0, z: 5.5, r: 1.68, y: 0.78, surface: 'grass', enabledFn: () => lotusLit[1] },
    { x: -15.6, z: 6.8, r: 1.68, y: 0.86, surface: 'grass', enabledFn: () => lotusLit[2] },
    { x: -17.3, z: 7.9, r: 1.68, y: 0.94, surface: 'grass', enabledFn: () => lotusLit[3] },
    { x: -19.0, z: 8.8, r: 1.68, y: 1.02, surface: 'grass', enabledFn: () => lotusLit[3] },
  ];

  const columnPositions = [];
  const colAngles = [-2.75, -2.15, -1.08, -0.48, 0.58, 1.02, 1.88, 2.42];
  colAngles.forEach((a, i) => {
    columnPositions.push({
      x: -2.0 + Math.cos(a) * 9.8,
      z: 1.8 + Math.sin(a) * 9.8,
      h: 2.6 + (i % 3) * 0.85,
      r: 0.58,
    });
  });

  const terraces = [
    { id: 'trail', shape: 'box', cx: 22.0, cz: 29.0, hx: 8.2, hz: 5.4, cornerR: 2.8, y: 1.15, surface: 'grass', region: { id: 'trail', jp: '苔の小径', en: 'Misty Moss Trail' } },
    { id: 'glade', shape: 'box', cx: 1.2, cz: 22.2, hx: 8.6, hz: 5.5, cornerR: 2.8, y: 1.35, surface: 'grass', region: { id: 'glade', jp: '蓮灯の川辺', en: 'Brookside Lotus Glade' } },
    { id: 'amphitheater', shape: 'circle', cx: -2.0, cz: 1.8, r: 10.8, y: 0.65, surface: 'stone', region: { id: 'clearing', jp: '蛍光の円壇', en: 'Sunken Prism Amphitheater' } },
    { id: 'lagoon', shape: 'circle', cx: -24.4, cz: 10.2, r: 6.0, y: 1.05, surface: 'grass', region: { id: 'lagoon', jp: '蓮花の秘島', en: 'Hidden Lotus Shrine Island' } },
    { id: 'cypress', shape: 'box', cx: 21.8, cz: 6.8, hx: 8.4, hz: 8.6, cornerR: 3.4, y: 2.15, surface: 'grass', region: { id: 'cypress', jp: '巨杉の滝杜', en: 'Hollow Giant Cypress Grove' } },
    { id: 'overlook', shape: 'box', cx: -3.5, cz: -15.2, hx: 7.6, hz: 4.0, cornerR: 2.2, y: 1.85, surface: 'stone', region: { id: 'overlook', jp: '影渡の断崖', en: 'Shadow Chasm Overlook' } },
    { id: 'belfry', shape: 'circle', cx: -10.5, cz: -34.6, r: 8.0, y: 3.25, surface: 'stone', region: { id: 'belfry', jp: '深森の鐘楼', en: 'Overgrown Belfry Ruins' } },
  ];

  const terrain = new LevelTerrain({
    defaultRegion: { id: 'trail', jp: '苔の小径', en: 'Misty Moss Trail' },
    terraces,
    bridges: [
      // Gnarled Mossy Log Bridge (glade -> sunken amphitheater)
      { ax: 1.4, az: 18.2, bx: -0.6, bz: 11.1, halfWidth: 1.65, startY: 1.35, endY: 0.65, archLift: 0.22, surface: 'wood' },
      // 2-segment Yatsuhashi Rootwalk (trail -> cypress)
      { ax: 21.8, az: 25.0, bx: 23.8, bz: 19.6, halfWidth: 1.55, startY: 1.15, endY: 1.65, archLift: 0.14, surface: 'wood' },
      { ax: 23.8, az: 19.6, bx: 21.6, bz: 13.8, halfWidth: 1.55, startY: 1.65, endY: 2.15, archLift: 0.14, surface: 'wood' },
      // Secondary Winding Root-Bridge Shortcut (cypress -> amphitheater past waterfall mist)
      { ax: 13.6, az: 6.6, bx: 11.4, bz: 4.8, halfWidth: 1.5, startY: 2.15, endY: 1.4, archLift: 0.08, surface: 'wood' },
      { ax: 11.4, az: 4.8, bx: 7.2, bz: 3.0, halfWidth: 1.5, startY: 1.4, endY: 0.65, archLift: 0.06, surface: 'wood' },
      // Vine-Draped Ruin Stair (amphitheater -> overlook, flush unburied top)
      { ax: -2.4, az: -7.5, bx: -3.4, bz: -11.35, halfWidth: 2.1, startY: 0.65, endY: 1.85, archLift: 0.04, surface: 'stone' },
      // Diagonal Night Shadow Bridge across northern cloud chasm (gated by shadowWalkActive)
      { ax: -4.6, az: -17.8, bx: -8.8, bz: -28.4, halfWidth: 2.15, startY: 1.85, endY: 3.25, archLift: 0.35, surface: 'stone', enabledFn: shadowWalkActive },
    ],
    stones: [...BROOK_STONES, ...LILY_STONES],
    circles: [
      ...prismSpots.map((p) => ({ x: p.x, z: p.z, r: 0.56 })),
      ...lotusCoords.map((l) => ({ x: l.x, z: l.z, r: 0.52 })),
      { x: EMITTER_POS.x, z: EMITTER_POS.z, r: 0.6 },
      { x: RECEIVER_POS.x, z: RECEIVER_POS.z, r: 0.6 },
      ...guidingLamps.map((g) => ({ x: g.x, z: g.z, r: 0.54 })),
      ...columnPositions.map((c) => ({ x: c.x, z: c.z, r: c.r })),
      // Monumental Hollow Giant Cypress & waterfall plunge basin
      { x: 22.8, z: 7.4, r: 1.85 },
      { x: 24.8, z: 5.4, r: 2.15 },
      // Lagoon sanctuary shrine
      { x: -25.8, z: 10.8, r: 1.65 },
      // Shadow Totem, Obelisks & Moss Bell
      { x: SHADOW_TOTEM.x, z: SHADOW_TOTEM.z, r: 0.56 },
      { x: -14.8, z: -33.2, r: 0.56 },
      { x: -6.2, z: -33.6, r: 0.56 },
      { x: -10.4, z: -32.8, r: 0.52 },
      { x: BELFRY_BELL.x, z: BELFRY_BELL.z, r: 0.96 },
      // 3 Benches
      { x: 25.4, z: 25.6, r: 0.72 },
      { x: -22.2, z: 13.4, r: 0.72 },
      { x: 18.8, z: 11.4, r: 0.72 },
    ],
  });

  const clouds = [];
  buildCloudSeaAndCumulus(group, clouds, -12.8, 52);

  terraces.forEach((t, idx) => {
    const topMat = t.surface === 'stone' ? mats.stoneMat : mats.grassMat;
    if (t.shape === 'circle') {
      group.add(buildCircularTerrace({ cx: t.cx, cz: t.cz, r: t.r, topY: t.y, topMat, cliffMat: mats.cliffMat, seed: 50 + idx }));
    } else {
      group.add(buildSculptedTerrace({ cx: t.cx, cz: t.cz, hx: t.hx, hz: t.hz, cornerR: t.cornerR || 2.2, topY: t.y, topMat, cliffMat: mats.cliffMat, seed: 50 + idx }));
    }
  });

  // High scenic backdrop cliff behind Cypress Waterfall
  group.add(buildSculptedTerrace({ cx: 29.2, cz: 1.8, hx: 4.2, hz: 3.4, cornerR: 1.8, topY: 6.6, topMat: mats.grassMat, cliffMat: mats.cliffMat, seed: 59 }));

  // Courtyard pads, concentric sunken rings & wooden Trail Overlook deck
  addStonePad(group, -2.0, 1.8, 0.65, 11.0, 11.0, '#b8c4b2');
  addStonePad(group, -10.5, -34.6, 3.25, 10.6, 9.8, '#b8c4b2');
  addWoodenDeck(group, 25.4, 25.6, 1.15, 3.8, 2.4, mats.woodPlankMat);

  buildToriiGate(group, { x: 19.6, y: 1.15, z: 27.6, yaw: -0.62, color: '#4d5940' });

  // Mossy Log Bridge, Yatsuhashi Rootwalk + bend stone piling, Root Shortcut Loop + Giant Cypress Root Stump, Ruin Stair
  buildBridgeMesh(group, { ax: 1.4, az: 18.2, bx: -0.6, bz: 11.1, halfWidth: 1.65, startY: 1.35, endY: 0.65, archLift: 0.22, woodMat: darkWoodMat, railMat: mossVineMat, railingStyle: 'low-wood' });
  buildBridgeMesh(group, { ax: 21.8, az: 25.0, bx: 23.8, bz: 19.6, halfWidth: 1.55, startY: 1.15, endY: 1.65, archLift: 0.14, woodMat: mats.woodPlankMat, railMat: darkWoodMat, railingStyle: 'low-wood' });
  buildBridgeMesh(group, { ax: 23.8, az: 19.6, bx: 21.6, bz: 13.8, halfWidth: 1.55, startY: 1.65, endY: 2.15, archLift: 0.14, woodMat: mats.woodPlankMat, railMat: darkWoodMat, railingStyle: 'low-wood' });
  const rootPier = createCylinder(1.1, 1.3, 3.2, 8, mats.cliffMat);
  rootPier.position.set(23.8, -0.01, 19.6);
  group.add(rootPier);

  buildBridgeMesh(group, { ax: 13.6, az: 6.6, bx: 11.4, bz: 4.8, halfWidth: 1.5, startY: 2.15, endY: 1.4, archLift: 0.08, woodMat: darkWoodMat, railMat: mossVineMat, railingStyle: 'low-wood' });
  buildBridgeMesh(group, { ax: 11.4, az: 4.8, bx: 7.2, bz: 3.0, halfWidth: 1.5, startY: 1.4, endY: 0.65, archLift: 0.06, woodMat: darkWoodMat, railMat: mossVineMat, railingStyle: 'low-wood' });
  const stumpPier = createCylinder(1.25, 1.6, 3.0, 9, darkWoodMat);
  stumpPier.position.set(11.4, -0.16, 4.8);
  group.add(stumpPier);

  buildStairMesh(group, { ax: -2.4, az: -7.5, bx: -3.4, bz: -11.35, width: 4.1, startY: 0.65, endY: 1.85, steps: 7, stoneMat: mats.stoneMat });

  buildSteppingStoneMeshes(group, BROOK_STONES, {
    stoneMat: mats.stoneMat,
    cliffMat: mats.cliffMat,
    capColor: '#4c7e3b',
    height: 2.2,
  });

  // Continuous Night Shadow Bridge across northern cloud chasm
  const shadowBridgeMat = new THREE.MeshBasicMaterial({ color: '#1b1d3d' });
  const shadowTrimMat = new THREE.MeshBasicMaterial({ color: '#ffd982' });
  const shadowBridgeMesh = buildBridgeMesh(group, {
    ax: -4.6,
    az: -17.8,
    bx: -8.8,
    bz: -28.4,
    halfWidth: 2.05,
    startY: 1.85,
    endY: 3.25,
    archLift: 0.35,
    woodMat: shadowBridgeMat,
    railMat: shadowTrimMat,
    railingStyle: 'none',
    emissiveBorderMat: shadowTrimMat,
  });
  shadowBridgeMesh.visible = false;

  // Horseshoe Dark Mirror Forest River (cuts off at z = -18.5 so Shadow Chasm plunges cleanly to cloud sea!)
  const bounds = { minX: -42, maxX: 42, minZ: -44, maxZ: 40 };
  const ripples = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -99, 0));
  const waterMaterials = [];
  const riverTerraces = terraces.filter((t) => t.id !== 'belfry');
  const sdfTex = buildProceduralPondSDF(
    bounds,
    (wx, wz) => wz > -18.5 && Math.hypot((wx + 2) / 36, (wz - 9) / 29) < 1.0,
    (wx, wz) => {
      let d = 999;
      for (let i = 0; i < riverTerraces.length; i++) {
        const t = riverTerraces[i];
        const td =
          t.shape === 'circle'
            ? Math.hypot(wx - t.cx, wz - t.cz) - t.r
            : roundedBoxSDF(wx, wz, t.cx, t.cz, t.hx, t.hz, t.cornerR || 2.0);
        if (td < d) d = td;
      }
      return Math.max(0, d);
    }
  );
  buildWaterPlane({ group, w: 84, d: 84, cx: 0, cz: -2, y: -0.45, waterMaterials, sdfTex, bounds, ripples, isMirror: true });

  // Two-Tier Curved Moss Waterfall (Cliff Top 6.6 -> Cypress Rock Pool 2.18 -> Mirror River -0.45)
  const waterfallMaterials = [];
  const plungeFoams = [];
  buildOrganicCascade(group, waterfallMaterials, plungeFoams, {
    x: 27.0,
    zTop: 3.6,
    yTop: 6.6,
    yBot: 2.2,
    dropDist: 3.2,
    width: 2.8,
    yaw: -0.65,
    seed: 2.8,
    cliffMat: mats.cliffMat,
    capColor: '#4c7e3b',
  });
  buildOrganicCascade(group, waterfallMaterials, plungeFoams, {
    x: 15.2,
    zTop: 2.4,
    yTop: 2.15,
    yBot: -0.45,
    dropDist: 2.2,
    width: 1.9,
    yaw: -0.85,
    seed: 5.1,
    cliffMat: mats.cliffMat,
    capColor: '#4c7e3b',
  });
  const cypPool = new THREE.Mesh(
    new THREE.CylinderGeometry(2.1, 2.2, 0.22, 18),
    createPixelToonMaterial({ color: '#56a8b8', emissive: '#3e8e9e', emissiveIntensity: 0.16 })
  );
  cypPool.position.set(24.8, 2.18, 5.4);
  group.add(cypPool);

  // Monumental Root-Buttressed Hollow Giant Cypress + Illuminated Alcove + Weathered Jizo Statues
  const hollowGroup = new THREE.Group();
  hollowGroup.position.set(22.8, 2.15, 7.4);
  const barkDark = createPixelToonMaterial({ color: '#3b2c23' });
  const hTrunk = createCylinder(1.2, 1.55, 6.2, 10, barkDark);
  hTrunk.position.y = 3.1;
  hollowGroup.add(hTrunk);
  for (let r = 0; r < 6; r++) {
    const a = (r / 6) * Math.PI * 2;
    const root = createBox(0.5, 1.8, 2.2, barkDark);
    root.position.set(Math.cos(a) * 1.45, 0.75, Math.sin(a) * 1.45);
    root.rotation.y = -a + Math.PI * 0.5;
    root.rotation.x = 0.42;
    hollowGroup.add(root);
  }
  const hollowGlow = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.45, 0),
    new THREE.MeshBasicMaterial({ color: '#8cffd6' })
  );
  hollowGlow.position.set(-1.35, 1.1, 0);
  hollowGroup.add(hollowGlow);
  group.add(hollowGroup);
  buildOrganicTree(group, { type: 'cypress', x: 22.8, y: 5.2, z: 7.4, scale: 1.95, idx: 91, treeSet });

  // 4 Weathered Stone Jizo Statues with Red Cloth Bibs
  const bibMat = createPixelToonMaterial({ color: '#c84232' });
  [
    [17.2, 1.15, 29.8], [21.3, 2.15, 7.4], [-5.2, 0.65, -6.2], [-14.6, 3.25, -31.8],
  ].forEach(([jx, jy, jz]) => {
    const jg = new THREE.Group();
    jg.position.set(jx, jy, jz);
    const body = createCylinder(0.18, 0.24, 0.55, 8, mats.stoneMat);
    body.position.y = 0.28;
    const bib = createCylinder(0.2, 0.22, 0.16, 8, bibMat);
    bib.position.y = 0.44;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mats.stoneMat);
    head.position.y = 0.66;
    jg.add(body, bib, head);
    group.add(jg);
  });

  // Hidden Lotus Shrine Island Pavilion + Solitary Forest Sakura + 14 Pond Lotus Blossoms
  const pavilion = new THREE.Group();
  pavilion.position.set(-25.8, 1.05, 10.8);
  pavilion.rotation.y = 0.55;
  for (const px of [-1.05, 1.05]) {
    for (const pz of [-1.05, 1.05]) {
      const p = createBox(0.18, 2.1, 0.18, darkWoodMat);
      p.position.set(px, 1.05, pz);
      pavilion.add(p);
    }
  }
  const pavRoof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.15, 4), mossMat);
  pavRoof.rotation.y = Math.PI / 4;
  pavRoof.position.y = 2.65;
  const pavLantern = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 8, 6),
    new THREE.MeshBasicMaterial({ color: '#ffd982' })
  );
  pavLantern.position.y = 1.65;
  pavilion.add(pavRoof, pavLantern);
  group.add(pavilion);

  const pondLotusMat = createPixelToonMaterial({ color: '#f9b4cc' });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const rad = 7.4 + (i % 3) * 1.4;
    const lx = -24.4 + Math.cos(a) * rad;
    const lz = 10.2 + Math.sin(a) * rad;
    const pad = createCylinder(0.55, 0.55, 0.08, 10, mossMat);
    pad.position.set(lx, -0.4, lz);
    const bloom = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), pondLotusMat);
    bloom.position.set(lx, -0.25, lz);
    group.add(pad, bloom);
  }

  // Sunken Prism Amphitheater Ruins: 8 Broken Vine-Draped Stone Columns & 3 Lintels
  columnPositions.forEach((c, idx) => {
    const col = createCylinder(0.42, 0.54, c.h, 8, mats.stoneMat);
    col.position.set(c.x, 0.65 + c.h * 0.5, c.z);
    const drape = createBox(0.22, c.h * 0.6, 0.16, mossVineMat);
    drape.position.set(c.x + 0.35, 0.65 + c.h * 0.6, c.z);
    group.add(col, drape);
    if (idx % 2 === 0 && idx < 6) {
      const next = columnPositions[idx + 1];
      const topH = Math.min(c.h, next.h) + 0.65;
      const p0 = new THREE.Vector3(c.x, topH, c.z);
      const p1 = new THREE.Vector3(next.x, topH, next.z);
      const lintel = createBox(0.7, 0.45, p0.distanceTo(p1) + 0.6, mats.stoneMat);
      lintel.position.copy(p0).lerp(p1, 0.5);
      lintel.lookAt(p1);
      group.add(lintel);
    }
  });

  // Clockwise Prism Shrine Pillars, Prisms & Dual-Layer Emerald-Lime Night Beams
  const addShrinePillar = (pos, col) => {
    const p = createCylinder(0.45, 0.55, 1.5, 8, mats.stoneMat);
    p.position.set(pos.x, 0.65 + 0.75, pos.z);
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), new THREE.MeshBasicMaterial({ color: col }));
    orb.position.set(pos.x, 2.55, pos.z);
    group.add(p, orb);
  };
  addShrinePillar(EMITTER_POS, '#d8ff80');
  addShrinePillar(RECEIVER_POS, '#ffd966');

  const beamCoreMat = new THREE.MeshBasicMaterial({ color: '#d8ff80' });
  const beamHaloMat = new THREE.MeshBasicMaterial({ color: '#6effb8', transparent: true, opacity: 0.45 });
  const beamNodes = [EMITTER_POS, ...prismSpots, RECEIVER_POS];
  const beams = [];
  for (let i = 0; i < beamNodes.length - 1; i++) {
    const a = beamNodes[i];
    const b = beamNodes[i + 1];
    const pA = new THREE.Vector3(a.x, 1.82, a.z);
    const pB = new THREE.Vector3(b.x, 1.82, b.z);
    const len = pA.distanceTo(pB);
    const bg = new THREE.Group();
    bg.position.copy(pA).lerp(pB, 0.5);
    bg.lookAt(pB);
    bg.add(
      new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, len), beamCoreMat),
      new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, len), beamHaloMat)
    );
    bg.visible = false;
    group.add(bg);
    beams.push(bg);
  }

  const prismMeshes = [];
  prismSpots.forEach((sp, i) => {
    const baseYaw = Math.atan2(sp.aimX - sp.x, sp.aimZ - sp.z);
    const pg = new THREE.Group();
    pg.position.set(sp.x, 0.65, sp.z);
    const base = createCylinder(0.46, 0.56, 0.85, 8, mats.stoneMat);
    base.position.y = 0.42;
    const rot = new THREE.Group();
    rot.position.y = 1.18;
    const startYaw = baseYaw + prismSteps[i] * (Math.PI * 0.5);
    rot.rotation.y = startYaw;
    const prismCrystal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.72, 3),
      createPixelToonMaterial({ color: '#9cf5c2', emissive: '#6effb8', emissiveIntensity: 0.25 })
    );
    const arrow = createBox(0.15, 0.15, 0.52, new THREE.MeshBasicMaterial({ color: '#d8ff80' }));
    arrow.position.set(0, 0.4, 0.26);
    rot.add(prismCrystal, arrow);
    const rMat = new THREE.MeshBasicMaterial({ color: '#d8ff80', transparent: true, opacity: 0.5, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.8, 16), rMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    pg.add(base, rot, ring);
    group.add(pg);
    prismMeshes.push({ rot, rMat, curYaw: startYaw, targetYaw: startYaw });
  });

  // Puzzle 2: 4 Spiral Multi-Petal Lotus Buds & Blooming Giant Lily Pad Bridge
  const lotusMeshes = [];
  lotusCoords.forEach((sp, i) => {
    const lg = new THREE.Group();
    lg.position.set(sp.x, 1.35, sp.z);
    const pad = createCylinder(0.88, 0.88, 0.12, 14, mossMat);
    pad.position.y = 0.06;
    const budMat = createPixelToonMaterial({ color: '#c48ea8', emissive: '#ff94cb', emissiveIntensity: 0.18 });
    const petalsGroup = new THREE.Group();
    petalsGroup.position.y = 0.42;
    const petalList = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const pet = createBox(0.16, 0.34, 0.1, budMat);
      pet.position.set(Math.cos(a) * 0.16, 0.08, Math.sin(a) * 0.16);
      pet.rotation.y = -a;
      pet.rotation.z = -0.25;
      petalsGroup.add(pet);
      petalList.push(pet);
    }
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), budMat);
    core.position.y = 0.5;
    lg.add(pad, petalsGroup, core);
    for (let p = 0; p <= i; p++) {
      const pip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), new THREE.MeshBasicMaterial({ color: '#ffd9ef' }));
      pip.position.set((p - i * 0.5) * 0.26, 1.05, 0);
      lg.add(pip);
    }
    group.add(lg);
    lotusMeshes.push({ petalList, budMat, openProgress: 0, targetOpen: 0 });
  });

  const lilyPadMeshes = LILY_STONES.map((lp, li) => {
    const g = new THREE.Group();
    g.position.set(lp.x, -0.55, lp.z);
    const pad = createCylinder(1.55, 1.42, 0.24, 14, mossMat);
    pad.position.y = -0.1;
    const bloom = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), pondLotusMat);
    bloom.position.set(0.9, 0.12, li % 2 === 0 ? 0.65 : -0.65);
    g.add(pad, bloom);
    group.add(g);
    return { g, targetY: lp.y, active: false };
  });

  // Puzzle 3: 2 Guiding Chasm Lamps & Shadow Totem
  const shadowLampMats = [];
  guidingLamps.forEach((gl) => {
    const lg = new THREE.Group();
    lg.position.set(gl.x, 1.85, gl.z);
    const post = createCylinder(0.18, 0.24, 2.35, 8, mats.stoneMat);
    post.position.y = 1.18;
    const coreMat = new THREE.MeshBasicMaterial({ color: '#454e66' });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), coreMat);
    core.position.y = 2.48;
    lg.add(post, core);
    group.add(lg);
    shadowLampMats.push(coreMat);
  });

  const totemMat = createPixelToonMaterial({ color: '#58627a', emissive: '#ffd982', emissiveIntensity: 0 });
  const totem = createCylinder(0.38, 0.48, 1.5, 8, totemMat);
  totem.position.set(SHADOW_TOTEM.x, 4.0, SHADOW_TOTEM.z);
  group.add(totem);

  // 3 Cozy Forest Benches
  const benches = [
    buildBench(group, { x: 25.4, y: 1.15, z: 25.6, yaw: -2.45, woodMat: darkWoodMat, woodDarkMat: darkWoodMat, cushionColor: '#5c8c42' }),
    buildBench(group, { x: -22.2, y: 1.05, z: 13.4, yaw: 2.35, woodMat: darkWoodMat, woodDarkMat: darkWoodMat, cushionColor: '#e88ca8' }),
    buildBench(group, { x: 18.8, y: 2.15, z: 11.4, yaw: 2.65, woodMat: darkWoodMat, woodDarkMat: darkWoodMat, cushionColor: '#8cb87a' }),
  ];

  // Bioluminescent Cyan Mushrooms (14 clusters) & 18 Drifting Kodama Spirit-Wisps
  const mushCapMat = createPixelToonMaterial({ color: '#6effd8', emissive: '#42e8b8', emissiveIntensity: 0.42 });
  const mushStemMat = createPixelToonMaterial({ color: '#dce6d8' });
  [
    [17.5, 1.15, 29.0], [26.2, 1.15, 31.2], [-3.8, 1.35, 25.0], [6.2, 1.35, 20.5],
    [16.2, 2.15, 9.8], [24.8, 2.15, 12.6], [22.2, 2.15, 2.4], [-9.2, 0.65, 8.2],
    [4.2, 0.65, -4.5], [-21.8, 1.05, 6.2], [-27.8, 1.05, 12.2], [-6.2, 1.85, -14.0],
    [-14.5, 3.25, -36.5], [-6.2, 3.25, -37.2],
  ].forEach(([mx, my, mz], idx) => {
    for (let k = 0; k < 3; k++) {
      const ox = (k - 1) * 0.22;
      const oz = ((idx + k) % 2 === 0 ? 1 : -1) * 0.16;
      const stem = createCylinder(0.04, 0.05, 0.22 + k * 0.05, 6, mushStemMat);
      stem.position.set(mx + ox, my + 0.11, mz + oz);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.14 + (k === 1 ? 0.05 : 0), 0.12, 8), mushCapMat);
      cap.position.set(mx + ox, my + 0.24 + k * 0.05, mz + oz);
      group.add(stem, cap);
    }
  });

  const wispMat = new THREE.MeshBasicMaterial({ color: '#c8ffe8', transparent: true, opacity: 0.72 });
  const wisps = [];
  for (let i = 0; i < 18; i++) {
    const hub = i < 6 ? [22.8, 4.2, 7.4] : i < 12 ? [-2.0, 2.8, 1.8] : [-24.4, 3.2, 10.2];
    const ang = (i / 6) * Math.PI * 2;
    const rad = 3.2 + (i % 3) * 2.4;
    const wMesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 6), wispMat);
    wMesh.position.set(hub[0] + Math.cos(ang) * rad, hub[1], hub[2] + Math.sin(ang) * rad);
    group.add(wMesh);
    wisps.push({ mesh: wMesh, cx: hub[0], cy: hub[1], cz: hub[2], rad, phase: i * 1.15 });
  }

  // Rich Ancient Woodland (~38 trees + 5 bamboo pockets + dense ferns)
  [
    [28.5, 1.15, 29.8, 'cypress', 1.38], [16.8, 1.15, 32.8, 'cypress', 1.28],
    [20.2, 1.15, 25.0, 'cedar', 1.2], [7.8, 1.35, 25.6, 'cypress', 1.3],
    [-4.8, 1.35, 26.2, 'cedar', 1.25], [-5.2, 1.35, 17.8, 'cypress', 1.22],
    [7.2, 1.35, 18.0, 'cypress', 1.2], [-27.4, 1.05, 7.4, 'sakura', 1.15],
    [-28.8, 1.05, 13.2, 'cypress', 1.22], [-20.4, 1.05, 7.2, 'cedar', 1.1],
    [28.2, 2.15, 13.0, 'cypress', 1.45], [16.2, 2.15, 12.8, 'cedar', 1.32],
    [16.0, 2.15, 0.8, 'cypress', 1.28], [26.8, 2.15, -0.5, 'cypress', 1.35],
    [20.5, 2.15, 13.8, 'cedar', 1.2], [-10.8, 0.65, -4.8, 'cypress', 1.25],
    [6.8, 0.65, -5.2, 'cypress', 1.25], [-10.5, 0.65, 8.8, 'cedar', 1.22],
    [6.8, 0.65, 8.8, 'cypress', 1.22], [-14.2, 3.25, -39.2, 'cypress', 1.38],
    [-6.2, 3.25, -39.6, 'cypress', 1.35], [-15.8, 3.25, -28.8, 'momiji-gold', 1.15],
    [-5.0, 3.25, -29.2, 'momiji-gold', 1.15], [-10.5, 1.85, -15.5, 'cypress', 1.2],
    [3.2, 1.85, -14.8, 'cedar', 1.2], [27.5, 1.15, 24.8, 'cypress', 1.25],
    [18.2, 1.15, 32.2, 'cedar', 1.15], [-2.5, 1.35, 26.8, 'cypress', 1.15],
    [-28.2, 1.05, 10.2, 'cedar', 1.15], [19.8, 2.15, 1.2, 'cypress', 1.22],
    [27.8, 2.15, 9.8, 'cedar', 1.28], [-16.8, 3.25, -35.8, 'cypress', 1.28],
    [-4.2, 3.25, -35.2, 'cedar', 1.25], [22.8, 1.15, 33.4, 'cypress', 1.2],
    [-23.2, 1.05, 15.2, 'cypress', 1.18], [-8.8, 1.85, -12.8, 'cypress', 1.12],
    [1.8, 1.85, -12.8, 'cedar', 1.12],
  ].forEach(([x, y, z, type, s], idx) => buildOrganicTree(group, { type, x, y, z, scale: s, idx, treeSet }));

  buildBambooCluster(
    group,
    [
      [14.8, 1.15, 30.8, 5.2], [15.6, 1.15, 31.6, 5.6],
      [-5.8, 1.35, 20.5, 5.0], [16.5, 2.15, 10.6, 5.5],
      [17.4, 2.15, 11.4, 5.8], [-25.6, 1.05, 6.2, 4.9],
      [-26.2, 1.05, 6.8, 5.2], [-16.2, 3.25, -33.2, 5.4],
    ],
    treeSet
  );
  const boulderColliders = buildMossBoulders(
    group,
    [
      [16.2, 1.15, 27.2, 0.78, 0.4], [-5.2, 1.35, 22.8, 0.8, 1.4],
      [19.2, 2.15, 5.2, 0.85, 2.0], [26.0, 2.15, 9.2, 0.82, 0.9],
      [-23.8, 1.05, 13.8, 0.75, 1.6], [-12.2, 3.25, -30.0, 0.85, 0.3],
    ],
    mats.cliffMat,
    '#4c7e3b'
  );
  buildGroundFoliage(group, terrain, bounds, {
    count: 1100,
    allowedSurfaces: ['grass'],
    grassColor: '#88c47a',
    flowerColor: '#d9ffb8',
    flowerRatio: 0.16,
    mapPlain: getFernSprigTexture(),
    seed: 505,
  });

  // 6 Stone Lanterns (strictly within fragment light budget)
  const lanterns = [
    [18.6, 1.15, 28.4],
    [7.2, 1.35, 25.4],
    [-4.8, 1.35, 17.2],
    [18.2, 2.15, 9.6],
    [-22.6, 1.05, 8.6],
    [-6.8, 3.25, -31.4],
  ].map(([x, y, z]) => buildLanternProp(group, scene, sceneLights, x, y, z, false));
  terrain.addColliders({ circles: [...boulderColliders, ...lanterns.map((l) => l.collider)] });
  terrain.addColliders(collectPropColliders(group));

  const belfry = buildObelisksAndBell(group, scene, sceneLights, {
    x: BELFRY_BELL.x,
    y: 3.25,
    z: BELFRY_BELL.z,
    obelisks: [
      { x: -14.8, z: -33.2, color: '#d8ff80' },
      { x: -6.2, z: -33.6, color: '#ff94cb' },
      { x: -10.4, z: -32.8, color: '#ffd982' },
    ],
    roofMat: mats.roofTileMat,
    woodMat: darkWoodMat,
    stoneMat: mats.stoneMat,
  });

  const fireflies = buildNightAtmosphere(group, {
    fireflyBounds: { minX: -36, maxX: 36, minY: 0.8, maxY: 8.0, minZ: -38, maxZ: 36 },
    fireflyCount: 155,
    fireflyColor: '#b5ff88',
    lightColor: '#76f7d2',
    kind: 'mushroom',
    pathLights: [
      { x: 18.2, y: terrain.getHeightAt(18.2, 26.8), z: 26.8 },
      { x: 5.5, y: terrain.getHeightAt(5.5, 22.0), z: 22.0 },
      { x: 19.5, y: terrain.getHeightAt(19.5, 11.2), z: 11.2 },
      { x: 4.8, y: terrain.getHeightAt(4.8, 2.2), z: 2.2 },
      { x: -19.8, y: terrain.getHeightAt(-19.8, 10.6), z: 10.6 },
      { x: -2.5, y: terrain.getHeightAt(-2.5, -13.6), z: -13.6 },
      { x: -8.5, y: terrain.getHeightAt(-8.5, -31.0), z: -31.0 },
    ],
  });
  const wildlife = buildAmbientWildlife(group, {
    butterflies: [
      { x: 22.0, y: 1.15, z: 28.5, color: '#78ffd6', r: 2.8 },
      { x: 1.2, y: 1.35, z: 22.0, color: '#d8ff88', r: 3.0 },
      { x: -2.0, y: 0.65, z: 1.8, color: '#a8f4ff', kind: 'dragonfly', r: 3.6 },
      { x: -24.4, y: 1.05, z: 10.2, color: '#ffe599', r: 2.4 },
    ],
    sparrows: [
      { x: 20.6, y: 1.18, z: 26.8, yaw: 0.9 },
      { x: 18.8, y: 2.17, z: 11.4, yaw: -1.4 },
      { x: -6.8, y: 3.27, z: -31.8, yaw: 0.5 },
    ],
  });

  const worldBuilder = {
    shojiMaterials: [],
    chochinMaterials: [],
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
    if (!bellUnsealed && sealFirefly && sealLotus && sealShadow) {
      bellUnsealed = true;
      belfry.setBellUnsealed(true);
      audio.playSealAwaken?.();
      progressVersion++;
      onToast?.('The Moss Bell is unsealed.');
    }
    onStateChange?.(puzzleManager.getStatusSnapshot());
  }

  const puzzleManager = {
    get progressVersion() { return progressVersion; },
    get chapterComplete() { return chapterComplete; },
    get bellUnsealed() { return bellUnsealed; },
    getStatusSnapshot: () => ({ seals: [sealFirefly, sealLotus, sealShadow], bellUnsealed, chapterComplete }),
    getPuzzleZoneForPos: (x, z) => {
      if (chapterComplete) return null;
      const reg = terrain.getRegionInfoAt(x, z).id;
      if (!sealLotus && (reg === 'glade' || reg === 'trail' || reg === 'lagoon' || reg === 'cypress')) return 'lotus';
      if (!sealFirefly && reg === 'clearing') return 'firefly';
      if (!sealShadow && (reg === 'overlook' || reg === 'belfry')) return 'shadow';
      return 'belfry';
    },
    getHintText: (zone) => {
      if (zone === 'firefly') return 'The moss ring is geared: each prism you turn pulls the next one back. Aim them in order, first to last, and wait for Night.';
      if (zone === 'lotus') return 'Awaken the four lotus buds along the brookside spiral from 1 pip to 4 pips.';
      if (zone === 'shadow') return 'Light both guiding chasm lamps during Night to cross the diagonal shadow bridge.';
      return bellUnsealed ? 'Three seals glow among the overgrown ruins; ring the Moss Bell.' : 'Firefly Prisms, Lotus Spiral, and Night Shadows guard the northwest belfry.';
    },
    getHintTargetPos: () => {
      if (!sealLotus) return lotusCoords[nextLotusIdx] || lotusCoords[0];
      if (!sealFirefly) {
        const pi = prismSteps.findIndex((s) => s !== 0);
        return prismSpots[pi >= 0 ? pi : 0];
      }
      if (!sealShadow) return !lampsLit[0] || !lampsLit[1] ? guidingLamps[lampsLit[0] ? 1 : 0] : SHADOW_TOTEM;
      return BELFRY_BELL;
    },
  };

  const spots = [];
  prismSpots.forEach((sp, i) => {
    spots.push({
      id: `prism-${i}`,
      getPos: () => sp,
      radius: 2.5,
      getLabel: () => (sealFirefly ? null : 'E · Turn Prism'),
      trigger: () => {
        if (sealFirefly) return;
        prismSteps[i] = (prismSteps[i] + 1) % 4;
        prismMeshes[i].targetYaw += Math.PI * 0.5;
        // The moss ring is geared: turning a prism drags the next one a quarter back
        const next = i + 1;
        if (next < prismSteps.length) {
          prismSteps[next] = (prismSteps[next] + 3) % 4;
          prismMeshes[next].targetYaw -= Math.PI * 0.5;
        }
        progressVersion++;
        audio.playPrismBeam?.();
        if (curTimeId === 'crepusculo' && prismSteps.every((s) => s === 0)) {
          sealFirefly = true;
          belfry.launchSealOrb(new THREE.Vector3(sp.x, 2.2, sp.z), 0);
          audio.playSealAwaken?.();
          onToast?.('Firefly Seal awakened.');
          checkUnseal();
        }
      },
    });
  });

  lotusCoords.forEach((sp, i) => {
    spots.push({
      id: `lotus-${i}`,
      getPos: () => sp,
      radius: 2.5,
      getLabel: () => (sealLotus || lotusLit[i] ? null : 'E · Awaken Bud'),
      trigger: () => {
        if (sealLotus) return;
        if (i === nextLotusIdx) {
          lotusLit[i] = true;
          lotusMeshes[i].budMat.emissiveIntensity = 0.85;
          lotusMeshes[i].targetOpen = 1;
          lilyPadMeshes.forEach((lp, li) => {
            if (li <= i || (i === 3 && li === 4)) lp.active = true;
          });
          nextLotusIdx++;
          progressVersion++;
          audio.playLanternChime(true);
          if (nextLotusIdx === 4) {
            sealLotus = true;
            belfry.launchSealOrb(new THREE.Vector3(sp.x, 2.2, sp.z), 1);
            audio.playSealAwaken?.();
            onToast?.('Lotus Seal awakened.');
            checkUnseal();
          }
        } else {
          lotusLit.fill(false);
          lilyPadMeshes.forEach((lp) => { lp.active = false; });
          lotusMeshes.forEach((lm) => {
            lm.budMat.emissiveIntensity = 0.18;
            lm.targetOpen = 0;
          });
          nextLotusIdx = 0;
          audio.playLanternChime(false);
        }
      },
    });
  });

  guidingLamps.forEach((gl, i) => {
    spots.push({
      id: `slamp-${i}`,
      getPos: () => gl,
      radius: 2.5,
      getLabel: () => (lampsLit[i] ? null : 'E · Guiding Lamp'),
      trigger: () => {
        lampsLit[i] = true;
        shadowLampMats[i].color.set('#ffd982');
        progressVersion++;
        audio.playLanternChime(true);
      },
    });
  });

  spots.push({
    id: 'shadow-totem',
    getPos: () => SHADOW_TOTEM,
    radius: 2.6,
    getLabel: () => (sealShadow ? null : 'E · Shadow Totem'),
    trigger: () => {
      if (sealShadow) return;
      sealShadow = true;
      totemMat.emissiveIntensity = 0.85;
      progressVersion++;
      belfry.launchSealOrb(new THREE.Vector3(SHADOW_TOTEM.x, 4.2, SHADOW_TOTEM.z), 2);
      audio.playSealAwaken?.();
      onToast?.('Shadow Seal awakened.');
      checkUnseal();
    },
  });

  spots.push({
    id: 'moss-bell',
    getPos: () => BELFRY_BELL,
    radius: 3.1,
    getLabel: () => 'E · Moss Bell',
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
      setFireflyIntensity: (v) => fireflies.setIntensity(Math.max(0.3, v)),
      triggerPetalStorm: () => fireflies.triggerStorm(),
      update: (dt, elapsed) => fireflies.update(dt, elapsed),
    },
    puzzleManager,
    interactions,
    spawnPoint: { x: 25.5, z: 31.2, yaw: 2.35 },
    catSpawnPoint: { x: 24.0, z: 32.0 },
    titleFocusPos: new THREE.Vector3(2.0, 2.4, 6.0),
    biomeProfile: 'forest',
    onTimeChanged(timeId) {
      curTimeId = timeId;
      if (!sealFirefly && timeId === 'crepusculo' && prismSteps.every((s) => s === 0)) {
        sealFirefly = true;
        belfry.launchSealOrb(new THREE.Vector3(prismSpots[2].x, 2.2, prismSpots[2].z), 0);
        audio.playSealAwaken?.();
        onToast?.('Firefly Seal awakened.');
        checkUnseal();
      }
    },
    update(dt, elapsed, focusPos) {
      updateClouds(clouds, dt, elapsed);
      belfry.update(dt, elapsed);
      updateCascades(plungeFoams, elapsed);
      wildlife.update(dt, elapsed, focusPos);

      const isNight = curTimeId === 'crepusculo';
      shadowBridgeMesh.visible = shadowWalkActive();

      mushCapMat.emissiveIntensity = isNight ? 0.95 : 0.35;
      wispMat.opacity = isNight ? 0.92 : 0.48;
      wisps.forEach((w) => {
        const a = elapsed * 0.45 + w.phase;
        w.mesh.position.set(w.cx + Math.cos(a) * w.rad, w.cy + Math.sin(elapsed * 2.2 + w.phase) * 0.35, w.cz + Math.sin(a) * w.rad);
      });

      lotusMeshes.forEach((lm) => {
        lm.openProgress += (lm.targetOpen - lm.openProgress) * (1 - Math.exp(-dt * 6));
        lm.petalList.forEach((pet) => {
          pet.rotation.z = -0.25 - lm.openProgress * 0.72;
        });
      });

      lilyPadMeshes.forEach((lp) => {
        const goalY = lp.active ? lp.targetY : -0.55;
        lp.g.position.y += (goalY - lp.g.position.y) * (1 - Math.exp(-dt * 6));
      });

      prismMeshes.forEach((pm, i) => {
        pm.curYaw += (pm.targetYaw - pm.curYaw) * (1 - Math.exp(-dt * 10));
        pm.rot.rotation.y = pm.curYaw;
        pm.rMat.color.set(prismSteps[i] === 0 ? '#6effb8' : '#d8ff80');
      });

      beams[0].visible = isNight;
      beams[1].visible = isNight && prismSteps[0] === 0;
      beams[2].visible = isNight && prismSteps[0] === 0 && prismSteps[1] === 0;
      beams[3].visible = isNight && prismSteps[0] === 0 && prismSteps[1] === 0 && prismSteps[2] === 0;
    },
    dispose() {
      belfry.dispose();
      sdfTex.dispose();
      disposeObject3D(group, scene, sceneLights);
    },
  };
}

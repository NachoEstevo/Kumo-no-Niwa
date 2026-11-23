import * as THREE from 'three';
import { createPixelToonMaterial } from '../../engine/ToonMaterials.js';
import {
  LevelTerrain,
  addStonePad,
  addWoodenDeck,
  buildAmbientWildlife,
  buildBench,
  buildBridgeMesh,
  buildCircularTerrace,
  buildCirclingBirds,
  buildCloudSeaAndCumulus,
  buildFenceLine,
  buildFloatingBoat,
  buildGroundFoliage,
  buildJapaneseBuilding,
  collectPropColliders,
  buildLanternProp,
  buildMossBoulders,
  buildNightAtmosphere,
  buildObelisksAndBell,
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
  createVolumetricBeamMaterial,
  disposeObject3D,
  roundedBoxSDF,
  updateBuildings,
  updateClouds,
} from '../../world/WorldKit.js';

export function createChapter4({
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
  const mats = createSharedMatSet('#d4ebaa');
  const treeSet = createTreeBillboardSet();
  const timberMat = createPixelToonMaterial({ color: '#7d5434' });
  const sailMat = createPixelToonMaterial({ color: '#faf4e6', side: THREE.DoubleSide });
  const lighthouseMat = createPixelToonMaterial({ color: '#f5f2ec' });
  const redStripeMat = createPixelToonMaterial({ color: '#d83f31' });
  const shojiMaterials = [];

  // Puzzle 1: 3 Coupled Cedar & Stone Windmills (target all 0 facing north into gale)
  const vaneStates = [0, 1, 1];
  let sealVane = false;

  // Puzzle 2: 2 Articulated Koinobori Carp Kites -> unfurl Suspension Bridges to Sea-Stacks
  const kitesLaunched = [false, false];
  let sealKite = false;

  // Puzzle 3: 3 Updraft Sky Spires + Wind Chimes (with safe walk-down basalt ledges)
  const summitBells = [false, false, false];
  let sealSummit = false;

  let bellUnsealed = false;
  let chapterComplete = false;
  let progressVersion = 0;
  let curTimeId = dayCycle.getCurrentPreset().id;

  const bridgeWestUnlocked = () => kitesLaunched[0];
  const bridgeEastUnlocked = () => kitesLaunched[1];

  const windmillCoords = [
    { x: -25.8, z: 13.0, y: 1.6 },
    { x: -27.2, z: 3.5, y: 1.6 },
    { x: -22.6, z: -4.2, y: 1.6 },
  ];
  const winchSpots = [
    { x: -18.2, y: 2.4, z: -19.4, px: -20.0, pz: -20.5, color: '#e8523f' },
    { x: -8.6, y: 2.4, z: -13.6, px: -7.0, pz: -12.2, color: '#4a9ee8' },
  ];
  const updraftSpecs = [
    { x: -31.0, z: -29.8, baseY: 2.6, dstX: -32.2, dstZ: -34.2, dstY: 5.1 },
    { x: 7.7, z: 1.2, baseY: 2.2, dstX: 12.2, dstZ: 0.2, dstY: 4.7 },
    { x: 4.9, z: -24.2, baseY: 2.8, dstX: 9.6, dstZ: -24.2, dstY: 5.3 },
  ];
  const BELFRY_BELL = { x: 23.2, z: -19.4 };

  const DESCENT_STONES = [
    { x: -20.6, z: -9.4, r: 2.0, visualR: 1.85, y: 2.0, surface: 'wood', isElbow: true },
    // Spire I walk-down ledges (5.10 -> 4.19 -> 3.28 -> 2.60)
    { x: -28.9, z: -33.6, r: 1.35, visualR: 1.25, y: 4.19, surface: 'stone' },
    { x: -27.6, z: -32.2, r: 1.35, visualR: 1.25, y: 3.28, surface: 'stone' },
    // Spire II walk-down ledges (4.70 -> 3.79 -> 2.88 -> 2.20)
    { x: 11.4, z: 3.6, r: 1.35, visualR: 1.25, y: 3.79, surface: 'stone' },
    { x: 9.8, z: 4.8, r: 1.35, visualR: 1.25, y: 2.88, surface: 'stone' },
    // Spire III walk-down ledges (5.30 -> 4.39 -> 3.48 -> 2.80)
    { x: 7.4, z: -27.2, r: 1.35, visualR: 1.25, y: 4.39, surface: 'stone' },
    { x: 5.6, z: -27.6, r: 1.35, visualR: 1.25, y: 3.48, surface: 'stone' },
  ];

  const terraces = [
    { id: 'cove-main', shape: 'box', cx: -13.0, cz: 26.5, hx: 9.5, hz: 6.2, cornerR: 2.6, y: 0.6, surface: 'grass', region: { id: 'cove', jp: '潮風の入江', en: 'Tidebreeze Cove' } },
    { id: 'cove-spit', shape: 'circle', cx: -3.8, cz: 25.2, r: 3.4, y: 0.6, surface: 'grass', region: { id: 'cove', jp: '潮風の入江', en: 'Tidebreeze Cove' } },
    { id: 'mills-south', shape: 'box', cx: -24.5, cz: 11.2, hx: 6.4, hz: 7.4, cornerR: 2.4, y: 1.6, surface: 'grass', region: { id: 'mills', jp: '風車の尾根', en: 'Cedar Mill Ridge' } },
    { id: 'mills-north', shape: 'box', cx: -25.2, cz: 0.5, hx: 6.8, hz: 7.6, cornerR: 2.4, y: 1.6, surface: 'grass', region: { id: 'mills', jp: '風車の尾根', en: 'Cedar Mill Ridge' } },
    { id: 'kite-bluff', shape: 'box', cx: -13.5, cz: -17.5, hx: 7.4, hz: 5.8, cornerR: 2.4, y: 2.4, surface: 'wood', region: { id: 'center', jp: '大凧の岬', en: "Kite-Master's Bluff" } },
    { id: 'west-stack', shape: 'circle', cx: -30.5, cz: -27.5, r: 6.2, y: 2.6, surface: 'grass', region: { id: 'west', jp: '外海の岩礁', en: 'Outer Gale Sea-Stack' } },
    { id: 'spire-0', shape: 'circle', cx: -32.2, cz: -34.2, r: 3.3, y: 5.1, surface: 'stone', region: { id: 'west-peak', jp: '天空の風柱', en: 'Updraft Sky Spires' } },
    { id: 'bay-stack', shape: 'circle', cx: 5.8, cz: 1.6, r: 6.4, y: 2.2, surface: 'grass', region: { id: 'east', jp: '碧湾の孤岩', en: 'Turquoise Bay Sea-Stack' } },
    { id: 'spire-1', shape: 'circle', cx: 12.2, cz: 0.2, r: 3.4, y: 4.7, surface: 'stone', region: { id: 'east-peak', jp: '天空の風柱', en: 'Updraft Sky Spires' } },
    { id: 'north-rim', shape: 'box', cx: 2.4, cz: -24.2, hx: 6.2, hz: 4.6, cornerR: 2.0, y: 2.8, surface: 'grass', region: { id: 'north-rim', jp: '風越の断崖', en: 'Wind-Step Rim' } },
    { id: 'spire-2', shape: 'circle', cx: 9.6, cz: -24.2, r: 3.6, y: 5.3, surface: 'stone', region: { id: 'north-peak', jp: '天空の風柱', en: 'Updraft Sky Spires' } },
    { id: 'lighthouse-main', shape: 'box', cx: 24.0, cz: -21.2, hx: 8.6, hz: 8.2, cornerR: 2.6, y: 5.4, surface: 'stone', region: { id: 'lighthouse', jp: '白亜の灯台岬', en: 'White Lighthouse Promontory' } },
    { id: 'lighthouse-hook', shape: 'circle', cx: 28.6, cz: -14.2, r: 4.8, y: 5.4, surface: 'stone', region: { id: 'lighthouse', jp: '白亜の灯台岬', en: 'White Lighthouse Promontory' } },
  ];

  const terrain = new LevelTerrain({
    defaultRegion: { id: 'cove', jp: '潮風の入江', en: 'Tidebreeze Cove' },
    terraces,
    bridges: [
      { ax: -3.2, az: 24.4, bx: 4.8, bz: 20.6, halfWidth: 1.55, startY: 0.6, endY: 0.45, archLift: 0.0, surface: 'wood' },
      { ax: -17.5, az: 20.8, bx: -21.8, bz: 18.3, halfWidth: 1.9, startY: 0.6, endY: 1.6, archLift: 0.14, surface: 'wood' },
      { ax: -21.4, az: -6.8, bx: -20.6, bz: -9.4, halfWidth: 1.65, startY: 1.6, endY: 2.0, archLift: 0.08, surface: 'wood' },
      { ax: -20.6, az: -9.4, bx: -18.4, bz: -12.0, halfWidth: 1.65, startY: 2.0, endY: 2.4, archLift: 0.12, surface: 'wood' },
      { ax: -19.4, az: -20.0, bx: -26.4, bz: -24.8, halfWidth: 1.65, startY: 2.4, endY: 2.6, archLift: 0.42, surface: 'wood', enabledFn: bridgeWestUnlocked },
      { ax: -8.2, az: -13.0, bx: 2.2, bz: -1.8, halfWidth: 1.65, startY: 2.4, endY: 2.2, archLift: 0.65, surface: 'wood', enabledFn: bridgeEastUnlocked },
      { ax: -7.2, az: -19.2, bx: -1.6, bz: -22.2, halfWidth: 1.85, startY: 2.4, endY: 2.8, archLift: 0.14, surface: 'wood' },
      { ax: 11.4, az: -24.2, bx: 17.8, bz: -22.8, halfWidth: 2.0, startY: 5.3, endY: 5.4, archLift: 0.18, surface: 'stone' },
    ],
    stones: DESCENT_STONES,
    circles: [
      ...windmillCoords.map((w) => ({ x: w.x, z: w.z, r: 1.25 })),
      ...winchSpots.map((w) => ({ x: w.x, z: w.z, r: 0.62 })),
      ...updraftSpecs.map((u) => ({ x: u.dstX, z: u.dstZ, r: 0.56 })),
      // Lighthouse tower
      { x: 29.2, z: -14.2, r: 2.05 },
      // Obelisks & Beacon Bell
      { x: 19.8, z: -18.2, r: 0.56 },
      { x: 22.8, z: -15.6, r: 0.56 },
      { x: 26.2, z: -22.6, r: 0.52 },
      { x: BELFRY_BELL.x, z: BELFRY_BELL.z, r: 0.96 },
      // 4 Benches
      { x: -2.4, z: 26.2, r: 0.72 },
      { x: -19.8, z: 7.6, r: 0.72 },
      { x: 4.2, z: 6.2, r: 0.72 },
      { x: 18.2, z: -15.6, r: 0.72 },
    ],
    boxes: [
      // Coastal Boathouse & Lighthouse Keeper Cottage
      { minX: -21.2, maxX: -15.2, minZ: 26.5, maxZ: 31.5 },
      { minX: 18.4, maxX: 24.8, minZ: -28.8, maxZ: -23.6 },
    ],
  });

  const clouds = [];
  buildCloudSeaAndCumulus(group, clouds, -12.8, 56);

  terraces.forEach((t, idx) => {
    const topMat = t.surface === 'wood' ? mats.woodPlankMat : t.surface === 'stone' ? mats.stoneMat : mats.grassMat;
    if (t.shape === 'circle') {
      group.add(buildCircularTerrace({ cx: t.cx, cz: t.cz, r: t.r, topY: t.y, topMat, cliffMat: mats.cliffMat, seed: 40 + idx }));
    } else {
      group.add(buildSculptedTerrace({ cx: t.cx, cz: t.cz, hx: t.hx, hz: t.hz, cornerR: t.cornerR || 2.2, topY: t.y, topMat, cliffMat: mats.cliffMat, seed: 40 + idx }));
    }
  });

  addStonePad(group, 24.0, -21.2, 5.4, 11.4, 9.6);
  addWoodenDeck(group, -13.5, -17.5, 2.4, 11.0, 8.2, mats.woodPlankMat);
  terrain.segments.push(buildFenceLine(group, { x0: -20.5, z0: 32.0, x1: -6.5, z1: 32.0, y: 0.6, posts: 6, mat: timberMat }));
  terrain.segments.push(buildFenceLine(group, { x0: -30.5, z0: 14.5, x1: -31.2, z1: -2.0, y: 1.6, posts: 7, mat: timberMat }));

  buildToriiGate(group, { x: -16.2, y: 0.6, z: 23.4, yaw: -0.72, color: '#d83f31' });
  buildToriiGate(group, { x: 18.0, y: 5.4, z: -22.7, yaw: -1.3, scale: 0.92, color: '#d83f31' });

  // Bridges & Fishing Pier + Piling Stanchions
  buildBridgeMesh(group, { ax: -3.2, az: 24.4, bx: 4.8, bz: 20.6, halfWidth: 1.55, startY: 0.6, endY: 0.45, archLift: 0.0, woodMat: mats.woodPlankMat, railMat: timberMat, railingStyle: 'low-wood' });
  for (let p = 0; p <= 4; p++) {
    const t = p / 4;
    const px = THREE.MathUtils.lerp(-3.2, 4.8, t);
    const pz = THREE.MathUtils.lerp(24.4, 20.6, t);
    for (const side of [-1.2, 1.2]) {
      const piling = createCylinder(0.14, 0.16, 2.8, 7, timberMat);
      piling.position.set(px + side * 0.4, -0.9, pz + side * 0.85);
      group.add(piling);
    }
  }
  const pierBollard = createCylinder(0.18, 0.22, 0.76, 8, timberMat);
  pierBollard.position.set(4.55, 0.45 + 0.38, 20.72);
  const pierOrb = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.16, 0),
    new THREE.MeshBasicMaterial({ color: '#ffd982' })
  );
  pierOrb.position.set(4.55, 0.45 + 0.88, 20.72);
  group.add(pierBollard, pierOrb);

  buildBridgeMesh(group, { ax: -17.5, az: 20.8, bx: -21.8, bz: 18.3, halfWidth: 1.9, startY: 0.6, endY: 1.6, archLift: 0.14, woodMat: mats.woodPlankMat, railMat: timberMat, railingStyle: 'low-wood' });
  buildBridgeMesh(group, { ax: -21.4, az: -6.8, bx: -20.6, bz: -9.4, halfWidth: 1.65, startY: 1.6, endY: 2.0, archLift: 0.08, woodMat: mats.woodPlankMat, railMat: timberMat, railingStyle: 'low-wood' });
  buildBridgeMesh(group, { ax: -20.6, az: -9.4, bx: -18.4, bz: -12.0, halfWidth: 1.65, startY: 2.0, endY: 2.4, archLift: 0.12, woodMat: mats.woodPlankMat, railMat: timberMat, railingStyle: 'low-wood' });
  buildBridgeMesh(group, { ax: -7.2, az: -19.2, bx: -1.6, bz: -22.2, halfWidth: 1.85, startY: 2.4, endY: 2.8, archLift: 0.14, woodMat: mats.woodPlankMat, railMat: timberMat, railingStyle: 'low-wood' });
  buildBridgeMesh(group, { ax: 11.4, az: -24.2, bx: 17.8, bz: -22.8, halfWidth: 2.0, startY: 5.3, endY: 5.4, archLift: 0.18, woodMat: mats.stoneMat, railingStyle: 'none' });

  const addSuspensionBridge = (ax, az, bx, bz, startY, endY, archLift) => {
    const bg = buildBridgeMesh(group, { ax, az, bx, bz, halfWidth: 1.65, startY, endY, archLift, woodMat: mats.woodPlankMat, railMat: redStripeMat, railingStyle: 'vermilion' });
    for (const [px, py, pz] of [[ax, startY, az], [bx, endY, bz]]) {
      const pylon = createCylinder(0.14, 0.18, 2.8, 7, timberMat);
      pylon.position.set(px, py + 1.4, pz);
      bg.add(pylon);
    }
    const cable = createBox(0.06, 0.06, Math.hypot(bx - ax, bz - az), sailMat, false, false);
    cable.position.set((ax + bx) * 0.5, (startY + endY) * 0.5 + 2.5, (az + bz) * 0.5);
    cable.lookAt(bx, endY + 2.5, bz);
    bg.add(cable);
    bg.visible = false;
    return bg;
  };
  const westBridgeMesh = addSuspensionBridge(-19.4, -20.0, -26.4, -24.8, 2.4, 2.6, 0.42);
  const eastBridgeMesh = addSuspensionBridge(-8.2, -13.0, 2.2, -1.8, 2.4, 2.2, 0.65);

  // Basalt one-way descent steps + boardwalk elbow landing
  buildSteppingStoneMeshes(
    group,
    DESCENT_STONES.filter((s) => !s.isElbow),
    { stoneMat: mats.stoneMat, cliffMat: mats.cliffMat, height: 2.4 }
  );
  const elbow = DESCENT_STONES[0];
  const elbowCyl = createCylinder(1.88, 1.98, 2.8, 12, mats.woodPlankMat);
  elbowCyl.position.set(elbow.x, elbow.y - 1.46, elbow.z);
  group.add(elbowCyl);

  // Open Turquoise Ocean Bay + Multi-Island SDF + Moored Skiff + Bobbing Buoys
  const bounds = { minX: -43, maxX: 43, minZ: -43, maxZ: 43 };
  const ripples = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -99, 0));
  const waterMaterials = [];
  const sdfTex = buildProceduralPondSDF(
    bounds,
    (wx, wz) => Math.hypot(wx - 2, wz - 2) < 40.5,
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
  buildWaterPlane({ group, w: 86, d: 86, cx: 0, cz: 0, y: -1.4, waterMaterials, sdfTex, bounds, ripples });

  const fishingBoat = buildFloatingBoat(group, {
    x: 7.4,
    y: -1.35,
    z: 18.2,
    yaw: 0.82,
    hullColor: '#7a4b2b',
    trimColor: '#d83f31',
    lanternColor: '#ffdc88',
    scale: 1.4,
  });
  const buoys = [
    [2.5, 15.8], [10.2, 21.8], [-5.5, 12.2],
  ].map(([bx, bz], bi) => {
    const bg = new THREE.Group();
    bg.position.set(bx, -1.35, bz);
    bg.add(createCylinder(0.24, 0.3, 0.45, 8, redStripeMat));
    const cap = createCylinder(0.14, 0.2, 0.28, 8, sailMat);
    cap.position.y = 0.34;
    bg.add(cap);
    group.add(bg);
    return { bg, phase: bi * 1.3 };
  });

  // Coastal Boathouse in Tidebreeze Cove
  const coastalBuildings = [];
  coastalBuildings.push(
    buildJapaneseBuilding(group, {
      x: -18.2,
      y: 0.6,
      z: 29.0,
      yaw: 0.55,
      w: 5.0,
      d: 4.0,
      h: 2.4,
      floors: 1,
      wallColor: '#ebe5d8',
      woodColor: '#5e4332',
      roofMat: mats.roofTileMat,
      woodPlankMat: mats.woodPlankMat,
      shojiMaterials,
      engawa: true,
      norenColor: '#264b7a',
    })
  );

  // 3 Curving Multi-Story Stone & Timber Windmills with Porthole Glow, Lattice Sails & Pennant Ribbons
  const windmills = [];
  const portholeMat = createPixelToonMaterial({ color: '#fff3d4', emissive: '#ffaa44', emissiveIntensity: 0.3 });
  shojiMaterials.push(portholeMat);
  windmillCoords.forEach((sp, wIdx) => {
    const g = new THREE.Group();
    g.position.set(sp.x, sp.y, sp.z);
    const stoneBase = createCylinder(0.95, 1.25, 2.3, 10, lighthouseMat);
    stoneBase.position.y = 1.15;
    const timberBody = createCylinder(0.75, 0.96, 2.2, 10, timberMat);
    timberBody.position.y = 3.3;
    const porthole = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.14, 8), portholeMat);
    porthole.rotation.x = Math.PI / 2;
    porthole.position.set(0, 3.1, 0.85);
    const roofCap = new THREE.Mesh(new THREE.ConeGeometry(1.08, 1.15, 10), mats.roofTileMat);
    roofCap.position.y = 4.85;
    const yawPivot = new THREE.Group();
    yawPivot.position.set(0, 3.9, 0);
    const hub = createCylinder(0.28, 0.28, 0.85, 8, timberMat);
    hub.rotation.x = Math.PI / 2;
    const spinPivot = new THREE.Group();
    spinPivot.position.set(0, 0, 0.54);
    for (let b = 0; b < 4; b++) {
      const arm = new THREE.Group();
      arm.rotation.z = (b / 4) * Math.PI * 2;
      const spar = createBox(0.1, 2.6, 0.1, timberMat);
      spar.position.y = 1.3;
      const cloth = createBox(0.65, 1.88, 0.04, sailMat);
      cloth.position.set(0.36, 1.48, 0.02);
      arm.add(spar, cloth);
      spinPivot.add(arm);
    }
    const beaconMat = new THREE.MeshBasicMaterial({ color: '#ff8a42' });
    const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), beaconMat);
    beacon.position.y = 1.5;
    yawPivot.add(hub, spinPivot, beacon);
    g.add(stoneBase, timberBody, porthole, roofCap, yawPivot);
    group.add(g);
    windmills.push({ yawPivot, spinPivot, beaconMat, currentYaw: 0, sp, wIdx });
  });

  // Taut overhead prayer-flag lines connecting Windmills + Coastal Boardwalks
  const prayerFlags = [];
  const addPennantLine = (ax, ay, az, bx, by, bz, count = 6) => {
    const pA = new THREE.Vector3(ax, ay, az);
    const pB = new THREE.Vector3(bx, by, bz);
    const cord = createBox(0.05, 0.05, pA.distanceTo(pB), timberMat, false, false);
    cord.position.copy(pA).lerp(pB, 0.5);
    cord.lookAt(pB);
    group.add(cord);
    const flagCols = ['#e8523f', '#ffe570', '#4a9ee8', '#faf4e6'];
    for (let i = 1; i <= count; i++) {
      const pt = new THREE.Vector3().lerpVectors(pA, pB, i / (count + 1));
      const flag = createBox(0.24, 0.34, 0.04, createPixelToonMaterial({ color: flagCols[i % 4] }), false, false);
      flag.position.set(pt.x, pt.y - 0.18, pt.z);
      group.add(flag);
      prayerFlags.push({ flag, phase: i * 0.8 + ax });
    }
  };
  addPennantLine(windmillCoords[0].x, 6.15, windmillCoords[0].z, windmillCoords[1].x, 6.15, windmillCoords[1].z, 7);
  addPennantLine(windmillCoords[1].x, 6.15, windmillCoords[1].z, windmillCoords[2].x, 6.15, windmillCoords[2].z, 7);
  addPennantLine(-16.5, 4.2, 23.8, -5.2, 4.2, 23.6, 7);
  addPennantLine(-20.6, 5.0, -9.4, -18.2, 5.0, -12.0, 5);
  addPennantLine(-7.0, 5.4, -19.2, -1.6, 5.4, -22.2, 5);
  addPennantLine(23.5, 9.0, -24.5, 28.2, 9.2, -16.0, 6);

  // Puzzle 2: Articulated 4-Segment Koinobori Carp Kites
  const kiteWinches = [];
  winchSpots.forEach((ws, i) => {
    const wg = new THREE.Group();
    const post = createBox(0.62, 0.95, 0.62, timberMat);
    post.position.set(ws.x, ws.y + 0.48, ws.z);
    const pole = createCylinder(0.06, 0.09, 7.2, 6, timberMat);
    pole.position.set(ws.px, ws.y + 3.6, ws.pz);

    const kite = new THREE.Group();
    kite.position.set(ws.px, ws.y + 2.4, ws.pz);
    const kMat = createPixelToonMaterial({ color: ws.color });
    const segs = [];
    for (let s = 0; s < 4; s++) {
      const seg = createCylinder(0.42 - s * 0.08, 0.36 - s * 0.08, 0.65, 8, s === 0 ? sailMat : kMat);
      seg.rotation.z = Math.PI * 0.46;
      seg.position.x = s * 0.6;
      kite.add(seg);
      segs.push(seg);
    }
    wg.add(post, pole, kite);
    group.add(wg);
    kiteWinches.push({ kite, segs, targetY: ws.y + 2.4, basePos: ws });
  });

  // Windsock on the bluff: the breeze turns with the sky. By Day the sea breeze blows
  // inland toward the east sea-stack, by Night the land breeze runs out to the western
  // stack, and Dusk is the calm between them. Each kite only climbs in its own wind.
  const KITE_WIND = ['crepusculo', 'tarde'];
  const WIND_YAW = {
    tarde: Math.atan2(2.2 - -8.2, -1.8 - -13.0), // toward the east bridge
    crepusculo: Math.atan2(-26.4 - -19.4, -24.8 - -20.0), // toward the west bridge
  };
  const windsock = new THREE.Group();
  windsock.position.set(-13.2, 2.4, -17.2);
  const sockPole = createCylinder(0.05, 0.07, 3.2, 6, timberMat);
  sockPole.position.y = 1.6;
  const sockPivot = new THREE.Group();
  sockPivot.position.y = 3.1;
  const sockStripes = ['#e8523f', '#fbf3e4', '#e8523f', '#fbf3e4'];
  sockStripes.forEach((c, s) => {
    const ring = createCylinder(0.26 - s * 0.04, 0.22 - s * 0.04, 0.34, 8, createPixelToonMaterial({ color: c }));
    ring.rotation.x = Math.PI / 2;
    ring.position.z = 0.2 + s * 0.34;
    sockPivot.add(ring);
  });
  windsock.add(sockPole, sockPivot);
  group.add(windsock);
  terrain.circles.push({ x: -13.2, z: -17.2, r: 0.2 });
  const sock ={ yaw: WIND_YAW.tarde, droop: 0 };

  // Puzzle 3: 3 Emerald Updraft Vortex Columns + Sky Chimes
  const updraftRings = [];
  const summitBellMeshes = [];
  updraftSpecs.forEach((us) => {
    const ringMat = new THREE.MeshBasicMaterial({ color: '#78ffd6', transparent: true, opacity: 0.75, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.45, 20), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(us.x, us.baseY + 0.06, us.z);
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 0.85, 3.4, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: '#a8ffea', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
    );
    col.position.set(us.x, us.baseY + 1.7, us.z);
    group.add(ring, col);
    updraftRings.push({ ring, col });

    const bg = new THREE.Group();
    bg.position.set(us.dstX, us.dstY, us.dstZ);
    const arch = createCylinder(0.11, 0.15, 1.9, 6, timberMat);
    arch.position.y = 0.95;
    const chimeMat = new THREE.MeshBasicMaterial({ color: '#58627a' });
    const chime = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), chimeMat);
    chime.position.y = 1.75;
    bg.add(arch, chime);
    group.add(bg);
    summitBellMeshes.push({ chime, chimeMat, us });
  });

  // Towering Striped White & Crimson Coastal Lighthouse + Dual Rotating Beams + Light + Keeper Cottage
  const lhGroup = new THREE.Group();
  lhGroup.position.set(29.2, 5.4, -14.2);
  const lhBase = createCylinder(1.85, 2.05, 2.0, 12, lighthouseMat);
  lhBase.position.y = 1.0;
  const lhMid = createCylinder(1.4, 1.85, 4.2, 12, lighthouseMat);
  lhMid.position.y = 4.0;
  const lhBand = createCylinder(1.24, 1.44, 1.7, 12, redStripeMat);
  lhBand.position.y = 6.8;
  const lhGallery = createCylinder(1.6, 1.6, 0.28, 12, redStripeMat);
  lhGallery.position.y = 7.8;
  const lhGlass = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, 1.4, 12), new THREE.MeshBasicMaterial({ color: '#fff3a8' }));
  lhGlass.position.y = 8.6;
  const lhCap = new THREE.Mesh(new THREE.ConeGeometry(1.38, 1.45, 12), redStripeMat);
  lhCap.position.y = 10.0;

  const lhBeamPivot = new THREE.Group();
  lhBeamPivot.position.set(0, 8.65, 0);
  const beamGeoA = new THREE.CylinderGeometry(0.22, 4.6, 28.0, 32, 1, true);
  beamGeoA.translate(0, -14.0, 0);
  beamGeoA.rotateX(-Math.PI / 2);
  const lhBeamMatA = createVolumetricBeamMaterial('#fff3b0');
  const lhBeamA = new THREE.Mesh(beamGeoA, lhBeamMatA);

  const beamGeoB = new THREE.CylinderGeometry(0.18, 2.8, 16.0, 28, 1, true);
  beamGeoB.translate(0, -8.0, 0);
  beamGeoB.rotateX(Math.PI / 2);
  const lhBeamB = new THREE.Mesh(beamGeoB, lhBeamMatA);

  const lensHaloMat = new THREE.MeshBasicMaterial({
    color: '#fff4b8',
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const lhHalo = new THREE.Mesh(new THREE.SphereGeometry(1.48, 12, 10), lensHaloMat);
  lhHalo.position.y = 8.6;

  lhBeamPivot.add(lhBeamA, lhBeamB);
  lhGroup.add(lhBase, lhMid, lhBand, lhGallery, lhGlass, lhHalo, lhCap, lhBeamPivot);
  group.add(lhGroup);

  const lhLight = new THREE.PointLight('#ffe8a0', 1.4, 24, 1.4);
  lhLight.position.set(29.2, 14.2, -14.2);
  scene.add(lhLight);
  sceneLights.push(lhLight);

  coastalBuildings.push(
    buildJapaneseBuilding(group, {
      x: 21.6,
      y: 5.4,
      z: -26.2,
      yaw: 0.35,
      w: 5.4,
      d: 4.4,
      h: 2.5,
      floors: 1,
      wallColor: '#f3efe6',
      woodColor: '#4c5c75',
      roofMat: mats.roofTileMat,
      woodPlankMat: mats.woodPlankMat,
      shojiMaterials,
      engawa: true,
      norenColor: '#2c588c',
    })
  );

  // 4 Scenic Coastal Benches
  const benches = [
    buildBench(group, { x: -2.4, y: 0.6, z: 26.2, yaw: 2.45, woodMat: timberMat, woodDarkMat: mats.darkWoodMat, cushionColor: '#d83f31' }),
    buildBench(group, { x: -19.8, y: 1.6, z: 7.6, yaw: 1.4, woodMat: timberMat, woodDarkMat: mats.darkWoodMat, cushionColor: '#ffe570' }),
    buildBench(group, { x: 4.2, y: 2.2, z: 6.2, yaw: -2.5, woodMat: timberMat, woodDarkMat: mats.darkWoodMat, cushionColor: '#4a9ee8' }),
    buildBench(group, { x: 18.2, y: 5.4, z: -15.6, yaw: -2.25, woodMat: timberMat, woodDarkMat: mats.darkWoodMat, cushionColor: '#d83f31' }),
  ];

  // Windswept Coastal Pines, Sakura & Momiji Trees (28 lush trees)
  [
    [-19.8, 0.6, 22.8, 'pine', 1.2], [-7.2, 0.6, 30.8, 'sakura', 1.1],
    [-4.8, 0.6, 22.8, 'pine', 1.08], [-29.2, 1.6, 16.5, 'pine', 1.25],
    [-29.8, 1.6, 7.2, 'sakura', 1.15], [-19.6, 1.6, 13.8, 'pine', 1.12],
    [-29.8, 1.6, -3.5, 'pine', 1.22], [-20.4, 1.6, 1.5, 'momiji-gold', 1.08],
    [-18.8, 2.4, -14.2, 'pine', 1.15], [-8.2, 2.4, -20.5, 'sakura', 1.1],
    [-34.2, 2.6, -24.5, 'pine', 1.22], [-27.2, 2.6, -23.2, 'sakura', 1.1],
    [1.8, 2.2, 5.2, 'pine', 1.18], [9.8, 2.2, 4.8, 'momiji-gold', 1.12],
    [2.8, 2.2, -3.2, 'sakura', 1.1], [-1.8, 2.8, -26.8, 'pine', 1.15],
    [5.8, 2.8, -21.0, 'sakura', 1.08], [16.8, 5.4, -26.8, 'pine', 1.2],
    [28.5, 5.4, -26.5, 'pine', 1.22], [30.2, 5.4, -18.8, 'sakura', 1.1],
    [16.8, 5.4, -14.8, 'momiji-gold', 1.12], [26.8, 5.4, -10.8, 'pine', 1.15],
    [-10.2, 0.6, 21.8, 'pine', 1.05], [-21.5, 1.6, 15.8, 'sakura', 1.05],
    [-14.5, 2.4, -21.8, 'pine', 1.08], [6.4, 2.2, -2.5, 'pine', 1.05],
    [-26.2, 2.6, -31.2, 'pine', 1.12], [29.8, 5.4, -23.5, 'sakura', 1.1],
  ].forEach(([x, y, z, type, s], idx) => buildOrganicTree(group, { type, x, y, z, scale: s, idx, treeSet }));

  const boulderColliders = buildMossBoulders(
    group,
    [
      [-15.2, 0.6, 23.8, 0.72, 0.5], [-2.5, 0.6, 28.0, 0.7, 1.4],
      [-28.4, 1.6, 12.2, 0.85, 0.8], [-29.0, 2.6, -29.8, 0.8, 2.0],
      [9.5, 2.2, -2.0, 0.82, 1.2], [26.4, 5.4, -12.5, 0.78, 0.3],
    ],
    mats.cliffMat,
    '#6d9c48'
  );
  buildGroundFoliage(group, terrain, bounds, {
    count: 920,
    allowedSurfaces: ['grass'],
    grassColor: '#e2f4b8',
    flowerColor: '#fff4da',
    flowerRatio: 0.26,
    seed: 404,
  });

  // 10 Soaring White Coastal Seagulls
  const gulls = buildCirclingBirds(
    group,
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => ({
      kind: 'gull',
      cx: (i % 2 === 0 ? -4 : 8),
      cz: -4 + (i - 4) * 3.5,
      y: 10.5 + (i % 4) * 1.5,
      rx: 18 + (i % 3) * 5,
      rz: 16 + (i % 4) * 4,
      speed: 0.28 + i * 0.025,
      phase: i * 0.78,
    }))
  );

  // 6 Stone Lanterns (10 PointLights total w/ Obelisks & Lighthouse)
  const lanterns = [
    [-14.0, 0.6, 24.4],
    [4.2, 0.45, 21.0],
    [-21.0, 1.6, 15.6],
    [-13.8, 2.4, -13.2],
    [3.2, 2.2, 3.8],
    [1.8, 2.8, -21.2],
  ].map(([x, y, z]) => buildLanternProp(group, scene, sceneLights, x, y, z, false));
  terrain.addColliders({ circles: [...boulderColliders, ...lanterns.map((l) => l.collider)] });
  terrain.addColliders(collectPropColliders(group));

  const belfry = buildObelisksAndBell(group, scene, sceneLights, {
    x: BELFRY_BELL.x,
    y: 5.4,
    z: BELFRY_BELL.z,
    obelisks: [
      { x: 19.8, z: -18.2, color: '#ffe570' },
      { x: 22.8, z: -15.6, color: '#e8523f' },
      { x: 26.2, z: -22.6, color: '#78ffd6' },
    ],
    bellColor: '#f5f2ec',
    roofMat: lighthouseMat,
    woodMat: timberMat,
    stoneMat: mats.stoneMat,
  });

  const windParticles = buildParticleField(group, 'wind', { minX: -38, maxX: 38, minY: 1, maxY: 14, minZ: -38, maxZ: 38 }, 150);
  const wildlife = buildAmbientWildlife(group, {
    butterflies: [
      { x: -12.0, y: 0.6, z: 26.0, color: '#ffe888', r: 2.8 },
      { x: -25.0, y: 1.6, z: 6.5, color: '#fff4cf', r: 3.0 },
      { x: 5.5, y: 2.2, z: 1.8, color: '#a8f4ff', kind: 'dragonfly', r: 2.6 },
    ],
    sparrows: [
      { x: -8.5, y: 1.46, z: 32.0, yaw: 0.3 },
      { x: 3.8, y: 2.22, z: 3.4, yaw: -1.6 },
      { x: 20.4, y: 5.42, z: -18.2, yaw: 0.8 },
    ],
  });

  const worldBuilder = {
    shojiMaterials,
    chochinMaterials: [],
    waterMaterials,
    waterfallMaterials: [],
    lanterns,
    addWaterRipple: () => {},
    addGravelFootprint: () => {},
    getLitLanternCount: () => lanterns.filter((l) => l.isLit).length,
    triggerHintPulse: (zone) => {
      if (zone === 'belfry') belfry.triggerHintPulse();
    },
  };

  function checkUnseal() {
    if (!bellUnsealed && sealVane && sealKite && sealSummit) {
      bellUnsealed = true;
      belfry.setBellUnsealed(true);
      audio.playSealAwaken?.();
      progressVersion++;
      onToast?.('The Lighthouse Beacon is unsealed.');
    }
    onStateChange?.(puzzleManager.getStatusSnapshot());
  }

  const puzzleManager = {
    get progressVersion() { return progressVersion; },
    get chapterComplete() { return chapterComplete; },
    get bellUnsealed() { return bellUnsealed; },
    getStatusSnapshot: () => ({ seals: [sealVane, sealKite, sealSummit], bellUnsealed, chapterComplete }),
    getPuzzleZoneForPos: (x, z) => {
      if (chapterComplete) return null;
      const reg = terrain.getRegionInfoAt(x, z).id;
      if (!sealVane && (reg === 'mills' || reg === 'cove')) return 'vane';
      if (!sealKite && reg === 'center') return 'kite';
      if (!sealSummit && (reg === 'west' || reg === 'east' || reg === 'north-rim' || reg.includes('peak'))) return 'summit';
      return 'belfry';
    },
    getHintText: (zone) => {
      if (zone === 'vane') return 'Turning one cedar windmill tugs its neighbor along the pennant cord. Face all three north.';
      if (zone === 'kite') return 'A carp kite only climbs when the breeze blows toward its sea-stack. The windsock turns with the sky; Dusk is calm.';
      if (zone === 'summit') return 'Walk into each emerald updraft to soar atop the three Sky Spires.';
      return bellUnsealed ? 'Three wind seals hum at the promontory; sound the White Beacon.' : 'Harmonic Vanes, Kite Bridges, and Sky Spires await awakening.';
    },
    getHintTargetPos: () => {
      if (!sealVane) {
        const idx = vaneStates.findIndex((s) => s !== 0);
        return windmillCoords[idx >= 0 ? idx : 0];
      }
      if (!sealKite) return winchSpots[kitesLaunched[0] ? 1 : 0];
      if (!sealSummit) {
        const si = summitBells.findIndex((b) => !b);
        return updraftSpecs[si >= 0 ? si : 2];
      }
      return BELFRY_BELL;
    },
  };

  const spots = [];
  windmillCoords.forEach((sp, i) => {
    spots.push({
      id: `vane-${i}`,
      getPos: () => sp,
      radius: 2.8,
      getLabel: () => (sealVane ? null : 'E · Turn Vane'),
      trigger: () => {
        if (sealVane) return;
        vaneStates[i] = (vaneStates[i] + 1) % 2;
        if (i + 1 < 3) vaneStates[i + 1] = (vaneStates[i + 1] + 1) % 2;
        progressVersion++;
        audio.playWindGust?.();
        if (vaneStates.every((v) => v === 0)) {
          sealVane = true;
          belfry.launchSealOrb(new THREE.Vector3(sp.x, sp.y + 3.8, sp.z), 0);
          audio.playSealAwaken?.();
          onToast?.('Vane Seal awakened.');
          checkUnseal();
        }
      },
    });
  });

  winchSpots.forEach((ws, i) => {
    spots.push({
      id: `kite-${i}`,
      getPos: () => ws,
      radius: 2.6,
      getLabel: () => (kitesLaunched[i] ? null : 'E · Launch Kite'),
      trigger: () => {
        if (kitesLaunched[i]) return;
        if (curTimeId !== KITE_WIND[i]) {
          // Wrong breeze: the carp lifts, tugs away from its bridge and sinks back
          audio.playLanternChime(false);
          kiteWinches[i].bob = 1.2;
          onToast?.(
            curTimeId === 'dorada'
              ? 'The air is still at Dusk. The carp hangs limp on its line.'
              : 'The carp tugs the wrong way across the bluff, then sinks. Watch the windsock.'
          );
          return;
        }
        kitesLaunched[i] = true;
        kiteWinches[i].targetY = ws.y + 6.4;
        if (i === 0) westBridgeMesh.visible = true;
        else eastBridgeMesh.visible = true;
        progressVersion++;
        audio.playWindGust?.();
        if (kitesLaunched.every(Boolean) && !sealKite) {
          sealKite = true;
          belfry.launchSealOrb(new THREE.Vector3(ws.x, 5.2, ws.z), 1);
          audio.playSealAwaken?.();
          onToast?.('Kite Seal awakened.');
          checkUnseal();
        }
      },
    });
  });

  updraftSpecs.forEach((us, i) => {
    spots.push({
      id: `sbell-${i}`,
      getPos: () => ({ x: us.dstX, z: us.dstZ }),
      radius: 2.6,
      getLabel: () => (summitBells[i] ? null : 'E · Sky Chime'),
      trigger: () => {
        if (summitBells[i]) return;
        summitBells[i] = true;
        summitBellMeshes[i].chimeMat.color.set('#78ffd6');
        progressVersion++;
        audio.playFurinNote(i + 2);
        if (summitBells.every(Boolean) && !sealSummit) {
          sealSummit = true;
          belfry.launchSealOrb(new THREE.Vector3(us.dstX, 6.8, us.dstZ), 2);
          audio.playSealAwaken?.();
          onToast?.('Summit Seal awakened.');
          checkUnseal();
        }
      },
    });
  });

  spots.push({
    id: 'lighthouse-bell',
    getPos: () => BELFRY_BELL,
    radius: 3.1,
    getLabel: () => 'E · Lighthouse Beacon',
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
        windParticles.triggerStorm();
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

  let updraftCooldown = 0;

  const nightAtmo = buildNightAtmosphere(group, {
    fireflyBounds: { minX: -34, maxX: 34, minY: 0.8, maxY: 9.0, minZ: -36, maxZ: 34 },
    fireflyCount: 95,
    fireflyColor: '#9ef9ff',
    lightColor: '#ffe090',
    kind: 'stone',
    pathLights: [
      { x: -10.0, y: terrain.getHeightAt(-10.0, 26.0), z: 26.0 },
      { x: -22.2, y: terrain.getHeightAt(-22.2, 14.5), z: 14.5 },
      { x: -22.5, y: terrain.getHeightAt(-22.5, -1.5), z: -1.5 },
      { x: -15.5, y: terrain.getHeightAt(-15.5, -15.0), z: -15.0 },
      { x: 1.5, y: terrain.getHeightAt(1.5, -24.0), z: -24.0 },
      { x: 5.5, y: terrain.getHeightAt(5.5, 2.2), z: 2.2 },
      { x: -29.0, y: terrain.getHeightAt(-29.0, -27.5), z: -27.5 },
      { x: 20.5, y: terrain.getHeightAt(20.5, -21.2), z: -21.2 },
    ],
  });

  return {
    terrain,
    worldBuilder,
    foliage: {
      setFireflyIntensity: (v) => nightAtmo.setIntensity(v),
      triggerPetalStorm: () => windParticles.triggerStorm(),
      update: (dt, elapsed) => {
        windParticles.update(dt, elapsed);
        nightAtmo.update(dt, elapsed);
      },
    },
    puzzleManager,
    interactions,
    spawnPoint: { x: -12.5, z: 29.8, yaw: -2.65 },
    catSpawnPoint: { x: -14.2, z: 29.2 },
    titleFocusPos: new THREE.Vector3(2.0, 3.2, -3.5),
    biomeProfile: 'windmills',
    onTimeChanged(timeId) {
      curTimeId = timeId;
    },
    update(dt, elapsed, focusPos) {
      updateClouds(clouds, dt, elapsed);
      updateBuildings(coastalBuildings, elapsed);
      belfry.update(dt, elapsed);
      gulls.update(elapsed);
      wildlife.update(dt, elapsed, focusPos);

      lhBeamPivot.rotation.y = elapsed * 0.52;
      const targetOp = curTimeId === 'crepusculo' ? 0.56 : curTimeId === 'dorada' ? 0.34 : 0.16;
      const targetLight = curTimeId === 'crepusculo' ? 4.6 : curTimeId === 'dorada' ? 2.8 : 1.2;
      const targetHalo = curTimeId === 'crepusculo' ? 0.52 : curTimeId === 'dorada' ? 0.34 : 0.18;
      lhBeamMatA.uniforms.uOpacity.value += (targetOp - lhBeamMatA.uniforms.uOpacity.value) * (1 - Math.exp(-dt * 4));
      lensHaloMat.opacity += (targetHalo - lensHaloMat.opacity) * (1 - Math.exp(-dt * 4));
      lhLight.intensity += (targetLight - lhLight.intensity) * (1 - Math.exp(-dt * 4));

      fishingBoat.position.y = -1.35 + Math.sin(elapsed * 1.9) * 0.08;
      fishingBoat.rotation.z = Math.sin(elapsed * 1.4) * 0.04;
      buoys.forEach((b) => {
        b.bg.position.y = -1.35 + Math.sin(elapsed * 2.4 + b.phase) * 0.07;
        b.bg.rotation.z = Math.sin(elapsed * 1.8 + b.phase) * 0.12;
      });
      prayerFlags.forEach((pf) => {
        pf.flag.rotation.z = Math.sin(elapsed * 5.2 + pf.phase) * 0.26;
      });

      if (updraftCooldown > 0) updraftCooldown -= dt;
      for (let i = 0; i < updraftSpecs.length; i++) {
        const us = updraftSpecs[i];
        updraftRings[i].col.rotation.y = elapsed * 2.6;
        if (
          updraftCooldown <= 0 &&
          Math.hypot(player.position.x - us.x, player.position.z - us.z) < 1.5 &&
          Math.abs(player.position.y - us.baseY) < 1.25
        ) {
          player.applyUpdraft(13.2);
          audio.playWindGust?.();
          updraftCooldown = 0.6;
        }
      }

      windmills.forEach((wm, i) => {
        const tgtYaw = vaneStates[i] * (Math.PI * 0.45);
        wm.currentYaw += (tgtYaw - wm.currentYaw) * (1 - Math.exp(-dt * 8));
        wm.yawPivot.rotation.y = wm.currentYaw;
        const speed = vaneStates[i] === 0 ? 3.2 : 0.45;
        wm.spinPivot.rotation.z += dt * speed;
        wm.beaconMat.color.set(vaneStates[i] === 0 ? '#ffe570' : '#ff7b47');
      });

      kiteWinches.forEach((kw, i) => {
        // A refused launch: a short hop that sinks back (bob decays from 1.2 s)
        let hop = 0;
        if (kw.bob > 0) {
          kw.bob = Math.max(0, kw.bob - dt);
          hop = Math.sin((1.2 - kw.bob) / 1.2 * Math.PI) * 1.6;
        }
        kw.kite.position.y += (kw.targetY + hop - kw.kite.position.y) * (1 - Math.exp(-dt * 3));
        kw.segs.forEach((s, si) => {
          s.position.y = Math.sin(elapsed * 4.2 + si * 0.7 + i) * (0.04 + si * 0.03);
        });
      });

      // Windsock swings to the breeze of the current sky and droops in the Dusk calm
      const calm = curTimeId === 'dorada';
      const tgtYaw = WIND_YAW[curTimeId] ?? sock.yaw;
      let dYaw = tgtYaw - sock.yaw;
      dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
      sock.yaw += dYaw * (1 - Math.exp(-dt * 2.2));
      sock.droop += ((calm ? 1 : 0) - sock.droop) * (1 - Math.exp(-dt * 2.5));
      sockPivot.rotation.set(
        sock.droop * 1.25 + Math.sin(elapsed * 7.0) * 0.05 * (1 - sock.droop),
        sock.yaw + Math.sin(elapsed * 2.3) * 0.08 * (1 - sock.droop),
        0,
        'YXZ'
      );
    },
    dispose() {
      belfry.dispose();
      sdfTex.dispose();
      disposeObject3D(group, scene, sceneLights);
    },
  };
}

import * as THREE from 'three';
import { getFestivalCobbleTexture } from '../../engine/PixelTextures.js';
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
  buildFloatingBoat,
  buildGroundFoliage,
  buildJapaneseBuilding,
  collectPropColliders,
  buildLanternProp,
  buildNightAtmosphere,
  buildObelisksAndBell,
  buildOrganicTree,
  buildParticleField,
  buildProceduralPondSDF,
  buildSculptedTerrace,
  buildStairMesh,
  buildToriiGate,
  buildWaterPlane,
  createBox,
  createCylinder,
  createSharedMatSet,
  createTreeBillboardSet,
  disposeObject3D,
  roundedBoxSDF,
  updateBuildings,
  updateChochins,
  updateClouds,
} from '../../world/WorldKit.js';

const canalCenterX = (z) => 1.0 + 7.5 * Math.sin((z - 8.0) * 0.105);
const canalTangentYaw = (z) => {
  const dxdz = 7.5 * 0.105 * Math.cos((z - 8.0) * 0.105);
  return Math.atan2(-dxdz, -1);
};

export function createChapter6({
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
  const mats = createSharedMatSet('#c5c6d4', getFestivalCobbleTexture());
  const treeSet = createTreeBillboardSet();
  const blueRoofMat = createPixelToonMaterial({ color: '#2b3b5e' });
  const woodMat = createPixelToonMaterial({ color: '#5a3a28' });
  const railVermMat = createPixelToonMaterial({ color: '#d83f31' });
  const shojiMat = createPixelToonMaterial({ color: '#fff3d6', emissive: '#ffab47', emissiveIntensity: 0.72 });
  const chochinMat = createPixelToonMaterial({ color: '#ffdfd0', emissive: '#ff6f47', emissiveIntensity: 0.85 });
  const shojiMaterials = [shojiMat];

  // Puzzle 1: Furin pentatonic melody [0, 2, 1, 3]
  const TARGET_MELODY = [0, 2, 1, 3];
  let furinStep = 0;
  let playbackTimer = -1;
  let sealFurin = false;

  // Puzzle 2: Floating Toro Boat guided through 3 alternating S-Canal Sluice Gates
  const gatesOpen = [false, false, false];
  let boatZ = 18.4;
  let sealBoat = false;

  // Puzzle 3: 3 Origami Crane Perches -> high-altitude Origami Rooftop Skywalk Loop
  const cranesFolded = [false, false, false];
  let sealCrane = false;

  let bellUnsealed = false;
  let chapterComplete = false;
  let progressVersion = 0;
  let curTimeId = dayCycle.getCurrentPreset().id;

  const WIND_STONE = { x: -9.5, z: 27.6 };
  const furinCoords = [
    { x: -13.6, z: 24.6, color: '#ff7066', note: 0 },
    { x: -10.4, z: 21.8, color: '#ffd966', note: 2 },
    { x: -6.4, z: 22.4, color: '#6effc2', note: 3 },
    { x: -4.4, z: 26.0, color: '#a8b5ff', note: 5 },
  ];
  const gateSpots = [
    { x: 13.4, y: 1.2, z: 16.4 },
    { x: -6.0, y: 1.4, z: 6.4 },
    { x: 1.8, y: 1.6, z: -10.6 },
  ];
  const craneSpots = [
    { x: -16.2, y: 2.6, z: -20.6 },
    { x: 17.6, y: 3.4, z: -18.2 },
    { x: -7.8, y: 3.4, z: -23.6 },
  ];
  const BELFRY_BELL = { x: -3.2, z: -36.2 };

  const terraces = [
    { id: 'square', shape: 'box', cx: -10.5, cz: 26.8, hx: 13.0, hz: 7.8, cornerR: 2.4, y: 0.6, surface: 'stone', region: { id: 'square', jp: '提灯広場', en: 'Matsuri Festival Square' } },
    { id: 'east-quay-south', shape: 'box', cx: 18.4, cz: 20.2, hx: 5.8, hz: 7.2, cornerR: 1.8, y: 1.2, surface: 'wood', region: { id: 'canal', jp: '東の提灯河岸', en: 'East Lantern Promenade' } },
    { id: 'east-quay-mid', shape: 'box', cx: 12.2, cz: 4.8, hx: 5.6, hz: 5.6, cornerR: 2.0, y: 1.2, surface: 'wood', region: { id: 'canal', jp: '東の提灯河岸', en: 'East Lantern Promenade' } },
    { id: 'west-quay-south', shape: 'box', cx: -11.8, cz: 10.6, hx: 6.8, hz: 5.6, cornerR: 2.0, y: 1.4, surface: 'wood', region: { id: 'west-canal', jp: '西の柳川岸', en: 'West Willow Canal Walk' } },
    { id: 'west-quay-north', shape: 'box', cx: -18.0, cz: -5.8, hx: 6.0, hz: 8.0, cornerR: 2.0, y: 1.6, surface: 'wood', region: { id: 'west-canal', jp: '西の柳川岸', en: 'West Willow Canal Walk' } },
    { id: 'east-wharf', shape: 'box', cx: 7.4, cz: -7.8, hx: 6.6, hz: 5.6, cornerR: 1.8, y: 1.6, surface: 'stone', region: { id: 'canal', jp: '水門の市庭', en: 'Sluice Market Wharf' } },
    { id: 'west-rooftop', shape: 'box', cx: -21.2, cz: -20.8, hx: 7.0, hz: 5.6, cornerR: 1.8, y: 2.6, surface: 'stone', region: { id: 'rooftop-w', jp: '西の藍瓦屋根', en: 'West Indigo Rooftops' } },
    { id: 'east-balcony', shape: 'box', cx: 23.6, cz: -5.4, hx: 4.6, hz: 5.0, cornerR: 1.6, y: 2.6, surface: 'wood', region: { id: 'rooftop-e', jp: '東の茶屋高台', en: 'East Tea-Balcony & Ridge' } },
    { id: 'east-rooftop', shape: 'box', cx: 21.2, cz: -18.2, hx: 5.8, hz: 5.2, cornerR: 1.8, y: 3.4, surface: 'stone', region: { id: 'rooftop-e', jp: '東の茶屋高台', en: 'East Tea-Balcony & Ridge' } },
    { id: 'mid-spire', shape: 'circle', cx: -7.8, cz: -21.8, r: 3.8, y: 3.4, surface: 'stone', region: { id: 'rooftops', jp: '鶴見の屋根', en: 'Crane Ridge Spire' } },
    { id: 'watchtower', shape: 'box', cx: -3.2, cz: -34.2, hx: 9.2, hz: 6.2, cornerR: 2.2, y: 4.4, surface: 'stone', region: { id: 'rooftops', jp: '祭り櫓の鐘楼', en: 'Festival Watchtower Belfry' } },
  ];

  const terrain = new LevelTerrain({
    defaultRegion: { id: 'square', jp: '提灯広場', en: 'Matsuri Festival Square' },
    terraces,
    bridges: [
      { ax: -11.4, az: 20.6, bx: -11.4, bz: 16.02, halfWidth: 2.0, startY: 0.6, endY: 1.4, archLift: 0.0, surface: 'stone' },
      { ax: 1.0, az: 24.4, bx: 14.2, bz: 22.0, halfWidth: 1.65, startY: 0.6, endY: 1.2, archLift: 1.15, surface: 'wood' },
      { ax: 15.8, az: 14.6, bx: 13.6, bz: 8.8, halfWidth: 2.0, startY: 1.2, endY: 1.2, archLift: 0.06, surface: 'wood' },
      { ax: -6.4, az: 9.4, bx: 8.2, bz: 5.4, halfWidth: 1.5, startY: 1.4, endY: 1.2, archLift: 0.85, surface: 'wood' },
      { ax: -14.8, az: 6.5, bx: -16.2, bz: 0.6, halfWidth: 1.85, startY: 1.4, endY: 1.6, archLift: 0.08, surface: 'wood' },
      { ax: 10.6, az: 0.8, bx: 9.6, bz: -2.38, halfWidth: 2.0, startY: 1.2, endY: 1.6, archLift: 0.0, surface: 'stone' },
      { ax: -13.4, az: -8.8, bx: 2.4, bz: -6.2, halfWidth: 1.5, startY: 1.6, endY: 1.6, archLift: 0.9, surface: 'wood' },
      // Hillside Stairs up onto Rooftops (flush unburied tops)
      { ax: -18.8, az: -12.2, bx: -20.0, bz: -15.38, halfWidth: 1.55, startY: 1.6, endY: 2.6, archLift: 0.0, surface: 'wood' },
      { ax: 12.5, az: -5.8, bx: 19.18, bz: -5.4, halfWidth: 1.55, startY: 1.6, endY: 2.6, archLift: 0.0, surface: 'wood' },
      { ax: 22.4, az: -8.8, bx: 21.8, bz: -13.18, halfWidth: 1.55, startY: 2.6, endY: 3.4, archLift: 0.0, surface: 'wood' },
      // Unlockable Elevated Origami Rooftop Catwalk Loop
      { ax: -15.6, az: -21.2, bx: -10.2, bz: -21.8, halfWidth: 1.6, startY: 2.6, endY: 3.4, archLift: 0.3, surface: 'wood', enabledFn: () => cranesFolded[0] },
      { ax: 16.8, az: -18.6, bx: -5.4, bz: -21.6, halfWidth: 1.65, startY: 3.4, endY: 3.4, archLift: 0.75, surface: 'wood', enabledFn: () => cranesFolded[1] },
      { ax: -7.0, az: -24.0, bx: -4.2, bz: -29.4, halfWidth: 1.85, startY: 3.4, endY: 4.4, archLift: 0.35, surface: 'wood', enabledFn: () => cranesFolded[2] },
    ],
    circles: [
      ...furinCoords.map((f) => ({ x: f.x, z: f.z, r: 0.5 })),
      { x: WIND_STONE.x, z: WIND_STONE.z, r: 0.54 },
      ...gateSpots.map((g) => ({ x: g.x, z: g.z, r: 0.54 })),
      ...craneSpots.map((c) => ({ x: c.x, z: c.z, r: 0.56 })),
      // Watchtower Obelisks & Bell
      { x: -7.4, z: -32.2, r: 0.56 },
      { x: 1.0, z: -32.2, r: 0.56 },
      { x: -3.2, z: -31.4, r: 0.52 },
      { x: BELFRY_BELL.x, z: BELFRY_BELL.z, r: 0.96 },
      // 4 Benches
      { x: -15.2, z: 21.0, r: 0.72 },
      { x: 11.0, z: 9.2, r: 0.72 },
      { x: -24.8, z: -22.2, r: 0.72 },
      { x: 24.2, z: -17.0, r: 0.72 },
    ],
    boxes: [
      // Taiko Stage + 3 Yatai Stalls
      { minX: -21.0, maxX: -17.4, minZ: 26.2, maxZ: 29.8 },
      { minX: -18.5, maxX: -14.7, minZ: 31.0, maxZ: 33.8 },
      { minX: -6.1, maxX: -2.3, minZ: 30.8, maxZ: 33.6 },
      { minX: -3.0, maxX: -0.2, minZ: 19.4, maxZ: 22.0 },
      // 7 Staggered Machiya Townhouses
      { minX: -23.0, maxX: -17.8, minZ: 20.4, maxZ: 25.0 },
      { minX: 19.1, maxX: 23.3, minZ: 19.7, maxZ: 25.9 },
      { minX: 13.5, maxX: 17.3, minZ: 1.9, maxZ: 7.3 },
      { minX: -17.9, maxX: -13.7, minZ: 8.8, maxZ: 14.8 },
      { minX: -23.4, maxX: -19.4, minZ: -8.2, maxZ: -1.8 },
      { minX: 8.7, maxX: 12.5, minZ: -13.0, maxZ: -8.6 },
      { minX: 23.8, maxX: 27.4, minZ: -7.8, maxZ: -3.0 },
    ],
  });

  const clouds = [];
  buildCloudSeaAndCumulus(group, clouds, -12.8, 52);

  terraces.forEach((t, idx) => {
    const isRoof = t.id === 'west-rooftop' || t.id === 'east-rooftop';
    const topMat = isRoof ? blueRoofMat : t.surface === 'wood' ? mats.woodPlankMat : mats.grassMat;
    if (t.shape === 'circle') {
      group.add(buildCircularTerrace({ cx: t.cx, cz: t.cz, r: t.r, topY: t.y, topMat, cliffMat: mats.cliffMat, seed: 60 + idx }));
    } else {
      group.add(buildSculptedTerrace({ cx: t.cx, cz: t.cz, hx: t.hx, hz: t.hz, cornerR: t.cornerR || 2.0, topY: t.y, topMat, cliffMat: mats.cliffMat, seed: 60 + idx }));
    }
  });

  addStonePad(group, -10.5, 26.8, 0.6, 16.0, 10.6, '#b6bacb');
  addStonePad(group, -3.2, -34.2, 4.4, 11.8, 9.6, '#b6bacb');
  addWoodenDeck(group, -21.2, -20.8, 2.6, 8.8, 6.4, mats.woodPlankMat);
  addWoodenDeck(group, 21.2, -18.2, 3.4, 7.6, 6.2, mats.woodPlankMat);

  // Rooftop Indigo Gable Ridges & Attic Shoji Dormers + Balustrades
  [
    [-21.2, 2.6, -24.4],
    [21.2, 3.4, -21.8],
  ].forEach(([rx, ry, rz]) => {
    const dormer = createBox(3.4, 1.4, 2.2, woodMat);
    dormer.position.set(rx, ry + 0.7, rz);
    const dShoji = createBox(2.2, 0.85, 0.14, shojiMat, false, false);
    dShoji.position.set(rx, ry + 0.7, rz + 1.12);
    const dRoof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.1, 4), blueRoofMat);
    dRoof.rotation.y = Math.PI / 4;
    dRoof.position.set(rx, ry + 1.9, rz);
    group.add(dormer, dShoji, dRoof);
    // Solid dormer (the low eave reaches ±1.8 m, keep Hana's head clear of it)
    terrain.boxes.push({ minX: rx - 1.75, maxX: rx + 1.75, minZ: rz - 1.45, maxZ: rz + 1.45 });
  });
  terrain.segments.push(buildFenceLine(group, { x0: -26.8, z0: -25.2, x1: -26.8, z1: -16.5, y: 2.6, posts: 5, mat: woodMat, height: 0.75 }));
  terrain.segments.push(buildFenceLine(group, { x0: 25.4, z0: -22.2, x1: 25.4, z1: -14.2, y: 3.4, posts: 5, mat: woodMat, height: 0.75 }));
  buildToriiGate(group, { x: -10.5, y: 0.6, z: 33.4, color: '#d83f31' });

  // Canal Stairs, Arched Bridges & Rooftop Hillside Stairs
  buildStairMesh(group, { ax: -11.4, az: 20.6, bx: -11.4, bz: 16.02, width: 4.0, startY: 0.6, endY: 1.4, steps: 6, stoneMat: mats.stoneMat });
  buildBridgeMesh(group, { ax: 1.0, az: 24.4, bx: 14.2, bz: 22.0, halfWidth: 1.65, startY: 0.6, endY: 1.2, archLift: 1.15, woodMat: mats.woodPlankMat, railMat: railVermMat, railingStyle: 'vermilion' });
  buildBridgeMesh(group, { ax: 15.8, az: 14.6, bx: 13.6, bz: 8.8, halfWidth: 2.0, startY: 1.2, endY: 1.2, archLift: 0.06, woodMat: mats.woodPlankMat, railMat: woodMat, railingStyle: 'low-wood' });
  buildBridgeMesh(group, { ax: -6.4, az: 9.4, bx: 8.2, bz: 5.4, halfWidth: 1.5, startY: 1.4, endY: 1.2, archLift: 0.85, woodMat: mats.woodPlankMat, railMat: railVermMat, railingStyle: 'vermilion' });
  buildBridgeMesh(group, { ax: -14.8, az: 6.5, bx: -16.2, bz: 0.6, halfWidth: 1.85, startY: 1.4, endY: 1.6, archLift: 0.08, woodMat: mats.woodPlankMat, railMat: woodMat, railingStyle: 'low-wood' });
  buildStairMesh(group, { ax: 10.6, az: 0.8, bx: 9.6, bz: -2.38, width: 4.0, startY: 1.2, endY: 1.6, steps: 4, stoneMat: mats.stoneMat });
  buildBridgeMesh(group, { ax: -13.4, az: -8.8, bx: 2.4, bz: -6.2, halfWidth: 1.5, startY: 1.6, endY: 1.6, archLift: 0.9, woodMat: mats.woodPlankMat, railMat: railVermMat, railingStyle: 'vermilion' });

  buildStairMesh(group, { ax: -18.8, az: -12.2, bx: -20.0, bz: -15.38, width: 3.1, startY: 1.6, endY: 2.6, steps: 6, stoneMat: mats.woodPlankMat });
  buildStairMesh(group, { ax: 12.5, az: -5.8, bx: 19.18, bz: -5.4, width: 3.1, startY: 1.6, endY: 2.6, steps: 7, stoneMat: mats.woodPlankMat });
  buildStairMesh(group, { ax: 22.4, az: -8.8, bx: 21.8, bz: -13.18, width: 3.1, startY: 2.6, endY: 3.4, steps: 6, stoneMat: mats.woodPlankMat });

  const makeCatwalk = (ax, az, bx, bz, startY, endY, archLift, halfWidth = 1.6) => {
    const cg = buildBridgeMesh(group, { ax, az, bx, bz, halfWidth, startY, endY, archLift, woodMat: mats.woodPlankMat, railMat: railVermMat, railingStyle: 'vermilion' });
    cg.visible = false;
    cg.position.y = -1.4;
    cg.userData = { unfold: 0, active: false };
    return cg;
  };
  const catwalkWestSpire = makeCatwalk(-15.6, -21.2, -10.2, -21.8, 2.6, 3.4, 0.3, 1.6);
  const catwalkCanalSky = makeCatwalk(16.8, -18.6, -5.4, -21.6, 3.4, 3.4, 0.75, 1.65);
  const catwalkBelfry = makeCatwalk(-7.0, -24.0, -4.2, -29.4, 3.4, 4.4, 0.35, 1.85);

  // S-Bending Mirror Lantern Canal & Northern Toro Mooring Basin Water Plane
  const bounds = { minX: -40, maxX: 40, minZ: -42, maxZ: 40 };
  const ripples = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -99, 0));
  const waterMaterials = [];
  const sdfTex = buildProceduralPondSDF(
    bounds,
    (wx, wz) => (Math.abs(wx - canalCenterX(wz)) < 5.2 && wz > -30 && wz < 38) || Math.hypot(wx - 2.8, wz + 22.5) < 7.0,
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
  buildWaterPlane({ group, w: 80, d: 82, cx: 0, cz: -1, y: 0.15, waterMaterials, sdfTex, bounds, ripples, isMirror: true });

  // 7 Staggered Asymmetric Blue-Tile Machiya Townhouses
  const townBuildings = [
    { x: -20.4, y: 0.6, z: 22.8, yaw: 0.18, w: 4.8, d: 4.0, h: 2.6, floors: 2, noren: '#b83228', engawa: false, wall: '#eee3d1' },
    { x: 21.2, y: 1.2, z: 22.8, yaw: -Math.PI * 0.5, w: 6.2, d: 4.2, h: 2.8, floors: 2, noren: '#2c4d75', engawa: false, wall: '#eee3d1' },
    { x: 15.4, y: 1.2, z: 4.6, yaw: -Math.PI * 0.5, w: 5.4, d: 3.8, h: 2.6, floors: 1, noren: '#d8553a', engawa: true, wall: '#eee3d1' },
    { x: -15.8, y: 1.4, z: 11.8, yaw: Math.PI * 0.5, w: 6.0, d: 4.2, h: 2.8, floors: 2, noren: '#3b6998', engawa: false, wall: '#eee3d1' },
    { x: -21.4, y: 1.6, z: -5.0, yaw: Math.PI * 0.5, w: 6.4, d: 4.0, h: 2.5, floors: 2, noren: '#6f4e7c', engawa: false, wall: '#eee3d1' },
    { x: 10.6, y: 1.6, z: -10.8, yaw: -Math.PI * 0.5, w: 4.4, d: 3.8, h: 2.6, floors: 1, noren: '#c9402e', engawa: false, wall: '#f5efe6' },
    { x: 25.6, y: 2.6, z: -5.4, yaw: -Math.PI * 0.5, w: 4.8, d: 3.6, h: 2.4, floors: 1, noren: '#d99a38', engawa: true, wall: '#eee3d1' },
  ].map((b) =>
    buildJapaneseBuilding(group, {
      x: b.x,
      y: b.y,
      z: b.z,
      yaw: b.yaw,
      w: b.w,
      d: b.d,
      h: b.h,
      floors: b.floors,
      wallColor: b.wall,
      woodColor: '#523424',
      roofMat: blueRoofMat,
      woodPlankMat: mats.woodPlankMat,
      shojiMaterials,
      engawa: b.engawa,
      norenColor: b.noren,
    })
  );

  // SW Matsuri Square Landmark: Taiko Drum Yagura Stage
  const yagura = new THREE.Group();
  yagura.position.set(-19.2, 0.6, 28.0);
  const yStage = createBox(3.4, 0.75, 3.4, woodMat);
  yStage.position.y = 0.38;
  for (const px of [-1.45, 1.45]) {
    for (const pz of [-1.45, 1.45]) {
      const p = createBox(0.18, 3.4, 0.18, railVermMat);
      p.position.set(px, 2.0, pz);
      yagura.add(p);
    }
  }
  const yCanopy = new THREE.Mesh(new THREE.ConeGeometry(2.9, 1.25, 4), blueRoofMat);
  yCanopy.rotation.y = Math.PI / 4;
  yCanopy.position.y = 4.2;
  const drum = createCylinder(0.45, 0.45, 0.95, 12, railVermMat);
  drum.rotation.z = Math.PI * 0.5;
  drum.position.y = 1.42;
  const drumSkin = createCylinder(0.42, 0.42, 1.0, 12, createPixelToonMaterial({ color: '#faf4e6' }));
  drumSkin.rotation.z = Math.PI * 0.5;
  drumSkin.position.y = 1.42;
  yagura.add(yStage, yCanopy, drum, drumSkin);
  group.add(yagura);

  // 3 Unique Yatai Stalls (Kitsune Masks, Goldfish/Chochin, Canal Dango)
  [
    { x: -16.6, z: 32.4, yaw: 0.35, noren: '#d83f31', kind: 'mask' },
    { x: -4.2, z: 32.2, yaw: -0.45, noren: '#2c588c', kind: 'fish' },
    { x: -1.6, z: 20.8, yaw: -1.25, noren: '#d99a38', kind: 'dango' },
  ].forEach((st) => {
    const sg = new THREE.Group();
    sg.position.set(st.x, 0.6, st.z);
    sg.rotation.y = st.yaw;
    const base = createBox(3.2, 0.9, 2.1, woodMat);
    base.position.y = 0.45;
    const roof = createBox(3.6, 0.24, 2.5, blueRoofMat);
    roof.position.y = 2.45;
    for (const px of [-1.45, 1.45]) {
      for (const pz of [-0.9, 0.9]) {
        const post = createBox(0.15, 2.35, 0.15, woodMat);
        post.position.set(px, 1.22, pz);
        sg.add(post);
      }
    }
    const drape = createBox(3.0, 0.58, 0.08, createPixelToonMaterial({ color: st.noren }));
    drape.position.set(0, 2.05, 1.0);
    for (const lx of [-1.2, 1.2]) {
      const l = createCylinder(0.15, 0.15, 0.32, 8, chochinMat, false, false);
      l.position.set(lx, 1.85, 1.12);
      sg.add(l);
    }
    if (st.kind === 'mask') {
      for (let m = -1; m <= 1; m++) {
        const mask = createBox(0.24, 0.28, 0.08, createPixelToonMaterial({ color: m === 0 ? '#ffd9d0' : '#ffffff' }));
        mask.position.set(m * 0.45, 1.5, -0.8);
        sg.add(mask);
      }
    } else if (st.kind === 'fish') {
      const tub = createCylinder(0.45, 0.42, 0.22, 10, createPixelToonMaterial({ color: '#64c8e8' }));
      tub.position.set(0, 1.02, 0.15);
      sg.add(tub);
    } else {
      for (let d = 0; d < 3; d++) {
        const dango = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 6, 5),
          createPixelToonMaterial({ color: ['#ffb8c8', '#ffffff', '#8cd67a'][d] })
        );
        dango.position.set(-0.35 + d * 0.35, 1.05, 0.2);
        sg.add(dango);
      }
    }
    sg.add(base, roof, drape);
    group.add(sg);
  });

  // 8 Grounded Chochin Garlands spanning Matsuri Square, S-Canal Bridges & Watchtower
  const townLanterns = [];
  [
    [-17.4, 27.8, 0.6, -4.4, 31.4, 0.6, 4.2, 0.75, 7],
    [-16.2, 31.4, 0.6, -2.2, 21.8, 0.6, 4.2, 0.85, 8],
    [1.4, 26.0, 0.6, 13.8, 23.6, 1.2, 4.8, 0.75, 7],
    [-6.2, 14.8, 1.4, 13.4, 15.6, 1.2, 5.0, 0.9, 9],
    [-6.0, 8.0, 1.4, 7.6, 7.2, 1.2, 4.9, 0.75, 7],
    [-13.0, -3.2, 1.6, 2.0, -4.0, 1.6, 5.2, 0.8, 8],
    [1.8, -11.4, 1.6, 12.4, -7.8, 1.6, 5.2, 0.65, 6],
    [-9.6, -29.2, 4.4, 3.2, -29.2, 4.4, 7.9, 0.6, 6],
  ].forEach(([ax, az, ag, bx, bz, bg, topY, sag, count]) => {
    const cg = buildChochinGarland(group, { ax, az, aGroundY: ag, bx, bz, bGroundY: bg, ay: topY, by: topY, sag, count, chochinMat });
    if (cg?.lanterns) townLanterns.push(...cg.lanterns);
  });

  // Puzzle 1: 4 Furin Chimes & Wind Stone in Matsuri Square
  const furinMeshes = [];
  furinCoords.forEach((sp) => {
    const fg = new THREE.Group();
    fg.position.set(sp.x, 0.6, sp.z);
    const post = createCylinder(0.09, 0.12, 2.35, 6, woodMat);
    post.position.y = 1.18;
    const arm = createBox(0.75, 0.1, 0.1, woodMat);
    arm.position.set(0.25, 2.28, 0);
    const domeMat = new THREE.MeshBasicMaterial({ color: sp.color });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), domeMat);
    dome.position.set(0.45, 1.98, 0);
    const slip = createBox(0.16, 0.62, 0.04, createPixelToonMaterial({ color: sp.color }));
    slip.position.set(0.45, 1.38, 0);
    fg.add(post, arm, dome, slip);
    group.add(fg);
    furinMeshes.push({ dome, domeMat, slip, glowTimer: 0 });
  });

  const windStone = createCylinder(0.48, 0.58, 0.78, 8, mats.stoneMat);
  windStone.position.set(WIND_STONE.x, 0.99, WIND_STONE.z);
  group.add(windStone);

  // Puzzle 2: Floating Toro Boat guided along S-Canal Spline by 3 Sluice Gates
  const gateBars = [];
  const sluiceZs = [16.4, 6.2, -10.6];
  gateSpots.forEach((sp, i) => {
    const gg = new THREE.Group();
    gg.position.set(sp.x, sp.y, sp.z);
    const lever = createBox(0.48, 0.92, 0.48, woodMat);
    lever.position.y = 0.46;
    group.add(gg);
    gg.add(lever);

    const gz = sluiceZs[i];
    const boom = createBox(6.8, 0.22, 0.22, railVermMat);
    boom.position.set(canalCenterX(gz), 0.75, gz);
    boom.rotation.y = canalTangentYaw(gz) - Math.PI * 0.5;
    group.add(boom);
    gateBars.push(boom);
  });

  const toroBoat = buildFloatingBoat(group, {
    x: canalCenterX(boatZ),
    y: 0.22,
    z: boatZ,
    yaw: canalTangentYaw(boatZ),
    hullColor: '#693c24',
    trimColor: '#d94534',
    lanternColor: '#ffbe66',
    scale: 1.05,
  });
  const boatLight = new THREE.PointLight('#ffb85e', 0.8, 12, 1.5);
  boatLight.position.set(toroBoat.position.x, 1.4, boatZ);
  scene.add(boatLight);
  sceneLights.push(boatLight);

  // 12 Drifting Paper Candle Lanterns gliding along the S-Curve Canal
  const canalLanterns = Array.from({ length: 12 }, (_, i) => {
    const cl = createBox(0.38, 0.44, 0.38, chochinMat, false, false);
    const z = -22 + i * 4.5;
    const lat = (i % 2 === 0 ? -1 : 1) * (0.9 + (i % 3) * 0.65);
    cl.position.set(canalCenterX(z) + lat, 0.34, z);
    group.add(cl);
    return { cl, z, lat, phase: i * 0.9 };
  });

  // Puzzle 3: 3 Origami Crane Perches
  const craneWings = [];
  craneSpots.forEach((sp) => {
    const cg = new THREE.Group();
    cg.position.set(sp.x, sp.y, sp.z);
    const ped = createBox(0.68, 0.85, 0.68, mats.stoneMat);
    ped.position.y = 0.42;
    const craneMat = createPixelToonMaterial({ color: '#ffffff', emissive: '#a8d8ff', emissiveIntensity: 0.25 });
    const crane = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 0), craneMat);
    crane.position.y = 1.25;
    crane.scale.set(1.9, 0.65, 0.85);
    cg.add(ped, crane);
    group.add(cg);
    craneWings.push({ crane, craneMat });
  });

  // 4 Scenic Town & Rooftop Benches
  const benches = [
    buildBench(group, { x: -15.2, y: 0.6, z: 21.0, yaw: 0.35, woodMat, woodDarkMat: mats.darkWoodMat, cushionColor: '#d94534' }),
    buildBench(group, { x: 11.0, y: 1.2, z: 9.2, yaw: -2.2, woodMat, woodDarkMat: mats.darkWoodMat, cushionColor: '#2c588c' }),
    buildBench(group, { x: -24.8, y: 2.6, z: -22.2, yaw: 0.65, woodMat, woodDarkMat: mats.darkWoodMat, cushionColor: '#d94534' }),
    buildBench(group, { x: 24.2, y: 3.4, z: -17.0, yaw: -1.15, woodMat, woodDarkMat: mats.darkWoodMat, cushionColor: '#e8a838' }),
  ];

  // Courtyard Sakura & Crimson Momiji Trees (24 trees flanking rooftops & quays)
  [
    [-21.8, 0.6, 33.0, 'sakura', 1.15], [-0.5, 0.6, 29.8, 'momiji-red', 1.1],
    [16.2, 1.2, 25.8, 'sakura', 1.1], [22.4, 1.2, 15.2, 'momiji-gold', 1.15],
    [15.6, 1.2, 9.2, 'sakura', 1.05], [-16.2, 1.4, 14.2, 'sakura', 1.12],
    [-8.2, 1.4, 14.5, 'momiji-gold', 1.05], [-21.8, 1.6, -11.5, 'momiji-red', 1.12],
    [12.2, 1.6, -4.8, 'sakura', 1.05], [-26.2, 2.6, -16.8, 'sakura', 1.18],
    [-16.4, 2.6, -16.5, 'momiji-red', 1.12], [25.8, 2.6, -9.2, 'sakura', 1.1],
    [25.2, 3.4, -21.8, 'momiji-red', 1.18], [17.4, 3.4, -22.2, 'sakura', 1.1],
    [-10.8, 4.4, -38.2, 'sakura', 1.25], [4.2, 4.4, -38.2, 'momiji-red', 1.25],
    [-10.2, 4.4, -30.0, 'momiji-gold', 1.1], [4.0, 4.4, -30.0, 'sakura', 1.1],
    [-3.5, 0.6, 20.5, 'sakura', 1.02], [11.8, 1.2, 1.5, 'momiji-red', 1.05],
    [-13.5, 1.6, -11.0, 'cedar', 1.1], [2.4, 1.6, -3.5, 'sakura', 1.0],
    [-25.5, 2.6, -24.8, 'cedar', 1.15], [25.6, 3.4, -14.2, 'momiji-gold', 1.1],
  ].forEach(([x, y, z, type, s], idx) => buildOrganicTree(group, { type, x, y, z, scale: s, idx, treeSet }));

  buildGroundFoliage(group, terrain, bounds, {
    count: 580,
    allowedSurfaces: ['stone'],
    grassColor: '#a2b886',
    flowerColor: '#ffe0ea',
    flowerRatio: 0.25,
    seed: 606,
  });

  // 10 Luminous Gliding Origami Paper Cranes overhead
  const skyCranes = buildCirclingBirds(
    group,
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => ({
      kind: 'crane',
      cx: (i % 2 === 0 ? -4 : 4),
      cz: -6 + (i - 4) * 3.5,
      y: 8.8 + (i % 4) * 1.4,
      rx: 15 + (i % 3) * 4,
      rz: 17 + (i % 4) * 4,
      speed: 0.25 + i * 0.025,
      phase: i * 0.85,
    }))
  );

  // 6 Stone Lanterns (10 PointLights total w/ Obelisks & Toro Boat)
  const lanterns = [
    [-6.0, 0.6, 19.4],
    [13.8, 1.2, 25.4],
    [-7.2, 1.4, 14.6],
    [5.4, 1.6, -12.0],
    [-15.6, 2.6, -16.8],
    [16.8, 3.4, -14.2],
  ].map(([x, y, z]) => buildLanternProp(group, scene, sceneLights, x, y, z, true));
  terrain.addColliders({ circles: lanterns.map((l) => l.collider) });
  terrain.addColliders(collectPropColliders(group));

  const belfry = buildObelisksAndBell(group, scene, sceneLights, {
    x: BELFRY_BELL.x,
    y: 4.4,
    z: BELFRY_BELL.z,
    obelisks: [
      { x: -7.4, z: -32.2, color: '#ff94a8' },
      { x: 1.0, z: -32.2, color: '#ffd966' },
      { x: -3.2, z: -31.4, color: '#a8d8ff' },
    ],
    roofMat: blueRoofMat,
    woodMat,
    stoneMat: mats.stoneMat,
  });

  const petals = buildParticleField(group, 'petals', { minX: -36, maxX: 36, minY: 0.5, maxY: 14, minZ: -38, maxZ: 36 }, 135);
  const fireflies = buildNightAtmosphere(group, {
    fireflyBounds: { minX: -28, maxX: 28, minY: 0.6, maxY: 6.5, minZ: -38, maxZ: 34 },
    fireflyCount: 110,
    fireflyColor: '#ffda7e',
    lightColor: '#ffc668',
    kind: 'stone',
    pathLights: [
      { x: -11.4, y: terrain.getHeightAt(-11.4, 22.0), z: 22.0 },
      { x: 16.5, y: terrain.getHeightAt(16.5, 19.5), z: 19.5 },
      { x: -11.0, y: terrain.getHeightAt(-11.0, 9.2), z: 9.2 },
      { x: 11.2, y: terrain.getHeightAt(11.2, 3.2), z: 3.2 },
      { x: -16.5, y: terrain.getHeightAt(-16.5, -9.0), z: -9.0 },
      { x: 8.5, y: terrain.getHeightAt(8.5, -5.5), z: -5.5 },
      { x: -20.0, y: terrain.getHeightAt(-20.0, -18.2), z: -18.2 },
      { x: 20.5, y: terrain.getHeightAt(20.5, -16.5), z: -16.5 },
      { x: -3.2, y: terrain.getHeightAt(-3.2, -30.5), z: -30.5 },
    ],
  });
  const wildlife = buildAmbientWildlife(group, {
    butterflies: [
      { x: -10.0, y: 0.6, z: 25.0, color: '#ffd966', r: 3.0 },
      { x: 16.5, y: 1.2, z: 18.0, color: '#9cf2ff', kind: 'dragonfly', r: 2.6 },
      { x: -17.5, y: 1.6, z: -4.0, color: '#ffbfa8', r: 2.8 },
    ],
    sparrows: [
      { x: -12.0, y: 0.62, z: 32.0, yaw: 0.4 },
      { x: 9.2, y: 1.62, z: -5.4, yaw: -1.8 },
      { x: 20.5, y: 3.42, z: -15.5, yaw: -0.9 },
    ],
  });

  const worldBuilder = {
    shojiMaterials,
    chochinMaterials: [chochinMat],
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
    if (!bellUnsealed && sealFurin && sealBoat && sealCrane) {
      bellUnsealed = true;
      belfry.setBellUnsealed(true);
      audio.playSealAwaken?.();
      progressVersion++;
      onToast?.('The Matsuri Bell is unsealed.');
    }
    onStateChange?.(puzzleManager.getStatusSnapshot());
  }

  const puzzleManager = {
    get progressVersion() { return progressVersion; },
    get chapterComplete() { return chapterComplete; },
    get bellUnsealed() { return bellUnsealed; },
    getStatusSnapshot: () => ({ seals: [sealFurin, sealBoat, sealCrane], bellUnsealed, chapterComplete }),
    getPuzzleZoneForPos: (x, z) => {
      if (chapterComplete) return null;
      const reg = terrain.getRegionInfoAt(x, z).id;
      if (!sealFurin && reg === 'square') return 'furin';
      if (!sealBoat && (reg === 'canal' || reg === 'west-canal')) return 'boat';
      if (!sealCrane) return 'crane';
      return 'belfry';
    },
    getHintText: (zone) => {
      if (zone === 'furin') return 'Touch the southwest square wind stone, then echo its four colored tanzaku chimes.';
      if (zone === 'boat') return 'A lock only opens with the tōrō waiting in it. Open the first gate, then walk beside the lantern and open each gate as it arrives.';
      if (zone === 'crane') return 'Climb hillside stairs to fold origami cranes on both blue roofs and unite the skywalk loop.';
      return bellUnsealed ? 'Three seals glow over the stepped rooftops; ring the Matsuri Bell.' : 'Awaken the Chime Melody, Canal Lantern, and Origami Cranes.';
    },
    getHintTargetPos: () => {
      if (!sealFurin) return furinStep === 0 ? WIND_STONE : furinCoords[TARGET_MELODY[furinStep]];
      if (!sealBoat) {
        const gi = gatesOpen.findIndex((g) => !g);
        return gateSpots[gi >= 0 ? gi : 0];
      }
      if (!sealCrane) {
        const ci = cranesFolded.findIndex((c) => !c);
        return craneSpots[ci >= 0 ? ci : 0];
      }
      return BELFRY_BELL;
    },
  };

  const spots = [];
  spots.push({
    id: 'wind-stone',
    getPos: () => WIND_STONE,
    radius: 2.5,
    getLabel: () => (sealFurin ? null : 'E · Listen'),
    trigger: () => {
      playbackTimer = 0;
    },
  });

  furinCoords.forEach((sp, i) => {
    spots.push({
      id: `furin-${i}`,
      getPos: () => sp,
      radius: 2.4,
      getLabel: () => (sealFurin ? null : 'E · Ring Fūrin'),
      trigger: () => {
        furinMeshes[i].glowTimer = 0.65;
        audio.playFurinNote(sp.note);
        if (sealFurin) return;
        if (i === TARGET_MELODY[furinStep]) {
          furinStep++;
          progressVersion++;
          if (furinStep === TARGET_MELODY.length) {
            sealFurin = true;
            belfry.launchSealOrb(new THREE.Vector3(sp.x, 3.0, sp.z), 0);
            audio.playSealAwaken?.();
            onToast?.('Fūrin Seal awakened.');
            checkUnseal();
          }
        } else {
          furinStep = i === TARGET_MELODY[0] ? 1 : 0;
        }
      },
    });
  });

  gateSpots.forEach((sp, i) => {
    spots.push({
      id: `gate-${i}`,
      getPos: () => sp,
      radius: 2.6,
      getLabel: () => (gatesOpen[i] ? null : 'E · Shift Gate'),
      trigger: () => {
        if (gatesOpen[i]) return;
        // A lock only opens with the tōrō boat waiting inside it; otherwise the
        // canal would drain. Hana has to walk the boat down, gate by gate.
        const WAIT_Z = [18.4, 8.4, -9.0];
        if (Math.abs(boatZ - WAIT_Z[i]) > 1.4) {
          audio.playLanternChime(false);
          onToast?.('The lock would drain with no boat inside. Wait for the tōrō lantern to reach this gate.');
          return;
        }
        gatesOpen[i] = true;
        gateBars[i].visible = false;
        progressVersion++;
        audio.playWaterGate?.();
        if (gatesOpen.every(Boolean) && !sealBoat) {
          sealBoat = true;
          belfry.launchSealOrb(new THREE.Vector3(canalCenterX(-21.8), 1.5, -21.8), 1);
          audio.playSealAwaken?.();
          onToast?.('Tōrō Seal awakened.');
          checkUnseal();
        }
      },
    });
  });

  const catwalkArr = [catwalkWestSpire, catwalkCanalSky, catwalkBelfry];
  craneSpots.forEach((sp, i) => {
    spots.push({
      id: `crane-${i}`,
      getPos: () => sp,
      radius: 2.6,
      getLabel: () => (cranesFolded[i] ? null : 'E · Fold Crane'),
      trigger: () => {
        if (cranesFolded[i]) return;
        cranesFolded[i] = true;
        craneWings[i].craneMat.emissiveIntensity = 0.88;
        catwalkArr[i].visible = true;
        catwalkArr[i].userData.active = true;
        progressVersion++;
        audio.playLanternChime(true);
        if (cranesFolded.every(Boolean) && !sealCrane) {
          sealCrane = true;
          belfry.launchSealOrb(new THREE.Vector3(sp.x, sp.y + 1.5, sp.z), 2);
          audio.playSealAwaken?.();
          onToast?.('Crane Seal awakened.');
          checkUnseal();
        }
      },
    });
  });

  spots.push({
    id: 'matsuri-bell',
    getPos: () => BELFRY_BELL,
    radius: 3.1,
    getLabel: () => 'E · Matsuri Bell',
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
        petals.triggerStorm();
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
      setFireflyIntensity: (v) => fireflies.setIntensity(Math.max(0.18, v)),
      triggerPetalStorm: () => petals.triggerStorm(),
      update: (dt, elapsed) => {
        petals.update(dt, elapsed);
        fireflies.update(dt, elapsed);
      },
    },
    puzzleManager,
    interactions,
    spawnPoint: { x: -10.5, z: 32.8, yaw: Math.PI * 0.92 },
    catSpawnPoint: { x: -12.1, z: 32.6 },
    titleFocusPos: new THREE.Vector3(-1.5, 2.8, 3.0),
    biomeProfile: 'papertown',
    onTimeChanged(timeId) {
      curTimeId = timeId;
    },
    update(dt, elapsed, focusPos) {
      updateClouds(clouds, dt, elapsed);
      updateBuildings(townBuildings, elapsed);
      updateChochins(townLanterns, dt, elapsed, focusPos);
      belfry.update(dt, elapsed);
      skyCranes.update(elapsed);
      wildlife.update(dt, elapsed, focusPos);

      const glowBoost = curTimeId === 'crepusculo' ? 1.0 : curTimeId === 'dorada' ? 0.65 : 0.25;
      const tgtBoatLight = curTimeId === 'crepusculo' ? 4.2 : curTimeId === 'dorada' ? 2.6 : 0.65;
      boatLight.intensity += (tgtBoatLight - boatLight.intensity) * (1 - Math.exp(-dt * 4));

      if (playbackTimer >= 0) {
        const prevT = playbackTimer;
        playbackTimer += dt;
        const beat = Math.floor(playbackTimer / 0.55);
        if (beat !== Math.floor(prevT / 0.55) || prevT === 0) {
          const idxStep = prevT === 0 ? 0 : beat;
          if (idxStep < TARGET_MELODY.length) {
            const chimeIdx = TARGET_MELODY[idxStep];
            furinMeshes[chimeIdx].glowTimer = 0.5;
            audio.playFurinNote(furinCoords[chimeIdx].note);
          } else {
            playbackTimer = -1;
          }
        }
      }

      furinMeshes.forEach((fm, i) => {
        if (fm.glowTimer > 0) fm.glowTimer = Math.max(0, fm.glowTimer - dt);
        fm.dome.scale.setScalar(1 + (fm.glowTimer > 0 ? 0.35 : 0));
        fm.slip.rotation.z = Math.sin(elapsed * 2.4 + i) * 0.14;
      });

      const tgtBoatZ = sealBoat ? -21.8 : gatesOpen[0] ? (gatesOpen[1] ? -9.0 : 8.4) : 18.4;
      boatZ += (tgtBoatZ - boatZ) * (1 - Math.exp(-dt * 1.8));
      const bx = canalCenterX(boatZ);
      toroBoat.position.set(bx, 0.22 + Math.sin(elapsed * 2.6) * 0.04, boatZ);
      toroBoat.rotation.y = canalTangentYaw(boatZ);
      boatLight.position.set(bx, 1.4, boatZ);

      canalLanterns.forEach((cl) => {
        cl.z -= dt * 0.45;
        if (cl.z < -24) cl.z = 30;
        cl.cl.position.set(canalCenterX(cl.z) + cl.lat, 0.34 + Math.sin(elapsed * 2.0 + cl.phase) * 0.06, cl.z);
        cl.cl.rotation.y = elapsed * 0.5 + cl.phase;
      });

      craneWings.forEach((cw, i) => {
        cw.craneMat.emissiveIntensity = cranesFolded[i] ? Math.max(0.75, glowBoost) : glowBoost * 0.4;
        cw.crane.position.y = 1.25 + Math.sin(elapsed * 2.6 + i) * (cranesFolded[i] ? 0.14 : 0.03);
      });

      catwalkArr.forEach((cw) => {
        if (cw.userData.active && cw.userData.unfold < 1) {
          cw.userData.unfold = Math.min(1, cw.userData.unfold + dt * 1.6);
          const u = cw.userData.unfold;
          const easeOut = 1 - Math.pow(1 - u, 3);
          cw.position.y = -(1 - easeOut) * 1.4;
          cw.rotation.z = Math.sin(elapsed * 6) * 0.03 * (1 - easeOut);
        } else if (cw.userData.unfold >= 1) {
          cw.position.y = 0;
          cw.rotation.z = 0;
        }
      });
    },
    dispose() {
      belfry.dispose();
      sdfTex.dispose();
      disposeObject3D(group, scene, sceneLights);
    },
  };
}

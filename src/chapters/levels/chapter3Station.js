import * as THREE from 'three';
import { getPaddyGrassTexture, getRiceStalkTexture } from '../../engine/PixelTextures.js';
import { createPixelToonMaterial } from '../../engine/ToonMaterials.js';
import {
  LevelTerrain,
  addStonePad,
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
  buildRetainingWallRim,
  buildStairMesh,
  buildSteppingStoneMeshes,
  buildToriiGate,
  buildWaterPlane,
  createBox,
  createCylinder,
  createSharedMatSet,
  createTreeBillboardSet,
  disposeObject3D,
  updateBuildings,
  updateCascades,
  updateChochins,
  updateClouds,
} from '../../world/WorldKit.js';

const RAIL_ANGLE = 0.2618; // 15 deg WNW -> ESE diagonal spine
const RAIL_COS = Math.cos(RAIL_ANGLE);
const RAIL_SIN = Math.sin(RAIL_ANGLE);
const railPt = (s, n = 0) => ({
  x: +(s * RAIL_COS + n * RAIL_SIN).toFixed(2),
  z: +(-5.0 + s * RAIL_SIN - n * RAIL_COS).toFixed(2),
});

export function createChapter3({
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
  const mats = createSharedMatSet('#e2eaad', getPaddyGrassTexture());
  const treeSet = createTreeBillboardSet();
  const timberMat = createPixelToonMaterial({ color: '#6b472f' });
  const railMat = createPixelToonMaterial({ color: '#c43e2d' });
  const steelMat = createPixelToonMaterial({ color: '#474f5c' });
  const girderMat = createPixelToonMaterial({ color: '#364d47' });
  const chochinMat = createPixelToonMaterial({ color: '#ffebd0', emissive: '#ff9c54', emissiveIntensity: 0.55 });
  const shojiMaterials = [];

  // Puzzle 1: 3 Stepped Mirror Rice Terraces (target all level 1 at Dusk)
  const weirLevels = [0, 2, 1];
  let sealMirror = false;

  // Puzzle 2: 3 Trackside Semaphore Signal Levers -> raise fumikiri gate, depart 2-car train, open Express Overpass
  const signalStates = [false, false, false];
  let sealSignal = false;
  let trainS = -1.2;
  let targetTrainS = -1.2;

  // Puzzle 3: 3 Curved Inari Bamboo Wind Chimes (long -> mid -> short)
  const chimeHeights = [0.98, 0.62, 0.32];
  let nextChimeIdx = 0;
  const chimesDone = [false, false, false];
  let sealChime = false;

  let bellUnsealed = false;
  let chapterComplete = false;
  let progressVersion = 0;
  let curTimeId = dayCycle.getCurrentPreset().id;

  const Y_SOUTH = 0.2;
  const Y_PADDY_LOW = 0.9;
  const Y_PADDY_MID = 2.0;
  const Y_PADDY_HIGH = 3.1;
  const Y_STATION_STEP = 3.3;
  const Y_STATION = 4.6;
  const Y_UNDERPASS = 2.0;
  const Y_KITSUNE = 3.6;
  const Y_KITSUNE_UP = 4.4;
  const Y_ARC_W = 5.2;
  const Y_ARC_M = 6.0;
  const Y_ARC_E = 6.8;
  const Y_OVERLOOK = 6.2;
  const Y_BELFRY = 8.4;

  const weirSpots = [
    { x: 6.4, y: Y_PADDY_LOW, z: 25.8 },
    { x: -1.8, y: Y_PADDY_MID, z: 18.4 },
    { x: -14.8, y: Y_PADDY_HIGH, z: 12.6 },
  ];
  const basinSpots = [
    { x: 11.4, y: Y_PADDY_LOW, z: 23.6 },
    { x: -5.4, y: Y_PADDY_MID, z: 14.2 },
    { x: -19.6, y: Y_PADDY_HIGH, z: 9.8 },
  ];
  const signalCoords = [
    { ...railPt(-11.5, -2.5), y: Y_STATION, s: -11.5 },
    { ...railPt(-1.5, -2.5), y: Y_STATION, s: -1.5 },
    { ...railPt(9.5, -2.5), y: Y_STATION, s: 9.5 },
  ];
  const chimeCoords = [
    { x: -6.4, y: Y_ARC_W, z: -21.6 },
    { x: 2.8, y: Y_ARC_M, z: -18.2 },
    { x: 12.2, y: Y_ARC_E, z: -16.8 },
  ];
  const BELFRY_BELL = { x: 8.8, z: -35.6 };

  // Creek Parkour Stepping Stones ascending East Creek Waterfall (jump-assisted rock hop!)
  const CREEK_STONES = [
    { x: 16.6, z: 15.0, r: 1.25, visualR: 1.05, y: 1.45, surface: 'stone' },
    { x: 16.8, z: 12.5, r: 1.25, visualR: 1.05, y: 2.05, surface: 'stone' },
    { x: 16.4, z: 10.0, r: 1.25, visualR: 1.05, y: 2.65, surface: 'stone' },
    { x: 15.5, z: 7.6, r: 1.25, visualR: 1.05, y: 3.3, surface: 'stone' },
    { x: 14.2, z: 5.2, r: 1.25, visualR: 1.05, y: 3.9, surface: 'stone' },
    { x: 12.5, z: 2.8, r: 1.3, visualR: 1.1, y: 4.35, surface: 'stone' },
    // Jump Cairn Shortcuts across South -> Low Paddy and South -> Mid Paddy!
    { x: -2.0, z: 24.4, r: 1.2, visualR: 0.98, y: 0.6, surface: 'stone' },
    { x: 1.2, z: 23.0, r: 1.25, visualR: 1.02, y: 0.9, surface: 'stone' },
    { x: -7.2, z: 23.2, r: 1.15, visualR: 0.95, y: 0.8, surface: 'stone' },
    { x: -7.6, z: 20.6, r: 1.15, visualR: 0.95, y: 1.4, surface: 'stone' },
  ];

  const stW = railPt(-10.5, -5.8);
  const stC = railPt(0.0, -5.8);
  const stE = railPt(10.5, -5.8);

  const terraces = [
    { id: 'south-main', shape: 'circle', cx: -13.5, cz: 30.5, r: 7.0, y: Y_SOUTH, surface: 'grass', region: { id: 'south', jp: '南の畦道', en: 'South Bund Meadow' } },
    { id: 'south-spur', shape: 'circle', cx: -6.2, cz: 28.0, r: 4.2, y: Y_SOUTH, surface: 'grass', region: { id: 'south', jp: '南の畦道', en: 'South Bund Meadow' } },
    { id: 'paddy-low', shape: 'circle', cx: 10.6, cz: 23.8, r: 6.4, y: Y_PADDY_LOW, surface: 'grass', wallH: 1.05, region: { id: 'paddies', jp: '棚田の鏡', en: 'Crescent Mirror Terraces' } },
    { id: 'paddy-mill', shape: 'circle', cx: 16.4, cz: 20.0, r: 4.0, y: Y_PADDY_LOW, surface: 'grass', wallH: 1.05, region: { id: 'paddies', jp: '棚田の鏡', en: 'Crescent Mirror Terraces' } },
    { id: 'paddy-mid', shape: 'circle', cx: -4.2, cz: 15.8, r: 6.4, y: Y_PADDY_MID, surface: 'grass', wallH: 1.25, region: { id: 'paddies', jp: '棚田の鏡', en: 'Crescent Mirror Terraces' } },
    { id: 'paddy-mid-e', shape: 'circle', cx: 2.4, cz: 14.8, r: 3.6, y: Y_PADDY_MID, surface: 'grass', wallH: 1.25, region: { id: 'paddies', jp: '棚田の鏡', en: 'Crescent Mirror Terraces' } },
    { id: 'paddy-high', shape: 'circle', cx: -18.8, cz: 10.4, r: 6.0, y: Y_PADDY_HIGH, surface: 'grass', wallH: 1.25, region: { id: 'paddies', jp: '棚田の鏡', en: 'Crescent Mirror Terraces' } },
    { id: 'paddy-high-n', shape: 'circle', cx: -22.2, cz: 4.6, r: 4.2, y: Y_PADDY_HIGH, surface: 'grass', wallH: 1.25, region: { id: 'paddies', jp: '棚田の鏡', en: 'Crescent Mirror Terraces' } },
    { id: 'station-mid-landing', shape: 'circle', cx: 0.4, cz: 7.4, r: 2.0, y: Y_STATION_STEP, surface: 'stone', wallH: 1.35, region: { id: 'station', jp: '田園の駅', en: 'Diagonal Terrace Station' } },
    { id: 'station-w', shape: 'circle', cx: stW.x, cz: stW.z, r: 2.0, y: Y_STATION, surface: 'wood', region: { id: 'station', jp: '田園の駅', en: 'Diagonal Terrace Station' } },
    { id: 'station-c', shape: 'circle', cx: stC.x, cz: stC.z, r: 2.0, y: Y_STATION, surface: 'wood', region: { id: 'station', jp: '田園の駅', en: 'Diagonal Terrace Station' } },
    { id: 'station-e', shape: 'circle', cx: stE.x, cz: stE.z, r: 2.0, y: Y_STATION, surface: 'wood', region: { id: 'station', jp: '田園の駅', en: 'Diagonal Terrace Station' } },
    { id: 'west-embank', shape: 'circle', cx: -25.2, cz: -4.0, r: 3.6, y: Y_PADDY_HIGH, surface: 'grass', wallH: 1.2, region: { id: 'kitsune', jp: '狐の抜け道', en: 'Kitsune Underpass & Grove' } },
    { id: 'underpass-floor', shape: 'circle', cx: -23.6, cz: -11.6, r: 2.3, y: Y_UNDERPASS, surface: 'stone', region: { id: 'kitsune', jp: '狐の抜け道', en: 'Kitsune Underpass & Grove' } },
    { id: 'kitsune-main', shape: 'circle', cx: -22.0, cz: -20.8, r: 4.6, y: Y_KITSUNE, surface: 'grass', wallH: 1.25, region: { id: 'kitsune', jp: '狐の抜け道', en: 'Kitsune Underpass & Grove' } },
    { id: 'kitsune-upper', shape: 'circle', cx: -13.4, cz: -23.4, r: 3.2, y: Y_KITSUNE_UP, surface: 'grass', wallH: 1.0, region: { id: 'kitsune', jp: '狐の抜け道', en: 'Kitsune Underpass & Grove' } },
    { id: 'arc-west', shape: 'circle', cx: -6.4, cz: -21.6, r: 2.8, y: Y_ARC_W, surface: 'stone', region: { id: 'ridge', jp: '千本鳥居の坂', en: 'Curved Inari Torii Arc' } },
    { id: 'arc-mid', shape: 'circle', cx: 2.8, cz: -18.2, r: 3.6, y: Y_ARC_M, surface: 'stone', region: { id: 'ridge', jp: '千本鳥居の坂', en: 'Curved Inari Torii Arc' } },
    { id: 'arc-east', shape: 'circle', cx: 12.2, cz: -16.8, r: 3.4, y: Y_ARC_E, surface: 'stone', region: { id: 'ridge', jp: '千本鳥居の坂', en: 'Curved Inari Torii Arc' } },
    { id: 'overlook-main', shape: 'circle', cx: 24.0, cz: -10.8, r: 5.2, y: Y_OVERLOOK, surface: 'grass', wallH: 1.4, region: { id: 'overlook', jp: '夕映えの茶見台', en: 'Sunset Tea Overlook' } },
    { id: 'belfry-main', shape: 'circle', cx: 8.4, cz: -34.2, r: 7.4, y: Y_BELFRY, surface: 'stone', wallH: 1.65, region: { id: 'belfry', jp: '稲荷の鐘楼', en: 'Inari Ridge Belfry' } },
    { id: 'belfry-west-vista', shape: 'circle', cx: 1.2, cz: -31.8, r: 3.8, y: Y_BELFRY, surface: 'stone', region: { id: 'belfry', jp: '稲荷の鐘楼', en: 'Inari Ridge Belfry' } },
  ];

  const terrain = new LevelTerrain({
    defaultRegion: { id: 'south', jp: '南の畦道', en: 'South Bund Meadow' },
    terraces,
    bridges: [
      // Unified Diagonal Station Platform Deck (y = 4.6)
      { ax: -15.4, az: -4.2, bx: 12.8, bz: 3.2, halfWidth: 3.0, startY: Y_STATION, endY: Y_STATION, archLift: 0.0, surface: 'wood' },
      // South -> Low Paddy Bridge/Stair across water (0.2 -> 0.9)
      { ax: -2.4, az: 26.4, bx: 4.5, bz: 24.4, halfWidth: 1.45, startY: Y_SOUTH, endY: Y_PADDY_LOW, archLift: 0.14, surface: 'wood' },
      // Low Paddy -> Mid Paddy Staircase (0.9 -> 2.0, unburied across water moat!)
      { ax: 5.6, az: 20.0, bx: 3.1, bz: 18.2, halfWidth: 1.5, startY: Y_PADDY_LOW, endY: Y_PADDY_MID, archLift: 0.0, surface: 'stone' },
      // Mid Paddy -> High Paddy Staircase (2.0 -> 3.1, unburied across water moat!)
      { ax: -10.1, az: 13.5, bx: -13.4, bz: 12.4, halfWidth: 1.55, startY: Y_PADDY_MID, endY: Y_PADDY_HIGH, archLift: 0.0, surface: 'stone' },
      // Mid Paddy -> Station Two-Tier Grand Central Staircase (2.0 -> 3.3 -> 4.6)
      { ax: 1.4, az: 11.4, bx: 0.7, bz: 9.2, halfWidth: 1.6, startY: Y_PADDY_MID, endY: Y_STATION_STEP, archLift: 0.0, surface: 'stone' },
      { ax: 0.0, az: 5.6, bx: -1.4, bz: 2.55, halfWidth: 1.65, startY: Y_STATION_STEP, endY: Y_STATION, archLift: 0.0, surface: 'stone' },
      // Upper Paddy -> Station West Terrace Staircase (3.1 -> 4.6)
      { ax: -19.2, az: 1.8, bx: -14.8, bz: -1.4, halfWidth: 1.65, startY: Y_PADDY_HIGH, endY: Y_STATION, archLift: 0.0, surface: 'stone' },
      // High Paddy -> West Embankment Footbridge (3.1 -> 3.1)
      { ax: -23.2, az: 0.6, bx: -24.4, bz: -0.8, halfWidth: 1.5, startY: Y_PADDY_HIGH, endY: Y_PADDY_HIGH, archLift: 0.22, surface: 'wood' },
      // Station West -> West Embankment Descending Stair (4.6 -> 3.1)
      { ax: -15.6, az: -4.2, bx: -21.8, bz: -4.1, halfWidth: 1.5, startY: Y_STATION, endY: Y_PADDY_HIGH, archLift: 0.0, surface: 'stone' },
      // East Creek Jump-Stone Connectors (require jumping over cascading creek gaps!)
      { ax: 16.6, az: 16.2, bx: 16.6, bz: 15.0, halfWidth: 1.1, startY: Y_PADDY_LOW, endY: 1.45, archLift: 0, surface: 'stone', jumpOnly: true },
      { ax: 16.6, az: 15.0, bx: 16.8, bz: 12.5, halfWidth: 1.1, startY: 1.45, endY: 2.05, archLift: 0, surface: 'stone', jumpOnly: true },
      { ax: 16.8, az: 12.5, bx: 16.4, bz: 10.0, halfWidth: 1.1, startY: 2.05, endY: 2.65, archLift: 0, surface: 'stone', jumpOnly: true },
      { ax: 16.4, az: 10.0, bx: 15.5, bz: 7.6, halfWidth: 1.1, startY: 2.65, endY: 3.3, archLift: 0, surface: 'stone', jumpOnly: true },
      { ax: 15.5, az: 7.6, bx: 14.2, bz: 5.2, halfWidth: 1.1, startY: 3.3, endY: 3.9, archLift: 0, surface: 'stone', jumpOnly: true },
      { ax: 14.2, az: 5.2, bx: 12.5, bz: 2.8, halfWidth: 1.1, startY: 3.9, endY: 4.35, archLift: 0, surface: 'stone', jumpOnly: true },
      { ax: 12.5, az: 2.8, bx: 10.6, bz: 1.2, halfWidth: 1.3, startY: 4.35, endY: Y_STATION, archLift: 0.05, surface: 'wood' },
      // Jump Cairn Connectors on South Side (require Jump to skip up retaining walls!)
      { ax: -4.2, az: 25.4, bx: -2.0, bz: 24.4, halfWidth: 1.0, startY: Y_SOUTH, endY: 0.6, archLift: 0, surface: 'stone', jumpOnly: true },
      { ax: -2.0, az: 24.4, bx: 1.2, bz: 23.0, halfWidth: 1.0, startY: 0.6, endY: Y_PADDY_LOW, archLift: 0, surface: 'stone', jumpOnly: true },
      { ax: 1.2, az: 23.0, bx: 4.6, bz: 23.2, halfWidth: 1.1, startY: Y_PADDY_LOW, endY: Y_PADDY_LOW, archLift: 0, surface: 'stone' },
      { ax: -7.2, az: 24.8, bx: -7.2, bz: 23.2, halfWidth: 1.0, startY: Y_SOUTH, endY: 0.8, archLift: 0, surface: 'stone', jumpOnly: true },
      { ax: -7.2, az: 23.2, bx: -7.6, bz: 20.6, halfWidth: 1.0, startY: 0.8, endY: 1.4, archLift: 0, surface: 'stone', jumpOnly: true },
      { ax: -7.6, az: 20.6, bx: -6.2, bz: 19.2, halfWidth: 1.1, startY: 1.4, endY: Y_PADDY_MID, archLift: 0, surface: 'stone', jumpOnly: true },
      // West Steel Girder Viaduct Underpass -> Kitsune Grove (OPEN HEADROOM 2.48m)
      { ax: -24.6, az: -7.5, bx: -23.7, bz: -10.8, halfWidth: 1.65, startY: Y_PADDY_HIGH, endY: Y_UNDERPASS, archLift: 0.0, surface: 'stone' },
      { ax: -23.4, az: -12.8, bx: -22.4, bz: -16.6, halfWidth: 1.65, startY: Y_UNDERPASS, endY: Y_KITSUNE, archLift: 0.0, surface: 'stone' },
      // Kitsune Grove -> Curved Inari Torii Arc -> Sunset Overlook & Belfry
      { ax: -18.2, az: -21.8, bx: -16.4, bz: -22.6, halfWidth: 1.6, startY: Y_KITSUNE, endY: Y_KITSUNE_UP, archLift: 0.0, surface: 'stone' },
      { ax: -10.4, az: -22.5, bx: -8.8, bz: -22.2, halfWidth: 1.65, startY: Y_KITSUNE_UP, endY: Y_ARC_W, archLift: 0.0, surface: 'stone' },
      { ax: -3.9, az: -20.5, bx: -0.6, bz: -19.2, halfWidth: 1.85, startY: Y_ARC_W, endY: Y_ARC_M, archLift: 0.0, surface: 'stone' },
      { ax: 6.2, az: -17.5, bx: 9.0, bz: -17.1, halfWidth: 1.85, startY: Y_ARC_M, endY: Y_ARC_E, archLift: 0.0, surface: 'stone' },
      { ax: 15.2, az: -15.4, bx: 19.6, bz: -12.8, halfWidth: 1.65, startY: Y_ARC_E, endY: Y_OVERLOOK, archLift: 0.25, surface: 'wood' },
      { ax: 11.4, az: -19.8, bx: 9.8, bz: -27.2, halfWidth: 2.0, startY: Y_ARC_E, endY: Y_BELFRY, archLift: 0.0, surface: 'stone' },
      // Express Overpass Bridge above Viaduct (unlocked once Signal Seal departs train!)
      { ax: -0.4, az: -1.59, bx: 2.8, bz: -15.0, halfWidth: 1.9, startY: Y_STATION, endY: Y_ARC_M, archLift: 1.65, surface: 'wood', enabledFn: () => sealSignal },
    ],
    stones: CREEK_STONES,
    circles: [
      ...weirSpots.map((w) => ({ x: w.x, z: w.z, r: 0.54 })),
      ...basinSpots.map((b) => ({ x: b.x, z: b.z, r: 2.1 })),
      ...signalCoords.map((s) => ({ x: s.x, z: s.z, r: 0.5 })),
      ...chimeCoords.map((c) => ({ x: c.x, z: c.z, r: 0.48 })),
      { x: -24.4, z: -18.8, r: 0.56 },
      { x: -20.4, z: -23.8, r: 0.56 },
      { x: -17.8, z: 28.5, r: 0.5 },
      { x: -21.8, z: 9.8, r: 0.5 },
      // Ticket house footprint
      { x: -12.2, z: -0.6, r: 2.1 },
      { x: -10.2, z: -0.1, r: 2.0 },
      // Obelisks & Bell on Belfry Summit
      { x: 4.6, z: -32.8, r: 0.56 },
      { x: 12.6, z: -32.6, r: 0.56 },
      { x: 8.6, z: -31.2, r: 0.52 },
      { x: BELFRY_BELL.x, z: BELFRY_BELL.z, r: 0.96 },
      // 4 Benches
      { x: -8.6, z: 30.8, r: 0.72 },
      { x: 2.4, z: 2.2, r: 0.72 },
      { x: 25.0, z: -12.4, r: 0.72 },
      { x: 0.6, z: -31.4, r: 0.72 },
    ],
  });

  const clouds = [];
  buildCloudSeaAndCumulus(group, clouds, -12.8, 56);

  terraces.forEach((t, idx) => {
    const topMat = t.surface === 'wood' ? mats.woodPlankMat : t.surface === 'stone' ? mats.stoneMat : mats.grassMat;
    group.add(buildCircularTerrace({ cx: t.cx, cz: t.cz, r: t.r, topY: t.y, topMat, cliffMat: mats.cliffMat, seed: 30 + idx }));
    if (t.wallH) {
      buildRetainingWallRim(group, { cx: t.cx, cz: t.cz, r: t.r, topY: t.y, height: t.wallH, stoneMat: mats.stoneMat });
    }
  });

  addStonePad(group, 8.4, -34.2, Y_BELFRY, 10.2, 9.2);

  // Diagonal Station Platform Deck
  buildBridgeMesh(group, { ax: -15.4, az: -4.2, bx: 12.8, bz: 3.2, halfWidth: 3.0, startY: Y_STATION, endY: Y_STATION, archLift: 0.0, woodMat: mats.woodPlankMat, railingStyle: 'none' });
  // South -> Low Paddy Bridge
  buildBridgeMesh(group, { ax: -2.4, az: 26.4, bx: 4.5, bz: 24.4, halfWidth: 1.45, startY: Y_SOUTH, endY: Y_PADDY_LOW, archLift: 0.14, woodMat: mats.woodPlankMat, railMat: timberMat, railingStyle: 'low-wood' });
  // Crisp Unburied Staircases between Paddy Tiers & Station
  buildStairMesh(group, { ax: 5.6, az: 20.0, bx: 3.1, bz: 18.2, width: 3.0, startY: Y_PADDY_LOW, endY: Y_PADDY_MID, steps: 6, stoneMat: mats.stoneMat, railMat: timberMat, railingStyle: 'wood' });
  buildStairMesh(group, { ax: -10.1, az: 13.5, bx: -13.4, bz: 12.4, width: 3.1, startY: Y_PADDY_MID, endY: Y_PADDY_HIGH, steps: 6, stoneMat: mats.stoneMat, railMat: timberMat, railingStyle: 'wood' });
  buildStairMesh(group, { ax: 1.4, az: 11.4, bx: 0.7, bz: 9.2, width: 3.2, startY: Y_PADDY_MID, endY: Y_STATION_STEP, steps: 7, stoneMat: mats.stoneMat, railMat: railMat, railingStyle: 'vermilion' });
  buildStairMesh(group, { ax: 0.0, az: 5.6, bx: -1.4, bz: 2.55, width: 3.3, startY: Y_STATION_STEP, endY: Y_STATION, steps: 7, stoneMat: mats.stoneMat, railMat: railMat, railingStyle: 'vermilion' });
  buildStairMesh(group, { ax: -19.2, az: 1.8, bx: -14.8, bz: -1.4, width: 3.3, startY: Y_PADDY_HIGH, endY: Y_STATION, steps: 8, stoneMat: mats.stoneMat, railMat: timberMat, railingStyle: 'wood' });
  buildBridgeMesh(group, { ax: -23.2, az: 0.6, bx: -24.4, bz: -0.8, halfWidth: 1.5, startY: Y_PADDY_HIGH, endY: Y_PADDY_HIGH, archLift: 0.22, woodMat: mats.woodPlankMat, railMat: timberMat, railingStyle: 'low-wood' });
  buildStairMesh(group, { ax: -15.6, az: -4.2, bx: -21.8, bz: -4.1, width: 3.0, startY: Y_STATION, endY: Y_PADDY_HIGH, steps: 8, stoneMat: mats.stoneMat, railMat: timberMat, railingStyle: 'wood' });
  // East Creek final ramp onto East Station
  buildBridgeMesh(group, { ax: 12.5, az: 2.8, bx: 10.6, bz: 1.2, halfWidth: 1.3, startY: 4.35, endY: Y_STATION, archLift: 0.05, woodMat: mats.woodPlankMat, railMat: timberMat, railingStyle: 'low-wood' });
  // Underpass Down + Up Stairs
  buildStairMesh(group, { ax: -24.6, az: -7.5, bx: -23.7, bz: -10.8, width: 3.3, startY: Y_PADDY_HIGH, endY: Y_UNDERPASS, steps: 6, stoneMat: mats.stoneMat });
  buildStairMesh(group, { ax: -23.4, az: -12.8, bx: -22.4, bz: -16.6, width: 3.3, startY: Y_UNDERPASS, endY: Y_KITSUNE, steps: 8, stoneMat: mats.stoneMat, railMat: timberMat, railingStyle: 'wood' });
  // Kitsune -> Curved Torii Arc -> Overlook -> Belfry Summit
  buildStairMesh(group, { ax: -18.2, az: -21.8, bx: -16.4, bz: -22.6, width: 3.1, startY: Y_KITSUNE, endY: Y_KITSUNE_UP, steps: 5, stoneMat: mats.stoneMat });
  buildStairMesh(group, { ax: -10.4, az: -22.5, bx: -8.8, bz: -22.2, width: 3.2, startY: Y_KITSUNE_UP, endY: Y_ARC_W, steps: 5, stoneMat: mats.stoneMat });
  buildStairMesh(group, { ax: -3.9, az: -20.5, bx: -0.6, bz: -19.2, width: 3.5, startY: Y_ARC_W, endY: Y_ARC_M, steps: 5, stoneMat: mats.stoneMat });
  buildStairMesh(group, { ax: 6.2, az: -17.5, bx: 9.0, bz: -17.1, width: 3.5, startY: Y_ARC_M, endY: Y_ARC_E, steps: 5, stoneMat: mats.stoneMat });
  buildBridgeMesh(group, { ax: 15.2, az: -15.4, bx: 19.6, bz: -12.8, halfWidth: 1.65, startY: Y_ARC_E, endY: Y_OVERLOOK, archLift: 0.25, woodMat: mats.woodPlankMat, railMat: timberMat, railingStyle: 'low-wood' });
  buildStairMesh(group, { ax: 11.4, az: -19.8, bx: 9.8, bz: -27.2, width: 3.9, startY: Y_ARC_E, endY: Y_BELFRY, steps: 10, stoneMat: mats.stoneMat, railMat: railMat, railingStyle: 'vermilion' });

  const centerBridgeGroup = buildBridgeMesh(group, {
    ax: -0.4,
    az: -1.59,
    bx: 2.8,
    bz: -15.0,
    halfWidth: 1.9,
    startY: Y_STATION,
    endY: Y_ARC_M,
    archLift: 1.65,
    woodMat: mats.woodPlankMat,
    railMat,
    railingStyle: 'vermilion',
  });
  centerBridgeGroup.visible = false;

  buildSteppingStoneMeshes(group, CREEK_STONES, { stoneMat: mats.stoneMat, cliffMat: mats.cliffMat, capColor: '#6d8f3c', height: 2.8 });
  // Small bridge slab connecting jump cairn to paddy-low
  buildBridgeMesh(group, { ax: 1.2, az: 23.0, bx: 4.6, bz: 23.2, halfWidth: 1.1, startY: Y_PADDY_LOW, endY: Y_PADDY_LOW, archLift: 0.04, woodMat: mats.stoneMat, railingStyle: 'none' });

  // Bamboo Irrigation Spouts (Kakehi) + Falling Cascades & Splash Foam between stepped terraces!
  const plungeFoams = [];
  const waterfallMaterials = [];
  [
    { x: -12.4, zTop: 12.2, yTop: Y_PADDY_HIGH - 0.15, yBot: Y_PADDY_MID - 0.15, dropDist: 2.6, width: 1.05, yaw: 0.8, seed: 31 },
    { x: 5.0, zTop: 16.5, yTop: Y_PADDY_MID - 0.15, yBot: Y_PADDY_LOW - 0.15, dropDist: 2.4, width: 1.1, yaw: 0.4, seed: 32 },
    { x: 16.4, zTop: 2.5, yTop: Y_STATION + 0.1, yBot: -0.75, dropDist: 3.4, width: 1.95, yaw: 0.12, seed: 33 },
  ].forEach((c) => {
    const spout = createCylinder(0.11, 0.13, 1.35, 6, createPixelToonMaterial({ color: '#789e4c' }));
    spout.rotation.z = Math.PI * 0.45;
    spout.rotation.y = c.yaw;
    spout.position.set(c.x, c.yTop + 0.18, c.zTop);
    group.add(spout);
    buildOrganicCascade(group, waterfallMaterials, plungeFoams, {
      ...c,
      cliffMat: mats.cliffMat,
      capColor: '#6d8f3c',
    });
  });

  // Flooded Mirror Valley Lake
  const bounds = { minX: -44, maxX: 44, minZ: -44, maxZ: 42 };
  const ripples = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -99, 0));
  const waterMaterials = [];
  const sdfTex = buildProceduralPondSDF(
    bounds,
    (wx, wz) => Math.hypot(wx, wz) < 39.5,
    (wx, wz) => {
      let d = 999;
      for (let i = 0; i < terraces.length; i++) {
        const t = terraces[i];
        const td = Math.hypot(wx - t.cx, wz - t.cz) - t.r;
        if (td < d) d = td;
      }
      return Math.max(0, d);
    }
  );
  buildWaterPlane({ group, w: 88, d: 86, cx: 0, cz: -1, y: -0.75, waterMaterials, sdfTex, bounds, ripples, isMirror: true });

  // =========================================================================
  // DIAGONAL RAILWAY VIADUCT & 2-CAR VINTAGE TRAIN (`railRoot`, y = 4.75+)
  // =========================================================================
  const railRoot = new THREE.Group();
  railRoot.position.set(0, 0, -5.0);
  railRoot.rotation.y = -RAIL_ANGLE;
  group.add(railRoot);

  const vDeckW = createBox(14.5, 0.45, 3.2, mats.stoneMat);
  vDeckW.position.set(-34.75, 4.75, 0);
  const vDeckE = createBox(64.0, 0.45, 3.2, mats.stoneMat);
  vDeckE.position.set(10.5, 4.75, 0);
  const girderSpan = createBox(6.6, 0.55, 3.3, girderMat);
  girderSpan.position.set(-24.5, 4.97, 0);
  railRoot.add(vDeckW, vDeckE, girderSpan);

  [-38, -30, -19, -11, -3, 5, 13, 21, 29, 37].forEach((px) => {
    const pier = createBox(1.8, 13.5, 2.4, mats.stoneMat);
    pier.position.set(px, -2.1, 0);
    railRoot.add(pier);
  });
  for (const ax of [-27.8, -21.2]) {
    const abut = createBox(1.5, 8.2, 2.8, girderMat);
    abut.position.set(ax, 0.75, 0);
    railRoot.add(abut);
  }

  for (const rz of [-0.55, 0.55]) {
    const rail = createBox(84, 0.14, 0.14, steelMat);
    rail.position.set(0, 5.08, rz);
    railRoot.add(rail);
  }
  for (let tx = -40; tx <= 40; tx += 1.35) {
    const tie = createBox(0.3, 0.1, 1.55, timberMat);
    tie.position.set(tx, 5.0, 0);
    railRoot.add(tie);
  }
  for (let mx = -36; mx <= 36; mx += 12) {
    const mast = createCylinder(0.08, 0.1, 4.4, 6, steelMat);
    mast.position.set(mx, 7.15, -1.35);
    const arm = createBox(0.12, 0.12, 2.4, steelMat);
    arm.position.set(mx, 9.05, -0.3);
    railRoot.add(mast, arm);
  }
  const wireA = createBox(84, 0.05, 0.05, steelMat, false, false);
  wireA.position.set(0, 8.55, 0);
  const wireB = createBox(84, 0.05, 0.05, steelMat, false, false);
  wireB.position.set(0, 9.15, 0);
  railRoot.add(wireA, wireB);

  const barrierPost = createBox(0.28, 1.3, 0.28, createPixelToonMaterial({ color: '#f2c53d' }));
  barrierPost.position.set(0.5, 5.25, 1.7);
  const barrierPivot = new THREE.Group();
  barrierPivot.position.set(0.5, 5.65, 1.7);
  for (let b = 0; b < 6; b++) {
    const seg = createBox(0.7, 0.12, 0.12, createPixelToonMaterial({ color: b % 2 === 0 ? '#f2c53d' : '#22242a' }));
    seg.position.set(0.4 + b * 0.7, 0, 0);
    barrierPivot.add(seg);
  }
  const fLampMatA = new THREE.MeshBasicMaterial({ color: '#ff3838' });
  const fLampMatB = new THREE.MeshBasicMaterial({ color: '#452222' });
  const fLampA = new THREE.Mesh(new THREE.SphereGeometry(0.14, 7, 6), fLampMatA);
  fLampA.position.set(0.34, 6.05, 1.72);
  const fLampB = new THREE.Mesh(new THREE.SphereGeometry(0.14, 7, 6), fLampMatB);
  fLampB.position.set(0.66, 6.05, 1.72);
  railRoot.add(barrierPost, barrierPivot, fLampA, fLampB);

  const trainGroup = new THREE.Group();
  trainGroup.position.set(trainS, 5.85, 0);
  const creamMat = createPixelToonMaterial({ color: '#f5ebd6' });
  const roofGray = createPixelToonMaterial({ color: '#6b7585' });
  const winMat = new THREE.MeshBasicMaterial({ color: '#ffe599' });
  const gangway = createBox(0.75, 1.4, 1.45, createPixelToonMaterial({ color: '#30343d' }));
  trainGroup.add(gangway);

  [-4.2, 4.2].forEach((carX, cIdx) => {
    const car = new THREE.Group();
    car.position.x = carX;
    const body = createBox(7.8, 1.68, 1.85, creamMat);
    const stripe = createBox(7.85, 0.42, 1.89, railMat);
    stripe.position.y = -0.26;
    const goldBand = createBox(7.86, 0.08, 1.9, createPixelToonMaterial({ color: '#efc04c' }));
    goldBand.position.y = -0.02;
    const tRoof = createBox(7.65, 0.25, 1.75, roofGray);
    tRoof.position.y = 0.96;
    car.add(body, stripe, goldBand, tRoof);
    for (let w = -2.7; w <= 2.7; w += 1.35) {
      const win = createBox(0.85, 0.56, 1.9, winMat, false, false);
      win.position.set(w, 0.24, 0);
      car.add(win);
    }
    if (cIdx === 1) {
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), winMat);
      hl.position.set(3.95, -0.1, 0);
      const panto = createBox(0.9, 0.5, 0.7, steelMat);
      panto.position.set(-1.5, 1.3, 0);
      car.add(hl, panto);
    }
    trainGroup.add(car);
  });
  railRoot.add(trainGroup);

  // =========================================================================
  // DIAGONAL STATION HOUSE (with fluttering noren), CLOCK, BICYCLE & GARLAND
  // =========================================================================
  const tkPos = railPt(-10.8, -6.5);
  const stationHouse = buildJapaneseBuilding(group, {
    x: tkPos.x,
    y: Y_STATION,
    z: tkPos.z,
    yaw: -RAIL_ANGLE,
    w: 5.4,
    d: 3.4,
    h: 2.5,
    floors: 1,
    wallColor: '#eadcc3',
    woodColor: '#593b25',
    roofMat: mats.roofTileMat,
    woodPlankMat: mats.woodPlankMat,
    shojiMaterials,
    engawa: false,
    norenColor: '#2c4d75',
  });

  const awnPos = railPt(5.5, -5.8);
  const awning = new THREE.Group();
  awning.position.set(awnPos.x, Y_STATION, awnPos.z);
  awning.rotation.y = -RAIL_ANGLE;
  const sRoof = createBox(8.2, 0.22, 2.8, mats.roofTileMat);
  sRoof.position.y = 2.65;
  sRoof.rotation.x = 0.14;
  for (const sx of [-3.4, 0, 3.4]) {
    const post = createBox(0.2, 2.6, 0.2, timberMat);
    post.position.set(sx, 1.3, 0);
    awning.add(post);
  }
  awning.add(sRoof);
  group.add(awning);

  const clkPos = railPt(-5.5, -4.4);
  const clockPost = createCylinder(0.1, 0.12, 2.5, 8, timberMat);
  clockPost.position.set(clkPos.x, Y_STATION + 1.25, clkPos.z);
  const clockFace = new THREE.Group();
  clockFace.position.set(clkPos.x, Y_STATION + 2.55, clkPos.z);
  clockFace.rotation.y = -RAIL_ANGLE;
  const dialMat = createPixelToonMaterial({ color: '#faf6eb', emissive: '#ffdf9e', emissiveIntensity: 0.22 });
  shojiMaterials.push(dialMat);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.14, 12), dialMat);
  dial.rotation.x = Math.PI / 2;
  const clockMinHand = createBox(0.04, 0.24, 0.18, createPixelToonMaterial({ color: '#2b2433' }));
  clockMinHand.position.y = 0.08;
  const clockHourHand = createBox(0.045, 0.16, 0.19, createPixelToonMaterial({ color: '#c43e2d' }));
  clockHourHand.position.y = 0.05;
  clockFace.add(dial, clockMinHand, clockHourHand);
  group.add(clockPost, clockFace);

  const bikePos = railPt(10.2, -5.5);
  const bike = new THREE.Group();
  bike.position.set(bikePos.x, Y_STATION, bikePos.z);
  bike.rotation.set(0.16, -RAIL_ANGLE + 0.4, 0.12);
  const bikeMat = createPixelToonMaterial({ color: '#6cb4b8' });
  const tireMat = createPixelToonMaterial({ color: '#2b2c36' });
  for (const wx of [-0.45, 0.45]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.04, 6, 12), tireMat);
    wheel.position.set(wx, 0.28, 0);
    bike.add(wheel);
  }
  const frameBar = createBox(0.9, 0.07, 0.07, bikeMat);
  frameBar.position.y = 0.55;
  const stem = createBox(0.06, 0.52, 0.06, bikeMat);
  stem.position.set(0.36, 0.6, 0);
  const basket = createBox(0.26, 0.2, 0.28, mats.woodPlankMat);
  basket.position.set(0.46, 0.78, 0);
  bike.add(frameBar, stem, basket);
  group.add(bike);

  const gA = railPt(-9.0, -4.5);
  const gB = railPt(11.5, -4.5);
  const stationGarland = buildChochinGarland(group, {
    ax: gA.x,
    az: gA.z,
    aGroundY: Y_STATION,
    bx: gB.x,
    bz: gB.z,
    bGroundY: Y_STATION,
    ay: Y_STATION + 2.55,
    by: Y_STATION + 2.55,
    sag: 0.5,
    count: 9,
    chochinMat,
  });

  // Turning Wooden Waterwheel (Suisha) & Flume on Low Paddy Creek Rim (19.6, 0.9, 19.2)
  const wheelPivot = new THREE.Group();
  wheelPivot.position.set(19.6, Y_PADDY_LOW + 0.2, 19.2);
  wheelPivot.rotation.y = 0.45;
  for (const wz of [-0.28, 0.28]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.08, 6, 16), timberMat);
    rim.position.z = wz;
    wheelPivot.add(rim);
  }
  for (let p = 0; p < 8; p++) {
    const spoke = createBox(0.08, 3.1, 0.52, timberMat);
    spoke.rotation.z = (p / 8) * Math.PI * 2;
    wheelPivot.add(spoke);
  }
  const flume = createBox(2.2, 0.14, 0.34, createPixelToonMaterial({ color: '#6a8d52' }));
  flume.position.set(18.4, Y_PADDY_LOW + 1.55, 19.2);
  group.add(wheelPivot, flume);

  // Two Wind-Swaying Straw Scarecrows (Kakashi) + Kitsune Statues + Tea Parasol
  const scarecrows = [];
  [
    [-17.8, Y_SOUTH, 28.5, 0.4],
    [-21.8, Y_PADDY_HIGH, 9.8, -0.3],
  ].forEach(([kx, ky, kz, kyaw], i) => {
    const sc = new THREE.Group();
    sc.position.set(kx, ky, kz);
    sc.rotation.y = kyaw;
    const pole = createCylinder(0.05, 0.06, 1.9, 6, timberMat);
    pole.position.y = 0.95;
    const arms = createBox(1.25, 0.08, 0.08, timberMat);
    arms.position.y = 1.35;
    const coat = createBox(0.55, 0.75, 0.32, createPixelToonMaterial({ color: '#465d7a' }));
    coat.position.y = 1.15;
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.3, 8), createPixelToonMaterial({ color: '#c8a65a' }));
    hat.position.y = 1.75;
    sc.add(pole, arms, coat, hat);
    sc.userData = { baseYaw: kyaw, phase: i * 1.4 };
    group.add(sc);
    scarecrows.push(sc);
  });

  const stoneFoxMat = createPixelToonMaterial({ color: '#b4afa8' });
  const bibMat = createPixelToonMaterial({ color: '#d83829' });
  [
    [-24.4, Y_KITSUNE, -18.8, 0.75],
    [-20.4, Y_KITSUNE, -23.8, -0.45],
  ].forEach(([fx, fy, fz, fyaw]) => {
    const fg = new THREE.Group();
    fg.position.set(fx, fy, fz);
    fg.rotation.y = fyaw;
    const ped = createBox(0.8, 0.42, 0.8, mats.stoneMat);
    ped.position.y = 0.21;
    const fBody = createCylinder(0.2, 0.3, 0.75, 8, stoneFoxMat);
    fBody.position.y = 0.78;
    const bib = createCylinder(0.23, 0.25, 0.22, 8, bibMat);
    bib.position.y = 1.02;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), stoneFoxMat);
    head.position.set(0, 1.28, 0.05);
    const snout = createBox(0.14, 0.12, 0.24, stoneFoxMat);
    snout.position.set(0, 1.24, 0.22);
    for (const ex of [-0.12, 0.12]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.24, 4), stoneFoxMat);
      ear.position.set(ex, 1.52, 0);
      fg.add(ear);
    }
    fg.add(ped, fBody, bib, head, snout);
    group.add(fg);
  });

  const teaParasol = createCylinder(0.06, 0.06, 2.5, 6, timberMat);
  teaParasol.position.set(25.4, Y_OVERLOOK + 1.25, -9.6);
  const teaCanopy = new THREE.Mesh(new THREE.ConeGeometry(1.45, 0.55, 10), railMat);
  teaCanopy.position.set(25.4, Y_OVERLOOK + 2.55, -9.6);
  group.add(teaParasol, teaCanopy);

  // 14-Gate Sweeping Curved Inari Torii Arc climbing up onto Belfry Summit!
  const arcPts = [
    [-12.2, Y_KITSUNE_UP, -22.8], [-9.8, Y_KITSUNE_UP + 0.4, -22.3], [-7.2, Y_ARC_W, -21.7], [-4.8, Y_ARC_W + 0.25, -20.9],
    [-2.0, Y_ARC_M - 0.25, -19.7], [0.6, Y_ARC_M, -18.7], [4.6, Y_ARC_M + 0.2, -17.6], [7.2, Y_ARC_E - 0.25, -17.2],
    [10.2, Y_ARC_E, -16.9], [12.4, Y_ARC_E, -17.7], [11.2, Y_ARC_E + 0.45, -20.6], [10.6, Y_ARC_E + 0.85, -23.2],
    [10.1, Y_BELFRY - 0.35, -25.8], [9.6, Y_BELFRY, -28.0],
  ];
  for (let i = 0; i < arcPts.length; i++) {
    const [tx, ty, tz] = arcPts[i];
    const next = arcPts[Math.min(i + 1, arcPts.length - 1)];
    const prev = arcPts[Math.max(i - 1, 0)];
    const yaw = Math.atan2(next[0] - prev[0], next[2] - prev[2]);
    buildToriiGate(group, { x: tx, y: ty, z: tz, yaw, scale: 0.84, color: '#d93d2b' });
  }

  // Puzzle 1: Stepped Mirror Rice Basins + Weirs
  const paddyMeshes = [];
  const weirMeshes = [];
  const mirrorGoldMat = new THREE.MeshBasicMaterial({ color: '#ffd982', transparent: true, opacity: 0.0 });
  basinSpots.forEach((bs, i) => {
    const basinFrame = createCylinder(2.1, 2.15, 0.24, 16, timberMat);
    basinFrame.position.set(bs.x, bs.y + 0.05, bs.z);
    const pWater = new THREE.Mesh(
      new THREE.CylinderGeometry(1.9, 1.9, 0.14, 16),
      createPixelToonMaterial({ color: '#6cc9e8', emissive: '#ffbe7a', emissiveIntensity: 0.08 })
    );
    pWater.position.set(bs.x, bs.y + 0.14, bs.z);
    const cometSigil = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.85, 18), mirrorGoldMat);
    cometSigil.rotation.x = -Math.PI / 2;
    cometSigil.position.set(bs.x, bs.y + 0.24, bs.z);
    group.add(basinFrame, pWater, cometSigil);
    paddyMeshes.push({ pWater, baseY: bs.y });

    const ws = weirSpots[i];
    const weirPost = createBox(0.58, 0.95, 0.58, timberMat);
    weirPost.position.set(ws.x, ws.y + 0.45, ws.z);
    const weirGate = createBox(0.44, 0.55, 0.16, createPixelToonMaterial({ color: '#e6be6c' }));
    weirGate.position.set(ws.x, ws.y + 0.55, ws.z - 0.3);
    group.add(weirPost, weirGate);
    weirMeshes.push({ weirGate, baseY: ws.y });
  });

  // Puzzle 2: 3 Semaphore Signal Levers
  const signalMeshes = [];
  signalCoords.forEach((sc) => {
    const sg = new THREE.Group();
    sg.position.set(sc.x, Y_STATION, sc.z);
    sg.rotation.y = -RAIL_ANGLE;
    const pole = createCylinder(0.12, 0.15, 2.45, 8, steelMat);
    pole.position.y = 1.22;
    const arm = createBox(0.95, 0.18, 0.08, railMat);
    arm.position.set(0.42, 2.1, 0);
    const lampMat = new THREE.MeshBasicMaterial({ color: '#ff5d47' });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), lampMat);
    lamp.position.y = 2.55;
    sg.add(pole, arm, lamp);
    group.add(sg);
    signalMeshes.push({ lampMat, arm });
  });
  function flipSignal(i) {
    signalStates[i] = !signalStates[i];
    signalMeshes[i].lampMat.color.set(signalStates[i] ? '#6effb8' : '#ff5d47');
    signalMeshes[i].arm.rotation.z = signalStates[i] ? 0.72 : 0;
  }
  // The middle semaphore starts clear, so the interlock has to be reasoned through
  flipSignal(1);

  // Puzzle 3: 3 Inari Wind Chimes along Torii Arc (brush near them for gentle sway!)
  const chimeMeshes = [];
  chimeCoords.forEach((cc, i) => {
    const cg = new THREE.Group();
    cg.position.set(cc.x, cc.y, cc.z);
    const frame = createCylinder(0.1, 0.12, 2.3, 6, timberMat);
    frame.position.y = 1.15;
    const bellMat = createPixelToonMaterial({ color: '#c4d8e6', emissive: '#6effb8', emissiveIntensity: 0 });
    const bell = createCylinder(0.2, 0.26, 0.32, 10, bellMat);
    bell.position.y = 1.95;
    const ribbon = createBox(0.15, chimeHeights[i], 0.04, createPixelToonMaterial({ color: '#f25544' }));
    ribbon.position.y = 1.72 - chimeHeights[i] * 0.5;
    cg.add(frame, bell, ribbon);
    group.add(cg);
    chimeMeshes.push({ bellMat, ribbon, pos: cc, gust: 0 });
  });

  // 4 Scenic Resting Benches (matched cleanly to terrace elevations)
  const benches = [
    buildBench(group, { x: -8.6, y: Y_SOUTH, z: 30.8, yaw: 2.6, woodMat: timberMat, woodDarkMat: mats.darkWoodMat, cushionColor: '#d9573b' }),
    buildBench(group, { x: 2.4, y: Y_STATION, z: 2.2, yaw: -RAIL_ANGLE, woodMat: timberMat, woodDarkMat: mats.darkWoodMat, cushionColor: '#486c9e' }),
    buildBench(group, { x: 25.0, y: Y_OVERLOOK, z: -12.4, yaw: -1.8, woodMat: timberMat, woodDarkMat: mats.darkWoodMat, cushionColor: '#f2c350' }),
    buildBench(group, { x: 0.6, y: Y_BELFRY, z: -31.4, yaw: 0.45, woodMat: timberMat, woodDarkMat: mats.darkWoodMat, cushionColor: '#d9573b' }),
  ];

  // Rich Autumn & Sakura Countryside Forest (placed accurately atop new height tiers)
  [
    [-19.2, Y_SOUTH, 30.0, 'sakura', 1.2], [-10.0, Y_SOUTH, 35.4, 'momiji-gold', 1.1],
    [13.5, Y_PADDY_LOW, 27.2, 'momiji-gold', 1.15], [17.8, Y_PADDY_LOW, 22.0, 'sakura', 1.1],
    [-2.5, Y_PADDY_MID, 20.6, 'momiji-red', 1.1], [4.6, Y_PADDY_MID, 11.4, 'sakura', 1.05],
    [-21.2, Y_PADDY_HIGH, 14.0, 'momiji-red', 1.2], [-25.0, Y_PADDY_HIGH, 4.4, 'cedar', 1.12],
    [11.4, Y_STATION, 4.8, 'sakura', 1.05], [-27.6, Y_PADDY_HIGH, -2.5, 'momiji-gold', 1.15],
    [-25.4, Y_KITSUNE, -21.8, 'momiji-red', 1.22], [-19.4, Y_KITSUNE, -24.2, 'sakura', 1.12],
    [-12.6, Y_KITSUNE_UP, -25.4, 'cedar', 1.1], [-7.0, Y_ARC_W, -23.6, 'momiji-gold', 1.05],
    [2.6, Y_ARC_M, -14.8, 'sakura', 1.08], [13.5, Y_ARC_E, -14.0, 'momiji-red', 1.12],
    [27.4, Y_OVERLOOK, -7.8, 'sakura', 1.2], [26.8, Y_OVERLOOK, -14.2, 'momiji-gold', 1.18],
    [20.2, Y_OVERLOOK, -7.4, 'cedar', 1.1], [14.2, Y_BELFRY, -36.8, 'sakura', 1.25],
    [8.2, Y_BELFRY, -40.2, 'momiji-red', 1.25], [2.4, Y_BELFRY, -37.0, 'momiji-gold', 1.15],
    [-1.6, Y_BELFRY, -30.2, 'sakura', 1.1], [14.5, Y_BELFRY, -31.2, 'cedar', 1.12],
    [-16.2, Y_SOUTH, 25.0, 'momiji-gold', 1.08], [5.8, Y_PADDY_LOW, 23.6, 'sakura', 1.08],
    [-9.0, Y_PADDY_MID, 14.6, 'cedar', 1.08], [-16.6, Y_KITSUNE_UP, -21.8, 'momiji-red', 1.05],
    [22.4, Y_OVERLOOK, -15.2, 'momiji-gold', 1.1], [11.8, Y_BELFRY, -28.4, 'sakura', 1.05],
    [26.8, Y_OVERLOOK, -11.4, 'cedar', 1.15], [-16.8, Y_PADDY_HIGH, 6.2, 'momiji-gold', 1.1],
  ].forEach(([x, y, z, type, s], idx) => buildOrganicTree(group, { type, x, y, z, scale: s, idx, treeSet }));

  const boulderColliders = buildMossBoulders(
    group,
    [
      [-17.2, Y_SOUTH, 26.2, 0.68, 0.3], [12.5, Y_PADDY_LOW, 18.8, 0.72, 1.4],
      [-23.8, Y_PADDY_HIGH, -6.6, 0.8, 0.8], [-22.4, Y_KITSUNE, -17.6, 0.72, 2.1],
      [25.6, Y_OVERLOOK, -6.8, 0.75, 1.1], [12.5, Y_BELFRY, -37.5, 0.8, 0.4],
    ],
    mats.cliffMat,
    '#6d8f3c'
  );
  buildGroundFoliage(group, terrain, bounds, {
    count: 920,
    allowedSurfaces: ['grass'],
    grassColor: '#e8eea8',
    flowerColor: '#fff4cf',
    flowerRatio: 0.22,
    mapPlain: getRiceStalkTexture(),
    seed: 303,
  });

  // Living World Wildlife: Skimming Paddy Dragonflies + Reactive Perching Sparrows
  const wildlife = buildAmbientWildlife(group, {
    butterflies: [
      { x: 10.6, y: Y_PADDY_LOW, z: 23.8, color: '#9cf2ff', kind: 'dragonfly', r: 3.4 },
      { x: 14.2, y: Y_PADDY_LOW, z: 20.5, color: '#ffd86e', kind: 'dragonfly', r: 2.6 },
      { x: -4.2, y: Y_PADDY_MID, z: 15.8, color: '#a8f8ff', kind: 'dragonfly', r: 3.4 },
      { x: -1.8, y: Y_PADDY_MID, z: 14.2, color: '#ffcce0', kind: 'butterfly', r: 2.8 },
      { x: -18.8, y: Y_PADDY_HIGH, z: 10.4, color: '#b0f4ff', kind: 'dragonfly', r: 3.2 },
      { x: -12.0, y: Y_SOUTH, z: 30.2, color: '#ffe985', kind: 'butterfly', r: 3.0 },
      { x: 24.0, y: Y_OVERLOOK, z: -10.8, color: '#ffbfa8', kind: 'butterfly', r: 2.5 },
      { x: 16.4, y: 2.8, z: 10.2, color: '#8eeeff', kind: 'dragonfly', r: 2.4 },
    ],
    sparrows: [
      { x: -9.8, y: Y_SOUTH + 0.02, z: 29.8, yaw: 0.9 },
      { x: stE.x, y: Y_STATION + 0.02, z: stE.z + 1.8, yaw: -2.2 },
      { x: 25.4, y: Y_OVERLOOK + 0.02, z: -13.6, yaw: -1.4 },
      { x: 1.8, y: Y_BELFRY + 0.02, z: -30.2, yaw: 0.6 },
    ],
  });

  // 8 Gliding Hill Swallows
  const swallows = buildCirclingBirds(
    group,
    [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
      kind: 'swallow',
      cx: i % 2 === 0 ? -4 : 5,
      cz: -2 + (i - 3) * 4,
      y: 10.5 + (i % 4) * 1.4,
      rx: 16 + i * 1.6,
      rz: 14 + (i % 3) * 3,
      speed: 0.34 + i * 0.035,
      phase: i * 0.9,
    }))
  );

  // 6 Stone Lanterns
  const lanterns = [
    [-7.8, Y_SOUTH, 26.2],
    [13.4, Y_PADDY_LOW, 18.8],
    [-21.2, Y_PADDY_HIGH, -1.8],
    [-19.2, Y_KITSUNE, -18.8],
    [20.2, Y_OVERLOOK, -13.2],
    [2.8, Y_BELFRY, -30.2],
  ].map(([x, y, z]) => buildLanternProp(group, scene, sceneLights, x, y, z, false));
  terrain.addColliders({ circles: [...boulderColliders, ...lanterns.map((l) => l.collider)] });
  terrain.addColliders(collectPropColliders(group));

  const belfry = buildObelisksAndBell(group, scene, sceneLights, {
    x: BELFRY_BELL.x,
    y: Y_BELFRY,
    z: BELFRY_BELL.z,
    obelisks: [
      { x: 4.6, z: -32.8, color: '#ffbe7a' },
      { x: 12.6, z: -32.6, color: '#6effb8' },
      { x: 8.6, z: -31.2, color: '#8ad8ff' },
    ],
    roofMat: mats.roofTileMat,
    woodMat: timberMat,
    stoneMat: mats.stoneMat,
  });

  const petals = buildParticleField(group, 'petals', { minX: -38, maxX: 38, minY: 1.0, maxY: 16, minZ: -40, maxZ: 38 }, 140);
  const hintTimers = { mirror: 0, signal: 0, chime: 0 };

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
      else if (zone in hintTimers) hintTimers[zone] = 6.0;
    },
  };

  function checkUnseal() {
    if (!bellUnsealed && sealMirror && sealSignal && sealChime) {
      bellUnsealed = true;
      belfry.setBellUnsealed(true);
      audio.playSealAwaken?.();
      progressVersion++;
      onToast?.('The Station Bell is unsealed.');
    }
    onStateChange?.(puzzleManager.getStatusSnapshot());
  }

  const puzzleManager = {
    get progressVersion() { return progressVersion; },
    get chapterComplete() { return chapterComplete; },
    get bellUnsealed() { return bellUnsealed; },
    getStatusSnapshot: () => ({ seals: [sealMirror, sealSignal, sealChime], bellUnsealed, chapterComplete }),
    getPuzzleZoneForPos: (x, z) => {
      if (chapterComplete) return null;
      const reg = terrain.getRegionInfoAt(x, z).id;
      if (!sealMirror && (reg === 'paddies' || reg === 'south')) return 'mirror';
      if (!sealSignal && reg === 'station') return 'signal';
      if (!sealChime && (reg === 'ridge' || reg === 'kitsune' || reg === 'overlook')) return 'chime';
      return 'belfry';
    },
    getHintText: (zone) => {
      if (zone === 'mirror') return 'Water only flows downhill: each weir also fills the paddy below it. Level all three mirrors, then let Dusk shine on them.';
      if (zone === 'signal') return 'Each lever also throws the next semaphore down the line. Clear all three to emerald so the train may depart.';
      if (zone === 'chime') return 'Along the uphill Inari Torii arc, chime from longest ribbon to shortest.';
      return bellUnsealed ? 'Three seals shine atop the northeast ridge; ring the Station Bell.' : 'Awaken the Crescent Terraces, Signals, and Inari Chimes to free the bell.';
    },
    getHintTargetPos: () => {
      if (!sealMirror) return weirSpots[1];
      if (!sealSignal) {
        const si = signalStates.findIndex((s) => !s);
        return signalCoords[si >= 0 ? si : 1];
      }
      if (!sealChime) return chimeCoords[nextChimeIdx] ?? chimeCoords[0];
      return { x: BELFRY_BELL.x, z: BELFRY_BELL.z };
    },
  };

  const spots = [];
  weirSpots.forEach((ws, i) => {
    spots.push({
      id: `weir-${i}`,
      getPos: () => ws,
      radius: 2.5,
      getLabel: () => (sealMirror ? null : 'E · Adjust Weir'),
      trigger: () => {
        if (sealMirror) return;
        // Water cascades downhill: raising a terrace's weir also spills into the paddy below
        // (index 0 = low, 1 = mid, 2 = high)
        weirLevels[i] = (weirLevels[i] + 1) % 3;
        if (i > 0) weirLevels[i - 1] = (weirLevels[i - 1] + 1) % 3;
        progressVersion++;
        audio.playWaterGate?.();
        if (!sealMirror && curTimeId === 'dorada' && weirLevels[0] === 1 && weirLevels[1] === 1 && weirLevels[2] === 1) {
          sealMirror = true;
          belfry.launchSealOrb(new THREE.Vector3(basinSpots[i].x, bsY(i) + 1.4, basinSpots[i].z), 0);
          audio.playSealAwaken?.();
          onToast?.('Mirror Seal awakened.');
          checkUnseal();
        }
      },
    });
  });

  function bsY(i) {
    return basinSpots[i]?.y ?? Y_PADDY_MID;
  }

  signalCoords.forEach((sc, i) => {
    spots.push({
      id: `sig-${i}`,
      getPos: () => sc,
      radius: 2.5,
      getLabel: () => (sealSignal ? null : 'E · Switch Signal'),
      trigger: () => {
        if (sealSignal) return;
        // Interlocked block signals: each lever also throws the next semaphore down the line
        flipSignal(i);
        if (i + 1 < signalStates.length) flipSignal(i + 1);
        progressVersion++;
        audio.playRailSwitch?.();
        if (!sealSignal && signalStates.every(Boolean)) {
          sealSignal = true;
          targetTrainS = 46.0;
          centerBridgeGroup.visible = true;
          belfry.launchSealOrb(new THREE.Vector3(sc.x, Y_STATION + 1.5, sc.z), 1);
          audio.playSealAwaken?.();
          onToast?.('Signal Seal awakened.');
          checkUnseal();
        }
      },
    });
  });

  chimeCoords.forEach((cc, i) => {
    spots.push({
      id: `chime-${i}`,
      getPos: () => cc,
      radius: 2.5,
      getLabel: () => (sealChime || chimesDone[i] ? null : 'E · Ring Chime'),
      trigger: () => {
        audio.playFurinNote(i * 2);
        chimeMeshes[i].gust = 0.25;
        if (sealChime) return;
        if (i === nextChimeIdx) {
          chimesDone[i] = true;
          chimeMeshes[i].bellMat.emissiveIntensity = 0.8;
          nextChimeIdx++;
          progressVersion++;
          if (nextChimeIdx === 3) {
            sealChime = true;
            belfry.launchSealOrb(new THREE.Vector3(cc.x, cc.y + 1.4, cc.z), 2);
            audio.playSealAwaken?.();
            onToast?.('Wind Seal awakened.');
            checkUnseal();
          }
        } else {
          chimesDone.fill(false);
          chimeMeshes.forEach((cm) => (cm.bellMat.emissiveIntensity = 0));
          nextChimeIdx = 0;
        }
      },
    });
  });

  spots.push({
    id: 'station-bell',
    getPos: () => BELFRY_BELL,
    radius: 3.1,
    getLabel: () => 'E · Station Bell',
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

  const nightAtmo = buildNightAtmosphere(group, {
    fireflyBounds: { minX: -28, maxX: 28, minY: 0.6, maxY: 8.5, minZ: -38, maxZ: 34 },
    fireflyCount: 110,
    fireflyColor: '#d8ff82',
    lightColor: '#ffd480',
    kind: 'stone',
    pathLights: [
      { x: -9.5, y: terrain.getHeightAt(-9.5, 29.0), z: 29.0 },
      { x: 7.2, y: terrain.getHeightAt(7.2, 23.0), z: 23.0 },
      { x: -1.2, y: terrain.getHeightAt(-1.2, 15.2), z: 15.2 },
      { x: -17.8, y: terrain.getHeightAt(-17.8, 7.6), z: 7.6 },
      { x: -8.0, y: terrain.getHeightAt(-8.0, -2.5), z: -2.5 },
      { x: 7.5, y: terrain.getHeightAt(7.5, -0.5), z: -0.5 },
      { x: -20.5, y: terrain.getHeightAt(-20.5, -19.8), z: -19.8 },
      { x: 2.8, y: terrain.getHeightAt(2.8, -17.5), z: -17.5 },
      { x: 21.5, y: terrain.getHeightAt(21.5, -11.5), z: -11.5 },
    ],
  });

  return {
    terrain,
    worldBuilder,
    foliage: {
      setFireflyIntensity: (v) => nightAtmo.setIntensity(v),
      triggerPetalStorm: () => petals.triggerStorm(),
      update: (dt, elapsed) => {
        petals.update(dt, elapsed);
        nightAtmo.update(dt, elapsed);
      },
    },
    puzzleManager,
    interactions,
    spawnPoint: { x: -14.8, z: 32.8, yaw: 2.76 },
    catSpawnPoint: { x: -12.6, z: 32.2 },
    titleFocusPos: new THREE.Vector3(-2.0, 4.2, 4.0),
    biomeProfile: 'station',
    onTimeChanged(timeId) {
      curTimeId = timeId;
      if (!sealMirror && timeId === 'dorada' && weirLevels[0] === 1 && weirLevels[1] === 1 && weirLevels[2] === 1) {
        sealMirror = true;
        belfry.launchSealOrb(new THREE.Vector3(basinSpots[1].x, Y_PADDY_MID + 1.4, basinSpots[1].z), 0);
        audio.playSealAwaken?.();
        onToast?.('Mirror Seal awakened.');
        checkUnseal();
      }
    },
    update(dt, elapsed, focusPos) {
      updateClouds(clouds, dt, elapsed);
      updateCascades(plungeFoams, elapsed);
      updateBuildings([stationHouse], elapsed);
      updateChochins(stationGarland.lanterns, dt, elapsed, focusPos);
      wildlife.update(dt, elapsed, focusPos);
      belfry.update(dt, elapsed);
      swallows.update(elapsed);

      wheelPivot.rotation.z -= dt * 0.65;
      clockMinHand.rotation.z = -elapsed * 0.4;
      clockHourHand.rotation.z = -elapsed * 0.04;

      scarecrows.forEach((sc) => {
        sc.rotation.z = Math.sin(elapsed * 1.4 + sc.userData.phase) * 0.045;
      });

      trainS += (targetTrainS - trainS) * (1 - Math.exp(-dt * 0.85));
      trainGroup.position.x = trainS;

      const flashOn = !sealSignal && Math.sin(elapsed * 6.0) > 0;
      fLampMatA.color.set(!sealSignal ? (flashOn ? '#ff3838' : '#452222') : '#2a2e38');
      fLampMatB.color.set(!sealSignal ? (flashOn ? '#452222' : '#ff3838') : '#2a2e38');

      const targetGateRot = sealSignal ? 1.43 : 0.04;
      barrierPivot.rotation.z += (targetGateRot - barrierPivot.rotation.z) * (1 - Math.exp(-dt * 6.0));

      const isDusk = curTimeId === 'dorada';
      const allEqual = weirLevels[0] === 1 && weirLevels[1] === 1 && weirLevels[2] === 1;
      mirrorGoldMat.opacity = isDusk && allEqual ? 0.92 : isDusk ? 0.35 : 0.05;
      paddyMeshes.forEach((pm, i) => {
        const tgtY = pm.baseY + 0.04 + weirLevels[i] * 0.14;
        pm.pWater.position.y += (tgtY - pm.pWater.position.y) * (1 - Math.exp(-dt * 8));
        weirMeshes[i].weirGate.position.y = weirMeshes[i].baseY + 0.38 + weirLevels[i] * 0.18;
      });

      chimeMeshes.forEach((cm, i) => {
        if (focusPos && Math.hypot(focusPos.x - cm.pos.x, focusPos.z - cm.pos.z) < 1.8) {
          cm.gust = Math.max(cm.gust, 0.22);
        }
        cm.gust *= Math.exp(-dt * 2.0);
        cm.ribbon.rotation.z = Math.sin(elapsed * 2.5 + i * 1.1) * (0.12 + cm.gust);
      });
    },
    dispose() {
      belfry.dispose();
      sdfTex.dispose();
      disposeObject3D(group, scene, sceneLights);
    },
  };
}

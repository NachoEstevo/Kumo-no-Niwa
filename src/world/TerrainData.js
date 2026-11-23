import * as THREE from 'three';

export const WORLD_BOUNDS = {
  minX: -46,
  maxX: 36,
  minZ: -52,
  maxZ: 46,
};

export const POND_WATER_Y = -0.35;
export const POND_BED_Y = -1.35;
export const MIRROR_WATER_Y = 5.36;
export const MIRROR_BED_Y = 5.05;

export const SPAWN_POINT = { x: 0.0, z: 32.0, yaw: Math.PI };
export const CAT_SPAWN_POINT = { x: -1.6, z: 32.6 };

// Puzzle coordinates exported as single source of truth
export const ZEN_GARDEN_BOUNDS = { minX: -35.2, maxX: -22.4, minZ: 10.4, maxZ: 17.6 };
export const ZEN_FIXED_ROCKS = [
  { x: -32.2, z: 13.6, r: 0.85 },
  { x: -27.8, z: 15.1, r: 0.72 },
  { x: -24.8, z: 12.4, r: 0.68 },
];
export const PUSH_STONE_INITIAL = { x: -31.2, z: 15.8 };
export const PUSH_STONE_TARGET = { x: -25.8, z: 14.2 };

export const BAMBOO_PUZZLE_CENTER = { x: -30.2, z: -15.2 };
// The four Jizō are roped together clockwise (N → E → S → W → N): turning one also
// turns the statue its rope leads to. The start state is scrambled from the solved
// ring (presses N×1, S×2, W×1 undo it), so it is always solvable.
export const PUZZLE_JIZO_SPOTS = [
  { id: 'north', x: -30.2, z: -18.8, targetYaw: 0, initialSteps: 2, link: 3 },           // faces +Z (south -> center)
  { id: 'south', x: -30.2, z: -11.6, targetYaw: Math.PI, initialSteps: 2, link: 2 },     // faces -Z (north -> center)
  { id: 'west', x: -33.8, z: -15.2, targetYaw: Math.PI * 0.5, initialSteps: 1, link: 0 }, // faces +X (east -> center)
  { id: 'east', x: -26.6, z: -15.2, targetYaw: -Math.PI * 0.5, initialSteps: 3, link: 1 } // faces -X (west -> center)
];

export const BRAZIER_SPOTS = [
  { id: 'sun', timeId: 'tarde', label: 'Sun Brazier', x: -9.8, z: -28.6 },
  { id: 'amber', timeId: 'dorada', label: 'Dusk Brazier', x: 20.8, z: -10.4 },
  { id: 'moon', timeId: 'crepusculo', label: 'Moon Brazier', x: 14.2, z: -28.5 },
];

export const MOON_ISLET = { x: 14.2, z: -28.5, r: 2.15 };
export const MOON_BRIDGE_STONES = [
  { x: 7.4, z: -28.5, r: 1.28 },
  { x: 9.1, z: -28.5, r: 1.28 },
  { x: 10.8, z: -28.5, r: 1.28 },
  { x: 12.4, z: -28.5, r: 1.28 },
];

let moonBridgeActive = false;
const pushStonePos = { x: PUSH_STONE_INITIAL.x, z: PUSH_STONE_INITIAL.z, half: 0.55 };

export function setMoonBridgeActive(active) {
  moonBridgeActive = Boolean(active);
}

export function isMoonBridgeActive() {
  return moonBridgeActive;
}

export function setPushStonePosition(x, z) {
  pushStonePos.x = x;
  pushStonePos.z = z;
}

export function getPushStonePosition() {
  return { x: pushStonePos.x, z: pushStonePos.z };
}

export function canPushBlockTo(tx, tz, half = 0.55) {
  if (
    tx < ZEN_GARDEN_BOUNDS.minX + 0.9 ||
    tx > ZEN_GARDEN_BOUNDS.maxX - 0.9 ||
    tz < ZEN_GARDEN_BOUNDS.minZ + 0.9 ||
    tz > ZEN_GARDEN_BOUNDS.maxZ - 0.9
  ) {
    return false;
  }
  for (let i = 0; i < ZEN_FIXED_ROCKS.length; i++) {
    const rk = ZEN_FIXED_ROCKS[i];
    if (Math.hypot(tx - rk.x, tz - rk.z) < rk.r + half + 0.2) {
      return false;
    }
  }
  return true;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function distSq(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

export function roundedBoxSDF(x, z, cx, cz, hx, hz, r = 1.0) {
  const dx = Math.abs(x - cx) - (hx - r);
  const dz = Math.abs(z - cz) - (hz - r);
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0) - r;
}

function segmentDistance(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const lenSq = vx * vx + vz * vz;
  const t = lenSq > 1e-6 ? clamp((wx * vx + wz * vz) / lenSq, 0, 1) : 0;
  const cx = ax + vx * t;
  const cz = az + vz * t;
  return { dist: Math.hypot(px - cx, pz - cz), t };
}

export const BRIDGES = [
  {
    id: 'arch-west',
    ax: -9.5,
    az: 24.8,
    bx: -18.8,
    bz: 14.2,
    halfWidth: 1.65,
    startY: 0.0,
    endY: 0.5,
    archLift: 1.55,
    railingStyle: 'vermilion',
  },
  {
    id: 'yatsu-1',
    ax: 7.8,
    az: 24.4,
    bx: 12.4,
    bz: 17.6,
    halfWidth: 1.32,
    startY: 0.0,
    endY: 0.12,
    archLift: 0.04,
    railingStyle: 'low-wood',
  },
  {
    id: 'yatsu-2',
    ax: 12.4,
    az: 17.6,
    bx: 10.6,
    bz: 10.2,
    halfWidth: 1.32,
    startY: 0.12,
    endY: 0.12,
    archLift: 0.0,
    railingStyle: 'low-wood',
  },
  {
    id: 'yatsu-3',
    ax: 10.6,
    az: 10.2,
    bx: 11.4,
    bz: 4.2,
    halfWidth: 1.32,
    startY: 0.12,
    endY: 0.25,
    archLift: 0.04,
    railingStyle: 'low-wood',
  },
  {
    id: 'tea-plaza',
    ax: -16.2,
    az: 3.8,
    bx: -8.4,
    bz: 3.2,
    halfWidth: 1.55,
    startY: 0.5,
    endY: 0.25,
    archLift: 0.35,
    railingStyle: 'vermilion',
  },
  {
    id: 'bamboo-ravine',
    ax: -26.0,
    az: -5.0,
    bx: -26.0,
    bz: -9.2,
    halfWidth: 1.65,
    startY: 0.5,
    endY: 0.65,
    archLift: 0.25,
    railingStyle: 'bamboo',
  },
  {
    id: 'waterfall-view',
    ax: 3.4,
    az: -11.3,
    bx: 19.5,
    bz: -11.3,
    halfWidth: 1.48,
    startY: 2.9,
    endY: 2.9,
    archLift: 0.22,
    railingStyle: 'vermilion',
  },
];

export const STEPPING_STONES = [
  { x: 13.9, z: 20.4, r: 1.5, visualR: 1.05, y: -0.08 },
  { x: 15.6, z: 18.4, r: 1.5, visualR: 1.02, y: -0.1 },
  { x: 17.2, z: 16.3, r: 1.5, visualR: 1.08, y: -0.1 },
  { x: 18.4, z: 14.0, r: 1.5, visualR: 1.02, y: -0.1 },
  { x: 19.0, z: 11.6, r: 1.5, visualR: 1.06, y: -0.1 },
  { x: 19.0, z: 9.1, r: 1.5, visualR: 1.04, y: -0.1 },
  { x: 18.6, z: 6.7, r: 1.5, visualR: 1.08, y: -0.02 },
  { x: 18.6, z: 4.5, r: 1.5, visualR: 1.08, y: 0.2 },
];

export const LANTERN_SPOTS = [
  { x: -5.6, z: 26.8 },
  { x: 6.2, z: 26.5 },
  { x: -20.2, z: 9.2 },
  { x: -23.6, z: -3.2 },
  { x: -35.0, z: -12.4 },
  { x: -6.4, z: 0.8 },
  { x: 6.8, z: 0.8 },
  { x: -7.5, z: -10.8 },
  { x: 20.6, z: -13.4 },
  { x: -4.2, z: -34.0 },
];

export const TREE_SPECS = [
  { x: -12.8, z: -31.2, type: 'sakura', scale: 1.68, ancient: true, r: 1.35 },
  { x: -19.2, z: -26.5, type: 'sakura', scale: 1.18, r: 0.85 },
  { x: -17.5, z: -35.8, type: 'sakura', scale: 1.25, r: 0.9 },
  { x: 8.5, z: -36.8, type: 'sakura', scale: 1.18, r: 0.85 },
  { x: 18.8, z: -35.2, type: 'sakura', scale: 1.15, r: 0.82 },
  { x: 4.8, z: -24.5, type: 'sakura', scale: 1.05, r: 0.78 },
  { x: -6.8, z: -42.0, type: 'sakura', scale: 1.15, r: 0.82 },
  { x: 7.2, z: -41.5, type: 'momiji-gold', scale: 1.12, r: 0.8 },
  { x: -5.4, z: -2.4, type: 'momiji-red', scale: 1.18, r: 0.85 },
  { x: 5.5, z: -3.2, type: 'momiji-orange', scale: 1.2, r: 0.85 },
  { x: -5.8, z: -8.2, type: 'momiji-gold', scale: 1.1, r: 0.8 },
  { x: 5.4, z: -8.6, type: 'momiji-red', scale: 1.16, r: 0.82 },
  { x: -5.5, z: -15.8, type: 'momiji-orange', scale: 1.15, r: 0.82 },
  { x: 5.6, z: -16.8, type: 'momiji-red', scale: 1.2, r: 0.85 },
  { x: -6.4, z: -22.2, type: 'momiji-gold', scale: 1.08, r: 0.78 },
  { x: -17.2, z: -16.0, type: 'sakura', scale: 1.12, r: 0.82 },
  { x: -8.5, z: -16.4, type: 'sakura', scale: 1.02, r: 0.75 },
  { x: 22.8, z: -16.8, type: 'momiji-red', scale: 1.18, r: 0.85 },
  { x: 22.6, z: -6.5, type: 'momiji-gold', scale: 1.08, r: 0.78 },
  { x: 21.8, z: 2.5, type: 'sakura', scale: 1.05, r: 0.78 },
  { x: -35.8, z: 8.6, type: 'sakura', scale: 1.15, r: 0.85 },
  { x: -34.2, z: 16.5, type: 'momiji-orange', scale: 1.05, r: 0.78 },
  { x: -17.6, z: 18.2, type: 'sakura', scale: 0.98, r: 0.72 },
  { x: -20.5, z: -3.5, type: 'momiji-gold', scale: 0.98, r: 0.72 },
  { x: -10.8, z: 34.5, type: 'sakura', scale: 1.18, r: 0.85 },
  { x: 10.6, z: 33.8, type: 'momiji-red', scale: 1.15, r: 0.82 },
  { x: -11.2, z: 27.2, type: 'sakura', scale: 1.0, r: 0.75 },
  { x: 10.8, z: 26.8, type: 'momiji-gold', scale: 0.98, r: 0.72 },
  { x: -37.2, z: -12.5, type: 'momiji-red', scale: 1.08, r: 0.78 },
  { x: -33.5, z: -22.2, type: 'sakura', scale: 1.1, r: 0.8 },
];

export const TORII_STAIR_Z = [-2.4, -5.0, -7.6, -13.4, -16.0, -18.6, -20.8];

// Mossy boulders [x, z, size]; drawn by FoliageAndAtmosphere and solid here
export const MOSS_BOULDERS = [
  [12.2, -21.2, 1.45], [18.8, -20.8, 1.5],
  [11.8, -15.5, 1.35], [18.9, -15.0, 1.42],
  [11.5, -9.2, 1.25], [18.5, -8.5, 1.2],
  [12.0, -3.5, 1.05], [18.6, -2.5, 1.0],
  [-4.2, -3.5, 0.95], [4.3, -4.5, 1.05],
  [-4.6, -14.2, 1.1], [4.5, -15.0, 1.12],
  [-12.2, 30.2, 1.1], [12.4, 30.5, 1.15],
  [-36.5, 4.2, 1.05], [-19.6, 17.4, 0.92],
  [21.2, -25.8, 1.18], [20.8, -32.2, 1.08],
  [-20.8, -32.5, 1.15], [5.8, -31.8, 0.95],
];

export const CIRCLE_COLLIDERS = [
  ...ZEN_FIXED_ROCKS,
  ...MOSS_BOULDERS.map(([x, z, s]) => ({ x, z, r: s * 1.05 })),
  { x: -18.6, z: -1.2, r: 0.75 },
  ...TREE_SPECS.map((t) => ({ x: t.x, z: t.z, r: t.r })),
  ...LANTERN_SPOTS.map((l) => ({ x: l.x, z: l.z, r: 0.45 })),
  // Bamboo puzzle center spirit lantern & 4 rotatable Jizo statues
  { x: BAMBOO_PUZZLE_CENTER.x, z: BAMBOO_PUZZLE_CENTER.z, r: 0.56 },
  ...PUZZLE_JIZO_SPOTS.map((j) => ({ x: j.x, z: j.z, r: 0.56 })),
  // 3 Time-of-day Braziers
  ...BRAZIER_SPOTS.map((b) => ({ x: b.x, z: b.z, r: 0.52 })),
  // Torii gate pillars on Grand Staircase
  ...TORII_STAIR_Z.flatMap((z) => [
    { x: -3.02, z, r: 0.36 },
    { x: 3.02, z, r: 0.36 },
  ]),
  // Belfry 4 corner posts & central bell
  { x: -2.2, z: -38.6, r: 0.36 },
  { x: 2.2, z: -38.6, r: 0.36 },
  { x: -2.2, z: -42.4, r: 0.36 },
  { x: 2.2, z: -42.4, r: 0.36 },
  { x: 0.0, z: -40.5, r: 0.82 },
  // 3 Seal Obelisks on Belfry Plaza (symmetric front-visible arc)
  { x: -4.0, z: -37.6, r: 0.52 },
  { x: 4.0, z: -37.6, r: 0.52 },
  { x: 0.0, z: -37.1, r: 0.48 },
];

export const BOX_COLLIDERS = [
  { minX: -34.2, maxX: -25.4, minZ: -1.4, maxZ: 6.2 },
  { minX: -13.6, maxX: -9.4, minZ: -16.0, maxZ: -14.4 },
  { minX: -2.6, maxX: -0.4, minZ: 38.6, maxZ: 39.4 },
  { minX: -15.3, maxX: -13.1, minZ: -10.5, maxZ: -9.7 },
  { minX: -36.6, maxX: -34.4, minZ: -20.0, maxZ: -19.2 },
];

function inSouthIsland(x, z) {
  if (roundedBoxSDF(x, z, 0.5, 31.5, 13.5, 7.2, 3.6) <= 0) return true;
  // South pier stops short of its end railing (z 40.1)
  if (x >= -4.2 && x <= 4.2 && z >= 37.3 && z <= 39.6) return true;
  if (x >= 9.4 && x <= 13.9 && z >= 21.0 && z <= 25.2) return true;
  if (distSq(x, z, -9.5, 24.8) <= 2.6 * 2.6) return true;
  if (distSq(x, z, 7.8, 24.4) <= 2.2 * 2.2) return true;
  return false;
}

function inTeaHouseIsland(x, z) {
  if (roundedBoxSDF(x, z, -27.2, 6.8, 11.2, 12.2, 3.8) <= 0) return true;
  if (distSq(x, z, -18.8, 14.2) <= 2.3 * 2.3) return true;
  if (distSq(x, z, -26.0, -5.0) <= 2.2 * 2.2) return true;
  return false;
}

function inBambooForest(x, z) {
  if (roundedBoxSDF(x, z, -29.0, -15.5, 10.5, 8.8, 3.2) <= 0) return true;
  if (x >= -20.0 && x <= -17.5 && z >= -16.8 && z <= -10.0) return true;
  return false;
}

function inCentralPlaza(x, z) {
  return roundedBoxSDF(x, z, 2.0, 2.8, 11.0, 4.2, 2.0) <= 0;
}

function inToriiStairs(x, z) {
  // Between the stone side walls (inner faces at x = ±2.6)
  if (x >= -2.25 && x <= 2.25 && z >= -21.5 && z <= -1.0) return true;
  if (x >= -4.4 && x <= 4.4 && z >= -12.6 && z <= -10.0) return true;
  return false;
}

function inEmaTerrace(x, z) {
  return roundedBoxSDF(x, z, -11.4, -13.0, 8.2, 4.5, 1.8) <= 0;
}

function inEastWaterfallTrail(x, z) {
  return roundedBoxSDF(x, z, 21.5, -4.2, 3.2, 9.6, 1.4) <= 0;
}

function inSakuraSummit(x, z) {
  if (roundedBoxSDF(x, z, 0.0, -30.5, 23.5, 9.8, 4.2) <= 0) return true;
  if (roundedBoxSDF(x, z, 0.0, -41.5, 5.6, 5.2, 1.4) <= 0) return true;
  return false;
}

function evalBridges(x, z) {
  if (distSq(x, z, 12.4, 17.6) <= 1.42 * 1.42) return 0.12;
  if (distSq(x, z, 10.6, 10.2) <= 1.42 * 1.42) return 0.12;

  for (let i = 0; i < BRIDGES.length; i++) {
    const br = BRIDGES[i];
    const { dist, t } = segmentDistance(x, z, br.ax, br.az, br.bx, br.bz);
    if (dist <= br.halfWidth) {
      return br.startY + (br.endY - br.startY) * t + br.archLift * 4 * t * (1 - t);
    }
  }
  return null;
}

function evalSteppingStone(x, z) {
  for (let i = 0; i < STEPPING_STONES.length; i++) {
    const s = STEPPING_STONES[i];
    if (distSq(x, z, s.x, s.z) <= s.r * s.r) return s;
  }
  return null;
}

function onMoonBridgeOrIslet(x, z) {
  if (distSq(x, z, MOON_ISLET.x, MOON_ISLET.z) <= MOON_ISLET.r * MOON_ISLET.r) {
    return true;
  }
  if (moonBridgeActive) {
    for (let i = 0; i < MOON_BRIDGE_STONES.length; i++) {
      const m = MOON_BRIDGE_STONES[i];
      if (distSq(x, z, m.x, m.z) <= m.r * m.r) return true;
    }
  }
  return false;
}

export function isMirrorPoolWater(x, z) {
  return roundedBoxSDF(x, z, 13.8, -28.5, 7.2, 5.6, 2.5) <= 0;
}

export function isLowerPondWater(x, z) {
  if (
    inSouthIsland(x, z) ||
    inTeaHouseIsland(x, z) ||
    inBambooForest(x, z) ||
    inCentralPlaza(x, z) ||
    inToriiStairs(x, z) ||
    inEmaTerrace(x, z) ||
    inEastWaterfallTrail(x, z) ||
    inSakuraSummit(x, z)
  ) {
    return false;
  }

  const mainLobe = ((x - 0.5) * (x - 0.5)) / (19.5 * 19.5) + ((z - 14.5) * (z - 14.5)) / (10.8 * 10.8);
  if (mainLobe <= 1.0) return true;

  const westCove = ((x + 14.0) * (x + 14.0)) / (9.2 * 9.2) + ((z - 18.0) * (z - 18.0)) / (7.5 * 7.5);
  if (westCove <= 1.0) return true;

  const eastBay = ((x - 15.8) * (x - 15.8)) / (8.8 * 8.8) + ((z - 12.0) * (z - 12.0)) / (9.2 * 9.2);
  if (eastBay <= 1.0) return true;

  if (distSq(x, z, 15.6, -8.5) <= 4.1 * 4.1) return true;
  if (z >= -9.5 && z <= 7.0) {
    const brookCenter = 15.6 + Math.sin((z + 5.0) * 0.36) * 1.1;
    if (Math.abs(x - brookCenter) <= 2.35) return true;
  }

  return false;
}

export function isWater(x, z) {
  return isLowerPondWater(x, z) || isMirrorPoolWater(x, z);
}

export function isWalkable(x, z) {
  if (evalBridges(x, z) !== null) return true;
  if (evalSteppingStone(x, z) !== null) return true;

  if (inSouthIsland(x, z)) return true;
  if (inTeaHouseIsland(x, z)) return true;
  if (inBambooForest(x, z)) return true;
  if (inCentralPlaza(x, z)) return true;
  if (inToriiStairs(x, z)) return true;
  if (inEmaTerrace(x, z)) return true;
  if (inEastWaterfallTrail(x, z)) return true;
  if (inSakuraSummit(x, z)) {
    if (x >= 14.0 && x <= 19.0 && z >= -23.5 && z <= -20.5) return false;
    if (isMirrorPoolWater(x, z)) {
      return onMoonBridgeOrIslet(x, z);
    }
    return true;
  }
  return false;
}

export function getHeightAt(x, z) {
  const brY = evalBridges(x, z);
  if (brY !== null) return brY;

  const stone = evalSteppingStone(x, z);
  if (stone !== null) return stone.y;

  if (x >= -2.9 && x <= 2.9 && z >= -37.0 && z <= -33.0) {
    const t = clamp((-33.0 - z) / 4.0, 0, 1);
    return 5.4 + t * 1.6;
  }
  if (x >= -5.8 && x <= 5.8 && z >= -46.8 && z < -37.0) {
    return 7.0;
  }

  if (inSakuraSummit(x, z)) {
    if (isMirrorPoolWater(x, z)) {
      return onMoonBridgeOrIslet(x, z) ? 5.42 : MIRROR_BED_Y;
    }
    return 5.4;
  }

  if (inToriiStairs(x, z)) {
    if (z >= -10.0) {
      const t = clamp((-1.2 - z) / 8.8, 0, 1);
      return 0.25 + t * 2.65;
    }
    if (z >= -12.6) {
      return 2.9;
    }
    const t = clamp((-12.6 - z) / 8.1, 0, 1);
    return 2.9 + t * 2.5;
  }

  if (inEmaTerrace(x, z)) return 2.9;

  if (inEastWaterfallTrail(x, z)) {
    if (z <= -9.5) return 2.9;
    if (z >= 1.5) return 0.25;
    const t = clamp((1.5 - z) / 11.0, 0, 1);
    return 0.25 + t * 2.65;
  }

  if (inBambooForest(x, z)) {
    if (x >= -24.6) {
      const t = clamp((x - -24.6) / 5.0, 0, 1);
      return 0.65 + t * 2.25;
    }
    return 0.65;
  }

  if (inCentralPlaza(x, z)) return 0.25;

  if (inTeaHouseIsland(x, z)) {
    if (
      (x >= -25.4 && x <= -22.6 && z >= -0.7 && z <= 5.8) ||
      (x >= -33.3 && x <= -22.6 && z >= 6.1 && z <= 8.6)
    ) {
      return 0.72;
    }
    return 0.5;
  }

  if (inSouthIsland(x, z)) {
    if (x >= -4.2 && x <= 4.2 && z >= 37.3 && z <= 40.3) return 0.14;
    if (x >= 9.4 && x <= 13.9 && z >= 21.0 && z <= 25.2) return 0.1;
    return 0.0;
  }

  return POND_BED_Y;
}

export function getSurfaceAt(x, z) {
  if (evalBridges(x, z) !== null) return 'wood';
  if (evalSteppingStone(x, z) !== null) return 'stone';

  if (inSakuraSummit(x, z)) {
    if (isMirrorPoolWater(x, z)) return onMoonBridgeOrIslet(x, z) ? 'stone' : 'shallow_water';
    if (x >= -5.8 && x <= 5.8 && z <= -33.0) return 'stone';
    if (x >= -3.2 && x <= 3.2 && z >= -33.0 && z <= -21.5) return 'stone';
    if (distSq(x, z, -12.8, -31.2) <= 4.2 * 4.2) return 'stone';
    return 'grass';
  }

  if (inToriiStairs(x, z)) return 'stone';

  if (inEmaTerrace(x, z)) {
    if (x >= -15.0 && x <= -3.2 && z >= -15.5 && z <= -10.2) return 'stone';
    return 'grass';
  }

  if (inEastWaterfallTrail(x, z)) return 'stone';

  if (inBambooForest(x, z)) {
    if (distSq(x, z, BAMBOO_PUZZLE_CENTER.x, BAMBOO_PUZZLE_CENTER.z) <= 4.6 * 4.6) return 'stone';
    if (x >= -26.5 && z >= -16.2 && z <= -9.8) return 'stone';
    return 'grass';
  }

  if (inCentralPlaza(x, z)) {
    if (x >= -6.5 && x <= 7.0 && z >= -1.2 && z <= 5.0) return 'stone';
    return 'grass';
  }

  if (inTeaHouseIsland(x, z)) {
    if (
      (x >= -25.4 && x <= -22.6 && z >= -0.7 && z <= 5.8) ||
      (x >= -33.3 && x <= -22.6 && z >= 6.1 && z <= 8.6)
    ) {
      return 'wood';
    }
    if (x >= -35.4 && x <= -22.2 && z >= 10.2 && z <= 17.8) return 'gravel';
    return 'grass';
  }

  if (inSouthIsland(x, z)) {
    if (x >= -4.2 && x <= 4.2 && z >= 37.3 && z <= 40.3) return 'wood';
    if (x >= 9.4 && x <= 13.9 && z >= 21.0 && z <= 25.2) return 'wood';
    if (x >= -3.5 && x <= 3.5 && z >= 26.5 && z <= 37.3) return 'stone';
    return 'grass';
  }

  return 'grass';
}

export function getRegionInfoAt(x, z) {
  if (z <= -36.5) return { id: 'belfry', jp: '鐘楼の頂', en: 'Cloud Belfry' };
  if (inSakuraSummit(x, z)) return { id: 'summit', jp: '雲上の桜', en: 'Sakura Summit' };
  if (inEmaTerrace(x, z)) return { id: 'ema', jp: '絵馬のテラス', en: 'Ema Terrace' };
  if (inBambooForest(x, z)) return { id: 'bamboo', jp: '竹林の小径', en: 'Bamboo Grove' };
  if (inEastWaterfallTrail(x, z) || (x > 4.0 && z > -14 && z < -8)) {
    return { id: 'waterfall', jp: '双龍の滝', en: 'Waterfall Trail' };
  }
  if (inToriiStairs(x, z)) return { id: 'torii', jp: '紅葉千本鳥居', en: 'Autumn Steps' };
  if (inTeaHouseIsland(x, z)) return { id: 'teahouse', jp: '茶室と枯山水', en: 'Tea Pavilion' };
  if (inCentralPlaza(x, z)) return { id: 'plaza', jp: '参道広場', en: 'Torii Courtyard' };
  if (z > 4.5 && z < 25.0) return { id: 'lake', jp: '鯉の湖', en: 'Koi Lake' };
  return { id: 'south', jp: '南の雲見台', en: 'South Overlook' };
}

function hitsCollider(x, z, radius) {
  for (let i = 0; i < CIRCLE_COLLIDERS.length; i++) {
    const c = CIRCLE_COLLIDERS[i];
    const minDist = c.r + radius;
    if (distSq(x, z, c.x, c.z) < minDist * minDist) return true;
  }
  for (let i = 0; i < BOX_COLLIDERS.length; i++) {
    const b = BOX_COLLIDERS[i];
    const cx = clamp(x, b.minX, b.maxX);
    const cz = clamp(z, b.minZ, b.maxZ);
    if (distSq(x, z, cx, cz) < radius * radius) return true;
  }
  // Dynamic Pushable Iwakura Zen Stone AABB
  const ps = pushStonePos;
  const pcx = clamp(x, ps.x - ps.half, ps.x + ps.half);
  const pcz = clamp(z, ps.z - ps.half, ps.z + ps.half);
  if (distSq(x, z, pcx, pcz) < radius * radius) return true;

  return false;
}

export function canStandAt(x, z, radius = 0.34) {
  if (!isWalkable(x, z)) return false;
  if (hitsCollider(x, z, radius)) return false;
  return true;
}

export function resolveMovement(ox, oz, nx, nz, radius = 0.34) {
  const oldY = getHeightAt(ox, oz);
  const dx = nx - ox;
  const dz = nz - oz;
  const stepLen = Math.hypot(dx, dz);

  const tryPos = (tx, tz) => {
    if (!canStandAt(tx, tz, radius)) return false;
    const ny = getHeightAt(tx, tz);
    if (Math.abs(ny - oldY) > 0.92) return false;
    return true;
  };

  if (tryPos(nx, nz)) return { x: nx, z: nz, y: getHeightAt(nx, nz) };

  if (stepLen > 1e-5) {
    const baseAngle = Math.atan2(dz, dx);
    const slideAngles = [0.42, -0.42, 0.85, -0.85, 1.25, -1.25, 1.48, -1.48];
    for (let i = 0; i < slideAngles.length; i++) {
      const a = baseAngle + slideAngles[i];
      const scale = Math.max(0.25, Math.cos(slideAngles[i]));
      const tx = ox + Math.cos(a) * stepLen * scale;
      const tz = oz + Math.sin(a) * stepLen * scale;
      if (tryPos(tx, tz)) return { x: tx, z: tz, y: getHeightAt(tx, tz) };
    }
  }

  if (tryPos(nx, oz)) return { x: nx, z: oz, y: getHeightAt(nx, oz) };
  if (tryPos(ox, nz)) return { x: ox, z: nz, y: getHeightAt(ox, nz) };

  let rx = ox;
  let rz = oz;
  for (let i = 0; i < CIRCLE_COLLIDERS.length; i++) {
    const c = CIRCLE_COLLIDERS[i];
    const pdx = rx - c.x;
    const pdz = rz - c.z;
    const d = Math.hypot(pdx, pdz);
    const minDist = c.r + radius;
    if (d < minDist && d > 1e-4) {
      const px = c.x + (pdx / d) * minDist;
      const pz = c.z + (pdz / d) * minDist;
      if (isWalkable(px, pz)) {
        rx = px;
        rz = pz;
      }
    }
  }
  return { x: rx, z: rz, y: getHeightAt(rx, rz) };
}

export function buildPondSDFTexture(size = 512) {
  const { minX, maxX, minZ, maxZ } = WORLD_BOUNDS;
  const width = maxX - minX;
  const depth = maxZ - minZ;

  const waterMask = new Uint8Array(size * size);
  for (let py = 0; py < size; py++) {
    const wz = minZ + ((py + 0.5) / size) * depth;
    for (let px = 0; px < size; px++) {
      const wx = minX + ((px + 0.5) / size) * width;
      let w = isWater(wx, wz);
      if (w) {
        for (let i = 0; i < STEPPING_STONES.length; i++) {
          const s = STEPPING_STONES[i];
          if (distSq(wx, wz, s.x, s.z) <= (s.visualR + 0.1) * (s.visualR + 0.1)) {
            w = false;
            break;
          }
        }
        // Mirror Lagoon Central Moon Islet foam edge
        if (distSq(wx, wz, MOON_ISLET.x, MOON_ISLET.z) <= (MOON_ISLET.r + 0.15) * (MOON_ISLET.r + 0.15)) {
          w = false;
        }
        const waterToriiPosts = [
          [-3.2, 16.0], [0.2, 15.6],
          [3.6, 13.7], [6.8, 13.3],
          [-6.2, 12.6], [2.4, 9.5], [-11.5, 18.2],
        ];
        for (let i = 0; i < waterToriiPosts.length; i++) {
          if (distSq(wx, wz, waterToriiPosts[i][0], waterToriiPosts[i][1]) <= 0.55 * 0.55) {
            w = false;
            break;
          }
        }
      }
      waterMask[py * size + px] = w ? 1 : 0;
    }
  }

  const distGrid = new Float32Array(size * size);
  const INF = 1e6;
  for (let i = 0; i < size * size; i++) {
    distGrid[i] = waterMask[i] ? INF : 0;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      let d = distGrid[idx];
      if (d === 0) continue;
      if (x > 0) d = Math.min(d, distGrid[idx - 1] + 1);
      if (y > 0) d = Math.min(d, distGrid[idx - size] + 1);
      if (x > 0 && y > 0) d = Math.min(d, distGrid[idx - size - 1] + 1.414);
      if (x < size - 1 && y > 0) d = Math.min(d, distGrid[idx - size + 1] + 1.414);
      distGrid[idx] = d;
    }
  }

  for (let y = size - 1; y >= 0; y--) {
    for (let x = size - 1; x >= 0; x--) {
      const idx = y * size + x;
      let d = distGrid[idx];
      if (d === 0) continue;
      if (x < size - 1) d = Math.min(d, distGrid[idx + 1] + 1);
      if (y < size - 1) d = Math.min(d, distGrid[idx + size] + 1);
      if (x < size - 1 && y < size - 1) d = Math.min(d, distGrid[idx + size + 1] + 1.414);
      if (x > 0 && y < size - 1) d = Math.min(d, distGrid[idx + size - 1] + 1.414);
      distGrid[idx] = d;
    }
  }

  const data = new Uint8Array(size * size * 4);
  const cellToWorld = (width + depth) * 0.5 / size;
  const maxShoreWorld = 3.2;

  for (let i = 0; i < size * size; i++) {
    const worldDist = distGrid[i] * cellToWorld;
    const norm = Math.round(clamp(worldDist / maxShoreWorld, 0, 1) * 255);
    const o = i * 4;
    data[o] = norm;
    data[o + 1] = waterMask[i] ? 255 : 0;
    data[o + 2] = norm;
    data[o + 3] = 255;
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export function isGrassSpot(x, z) {
  if (!isWalkable(x, z)) return false;
  if (getSurfaceAt(x, z) !== 'grass') return false;
  if (hitsCollider(x, z, 0.55)) return false;
  return true;
}

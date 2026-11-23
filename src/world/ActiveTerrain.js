import * as TerrainData from './TerrainData.js';

let currentTerrain = TerrainData;

export function setActiveTerrain(api) {
  currentTerrain = api || TerrainData;
}

export function resetDefaultTerrain() {
  currentTerrain = TerrainData;
}

export function getHeightAt(x, z) {
  return currentTerrain.getHeightAt(x, z);
}

export function getSurfaceAt(x, z) {
  return currentTerrain.getSurfaceAt(x, z);
}

export function isWalkable(x, z) {
  return currentTerrain.isWalkable(x, z);
}

export function canStandAt(x, z, radius = 0.34) {
  return currentTerrain.canStandAt(x, z, radius);
}

/**
 * Nearest spot where a body can stand with some room around it, searched in rings
 * outward from (x, z). Spots near `refY` win over slightly closer ones on another
 * level, so a stranded walker lands on the deck they were heading to, not a roof.
 */
export function findSafeSpot(x, z, { refY = null, radius = 0.5, maxDist = 40 } = {}) {
  const roomy = (px, pz) =>
    currentTerrain.canStandAt(px, pz, radius) &&
    currentTerrain.isWalkable(px + 0.7, pz) &&
    currentTerrain.isWalkable(px - 0.7, pz) &&
    currentTerrain.isWalkable(px, pz + 0.7) &&
    currentTerrain.isWalkable(px, pz - 0.7);

  let best = null;
  let bestScore = Infinity;
  let firstHitDist = Infinity;
  for (let d = 0; d <= maxDist && d <= firstHitDist + 2; d += 0.4) {
    const steps = d === 0 ? 1 : Math.ceil((Math.PI * 2 * d) / 0.4);
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const px = x + Math.cos(a) * d;
      const pz = z + Math.sin(a) * d;
      if (!roomy(px, pz)) continue;
      const dy = refY === null ? 0 : Math.abs(currentTerrain.getHeightAt(px, pz) - refY);
      const score = d + dy * 0.8;
      if (score < bestScore) {
        bestScore = score;
        best = { x: px, z: pz };
      }
      firstHitDist = Math.min(firstHitDist, d);
    }
  }
  return best;
}

export function resolveMovement(px, pz, nx, nz, radius, feetY = null) {
  return currentTerrain.resolveMovement(px, pz, nx, nz, radius, feetY);
}

export function getRegionInfoAt(x, z) {
  return currentTerrain.getRegionInfoAt(x, z);
}

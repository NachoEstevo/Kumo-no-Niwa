import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  getCliffRockTexture,
  getGrassSprigTexture,
  getGrassTurfTexture,
  getLeafClusterTexture,
  getRoofTileTexture,
  getStoneMasonryTexture,
  getWoodPlankTexture,
} from '../engine/PixelTextures.js';
import {
  createCloudMaterial,
  createCloudSeaMaterial,
  createPixelToonMaterial,
  globalToonUniforms,
} from '../engine/ToonMaterials.js';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function roundedBoxSDF(x, z, cx, cz, hx, hz, r = 1.2) {
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

/**
 * Reusable parametric terrain & sliding collision solver for Chapters II-VII.
 */
export class LevelTerrain {
  constructor({
    terraces = [],
    bridges = [],
    stones = [],
    circles = [],
    boxes = [],
    segments = [],
    defaultRegion = { id: 'sanctuary', jp: '雲の庭', en: 'Sanctuary' },
  }) {
    this.terraces = terraces;
    this.bridges = bridges;
    this.stones = stones;
    this.circles = circles;
    this.boxes = boxes;
    this.segments = segments; // thin walls such as fences: { ax, az, bx, bz, r }
    this.defaultRegion = defaultRegion;
  }

  /** Registers colliders returned by prop builders (boulders, lanterns, fences). */
  addColliders({ circles = [], segments = [], boxes = [] } = {}) {
    this.circles.push(...circles);
    this.segments.push(...segments);
    this.boxes.push(...boxes);
  }

  _evalBestDeck(x, z, isAirborne = false) {
    let bestY = -Infinity;
    let bestSurface = 'stone';
    let bestRegion = null;
    let hit = false;

    for (let i = 0; i < this.bridges.length; i++) {
      const b = this.bridges[i];
      if (b.enabledFn && !b.enabledFn()) continue;
      if (b.jumpOnly && !isAirborne) continue;
      const { dist, t } = segmentDistance(x, z, b.ax, b.az, b.bx, b.bz);
      if (dist <= b.halfWidth) {
        const y = b.startY + (b.endY - b.startY) * t + (b.archLift || 0) * 4 * t * (1 - t);
        if (y > bestY) {
          bestY = y;
          bestSurface = b.surface || 'wood';
          hit = true;
        }
      }
    }

    for (let i = 0; i < this.stones.length; i++) {
      const s = this.stones[i];
      if (s.enabledFn && !s.enabledFn()) continue;
      if (s.jumpOnly && !isAirborne) continue;
      const d = Math.hypot(x - s.x, z - s.z);
      if (d <= s.r && s.y > bestY) {
        bestY = s.y;
        bestSurface = s.surface || 'stone';
        hit = true;
      }
    }

    for (let i = 0; i < this.terraces.length; i++) {
      const t = this.terraces[i];
      if (t.enabledFn && !t.enabledFn()) continue;
      const inside =
        t.shape === 'circle'
          ? Math.hypot(x - t.cx, z - t.cz) <= t.r
          : roundedBoxSDF(x, z, t.cx, t.cz, t.hx, t.hz, t.cornerR ?? 1.6) <= 0;
      if (inside) {
        if (!hit || t.y >= bestY - 0.05) {
          if (t.y > bestY) {
            bestY = t.y;
            bestSurface = t.surface || 'grass';
            hit = true;
          }
          if (t.region) bestRegion = t.region;
        }
      }
    }

    return { hit, y: hit ? bestY : 0, surface: bestSurface, region: bestRegion };
  }

  getHeightAt(x, z) {
    return this._evalBestDeck(x, z).y;
  }

  getSurfaceAt(x, z) {
    return this._evalBestDeck(x, z).surface;
  }

  isWalkable(x, z) {
    return this._evalBestDeck(x, z).hit;
  }

  _hitsCollider(x, z, radius) {
    for (let i = 0; i < this.circles.length; i++) {
      const c = this.circles[i];
      if (c.enabledFn && !c.enabledFn()) continue;
      const minD = c.r + radius;
      const dx = x - c.x;
      const dz = z - c.z;
      if (dx * dx + dz * dz < minD * minD) return true;
    }
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      if (b.enabledFn && !b.enabledFn()) continue;
      if (
        x >= b.minX - radius &&
        x <= b.maxX + radius &&
        z >= b.minZ - radius &&
        z <= b.maxZ + radius
      ) {
        return true;
      }
    }
    for (let i = 0; i < this.segments.length; i++) {
      const s = this.segments[i];
      if (s.enabledFn && !s.enabledFn()) continue;
      if (segmentDistance(x, z, s.ax, s.az, s.bx, s.bz).dist < s.r + radius) return true;
    }
    return false;
  }

  /** True when a body of `radius` can stand here: on a deck and outside every collider. */
  canStandAt(x, z, radius = 0.34) {
    return this._evalBestDeck(x, z).hit && !this._hitsCollider(x, z, radius);
  }

  _canOccupy(x, z, feetY, radius, isAirborne = false) {
    const deck = this._evalBestDeck(x, z, isAirborne);
    if (!deck.hit) return false;
    if (this._hitsCollider(x, z, radius)) return false;
    const ny = deck.y;
    const maxStepUp = isAirborne ? 0.88 : 0.42;
    if (ny - feetY > maxStepUp) return false;
    if (!isAirborne && feetY - ny > 0.95) return false;
    return true;
  }

  resolveMovement(px, pz, nx, nz, radius = 0.34, feetY = null) {
    const baseY = this.getHeightAt(px, pz);
    const curFeetY = feetY !== null ? feetY : baseY;
    const airborne = feetY !== null && feetY > baseY + 0.14;
    if (this._canOccupy(nx, nz, curFeetY, radius, airborne)) {
      return { x: nx, y: this._evalBestDeck(nx, nz, airborne).y, z: nz };
    }
    if (this._canOccupy(nx, pz, curFeetY, radius, airborne)) {
      return { x: nx, y: this._evalBestDeck(nx, pz, airborne).y, z: pz };
    }
    if (this._canOccupy(px, nz, curFeetY, radius, airborne)) {
      return { x: px, y: this._evalBestDeck(px, nz, airborne).y, z: nz };
    }
    return { x: px, y: baseY, z: pz };
  }

  getRegionInfoAt(x, z) {
    const deck = this._evalBestDeck(x, z);
    if (deck.region) return deck.region;
    let best = this.defaultRegion;
    let bestDist = Infinity;
    for (let i = 0; i < this.terraces.length; i++) {
      const t = this.terraces[i];
      if (!t.region) continue;
      const d = Math.hypot(x - t.cx, z - t.cz);
      if (d < bestDist) {
        bestDist = d;
        best = t.region;
      }
    }
    return best;
  }

  getSurfaceAndHeightAt(x, z) {
    return this._evalBestDeck(x, z);
  }
}

export function seededRand(seed = 20261122) {
  let s = Math.abs(Math.floor(seed)) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function createBox(w, h, d, matOrColor, castShadow = true, receiveShadow = true) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = typeof matOrColor === 'string' ? createPixelToonMaterial({ color: matOrColor }) : matOrColor;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

export function createCylinder(rTop, rBot, h, segs, matOrColor, castShadow = true, receiveShadow = true) {
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, segs);
  const mat = typeof matOrColor === 'string' ? createPixelToonMaterial({ color: matOrColor }) : matOrColor;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

export function createSharedMatSet(grassColor = '#ffffff', customTopTex = null) {
  const stoneTex = getStoneMasonryTexture();
  const roofTex = getRoofTileTexture();
  roofTex.repeat.set(2, 2);
  return {
    grassMat: createPixelToonMaterial({ color: grassColor, map: customTopTex || getGrassTurfTexture() }),
    cliffMat: createPixelToonMaterial({ color: '#ffffff', map: getCliffRockTexture() }),
    stoneMat: createPixelToonMaterial({ color: '#ffffff', map: stoneTex }),
    stoneDarkMat: createPixelToonMaterial({ color: '#78736a' }),
    woodPlankMat: createPixelToonMaterial({ color: '#ffffff', map: getWoodPlankTexture() }),
    darkWoodMat: createPixelToonMaterial({ color: '#4d3221' }),
    roofTileMat: createPixelToonMaterial({ color: '#ffffff', map: roofTex }),
  };
}

export function buildSculptedTerrace({
  cx,
  cz,
  hx,
  hz,
  cornerR = 1.6,
  topY,
  bottomY = -9.5,
  topMat,
  cliffMat,
  seed = 1,
  perimCount = 48,
}) {
  const group = new THREE.Group();
  const hash = (n) => {
    const x = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  const shape = new THREE.Shape();
  for (let i = 0; i < perimCount; i++) {
    const ang = (i / perimCount) * Math.PI * 2;
    const dx = Math.cos(ang);
    const dz = Math.sin(ang);
    let lo = 0;
    let hi = Math.max(hx, hz) * 2.2;
    for (let it = 0; it < 14; it++) {
      const mid = (lo + hi) * 0.5;
      if (roundedBoxSDF(dx * mid, dz * mid, 0, 0, hx, hz, cornerR) <= 0) lo = mid;
      else hi = mid;
    }
    const rEdge = (lo + hi) * 0.5 + (hash(i) - 0.5) * 0.22;
    const vx = dx * rEdge;
    const vy = -dz * rEdge;
    if (i === 0) shape.moveTo(vx, vy);
    else shape.lineTo(vx, vy);
  }
  shape.closePath();

  const topGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.34, bevelEnabled: false, curveSegments: 1 });
  topGeo.rotateX(-Math.PI / 2);
  const topMesh = new THREE.Mesh(topGeo, topMat);
  topMesh.position.set(cx, topY - 0.34, cz);
  topMesh.receiveShadow = true;
  topMesh.castShadow = true;
  group.add(topMesh);

  const depth = Math.max(1.2, topY - 0.32 - bottomY);
  const cliffGeo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  cliffGeo.rotateX(-Math.PI / 2);
  const pos = cliffGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const py = pos.getY(i);
    const t = 1 - Math.max(0, Math.min(1, py / depth));
    const vx = pos.getX(i);
    const vz = pos.getZ(i);
    const taper = 1 - t * 0.36;
    const jag = 1 + Math.sin(Math.atan2(vz, vx) * 7 + t * 5 + seed) * 0.06 * t;
    pos.setX(i, vx * taper * jag);
    pos.setZ(i, vz * taper * jag);
  }
  cliffGeo.computeVertexNormals();
  const cliffMesh = new THREE.Mesh(cliffGeo, cliffMat);
  cliffMesh.position.set(cx, bottomY, cz);
  cliffMesh.castShadow = true;
  cliffMesh.receiveShadow = true;
  group.add(cliffMesh);

  return group;
}

const TERRACE_TILE_M = 2.6;

export function buildCircularTerrace({
  cx,
  cz,
  r,
  topY,
  bottomY = -9.5,
  topMat,
  cliffMat,
  seed = 1,
}) {
  const group = new THREE.Group();
  const top = createCylinder(r, r * 0.96, 0.34, 24, topMat, true, true);
  // CylinderGeometry stretches one texture tile over the whole disc (21 m on a big plaza).
  // Map the top in metres instead, at the same scale as the stone pads (one tile per ~2.6 m).
  const uv = top.geometry.attributes.uv;
  const p = top.geometry.attributes.position;
  const n = top.geometry.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    if (Math.abs(n.getY(i)) > 0.9) uv.setXY(i, p.getX(i) / TERRACE_TILE_M, -p.getZ(i) / TERRACE_TILE_M);
    else uv.setXY(i, (uv.getX(i) * Math.PI * 2 * r) / TERRACE_TILE_M, p.getY(i) / TERRACE_TILE_M); // u runs 0..1 around the rim
  }
  top.position.set(cx, topY - 0.17, cz);
  group.add(top);

  const depth = Math.max(1.2, topY - 0.34 - bottomY);
  const cliffGeo = new THREE.CylinderGeometry(r * 0.96, r * 0.56, depth, 20, 4);
  const pos = cliffGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vz = pos.getZ(i);
    const vy = pos.getY(i);
    const jag = 1 + Math.sin(Math.atan2(vz, vx) * 6 + vy * 0.5 + seed) * 0.07;
    pos.setX(i, vx * jag);
    pos.setZ(i, vz * jag);
  }
  cliffGeo.computeVertexNormals();
  const cliff = new THREE.Mesh(cliffGeo, cliffMat);
  cliff.position.set(cx, bottomY + depth * 0.5, cz);
  cliff.castShadow = true;
  cliff.receiveShadow = true;
  group.add(cliff);

  return group;
}

export function buildBridgeMesh(
  group,
  {
    ax,
    az,
    bx,
    bz,
    halfWidth = 1.4,
    startY,
    endY,
    archLift = 0.25,
    woodMat,
    railMat,
    railingStyle = 'vermilion',
    emissiveBorderMat = null,
  }
) {
  const span = Math.hypot(bx - ax, bz - az);
  const yaw = Math.atan2(bx - ax, bz - az);
  const dirX = span > 1e-4 ? (bx - ax) / span : 0;
  const dirZ = span > 1e-4 ? (bz - az) / span : 1;
  const rx = dirZ;
  const rz = -dirX;
  const segs = Math.max(8, Math.ceil(span * 2.2));
  const bg = new THREE.Group();

  const evalY = (t) => startY + (endY - startY) * t + archLift * 4 * t * (1 - t);
  const hw = Math.max(0.24, halfWidth - 0.04);
  const deckThick = 0.22;

  const positions = [];
  const uvs = [];
  const indices = [];

  const pushStripQuad = (p0, p1, p2, p3, uv0, uv1, uv2, uv3) => {
    const base = positions.length / 3;
    positions.push(
      p0[0], p0[1], p0[2],
      p1[0], p1[1], p1[2],
      p2[0], p2[1], p2[2],
      p3[0], p3[1], p3[2]
    );
    uvs.push(uv0[0], uv0[1], uv1[0], uv1[1], uv2[0], uv2[1], uv3[0], uv3[1]);
    indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  };

  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const cx0 = ax + (bx - ax) * t0;
    const cz0 = az + (bz - az) * t0;
    const y0 = evalY(t0);
    const cx1 = ax + (bx - ax) * t1;
    const cz1 = az + (bz - az) * t1;
    const y1 = evalY(t1);

    const v0 = t0 * span * 0.55;
    const v1 = t1 * span * 0.55;

    const tl0 = [cx0 - rx * hw, y0, cz0 - rz * hw];
    const tr0 = [cx0 + rx * hw, y0, cz0 + rz * hw];
    const br0 = [cx0 + rx * hw, y0 - deckThick, cz0 + rz * hw];
    const bl0 = [cx0 - rx * hw, y0 - deckThick, cz0 - rz * hw];

    const tl1 = [cx1 - rx * hw, y1, cz1 - rz * hw];
    const tr1 = [cx1 + rx * hw, y1, cz1 + rz * hw];
    const br1 = [cx1 + rx * hw, y1 - deckThick, cz1 + rz * hw];
    const bl1 = [cx1 - rx * hw, y1 - deckThick, cz1 - rz * hw];

    // Top deck (normal +U)
    pushStripQuad(tl0, tr0, tl1, tr1, [0, v0], [1, v0], [0, v1], [1, v1]);
    // Bottom soffit (normal -U)
    pushStripQuad(br0, bl0, br1, bl1, [1, v0], [0, v0], [1, v1], [0, v1]);
    // +R side (normal +R)
    pushStripQuad(tr0, br0, tr1, br1, [0, v0], [1, v0], [0, v1], [1, v1]);
    // -R side (normal -R)
    pushStripQuad(bl0, tl0, bl1, tl1, [0, v0], [1, v0], [0, v1], [1, v1]);

    if (i === 0) {
      pushStripQuad(tl0, bl0, tr0, br0, [0, 1], [0, 0], [1, 1], [1, 0]);
    }
    if (i === segs - 1) {
      pushStripQuad(tr1, br1, tl1, bl1, [1, 1], [1, 0], [0, 1], [0, 0]);
    }
  }

  const deckGeo = new THREE.BufferGeometry();
  deckGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  deckGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  deckGeo.setIndex(indices);
  deckGeo.computeVertexNormals();

  const deckMesh = new THREE.Mesh(deckGeo, woodMat);
  deckMesh.castShadow = true;
  deckMesh.receiveShadow = true;
  bg.add(deckMesh);

  if (emissiveBorderMat) {
    const bPos = [];
    const bUv = [];
    const bIdx = [];
    const pushBQuad = (p0, p1, p2, p3) => {
      const base = bPos.length / 3;
      bPos.push(
        p0[0], p0[1], p0[2],
        p1[0], p1[1], p1[2],
        p2[0], p2[1], p2[2],
        p3[0], p3[1], p3[2]
      );
      bUv.push(0, 0, 1, 0, 0, 1, 1, 1);
      bIdx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    };
    const bw = 0.085;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs;
      const t1 = (i + 1) / segs;
      const cx0 = ax + (bx - ax) * t0;
      const cz0 = az + (bz - az) * t0;
      const y0 = evalY(t0) + 0.025;
      const cx1 = ax + (bx - ax) * t1;
      const cz1 = az + (bz - az) * t1;
      const y1 = evalY(t1) + 0.025;
      for (const side of [-1, 1]) {
        const inner = (hw - bw) * side;
        const outer = hw * side;
        const a0 = [cx0 + rx * Math.min(inner, outer), y0, cz0 + rz * Math.min(inner, outer)];
        const b0 = [cx0 + rx * Math.max(inner, outer), y0, cz0 + rz * Math.max(inner, outer)];
        const a1 = [cx1 + rx * Math.min(inner, outer), y1, cz1 + rz * Math.min(inner, outer)];
        const b1 = [cx1 + rx * Math.max(inner, outer), y1, cz1 + rz * Math.max(inner, outer)];
        pushBQuad(a0, b0, a1, b1);
      }
    }
    const bGeo = new THREE.BufferGeometry();
    bGeo.setAttribute('position', new THREE.Float32BufferAttribute(bPos, 3));
    bGeo.setAttribute('uv', new THREE.Float32BufferAttribute(bUv, 2));
    bGeo.setIndex(bIdx);
    bGeo.computeVertexNormals();
    const bMesh = new THREE.Mesh(bGeo, emissiveBorderMat);
    bg.add(bMesh);
  }

  if (railingStyle !== 'none') {
    const postMat = railMat || createPixelToonMaterial({ color: '#d63b2a' });
    const postCount = Math.max(3, Math.ceil(span / 2.2) + 1);
    const railH = railingStyle === 'vermilion' ? 0.65 : 0.44;
    const offset = Math.max(0.2, halfWidth - 0.1);
    for (let i = 0; i < postCount; i++) {
      const t = i / (postCount - 1);
      const cx = THREE.MathUtils.lerp(ax, bx, t);
      const cz = THREE.MathUtils.lerp(az, bz, t);
      const cy = evalY(t);
      for (const side of [-1, 1]) {
        const post = createBox(0.11, railH, 0.11, postMat);
        post.position.set(cx + rx * offset * side, cy + railH * 0.5, cz + rz * offset * side);
        post.rotation.y = yaw;
        bg.add(post);
      }
    }
    for (let i = 0; i < postCount - 1; i++) {
      const t0 = i / (postCount - 1);
      const t1 = (i + 1) / (postCount - 1);
      const cy0 = evalY(t0) + railH - 0.06;
      const cy1 = evalY(t1) + railH - 0.06;
      const cx0 = THREE.MathUtils.lerp(ax, bx, t0);
      const cz0 = THREE.MathUtils.lerp(az, bz, t0);
      const cx1 = THREE.MathUtils.lerp(ax, bx, t1);
      const cz1 = THREE.MathUtils.lerp(az, bz, t1);
      for (const side of [-1, 1]) {
        const p0x = cx0 + rx * offset * side;
        const p0z = cz0 + rz * offset * side;
        const p1x = cx1 + rx * offset * side;
        const p1z = cz1 + rz * offset * side;
        const segLen3D = Math.hypot(p1x - p0x, cy1 - cy0, p1z - p0z);
        const rail = createBox(0.08, 0.08, segLen3D + 0.06, postMat);
        rail.position.set((p0x + p1x) * 0.5, (cy0 + cy1) * 0.5, (p0z + p1z) * 0.5);
        rail.lookAt(p1x, cy1, p1z);
        bg.add(rail);
      }
    }
  }

  group.add(bg);
  return bg;
}

export function buildStairMesh(
  group,
  {
    ax,
    az,
    bx,
    bz,
    width,
    startY,
    endY,
    steps = 10,
    stoneMat,
    riserMat = null,
    cheekMat = null,
    railMat = null,
    railingStyle = 'curb',
  }
) {
  const span = Math.hypot(bx - ax, bz - az);
  if (span < 0.15) return new THREE.Group();
  const dy = endY - startY;
  const nSteps = Math.max(steps || 6, Math.round(Math.abs(dy) / 0.22));
  const yaw = Math.atan2(bx - ax, bz - az);
  const slope = Math.atan2(dy, span);
  const stepSpan = span / nSteps;
  const stepD = stepSpan + 0.08;
  const minYFloor = Math.min(startY, endY) - 1.45;
  const sg = new THREE.Group();

  const riserM = riserMat || createPixelToonMaterial({ color: '#6b655c' });
  const cheekM = cheekMat || riserM;
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);

  // Clean threshold landing slabs at base & crest so terrain never bleeds over first/last tread
  for (const [lx, lz, ly] of [
    [ax, az, startY],
    [bx, bz, endY],
  ]) {
    const pad = createBox(width + 0.42, 0.26, 0.56, stoneMat);
    pad.position.set(lx, ly - 0.13, lz);
    pad.rotation.y = yaw;
    sg.add(pad);
  }

  for (let i = 0; i < nSteps; i++) {
    const t = (i + 0.5) / nSteps;
    const tTop = (i + 0.65) / nSteps;
    const yTop = startY + dy * tTop;
    const cx = THREE.MathUtils.lerp(ax, bx, t);
    const cz = THREE.MathUtils.lerp(az, bz, t);

    // Solid foundation block extending down past slope clip
    const baseH = Math.max(0.5, yTop - minYFloor);
    const baseBlock = createBox(width - 0.02, baseH, stepSpan + 0.04, riserM);
    baseBlock.position.set(cx, minYFloor + baseH * 0.5 - 0.06, cz);
    baseBlock.rotation.y = yaw;
    sg.add(baseBlock);

    // Crisp slightly overhanging tread nosing slab so every step edge pops cleanly
    const tread = createBox(width + 0.06, 0.13, stepD, stoneMat);
    tread.position.set(cx, yTop - 0.065, cz);
    tread.rotation.y = yaw;
    sg.add(tread);
  }

  // Flanking sloped stone/timber cheek walls blocking grass intrusion along sides
  const diagLen = Math.hypot(span, dy) + 0.45;
  const midX = (ax + bx) * 0.5;
  const midZ = (az + bz) * 0.5;
  const midY = (startY + endY) * 0.5;
  const wallH = Math.max(0.95, Math.abs(dy) * 0.35 + 0.85);
  const halfOuter = width * 0.5 + 0.14;

  for (const side of [-1, 1]) {
    const curb = createBox(0.26, wallH, diagLen, cheekM);
    curb.position.set(midX + rx * side * halfOuter, midY - wallH * 0.5 + 0.28, midZ + rz * side * halfOuter);
    curb.rotation.order = 'YXZ';
    curb.rotation.y = yaw;
    curb.rotation.x = -slope;
    sg.add(curb);
  }

  // Handrail posts & sloped top rail for noticeable height climbs (outside walkable stair width)
  const useRails = railingStyle === 'wood' || railingStyle === 'vermilion' || Math.abs(dy) >= 1.05;
  if (useRails && railingStyle !== 'none') {
    const rM = railMat || createPixelToonMaterial({ color: railingStyle === 'vermilion' ? '#d83f31' : '#6b472f' });
    const postCount = Math.max(3, Math.ceil(span / 2.4) + 1);
    for (let p = 0; p < postCount; p++) {
      const t = p / (postCount - 1);
      const px = THREE.MathUtils.lerp(ax, bx, t);
      const pz = THREE.MathUtils.lerp(az, bz, t);
      const py = THREE.MathUtils.lerp(startY, endY, t) + 0.25;
      for (const side of [-1, 1]) {
        const post = createBox(0.11, 0.58, 0.11, rM);
        post.position.set(px + rx * side * halfOuter, py + 0.29, pz + rz * side * halfOuter);
        post.rotation.y = yaw;
        sg.add(post);
      }
    }
    for (const side of [-1, 1]) {
      const topRail = createBox(0.09, 0.08, diagLen - 0.15, rM);
      topRail.position.set(midX + rx * side * halfOuter, midY + 0.8, midZ + rz * side * halfOuter);
      topRail.rotation.order = 'YXZ';
      topRail.rotation.y = yaw;
      topRail.rotation.x = -slope;
      sg.add(topRail);
    }
  }

  group.add(sg);
  return sg;
}

export function buildRetainingWallRim(group, { cx, cz, r, topY, height = 1.05, stoneMat }) {
  const wg = new THREE.Group();
  const darkerMat = createPixelToonMaterial({ color: '#78736a' });
  const hTotal = Math.max(0.55, height + 0.35);

  const wallBand = new THREE.Mesh(
    new THREE.CylinderGeometry(r + 0.08, r + 0.24, hTotal, 22, 1, true),
    darkerMat
  );
  wallBand.position.set(cx, topY - hTotal * 0.5 - 0.02, cz);
  wallBand.castShadow = true;
  wallBand.receiveShadow = true;
  wg.add(wallBand);

  const coping = new THREE.Mesh(
    new THREE.TorusGeometry(r + 0.06, 0.12, 6, 24),
    stoneMat
  );
  coping.rotation.x = Math.PI / 2;
  coping.position.set(cx, topY - 0.13, cz);
  coping.scale.setScalar(1);
  wg.add(coping);

  group.add(wg);
  return wg;
}

export function buildToriiGate(group, { x, y, z, yaw = 0, scale = 1.0, color = '#d63728' }) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  g.scale.setScalar(scale);

  const verm = createPixelToonMaterial({ color });
  const darkCap = createPixelToonMaterial({ color: '#272038' });
  const baseMat = createPixelToonMaterial({ color: '#3b3746' });

  for (const sx of [-1.45, 1.45]) {
    const ped = createCylinder(0.24, 0.28, 0.44, 8, baseMat);
    ped.position.set(sx, 0.22, 0);
    const col = createCylinder(0.16, 0.19, 3.25, 10, verm);
    col.position.set(sx, 1.85, 0);
    g.add(ped, col);
  }

  const nuki = createBox(3.7, 0.18, 0.22, verm);
  nuki.position.set(0, 2.78, 0);
  const kasagi = createBox(4.45, 0.24, 0.36, verm);
  kasagi.position.set(0, 3.45, 0);
  const cap = createBox(4.6, 0.12, 0.4, darkCap);
  cap.position.set(0, 3.6, 0);
  const tablet = createBox(0.32, 0.5, 0.2, darkCap);
  tablet.position.set(0, 3.1, 0);

  g.add(nuki, kasagi, cap, tablet);
  group.add(g);
  return g;
}

const LEAF_VERT = /* glsl */ `
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

const LEAF_FRAG = /* glsl */ `
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

export function createTreeBillboardSet() {
  const make = (texKind, windAmp = 0.09, windSpeed = 1.65) =>
    new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: getLeafClusterTexture(texKind) },
        uTime: globalToonUniforms.uTime,
        uWindAmp: { value: windAmp },
        uWindSpeed: { value: windSpeed },
        uSunDir: globalToonUniforms.uSunDir,
        uSunWarmth: globalToonUniforms.uSunWarmth,
        uSunScale: globalToonUniforms.uSunScale,
        uShadowColor: globalToonUniforms.uShadowColor,
        uShadowTint: globalToonUniforms.uShadowTint,
      },
      vertexShader: LEAF_VERT,
      fragmentShader: LEAF_FRAG,
      transparent: false,
      depthWrite: true,
    });

  return {
    sakura: make('sakura', 0.08, 1.55),
    momiji: make('momiji', 0.08, 1.65),
    evergreen: make('bamboo', 0.06, 1.45),
    barkMat: createPixelToonMaterial({ color: '#4d352e' }),
  };
}

function createOrganicDome(radius, seed) {
  const geo = new THREE.SphereGeometry(radius, 11, 8);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const bump =
      1.0 +
      0.13 * Math.sin(vx * 3.1 + seed) * Math.cos(vz * 2.8 - seed * 0.5) +
      0.09 * Math.cos(vy * 3.4 + seed * 1.3);
    pos.setXYZ(i, vx * bump * 1.12, vy * bump * 0.85, vz * bump * 1.08);
  }
  geo.computeVertexNormals();
  return geo;
}

const TREE_PALETTES = {
  sakura: { dome: '#ee9cb4', tufts: ['#fbc4d5', '#f5adc3', '#eb93ae', '#df7e9d'], matKey: 'sakura' },
  'momiji-red': { dome: '#d63e22', tufts: ['#ff6a38', '#e84323', '#f75828', '#c7321c'], matKey: 'momiji' },
  'momiji-gold': { dome: '#dfa226', tufts: ['#ffd64f', '#f0b12e', '#f8c13f', '#cc8620'], matKey: 'momiji' },
  cedar: { dome: '#2f6b47', tufts: ['#4c9866', '#3a7e53', '#2a5f3e', '#1f4730'], matKey: 'evergreen' },
  'snow-cedar': { dome: '#6e968f', tufts: ['#f8fbff', '#e4f0fa', '#92bfb2', '#528075'], matKey: 'evergreen' },
  cypress: { dome: '#255240', tufts: ['#3b7c59', '#2f684b', '#1e4a38', '#16362b'], matKey: 'evergreen' },
  pine: { dome: '#2c6848', tufts: ['#489660', '#347c50', '#265c3e', '#1c4730'], matKey: 'evergreen' },
};

export function buildOrganicTree(group, { type = 'sakura', x, y, z, scale = 1.0, idx = 1, treeSet }) {
  const pal = TREE_PALETTES[type] || TREE_PALETTES.sakura;
  const tree = new THREE.Group();
  tree.position.set(x, y, z);

  const isConifer = type === 'cedar' || type === 'snow-cedar' || type === 'cypress';
  const trunkH = (isConifer ? 3.2 : 2.3) * scale;
  const trunkR = (isConifer ? 0.3 : 0.26) * scale;

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(trunkR * 0.58, trunkR, trunkH, 8),
    treeSet.barkMat
  );
  trunk.position.set(0, trunkH * 0.5, 0);
  trunk.castShadow = true;
  tree.add(trunk);

  const lobeCenters = isConifer
    ? [
        new THREE.Vector3(0, trunkH + 1.5 * scale, 0),
        new THREE.Vector3(0, trunkH + 0.65 * scale, 0),
        new THREE.Vector3(0, trunkH - 0.1 * scale, 0),
      ]
    : [
        new THREE.Vector3(0, trunkH + 1.0 * scale, 0),
        new THREE.Vector3(0.95 * scale, trunkH + 0.45 * scale, 0.4 * scale),
        new THREE.Vector3(-0.9 * scale, trunkH + 0.5 * scale, -0.35 * scale),
        new THREE.Vector3(0.25 * scale, trunkH + 0.4 * scale, -0.95 * scale),
      ];

  const domeMat = createPixelToonMaterial({
    color: pal.dome,
    windSway: { amp: 0.055, speed: 1.55, baseHeight: 1.0 * scale, topHeight: 6.2 * scale },
  });

  lobeCenters.forEach((lc, lIdx) => {
    const rad = isConifer
      ? (0.72 + lIdx * 0.34) * scale
      : (lIdx === 0 ? 1.2 : 0.92) * scale;
    const dome = new THREE.Mesh(createOrganicDome(rad, idx * 7 + lIdx), domeMat);
    dome.position.copy(lc);
    dome.castShadow = true;
    dome.receiveShadow = true;
    tree.add(dome);
  });

  const tuftCount = 68;
  const positions = [];
  const corners = [];
  const sizes = [];
  const domeNormals = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  const tuftColors = pal.tufts.map((h) => new THREE.Color(h));
  const crownCenter = new THREE.Vector3(0, trunkH + 0.65 * scale, 0);
  const localCorners = [
    [-0.5, -0.5, 0, 0],
    [0.5, -0.5, 1, 0],
    [0.5, 0.5, 1, 1],
    [-0.5, 0.5, 0, 1],
  ];

  const hashR = (n) => {
    const s = Math.sin(n * 91.3 + idx * 17.1) * 43758.5453;
    return s - Math.floor(s);
  };

  for (let i = 0; i < tuftCount; i++) {
    const lIdx = i % lobeCenters.length;
    const lobe = lobeCenters[lIdx];
    const theta = hashR(i * 3 + 1) * Math.PI * 2;
    const phi = Math.acos(1 - 1.45 * hashR(i * 3 + 2));
    const domeR = isConifer
      ? (0.68 + lIdx * 0.32) * scale
      : (lIdx === 0 ? 1.12 : 0.88) * scale;

    const cx = lobe.x + Math.sin(phi) * Math.cos(theta) * domeR * 1.04;
    const cy = lobe.y + Math.cos(phi) * domeR * 0.85;
    const cz = lobe.z + Math.sin(phi) * Math.sin(theta) * domeR * 1.04;

    const dn = new THREE.Vector3(
      cx - crownCenter.x,
      cy - crownCenter.y + 0.5 * scale,
      cz - crownCenter.z
    ).normalize();
    const sz = 1.08 * scale * (0.78 + hashR(i * 3 + 3) * 0.42);
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
    indices.push(vBase, vBase + 1, vBase + 2, vBase, vBase + 2, vBase + 3);
  }

  const tuftGeo = new THREE.BufferGeometry();
  tuftGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  tuftGeo.setAttribute('aCorner', new THREE.Float32BufferAttribute(corners, 2));
  tuftGeo.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  tuftGeo.setAttribute('aDomeNormal', new THREE.Float32BufferAttribute(domeNormals, 3));
  tuftGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  tuftGeo.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
  tuftGeo.setIndex(indices);

  const tuftMesh = new THREE.Mesh(tuftGeo, treeSet[pal.matKey]);
  tuftMesh.frustumCulled = false;
  tree.add(tuftMesh);

  group.add(tree);
  return tree;
}

export function buildLanternProp(group, scene, lightsList, x, y, z, lit = false) {
  const stone = createPixelToonMaterial({ color: '#9c9689' });
  const stoneDark = createPixelToonMaterial({ color: '#78736a' });
  const g = new THREE.Group();
  g.position.set(x, y, z);

  const base = createBox(0.58, 0.24, 0.58, stoneDark);
  base.position.set(0, 0.12, 0);
  const post = createCylinder(0.15, 0.18, 0.78, 8, stone);
  post.position.set(0, 0.62, 0);
  const chamber = createBox(0.46, 0.36, 0.46, stoneDark);
  chamber.position.set(0, 1.18, 0);
  const flameMesh = createBox(0.24, 0.24, 0.24, new THREE.MeshBasicMaterial({ color: '#ffd98a' }), false, false);
  flameMesh.position.set(0, 1.18, 0);
  flameMesh.visible = lit;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.34, 4), stoneDark);
  roof.rotation.y = Math.PI / 4;
  roof.position.set(0, 1.54, 0);
  g.add(base, post, chamber, flameMesh, roof);
  group.add(g);

  const light = new THREE.PointLight('#ffbd6e', lit ? 3.4 : 0, 10, 1.5);
  light.position.set(x, y + 1.3, z);
  scene.add(light);
  lightsList.push(light);

  return {
    group: g,
    flameMesh,
    light,
    isLit: lit,
    x,
    y,
    z,
    collider: { x, z, r: 0.4 },
    setLit(flag) {
      this.isLit = Boolean(flag);
      this.flameMesh.visible = this.isLit;
      this.light.intensity = this.isLit ? 3.4 : 0;
    },
  };
}

let cachedCloudPuffs = null;
function getCloudPuffGeos() {
  if (cachedCloudPuffs) return cachedCloudPuffs;
  cachedCloudPuffs = [11, 29, 53].map((seed) => {
    const geo = new THREE.SphereGeometry(1.0, 12, 10);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      const ang = Math.atan2(z, x);
      const ripple = 1.0 + 0.1 * Math.sin(ang * 4.0 + seed) * Math.cos(y * 3.2 - seed * 0.7);
      x *= ripple;
      z *= ripple;
      y = y < 0 ? y * 0.28 : y * 0.94 + 0.06 * Math.sin(x * 3.1 + seed) * Math.cos(z * 2.7);
      pos.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
    return geo;
  });
  return cachedCloudPuffs;
}

export function buildSculptedCumulusCluster(cloudMat, archetype = 'bank', seed = 1) {
  const puffs = getCloudPuffGeos();
  const cg = new THREE.Group();
  const addPuff = (x, y, z, sx, sy, sz, idx) => {
    const m = new THREE.Mesh(puffs[idx % puffs.length], cloudMat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    cg.add(m);
  };

  if (archetype === 'tower') {
    // Broad flat-bottomed Shinkai cumulus anvil base + climbing billow towers
    addPuff(0, -0.35, 0, 5.2, 1.5, 3.6, seed);
    addPuff(-2.8, 0.25, 0.3, 3.1, 1.9, 2.5, seed + 1);
    addPuff(2.7, 0.35, -0.3, 3.0, 2.0, 2.4, seed + 2);
    addPuff(-1.1, 1.45, 0.2, 2.8, 2.4, 2.3, seed + 3);
    addPuff(1.2, 1.7, -0.1, 2.5, 2.6, 2.2, seed + 4);
    addPuff(0.1, 2.95, 0.1, 2.35, 2.5, 2.05, seed + 5);
    addPuff(0.55, 4.15, -0.15, 1.55, 1.65, 1.45, seed + 6);
  } else if (archetype === 'wisp') {
    addPuff(0, 0, 0, 4.4, 0.72, 1.55, seed);
    addPuff(-2.4, -0.08, 0.25, 2.6, 0.56, 1.15, seed + 1);
    addPuff(2.5, 0.08, -0.2, 2.4, 0.52, 1.1, seed + 2);
  } else {
    // Mid-ring terraced bank
    addPuff(0, -0.2, 0, 3.9, 1.25, 2.75, seed);
    addPuff(-2.0, 0.28, 0.25, 2.35, 1.45, 1.9, seed + 1);
    addPuff(2.1, 0.22, -0.25, 2.25, 1.35, 1.85, seed + 2);
    addPuff(-0.35, 1.15, 0.1, 2.1, 1.75, 1.8, seed + 3);
    addPuff(1.05, 0.9, 0.2, 1.65, 1.35, 1.5, seed + 4);
  }
  return cg;
}

export function buildCloudSeaAndCumulus(group, cloudsList, ySea = -12.8, count = 48) {
  const seaMat = createCloudSeaMaterial();
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(460, 460), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, ySea, 0);
  group.add(sea);

  const cloudMat = createCloudMaterial();
  for (let i = 0; i < count; i++) {
    const band = i % 3;
    const archetype = band === 0 ? 'tower' : band === 1 ? 'bank' : 'wisp';
    const cg = buildSculptedCumulusCluster(cloudMat, archetype, i * 3 + 1);

    const ringAng = (i / count) * Math.PI * 2 + band * 0.27;
    const dist =
      band === 0
        ? 46 + (i % 7) * 5.2
        : band === 1
        ? 24 + (i % 7) * 4.4
        : 28 + (i % 6) * 5.0;
    const x = Math.cos(ringAng) * dist;
    const z = Math.sin(ringAng) * dist - 4.0;
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
    group.add(cg);
    cloudsList.push(cg);
  }
}

export function updateClouds(cloudsList, dt, elapsed) {
  for (let i = 0; i < cloudsList.length; i++) {
    const c = cloudsList[i];
    c.position.x += c.userData.speed * dt;
    c.position.y = c.userData.baseY + Math.sin(elapsed * 0.42 + c.userData.phase) * 0.24;
    if (c.position.x > 96) c.position.x = -96;
  }
}

const GENERIC_WATER_VERT = /* glsl */ `
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const GENERIC_WATER_FRAG = /* glsl */ `
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

  float foamThreshold = 0.075 + sin(uTime * 2.1 + pos.x * 2.2 + pos.y * 2.0) * 0.015;
  float foamEdge = 1.0 - smoothstep(foamThreshold - 0.018, foamThreshold + 0.012, shoreDist);
  float innerRipple = (1.0 - smoothstep(0.0, 0.016, abs(shoreDist - 0.14 - sin(uTime * 1.6 - pos.x * 1.5) * 0.012))) * 0.58;
  float foamMask = max(foamEdge, innerRipple);

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
  float waterAlpha = mix(mix(0.46, 0.68, smoothstep(0.12, 0.72, shoreDist)), 1.0, clamp(foamMask, 0.0, 1.0));
  gl_FragColor = vec4(finalCol, waterAlpha);
}
`;

export function buildProceduralPondSDF(bounds, inWaterFn, shoreDistFn, size = 128) {
  const data = new Uint8Array(size * size * 4);
  for (let iz = 0; iz < size; iz++) {
    const wz = bounds.minZ + (iz / (size - 1)) * (bounds.maxZ - bounds.minZ);
    for (let ix = 0; ix < size; ix++) {
      const wx = bounds.minX + (ix / (size - 1)) * (bounds.maxX - bounds.minX);
      const inWater = inWaterFn(wx, wz);
      const dist = clamp(shoreDistFn(wx, wz) / 4.2, 0, 1);
      const idx = (iz * size + ix) * 4;
      data[idx] = Math.round(dist * 255);
      data[idx + 1] = inWater ? 255 : 0;
      data[idx + 2] = 0;
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function buildWaterPlane({ group, w, d, cx, cz, y, waterMaterials, sdfTex, bounds, ripples, isMirror = false }) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: globalToonUniforms.uTime,
      uPondSDF: { value: sdfTex },
      uWorldBounds: { value: new THREE.Vector4(bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ) },
      uDeepColor: { value: new THREE.Color('#5dc0e2') },
      uShallowColor: { value: new THREE.Color('#8ee1f7') },
      uFoamColor: { value: new THREE.Color('#f7fdff') },
      uHighlightColor: { value: new THREE.Color('#cef6ff') },
      uIsMirror: { value: isMirror ? 1.0 : 0.0 },
      uRipples: { value: ripples },
    },
    vertexShader: GENERIC_WATER_VERT,
    fragmentShader: GENERIC_WATER_FRAG,
    transparent: true,
    depthWrite: true,
  });
  waterMaterials.push(mat);

  const geo = new THREE.PlaneGeometry(w, d, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx, y, cz);
  group.add(mesh);
  return mesh;
}

const BELL_RING_VERT = /* glsl */ `
varying vec3 vLocalPos;
void main() {
  vLocalPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const BELL_RING_FRAG = /* glsl */ `
precision highp float;
uniform float uProgress;
uniform float uTime;
uniform vec3 uColor;
varying vec3 vLocalPos;
void main() {
  float dist = length(vLocalPos.xz);
  float r = clamp((dist - 0.45) / 0.55, 0.0, 1.0);
  float ang = atan(vLocalPos.z, vLocalPos.x);
  float wisp = sin(ang * 10.0 + uProgress * 5.2 + uTime * 1.4) * 0.12
             + cos(ang * 6.0 - uProgress * 4.0) * 0.09;
  float radial = clamp(r + wisp * (0.35 + 0.65 * r), 0.0, 1.0);
  float outerCrest = exp(-pow((radial - 0.76) * 5.8, 2.0));
  float innerCrest = exp(-pow((radial - 0.34) * 8.0, 2.0)) * 0.72;
  float wash = smoothstep(0.05, 0.42, radial) * (1.0 - smoothstep(0.66, 1.0, radial)) * 0.28;
  float ink = clamp(outerCrest + innerCrest + wash, 0.0, 1.0);
  float env = smoothstep(0.0, 0.10, uProgress) * pow(1.0 - smoothstep(0.32, 1.0, uProgress), 1.35);
  float alpha = ink * env * 0.90;
  if (alpha < 0.02) discard;
  vec3 col = mix(uColor, vec3(1.0, 0.98, 0.90), outerCrest * 0.72 + innerCrest * 0.45);
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}
`;

const BELL_DOME_VERT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vViewDir;
varying vec3 vLocalPos;
void main() {
  vLocalPos = position;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vViewDir = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const BELL_DOME_FRAG = /* glsl */ `
precision highp float;
uniform float uProgress;
uniform vec3 uColor;
varying vec3 vWorldNormal;
varying vec3 vViewDir;
varying vec3 vLocalPos;
void main() {
  float ndv = abs(dot(normalize(vWorldNormal), normalize(vViewDir)));
  float fresnel = pow(1.0 - ndv, 2.1);
  float bands = 0.55 + 0.45 * sin(vLocalPos.y * 14.0 - uProgress * 11.0);
  float env = smoothstep(0.0, 0.14, uProgress) * pow(1.0 - smoothstep(0.28, 1.0, uProgress), 1.6);
  float alpha = (fresnel * 0.85 + 0.08) * bands * env * 0.62;
  if (alpha < 0.02) discard;
  vec3 col = mix(uColor, vec3(1.0, 0.96, 0.86), fresnel * 0.65);
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}
`;

export function createBellResonanceManager(group) {
  const waves = [];
  const domes = [];
  const motes = [];
  const ringGeo = new THREE.RingGeometry(0.45, 1.0, 48);
  ringGeo.rotateX(-Math.PI / 2);
  const domeGeo = new THREE.SphereGeometry(1.0, 22, 14);
  const moteGeo = new THREE.OctahedronGeometry(0.095, 0);
  const needleGeo = new THREE.BoxGeometry(0.045, 0.52, 0.045);

  return {
    trigger(x, y, z, accentColor = '#ffe49e') {
      const col = new THREE.Color(accentColor);
      [0, 0.22, 0.46].forEach((delay, idx) => {
        const mat = new THREE.ShaderMaterial({
          uniforms: {
            uProgress: { value: 0 },
            uTime: globalToonUniforms.uTime,
            uColor: { value: col },
          },
          vertexShader: BELL_RING_VERT,
          fragmentShader: BELL_RING_FRAG,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(ringGeo, mat);
        mesh.position.set(x, y + 0.65 + idx * 0.22, z);
        mesh.visible = delay === 0;
        mesh.userData = {
          age: -delay,
          maxAge: 2.35,
          maxScale: 24.0 - idx * 3.5,
          baseY: y + 0.65 + idx * 0.22,
        };
        group.add(mesh);
        waves.push(mesh);
      });

      const domeMat = new THREE.ShaderMaterial({
        uniforms: {
          uProgress: { value: 0 },
          uColor: { value: col },
        },
        vertexShader: BELL_DOME_VERT,
        fragmentShader: BELL_DOME_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.FrontSide,
      });
      const dome = new THREE.Mesh(domeGeo, domeMat);
      dome.position.set(x, y + 1.5, z);
      dome.userData = { age: 0, maxAge: 1.25 };
      group.add(dome);
      domes.push(dome);

      for (let i = 0; i < 24; i++) {
        const isNeedle = i % 3 === 0;
        const mat = new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? '#fff6d8' : accentColor,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
        });
        const m = new THREE.Mesh(isNeedle ? needleGeo : moteGeo, mat);
        const ang = (i / 24) * Math.PI * 2 + (i % 5) * 0.14;
        const rad = 0.8 + (i % 4) * 0.38;
        m.position.set(x + Math.cos(ang) * rad, y + 0.8 + (i % 3) * 0.45, z + Math.sin(ang) * rad);
        m.userData = {
          cx: x,
          cy: y + 0.8 + (i % 3) * 0.45,
          cz: z,
          ang,
          rad,
          age: -(i % 6) * 0.04,
          maxAge: 1.65 + (i % 4) * 0.18,
          vy: 1.85 + (i % 5) * 0.45,
          spin: (i % 2 === 0 ? 1 : -1) * (1.2 + (i % 3) * 0.35),
        };
        m.visible = m.userData.age >= 0;
        group.add(m);
        motes.push(m);
      }
    },
    update(dt) {
      for (let i = waves.length - 1; i >= 0; i--) {
        const w = waves[i];
        w.userData.age += dt;
        if (w.userData.age < 0) continue;
        w.visible = true;
        const t = w.userData.age / w.userData.maxAge;
        if (t >= 1) {
          group.remove(w);
          w.material.dispose();
          waves.splice(i, 1);
        } else {
          const eased = 1 - Math.pow(1 - t, 2.5);
          const sc = 1.2 + eased * w.userData.maxScale;
          w.scale.set(sc, 1, sc);
          w.position.y = w.userData.baseY + eased * 0.55;
          w.material.uniforms.uProgress.value = t;
        }
      }
      for (let i = domes.length - 1; i >= 0; i--) {
        const d = domes[i];
        d.userData.age += dt;
        const t = d.userData.age / d.userData.maxAge;
        if (t >= 1) {
          group.remove(d);
          d.material.dispose();
          domes.splice(i, 1);
        } else {
          const eased = 1 - Math.pow(1 - t, 2.2);
          d.scale.setScalar(0.8 + eased * 8.2);
          d.material.uniforms.uProgress.value = t;
        }
      }
      for (let i = motes.length - 1; i >= 0; i--) {
        const m = motes[i];
        m.userData.age += dt;
        if (m.userData.age < 0) continue;
        m.visible = true;
        const t = m.userData.age / m.userData.maxAge;
        if (t >= 1) {
          group.remove(m);
          m.material.dispose();
          motes.splice(i, 1);
        } else {
          const a = m.userData.ang + m.userData.spin * t;
          const r = m.userData.rad + t * 5.2;
          m.position.set(
            m.userData.cx + Math.cos(a) * r,
            m.userData.cy + m.userData.vy * m.userData.age,
            m.userData.cz + Math.sin(a) * r
          );
          m.rotation.y = a * 2.0;
          const sc = Math.sin(t * Math.PI) * 1.15;
          m.scale.setScalar(Math.max(0.05, sc));
          m.material.opacity = Math.sin(t * Math.PI) * 0.92;
        }
      }
    },
    dispose() {
      waves.forEach((w) => {
        group.remove(w);
        w.material.dispose();
      });
      domes.forEach((d) => {
        group.remove(d);
        d.material.dispose();
      });
      motes.forEach((m) => {
        group.remove(m);
        m.material.dispose();
      });
      waves.length = 0;
      domes.length = 0;
      motes.length = 0;
      ringGeo.dispose();
      domeGeo.dispose();
      moteGeo.dispose();
      needleGeo.dispose();
    },
  };
}

export function buildObelisksAndBell(
  group,
  scene,
  lightsList,
  { x, y, z, obelisks, bellColor = '#4f6d60', bellCapColor = '#efc252', roofMat, woodMat, stoneMat }
) {
  const pad = createBox(5.4, 0.24, 5.2, stoneMat);
  pad.position.set(x, y + 0.12, z);
  group.add(pad);

  const tower = new THREE.Group();
  tower.position.set(x, y, z);

  for (const px of [-2.2, 2.2]) {
    for (const pz of [-1.9, 1.9]) {
      const post = createBox(0.3, 4.3, 0.3, woodMat);
      post.position.set(px, 2.25, pz);
      tower.add(post);
    }
  }

  const eave = createBox(6.6, 0.26, 6.2, roofMat);
  eave.position.set(0, 4.4, 0);
  const upperRoof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 2.15, 4), roofMat);
  upperRoof.position.set(0, 5.58, 0);
  upperRoof.rotation.y = Math.PI / 4;
  upperRoof.castShadow = true;
  const finial = createCylinder(0.08, 0.16, 0.65, 8, createPixelToonMaterial({ color: bellCapColor }));
  finial.position.set(0, 6.88, 0);
  tower.add(eave, upperRoof, finial);

  const bronze = createPixelToonMaterial({ color: bellColor });
  const bellPivot = new THREE.Group();
  bellPivot.position.set(0, 3.98, 0);
  const hanger = createCylinder(0.08, 0.08, 0.55, 6, woodMat);
  hanger.position.set(0, -0.25, 0);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.58, 12, 8), bronze);
  crown.position.set(0, -0.68, 0);
  const body = createCylinder(0.58, 0.72, 1.35, 14, bronze);
  body.position.set(0, -1.32, 0);
  const rim = createCylinder(0.74, 0.76, 0.2, 14, createPixelToonMaterial({ color: '#698a78' }));
  rim.position.set(0, -1.98, 0);
  bellPivot.add(hanger, crown, body, rim);
  tower.add(bellPivot);

  const bellLockGroup = new THREE.Group();
  bellLockGroup.position.set(0, 2.45, 0);
  const lockMat = new THREE.MeshBasicMaterial({
    color: '#ffd782',
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < 2; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.15 + i * 0.28, 0.045, 6, 24), lockMat);
    r.rotation.x = i === 0 ? 0.45 : -0.45;
    r.rotation.y = i * 0.8;
    bellLockGroup.add(r);
  }
  tower.add(bellLockGroup);
  group.add(tower);

  const sealObelisks = [];
  obelisks.forEach((ob) => {
    const obG = new THREE.Group();
    obG.position.set(ob.x, y, ob.z);
    const ped = createBox(0.9, 0.35, 0.9, stoneMat);
    ped.position.set(0, 0.175, 0);
    const shaft = createBox(0.54, 1.5, 0.54, createPixelToonMaterial({ color: '#8f897d' }));
    shaft.position.set(0, 1.1, 0);
    const cMat = new THREE.MeshBasicMaterial({ color: '#4c4f61' });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), cMat);
    crystal.position.set(0, 2.28, 0);
    const ringMat = new THREE.MeshBasicMaterial({
      color: ob.color,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
    });
    const baseRing = new THREE.Mesh(new THREE.RingGeometry(0.56, 0.72, 16), ringMat);
    baseRing.rotation.x = -Math.PI / 2;
    baseRing.position.set(0, 0.03, 0);
    obG.add(ped, shaft, crystal, baseRing);
    group.add(obG);

    const light = new THREE.PointLight(ob.color, 0, 7.5, 1.5);
    light.position.set(ob.x, y + 2.4, ob.z);
    scene.add(light);
    lightsList.push(light);

    sealObelisks.push({
      crystal,
      mat: cMat,
      ringMat,
      light,
      activeColor: ob.color,
      awakened: false,
      x: ob.x,
      y: y + 2.28,
      z: ob.z,
    });
  });

  const flyingOrbs = [];
  const bellFx = createBellResonanceManager(group);
  let bellSwing = 0;
  let hintTimer = 0;

  return {
    bellX: x,
    bellY: y,
    bellZ: z,
    setSealAwakened(sealIndex, awakened) {
      const ob = sealObelisks[sealIndex];
      if (!ob) return;
      ob.awakened = Boolean(awakened);
      ob.mat.color.set(awakened ? ob.activeColor : '#4c4f61');
      ob.ringMat.opacity = awakened ? 0.95 : 0.34;
      ob.light.intensity = awakened ? 2.6 : 0;
    },
    setBellUnsealed(unsealed) {
      bellLockGroup.visible = !unsealed;
    },
    triggerHintPulse() {
      hintTimer = 6.0;
    },
    launchSealOrb(fromPos, sealIndex) {
      const ob = sealObelisks[sealIndex];
      if (!ob) return;
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 10, 8),
        new THREE.MeshBasicMaterial({ color: ob.activeColor })
      );
      orb.position.copy(fromPos);
      scene.add(orb);
      flyingOrbs.push({
        mesh: orb,
        start: fromPos.clone(),
        end: new THREE.Vector3(ob.x, ob.y, ob.z),
        t: 0,
        sealIndex,
      });
    },
    ringBell() {
      bellSwing = 0.3;
      bellFx.trigger(x, y + 0.4, z, bellCapColor || '#ffe49e');
    },
    update(dt, elapsed) {
      for (let i = 0; i < sealObelisks.length; i++) {
        const ob = sealObelisks[i];
        ob.crystal.rotation.y = elapsed * 1.4 + i;
        ob.crystal.position.y = 2.28 + Math.sin(elapsed * 2.4 + i) * 0.08;
        if (hintTimer > 0) {
          ob.crystal.scale.setScalar(1 + 0.22 * (0.5 + 0.5 * Math.sin(elapsed * 5.5)));
        } else {
          ob.crystal.scale.setScalar(1);
        }
      }
      if (hintTimer > 0) hintTimer = Math.max(0, hintTimer - dt);
      if (bellLockGroup.visible) bellLockGroup.rotation.y = elapsed * 0.7;

      if (bellSwing > 0.001) {
        bellPivot.rotation.x = Math.sin(elapsed * 6.5) * bellSwing;
        bellSwing *= Math.exp(-dt * 1.4);
      } else {
        bellPivot.rotation.x = 0;
        bellSwing = 0;
      }

      for (let i = flyingOrbs.length - 1; i >= 0; i--) {
        const fo = flyingOrbs[i];
        fo.t += dt * 0.65;
        if (fo.t >= 1) {
          this.setSealAwakened(fo.sealIndex, true);
          scene.remove(fo.mesh);
          fo.mesh.geometry.dispose();
          fo.mesh.material.dispose();
          flyingOrbs.splice(i, 1);
        } else {
          const s = fo.t;
          fo.mesh.position.lerpVectors(fo.start, fo.end, s);
          fo.mesh.position.y += Math.sin(s * Math.PI) * 8.5;
        }
      }

      bellFx.update(dt);
    },
    dispose() {
      flyingOrbs.forEach((fo) => {
        scene.remove(fo.mesh);
        fo.mesh.geometry.dispose();
        fo.mesh.material.dispose();
      });
      flyingOrbs.length = 0;
      bellFx.dispose();
    },
  };
}

const CASCADE_VERT = /* glsl */ `
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

const CASCADE_FRAG = /* glsl */ `
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

export function buildOrganicCascade(
  group,
  waterfallMaterials,
  plungeFoams,
  {
    x,
    zTop,
    yTop,
    yBot,
    dropDist = 3.8,
    width = 2.4,
    yaw = 0,
    seed = 1,
    cliffMat,
    capColor = '#5d7c34',
  }
) {
  const cg = new THREE.Group();
  cg.position.set(x, 0, zTop);
  cg.rotation.y = yaw;

  const h = Math.max(1.8, yTop - yBot);
  if (cliffMat) {
    const cliffBack = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.82, width * 1.06, h + 1.2, 10), cliffMat);
    cliffBack.position.set(0, yBot + (h - 0.8) * 0.5, -0.55);
    cliffBack.scale.set(1.25, 1, 0.72);
    cliffBack.castShadow = true;
    cliffBack.receiveShadow = true;
    cg.add(cliffBack);
  }

  const streams = [
    { baseX: -0.15, w: width * 0.82, bendX: -0.45, driftX: 0.24, phase: 0.2, s: seed + 1.1 },
    { baseX: 0.55, w: width * 0.46, bendX: 0.36, driftX: -0.18, phase: 1.2, s: seed + 3.4 },
    { baseX: -0.78, w: width * 0.3, bendX: -0.28, driftX: 0.16, phase: 0.7, s: seed + 5.7 },
  ];

  streams.forEach((st) => {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: globalToonUniforms.uTime,
        uSeed: { value: st.s },
        uDeepColor: { value: new THREE.Color('#5dc0e2') },
        uFoamColor: { value: new THREE.Color('#f7fdff') },
      },
      vertexShader: CASCADE_VERT,
      fragmentShader: CASCADE_FRAG,
      side: THREE.DoubleSide,
    });
    waterfallMaterials.push(mat);

    const geo = new THREE.PlaneGeometry(1, 1, 12, 22);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const t = Math.max(0, Math.min(1, 0.5 - vy));
      const cx = st.baseX + Math.sin(t * Math.PI * 1.35 + st.phase) * st.bendX + st.driftX * t;
      const wScale = 0.76 + Math.sin(t * Math.PI) * 0.14 + Math.pow(t, 1.4) * 0.46;
      const wy = THREE.MathUtils.lerp(yTop, yBot - 0.12, Math.pow(t, 1.32));
      const archFwd = Math.sin(t * Math.PI * 0.5);
      const rockBump = Math.sin(t * Math.PI * 2.4 + st.s) * 0.12 * Math.sin(t * Math.PI);
      const crossArch = Math.cos(vx * Math.PI) * 0.22 * (0.4 + 0.6 * Math.sin(t * Math.PI));
      const wz = dropDist * archFwd + rockBump + crossArch;
      pos.setXYZ(i, cx + vx * st.w * wScale, wy, wz);
    }
    geo.computeVertexNormals();
    cg.add(new THREE.Mesh(geo, mat));
  });

  if (cliffMat) {
    const capMat = createPixelToonMaterial({ color: capColor });
    const boulders = [
      [-width * 0.62, yTop - 0.08, -0.05, 0.72],
      [width * 0.62, yTop - 0.06, 0.05, 0.68],
      [-width * 0.68, yBot + 0.18, dropDist * 0.85, 0.82],
      [width * 0.68, yBot + 0.18, dropDist * 0.88, 0.78],
    ];
    boulders.forEach(([bx, by, bz, r], idx) => {
      const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), cliffMat);
      rk.position.set(bx, by, bz);
      rk.scale.set(1.18, 0.78, 1.06);
      rk.rotation.y = idx * 0.9;
      rk.castShadow = true;
      cg.add(rk);
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(r * 0.76, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
        capMat
      );
      cap.position.set(bx, by + r * 0.25, bz);
      cap.scale.set(1.06, 0.52, 0.96);
      cg.add(cap);
    });

    // World-space colliders: the rock face behind the fall and the two lip boulders
    const toWorld = (lx, lz) => [
      x + lx * Math.cos(yaw) + lz * Math.sin(yaw),
      zTop - lx * Math.sin(yaw) + lz * Math.cos(yaw),
    ];
    const rx = width * 1.06 * 1.25;
    const rz = width * 1.06 * 0.72;
    const [ax, az] = toWorld(-(rx - rz), -0.55);
    const [bx, bz] = toWorld(rx - rz, -0.55);
    cg.userData.collider = { ax, az, bx, bz, r: rz };
    cg.userData.circleColliders = boulders.slice(0, 2).map(([lx, , lz, r]) => {
      const [wx, wz] = toWorld(lx, lz);
      return { x: wx, z: wz, r: r * 1.05 };
    });
  }

  group.add(cg);

  const fx = x + Math.sin(yaw) * (dropDist * 0.96);
  const fz = zTop + Math.cos(yaw) * (dropDist * 0.96);
  const mistMat = new THREE.MeshBasicMaterial({
    color: '#f3fcff',
    transparent: true,
    opacity: 0.74,
    depthWrite: false,
  });
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const size = 0.16 + (i % 3) * 0.07;
    const s = new THREE.Mesh(new THREE.SphereGeometry(size, 7, 6), mistMat.clone());
    s.position.set(fx + Math.cos(ang) * 0.9, yBot + 0.08, fz + Math.sin(ang) * 0.7);
    s.userData = {
      kind: 'mist',
      cx: fx,
      cy: yBot + 0.08,
      cz: fz,
      rad: 0.95,
      baseAngle: ang,
      phase: i * 0.68 + seed,
    };
    group.add(s);
    plungeFoams.push(s);
  }
  for (let rIdx = 0; rIdx < 3; rIdx++) {
    const rGeo = new THREE.RingGeometry(0.62, 0.9, 20);
    rGeo.rotateX(-Math.PI / 2);
    const rMat = new THREE.MeshBasicMaterial({
      color: '#f7fdff',
      transparent: true,
      opacity: 0.64,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(rGeo, rMat);
    ring.position.set(fx, yBot + 0.04, fz);
    ring.userData = { kind: 'ring', baseScale: 0.92 + width * 0.15, phase: rIdx / 3 + seed * 0.2 };
    group.add(ring);
    plungeFoams.push(ring);
  }
  return cg;
}

export function updateCascades(plungeFoams, elapsed) {
  for (let i = 0; i < plungeFoams.length; i++) {
    const f = plungeFoams[i];
    const u = f.userData;
    if (u.kind === 'ring') {
      const cycle = (elapsed * 0.55 + u.phase) % 1;
      const sc = u.baseScale * (0.45 + cycle * 1.45);
      f.scale.set(sc, 1, sc * 0.72);
      f.material.opacity = (1 - cycle) * 0.62;
    } else {
      const cycle = (elapsed * 0.95 + u.phase) % 1;
      const ang = u.baseAngle + elapsed * 0.65;
      const rad = u.rad * (0.52 + cycle * 0.65);
      f.position.x = u.cx + Math.cos(ang) * rad;
      f.position.z = u.cz + Math.sin(ang) * rad * 0.74;
      f.position.y = u.cy + cycle * 0.88;
      const puffSc = Math.sin(cycle * Math.PI) * 1.15;
      f.scale.setScalar(Math.max(0.05, puffSc));
      f.material.opacity = Math.sin(cycle * Math.PI) * 0.65;
    }
  }
}

export function buildGroundFoliage(
  group,
  terrain,
  bounds,
  {
    count = 850,
    allowedSurfaces = ['grass'],
    grassColor = '#ffffff',
    flowerColor = '#ffffff',
    flowerRatio = 0.16,
    mapPlain = null,
    mapFlower = null,
    seed = 202611,
  } = {}
) {
  const rand = seededRand(seed);
  const bladeGeo = new THREE.PlaneGeometry(0.44, 0.44);
  bladeGeo.translate(0, 0.21, 0);

  const plainMat = createPixelToonMaterial({
    color: grassColor,
    map: mapPlain || getGrassSprigTexture(false),
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    windSway: { amp: 0.07, speed: 2.35, baseHeight: 0.0, topHeight: 0.45 },
  });
  const flowerMat = createPixelToonMaterial({
    color: flowerColor,
    map: mapFlower || getGrassSprigTexture(true),
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    windSway: { amp: 0.07, speed: 2.35, baseHeight: 0.0, topHeight: 0.45 },
  });

  const plainList = [];
  const flowerList = [];
  let attempts = 0;
  const maxAttempts = count * 16;
  const spanX = bounds.maxX - bounds.minX;
  const spanZ = bounds.maxZ - bounds.minZ;

  while (plainList.length + flowerList.length < count && attempts < maxAttempts) {
    attempts++;
    const x = bounds.minX + rand() * spanX;
    const z = bounds.minZ + rand() * spanZ;
    const deck = terrain.getSurfaceAndHeightAt(x, z);
    if (!deck.hit || !allowedSurfaces.includes(deck.surface)) continue;
    if (terrain._hitsCollider(x, z, 0.68)) continue;

    const item = { x, y: deck.y, z, rot: rand() * Math.PI, sc: 0.78 + rand() * 0.65 };
    if (rand() < flowerRatio) flowerList.push(item);
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
    group.add(inst);
  };

  populate(plainList, plainMat);
  populate(flowerList, flowerMat);
}

export function addStonePad(group, cx, cz, y, w, d, tint = '#ffffff') {
  const tex = getStoneMasonryTexture().clone();
  tex.needsUpdate = true;
  tex.repeat.set(Math.max(1, Math.round(w / 2.6)), Math.max(1, Math.round(d / 2.6)));
  const mat = createPixelToonMaterial({ color: tint, map: tex });
  const pad = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), mat);
  pad.position.set(cx, y - 0.05, cz);
  pad.receiveShadow = true;
  group.add(pad);
  return pad;
}

export function addWoodenDeck(group, cx, cz, y, w, d, woodPlankMat) {
  const deck = createBox(w, 0.2, d, woodPlankMat);
  deck.position.set(cx, y - 0.08, cz);
  group.add(deck);
  return deck;
}

export function buildFenceLine(group, { x0, z0, x1, z1, y, posts = 5, mat, height = 0.85 }) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  if (len < 0.2) return null;
  for (let i = 0; i < posts; i++) {
    const t = posts > 1 ? i / (posts - 1) : 0;
    const p = createBox(0.14, height, 0.14, mat);
    p.position.set(x0 + dx * t, y + height * 0.5, z0 + dz * t);
    group.add(p);
  }
  for (const hFrac of [0.58, 0.92]) {
    const rail = createBox(0.1, 0.09, len + 0.1, mat);
    rail.position.set((x0 + x1) * 0.5, y + height * hFrac, (z0 + z1) * 0.5);
    rail.lookAt(x1, y + height * hFrac, z1);
    group.add(rail);
  }
  // Thin wall collider so the player cannot walk through the rails
  return { ax: x0, az: z0, bx: x1, bz: z1, r: 0.12 };
}

export function buildBench(group, { x, y, z, yaw = 0, woodMat, woodDarkMat, cushionColor = null }) {
  const b = new THREE.Group();
  b.position.set(x, y, z);
  b.rotation.y = yaw;
  const seat = createBox(2.1, 0.12, 0.68, woodMat);
  seat.position.set(0, 0.44, 0);
  b.add(seat);
  for (const lx of [-0.78, 0.78]) {
    const leg = createBox(0.14, 0.42, 0.56, woodDarkMat);
    leg.position.set(lx, 0.21, 0);
    b.add(leg);
  }
  if (cushionColor) {
    const cushion = createBox(0.88, 0.07, 0.54, createPixelToonMaterial({ color: cushionColor }));
    cushion.position.set(0, 0.53, 0);
    b.add(cushion);
  }
  group.add(b);
  return { x, y, z, yaw, group: b };
}

export function buildChochinGarland(
  group,
  {
    ax,
    az,
    bx,
    bz,
    ay,
    by = null,
    aGroundY = null,
    bGroundY = null,
    sag = 0.65,
    count = 6,
    chochinMat,
    cordColor = '#3a2c24',
  }
) {
  const endY = by === null ? ay : by;
  const cordMat = createPixelToonMaterial({ color: cordColor });
  const capMat = createPixelToonMaterial({ color: '#2b2433' });
  const gg = new THREE.Group();

  const addPole = (px, pz, gY, topY) => {
    const h = Math.max(0.8, topY - gY + 0.25);
    const pole = createCylinder(0.075, 0.1, h, 8, cordMat);
    pole.position.set(px, gY + h * 0.5, pz);
    const foot = createBox(0.38, 0.24, 0.38, capMat);
    foot.position.set(px, gY + 0.12, pz);
    const fin = createBox(0.24, 0.14, 0.24, capMat);
    fin.position.set(px, gY + h + 0.05, pz);
    gg.add(pole, foot, fin);
  };
  if (aGroundY !== null) addPole(ax, az, aGroundY, ay);
  if (bGroundY !== null) addPole(bx, bz, bGroundY, endY);

  const segs = Math.max(count + 2, 8);
  const evalPt = (t) =>
    new THREE.Vector3(
      THREE.MathUtils.lerp(ax, bx, t),
      THREE.MathUtils.lerp(ay, endY, t) - sag * 4 * t * (1 - t),
      THREE.MathUtils.lerp(az, bz, t)
    );
  for (let i = 0; i < segs; i++) {
    const p0 = evalPt(i / segs);
    const p1 = evalPt((i + 1) / segs);
    const seg = createBox(0.04, 0.04, p0.distanceTo(p1) + 0.04, cordMat, false, false);
    seg.position.copy(p0).lerp(p1, 0.5);
    seg.lookAt(p1);
    gg.add(seg);
  }
  const lanterns = [];
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    const pt = evalPt(t);
    const pivot = new THREE.Group();
    pivot.position.set(pt.x, pt.y, pt.z);
    const bulb = createCylinder(0.18, 0.18, 0.34, 8, chochinMat, false, false);
    bulb.position.set(0, -0.22, 0);
    const capT = createCylinder(0.14, 0.14, 0.05, 8, capMat, false, false);
    capT.position.set(0, -0.04, 0);
    const capB = createCylinder(0.14, 0.14, 0.05, 8, capMat, false, false);
    capB.position.set(0, -0.4, 0);
    pivot.add(bulb, capT, capB);
    pivot.userData = { phase: i * 0.82 + ax * 0.15, jiggle: 0 };
    gg.add(pivot);
    lanterns.push(pivot);
  }
  group.add(gg);
  return { group: gg, lanterns };
}

export function updateChochins(lanterns, dt, elapsed, playerPos = null) {
  for (let i = 0; i < lanterns.length; i++) {
    const ch = lanterns[i];
    const u = ch.userData;
    if (playerPos) {
      const dx = playerPos.x - ch.position.x;
      const dz = playerPos.z - ch.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.2) u.jiggle = Math.max(u.jiggle || 0, (1 - d / 2.2) * 0.24);
    }
    u.jiggle = (u.jiggle || 0) * Math.exp(-dt * 2.2);
    ch.rotation.z = Math.sin(elapsed * 2.1 + u.phase) * (0.075 + u.jiggle);
    ch.rotation.x = Math.cos(elapsed * 1.65 + u.phase) * (0.05 + u.jiggle * 0.7);
  }
}

/**
 * Footprint colliders of the props added directly to `group` by buildJapaneseBuilding()
 * and buildOrganicCascade(), ready for LevelTerrain.addColliders().
 */
export function collectPropColliders(group) {
  const segments = [];
  const circles = [];
  group.children.forEach((c) => {
    if (c.userData.collider) segments.push(c.userData.collider);
    if (c.userData.circleColliders) circles.push(...c.userData.circleColliders);
  });
  return { segments, circles };
}

export function buildJapaneseBuilding(
  group,
  {
    x,
    y,
    z,
    yaw = 0,
    w = 6.8,
    d = 5.4,
    h = 2.8,
    floors = 1,
    wallColor = '#ece1cc',
    woodColor = '#5a3b26',
    roofMat,
    woodPlankMat,
    shojiMaterials = null,
    engawa = true,
    norenColor = null,
  }
) {
  const bg = new THREE.Group();
  bg.position.set(x, y, z);
  bg.rotation.y = yaw;
  bg.userData.norenFlaps = [];

  const woodDark = createPixelToonMaterial({ color: woodColor });
  const wallMat = createPixelToonMaterial({ color: wallColor });
  const goldMat = createPixelToonMaterial({ color: '#efc04c' });
  const shojiMat = createPixelToonMaterial({
    color: '#fff4d6',
    emissive: '#ffaa44',
    emissiveIntensity: 0.28,
  });
  if (shojiMaterials) shojiMaterials.push(shojiMat);

  const plinth = createBox(w + 0.6, 0.36, d + 0.6, woodDark);
  plinth.position.set(0, 0.18, 0);
  bg.add(plinth);

  if (engawa) {
    const deck = createBox(w + 1.8, 0.22, d + 1.8, woodPlankMat);
    deck.position.set(0, 0.12, 0.2);
    const step = createBox(2.2, 0.16, 0.85, woodDark);
    step.position.set(0, 0.06, (d + 1.8) * 0.5 + 0.45);
    bg.add(deck, step);
  }

  const room = createBox(w, h, d, wallMat);
  room.position.set(0, 0.36 + h * 0.5, 0);
  bg.add(room);

  const frontShoji = createBox(w * 0.62, h * 0.68, 0.14, shojiMat, false, false);
  frontShoji.position.set(0, 0.36 + h * 0.42, d * 0.5 + 0.03);
  const sideShojiL = createBox(0.14, h * 0.6, d * 0.55, shojiMat, false, false);
  sideShojiL.position.set(-w * 0.5 - 0.03, 0.36 + h * 0.44, 0);
  const sideShojiR = createBox(0.14, h * 0.6, d * 0.55, shojiMat, false, false);
  sideShojiR.position.set(w * 0.5 + 0.03, 0.36 + h * 0.44, 0);
  bg.add(frontShoji, sideShojiL, sideShojiR);

  for (const px of [-w * 0.5, 0, w * 0.5]) {
    for (const pz of [-d * 0.5, d * 0.5]) {
      const post = createBox(0.22, h + 0.15, 0.22, woodDark);
      post.position.set(px, 0.36 + h * 0.5, pz);
      bg.add(post);
    }
  }

  if (norenColor) {
    const norenMat = createPixelToonMaterial({ color: norenColor, side: THREE.DoubleSide });
    for (let i = -1; i <= 1; i++) {
      const flapPivot = new THREE.Group();
      flapPivot.position.set(i * 0.64, 0.36 + h * 0.89, d * 0.5 + 0.22);
      const flap = createBox(0.56, 0.72, 0.05, norenMat);
      flap.position.set(0, -0.36, 0);
      flapPivot.add(flap);
      flapPivot.userData = { phase: i * 0.65 + x * 0.2 };
      bg.add(flapPivot);
      bg.userData.norenFlaps.push(flapPivot);
    }
  }

  const addTierRoof = (rw, rd, ry, peakH) => {
    const eave = createBox(rw + 1.5, 0.24, rd + 1.5, roofMat);
    eave.position.set(0, ry, 0);
    const rad = Math.hypot(rw, rd) * 0.56;
    const pitch = new THREE.Mesh(new THREE.ConeGeometry(rad, peakH, 4), roofMat);
    pitch.position.set(0, ry + peakH * 0.5 + 0.06, 0);
    pitch.rotation.y = Math.PI / 4;
    pitch.scale.set(rw / (rad * 1.25), 1, rd / (rad * 1.25));
    pitch.castShadow = true;
    const ridge = createBox(rw * 0.52, 0.22, 0.26, woodDark);
    ridge.position.set(0, ry + peakH + 0.04, 0);
    bg.add(eave, pitch, ridge);
    for (const sx of [-1, 1]) {
      const fin = createBox(0.24, 0.26, 0.24, goldMat);
      fin.position.set(sx * rw * 0.26, ry + peakH + 0.16, 0);
      bg.add(fin);
    }
  };

  addTierRoof(w, d, 0.36 + h + 0.08, 1.55);

  if (floors >= 2) {
    const w2 = w * 0.68;
    const d2 = d * 0.68;
    const h2 = h * 0.82;
    const y2 = 0.36 + h + 0.85;
    const upper = createBox(w2, h2, d2, wallMat);
    upper.position.set(0, y2 + h2 * 0.5, 0);
    const upperShoji = createBox(w2 * 0.62, h2 * 0.62, 0.12, shojiMat, false, false);
    upperShoji.position.set(0, y2 + h2 * 0.45, d2 * 0.5 + 0.03);
    bg.add(upper, upperShoji);
    addTierRoof(w2, d2, y2 + h2 + 0.06, 1.35);
  }

  // Capsule footprint of the plinth (segment along the long side), for LevelTerrain.segments
  const pw = w + 0.6;
  const pd = d + 0.6;
  const along = pw >= pd ? [Math.cos(yaw), -Math.sin(yaw)] : [Math.sin(yaw), Math.cos(yaw)];
  const half = Math.abs(pw - pd) * 0.5;
  bg.userData.collider = {
    ax: x - along[0] * half,
    az: z - along[1] * half,
    bx: x + along[0] * half,
    bz: z + along[1] * half,
    r: Math.min(pw, pd) * 0.5,
  };

  group.add(bg);
  return bg;
}

export function buildMossBoulders(group, specs, cliffMat, capColor = '#5d7c34') {
  const capMat = createPixelToonMaterial({ color: capColor });
  const colliders = [];
  specs.forEach(([x, y, z, r, rot = 0]) => {
    // Footprint of the squashed dodecahedron (scale 1.25 × 1.08)
    colliders.push({ x, z, r: r * 1.1 });
    const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), cliffMat);
    rk.position.set(x, y + r * 0.38, z);
    rk.scale.set(1.25, 0.72, 1.08);
    rk.rotation.y = rot;
    rk.castShadow = true;
    rk.receiveShadow = true;
    group.add(rk);

    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.78, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
      capMat
    );
    cap.position.set(x - r * 0.08, y + r * 0.62, z + r * 0.06);
    cap.scale.set(1.12, 0.46, 1.0);
    cap.receiveShadow = true;
    group.add(cap);
  });
  return colliders;
}

// Each culm is a group rooted at its base so the culm, its nodes and its leaf
// sprays share one wind sway (windSway reads local height) and never drift apart.
// Real bamboo: tapering culm, internodes that lengthen with height, a pale waxy
// band under each node, and leafy twigs only on the upper ~45% of the culm.
export function buildBambooCluster(group, specs, _treeSet) {
  const sway = (top) => ({ amp: 0.07, speed: 1.7, baseHeight: 0.0, topHeight: top });
  const culmMats = ['#6b943e', '#7a9f45', '#5e8738'].map((color) =>
    createPixelToonMaterial({ color, windSway: sway(6.0) })
  );
  const nodeMat = createPixelToonMaterial({ color: '#a3bf66', windSway: sway(6.0) });
  const frondMat = createPixelToonMaterial({
    color: '#9ed058',
    map: getLeafClusterTexture('bamboo'),
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    windSway: { amp: 0.11, speed: 2.1, baseHeight: 0.0, topHeight: 6.0 },
  });
  const twigMat = createPixelToonMaterial({ color: '#6f8f3c', windSway: sway(6.0) });

  // windSway reads the geometry's own y, so every part is baked into culm space.
  const bakeM = new THREE.Matrix4();
  const bakeQ = new THREE.Quaternion();
  const bakeE = new THREE.Euler();
  const ONE = new THREE.Vector3(1, 1, 1);
  const bake = (geo, px, py, pz, rx = 0, ry = 0, rz = 0) => {
    bakeQ.setFromEuler(bakeE.set(rx, ry, rz));
    bakeM.compose(new THREE.Vector3(px, py, pz), bakeQ, ONE);
    return geo.applyMatrix4(bakeM);
  };
  const addMerged = (parent, geos, mat, shadow) => {
    if (!geos.length) return;
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    geos.forEach((g) => g.dispose());
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
  };

  specs.forEach(([x, y, z, h = 5.4, leanX = 0.03, leanZ = 0.02], idx) => {
    const culm = new THREE.Group();
    culm.position.set(x, y, z);
    culm.rotation.set(leanX, 0, leanZ);
    group.add(culm);

    const baseR = 0.1 + (idx % 3) * 0.012;
    addMerged(culm, [bake(new THREE.CylinderGeometry(baseR * 0.62, baseR, h, 8, 6), 0, h * 0.5, 0)], culmMats[idx % culmMats.length], true);

    // Nodes: internodes grow from ~0.55 m at the base to ~1.3 m near the crown.
    const rings = [];
    let n = 0.45;
    let gap = 0.55;
    while (n < h - 0.4) {
      const rAt = baseR * (1 - 0.38 * (n / h));
      rings.push(bake(new THREE.CylinderGeometry(rAt * 1.16, rAt * 1.16, 0.06, 8), 0, n, 0));
      n += gap;
      gap = Math.min(gap * 1.17, 1.3);
    }
    addMerged(culm, rings, nodeMat, false);

    // Leaf sprays on short twigs, alternating sides, drooping as they go out.
    const twigs = [];
    const fronds = [];
    const sprays = 5 + (idx % 3);
    for (let f = 0; f < sprays; f++) {
      const t = f / (sprays - 1);
      const sy = h * (0.55 + 0.45 * t);
      const ang = idx * 1.7 + f * 2.4 + (f % 2) * Math.PI;
      const reach = 0.42 - 0.18 * t;
      const cx = Math.cos(ang);
      const cz = Math.sin(ang);
      twigs.push(bake(new THREE.CylinderGeometry(0.012, 0.018, reach, 4), cx * reach * 0.5, sy - 0.04, cz * reach * 0.5, 0, -ang, Math.PI * 0.5 - 0.35));

      const size = 0.95 - 0.3 * t + (f % 2) * 0.12;
      for (let c = 0; c < 2; c++) {
        fronds.push(bake(
          new THREE.PlaneGeometry(1.15 * size, 0.92 * size),
          cx * (reach + 0.18), sy - 0.18 * size, cz * (reach + 0.18),
          0.38 + c * 0.25, ang + c * Math.PI * 0.5, 0.22
        ));
      }
    }
    addMerged(culm, twigs, twigMat, false);
    addMerged(culm, fronds, frondMat, true);
  });
}

export function buildSteppingStoneMeshes(group, stones, { stoneMat, cliffMat, capColor = null, height = 1.6 }) {
  const capMat = capColor ? createPixelToonMaterial({ color: capColor }) : null;
  const meshes = [];
  stones.forEach((s, idx) => {
    const rad = s.visualR ?? Math.min(s.r * 0.86, 1.35);
    const g = new THREE.Group();
    g.position.set(s.x, s.y, s.z);
    g.rotation.y = idx * 0.85;

    const pillar = createCylinder(rad * 0.94, rad * 1.16, height, 10, cliffMat || stoneMat);
    pillar.position.y = -height * 0.5 - 0.05;
    pillar.scale.set(1.06, 1, 0.94);
    const slab = createCylinder(rad, rad * 1.04, 0.24, 12, stoneMat);
    slab.position.y = -0.11;
    slab.scale.set(1.06, 1, 0.94);
    g.add(pillar, slab);

    if (capMat) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(rad * 0.82, 0.11, 6, 14), capMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = -0.02;
      rim.scale.set(1.04, 0.94, 1);
      g.add(rim);
    }
    group.add(g);
    meshes.push(g);
  });
  return meshes;
}

export function buildCirclingBirds(group, specs) {
  const birds = [];
  specs.forEach((sp, i) => {
    const kind = sp.kind || 'gull';
    const bg = new THREE.Group();
    const bodyCol = kind === 'crane' ? '#ffd9c2' : kind === 'swallow' ? '#2c354d' : '#faf8f2';
    const wingCol = kind === 'crane' ? '#fff3e8' : kind === 'swallow' ? '#3a4666' : '#ffffff';
    const bodyMat = createPixelToonMaterial({ color: bodyCol });
    const wingMat = createPixelToonMaterial({ color: wingCol, side: THREE.DoubleSide });

    const body = createBox(0.16, 0.14, 0.52, bodyMat, false, false);
    const wingL = new THREE.Group();
    const wingLMesh = createBox(0.55, 0.04, 0.22, wingMat, false, false);
    wingLMesh.position.set(-0.28, 0, 0);
    wingL.add(wingLMesh);
    const wingR = new THREE.Group();
    const wingRMesh = createBox(0.55, 0.04, 0.22, wingMat, false, false);
    wingRMesh.position.set(0.28, 0, 0);
    wingR.add(wingRMesh);
    bg.add(body, wingL, wingR);
    group.add(bg);

    birds.push({
      bg,
      wingL,
      wingR,
      cx: sp.cx || 0,
      cz: sp.cz || 0,
      cy: sp.y || 9,
      rx: sp.rx || 14,
      rz: sp.rz || 11,
      speed: sp.speed || 0.32,
      phase: sp.phase ?? i * 1.1,
    });
  });

  return {
    update(elapsed) {
      for (let i = 0; i < birds.length; i++) {
        const b = birds[i];
        const a = elapsed * b.speed + b.phase;
        const x = b.cx + Math.cos(a) * b.rx;
        const z = b.cz + Math.sin(a) * b.rz;
        const nx = b.cx + Math.cos(a + 0.05) * b.rx;
        const nz = b.cz + Math.sin(a + 0.05) * b.rz;
        b.bg.position.set(x, b.cy + Math.sin(elapsed * 1.6 + b.phase) * 0.45, z);
        b.bg.rotation.y = Math.atan2(nx - x, nz - z);
        const flap = Math.sin(elapsed * 7.2 + b.phase) * 0.48;
        b.wingL.rotation.z = flap;
        b.wingR.rotation.z = -flap;
      }
    },
  };
}

export function buildFloatingBoat(
  group,
  { x, y, z, yaw = 0, hullColor = '#7c4c2b', trimColor = '#d63b2a', lanternColor = '#ffbe66', scale = 1.0 }
) {
  const boat = new THREE.Group();
  boat.position.set(x, y, z);
  boat.rotation.y = yaw;
  boat.scale.setScalar(scale);
  const hullMat = createPixelToonMaterial({ color: hullColor });
  const trimMat = createPixelToonMaterial({ color: trimColor });
  const hull = createBox(1.15, 0.34, 2.8, hullMat);
  const prow = createBox(0.75, 0.3, 0.9, hullMat);
  prow.position.set(0, 0.08, 1.5);
  const rail = createBox(1.22, 0.1, 2.86, trimMat);
  rail.position.set(0, 0.18, 0);
  const pole = createCylinder(0.04, 0.05, 0.9, 6, trimMat);
  pole.position.set(0, 0.55, 1.15);
  const lantern = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshBasicMaterial({ color: lanternColor })
  );
  lantern.position.set(0, 1.0, 1.15);
  boat.add(hull, prow, rail, pole, lantern);
  group.add(boat);
  return boat;
}

export function buildParticleField(group, kind, bounds, count = 85) {
  const palette = {
    snow: '#f5faff',
    steam: '#f2f9ff',
    petals: '#ffd0df',
    fireflies: '#d6ff82',
    wind: '#e2fff2',
    stars: '#ffe599',
  };
  const geo =
    kind === 'snow' || kind === 'petals'
      ? new THREE.PlaneGeometry(0.16, 0.16)
      : kind === 'wind'
      ? new THREE.BoxGeometry(0.55, 0.04, 0.04)
      : new THREE.OctahedronGeometry(kind === 'steam' ? 0.24 : 0.11, 0);
  const mat = new THREE.MeshBasicMaterial({
    color: palette[kind] || '#ffffff',
    transparent: true,
    opacity: kind === 'fireflies' ? 0.0 : kind === 'steam' ? 0.42 : 0.82,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  group.add(mesh);

  const dummy = new THREE.Object3D();
  const data = [];
  for (let i = 0; i < count; i++) {
    data.push({
      x: bounds.minX + ((i * 19.7) % (bounds.maxX - bounds.minX)),
      y: bounds.minY + ((i * 5.3) % (bounds.maxY - bounds.minY)),
      z: bounds.minZ + ((i * 23.1) % (bounds.maxZ - bounds.minZ)),
      phase: i * 0.71,
      speed: 0.7 + (i % 5) * 0.24,
    });
  }

  let intensity = kind === 'fireflies' ? 0 : 1;
  let stormTimer = 0;

  return {
    setIntensity(v) {
      intensity = kind === 'fireflies' ? v : 1;
      mat.opacity = kind === 'fireflies' ? v * 0.92 : kind === 'steam' ? 0.42 : 0.82;
    },
    triggerStorm() {
      stormTimer = 6.0;
    },
    update(dt, elapsed) {
      if (stormTimer > 0) stormTimer = Math.max(0, stormTimer - dt);
      const boost = stormTimer > 0 ? 1 + (stormTimer / 6.0) * 1.4 : 1;
      mesh.visible = kind !== 'fireflies' || intensity > 0.03;
      if (!mesh.visible) return;

      for (let i = 0; i < count; i++) {
        const p = data[i];
        if (kind === 'snow' || kind === 'petals') {
          p.y -= p.speed * 0.75 * dt * boost;
          p.x += Math.sin(elapsed * 1.2 + p.phase) * 0.35 * dt * boost;
          if (p.y < bounds.minY) p.y = bounds.maxY;
        } else if (kind === 'steam') {
          p.y += p.speed * 0.95 * dt;
          p.x += Math.sin(elapsed * 1.5 + p.phase) * 0.25 * dt;
          if (p.y > bounds.maxY) p.y = bounds.minY;
        } else if (kind === 'wind') {
          p.x += p.speed * 4.2 * dt * boost;
          p.y += Math.sin(elapsed * 2.5 + p.phase) * 0.25 * dt;
          if (p.x > bounds.maxX) p.x = bounds.minX;
        } else {
          p.x += Math.sin(elapsed * p.speed + p.phase) * 0.3 * dt;
          p.y += Math.cos(elapsed * 1.4 + p.phase) * 0.2 * dt;
        }
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(elapsed + p.phase, elapsed * 0.7 + p.phase, 0);
        const s = kind === 'fireflies' ? 0.7 + 0.5 * Math.sin(elapsed * 4 + p.phase) : 1;
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

export function updateBuildings(buildings, elapsed) {
  for (let i = 0; i < buildings.length; i++) {
    const flaps = buildings[i]?.userData?.norenFlaps;
    if (!flaps) continue;
    for (let j = 0; j < flaps.length; j++) {
      const f = flaps[j];
      f.rotation.x = 0.07 + Math.sin(elapsed * 2.4 + f.userData.phase) * 0.11;
      f.rotation.z = Math.cos(elapsed * 1.8 + f.userData.phase) * 0.04;
    }
  }
}

export function buildAmbientWildlife(group, { butterflies = [], sparrows = [] } = {}) {
  const bList = [];
  butterflies.forEach((b, idx) => {
    const bg = new THREE.Group();
    const isDragon = b.kind === 'dragonfly';
    const wingMat = createPixelToonMaterial({ color: b.color || '#ffd66b', side: THREE.DoubleSide });
    const bodyMat = createPixelToonMaterial({ color: isDragon ? '#3b738f' : '#3a2d38' });

    const body = createBox(isDragon ? 0.05 : 0.04, 0.04, isDragon ? 0.36 : 0.18, bodyMat, false, false);
    const wingL = new THREE.Group();
    const wingLMesh = createBox(isDragon ? 0.28 : 0.18, 0.02, isDragon ? 0.09 : 0.16, wingMat, false, false);
    wingLMesh.position.set(isDragon ? -0.14 : -0.09, 0, 0);
    wingL.add(wingLMesh);
    const wingR = new THREE.Group();
    const wingRMesh = createBox(isDragon ? 0.28 : 0.18, 0.02, isDragon ? 0.09 : 0.16, wingMat, false, false);
    wingRMesh.position.set(isDragon ? 0.14 : 0.09, 0, 0);
    wingR.add(wingRMesh);
    bg.add(body, wingL, wingR);
    bg.position.set(b.x, b.y, b.z);
    group.add(bg);
    bList.push({
      bg,
      wingL,
      wingR,
      cx: b.x,
      cy: b.y,
      cz: b.z,
      r: b.r || 2.2,
      speed: b.speed || (isDragon ? 1.55 : 1.05),
      phase: idx * 1.35,
      angle: idx * 1.35,
      spook: 0,
      flapFreq: isDragon ? 24 : 13,
      isDragon,
    });
  });

  const sList = [];
  const birdBrown = createPixelToonMaterial({ color: '#7d5b46' });
  const birdBelly = createPixelToonMaterial({ color: '#f3ebd8' });
  const birdBeak = createPixelToonMaterial({ color: '#f0b842' });
  sparrows.forEach((sp, idx) => {
    const sg = new THREE.Group();
    sg.position.set(sp.x, sp.y, sp.z);
    sg.rotation.y = sp.yaw || 0;
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), birdBrown);
    torso.scale.set(0.95, 0.88, 1.25);
    torso.position.y = 0.12;
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 5), birdBelly);
    chest.position.set(0, 0.1, 0.06);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), birdBrown);
    head.position.set(0, 0.22, 0.11);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.075, 4), birdBeak);
    beak.rotation.x = Math.PI * 0.5;
    beak.position.set(0, 0.21, 0.21);
    const tail = createBox(0.08, 0.03, 0.16, birdBrown, false, false);
    tail.position.set(0, 0.16, -0.17);
    tail.rotation.x = 0.35;
    const wingL = new THREE.Group();
    const wlm = createBox(0.18, 0.025, 0.12, birdBrown, false, false);
    wlm.position.set(-0.1, 0, 0);
    wingL.position.set(-0.08, 0.15, 0);
    wingL.add(wlm);
    const wingR = new THREE.Group();
    const wrm = createBox(0.18, 0.025, 0.12, birdBrown, false, false);
    wrm.position.set(0.1, 0, 0);
    wingR.position.set(0.08, 0.15, 0);
    wingR.add(wrm);
    sg.add(torso, chest, head, beak, tail, wingL, wingR);
    group.add(sg);

    sList.push({
      sg,
      wingL,
      wingR,
      homeX: sp.x,
      homeY: sp.y,
      homeZ: sp.z,
      homeYaw: sp.yaw || 0,
      flightT: 0,
      flightDur: 3.4,
      phase: idx * 1.7,
    });
  });

  return {
    update(dt, elapsed, playerPos = null) {
      for (let i = 0; i < bList.length; i++) {
        const b = bList[i];
        if (playerPos) {
          const d = Math.hypot(playerPos.x - b.bg.position.x, playerPos.z - b.bg.position.z);
          if (d < 2.6) b.spookHold = 1.0;
        }
        const step = Math.min(dt, 0.1);
        // Spook rises quickly but not instantly, then the lift eases toward it, so
        // the escape climb is a short flight instead of a one-frame pop.
        b.spookHold = Math.max(0, (b.spookHold || 0) - step * 0.85);
        b.spook += (b.spookHold - b.spook) * (1 - Math.exp(-step * 4));
        // Integrate the orbit angle per frame. (Multiplying total elapsed time by a
        // speed that changes when spooked made the butterfly teleport around its
        // orbit every frame, which read as a smear of ghost copies.)
        b.angle += step * (b.speed + b.spook * 0.9);
        const a = b.angle;
        // Butterflies wander in a jittery figure-eight; dragonflies glide smoothly.
        const jitter = b.isDragon ? 0 : Math.sin(elapsed * 3.7 + b.phase * 2.1) * 0.22;
        const nx = b.cx + Math.sin(a) * b.r + jitter;
        const nz = b.cz + Math.sin(a * 0.7) * Math.cos(a) * b.r * 0.85;
        const flapBob = b.isDragon ? 0 : Math.abs(Math.sin(elapsed * b.flapFreq * 0.5 + b.phase)) * 0.06;
        const ny = b.cy + 0.55 + Math.sin(elapsed * 2.8 + b.phase) * 0.3 + b.spook * 1.1 + flapBob;
        const dx = nx - b.bg.position.x;
        const dz = nz - b.bg.position.z;
        if (dx * dx + dz * dz > 1e-6) {
          const targetYaw = Math.atan2(dx, dz);
          let dYaw = targetYaw - b.bg.rotation.y;
          dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
          b.bg.rotation.y += dYaw * (1 - Math.exp(-step * 8));
        }
        b.bg.position.set(nx, ny, nz);
        const flap = Math.sin(elapsed * b.flapFreq + b.phase) * 0.65;
        b.wingL.rotation.z = flap;
        b.wingR.rotation.z = -flap;
      }

      for (let i = 0; i < sList.length; i++) {
        const s = sList[i];
        if (s.flightT <= 0 && playerPos) {
          const d = Math.hypot(playerPos.x - s.homeX, playerPos.z - s.homeZ);
          if (d < 3.6 && Math.abs(playerPos.y - s.homeY) < 2.4) {
            s.flightT = 0.001;
          }
        }
        if (s.flightT > 0) {
          s.flightT += dt;
          const t = s.flightT / s.flightDur;
          if (t >= 1) {
            s.flightT = 0;
            s.sg.position.set(s.homeX, s.homeY, s.homeZ);
            s.sg.rotation.y = s.homeYaw;
            s.wingL.rotation.z = 0;
            s.wingR.rotation.z = 0;
          } else {
            const ang = s.phase + t * Math.PI * 2;
            const rad = Math.sin(t * Math.PI) * 3.8;
            const nx = s.homeX + Math.sin(ang) * rad;
            const nz = s.homeZ + Math.cos(ang) * rad;
            const ny = s.homeY + Math.sin(t * Math.PI) * 3.4;
            s.sg.rotation.y = Math.atan2(nx - s.sg.position.x, nz - s.sg.position.z);
            s.sg.position.set(nx, ny, nz);
            const flap = Math.sin(elapsed * 22 + s.phase) * 0.72;
            s.wingL.rotation.z = flap;
            s.wingR.rotation.z = -flap;
          }
        } else {
          const hop = Math.max(0, Math.sin(elapsed * 4.2 + s.phase)) > 0.94 ? 0.08 : 0;
          s.sg.position.y = s.homeY + hop;
          s.sg.rotation.y = s.homeYaw + Math.sin(elapsed * 1.1 + s.phase) * 0.35;
          s.wingL.rotation.z = 0;
          s.wingR.rotation.z = 0;
        }
      }
    },
  };
}

export function createVolumetricBeamMaterial(color = '#fff2b0') {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: globalToonUniforms.uTime,
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 0.24 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vViewNormal;
      varying vec3 vViewDir;

      void main() {
        vUv = uv;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewNormal = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uOpacity;

      varying vec2 vUv;
      varying vec3 vViewNormal;
      varying vec3 vViewDir;

      void main() {
        float axial = pow(smoothstep(0.0, 0.88, vUv.y), 1.7) * smoothstep(1.0, 0.94, vUv.y);
        float fresnel = pow(abs(dot(normalize(vViewNormal), normalize(vViewDir))), 2.15);
        float shimmer = 0.94 + 0.06 * sin(uTime * 1.45 + vUv.x * 6.28318);
        float alpha = clamp(axial * fresnel * uOpacity * shimmer, 0.0, 0.72);
        vec3 col = mix(uColor, vec3(1.0, 0.99, 0.92), smoothstep(0.55, 0.96, vUv.y) * 0.45);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export function buildNightAtmosphere(
  group,
  {
    fireflyBounds = { minX: -28, maxX: 28, minY: 0.6, maxY: 6.5, minZ: -28, maxZ: 28 },
    fireflyCount = 115,
    fireflyColor = '#d8ff82',
    pathLights = [],
    lightColor = '#ffd580',
    kind = 'stone',
  } = {}
) {
  const coreGeo = new THREE.OctahedronGeometry(0.115, 0);
  const haloGeo = new THREE.OctahedronGeometry(0.36, 0);
  const coreMat = new THREE.MeshBasicMaterial({
    color: fireflyColor,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  const haloMat = new THREE.MeshBasicMaterial({
    color: fireflyColor,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const totalFireflies = fireflyCount + pathLights.length * 4;
  const coreMesh = new THREE.InstancedMesh(coreGeo, coreMat, totalFireflies);
  const haloMesh = new THREE.InstancedMesh(haloGeo, haloMat, totalFireflies);
  coreMesh.frustumCulled = false;
  haloMesh.frustumCulled = false;
  group.add(coreMesh, haloMesh);

  const dummy = new THREE.Object3D();
  const data = [];
  const spanX = Math.max(1, fireflyBounds.maxX - fireflyBounds.minX);
  const spanY = Math.max(1, fireflyBounds.maxY - fireflyBounds.minY);
  const spanZ = Math.max(1, fireflyBounds.maxZ - fireflyBounds.minZ);

  for (let i = 0; i < fireflyCount; i++) {
    data.push({
      local: false,
      x: fireflyBounds.minX + ((i * 19.73 + 3.1) % spanX),
      y: fireflyBounds.minY + ((i * 5.37 + 0.7) % spanY),
      z: fireflyBounds.minZ + ((i * 23.11 + 5.9) % spanZ),
      phase: i * 0.79,
      speed: 0.65 + (i % 5) * 0.22,
    });
  }
  for (let i = 0; i < pathLights.length; i++) {
    const p = pathLights[i];
    for (let k = 0; k < 4; k++) {
      data.push({
        local: true,
        homeX: p.x,
        homeY: p.y + 0.65 + (k % 3) * 0.48,
        homeZ: p.z,
        orbitR: 0.75 + k * 0.45,
        phase: i * 1.9 + k * 1.57,
        speed: 0.9 + k * 0.28,
      });
    }
  }

  // Zero-PointLight path guidance markers (stone lanterns, glowing mushrooms, or star crystals)
  const stoneM = createPixelToonMaterial({ color: '#787d82' });
  const darkStoneM = createPixelToonMaterial({ color: '#4d5258' });
  const stemM = createPixelToonMaterial({ color: '#d7cfc0' });
  const markerNodes = [];

  for (let i = 0; i < pathLights.length; i++) {
    const p = pathLights[i];
    const mg = new THREE.Group();
    const sc = p.scale ?? 1;
    mg.position.set(p.x, p.y, p.z);
    mg.scale.setScalar(sc);

    const glowMat = new THREE.MeshBasicMaterial({
      color: p.color || lightColor,
      transparent: true,
      opacity: 0.45,
    });
    const orbHaloMat = new THREE.MeshBasicMaterial({
      color: p.color || lightColor,
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    if (kind === 'mushroom') {
      const cap1 = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.18, 7), glowMat);
      cap1.position.set(0, 0.3, 0);
      const s1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, 0.26, 6), stemM);
      s1.position.set(0, 0.13, 0);
      const cap2 = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.13, 7), glowMat);
      cap2.position.set(0.19, 0.18, 0.1);
      const s2 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.16, 6), stemM);
      s2.position.set(0.19, 0.08, 0.1);
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), orbHaloMat);
      halo.position.set(0.05, 0.28, 0.03);
      mg.add(s1, cap1, s2, cap2, halo);
      markerNodes.push({ glowMat, orbHaloMat, halo, phase: i * 1.1 });
    } else if (kind === 'star') {
      const plinth = createBox(0.36, 0.24, 0.36, stoneM);
      plinth.position.y = 0.12;
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), glowMat);
      crystal.position.y = 0.44;
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.64, 10, 8), orbHaloMat);
      halo.position.y = 0.44;
      mg.add(plinth, crystal, halo);
      markerNodes.push({ glowMat, orbHaloMat, halo, spinObj: crystal, baseY: 0.44, phase: i * 1.3 });
    } else {
      const post = createBox(0.24, 0.48, 0.24, stoneM);
      post.position.y = 0.24;
      const lampCore = createBox(0.2, 0.22, 0.2, glowMat);
      lampCore.position.y = 0.58;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.18, 4), darkStoneM);
      cap.rotation.y = Math.PI * 0.25;
      cap.position.y = 0.76;
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.68, 10, 8), orbHaloMat);
      halo.position.y = 0.58;
      mg.add(post, lampCore, cap, halo);
      markerNodes.push({ glowMat, orbHaloMat, halo, phase: i * 0.9 });
    }

    group.add(mg);
  }

  let intensity = 0;
  let stormTimer = 0;

  return {
    setIntensity(v) {
      intensity = clamp(v, 0, 1);
      coreMat.opacity = intensity * 0.95;
      haloMat.opacity = intensity * 0.52;
      for (let i = 0; i < markerNodes.length; i++) {
        const m = markerNodes[i];
        m.glowMat.opacity = 0.35 + intensity * 0.65;
        m.orbHaloMat.opacity = 0.06 + intensity * 0.44;
      }
    },
    setFireflyIntensity(v) {
      this.setIntensity(v);
    },
    triggerStorm() {
      stormTimer = 5.0;
    },
    update(dt, elapsed) {
      if (stormTimer > 0) stormTimer = Math.max(0, stormTimer - dt);
      const active = intensity > 0.03;
      coreMesh.visible = active;
      haloMesh.visible = active;

      if (active) {
        const boost = stormTimer > 0 ? 1 + (stormTimer / 5.0) * 1.1 : 1;
        for (let i = 0; i < totalFireflies; i++) {
          const p = data[i];
          if (p.local) {
            const x = p.homeX + Math.cos(elapsed * p.speed + p.phase) * p.orbitR;
            const y = p.homeY + Math.sin(elapsed * 1.8 + p.phase) * 0.25;
            const z = p.homeZ + Math.sin(elapsed * p.speed * 0.85 + p.phase) * p.orbitR;
            dummy.position.set(x, y, z);
          } else {
            p.x += Math.sin(elapsed * p.speed + p.phase) * 0.36 * dt * boost;
            p.y += Math.cos(elapsed * 1.35 + p.phase) * 0.24 * dt * boost;
            p.z += Math.cos(elapsed * (p.speed * 0.85) + p.phase) * 0.26 * dt * boost;
            if (p.x < fireflyBounds.minX) p.x = fireflyBounds.maxX;
            if (p.x > fireflyBounds.maxX) p.x = fireflyBounds.minX;
            if (p.z < fireflyBounds.minZ) p.z = fireflyBounds.maxZ;
            if (p.z > fireflyBounds.maxZ) p.z = fireflyBounds.minZ;
            dummy.position.set(p.x, p.y, p.z);
          }
          dummy.rotation.set(elapsed + p.phase, elapsed * 0.8 + p.phase, 0);
          const pulse = 0.62 + 0.52 * Math.sin(elapsed * 3.6 + p.phase);
          dummy.scale.setScalar(Math.max(0.25, pulse));
          dummy.updateMatrix();
          coreMesh.setMatrixAt(i, dummy.matrix);
          haloMesh.setMatrixAt(i, dummy.matrix);
        }
        coreMesh.instanceMatrix.needsUpdate = true;
        haloMesh.instanceMatrix.needsUpdate = true;
      }

      for (let i = 0; i < markerNodes.length; i++) {
        const m = markerNodes[i];
        const flicker = 0.9 + 0.14 * Math.sin(elapsed * 2.8 + m.phase);
        m.halo.scale.setScalar((0.88 + intensity * 0.35) * flicker);
        if (m.spinObj) {
          m.spinObj.rotation.y = elapsed * 1.4 + m.phase;
          m.spinObj.position.y = m.baseY + Math.sin(elapsed * 2.2 + m.phase) * 0.05;
        }
      }
    },
  };
}

export function disposeObject3D(root, scene, lightsList = []) {
  if (!root) return;
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material.dispose();
    }
  });
  root.parent?.remove(root);
  for (let i = 0; i < lightsList.length; i++) {
    scene.remove(lightsList[i]);
  }
}

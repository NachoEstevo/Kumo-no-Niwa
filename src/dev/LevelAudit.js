import * as THREE from 'three';

/**
 * Dev-only geometric audit of every chapter (run `await kumoAudit()` in the console
 * or open the game with `?audit`). It walks the real collision/height API of each
 * chapter and reports:
 *  - unreachable interaction spots (BFS walking from spawn, under Day/Dusk/Night)
 *  - visual meshes protruding through walkable, reachable ground (clipping)
 *  - circle colliders with no visible mesh above them (invisible walls)
 *  - interaction spots whose prompt radius overlaps another spot (ambiguous E)
 */

const STEP = 0.45;
const PLAYER_R = 0.34;

function collectSolidMeshes(root) {
  const out = [];
  root.traverseVisible((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m || m.transparent || m.isMeshBasicMaterial || m.isShaderMaterial) return;
    if (!o.geometry?.attributes?.position) return;
    out.push(o);
  });
  return out;
}

function describeMesh(m) {
  const box = new THREE.Box3().setFromObject(m);
  const c = box.getCenter(new THREE.Vector3());
  const s = box.getSize(new THREE.Vector3());
  const mat = Array.isArray(m.material) ? m.material[0] : m.material;
  const col = mat?.color ? `#${mat.color.getHexString()}` : '?';
  return `${m.geometry.type.replace('Geometry', '')} ${col} @(${c.x.toFixed(1)}, ${box.min.y.toFixed(1)}..${box.max.y.toFixed(1)}, ${c.z.toFixed(1)}) size ${s.x.toFixed(1)}x${s.z.toFixed(1)}`;
}

function bfsReachable(terrain, spawn, bounds) {
  const nx = Math.ceil((bounds.maxX - bounds.minX) / STEP);
  const nz = Math.ceil((bounds.maxZ - bounds.minZ) / STEP);
  const seen = new Uint8Array(nx * nz);
  const idx = (ix, iz) => iz * nx + ix;
  const toW = (ix, iz) => [bounds.minX + ix * STEP, bounds.minZ + iz * STEP];
  const sx = Math.round((spawn.x - bounds.minX) / STEP);
  const sz = Math.round((spawn.z - bounds.minZ) / STEP);
  const queue = [[sx, sz]];
  seen[idx(sx, sz)] = 1;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (queue.length) {
    const [ix, iz] = queue.pop();
    const [ax, az] = toW(ix, iz);
    const ay = terrain.getHeightAt(ax, az);
    for (const [dx, dz] of dirs) {
      const jx = ix + dx;
      const jz = iz + dz;
      if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
      const k = idx(jx, jz);
      if (seen[k]) continue;
      const [bx, bz] = toW(jx, jz);
      if (!terrain.isWalkable(bx, bz)) continue;
      // Walk in two half steps so thin colliders are not skipped
      const mx = (ax + bx) * 0.5;
      const mz = (az + bz) * 0.5;
      const r1 = terrain.resolveMovement(ax, az, mx, mz, PLAYER_R, ay);
      if (Math.hypot(r1.x - mx, r1.z - mz) > 0.02) continue;
      const r2 = terrain.resolveMovement(mx, mz, bx, bz, PLAYER_R, r1.y);
      if (Math.hypot(r2.x - bx, r2.z - bz) > 0.02) continue;
      seen[k] = 1;
      queue.push([jx, jz]);
    }
  }
  return { seen, nx, nz, toW, idx };
}

export async function runLevelAudit(api, chapterIds = [1, 2, 3, 4, 5, 6, 7]) {
  const report = {};
  const raycaster = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const origin = new THREE.Vector3();

  for (const id of chapterIds) {
    api.loadChapter(id);
    await new Promise((r) => setTimeout(r, 60));
    const ch = api.getActiveChapter();
    const terrain = ch.terrain;
    api.player.group.visible = false;
    api.cat.group.visible = false;
    api.scene.updateMatrixWorld(true);
    const solids = collectSolidMeshes(api.scene);
    api.player.group.visible = true;
    api.cat.group.visible = true;
    const bounds = { minX: -60, maxX: 60, minZ: -62, maxZ: 62 };

    // Union reachability over the three skies (clipping is sampled per sky,
    // because time-dependent bridges change the walk surface height)
    const reachUnion = new Set();
    const clipHits = new Map();
    let grid = null;
    for (let p = 0; p < 3; p++) {
      const preset = api.dayCycle.setPreset(p);
      ch.onTimeChanged?.(preset.id);
      grid = bfsReachable(terrain, ch.spawnPoint, bounds);
      for (let i = 0; i < grid.seen.length; i++) {
        if (!grid.seen[i]) continue;
        const firstVisit = !reachUnion.has(i);
        reachUnion.add(i);
        if (!firstVisit) continue;
        const [x, z] = grid.toW(i % grid.nx, Math.floor(i / grid.nx));
        const gy = terrain.getHeightAt(x, z);
        origin.set(x, gy + 1.55, z);
        raycaster.set(origin, down);
        raycaster.far = 1.3; // stop 0.25 m above the walk surface
        const hits = raycaster.intersectObjects(solids, false);
        if (hits.length) {
          const m = hits[0].object;
          const prev = clipHits.get(m.uuid);
          if (prev) prev.count++;
          else clipHits.set(m.uuid, { mesh: m, count: 1, at: `(${x.toFixed(1)}, ${z.toFixed(1)}) ground ${gy.toFixed(2)} sky ${p}` });
        }
      }
    }
    // Permissive pass: every puzzle-gated deck enabled and jump-only stones walkable.
    // Spots still unreachable here are genuine layout bugs.
    const patched = [];
    for (const list of [terrain.bridges, terrain.stones, terrain.terraces]) {
      (list || []).forEach((e) => {
        patched.push([e, e.enabledFn, e.jumpOnly]);
        if (e.enabledFn) e.enabledFn = () => true;
        if (e.jumpOnly) e.jumpOnly = false;
      });
    }
    const permissive = bfsReachable(terrain, ch.spawnPoint, bounds);
    patched.forEach(([e, fn, jo]) => {
      e.enabledFn = fn;
      e.jumpOnly = jo;
    });
    const permissiveCells = [];
    for (let i = 0; i < permissive.seen.length; i++) {
      if (permissive.seen[i]) permissiveCells.push(permissive.toW(i % permissive.nx, Math.floor(i / permissive.nx)));
    }

    const preset0 = api.dayCycle.setPreset(0);
    ch.onTimeChanged?.(preset0.id);

    const reachableCells = [];
    reachUnion.forEach((k) => {
      const ix = k % grid.nx;
      const iz = Math.floor(k / grid.nx);
      reachableCells.push(grid.toW(ix, iz));
    });

    // 1. Interaction spots reachability + overlaps
    const spots = ch.interactions.spots || [];
    const unreachable = [];
    const overlaps = [];
    spots.forEach((s) => {
      const p = s.getPos();
      const near = ([x, z]) => Math.hypot(x - p.x, z - p.z) <= s.radius - 0.15;
      if (!reachableCells.some(near)) {
        const gated = permissiveCells.some(near);
        unreachable.push(`${gated ? 'gated' : 'BROKEN'} ${s.id} @(${p.x.toFixed(1)}, ${p.z.toFixed(1)}) r=${s.radius}`);
      }
    });
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const a = spots[i].getPos();
        const b = spots[j].getPos();
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d < Math.min(spots[i].radius, spots[j].radius) * 0.9) {
          overlaps.push(`${spots[i].id} <-> ${spots[j].id} (${d.toFixed(2)} m)`);
        }
      }
    }

    // 2. Visual meshes protruding through reachable walkable ground
    const clipping = [...clipHits.values()]
      .sort((a, b) => b.count - a.count)
      .map((h) => `${h.count} cells · ${describeMesh(h.mesh)} · first ${h.at}`);

    // 3. Invisible colliders
    const circles = terrain.circles || terrain.CIRCLE_COLLIDERS || [];
    const invisible = [];
    for (const c of circles) {
      if (c.enabledFn && !c.enabledFn()) continue;
      const gy = terrain.getHeightAt(c.x, c.z);
      origin.set(c.x, gy + 6, c.z);
      raycaster.set(origin, down);
      raycaster.far = 5.85;
      const hits = raycaster.intersectObjects(solids, false);
      const probe = (dx, dz) => {
        origin.set(c.x + dx, gy + 6, c.z + dz);
        raycaster.set(origin, down);
        return raycaster.intersectObjects(solids, false).length > 0;
      };
      const r = c.r * 0.6;
      if (!hits.length && !probe(r, 0) && !probe(-r, 0) && !probe(0, r) && !probe(0, -r)) {
        invisible.push(`circle @(${c.x.toFixed(1)}, ${c.z.toFixed(1)}) r=${c.r}`);
      }
    }

    // 4. Reachable area stats
    report[id] = {
      reachableCells: reachableCells.length,
      unreachableSpots: unreachable,
      overlappingSpots: overlaps,
      clipping: clipping.slice(0, 40),
      clippingTotal: clipping.length,
      invisibleColliders: invisible,
    };
    console.log(`[audit] chapter ${id}`, report[id]);
  }
  api.loadChapter(1);
  return report;
}

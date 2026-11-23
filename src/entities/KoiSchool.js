import * as THREE from 'three';
import { createPixelToonMaterial } from '../engine/ToonMaterials.js';
import { POND_BED_Y, POND_WATER_Y, STEPPING_STONES, isLowerPondWater } from '../world/TerrainData.js';

export class KoiSchool {
  constructor(scene, worldBuilder) {
    this.scene = scene;
    this.worldBuilder = worldBuilder;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.kois = [];
    this.crumbs = [];
    this._spawnKois();
  }

  _buildKoiMesh(variant) {
    const g = new THREE.Group();
    const palettes = [
      { body: '#faf6ee', spot: '#eb4426', spot2: '#eb4426', fin: '#ffe2da' }, // Kohaku
      { body: '#f8be34', spot: '#ffe888', spot2: '#e6981e', fin: '#ffedb0' }, // Yamabuki Ogon
      { body: '#f7f3eb', spot: '#e54326', spot2: '#292632', fin: '#f7f5f0' }, // Taisho Sanke
      { body: '#c9e0ee', spot: '#ec602d', spot2: '#eb4426', fin: '#eef6fa' }, // Asagi
      { body: '#2c2936', spot: '#ea4628', spot2: '#f7f2e9', fin: '#f2e8e2' }, // Showa
    ];
    const pal = palettes[variant % palettes.length];
    const bodyMat = createPixelToonMaterial({ color: pal.body });
    const spotMat = createPixelToonMaterial({ color: pal.spot });
    const spot2Mat = createPixelToonMaterial({ color: pal.spot2 });
    const finMat = createPixelToonMaterial({ color: pal.fin });

    // Segment 1: Sculpted head & front body
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.44), bodyMat);
    head.position.set(0, 0, 0.16);
    g.add(head);

    const spot1 = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.24), spotMat);
    spot1.position.set(0, 0.095, 0.14);
    g.add(spot1);

    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.035, 0.16), finMat);
      fin.position.set(side * 0.22, -0.02, 0.14);
      fin.rotation.y = side * -0.45;
      g.add(fin);
    }

    // Segment 2: Mid torso
    const midPivot = new THREE.Group();
    midPivot.position.set(0, 0, -0.05);
    const mid = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.34), bodyMat);
    mid.position.set(0, 0, -0.15);
    midPivot.add(mid);

    const spot2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.2), spot2Mat);
    spot2.position.set(0, 0.08, -0.14);
    midPivot.add(spot2);

    // Segment 3: Tail fin
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0, -0.31);
    const tailRear = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.22), bodyMat);
    tailRear.position.set(0, 0, -0.1);
    tailPivot.add(tailRear);

    const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.28), finMat);
    tailFin.position.set(0, 0, -0.28);
    tailPivot.add(tailFin);

    midPivot.add(tailPivot);
    g.add(midPivot);

    // Soft underwater shadow disc riding on the lake floor beneath each koi
    const shadowDisc = new THREE.Mesh(
      new THREE.CircleGeometry(0.38, 10),
      new THREE.MeshBasicMaterial({ color: '#394657', transparent: true, opacity: 0.45 })
    );
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.scale.set(0.65, 1.55, 1);

    return { mesh: g, midPivot, tailPivot, shadowDisc };
  }

  _isValidKoiWater(x, z) {
    if (z < 5.2 || z > 23.8 || x < -21.0 || x > 21.0) return false;
    if (!isLowerPondWater(x, z)) return false;

    for (let i = 0; i < STEPPING_STONES.length; i++) {
      const s = STEPPING_STONES[i];
      if (Math.hypot(x - s.x, z - s.z) < s.r + 0.45) return false;
    }
    // Water Torii columns & pond rocks
    const posts = [
      [-3.2, 16.0], [0.2, 15.6], [3.6, 13.7], [6.8, 13.3],
      [-6.2, 12.6], [2.4, 9.5], [-11.5, 18.2],
    ];
    for (let i = 0; i < posts.length; i++) {
      if (Math.hypot(x - posts[i][0], z - posts[i][1]) < 0.88) return false;
    }
    return true;
  }

  _spawnKois() {
    const startSpots = [
      [-3.5, 17.5], [-0.5, 14.2], [2.8, 16.5], [5.8, 18.2],
      [-7.2, 16.0], [-10.8, 15.0], [-14.2, 16.8], [-11.8, 20.2],
      [-4.8, 10.6], [0.6, 11.4], [4.5, 11.8], [7.2, 15.4],
      [14.2, 13.2], [15.5, 16.2], [13.8, 9.8], [-2.2, 20.5],
      [2.2, 21.0], [-8.4, 19.6],
    ];

    startSpots.forEach(([x, z], idx) => {
      const { mesh, midPivot, tailPivot, shadowDisc } = this._buildKoiMesh(idx);
      const scale = 1.0 + (idx % 3) * 0.16;
      mesh.scale.setScalar(scale);
      mesh.position.set(x, POND_WATER_Y - 0.16, z);
      shadowDisc.position.set(x, POND_BED_Y + 0.08, z);
      shadowDisc.scale.set(0.65 * scale, 1.55 * scale, 1);

      this.group.add(mesh);
      this.group.add(shadowDisc);

      this.kois.push({
        mesh,
        midPivot,
        tailPivot,
        shadowDisc,
        x,
        y: POND_WATER_Y - 0.16,
        z,
        yaw: idx * 0.9,
        speed: 0.85 + (idx % 4) * 0.14,
        turnBias: (idx % 2 === 0 ? 1 : -1) * 0.3,
        phase: idx * 1.15,
        rippleCooldown: 1 + idx * 0.4,
      });
    });
  }

  feedKoi(centerX, centerZ, elapsed) {
    const crumbMat = new THREE.MeshBasicMaterial({ color: '#fae098' });
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 0.5 + Math.random() * 1.9;
      const cx = centerX + Math.cos(ang) * dist;
      const cz = centerZ + Math.sin(ang) * dist;
      if (!this._isValidKoiWater(cx, cz)) continue;

      const pellet = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.13), crumbMat);
      pellet.position.set(cx, POND_WATER_Y + 0.02, cz);
      this.group.add(pellet);
      this.crumbs.push({ mesh: pellet, x: cx, z: cz, age: 0, maxAge: 11 });
      this.worldBuilder.addWaterRipple(cx, cz, elapsed + i * 0.07, 0.95);
    }
  }

  getClosestKoi(x, z, maxDist = 6.0) {
    let best = null;
    let bestD = maxDist;
    for (let i = 0; i < this.kois.length; i++) {
      const k = this.kois[i];
      const d = Math.hypot(k.x - x, k.z - z);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    return best;
  }

  update(dt, elapsed) {
    for (let i = this.crumbs.length - 1; i >= 0; i--) {
      const c = this.crumbs[i];
      c.age += dt;
      c.mesh.position.y = POND_WATER_Y + 0.02 + Math.sin(elapsed * 4 + i) * 0.02;
      if (c.age >= c.maxAge) {
        this.group.remove(c.mesh);
        c.mesh.geometry.dispose();
        this.crumbs.splice(i, 1);
      }
    }

    for (let i = 0; i < this.kois.length; i++) {
      const k = this.kois[i];
      let targetSpeed = k.speed;
      let targetY = POND_WATER_Y - 0.16;

      let nearestCrumb = null;
      let nearestDist = 9.5;
      for (let j = 0; j < this.crumbs.length; j++) {
        const c = this.crumbs[j];
        const d = Math.hypot(c.x - k.x, c.z - k.z);
        if (d < nearestDist) {
          nearestDist = d;
          nearestCrumb = c;
          if (d < 0.42) {
            this.worldBuilder.addWaterRipple(c.x, c.z, elapsed, 1.0);
            this.group.remove(c.mesh);
            c.mesh.geometry.dispose();
            this.crumbs.splice(j, 1);
            nearestCrumb = null;
            break;
          }
        }
      }

      if (nearestCrumb) {
        const desiredYaw = Math.atan2(nearestCrumb.x - k.x, nearestCrumb.z - k.z);
        let diff = desiredYaw - k.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        k.yaw += diff * Math.min(1, dt * 4.5);
        targetSpeed = 1.65;
        targetY = POND_WATER_Y - 0.06;
      } else {
        k.yaw += (Math.sin(elapsed * 0.55 + k.phase) * 0.42 + k.turnBias * 0.22) * dt;
      }

      const lookAheadX = k.x + Math.sin(k.yaw) * 1.15;
      const lookAheadZ = k.z + Math.cos(k.yaw) * 1.15;

      if (!this._isValidKoiWater(lookAheadX, lookAheadZ)) {
        const toCenterYaw = Math.atan2(-1.0 - k.x, 15.0 - k.z);
        let diff = toCenterYaw - k.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        k.yaw += diff * Math.min(1, dt * 6.0);
      }

      const nx = k.x + Math.sin(k.yaw) * targetSpeed * dt;
      const nz = k.z + Math.cos(k.yaw) * targetSpeed * dt;
      if (this._isValidKoiWater(nx, nz)) {
        k.x = nx;
        k.z = nz;
      } else {
        k.yaw += Math.PI * 0.5 * dt * 4;
      }

      k.y += (targetY - k.y) * Math.min(1, dt * 3.5);
      k.mesh.position.set(k.x, k.y, k.z);
      k.mesh.rotation.y = k.yaw;

      k.shadowDisc.position.set(k.x, POND_BED_Y + 0.08, k.z);
      k.shadowDisc.rotation.z = -k.yaw;

      // Sinuous 3-segment tail & mid-body wag
      const wagSpeed = targetSpeed > 1.2 ? 12.0 : 6.4;
      k.midPivot.rotation.y = Math.sin(elapsed * wagSpeed + k.phase) * 0.22;
      k.tailPivot.rotation.y = Math.sin(elapsed * wagSpeed + k.phase - 0.8) * 0.34;

      k.rippleCooldown -= dt;
      if (k.rippleCooldown <= 0) {
        k.rippleCooldown = 2.8 + (i % 4) * 0.9;
        this.worldBuilder.addWaterRipple(k.x, k.z, elapsed, 0.45);
      }
    }
  }
}

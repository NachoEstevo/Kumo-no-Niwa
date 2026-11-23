import * as THREE from 'three';
import { createPixelToonMaterial } from '../engine/ToonMaterials.js';
import { CAT_SPAWN_POINT } from '../world/TerrainData.js';
import { getHeightAt, isWalkable, resolveMovement } from '../world/ActiveTerrain.js';

export class CatCompanion {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    const startY = getHeightAt(CAT_SPAWN_POINT.x, CAT_SPAWN_POINT.z);
    this.position = new THREE.Vector3(CAT_SPAWN_POINT.x, startY, CAT_SPAWN_POINT.z);
    this.visualY = startY;
    this.yaw = Math.PI;
    this.state = 'FOLLOW';
    this.walkPhase = 0;
    this.idleTimer = 0;
    this.happyTimer = 0;
    this.calledTimer = 0;
    this.stretchTimer = 0;
    this.groomTimer = 0;
    this.groomCooldown = 4.5;
    this.pounceTimer = 0;
    this.pounceCooldown = 9.0;
    this.nudgeTimer = 0;
    this.nudgeTarget = null;
    this.holdSpot = null;
    this.holdTimer = 0;
    this.koiWatchTimer = 0;
    this.koiTarget = null;
    this.stuckTimer = 0;
    this.hopOffset = 0;
    this.hopVel = 0;
    this.leapCrouch = 0;
    this.leapLand = 0;
    this.leapAirborne = false;
    this.wasResting = false;

    this.breadcrumbs = [];
    this.lastCrumbPos = new THREE.Vector3(this.position.x, this.position.y, this.position.z);
    this.particles = [];

    this._buildMochiMesh();
    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
    scene.add(this.group);
  }

  _buildMochiMesh() {
    const cream = createPixelToonMaterial({ occludable: false, color: '#fbf4ea' });
    const bellyCream = createPixelToonMaterial({ occludable: false, color: '#fffaf3' });
    const ginger = createPixelToonMaterial({ occludable: false, color: '#e8873c' });
    const charcoal = createPixelToonMaterial({ occludable: false, color: '#332f3d' });
    const innerEarPink = createPixelToonMaterial({ occludable: false, color: '#f3a4b0' });
    const collarMat = createPixelToonMaterial({ occludable: false, color: '#e03c2c' });
    const bellMat = createPixelToonMaterial({ occludable: false, color: '#f4c64a' });
    const eyeShineMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });

    this.bodyPivot = new THREE.Group();
    this.bodyPivot.scale.setScalar(1.12);
    this.group.add(this.bodyPivot);

    // Torso pivot (tilts independently for loafing, bowing/stretching, or curling)
    this.torsoPivot = new THREE.Group();
    this.torsoPivot.position.set(0, 0.25, 0);
    this.bodyPivot.add(this.torsoPivot);

    // Sleek sculpted calico core + tapering haunches + fluffy chest bib
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.165, 18, 14), bellyCream);
    chest.position.set(0, 0.02, 0.14);
    chest.scale.set(0.92, 0.98, 1.05);
    chest.castShadow = true;
    this.torsoPivot.add(chest);

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.145, 0.26, 8, 18), cream);
    torso.rotation.x = Math.PI * 0.5;
    torso.position.set(0, 0.02, 0);
    torso.scale.set(0.95, 1.0, 0.92);
    torso.castShadow = true;
    torso.receiveShadow = true;
    this.torsoPivot.add(torso);

    const rump = new THREE.Mesh(new THREE.SphereGeometry(0.155, 18, 14), cream);
    rump.position.set(0, 0.02, -0.14);
    rump.scale.set(0.98, 0.94, 1.02);
    rump.castShadow = true;
    this.torsoPivot.add(rump);

    // Flush calico saddle/hip markings hugging body contour (no bulging blobs)
    const gingerSaddle = new THREE.Mesh(new THREE.SphereGeometry(0.142, 10, 8), ginger);
    gingerSaddle.position.set(0.032, 0.065, -0.02);
    gingerSaddle.scale.set(0.86, 0.72, 1.25);
    this.torsoPivot.add(gingerSaddle);

    const charcoalHip = new THREE.Mesh(new THREE.SphereGeometry(0.125, 10, 8), charcoal);
    charcoalHip.position.set(-0.045, 0.055, -0.14);
    charcoalHip.scale.set(0.82, 0.74, 0.92);
    this.torsoPivot.add(charcoalHip);

    const shoulderPatch = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), ginger);
    shoulderPatch.position.set(-0.048, 0.055, 0.11);
    shoulderPatch.scale.set(0.78, 0.76, 0.85);
    this.torsoPivot.add(shoulderPatch);

    // Silk red collar + hanging jingle bell
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.024, 6, 14), collarMat);
    collar.position.set(0, 0.115, 0.185);
    collar.rotation.x = Math.PI * 0.36;
    this.torsoPivot.add(collar);

    this.bellPivot = new THREE.Group();
    this.bellPivot.position.set(0, 0.045, 0.275);
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), bellMat);
    bell.position.set(0, -0.025, 0.01);
    this.bellPivot.add(bell);
    this.torsoPivot.add(this.bellPivot);

    // Expressive Feline Head + Triangular Flattened Ears + Squintable Eyes + Whiskers
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 0.17, 0.22);
    this.torsoPivot.add(this.headGroup);

    const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.165, 20, 16), cream);
    cranium.position.set(0, 0.075, 0.05);
    cranium.scale.set(1.08, 0.92, 0.96);
    cranium.castShadow = true;
    this.headGroup.add(cranium);

    // Whisker cheeks & dainty chin
    for (const sx of [-1, 1]) {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.068, 8, 8), bellyCream);
      cheek.position.set(sx * 0.048, 0.036, 0.165);
      cheek.scale.set(1.1, 0.85, 0.85);
      this.headGroup.add(cheek);

      // Two short delicate whiskers per cheek
      for (const wy of [0.042, 0.026]) {
        const w = new THREE.Mesh(new THREE.CapsuleGeometry(0.003, 0.08, 2, 4), charcoal);
        w.geometry.rotateZ(Math.PI / 2);
        w.position.set(sx * 0.12, wy, 0.17);
        w.rotation.z = sx * (wy > 0.03 ? 0.08 : -0.14);
        w.rotation.y = sx * -0.18;
        this.headGroup.add(w);
      }
    }

    // Flush calico brow patches
    const browL = new THREE.Mesh(
      new THREE.SphereGeometry(0.115, 10, 8),
      ginger
    );
    browL.position.set(-0.058, 0.132, 0.035);
    browL.scale.set(0.84, 0.72, 0.88);
    this.headGroup.add(browL);

    const browR = new THREE.Mesh(
      new THREE.SphereGeometry(0.105, 10, 8),
      charcoal
    );
    browR.position.set(0.062, 0.134, 0.035);
    browR.scale.set(0.82, 0.7, 0.86);
    this.headGroup.add(browR);

    // Crisp flattened triangular cat ears with blush inner ears
    const makeEar = (sx, outerMat) => {
      const earG = new THREE.Group();
      earG.position.set(sx * 0.108, 0.2, 0.045);
      earG.rotation.z = sx * -0.26;
      earG.rotation.x = 0.12;
      const outer = new THREE.Mesh(new THREE.ConeGeometry(0.064, 0.13, 10), outerMat);
      outer.rotation.y = Math.PI; // flat triangle face pointing forward (+Z)
      outer.scale.set(1.05, 1.0, 0.56);
      earG.add(outer);

      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.08, 10), innerEarPink);
      inner.position.set(0, -0.012, 0.022);
      inner.rotation.y = Math.PI;
      inner.scale.set(1.0, 1.0, 0.45);
      earG.add(inner);

      this.headGroup.add(earG);
      return earG;
    };
    this.earL = makeEar(-1, ginger);
    this.earR = makeEar(1, charcoal);

    // Pink nose
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), bellyCream);
    muzzle.position.set(0, 0.035, 0.19);
    muzzle.scale.set(1.25, 0.8, 0.75);
    this.headGroup.add(muzzle);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), innerEarPink);
    nose.position.set(0, 0.058, 0.222);
    nose.scale.set(1.3, 0.8, 0.7);
    this.headGroup.add(nose);

    // Open glossy eyes with white catchlights + Happy squint arcs
    this.eyesOpenGroup = new THREE.Group();
    this.eyesHappyGroup = new THREE.Group();
    this.eyesHappyGroup.visible = false;

    for (const ex of [-0.068, 0.068]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), charcoal);
      eye.position.set(ex, 0.086, 0.194);
      eye.scale.set(0.9, 1.15, 0.55);
      this.eyesOpenGroup.add(eye);

      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 6, 6), eyeShineMat);
      glint.position.set(ex + 0.008, 0.096, 0.205);
      this.eyesOpenGroup.add(glint);

      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(0.022, 0.006, 5, 8, Math.PI),
        charcoal
      );
      arc.position.set(ex, 0.08, 0.198);
      this.eyesHappyGroup.add(arc);
    }
    this.headGroup.add(this.eyesOpenGroup, this.eyesHappyGroup);

    // 4 Articulated Legs with White Mitten Paws (pivoted cleanly from shoulder/hip!)
    const makeLeg = (x, y, z) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);

      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.037, 0.1, 4, 10), cream);
      upper.position.set(0, -0.08, 0);
      upper.castShadow = true;
      pivot.add(upper);

      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), bellyCream);
      paw.position.set(0, -0.17, 0.015);
      paw.scale.set(1.0, 0.75, 1.25);
      paw.castShadow = true;
      pivot.add(paw);

      this.bodyPivot.add(pivot);
      return pivot;
    };

    // [FL, FR, BL, BR]
    this.legs = [
      makeLeg(-0.085, 0.21, 0.155),
      makeLeg(0.085, 0.21, 0.155),
      makeLeg(-0.09, 0.21, -0.155),
      makeLeg(0.09, 0.21, -0.155),
    ];

    // 4-Segment Gracefully Curved '?'-Shaped Calico Tail
    this.tailSeg1 = new THREE.Group();
    this.tailSeg1.position.set(0, 0.06, -0.25);
    const t1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.037, 0.11, 4, 10), ginger);
    t1.position.set(0, 0.06, -0.03);
    t1.rotation.x = -0.52;
    this.tailSeg1.add(t1);

    this.tailSeg2 = new THREE.Group();
    this.tailSeg2.position.set(0, 0.125, -0.06);
    const t2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.11, 4, 10), cream);
    t2.position.set(0, 0.068, -0.015);
    t2.rotation.x = -0.22;
    this.tailSeg2.add(t2);

    this.tailSeg3 = new THREE.Group();
    this.tailSeg3.position.set(0, 0.135, -0.03);
    const t3 = new THREE.Mesh(new THREE.CapsuleGeometry(0.029, 0.09, 4, 10), ginger);
    t3.position.set(0, 0.06, 0.01);
    t3.rotation.x = 0.2;
    this.tailSeg3.add(t3);

    this.tailSeg4 = new THREE.Group();
    this.tailSeg4.position.set(0, 0.12, 0.02);
    const t4 = new THREE.Mesh(new THREE.SphereGeometry(0.034, 10, 8), charcoal);
    t4.scale.set(1, 1.3, 1);
    t4.position.set(0, 0.03, 0.02);
    this.tailSeg4.add(t4);

    this.tailSeg3.add(this.tailSeg4);
    this.tailSeg2.add(this.tailSeg3);
    this.tailSeg1.add(this.tailSeg2);
    this.torsoPivot.add(this.tailSeg1);
  }

  _setHappyEyes(happy) {
    this.eyesOpenGroup.visible = !happy;
    this.eyesHappyGroup.visible = Boolean(happy);
  }

  _spawnParticle(type) {
    const isHeart = type === 'heart';
    const mat = new THREE.MeshBasicMaterial({
      color: isHeart ? '#ff7da3' : '#f4f0ff',
      transparent: true,
      opacity: 0.95,
    });
    const geo = isHeart
      ? new THREE.OctahedronGeometry(0.072, 0)
      : new THREE.BoxGeometry(0.08, 0.08, 0.08);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      this.position.x + (Math.random() - 0.5) * 0.35,
      this.visualY + 0.74,
      this.position.z + (Math.random() - 0.5) * 0.35
    );
    mesh.userData = { age: 0, maxAge: isHeart ? 1.2 : 1.5, vy: isHeart ? 0.9 : 0.45 };
    this.scene.add(mesh);
    this.particles.push(mesh);
  }

  triggerCompanionHop() {
    if (this.state !== 'NAP_SUN') this._startLeap(2.9);
  }

  _startLeap(power) {
    if (this.leapAirborne || this.leapCrouch > 0 || this.hopOffset > 0.02) return;
    // Cats load their hind legs for a beat before springing
    this.leapCrouch = 0.13;
    this.leapPower = power;
  }

  /** Overlay the leap phases on whatever pose the behaviour set this frame. */
  _applyLeapPose(dt) {
    const legs = this.legs;
    // Offsets are added on top of the behaviour pose and removed again next frame,
    // so damped behaviours never accumulate them
    let dy = 0;
    let rx = 0;
    let hx = 0;
    if (this.leapCrouch > 0) {
      const k = 1 - this.leapCrouch / 0.13;
      dy = -0.07 * k;
      rx = -0.1 * k; // haunches drop first
      legs[2].rotation.x = -0.7 * k;
      legs[3].rotation.x = -0.7 * k;
      legs[0].rotation.x = 0.25 * k;
      legs[1].rotation.x = 0.25 * k;
      this.tailSeg1.rotation.x = 0.25 * k;
    } else if (this.leapAirborne) {
      // Body pitch follows the arc: nose up on the way up, down toward the landing
      const v = Math.max(-1, Math.min(1, this.hopVel / Math.max(this.leapPower, 0.1)));
      rx = -0.32 * v;
      hx = 0.2 * v; // the head stays level, eyes on the target
      const rising = Math.max(0, v);
      const falling = Math.max(0, -v);
      legs[2].rotation.x = 0.95 * rising + 0.35 * falling; // hind legs extend back, then tuck
      legs[3].rotation.x = 0.95 * rising + 0.35 * falling;
      legs[0].rotation.x = -0.75 * rising - 0.45 * falling; // front paws tuck, then reach down
      legs[1].rotation.x = -0.75 * rising - 0.45 * falling;
      this.tailSeg1.rotation.x = -0.35 - 0.2 * falling; // tail counterbalances
      this.tailSeg2.rotation.x = -0.2 * falling;
    } else if (this.leapLand > 0) {
      const k = Math.sin((this.leapLand / 0.2) * Math.PI);
      dy = -0.045 * k;
      rx = 0.12 * k; // front legs take the impact
      legs[0].rotation.x = 0.3 * k;
      legs[1].rotation.x = 0.3 * k;
      this.tailSeg2.rotation.x = 0;
    }
    this.torsoPivot.position.y += dy;
    this.torsoPivot.rotation.x += rx;
    this.headGroup.rotation.x += hx;
    this._leapOffsets = { dy, rx, hx };
  }

  _updateLeap(dt) {
    if (this.leapCrouch > 0) {
      this.leapCrouch -= dt;
      if (this.leapCrouch <= 0) {
        this.leapCrouch = 0;
        this.hopVel = this.leapPower;
        this.leapAirborne = true;
      }
    }
    if (this.hopVel !== 0 || this.hopOffset > 0) {
      // Real gravity scaled to the cat's size reads best (a 0.3 m cat, ~0.3 m hop)
      this.hopVel -= 14.5 * dt;
      this.hopOffset += this.hopVel * dt;
      if (this.leapAirborne) {
        // Cats leap forward, not straight up: carry a little momentum along the heading
        const fwd = 1.15 * dt;
        const nx = this.position.x + Math.sin(this.yaw) * fwd;
        const nz = this.position.z + Math.cos(this.yaw) * fwd;
        if (isWalkable(nx, nz)) {
          const r = resolveMovement(this.position.x, this.position.z, nx, nz, 0.24);
          this.position.set(r.x, r.y, r.z);
        }
      }
      if (this.hopOffset <= 0) {
        this.hopOffset = 0;
        if (this.leapAirborne) this.leapLand = 0.2;
        this.hopVel = 0;
        this.leapAirborne = false;
      }
    }
    if (this.leapLand > 0) this.leapLand = Math.max(0, this.leapLand - dt);
  }

  pet(playerPos) {
    this.state = 'HAPPY_PET';
    this.happyTimer = 1.5;
    this.calledTimer = 0;
    this.nudgeTimer = 0;
    this.groomTimer = 0;
    this.idleTimer = 0;
    if (playerPos) {
      this.yaw = Math.atan2(playerPos.x - this.position.x, playerPos.z - this.position.z);
    }
    for (let i = 0; i < 4; i++) this._spawnParticle('heart');
  }

  callToPlayer(playerPos) {
    if (this.state === 'NAP_SUN' || this.state === 'SIT_LOAF' || this.state === 'GROOM') {
      this.stretchTimer = 0.45;
    }
    this.state = 'CALLED';
    this.calledTimer = 4.0;
    this.idleTimer = 0;
    this.nudgeTimer = 0;
    this.groomTimer = 0;
    this._startLeap(2.4);
    if (playerPos) {
      this.yaw = Math.atan2(playerPos.x - this.position.x, playerPos.z - this.position.z);
    }
  }

  notifyKoiFed(kx, kz) {
    this.koiTarget = { x: kx, z: kz };
    this.koiWatchTimer = 6.0;
    this.idleTimer = 0;
    this.groomTimer = 0;
    this._startLeap(2.2);
  }

  nudgeToward(targetPos) {
    if (!targetPos) return;
    this.nudgeTarget = { x: targetPos.x, z: targetPos.z };
    this.nudgeTimer = 4.2;
    this.idleTimer = 0;
    this.groomTimer = 0;
    this._startLeap(2.1);
  }

  goHoldSpot(pos, duration = 16.0) {
    if (!pos) return;
    this.holdSpot = { x: pos.x, z: pos.z };
    this.holdTimer = duration;
    this.calledTimer = 0;
    this.nudgeTimer = 0;
    this.groomTimer = 0;
    this.idleTimer = 0;
    this._startLeap(2.2);
  }

  isHoldingSpot(pos, radius = 1.65) {
    if (!pos) return false;
    const d = Math.hypot(this.position.x - pos.x, this.position.z - pos.z);
    return d <= radius && (this.holdTimer > 0 || this.state === 'SIT_LOAF' || this.state === 'NAP_SUN' || this.state === 'HOLD_SPOT');
  }

  resetTo(spawn) {
    const x = spawn?.x ?? 0;
    const z = spawn?.z ?? 0;
    const y = getHeightAt(x, z);
    this.position.set(x, y, z);
    this.visualY = y;
    this.yaw = spawn?.yaw ?? Math.PI;
    this.state = 'FOLLOW';
    this.idleTimer = 0;
    this.happyTimer = 0;
    this.calledTimer = 0;
    this.stretchTimer = 0;
    this.groomTimer = 0;
    this.pounceTimer = 0;
    this.nudgeTimer = 0;
    this.nudgeTarget = null;
    this.holdSpot = null;
    this.holdTimer = 0;
    this.koiWatchTimer = 0;
    this.koiTarget = null;
    this.stuckTimer = 0;
    this.hopOffset = 0;
    this.hopVel = 0;
    this.leapCrouch = 0;
    this.leapLand = 0;
    this.leapAirborne = false;
    this.wasResting = false;
    this.breadcrumbs.length = 0;
    this.lastCrumbPos.copy(this.position);
    for (let i = 0; i < this.particles.length; i++) {
      this.scene.remove(this.particles[i]);
      this.particles[i].geometry.dispose();
      this.particles[i].material.dispose();
    }
    this.particles.length = 0;
    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
  }

  _recordBreadcrumb(playerPos) {
    if (!isWalkable(playerPos.x, playerPos.z)) return;
    const d = Math.hypot(playerPos.x - this.lastCrumbPos.x, playerPos.z - this.lastCrumbPos.z);
    if (d >= 1.0) {
      this.breadcrumbs.push(playerPos.clone());
      this.lastCrumbPos.copy(playerPos);
      if (this.breadcrumbs.length > 36) this.breadcrumbs.shift();
    }
  }

  _steerToward(tx, tz, speed, dt, minDist = 0.2) {
    const dx = tx - this.position.x;
    const dz = tz - this.position.z;
    const len = Math.hypot(dx, dz);
    if (len <= minDist) return 0;

    const nx = this.position.x + (dx / len) * speed * dt;
    const nz = this.position.z + (dz / len) * speed * dt;

    const prevX = this.position.x;
    const prevZ = this.position.z;
    const resolved = resolveMovement(prevX, prevZ, nx, nz, 0.24);
    const moved = Math.hypot(resolved.x - prevX, resolved.z - prevZ);

    if (moved > 0.0015) {
      this.position.set(resolved.x, resolved.y, resolved.z);
    }

    const targetYaw = Math.atan2(dx, dz);
    let diff = targetYaw - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.yaw += diff * (1 - Math.exp(-dt * 12));

    this.walkPhase += dt * (speed > 5.0 ? 16 : 12.5);
    this.torsoPivot.position.y = 0.25 + Math.abs(Math.sin(this.walkPhase)) * 0.045;
    this.torsoPivot.rotation.set(0, 0, 0);
    this.legs[0].rotation.x = Math.sin(this.walkPhase) * 0.58;
    this.legs[1].rotation.x = -Math.sin(this.walkPhase) * 0.58;
    this.legs[2].rotation.x = -Math.sin(this.walkPhase) * 0.58;
    this.legs[3].rotation.x = Math.sin(this.walkPhase) * 0.58;
    this.bellPivot.rotation.z = Math.sin(this.walkPhase) * 0.28;
    return moved;
  }

  _resetStandingPose(dt) {
    this._setHappyEyes(false);
    this.torsoPivot.position.y += (0.25 - this.torsoPivot.position.y) * (1 - Math.exp(-dt * 12));
    this.torsoPivot.rotation.x *= Math.exp(-dt * 12);
    this.torsoPivot.rotation.z *= Math.exp(-dt * 12);
    this.headGroup.position.y += (0.17 - this.headGroup.position.y) * (1 - Math.exp(-dt * 12));
    this.headGroup.rotation.x *= Math.exp(-dt * 10);
    this.headGroup.rotation.z *= Math.exp(-dt * 10);
    for (let i = 0; i < 4; i++) {
      this.legs[i].visible = true;
      this.legs[i].rotation.x *= Math.exp(-dt * 12);
      this.legs[i].rotation.z *= Math.exp(-dt * 12);
    }
  }

  update(dt, elapsed, player, koiSchool) {
    const o = this._leapOffsets;
    if (o) {
      this.torsoPivot.position.y -= o.dy;
      this.torsoPivot.rotation.x -= o.rx;
      this.headGroup.rotation.x -= o.hx;
      this._leapOffsets = null;
    }
    this._updateBehaviour(dt, elapsed, player, koiSchool);
    if (this.state !== 'NAP_SUN') {
      this._applyLeapPose(dt);
      this.group.position.y = this.visualY + this.hopOffset;
    }
  }

  _updateBehaviour(dt, elapsed, player, koiSchool) {
    this._recordBreadcrumb(player.position);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.userData.age += dt;
      const t = p.userData.age / p.userData.maxAge;
      if (t >= 1) {
        this.scene.remove(p);
        p.geometry.dispose();
        p.material.dispose();
        this.particles.splice(i, 1);
      } else {
        p.position.y += p.userData.vy * dt;
        p.position.x += Math.sin(elapsed * 5 + i) * 0.25 * dt;
        p.material.opacity = 1 - t;
      }
    }

    this.visualY += (this.position.y - this.visualY) * (1 - Math.exp(-dt * 22.0));

    this._updateLeap(dt);

    // Smooth 4-segment curved calico tail flow
    const tailWave = Math.sin(elapsed * 3.6);
    this.tailSeg1.rotation.z = tailWave * 0.22;
    this.tailSeg2.rotation.z = Math.sin(elapsed * 3.6 - 0.6) * 0.24;
    this.tailSeg3.rotation.z = Math.sin(elapsed * 3.6 - 1.2) * 0.26;
    this.tailSeg4.rotation.z = Math.sin(elapsed * 3.6 - 1.8) * 0.26;

    const distToPlayer = Math.hypot(
      player.position.x - this.position.x,
      player.position.z - this.position.z
    );

    // 1. Happy Pet Celebration
    if (this.happyTimer > 0) {
      this.happyTimer -= dt;
      this.state = 'HAPPY_PET';
      this._setHappyEyes(true);
      this.wasResting = false;
      const hop = Math.abs(Math.sin(this.happyTimer * 9.0)) * 0.22;
      this.torsoPivot.position.y = 0.25 + hop;
      this.torsoPivot.rotation.x = -0.1;
      this.tailSeg1.rotation.z = Math.sin(elapsed * 14) * 0.48;
      this.headGroup.rotation.z = Math.sin(elapsed * 10) * 0.16;
      this.bellPivot.rotation.z = Math.sin(elapsed * 16) * 0.35;
      for (let i = 0; i < 4; i++) this.legs[i].visible = true;
      this.group.position.set(this.position.x, this.visualY, this.position.z);
      this.group.rotation.y = this.yaw;
      if (this.happyTimer <= 0) this.state = 'FOLLOW';
      return;
    }

    if (player.isMoving) {
      this.idleTimer = 0;
      this.groomTimer = 0;
      this.pounceTimer = 0;
      if (this.wasResting && this.stretchTimer <= 0) {
        this.stretchTimer = 0.65;
        this.wasResting = false;
      }
    } else {
      this.idleTimer += dt;
    }

    // 2. Cute Play-Bow Stretch on Waking Up
    if (this.stretchTimer > 0) {
      this.stretchTimer -= dt;
      this.state = 'STRETCH';
      this._setHappyEyes(true);
      const bow = Math.sin((this.stretchTimer / 0.65) * Math.PI);
      this.torsoPivot.position.y = 0.22;
      this.torsoPivot.rotation.x = 0.34 * bow;
      this.headGroup.rotation.x = -0.25 * bow;
      this.legs[0].rotation.x = -0.58 * bow;
      this.legs[1].rotation.x = -0.58 * bow;
      this.legs[2].rotation.x = 0.12 * bow;
      this.legs[3].rotation.x = 0.12 * bow;
      this.tailSeg1.rotation.x = 0.28 * bow;
      this.group.position.set(this.position.x, this.visualY + this.hopOffset, this.position.z);
      this.group.rotation.y = this.yaw;
      return;
    }
    this.tailSeg1.rotation.x = 0;

    // 3. Hint Curious Nudge (runs ahead toward hinted puzzle prop & glances back)
    if (this.nudgeTimer > 0 && this.nudgeTarget) {
      this.nudgeTimer -= dt;
      this.state = 'CURIOUS_NUDGE';
      this._resetStandingPose(dt);
      const dx = this.nudgeTarget.x - this.position.x;
      const dz = this.nudgeTarget.z - this.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.2 && distToPlayer < 6.5) {
        this._steerToward(this.nudgeTarget.x, this.nudgeTarget.z, 5.4, dt, 1.5);
      } else {
        // Turn back briefly to look at Hana while twitching tail
        const lookPlayerYaw = Math.atan2(
          player.position.x - this.position.x,
          player.position.z - this.position.z
        );
        let diff = lookPlayerYaw - this.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.yaw += diff * (1 - Math.exp(-dt * 8));
        this.tailSeg1.rotation.z = Math.sin(elapsed * 9.0) * 0.36;
      }
      this.group.position.set(this.position.x, this.visualY + this.hopOffset, this.position.z);
      this.group.rotation.y = this.yaw;
      return;
    }

    // 4. Called from afar with F
    if (this.calledTimer > 0) {
      this.calledTimer -= dt;
      if (distToPlayer <= 2.35) {
        this.calledTimer = 0;
        this.pet(player.position);
        return;
      }
      this.state = 'CALLED';
      this._resetStandingPose(dt);
      const target = this.breadcrumbs.length > 0 && distToPlayer > 4.2 ? this.breadcrumbs[0] : player.position;
      this._steerToward(target.x, target.z, 6.9, dt, 0.8);
      this.group.position.set(this.position.x, this.visualY + this.hopOffset, this.position.z);
      this.group.rotation.y = this.yaw;
      return;
    }

    // 4B. Holding a sacred puzzle spot / warm cedar hearth (Chapters II & VII)
    if (this.holdTimer > 0 && this.holdSpot) {
      this.holdTimer -= dt;
      if (distToPlayer > 9.5) {
        this.holdTimer = 0;
      } else {
        const dHold = Math.hypot(this.holdSpot.x - this.position.x, this.holdSpot.z - this.position.z);
        if (dHold > 0.42) {
          this.state = 'CALLED';
          this._resetStandingPose(dt);
          this._steerToward(this.holdSpot.x, this.holdSpot.z, 5.8, dt, 0.2);
        } else {
          this.state = 'HOLD_SPOT';
          this._setHappyEyes(true);
          this.torsoPivot.position.y = 0.18;
          this.torsoPivot.rotation.x = -0.25;
          this.legs[2].rotation.x = -0.9;
          this.legs[3].rotation.x = -0.9;
          this.legs[0].rotation.x = 0.16;
          this.legs[1].rotation.x = 0.16;
          const lookYaw = Math.atan2(player.position.x - this.position.x, player.position.z - this.position.z);
          let diff = lookYaw - this.yaw;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          this.yaw += diff * (1 - Math.exp(-dt * 8));
          if (Math.random() < dt * 0.6) this._spawnParticle('heart');
        }
        this.group.position.set(this.position.x, this.visualY + this.hopOffset, this.position.z);
        this.group.rotation.y = this.yaw;
        return;
      }
    }

    // 5. Nap beside sitting/still Hana
    const wantNap = (player.isSitting || this.idleTimer > 9.5) && distToPlayer < 2.6;
    if (wantNap) {
      this.state = 'NAP_SUN';
      this.wasResting = true;
      this._setHappyEyes(true);
      this.torsoPivot.position.y = 0.13 + Math.sin(elapsed * 2.2) * 0.01;
      this.torsoPivot.rotation.set(0.06, 0.18, 0.1);
      for (let i = 0; i < 4; i++) this.legs[i].visible = false;
      this.headGroup.position.y = 0.12;
      this.headGroup.rotation.set(0.22, -0.2, 0);
      this.tailSeg1.rotation.z = 0.35 + Math.sin(elapsed * 1.4) * 0.08;
      if (Math.random() < dt * 0.75) this._spawnParticle('zzz');
      this.group.position.set(this.position.x, this.visualY, this.position.z);
      this.group.rotation.y = this.yaw;
      return;
    }

    this._resetStandingPose(dt);

    // 6. Koi Watching (triggered when koi fed or standing beside pond)
    if (this.koiWatchTimer > 0 && this.koiTarget) {
      this.koiWatchTimer -= dt;
      if (distToPlayer > 5.8) {
        this.koiWatchTimer = 0;
      } else {
        this.state = 'INVESTIGATE_KOI';
        const dKoi = Math.hypot(this.koiTarget.x - this.position.x, this.koiTarget.z - this.position.z);
        if (dKoi > 2.2) {
          this._steerToward(this.koiTarget.x, this.koiTarget.z, 5.1, dt, 1.8);
        } else {
          const targetYaw = Math.atan2(this.koiTarget.x - this.position.x, this.koiTarget.z - this.position.z);
          let diff = targetYaw - this.yaw;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          this.yaw += diff * (1 - Math.exp(-dt * 7));
          this.torsoPivot.rotation.x = 0.18;
          this.headGroup.rotation.x = 0.24;
          this.headGroup.rotation.z = Math.sin(elapsed * 3.2) * 0.14;
          this.tailSeg3.rotation.z = Math.sin(elapsed * 7.5) * 0.36;
        }
        this.group.position.set(this.position.x, this.visualY + this.hopOffset, this.position.z);
        this.group.rotation.y = this.yaw;
        return;
      }
    }

    let nearKoi = null;
    if (!player.isMoving && distToPlayer < 3.4 && koiSchool) {
      nearKoi = koiSchool.getClosestKoi(this.position.x, this.position.z, 5.2);
    }

    const sideAngle = player.yaw + Math.PI * 0.5;
    const napSpotX = player.position.x + Math.sin(sideAngle) * 1.18;
    const napSpotZ = player.position.z + Math.cos(sideAngle) * 1.18;

    const desiredTarget =
      player.isSitting && isWalkable(napSpotX, napSpotZ)
        ? { x: napSpotX, z: napSpotZ }
        : { x: player.position.x, z: player.position.z };

    const followThreshold = player.isSitting ? 0.55 : 2.0;
    const distToTarget = Math.hypot(
      desiredTarget.x - this.position.x,
      desiredTarget.z - this.position.z
    );

    if (distToTarget > followThreshold) {
      this.state = 'FOLLOW';
      this.wasResting = false;

      while (this.breadcrumbs.length > 0) {
        const b = this.breadcrumbs[0];
        if (Math.hypot(b.x - this.position.x, b.z - this.position.z) < 0.9) {
          this.breadcrumbs.shift();
        } else {
          break;
        }
      }

      let steerTarget = desiredTarget;
      const heightGap = Math.abs(getHeightAt(desiredTarget.x, desiredTarget.z) - this.position.y);
      if ((distToTarget > 3.6 || heightGap > 0.7) && this.breadcrumbs.length > 0) {
        steerTarget = this.breadcrumbs[0];
      }

      const speed = distToPlayer > 6.0 ? 6.8 : 4.55;
      const moved = this._steerToward(steerTarget.x, steerTarget.z, speed, dt, 0.05);

      if (moved < 0.002 && distToPlayer > 2.8) {
        this.stuckTimer += dt;
        if (this.breadcrumbs.length > 1 && this.stuckTimer > 0.4) {
          this.breadcrumbs.shift();
        }
        if (this.stuckTimer > 2.2 || distToPlayer > 16) {
          const fallback =
            this.breadcrumbs.length > 0
              ? this.breadcrumbs[Math.max(0, this.breadcrumbs.length - 2)]
              : player.position;
          if (isWalkable(fallback.x, fallback.z)) {
            this.position.set(fallback.x, getHeightAt(fallback.x, fallback.z), fallback.z);
            this.visualY = this.position.y;
            this.stuckTimer = 0;
          }
        }
      } else {
        this.stuckTimer = 0;
      }
    } else if (nearKoi) {
      this.state = 'INVESTIGATE_KOI';
      const targetYaw = Math.atan2(nearKoi.x - this.position.x, nearKoi.z - this.position.z);
      let diff = targetYaw - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * (1 - Math.exp(-dt * 6));
      this.torsoPivot.rotation.x = 0.16;
      this.headGroup.rotation.x = 0.25;
      this.headGroup.rotation.z = Math.sin(elapsed * 3.0) * 0.14;
    } else if (this.idleTimer > 2.8) {
      // Idle Sit / Groom / Petal Pounce cycle
      this.wasResting = true;
      this.groomCooldown -= dt;
      this.pounceCooldown -= dt;

      if (this.pounceCooldown <= 0 && this.pounceTimer <= 0 && this.groomTimer <= 0) {
        this.pounceTimer = 0.65;
        this.pounceCooldown = 10 + Math.random() * 6;
        this._startLeap(2.3);
      } else if (this.groomCooldown <= 0 && this.groomTimer <= 0 && this.pounceTimer <= 0) {
        this.groomTimer = 2.6;
        this.groomCooldown = 7 + Math.random() * 5;
      }

      if (this.pounceTimer > 0) {
        this.pounceTimer -= dt;
        this.state = 'CHASE_PETAL';
        const bat = Math.sin(elapsed * 20) * 0.5;
        this.legs[1].rotation.x = -0.85 + bat;
        this.legs[0].rotation.x = -0.35;
        this.headGroup.rotation.x = -0.18;
      } else if (this.groomTimer > 0) {
        this.groomTimer -= dt;
        this.state = 'GROOM';
        this._setHappyEyes(true);
        this.torsoPivot.position.y = 0.18;
        this.torsoPivot.rotation.x = -0.28;
        this.legs[2].rotation.x = -0.9;
        this.legs[3].rotation.x = -0.9;
        this.legs[1].rotation.x = -0.95 + Math.sin(elapsed * 9.5) * 0.25;
        this.legs[1].rotation.z = -0.25;
        this.headGroup.rotation.x = 0.34;
        this.headGroup.rotation.z = -0.24 + Math.sin(elapsed * 9.5) * 0.08;
      } else {
        this.state = 'SIT_LOAF';
        this.torsoPivot.position.y = 0.18;
        this.torsoPivot.rotation.x = -0.28;
        this.legs[2].rotation.x = -0.92;
        this.legs[3].rotation.x = -0.92;
        this.legs[0].rotation.x = 0.16;
        this.legs[1].rotation.x = 0.16;
        this.headGroup.rotation.x = 0.24;
        this.headGroup.rotation.z = Math.sin(elapsed * 1.4) * 0.08;
        this.tailSeg1.rotation.z = 0.25 + Math.sin(elapsed * 2.1) * 0.14;
      }
    } else {
      this.state = 'FOLLOW';
      this.torsoPivot.position.y = 0.25 + Math.sin(elapsed * 2.5) * 0.015;
    }

    this.group.position.set(this.position.x, this.visualY + this.hopOffset, this.position.z);
    this.group.rotation.y = this.yaw;
  }
}

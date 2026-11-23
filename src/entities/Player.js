import * as THREE from 'three';
import { createPixelToonMaterial } from '../engine/ToonMaterials.js';
import { buildHanaHead } from './hanaHead.js';
import { SPAWN_POINT } from '../world/TerrainData.js';
import { getHeightAt, getSurfaceAt, isWalkable, resolveMovement } from '../world/ActiveTerrain.js';

// ---------- Tuning ----------
const WALK_SPEED = 4.85;
const RUN_SPEED = 7.4;
const HIP_Y = 0.8; // hip joint height (bodyRoot space)
const THIGH_LEN = 0.42;
const SHIN_LEN = 0.3;
const FOOT_H = 0.075;
const LEG_LEN = THIGH_LEN + SHIN_LEN + FOOT_H;
const JUMP_VEL = 6.25;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

/** Critically-tunable 1D spring (semi-implicit Euler) used for secondary motion. */
class Spring {
  constructor(stiffness, damping, value = 0) {
    this.k = stiffness;
    this.c = damping;
    this.x = value;
    this.v = 0;
  }
  step(target, dt) {
    const h = Math.min(dt, 1 / 30);
    this.v += ((target - this.x) * this.k - this.v * this.c) * h;
    this.x += this.v * h;
    return this.x;
  }
  reset(value = 0) {
    this.x = value;
    this.v = 0;
  }
}

function createPleatedSkirtGeometry(topR = 0.2, botR = 0.43, height = 0.74, pleats = 16, rows = 6) {
  const segs = pleats * 2;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let row = 0; row <= rows; row++) {
    const t = row / rows; // 0 = waist, 1 = hem
    const y = height * (1 - t);
    const bellT = Math.pow(t, 1.25);
    const baseR = topR + (botR - topR) * bellT;
    // Pleats deepen toward the hem but stay shallow enough not to saw-tooth the silhouette
    const pleatDepth = 0.005 + t * 0.02;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const r = baseR + (i % 2 === 0 ? pleatDepth : -pleatDepth);
      positions.push(Math.sin(a) * r, y, Math.cos(a) * r);
      uvs.push(i / segs, t);
    }
  }

  const stride = segs + 1;
  for (let row = 0; row < rows; row++) {
    for (let i = 0; i < segs; i++) {
      const t0 = row * stride + i;
      const t1 = row * stride + i + 1;
      const b0 = (row + 1) * stride + i;
      const b1 = (row + 1) * stride + i + 1;
      indices.push(t0, b0, b1);
      indices.push(t0, b1, t1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.userData = { rows, segs, stride, height, topR, botR };
  return geo;
}

/** Smooth solid of revolution from (radius, height) pairs, bottom to top. */
function latheGeo(profile, segments = 18) {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments
  );
}

/**
 * Lofted body: rings of (y, half width, front depth, back depth), bottom to top,
 * closed at both ends. Each ring is an ellipse whose front and back halves can
 * differ, so a chest can be fuller than the back.
 */
function loftGeometry(rings, radial = 24) {
  const positions = [];
  const indices = [];
  const ringPoint = (ring, a) => {
    const [y, rx, fz, bz] = ring;
    const s = Math.sin(a);
    const c = Math.cos(a);
    // Slightly squarer than an ellipse so the cloth reads as a garment, not a pill
    const sx = Math.sign(s) * Math.pow(Math.abs(s), 0.85);
    const cz = Math.sign(c) * Math.pow(Math.abs(c), 0.85);
    return [sx * rx, y, cz * (c >= 0 ? fz : bz)];
  };
  rings.forEach((ring) => {
    for (let i = 0; i <= radial; i++) positions.push(...ringPoint(ring, (i / radial) * Math.PI * 2));
  });
  const stride = radial + 1;
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < radial; i++) {
      const a = r * stride + i;
      const b = a + stride;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  // Caps
  const bottom = positions.length / 3;
  positions.push(0, rings[0][0], 0);
  const top = bottom + 1;
  positions.push(0, rings[rings.length - 1][0], 0);
  const last = (rings.length - 1) * stride;
  for (let i = 0; i < radial; i++) {
    indices.push(bottom, i + 1, i);
    indices.push(top, last + i, last + i + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Point on the front of a lofted body at (x, y): interpolates the ring under y. */
function loftFrontZ(rings, x, y) {
  let i = 0;
  while (i < rings.length - 2 && rings[i + 1][0] < y) i++;
  const r0 = rings[i];
  const r1 = rings[i + 1];
  const t = clamp((y - r0[0]) / (r1[0] - r0[0] || 1), 0, 1);
  const rx = r0[1] + (r1[1] - r0[1]) * t;
  const fz = r0[2] + (r1[2] - r0[2]) * t;
  const u = clamp(Math.abs(x) / rx, 0, 1);
  // Inverse of the squarer ellipse used by loftGeometry
  const s = Math.pow(u, 1 / 0.85);
  const c = Math.sqrt(Math.max(0, 1 - s * s));
  return Math.pow(c, 0.85) * fz;
}

/**
 * Flat band laid on the front of a lofted body along a polyline of (x, y) points,
 * e.g. a kimono collar. `lift` keeps it just above the surface.
 */
function surfaceBandGeometry(rings, path, width, lift = 0.006, samples = 14) {
  const pts = [];
  for (let s = 0; s <= samples; s++) {
    const f = (s / samples) * (path.length - 1);
    const k = Math.min(path.length - 2, Math.floor(f));
    const t = f - k;
    const x = path[k][0] + (path[k + 1][0] - path[k][0]) * t;
    const y = path[k][1] + (path[k + 1][1] - path[k][1]) * t;
    pts.push(new THREE.Vector3(x, y, loftFrontZ(rings, x, y) + lift));
  }
  const positions = [];
  const indices = [];
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  const out = new THREE.Vector3();
  pts.forEach((p, i) => {
    tangent.subVectors(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)]).normalize();
    out.set(p.x * 0.6, 0, 1).normalize();
    side.crossVectors(tangent, out).normalize().multiplyScalar(width * 0.5);
    positions.push(p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z);
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Thin slab with softly rounded corners, lying in the XY plane (depth along Z). */
function roundedSlabGeometry(w, h, depth, radii, bevel = 0.012) {
  const [rtl, rtr, rbr, rbl] = radii;
  const x0 = -w / 2;
  const y0 = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x0 + rbl, y0);
  s.lineTo(x0 + w - rbr, y0);
  s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + rbr);
  s.lineTo(x0 + w, y0 + h - rtr);
  s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - rtr, y0 + h);
  s.lineTo(x0 + rtl, y0 + h);
  s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - rtl);
  s.lineTo(x0, y0 + rbl);
  s.quadraticCurveTo(x0, y0, x0 + rbl, y0);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.001, depth - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 3,
    curveSegments: 8,
  });
  geo.translate(0, 0, -(depth - bevel * 2) / 2);
  geo.computeVertexNormals();
  return geo;
}

// Kimono torso (upperBody space): [y, half width, front depth, back depth].
// Sloping shoulders run into the neck the way a kimono falls from the collar.
const TORSO_RINGS = [
  [0.0, 0.17, 0.125, 0.115],
  [0.12, 0.165, 0.125, 0.112],
  [0.22, 0.178, 0.138, 0.112],
  [0.3, 0.186, 0.142, 0.11],
  [0.36, 0.184, 0.13, 0.108],
  [0.405, 0.165, 0.112, 0.1],
  [0.44, 0.128, 0.092, 0.088],
  [0.468, 0.085, 0.07, 0.07],
  [0.49, 0.056, 0.054, 0.056],
];

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    const startY = getHeightAt(SPAWN_POINT.x, SPAWN_POINT.z);
    this.position = new THREE.Vector3(SPAWN_POINT.x, startY, SPAWN_POINT.z);
    this.visualY = startY;
    this.yaw = SPAWN_POINT.yaw;
    this.velocity = new THREE.Vector3();
    this._prevVel = new THREE.Vector3();
    this.accelLocal = new THREE.Vector2(); // x = lateral, y = forward (smoothed)

    // Jump state
    this.jumpOffset = 0;
    this.jumpVel = 0;
    this.isGrounded = true;
    this.jumpBuffer = 0;
    this.jumpAnticipation = 0;
    this.coyoteTimer = 0;
    this.landTimer = 0;
    this.landImpact = 0;
    this.airTime = 0;

    // Squash & stretch
    this.bodySquash = 0;
    this.bodySquashVel = 0;

    // Secondary motion springs
    this.springs = {
      lean: new Spring(90, 14),
      bank: new Spring(70, 12),
      ponyPitch: new Spring(70, 7.5, 0.15),
      ponySide: new Spring(60, 7),
      ponyTip: new Spring(110, 9, 0.12),
      ribbon: new Spring(80, 6.5, 0.2),
      sash: new Spring(55, 6, 0.15),
      sleeveL: new Spring(85, 8),
      sleeveR: new Spring(85, 8),
      headYaw: new Spring(40, 11),
    };

    this.runBlend = 0;
    this.moveBlend = 0;
    this.airBlend = 0;
    this.climbRate = 0;
    this.preSitPos = null;
    this.isMoving = false;
    this.isRunning = false;
    this.isSitting = false;
    this.sitBlend = 0;
    this.petTimer = 0;
    this.pushTimer = 0;
    this.walkPhase = 0;
    this._lastStepIdx = 0;
    this.idleTime = 0;
    this.clothTime = 0;
    this.prevYaw = this.yaw;
    this.yawVel = 0;
    this.walkTarget = null;
    this.lookTarget = null; // optional world position to glance at (e.g. Mochi)
    this.onStep = null;
    this.onJump = null;
    this.onLand = null;

    this.dustPuffs = [];
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._desiredDir = new THREE.Vector3();
    this._tmpA = new THREE.Vector3();
    this._tmpB = new THREE.Vector3();
    this._invMat = new THREE.Matrix4();

    this._buildHanaMesh();
    this._initCloth();
    this._initHair();
    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
    scene.add(this.group);
  }

  _buildHanaMesh() {
    const skin = createPixelToonMaterial({ occludable: false, color: '#f6d4bc' });
    const ribbon = createPixelToonMaterial({ occludable: false, color: '#e54130' });
    const topIvory = createPixelToonMaterial({ occludable: false, color: '#faf4e6' });
    const collarTrim = createPixelToonMaterial({ occludable: false, color: '#e3d8bf' });
    const hakamaGreen = createPixelToonMaterial({ occludable: false, color: '#1f683f', side: THREE.DoubleSide });
    const hakamaDeep = createPixelToonMaterial({ occludable: false, color: '#17532f' });
    const sleeveInner = createPixelToonMaterial({ occludable: false, color: '#b9ab92', side: THREE.DoubleSide });
    const obiDark = createPixelToonMaterial({ occludable: false, color: '#164028' });
    const goldCord = createPixelToonMaterial({ occludable: false, color: '#ebc158' });
    const tabiWhite = createPixelToonMaterial({ occludable: false, color: '#f7f4ee' });
    const sandalWood = createPixelToonMaterial({ occludable: false, color: '#6b442b' });
    const hanaoRed = createPixelToonMaterial({ occludable: false, color: '#c8352b' });

    this.bodyRoot = new THREE.Group();
    this.group.add(this.bodyRoot);

    // Pelvis carries legs + hakama so hip twist moves both together
    this.pelvis = new THREE.Group();
    this.bodyRoot.add(this.pelvis);

    // Legs: hip -> knee -> ankle chain (thigh hidden under the hakama)
    const makeLeg = (sx) => {
      const hip = new THREE.Group();
      hip.position.set(sx, HIP_Y, 0);
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.076, THIGH_LEN, 8), hakamaDeep);
      thigh.position.y = -THIGH_LEN * 0.5;
      hip.add(thigh);

      const knee = new THREE.Group();
      knee.position.y = -THIGH_LEN;
      hip.add(knee);
      // Shin with a soft calf swell that narrows to the ankle (skin above the tabi)
      const shin = new THREE.Mesh(
        latheGeo(
          [
            [0.0, -SHIN_LEN + 0.02],
            [0.034, -SHIN_LEN + 0.03],
            [0.038, -SHIN_LEN * 0.62],
            [0.048, -SHIN_LEN * 0.38],
            [0.05, -SHIN_LEN * 0.2],
            [0.046, -0.01],
            [0.0, 0.02],
          ],
          12
        ),
        skin
      );
      shin.scale.set(1, 1, 0.92);
      shin.castShadow = true;
      knee.add(shin);
      // Tabi sock cuff over the ankle
      const cuff = new THREE.Mesh(
        latheGeo([[0.0, -0.03], [0.04, -0.03], [0.041, 0.03], [0.038, 0.075], [0.0, 0.075]], 12),
        tabiWhite
      );
      cuff.position.y = -SHIN_LEN;
      knee.add(cuff);

      const ankle = new THREE.Group();
      ankle.position.y = -SHIN_LEN;
      knee.add(ankle);
      // Geta: a thin rounded wooden sole on two low teeth, with a red hanao thong
      const geta = new THREE.Mesh(roundedSlabGeometry(0.1, 0.21, 0.026, [0.04, 0.04, 0.035, 0.035], 0.008), sandalWood);
      geta.rotation.x = -Math.PI / 2;
      geta.position.set(0, -FOOT_H + 0.03, 0.035);
      geta.castShadow = true;
      ankle.add(geta);
      for (const tz of [-0.035, 0.1]) {
        const tooth = new THREE.Mesh(roundedSlabGeometry(0.09, 0.022, 0.028, [0.006, 0.006, 0.006, 0.006], 0.004), sandalWood);
        tooth.position.set(0, -FOOT_H + 0.004, tz);
        ankle.add(tooth);
      }
      // Tabi foot: a rounded wedge, wider at the toes than at the heel
      const tabiFoot = new THREE.Mesh(
        latheGeo([[0.0, -0.07], [0.03, -0.066], [0.04, -0.03], [0.042, 0.02], [0.036, 0.06], [0.0, 0.075]], 12),
        tabiWhite
      );
      tabiFoot.rotation.x = Math.PI / 2;
      tabiFoot.scale.set(1, 1, 0.62);
      tabiFoot.position.set(0, -FOOT_H + 0.065, 0.04);
      ankle.add(tabiFoot);
      // Hanao: a V from the toe post back to both sides of the sole
      for (const sx of [-1, 1]) {
        const strap = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.075, 3, 6), hanaoRed);
        strap.position.set(sx * 0.022, -FOOT_H + 0.07, 0.085);
        strap.rotation.set(Math.PI / 2 - 0.25, 0, sx * 0.75);
        ankle.add(strap);
      }

      this.pelvis.add(hip);
      return { hip, knee, ankle };
    };
    this.legL = makeLeg(0.105);
    this.legR = makeLeg(-0.105);

    // Hakama: vertex-simulated cloth hanging from the waist
    this.skirtPivot = new THREE.Group();
    this.skirtPivot.position.set(0, 0.88, 0);
    // Hakama falls almost straight with deep pleats, flaring only a little at the hem
    this.skirtGeo = createPleatedSkirtGeometry(0.2, 0.34, 0.74, 20, 6);
    this.skirtRestPos = new Float32Array(this.skirtGeo.attributes.position.array);
    this.skirt = new THREE.Mesh(this.skirtGeo, hakamaGreen);
    this.skirt.position.set(0, -0.74, 0);
    this.skirt.castShadow = true;
    this.skirt.receiveShadow = true;
    this.skirt.frustumCulled = false;
    this.skirtPivot.add(this.skirt);
    this.pelvis.add(this.skirtPivot);

    // Upper body
    this.upperBody = new THREE.Group();
    this.upperBody.position.set(0, 0.86, 0);
    this.bodyRoot.add(this.upperBody);

    // Obi follows the oval waist instead of a round drum
    const obi = new THREE.Mesh(new THREE.CylinderGeometry(0.184, 0.19, 0.17, 24), obiDark);
    obi.scale.set(1, 1, 0.74);
    obi.position.set(0, 0.055, 0);
    obi.castShadow = true;
    this.upperBody.add(obi);

    const obijime = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.192, 0.026, 24), goldCord);
    obijime.scale.set(1, 1, 0.76);
    obijime.position.set(0, 0.055, 0);
    this.upperBody.add(obijime);

    const bowCenter = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), obiDark);
    bowCenter.position.set(0, 0.065, -0.15);
    bowCenter.castShadow = true;
    this.upperBody.add(bowCenter);

    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), obiDark);
      wing.scale.set(1.0, 0.8, 0.36);
      wing.position.set(side * 0.11, 0.075, -0.165);
      wing.rotation.z = side * -0.22;
      wing.rotation.y = side * 0.26;
      this.upperBody.add(wing);
    }

    const makeSashTail = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.06, 0.02, -0.165);
      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.22, 3, 8), obiDark);
      tail.scale.set(1, 1, 0.35);
      tail.position.set(0, -0.14, 0);
      tail.rotation.z = side * -0.14;
      pivot.add(tail);
      this.upperBody.add(pivot);
      return pivot;
    };
    this.sashLeft = makeSashTail(-1);
    this.sashRight = makeSashTail(1);

    // Kimono torso: lofted so the chest is fuller than the back and the shoulders
    // slope into the collar. It does not receive cast shadows: the head's shadow
    // on the chest read as a dirty purple smear under the toon ramp.
    const torso = new THREE.Mesh(loftGeometry(TORSO_RINGS, 28), topIvory);
    torso.castShadow = true;
    this.upperBody.add(torso);

    // Collar (eri), worn left over right: the under panel's edge runs from her right
    // neck to the crossing; the top panel's edge runs from her left neck down to the
    // obi on her right. A white han-eri shows just inside the neckline.
    const hanEri = createPixelToonMaterial({ occludable: false, color: '#fffbf3' });
    const underPath = [[-0.058, 0.49], [-0.05, 0.43], [-0.022, 0.33], [0.012, 0.25]];
    const topPath = [[0.058, 0.49], [0.05, 0.43], [0.018, 0.33], [-0.03, 0.22], [-0.075, 0.13]];
    const innerUnder = new THREE.Mesh(surfaceBandGeometry(TORSO_RINGS, underPath.map(([x, y]) => [x * 0.72, y]), 0.03, 0.004), hanEri);
    const innerTop = new THREE.Mesh(surfaceBandGeometry(TORSO_RINGS, topPath.slice(0, 3).map(([x, y]) => [x * 0.72, y]), 0.03, 0.004), hanEri);
    const eriUnder = new THREE.Mesh(surfaceBandGeometry(TORSO_RINGS, underPath, 0.038, 0.008), collarTrim);
    const eriTop = new THREE.Mesh(surfaceBandGeometry(TORSO_RINGS, topPath, 0.042, 0.012), collarTrim);
    [innerUnder, innerTop, eriUnder, eriTop].forEach((m) => this.upperBody.add(m));

    const makeArm = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.185, 0.39, 0);

      // Upper sleeve: a slim tube that leaves the sloping shoulder at an angle
      const upper = new THREE.Mesh(
        latheGeo([[0.0, -0.165], [0.057, -0.16], [0.062, -0.09], [0.066, -0.02], [0.057, 0.02], [0.0, 0.035]], 14),
        topIvory
      );
      upper.position.set(side * 0.016, 0, 0);
      upper.castShadow = true;
      pivot.add(upper);

      const forearmPivot = new THREE.Group();
      forearmPivot.position.set(side * 0.018, -0.15, 0);

      // Forearm sleeve widening a little to the cuff opening (sode-guchi)
      const lower = new THREE.Mesh(
        latheGeo([[0.0, -0.135], [0.068, -0.135], [0.066, -0.08], [0.06, -0.02], [0.055, 0.02], [0.0, 0.03]], 14),
        topIvory
      );
      lower.castShadow = true;
      forearmPivot.add(lower);
      const cuffShadow = new THREE.Mesh(new THREE.CircleGeometry(0.058, 14), sleeveInner);
      cuffShadow.rotation.x = Math.PI / 2;
      cuffShadow.position.y = -0.136;
      forearmPivot.add(cuffShadow);

      const drapePivot = new THREE.Group();
      drapePivot.position.set(0, 0.02, 0);
      // Kimono sleeve (sode): one wide, soft panel that wraps the forearm and hangs
      // behind it as the tamoto, with a well-rounded back corner. Seen from the side
      // it is the big rectangle that makes a kimono read as a kimono.
      const drape = new THREE.Mesh(roundedSlabGeometry(0.21, 0.27, 0.115, [0.035, 0.04, 0.1, 0.03], 0.032), topIvory);
      drape.rotation.y = Math.PI / 2; // thin across the arm; the round corner stays at the back
      drape.position.set(side * 0.006, -0.1, -0.045);
      drape.castShadow = true;
      drapePivot.add(drape);
      forearmPivot.add(drapePivot);

      // Hand: a soft mitten with a thumb, coming out of the front of the cuff
      const handPivot = new THREE.Group();
      handPivot.position.set(0, -0.15, 0.02);
      const palm = new THREE.Mesh(new THREE.CapsuleGeometry(0.034, 0.04, 4, 10), skin);
      palm.scale.set(0.62, 1, 1);
      palm.position.set(0, -0.035, 0);
      palm.rotation.x = 0.12;
      handPivot.add(palm);
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, 0.026, 3, 8), skin);
      thumb.position.set(0, -0.02, 0.028);
      thumb.rotation.x = 0.7;
      handPivot.add(thumb);
      forearmPivot.add(handPivot);

      pivot.add(forearmPivot);
      pivot.userData.forearmPivot = forearmPivot;
      pivot.userData.drapePivot = drapePivot;

      this.upperBody.add(pivot);
      return pivot;
    };
    // Character faces +Z, so her left hand is on +X
    this.leftArm = makeArm(1);
    this.rightArm = makeArm(-1);

    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 0.51, 0);
    this.upperBody.add(this.headGroup);
    // Head, drawn face and hair locks live in hanaHead.js; these are the parts update() animates
    const headParts = buildHanaHead(this.headGroup, { skin, ribbon });
    this.eyes = headParts.eyes;
    this.cheekLocks = headParts.cheekLocks;
    this.ribbonLeft = headParts.ribbonLeft;
    this.ribbonRight = headParts.ribbonRight;
    this.ponytailTop = headParts.ponytailTop;
    this.ponytailTip = headParts.ponytailTip;
    this.blinkTimer = 2.5;
  }

  // ---------- Hakama cloth: world-space Verlet with shape memory ----------
  _initCloth() {
    const { rows, stride } = this.skirtGeo.userData;
    const n = (rows + 1) * stride;
    this.clothPos = new Float32Array(n * 3);
    this.clothPrev = new Float32Array(n * 3);
    this.clothTarget = new Float32Array(n * 3);
    this.clothReady = false;
    this.clothRestR = [];
    for (let row = 0; row <= rows; row++) {
      const i = row * stride * 3;
      const r = Math.hypot(this.skirtRestPos[i], this.skirtRestPos[i + 2]);
      this.clothRestR.push(r);
    }
  }

  resetCloth() {
    this.clothReady = false;
    this.hairReady = false;
  }

  // ---------- Ponytail: two-segment Verlet strand hanging from the head ----------
  _initHair() {
    // Rest directions in the parent frame of each pivot (match the mesh layout)
    this.hairRest1 = new THREE.Vector3(0, -0.2, -0.06);
    this.hairLen1 = this.hairRest1.length();
    this.hairRest1.normalize();
    this.hairRest2 = new THREE.Vector3(0, -0.2, -0.045);
    this.hairLen2 = 0.2;
    this.hairRest2.normalize();
    this.hairP = [new THREE.Vector3(), new THREE.Vector3()];
    this.hairPrev = [new THREE.Vector3(), new THREE.Vector3()];
    this.hairReady = false;
    this._hRoot = new THREE.Vector3();
    this._hTgt = [new THREE.Vector3(), new THREE.Vector3()];
    this._hHead = new THREE.Vector3();
    this._hQ = new THREE.Quaternion();
    this._hQ2 = new THREE.Quaternion();
    this._hDir = new THREE.Vector3();
    this._hTmp = new THREE.Vector3();
  }

  _simulateHair(dt, breeze) {
    const top = this.ponytailTop;
    const parent = top.parent; // headGroup
    // Rest pose: pivots unrotated, read from the head's current world transform
    top.quaternion.identity();
    this.ponytailTip.quaternion.identity();
    parent.updateMatrixWorld(true);
    top.getWorldPosition(this._hRoot);
    this.ponytailTip.getWorldPosition(this._hTgt[0]);
    parent.getWorldQuaternion(this._hQ);
    this._hTgt[1].copy(this.hairRest2).applyQuaternion(this._hQ).multiplyScalar(this.hairLen2).add(this._hTgt[0]);
    this._hHead.set(0, 0.2, 0);
    parent.localToWorld(this._hHead);

    const P = this.hairP;
    const Q = this.hairPrev;
    if (!this.hairReady || P[0].distanceToSquared(this._hRoot) > 1.0) {
      for (let i = 0; i < 2; i++) {
        P[i].copy(this._hTgt[i]);
        Q[i].copy(this._hTgt[i]);
      }
      this.hairReady = true;
    }

    const steps = 2;
    const h = Math.min(dt, 1 / 30) / steps;
    const h2 = h * h;
    const stiff = [70, 32]; // bending memory: the root holds its shape, the tip swings
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < 2; i++) {
        const p = P[i];
        const q = Q[i];
        const vx = (p.x - q.x) * (1 - 3.2 * h);
        const vy = (p.y - q.y) * (1 - 3.2 * h);
        const vz = (p.z - q.z) * (1 - 3.2 * h);
        q.copy(p);
        const t = this._hTgt[i];
        const ax = (t.x - p.x) * stiff[i] + breeze.x;
        const ay = (t.y - p.y) * stiff[i] - 9.8 * 0.55;
        const az = (t.z - p.z) * stiff[i] + breeze.z;
        p.set(p.x + vx + ax * h2, p.y + vy + ay * h2, p.z + vz + az * h2);
      }
      // Inextensible strand
      for (let it = 0; it < 2; it++) {
        const a = this._hRoot;
        for (let i = 0; i < 2; i++) {
          const from = i === 0 ? a : P[0];
          const len = i === 0 ? this.hairLen1 : this.hairLen2;
          this._hDir.subVectors(P[i], from);
          const d = this._hDir.length() || 1e-6;
          P[i].copy(from).addScaledVector(this._hDir, len / d);
        }
        // Stay outside the head and behind the shoulders
        for (let i = 0; i < 2; i++) {
          this._hDir.subVectors(P[i], this._hHead);
          const d = this._hDir.length();
          const r = 0.235;
          if (d < r && d > 1e-5) P[i].copy(this._hHead).addScaledVector(this._hDir, r / d);
        }
      }
    }

    // Aim the pivots along the simulated segments
    this._hQ2.copy(this._hQ).invert();
    this._hDir.subVectors(P[0], this._hRoot).normalize().applyQuaternion(this._hQ2);
    top.quaternion.setFromUnitVectors(this.hairRest1, this._hDir);
    top.updateMatrixWorld(true);
    this.ponytailTip.getWorldPosition(this._hTmp);
    top.getWorldQuaternion(this._hQ2);
    this._hQ2.invert();
    this._hDir.subVectors(P[1], this._hTmp).normalize().applyQuaternion(this._hQ2);
    this.ponytailTip.quaternion.setFromUnitVectors(this.hairRest2, this._hDir);
    top.updateMatrixWorld(true);
  }

  _simulateCloth(dt, groundY, bodyVelY) {
    const { rows, segs, stride } = this.skirtGeo.userData;
    const rest = this.skirtRestPos;
    const pos = this.clothPos;
    const prev = this.clothPrev;
    const tgt = this.clothTarget;
    const e = this.skirt.matrixWorld.elements;

    // Rest pose in world space (shape memory target)
    for (let v = 0, n = (rows + 1) * stride; v < n; v++) {
      const k = v * 3;
      const rx = rest[k];
      const ry = rest[k + 1];
      const rz = rest[k + 2];
      tgt[k] = e[0] * rx + e[4] * ry + e[8] * rz + e[12];
      tgt[k + 1] = e[1] * rx + e[5] * ry + e[9] * rz + e[13];
      tgt[k + 2] = e[2] * rx + e[6] * ry + e[10] * rz + e[14];
    }

    // Carry part of the body's own motion into the fabric so only the remainder lags
    // behind. Vertical motion is carried almost fully: a jump should lift the hakama,
    // not stretch it into a tube and then flip it like an umbrella on the way down.
    const ox = e[12];
    const oy = e[13];
    const oz = e[14];
    if (this.clothReady && this._clothOrigin) {
      const cx = (ox - this._clothOrigin.x) * 0.35;
      const cy = (oy - this._clothOrigin.y) * 0.88;
      const cz = (oz - this._clothOrigin.z) * 0.35;
      for (let v = stride, n = (rows + 1) * stride; v < n; v++) {
        const k = v * 3;
        pos[k] += cx;
        pos[k + 1] += cy;
        pos[k + 2] += cz;
        prev[k] += cx;
        prev[k + 1] += cy;
        prev[k + 2] += cz;
      }
    }
    (this._clothOrigin || (this._clothOrigin = new THREE.Vector3())).set(ox, oy, oz);

    // Teleports / first frame: snap to rest
    if (!this.clothReady || Math.abs(pos[0] - tgt[0]) + Math.abs(pos[2] - tgt[2]) > 1.5) {
      pos.set(tgt);
      prev.set(tgt);
      this.clothReady = true;
    }

    // Waist ring is pinned
    for (let i = 0; i < stride; i++) {
      const k = i * 3;
      pos[k] = prev[k] = tgt[k];
      pos[k + 1] = prev[k + 1] = tgt[k + 1];
      pos[k + 2] = prev[k + 2] = tgt[k + 2];
    }

    // Body axis (waist centre) in world
    const axX = e[4] * 0.74 + e[12];
    const axZ = e[6] * 0.74 + e[14];

    // Leg capsules in world (thigh + shin per leg)
    const caps = this._legCapsules || (this._legCapsules = [
      { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.11 },
      { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.085 },
      { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.11 },
      { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.085 },
    ]);
    [this.legL, this.legR].forEach((leg, li) => {
      leg.hip.getWorldPosition(caps[li * 2].a);
      leg.knee.getWorldPosition(caps[li * 2].b);
      caps[li * 2 + 1].a.copy(caps[li * 2].b);
      leg.ankle.getWorldPosition(caps[li * 2 + 1].b);
    });

    const substeps = 3;
    const h = Math.min(dt, 1 / 30) / substeps;
    const h2 = h * h;
    const gravity = this.isSitting ? -6.0 : -5.4; // light fabric: falls slower than Hana
    // Air pushing up under the falling bell of fabric
    const flare = !this.isGrounded ? Math.min(Math.max(0, -bodyVelY) * 0.16, 0.9) : 0;

    for (let s = 0; s < substeps; s++) {
      // Integrate dynamic rows
      for (let row = 1; row <= rows; row++) {
        const t = row / rows;
        const kShape = 950 - 620 * t; // stiff near the waist, loose at the hem
        const drag = 2.6 + 1.8 * t;
        const keep = 1 - drag * h;
        for (let i = 0; i < segs; i++) {
          const k = (row * stride + i) * 3;
          const px = pos[k];
          const py = pos[k + 1];
          const pz = pos[k + 2];
          const vx = (px - prev[k]) * keep;
          const vy = (py - prev[k + 1]) * keep;
          const vz = (pz - prev[k + 2]) * keep;
          prev[k] = px;
          prev[k + 1] = py;
          prev[k + 2] = pz;

          let ax = (tgt[k] - px) * kShape;
          let ay = (tgt[k + 1] - py) * kShape + gravity;
          let az = (tgt[k + 2] - pz) * kShape;
          if (flare > 0) {
            const dx = px - axX;
            const dz = pz - axZ;
            const len = Math.hypot(dx, dz) || 1;
            ax += (dx / len) * flare * t * 6;
            az += (dz / len) * flare * t * 6;
            ay += flare * t * 1.6;
          }
          pos[k] = px + vx + ax * h2;
          pos[k + 1] = py + vy + ay * h2;
          pos[k + 2] = pz + vz + az * h2;
        }
      }

      // Constraints
      for (let it = 0; it < 2; it++) {
        for (let row = 1; row <= rows; row++) {
          const t = row / rows;
          const ringStretch = 1.06 + 0.32 * t;
          for (let i = 0; i < segs; i++) {
            const k = (row * stride + i) * 3;
            const pk = ((row - 1) * stride + i) * 3;

            // Inextensible vertical fibres (parent row is more trusted)
            const restL = Math.hypot(tgt[k] - tgt[pk], tgt[k + 1] - tgt[pk + 1], tgt[k + 2] - tgt[pk + 2]);
            let dx = pos[k] - pos[pk];
            let dy = pos[k + 1] - pos[pk + 1];
            let dz = pos[k + 2] - pos[pk + 2];
            let d = Math.hypot(dx, dy, dz) || 1e-6;
            if (d > restL * 1.02) {
              const f = (d - restL * 1.02) / d;
              const wChild = row === 1 ? 1 : 0.8;
              pos[k] -= dx * f * wChild;
              pos[k + 1] -= dy * f * wChild;
              pos[k + 2] -= dz * f * wChild;
              if (row > 1) {
                pos[pk] += dx * f * (1 - wChild);
                pos[pk + 1] += dy * f * (1 - wChild);
                pos[pk + 2] += dz * f * (1 - wChild);
              }
            }

            // Ring can open like pleats but not over-stretch
            const nk = (row * stride + ((i + 1) % segs)) * 3;
            const restH = Math.hypot(tgt[k] - tgt[nk], tgt[k + 2] - tgt[nk + 2]);
            dx = pos[nk] - pos[k];
            dy = pos[nk + 1] - pos[k + 1];
            dz = pos[nk + 2] - pos[k + 2];
            d = Math.hypot(dx, dy, dz) || 1e-6;
            const maxL = restH * ringStretch;
            if (d > maxL) {
              const f = ((d - maxL) / d) * 0.5;
              pos[k] += dx * f;
              pos[k + 1] += dy * f;
              pos[k + 2] += dz * f;
              pos[nk] -= dx * f;
              pos[nk + 1] -= dy * f;
              pos[nk + 2] -= dz * f;
            }
          }
        }

        // Collisions: legs, body core, ground
        for (let row = 2; row <= rows; row++) {
          const minR = this.clothRestR[row] * (this.isSitting ? 0.5 : 0.72);
          for (let i = 0; i < segs; i++) {
            const k = (row * stride + i) * 3;
            let px = pos[k];
            let py = pos[k + 1];
            let pz = pos[k + 2];

            for (let c = 0; c < caps.length; c++) {
              const cap = caps[c];
              const sx = cap.b.x - cap.a.x;
              const sy = cap.b.y - cap.a.y;
              const sz = cap.b.z - cap.a.z;
              const lenSq = sx * sx + sy * sy + sz * sz || 1e-6;
              const u = clamp(((px - cap.a.x) * sx + (py - cap.a.y) * sy + (pz - cap.a.z) * sz) / lenSq, 0, 1);
              const qx = px - (cap.a.x + sx * u);
              const qy = py - (cap.a.y + sy * u);
              const qz = pz - (cap.a.z + sz * u);
              const dist = Math.hypot(qx, qy, qz);
              if (dist < cap.r && dist > 1e-5) {
                const push = (cap.r - dist) / dist;
                px += qx * push;
                py += qy * push;
                pz += qz * push;
              }
            }

            const rx = px - axX;
            const rz = pz - axZ;
            const rr = Math.hypot(rx, rz);
            if (rr < minR && rr > 1e-5) {
              px = axX + (rx / rr) * minR;
              pz = axZ + (rz / rr) * minR;
            }
            if (py < groundY + 0.025) py = groundY + 0.025;

            pos[k] = px;
            pos[k + 1] = py;
            pos[k + 2] = pz;
          }
        }
      }
    }

    // Leash: no vertex strays too far from its rest pose, so the hem can sway and
    // bell out but never folds inside-out
    for (let row = 1; row <= rows; row++) {
      const maxDev = 0.05 + 0.2 * (row / rows);
      for (let i = 0; i < segs; i++) {
        const k = (row * stride + i) * 3;
        const dx = pos[k] - tgt[k];
        const dy = pos[k + 1] - tgt[k + 1];
        const dz = pos[k + 2] - tgt[k + 2];
        const d = Math.hypot(dx, dy, dz);
        if (d > maxDev) {
          const f = maxDev / d;
          pos[k] = tgt[k] + dx * f;
          pos[k + 1] = Math.max(tgt[k + 1] + dy * f, groundY + 0.025);
          pos[k + 2] = tgt[k + 2] + dz * f;
        }
      }
    }

    // Seam column mirrors column 0
    for (let row = 0; row <= rows; row++) {
      const a = (row * stride) * 3;
      const b = (row * stride + segs) * 3;
      pos[b] = pos[a];
      pos[b + 1] = pos[a + 1];
      pos[b + 2] = pos[a + 2];
    }

    // World -> skirt local
    this._invMat.copy(this.skirt.matrixWorld).invert();
    const ie = this._invMat.elements;
    const arr = this.skirtGeo.attributes.position.array;
    for (let v = 0, n = (rows + 1) * stride; v < n; v++) {
      const k = v * 3;
      const wx = pos[k];
      const wy = pos[k + 1];
      const wz = pos[k + 2];
      arr[k] = ie[0] * wx + ie[4] * wy + ie[8] * wz + ie[12];
      arr[k + 1] = ie[1] * wx + ie[5] * wy + ie[9] * wz + ie[13];
      arr[k + 2] = ie[2] * wx + ie[6] * wy + ie[10] * wz + ie[14];
    }
    this.skirtGeo.attributes.position.needsUpdate = true;
    this.skirtGeo.computeVertexNormals();
  }

  _spawnDustPuff(count = 1, surface = 'stone', spread = 0.35) {
    for (let i = 0; i < count; i++) {
      const isWater = surface === 'shallow_water';
      const isGrass = surface === 'grass' && i % 2 === 1;
      const isSnow = surface === 'snow';
      const color = isWater ? '#e6fbff' : isGrass ? '#b8de64' : isSnow ? '#ffffff' : '#f5efe2';
      const geo = isGrass
        ? new THREE.OctahedronGeometry(0.06, 0)
        : new THREE.SphereGeometry(isWater ? 0.07 : 0.08, 6, 5);
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: isWater ? 0.82 : 0.65,
        depthWrite: false,
      });
      const m = new THREE.Mesh(geo, mat);
      const ang = Math.random() * Math.PI * 2;
      m.position.set(
        this.position.x + Math.cos(ang) * spread * Math.random(),
        this.visualY + 0.06,
        this.position.z + Math.sin(ang) * spread * Math.random()
      );
      const out = isWater ? 1.5 : 0.9;
      m.userData = {
        age: 0,
        maxAge: isWater ? 0.42 : 0.5,
        vx: Math.cos(ang) * out * (0.5 + Math.random() * 0.5),
        vz: Math.sin(ang) * out * (0.5 + Math.random() * 0.5),
        vy: isWater ? 1.9 + Math.random() * 0.8 : 0.35 + Math.random() * 0.25,
        gravity: isWater ? 7.2 : 0.0,
      };
      this.scene.add(m);
      this.dustPuffs.push(m);
    }
  }

  triggerJump() {
    this.jumpBuffer = 0.14;
    if (this.isSitting) this.standUp();
  }

  applyUpdraft(targetVel = 13.2) {
    this.standUp();
    this.jumpBuffer = 0;
    this.jumpAnticipation = 0;
    if (this.isGrounded || this.jumpVel < targetVel * 0.88) {
      this.isGrounded = false;
      this.jumpVel = Math.max(this.jumpVel, targetVel);
      this.bodySquash = -0.14;
      this._spawnDustPuff(4, getSurfaceAt(this.position.x, this.position.z));
    }
  }

  resetTo(spawn) {
    const x = spawn?.x ?? 0;
    const z = spawn?.z ?? 0;
    const y = getHeightAt(x, z);
    this.position.set(x, y, z);
    this.visualY = y;
    this.yaw = spawn?.yaw ?? Math.PI;
    this.prevYaw = this.yaw;
    this.yawVel = 0;
    this.velocity.set(0, 0, 0);
    this._prevVel.set(0, 0, 0);
    this.accelLocal.set(0, 0);
    this.jumpOffset = 0;
    this.jumpVel = 0;
    this.jumpBuffer = 0;
    this.jumpAnticipation = 0;
    this.isGrounded = true;
    this.isMoving = false;
    this.isSitting = false;
    this.sitBlend = 0;
    this.preSitPos = null;
    this.runBlend = 0;
    this.moveBlend = 0;
    this.airBlend = 0;
    this.climbRate = 0;
    this.petTimer = 0;
    this.pushTimer = 0;
    this.landTimer = 0;
    this.walkTarget = null;
    this.bodySquash = 0;
    this.bodySquashVel = 0;
    Object.values(this.springs).forEach((s) => s.reset(s === this.springs.ponyPitch ? 0.15 : 0));
    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
    this.resetCloth();
  }

  setWalkTarget(x, z) {
    this.walkTarget = { x, z };
  }

  clearWalkTarget() {
    this.walkTarget = null;
  }

  _isSpotClear(cx, cz) {
    if (!isWalkable(cx, cz)) return false;
    const cy = getHeightAt(cx, cz);
    const probes = [
      [0.06, 0],
      [-0.06, 0],
      [0, 0.06],
      [0, -0.06],
    ];
    let clearAxes = 0;
    for (let i = 0; i < probes.length; i++) {
      const dx = probes[i][0];
      const dz = probes[i][1];
      const res = resolveMovement(cx, cz, cx + dx, cz + dz, 0.34, cy);
      if (Math.hypot(res.x - (cx + dx), res.z - (cz + dz)) < 0.02) clearAxes++;
    }
    return clearAxes >= 2;
  }

  sitAt(x, y, z, yaw) {
    if (!this.isSitting) {
      this.preSitPos = { x: this.position.x, y: this.position.y, z: this.position.z };
    }
    this.isSitting = true;
    this.walkTarget = null;
    this.velocity.set(0, 0, 0);
    this.jumpOffset = 0;
    this.jumpVel = 0;
    this.isGrounded = true;
    this.position.set(x, y, z);
    this.visualY = y;
    this.yaw = yaw;
    this.prevYaw = yaw;
    this.isMoving = false;
  }

  standUp() {
    if (!this.isSitting) return;
    this.isSitting = false;
    let exitX = this.position.x;
    let exitZ = this.position.z;
    if (this.preSitPos && this._isSpotClear(this.preSitPos.x, this.preSitPos.z)) {
      exitX = this.preSitPos.x;
      exitZ = this.preSitPos.z;
    } else if (!this._isSpotClear(exitX, exitZ)) {
      const angles = [0, 0.785, -0.785, 1.57, -1.57, 2.356, -2.356, Math.PI];
      const radii = [1.22, 1.52, 1.85];
      let found = false;
      for (let r = 0; r < radii.length && !found; r++) {
        for (let a = 0; a < angles.length && !found; a++) {
          const ang = this.yaw + angles[a];
          const tx = this.position.x + Math.sin(ang) * radii[r];
          const tz = this.position.z + Math.cos(ang) * radii[r];
          if (this._isSpotClear(tx, tz)) {
            exitX = tx;
            exitZ = tz;
            found = true;
          }
        }
      }
      if (!found) {
        if (this.preSitPos && isWalkable(this.preSitPos.x, this.preSitPos.z)) {
          exitX = this.preSitPos.x;
          exitZ = this.preSitPos.z;
        } else {
          exitX += Math.sin(this.yaw) * 1.35;
          exitZ += Math.cos(this.yaw) * 1.35;
        }
      }
    }
    const exitY = getHeightAt(exitX, exitZ);
    this.position.set(exitX, exitY, exitZ);
    this.visualY = exitY;
    this.preSitPos = null;
    this.bodySquash = -0.05;
    this.sitBlend = 0;
    this.resetCloth();
  }

  _faceToward(targetPos) {
    if (!targetPos) return;
    const dx = targetPos.x - this.position.x;
    const dz = targetPos.z - this.position.z;
    if (dx * dx + dz * dz > 0.01) this.yaw = Math.atan2(dx, dz);
  }

  triggerPush(targetPos) {
    this.standUp();
    this.walkTarget = null;
    this.pushTimer = 0.5;
    this._faceToward(targetPos);
  }

  triggerPet(targetPos) {
    this.standUp();
    this.walkTarget = null;
    this.petTimer = 0.95;
    this._faceToward(targetPos);
  }

  _updateDust(dt) {
    for (let i = this.dustPuffs.length - 1; i >= 0; i--) {
      const p = this.dustPuffs[i];
      p.userData.age += dt;
      const t = p.userData.age / p.userData.maxAge;
      if (t >= 1) {
        this.scene.remove(p);
        p.geometry.dispose();
        p.material.dispose();
        this.dustPuffs.splice(i, 1);
      } else {
        p.position.x += p.userData.vx * dt;
        p.position.z += p.userData.vz * dt;
        p.userData.vx *= Math.exp(-dt * 4);
        p.userData.vz *= Math.exp(-dt * 4);
        p.userData.vy = (p.userData.vy ?? 0.42) - (p.userData.gravity || 0) * dt;
        p.position.y += p.userData.vy * dt;
        p.scale.setScalar(1 + t * 1.1);
        p.material.opacity = 0.6 * (1 - t) * (1 - t);
      }
    }
  }

  update(dt, input, pixelRenderer) {
    this._updateDust(dt);
    this.clothTime += dt;

    let moveX = 0;
    let moveZ = 0;
    if (input.forward) moveZ += 1;
    if (input.backward) moveZ -= 1;
    if (input.left) moveX -= 1;
    if (input.right) moveX += 1;

    const hasKeyInput = moveX !== 0 || moveZ !== 0;
    if (hasKeyInput) {
      this.walkTarget = null;
      if (this.isSitting) this.standUp();
    }

    if (this.petTimer > 0) this.petTimer = Math.max(0, this.petTimer - dt);
    if (this.pushTimer > 0) this.pushTimer = Math.max(0, this.pushTimer - dt);
    if (this.landTimer > 0) this.landTimer = Math.max(0, this.landTimer - dt);
    if (this.jumpBuffer > 0) this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (this.isGrounded) this.coyoteTimer = 0.1;
    else this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);

    if (this.isSitting) {
      this.sitBlend = damp(this.sitBlend, 1, 7, dt);
      this.velocity.set(0, 0, 0);
      this.isMoving = false;
      this.jumpAnticipation = 0;
      this.climbRate = 0;
      this.runBlend = damp(this.runBlend, 0, 10, dt);
      this.moveBlend = damp(this.moveBlend, 0, 10, dt);
      this.airBlend = 0;
      this.yawVel = 0;
      this.prevYaw = this.yaw;
      this._applyPose(dt, 0);
      return;
    }

    // Jump: short anticipation crouch, then launch
    if (this.jumpBuffer > 0 && this.coyoteTimer > 0 && this.jumpAnticipation <= 0 && this.isGrounded) {
      this.jumpBuffer = 0;
      this.coyoteTimer = 0;
      this.jumpAnticipation = 0.07;
      this.bodySquashVel += 2.0;
    }
    if (this.jumpAnticipation > 0) {
      this.jumpAnticipation -= dt;
      if (this.jumpAnticipation <= 0) {
        this.jumpAnticipation = 0;
        this.isGrounded = false;
        this.airTime = 0;
        this.jumpVel = JUMP_VEL;
        this.bodySquash = -0.11;
        this.bodySquashVel = -1.2;
        this._spawnDustPuff(3, getSurfaceAt(this.position.x, this.position.z));
        if (this.onJump) this.onJump();
      }
    }

    // Asymmetric gravity: snappy rise, floaty apex, heavier fall
    if (!this.isGrounded) {
      this.airTime += dt;
      const gravity = this.jumpVel > 1.35 ? 24.5 : Math.abs(this.jumpVel) <= 1.35 ? 14.5 : 29.5;
      this.jumpVel = Math.max(-13.5, this.jumpVel - gravity * dt);
      this.jumpOffset += this.jumpVel * dt;
      if (this.jumpOffset <= 0) {
        this.jumpOffset = 0;
        const impactSpeed = Math.abs(this.jumpVel);
        const landSurface = getSurfaceAt(this.position.x, this.position.z);
        this.jumpVel = 0;
        this.isGrounded = true;
        this.landImpact = clamp(impactSpeed / 9, 0.25, 1.25);
        this.landTimer = 0.22;
        this.bodySquashVel += Math.min(3.0, impactSpeed * 0.32);
        this._spawnDustPuff(Math.round(3 + this.landImpact * 3), landSurface, 0.45);
        if (this.onLand) this.onLand(landSurface);
      }
    }

    // Desired move direction (camera-relative keys or click target)
    let wantMove = false;
    if (this.petTimer <= 0.25 && this.pushTimer <= 0.15) {
      if (hasKeyInput) {
        pixelRenderer.getGroundBasis(this._fwd, this._right);
        this._desiredDir
          .set(0, 0, 0)
          .addScaledVector(this._fwd, moveZ)
          .addScaledVector(this._right, moveX)
          .normalize();
        wantMove = true;
      } else if (this.walkTarget) {
        const dx = this.walkTarget.x - this.position.x;
        const dz = this.walkTarget.z - this.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.32) {
          this._desiredDir.set(dx / dist, 0, dz / dist);
          wantMove = true;
        } else {
          this.walkTarget = null;
        }
      }
    }

    this.isRunning = Boolean(input.run);
    const maxSpeed = this.isRunning ? RUN_SPEED : WALK_SPEED;
    // Turn first, then accelerate along the facing (gives weight to sharp turns)
    let facingDot = 1;
    if (wantMove) {
      const desiredYaw = Math.atan2(this._desiredDir.x, this._desiredDir.z);
      const diff = wrapAngle(desiredYaw - this.yaw);
      this.yaw += diff * (1 - Math.exp(-dt * (this.isGrounded ? 14 : 6)));
      facingDot = Math.cos(diff);
    }
    const targetSpeed = wantMove ? maxSpeed * clamp(0.35 + facingDot * 0.65, 0.2, 1) : 0;
    const accelRate = wantMove ? (this.isGrounded ? 13 : 4.5) : this.isGrounded ? 15 : 2.5;
    const blend = 1 - Math.exp(-dt * accelRate);
    const tvx = wantMove ? this._desiredDir.x * targetSpeed : 0;
    const tvz = wantMove ? this._desiredDir.z * targetSpeed : 0;
    this.velocity.x += (tvx - this.velocity.x) * blend;
    this.velocity.z += (tvz - this.velocity.z) * blend;

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    let rawClimbRate = 0;
    if (speed > 0.05) {
      const prevX = this.position.x;
      const prevY = this.position.y;
      const prevZ = this.position.z;
      const prevWorldFeetY = this.position.y + this.jumpOffset;
      const nx = prevX + this.velocity.x * dt;
      const nz = prevZ + this.velocity.z * dt;
      const resolved = resolveMovement(prevX, prevZ, nx, nz, 0.34, prevWorldFeetY);

      const movedDist = Math.hypot(resolved.x - prevX, resolved.z - prevZ);
      rawClimbRate = (resolved.y - prevY) / Math.max(dt, 0.008);
      if (!this.isGrounded && Math.abs(resolved.y - this.position.y) > 0.05) {
        this.jumpOffset = Math.max(0, prevWorldFeetY - resolved.y);
        this.visualY = resolved.y;
      }
      this.position.set(resolved.x, resolved.y, resolved.z);
      this.isMoving = movedDist > speed * dt * 0.25 && movedDist > 0.0015;

      // Blocked: bleed velocity so the body does not "moonwalk" into walls
      if (movedDist < speed * dt * 0.5) {
        const keep = movedDist / Math.max(1e-4, speed * dt);
        this.velocity.multiplyScalar(0.5 + keep * 0.5);
      }
      if (movedDist < speed * dt * 0.12 && this.walkTarget) this.walkTarget = null;
    } else {
      this.velocity.set(0, 0, 0);
      this.isMoving = false;
    }

    // Acceleration in local frame (drives lean & secondary motion)
    const invDt = 1 / Math.max(dt, 1e-3);
    const ax = (this.velocity.x - this._prevVel.x) * invDt;
    const az = (this.velocity.z - this._prevVel.z) * invDt;
    this._prevVel.copy(this.velocity);
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const aFwd = ax * sinY + az * cosY;
    const aLat = ax * cosY - az * sinY;
    this.accelLocal.x = damp(this.accelLocal.x, clamp(aLat, -40, 40), 12, dt);
    this.accelLocal.y = damp(this.accelLocal.y, clamp(aFwd, -40, 40), 12, dt);

    // Yaw velocity
    const yawDiff = wrapAngle(this.yaw - this.prevYaw);
    this.prevYaw = this.yaw;
    this.yawVel = damp(this.yawVel, clamp(yawDiff * invDt, -9, 9), 14, dt);

    // Gait phase advances with distance travelled (feet plant instead of sliding)
    this.runBlend = damp(this.runBlend, this.isRunning && this.isMoving && this.isGrounded ? 1 : 0, 9, dt);
    this.moveBlend = damp(this.moveBlend, this.isMoving && this.isGrounded ? clamp(speed / WALK_SPEED, 0, 1) : 0, 11, dt);
    this.airBlend = damp(this.airBlend, this.isGrounded ? 0 : 1, this.isGrounded ? 18 : 12, dt);
    if (this.isMoving && this.isGrounded) {
      const strideLen = THREE.MathUtils.lerp(1.0, 1.45, this.runBlend);
      this.walkPhase += (speed / strideLen) * Math.PI * dt;
      const stepIdx = Math.floor((this.walkPhase - Math.PI * 0.5) / Math.PI);
      if (stepIdx !== this._lastStepIdx) {
        this._lastStepIdx = stepIdx;
        const surf = getSurfaceAt(this.position.x, this.position.z);
        if (this.isRunning || surf === 'shallow_water' || this.climbRate > 0.55) this._spawnDustPuff(1, surf, 0.2);
        if (this.onStep) this.onStep(this.position.x, this.position.z, surf);
      }
      this.idleTime = 0;
    } else {
      this.idleTime += dt;
      // Settle the phase toward a neutral stance when stopping
      const target = Math.round(this.walkPhase / Math.PI) * Math.PI;
      this.walkPhase = damp(this.walkPhase, target, 6, dt);
      this._lastStepIdx = Math.floor((this.walkPhase - Math.PI * 0.5) / Math.PI);
    }

    this.climbRate = damp(this.climbRate, rawClimbRate, 14, dt);
    const climbFollowRate = Math.abs(this.climbRate) > 0.35 ? 32.0 : 26.0;
    this.visualY = damp(this.visualY, this.position.y, climbFollowRate, dt);

    const squashForce = -185.0 * this.bodySquash - 16.0 * this.bodySquashVel;
    this.bodySquashVel += squashForce * Math.min(dt, 1 / 30);
    this.bodySquash = clamp(this.bodySquash + this.bodySquashVel * Math.min(dt, 1 / 30), -0.18, 0.22);

    this._applyPose(dt, speed);
  }

  /** Procedural pose: gait, jump, interactions, secondary motion, then cloth. */
  _applyPose(dt, speed) {
    const sp = this.springs;
    const speedNorm = clamp(speed / WALK_SPEED, 0, 1.6);
    const mb = this.moveBlend;
    const rb = this.runBlend;
    const ab = this.airBlend;
    const sb = this.isSitting ? this.sitBlend : 0;
    const phi = this.walkPhase;
    const sinP = Math.sin(phi);
    const cosP = Math.cos(phi);
    const t = this.clothTime;

    // ---- Legs (hip pitch, knee flex, ankle) ----
    const legPose = (ph) => {
      const s = Math.sin(ph);
      const c = Math.cos(ph);
      // Walk
      const wHip = -0.56 * s;
      const wKnee = 0.08 + 0.62 * Math.pow(Math.max(0, c), 1.6);
      // Run: longer reach, strong back-kick, forward bias
      const rHip = -0.82 * s - 0.12;
      const rKnee = 0.3 + 1.25 * Math.pow(Math.max(0, Math.cos(ph + 0.55)), 1.2);
      const hip = THREE.MathUtils.lerp(wHip, rHip, rb) * mb;
      const knee = THREE.MathUtils.lerp(0.06, THREE.MathUtils.lerp(wKnee, rKnee, rb), mb);
      return { hip, knee };
    };
    let L = legPose(phi);
    let R = legPose(phi + Math.PI);

    // Climbing stairs: lift the knees a bit more
    const climb = clamp(this.climbRate / 2.2, 0, 1) * mb;
    L.knee += climb * 0.35 * Math.max(0, Math.cos(phi));
    R.knee += climb * 0.35 * Math.max(0, -Math.cos(phi));

    // Idle weight shift
    const idleW = (1 - mb) * (1 - ab);
    const shift = Math.sin(t * 0.7) * 0.5 + 0.5;
    L.knee += idleW * 0.1 * shift;
    R.knee += idleW * 0.1 * (1 - shift);

    // Airborne: rising tucks the lead knee, falling reaches for the ground
    if (ab > 0.001) {
      const rise = clamp(this.jumpVel / JUMP_VEL, -1, 1);
      const airL = { hip: -0.55 - Math.max(0, rise) * 0.25, knee: 0.9 + Math.max(0, rise) * 0.4 };
      const airR = { hip: 0.18 + Math.max(0, rise) * 0.12, knee: 0.55 + Math.max(0, -rise) * -0.35 };
      if (rise < 0) {
        airL.hip = THREE.MathUtils.lerp(airL.hip, -0.25, -rise);
        airL.knee = THREE.MathUtils.lerp(airL.knee, 0.35, -rise);
        airR.hip = THREE.MathUtils.lerp(airR.hip, 0.05, -rise);
        airR.knee = THREE.MathUtils.lerp(airR.knee, 0.25, -rise);
      }
      L = { hip: THREE.MathUtils.lerp(L.hip, airL.hip, ab), knee: THREE.MathUtils.lerp(L.knee, airL.knee, ab) };
      R = { hip: THREE.MathUtils.lerp(R.hip, airR.hip, ab), knee: THREE.MathUtils.lerp(R.knee, airR.knee, ab) };
    }

    // Anticipation / landing crouch
    const crouch = (this.jumpAnticipation > 0 ? 1 : 0) + (this.landTimer > 0 ? Math.sin((this.landTimer / 0.22) * Math.PI) * this.landImpact : 0);
    if (crouch > 0) {
      L.hip -= 0.45 * crouch;
      R.hip -= 0.45 * crouch;
      L.knee += 0.9 * crouch;
      R.knee += 0.9 * crouch;
    }

    // Pet (kneel) & push (lunge)
    if (this.petTimer > 0) {
      const k = Math.sin((this.petTimer / 0.95) * Math.PI);
      L.hip = THREE.MathUtils.lerp(L.hip, -1.05, k);
      L.knee = THREE.MathUtils.lerp(L.knee, 1.9, k);
      R.hip = THREE.MathUtils.lerp(R.hip, -0.2, k);
      R.knee = THREE.MathUtils.lerp(R.knee, 2.1, k);
    } else if (this.pushTimer > 0) {
      const k = Math.sin((this.pushTimer / 0.5) * Math.PI);
      L.hip = THREE.MathUtils.lerp(L.hip, -0.6, k);
      L.knee = THREE.MathUtils.lerp(L.knee, 0.7, k);
      R.hip = THREE.MathUtils.lerp(R.hip, 0.5, k);
      R.knee = THREE.MathUtils.lerp(R.knee, 0.15, k);
    }

    // Sitting on a bench: thighs forward, shins down
    if (sb > 0.001) {
      L = { hip: THREE.MathUtils.lerp(L.hip, -1.45, sb), knee: THREE.MathUtils.lerp(L.knee, 1.4, sb) };
      R = { hip: THREE.MathUtils.lerp(R.hip, -1.4, sb), knee: THREE.MathUtils.lerp(R.knee, 1.45, sb) };
    }

    const setLeg = (leg, p) => {
      leg.hip.rotation.x = p.hip;
      leg.knee.rotation.x = p.knee;
      // Keep the geta roughly level with the ground while planted
      leg.ankle.rotation.x = -(p.hip + p.knee) * (this.isGrounded ? 0.85 : 0.45) + (this.isGrounded ? 0 : 0.25);
    };
    setLeg(this.legL, L);
    setLeg(this.legR, R);

    // Hip height so the planted foot touches the ground (simple leg IK)
    const legExtent = (p) => THIGH_LEN * Math.cos(p.hip) + SHIN_LEN * Math.cos(p.hip + p.knee) + FOOT_H;
    const reach = Math.max(legExtent(L), legExtent(R));
    let bodyY = 0;
    if (sb < 0.5) {
      // Walking drops onto the planted leg; running mostly floats between strides
      bodyY = (reach - LEG_LEN) * THREE.MathUtils.lerp(0.8, 0.3, rb) * (1 - ab) * (1 - sb);
      bodyY += rb * 0.055 * Math.abs(sinP) * (1 - ab); // running flight bounce
    }
    bodyY = THREE.MathUtils.lerp(bodyY, -0.24, sb);
    if (this.petTimer > 0) bodyY = Math.min(bodyY, -0.36 * Math.sin((this.petTimer / 0.95) * Math.PI));
    bodyY += idleW * Math.sin(t * 2.1) * 0.004; // breathing
    this.bodyRoot.position.y = bodyY;

    // Lateral hip sway over the stance foot + pelvis twist with the stride
    this.bodyRoot.position.x = THREE.MathUtils.lerp(0.028 * cosP, 0.012 * cosP, rb) * mb * (1 - ab);
    const twist = THREE.MathUtils.lerp(0.1, 0.2, rb) * sinP * mb * (1 - ab);
    this.pelvis.rotation.y = twist;
    this.pelvis.rotation.z = -0.05 * cosP * mb * (1 - rb) * (1 - ab);

    // ---- Torso: lean with acceleration & speed, bank into turns ----
    const leanTarget =
      clamp(speedNorm * 0.045 + rb * 0.13 + this.accelLocal.y * 0.0075 + climb * 0.1, -0.18, 0.27) * (1 - sb) +
      (crouch > 0 ? 0.18 * crouch : 0) +
      (this.petTimer > 0 ? 0.5 * Math.sin((this.petTimer / 0.95) * Math.PI) : 0) +
      (this.pushTimer > 0 ? 0.32 * Math.sin((this.pushTimer / 0.5) * Math.PI) : 0) +
      (ab > 0.01 ? -clamp(this.jumpVel, -8, 8) * 0.012 * ab : 0);
    const lean = sp.lean.step(leanTarget, dt);
    const bankTarget = clamp(-this.yawVel * Math.min(1.3, speedNorm) * 0.055 - this.accelLocal.x * 0.004, -0.2, 0.2);
    const bank = sp.bank.step(bankTarget * (1 - sb), dt);
    this.bodyRoot.rotation.set(lean * 0.25, 0, bank);

    this.upperBody.rotation.x = lean * 0.75 + (sb > 0 ? 0.05 * sb : 0);
    this.upperBody.rotation.y = -twist * 0.85 + Math.sin(t * 0.9) * 0.015 * idleW;
    this.upperBody.rotation.z = -this.pelvis.rotation.z * 0.6;
    this.upperBody.position.y = 0.86 + idleW * Math.sin(t * 2.1 + 0.6) * 0.004;

    // Squash & stretch
    const sy = 1 - this.bodySquash;
    const sxz = 1 + this.bodySquash * 0.45;
    this.bodyRoot.scale.set(sxz, sy, sxz);

    // ---- Arms ----
    // Opposite-arm swing: the left arm moves with the right leg; elbows bend on the back swing
    let armL = { x: R.hip * 0.8 * mb, z: 0.05, fx: -0.16 - Math.max(0, -R.hip) * 0.3, fz: 0 };
    let armR = { x: L.hip * 0.8 * mb, z: -0.05, fx: -0.16 - Math.max(0, -L.hip) * 0.3, fz: 0 };
    if (rb > 0.01) {
      armL.x = THREE.MathUtils.lerp(armL.x, R.hip * 1.25, rb);
      armR.x = THREE.MathUtils.lerp(armR.x, L.hip * 1.25, rb);
      armL.fx = THREE.MathUtils.lerp(armL.fx, -1.15 + Math.sin(phi) * 0.25, rb);
      armR.fx = THREE.MathUtils.lerp(armR.fx, -1.15 - Math.sin(phi) * 0.25, rb);
      armL.z = THREE.MathUtils.lerp(armL.z, 0.16, rb);
      armR.z = THREE.MathUtils.lerp(armR.z, -0.16, rb);
    }
    if (ab > 0.01) {
      const rise = clamp(this.jumpVel / JUMP_VEL, -1, 1);
      const air = { x: -0.35 - Math.max(0, rise) * 0.35, z: 0.55 + Math.max(0, -rise) * 0.35, fx: -0.5 };
      armL = {
        x: THREE.MathUtils.lerp(armL.x, air.x, ab),
        z: THREE.MathUtils.lerp(armL.z, air.z, ab),
        fx: THREE.MathUtils.lerp(armL.fx, air.fx, ab),
        fz: 0,
      };
      armR = {
        x: THREE.MathUtils.lerp(armR.x, air.x, ab),
        z: THREE.MathUtils.lerp(armR.z, -air.z, ab),
        fx: THREE.MathUtils.lerp(armR.fx, air.fx, ab),
        fz: 0,
      };
    }
    if (crouch > 0) {
      armL.x -= 0.25 * crouch;
      armR.x -= 0.25 * crouch;
      armL.z += 0.2 * crouch;
      armR.z -= 0.2 * crouch;
    }
    if (this.pushTimer > 0) {
      const k = Math.sin((this.pushTimer / 0.5) * Math.PI);
      armL = { x: THREE.MathUtils.lerp(armL.x, -1.3, k), z: 0.1, fx: THREE.MathUtils.lerp(armL.fx, -0.2, k), fz: 0 };
      armR = { x: THREE.MathUtils.lerp(armR.x, -1.3, k), z: -0.1, fx: THREE.MathUtils.lerp(armR.fx, -0.2, k), fz: 0 };
    } else if (this.petTimer > 0) {
      const k = Math.sin((this.petTimer / 0.95) * Math.PI);
      const stroke = Math.sin(t * 9) * 0.18 * k;
      armL = { x: THREE.MathUtils.lerp(armL.x, -1.0 + stroke, k), z: 0.05, fx: THREE.MathUtils.lerp(armL.fx, -0.5, k), fz: 0 };
      armR = { x: THREE.MathUtils.lerp(armR.x, -0.2, k), z: -0.15, fx: THREE.MathUtils.lerp(armR.fx, -0.9, k), fz: 0 };
    }
    if (sb > 0.001) {
      armL = { x: THREE.MathUtils.lerp(armL.x, -0.4, sb), z: THREE.MathUtils.lerp(armL.z, 0.05, sb), fx: THREE.MathUtils.lerp(armL.fx, -0.8, sb), fz: 0.12 * sb };
      armR = { x: THREE.MathUtils.lerp(armR.x, -0.4, sb), z: THREE.MathUtils.lerp(armR.z, -0.05, sb), fx: THREE.MathUtils.lerp(armR.fx, -0.8, sb), fz: -0.12 * sb };
    }
    armL.z += idleW * Math.sin(t * 2.1) * 0.015;
    armR.z -= idleW * Math.sin(t * 2.1) * 0.015;

    this.leftArm.rotation.set(armL.x, 0, armL.z);
    this.rightArm.rotation.set(armR.x, 0, armR.z);
    this.leftArm.userData.forearmPivot.rotation.set(armL.fx, 0, armL.fz);
    this.rightArm.userData.forearmPivot.rotation.set(armR.fx, 0, armR.fz);

    // Furisode sleeves: lagging pendulums driven by arm swing, speed and jumps
    const sleeveBase = speedNorm * 0.22 + rb * 0.28 - this.accelLocal.y * 0.006;
    const sleeveAir = ab > 0.01 ? -clamp(this.jumpVel, -10, 10) * 0.05 * ab : 0;
    const sL = sp.sleeveL.step(-(armL.x + armL.fx) * 0.45 + sleeveBase + sleeveAir, dt);
    const sR = sp.sleeveR.step(-(armR.x + armR.fx) * 0.45 + sleeveBase + sleeveAir, dt);
    this.leftArm.userData.drapePivot.rotation.set(sL, 0, 0.06 + ab * 0.2);
    this.rightArm.userData.drapePivot.rotation.set(sR, 0, -0.06 - ab * 0.2);

    // ---- Head: stabilised against torso lean, glances toward turns / Mochi ----
    let lookYaw = clamp(this.yawVel * 0.07, -0.45, 0.45);
    if (this.lookTarget && mb < 0.2 && !this.isSitting && this.petTimer <= 0) {
      const dx = this.lookTarget.x - this.position.x;
      const dz = this.lookTarget.z - this.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.6 && d < 6) {
        const rel = wrapAngle(Math.atan2(dx, dz) - this.yaw);
        if (Math.abs(rel) < 1.6) lookYaw = clamp(rel, -0.75, 0.75) * 0.8;
      }
    }
    if (idleW > 0.8 && this.idleTime > 5) lookYaw += Math.sin(this.idleTime * 0.45) * 0.35;
    const headYaw = sp.headYaw.step(lookYaw, dt);
    this.headGroup.rotation.set(-lean * 0.55 + (this.petTimer > 0 ? 0.35 : 0), headYaw - this.upperBody.rotation.y * 0.6, -bank * 0.5);

    // Blink
    this.blinkTimer -= dt;
    const blink = this.blinkTimer < 0.12 ? 0.15 : 1;
    if (this.blinkTimer < 0) this.blinkTimer = 2.2 + Math.random() * 3.2;
    this.eyes.forEach((e) => (e.scale.y = blink));

    // ---- Hair & ribbons ----
    const vertAccel = ab > 0.01 ? -clamp(this.jumpVel, -10, 10) : 0;
    const ponyTarget = 0.1 + speedNorm * 0.38 + rb * 0.12 + this.accelLocal.y * 0.018 + vertAccel * 0.05;
    const bounce = mb * (1 - ab) * Math.sin(phi * 2) * 0.1 * Math.max(0.4, speedNorm);
    const pony = sp.ponyPitch.step(ponyTarget + bounce, dt);
    const ponySide = sp.ponySide.step(-this.yawVel * 0.09 + this.accelLocal.x * 0.01 + this.bodyRoot.position.x * 2, dt);
    const ponyTip = sp.ponyTip.step(pony * 0.75 + bounce * 0.6, dt);
    void pony;
    void ponyTip;

    const breeze = Math.sin(t * 4.4) * (0.04 + speedNorm * 0.06);
    const ribbonLift = sp.ribbon.step(0.16 + speedNorm * 0.4 + rb * 0.2 + vertAccel * 0.06 + this.accelLocal.y * 0.015, dt);
    this.ribbonLeft.rotation.set(ribbonLift + breeze, 0, ponySide * 0.8);
    this.ribbonRight.rotation.set(ribbonLift - breeze, 0, ponySide * 0.8);
    const sashLift = sp.sash.step(0.12 + speedNorm * 0.36 + rb * 0.2 + vertAccel * 0.05 + this.accelLocal.y * 0.012, dt);
    this.sashLeft.rotation.set(sashLift - breeze, 0, -0.05 + ponySide * 0.4);
    this.sashRight.rotation.set(sashLift + breeze, 0, 0.05 + ponySide * 0.4);
    this.cheekLocks.forEach((lp, i) => {
      lp.rotation.x = clamp(speedNorm * 0.18 + vertAccel * 0.03, -0.3, 0.5) + bounce * 0.4;
      lp.rotation.z = (i === 0 ? 1 : -1) * Math.max(0, ab * 0.2);
    });

    // ---- Place the character, then simulate the hakama in world space ----
    this.group.position.set(this.position.x, this.visualY + this.jumpOffset, this.position.z);
    this.group.rotation.y = this.yaw;
    this.group.updateMatrixWorld(true);
    // Light breeze from the sky's wind direction, stronger in gusts
    const gust = 0.6 + 0.4 * Math.sin(t * 0.9) * Math.sin(t * 2.3);
    this._hBreeze = this._hBreeze || new THREE.Vector3();
    this._hBreeze.set(Math.sin(t * 1.7) * 0.5 * gust, 0, 0.35 * gust);
    this._simulateHair(dt, this._hBreeze);
    const groundY = this.isSitting ? this.visualY - 0.5 : this.visualY;
    this._simulateCloth(dt, groundY, ab > 0.01 ? this.jumpVel : 0);
  }
}

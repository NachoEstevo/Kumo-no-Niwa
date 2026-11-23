import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createPixelToonMaterial } from '../engine/ToonMaterials.js';

// Hana's head, face and hair (headGroup space: neck at the origin, face toward +Z).
// The hair is built the way anime hair is drawn: a few curved, flattened, tapering
// clumps that follow the skull, instead of a sphere with cones stuck on it.

const HEAD_R = 0.205;
const HEAD_C = new THREE.Vector3(0, 0.2, 0);
const HAIR_BASE = new THREE.Color('#252030');
const HAIR_SHINE = new THREE.Color('#5d5578');

/** Maps a point of the radius-HEAD_R sphere onto Hana's head shape (relative to its centre). */
function deformHead(x, y, z) {
  const ny = y / HEAD_R;
  if (ny < 0) {
    // Soft cheeks narrowing into a small chin
    const jaw = 1 - 0.3 * Math.pow(-ny, 1.5);
    x *= jaw;
    if (z > 0) z *= 1 - 0.07 * Math.pow(-ny, 1.2);
    y *= 1.05;
  } else {
    x *= 1 + 0.03 * ny; // rounder cranium
  }
  if (z < 0) z *= 0.95;
  return [x * 0.98, y * 1.02, z * 0.95];
}

const _d = new THREE.Vector3();
/** Point on the head surface in direction (dx, dy, dz), pushed out by factor k, in headGroup space. */
function surf(dx, dy, dz, k = 1, out = new THREE.Vector3()) {
  _d.set(dx, dy, dz).normalize().multiplyScalar(HEAD_R);
  const [x, y, z] = deformHead(_d.x, _d.y, _d.z);
  return out.set(x * k, y * k, z * k).add(HEAD_C);
}

function headGeometry() {
  const geo = new THREE.SphereGeometry(HEAD_R, 40, 30);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const [x, y, z] = deformHead(p.getX(i), p.getY(i), p.getZ(i));
    p.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  geo.translate(HEAD_C.x, HEAD_C.y, HEAD_C.z);
  return geo;
}

/**
 * A patch of the face surface for a drawn decal. Built around the direction `dir`,
 * w x h metres, lifted slightly off the skin; the geometry is centred on its own
 * middle so it can be scaled in place (blinking).
 */
function facePatch(dir, w, h, lift = 1.012, segs = 8) {
  const c = new THREE.Vector3(...dir).normalize();
  const right = new THREE.Vector3(0, 1, 0).cross(c).normalize();
  const up = new THREE.Vector3().crossVectors(c, right).normalize();
  const center = surf(c.x, c.y, c.z, lift);
  const positions = [];
  const uvs = [];
  const indices = [];
  const d = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let j = 0; j <= segs; j++) {
    for (let i = 0; i <= segs; i++) {
      const u = i / segs - 0.5;
      const v = j / segs - 0.5;
      d.copy(c).addScaledVector(right, (u * w) / HEAD_R).addScaledVector(up, (v * h) / HEAD_R);
      surf(d.x, d.y, d.z, lift, p).sub(center);
      positions.push(p.x, p.y, p.z);
      uvs.push(u + 0.5, v + 0.5);
      if (i < segs && j < segs) {
        const a = j * (segs + 1) + i;
        indices.push(a, a + 1, a + segs + 1, a + 1, a + segs + 2, a + segs + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return { geo, center };
}

function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Anime eye: tall iris fading to plum, dark pupil, thick upper lash line, two catchlights. */
function drawEye(ctx, w, h, mirror) {
  ctx.save();
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  const cx = w * 0.5;
  // Iris
  const iris = ctx.createLinearGradient(0, h * 0.18, 0, h * 0.92);
  iris.addColorStop(0, '#1c1627');
  iris.addColorStop(0.55, '#3d2c4f');
  iris.addColorStop(1, '#9a6a8c');
  ctx.fillStyle = iris;
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.56, w * 0.36, h * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  // Pupil
  ctx.fillStyle = 'rgba(18, 12, 26, 0.9)';
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.52, w * 0.17, h * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Upper lash line, thicker toward the outer corner with a small flick
  ctx.fillStyle = '#17121e';
  ctx.beginPath();
  ctx.moveTo(w * 0.08, h * 0.34);
  ctx.quadraticCurveTo(w * 0.45, h * 0.06, w * 0.9, h * 0.2);
  ctx.lineTo(w * 1.0, h * 0.13);
  ctx.lineTo(w * 0.94, h * 0.3);
  ctx.quadraticCurveTo(w * 0.5, h * 0.18, w * 0.1, h * 0.42);
  ctx.closePath();
  ctx.fill();
  // Catchlights
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(w * 0.62, h * 0.4, w * 0.12, h * 0.1, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.ellipse(w * 0.36, h * 0.74, w * 0.06, h * 0.045, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Mouth, blush and a hint of a nose on one transparent decal. */
function drawFace(ctx, w, h) {
  // Blush: soft ovals with three tiny strokes
  for (const bx of [0.17, 0.83]) {
    const g = ctx.createRadialGradient(w * bx, h * 0.6, 0, w * bx, h * 0.6, w * 0.11);
    g.addColorStop(0, 'rgba(244, 132, 140, 0.6)');
    g.addColorStop(1, 'rgba(244, 132, 140, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(w * bx, h * 0.6, w * 0.12, h * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(220, 96, 110, 0.55)';
    ctx.lineWidth = w * 0.008;
    ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      const x = w * (bx + i * 0.028);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.012, h * 0.585);
      ctx.lineTo(x - w * 0.006, h * 0.62);
      ctx.stroke();
    }
  }
  // Nose: a tiny warm shadow
  ctx.fillStyle = 'rgba(214, 140, 120, 0.55)';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.63, w * 0.008, h * 0.006, 0, 0, Math.PI * 2);
  ctx.fill();
  // Mouth: a small soft smile
  ctx.strokeStyle = '#a8424f';
  ctx.lineWidth = w * 0.011;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(w * 0.465, h * 0.735);
  ctx.quadraticCurveTo(w * 0.5, h * 0.765, w * 0.535, h * 0.735);
  ctx.stroke();
}

const _t = new THREE.Vector3();
const _o = new THREE.Vector3();
const _b = new THREE.Vector3();
const _p = new THREE.Vector3();

/**
 * A lock of hair along a curve: a flattened lens-shaped section that tapers to a
 * point, with edges curled slightly outward. `outward(p, out)` gives the direction
 * the lock's flat face looks at (away from the skull by default).
 */
function hairClump(points, { w0, w1 = 0, thick = 0.42, taper = 1.4, segs = 12, radial = 10, outward = null, shine = true } = {}) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const positions = [];
  const colors = [];
  const indices = [];
  const col = new THREE.Color();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPoint(t, _p);
    curve.getTangent(t, _t);
    if (outward) outward(_p, _o);
    else _o.subVectors(_p, HEAD_C);
    _o.addScaledVector(_t, -_o.dot(_t)).normalize();
    _b.crossVectors(_t, _o).normalize();
    // Width: full near the root, narrowing to the tip (rounded root, pointed tip)
    const rootRound = Math.min(1, 0.55 + t * 6);
    const width = (w0 + (w1 - w0) * Math.pow(t, taper)) * rootRound * (t > 0.999 && w1 === 0 ? 0 : 1);
    // Angel-ring sheen where the lock crosses the upper skull
    let s = 0;
    if (shine) {
      _d.subVectors(_p, HEAD_C).normalize();
      s = Math.exp(-Math.pow((_d.y - 0.62) / 0.09, 2)) * 0.85;
    }
    col.copy(HAIR_BASE).lerp(HAIR_SHINE, s);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const lens = Math.sign(sa) * Math.pow(Math.abs(sa), 0.75);
      const curl = ca * ca * width * 0.16;
      positions.push(
        _p.x + _b.x * ca * width * 0.5 + _o.x * (lens * width * thick * 0.5 + curl),
        _p.y + _b.y * ca * width * 0.5 + _o.y * (lens * width * thick * 0.5 + curl),
        _p.z + _b.z * ca * width * 0.5 + _o.z * (lens * width * thick * 0.5 + curl)
      );
      colors.push(col.r, col.g, col.b);
      if (i < segs) {
        const a0 = i * radial + j;
        const a1 = i * radial + ((j + 1) % radial);
        indices.push(a0, a1, a0 + radial, a1, a1 + radial, a0 + radial);
      }
    }
  }
  // Root cap
  const rootIdx = positions.length / 3;
  curve.getPoint(0, _p);
  positions.push(_p.x, _p.y, _p.z);
  colors.push(HAIR_BASE.r, HAIR_BASE.g, HAIR_BASE.b);
  for (let j = 0; j < radial; j++) indices.push(rootIdx, (j + 1) % radial, j);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Hair shell over the skull, open where the face and jaw are. */
function hairShellGeometry() {
  const src = new THREE.SphereGeometry(HEAD_R, 72, 52).toNonIndexed();
  const p = src.attributes.position;
  const keep = [];
  const colors = [];
  const v = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  const col = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    centroid.set(0, 0, 0);
    for (let k = 0; k < 3; k++) centroid.add(v.fromBufferAttribute(p, i + k));
    centroid.normalize();
    const { x, y, z } = centroid;
    let ok = true;
    if (y < 0.45 && z > 0.36 + Math.max(0, Math.abs(x) - 0.55) * 0.5) ok = false; // face and forehead (the fringe covers the hairline)
    if (y < -0.1 + z * 0.5) ok = false; // hairline sloping from the nape up past the ear to the cheek
    if (!ok) continue;
    for (let k = 0; k < 3; k++) {
      v.fromBufferAttribute(p, i + k);
      const dir = v.clone().normalize();
      // Fuller at the crown and the back, close to the skull at the sides
      const k2 = 1.05 + Math.max(0, dir.y) * 0.035 + Math.max(0, -dir.z) * 0.03 + Math.abs(dir.x) * 0.02;
      surf(dir.x, dir.y, dir.z, k2, v);
      keep.push(v.x, v.y, v.z);
      const s = Math.exp(-Math.pow((dir.y - 0.62) / 0.09, 2)) * 0.85;
      col.copy(HAIR_BASE).lerp(HAIR_SHINE, s);
      colors.push(col.r, col.g, col.b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex([...Array(keep.length / 3).keys()]); // indexed like the locks, so they merge
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds the head into `headGroup` and returns the animated parts the Player drives.
 * mats: { skin, ribbon }
 */
export function buildHanaHead(headGroup, { skin, ribbon }) {
  const hair = createPixelToonMaterial({ occludable: false, color: '#ffffff', vertexColors: true });
  const decal = (map) => {
    const m = createPixelToonMaterial({ occludable: false, map, transparent: true, alphaTest: 0.04 });
    m.depthWrite = false;
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    return m;
  };

  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.08, 4, 12), skin);
  neck.position.set(0, 0.03, -0.01);
  headGroup.add(neck);

  const head = new THREE.Mesh(headGeometry(), skin);
  head.castShadow = true;
  headGroup.add(head);

  // ---- Face decals ----
  const faceTex = canvasTexture(512, 512, drawFace);
  const face = facePatch([0, -0.12, 1], 0.3, 0.26, 1.006, 12);
  const faceMesh = new THREE.Mesh(face.geo, decal(faceTex));
  faceMesh.position.copy(face.center);
  faceMesh.renderOrder = 2;
  headGroup.add(faceMesh);

  const eyes = [];
  for (const sx of [-1, 1]) {
    const tex = canvasTexture(128, 160, (ctx, w, h) => drawEye(ctx, w, h, sx < 0));
    const e = facePatch([sx * 0.4, -0.06, 0.92], 0.07, 0.088, 1.01, 6);
    const eye = new THREE.Mesh(e.geo, decal(tex));
    eye.position.copy(e.center);
    eye.renderOrder = 3;
    headGroup.add(eye);
    eyes.push(eye);
  }

  // ---- Hair ----
  const fixed = [hairShellGeometry()];
  const P = (dx, dy, dz, k) => surf(dx, dy, dz, k);

  // Fringe: locks fall from the crown over the forehead, longer over the eyes
  // and shorter between them, swept a touch to her right.
  const fringe = [
    [-1.0, 0.3, 0.12],
    [-0.68, 0.16, 0.13],
    [-0.34, 0.25, 0.12],
    [-0.02, 0.17, 0.13],
    [0.3, 0.27, 0.12],
    [0.64, 0.15, 0.13],
    [0.98, 0.3, 0.12],
  ];
  fringe.forEach(([s, tipY, w], i) => {
    const sweep = -0.06;
    const k = 1.085 + (i % 2) * 0.012; // alternate layers so neighbours overlap instead of z-fighting
    fixed.push(
      hairClump(
        [P(s * 0.22, 1, 0.15, 1.06), P(s * 0.42, 0.74, 0.6, k + 0.015), P(s * 0.54 + sweep, 0.47, 0.86, k), P(s * 0.6 + sweep, tipY, 0.95, k - 0.045)],
        { w0: w, thick: 0.4, taper: 2.6 }
      )
    );
  });

  // Locks combed back over the skull into the ponytail tie
  const tie = new THREE.Vector3(0, 0.24, -0.2);
  for (const phi of [-1.75, -1.25, -0.8, -0.35, 0.35, 0.8, 1.25, 1.75]) {
    const sx = Math.sin(phi);
    const start = P(sx * 0.9, 0.42, 0.4, 1.055);
    const mid = P(sx * 0.75, 0.75, -0.25, 1.09);
    fixed.push(hairClump([start, mid, tie.clone().add(new THREE.Vector3(sx * 0.02, 0, 0))], { w0: 0.11, w1: 0.05, thick: 0.35 }));
  }
  // Locks over the ears that soften the hairline from the temple down to the nape
  for (const sx of [-1, 1]) {
    fixed.push(hairClump([P(sx * 0.9, 0.5, 0.25, 1.07), P(sx, 0.05, 0.08, 1.08), P(sx * 0.92, -0.32, -0.12, 1.06)], { w0: 0.1, thick: 0.4, taper: 1.8 }));
    fixed.push(hairClump([P(sx * 0.85, 0.35, -0.45, 1.07), P(sx * 0.85, -0.15, -0.5, 1.08), P(sx * 0.7, -0.5, -0.62, 1.05)], { w0: 0.11, thick: 0.4, taper: 1.8 }));
  }
  // Short wisps at the nape
  for (const sx of [-0.35, 0.35]) {
    fixed.push(hairClump([P(sx, -0.1, -0.9, 1.05), P(sx * 1.2, -0.45, -0.85, 1.06), P(sx * 1.3, -0.68, -0.72, 1.04)], { w0: 0.07, thick: 0.4 }));
  }

  const hairMesh = new THREE.Mesh(mergeGeometries(fixed), hair);
  hairMesh.castShadow = true;
  headGroup.add(hairMesh);

  // Face-framing locks in front of the ears: animated pivots at their roots
  const cheekLocks = [];
  for (const sx of [-1, 1]) {
    const root = P(sx * 0.62, 0.62, 0.48, 1.07);
    const pivot = new THREE.Group();
    pivot.position.copy(root);
    const pts = [root, P(sx * 0.9, 0.25, 0.4, 1.1), P(sx * 0.92, -0.2, 0.36, 1.12), P(sx * 0.76, -0.62, 0.4, 1.1)].map((p) => p.clone().sub(root));
    const lockGeo = hairClump(
      pts.map((p) => p.clone().add(root)),
      { w0: 0.095, thick: 0.38, taper: 1.8 }
    );
    lockGeo.translate(-root.x, -root.y, -root.z);
    const lock = new THREE.Mesh(lockGeo, hair);
    lock.castShadow = true;
    pivot.add(lock);
    headGroup.add(pivot);
    cheekLocks.push(pivot);
  }

  // ---- Ribbon bow at the tie ----
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), ribbon);
  knot.scale.set(1, 0.85, 0.7);
  knot.position.set(0, 0.255, -0.215);
  headGroup.add(knot);
  for (const sx of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.016, 8, 16), ribbon);
    loop.scale.set(1.15, 0.8, 0.55);
    loop.position.set(sx * 0.055, 0.268, -0.215);
    loop.rotation.set(0.15, sx * 0.35, sx * 0.25);
    headGroup.add(loop);
  }
  const makeRibbonTail = (side) => {
    const rp = new THREE.Group();
    rp.position.set(side * 0.025, 0.25, -0.225);
    const seg = new THREE.Mesh(new THREE.CapsuleGeometry(0.017, 0.12, 3, 6), ribbon);
    seg.scale.set(1, 1, 0.4);
    seg.position.set(side * 0.012, -0.075, -0.01);
    seg.rotation.z = side * -0.25;
    rp.add(seg);
    headGroup.add(rp);
    return rp;
  };
  const ribbonLeft = makeRibbonTail(-1);
  const ribbonRight = makeRibbonTail(1);

  // ---- Ponytail: two simulated segments, each a bundle of tapering locks ----
  const ponyOut = (p, out) => out.set(p.x * 6, 0, -1);
  const ponytailTop = new THREE.Group();
  ponytailTop.position.set(0, 0.22, -0.24);
  const topLocks = [-1, 0, 1, -0.5, 0.5].map((k, i) =>
    hairClump(
      [new THREE.Vector3(k * 0.014, 0.03, 0.015 - (i > 2 ? 0.02 : 0)), new THREE.Vector3(k * 0.034, -0.08, -0.035 - (i > 2 ? 0.025 : 0)), new THREE.Vector3(k * 0.028, -0.21, -0.065 - (i > 2 ? 0.015 : 0))],
      { w0: 0.08, w1: 0.06, thick: 0.95, outward: ponyOut, shine: false }
    )
  );
  const pt1 = new THREE.Mesh(mergeGeometries(topLocks), hair);
  pt1.castShadow = true;
  ponytailTop.add(pt1);

  const ponytailTip = new THREE.Group();
  ponytailTip.position.set(0, -0.2, -0.06);
  const tipLocks = [-1, 0, 1, -0.5, 0.5].map((k, i) =>
    hairClump(
      [new THREE.Vector3(k * 0.026, 0.02, 0.004 - (i > 2 ? 0.02 : 0)), new THREE.Vector3(k * 0.036, -0.1, -0.02 - (i > 2 ? 0.02 : 0)), new THREE.Vector3(k * 0.022 - 0.004, -0.2 + (i > 2 ? 0.04 : 0), -0.05 - Math.abs(k) * 0.01)],
      { w0: 0.066, thick: 0.95, taper: 1.8, outward: ponyOut, shine: false }
    )
  );
  const pt2 = new THREE.Mesh(mergeGeometries(tipLocks), hair);
  pt2.castShadow = true;
  ponytailTip.add(pt2);
  ponytailTop.add(ponytailTip);
  headGroup.add(ponytailTop);

  return { eyes, cheekLocks, ribbonLeft, ribbonRight, ponytailTop, ponytailTip };
}

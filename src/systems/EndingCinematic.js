import * as THREE from 'three';

function smoothstep(t) {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

const lerp = (a, b, t) => a + (b - a) * t;

// Story beats (seconds). The film closes the intro's promise: the bell speaks,
// the sky remembers its hours, every garden answers, and Hana finally rests.
const T_SKY = 6.5;
const T_STARS = 16.0;
const T_REST = 30.0;
const T_CREDITS = 44.0;
const CREDITS_LENGTH = 36.0;
const T_END = T_CREDITS + CREDITS_LENGTH;

const STAR_FIRST = 17.2;
const STAR_STEP = 1.65;

const CAPTIONS = [
  { at: 0.8, until: 5.8, text: 'The great Bonshō speaks again.' },
  { at: T_SKY + 0.8, until: T_STARS - 0.6, text: 'And the sky remembers its hours.' },
  { at: T_STARS + 0.6, until: T_REST - 1.2, text: 'Seven gardens answer, one seal at a time.' },
  { at: T_REST + 1.4, until: T_REST + 6.4, text: 'Rest now, Hana. Mochi is already dreaming.' },
];

// Where each chapter's three seals sit on screen: a comet trail rising from
// the lower left to the upper right (percent of the viewport).
const TRAIL = [
  [13, 64],
  [25, 54],
  [37, 47],
  [50, 41],
  [62, 36],
  [74, 30],
  [86, 24],
];

const STILL_INPUT = { forward: false, backward: false, left: false, right: false, run: false };

/**
 * The closing film after the Grand Sky Bell of Chapter VII, followed by the credits.
 * Drives the perspective camera, the sky presets and a DOM layer (constellation,
 * end card, credits) the same way IntroCinematic does for the opening.
 */
export class EndingCinematic {
  constructor({ pixelRenderer, dayCycle, audio, cat, player, scene, chapters, els, onTimeSync, onSubtitle, onFade, onStart, onComplete }) {
    this.pixelRenderer = pixelRenderer;
    this.dayCycle = dayCycle;
    this.audio = audio;
    this.cat = cat;
    this.player = player;
    this.scene = scene;
    this.chapters = chapters;
    this.els = els;
    this.onTimeSync = onTimeSync;
    this.onSubtitle = onSubtitle;
    this.onFade = onFade;
    this.onStart = onStart;
    this.onComplete = onComplete;

    this.active = false;
    this.time = 0;
    this.beats = new Set();
    this.caption = '';
    this.waves = [];

    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._buildConstellation();
    this._buildCredits();
  }

  getFocusPosition() {
    return this._look;
  }

  /** stage: { bell: {x,y,z}, bench: {x,y,z,yaw}, center: {x,y,z} } from the final chapter. */
  start(stage) {
    this.stage = stage;
    this.active = true;
    this.time = 0;
    this.beats.clear();
    this.caption = '';
    this.restStaged = false;

    // Hana stands between the camera and the bell, facing it, so the first frame
    // reads clearly whatever side she rang it from.
    const { bell } = stage;
    this.bellAngle = stage.bellAngle ?? 0.7;
    const hx = bell.x + Math.sin(this.bellAngle) * 2.4;
    const hz = bell.z + Math.cos(this.bellAngle) * 2.4;
    if (!stage.canStandAt || stage.canStandAt(hx, hz)) {
      this.player.resetTo({ x: hx, z: hz, yaw: Math.atan2(bell.x - hx, bell.z - hz) });
      this.cat.resetTo({ x: hx + 1.1, z: hz + 0.6, yaw: this.player.yaw });
    }

    this.els.root.classList.remove('hidden', 'credits-on', 'card-on');
    this.els.constellation.classList.remove('show');
    this.els.stars.forEach((g) => g.classList.remove('lit'));
    this.trailPath.style.strokeDashoffset = '100';
    this.els.credits.classList.remove('rolling');
    this.onSubtitle?.('');
    this.onFade?.(0);
    this.pixelRenderer.setTitleOrbit(false);
    this.pixelRenderer.setCinematicMode(true);
    this._applyCamera(0, 0);
    this.onStart?.();
  }

  /** First press jumps to the credits, a second one ends the film. */
  skip() {
    if (!this.active) return;
    if (this.time < T_CREDITS - 0.5) {
      this._stageRest();
      this.els.constellation.classList.remove('show');
      this.time = T_CREDITS - 0.5;
      this.beats.add('card');
    } else {
      this._finish();
    }
  }

  _beat(id, at, fn) {
    if (this.time >= at && !this.beats.has(id)) {
      this.beats.add(id);
      fn();
    }
  }

  update(dt, elapsed) {
    if (!this.active) return;
    this.time += dt;
    const t = this.time;

    this.player.update(dt, STILL_INPUT, this.pixelRenderer);
    this._updateWaves(dt);

    // --- Beats ---
    this._beat('toll', 0.35, () => {
      this.audio.playBonshoBell?.();
      this.stage.celebrate?.();
      this._spawnWave(0);
      this._spawnWave(1.1);
    });
    this._beat('dusk', T_SKY + 0.6, () => this.onTimeSync?.(this.dayCycle.setPreset(1)));
    this._beat('night', T_SKY + 4.6, () => this.onTimeSync?.(this.dayCycle.setPreset(2)));
    this._beat('stars-in', T_STARS, () => this.els.constellation.classList.add('show'));
    for (let i = 0; i < this.els.stars.length; i++) {
      this._beat(`star-${i}`, STAR_FIRST + i * STAR_STEP, () => {
        this.els.stars[i].classList.add('lit');
        this.trailPath.style.strokeDashoffset = String(100 - (i / (this.els.stars.length - 1)) * 100);
        this.audio.playEndingNote?.(i);
      });
    }
    this._beat('stars-out', T_REST - 1.0, () => this.els.constellation.classList.remove('show'));
    this._beat('rest', T_REST, () => this._stageRest());
    this._beat('dawn', T_REST + 0.2, () => this.onTimeSync?.(this.dayCycle.setPreset(1)));
    this._beat('day', T_REST + 6.0, () => this.onTimeSync?.(this.dayCycle.setPreset(0)));
    this._beat('purr', T_REST + 4.0, () => this.audio.playCatMeow?.());
    this._beat('card', T_REST + 8.0, () => {
      this.els.root.classList.add('card-on');
      this.audio.playChapterComplete?.();
    });
    this._beat('credits', T_CREDITS, () => {
      this.els.root.classList.remove('card-on');
      this.els.root.classList.add('credits-on');
      this.els.credits.style.setProperty('--roll', `${CREDITS_LENGTH - 2}s`);
      this.els.credits.classList.add('rolling');
    });
    this._beat('credits-bell', T_CREDITS + 14, () => this.audio.playBonshoBell?.());

    // --- Fades: soft dips on the cuts, black at the very end ---
    const dip = (at, half) => 1 - Math.min(1, Math.abs(t - at) / half);
    let fade = Math.max(dip(T_SKY, 0.4), dip(T_STARS, 0.45), dip(T_REST, 0.7));
    if (t > T_END - 2.5) fade = Math.max(fade, smoothstep((t - (T_END - 2.5)) / 2.2));
    this.onFade?.(fade);

    // --- Captions ---
    const cap = CAPTIONS.find((c) => t >= c.at && t < c.until);
    const text = cap ? cap.text : '';
    if (text !== this.caption) {
      this.caption = text;
      this.onSubtitle?.(text);
    }

    if (t >= T_END) {
      this._finish();
      return;
    }
    this._applyCamera(t, elapsed);
  }

  _stageRest() {
    if (this.restStaged) return;
    this.restStaged = true;
    const b = this.stage.bench;
    this.player.sitAt(b.x, b.y + 0.08, b.z, b.yaw);
    // Mochi curls up beside her (the companion naps on its own next to a seated Hana)
    const side = b.yaw + Math.PI * 0.5;
    this.cat.resetTo({ x: b.x + Math.sin(side) * 1.18, z: b.z + Math.cos(side) * 1.18, yaw: b.yaw });
  }

  _applyCamera(t, elapsed) {
    const { bell, bench, center } = this.stage;
    let fov = 34;

    if (t < T_SKY) {
      // 1. The toll: a slow arc around Hana and the bell, rising a little
      const u = smoothstep(t / T_SKY);
      const a = this.bellAngle - 0.15 + u * 0.3;
      const r = lerp(11.5, 13.5, u);
      this._pos.set(bell.x + Math.sin(a) * r, bell.y + lerp(4.2, 7.0, u), bell.z + Math.cos(a) * r);
      this._look.set(bell.x, bell.y + lerp(1.9, 1.5, u), bell.z);
      fov = lerp(38, 42, u);
    } else if (t < T_STARS) {
      // 2. The whole crater while the sky turns through its hours
      const u = smoothstep((t - T_SKY) / (T_STARS - T_SKY));
      const a = 0.4 + u * 0.9;
      const r = lerp(58, 50, u);
      this._pos.set(center.x + Math.sin(a) * r, center.y + lerp(34, 28, u), center.z + Math.cos(a) * r);
      this._look.set(center.x, center.y + 1.0, center.z);
      fov = 38;
    } else if (t < T_REST) {
      // 3. Tilt up from the shrine into the night sky where the seals gather
      const u = smoothstep((t - T_STARS) / (T_REST - T_STARS));
      this._pos.set(center.x + 6, center.y + lerp(14, 22, u), center.z + 46);
      this._look.set(center.x, center.y + lerp(10, 40, u), center.z - 30);
      fov = lerp(42, 48, u);
    } else {
      // 4. Hana and Mochi on the bench at dawn; then a slow rise for the credits
      const u = smoothstep((t - T_REST) / (T_CREDITS - T_REST));
      const w = smoothstep((t - T_CREDITS) / (T_END - T_CREDITS));
      // A slow crane up during the credits; the belfry and its trees stand right
      // behind this camera, so it rises instead of pulling back.
      const a = bench.yaw + 0.55 - u * 0.25;
      const r = lerp(7.5, 6.2, u);
      const breathe = Math.sin(elapsed * 0.4) * 0.05;
      this._pos.set(bench.x + Math.sin(a) * r, bench.y + lerp(2.2, 1.9, u) + w * 3.2 + breathe, bench.z + Math.cos(a) * r);
      // Aim left of the bench so Hana and Mochi sit in the right third; the end
      // card and the credits take the left side of the frame.
      const side = lerp(1.7, 1.5, u);
      this._look.set(bench.x - Math.cos(a) * side, bench.y + 1.0 + w * 0.6, bench.z + Math.sin(a) * side);
      fov = lerp(34, 31, u) + w * 4;
    }
    this.pixelRenderer.setCinematicCamera(this._pos, this._look, fov);
  }

  // --- The golden ensō wave that leaves the bell ---
  _spawnWave(delay) {
    const geo = new THREE.RingGeometry(0.86, 1.0, 96);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: '#f0c66f',
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(this.stage.bell.x, this.stage.bell.y + 0.35, this.stage.bell.z);
    mesh.renderOrder = 5;
    this.scene.add(mesh);
    this.waves.push({ mesh, age: -delay });
  }

  _updateWaves(dt) {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.age += dt;
      const life = 6.5;
      const k = Math.max(0, w.age) / life;
      if (k >= 1) {
        this._disposeWave(w);
        this.waves.splice(i, 1);
        continue;
      }
      const s = 1 + Math.pow(k, 1.6) * 60;
      w.mesh.scale.set(s, 1, s);
      w.mesh.material.opacity = w.age < 0 ? 0 : 0.85 * (1 - k) * Math.min(1, w.age * 4);
    }
  }

  _disposeWave(w) {
    this.scene.remove(w.mesh);
    w.mesh.geometry.dispose();
    w.mesh.material.dispose();
  }

  // --- DOM: the comet trail of 21 seals and the credits roll ---
  _buildConstellation() {
    const { constellation } = this.els;
    constellation.innerHTML = '';
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.classList.add('end-trail');
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', `M ${TRAIL.map(([x, y]) => `${x} ${y}`).join(' L ')}`);
    path.setAttribute('pathLength', '100');
    svg.appendChild(path);
    constellation.appendChild(svg);

    this.els.stars = this.chapters.map((ch, i) => {
      const group = document.createElement('div');
      group.className = 'end-star';
      group.style.left = `${TRAIL[i][0]}%`;
      group.style.top = `${TRAIL[i][1]}%`;
      const seals = ch.seals.map((s) => `<span class="end-seal">${s.kanji}</span>`).join('');
      group.innerHTML = `<div class="end-seals">${seals}</div><div class="end-roman">${ch.roman}</div>`;
      constellation.appendChild(group);
      return group;
    });
    this.trailPath = path;
  }

  _buildCredits() {
    const roll = document.createElement('div');
    roll.className = 'credits-roll';
    const chapterLines = this.chapters
      .map((ch) => `<li><span class="cr-roman">${ch.roman}</span><span class="cr-name"></span><span class="cr-kanji">${ch.kanji}</span></li>`)
      .join('');
    roll.innerHTML = `
      <div class="cr-title">
        <div class="cr-title-kanji">雲の庭</div>
        <div class="cr-title-latin">Kumo no Niwa</div>
        <div class="cr-tagline">A garden above the clouds</div>
      </div>
      <section><h3>Created by</h3><p class="cr-big">Ignacio Estevo</p></section>
      <section><h3>With</h3><p class="cr-big">Hana</p><p>who turns the sky</p><p class="cr-big">Mochi</p><p>who never left her side</p></section>
      <section><h3>Seven sanctuaries</h3><ul class="cr-chapters">${chapterLines}</ul></section>
      <section><h3>Twenty-one seals</h3><p class="cr-seals">${this.chapters.map((c) => c.seals.map((s) => s.kanji).join(' ')).join('  ·  ')}</p></section>
      <section><h3>Made with</h3><p>Three.js · Vite · Web Audio</p><p>Foley recorded in the real world, shaped with earshot</p></section>
      <section class="cr-thanks"><p class="cr-big">ありがとう</p><p>Thank you for playing.</p></section>`;
    roll.querySelectorAll('.cr-name').forEach((el, i) => {
      el.textContent = this.chapters[i].title;
    });
    this.els.credits.innerHTML = '';
    this.els.credits.appendChild(roll);
  }

  _finish() {
    this.active = false;
    this.waves.forEach((w) => this._disposeWave(w));
    this.waves = [];
    this.onSubtitle?.('');
    this.els.root.classList.add('hidden');
    this.els.root.classList.remove('credits-on', 'card-on');
    this.els.credits.classList.remove('rolling');
    this.els.constellation.classList.remove('show');
    this.player.standUp();
    this.onComplete?.();
  }
}

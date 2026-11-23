import * as THREE from 'three';

function smoothstep(t) {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

// Gameplay diorama framing (must match PixelRenderer.updateCamera): orbit yaw,
// horizontal distance, height and ortho half-height. The last shot ends on the
// perspective twin of that framing so the cut to the ortho camera is seamless.
const GAME_YAW = 0.24;
const GAME_DIST = 36.0;
const GAME_HEIGHT = 47.0;
const GAME_HALF_H = 11.8;

const SHOTS = [
  {
    // Night: the whole floating garden, title card over it
    start: 0.0,
    end: 5.0,
    fromPos: [58.0, 40.0, 68.0],
    toPos: [46.0, 33.0, 56.0],
    fromLook: [0.0, 2.0, -4.0],
    toLook: [0.0, 3.0, -8.0],
    fromFov: 38,
    toFov: 35,
    caption: '',
    title: true,
  },
  {
    // The silent belfry; the sky drifts to Dusk
    start: 5.0,
    end: 9.4,
    fromPos: [15.0, 13.5, -29.0],
    toPos: [8.5, 11.0, -26.5],
    fromLook: [0.0, 8.2, -40.5],
    toLook: [0.0, 8.0, -40.5],
    fromFov: 34,
    toFov: 31,
    caption: 'When the great Bonshō fell silent, the sky forgot its hours.',
  },
  {
    // Low glide over the koi lake as Day returns
    start: 9.4,
    end: 13.0,
    fromPos: [-18.0, 4.6, 22.0],
    toPos: [-6.0, 4.0, 20.5],
    fromLook: [4.0, 0.4, 12.0],
    toLook: [6.0, 0.6, 10.0],
    fromFov: 36,
    toFov: 34,
    caption: 'Only Hana and Mochi can still turn it: Day, Dusk and Night.',
  },
  {
    // From Hana's side up to the playable diorama view (computed in start())
    start: 13.0,
    end: 17.0,
    follow: true,
    caption: 'Wake the three seals, and let the garden sing again.',
  },
];

const TOTAL_DURATION = 17.0;

export class IntroCinematic {
  constructor({ pixelRenderer, dayCycle, audio, cat, player, onTimeSync, onSubtitle, onTitle, onFade, onStart, onComplete }) {
    this.pixelRenderer = pixelRenderer;
    this.dayCycle = dayCycle;
    this.audio = audio;
    this.cat = cat;
    this.player = player;
    this.onTimeSync = onTimeSync;
    this.onSubtitle = onSubtitle;
    this.onTitle = onTitle;
    this.onFade = onFade;
    this.onStart = onStart;
    this.onComplete = onComplete;

    this.active = false;
    this.time = 0;
    this.lastShotIdx = -1;
    this.beats = new Set();

    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._fromV = new THREE.Vector3();
    this._toV = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._gameOffset = new THREE.Vector3();
    this._closeOffset = new THREE.Vector3();
  }

  getFocusPosition() {
    return this._look;
  }

  start() {
    this.active = true;
    this.time = 0;
    this.lastShotIdx = -1;
    this.beats.clear();
    this.titleShown = false;

    // Final framing, anchored on Hana where gameplay begins
    const p = this.player.position;
    this._target.set(p.x, p.y + 0.95, p.z - 0.5);
    this._gameOffset.set(Math.sin(GAME_YAW) * GAME_DIST, GAME_HEIGHT, Math.cos(GAME_YAW) * GAME_DIST);
    this._closeOffset.set(4.2, 2.4, 6.4);
    this._gameFov = THREE.MathUtils.radToDeg(2 * Math.atan(GAME_HALF_H / this._gameOffset.length()));

    const nightPreset = this.dayCycle.setPreset(2);
    this.onTimeSync?.(nightPreset);
    this.onFade?.(1.0);
    this.onSubtitle?.('');
    this.onTitle?.(false);
    this.pixelRenderer.setTitleOrbit(false);
    this.pixelRenderer.setCinematicMode(true);
    this._applyCameraForTime(0);
    this.onStart?.();
  }

  skip() {
    if (!this.active) return;
    this._finish();
  }

  _beat(id, at, fn) {
    if (this.time >= at && !this.beats.has(id)) {
      this.beats.add(id);
      fn();
    }
  }

  update(dt) {
    if (!this.active) return;
    this.time += dt;
    const t = this.time;

    // Fade from black, and a soft dip on the first cut
    let fade = t < 1.2 ? 1 - smoothstep(t / 1.2) : 0;
    const dip = 1 - Math.min(1, Math.abs(t - 5.0) / 0.35);
    fade = Math.max(fade, dip);
    this.onFade?.(fade);

    const showTitle = t > 0.9 && t < 4.3;
    if (showTitle !== this.titleShown) {
      this.titleShown = showTitle;
      this.onTitle?.(showTitle);
    }

    this._beat('bell', 5.5, () => this.audio.playBonshoBell?.());
    this._beat('dusk', 6.4, () => this.onTimeSync?.(this.dayCycle.setPreset(1)));
    this._beat('day', 9.6, () => this.onTimeSync?.(this.dayCycle.setPreset(0)));
    this._beat('chime', 9.8, () => this.audio.playLanternChime?.(true));
    this._beat('cat', 13.8, () => {
      this.cat.triggerCompanionHop?.();
      this.audio.playCatMeow?.();
    });

    if (t >= TOTAL_DURATION) {
      this._finish();
      return;
    }
    this._applyCameraForTime(t);
  }

  _applyCameraForTime(t) {
    let shotIdx = SHOTS.length - 1;
    for (let i = 0; i < SHOTS.length; i++) {
      if (t >= SHOTS[i].start && t < SHOTS[i].end) {
        shotIdx = i;
        break;
      }
    }
    const shot = SHOTS[shotIdx];
    const raw = Math.max(0, Math.min(1, (t - shot.start) / (shot.end - shot.start)));
    let fov;

    if (shot.follow) {
      // Ease out so the camera settles into the gameplay view without a jolt
      const u = 1 - Math.pow(1 - smoothstep(raw * 1.08), 2.2);
      // Interpolate the distance geometrically so the rise feels like one smooth crane move
      const closeLen = this._closeOffset.length();
      const farLen = this._gameOffset.length();
      const len = closeLen * Math.pow(farLen / closeLen, u);
      this._fromV.copy(this._closeOffset).normalize();
      this._toV.copy(this._gameOffset).normalize();
      this._fromV.lerp(this._toV, u).normalize();
      this._look.copy(this._target);
      this._look.y += (1 - u) * 0.15;
      this._pos.copy(this._target).addScaledVector(this._fromV, len);
      fov = 32 + (this._gameFov - 32) * u;
    } else {
      const u = smoothstep(raw);
      this._fromV.set(...shot.fromPos);
      this._toV.set(...shot.toPos);
      this._pos.lerpVectors(this._fromV, this._toV, u);
      this._fromV.set(...shot.fromLook);
      this._toV.set(...shot.toLook);
      this._look.lerpVectors(this._fromV, this._toV, u);
      fov = shot.fromFov + (shot.toFov - shot.fromFov) * u;
    }
    this.pixelRenderer.setCinematicCamera(this._pos, this._look, fov);

    if (shotIdx !== this.lastShotIdx) {
      this.lastShotIdx = shotIdx;
      this.onSubtitle?.(shot.caption);
    }
  }

  _finish() {
    this.active = false;
    this.onTimeSync?.(this.dayCycle.setPreset(0));
    this.onFade?.(0);
    this.onSubtitle?.('');
    this.onTitle?.(false);
    this.pixelRenderer.setCinematicMode(false, this.player.position);
    this.onComplete?.();
  }
}

/**
 * First-run onboarding with large on-screen keys, shown once at the start of Chapter I:
 *   move    → hold W A S D until Hana has walked a few metres
 *   lantern → a marker leads to the nearest stone lantern, then a big [E] lights it
 *   sky     → a big [T] turns the sky through Day, Dusk and Night
 *   extras  → a short strip with the remaining keys, then it fades away
 * Completion is remembered in localStorage so returning players are not taught twice.
 */
const STORAGE_KEY = 'kumo.tutorialDone';
const MOVE_DISTANCE = 4.5;

const MOVE_KEYS = {
  KeyW: 'w',
  ArrowUp: 'w',
  KeyA: 'a',
  ArrowLeft: 'a',
  KeyS: 's',
  ArrowDown: 's',
  KeyD: 'd',
  ArrowRight: 'd',
};

const SKY_ICONS = ['ico-sun', 'ico-dusk', 'ico-moon'];

function readDone() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDone(value) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode); the tutorial simply shows again.
  }
}

export class TutorialSystem {
  /**
   * @param {object} opts
   * @param {object} opts.els DOM nodes: root, keys, title, sub, marker
   * @param {(v: {x:number,y:number,z:number}) => {x:number,y:number,inFront:boolean}} opts.project world → CSS pixels
   */
  constructor({ els, project }) {
    this.els = els;
    this.project = project;
    this.step = null;
    this.timer = 0;
    this.walked = 0;
    this.lastPos = null;
    this.lantern = null;
    this.getLitCount = null;
    this.litBaseline = 0;
    this.skySeen = new Set();
    this.inRange = false;
  }

  get active() {
    return this.step !== null;
  }

  static isDone() {
    return readDone();
  }

  static reset() {
    writeDone(false);
  }

  /** Starts the lesson unless it was already completed. */
  start({ playerPos, lanterns, getLitCount, getPresetIndex }) {
    if (readDone()) return false;
    this.walked = 0;
    this.lastPos = { x: playerPos.x, z: playerPos.z };
    this.getLitCount = getLitCount;
    this.getPresetIndex = getPresetIndex;
    // Nearest lantern to the spawn is the one we teach on
    let best = null;
    let bestD = Infinity;
    (lanterns || []).forEach((l) => {
      const d = Math.hypot(l.x - playerPos.x, l.z - playerPos.z);
      if (d < bestD) {
        bestD = d;
        best = l;
      }
    });
    this.lantern = best;
    this._enter('move');
    return true;
  }

  stop() {
    this.step = null;
    this.els.root.classList.add('hidden');
    this.els.marker.classList.add('hidden');
  }

  onKey(code, down) {
    if (!this.active) return;
    const key = MOVE_KEYS[code] || (code === 'KeyE' ? 'e' : code === 'KeyT' ? 't' : null);
    if (!key) return;
    const cap = this.els.keys.querySelector(`[data-key="${key}"]`);
    if (cap) cap.classList.toggle('pressed', down);
  }

  notifyTimeShift(presetIndex) {
    if (this.step !== 'sky') return;
    this.skySeen.add(presetIndex);
    this._paintSky(presetIndex);
    if (this.skySeen.size === 3) {
      this._enter('sky-done');
    }
  }

  update(dt, playerPos, nearestSpotId) {
    if (!this.active) return;
    this.timer += dt;

    switch (this.step) {
      case 'move': {
        this.walked += Math.hypot(playerPos.x - this.lastPos.x, playerPos.z - this.lastPos.z);
        this.lastPos.x = playerPos.x;
        this.lastPos.z = playerPos.z;
        if (this.walked >= MOVE_DISTANCE) this._enter('move-done');
        break;
      }
      case 'move-done':
        if (this.timer > 0.7) this._enter(this.lantern ? 'lantern' : 'sky');
        break;
      case 'lantern': {
        this._placeMarker();
        const near = typeof nearestSpotId === 'string' && nearestSpotId.startsWith('lantern-');
        if (near !== this.inRange) {
          this.inRange = near;
          this.els.title.textContent = near ? 'Press E to light it' : 'Find the stone lantern';
          this.els.sub.textContent = near
            ? 'E interacts with anything that glows a prompt'
            : 'Follow the golden marker';
          this.els.keys.querySelector('[data-key="e"]')?.classList.toggle('pulse', near);
          this.els.marker.classList.toggle('hidden', near);
        }
        if ((this.getLitCount?.() ?? 0) > this.litBaseline) this._enter('lantern-done');
        break;
      }
      case 'lantern-done':
        if (this.timer > 1.1) this._enter('sky');
        break;
      case 'sky-done':
        if (this.timer > 3.8) this._enter('extras');
        break;
      case 'extras':
        if (this.timer > 6.5) this._finish();
        break;
    }
  }

  _enter(step) {
    this.step = step;
    this.timer = 0;
    const { root, keys, title, sub, marker } = this.els;
    root.classList.remove('hidden');
    marker.classList.add('hidden');

    const swap = (keysHtml, keysClass, t, s) => {
      keys.className = `tut-keys ${keysClass}`;
      keys.innerHTML = keysHtml;
      title.textContent = t;
      sub.textContent = s;
      // restart the entrance animation
      root.style.animation = 'none';
      void root.offsetWidth;
      root.style.animation = '';
    };

    switch (step) {
      case 'move':
        swap(
          `<kbd class="kc" data-key="w" style="grid-area:w">W</kbd>
           <kbd class="kc" data-key="a" style="grid-area:a">A</kbd>
           <kbd class="kc" data-key="s" style="grid-area:s">S</kbd>
           <kbd class="kc" data-key="d" style="grid-area:d">D</kbd>`,
          'wasd',
          'Walk with W A S D',
          'Or click the ground to stroll there'
        );
        break;
      case 'move-done':
        keys.querySelectorAll('.kc').forEach((k) => k.classList.add('done'));
        title.textContent = 'Lovely.';
        sub.textContent = '';
        break;
      case 'lantern':
        this.inRange = false;
        this.litBaseline = this.getLitCount?.() ?? 0;
        swap('<kbd class="kc" data-key="e">E</kbd>', '', 'Find the stone lantern', 'Follow the golden marker');
        marker.classList.remove('hidden');
        this._placeMarker();
        break;
      case 'lantern-done':
        keys.querySelectorAll('.kc').forEach((k) => k.classList.add('done'));
        title.textContent = 'The lantern is lit.';
        sub.textContent = 'Lanterns, bells and stones all answer to E.';
        break;
      case 'sky': {
        // Count the sky the player is already under, so any two other skies finish the step
        const current = this.getPresetIndex?.() ?? 0;
        this.skySeen = new Set([current]);
        swap(
          `<div class="tut-row"><kbd class="kc pulse" data-key="t">T</kbd>
           <div class="tut-sky">${SKY_ICONS.map((id, i) => `${i ? '<i></i>' : ''}<svg data-sky="${i}"><use href="#${id}"/></svg>`).join('')}</div></div>`,
          '',
          'Press T to turn the sky',
          'Day, Dusk and Night. Try all three.'
        );
        this._paintSky(current);
        break;
      }
      case 'sky-done':
        keys.querySelector('[data-key="t"]')?.classList.remove('pulse');
        title.textContent = 'Every hour reveals something.';
        sub.textContent = 'Bridges, braziers and paths answer to the sky. Watch how the garden changes.';
        break;
      case 'extras':
        swap(
          `<div class="tut-row">
             <kbd class="kc wide">Space</kbd><span class="tut-sub">Jump</span>
             <kbd class="kc wide">Shift</kbd><span class="tut-sub">Run</span>
             <kbd class="kc">F</kbd><span class="tut-sub">Mochi</span>
             <kbd class="kc">H</kbd><span class="tut-sub">Hint</span>
           </div>`,
          'extras',
          'Three seals sleep in this garden.',
          'Awaken them all to ring the Bonshō again.'
        );
        break;
    }
  }

  _paintSky(idx) {
    this.els.keys.querySelectorAll('[data-sky]').forEach((svg) => {
      const i = Number(svg.dataset.sky);
      svg.classList.toggle('on', i === idx);
    });
  }

  _placeMarker() {
    if (!this.lantern) return;
    const p = this.project({ x: this.lantern.x, y: (this.lantern.y ?? 0) + 2.2, z: this.lantern.z });
    const el = this.els.marker;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const m = 54;
    const onScreen = p.inFront && p.x > m && p.x < w - m && p.y > m && p.y < h - m;
    let x = p.x;
    let y = p.y;
    const arrow = el.lastElementChild;
    if (!onScreen) {
      // Pin to the screen edge and point toward the lantern
      const cx = w / 2;
      const cy = h / 2;
      let dx = p.x - cx;
      let dy = p.y - cy;
      if (!p.inFront) {
        dx = -dx;
        dy = -dy;
      }
      const s = Math.min((cx - m) / Math.max(1e-3, Math.abs(dx)), (cy - m) / Math.max(1e-3, Math.abs(dy)));
      x = cx + dx * s;
      y = cy + dy * s;
      arrow.style.transform = `rotate(${Math.atan2(-dx, dy)}rad)`;
    } else {
      arrow.style.transform = '';
    }
    el.classList.toggle('offscreen', !onScreen);
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }

  _finish() {
    writeDone(true);
    this.stop();
  }
}

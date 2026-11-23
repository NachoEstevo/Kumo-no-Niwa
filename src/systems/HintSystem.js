const DWELL_THRESHOLD_SECONDS = 85;

/**
 * Quiet, spoiler-free hint system:
 *   - Watches player dwell time inside an unsolved puzzle zone (~85s without progress)
 *   - Also responds to manual Hint requests (H key or top-right Hint link)
 *   - Emits a subtle 6s 3D world shimmer + one poetic riddle line
 */
export class HintSystem {
  constructor({ puzzleManager, worldBuilder, onHint }) {
    this.puzzleManager = puzzleManager;
    this.worldBuilder = worldBuilder;
    this.onHint = onHint;

    this.currentZone = null;
    this.dwellSeconds = 0;
    this.lastProgressVersion = puzzleManager.progressVersion;
    this.dwellHintedZones = new Set();
  }

  rebind(puzzleManager, worldBuilder) {
    this.puzzleManager = puzzleManager;
    this.worldBuilder = worldBuilder;
    this.currentZone = null;
    this.dwellSeconds = 0;
    this.lastProgressVersion = puzzleManager.progressVersion;
    this.dwellHintedZones.clear();
  }

  update(dt, playerPos) {
    if (this.puzzleManager.chapterComplete) {
      this.dwellSeconds = 0;
      this.currentZone = null;
      return;
    }

    if (this.puzzleManager.progressVersion !== this.lastProgressVersion) {
      this.lastProgressVersion = this.puzzleManager.progressVersion;
      this.dwellSeconds = 0;
      this.dwellHintedZones.clear();
    }

    const zone = this.puzzleManager.getPuzzleZoneForPos(playerPos.x, playerPos.z);
    if (zone && zone === this.currentZone) {
      this.dwellSeconds += dt;
      if (this.dwellSeconds >= DWELL_THRESHOLD_SECONDS && !this.dwellHintedZones.has(zone)) {
        this.dwellHintedZones.add(zone);
        this._emitHintForZone(zone);
      }
    } else {
      this.currentZone = zone;
      this.dwellSeconds = 0;
    }
  }

  requestManualHint(playerPos) {
    if (this.puzzleManager.chapterComplete) {
      this.onHint?.('All seals rest in harmony. Wander freely beneath Day, Dusk, and Night.');
      return;
    }

    let zone = this.puzzleManager.getPuzzleZoneForPos(playerPos.x, playerPos.z);
    if (!zone) {
      const snap = this.puzzleManager.getStatusSnapshot();
      if (!snap.sealWater) zone = 'water';
      else if (!snap.sealBamboo) zone = 'bamboo';
      else if (!snap.sealTime) zone = 'time';
      else zone = 'belfry';
    }

    this._emitHintForZone(zone);
  }

  _emitHintForZone(zone) {
    if (typeof this.puzzleManager.getHintText === 'function') {
      this.worldBuilder.triggerHintPulse?.(zone);
      const customText = this.puzzleManager.getHintText(zone);
      if (customText) {
        this.onHint?.(customText);
        return;
      }
    }

    const snap = this.puzzleManager.getStatusSnapshot();
    let text = '';

    if (zone === 'water') {
      this.worldBuilder.triggerHintPulse('water');
      text = !snap.stonePlaced
        ? 'Where raked ripples meet the edge, a carved stone seeks its sunken mark.'
        : 'The garden stone rests in its mark; only sleeping water awaits beside the pavilion.';
    } else if (zone === 'bamboo') {
      this.worldBuilder.triggerHintPulse('bamboo');
      text = !snap.bambooCenterLit
        ? 'In the clearing among stalks, an unlit stone flame waits to gather four gazes.'
        : 'The rope pulls each guardian along with the one before it. Turn them so all four meet the light.';
    } else if (zone === 'time') {
      this.worldBuilder.triggerHintPulse('time');
      text =
        'High sun, setting embers, then crescent moon. Each brazier answers only its own sky, and takes its fire from the hour before.';
    } else {
      this.worldBuilder.triggerHintPulse('belfry');
      text = snap.bellUnsealed
        ? 'Three seals now gleam around the summit; strike the silent bronze bell.'
        : 'Three obelisks guard the belfry. Seek the Tea Garden, Bamboo Grove, and Cloud Summit.';
    }

    this.onHint?.(text);
  }
}

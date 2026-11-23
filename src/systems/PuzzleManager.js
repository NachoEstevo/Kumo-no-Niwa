import * as THREE from 'three';
import {
  BAMBOO_PUZZLE_CENTER,
  BRAZIER_SPOTS,
  PUSH_STONE_TARGET,
  PUZZLE_JIZO_SPOTS,
  canPushBlockTo,
  getHeightAt,
  getPushStonePosition,
  getRegionInfoAt,
  setPushStonePosition,
} from '../world/TerrainData.js';

export class PuzzleManager {
  constructor({ worldBuilder, audio, onStateChange, onToast, onChapterComplete }) {
    this.worldBuilder = worldBuilder;
    this.audio = audio;
    this.onStateChange = onStateChange;
    this.onToast = onToast;
    this.onChapterComplete = onChapterComplete;

    // Puzzle 1: Water Seal
    this.stonePlaced = false;
    this.shishiStruck = false;
    this.sealWater = false;

    // Puzzle 2: Bamboo Seal
    this.bambooCenterLit = false;
    this.jizoSteps = PUZZLE_JIZO_SPOTS.map((j) => j.initialSteps); // 0 === facing inward
    this.sealBamboo = false;

    // Puzzle 3: Time Braziers Seal
    this.braziersLit = { sun: false, amber: false, moon: false };
    this.sealTime = false;

    this.bellUnsealed = false;
    this.chapterComplete = false;
    this.progressVersion = 0;

    this._syncVisuals();
  }

  _bumpProgress() {
    this.progressVersion += 1;
  }

  _syncVisuals() {
    const ps = getPushStonePosition();
    this.worldBuilder.setPushStoneTarget(ps.x, ps.z, this.stonePlaced);
    this.worldBuilder.setShishiActivated?.(this.shishiStruck);
    this.worldBuilder.setBambooCenterLit(this.bambooCenterLit);
    PUZZLE_JIZO_SPOTS.forEach((sp, i) => {
      const yaw = sp.targetYaw + this.jizoSteps[i] * (Math.PI * 0.5);
      this.worldBuilder.setJizoRotation(i, yaw, this.jizoSteps[i] === 0, true);
    });
    BRAZIER_SPOTS.forEach((b) => {
      this.worldBuilder.setBrazierLit(b.id, this.braziersLit[b.id]);
    });
    this.worldBuilder.setBellUnsealed(this.bellUnsealed);
  }

  _checkUnseal() {
    if (!this.bellUnsealed && this.sealWater && this.sealBamboo && this.sealTime) {
      this.bellUnsealed = true;
      this.worldBuilder.setBellUnsealed(true);
      this.audio.playSealAwaken?.();
      this._bumpProgress();
      this.onToast?.('The Bonshō is unsealed.');
    }
    this.onStateChange?.(this.getStatusSnapshot());
  }

  pushZenStone(playerPos) {
    if (this.stonePlaced) return false;

    const ps = getPushStonePosition();
    const dx = ps.x - playerPos.x;
    const dz = ps.z - playerPos.z;

    let stepX = 0;
    let stepZ = 0;
    if (Math.abs(dx) >= Math.abs(dz)) {
      stepX = dx >= 0 ? 1.15 : -1.15;
    } else {
      stepZ = dz >= 0 ? 1.15 : -1.15;
    }

    const nx = ps.x + stepX;
    const nz = ps.z + stepZ;

    if (!canPushBlockTo(nx, nz)) {
      const altX = stepX === 0 ? (dx >= 0 ? 1.0 : -1.0) : 0;
      const altZ = stepZ === 0 ? (dz >= 0 ? 1.0 : -1.0) : 0;
      if (canPushBlockTo(ps.x + altX, ps.z + altZ)) {
        return this._commitStoneMove(ps.x + altX, ps.z + altZ);
      }
      this.audio.playLanternChime?.(false);
      return false;
    }

    return this._commitStoneMove(nx, nz);
  }

  _commitStoneMove(nx, nz) {
    let fx = nx;
    let fz = nz;
    const distToSocket = Math.hypot(fx - PUSH_STONE_TARGET.x, fz - PUSH_STONE_TARGET.z);
    if (distToSocket <= 0.95) {
      fx = PUSH_STONE_TARGET.x;
      fz = PUSH_STONE_TARGET.z;
      this.stonePlaced = true;
      this.audio.playLanternChime(true);
      this._bumpProgress();
    } else {
      this.audio.playStoneSlide?.();
    }

    setPushStonePosition(fx, fz);
    this.worldBuilder.setPushStoneTarget(fx, fz, this.stonePlaced);
    this.worldBuilder.addGravelFootprint(fx, fz);

    if (this.stonePlaced && this.shishiStruck && !this.sealWater) {
      this._awakenWaterSeal();
    } else {
      this.onStateChange?.(this.getStatusSnapshot());
    }
    return true;
  }

  onShishiActivated() {
    const firstStrike = !this.shishiStruck;
    this.shishiStruck = true;
    this.worldBuilder.setShishiActivated?.(true);
    this.worldBuilder.triggerShishiOdoshi();
    if (firstStrike) this._bumpProgress();
    if (this.stonePlaced && !this.sealWater) {
      this._awakenWaterSeal();
    } else {
      this.onStateChange?.(this.getStatusSnapshot());
    }
  }

  _awakenWaterSeal() {
    this.sealWater = true;
    this._bumpProgress();
    this.worldBuilder.clearHintPulse?.('water');
    this.audio.playSealAwaken?.();
    this.worldBuilder.launchSealOrb(new THREE.Vector3(-18.6, 1.8, -1.2), 0);
    this.onToast?.('Water Seal awakened.');
    this._checkUnseal();
  }

  lightBambooCenterLantern() {
    if (!this.bambooCenterLit) {
      this.bambooCenterLit = true;
      this._bumpProgress();
      this.worldBuilder.setBambooCenterLit(true);
      this.audio.playLanternChime(true);
      this._checkBambooSeal();
    }
  }

  _stepJizo(index) {
    this.jizoSteps[index] = (this.jizoSteps[index] + 1) % 4;
    const sp = PUZZLE_JIZO_SPOTS[index];
    const yaw = sp.targetYaw + this.jizoSteps[index] * (Math.PI * 0.5);
    this.worldBuilder.setJizoRotation(index, yaw, this.jizoSteps[index] === 0);
  }

  rotateJizo(index) {
    if (this.sealBamboo) return;
    // The rope drags the next statue clockwise a quarter turn as well
    this._stepJizo(index);
    this._stepJizo(PUZZLE_JIZO_SPOTS[index].link);
    this.worldBuilder.pulseJizoRope?.(index);
    this.audio.playStoneRotate?.();
    this._bumpProgress();
    this._checkBambooSeal();
  }

  _checkBambooSeal() {
    const allAligned = this.jizoSteps.every((s) => s === 0);
    if (!this.sealBamboo && this.bambooCenterLit && allAligned) {
      this.sealBamboo = true;
      this._bumpProgress();
      this.worldBuilder.clearHintPulse?.('bamboo');
      this.audio.playSealAwaken?.();
      this.worldBuilder.launchSealOrb(
        new THREE.Vector3(BAMBOO_PUZZLE_CENTER.x, 2.2, BAMBOO_PUZZLE_CENTER.z),
        1
      );
      this.onToast?.('Bamboo Seal awakened.');
      this._checkUnseal();
    } else {
      this.onStateChange?.(this.getStatusSnapshot());
    }
  }

  tryLightBrazier(brazierId, currentTimeId) {
    const spec = BRAZIER_SPOTS.find((b) => b.id === brazierId);
    if (!spec || this.braziersLit[brazierId]) return;

    // Wrong time: diegetic hollow chime + subtle visual pulse only (zero spoilers)
    if (currentTimeId !== spec.timeId) {
      this.audio.playLanternChime(false);
      this.worldBuilder.flashBrazierHint?.(brazierId);
      return;
    }

    // The flame is handed on through the day: Sun, then Dusk, then Moon
    const order = BRAZIER_SPOTS.map((b) => b.id);
    const prev = order[order.indexOf(brazierId) - 1];
    if (prev && !this.braziersLit[prev]) {
      this.audio.playLanternChime(false);
      this.worldBuilder.flashBrazierHint?.(prev);
      this.onToast?.('The bowl stays cold. Its fire must be handed on from an earlier hour.');
      return;
    }

    this.braziersLit[brazierId] = true;
    this._bumpProgress();
    this.worldBuilder.setBrazierLit(brazierId, true);
    this.audio.playLanternChime(true);

    const litCount = Object.values(this.braziersLit).filter(Boolean).length;
    if (litCount === 3 && !this.sealTime) {
      this.sealTime = true;
      this.worldBuilder.clearHintPulse?.('time');
      this.audio.playSealAwaken?.();
      const y = getHeightAt(spec.x, spec.z);
      this.worldBuilder.launchSealOrb(new THREE.Vector3(spec.x, y + 1.5, spec.z), 2);
      this.onToast?.('Time Seal awakened.');
      this._checkUnseal();
    } else {
      this.onStateChange?.(this.getStatusSnapshot());
    }
  }

  tryRingBonsho() {
    this.worldBuilder.ringBell();
    if (!this.bellUnsealed) {
      this.audio.playLanternChime(false);
      this.worldBuilder.triggerHintPulse?.('belfry');
      return false;
    }

    this.audio.playBonshoBell();
    if (!this.chapterComplete) {
      this.chapterComplete = true;
      this._bumpProgress();
      this.worldBuilder.clearHintPulse?.('belfry');
      this.audio.playChapterComplete?.();
      this.onStateChange?.(this.getStatusSnapshot());
      setTimeout(() => {
        this.onChapterComplete?.();
      }, 1500);
    }
    return true;
  }

  getPuzzleZoneForPos(x, z) {
    if (this.chapterComplete) return null;
    const reg = getRegionInfoAt(x, z).id;
    if (!this.sealWater && (reg === 'teahouse' || Math.hypot(x + 18.6, z + 1.2) < 5.5)) {
      return 'water';
    }
    if (!this.sealBamboo && reg === 'bamboo') {
      return 'bamboo';
    }
    if (
      !this.sealTime &&
      (reg === 'summit' || Math.hypot(x - 20.8, z + 10.4) < 6.5 || (z <= -22.5 && z > -36.5))
    ) {
      return 'time';
    }
    if (reg === 'belfry') {
      return 'belfry';
    }
    return null;
  }

  getHintTargetPos(playerPos) {
    if (this.chapterComplete) return null;
    const zone = this.getPuzzleZoneForPos(playerPos.x, playerPos.z);
    let key = zone;
    if (!key) {
      if (!this.sealWater) key = 'water';
      else if (!this.sealBamboo) key = 'bamboo';
      else if (!this.sealTime) key = 'time';
      else key = 'belfry';
    }

    if (key === 'water') {
      return !this.stonePlaced ? getPushStonePosition() : { x: -18.6, z: -1.2 };
    }
    if (key === 'bamboo') {
      if (!this.bambooCenterLit) return { x: BAMBOO_PUZZLE_CENTER.x, z: BAMBOO_PUZZLE_CENTER.z };
      const idx = this.jizoSteps.findIndex((s) => s !== 0);
      if (idx >= 0) return { x: PUZZLE_JIZO_SPOTS[idx].x, z: PUZZLE_JIZO_SPOTS[idx].z };
      return { x: BAMBOO_PUZZLE_CENTER.x, z: BAMBOO_PUZZLE_CENTER.z };
    }
    if (key === 'time') {
      let best = null;
      let bestD = Infinity;
      for (let i = 0; i < BRAZIER_SPOTS.length; i++) {
        const b = BRAZIER_SPOTS[i];
        if (this.braziersLit[b.id]) continue;
        const d = Math.hypot(b.x - playerPos.x, b.z - playerPos.z);
        if (d < bestD) {
          bestD = d;
          best = { x: b.x, z: b.z };
        }
      }
      return best;
    }
    return { x: 0.0, z: -39.2 };
  }

  getStatusSnapshot() {
    return {
      seals: [this.sealWater, this.sealBamboo, this.sealTime],
      sealWater: this.sealWater,
      sealBamboo: this.sealBamboo,
      sealTime: this.sealTime,
      bellUnsealed: this.bellUnsealed,
      chapterComplete: this.chapterComplete,
      stonePlaced: this.stonePlaced,
      bambooCenterLit: this.bambooCenterLit,
      alignedJizos: this.jizoSteps.filter((s) => s === 0).length,
      braziersLit: { ...this.braziersLit },
    };
  }
}

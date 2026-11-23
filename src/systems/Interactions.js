import {
  BAMBOO_PUZZLE_CENTER,
  BRAZIER_SPOTS,
  PUZZLE_JIZO_SPOTS,
  getPushStonePosition,
} from '../world/TerrainData.js';

const EMA_WISHES = [
  'May quiet winds soften every step ahead.',
  'Stillness like sunrise over mirror water.',
  'May calm days bloom beneath the sakura.',
  'A single moment of silence outlasts a thousand words.',
  'Walk slowly enough to watch the blossoms fall.',
];

export class Interactions {
  constructor({
    worldBuilder,
    foliage,
    player,
    cat,
    koiSchool,
    audio,
    puzzleManager,
    dayCycle,
    onToast,
    onLanternUpdate,
    onAction,
  }) {
    this.worldBuilder = worldBuilder;
    this.foliage = foliage;
    this.player = player;
    this.cat = cat;
    this.koiSchool = koiSchool;
    this.audio = audio;
    this.puzzleManager = puzzleManager;
    this.dayCycle = dayCycle;
    this.onToast = onToast;
    this.onLanternUpdate = onLanternUpdate;
    this.onAction = onAction;

    this.emaIndex = 0;
    this.spots = this._buildSpots();
  }

  _buildSpots() {
    const spots = [];

    // 1. Grand Bonsho Bell
    spots.push({
      id: 'bonsho-bell',
      getPos: () => ({ x: 0.0, z: -39.2 }),
      radius: 3.0,
      getLabel: () => 'E · Bonshō Bell',
      trigger: () => {
        const unsealed = this.puzzleManager.tryRingBonsho();
        if (unsealed) {
          this.foliage.triggerPetalStorm();
        }
      },
    });

    // 2. Puzzle 1: Movable Iwakura Zen Stone
    spots.push({
      id: 'push-zen-stone',
      getPos: () => getPushStonePosition(),
      radius: 2.35,
      getLabel: () => (this.puzzleManager.stonePlaced ? null : 'E · Push'),
      trigger: () => {
        const ps = getPushStonePosition();
        this.player.triggerPush(ps);
        this.puzzleManager.pushZenStone(this.player.position);
      },
    });

    // 3. Puzzle 1 part B: Shishi-odoshi Bamboo Fountain
    spots.push({
      id: 'shishi-odoshi',
      getPos: () => ({ x: -18.6, z: -1.2 }),
      radius: 2.5,
      getLabel: () => (this.puzzleManager.sealWater ? null : 'E · Bamboo Fountain'),
      trigger: () => {
        this.puzzleManager.onShishiActivated();
      },
    });

    // 4. Puzzle 2: Bamboo Central Lantern & 4 Rotatable Jizos
    spots.push({
      id: 'bamboo-center-lantern',
      getPos: () => ({ x: BAMBOO_PUZZLE_CENTER.x, z: BAMBOO_PUZZLE_CENTER.z }),
      radius: 2.35,
      getLabel: () => (this.puzzleManager.bambooCenterLit ? null : 'E · Forest Lantern'),
      trigger: () => {
        this.puzzleManager.lightBambooCenterLantern();
      },
    });

    PUZZLE_JIZO_SPOTS.forEach((j, idx) => {
      spots.push({
        id: `puzzle-jizo-${j.id}`,
        getPos: () => ({ x: j.x, z: j.z }),
        radius: 2.15,
        getLabel: () => (this.puzzleManager.sealBamboo ? null : 'E · Turn Jizō'),
        trigger: () => {
          this.puzzleManager.rotateJizo(idx);
        },
      });
    });

    // 5. Puzzle 3: Three Time-of-Day Braziers
    BRAZIER_SPOTS.forEach((b) => {
      spots.push({
        id: `brazier-${b.id}`,
        getPos: () => ({ x: b.x, z: b.z }),
        radius: 2.3,
        getLabel: () => (this.puzzleManager.braziersLit[b.id] ? null : `E · ${b.label}`),
        trigger: () => {
          const curTime = this.dayCycle.getCurrentPreset().id;
          this.puzzleManager.tryLightBrazier(b.id, curTime);
        },
      });
    });

    // 6. Three Koi Feeding Spots
    spots.push({
      id: 'feed-koi-arch',
      getPos: () => ({ x: -14.1, z: 19.5 }),
      radius: 2.8,
      getLabel: () => 'E · Feed Koi',
      trigger: (elapsed) => {
        this.koiSchool.feedKoi(-9.5, 16.5, elapsed);
        this.cat.notifyKoiFed?.(-9.5, 16.5);
        this.audio.playKoiSplash();
      },
    });

    spots.push({
      id: 'feed-koi-pier',
      getPos: () => ({ x: 11.6, z: 22.8 }),
      radius: 2.5,
      getLabel: () => 'E · Feed Koi',
      trigger: (elapsed) => {
        this.koiSchool.feedKoi(7.8, 19.8, elapsed);
        this.cat.notifyKoiFed?.(7.8, 19.8);
        this.audio.playKoiSplash();
      },
    });

    spots.push({
      id: 'feed-koi-zigzag',
      getPos: () => ({ x: 11.4, z: 13.8 }),
      radius: 2.6,
      getLabel: () => 'E · Feed Koi',
      trigger: (elapsed) => {
        this.koiSchool.feedKoi(7.5, 14.2, elapsed);
        this.cat.notifyKoiFed?.(7.5, 14.2);
        this.audio.playKoiSplash();
      },
    });

    // 7. Ema Prayer Pavilion
    spots.push({
      id: 'ema-pavilion',
      getPos: () => ({ x: -11.5, z: -14.0 }),
      radius: 2.6,
      getLabel: () => 'E · Hang Ema',
      trigger: () => {
        this.worldBuilder.addEmaPlaque();
        this.audio.playEmaWish();
        const wish = EMA_WISHES[this.emaIndex % EMA_WISHES.length];
        this.emaIndex++;
        this.onToast?.(`“${wish}”`);
      },
    });

    // 8. Four Scenic Sitting Spots
    spots.push({
      id: 'sit-south-balcony',
      getPos: () => ({ x: -1.5, z: 38.4 }),
      radius: 2.1,
      getLabel: () => (this.player.isSitting ? 'WASD · Stand' : 'E · Rest'),
      trigger: () => {
        if (this.player.isSitting) {
          this.player.standUp();
        } else {
          this.player.sitAt(-1.5, 0.34, 38.95, 0.0);
        }
      },
    });

    spots.push({
      id: 'sit-engawa',
      getPos: () => ({ x: -23.9, z: 2.1 }),
      radius: 2.1,
      getLabel: () => (this.player.isSitting ? 'WASD · Stand' : 'E · Rest'),
      trigger: () => {
        if (this.player.isSitting) {
          this.player.standUp();
        } else {
          this.player.sitAt(-23.9, 0.92, 2.1, Math.PI * 0.5);
        }
      },
    });

    spots.push({
      id: 'sit-ema-bench',
      getPos: () => ({ x: -14.2, z: -9.5 }),
      radius: 2.1,
      getLabel: () => (this.player.isSitting ? 'WASD · Stand' : 'E · Rest'),
      trigger: () => {
        if (this.player.isSitting) {
          this.player.standUp();
        } else {
          this.player.sitAt(-14.2, 3.1, -10.05, 0.2);
        }
      },
    });

    spots.push({
      id: 'sit-bamboo-cliff',
      getPos: () => ({ x: -35.5, z: -19.0 }),
      radius: 2.1,
      getLabel: () => (this.player.isSitting ? 'WASD · Stand' : 'E · Rest'),
      trigger: () => {
        if (this.player.isSitting) {
          this.player.standUp();
        } else {
          this.player.sitAt(-35.5, 0.85, -19.55, 0.75);
        }
      },
    });

    // 9. 10 Stone Lanterns (Tōrō)
    this.worldBuilder.lanterns.forEach((l) => {
      spots.push({
        id: `lantern-${l.index}`,
        getPos: () => ({ x: l.x, z: l.z }),
        radius: 2.1,
        getLabel: () => 'E · Lantern',
        trigger: () => {
          const lit = this.worldBuilder.toggleLantern(l.index);
          this.audio.playLanternChime(lit);
          const count = this.worldBuilder.getLitLanternCount();
          if (this.onLanternUpdate) this.onLanternUpdate(count, this.worldBuilder.lanterns.length);
        },
      });
    });

    return spots;
  }

  getNearestPrompt() {
    const px = this.player.position.x;
    const pz = this.player.position.z;
    const py = this.player.position.y;

    let bestSpot = null;
    let bestLabel = null;
    let bestDist = Infinity;

    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i];
      const label = s.getLabel();
      if (!label) continue;
      const pos = s.getPos();
      const d = Math.hypot(pos.x - px, pos.z - pz);
      if (d <= s.radius && d < bestDist) {
        bestDist = d;
        bestSpot = s;
        bestLabel = label;
      }
    }

    const catDist = Math.hypot(this.cat.position.x - px, this.cat.position.z - pz);
    const canPetCat = catDist <= 2.8 && Math.abs(this.cat.position.y - py) < 1.3;

    if (bestSpot) {
      return { spot: bestSpot, label: bestLabel, canPetCat };
    }

    if (canPetCat) {
      return { spot: null, label: 'F · Mochi', canPetCat: true };
    }

    return null;
  }

  interactPrimary(elapsed) {
    const nearest = this.getNearestPrompt();
    if (!nearest) return false;
    if (nearest.spot) {
      nearest.spot.trigger(elapsed);
      this.onAction?.();
      return true;
    }
    if (nearest.canPetCat) return this.petCat();
    return false;
  }

  petCat() {
    const d = Math.hypot(
      this.cat.position.x - this.player.position.x,
      this.cat.position.z - this.player.position.z
    );
    if (d <= 3.2) {
      this.player.triggerPet(this.cat.position);
      this.cat.pet(this.player.position);
      this.audio.playCatMeow();
      this.onAction?.();
      return true;
    }
    this.cat.callToPlayer?.(this.player.position);
    this.audio.playCatMeow();
    this.onAction?.();
    return true;
  }
}

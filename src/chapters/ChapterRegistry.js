import * as THREE from 'three';
import * as TerrainData from '../world/TerrainData.js';
import { WorldBuilder } from '../world/WorldBuilder.js';
import { FoliageAndAtmosphere } from '../world/FoliageAndAtmosphere.js';
import { KoiSchool } from '../entities/KoiSchool.js';
import { PuzzleManager } from '../systems/PuzzleManager.js';
import { Interactions } from '../systems/Interactions.js';
import { disposeObject3D } from '../world/WorldKit.js';
import { createChapter2 } from './levels/chapter2Onsen.js';
import { createChapter3 } from './levels/chapter3Station.js';
import { createChapter4 } from './levels/chapter4Windmills.js';
import { createChapter5 } from './levels/chapter5Forest.js';
import { createChapter6 } from './levels/chapter6PaperTown.js';
import { createChapter7 } from './levels/chapter7Comet.js';

function createChapter1(ctx) {
  const { scene, audio, player, cat, dayCycle, onToast, onStateChange, onChapterComplete, onAction } = ctx;

  TerrainData.setMoonBridgeActive(false);
  TerrainData.setPushStonePosition(TerrainData.PUSH_STONE_INITIAL.x, TerrainData.PUSH_STONE_INITIAL.z);

  const worldBuilder = new WorldBuilder(scene);
  const foliage = new FoliageAndAtmosphere(scene);
  const koiSchool = new KoiSchool(scene, worldBuilder);

  const puzzleManager = new PuzzleManager({
    worldBuilder,
    audio,
    onToast,
    onStateChange,
    onChapterComplete,
  });

  const interactions = new Interactions({
    worldBuilder,
    foliage,
    player,
    cat,
    koiSchool,
    audio,
    puzzleManager,
    dayCycle,
    onToast,
    onAction,
  });

  worldBuilder.onShishiKnock = (vol) => {
    audio.playShishiKnock(vol);
  };

  return {
    terrain: TerrainData,
    worldBuilder,
    foliage,
    koiSchool,
    puzzleManager,
    interactions,
    spawnPoint: TerrainData.SPAWN_POINT,
    catSpawnPoint: { x: TerrainData.CAT_SPAWN_POINT.x, z: TerrainData.CAT_SPAWN_POINT.z, yaw: Math.PI },
    titleFocusPos: new THREE.Vector3(-4, 2, -3),
    biomeProfile: 'lake',
    onTimeChanged(timeId) {
      const isNight = timeId === 'crepusculo';
      TerrainData.setMoonBridgeActive(isNight);
      worldBuilder.setMoonBridgeVisual(isNight);
    },
    update(dt, elapsed, focusPos) {
      koiSchool.update(dt, elapsed);
      worldBuilder.update(dt, elapsed, focusPos);
      foliage.update(dt, elapsed);
    },
    dispose() {
      const extraLights = [];
      if (worldBuilder.bambooCenterLight) extraLights.push(worldBuilder.bambooCenterLight);
      worldBuilder.braziers?.forEach((b) => { if (b.light) extraLights.push(b.light); });
      worldBuilder.sealObelisks?.forEach((o) => { if (o.light) extraLights.push(o.light); });
      worldBuilder.lanterns?.forEach((l) => { if (l.light) extraLights.push(l.light); });
      worldBuilder.flyingOrbs?.forEach((fo) => {
        scene.remove(fo.mesh);
        fo.mesh.geometry.dispose();
        fo.mesh.material.dispose();
      });
      worldBuilder.pondSDF?.dispose?.();
      worldBuilder.bellFx?.dispose?.();

      disposeObject3D(worldBuilder.group, scene, extraLights);
      disposeObject3D(foliage.group, scene);
      disposeObject3D(koiSchool.group, scene);
    },
  };
}

const FACTORIES = {
  1: createChapter1,
  2: createChapter2,
  3: createChapter3,
  4: createChapter4,
  5: createChapter5,
  6: createChapter6,
  7: createChapter7,
};

export function loadChapterRuntime(chapterId, ctx) {
  const fn = FACTORIES[chapterId] || createChapter1;
  return fn(ctx);
}

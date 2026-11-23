import * as THREE from 'three';
import { CHAPTERS } from './chapters/chaptersCatalog.js';
import { loadChapterRuntime } from './chapters/ChapterRegistry.js';
import { setActiveTerrain, getRegionInfoAt, canStandAt, findSafeSpot } from './world/ActiveTerrain.js';
import { PixelRenderer } from './engine/PixelRenderer.js';
import { globalToonUniforms } from './engine/ToonMaterials.js';
import { Player } from './entities/Player.js';
import { CatCompanion } from './entities/CatCompanion.js';
import { DayCycle } from './systems/DayCycle.js';
import { TutorialSystem } from './systems/TutorialSystem.js';
import { HintSystem } from './systems/HintSystem.js';
import { IntroCinematic } from './systems/IntroCinematic.js';
import { EndingCinematic } from './systems/EndingCinematic.js';
import { ZenAudio } from './audio/ZenAudio.js';

const root = document.getElementById('game-root');
const scene = new THREE.Scene();

const pixelRenderer = new PixelRenderer(root);
const player = new Player(scene);
const cat = new CatCompanion(scene);
const dayCycle = new DayCycle(scene, { shojiMaterials: [], chochinMaterials: [], waterMaterials: [], waterfallMaterials: [] }, null, pixelRenderer);
const audio = new ZenAudio();
player.lookTarget = cat.position;

// ---------- Small persisted preferences ----------
const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(`kumo.${key}`);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`kumo.${key}`, JSON.stringify(value));
    } catch {
      // Storage unavailable: preferences just last for this session
    }
  },
};

// ---------- DOM references ----------
const $ = (id) => document.getElementById(id);
const hudEl = $('hud');
const titleScreen = $('title-screen');
const menuList = $('menu-list');
const btnStartLabel = $('btn-start-label');
const btnReplayIntro = $('btn-replay-intro');
const chapterListEl = $('chapter-list');
const chapterDetailEl = $('chapter-detail');
const panels = {
  chapters: $('panel-chapters'),
  settings: $('panel-settings'),
  controls: $('panel-controls'),
};
const qualityButtons = document.querySelectorAll('[data-quality]');
const cameraButtons = document.querySelectorAll('[data-camera]');
const volSlider = $('vol-slider');
const volValue = $('vol-value');
const btnReplayTutorial = $('btn-replay-tutorial');

const cinemaOverlay = $('cinema-overlay');
const cinemaFade = $('cinema-fade');
const cinemaTitle = $('cinema-title');
const cinemaSubtitles = $('cinema-subtitles');
const cinemaCaption = $('cinema-caption');
const btnSkipIntro = $('btn-skip-intro');

const sealEls = [$('seal-0'), $('seal-1'), $('seal-2')];
const hudChapterRoman = $('hud-chapter-roman');
const hudChapterKanji = $('hud-chapter-kanji');
const regionBannerEl = $('region-banner');
const hudRegionJp = $('hud-region-jp');
const hudRegionEn = $('hud-region-en');
const skyButtons = document.querySelectorAll('.sky-btn');
const btnHint = $('btn-hint');
const btnMenu = $('btn-menu');
const promptPill = $('prompt-pill');
const promptKey = $('prompt-key');
const promptLabel = $('prompt-label');
const toastBox = $('toast-box');
const sealBanner = $('seal-banner');
const sealBannerKanji = $('seal-banner-kanji');
const sealBannerText = $('seal-banner-text');

const finaleOverlay = $('finale-overlay');
const finaleKicker = $('finale-kicker');
const finaleTitle = $('finale-title');
const finaleText = $('finale-text');
const finaleStats = $('finale-stats');
const btnFinaleNext = $('btn-finale-next');
const btnFinaleExplore = $('btn-finale-explore');
const btnFinaleMenu = $('btn-finale-menu');

let toastTimer = null;
function showToast(msg, durationMs = 4600) {
  if (!msg) return;
  toastBox.textContent = msg;
  toastBox.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastBox.classList.add('hidden');
  }, durationMs);
}

let sealBannerTimer = null;
function showSealBanner(seal) {
  sealBannerKanji.textContent = seal.kanji;
  sealBannerText.textContent = `${seal.name} awakened`;
  sealBanner.classList.add('hidden');
  void sealBanner.offsetWidth; // restart the stamp animation
  sealBanner.classList.remove('hidden');
  if (sealBannerTimer) clearTimeout(sealBannerTimer);
  sealBannerTimer = setTimeout(() => sealBanner.classList.add('hidden'), 3200);
}

let elapsed = 0;
let isPlaying = false;
let isIntroPlaying = false;
let isEndingPlaying = false;
let hasWatchedIntro = store.get('introSeen', false);
let currentChapterId = 1;
let activeChapter = null;
let prevSeals = [false, false, false];
const startedChapters = new Set();
const completedChapters = new Set(store.get('completed', []));

/** Where the journey continues: the first chapter whose bell has not rung yet. */
function frontierChapterId() {
  const next = CHAPTERS.find((c) => !completedChapters.has(c.id));
  return next ? next.id : 1;
}

/** The story opens one chapter at a time, strictly in order. */
function isChapterUnlocked(id) {
  return completedChapters.size >= CHAPTERS.length || id <= frontierChapterId();
}

// ---------- Projection helper (tutorial marker) ----------
const _proj = new THREE.Vector3();
function projectToScreen(p) {
  _proj.set(p.x, p.y, p.z).project(pixelRenderer.getActiveCamera());
  return {
    x: (_proj.x * 0.5 + 0.5) * window.innerWidth,
    y: (-_proj.y * 0.5 + 0.5) * window.innerHeight,
    inFront: _proj.z > -1 && _proj.z < 1,
  };
}

const tutorial = new TutorialSystem({
  els: {
    root: $('tutorial'),
    keys: $('tut-keys'),
    title: $('tut-title'),
    sub: $('tut-sub'),
    marker: $('tut-marker'),
  },
  project: projectToScreen,
});

const hintSystem = new HintSystem({
  puzzleManager: { progressVersion: 0, chapterComplete: false, getPuzzleZoneForPos: () => null, getStatusSnapshot: () => ({}) },
  worldBuilder: { triggerHintPulse: () => {} },
  onHint: (msg) => showToast(msg, 6200),
});

/**
 * Moves Hana (and Mochi when needed) to the nearest roomy spot when the floor under
 * them vanished (time-gated bridges in Chapters I, V and VII) or they ended inside a
 * collider. Returns true when a move happened.
 */
function rescueIfStranded() {
  if (!activeChapter || player.isSitting) return false;
  const p = player.position;
  if (canStandAt(p.x, p.z, 0.3)) return false;
  const spot = findSafeSpot(p.x, p.z, { refY: p.y });
  if (!spot) return false;
  player.resetTo({ x: spot.x, z: spot.z, yaw: player.yaw });
  const c = cat.position;
  if (!canStandAt(c.x, c.z, 0.25) || Math.hypot(c.x - spot.x, c.z - spot.z) > 12) {
    const catSpot = findSafeSpot(spot.x - 1.2, spot.z + 0.6, { refY: player.position.y, radius: 0.35 });
    if (catSpot) cat.resetTo({ x: catSpot.x, z: catSpot.z, yaw: cat.yaw });
  }
  return true;
}

function syncTimeVisuals(preset, notifyTutorial = false) {
  audio.setTimeOfDay(preset.id);
  activeChapter?.onTimeChanged?.(preset.id);
  if (isPlaying) rescueIfStranded();
  skyButtons.forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.timeIdx) === dayCycle.presetIndex);
  });
  if (notifyTutorial && isPlaying) tutorial.notifyTimeShift(dayCycle.presetIndex);
}

const introCinematic = new IntroCinematic({
  pixelRenderer,
  dayCycle,
  audio,
  cat,
  player,
  onTimeSync: (preset) => syncTimeVisuals(preset, false),
  onSubtitle: (caption) => {
    if (caption) cinemaCaption.textContent = caption;
    cinemaSubtitles.classList.toggle('empty', !caption);
  },
  onTitle: (show) => cinemaTitle.classList.toggle('show', show),
  onFade: (opacity) => {
    cinemaFade.style.opacity = String(opacity);
  },
  onStart: () => {
    isIntroPlaying = true;
    isPlaying = false;
    closePanels();
    titleScreen.classList.add('dismissed');
    hudEl.classList.add('hidden');
    cinemaOverlay.classList.remove('hidden', 'ending');
  },
  onComplete: () => {
    isIntroPlaying = false;
    hasWatchedIntro = true;
    store.set('introSeen', true);
    // Letterbox bars slide away over the live gameplay view
    cinemaOverlay.classList.add('ending');
    setTimeout(() => {
      if (!isIntroPlaying) cinemaOverlay.classList.add('hidden');
    }, 1150);
    enterGameplay();
  },
});

const endingCinematic = new EndingCinematic({
  pixelRenderer,
  dayCycle,
  audio,
  cat,
  player,
  scene,
  chapters: CHAPTERS,
  els: { root: $('ending'), constellation: $('end-constellation'), credits: $('end-credits') },
  onTimeSync: (preset) => syncTimeVisuals(preset, false),
  onSubtitle: (caption) => {
    if (caption) cinemaCaption.textContent = caption;
    cinemaSubtitles.classList.toggle('empty', !caption);
  },
  onFade: (opacity) => {
    cinemaFade.style.opacity = String(opacity);
  },
  onStart: () => {
    isEndingPlaying = true;
    isPlaying = false;
    releaseInput();
    closePanels();
    hudEl.classList.add('hidden');
    finaleOverlay.classList.add('hidden');
    cinemaOverlay.classList.remove('hidden', 'ending');
  },
  onComplete: returnToTitleAfterEnding,
});

/** After the credits the garden starts over at Chapter I, with every path open. */
function returnToTitleAfterEnding() {
  isEndingPlaying = false;
  cinemaOverlay.classList.add('hidden');
  cinemaFade.style.opacity = '0';
  startedChapters.clear();
  loadChapter(frontierChapterId());
  pixelRenderer.setCinematicMode(false);
  pixelRenderer.setTitleOrbit(true);
  titleScreen.classList.remove('paused', 'dismissed');
  hudEl.classList.add('hidden');
  closePanels();
  refreshMenuLabels();
  selectMenuItem(0);
}

function playEnding() {
  const stage = activeChapter?.endingStage;
  if (!stage) return false;
  audio.init();
  endingCinematic.start({ ...stage, canStandAt: (x, z) => canStandAt(x, z, 0.34) });
  return true;
}

// ---------- Menu ----------
let menuIndex = 0;
let openPanelName = null;
let chapterIndex = 0;

function menuItems() {
  return [...menuList.querySelectorAll('.menu-item')].filter((el) => !el.classList.contains('hidden'));
}

function selectMenuItem(i) {
  const items = menuItems();
  menuIndex = (i + items.length) % items.length;
  items.forEach((el, idx) => el.classList.toggle('selected', idx === menuIndex));
}

function closePanels() {
  openPanelName = null;
  Object.values(panels).forEach((p) => p.classList.remove('open'));
  titleScreen.classList.remove('panel-open');
}

function openPanel(name) {
  if (openPanelName === name) {
    closePanels();
    return;
  }
  openPanelName = name;
  Object.entries(panels).forEach(([key, p]) => p.classList.toggle('open', key === name));
  titleScreen.classList.add('panel-open');
  if (name === 'chapters') {
    chapterIndex = Math.max(0, CHAPTERS.findIndex((c) => c.id === currentChapterId));
    renderChapterCatalog();
  }
}

function runMenuAction(action) {
  audio.init();
  switch (action) {
    case 'start':
      closePanels();
      handleStartRequest();
      break;
    case 'intro':
      closePanels();
      playIntro();
      break;
    default:
      openPanel(action);
  }
}

menuList.addEventListener('click', (e) => {
  const item = e.target.closest('.menu-item');
  if (!item) return;
  item.blur();
  selectMenuItem(menuItems().indexOf(item));
  runMenuAction(item.dataset.action);
});

menuList.addEventListener('pointerover', (e) => {
  const item = e.target.closest('.menu-item');
  if (item) selectMenuItem(menuItems().indexOf(item));
});

function isMenuOpen() {
  return !titleScreen.classList.contains('dismissed');
}

function refreshMenuLabels() {
  const resumable = startedChapters.has(currentChapterId);
  btnStartLabel.textContent = resumable ? 'Resume' : 'Begin';
  btnReplayIntro.classList.toggle('hidden', !hasWatchedIntro);
}

function sealMarks(chId) {
  const spec = CHAPTERS.find((c) => c.id === chId);
  const done = completedChapters.has(chId);
  return spec.seals.map((s) => `<span class="ch-seal${done ? ' done' : ''}" title="${s.name}">${s.kanji}</span>`).join('');
}

function renderChapterDetail(spec) {
  chapterDetailEl.innerHTML = '';
  if (!isChapterUnlocked(spec.id)) {
    const sealed = document.createElement('p');
    const prev = CHAPTERS.find((c) => c.id === spec.id - 1);
    sealed.textContent = `This path is still sealed. Ring the bell of Chapter ${prev.roman} to open it.`;
    chapterDetailEl.append(sealed);
    return;
  }
  const biome = document.createElement('div');
  biome.className = 'cd-biome';
  biome.textContent = spec.biome;
  const story = document.createElement('p');
  story.textContent = spec.story;
  const go = document.createElement('div');
  go.className = 'cd-go';
  go.innerHTML = `<kbd class="kc kc-sm">Enter</kbd> ${spec.id === currentChapterId && startedChapters.has(spec.id) ? 'Resume' : 'Travel here'}`;
  chapterDetailEl.append(biome, story, go);
}

function renderChapterCatalog() {
  chapterListEl.innerHTML = '';
  CHAPTERS.forEach((ch, idx) => {
    const row = document.createElement('button');
    const locked = !isChapterUnlocked(ch.id);
    row.className = `chapter-row${idx === chapterIndex ? ' selected' : ''}${locked ? ' locked' : ''}`;
    row.type = 'button';
    row.setAttribute('aria-disabled', String(locked));
    const tag = ch.id === currentChapterId ? '<span class="ch-current">Here</span>' : '';
    row.innerHTML = `
      <span class="ch-roman">${ch.roman}</span>
      <span class="ch-names"><span class="ch-title"></span><span class="ch-kanji">${locked ? '封' : ch.kanji}</span></span>
      <span class="ch-seals">${locked ? '' : tag + sealMarks(ch.id)}</span>`;
    row.querySelector('.ch-title').textContent = locked ? 'Sealed' : ch.title;
    row.addEventListener('pointerover', () => selectChapter(idx));
    row.addEventListener('click', () => {
      row.blur();
      travelToChapter(ch.id);
    });
    chapterListEl.appendChild(row);
  });
  renderChapterDetail(CHAPTERS[chapterIndex]);
}

function selectChapter(idx) {
  chapterIndex = (idx + CHAPTERS.length) % CHAPTERS.length;
  [...chapterListEl.children].forEach((row, i) => row.classList.toggle('selected', i === chapterIndex));
  chapterListEl.children[chapterIndex]?.scrollIntoView({ block: 'nearest' });
  renderChapterDetail(CHAPTERS[chapterIndex]);
}

function travelToChapter(id) {
  if (!isChapterUnlocked(id)) {
    const row = chapterListEl.children[CHAPTERS.findIndex((c) => c.id === id)];
    row?.classList.remove('nope');
    void row?.offsetWidth;
    row?.classList.add('nope');
    return;
  }
  closePanels();
  if (id !== currentChapterId) loadChapter(id);
  handleStartRequest();
}

// ---------- Settings ----------
function applyQuality(q) {
  qualityButtons.forEach((b) => b.classList.toggle('active', b.dataset.quality === q));
  pixelRenderer.setQualityMode(q);
  store.set('quality', q);
}

function applyCameraMode(mode) {
  if (pixelRenderer.mode !== mode) pixelRenderer.toggleMode();
  cameraButtons.forEach((b) => b.classList.toggle('active', b.dataset.camera === pixelRenderer.mode));
  store.set('camera', pixelRenderer.mode);
}

function applyVolume(pct, initAudio) {
  volSlider.value = String(pct);
  volValue.textContent = `${pct}%`;
  if (initAudio) audio.init();
  audio.setMasterVolume(pct / 100);
  store.set('volume', pct);
}

qualityButtons.forEach((btn) =>
  btn.addEventListener('click', () => {
    btn.blur();
    applyQuality(btn.dataset.quality);
  })
);
cameraButtons.forEach((btn) =>
  btn.addEventListener('click', () => {
    btn.blur();
    applyCameraMode(btn.dataset.camera);
  })
);
volSlider.addEventListener('input', () => applyVolume(Number(volSlider.value), true));
btnReplayTutorial.addEventListener('click', () => {
  btnReplayTutorial.blur();
  TutorialSystem.reset();
  tutorialOffered = false;
  btnReplayTutorial.textContent = 'Will replay in Chapter I';
  btnReplayTutorial.classList.add('active');
});

// ---------- HUD ----------
let currentRegionId = '';
let regionFadeTimer = null;
function updateRegionHUD(x, z, forceShow = false) {
  const info = getRegionInfoAt(x, z);
  if (forceShow || info.id !== currentRegionId) {
    currentRegionId = info.id;
    hudRegionJp.textContent = info.jp;
    hudRegionEn.textContent = info.en;
    regionBannerEl.classList.remove('faded');
    if (regionFadeTimer) clearTimeout(regionFadeTimer);
    regionFadeTimer = setTimeout(() => {
      regionBannerEl.classList.add('faded');
    }, 3200);
  }
}

let lastPromptText = '';
function updatePrompt(nearest) {
  if (!nearest) {
    promptPill.classList.add('hidden');
    lastPromptText = '';
    return;
  }
  if (nearest.label !== lastPromptText) {
    lastPromptText = nearest.label;
    // Labels are written as "E · Feed Koi"
    const m = /^([A-Z]+)\s*·\s*(.+)$/.exec(nearest.label);
    promptKey.textContent = m ? m[1] : 'E';
    promptLabel.textContent = m ? m[2] : nearest.label;
  }
  promptPill.classList.remove('hidden');
}

// ---------- Chapters ----------
function loadChapter(chapterId) {
  const spec = CHAPTERS.find((c) => c.id === chapterId) || CHAPTERS[0];
  currentChapterId = spec.id;

  if (activeChapter) {
    activeChapter.dispose();
    activeChapter = null;
  }
  if (spec.id !== 1) tutorial.stop();

  prevSeals = [false, false, false];
  activeChapter = loadChapterRuntime(spec.id, {
    scene,
    audio,
    player,
    cat,
    dayCycle,
    onToast: showToast,
    onStateChange: (snap) => {
      const seals = snap?.seals || [snap?.sealWater, snap?.sealBamboo, snap?.sealTime];
      sealEls.forEach((el, idx) => {
        const on = Boolean(seals[idx]);
        if (on && !prevSeals[idx] && isPlaying) {
          el.classList.add('just-awakened');
          setTimeout(() => el.classList.remove('just-awakened'), 800);
          showSealBanner(spec.seals[idx]);
        }
        prevSeals[idx] = on;
        el.classList.toggle('awakened', on);
      });
    },
    onChapterComplete: () => {
      completedChapters.add(spec.id);
      store.set('completed', [...completedChapters]);
      // The last bell closes the story: the ending film replaces the chapter card
      if (spec.id === CHAPTERS.length && playEnding()) return;
      const lit = activeChapter.worldBuilder.getLitLanternCount?.() ?? 0;
      const totalL = activeChapter.worldBuilder.lanterns?.length ?? 0;
      finaleKicker.textContent = `第${spec.roman}章 完 · Chapter ${spec.roman} complete`;
      finaleTitle.textContent = spec.finaleTitle;
      finaleText.textContent = spec.finaleText;
      finaleStats.textContent = `3 / 3 seals awakened${totalL > 0 ? `  ·  ${lit} / ${totalL} lanterns lit` : ''}`;
      btnFinaleNext.classList.toggle('hidden', spec.id >= CHAPTERS.length);
      // Let the seal stamp land before the overlay rises
      setTimeout(() => finaleOverlay.classList.remove('hidden'), 1600);
    },
    onAction: () => {},
  });

  setActiveTerrain(activeChapter.terrain);
  player.resetTo(activeChapter.spawnPoint);
  cat.resetTo(activeChapter.catSpawnPoint);

  spec.seals.forEach((s, idx) => {
    sealEls[idx].textContent = s.kanji;
    sealEls[idx].title = s.name;
    sealEls[idx].classList.remove('awakened', 'just-awakened');
  });
  hudChapterRoman.textContent = spec.roman;
  hudChapterKanji.textContent = spec.kanji;

  dayCycle.setTargets(activeChapter.worldBuilder, activeChapter.foliage);
  syncTimeVisuals(dayCycle.setPreset(0), false);

  audio.setBiomeProfile(activeChapter.biomeProfile);
  hintSystem.rebind(activeChapter.puzzleManager, activeChapter.worldBuilder);

  currentRegionId = '';
  toastBox.classList.add('hidden');
  sealBanner.classList.add('hidden');
  refreshMenuLabels();
}

player.onStep = (x, z, surface) => {
  audio.playFootstep(surface);
  if (surface === 'gravel') {
    activeChapter?.worldBuilder.addGravelFootprint?.(x, z);
  } else if (surface === 'shallow_water') {
    activeChapter?.worldBuilder.addWaterRipple?.(x, z, elapsed, 0.72);
  }
};

player.onJump = () => {
  audio.playJump();
  cat.triggerCompanionHop();
};

player.onLand = (surface) => {
  audio.playLand(surface);
  if (surface === 'shallow_water') {
    activeChapter?.worldBuilder.addWaterRipple?.(player.position.x, player.position.z, elapsed, 1.0);
  }
};

// ---------- Flow ----------
let tutorialOffered = false;

function openMenu() {
  if (isIntroPlaying || isEndingPlaying) return;
  const wasPlaying = isPlaying;
  isPlaying = false;
  releaseInput();
  // From gameplay the menu is a pause screen over the frozen view
  titleScreen.classList.toggle('paused', wasPlaying || startedChapters.size > 0);
  titleScreen.classList.remove('dismissed');
  hudEl.classList.add('hidden');
  closePanels();
  refreshMenuLabels();
  selectMenuItem(0);
}

function enterGameplay() {
  audio.init();
  isPlaying = true;
  startedChapters.add(currentChapterId);
  pixelRenderer.setTitleOrbit(false);
  closePanels();
  titleScreen.classList.add('dismissed');
  hudEl.classList.remove('hidden');
  updateRegionHUD(player.position.x, player.position.z, true);

  if (currentChapterId === 1 && !tutorialOffered && !tutorial.active) {
    tutorialOffered = true;
    tutorial.start({
      playerPos: player.position,
      lanterns: activeChapter.worldBuilder.lanterns,
      getLitCount: () => activeChapter?.worldBuilder.getLitLanternCount?.() ?? 0,
      getPresetIndex: () => dayCycle.presetIndex,
    });
  }
}

function playIntro() {
  audio.init();
  if (currentChapterId !== 1) loadChapter(1);
  else player.resetTo(activeChapter.spawnPoint);
  introCinematic.start();
}

function handleStartRequest() {
  if (currentChapterId === 1 && !hasWatchedIntro) {
    playIntro();
  } else {
    enterGameplay();
  }
}

btnSkipIntro.addEventListener('click', () => {
  btnSkipIntro.blur();
  if (isEndingPlaying) endingCinematic.skip();
  else introCinematic.skip();
});

btnMenu.addEventListener('click', () => {
  btnMenu.blur();
  openMenu();
});

function closeFinale() {
  finaleOverlay.classList.add('hidden');
}

btnFinaleNext.addEventListener('click', () => {
  btnFinaleNext.blur();
  closeFinale();
  loadChapter(Math.min(CHAPTERS.length, currentChapterId + 1));
  enterGameplay();
});

btnFinaleExplore.addEventListener('click', () => {
  btnFinaleExplore.blur();
  closeFinale();
});

btnFinaleMenu.addEventListener('click', () => {
  btnFinaleMenu.blur();
  closeFinale();
  openMenu();
});

skyButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    btn.blur();
    if (!isPlaying) return;
    audio.init();
    syncTimeVisuals(dayCycle.setPreset(Number(btn.dataset.timeIdx)), true);
  });
});

function triggerHint() {
  if (!isPlaying || !activeChapter) return;
  audio.init();
  hintSystem.requestManualHint(player.position);
  const propPos = activeChapter.puzzleManager.getHintTargetPos?.(player.position);
  if (propPos) cat.nudgeToward?.(propPos);
}

btnHint.addEventListener('click', () => {
  btnHint.blur();
  triggerHint();
});

promptPill.addEventListener('click', () => {
  promptPill.blur();
  if (isPlaying && activeChapter) activeChapter.interactions.interactPrimary(elapsed);
});

// ---------- Input ----------
const input = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  run: false,
  rotLeft: false,
  rotRight: false,
};

function releaseInput() {
  pointerDown = false;
  input.forward = input.backward = input.left = input.right = input.run = false;
  input.rotLeft = input.rotRight = false;
}

let pointerDown = false;
function handleCanvasWalkPointer(e) {
  if (!isPlaying || isIntroPlaying || !finaleOverlay.classList.contains('hidden')) return;
  const hit = pixelRenderer.screenToWorldOnPlane(e.clientX, e.clientY, player.position.y);
  if (hit) {
    if (player.isSitting) player.standUp();
    player.setWalkTarget(hit.x, hit.z);
  }
}

pixelRenderer.renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!isPlaying || isIntroPlaying) return;
  audio.init();
  pointerDown = true;
  handleCanvasWalkPointer(e);
});
window.addEventListener('pointermove', (e) => {
  if (pointerDown && isPlaying && !isIntroPlaying) handleCanvasWalkPointer(e);
});
window.addEventListener('pointerup', () => {
  pointerDown = false;
});

window.addEventListener(
  'wheel',
  (e) => {
    if (isPlaying && !isIntroPlaying) pixelRenderer.adjustZoom(e.deltaY * 0.008);
  },
  { passive: true }
);

function handleMenuKey(e) {
  const up = e.code === 'ArrowUp' || e.code === 'KeyW';
  const down = e.code === 'ArrowDown' || e.code === 'KeyS';
  const confirm = e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE';

  if (e.code === 'Escape') {
    if (openPanelName) closePanels();
    else if (startedChapters.has(currentChapterId)) enterGameplay();
    return;
  }
  if (openPanelName === 'chapters') {
    if (up) selectChapter(chapterIndex - 1);
    else if (down) selectChapter(chapterIndex + 1);
    else if (confirm) travelToChapter(CHAPTERS[chapterIndex].id);
    else if (e.code === 'ArrowLeft') closePanels();
    return;
  }
  if (up) selectMenuItem(menuIndex - 1);
  else if (down) selectMenuItem(menuIndex + 1);
  else if (confirm) runMenuAction(menuItems()[menuIndex]?.dataset.action);
  else if (e.code === 'ArrowRight') {
    const action = menuItems()[menuIndex]?.dataset.action;
    if (panels[action]) openPanel(action);
  } else if (e.code === 'ArrowLeft') closePanels();
}

window.addEventListener('keydown', (e) => {
  if (isEndingPlaying) {
    if (!e.repeat && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape')) {
      e.preventDefault();
      endingCinematic.skip();
    }
    return;
  }
  if (isIntroPlaying) {
    if (!e.repeat && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape')) {
      e.preventDefault();
      introCinematic.skip();
    }
    return;
  }

  if (!finaleOverlay.classList.contains('hidden')) {
    if (e.code === 'Escape') closeFinale();
    else if (e.code === 'Enter') (btnFinaleNext.classList.contains('hidden') ? btnFinaleExplore : btnFinaleNext).click();
    return;
  }

  if (isMenuOpen()) {
    if (e.target instanceof HTMLInputElement) return;
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    if (!e.repeat || e.code.startsWith('Arrow')) handleMenuKey(e);
    return;
  }

  if (e.code === 'Escape') {
    if (isPlaying) openMenu();
    return;
  }

  if (!isPlaying || !activeChapter) return;
  audio.init();
  tutorial.onKey(e.code, true);

  switch (e.code) {
    case 'KeyW':
    case 'ArrowUp':
      input.forward = true;
      break;
    case 'KeyS':
    case 'ArrowDown':
      input.backward = true;
      break;
    case 'KeyA':
    case 'ArrowLeft':
      input.left = true;
      break;
    case 'KeyD':
    case 'ArrowRight':
      input.right = true;
      break;
    case 'Space':
      e.preventDefault();
      if (!e.repeat) player.triggerJump();
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      input.run = true;
      break;
    case 'KeyQ':
      input.rotLeft = true;
      break;
    case 'KeyR':
      input.rotRight = true;
      break;
    case 'KeyE':
      if (!e.repeat) activeChapter.interactions.interactPrimary(elapsed);
      break;
    case 'KeyF':
      if (!e.repeat) activeChapter.interactions.petCat();
      break;
    case 'KeyT':
      if (!e.repeat) {
        audio.init();
        syncTimeVisuals(dayCycle.cyclePreset(), true);
      }
      break;
    case 'KeyH':
      if (!e.repeat) triggerHint();
      break;
    case 'KeyC':
      if (!e.repeat) applyCameraMode(pixelRenderer.mode === 'diorama' ? 'panoramic' : 'diorama');
      break;
    case 'KeyM':
      if (!e.repeat) {
        audio.init();
        audio.toggleMute();
      }
      break;
  }
});

window.addEventListener('keyup', (e) => {
  tutorial.onKey(e.code, false);
  switch (e.code) {
    case 'KeyW':
    case 'ArrowUp':
      input.forward = false;
      break;
    case 'KeyS':
    case 'ArrowDown':
      input.backward = false;
      break;
    case 'KeyA':
    case 'ArrowLeft':
      input.left = false;
      break;
    case 'KeyD':
    case 'ArrowRight':
      input.right = false;
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      input.run = false;
      break;
    case 'KeyQ':
      input.rotLeft = false;
      break;
    case 'KeyR':
      input.rotRight = false;
      break;
  }
});

window.addEventListener('blur', releaseInput);

window.addEventListener('resize', () => {
  pixelRenderer.resize(window.innerWidth, window.innerHeight);
});

// ---------- Boot ----------
applyQuality(store.get('quality', 'pixel-fine'));
applyCameraMode(store.get('camera', 'diorama'));
applyVolume(store.get('volume', 65), false);
loadChapter(frontierChapterId());
selectMenuItem(0);

if (import.meta.env.DEV) {
  const devApi = {
    scene,
    player,
    cat,
    dayCycle,
    pixelRenderer,
    input,
    introCinematic,
    tutorial,
    startGame: () => {
      hasWatchedIntro = true;
      enterGameplay();
    },
    loadChapter,
    getActiveChapter: () => activeChapter,
    toonUniforms: globalToonUniforms,
    getState: () => ({ isPlaying, isIntroPlaying, isEndingPlaying }),
    endingCinematic,
    playEnding,
    rescueIfStranded,
  };
  window.__kumo = devApi;
  window.kumoAudit = async (ids) => {
    const { runLevelAudit } = await import('./dev/LevelAudit.js');
    return runLevelAudit(devApi, ids);
  };
}

let lastTime = performance.now();
let strandedTime = 0;
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  elapsed += dt;

  globalToonUniforms.uTime.value = elapsed;
  if (isPlaying && !isIntroPlaying) {
    globalToonUniforms.uPlayerPos.value.copy(player.position);
    globalToonUniforms.uCatPos.value.copy(cat.position);
  } else {
    globalToonUniforms.uPlayerPos.value.set(0, -99, 0);
    globalToonUniforms.uCatPos.value.set(0, -99, 0);
  }

  if (isIntroPlaying) {
    introCinematic.update(dt);
    cat.update(dt, elapsed, player, activeChapter?.koiSchool || null);
  } else if (isEndingPlaying) {
    endingCinematic.update(dt, elapsed);
    cat.update(dt, elapsed, player, activeChapter?.koiSchool || null);
  } else if (isPlaying && activeChapter) {
    if (input.rotLeft) pixelRenderer.rotateYaw(-dt * 1.4);
    if (input.rotRight) pixelRenderer.rotateYaw(dt * 1.4);

    player.update(dt, input, pixelRenderer);
    // Safety net: never leave Hana standing somewhere she cannot walk out of.
    if (player.isGrounded && !player.isSitting && !canStandAt(player.position.x, player.position.z, 0.3)) {
      strandedTime += dt;
      if (strandedTime > 0.4 && rescueIfStranded()) strandedTime = 0;
    } else {
      strandedTime = 0;
    }
    cat.update(dt, elapsed, player, activeChapter.koiSchool || null);
    updateRegionHUD(player.position.x, player.position.z);
    hintSystem.update(dt, player.position);

    const nearest = activeChapter.interactions.getNearestPrompt();
    updatePrompt(nearest);
    tutorial.update(dt, player.position, nearest?.spot?.id);
  }

  const envFocusPos = isIntroPlaying
    ? introCinematic.getFocusPosition()
    : isEndingPlaying
    ? endingCinematic.getFocusPosition()
    : isPlaying || startedChapters.size > 0
    ? player.position
    : activeChapter?.titleFocusPos ?? new THREE.Vector3(0, 2, 0);

  activeChapter?.update?.(dt, elapsed, envFocusPos);
  dayCycle.update(dt, envFocusPos);
  audio.updateAmbience(dt, envFocusPos);

  pixelRenderer.updateCamera(player.position, player.velocity, player.isSitting, dt);
  updateOcclusionWindow(dt);
  pixelRenderer.render(scene);
}

// Dithered window around Hana whenever scenery stands between her and the camera
const _occPoint = new THREE.Vector3();
function updateOcclusionWindow(dt) {
  const cam = pixelRenderer.getActiveCamera();
  const active = isPlaying && !isIntroPlaying && !pixelRenderer.cinematicActive && !pixelRenderer.titleOrbit;
  const u = globalToonUniforms;
  u.uOccStrength.value += ((active ? 1 : 0) - u.uOccStrength.value) * (1 - Math.exp(-dt * 6));
  if (u.uOccStrength.value < 0.001) return;
  _occPoint.copy(player.group.position);
  _occPoint.y += 0.85;
  _occPoint.applyMatrix4(cam.matrixWorldInverse);
  u.uOccCenter.value.copy(_occPoint);
  u.uOccOrtho.value = cam.isOrthographicCamera ? 1 : 0;
}

requestAnimationFrame(animate);

// One-shot foley rendered with earshot (new takes of public-domain recordings).
// name -> number of takes; files live in /audio/sfx/<name>.ogg or <name>_<i>.ogg.
const SFX_BANK = {
  step_stone: 4,
  step_wood: 6,
  step_grass: 6,
  step_gravel: 6,
  step_water: 4,
  land: 3,
  jump: 3,
  cat_meow: 3,
  koi_splash: 3,
  bamboo_knock: 2,
  lever: 1,
  wind_gust: 1,
  koto: 1,
  wind_chime: 1,
  stone_slide: 1,
  stone_rotate: 1,
  water_gate: 1,
  steam_valve: 1,
  temple_bell: 1,
  lantern_flame: 1,
  singing_bowl: 1,
  ema_hang: 1,
};
const BOWL_BASE_HZ = 220; // singing_bowl.ogg is an A3
const KOTO_BASE_HZ = 440; // koto.ogg is an A4
const CHIME_BASE_HZ = 1318.5; // wind_chime.ogg is an E6
const STEP_SAMPLE = {
  stone: 'step_stone',
  wood: 'step_wood',
  gravel: 'step_gravel',
  shallow_water: 'step_water',
};

export class ZenAudio {
  constructor() {
    this.samples = {};
    this._lastTake = {};
    this._stepCount = 0;
    this.ctx = null;
    this.master = null;
    this.masterVolume = 0.65;
    this.isMuted = false;
    this.initialized = false;

    this.loops = {};
    this.purrAudio = null;
    this.owlTimer = 14.0;
    this.chimeTimer = 8.0;
    this.currentTimeId = 'tarde';
    this.biomeProfile = 'lake';
  }

  setBiomeProfile(profile) {
    this.biomeProfile = profile || 'lake';
  }

  init() {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      this._ensureLoopsPlaying();
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.isMuted ? 0 : this.masterVolume;
    this.master.connect(this.ctx.destination);

    // Stream real CC0 field recordings from /audio/ into GainNodes for silky cross-fades
    this._createLoopChannel('wind', '/audio/wind_in_tall_grass.ogg', 0.22);
    this._createLoopChannel('stream', '/audio/mountain_stream.ogg', 0.14);
    this._createLoopChannel('birds', '/audio/evening_birds.ogg', 0.28);
    this._createLoopChannel('night', '/audio/campaign_at_night_4.ogg', 0.0);
    this._createLoopChannel('insects', '/audio/insect_song_4.ogg', 0.0);

    try {
      this.purrAudio = new Audio('/audio/cat_purr.ogg');
      this.purrAudio.volume = 0.45;
    } catch {
      this.purrAudio = null;
    }

    this.initialized = true;
    this._loadSamples();
    this._ensureLoopsPlaying();
  }

  _loadSamples() {
    Object.entries(SFX_BANK).forEach(([name, takes]) => {
      const urls = takes === 1
        ? [`/audio/sfx/${name}.ogg`]
        : Array.from({ length: takes }, (_, i) => `/audio/sfx/${name}_${i + 1}.ogg`);
      Promise.all(urls.map((url) =>
        fetch(url)
          .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(url))))
          .then((data) => this.ctx.decodeAudioData(data))
          .catch(() => null)
      )).then((buffers) => {
        const ok = buffers.filter(Boolean);
        if (ok.length) this.samples[name] = ok;
      });
    });
  }

  // Plays a random take (never the same one twice in a row). Returns false while
  // the bank is still loading so callers can fall back to the synth voice.
  _playSample(name, { gain = 1, rate = 1, jitter = 0, delay = 0 } = {}) {
    if (!this.initialized || !this.ctx || this.isMuted) return true;
    const takes = this.samples[name];
    if (!takes) return false;
    let idx = Math.floor(Math.random() * takes.length);
    if (takes.length > 1 && idx === this._lastTake[name]) idx = (idx + 1) % takes.length;
    this._lastTake[name] = idx;

    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = takes[idx];
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * jitter);
    const g = this.ctx.createGain();
    g.gain.value = gain * (1 + (Math.random() * 2 - 1) * jitter * 1.5);
    src.connect(g).connect(this.master);
    src.start(t0);
    return true;
  }

  _playKoto(freq, gain, delay = 0) {
    return this._playSample('koto', { gain, rate: freq / KOTO_BASE_HZ, delay });
  }

  _playChime(freq, gain, delay = 0) {
    return this._playSample('wind_chime', { gain, rate: freq / CHIME_BASE_HZ, delay });
  }

  _createLoopChannel(key, src, initialGain) {
    try {
      const el = new Audio(src);
      el.loop = true;
      el.preload = 'auto';
      const source = this.ctx.createMediaElementSource(el);
      const gain = this.ctx.createGain();
      gain.gain.value = initialGain;
      source.connect(gain).connect(this.master);
      this.loops[key] = { el, gain, target: initialGain };
    } catch {
      // Safe fallback if browser blocks media element source
    }
  }

  _ensureLoopsPlaying() {
    Object.values(this.loops).forEach((ch) => {
      if (ch.el && ch.el.paused) {
        ch.el.play().catch(() => {});
      }
    });
  }

  setTimeOfDay(timeId) {
    this.currentTimeId = timeId;
  }

  setMasterVolume(vol) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    if (this.master && this.ctx && !this.isMuted) {
      this.master.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.08);
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.isMuted ? 0 : this.masterVolume, this.ctx.currentTime, 0.08);
    }
    return this.isMuted;
  }

  updateAmbience(dt, playerPos) {
    if (!this.initialized || !this.ctx) return;

    const now = this.ctx.currentTime;

    // Spatial distance attenuation for Twin Waterfall & Grand Koi Lake
    const dWaterfall = Math.hypot(playerPos.x - 15.6, playerPos.z - -11.0);
    const dPond = Math.hypot(playerPos.x - 0.0, playerPos.z - 14.5);
    const waterProx = Math.max(
      Math.max(0, 1 - dWaterfall / 26) * 0.48,
      Math.max(0, 1 - dPond / 28) * 0.24
    );
    if (this.loops.stream) {
      this.loops.stream.gain.gain.setTargetAtTime(0.08 + waterProx, now, 0.35);
    }

    // Time-of-day & biome field recording crossfade
    const isNight = this.currentTimeId === 'crepusculo';
    const isGolden = this.currentTimeId === 'dorada';
    const prof = this.biomeProfile;

    const streamBias = prof === 'onsen' ? 0.22 : prof === 'forest' ? 0.14 : prof === 'comet' ? 0.1 : 0.08;
    if (this.loops.stream) {
      this.loops.stream.gain.gain.setTargetAtTime(streamBias + waterProx, now, 0.35);
    }

    if (this.loops.birds) {
      const birdBase = prof === 'windmills' ? 0.18 : prof === 'papertown' ? 0.1 : 0.32;
      const birdTarget = isNight ? 0.0 : isGolden ? birdBase * 0.72 : birdBase;
      this.loops.birds.gain.gain.setTargetAtTime(birdTarget, now, 0.7);
    }
    if (this.loops.night) {
      const nightBoost = prof === 'forest' || prof === 'papertown' || prof === 'comet' ? 0.4 : 0.32;
      this.loops.night.gain.gain.setTargetAtTime(isNight ? nightBoost : isGolden ? 0.07 : 0.0, now, 0.8);
    }
    if (this.loops.insects) {
      const insectBoost = prof === 'forest' ? 0.26 : prof === 'papertown' ? 0.2 : 0.16;
      this.loops.insects.gain.gain.setTargetAtTime(isNight ? insectBoost : 0.0, now, 0.8);
    }
    if (this.loops.wind) {
      const windBoost = prof === 'windmills' ? 0.42 : prof === 'comet' ? 0.32 : playerPos.y > 4.5 ? 0.3 : 0.18;
      this.loops.wind.gain.gain.setTargetAtTime(windBoost, now, 0.5);
    }

    // Rare distant owl call at Night
    if (isNight && !this.isMuted) {
      this.owlTimer -= dt;
      if (this.owlTimer <= 0) {
        this.owlTimer = 18 + Math.random() * 14;
        try {
          const owl = new Audio(Math.random() < 0.5 ? '/audio/tawny_owl_1.ogg' : '/audio/tawny_owl_2.ogg');
          owl.volume = 0.22 * this.masterVolume;
          owl.play().catch(() => {});
        } catch {
          // Ignore
        }
      }
    }

    // Subtle Japanese Hirajoshi / Yo wind-chime note tailored per biome
    this.chimeTimer -= dt;
    if (this.chimeTimer <= 0) {
      this.chimeTimer = prof === 'windmills' || prof === 'papertown' ? 7 + Math.random() * 7 : 10 + Math.random() * 10;
      if (!this.isMuted) {
        const scales = {
          onsen: [392.0, 440.0, 523.25, 587.33, 659.25],
          comet: [523.25, 587.33, 783.99, 880.0, 1174.66],
          forest: [440.0, 493.88, 587.33, 659.25, 783.99],
        };
        const pentatonic = scales[prof] || [587.33, 659.25, 783.99, 880.0, 1046.5];
        const freq = pentatonic[Math.floor(Math.random() * pentatonic.length)];
        if (!this._playChime(freq, 0.05)) this._playBellTone(freq, 0.03, 2.2);
      }
    }
  }

  _playBellTone(freq, gainAmt, duration) {
    if (!this.initialized || !this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(gainAmt, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  // Walking: only one foot is voiced, which halves the cadence into a calm,
  // regular rhythm. Landings always sound (force = true).
  playFootstep(surface, force = false) {
    if (!this.initialized || !this.ctx || this.isMuted) return;
    if (!force && this._stepCount++ % 2 === 1) return;
    const sample = STEP_SAMPLE[surface] || 'step_grass';
    // Footsteps sit well under the ambience: felt more than heard.
    const stepGain = sample === 'step_grass' ? 0.055 : sample === 'step_water' ? 0.07 : 0.08;
    if (this._playSample(sample, { gain: stepGain, jitter: 0.06 })) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();

    if (surface === 'stone') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220 + Math.random() * 40, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.055);
      g.gain.setValueAtTime(0.055, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    } else if (surface === 'wood') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(155 + Math.random() * 25, now);
      osc.frequency.exponentialRampToValueAtTime(85, now + 0.08);
      g.gain.setValueAtTime(0.07, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
    } else if (surface === 'shallow_water') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520 + Math.random() * 140, now);
      osc.frequency.exponentialRampToValueAtTime(240, now + 0.09);
      g.gain.setValueAtTime(0.05, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
    } else if (surface === 'gravel') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(420 + Math.random() * 120, now);
      osc.frequency.exponentialRampToValueAtTime(190, now + 0.05);
      g.gain.setValueAtTime(0.04, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140 + Math.random() * 30, now);
      osc.frequency.exponentialRampToValueAtTime(75, now + 0.045);
      g.gain.setValueAtTime(0.028, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    }

    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  playLand(surface) {
    if (!this.initialized || !this.ctx || this.isMuted) return;
    this._playSample('land', { gain: 0.14, jitter: 0.05 });
    this.playFootstep(surface, true);
  }

  playJump() {
    if (!this.initialized || !this.ctx || this.isMuted) return;
    if (this._playSample('jump', { gain: 0.22, rate: 1.1, jitter: 0.06 })) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.11);
    g.gain.setValueAtTime(0.055, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  playStoneSlide() {
    if (!this.initialized || !this.ctx || this.isMuted) return;
    if (this._playSample('stone_slide', { gain: 0.42, jitter: 0.04 })) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.linearRampToValueAtTime(82, now + 0.25);
    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  playStoneRotate() {
    if (!this.initialized || !this.ctx || this.isMuted) return;
    if (this._playSample('stone_rotate', { gain: 0.4, jitter: 0.05 })) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(240, now + 0.14);
    g.gain.setValueAtTime(0.11, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  playSealAwaken() {
    if (!this.initialized || !this.ctx || this.isMuted) return;
    if (this.samples.koto) {
      // Rising koto pentatonic run, then a high chime to ring it out.
      [293.66, 329.63, 392.0, 440.0, 587.33].forEach((f, idx) => this._playKoto(f, 0.5, idx * 0.11));
      this._playChime(1174.66, 0.16, 0.62);
      return;
    }
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, idx) => {
      setTimeout(() => this._playBellTone(f, 0.09, 2.4), idx * 105);
    });
  }

  playChapterComplete() {
    if (!this.initialized || !this.ctx || this.isMuted) return;
    if (this.samples.koto) {
      [196.0, 293.66, 329.63, 392.0, 587.33, 523.25].forEach((f, idx) => this._playKoto(f, 0.55, idx * 0.18));
      this._playChime(1046.5, 0.14, 1.1);
      this._playChime(1318.5, 0.1, 1.4);
      return;
    }
    [392.0, 523.25, 587.33, 783.99, 1046.5].forEach((f, idx) => {
      setTimeout(() => this._playBellTone(f, 0.1, 4.2), idx * 160);
    });
  }

  playBonshoBell() {
    if (!this.initialized || !this.ctx || this.isMuted) return;
    if (this._playSample('temple_bell', { gain: 0.5 })) return;
    const partials = [
      { f: 110.0, g: 0.24, d: 6.5 },
      { f: 110.8, g: 0.16, d: 6.2 },
      { f: 221.0, g: 0.14, d: 4.8 },
      { f: 277.2, g: 0.10, d: 3.8 },
      { f: 392.0, g: 0.07, d: 2.9 },
      { f: 528.0, g: 0.04, d: 1.9 },
    ];
    partials.forEach((p) => this._playBellTone(p.f, p.g, p.d));
  }

  playShishiKnock(volume = 0.8) {
    if (!this.initialized || !this.ctx || this.isMuted) return;
    if (this._playSample('bamboo_knock', { gain: 0.75 * volume, rate: 0.92, jitter: 0.04 })) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(510, now);
    osc.frequency.exponentialRampToValueAtTime(295, now + 0.11);
    g.gain.setValueAtTime(0.15 * volume, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  playKoiSplash() {
    if (!this.initialized || !this.ctx || this.isMuted) return;
    if (this._playSample('koi_splash', { gain: 0.36, jitter: 0.08 })) return;
    const now = this.ctx.currentTime;
    [340, 480, 620].forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const t0 = now + idx * 0.065;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t0);
      osc.frequency.exponentialRampToValueAtTime(f * 1.65, t0 + 0.09);
      g.gain.setValueAtTime(0.06, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.11);
      osc.connect(g).connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 0.13);
    });
  }

  playLanternChime(isLit) {
    if (!this.initialized || !this.ctx || this.isMuted) return;
    // A soft breath of flame and a low singing bowl that blooms and fades.
    if (this.samples.lantern_flame || this.samples.singing_bowl) {
      if (isLit) {
        this._playSample('lantern_flame', { gain: 0.16, jitter: 0.05 });
        this._playSample('singing_bowl', { gain: 0.13, rate: 329.63 / BOWL_BASE_HZ, delay: 0.12 });
      } else {
        this._playSample('lantern_flame', { gain: 0.1, rate: 0.85, jitter: 0.05 });
      }
      return;
    }
    if (isLit) {
      this._playBellTone(659.25, 0.08, 1.3);
      setTimeout(() => this._playBellTone(987.77, 0.06, 1.4), 70);
    } else {
      this._playBellTone(440.0, 0.06, 0.8);
    }
  }

  playEmaWish() {
    if (!this.initialized || !this.ctx || this.isMuted) return;
    // Wooden plaques knocking together on the rack, then a faint bowl for the wish.
    if (this.samples.ema_hang) {
      this._playSample('ema_hang', { gain: 0.26, jitter: 0.05 });
      this._playSample('singing_bowl', { gain: 0.06, rate: 440 / BOWL_BASE_HZ, delay: 0.3 });
      return;
    }
    this._playBellTone(523.25, 0.06, 0.9);
    setTimeout(() => this._playBellTone(783.99, 0.07, 1.6), 90);
    setTimeout(() => this._playBellTone(1046.5, 0.05, 1.9), 190);
  }

  playJizoBlessing() {
    if (!this.initialized || !this.ctx || this.isMuted) return;
    if (this.samples.wind_chime) {
      this._playChime(880.0, 0.2);
      this._playChime(1174.66, 0.16, 0.11);
      return;
    }
    this._playBellTone(880.0, 0.055, 1.4);
    setTimeout(() => this._playBellTone(1174.66, 0.045, 1.8), 110);
  }

  playSteamValve() {
    if (!this.initialized || !this.ctx || this.isMuted) return;
    if (this._playSample('steam_valve', { gain: 0.36, jitter: 0.05 })) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.26);
    g.gain.setValueAtTime(0.05, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.36);
    this._playBellTone(698.46, 0.04, 0.9);
  }

  playWaterGate() {
    if (!this.initialized || !this.ctx || this.isMuted) return;
    if (this._playSample('water_gate', { gain: 0.4 })) return;
    this.playStoneSlide();
    setTimeout(() => this._playBellTone(523.25, 0.05, 0.9), 80);
  }

  playRailSwitch() {
    if (!this.initialized || !this.ctx || this.isMuted) return;
    if (this._playSample('lever', { gain: 0.34, jitter: 0.04 })) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(195, now);
    osc.frequency.setValueAtTime(295, now + 0.055);
    g.gain.setValueAtTime(0.055, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  playFurinNote(noteIndex = 0) {
    if (!this.initialized || !this.ctx || this.isMuted) return;
    const notes = [587.33, 659.25, 783.99, 880.0, 987.77, 1174.66];
    const freq = notes[((noteIndex % notes.length) + notes.length) % notes.length];
    if (this._playChime(freq, 0.3)) return;
    this._playBellTone(freq, 0.09, 1.85);
    this._playBellTone(freq * 2, 0.025, 0.9);
  }

  playWindGust() {
    if (!this.initialized || !this.ctx || this.isMuted) return;
    if (this._playSample('wind_gust', { gain: 0.3, jitter: 0.06 })) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.28);
    g.gain.setValueAtTime(0.06, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.36);
  }

  playPrismBeam() {
    if (!this.initialized || !this.ctx || this.isMuted) return;
    if (this.samples.wind_chime) {
      this._playChime(987.77, 0.22);
      this._playChime(1479.98, 0.15, 0.065);
      return;
    }
    this._playBellTone(987.77, 0.065, 1.5);
    setTimeout(() => this._playBellTone(1479.98, 0.045, 1.7), 65);
  }

  playEraShift() {
    if (!this.initialized || !this.ctx || this.isMuted) return;
    if (this.samples.koto) {
      [196.0, 293.66, 440.0].forEach((f, idx) => this._playKoto(f, 0.45, idx * 0.08));
      return;
    }
    this._playBellTone(392.0, 0.075, 1.8);
    setTimeout(() => this._playBellTone(587.33, 0.065, 2.0), 80);
    setTimeout(() => this._playBellTone(880.0, 0.055, 2.2), 160);
  }

  /** Ending constellation: one rising pentatonic note per chapter (index 0-6). */
  playEndingNote(index) {
    if (!this.initialized || !this.ctx || this.isMuted) return;
    const scale = [293.66, 329.63, 369.99, 440.0, 493.88, 587.33, 659.25];
    const f = scale[Math.max(0, Math.min(scale.length - 1, index))];
    if (this.samples.koto) {
      this._playKoto(f, 0.42);
      this._playKoto(f * 1.5, 0.18, 0.16);
      this._playChime(f * 4, 0.05, 0.3);
      return;
    }
    this._playBellTone(f, 0.07, 2.4);
  }

  playCatMeow() {
    if (!this.initialized || !this.ctx || this.isMuted) return;
    if (this._playSample('cat_meow', { gain: 0.3, jitter: 0.05 })) {
      this._playPurrSnippet();
      return;
    }
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(540, now);
    osc.frequency.linearRampToValueAtTime(760, now + 0.11);
    osc.frequency.exponentialRampToValueAtTime(480, now + 0.34);
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.09, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.38);
    this._playPurrSnippet();
  }

  // Real field-recorded cat purr snippet.
  _playPurrSnippet() {
    if (this.purrAudio) {
      try {
        this.purrAudio.currentTime = 2.0 + Math.random() * 6.0;
        this.purrAudio.volume = 0.42 * this.masterVolume;
        this.purrAudio.play().catch(() => {});
        setTimeout(() => {
          this.purrAudio?.pause();
        }, 2300);
      } catch {
        // Ignore
      }
    }
  }
}

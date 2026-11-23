import * as THREE from 'three';
import { globalToonUniforms } from '../engine/ToonMaterials.js';

const SKY_DOME_VERTEX = /* glsl */ `
varying vec3 vWorldDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldDir = normalize(position);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SKY_DOME_FRAGMENT = /* glsl */ `
precision highp float;

uniform vec3 uSkyZenith;
uniform vec3 uSkyMid;
uniform vec3 uSkyHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunGlowColor;
uniform float uStarAmount;
uniform float uCometAmount;
uniform float uTime;

varying vec3 vWorldDir;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

void main() {
  vec3 dir = normalize(vWorldDir);
  // Map elevation seamlessly even from downward-angled diorama rays
  float elev = clamp(dir.y * 1.45 + 0.35, 0.0, 1.0);

  vec3 col = mix(uSkyHorizon, uSkyMid, smoothstep(0.0, 0.48, elev));
  col = mix(col, uSkyZenith, smoothstep(0.42, 0.96, elev));

  // Warm solar / lunar atmospheric halo
  float sunDot = max(0.0, dot(dir, normalize(uSunDir)));
  col += uSunGlowColor * (pow(sunDot, 5.0) * 0.32 + pow(sunDot, 28.0) * 0.45);

  // Twinkling stars in upper dome during Ocaso / Crepusculo
  if (uStarAmount > 0.02) {
    vec2 starUv = dir.xz / (abs(dir.y) + 0.65) * 32.0;
    vec2 cell = floor(starUv);
    vec2 f = fract(starUv) - 0.5;
    float rnd = hash21(cell);
    if (rnd > 0.945) {
      float twinkle = 0.65 + 0.35 * sin(uTime * 2.6 + rnd * 40.0);
      float star = (1.0 - smoothstep(0.04, 0.22, length(f))) * twinkle;
      col += vec3(0.92, 0.96, 1.0) * star * uStarAmount * smoothstep(0.15, 0.65, elev);
    }
  }

  // Your Name (Kataware-doki) subtle luminous comet streak across the sky
  if (uCometAmount > 0.02) {
    vec2 cUv = vec2(dir.x + 0.25, dir.y + 0.08);
    float lineDist = abs((cUv.y - 0.14) - (cUv.x * 0.58));
    float along = clamp((cUv.x + 0.55) / 0.85, 0.0, 1.0);
    float tail = exp(-lineDist * 52.0) * smoothstep(0.0, 0.35, along) * (1.0 - smoothstep(0.85, 1.0, along));
    float head = exp(-length(cUv - vec2(0.28, 0.30)) * 28.0);
    vec3 cometCol = mix(vec3(0.62, 0.82, 1.0), vec3(1.0, 0.82, 0.92), along);
    col += cometCol * (tail * 0.72 + head * 1.15) * uCometAmount;
  }

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export const TIME_PRESETS = [
  {
    id: 'tarde',
    label: 'Day',
    // Radiant Shinkai cerulean sky + suemaru vibrant grass/cobalt shadows
    skyZenith: '#3c8ce3',
    skyMid: '#7bc6f6',
    skyHorizon: '#cbeeff',
    sky: '#9ad5f5',
    sunGlow: '#fff4cf',
    starAmount: 0.0,
    cometAmount: 0.0,
    cloudTop: '#ffffff',
    cloudMid: '#e8f4ff',
    cloudBottom: '#98b7e6',
    cloudMistBg: '#a6dcf7',
    sunColor: '#fff4db',
    sunIntensity: 2.25,
    sunPos: [-24, 34, 16],
    hemiSky: '#c7ecff',
    hemiGround: '#594b94',
    hemiIntensity: 0.78,
    shadowColor: '#4b4394',
    shadowTint: '#655ab5',
    sunWarmth: '#fff8e8',
    waterDeep: '#3ab3e3',
    waterShallow: '#7de0ff',
    waterFoam: '#f8feff',
    waterHighlight: '#d2f8ff',
    shojiGlow: 0.12,
    chochinGlow: 0.42,
    firefly: 0.0,
    outlineColor: '#2a2254',
  },
  {
    id: 'dorada',
    label: 'Dusk',
    // Your Name Kataware-doki magic hour: cobalt zenith -> rose coral -> apricot gold!
    skyZenith: '#353a87',
    skyMid: '#de6f93',
    skyHorizon: '#ffbf7a',
    sky: '#f29880',
    sunGlow: '#ffd48c',
    starAmount: 0.38,
    cometAmount: 0.65,
    cloudTop: '#fff0dc',
    cloudMid: '#f7a6aa',
    cloudBottom: '#6a589c',
    cloudMistBg: '#ed9e8e',
    sunColor: '#ffb366',
    sunIntensity: 2.38,
    sunPos: [-28, 20, 14],
    hemiSky: '#ffbe9c',
    hemiGround: '#4a2b6e',
    hemiIntensity: 0.74,
    shadowColor: '#41286e',
    shadowTint: '#633d8c',
    sunWarmth: '#ffe0ba',
    waterDeep: '#488cb8',
    waterShallow: '#7dc7d6',
    waterFoam: '#fff2ea',
    waterHighlight: '#ffd9b8',
    shojiGlow: 0.92,
    chochinGlow: 1.15,
    firefly: 0.62,
    outlineColor: '#291742',
  },
  {
    id: 'crepusculo',
    label: 'Night',
    // Deep sapphire Shinkai twilight with comet & glowing lanterns
    skyZenith: '#0f163b',
    skyMid: '#1d275c',
    skyHorizon: '#3c4382',
    sky: '#222a5c',
    sunGlow: '#8cb8ff',
    starAmount: 1.0,
    cometAmount: 1.0,
    cloudTop: '#96a8db',
    cloudMid: '#6877ad',
    cloudBottom: '#353d6e',
    cloudMistBg: '#272f61',
    sunColor: '#9ec0ff',
    sunIntensity: 1.52,
    sunPos: [-18, 28, 12],
    hemiSky: '#586eb0',
    hemiGround: '#1a1b45',
    hemiIntensity: 0.72,
    shadowColor: '#1a1d47',
    shadowTint: '#2b3069',
    sunWarmth: '#c7dbff',
    waterDeep: '#2e5d8c',
    waterShallow: '#4c88b8',
    waterFoam: '#c8e4fa',
    waterHighlight: '#9ec4f0',
    shojiGlow: 1.65,
    chochinGlow: 1.85,
    firefly: 1.0,
    outlineColor: '#10122e',
  },
];

function hexToCol(hex) {
  return new THREE.Color(hex);
}

export class DayCycle {
  constructor(scene, worldBuilder, foliage, pixelRenderer) {
    this.scene = scene;
    this.worldBuilder = worldBuilder;
    this.foliage = foliage;
    this.pixelRenderer = pixelRenderer;
    this.presetIndex = 0;

    this.shadowCenter = new THREE.Vector3(0, 0, 28);

    // Painted Shinkai Sky Dome with Stars & Comet
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uSkyZenith: { value: hexToCol(TIME_PRESETS[0].skyZenith) },
        uSkyMid: { value: hexToCol(TIME_PRESETS[0].skyMid) },
        uSkyHorizon: { value: hexToCol(TIME_PRESETS[0].skyHorizon) },
        uSunDir: globalToonUniforms.uSunDir,
        uSunGlowColor: { value: hexToCol(TIME_PRESETS[0].sunGlow) },
        uStarAmount: { value: 0 },
        uCometAmount: { value: 0 },
        uTime: globalToonUniforms.uTime,
      },
      vertexShader: SKY_DOME_VERTEX,
      fragmentShader: SKY_DOME_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(162, 32, 20), this.skyMat);
    scene.add(this.skyDome);

    this.sunLight = new THREE.DirectionalLight('#fff4db', 2.25);
    this.sunLight.position.set(-24, 34, 44);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.left = -25.6;
    this.sunLight.shadow.camera.right = 25.6;
    this.sunLight.shadow.camera.top = 25.6;
    this.sunLight.shadow.camera.bottom = -25.6;
    this.sunLight.shadow.camera.near = 6;
    this.sunLight.shadow.camera.far = 105;
    this.sunLight.shadow.bias = -0.0007;
    this.sunLight.shadow.normalBias = 0.045;
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);
    this.sunLight.target.position.copy(this.shadowCenter);

    this.hemiLight = new THREE.HemisphereLight('#c7ecff', '#594b94', 0.78);
    scene.add(this.hemiLight);

    scene.background = new THREE.Color('#9ad5f5');
    scene.fog = new THREE.Fog('#9ad5f5', 80, 175);

    this.current = this._cloneState(TIME_PRESETS[0]);
    this.target = this._cloneState(TIME_PRESETS[0]);
    this.applyState();
  }

  _cloneState(p) {
    return {
      skyZenith: hexToCol(p.skyZenith),
      skyMid: hexToCol(p.skyMid),
      skyHorizon: hexToCol(p.skyHorizon),
      sky: hexToCol(p.sky),
      sunGlow: hexToCol(p.sunGlow),
      starAmount: p.starAmount,
      cometAmount: p.cometAmount,
      cloudTop: hexToCol(p.cloudTop),
      cloudMid: hexToCol(p.cloudMid),
      cloudBottom: hexToCol(p.cloudBottom),
      cloudMistBg: hexToCol(p.cloudMistBg),
      sunColor: hexToCol(p.sunColor),
      sunIntensity: p.sunIntensity,
      sunPos: new THREE.Vector3(...p.sunPos),
      hemiSky: hexToCol(p.hemiSky),
      hemiGround: hexToCol(p.hemiGround),
      hemiIntensity: p.hemiIntensity,
      shadowColor: hexToCol(p.shadowColor),
      shadowTint: hexToCol(p.shadowTint),
      sunWarmth: hexToCol(p.sunWarmth),
      waterDeep: hexToCol(p.waterDeep),
      waterShallow: hexToCol(p.waterShallow),
      waterFoam: hexToCol(p.waterFoam),
      waterHighlight: hexToCol(p.waterHighlight),
      shojiGlow: p.shojiGlow,
      chochinGlow: p.chochinGlow,
      firefly: p.firefly,
      outlineColor: hexToCol(p.outlineColor),
    };
  }

  cyclePreset() {
    return this.setPreset((this.presetIndex + 1) % TIME_PRESETS.length);
  }

  setPreset(index) {
    this.presetIndex = Math.max(0, Math.min(TIME_PRESETS.length - 1, index));
    const preset = TIME_PRESETS[this.presetIndex];
    this.target = this._cloneState(preset);
    return preset;
  }

  getCurrentPreset() {
    return TIME_PRESETS[this.presetIndex];
  }

  update(dt, focusPos) {
    if (focusPos) {
      this.skyDome.position.set(focusPos.x, 0, focusPos.z);
      const d = Math.hypot(focusPos.x - this.shadowCenter.x, focusPos.z - this.shadowCenter.z);
      if (d > 5.5) {
        this.shadowCenter.set(
          Math.round(focusPos.x),
          Math.round(focusPos.y),
          Math.round(focusPos.z)
        );
      }
    }

    const k = 1 - Math.exp(-dt * 2.4);
    const c = this.current;
    const t = this.target;

    c.skyZenith.lerp(t.skyZenith, k);
    c.skyMid.lerp(t.skyMid, k);
    c.skyHorizon.lerp(t.skyHorizon, k);
    c.sky.lerp(t.sky, k);
    c.sunGlow.lerp(t.sunGlow, k);
    c.starAmount += (t.starAmount - c.starAmount) * k;
    c.cometAmount += (t.cometAmount - c.cometAmount) * k;
    c.cloudTop.lerp(t.cloudTop, k);
    c.cloudMid.lerp(t.cloudMid, k);
    c.cloudBottom.lerp(t.cloudBottom, k);
    c.cloudMistBg.lerp(t.cloudMistBg, k);
    c.sunColor.lerp(t.sunColor, k);
    c.sunIntensity += (t.sunIntensity - c.sunIntensity) * k;
    c.sunPos.lerp(t.sunPos, k);
    c.hemiSky.lerp(t.hemiSky, k);
    c.hemiGround.lerp(t.hemiGround, k);
    c.hemiIntensity += (t.hemiIntensity - c.hemiIntensity) * k;
    c.shadowColor.lerp(t.shadowColor, k);
    c.shadowTint.lerp(t.shadowTint, k);
    c.sunWarmth.lerp(t.sunWarmth, k);
    c.waterDeep.lerp(t.waterDeep, k);
    c.waterShallow.lerp(t.waterShallow, k);
    c.waterFoam.lerp(t.waterFoam, k);
    c.waterHighlight.lerp(t.waterHighlight, k);
    c.shojiGlow += (t.shojiGlow - c.shojiGlow) * k;
    c.chochinGlow += (t.chochinGlow - c.chochinGlow) * k;
    c.firefly += (t.firefly - c.firefly) * k;
    c.outlineColor.lerp(t.outlineColor, k);

    this.applyState();
  }

  setTargets(worldBuilder, foliage) {
    this.worldBuilder = worldBuilder;
    this.foliage = foliage;
    this.applyState();
  }

  applyState() {
    const c = this.current;
    this.scene.background.copy(c.sky);
    if (this.scene.fog) this.scene.fog.color.copy(c.sky);

    this.skyMat.uniforms.uSkyZenith.value.copy(c.skyZenith);
    this.skyMat.uniforms.uSkyMid.value.copy(c.skyMid);
    this.skyMat.uniforms.uSkyHorizon.value.copy(c.skyHorizon);
    this.skyMat.uniforms.uSunGlowColor.value.copy(c.sunGlow);
    this.skyMat.uniforms.uStarAmount.value = c.starAmount;
    this.skyMat.uniforms.uCometAmount.value = c.cometAmount;

    this.sunLight.color.copy(c.sunColor);
    this.sunLight.intensity = c.sunIntensity;
    this.sunLight.target.position.copy(this.shadowCenter);
    this.sunLight.position.copy(this.shadowCenter).add(c.sunPos);

    this.hemiLight.color.copy(c.hemiSky);
    this.hemiLight.groundColor.copy(c.hemiGround);
    this.hemiLight.intensity = c.hemiIntensity;

    globalToonUniforms.uShadowColor.value.copy(c.shadowColor);
    globalToonUniforms.uShadowTint.value.copy(c.shadowTint);
    globalToonUniforms.uSunWarmth.value.copy(c.sunWarmth);
    globalToonUniforms.uSunScale.value = c.sunIntensity / 2.25;
    globalToonUniforms.uSunDir.value.copy(c.sunPos).normalize();
    globalToonUniforms.uCloudTop.value.copy(c.cloudTop);
    globalToonUniforms.uCloudMid.value.copy(c.cloudMid);
    globalToonUniforms.uCloudBottom.value.copy(c.cloudBottom);
    globalToonUniforms.uCloudMistBg.value.copy(c.cloudMistBg);

    this.worldBuilder.shojiMaterials.forEach((m) => {
      m.emissiveIntensity = c.shojiGlow;
    });
    this.worldBuilder.chochinMaterials.forEach((m) => {
      m.emissiveIntensity = c.chochinGlow;
    });

    this.worldBuilder.waterMaterials.forEach((m) => {
      m.uniforms.uDeepColor.value.copy(c.waterDeep);
      m.uniforms.uShallowColor.value.copy(c.waterShallow);
      m.uniforms.uFoamColor.value.copy(c.waterFoam);
      m.uniforms.uHighlightColor.value.copy(c.waterHighlight);
    });

    this.worldBuilder.waterfallMaterials.forEach((m) => {
      m.uniforms.uDeepColor.value.copy(c.waterDeep);
      m.uniforms.uFoamColor.value.copy(c.waterFoam);
    });

    this.foliage?.setFireflyIntensity?.(c.firefly);
    this.pixelRenderer.presentMat.uniforms.uOutlineColor.value.copy(c.outlineColor);
  }
}

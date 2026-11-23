import * as THREE from 'three';

export const globalToonUniforms = {
  uTime: { value: 0 },
  uShadowColor: { value: new THREE.Color('#544890') },
  uShadowTint: { value: new THREE.Color('#6f61b5') },
  uSunWarmth: { value: new THREE.Color('#fff6e4') },
  uSunScale: { value: 1.0 },
  uSunDir: { value: new THREE.Vector3(-24, 34, 16).normalize() },
  uCloudTop: { value: new THREE.Color('#ffffff') },
  uCloudMid: { value: new THREE.Color('#ebf4fc') },
  uCloudBottom: { value: new THREE.Color('#b4c6eb') },
  uCloudMistBg: { value: new THREE.Color('#94c8df') },
  uPlayerPos: { value: new THREE.Vector3(0, -99, 0) },
  uCatPos: { value: new THREE.Vector3(0, -99, 0) },
  // Occlusion window: anything between the camera and Hana is dithered away around her
  uOccCenter: { value: new THREE.Vector3(0, 0, 1) }, // Hana's chest in view space
  uOccStrength: { value: 0 },
  uOccRadius: { value: new THREE.Vector2(1.35, 1.85) }, // world units on screen (x, y)
  uOccOrtho: { value: 1 },
};

// 4x4 ordered dither, matching the pixel-art render target texel grid
const OCCLUSION_FRAGMENT_PARS = `
uniform vec3 uOccCenter;
uniform float uOccStrength;
uniform vec2 uOccRadius;
uniform float uOccOrtho;
const float OCC_BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);`;

const OCCLUSION_FRAGMENT = `
if (uOccStrength > 0.001) {
  vec3 occFrag = -vViewPosition;
  float occFragDepth = -occFrag.z;
  float occPlayerDepth = max(-uOccCenter.z, 0.001);
  float occAhead = occPlayerDepth - occFragDepth;
  if (occAhead > 0.4) {
    vec2 occD = uOccOrtho > 0.5
      ? occFrag.xy - uOccCenter.xy
      : (occFrag.xy / max(occFragDepth, 0.001) - uOccCenter.xy / occPlayerDepth) * occPlayerDepth;
    float occR = length(occD / uOccRadius);
    float occW = (1.0 - smoothstep(0.55, 1.0, occR)) * smoothstep(0.4, 0.95, occAhead) * uOccStrength * 0.94;
    ivec2 occQ = ivec2(mod(gl_FragCoord.xy, 4.0));
    if ((OCC_BAYER[occQ.x + occQ.y * 4] + 0.5) / 16.0 < occW) discard;
  }
}`;

let cachedGradientMap = null;

export function getToonGradientMap() {
  if (cachedGradientMap) return cachedGradientMap;
  // Smooth 64-step painterly cel-shaded ramp (soft Ghibli transitions instead of harsh blocks)
  const w = 64;
  const data = new Uint8Array(w * 4);
  for (let i = 0; i < w; i++) {
    const t = i / (w - 1);
    let val = 115;
    if (t > 0.28) val = 160;
    if (t > 0.56) val = 212;
    if (t > 0.80) val = 255;
    // Soft transition feathering across band edges
    const smooth = (edge, lo, hi) => {
      const k = Math.max(0, Math.min(1, (t - (edge - 0.045)) / 0.09));
      return lo + (hi - lo) * (k * k * (3 - 2 * k));
    };
    let f = smooth(0.26, 118, 168);
    f = Math.max(f, smooth(0.55, 168, 218));
    f = Math.max(f, smooth(0.80, 218, 255));
    val = Math.round(f);
    const o = i * 4;
    data[o] = val;
    data[o + 1] = val;
    data[o + 2] = val;
    data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, w, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  cachedGradientMap = tex;
  return tex;
}

export function createPixelToonMaterial({
  color = '#ffffff',
  map = null,
  alphaTest = 0,
  vertexColors = false,
  emissive = '#000000',
  emissiveIntensity = 0,
  side = THREE.FrontSide,
  transparent = false,
  opacity = 1,
  windSway = null,
  flatShading = false,
  occludable = true,
} = {}) {
  const mat = new THREE.MeshToonMaterial({
    color,
    map,
    alphaTest,
    gradientMap: getToonGradientMap(),
    vertexColors,
    emissive,
    emissiveIntensity,
    side,
    transparent,
    opacity,
  });

  if (flatShading) {
    mat.flatShading = true;
  }

  const hasWind = Boolean(windSway);
  const windAmp = windSway?.amp ?? 0.06;
  const windSpeed = windSway?.speed ?? 1.5;
  const windBase = windSway?.baseHeight ?? 0.0;
  const windSpan = Math.max(0.25, (windSway?.topHeight ?? 2.5) - windBase);
  const isGroundFoliage = hasWind && (windSway?.topHeight ?? 2.5) <= 1.25;

  mat.customProgramCacheKey = () =>
    (hasWind
      ? `painterly-toon-wind-${windAmp.toFixed(2)}-${windSpeed.toFixed(2)}-${isGroundFoliage ? 1 : 0}-${alphaTest}`
      : `painterly-toon-base-${alphaTest}`) + (occludable ? '-occ' : '');

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = globalToonUniforms.uTime;
    shader.uniforms.uShadowColor = globalToonUniforms.uShadowColor;
    shader.uniforms.uShadowTint = globalToonUniforms.uShadowTint;
    shader.uniforms.uSunWarmth = globalToonUniforms.uSunWarmth;
    shader.uniforms.uPlayerPos = globalToonUniforms.uPlayerPos;
    shader.uniforms.uCatPos = globalToonUniforms.uCatPos;
    if (occludable) {
      shader.uniforms.uOccCenter = globalToonUniforms.uOccCenter;
      shader.uniforms.uOccStrength = globalToonUniforms.uOccStrength;
      shader.uniforms.uOccRadius = globalToonUniforms.uOccRadius;
      shader.uniforms.uOccOrtho = globalToonUniforms.uOccOrtho;
    }

    if (hasWind) {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uTime;
uniform vec3 uPlayerPos;
uniform vec3 uCatPos;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
float windH = clamp((position.y - ${windBase.toFixed(3)}) / ${windSpan.toFixed(3)}, 0.0, 1.5);
#ifdef USE_INSTANCING
  vec4 wpRaw = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
  mat4 folMat = modelMatrix * instanceMatrix;
#else
  vec4 wpRaw = modelMatrix * vec4(transformed, 1.0);
  mat4 folMat = modelMatrix;
#endif
float phase = wpRaw.x * 0.55 + wpRaw.z * 0.42;
float gust = 0.72 + 0.52 * sin(wpRaw.x * 0.19 - wpRaw.z * 0.14 - uTime * 1.45);
vec2 wSway = vec2(
  sin(uTime * ${windSpeed.toFixed(3)} + phase) * ${windAmp.toFixed(4)} * gust,
  cos(uTime * ${(windSpeed * 0.8).toFixed(3)} + phase * 1.25) * ${(windAmp * 0.65).toFixed(4)} * gust
) * windH;
vec2 wPushTotal = wSway;
${
  isGroundFoliage
    ? `vec2 dPl = wpRaw.xz - uPlayerPos.xz;
float distPl = length(dPl);
float yDiffPl = abs(wpRaw.y - uPlayerPos.y);
if (distPl < 1.25 && distPl > 0.001 && yDiffPl < 1.35) {
  float fPl = pow(1.0 - distPl / 1.25, 1.5) * 0.34;
  wPushTotal += (dPl / distPl) * fPl * windH;
  transformed.y -= fPl * 0.12 * windH;
}
vec2 dCat = wpRaw.xz - uCatPos.xz;
float distCat = length(dCat);
float yDiffCat = abs(wpRaw.y - uCatPos.y);
if (distCat < 0.78 && distCat > 0.001 && yDiffCat < 1.1) {
  float fCat = pow(1.0 - distCat / 0.78, 1.5) * 0.22;
  wPushTotal += (dCat / distCat) * fCat * windH;
}`
    : ''
}
vec2 col0 = folMat[0].xz;
vec2 col2 = folMat[2].xz;
transformed.x += dot(wPushTotal, col0) / max(1e-4, dot(col0, col0));
transformed.z += dot(wPushTotal, col2) / max(1e-4, dot(col2, col2));`
        );
    }

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uShadowColor;
uniform vec3 uShadowTint;
uniform vec3 uSunWarmth;${occludable ? OCCLUSION_FRAGMENT_PARS : ''}`
      )
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>${occludable ? OCCLUSION_FRAGMENT : ''}`)
      .replace(
        'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
        `vec3 directLit = reflectedLight.directDiffuse * uSunWarmth;
vec3 indirectLit = reflectedLight.indirectDiffuse * 0.64;
float directLum = dot(directLit, vec3(0.299, 0.587, 0.114));
float albedoLum = max(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)), 0.045);
float litRatio = directLum / albedoLum;
float shadowMask = smoothstep(0.05, 0.36, litRatio);
vec3 shadowBase = mix(diffuseColor.rgb * uShadowTint, uShadowColor, 0.44);
float rimBounce = smoothstep(0.45, 0.92, litRatio) * 0.08;
vec3 litColor = max(directLit + indirectLit + diffuseColor.rgb * rimBounce, shadowBase * 1.05);
vec3 outgoingLight = mix(shadowBase, litColor, shadowMask) + totalEmissiveRadiance;`
      );
  };

  return mat;
}

export function createCloudMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: globalToonUniforms.uTime,
      uSunDir: globalToonUniforms.uSunDir,
      uSunWarmth: globalToonUniforms.uSunWarmth,
      uCloudTop: globalToonUniforms.uCloudTop,
      uCloudMid: globalToonUniforms.uCloudMid,
      uCloudBottom: globalToonUniforms.uCloudBottom,
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      varying vec3 vLocalPos;
      void main() {
        vLocalPos = position;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        float swell = sin(uTime * 0.48 + wp.x * 0.14 + wp.z * 0.11) * 0.11;
        wp.xyz += vWorldNormal * swell * max(0.0, vWorldNormal.y * 0.7 + 0.3);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunWarmth;
      uniform vec3 uCloudTop;
      uniform vec3 uCloudMid;
      uniform vec3 uCloudBottom;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      varying vec3 vLocalPos;

      float cloudNoise(vec3 p) {
        return sin(p.x * 0.38 + sin(p.z * 0.31)) * 0.45
             + cos(p.y * 0.52 - sin(p.x * 0.29)) * 0.35
             + sin((p.x - p.z + p.y) * 0.44) * 0.20;
      }

      void main() {
        vec3 n = normalize(vWorldNormal);
        vec3 sDir = normalize(uSunDir);
        float sunDot = dot(n, sDir) * 0.5 + 0.5;
        float upDot = n.y * 0.5 + 0.5;
        float flatBase = smoothstep(-0.55, 0.58, vLocalPos.y);
        float billowTex = cloudNoise(vWorldPos * 0.42 + vec3(uTime * 0.04, 0.0, 0.0)) * 0.12;

        float shade = sunDot * 0.42 + upDot * 0.36 + flatBase * 0.22 + billowTex;

        float step1 = smoothstep(0.28, 0.38, shade);
        float step2 = smoothstep(0.47, 0.57, shade);
        float step3 = smoothstep(0.66, 0.78, shade);
        float rim = smoothstep(0.76, 0.90, sunDot * 0.65 + upDot * 0.35 + billowTex * 0.6) * smoothstep(0.0, 0.45, n.y);

        vec3 col = mix(uCloudBottom, uCloudMid, step1 * 0.65 + step2 * 0.35);
        col = mix(col, uCloudTop, step3);
        vec3 rimGlow = mix(uCloudTop, uSunWarmth * 1.06, 0.48);
        col = mix(col, rimGlow, rim * 0.55);

        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

export function createCloudSeaMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: globalToonUniforms.uTime,
      uCloudTop: globalToonUniforms.uCloudTop,
      uCloudMid: globalToonUniforms.uCloudMid,
      uCloudBottom: globalToonUniforms.uCloudBottom,
      uCloudMistBg: globalToonUniforms.uCloudMistBg,
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform vec3 uCloudTop;
      uniform vec3 uCloudMid;
      uniform vec3 uCloudBottom;
      uniform vec3 uCloudMistBg;
      varying vec3 vWorldPos;

      float billow(vec2 p) {
        return sin(p.x * 0.068 + sin(p.y * 0.052)) * 0.46 +
               cos(p.y * 0.082 - cos(p.x * 0.048)) * 0.34 +
               sin((p.x + p.y) * 0.036) * 0.24;
      }

      void main() {
        vec2 drift = vWorldPos.xz - vec2(uTime * 0.58, uTime * 0.16);
        vec2 driftFine = vWorldPos.xz - vec2(uTime * 0.85, -uTime * 0.12);
        float h = billow(drift)
                + 0.48 * billow(drift * 1.95 + vec2(4.2, -3.1))
                + 0.22 * billow(driftFine * 3.6 + vec2(-1.7, 5.4));

        float dist = length(vWorldPos.xz);
        float horizon = smoothstep(56.0, 152.0, dist);

        vec3 troughCol = mix(uCloudMistBg, uCloudBottom, 0.72);
        vec3 col = mix(troughCol, uCloudBottom, smoothstep(-0.42, -0.08, h));
        col = mix(col, uCloudMid, smoothstep(0.06, 0.30, h));
        col = mix(col, uCloudTop, smoothstep(0.40, 0.68, h));
        col = mix(col, uCloudMistBg, horizon);

        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

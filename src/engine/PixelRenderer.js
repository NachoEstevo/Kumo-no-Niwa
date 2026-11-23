import * as THREE from 'three';

const PRESENT_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const PRESENT_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform vec2 uTexSize;
uniform vec2 uSubTexelShift;
uniform float uCameraNear;
uniform float uCameraFar;
uniform float uIsOrtho;
uniform vec3 uOutlineColor;
uniform float uEdgeStrength;
uniform float uIsHD;

varying vec2 vUv;

float readViewDepth(vec2 uv) {
  float fragCoordZ = texture2D(tDepth, clamp(uv, 0.001, 0.999)).x;
  if (uIsOrtho > 0.5) {
    return mix(uCameraNear, uCameraFar, fragCoordZ);
  }
  float zNdc = fragCoordZ * 2.0 - 1.0;
  return (2.0 * uCameraNear * uCameraFar) / (uCameraFar + uCameraNear - zNdc * (uCameraFar - uCameraNear));
}

void main() {
  vec2 shiftedUv = clamp(vUv + uSubTexelShift, 0.001, 0.999);
  vec2 texel = 1.0 / uTexSize;
  vec2 snappedUv = (floor(shiftedUv * uTexSize) + 0.5) * texel;
  vec2 sampleUv = uIsHD > 0.5 ? vUv : snappedUv;

  vec4 baseCol = texture2D(tDiffuse, sampleUv);

  float dC = readViewDepth(sampleUv);
  float dR = readViewDepth(sampleUv + vec2(texel.x, 0.0));
  float dL = readViewDepth(sampleUv - vec2(texel.x, 0.0));
  float dU = readViewDepth(sampleUv + vec2(0.0, texel.y));
  float dD = readViewDepth(sampleUv - vec2(0.0, texel.y));

  float maxDiff = max(
    max(dR - dC, dL - dC),
    max(dU - dC, dD - dC)
  );
  float skyMask = step(dC, uCameraFar * 0.9);
  float edge = uIsHD > 0.5
    ? smoothstep(0.65, 1.9, maxDiff) * skyMask * uEdgeStrength * 0.52
    : smoothstep(0.85, 2.2, maxDiff) * skyMask * uEdgeStrength;

  vec3 col = mix(baseCol.rgb, uOutlineColor, edge);
  if (uIsHD > 0.5) {
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 1.09);
  }

  vec2 vigUv = vUv * 2.0 - 1.0;
  float vig = 1.0 - dot(vigUv, vigUv) * (uIsHD > 0.5 ? 0.04 : 0.055);
  col *= clamp(vig, 0.88, 1.0);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export class PixelRenderer {
  constructor(container) {
    this.container = container;
    this.qualityMode = 'pixel-fine'; // 'pixel-fine' (360p default) | 'pixel-retro' (250p) | 'hd'
    this.targetVerticalRes = 360;
    this.mode = 'diorama'; // 'diorama' | 'panoramic'
    this.titleOrbit = true;
    this.cinematicActive = false;
    this.orbitAngle = 0.35;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    container.appendChild(this.renderer.domElement);

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    this.aspect = w / h;

    this.baseYaw = 0.24;
    this.userYawOffset = 0;
    this.targetYawOffset = 0;
    this.targetHalfH = 11.8;
    this.currentHalfH = 11.8;
    this.sitZoomBias = 0;
    // Breathing zoom: the diorama opens up a little while Hana sprints
    this.runZoomBias = 0;

    this.orthoCam = new THREE.OrthographicCamera(
      -this.targetHalfH * this.aspect,
      this.targetHalfH * this.aspect,
      this.targetHalfH,
      -this.targetHalfH,
      1,
      200
    );
    this.perspCam = new THREE.PerspectiveCamera(34, this.aspect, 1, 260);

    this.targetPos = new THREE.Vector3(-3, 2.0, 2);
    this.lookAhead = new THREE.Vector3();

    this.renderTarget = this._createRenderTarget(w, h);

    this.presentScene = new THREE.Scene();
    this.presentCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.presentMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.renderTarget.texture },
        tDepth: { value: this.renderTarget.depthTexture },
        uTexSize: { value: new THREE.Vector2(this.renderTarget.width, this.renderTarget.height) },
        uSubTexelShift: { value: new THREE.Vector2(0, 0) },
        uCameraNear: { value: 1 },
        uCameraFar: { value: 200 },
        uIsOrtho: { value: 1 },
        uOutlineColor: { value: new THREE.Color('#2c2252') },
        uEdgeStrength: { value: 0.09 },
        uIsHD: { value: 0 },
      },
      vertexShader: PRESENT_VERTEX_SHADER,
      fragmentShader: PRESENT_FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false,
    });
    this.presentScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.presentMat));

    this._camRight = new THREE.Vector3();
    this._camUp = new THREE.Vector3();
    this._camFwd = new THREE.Vector3();
    this._rawCamPos = new THREE.Vector3();
    this._desiredTarget = new THREE.Vector3();
    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this.setQualityMode('pixel-fine');
    this.resize(w, h);
  }

  _createRenderTarget(viewW, viewH) {
    const isHD = this.qualityMode === 'hd';
    const aspect = Math.max(0.5, viewW / Math.max(1, viewH));
    const hdScale = Math.min(Math.max(window.devicePixelRatio || 1, 1.25), 1.5);
    const rtH = isHD ? Math.round(viewH * hdScale) : this.targetVerticalRes;
    const rtW = isHD ? Math.round(viewW * hdScale) : Math.max(160, Math.round(rtH * aspect));

    const depthTex = new THREE.DepthTexture(rtW, rtH);
    depthTex.format = THREE.DepthFormat;
    depthTex.type = THREE.UnsignedIntType;
    depthTex.minFilter = THREE.NearestFilter;
    depthTex.magFilter = THREE.NearestFilter;

    const filter = isHD ? THREE.LinearFilter : THREE.NearestFilter;
    const rt = new THREE.WebGLRenderTarget(rtW, rtH, {
      minFilter: filter,
      magFilter: filter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      generateMipmaps: false,
      depthBuffer: true,
      depthTexture: depthTex,
    });
    rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
    return rt;
  }

  setQualityMode(mode) {
    this.qualityMode = mode;
    this.presentMat.uniforms.uIsHD.value = mode === 'hd' ? 1.0 : 0.0;
    if (mode === 'hd') {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      this.renderer.domElement.style.imageRendering = 'auto';
    } else {
      this.targetVerticalRes = mode === 'pixel-fine' ? 360 : 250;
      this.renderer.setPixelRatio(1);
      this.renderer.domElement.style.imageRendering = 'pixelated';
    }
    this.resize(
      this.container.clientWidth || window.innerWidth,
      this.container.clientHeight || window.innerHeight
    );
  }

  setTitleOrbit(enabled) {
    this.titleOrbit = enabled;
  }

  setCinematicMode(enabled, snapFocusPos = null) {
    this.cinematicActive = Boolean(enabled);
    if (!this.cinematicActive) {
      if (this.perspCam.fov !== 34) {
        this.perspCam.fov = 34;
        this.perspCam.updateProjectionMatrix();
      }
      if (snapFocusPos) {
        this.targetPos.set(snapFocusPos.x, snapFocusPos.y + 0.95, snapFocusPos.z - 0.5);
      }
    }
  }

  setCinematicCamera(pos, lookAt, fov = 34) {
    if (this.perspCam.fov !== fov) {
      this.perspCam.fov = fov;
      this.perspCam.updateProjectionMatrix();
    }
    this.perspCam.position.copy(pos);
    this.perspCam.lookAt(lookAt);
    this.perspCam.updateMatrixWorld();

    this.presentMat.uniforms.uSubTexelShift.value.set(0, 0);
    this.presentMat.uniforms.uIsOrtho.value = 0;
    this.presentMat.uniforms.uCameraNear.value = this.perspCam.near;
    this.presentMat.uniforms.uCameraFar.value = this.perspCam.far;
    this.presentMat.uniforms.uEdgeStrength.value = 0.072;
  }

  resize(viewW, viewH) {
    if (!viewW || !viewH) return;
    this.aspect = viewW / viewH;
    this.renderer.setSize(viewW, viewH, false);

    if (this.renderTarget) {
      this.renderTarget.depthTexture?.dispose();
      this.renderTarget.dispose();
    }
    this.renderTarget = this._createRenderTarget(viewW, viewH);
    this.presentMat.uniforms.tDiffuse.value = this.renderTarget.texture;
    this.presentMat.uniforms.tDepth.value = this.renderTarget.depthTexture;
    this.presentMat.uniforms.uTexSize.value.set(this.renderTarget.width, this.renderTarget.height);

    this._updateOrthoFrustum(this.currentHalfH);
    this.perspCam.aspect = this.aspect;
    this.perspCam.updateProjectionMatrix();
  }

  _updateOrthoFrustum(halfH) {
    this.orthoCam.left = -halfH * this.aspect;
    this.orthoCam.right = halfH * this.aspect;
    this.orthoCam.top = halfH;
    this.orthoCam.bottom = -halfH;
    this.orthoCam.updateProjectionMatrix();
  }

  adjustZoom(delta) {
    this.targetHalfH = Math.max(5.5, Math.min(20.0, this.targetHalfH + delta));
  }

  rotateYaw(deltaRad) {
    this.targetYawOffset = Math.max(-0.95, Math.min(0.95, this.targetYawOffset + deltaRad));
  }

  toggleMode() {
    this.mode = this.mode === 'diorama' ? 'panoramic' : 'diorama';
    return this.mode;
  }

  getActiveCamera() {
    if (this.titleOrbit || this.cinematicActive) return this.perspCam;
    return this.mode === 'panoramic' ? this.perspCam : this.orthoCam;
  }

  getGroundBasis(outForward, outRight) {
    const cam = this.getActiveCamera();
    cam.getWorldDirection(outForward);
    outForward.y = 0;
    if (outForward.lengthSq() < 1e-5) outForward.set(0, 0, -1);
    outForward.normalize();
    outRight.set(-outForward.z, 0, outForward.x).normalize();
  }

  screenToWorldOnPlane(clientX, clientY, planeY = 0) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this._ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this._ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._ndc, this.getActiveCamera());
    this._plane.constant = -planeY;
    const hit = new THREE.Vector3();
    return this._raycaster.ray.intersectPlane(this._plane, hit);
  }

  updateCamera(focusPos, playerVel, isSitting, dt) {
    if (this.cinematicActive) return;
    if (this.titleOrbit) {
      this.orbitAngle += dt * 0.085;
      const r = 64.0;
      const lookCenter = new THREE.Vector3(-4.0, 2.2, -3.0);
      this.perspCam.position.set(
        lookCenter.x + Math.sin(this.orbitAngle) * r,
        30.0,
        lookCenter.z + Math.cos(this.orbitAngle) * r
      );
      this.perspCam.lookAt(lookCenter);
      this.perspCam.updateMatrixWorld();

      this.presentMat.uniforms.uSubTexelShift.value.set(0, 0);
      this.presentMat.uniforms.uIsOrtho.value = 0;
      this.presentMat.uniforms.uCameraNear.value = this.perspCam.near;
      this.presentMat.uniforms.uCameraFar.value = this.perspCam.far;
      this.presentMat.uniforms.uEdgeStrength.value = 0.07;
      return;
    }

    const sitTarget = isSitting ? 1 : 0;
    this.sitZoomBias += (sitTarget - this.sitZoomBias) * (1 - Math.exp(-dt * 2.5));
    this.userYawOffset += (this.targetYawOffset - this.userYawOffset) * (1 - Math.exp(-dt * 7.0));

    const yaw = this.baseYaw + this.userYawOffset;
    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);

    const desiredLookX = (playerVel?.x ?? 0) * 0.28;
    const desiredLookZ = (playerVel?.z ?? 0) * 0.28;
    this.lookAhead.x += (desiredLookX - this.lookAhead.x) * (1 - Math.exp(-dt * 4.5));
    this.lookAhead.z += (desiredLookZ - this.lookAhead.z) * (1 - Math.exp(-dt * 4.5));

    const planarSpeed = Math.hypot(playerVel?.x ?? 0, playerVel?.z ?? 0);
    const runTarget = Math.min(Math.max((planarSpeed - 5.2) / 2.0, 0), 1);
    this.runZoomBias += (runTarget - this.runZoomBias) * (1 - Math.exp(-dt * (runTarget > this.runZoomBias ? 1.2 : 0.8)));

    if (this.mode === 'diorama') {
      const desiredH = this.targetHalfH + this.sitZoomBias * 2.8 + this.runZoomBias * 0.9;
      this.currentHalfH += (desiredH - this.currentHalfH) * (1 - Math.exp(-dt * 6.0));
      this._updateOrthoFrustum(this.currentHalfH);

      this._desiredTarget.set(
        focusPos.x + this.lookAhead.x,
        focusPos.y + 0.95,
        focusPos.z + this.lookAhead.z - 0.5
      );
      // Planar follow stays tight; height follows softly so jumps don't bob the view
      const kPlanar = 1 - Math.exp(-dt * 7.5);
      const kHeight = 1 - Math.exp(-dt * 3.2);
      this.targetPos.x += (this._desiredTarget.x - this.targetPos.x) * kPlanar;
      this.targetPos.z += (this._desiredTarget.z - this.targetPos.z) * kPlanar;
      this.targetPos.y += (this._desiredTarget.y - this.targetPos.y) * kHeight;

      const distHoriz = 36.0;
      const height = 47.0;
      this._rawCamPos.set(
        this.targetPos.x + sinY * distHoriz,
        this.targetPos.y + height,
        this.targetPos.z + cosY * distHoriz
      );

      this.orthoCam.position.copy(this._rawCamPos);
      this.orthoCam.lookAt(this.targetPos);
      this.orthoCam.updateMatrixWorld();

      if (this.qualityMode !== 'hd') {
        this._camRight.setFromMatrixColumn(this.orthoCam.matrixWorld, 0).normalize();
        this._camUp.setFromMatrixColumn(this.orthoCam.matrixWorld, 1).normalize();
        this._camFwd.setFromMatrixColumn(this.orthoCam.matrixWorld, 2).normalize();

        const rtW = this.renderTarget.width;
        const rtH = this.renderTarget.height;
        const texelW = (this.orthoCam.right - this.orthoCam.left) / rtW;
        const texelH = (this.orthoCam.top - this.orthoCam.bottom) / rtH;

        const projX = this._rawCamPos.dot(this._camRight);
        const projY = this._rawCamPos.dot(this._camUp);
        const projZ = this._rawCamPos.dot(this._camFwd);

        const snappedX = Math.round(projX / texelW) * texelW;
        const snappedY = Math.round(projY / texelH) * texelH;
        const remPxX = (projX - snappedX) / texelW;
        const remPxY = (projY - snappedY) / texelH;

        this.orthoCam.position
          .set(0, 0, 0)
          .addScaledVector(this._camRight, snappedX)
          .addScaledVector(this._camUp, snappedY)
          .addScaledVector(this._camFwd, projZ);
        this.orthoCam.updateMatrixWorld();

        this.presentMat.uniforms.uSubTexelShift.value.set(remPxX / rtW, remPxY / rtH);
      } else {
        this.presentMat.uniforms.uSubTexelShift.value.set(0, 0);
      }
      this.presentMat.uniforms.uIsOrtho.value = 1;
      this.presentMat.uniforms.uCameraNear.value = this.orthoCam.near;
      this.presentMat.uniforms.uCameraFar.value = this.orthoCam.far;
      this.presentMat.uniforms.uEdgeStrength.value =
        this.qualityMode === 'pixel-retro' ? 0.105 : this.qualityMode === 'hd' ? 0.068 : 0.08;
    } else {
      this._desiredTarget.set(
        focusPos.x * 0.72 + this.lookAhead.x,
        focusPos.y + 1.4,
        focusPos.z * 0.72 + this.lookAhead.z - 2.0
      );
      this.targetPos.lerp(this._desiredTarget, 1 - Math.exp(-dt * 5.0));

      const distHoriz = 48.0 * (this.targetHalfH / 11.8);
      const height = 27.0 * (this.targetHalfH / 11.8);
      this.perspCam.position.set(
        this.targetPos.x + sinY * distHoriz,
        this.targetPos.y + height,
        this.targetPos.z + cosY * distHoriz
      );
      this.perspCam.lookAt(this.targetPos);
      this.perspCam.updateMatrixWorld();

      this.presentMat.uniforms.uSubTexelShift.value.set(0, 0);
      this.presentMat.uniforms.uIsOrtho.value = 0;
      this.presentMat.uniforms.uCameraNear.value = this.perspCam.near;
      this.presentMat.uniforms.uCameraFar.value = this.perspCam.far;
      this.presentMat.uniforms.uEdgeStrength.value = 0.075;
    }
  }

  render(scene) {
    const cam = this.getActiveCamera();
    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.render(scene, cam);

    this.renderer.setRenderTarget(null);
    this.renderer.render(this.presentScene, this.presentCam);
  }
}

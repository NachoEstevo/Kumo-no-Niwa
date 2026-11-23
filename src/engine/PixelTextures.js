import * as THREE from 'three';

const cache = new Map();

function makePainterlyTexture(width, height, drawFn, { repeat = true, mipmaps = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, width, height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = mipmaps;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function hash2(x, y, seed = 1) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

export function getLeafClusterTexture(kind = 'sakura') {
  const key = `leaf-hd-${kind}`;
  if (cache.has(key)) return cache.get(key);

  const tex = makePainterlyTexture(
    64,
    64,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);

      if (kind === 'bamboo') {
        const blades = [
          [32, 34, -0.8, 22, 6, '#9ed058'],
          [32, 34, -0.35, 25, 6, '#b4df6d'],
          [32, 34, 0.25, 26, 6, '#a8d662'],
          [32, 34, 0.78, 21, 5.5, '#8bc04a'],
          [32, 32, -1.25, 17, 5, '#7db13f'],
          [32, 32, 1.2, 18, 5, '#7db13f'],
        ];
        blades.forEach(([cx, cy, ang, len, wid, col]) => {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(ang);
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.ellipse(0, -len * 0.5, wid, len * 0.55, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
        return;
      }

      // Stylized painterly blossom/maple cluster (base light tint, vertex/material drives color)
      const puffs = [
        [32, 32, 16, '#ede7e7'],
        [20, 26, 12, '#f5f0f0'],
        [44, 26, 12, '#f3ecec'],
        [32, 18, 12, '#ffffff'],
        [22, 42, 11, '#dfd6d8'],
        [42, 42, 11, '#dfd6d8'],
        [14, 34, 9, '#ebe3e4'],
        [50, 34, 9, '#ebe3e4'],
      ];
      puffs.forEach(([cx, cy, r, col]) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      });

      // Delicate inner leaf/petal highlights
      for (let i = 0; i < 18; i++) {
        const px = 14 + hash2(i, 1, 5) * 36;
        const py = 12 + hash2(i, 2, 9) * 36;
        const rad = 2.5 + hash2(i, 3, 12) * 3.5;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.45)' : 'rgba(210,195,205,0.35)';
        ctx.beginPath();
        ctx.arc(px, py, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    { repeat: false, mipmaps: false }
  );

  cache.set(key, tex);
  return tex;
}

export function getGrassTurfTexture() {
  const key = 'grass-turf-hd';
  if (cache.has(key)) return cache.get(key);

  const tex = makePainterlyTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#6c833a';
    ctx.fillRect(0, 0, w, h);

    // Seamless painted mossy patches (wrapped 3x3)
    for (let i = 0; i < 42; i++) {
      const cx = hash2(i, 1, 11) * w;
      const cy = hash2(i, 2, 23) * h;
      const r = 18 + hash2(i, 3, 31) * 28;
      const col =
        i % 3 === 0
          ? 'rgba(122, 146, 66, 0.42)'
          : i % 3 === 1
          ? 'rgba(89, 111, 45, 0.36)'
          : 'rgba(104, 129, 53, 0.35)';

      for (const ox of [-w, 0, w]) {
        for (const oy of [-h, 0, h]) {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(cx + ox, cy + oy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Subtle delicate painted grass strokes
    for (let i = 0; i < 160; i++) {
      const x = hash2(i, 4, 41) * w;
      const y = hash2(i, 5, 53) * h;
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(155, 178, 72, 0.35)' : 'rgba(65, 86, 36, 0.28)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (hash2(i, 6, 7) - 0.5) * 4, y - 5 - hash2(i, 7, 9) * 4);
      ctx.stroke();
    }
  });

  cache.set(key, tex);
  return tex;
}

export function getGrassSprigTexture(hasFlower = false) {
  const key = `grass-sprig-hd-${hasFlower ? 'flower' : 'plain'}`;
  if (cache.has(key)) return cache.get(key);

  const tex = makePainterlyTexture(
    32,
    32,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const blades = [
        [8, 31, 4, 15, 2.2],
        [14, 31, 10, 7, 2.5],
        [19, 31, 22, 8, 2.5],
        [24, 31, 28, 16, 2.2],
      ];
      blades.forEach(([x0, y0, x1, y1, lw]) => {
        const grad = ctx.createLinearGradient(x0, y0, x1, y1);
        grad.addColorStop(0, '#445c29');
        grad.addColorStop(0.55, '#6d8c37');
        grad.addColorStop(1, '#a9c14f');
        ctx.strokeStyle = grad;
        ctx.lineWidth = lw;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo((x0 + x1) * 0.5, y0 - 8, x1, y1);
        ctx.stroke();
      });

      if (hasFlower) {
        [
          [11, 8, '#ffd5e3'],
          [22, 10, '#ffe8ef'],
        ].forEach(([fx, fy, col]) => {
          ctx.fillStyle = col;
          for (let a = 0; a < 5; a++) {
            const ang = (a / 5) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(fx + Math.cos(ang) * 2.2, fy + Math.sin(ang) * 2.2, 1.8, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = '#fff0a3';
          ctx.beginPath();
          ctx.arc(fx, fy, 1.4, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    },
    { repeat: false, mipmaps: false }
  );

  cache.set(key, tex);
  return tex;
}

export function getStoneMasonryTexture() {
  const key = 'stone-masonry-hd';
  if (cache.has(key)) return cache.get(key);

  const tex = makePainterlyTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#998b76'; // soft warm mortar
    ctx.fillRect(0, 0, w, h);

    const rows = 4;
    const rowH = h / rows;
    const blockW = w / 2;
    const tones = ['#d7c8ab', '#cebe9f', '#dfd2b8', '#c6b697'];

    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      const offset = (r % 2) * (blockW * 0.5);
      for (let bx = -1; bx < 3; bx++) {
        const x = bx * blockW + offset;
        const tone = tones[(r * 3 + bx + 5) % tones.length];

        // Rounded cut stone flagstone block
        ctx.fillStyle = tone;
        ctx.beginPath();
        ctx.roundRect(x + 3, y + 3, blockW - 6, rowH - 6, 8);
        ctx.fill();

        // Subtle sunlit top-left bevel
        ctx.strokeStyle = 'rgba(248, 240, 224, 0.45)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x + 8, y + rowH - 7);
        ctx.lineTo(x + 8, y + 7);
        ctx.lineTo(x + blockW - 8, y + 7);
        ctx.stroke();

        // Subtle moss tint tucked into corners on some stones
        if ((r + bx) % 3 === 0) {
          ctx.fillStyle = 'rgba(116, 138, 62, 0.28)';
          ctx.beginPath();
          ctx.arc(x + 12, y + rowH - 10, 9, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  });

  cache.set(key, tex);
  return tex;
}

export function getRoofTileTexture() {
  const key = 'roof-tiles-hd';
  if (cache.has(key)) return cache.get(key);

  const tex = makePainterlyTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#475873';
    ctx.fillRect(0, 0, w, h);

    const rows = 6;
    const cols = 12;
    const rowH = h / rows;
    const colW = w / cols;

    for (let r = 0; r < rows; r++) {
      const y0 = r * rowH;
      for (let c = 0; c < cols; c++) {
        const x0 = c * colW;
        const grad = ctx.createLinearGradient(x0, y0, x0 + colW, y0);
        grad.addColorStop(0, '#2e394e');
        grad.addColorStop(0.32, '#4c5f7d');
        grad.addColorStop(0.55, '#7289ad');
        grad.addColorStop(0.85, '#465874');
        grad.addColorStop(1, '#2a3447');
        ctx.fillStyle = grad;
        ctx.fillRect(x0, y0, colW, rowH);
      }

      // Horizontal overlapping tile lip shadow & highlight
      ctx.fillStyle = 'rgba(26, 32, 46, 0.55)';
      ctx.fillRect(0, y0, w, 3.5);
      ctx.fillStyle = 'rgba(155, 178, 214, 0.35)';
      ctx.fillRect(0, y0 + rowH - 3, w, 2);
    }
  });

  cache.set(key, tex);
  return tex;
}

export function getWoodPlankTexture() {
  const key = 'wood-planks-hd';
  if (cache.has(key)) return cache.get(key);

  const tex = makePainterlyTexture(256, 256, (ctx, w, h) => {
    const planks = 6;
    const pH = h / planks;
    const tones = ['#9d6b44', '#92613c', '#a6734b', '#8a5a36'];

    for (let p = 0; p < planks; p++) {
      const y0 = p * pH;
      ctx.fillStyle = tones[p % tones.length];
      ctx.fillRect(0, y0, w, pH);

      // Subtle wood grain lines
      ctx.strokeStyle = 'rgba(84, 51, 28, 0.22)';
      ctx.lineWidth = 1.5;
      for (let g = 0; g < 5; g++) {
        const gy = y0 + 7 + g * (pH / 6);
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.bezierCurveTo(w * 0.33, gy + 2, w * 0.66, gy - 2, w, gy);
        ctx.stroke();
      }

      // Plank bevel & groove
      ctx.fillStyle = '#58361f';
      ctx.fillRect(0, y0, w, 2.5);
      ctx.fillStyle = 'rgba(218, 174, 130, 0.24)';
      ctx.fillRect(0, y0 + 2.5, w, 2);
    }
  });

  cache.set(key, tex);
  return tex;
}

export function getCliffRockTexture() {
  const key = 'cliff-rock-hd';
  if (cache.has(key)) return cache.get(key);

  const tex = makePainterlyTexture(256, 256, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#5a6e31');
    grad.addColorStop(0.14, '#796f64');
    grad.addColorStop(0.55, '#68625e');
    grad.addColorStop(1, '#50505b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Painterly strata bands
    for (let i = 0; i < 18; i++) {
      const y = 26 + i * 13;
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(54, 51, 61, 0.32)' : 'rgba(148, 136, 120, 0.28)';
      ctx.lineWidth = 5 + (i % 3) * 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(w * 0.33, y + 6, w * 0.66, y - 5, w, y);
      ctx.stroke();
    }

    // Soft moss drapes near top rim
    for (let i = 0; i < 14; i++) {
      const cx = (i / 14) * w + 8;
      ctx.fillStyle = 'rgba(92, 118, 47, 0.62)';
      ctx.beginPath();
      ctx.ellipse(cx, 18 + (i % 3) * 7, 16, 11, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  cache.set(key, tex);
  return tex;
}

export function createRakedGravelTexture(bounds, rocks) {
  return makePainterlyTexture(
    512,
    320,
    (ctx, w, h) => {
      const img = ctx.createImageData(w, h);
      for (let py = 0; py < h; py++) {
        const wz = bounds.minZ + (py / h) * (bounds.maxZ - bounds.minZ);
        for (let px = 0; px < w; px++) {
          const wx = bounds.minX + (px / w) * (bounds.maxX - bounds.minX);
          let wave = Math.sin(wz * 16.0 + Math.sin(wx * 0.9) * 0.9);
          for (let i = 0; i < rocks.length; i++) {
            const rk = rocks[i];
            const d = Math.hypot(wx - rk.x, wz - rk.z);
            if (d < rk.r + 1.45) {
              wave = Math.sin(d * 17.5);
              break;
            }
          }
          const t = wave * 0.5 + 0.5;
          const idx = (py * w + px) * 4;
          img.data[idx] = Math.round(206 + t * 28);
          img.data[idx + 1] = Math.round(198 + t * 27);
          img.data[idx + 2] = Math.round(181 + t * 26);
          img.data[idx + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    { repeat: false }
  );
}

export function getSnowGroundTexture() {
  const key = 'snow-ground-hd';
  if (cache.has(key)) return cache.get(key);

  const tex = makePainterlyTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#e4eff7';
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 40; i++) {
      const cx = hash2(i, 1, 101) * w;
      const cy = hash2(i, 2, 102) * h;
      const r = 20 + hash2(i, 3, 103) * 32;
      const col =
        i % 3 === 0
          ? 'rgba(165, 190, 220, 0.34)'
          : i % 3 === 1
          ? 'rgba(248, 252, 255, 0.55)'
          : 'rgba(196, 214, 236, 0.30)';
      for (const ox of [-w, 0, w]) {
        for (const oy of [-h, 0, h]) {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(cx + ox, cy + oy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    for (let i = 0; i < 120; i++) {
      const x = hash2(i, 4, 104) * w;
      const y = hash2(i, 5, 105) * h;
      ctx.strokeStyle = i % 3 === 0 ? 'rgba(255, 255, 255, 0.65)' : 'rgba(148, 174, 210, 0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 8 + hash2(i, 6, 106) * 10, y + (hash2(i, 7, 107) - 0.5) * 3);
      ctx.stroke();
    }

    for (let i = 0; i < 18; i++) {
      const x = hash2(i, 8, 108) * w;
      const y = hash2(i, 9, 109) * h;
      ctx.fillStyle = 'rgba(126, 138, 156, 0.42)';
      ctx.beginPath();
      ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
  });

  cache.set(key, tex);
  return tex;
}

export function getPaddyGrassTexture() {
  const key = 'paddy-grass-hd';
  if (cache.has(key)) return cache.get(key);

  const tex = makePainterlyTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#829c3f';
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 40; i++) {
      const cx = hash2(i, 1, 201) * w;
      const cy = hash2(i, 2, 202) * h;
      const r = 18 + hash2(i, 3, 203) * 26;
      const col =
        i % 3 === 0
          ? 'rgba(166, 180, 74, 0.40)'
          : i % 3 === 1
          ? 'rgba(104, 134, 52, 0.36)'
          : 'rgba(138, 162, 64, 0.35)';
      for (const ox of [-w, 0, w]) {
        for (const oy of [-h, 0, h]) {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(cx + ox, cy + oy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    for (let i = 0; i < 160; i++) {
      const x = hash2(i, 4, 204) * w;
      const y = hash2(i, 5, 205) * h;
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(202, 198, 92, 0.40)' : 'rgba(84, 108, 38, 0.28)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (hash2(i, 6, 206) - 0.5) * 5, y - 5 - hash2(i, 7, 207) * 5);
      ctx.stroke();
    }
  });

  cache.set(key, tex);
  return tex;
}

export function getMossForestTexture() {
  const key = 'moss-forest-hd';
  if (cache.has(key)) return cache.get(key);

  const tex = makePainterlyTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#3f6338';
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 46; i++) {
      const cx = hash2(i, 1, 301) * w;
      const cy = hash2(i, 2, 302) * h;
      const r = 16 + hash2(i, 3, 303) * 28;
      const col =
        i % 3 === 0
          ? 'rgba(78, 125, 62, 0.45)'
          : i % 3 === 1
          ? 'rgba(42, 72, 38, 0.42)'
          : 'rgba(62, 104, 52, 0.36)';
      for (const ox of [-w, 0, w]) {
        for (const oy of [-h, 0, h]) {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(cx + ox, cy + oy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    for (let i = 0; i < 90; i++) {
      const x = hash2(i, 4, 304) * w;
      const y = hash2(i, 5, 305) * h;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(132, 186, 114, 0.28)' : 'rgba(28, 46, 26, 0.32)';
      ctx.beginPath();
      ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
  });

  cache.set(key, tex);
  return tex;
}

export function getFestivalCobbleTexture() {
  const key = 'festival-cobble-hd';
  if (cache.has(key)) return cache.get(key);

  const tex = makePainterlyTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#5e6276';
    ctx.fillRect(0, 0, w, h);

    const rows = 4;
    const rowH = h / rows;
    const blockW = w / 3;
    const tones = ['#8b8c9f', '#968f9c', '#7e8194', '#8f92a6'];

    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      const offset = (r % 2) * (blockW * 0.5);
      for (let bx = -1; bx < 4; bx++) {
        const x = bx * blockW + offset;
        ctx.fillStyle = tones[(r * 5 + bx + 9) % tones.length];
        ctx.beginPath();
        ctx.roundRect(x + 2.5, y + 2.5, blockW - 5, rowH - 5, 7);
        ctx.fill();

        ctx.strokeStyle = 'rgba(226, 224, 240, 0.32)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 7, y + rowH - 7);
        ctx.lineTo(x + 7, y + 7);
        ctx.lineTo(x + blockW - 7, y + 7);
        ctx.stroke();
      }
    }
  });

  cache.set(key, tex);
  return tex;
}

export function getGoldenCraterTexture() {
  const key = 'golden-crater-hd';
  if (cache.has(key)) return cache.get(key);

  const tex = makePainterlyTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#b5a76e';
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 42; i++) {
      const cx = hash2(i, 1, 501) * w;
      const cy = hash2(i, 2, 502) * h;
      const r = 18 + hash2(i, 3, 503) * 28;
      const col =
        i % 3 === 0
          ? 'rgba(222, 206, 146, 0.42)'
          : i % 3 === 1
          ? 'rgba(148, 152, 88, 0.34)'
          : 'rgba(196, 178, 118, 0.36)';
      for (const ox of [-w, 0, w]) {
        for (const oy of [-h, 0, h]) {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(cx + ox, cy + oy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    for (let i = 0; i < 110; i++) {
      const x = hash2(i, 4, 504) * w;
      const y = hash2(i, 5, 505) * h;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 244, 198, 0.35)' : 'rgba(122, 114, 72, 0.25)';
      ctx.beginPath();
      ctx.arc(x, y, 1.5 + (i % 2), 0, Math.PI * 2);
      ctx.fill();
    }
  });

  cache.set(key, tex);
  return tex;
}

export function getFernSprigTexture() {
  const key = 'fern-sprig-hd';
  if (cache.has(key)) return cache.get(key);

  const tex = makePainterlyTexture(
    32,
    32,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const fronds = [
        [16, 31, 6, 12, -0.4],
        [16, 31, 16, 5, 0],
        [16, 31, 26, 13, 0.4],
      ];
      fronds.forEach(([x0, y0, x1, y1]) => {
        ctx.strokeStyle = '#3c6e38';
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo((x0 + x1) * 0.5, y0 - 10, x1, y1);
        ctx.stroke();

        for (let s = 1; s <= 4; s++) {
          const t = s / 5;
          const fx = x0 + (x1 - x0) * t;
          const fy = y0 + (y1 - y0) * t;
          ctx.fillStyle = s > 2 ? '#78b85c' : '#539448';
          ctx.beginPath();
          ctx.ellipse(fx - 2.4, fy, 2.5, 1.1, -0.35, 0, Math.PI * 2);
          ctx.ellipse(fx + 2.4, fy, 2.5, 1.1, 0.35, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    },
    { repeat: false, mipmaps: false }
  );

  cache.set(key, tex);
  return tex;
}

export function getRiceStalkTexture() {
  const key = 'rice-stalk-hd';
  if (cache.has(key)) return cache.get(key);

  const tex = makePainterlyTexture(
    32,
    32,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const stalks = [
        [10, 31, 6, 9, '#a4bd48'],
        [14, 31, 12, 5, '#d1ca5a'],
        [18, 31, 20, 6, '#e2d462'],
        [23, 31, 27, 11, '#8ea93c'],
      ];
      stalks.forEach(([x0, y0, x1, y1, col]) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.1;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(x0 + 1, y0 - 12, x1, y1);
        ctx.stroke();
        ctx.fillStyle = '#f5e67d';
        ctx.beginPath();
        ctx.ellipse(x1, y1 + 1.5, 2.2, 1.3, 0.4, 0, Math.PI * 2);
        ctx.fill();
      });
    },
    { repeat: false, mipmaps: false }
  );

  cache.set(key, tex);
  return tex;
}

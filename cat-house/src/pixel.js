// 像素绘制底层：精灵图解析、调色板上色、缓存成离屏画布再整块贴上去。
// 所有坐标都是「虚拟像素」，主画布统一用 setTransform(S,0,0,S,0,0) 放大，
// 并且关掉平滑，所以一个虚拟像素 = 屏幕上 S×S 的硬边方块。
window.DOLL = window.DOLL || {};
(function (D) {
  'use strict';
  const PX = {};

  // 色码 -> 调色板键。'.' 是透明
  // o 描边 / W 亮毛 / w 暗毛 / d 更暗的毛 / P 点色 / p 点色暗 / q 点色亮
  // M 脸中央（海双是白、火焰色是点色）/ i 耳内粉 / E 眼 / k 瞳 / e 高光 / n 鼻 / t 舌
  PX.CODES = 'oWwdPpqMiEkentS';

  PX.CAT_PAL = {
    luna: {
      o: '#3C3034', W: '#FFFFFF', w: '#E3D8D2', d: '#C4B5AE',
      P: '#6E5C54', p: '#493934', q: '#8E7B72',
      M: '#FFFFFF', i: '#C99A96',
      E: '#2E6CC9', k: '#15121F', e: '#FFFFFF', n: '#6E5450', t: '#E58B9A',
      S: '#A08F88'
    },
    nova: {
      o: '#5A3A26', W: '#FFF7EC', w: '#F2E0C8', d: '#E2C8A4',
      P: '#E08A4A', p: '#B65F28', q: '#F3AE74',
      M: '#F6C79A', i: '#F0B8AE',
      E: '#3B8DDF', k: '#15121F', e: '#FFFFFF', n: '#E99B95', t: '#E58B9A',
      S: '#C99A6E'
    }
  };

  // 把字符串数组变成 {w,h,rows}
  PX.sprite = function (art, meta) {
    const w = Math.max.apply(null, art.map(r => r.length));
    const rows = art.map(r => r.length < w ? r + '.'.repeat(w - r.length) : r);
    return Object.assign({ w: w, h: rows.length, rows: rows }, meta || {});
  };

  // ---------- 上色 + 缓存 ----------
  const cache = new Map();

  function bake(sp, pal, flip, key) {
    const cv = document.createElement('canvas');
    cv.width = sp.w; cv.height = sp.h;
    const c = cv.getContext('2d');
    for (let y = 0; y < sp.h; y++) {
      const row = sp.rows[y];
      for (let x = 0; x < sp.w; x++) {
        const ch = row[x];
        if (ch === '.' || ch === undefined) continue;
        const col = pal[ch];
        if (!col) continue;
        c.fillStyle = col;
        c.fillRect(flip ? sp.w - 1 - x : x, y, 1, 1);
      }
    }
    cache.set(key, cv);
    return cv;
  }

  PX.baked = function (sp, pal, palId, flip) {
    const key = (sp.id || sp.rows[0]) + '|' + sp.h + '|' + palId + '|' + (flip ? 1 : 0);
    let cv = cache.get(key);
    if (!cv) cv = bake(sp, pal, flip, key);
    return cv;
  };

  // x,y = 左上角（虚拟像素，会取整）
  PX.blit = function (ctx, sp, x, y, pal, palId, flip) {
    const cv = PX.baked(sp, pal, palId, flip);
    ctx.drawImage(cv, Math.round(x), Math.round(y));
  };

  // 按列逐条贴，每条竖切片单独上下错开 —— 用来做脊背的弯曲。
  // dyAt 收到的永远是「没翻转」的列号，所以弯法跟着猫的解剖走，不跟着朝向走。
  //
  // 切片必须先在 1:1 的离屏画布上拼好再整块贴。直接一列一列往主画布上贴的话，
  // 主画布的缩放是 Z*dpr，dpr 是 1.25 / 1.5 这种小数时每列落在非整数边界上，
  // 列缝里会漏出背景，猫身上就挂一条条竖条纹（整数缩放的 dev 页看不出来）。
  const bentCv = document.createElement('canvas');
  PX.blitBent = function (ctx, sp, x, y, pal, palId, flip, dyAt) {
    const cv = PX.baked(sp, pal, palId, flip);
    const X = Math.round(x), Y = Math.round(y);
    const dys = new Array(sp.w);
    let lo = 0, hi = 0;
    for (let c = 0; c < sp.w; c++) {
      const d = Math.round(dyAt(flip ? sp.w - 1 - c : c));
      dys[c] = d;
      if (d < lo) lo = d;
      if (d > hi) hi = d;
    }
    const h = sp.h + (hi - lo);
    if (bentCv.width < sp.w) bentCv.width = sp.w;
    if (bentCv.height < h) bentCv.height = h;
    const b = bentCv.getContext('2d');
    b.imageSmoothingEnabled = false;
    b.clearRect(0, 0, bentCv.width, bentCv.height);
    for (let c = 0; c < sp.w; c++) b.drawImage(cv, c, 0, 1, sp.h, c, dys[c] - lo, 1, sp.h);
    ctx.drawImage(bentCv, 0, 0, sp.w, h, X, Y + lo, sp.w, h);
  };

  PX.blitBentAnchored = function (ctx, sp, x, y, pal, palId, flip, dyAt) {
    const ax = sp.ax === undefined ? (sp.w >> 1) : sp.ax;
    const ay = sp.ay === undefined ? sp.h : sp.ay;
    const left = flip ? x - (sp.w - 1 - ax) : x - ax;
    PX.blitBent(ctx, sp, left, y - ay, pal, palId, flip, dyAt);
  };

  // 以锚点（脚下中心）对齐
  PX.blitAnchored = function (ctx, sp, x, y, pal, palId, flip) {
    const ax = sp.ax === undefined ? (sp.w >> 1) : sp.ax;
    const ay = sp.ay === undefined ? sp.h : sp.ay;
    const left = flip ? x - (sp.w - 1 - ax) : x - ax;
    PX.blit(ctx, sp, left, y - ay, pal, palId, flip);
  };

  // 精灵里某一块区域（比如眼睛那一条）的左上角换算到世界坐标
  PX.regionOf = function (sp, spot, width, x, y, flip) {
    const ax = sp.ax === undefined ? (sp.w >> 1) : sp.ax;
    const ay = sp.ay === undefined ? sp.h : sp.ay;
    const left = flip ? x - (sp.w - 1 - ax) : x - ax;
    const sx = flip ? (sp.w - spot[0] - width) : spot[0];
    return [left + sx, y - ay + spot[1]];
  };

  // 精灵里某个局部坐标（比如眼睛位置）换算到世界坐标
  PX.spotOf = function (sp, spot, x, y, flip) {
    const ax = sp.ax === undefined ? (sp.w >> 1) : sp.ax;
    const ay = sp.ay === undefined ? sp.h : sp.ay;
    const left = flip ? x - (sp.w - 1 - ax) : x - ax;
    const sx = flip ? sp.w - 1 - spot[0] : spot[0];
    return [left + sx, y - ay + spot[1]];
  };

  // ---------- 像素图元 ----------
  PX.rect = function (ctx, x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };

  PX.frame = function (ctx, x, y, w, h, col) {
    ctx.fillStyle = col;
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    ctx.fillRect(x, y, w, 1);
    ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x, y, 1, h);
    ctx.fillRect(x + w - 1, y, 1, h);
  };

  // 实心椭圆（逐行算宽度，边缘是硬的）
  PX.ellipse = function (ctx, cx, cy, rx, ry, col) {
    ctx.fillStyle = col;
    cx = Math.round(cx); cy = Math.round(cy);
    for (let y = -ry; y <= ry; y++) {
      const k = 1 - (y * y) / (ry * ry);
      if (k < 0) continue;
      const w = Math.round(rx * Math.sqrt(k));
      if (w <= 0) continue;
      ctx.fillRect(cx - w, cy + y, w * 2, 1);
    }
  };

  // 45° 棋盘点阵，用来做渐变过渡
  PX.dither = function (ctx, x, y, w, h, col, parity) {
    ctx.fillStyle = col;
    x = Math.round(x); y = Math.round(y);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (((i + j) & 1) === (parity || 0)) ctx.fillRect(x + i, y + j, 1, 1);
      }
    }
  };

  // 粗线段（画腿用）：沿线每步盖一个圆盘，宽度从 w0 渐变到 w1
  const DISC = {};
  function discRows(r) {
    const k = Math.round(r * 2);
    if (DISC[k]) return DISC[k];
    const rr = k / 2, n = Math.floor(rr), rows = [];
    for (let y = -n; y <= n; y++) {
      const hw = Math.floor(Math.sqrt(Math.max(0, rr * rr - y * y)) + 0.35);
      if (hw >= 0) rows.push([y, hw]);
    }
    DISC[k] = rows;
    return rows;
  }
  PX.thickLine = function (ctx, x0, y0, x1, y1, w0, w1, col) {
    ctx.fillStyle = col;
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = Math.round(x0 + (x1 - x0) * t);
      const y = Math.round(y0 + (y1 - y0) * t);
      const rows = discRows(Math.max(0.5, (w0 + (w1 - w0) * t) / 2));
      for (const [dy, hw] of rows) ctx.fillRect(x - hw, y + dy, hw * 2 + 1, 1);
    }
  };

  PX.line = function (ctx, x0, y0, x1, y1, col) {
    ctx.fillStyle = col;
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      ctx.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  };

  // 5x7 像素字（只够画数字和几个符号，中文还是交给 DOM）
  const FONT = {
    '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
    '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
    '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
    '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
    '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
    '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
    '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
    '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
    '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
    '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
    '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
    'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    'v': ['00000', '00000', '10001', '10001', '10001', '01010', '00100'],
    ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000']
  };
  PX.text = function (ctx, str, x, y, col) {
    ctx.fillStyle = col;
    let cx = Math.round(x);
    for (const ch of String(str)) {
      const g = FONT[ch] || FONT[' '];
      for (let j = 0; j < 7; j++) {
        for (let i = 0; i < 5; i++) if (g[j][i] === '1') ctx.fillRect(cx + i, Math.round(y) + j, 1, 1);
      }
      cx += 6;
    }
    return cx - Math.round(x);
  };
  PX.textW = (str) => String(str).length * 6 - 1;

  D.PX = PX;
})(window.DOLL);

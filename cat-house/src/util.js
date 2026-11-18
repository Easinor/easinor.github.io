// 工具函数：插值、随机、样条曲线、绒毛边缘
window.DOLL = window.DOLL || {};
(function (D) {
  'use strict';
  const U = {};

  // ---------- 数值 ----------
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
  U.mix = (a, b, t) => a + (b - a) * U.clamp(t, 0, 1);
  U.smooth = (t) => { t = U.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  U.easeOut = (t) => 1 - Math.pow(1 - U.clamp(t, 0, 1), 3);
  U.easeIn = (t) => Math.pow(U.clamp(t, 0, 1), 3);
  U.easeInOut = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  U.rnd = (a, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  U.rndInt = (a, b) => Math.floor(U.rnd(a, b + 1));
  U.chance = (p) => Math.random() < p;
  U.pick = (arr) => arr[(Math.random() * arr.length) | 0];
  U.approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

  // 加权随机：{key: weight}
  U.weighted = function (table) {
    let total = 0;
    for (const k in table) total += Math.max(0, table[k]);
    if (total <= 0) return Object.keys(table)[0];
    let r = Math.random() * total;
    for (const k in table) {
      r -= Math.max(0, table[k]);
      if (r <= 0) return k;
    }
    return Object.keys(table)[0];
  };

  // 稳定伪随机（同一 index 每帧结果一致，绒毛才不会闪）
  U.hash = function (i) {
    let x = Math.sin(i * 127.1 + 311.7) * 43758.5453123;
    return x - Math.floor(x);
  };
  U.hash2 = function (i, j) {
    let x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453123;
    return x - Math.floor(x);
  };

  // ---------- 颜色 ----------
  U.rgba = function (hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  U.shade = function (hex, amt) { // amt<0 变暗，>0 变亮
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    const f = (v) => U.clamp(Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt)), 0, 255);
    const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
    return `rgb(${r},${g},${b})`;
  };

  // ---------- 几何 ----------
  // 闭合 Catmull-Rom 采样成密集点列（便于统一填充 + 绒毛法线）
  U.sampleClosed = function (pts, per) {
    per = per || 10;
    const n = pts.length, out = [];
    const at = (i) => pts[((i % n) + n) % n];
    for (let i = 0; i < n; i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      for (let s = 0; s < per; s++) {
        const t = s / per, t2 = t * t, t3 = t2 * t;
        out.push([
          .5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          .5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
        ]);
      }
    }
    return out;
  };

  U.pathPts = function (ctx, dense, close) {
    ctx.moveTo(dense[0][0], dense[0][1]);
    for (let i = 1; i < dense.length; i++) ctx.lineTo(dense[i][0], dense[i][1]);
    if (close !== false) ctx.closePath();
  };

  // 沿轮廓画一圈绒毛尖刺（布偶猫的毛茸茸感全靠这个）
  U.furEdge = function (ctx, dense, opt) {
    opt = opt || {};
    const step = opt.step || 7;
    const len = opt.len || 7;
    const seed = opt.seed || 0;
    const phase = opt.phase || 0;
    const n = dense.length;
    ctx.fillStyle = opt.color || '#fff';
    // 自动判断绕向，保证尖刺永远朝外
    let area = 0;
    for (let i = 0; i < n; i++) {
      const p = dense[i], q = dense[(i + 1) % n];
      area += p[0] * q[1] - q[0] * p[1];
    }
    const ccw = area > 0;
    for (let i = 0; i < n; i += step) {
      const h = U.hash(i * 0.37 + seed);
      if (h < (opt.skip || 0)) continue;
      const p = dense[i];
      const a = dense[(i - 2 + n) % n], b = dense[(i + 2) % n];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const m = Math.hypot(dx, dy) || 1;
      // 外法线（点列为顺时针/逆时针皆可，由 opt.flip 决定方向）
      let nx = dy / m, ny = -dx / m;
      if (!ccw) { nx = -nx; ny = -ny; }
      if (opt.flip) { nx = -nx; ny = -ny; }
      const L = len * (0.55 + h * 0.9) * (1 + 0.12 * Math.sin(phase + i * 0.3));
      const w = (opt.w || 4) * (0.6 + U.hash(i + 13 + seed) * 0.8);
      const sway = (U.hash(i + 71 + seed) - .5) * 0.9;
      const tx = -ny, ty = nx; // 切线
      ctx.beginPath();
      ctx.moveTo(p[0] + tx * w, p[1] + ty * w);
      ctx.quadraticCurveTo(
        p[0] + nx * L * .6 + tx * w * .5 + tx * sway * L * .4,
        p[1] + ny * L * .6 + ty * w * .5 + ty * sway * L * .4,
        p[0] + nx * L + tx * sway * L, p[1] + ny * L + ty * sway * L
      );
      ctx.quadraticCurveTo(
        p[0] + nx * L * .6 - tx * w * .5 + tx * sway * L * .4,
        p[1] + ny * L * .6 - ty * w * .5 + ty * sway * L * .4,
        p[0] - tx * w, p[1] - ty * w
      );
      ctx.closePath();
      ctx.fill();
    }
  };

  // 把一组点稍微向外/内膨胀
  U.inflate = function (pts, amt, cx, cy) {
    if (cx === undefined) {
      cx = 0; cy = 0;
      for (const p of pts) { cx += p[0]; cy += p[1]; }
      cx /= pts.length; cy /= pts.length;
    }
    return pts.map(p => {
      const dx = p[0] - cx, dy = p[1] - cy, m = Math.hypot(dx, dy) || 1;
      return [p[0] + dx / m * amt, p[1] + dy / m * amt];
    });
  };

  // 柔和径向渐变斑块（点色面罩、腹部高光等）
  U.blotch = function (ctx, x, y, rx, ry, color, alpha, rot) {
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, rx * 0.15, 0, 0, rx);
    g.addColorStop(0, U.rgba(color, alpha));
    g.addColorStop(0.55, U.rgba(color, alpha * 0.82));
    g.addColorStop(1, U.rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  U.roundRect = function (ctx, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  U.dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

  D.U = U;
})(window.DOLL);

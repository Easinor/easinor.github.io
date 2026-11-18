// 像素粒子 + 气泡台词。粒子画在虚拟像素层，文字画在屏幕层（中文太小会糊）。
window.DOLL = window.DOLL || {};
(function (D) {
  'use strict';
  const U = D.U, PX = D.PX;
  const FX = { list: [], bubbles: [], toasts: [] };

  FX.spawn = function (kind, x, y, opt) {
    opt = opt || {};
    const n = opt.n || 1;
    for (let i = 0; i < n; i++) {
      FX.list.push({
        kind: kind,
        x: x + U.rnd(-1, 1) * (opt.spread || 0),
        y: y + U.rnd(-1, 1) * (opt.spread || 0) * 0.6,
        vx: (opt.vx === undefined ? U.rnd(-6, 6) : opt.vx) + U.rnd(-2, 2),
        vy: (opt.vy === undefined ? U.rnd(-14, -6) : opt.vy) + U.rnd(-2, 2),
        g: opt.g === undefined ? 5 : opt.g,
        life: 0,
        max: opt.life || U.rnd(1.0, 1.8),
        big: opt.big ? 1 : 0,
        color: opt.color || null,
        drag: opt.drag === undefined ? 0.6 : opt.drag,
        ph: U.rnd(0, 6)
      });
    }
  };

  // 气泡记着是哪只猫说的（opt.cat），画在那只猫头上；没写就算当前照顾的那只
  FX.say = function (text, opt) {
    opt = opt || {};
    const cat = opt.cat || (D.St && D.St.cat) || null;
    // 同一只猫头上只留一个气泡：新的一句直接顶掉旧的（opt.stack 才叠着放），不然连点几下会冒出一串
    FX.bubbles = FX.bubbles.filter(b => b.cat !== cat || (opt.stack && b.life < b.max * 0.7));
    FX.bubbles.push({ text: text, life: 0, max: opt.dur || 2.6, tone: opt.tone || 'normal', cat: cat });
  };

  FX.toast = function (text, x, y, color) {
    FX.toasts.push({ text: text, x: x, y: y, life: 0, max: 1.1, color: color || '#5E9E5C' });
  };

  FX.clear = function () { FX.list.length = 0; FX.bubbles.length = 0; FX.toasts.length = 0; };

  FX.update = function (dt) {
    for (let i = FX.list.length - 1; i >= 0; i--) {
      const p = FX.list[i];
      p.life += dt;
      if (p.life >= p.max) { FX.list.splice(i, 1); continue; }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy *= k;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'zzz' || p.kind === 'heart' || p.kind === 'note') {
        p.x += Math.sin(p.life * 3 + p.ph) * 5 * dt;
      }
    }
    for (let i = FX.bubbles.length - 1; i >= 0; i--) {
      FX.bubbles[i].life += dt;
      if (FX.bubbles[i].life >= FX.bubbles[i].max) FX.bubbles.splice(i, 1);
    }
    for (let i = FX.toasts.length - 1; i >= 0; i--) {
      const t = FX.toasts[i];
      t.life += dt;
      t.y -= 9 * dt;
      if (t.life >= t.max) FX.toasts.splice(i, 1);
    }
  };

  // ---------- 像素图形 ----------
  const ART = {
    heart: ['.oo.oo.', 'ooooooo', 'ooooooo', '.ooooo.', '..ooo..', '...o...'],
    heart_s: ['oo.oo', 'ooooo', '.ooo.', '..o..'],
    zzz: ['ooooo', '...oo', '..oo.', '.oo..', 'ooooo'],
    note: ['..oo', '..oo', '..o.', '..o.', 'ooo.', 'ooo.'],
    sparkle: ['..o..', '.ooo.', 'ooooo', '.ooo.', '..o..'],
    star: ['..o..', '..o..', 'ooooo', '..o..', '.o.o.'],
    crumb: ['oo', 'oo'],
    fur: ['.oo.', 'oooo', '.oo.'],
    drop: ['.o.', 'ooo', 'ooo', '.o.'],
    puff: ['.ooo.', 'ooooo', 'ooooo', '.ooo.'],
    dust: ['.oo.', 'oooo', '.oo.']
  };

  const DEFCOL = {
    heart: '#E8607F', heart_s: '#E8607F', zzz: '#8FA7D8', note: '#7E8BB8',
    sparkle: '#FFD86E', star: '#FFC94A', crumb: '#C98A4B', fur: '#FFFFFF',
    drop: '#6FB4E0', puff: '#EDE3D2', dust: '#C7B39C'
  };

  function stamp(ctx, art, x, y, col) {
    ctx.fillStyle = col;
    x = Math.round(x - art[0].length / 2);
    y = Math.round(y - art.length / 2);
    for (let j = 0; j < art.length; j++) {
      const row = art[j];
      let run = -1;
      for (let i = 0; i <= row.length; i++) {
        const on = row[i] === 'o';
        if (on && run < 0) run = i;
        else if (!on && run >= 0) { ctx.fillRect(x + run, y + j, i - run, 1); run = -1; }
      }
    }
  }

  FX.draw = function (ctx) {
    for (const p of FX.list) {
      const t = p.life / p.max;
      if (t > 0.72 && Math.floor(p.life * 12) % 2) continue;   // 像素闪烁代替淡出
      let art = ART[p.kind] || ART.sparkle;
      if (p.kind === 'heart' && !p.big) art = ART.heart_s;
      if (t < 0.1 && (p.kind === 'heart' || p.kind === 'sparkle')) art = ART.crumb;
      stamp(ctx, art, p.x, p.y, p.color || DEFCOL[p.kind] || '#FFFFFF');
      if (p.kind === 'heart') stamp(ctx, ['o'], p.x - 1, p.y - 1, 'rgba(255,255,255,.7)');
    }
  };

  // ---------- 屏幕层的气泡和飘字（Z = 放大倍数）----------
  // cat：只画这只猫说的气泡（不传就全画，兼容旧调用）
  FX.drawBubbles = function (ctx, sx, sy, Z, cat) {
    let i = 0;
    for (const b of FX.bubbles) {
      if (cat && b.cat && b.cat !== cat) continue;
      const t = b.life / b.max;
      if (t > 0.86 && Math.floor(b.life * 14) % 2) { i++; continue; }
      const fs = Math.max(11, Math.round(3.2 * Z));
      ctx.font = '700 ' + fs + 'px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
      const pad = Math.round(fs * 0.62);
      const w = Math.round(ctx.measureText(b.text).width) + pad * 2;
      const h = Math.round(fs * 1.9);
      const bx = Math.round(sx - w / 2);
      const by = Math.round(sy - i * (h + 5 * Z / 4) - h - 4);
      const bg = b.tone === 'warn' ? '#FFEFD8' : '#FFFFFF';
      const edge = b.tone === 'warn' ? '#C98A4B' : '#6B5A72';
      const u = Math.max(2, Math.round(Z * 0.75));

      ctx.fillStyle = edge;
      ctx.fillRect(bx - u, by, w + u * 2, h);
      ctx.fillRect(bx, by - u, w, h + u * 2);
      ctx.fillStyle = bg;
      ctx.fillRect(bx, by, w, h);
      ctx.fillRect(bx - u, by + u, w + u * 2, h - u * 2);
      // 小尖角
      ctx.fillStyle = edge;
      ctx.fillRect(Math.round(sx - u * 2), by + h, u * 4, u);
      ctx.fillRect(Math.round(sx - u), by + h + u, u * 2, u);
      ctx.fillStyle = bg;
      ctx.fillRect(Math.round(sx - u * 2) + u, by + h - u, u * 2, u * 2);

      ctx.fillStyle = b.tone === 'warn' ? '#95561F' : '#4E3F57';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.text, Math.round(sx), by + Math.round(h / 2));
      i++;
    }
  };

  FX.drawToasts = function (ctx, Z) {
    for (const t of FX.toasts) {
      const k = t.life / t.max;
      if (k > 0.6 && Math.floor(t.life * 14) % 2) continue;
      const fs = Math.max(10, Math.round(2.8 * Z));
      ctx.font = '700 ' + fs + 'px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const x = Math.round(t.x * Z), y = Math.round(t.y * Z);
      ctx.fillStyle = '#FFFFFF';
      for (const d of [[-2, 0], [2, 0], [0, -2], [0, 2]]) ctx.fillText(t.text, x + d[0], y + d[1]);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, x, y);
    }
  };

  D.FX = FX;
})(window.DOLL);

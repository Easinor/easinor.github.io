// 像素房间：墙、窗（天色跟真实时间走）、地板、地毯、猫窝、猫砂盆、饭碗、盆栽
window.DOLL = window.DOLL || {};
(function (D) {
  'use strict';
  const U = D.U, PX = D.PX;
  const S = {};

  S.clouds = [];
  S.birds = [];

  S.init = function () {
    S.clouds = [];
    for (let i = 0; i < 4; i++) {
      S.clouds.push({ x: U.rnd(0, 1), y: U.rnd(.12, .5), s: U.rnd(0, 1) < .5 ? 0 : 1, v: U.rnd(.006, .016) });
    }
    S.birds = [];
  };

  // ---------- 天色 ----------
  const RAMP = [
    { h: 0, a: '#141A3C', b: '#2B2652', star: 1 },
    { h: 5, a: '#2D3060', b: '#6E5279', star: .65 },
    { h: 7, a: '#7FA8DA', b: '#F3C9A6', star: 0 },
    { h: 10, a: '#79B8EA', b: '#CFEAF7', star: 0 },
    { h: 16, a: '#6FB0E6', b: '#D7E9F6', star: 0 },
    { h: 18.5, a: '#5E7BC4', b: '#F2A277', star: 0 },
    { h: 20.5, a: '#303768', b: '#7C5C88', star: .55 },
    { h: 24, a: '#141A3C', b: '#2B2652', star: 1 }
  ];
  function mixHex(h1, h2, t) {
    const p = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const A = p(h1), B = p(h2);
    return `rgb(${Math.round(U.lerp(A[0], B[0], t))},${Math.round(U.lerp(A[1], B[1], t))},${Math.round(U.lerp(A[2], B[2], t))})`;
  }
  S.skyOf = function (hour) {
    let a = RAMP[0], b = RAMP[RAMP.length - 1];
    for (let i = 0; i < RAMP.length - 1; i++) {
      if (hour >= RAMP[i].h && hour <= RAMP[i + 1].h) { a = RAMP[i]; b = RAMP[i + 1]; break; }
    }
    const k = U.clamp(U.invLerp(a.h, b.h, hour), 0, 1);
    const star = U.lerp(a.star, b.star, k);
    return { top: mixHex(a.a, b.a, k), bot: mixHex(a.b, b.b, k), star: star, night: star > .3 };
  };

  // ---------- 布局（全部是虚拟像素）----------
  S.layout = function (VW, VH) {
    const floorY = Math.round(VH * 0.74);
    const winW = Math.round(Math.min(VW * 0.40, 104));
    const winH = Math.round(Math.min(VH * 0.46, 68));
    const catY = floorY + Math.round((VH - floorY) * 0.26);   // 猫踩的那一排地面
    const litter = { x: Math.round(Math.min(VW - 42, VW * 0.85)), y: floorY + 7 };
    const wheelX = Math.round(Math.max(36, VW * 0.17));
    return {
      W: VW, H: VH, floorY: floorY, catY: catY,
      win: { x: Math.round(VW * 0.60), y: Math.round(VH * 0.13), w: winW, h: winH },
      // 三层猫爬架：两层小平台 + 顶上的大垫子（数值是平台面的 y，猫的脚就踩在这）
      tree: { x: Math.round(VW * 0.53), tiers: [floorY - 21, floorY - 41], top: floorY - 62 },
      // 窗台：猫趴在窗台上看风景；上去要先跳到砂盆的靠背上（step），再跳上窗台
      sill: { x: Math.round(VW * 0.60 + winW * 0.42), y: Math.round(VH * 0.13) + winH + 5 },
      step: { x: litter.x - 2, y: litter.y - 23 },
      // 猫跑轮：靠墙立着，跑道内圈底部就是猫踩的地方
      wheel: { x: wheelX, r: 33, ri: 29, cy: catY - 32, runY: catY - 2 },
      bed: { x: Math.round(Math.max(26, VW * 0.08)), y: VH - 5 },
      litter: litter,
      bowl: { x: Math.round(Math.max(88, VW * 0.42)), y: floorY + 10 }   // 碗放在地上，离墙根留一点
    };
  };

  // ---------- 窗 ----------
  function drawWindow(ctx, L, t, sky) {
    const w = L.win;
    PX.rect(ctx, w.x - 2, w.y - 2, w.w + 4, w.h + 4, sky.night ? '#6A5468' : '#A8795A');
    PX.rect(ctx, w.x - 1, w.y - 1, w.w + 2, w.h + 2, sky.night ? '#86687E' : '#C99A72');

    ctx.save();
    ctx.beginPath();
    ctx.rect(w.x, w.y, w.w, w.h);
    ctx.clip();

    // 天空：上下两段 + 中间抖动过渡
    const half = Math.round(w.h * 0.55);
    PX.rect(ctx, w.x, w.y, w.w, half, sky.top);
    PX.rect(ctx, w.x, w.y + half, w.w, w.h - half, sky.bot);
    PX.dither(ctx, w.x, w.y + half - 2, w.w, 2, sky.bot, 0);
    PX.dither(ctx, w.x, w.y + half, w.w, 2, sky.top, 1);

    if (sky.star > .05) {
      for (let i = 0; i < 18; i++) {
        const sx = w.x + Math.floor(U.hash(i * 3.1) * w.w);
        const sy = w.y + Math.floor(U.hash(i * 7.7) * w.h * 0.62);
        if (Math.sin(t * 1.6 + i * 2) > -0.5) {
          ctx.fillStyle = `rgba(255,255,255,${sky.star})`;
          ctx.fillRect(sx, sy, 1, 1);
        }
      }
      // 月亮
      const mx = w.x + Math.round(w.w * 0.72), my = w.y + Math.round(w.h * 0.22);
      PX.ellipse(ctx, mx, my, 5, 5, '#F8EFD2');
      PX.ellipse(ctx, mx - 3, my - 2, 4, 4, sky.top);
    } else {
      const sx = w.x + Math.round(w.w * 0.74), sy = w.y + Math.round(w.h * 0.2);
      PX.ellipse(ctx, sx, sy, 6, 6, 'rgba(255,245,200,.45)');
      PX.ellipse(ctx, sx, sy, 4, 4, '#FFF4C8');
    }

    // 云
    for (const c of S.clouds) {
      const cx = Math.round(w.x + ((c.x + t * c.v) % 1.4 - 0.2) * w.w);
      const cy = Math.round(w.y + c.y * w.h * 0.55);
      const col = sky.night ? 'rgba(190,196,230,.35)' : 'rgba(255,255,255,.9)';
      PX.rect(ctx, cx, cy, c.s ? 11 : 8, 2, col);
      PX.rect(ctx, cx + 2, cy - 2, c.s ? 6 : 4, 2, col);
      PX.rect(ctx, cx - 1, cy + 2, c.s ? 9 : 6, 1, col);
    }

    // 远山
    const hill = sky.night ? '#2C3A5E' : '#9AC0A4';
    const hill2 = sky.night ? '#22304E' : '#7FA98C';
    const base = w.y + w.h;
    for (let i = 0; i < w.w; i++) {
      const hx = w.x + i;
      const h1 = Math.round(7 + 5 * Math.sin(i * 0.22) + 3 * Math.sin(i * 0.07));
      const h2 = Math.round(4 + 3 * Math.sin(i * 0.15 + 2));
      PX.rect(ctx, hx, base - h1, 1, h1, hill);
      PX.rect(ctx, hx, base - h2, 1, h2, hill2);
    }

    // 落在窗外窗沿上的那只小鸟（白天偶尔来）
    const sb = D.Game && D.Game.sillBird;
    if (sb) (sb.kind === 'squirrel' ? drawSquirrel : drawSillBird)(ctx, w, sb, t);

    // 小鸟
    for (const b of S.birds) {
      const bx = Math.round(w.x + b.x * w.w), by = Math.round(w.y + b.y * w.h);
      const col = sky.night ? 'rgba(210,215,245,.6)' : 'rgba(70,80,100,.8)';
      const up = Math.sin(b.ph + t * 9) > 0 ? 1 : 0;
      PX.rect(ctx, bx - 2, by + (up ? 0 : 1), 2, 1, col);
      PX.rect(ctx, bx + 1, by + (up ? 0 : 1), 2, 1, col);
      PX.rect(ctx, bx, by + 1, 1, 1, col);
    }
    ctx.restore();

    // 窗棂
    const frame = sky.night ? '#86687E' : '#C99A72';
    PX.rect(ctx, w.x + ((w.w / 2) | 0) - 1, w.y, 2, w.h, frame);
    PX.rect(ctx, w.x, w.y + ((w.h * 0.46) | 0), w.w, 2, frame);
    // 窗台：做宽一点，猫要趴在上面
    PX.rect(ctx, w.x - 6, w.y + w.h + 2, w.w + 12, 4, sky.night ? '#6A5468' : '#A8795A');
    PX.rect(ctx, w.x - 6, w.y + w.h + 2, w.w + 12, 1, sky.night ? '#86687E' : '#C99A72');
    PX.rect(ctx, w.x - 4, w.y + w.h + 6, w.w + 8, 1, sky.night ? '#4E3E52' : '#8A6247');
  }

  // 窗外的小麻雀：棕背、白肚子、橙嘴，站着时会蹦、会转身、会低头啄；飞的时候扑翅膀
  function drawSillBird(ctx, w, b, t) {
    const x = Math.round(w.x + b.x * w.w), y = Math.round(w.y + b.y * w.h) - 1;   // y = 脚下
    const f = b.face;            // 1 朝右，-1 朝左
    const X = (dx) => f > 0 ? x + dx : x - dx - 1;
    const px = (dx, dy, c) => PX.rect(ctx, X(dx), y + dy, 1, 1, c);
    const brown = '#8A6A52', dark = '#5E4636', belly = '#F4E6CF', beak = '#F0A040', eye = '#1E1A22';
    const flying = b.phase !== 'sit';
    const peck = b.peck > 0 ? 1 : 0;
    // 身子
    for (let dx = -3; dx <= 1; dx++) px(dx, -3, brown);
    for (let dx = -3; dx <= 1; dx++) px(dx, -2, dx >= -1 ? belly : brown);
    for (let dx = -2; dx <= 1; dx++) px(dx, -1, belly);
    px(-4, -3, dark); px(-5, -4, dark);                 // 尾巴往后上翘
    // 头（啄的时候往前下方低一格）
    const hx = 1 + peck, hy = -5 + peck;
    px(hx, hy, brown); px(hx + 1, hy, brown); px(hx, hy + 1, brown); px(hx + 1, hy + 1, belly);
    px(hx + 1, hy, eye);
    px(hx + 2, hy + 1, beak);
    // 翅膀：站着是背上一道深色；飞的时候上下扑
    if (flying) {
      const up = Math.sin(t * 30) > 0;
      px(-2, up ? -5 : -1, dark); px(-1, up ? -5 : -1, dark); px(-1, up ? -4 : 0, dark);
    } else {
      px(-2, -3, dark); px(-1, -3, dark);
      px(-1, 0, dark); px(0, 0, dark);                   // 小细腿
    }
  }

  // 窗外的小松鼠：橘棕色、奶白肚子、一条比身子还大的蓬松尾巴卷在背后；
  // 跑的时候身子压低、尾巴拖平；坐着时立起来，两只前爪捧着坚果，啃的时候头一点一点
  function drawSquirrel(ctx, w, b, t) {
    const x = Math.round(w.x + b.x * w.w), y = Math.round(w.y + w.h) - 1;
    const f = b.face;
    const X = (dx) => f > 0 ? x + dx : x - dx - 1;
    const px = (dx, dy, c) => PX.rect(ctx, X(dx), y + dy, 1, 1, c);
    const row = (x0, x1, dy, c) => { for (let dx = x0; dx <= x1; dx++) px(dx, dy, c); };
    const fur = '#B8743F', furL = '#D69458', dark = '#7E4A26', belly = '#F6E7CF', eye = '#1E1A22', nut = '#8A5A2C', cap = '#C9A06A';
    if (b.run) {
      // 跑：长条身子 + 尾巴往后上方拖，腿一前一后
      const k = Math.sin(t * 28) > 0 ? 1 : 0;
      row(-3, 2, -3, fur); row(-3, 3, -2, fur); row(-2, 2, -1, belly);
      px(3, -4, fur); px(4, -3, fur); px(4, -2, fur); px(5, -2, dark); px(4, -3, eye); px(3, -5, dark);
      row(-7, -4, -4, furL); row(-8, -5, -5, fur); row(-8, -6, -6, furL); px(-4, -3, fur);
      px(-2 + k, 0, dark); px(1 - k, 0, dark);
      return;
    }
    // 坐着：大尾巴卷在身后，尖往前弯；尾巴抖的时候往上翘一格
    const fl = b.flick > 0 ? -1 : 0;
    row(-6, -4, -2, fur); row(-7, -4, -3, furL); row(-7, -4, -4, fur); row(-7, -4, -5, furL);
    row(-7, -4, -6, fur); row(-6, -3, -7 + fl, furL); row(-5, -3, -8 + fl, fur); px(-3, -9 + fl, fur); px(-2, -9 + fl, furL);
    // 身子（立起来）
    row(-3, 0, -1, fur); row(-3, 0, -2, fur); row(-3, 1, -3, fur); row(-2, 1, -4, fur); row(-2, 1, -5, fur);
    row(-1, 0, -2, belly); row(-1, 1, -3, belly); row(0, 1, -4, belly);
    px(-3, 0, dark); px(0, 0, dark);                   // 后脚
    // 头（啃的时候往下点一点）
    const nib = b.peck > 0 && Math.sin(t * 18) > 0 ? 1 : 0;
    const hy = -8 + nib;
    row(-1, 1, hy, fur); row(-1, 2, hy + 1, fur); row(0, 2, hy + 2, furL);
    px(-1, hy - 1, dark);                               // 耳朵
    px(1, hy + 1, eye); px(3, hy + 2, dark);            // 眼睛、鼻子
    // 前爪捧着的坚果
    if (b.nut) { px(2, -5 + nib, cap); px(2, -4 + nib, nut); px(3, -4 + nib, nut); }
    px(1, -4 + nib, dark);
  }

  // ---------- 装饰 ----------
  // 窗帘：窗两边各一幅，中间用绑带收一下
  function drawCurtains(ctx, L, t, night) {
    const w = L.win;
    const a = night ? '#7E5F86' : '#F2B9C4', b = night ? '#6A4F72' : '#E39AAA';
    PX.rect(ctx, w.x - 8, w.y - 6, w.w + 16, 3, night ? '#6A5468' : '#A8795A');
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? w.x - 9 : w.x + w.w + 1;
      for (let y = w.y - 3; y < w.y + w.h + 8; y++) {
        const k = (y - (w.y + w.h * 0.55)) / (w.h * 0.55);
        const pinch = 1 - Math.max(0, 0.5 - Math.abs(k)) * 0.9;   // 绑带处收窄
        const wid = Math.round(8 * pinch);
        const x = side < 0 ? x0 : x0 + 8 - wid;
        PX.rect(ctx, x, y, wid, 1, a);
        PX.rect(ctx, x + (side < 0 ? 2 : wid - 3), y, 1, 1, b);
        PX.rect(ctx, x + (side < 0 ? 5 : wid - 6), y, 1, 1, b);
      }
      const ty = w.y + Math.round(w.h * 0.55);
      PX.rect(ctx, side < 0 ? x0 + 1 : x0 + 3, ty - 1, 5, 3, night ? '#C9A85A' : '#F4D27A');
    }
  }

  // 串灯：从左上角垂下来一条，灯泡晚上会亮、会闪
  function drawLights(ctx, L, t, night) {
    const x1 = L.win.x - 12;
    const cols = ['#FFD36E', '#FF9FB2', '#9ED8FF', '#B9F0A0'];
    let i = 0;
    for (let x = 2; x < x1; x++) {
      const k = (x % 34) / 34;
      const y = 5 + Math.round(Math.sin(k * Math.PI) * 5);
      PX.rect(ctx, x, y, 1, 1, night ? '#2B2438' : '#8C7A6E');
      if (x % 9 === 4) {
        const on = night && Math.sin(t * 2 + i * 1.7) > -0.6;
        const c = cols[i % cols.length];
        if (on) PX.ellipse(ctx, x, y + 3, 3, 3, c + '55');
        PX.rect(ctx, x, y + 1, 1, 1, night ? '#2B2438' : '#8C7A6E');
        PX.rect(ctx, x - 1, y + 2, 2, 3, on ? c : (night ? '#6B607A' : c));
        i++;
      }
    }
  }

  // 墙上的小搁板：几本书、一小盆多肉、一张 Luna 的相框
  function drawShelf(ctx, L, night) {
    const x = Math.round(L.W * 0.30), y = Math.round(L.H * 0.30);
    const wood = night ? '#5E4A5E' : '#B98A64', woodD = night ? '#4A3A4C' : '#946A48';
    PX.rect(ctx, x, y, 34, 3, wood);
    PX.rect(ctx, x, y + 3, 34, 1, woodD);
    PX.rect(ctx, x + 3, y + 4, 2, 4, woodD);
    PX.rect(ctx, x + 29, y + 4, 2, 4, woodD);
    const books = night ? ['#6C7FA8', '#9A6F96', '#7FA08A', '#B08C6A'] : ['#7FA6D8', '#E59AAE', '#9CCB9A', '#F2C77A'];
    const hs = [11, 9, 12, 10];
    for (let i = 0; i < 4; i++) {
      PX.rect(ctx, x + 2 + i * 4, y - hs[i], 3, hs[i], books[i]);
      PX.rect(ctx, x + 2 + i * 4, y - hs[i] + 2, 3, 1, 'rgba(255,255,255,.35)');
    }
    // 小相框（里面是 Luna 的小脸）
    PX.rect(ctx, x + 19, y - 11, 9, 11, night ? '#8B7A6A' : '#D9B48A');
    PX.rect(ctx, x + 20, y - 10, 7, 9, night ? '#4B4560' : '#FFF6EC');
    PX.rect(ctx, x + 21, y - 7, 5, 4, night ? '#7A5F52' : '#8C6B55');
    PX.rect(ctx, x + 23, y - 7, 1, 4, '#FFFDF8');
    PX.rect(ctx, x + 21, y - 8, 1, 1, night ? '#7A5F52' : '#8C6B55');
    PX.rect(ctx, x + 25, y - 8, 1, 1, night ? '#7A5F52' : '#8C6B55');
    PX.rect(ctx, x + 22, y - 6, 1, 1, '#6AA8E8');
    PX.rect(ctx, x + 24, y - 6, 1, 1, '#6AA8E8');
    // 多肉
    PX.rect(ctx, x + 29, y - 4, 4, 4, night ? '#8A5E4C' : '#D98C64');
    PX.rect(ctx, x + 29, y - 7, 1, 3, '#7FB27A');
    PX.rect(ctx, x + 31, y - 8, 1, 4, '#8CC07C');
    PX.rect(ctx, x + 32, y - 6, 1, 2, '#7FB27A');
  }

  // 三层猫爬架：麻绳柱 + 左右错开的两层小平台 + 顶上一张大软垫（Luna 的专座），挂一个绒球
  function drawCatTree(ctx, L, t, night) {
    const T = L.tree, x = T.x, base = L.floorY;
    const rope = night ? '#8E7A66' : '#D8BE92', ropeD = night ? '#76634F' : '#BFA176';
    const pad = night ? '#6E6288' : '#B9A6D6', padD = night ? '#5B5074' : '#9C88BE';
    const padL = night ? '#857AA0' : '#E3D6F0';
    PX.ellipse(ctx, x, base + 1, 17, 3, 'rgba(60,44,66,.25)');
    // 底座
    PX.rect(ctx, x - 15, base - 4, 30, 5, pad);
    PX.rect(ctx, x - 15, base, 30, 1, padD);
    // 主麻绳柱通到顶
    for (let y = T.top + 3; y < base - 4; y++) PX.rect(ctx, x - 2, y, 5, 1, (y % 3 === 0) ? ropeD : rope);
    // 第一层底下是个小猫屋：圆门洞、门上一圈浅色边
    const cx0 = x - 19, cy0 = T.tiers[0] + 3, cw = 21, ch = base - 4 - cy0;
    PX.rect(ctx, cx0, cy0, cw, ch, pad);
    PX.rect(ctx, cx0, cy0, 1, ch, padL);
    PX.rect(ctx, cx0 + cw - 1, cy0, 1, ch, padD);
    PX.ellipse(ctx, cx0 + 10, cy0 + Math.round(ch * 0.58), 6, 6, padL);
    PX.ellipse(ctx, cx0 + 10, cy0 + Math.round(ch * 0.58), 5, 5, night ? '#2E2640' : '#5B4E70');
    PX.rect(ctx, cx0 + 4, cy0 + ch - 3, 13, 3, pad);
    // 平台：浅色毛毯面 + 毛茸茸的边
    const plat = (cx, y, w) => {
      PX.rect(ctx, cx - (w >> 1), y, w, 3, pad);
      PX.rect(ctx, cx - (w >> 1), y, w, 1, padL);
      PX.rect(ctx, cx - (w >> 1), y + 3, w, 1, padD);
      for (let i = 1; i < w; i += 3) PX.rect(ctx, cx - (w >> 1) + i, y + 4, 1, 1, padD);
    };
    plat(x - 9, T.tiers[0], 24);
    plat(x + 8, T.tiers[1], 22);
    // 第二层底下吊一个小吊床
    const hx0 = x + 3, hx1 = x + 19, hy = T.tiers[1] + 4;
    PX.line(ctx, hx0, hy, hx0 + 1, hy + 4, ropeD); PX.line(ctx, hx1, hy, hx1 - 1, hy + 4, ropeD);
    for (let i = 0; i <= hx1 - hx0 - 2; i++) {
      const k = i / (hx1 - hx0 - 2);
      const sag = Math.round(Math.sin(k * Math.PI) * 4);
      PX.rect(ctx, hx0 + 1 + i, hy + 4 + sag, 1, 2, i % 4 < 2 ? '#F4B6C2' : '#FBD6DE');
    }
    // 顶层：带猫耳朵的圆窝，一圈蓬蓬的毛边
    PX.rect(ctx, x - 16, T.top, 32, 4, padD);
    PX.rect(ctx, x - 17, T.top - 2, 34, 3, pad);
    PX.rect(ctx, x - 13, T.top - 1, 26, 2, padL);
    for (let i = -16; i <= 15; i += 2) PX.rect(ctx, x + i, T.top - 3 - ((i >> 1) & 1), 2, 1, padL);
    for (const s of [-1, 1]) {
      const ex = x + s * 13;
      for (let i = 0; i < 4; i++) PX.rect(ctx, ex - (3 - i) + (s > 0 ? 0 : 0), T.top - 7 + i, (3 - i) * 2 + 1, 1, pad);
      PX.rect(ctx, ex, T.top - 5, 1, 2, '#F7C3CC');
    }
    // 第一层边上挂的绒球、顶上挂的小鱼
    const sw = Math.round(Math.sin(t * 1.3) * 1.5);
    PX.line(ctx, x - 20, T.tiers[0] + 3, x - 20 + sw, T.tiers[0] + 10, night ? '#2B2438' : '#8C7A6E');
    PX.ellipse(ctx, x - 20 + sw, T.tiers[0] + 12, 2, 2, night ? '#B07C9A' : '#F48FB1');
    const sw2 = Math.round(Math.sin(t * 1.1 + 1) * 1.5);
    PX.line(ctx, x + 16, T.top + 3, x + 16 + sw2, T.top + 12, night ? '#2B2438' : '#8C7A6E');
    PX.rect(ctx, x + 14 + sw2, T.top + 13, 5, 3, night ? '#6C8FB0' : '#8EC3E6');
    PX.rect(ctx, x + 19 + sw2, T.top + 12, 1, 1, night ? '#6C8FB0' : '#8EC3E6');
    PX.rect(ctx, x + 19 + sw2, T.top + 15, 1, 1, night ? '#6C8FB0' : '#8EC3E6');
  }

  // 猫跑轮：part='back' 在猫之前画（支架、背板、跑道、辐条），
  // part='front' 在猫之后画（跑道外沿和内沿的线），猫看起来就在轮子里面跑
  S.drawWheel = function (ctx, L, angle, part, night) {
    const W = L.wheel;
    if (!W) return;
    const { x, cy, r, ri } = W;
    const base = L.catY + 3;
    const wood = night ? '#8E6E5A' : '#C9935F', woodD = night ? '#6E5444' : '#9E6E44';
    const track = night ? '#6F8FB0' : '#9AC7E8', trackD = night ? '#58738F' : '#7AAED6';
    const rim = night ? '#435A72' : '#5E8FB8';
    if (part === 'back') {
      PX.ellipse(ctx, x, base, r - 2, 3, 'rgba(60,44,66,.22)');
      // A 字支架
      PX.line(ctx, x - 20, base, x - 1, cy, woodD); PX.line(ctx, x - 19, base, x, cy, wood);
      PX.line(ctx, x + 20, base, x + 1, cy, woodD); PX.line(ctx, x + 19, base, x, cy, wood);
      PX.rect(ctx, x - 23, base - 1, 8, 2, wood); PX.rect(ctx, x + 15, base - 1, 8, 2, wood);
      for (let yy = cy - r; yy <= cy + r; yy++) {
        for (let xx = x - r; xx <= x + r; xx++) {
          const dx = xx + 0.5 - x, dy = yy + 0.5 - cy, d = Math.hypot(dx, dy);
          if (d > r) continue;
          if (d < ri) { ctx.fillStyle = night ? 'rgba(70,62,96,.55)' : 'rgba(255,248,238,.55)'; ctx.fillRect(xx, yy, 1, 1); continue; }
          // 跑道上的一条条横档，跟着轮子转
          const a = Math.atan2(dy, dx) - angle;
          const slat = ((a / (Math.PI * 2) * 36) % 1 + 1) % 1 < 0.35;
          ctx.fillStyle = slat ? trackD : track;
          ctx.fillRect(xx, yy, 1, 1);
        }
      }
      for (let i = 0; i < 6; i++) {
        const a = angle + i * Math.PI / 3;
        PX.line(ctx, x, cy, x + Math.cos(a) * (ri - 1), cy + Math.sin(a) * (ri - 1), night ? '#7E95AE' : '#C9DFF0');
      }
      PX.ellipse(ctx, x, cy, 3, 3, wood);
      PX.rect(ctx, x - 1, cy - 1, 2, 2, woodD);
    } else {
      for (let yy = cy - r; yy <= cy + r; yy++) {
        for (let xx = x - r; xx <= x + r; xx++) {
          const dx = xx + 0.5 - x, dy = yy + 0.5 - cy, d = Math.hypot(dx, dy);
          if ((d <= r && d > r - 1.2) || (dy > 4 && d >= ri && d < ri + 1)) {
            ctx.fillStyle = rim; ctx.fillRect(xx, yy, 1, 1);
          }
        }
      }
    }
  };

  // 地上的玩具（位置会被猫拍得到处滚）
  S.drawToys = function (ctx, toys, night) {
    for (const toy of toys) {
      const x = Math.round(toy.x), y = Math.round(toy.y);
      if (toy.kind === 'yarn') {
        PX.ellipse(ctx, x, y + 4, 6, 2, 'rgba(60,44,66,.22)');
        PX.ellipse(ctx, x, y, 5, 5, night ? '#9A6F96' : '#F09AAE');
        // 毛线纹跟着滚动转
        const a = toy.spin || 0, line = night ? '#7A5478' : '#D6728A';
        for (const off of [0, 1.1]) {
          const c = Math.cos(a + off) * 4, s = Math.sin(a + off) * 4;
          PX.line(ctx, x - c, y - s, x + c, y + s, line);
        }
        PX.line(ctx, x + 5, y + 2, x + 12, y + 5, night ? '#9A6F96' : '#F09AAE');
      } else {
        const f = toy.vx < -1 ? -1 : 1, body = night ? '#7D7690' : '#B7AFC0';
        PX.ellipse(ctx, x, y, 4, 2, body);
        PX.rect(ctx, x + 3 * f - (f < 0 ? 1 : 0), y - 2, 2, 2, body);
        PX.rect(ctx, x + 4 * f, y - 3, 1, 1, '#F2B8B5');
        PX.rect(ctx, x + 5 * f, y, 1, 1, '#2A2230');
        PX.line(ctx, x - 4 * f, y, x - 9 * f, y - 2, night ? '#7D7690' : '#9C93A8');
      }
    }
  };

  // 吊灯：天花板垂下来，晚上暖光洒一圈
  function drawLamp(ctx, L, night) {
    const x = Math.round(L.W * 0.40), y = Math.round(L.H * 0.16);
    PX.rect(ctx, x, 0, 1, y - 4, night ? '#2B2438' : '#8C7A6E');
    if (night) {
      for (let r = 34; r >= 14; r -= 10) PX.ellipse(ctx, x, y + 6, r, Math.round(r * 0.8), 'rgba(255,214,150,.06)');
    }
    PX.rect(ctx, x - 5, y - 4, 11, 2, night ? '#C9A85A' : '#E8C87A');
    PX.rect(ctx, x - 7, y - 2, 15, 4, night ? '#D9B66A' : '#F4D896');
    PX.rect(ctx, x - 7, y + 1, 15, 1, night ? '#B8964E' : '#D9B470');
    PX.rect(ctx, x - 1, y + 2, 3, 2, night ? '#FFE9A8' : '#FFF4D0');
  }

  // ---------- 家具 ----------
  S.drawBed = function (ctx, x, y) {
    PX.ellipse(ctx, x, y + 1, 26, 7, 'rgba(60,44,66,.25)');
    PX.ellipse(ctx, x, y - 3, 26, 9, '#C08BA0');
    PX.ellipse(ctx, x, y - 5, 20, 6, '#F0DCE2');
    PX.ellipse(ctx, x, y - 3, 15, 5, '#E0C3CE');
  };

  S.drawPlant = function (ctx, x, y, t) {
    const sway = Math.sin(t * 0.8) > 0 ? 0 : 1;
    PX.rect(ctx, x - 8, y - 13, 16, 14, '#C2714A');
    PX.rect(ctx, x - 10, y - 16, 20, 4, '#D98C64');
    PX.rect(ctx, x - 8, y - 11, 16, 2, 'rgba(255,255,255,.18)');
    const g1 = '#5E8F5A', g2 = '#8CC07C';
    PX.rect(ctx, x - 2, y - 32, 3, 17, g1);
    PX.rect(ctx, x - 9 + sway, y - 29, 7, 3, g2);
    PX.rect(ctx, x - 12 + sway, y - 26, 7, 3, g1);
    PX.rect(ctx, x + 3 - sway, y - 33, 7, 3, g2);
    PX.rect(ctx, x + 6 - sway, y - 30, 6, 3, g1);
    PX.rect(ctx, x - 6, y - 38 + sway, 5, 5, g2);
    PX.rect(ctx, x + 2, y - 41 + sway, 5, 5, g2);
  };

  // 小爪印（猫砂垫、碗架上用）
  function paw(ctx, x, y, col) {
    PX.rect(ctx, x, y + 1, 3, 2, col);
    PX.rect(ctx, x - 1, y - 1, 1, 1, col);
    PX.rect(ctx, x + 1, y - 2, 1, 1, col);
    PX.rect(ctx, x + 3, y - 1, 1, 1, col);
  }

  // 猫砂盆：猫头形状的高靠背（耳朵、眯眼、粉鼻子）+ 托盘 + 前面一块爪印脚垫 + 靠着的小铲子
  S.drawLitter = function (ctx, x, y, poops, hover) {
    PX.ellipse(ctx, x, y + 2, 27, 5, 'rgba(60,44,66,.25)');
    // 脚垫
    PX.rect(ctx, x - 27, y - 1, 54, 5, '#F3C9D3');
    PX.rect(ctx, x - 26, y + 4, 52, 1, '#DFA9B8');
    paw(ctx, x - 20, y + 1, '#E8A9BA'); paw(ctx, x - 6, y + 1, '#E8A9BA'); paw(ctx, x + 9, y + 1, '#E8A9BA');
    // 猫头靠背：矮一点，顶上是平的，Luna 上窗台前会先跳到这上面垫一步
    const back = hover ? '#FFF8EF' : '#FFF1E2', line = '#C9A88A';
    PX.rect(ctx, x - 20, y - 23, 40, 12, back);
    PX.frame(ctx, x - 21, y - 24, 42, 13, line);
    PX.rect(ctx, x - 20, y - 23, 40, 1, '#FFFFFF');
    for (let i = 0; i < 6; i++) {           // 两只耳朵
      PX.rect(ctx, x - 20 + i, y - 30 + i, 6 - i, 1, line);
      PX.rect(ctx, x - 19 + i, y - 29 + i, Math.max(0, 4 - i), 1, '#F7C3CC');
      PX.rect(ctx, x + 15 + (5 - (6 - i)), y - 30 + i, 6 - i, 1, line);
      PX.rect(ctx, x + 16 + (5 - (6 - i)), y - 29 + i, Math.max(0, 4 - i), 1, '#F7C3CC');
    }
    PX.line(ctx, x - 9, y - 19, x - 7, y - 21, '#7A5A4A'); PX.line(ctx, x - 7, y - 21, x - 5, y - 19, '#7A5A4A');
    PX.line(ctx, x + 5, y - 19, x + 7, y - 21, '#7A5A4A'); PX.line(ctx, x + 7, y - 21, x + 9, y - 19, '#7A5A4A');
    PX.rect(ctx, x - 1, y - 19, 3, 2, '#F28C9E');
    PX.rect(ctx, x - 13, y - 18, 3, 1, '#F7C3CC'); PX.rect(ctx, x + 11, y - 18, 3, 1, '#F7C3CC');
    // 托盘
    const body = hover ? '#BFE0F2' : '#A8D4F0';
    PX.rect(ctx, x - 21, y - 13, 42, 14, body);
    PX.rect(ctx, x - 22, y - 16, 44, 4, hover ? '#DDF0FA' : '#CFE8F7');
    PX.rect(ctx, x - 22, y - 16, 44, 1, '#FFFFFF');
    PX.rect(ctx, x - 21, y - 2, 42, 1, '#86B8D8');
    for (let i = -16; i <= 16; i += 8) PX.rect(ctx, x + i, y - 8, 2, 2, '#FFFFFF');
    PX.rect(ctx, x - 18, y - 13, 36, 6, '#EADFC6');
    PX.dither(ctx, x - 18, y - 10, 36, 4, '#D3C3A0', 0);
    // 靠在右边的小铲子
    PX.line(ctx, x + 23, y - 22, x + 26, y - 6, '#E59AAE');
    PX.rect(ctx, x + 24, y - 7, 5, 6, '#F4B6C2');
    PX.rect(ctx, x + 25, y - 6, 1, 4, '#E59AAE'); PX.rect(ctx, x + 27, y - 6, 1, 4, '#E59AAE');
    for (const p of poops) {
      const px = Math.round(x + p.ox), py = Math.round(y + p.oy);
      if (p.hot) PX.rect(ctx, px - 6, py - 9, 13, 11, 'rgba(255,224,130,.5)');
      PX.rect(ctx, px - 4, py - 2, 9, 3, '#7A5339');
      PX.rect(ctx, px - 3, py - 5, 7, 3, '#8A6246');
      PX.rect(ctx, px - 2, py - 7, 5, 2, '#9C7152');
    }
  };

  // 饭碗：两只碗直接放在地上的爪印餐垫上（不用碗架了）——左边红色猫耳饭碗（喂食），右边蓝色水碗（喂水，有水时水面会闪）
  S.BOWL_DX = 18;   // 两只碗各离中心多远（红碗在左、蓝碗在右）
  S.drawBowl = function (ctx, x, y, fill, t, water) {
    const R = x - S.BOWL_DX, B = x + S.BOWL_DX;   // 红碗、蓝碗的中心
    t = t || 0;
    water = water || 0;
    PX.ellipse(ctx, x, y + 2, 34, 4, 'rgba(60,44,66,.25)');
    // 爪印餐垫：长方形、奶油色、带一圈边
    PX.rect(ctx, x - 35, y - 1, 70, 4, '#F3E3CC');
    PX.rect(ctx, x - 35, y + 3, 70, 1, '#DCC3A0');
    PX.rect(ctx, x - 35, y - 1, 1, 4, '#E6D0B0'); PX.rect(ctx, x + 34, y - 1, 1, 4, '#E6D0B0');
    paw(ctx, x - 1, y + 1, '#E2C9A6');
    // 两只碗：碗口宽、碗底略收，底下一道深色接地
    const bowl = (cx, col, colL, colD) => {
      PX.rect(ctx, cx - 9, y - 6, 18, 5, col);
      PX.rect(ctx, cx - 8, y - 1, 16, 1, colD);
      PX.rect(ctx, cx - 10, y - 7, 20, 2, colL);
      PX.rect(ctx, cx - 9, y - 3, 18, 1, colD);
      PX.ellipse(ctx, cx, y + 1, 9, 1, 'rgba(60,44,66,.18)');
    };
    bowl(R, '#E8636B', '#F59A9E', '#B8434C');   // 红色：饭碗
    bowl(B, '#A8D4F0', '#D2ECFA', '#7FB4D8');   // 蓝色：水碗
    // 饭碗上的猫耳朵
    PX.rect(ctx, R - 8, y - 10, 3, 3, '#E8636B'); PX.rect(ctx, R - 7, y - 11, 1, 1, '#E8636B');
    PX.rect(ctx, R + 5, y - 10, 3, 3, '#E8636B'); PX.rect(ctx, R + 6, y - 11, 1, 1, '#E8636B');
    // 猫粮：越满堆得越高，冒出碗沿
    if (fill > 0.02) {
      const h = Math.max(1, Math.round(fill * 5));
      for (let i = 0; i < h; i++) {
        const w2 = 16 - i * 2;
        PX.rect(ctx, R - (w2 >> 1), y - 7 - i, w2, 1, '#C98A4B');
      }
      PX.dither(ctx, R - 7, y - 7 - h + 1, 14, h, '#A96C33', 1);
    }
    // 水：有水时碗里一层蓝 + 一闪一闪的高光，水越少碗里露出的碗底越多
    if (water > 0.02) {
      const lv = Math.max(1, Math.round(water * 3));
      PX.rect(ctx, B - 8, y - 4 - lv, 16, lv, '#7FC4F0');
      PX.rect(ctx, B - 8, y - 4 - lv, 16, 1, '#A9DBF7');
      if (Math.sin(t * 2.2) > 0.2) PX.rect(ctx, B - 5 + Math.round(Math.sin(t) * 3), y - 4 - lv, 2, 1, '#FFFFFF');
    } else {
      PX.rect(ctx, B - 8, y - 5, 16, 1, '#8FB9D6');   // 空碗：只看得到碗底
    }
  };

  // ---------- 整体 ----------
  // 墙上的两张拍立得：胶带贴着、一高一低。鼠标移上去会笑，点一下会晃、挤眼、冒爱心
  const PHOTOS = [
    // rot = 贴歪的角度（弧度）；idle / hover / poke = 平时、鼠标移上去、被点时的表情
    { id: 'luna', bg: '#CFE3F6', bgN: '#6F7BA0', dot: '#FFFFFF', tape: '#F6B8C6', heart: '#8FA3D8', dy: 0, rot: -0.12, idle: 'meh', hover: 'meh', poke: 'sleep' },
    { id: 'nova', bg: '#FDE2CC', bgN: '#9A7A80', dot: '#FFFFFF', tape: '#A9D8C2', heart: '#F0A070', dy: 4, rot: 0.14, idle: 'happy', hover: 'win', poke: 'win' }
  ];
  const photoState = { luna: { poke: -99 }, nova: { poke: -99 } };
  let sceneT = 0;
  S.photoRects = function (L) {
    const x0 = Math.max(3, Math.round(L.W * 0.14) - 31), y0 = Math.round(L.H * 0.17) - 13;
    return PHOTOS.map((p, i) => ({ id: p.id, x: x0 + i * 33, y: y0 + p.dy, w: 30, h: 27 }));
  };
  S.hitPhoto = function (L, x, y) {
    for (const r of S.photoRects(L)) if (x >= r.x && x < r.x + r.w && y >= r.y - 2 && y < r.y + r.h) return r;
    return null;
  };
  S.pokePhoto = function (id) { photoState[id].poke = sceneT; };

  function drawPhotos(ctx, L, t, night, mouse) {
    sceneT = t;
    const hot = mouse ? S.hitPhoto(L, mouse.x, mouse.y) : null;
    S.photoRects(L).forEach((r, i) => {
      const P = PHOTOS[i];
      const since = t - photoState[r.id].poke;
      const poked = since >= 0 && since < 1.2;
      const hover = !!hot && hot.id === r.id;
      // 照片绕着胶带那一点歪着贴；被点时像被弹了一下，绕着胶带来回荡
      let ang = P.rot + (hover ? (P.rot > 0 ? 0.03 : -0.03) : 0);
      if (poked) ang += Math.sin(since * 14) * 0.22 * (1 - since / 1.2);
      ctx.save();
      ctx.translate(r.x + 15, r.y);
      ctx.rotate(ang);
      const x = -15, y = 0;
      PX.rect(ctx, x + 1, y + 2, 30, 27, 'rgba(60,44,66,.20)');
      PX.rect(ctx, x, y, 30, 27, night ? '#B9AEC6' : '#FFFDF8');
      PX.rect(ctx, x + 2, y + 2, 26, 19, night ? P.bgN : P.bg);
      // 背景上的小星星
      for (const d of [[4, 4], [24, 5], [22, 3], [6, 9]]) PX.rect(ctx, x + d[0], y + d[1], 1, 1, P.dot);
      PX.rect(ctx, x + 23, y + 4, 3, 1, P.dot); PX.rect(ctx, x + 24, y + 3, 1, 3, P.dot);
      const mood = poked && since < 0.7 ? P.poke : hover ? P.hover : P.idle;
      if (D.drawFace) D.drawFace(ctx, r.id, x + 3, y + 4, mood);
      if (night) PX.rect(ctx, x + 2, y + 2, 26, 19, 'rgba(40,32,62,.30)');
      // 白边上的小爱心
      const hx = x + 13, hy = y + 22;
      PX.rect(ctx, hx, hy, 2, 1, P.heart); PX.rect(ctx, hx + 3, hy, 2, 1, P.heart);
      PX.rect(ctx, hx, hy + 1, 5, 1, P.heart); PX.rect(ctx, hx + 1, hy + 2, 3, 1, P.heart); PX.rect(ctx, hx + 2, hy + 3, 1, 1, P.heart);
      ctx.restore();
      // 胶带（跟着照片一起歪，但不跟着晃：照片是被它粘在墙上的）
      ctx.save();
      ctx.translate(r.x + 15, r.y);
      ctx.rotate(P.rot);
      PX.rect(ctx, -5, -2, 10, 4, P.tape);
      PX.rect(ctx, -5, -2, 10, 1, 'rgba(255,255,255,.45)');
      ctx.restore();
    });
  }

  S.draw = function (ctx, L, t, hour, mouse) {
    const sky = S.skyOf(hour);
    const night = sky.night;
    const wallA = night ? '#453C56' : '#EFD9C6';
    const wallB = night ? '#3B3349' : '#E3CAB4';
    const floorA = night ? '#4A3C52' : '#CC9A70';
    const floorB = night ? '#3C3044' : '#B07E57';
    const plank = night ? '#2E2436' : '#93603C';

    PX.rect(ctx, 0, 0, L.W, L.floorY, wallA);
    // 墙纸竖条 + 条纹里的小碎花点
    for (let x = 0; x < L.W; x += 12) {
      PX.rect(ctx, x, 0, 4, L.floorY, wallB);
      for (let y = 6 + ((x / 12) % 2) * 9; y < L.floorY - 26; y += 18) PX.rect(ctx, x + 8, y, 1, 1, night ? '#5A4F6E' : '#E8B7B2');
    }
    // 下半截护墙板
    const wainY = L.floorY - 24;
    PX.rect(ctx, 0, wainY, L.W, 20, night ? '#3E3550' : '#E6CDB8');
    PX.rect(ctx, 0, wainY, L.W, 2, night ? '#55496A' : '#F6E6D8');
    for (let x = 6; x < L.W; x += 22) {
      PX.frame(ctx, x, wainY + 5, 16, 11, night ? '#352D45' : '#D7BBA4');
    }

    drawWindow(ctx, L, t, sky);
    drawCurtains(ctx, L, t, night);
    drawLights(ctx, L, t, night);
    drawShelf(ctx, L, night);
    drawCatTree(ctx, L, t, night);

    // 挂画
    drawPhotos(ctx, L, t, night, mouse);

    // 踢脚线 + 地板
    PX.rect(ctx, 0, L.floorY - 4, L.W, 4, night ? '#342C42' : '#C49C82');
    PX.rect(ctx, 0, L.floorY, L.W, L.H - L.floorY, floorA);
    PX.dither(ctx, 0, L.floorY, L.W, L.H - L.floorY, floorB, 0);
    for (let i = 1; i <= 4; i++) {
      const y = L.floorY + Math.round((L.H - L.floorY) * Math.pow(i / 4.4, 1.5));
      PX.rect(ctx, 0, y, L.W, 1, plank);
    }

    // 地毯
    const rugY = L.floorY + Math.round((L.H - L.floorY) * 0.55);
    PX.ellipse(ctx, Math.round(L.W / 2), rugY, Math.round(L.W * 0.3), Math.round((L.H - L.floorY) * 0.42), night ? '#554A6B' : '#E3C6CF');
    PX.ellipse(ctx, Math.round(L.W / 2), rugY, Math.round(L.W * 0.24), Math.round((L.H - L.floorY) * 0.32), night ? '#60537A' : '#F0DCE2');
    PX.ellipse(ctx, Math.round(L.W / 2), rugY, Math.round(L.W * 0.18), Math.round((L.H - L.floorY) * 0.22), night ? '#554A6B' : '#E3C6CF');

    S.drawPlant(ctx, L.W - 18, L.floorY + 11, t);
    drawLamp(ctx, L, night);

    if (night) {
      ctx.fillStyle = 'rgba(255,214,150,.055)';
      ctx.fillRect(0, 0, L.W, L.H);
    }
  };

  S.tick = function (dt, t) {
    if (U.chance(dt * 0.06) && S.birds.length < 2) {
      S.birds.push({ x: -0.1, y: U.rnd(0.1, 0.4), v: U.rnd(0.07, 0.14), ph: U.rnd(0, 6) });
    }
    for (let i = S.birds.length - 1; i >= 0; i--) {
      S.birds[i].x += S.birds[i].v * dt;
      if (S.birds[i].x > 1.15) S.birds.splice(i, 1);
    }
  };

  D.Scene = S;
})(window.DOLL);

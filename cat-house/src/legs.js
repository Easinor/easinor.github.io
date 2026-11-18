// 四条腿的骨骼动画。躯干还是精灵图，腿每帧现算，这样关节是软的。
//
// 步态参考真实四足动物：
//   走 = lateral sequence 四拍，后左 0.00 → 前左 0.25 → 后右 0.50 → 前右 0.75，
//        每只脚着地时间 > 半个周期（duty factor > 0.5），所以随时有 2~3 只脚在地上。
//   跑 = gallop，后腿先落、前腿后落，duty < 0.5，中间有四脚离地的腾空期。
// 相位由「走过的距离」推进而不是时间，脚就不会打滑。
window.DOLL = window.DOLL || {};
(function (D) {
  'use strict';
  const PX = D.PX, U = D.U;
  const L = {};

  // 腿的顺序：0 后远 / 1 后近 / 2 前远 / 3 前近
  L.GAITS = {
    walk: {
      // 顺序还是 lateral sequence（后左 → 前左 → 后右 → 前右），
      // 但用「对角联对」的时序：对角的两只脚几乎同时落地
      // （后左 0 配 前右 .9，后右 .5 配 前左 .4）。
      // 四拍均匀排成 0/.25/.5/.75 的话，同侧前后腿只差 1/4，
      // 走起来会出现同手同脚的瞬间。
      offs: [0.00, 0.50, 0.40, 0.90],
      stance: 0.68, stride: 19, lift: 6,
      bobAmp: 1.3, bobFreq: 2, bobSplit: 0.25, swayAmp: 0.7, leanAmt: 0
    },
    run: {
      // 后腿一对、前腿一对几乎同时落地（gallop 的特征），
      // 但对内要留够相位差，否则两条腿会叠成一条
      offs: [0.00, 0.20, 0.52, 0.72],
      stance: 0.36, stride: 22, lift: 10,
      bobAmp: 3.5, bobFreq: 1, bobSplit: 0.18, swayAmp: 1.4, leanAmt: 2
    }
  };
  // 一个完整周期往前走多远（保证支撑相的脚不打滑）
  L.cycleDist = (g) => g.stride / g.stance;

  // 脚相对「中立位」的偏移。y 为 0 表示踩在地上，负数表示抬起来。
  function footOffset(p, g) {
    p -= Math.floor(p);
    if (p < g.stance) {                       // 支撑相：脚不动，身体往前，所以脚在身体坐标里往后滑
      const t = p / g.stance;
      return [g.stride * (0.5 - t), 0];
    }
    const t = (p - g.stance) / (1 - g.stance); // 摆动相：抬起来画个弧线甩到前面
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    return [g.stride * (e - 0.5), -g.lift * Math.sin(Math.PI * t)];
  }
  L.footOffset = footOffset;

  // 两段 IK：给定髋和踝，解出中间关节。side 决定关节往哪边弯。
  function solve(hx, hy, ax, ay, l1, l2, side) {
    let dx = ax - hx, dy = ay - hy;
    let d = Math.hypot(dx, dy);
    if (d < 0.01) d = 0.01;
    const max = l1 + l2 - 0.02;
    if (d > max) { dx *= max / d; dy *= max / d; ax = hx + dx; ay = hy + dy; d = max; }
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const ux = dx / d, uy = dy / d;
    return [hx + ux * a - uy * h * side, hy + uy * a + ux * h * side, ax, ay];
  }

  // 画一条腿：髋 → 膝/肘 → 踝 → 爪
  // front=true 时肘朝后弯，false（后腿）膝朝前弯，这是猫前后腿最明显的区别
  // 把折线串成样条：关节外面那层皮肉会把折角抹圆，不会露出硬拐点
  function smooth(pts, per) {
    const P = [pts[0]].concat(pts, [pts[pts.length - 1]]);
    const out = [];
    for (let i = 1; i < P.length - 2; i++) {
      const a = P[i - 1], b = P[i], c = P[i + 1], d = P[i + 2];
      for (let s = 0; s < per; s++) {
        const t = s / per, t2 = t * t, t3 = t2 * t;
        out.push([
          .5 * (2 * b[0] + (-a[0] + c[0]) * t + (2 * a[0] - 5 * b[0] + 4 * c[0] - d[0]) * t2 + (-a[0] + 3 * b[0] - 3 * c[0] + d[0]) * t3),
          .5 * (2 * b[1] + (-a[1] + c[1]) * t + (2 * a[1] - 5 * b[1] + 4 * c[1] - d[1]) * t2 + (-a[1] + 3 * b[1] - 3 * c[1] + d[1]) * t3)
        ]);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  // 画一条腿：髋 → 膝/肘 → 踝 → 爪，整条按一根连续的锥形来画。
  // front=true 时肘朝后弯，false（后腿）膝朝前弯，这是猫前后腿最明显的区别。
  // part='lower' 时只补画膝盖以下 —— 大腿那段压在身体底下，
  // 接缝由身体自己的轮廓线接住，不会多出一道横线。
  function drawLeg(ctx, hx, hy, fx, fy, front, far, pal, sx, part) {
    const l1 = front ? 12.5 : 11.5;
    const l2 = front ? 11.5 : 11;
    const ankH = front ? 5 : 7;             // 踝离地高度，后腿的跖骨更长
    const ax = fx - 1.5 * sx, ay = fy - ankH;
    // sx<0 时整条腿镜像，弯曲方向也要跟着翻
    const side = (front ? 1 : -1) * (sx < 0 ? -1 : 1);
    const k = solve(hx, hy, ax, ay, l1, l2, side);
    // 踩在地上时末端拐向前压平，爪子就是腿的延续，不是贴上去的另一块。
    // 但举在空中的爪子不能还摆成平的，要顺着小臂的方向翻下去。
    const air = fy < -6;
    let toeX, toeY;
    if (air) {
      const dx = fx - k[2], dy = fy - k[3];
      const d = Math.hypot(dx, dy) || 1;
      toeX = fx + (dx / d) * 2.5 + 1.5 * sx;
      toeY = fy + (dy / d) * 2.5;
    } else {
      toeX = fx + 4.5 * sx;
      toeY = fy - 2;
    }
    const path = smooth([[hx, hy], [k[0], k[1]], [k[2], k[3]],
      [fx, air ? fy : fy - 2], [toeX, toeY]], 6);

    // 根部粗、足尖细，一路连续收，关节处不跳；最末端再鼓一点当肉乎乎的爪
    const w0 = (front ? 9.5 : 14.5) - (far ? 1 : 0);
    const w1 = (front ? 4.6 : 5) - (far ? 0.6 : 0);
    const n = path.length - 1;
    const wAt = (i) => {
      const t = i / n;
      return w1 + (w0 - w1) * Math.pow(1 - t, 1.5) + (t > 0.84 ? (t - 0.84) * 8 : 0);
    };

    const fill = far ? pal.d : pal.W;
    const line = pal.o;
    const start = part === 'lower' ? Math.floor(n * 0.3) : 0;

    // 大腿那截不描边：猫的大腿是埋在肚皮毛里的，描出来就成了
    // 两根插在身上的管子。描边从膝盖那里渐渐出来，到爪子最清楚。
    const eAt = (i) => 2 * Math.max(0, Math.min(1, (i / n - 0.3) / 0.22));
    // 先整条铺描边，再整条铺填充，关节处才不会互相咬掉
    for (let pass = 0; pass < 2; pass++) {
      const col = pass ? fill : line;
      const e = pass ? () => 0 : eAt;
      for (let i = start; i < n; i++) {
        PX.thickLine(ctx, path[i][0], path[i][1], path[i + 1][0], path[i + 1][1],
          wAt(i) + e(i), wAt(i + 1) + e(i + 1), col);
      }
    }

    // 脚尖前缘露出一点点肉垫
    const tx = Math.round(toeX) + (sx > 0 ? 0 : -1);
    PX.rect(ctx, tx, Math.round(air ? toeY : fy - 1), 2, 1, pal.i);
  }

  // 返回四条腿当前的髋/脚位置（身体坐标：x 向前为正，y 0 = 地面）
  // 以及身体的起伏，供躯干和脑袋使用
  // p 是姿势定义，可以带 crouch（压低准备扑）和 rear（抬前爪）
  L.pose = function (G, torso, p) {
    const g = L.GAITS[G.gait];
    const ph = G.gaitPhase || 0;
    const H = torso.hips;
    const crouch = (p && p.crouch) || 0;
    const rear = (p && p.rear) || 0;
    // 脑袋往下放的姿势（hdy > 0）脖子和肩膀要跟着沉，否则一是肩膀会从
    // 两只耳朵中间冒出来，二是身体沉了而前腿没沉，腿根会从胸口戳出来。
    const neck = (p && p.side) ? (p.hdy || 0) * 0.8 : 0;
    const out = { legs: [], bob: 0, bobF: 0, bobB: 0, sway: 0, lean: 0, headBob: 0, tailBob: 0, neck: neck };

    if (rear) {
      // 坐起来够东西。身体用的是立着画好的 body_rear，前后髋已经在
      // 身体里定好了，所以这里不再把身子斜着剪切（那样就是一根斜管子），
      // 只管把前爪举起来一下一下地扑。
      out.bob = -0.5 - 0.5 * Math.sin(G.t * 1.6);
      out.bobF = out.bobB = out.headBob = out.tailBob = out.bob;
      for (let i = 0; i < 4; i++) {
        const front = i >= 2, far = (i % 2) === 0;
        const h = front ? H.f : H.b;
        const hx = h[0] + (far ? -2 : 0);
        const hy = h[1] + out.bob;
        let fx, fy;
        if (front) {
          // 两只前爪错开半拍，一高一低才像在拍东西而不是作揖
          // 爪子必须伸到脸前面去。脸是 39 宽的，爪子往前不够的话
          // 整只爪子都压在自己脸后面，看起来像只有一只爪。
          const w = Math.sin(G.t * 5.5 + (far ? 0 : 1.15));
          fx = hx + 18 + (far ? -2 : 0) + w * 1.5;
          fy = hy - 13 + (far ? 9 : 0) - w * 3.5;
        } else {
          // 后脚收在屁股底下、爪尖朝前，大腿被身体挡住
          fx = hx + 17 + (far ? -5 : 0);
          fy = 0;
        }
        out.legs.push({ hx: hx, hy: hy, fx: fx, fy: fy, front: front, far: far });
      }
      return out;
    }

    if (!g || crouch) {
      // 站着 / 压低：脚不迈步，只有呼吸和姿势偏移
      out.bob = -0.5 - 0.5 * Math.sin(G.t * 1.6);
      // 压低时前后一起沉，屁股还翘着
      out.bobF = out.bob + crouch * 12;
      out.bobB = out.bob + crouch * 7;
      out.headBob = out.bobF;
      out.tailBob = out.bobB;
      for (let i = 0; i < 4; i++) {
        const front = i >= 2, far = (i % 2) === 0;
        const h = front ? H.f : H.b;
        const hx = h[0] + (far ? -2 : 0);
        const fx = hx + (front ? 2 : -4) + crouch * (front ? -6 : 7);
        out.legs.push({ hx: hx, hy: h[1] + (front ? out.bobF + neck : out.bobB), fx: fx, fy: 0, front: front, far: far });
      }
      return out;
    }

    // 后半身和前半身各起各的伏，而且错开半个自己的周期 —— 这是走路不僵的关键
    const F = g.bobFreq;
    out.bobB = -g.bobAmp * (0.5 - 0.5 * Math.cos(2 * Math.PI * F * ph));
    out.bobF = -g.bobAmp * (0.5 - 0.5 * Math.cos(2 * Math.PI * F * (ph + g.bobSplit)));
    out.bob = (out.bobB + out.bobF) / 2;
    out.sway = g.swayAmp * Math.sin(2 * Math.PI * ph);
    out.lean = g.leanAmt * Math.sin(2 * Math.PI * ph);
    // 脑袋和尾巴晚一点才跟上（overlapping action）
    // 猫走路时头几乎是稳着不动的，只跟一点点
    out.headBob = -g.bobAmp * 0.3 * (0.5 - 0.5 * Math.cos(2 * Math.PI * F * (ph + g.bobSplit - 0.1)));
    out.tailBob = -g.bobAmp * 0.9 * (0.5 - 0.5 * Math.cos(2 * Math.PI * F * (ph - 0.14)));

    for (let i = 0; i < 4; i++) {
      const front = i >= 2, far = (i % 2) === 0;
      const h = front ? H.f : H.b;
      const base = h[0] + (far ? -2 : 0);
      const off = footOffset(ph + g.offs[i], g);
      out.legs.push({
        hx: base + out.sway * (front ? 0.5 : -0.5),
        hy: h[1] + (front ? out.bobF + neck : out.bobB),
        fx: base + (front ? 2 : -4) + off[0],
        fy: off[1],
        front: front, far: far
      });
    }
    return out;
  };

  // ---------- 尾巴 ----------
  // 也是每帧算的：一条弧线，中段最蓬、尖端收圆，边上再加几撮毛。
  // opt: {x,y 根部(身体坐标), ang 起始角, curve 总转角, n 段数, seg 段长,
  //       w0 根部粗, w1 尖端粗, bulge 中段鼓多少, sway 摆幅, wave 抖动}
  L.drawTail = function (ctx, px, py, opt, pal, sx, t) {
    const n = opt.n, pts = [], ws = [];
    const sway = Math.sin(t * 1.3) * opt.sway;
    const wag = Math.sin(t * 2.6 + 1) * (opt.wave || 0);
    let cx = opt.x, cy = opt.y;
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      pts.push([cx, cy]);
      ws.push(opt.w0 + (opt.w1 - opt.w0) * k + opt.bulge * Math.sin(Math.PI * Math.min(1, k * 1.15)));
      const a = opt.ang + opt.curve * k + sway * k * k + wag * k * k * k;
      cx += Math.cos(a) * opt.seg;
      cy += Math.sin(a) * opt.seg;
    }
    const W = (i) => px + pts[i][0] * sx;
    const H = (i) => py + pts[i][1];

    // 先整条铺描边，再铺填充
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        const k = i / n;
        const col = pass === 0 ? pal.o
          : (k < 0.22 ? pal.q : k > 0.76 ? pal.p : pal.P);
        const e = pass === 0 ? 2 : 0;
        PX.thickLine(ctx, W(i), H(i), W(i + 1), H(i + 1), ws[i] + e, ws[i + 1] + e, col);
      }
    }
    // 蓬松感：沿着尾巴两侧戳几撮毛出去
    for (let i = 2; i < n; i += 2) {
      const dx = W(i + 1) - W(i), dy = H(i + 1) - H(i);
      const m = Math.hypot(dx, dy) || 1;
      const nx = -dy / m, ny = dx / m;
      const r = ws[i] / 2 + 1.2;
      const side = (i % 4 === 0) ? 1 : -1;
      const k = i / n;
      const col = k > 0.76 ? pal.p : pal.P;
      PX.thickLine(ctx, W(i) + nx * r * side, H(i) + ny * r * side,
        W(i) + nx * (r + 1) * side, H(i) + ny * (r + 1) * side, 3.4, 2.6, pal.o);
      PX.thickLine(ctx, W(i) + nx * r * side, H(i) + ny * r * side,
        W(i) + nx * (r + 0.4) * side, H(i) + ny * (r + 0.4) * side, 2.2, 1.6, col);
    }
  };

  // which: true=远侧 / false=近侧；part: 'all' 或 'lower'
  L.draw = function (ctx, x, y, pose, which, pal, sx, part, pick) {
    for (const lg of pose.legs) {
      if (lg.far !== which) continue;
      if (pick === 'front' && !lg.front) continue;
      if (pick === 'hind' && lg.front) continue;
      drawLeg(ctx,
        Math.round(x + lg.hx * sx), Math.round(y + lg.hy),
        Math.round(x + lg.fx * sx), Math.round(y + lg.fy),
        lg.front, lg.far, pal, sx, part);
    }
  };

  D.Legs = L;
})(window.DOLL);

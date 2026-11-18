// 组合一只猫：影子 + 尾巴 + 身体 + 脸 + 眼睛覆盖层
window.DOLL = window.DOLL || {};
(function (D) {
  'use strict';
  const PX = D.PX, U = D.U;

  // 每个姿势用哪个身体、哪种尾巴、脸往哪偏
  const POSE = {
    sit: { body: 'body_sit', tail: 'up' },
    gaze: { body: 'body_sit', tail: 'up' },
    reach: { body: 'body_rear', tail: 'rear', quad: true, side: true, rear: 1 },
    groom: { body: 'body_sit', tail: 'up', hdx: 3, hdy: 6 },
    loaf: { body: 'body_loaf', tail: 'up' },
    crouch: { body: 'body_torso', tail: 'flat', quad: true, side: true, crouch: 1, hdy: 2 },
    stand: { body: 'body_torso', tail: 'flat', quad: true, side: true },
    walk: { body: 'body_torso', tail: 'flat', quad: true, side: true },
    stretch: { body: 'body_torso', tail: 'flat', quad: true, side: true, hdx: 5, hdy: 9 },
    eat: { body: 'body_torso', tail: 'flat', quad: true, side: true, hdx: 4, hdy: 13 },
    sleep: { body: 'body_sleep', tail: 'wrap', tailFront: true, headBehind: true },
    rollover: { body: 'body_rollover', tail: 'flat' }
  };
  // 尾巴每帧现算：一条弧线，中段最蓬、尖端收圆，边上再戳几撮毛。
  // flat = 侧身时从屁股翘起来往后甩；up = 坐着时绕到身侧再卷上来。
  const TAILP = {
    flat: { x: 0, y: 0, ang: Math.PI * 1.04, curve: 0.95, n: 11, seg: 3.1,
      w0: 9, w1: 5.5, bulge: 3.4, sway: 0.4, wave: 0.28 },
    up: { x: 0, y: 0, ang: Math.PI * 0.99, curve: 2.3, n: 11, seg: 3.3,
      w0: 9, w1: 5.5, bulge: 3.4, sway: 0.3, wave: 0.2 },
    // 跑起来尾巴竖起来
    run: { x: 0, y: 0, ang: Math.PI * 1.22, curve: 0.55, n: 11, seg: 3.4,
      w0: 9, w1: 5.5, bulge: 3.4, sway: 0.55, wave: 0.45 },
    // 坐起来够东西：尾巴往后下方垫到地上，当第三个支点
    rear: { x: 0, y: 0, ang: Math.PI * 1.06, curve: 1.1, n: 11, seg: 3.0,
      w0: 9, w1: 5.5, bulge: 3.2, sway: 0.3, wave: 0.22 },
    // 睡觉：从屁股耷拉到地上，绕到身前摊着，完全不动
    wrap: { x: 0, y: 0, ang: Math.PI * 0.06, curve: -0.25, n: 10, seg: 4.0,
      w0: 8, w1: 5, bulge: 2.4, sway: 0, wave: 0 }
  };

  D.POSE = POSE;

  function parts(G) {
    const p = POSE[G.spr] || POSE.sit;
    return { p: p, body: D.CAT_SPR[p.body], head: D.CAT_SPR[p.side ? 'head_q' : 'head_f'] };
  }

  // 整只猫的包围盒（世界坐标），拿来做点击判定
  D.catBox = function (G) {
    const q = parts(G);
    const b = q.body, h = q.head;
    const flip = G.facing < 0;
    const bx = flip ? G.x - (b.w - 1 - b.ax) : G.x - b.ax;
    const by = G.y - b.ay;
    const hp = PX.spotOf(b, b.head, Math.round(G.x), Math.round(G.y), flip);
    const hdx = (q.p.hdx || 0) * (flip ? -1 : 1);
    const hx = hp[0] + hdx - (flip ? (h.w - 1 - h.ax) : h.ax);
    const hy = hp[1] + (q.p.hdy || 0) - h.ay;
    const x0 = Math.min(bx, hx), x1 = Math.max(bx + b.w, hx + h.w);
    const y0 = Math.min(by, hy);
    // 腿是算出来的，不在精灵图里，所以包围盒要一直延到地面
    const y1 = Math.max(by + b.h, hy + h.h, q.p.quad ? G.y : 0);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, head: { x: hx, y: hy, w: h.w, h: h.h } };
  };

  D.catHeight = function (G) {
    const bx = D.catBox(G);
    return bx.h;
  };

  // G 需要: catId, spr, x, y, facing, lift, eyeOv, tailPhase
  D.drawCat = function (ctx, G) {
    const S = D.CAT_SPR;
    const q = parts(G);
    const b = q.body, head = q.head;
    const pal = PX.CAT_PAL[G.catId] || PX.CAT_PAL.luna;
    const flip = G.facing < 0;
    const sx = flip ? -1 : 1;
    const x = Math.round(G.x);
    let y = Math.round(G.y - (G.lift || 0));

    // 四足姿势先算出这一帧的腿和身体起伏
    const pose = q.p.quad ? D.Legs.pose(G, b, q.p) : null;
    const bodyY = pose ? Math.round(y + pose.bob) : y;

    // 影子留在地面上，不跟着跳；跑起来腾空时影子收小
    const shw = Math.round(b.w * (q.p.quad ? 0.26 : 0.32));
    const shrink = pose ? 1 + pose.bob * 0.05 : 1;
    PX.ellipse(ctx, x, Math.round(G.y) - 1, Math.round(shw * shrink),
      Math.max(2, (shw / 4) | 0), 'rgba(58,42,64,.26)');

    // 尾巴：一般画在身体后面，睡觉时盘在身前所以画在上面
    const tailKind = (q.p.tail === 'flat' && G.gait === 'run') ? 'run' : q.p.tail;
    const drawTail = () => {
      if (!q.p.tail || !b.tail || !TAILP[tailKind]) return;
      const a = PX.spotOf(b, b.tail, x, pose ? y : bodyY, flip);
      const dy = pose ? Math.round(pose.bobB) : 0;
      const tt = (G.t || 0) + (G.gaitPhase || 0) * 1.4;
      D.Legs.drawTail(ctx, a[0], a[1] + dy, TAILP[tailKind], pal, sx, tt);
    };
    if (!q.p.tailFront) drawTail();

    const drawHead = () => {
      if (!b.head) return;
      const hp = PX.spotOf(b, b.head, x, pose ? y : bodyY, flip);
      const hx = hp[0] + (q.p.hdx || 0) * sx + (pose ? Math.round(pose.lean) * sx : 0);
      const hy = hp[1] + (q.p.hdy || 0) + (pose ? Math.round(pose.headBob) : 0);
      PX.blitAnchored(ctx, head, hx, hy, pal, G.catId, q.p.side ? flip : false);
      const ovName = q.p.side ? G.eyeOv && G.eyeOv.replace('eye_', 'eye2_') : G.eyeOv;
      if (ovName && S[ovName]) {
        const ov = S[ovName];
        const ep = PX.regionOf(head, head.eyes, ov.w, hx, hy, q.p.side ? flip : false);
        PX.blit(ctx, ov, ep[0], ep[1], pal, G.catId, false);
      }
      D.drawWhiskers(ctx, head, hx, hy, pal, q.p.side ? flip : false);
    };

    // 四条腿整条画在身体底下，露出来的只有肚皮线以下那截，
    // 接缝就是身体自己的轮廓线。不要在身体之后再补画，
    // 那一刀的起点会在肚子上留一道横端帽。
    if (pose) {
      D.Legs.draw(ctx, x, y, pose, true, pal, sx, 'all');
      // 坐起来够东西时，近侧那条前腿留到脸之后再画。
      // 猫举爪子的时候爪子就在自己脸前面，藏在脸后就只看得见一只爪。
      D.Legs.draw(ctx, x, y, pose, false, pal, sx, 'all', q.p.rear ? 'hind' : null);
    }
    if (q.p.headBehind) drawHead();           // 睡觉时脸埋在身体里
    if (pose && b.bendX0 !== undefined) {
      const span = b.bendX1 - b.bendX0;
      const neck = pose.neck || 0;   // 脖子跟着脑袋沉，跟腿那边用同一个值
      PX.blitBentAnchored(ctx, b, x, y, pal, G.catId, flip, (col) => {
        const k = U.clamp((col - b.bendX0) / span, 0, 1);
        const e = k * k * (3 - 2 * k);
        return pose.bobB + (pose.bobF - pose.bobB) * e + neck * e;
      });
    } else {
      PX.blitAnchored(ctx, b, x, bodyY, pal, G.catId, flip);
    }
    if (!q.p.headBehind) drawHead();
    if (pose && q.p.rear) D.Legs.draw(ctx, x, y, pose, false, pal, sx, 'all', 'front');
    if (q.p.tailFront) drawTail();
  };

  // 胡子。一根一像素的白弧线。影子压得很淡（.18）：白天的墙是 #EFD9C6，
  // 纯白线贴上去就没了，所以不能完全不压；但压重了上下两道实线并排，
  // 看着就是两像素粗的带子，不像一根毛。
  // 传进来的 x,y 是脸的锚点（下巴中心），不是左上角，
  // 换算方式要和 PX.spotOf 一模一样，否则胡子会飞到身子底下去。
  D.drawWhiskers = function (ctx, head, x, y, pal, flip, clip) {
    if (!head.whisk) return;
    const ax = head.ax === undefined ? (head.w >> 1) : head.ax;
    const ay = head.ay === undefined ? head.h : head.ay;
    const left = flip ? x - (head.w - 1 - ax) : x - ax;
    const top = y - ay;
    const X = (sx) => left + (flip ? head.w - 1 - sx : sx);
    for (const k of head.whisk) {
      const x0 = X(k[0]), y0 = top + k[1];
      let x1 = X(k[2]), y1 = top + k[3];
      // 头像那种刚好裁到脸边的小画布：把外端收回框里，
      // 尖端的 y 按比例跟着收，不然胡子会歪
      if (clip && x1 !== x0) {
        const lim = x1 < x0 ? clip[0] : clip[1];
        if ((x1 < x0 && x1 < lim) || (x1 > x0 && x1 > lim)) {
          y1 = y0 + (y1 - y0) * (lim - x0) / (x1 - x0);
          x1 = lim;
        }
      }
      // 二次贝塞尔，控制点吊在弦的上方：根部先往外扬，到梢上再垂下去
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 - (k[4] || 0);
      let px = x0, py = y0;
      for (let i = 1; i <= 8; i++) {
        const t = i / 8, u = 1 - t;
        const qx = u * u * x0 + 2 * u * t * cx + t * t * x1;
        const qy = u * u * y0 + 2 * u * t * cy + t * t * y1;
        PX.line(ctx, px, py + 1, qx, qy + 1, 'rgba(58,44,48,.18)');
        PX.line(ctx, px, py, qx, qy, pal.W);
        px = qx; py = qy;
      }
    }
  };

  // 头像：把脸画进一个小画布
  D.drawHeadshot = function (ctx, catId, x, y, eyeOv) {
    const head = D.CAT_SPR.head_f;
    const pal = PX.CAT_PAL[catId];
    PX.blit(ctx, head, x, y, pal, catId, false);
    if (eyeOv && D.CAT_SPR[eyeOv]) {
      PX.blit(ctx, D.CAT_SPR[eyeOv], x + head.eyes[0], y + head.eyes[1], pal, catId, false);
    }
    // 画布正好是脸那么大（39x33），所以胡子裁到框里，只剩脸颊上那一截
    D.drawWhiskers(ctx, head, x + head.ax, y + head.ay, pal, false, [x, x + head.w - 1]);
  };
})(window.DOLL);

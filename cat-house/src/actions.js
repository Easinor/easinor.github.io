// 七个互动：摸头 / 喂食 / 喂水 / 梳毛 / 铲屎 / 零食 / 逗猫棒
// 鼠标坐标进来之前已经换算成虚拟像素了。
window.DOLL = window.DOLL || {};
(function (D) {
  'use strict';
  const U = D.U, FX = D.FX, St = D.St, PX = D.PX;

  const A = {};

  A.TOOLS = [
    { id: 'pet', name: 'Pet', hint: 'hold and rub on the cat · click the floor to call her over' },
    { id: 'feed', name: 'Feed', hint: 'fill the food bowl (red)' },
    { id: 'water', name: 'Water', hint: 'fill the water bowl (blue)' },
    { id: 'brush', name: 'Brush', hint: 'stroke back and forth on the cat' },
    { id: 'litter', name: 'Scoop', hint: 'click the poop in the litter box' },
    { id: 'treat', name: 'Treat', hint: 'click the floor to toss a fish biscuit' },
    { id: 'wand', name: 'Wand', hint: 'wave it and the cat will pounce' }
  ];

  // 拿起零食的时候，闲着的猫会凑过来讨
  const BEG_OK = { sit: 1, loaf: 1, wander: 1, groom: 1, gaze: 1, stretch: 1, wantpet: 1, come: 1 };

  A.setTool = function (G, id) {
    if (G.tool === 'wand' && id !== 'wand') D.Game.wand.on = false;
    G.tool = id;
    if (id === 'wand') {
      D.Game.wand.on = true;
      D.Game.wand.x = G.mouse.x;
      D.Game.wand.y = G.mouse.y + 16;
      D.Game.wandHits = 0;
      if (St.cur().energy > 10) D.AI.start(G, 'chase');
      else FX.say('Too tired to play…', { tone: 'warn' });
    }
    if (id === 'treat') {
      for (const cat of (D.Game.cats || [])) {
        if (cat.beh && BEG_OK[cat.beh.name] && !cat.onPerch && !cat.hopping && !cat.nest && !D.AI.treatFull(cat)) D.AI.start(cat, 'beg');
      }
    }
    D.UI.syncTools();
  };

  // ---------- 命中判定 ----------
  A.hitBody = function (G, x, y) {
    const b = D.catBox(G);
    return x >= b.x - 2 && x <= b.x + b.w + 2 && y >= b.y - 2 && y <= b.y + b.h + 2;
  };
  A.hitHead = function (G, x, y) {
    const h = D.catBox(G).head;
    return x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h;
  };

  // 倒完碗以后两只猫都过去吃 / 喝（没有饱食度了：有粮就吃、有水就喝；睡着的不叫醒，已经在吃 / 喝的不打断）
  function callCats(beh) {
    for (const cat of (D.Game.cats || [])) {
      const name = cat.beh && cat.beh.name;
      if (name === beh || /sleep|nap/i.test(name || '') || cat.sleeping || (cat.inBox && cat.boxPose === 'nap')) continue;
      D.AI.start(cat, beh);
    }
  }
  const REFILL_GAP = 10;   // 秒：10 秒内连着倒两次，提示碗还是满的
  const now = () => performance.now() / 1000;

  // ---------- 喂食 ----------
  A.feed = function (G) {
    const bowl = D.Game.bowl;
    if (bowl.lastT && now() - bowl.lastT < REFILL_GAP) { FX.say(U.pick(['The food is still full', 'Just filled, still full']), { tone: 'warn' }); return; }
    if (bowl.fill > 0.35) { FX.say("There's still some in the bowl", { tone: 'warn' }); return; }
    bowl.fill = 1;
    bowl.lastT = now();
    const fx = G.L.bowl.x - D.Scene.BOWL_DX;
    FX.spawn('crumb', fx, G.L.bowl.y - 6, { n: 10, spread: 4, vy: -12, g: 90, life: .8 });
    FX.spawn('sparkle', fx, G.L.bowl.y - 6, { n: 3, spread: 5, life: .9 });
    FX.toast('+ Food', fx, G.L.bowl.y - 12, '#B8763C');
    callCats('goEat');
    St.addBond();
    G.sinceTouch = 0;
  };

  // ---------- 喂水 ----------
  A.water = function (G) {
    const w = D.Game.water;
    if (w.lastT && now() - w.lastT < REFILL_GAP) { FX.say(U.pick(['The water is still full', 'Just filled, still full']), { tone: 'warn' }); return; }
    if (w.fill > 0.5) { FX.say(U.pick(['Still plenty of water', "There's water in the bowl"]), { tone: 'warn' }); return; }
    w.fill = 1;
    w.lastT = now();
    const bx = G.L.bowl.x + D.Scene.BOWL_DX, by = G.L.bowl.y - 8;
    FX.spawn('sparkle', bx, by, { n: 6, spread: 6, life: .9, color: '#8EC3E6' });
    FX.toast('+ Water', bx, by - 4, '#4F8DC0');
    callCats('goDrink');
    St.addBond();
    G.sinceTouch = 0;
  };

  // ---------- 铲屎 ----------
  A.scoopAt = function (G, x, y) {
    const L = G.L, poops = D.Game.poops;
    for (let i = poops.length - 1; i >= 0; i--) {
      const p = poops[i];
      if (U.dist(x, y, L.litter.x + p.ox, L.litter.y + p.oy) < 11) {
        poops.splice(i, 1);
        const c = St.cur();
        c.litter = U.clamp(c.litter + 22, 0, 100);
        c.mood = U.clamp(c.mood + 3, 0, 100);
        c.scoops++;
        St.addBond(2);
        FX.spawn('puff', L.litter.x + p.ox, L.litter.y + p.oy, { n: 3, spread: 3, g: -2, life: .7 });
        FX.spawn('sparkle', L.litter.x + p.ox, L.litter.y + p.oy - 3, { n: 3, spread: 3, life: .8 });
        FX.toast('+ Clean', L.litter.x + p.ox, L.litter.y + p.oy - 8, '#4F9E6E');
        if (poops.length === 0) FX.say(U.pick(['All clean~', 'Thanks, human', 'Much better']), { dur: 2.2 });
        return true;
      }
    }
    if (Math.abs(x - L.litter.x) < 24 && Math.abs(y - (L.litter.y - 8)) < 14) {
      const c = St.cur();
      if (c.litter > 92) { FX.say('The litter box is clean', { tone: 'warn' }); return true; }
      if (D.Game.sandCd > 0) return true;
      D.Game.sandCd = 6;
      c.litter = U.clamp(c.litter + 14, 0, 100);
      St.addBond(1);
      FX.spawn('dust', L.litter.x, L.litter.y - 8, { n: 6, spread: 9, g: -1, life: .9 });
      FX.toast('Fresh litter', L.litter.x, L.litter.y - 16, '#6E93AD');
      return true;
    }
    return false;
  };

  // ---------- 摸 / 刷 ----------
  function rub(G, x, y, px, py, kind) {
    const moved = U.dist(x, y, px, py);
    if (!A.hitBody(G, x, y)) return;
    const c = St.cur();
    const head = A.hitHead(G, x, y);

    if (kind === 'pet') {
      G.petStroke = Math.min(1, G.petStroke + moved * 0.14 + 0.03);
      G.rubAccum += moved * (head ? 1.4 : 1);
      c.mood = U.clamp(c.mood + moved * (head ? 0.09 : 0.05), 0, 100);
      c.bond += moved * 0.018;
      if (G.rubAccum > 22) {
        G.rubAccum = 0;
        c.pets++;
        FX.spawn('heart', x + U.rnd(-3, 3), y - 4, { vy: -11, g: 1, life: 1.4 });
        if (U.chance(.35)) FX.spawn('note', x + U.rnd(-5, 5), y - 6, { vy: -9, g: .5, life: 1.5 });
        // 摸头摸舒服了：有一定概率翻过来露肚皮打呼噜（心情越好越容易）
        const busy = G.nest || (G.beh && { bellyUp: 1, sleep: 1, pairSleep: 1, pairGroom: 1, wheel: 1, perch: 1, hopDown: 1, goTreat: 1, sunbathe: 1 }[G.beh.name]);
        if (head && !busy && !G.hopping && U.chance(0.08 + Math.max(0, c.mood - 50) * 0.004)) {
          D.AI.start(G, 'bellyUp');
        }
      }
    } else {
      G.brushStroke = Math.min(1, G.brushStroke + moved * 0.12 + 0.03);
      G.rubAccum += moved;
      c.coat = U.clamp(c.coat + moved * 0.14, 0, 100);
      c.mood = U.clamp(c.mood + moved * 0.04, 0, 100);
      c.bond += moved * 0.012;
      if (G.rubAccum > 18) {
        G.rubAccum = 0;
        c.brushes++;
        FX.spawn('fur', x + U.rnd(-3, 3), y + U.rnd(-2, 2), { n: 2, vy: -7, g: 8, life: 1.3 });
        if (U.chance(.4)) FX.spawn('sparkle', x, y - 4, { life: .8 });
      }
    }
    G.sinceTouch = 0;
    G.purr = Math.min(1, G.purr + 0.04);
  }

  // ---------- 零食 ----------
  // 点哪儿就往哪儿扔一块小鱼饼干（落点收在猫走得到的那片地板上），地上最多同时 3 块
  A.tossTreat = function (G, x, y) {
    const Gm = D.Game, L = G.L;
    if (Gm.treats.length >= 3) { FX.say("That's plenty on the floor", { tone: 'warn', dur: 1.8 }); return; }
    if (now() - (Gm.treatT == null ? -9 : Gm.treatT) < 0.35) return;
    Gm.treatT = now();
    const ty = D.AI.clampY(L, y);
    Gm.treats.push({ x: U.clamp(x, 16, L.W - 16), y: ty, z: Math.max(6, ty - y), vz: 26 });
    G.sinceTouch = 0;
  };

  // ---------- 叫猫 ----------
  // 拿着手点一下空地板：当前照顾的那只小跑过来坐下
  const COME_OK = { sit: 1, loaf: 1, wander: 1, groom: 1, gaze: 1, stretch: 1, wantpet: 1, come: 1, play: 1, zoomies: 1, sunbathe: 1, beg: 1 };
  A.callCat = function (G, x, y) {
    if (now() - (G.callT == null ? -9 : G.callT) < 0.8) return;
    G.callT = now();
    const L = G.L, ty = D.AI.clampY(L, y);
    FX.spawn('dust', x, ty, { n: 3, spread: 3, g: -1, life: .5 });
    if (!G.beh || !COME_OK[G.beh.name] || G.hopping || G.nest) return;
    G.comeTo = { x: x, y: ty };
    D.AI.start(G, 'come');
  };

  // ---------- 点鼻子 ----------
  // 在猫脸上轻轻点一下（按下就松开、没拖动）：猫挤一下眼
  function boop(G, x, y) {
    G.boopT = 0.55;
    FX.toast('boop!', x, y - 8, '#E8607F');
    if (U.chance(.5)) FX.say(D.AI.line(G, 'boop'), { cat: G.catId, dur: 1.4 });
    if (U.chance(.25)) FX.spawn('puff', x + 6 * G.facing, y + 2, { n: 2, spread: 2, g: -2, life: .5 });
    St.cur().mood = U.clamp(St.cur().mood + 1, 0, 100);
  }

  // ---------- 逗猫棒 ----------
  A.updateWand = function (G, dt) {
    const w = D.Game.wand;
    if (!w.on) return;
    // 手指按着的时候逗猫棒整根往上提：羽毛吊在指尖上方一点，不被手指挡住
    w.hx = G.mouse.x; w.hy = G.mouse.y - (G.touch ? 32 : 0);
    const tx = w.hx, ty = w.hy + 20;
    w.vx += (tx - w.x) * 46 * dt;
    w.vy += (ty - w.y) * 46 * dt;
    w.vx *= Math.exp(-5.2 * dt);
    w.vy *= Math.exp(-5.2 * dt);
    w.x += w.vx * dt;
    w.y += w.vy * dt;
    w.speed = Math.hypot(w.vx, w.vy);
    if (w.speed > 110 && U.chance(dt * 6)) FX.spawn('sparkle', w.x, w.y, { n: 1, life: .5 });
  };

  // ---------- 输入 ----------
  A.onDown = function (G, x, y) {
    G.dragging = true;
    G.lastX = x; G.lastY = y;
    G.downT = now(); G.downX = x; G.downY = y; G.downMoved = 0;
    if (G.tool === 'treat') { A.tossTreat(G, x, y); return; }
    if (G.tool === 'litter') {
      if (!A.scoopAt(G, x, y) && A.hitBody(G, x, y)) FX.say(U.pick(['Meow?', "That's not the litter box"]), { tone: 'warn' });
      return;
    }
    if (G.tool === 'wand') return;
    if (A.hitBody(G, x, y) && (G.tool === 'pet' || G.tool === 'brush')) {
      rub(G, x, y, x, y, G.tool);
      if (G.beh && G.beh.name === 'sleep') {
        if (U.chance(.5)) FX.say(U.pick(['Mm…', 'zzz…']), { dur: 1.6 });
        else { D.AI.start(G, 'loaf'); FX.say(D.AI.line(G, 'poke')); }
      } else if (G.beh && G.beh.name === 'wantpet') {
        FX.spawn('heart', x, y - 5, { n: 4, spread: 4, vy: -13, life: 1.4, big: 1 });
        St.addBond(3);
      }
    } else if (G.tool === 'pet' && D.Game.showScene && y >= D.AI.floorMin(G.L) - 6 &&
        !(D.Game.G2 && A.hitBody(D.Game.G2, x, y))) {
      A.callCat(G, x, y);
    }
  };

  A.onMove = function (G, x, y) {
    if (Math.abs(x - G.lastX) + Math.abs(y - G.lastY) > 0.4) G.stillT = 0;
    if (!G.dragging) { G.lastX = x; G.lastY = y; return; }
    G.downMoved = (G.downMoved || 0) + U.dist(x, y, G.lastX, G.lastY);
    if (G.tool === 'pet' || G.tool === 'brush') rub(G, x, y, G.lastX, G.lastY, G.tool);
    if (G.tool === 'litter') A.scoopAt(G, x, y);
    G.lastX = x; G.lastY = y;
  };

  A.onUp = function (G) {
    // 在脸上快快地点一下（没拖动）：点鼻子
    if (G.dragging && G.tool === 'pet' && now() - (G.downT || 0) < 0.3 && (G.downMoved || 0) < 2 &&
        A.hitHead(G, G.downX, G.downY) && !(G.spr === 'sleep')) boop(G, G.downX, G.downY);
    G.dragging = false;
    // 摸 / 梳一次算一个动作；隔 3 秒才再算，免得连点刷分
    if ((G.petStroke > .4 || G.brushStroke > .4) && now() - (G.strokeBondT || 0) > 3) {
      G.strokeBondT = now();
      St.addBond();
    }
  };

  A.tick = function (G, dt) {
    G.petStroke = Math.max(0, G.petStroke - dt * 1.6);
    G.brushStroke = Math.max(0, G.brushStroke - dt * 1.6);
    G.purr = Math.max(0, G.purr - dt * 0.8);
    if (D.Game.sandCd > 0) D.Game.sandCd -= dt;
    A.updateWand(G, dt);
    // 慢眨眼：手停在猫脸上不动两秒，猫会对你慢慢眨一下眼（猫表示信任的方式），冒一颗小爱心
    if (G.tool === 'pet' && G.mouseIn && !G.dragging) {
      const cat = (D.Game.cats || []).find(c => A.hitHead(c, G.mouse.x, G.mouse.y) && c.spr !== 'sleep' && !c.hopping);
      G.stillT = cat ? (G.stillT || 0) + dt : 0;
      if (cat && G.stillT > 2) {
        G.stillT = -8;                              // 隔一阵才会再眨
        cat.slowBlink = 1.5;
        FX.spawn('heart', cat.x + U.rnd(-3, 3), D.catBox(cat).y - 2, { vy: -7, g: 0.6, life: 1.6 });
      }
    } else G.stillT = 0;
    if (G.purr > 0.35) {
      G.purrT = (G.purrT || 0) - dt;
      if (G.purrT <= 0) {
        G.purrT = U.rnd(.35, .7);
        FX.spawn('note', G.x + U.rnd(-6, 6) + 8 * G.facing, G.y - 34, { vy: -8, g: 0, life: 1.3 });
      }
    }
  };

  // ---------- 手里的道具（像素）----------
  A.drawCursor = function (ctx, G) {
    if (!G.mouseIn && !(G.tool === 'wand' && G.touch && D.Game.wand.on)) return;
    // 触摸屏上道具画在指尖上方一点（判定还是按指尖的位置）
    const x = Math.round(G.mouse.x), y = Math.round(G.mouse.y) - (G.touch ? 9 : 0);
    const t = G.t;

    if (G.tool === 'wand') {
      const w = D.Game.wand;
      // 杆
      PX.line(ctx, w.hx - 14, w.hy - 11, w.hx, w.hy, '#8A5E3C');
      PX.line(ctx, w.hx - 14, w.hy - 10, w.hx - 1, w.hy + 1, '#C89A6E');
      // 线
      PX.line(ctx, w.hx, w.hy, w.x, w.y, 'rgba(90,80,100,.55)');
      // 羽毛
      const cols = ['#E8607F', '#F09A4E', '#6FB4E0', '#7FC98A', '#B98BD8'];
      for (let i = 0; i < 5; i++) {
        PX.rect(ctx, w.x - 4 + i * 2, w.y + ((i % 2) ? 1 : 0), 2, 5, cols[i]);
      }
      PX.rect(ctx, w.x - 2, w.y - 2, 4, 3, '#E8D7B8');
      return;
    }

    if (G.tool === 'treat') {
      // 捏着一块小鱼饼干
      D.Scene.drawTreat(ctx, { x: x, y: y - 4, z: 0 }, false);
      PX.rect(ctx, x - 3, y, 7, 4, '#E7B993'); PX.rect(ctx, x - 2, y + 4, 5, 2, '#D9A47E');
      PX.rect(ctx, x - 4, y - 2, 2, 3, '#F6D8C0'); PX.rect(ctx, x + 3, y - 2, 2, 3, '#F6D8C0');
      return;
    }
    if (G.tool === 'brush') {
      const k = G.dragging ? (Math.floor(t * 14) % 2) : 0;
      PX.rect(ctx, x - 2, y + 1 + k, 4, 8, '#B5793F');
      PX.rect(ctx, x - 5, y - 6 + k, 10, 7, '#5E6B86');
      PX.rect(ctx, x - 5, y - 8 + k, 10, 2, '#CFD8E8');
      PX.rect(ctx, x - 4, y - 10 + k, 2, 2, '#CFD8E8');
      PX.rect(ctx, x, y - 10 + k, 2, 2, '#CFD8E8');
      PX.rect(ctx, x + 3, y - 10 + k, 1, 2, '#CFD8E8');
    } else if (G.tool === 'litter') {
      const k = G.dragging ? (Math.floor(t * 12) % 2) : 0;
      PX.rect(ctx, x + 2, y + 1 + k, 2, 8, '#6E7C96');
      PX.rect(ctx, x - 6, y - 6 + k, 11, 7, '#B4C2D8');
      PX.rect(ctx, x - 6, y - 7 + k, 11, 1, '#D4DEEC');
      PX.rect(ctx, x - 4, y - 4 + k, 1, 4, '#8795AE');
      PX.rect(ctx, x - 1, y - 4 + k, 1, 4, '#8795AE');
      PX.rect(ctx, x + 2, y - 4 + k, 1, 4, '#8795AE');
    } else if (G.tool === 'pet') {
      const d = G.dragging ? 1 : 0;
      PX.rect(ctx, x - 5, y - 2 + d, 10, 6, '#E7B993');
      PX.rect(ctx, x - 4, y + 4 + d, 8, 2, '#D9A47E');
      PX.rect(ctx, x - 5, y - 5 + d, 2, 4, '#F6D8C0');
      PX.rect(ctx, x - 2, y - 6 + d, 2, 5, '#F6D8C0');
      PX.rect(ctx, x + 1, y - 6 + d, 2, 5, '#F6D8C0');
      PX.rect(ctx, x + 4, y - 4 + d, 2, 4, '#F6D8C0');
      PX.rect(ctx, x - 4, y - 1 + d, 8, 4, '#F6D8C0');
      // 大拇指：从手掌左侧往外斜着伸出去（上面那四根是食指到小指）
      PX.rect(ctx, x - 8, y - 1 + d, 2, 3, '#F6D8C0');
      PX.rect(ctx, x - 7, y + 1 + d, 2, 2, '#F6D8C0');
      PX.rect(ctx, x - 6, y + 2 + d, 1, 2, '#E7B993');
    }
  };

  D.Act = A;
})(window.DOLL);

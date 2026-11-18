// 启动、主循环、输入。整个游戏画在「虚拟像素」坐标系里，
// 主画布用 setTransform(Z,0,0,Z,0,0) + 关平滑放大，1 虚拟像素 = 屏幕上 Z×Z 的方块。
window.DOLL = window.DOLL || {};
(function (D) {
  'use strict';
  const U = D.U, FX = D.FX, St = D.St, AI = D.AI, Act = D.Act, UI = D.UI, PX = D.PX;

  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');

  const G = {
    catId: 'luna',
    spr: 'sit', x: 0, y: 0, facing: 1, lift: 0,
    beh: null, behDone: false, lastBeh: null, walking: false,
    walkTo: 0, tailPhase: 0, gait: null, gaitPhase: 0, gaitHold: 0,
    blinkT: 2, blinkP: 0, eyeOv: null,
    petStroke: 0, brushStroke: 0, rubAccum: 0, purr: 0, pounce: 0,
    sinceTouch: 0, sinceLitter: 0,
    tool: 'pet', dragging: false, lastX: 0, lastY: 0,
    mouse: { x: 0, y: 0 }, mouseIn: false,
    t: 0, L: null, Z: 4, paused: false
  };

  // 另一只猫：同时待在屋里，自己按性格活动。你照顾的是 G（当前那只），
  // 「换一只猫」就是把两只的猫身上的状态对调。
  const PLAYER_KEYS = { tool: 1, dragging: 1, lastX: 1, lastY: 1, mouse: 1, mouseIn: 1, t: 1, L: 1, Z: 1, paused: 1, dpr: 1 };
  const G2 = {
    catId: 'nova',
    spr: 'sit', x: 0, y: 0, facing: -1, lift: 0,
    beh: null, behDone: false, lastBeh: null, walking: false,
    walkTo: 0, tailPhase: 0, gait: null, gaitPhase: 0, gaitHold: 0,
    blinkT: 3, blinkP: 0, eyeOv: null,
    petStroke: 0, brushStroke: 0, rubAccum: 0, purr: 0, pounce: 0,
    sinceTouch: 0, sinceLitter: 0, t: 0, L: null, Z: 4
  };

  const Game = {
    G: G,
    G2: G2,
    cats: [G, G2],
    toys: [],
    wheel: { angle: 0, speed: 0 },   // 跑轮转的角度和角速度（有猫在里面跑才转）
    showScene: true,
    bowl: { fill: 0 },
    water: { fill: 0.6 },              // 水碗：开局有大半碗水
    wand: { on: false, x: 0, y: 0, vx: 0, vy: 0, hx: 0, hy: 0, speed: 0 },
    poops: [],
    sandCd: 0,
    wandHits: 0,
    forceHour: null
  };
  D.Game = Game;

  // 只有猫在砂盆里蹲完才会调到这里：粑粑落在她蹲的位置（ox = 相对砂盆中心）
  Game.addPoop = function (cat, ox) {
    cat = cat || G;
    cat.sinceLitter = 0;
    if (Game.poops.length >= 4) return;
    const x = ox == null ? U.rndInt(-14, 14) : Math.round(U.clamp(ox + U.rndInt(-3, 3), -14, 14));
    Game.poops.push({ ox: x, oy: U.rndInt(-9, -6) });
    St.poops = Game.poops;
  };

  // 两只猫都在屋里，换的只是「你在照顾哪一只」：把猫身上的状态对调，位置和正在做的事都跟着猫走
  function swapCats() {
    const keys = new Set(Object.keys(G).concat(Object.keys(G2)));
    for (const k of keys) {
      if (PLAYER_KEYS[k]) continue;
      const a = G[k]; G[k] = G2[k]; G2[k] = a;
    }
  }
  Game.switchCat = function (id) {
    if (G.catId !== id) {
      if (G2.catId === id) swapCats();
      else G.catId = id;
    }
    G2.catId = G.catId === 'luna' ? 'nova' : 'luna';
    St.cat = id;
    FX.clear();
    G.paused = false;
    if (!G.beh) AI.start(G, 'stretch');
    FX.say(U.pick(['Here I am~', 'Meow.', D.CATS[id].name + ' is here']), { dur: 2.4 });
    UI.syncTools();
    St.save();
  };

  Game.resize = function () {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(320, window.innerWidth), h = Math.max(240, window.innerHeight);
    const mini = document.body.classList.contains('mini');
    const zoomMul = 0.78;   // 猫的大小固定用「小」，不再提供切换
    const base = mini
      ? Math.min(w / 110, h / 100)
      : Math.min(w / 215, h / 124);
    const Z = U.clamp(Math.round(base * zoomMul), 2, 14);
    G.Z = Z;
    const VW = Math.ceil(w / Z), VH = Math.ceil(h / Z);

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.imageSmoothingEnabled = false;

    const prevW = G.L ? G.L.W : 0;
    G.L = D.Scene.layout(VW, VH);
    if (mini) G.L.floorY = Math.round(VH * 0.84);
    // 猫踩的地面：比墙脚往屋里再进一点（和猫窝、砂盆、碗架在同一排），不然猫贴着墙像飘着
    G.L.catY = G.L.floorY + Math.round((VH - G.L.floorY) * 0.26);
    // 每只猫站在地板上的深度 gy（地板是个平面，不是一条线）
    G.gy = AI.clampY(G.L, G.gy != null ? G.gy : G.L.catY + 4);
    G.y = G.gy;
    G.x = (prevW > 0 && G.x > 0) ? Math.round(G.x / prevW * VW) : Math.round(VW * 0.46);
    G.x = U.clamp(G.x, Math.min(20, VW / 2), Math.max(VW - 20, VW / 2));
    G.dpr = dpr;
    // 另一只猫和玩具也跟着按比例挪
    G2.L = G.L; G2.Z = Z;
    G2.x = (prevW > 0 && G2.x > 0) ? Math.round(G2.x / prevW * VW) : Math.round(VW * 0.24);
    G2.gy = AI.clampY(G.L, G2.gy != null ? G2.gy : G.L.catY + 14);
    if (!G2.onPerch) G2.y = G2.gy;
    if (!Game.toys.length) {
      Game.toys = [
        { kind: 'yarn', x: VW * 0.62, vx: 0, spin: 0 },
        { kind: 'mouse', x: VW * 0.30, vx: 0, spin: 0 }
      ];
    } else if (prevW > 0) {
      for (const t of Game.toys) t.x = t.x / prevW * VW;
    }
    Game.toys[0].y = G.L.floorY + 20;
    Game.toys[1].y = G.L.floorY + 27;
  };

  // ---------- 输入 ----------
  const PHOTO_LINES = {
    luna: ['…Hmph', "Don't poke it", 'Not my best angle', 'Who took that one…'],
    nova: ["That's me!!", 'Look how cute I am!', 'Take another one!', 'Best photo ever!']
  };
  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / G.Z, y: (e.clientY - r.top) / G.Z };
  }
  canvas.addEventListener('pointerdown', (e) => {
    const p = pos(e);
    G.mouse = p; G.mouseIn = true;
    canvas.setPointerCapture(e.pointerId);
    // 拿着手（摸头）点另一只猫 = 换成照顾她
    if (Game.showScene && G.tool === 'pet' && Act.hitBody(G2, p.x, p.y) && !Act.hitBody(G, p.x, p.y)) {
      UI.chooseCat(G2.catId);
      return;
    }
    // 点墙上的照片：给照片里那只猫换下一套装扮；照片晃一晃、冒爱心，那只猫会接一句话
    const ph = Game.showScene && G.tool !== 'wand' ? D.Scene.hitPhoto(G.L, p.x, p.y) : null;
    if (ph) {
      D.Scene.pokePhoto(ph.id);
      FX.toast('Outfit: ' + UI.cycleAcc(ph.id), Math.max(30, ph.x + ph.w / 2), ph.y + ph.h + 6, D.CATS[ph.id].tagColor);
      FX.spawn('heart', ph.x + ph.w / 2, ph.y + 6, { n: 4, spread: 7, vy: -11, life: 1.3 });
      FX.say(U.pick(PHOTO_LINES[ph.id]), { dur: 2.2, cat: ph.id });
      return;
    }
    Act.onDown(G, p.x, p.y);
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pos(e);
    G.mouse = p; G.mouseIn = true;
    Act.onMove(G, p.x, p.y);
  });
  canvas.addEventListener('pointerup', () => Act.onUp(G));
  canvas.addEventListener('pointercancel', () => Act.onUp(G));
  document.addEventListener('mouseleave', () => { G.mouseIn = false; G.dragging = false; });
  document.addEventListener('mouseenter', () => { G.mouseIn = true; });

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    const map = { p: 'pet', f: 'feed', w: 'water', b: 'brush', l: 'litter', t: 'wand' };
    const nums = { '1': 'pet', '2': 'feed', '3': 'brush', '4': 'litter', '5': 'wand', '6': 'water' };
    const id = map[k] || nums[k];
    if (id) { UI.pickTool(id); UI.flash(id); return; }
    if (k === 'escape') Act.setTool(G, 'pet');
  });

  window.addEventListener('resize', () => Game.resize());

  // ---------- 循环 ----------
  let last = performance.now();
  let saveT = 0;

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;
    G.t += dt;

    St.tick(dt);
    G.sinceTouch += dt;
    G.sinceLitter += dt;
    const c = St.cur();
    if (G.beh && G.beh.name !== 'sleep' && G.beh.name !== 'zoomies' && G.beh.name !== 'chase') {
      c.energy = U.clamp(c.energy - 0.035 * dt, 0, 100);
    }

    const mini = document.body.classList.contains('mini');
    const showScene = St.settings.scene && !mini;
    Game.showScene = showScene;
    const L = G.L;

    if (!G.paused) AI.update(G, dt);
    Act.tick(G, dt);
    AI.animate(G, G.t, dt);
    // 另一只猫：只在完整房间里出现（桌宠小窗太窄，放不下两只）
    if (showScene) {
      G2.t = G.t;
      G2.sinceTouch += dt;
      G2.sinceLitter += dt;
      AI.update(G2, dt);
      AI.animate(G2, G.t, dt);
      AI.birdTick(dt, L, Game.hourNow);   // 窗外偶尔落一只小鸟
    }
    FX.update(dt);
    D.Scene.tick(dt, G.t);

    // 站在哪儿：高处的猫贴在爬架 / 窗台上，其余贴地；跳的时候由行为自己管 y
    for (const cat of Game.cats) {
      if (!showScene && cat.onPerch) { cat.onPerch = null; cat.hopping = false; }
      if (cat.hopping) continue;
      const p = AI.perchPoint(cat);
      if (p) { cat.y = p.y; cat.x = p.x; }
      else {
        // 站在自己的那一排地板上
        cat.gy = AI.clampY(L, cat.gy != null ? cat.gy : L.catY);
        cat.y = cat.gy;
        cat.x = U.clamp(cat.x, 14, L.W - 14);
      }
    }

    // 玩具：被拍出去会滚一段，撞墙弹回来
    for (const toy of Game.toys) {
      toy.x += toy.vx * dt;
      toy.vx *= Math.exp(-2.4 * dt);
      if (toy.x < 10) { toy.x = 10; toy.vx = Math.abs(toy.vx) * 0.6; }
      if (toy.x > L.W - 10) { toy.x = L.W - 10; toy.vx = -Math.abs(toy.vx) * 0.6; }
      toy.spin = (toy.spin || 0) + toy.vx * dt * 0.35;
    }
    // 跑轮：猫不跑了就慢慢停下来
    Game.wheel.angle += Game.wheel.speed * dt;
    Game.wheel.speed *= Math.exp(-1.6 * dt);

    // ---------- 画 ----------
    const Z = G.Z, dpr = G.dpr || 1;
    ctx.setTransform(Z * dpr, 0, 0, Z * dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, L.W, L.H);

    const now2 = new Date();
    const hour = Game.forceHour != null ? Game.forceHour : now2.getHours() + now2.getMinutes() / 60;
    Game.hourNow = hour;

    let hoverLitter = false;
    if (showScene) {
      D.Scene.draw(ctx, L, G.t, hour, G.mouseIn ? G.mouse : null);
      for (const p of Game.poops) {
        p.hot = G.tool === 'litter' && U.dist(G.mouse.x, G.mouse.y, L.litter.x + p.ox, L.litter.y + p.oy) < 11;
      }
      hoverLitter = G.tool === 'litter' && U.dist(G.mouse.x, G.mouse.y, L.litter.x, L.litter.y - 8) < 28;
    } else {
      const sky = D.Scene.skyOf(hour);
      PX.rect(ctx, 0, 0, L.W, L.H, sky.night ? '#413A52' : '#F2E2D2');
      PX.rect(ctx, 0, L.floorY, L.W, L.H - L.floorY, sky.night ? '#574A64' : '#E0C8B6');
      PX.dither(ctx, 0, L.floorY, L.W, 3, sky.night ? '#413A52' : '#F2E2D2', 0);
    }

    const night = D.Scene.skyOf(hour).night;
    // 地板是个平面：家具和猫按「站在地板上的深度」从后往前画，
    // 靠前的挡住靠后的（猫走到跑轮前面就挡住跑轮，走到后面就被跑轮挡住）。
    // 在爬架 / 窗台上、正在跳的猫最后画（它们在半空，不跟地上的东西比前后）。
    const items = [];
    if (showScene) {
      const wheelBase = L.catY + 3;
      items.push({ k: wheelBase, f: () => D.Scene.drawWheel(ctx, L, Game.wheel.angle, 'back', night) });
      items.push({ k: L.bed.y, f: () => D.Scene.drawBed(ctx, L.bed.x, L.bed.y) });
      items.push({ k: L.litter.y + 4, f: () => D.Scene.drawLitter(ctx, L.litter.x, L.litter.y, Game.poops, hoverLitter) });
      items.push({ k: L.bowl.y + 2, f: () => D.Scene.drawBowl(ctx, L.bowl.x, L.bowl.y, Game.bowl.fill, G.t, Game.water.fill) });
      for (const toy of Game.toys) items.push({ k: toy.y + 3, f: () => D.Scene.drawToys(ctx, [toy], night) });
      for (const cat of [G, G2]) {
        let k = cat.y;
        if (cat.inWheel) k = wheelBase + 0.1;                       // 在跑轮里：紧跟在跑轮后面画
        else if (cat.onPerch || cat.hopping) k = 1000 + cat.y * 0.001;
        items.push({
          k: k, f: () => {
            D.drawCat(ctx, cat);
            // 在轮子里跑的那只：画完马上补上跑道的前沿，猫就像被框在轮子里
            if (cat.inWheel) D.Scene.drawWheel(ctx, L, Game.wheel.angle, 'front', night);
          }
        });
      }
    } else {
      items.push({ k: 0, f: () => D.drawCat(ctx, G) });
    }
    items.sort((a, b) => a.k - b.k);
    for (const it of items) it.f();

    FX.draw(ctx);
    Act.drawCursor(ctx, G);

    // 文字层用屏幕坐标，中文才看得清
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 每只猫头上画自己说的气泡
    for (const cat of (showScene ? [G, G2] : [G])) {
      const cb = D.catBox(cat);
      FX.drawBubbles(ctx, cat.x * Z, (cb.y - (cat.lift || 0) - 2) * Z, Z, cat.catId);
    }
    FX.drawToasts(ctx, Z);

    UI.tick(dt, G.t);

    saveT += dt;
    if (saveT > 8) { saveT = 0; St.save(); }
    requestAnimationFrame(frame);
  }

  // ---------- 启动 ----------
  function boot() {
    const offline = St.load();
    const q = new URLSearchParams(location.search);
    // 桌宠模式和场景开关先拿掉：一直是完整房间、两只猫都在
    St.settings.mini = false;
    St.settings.scene = true;
    St.firstRun = false;
    document.body.classList.remove('mini');
    Game.forceHour = q.has('hour') ? parseFloat(q.get('hour')) : null;
    D.Scene.init();
    Game.poops = St.poops || [];
    UI.build();
    Game.resize();
    G.catId = St.cat;
    G2.catId = G.catId === 'luna' ? 'nova' : 'luna';
    UI.syncTools();

    if (St.firstRun) {
      UI.openChooser();
    } else {
      document.getElementById('chooser').classList.add('hide');
      AI.start(G, 'stretch');
      const c = St.cur();
      if (offline > 90) FX.say(U.pick(["You're back!", 'Where did you go…', 'I waited so long']), { dur: 3 });
      setTimeout(() => {
        if (c.litter < 30) FX.say(AI.line(G, 'dirty'), { tone: 'warn', dur: 3 });
        else if (c.coat < 35) FX.say(AI.line(G, 'messy'), { tone: 'warn', dur: 3 });
      }, 2600);
    }

    setInterval(() => {
      if (St.firstRun || G.paused) return;
      const c = St.cur();
      if (G.beh && G.beh.name === 'sleep') return;
      if (c.litter < 25 && U.chance(.4)) FX.say(AI.line(G, 'dirty'), { tone: 'warn' });
      else if (c.coat < 30 && U.chance(.35)) FX.say(AI.line(G, 'messy'), { tone: 'warn' });
      else if (c.mood > 75 && U.chance(.2)) FX.say(AI.line(G, 'happy'));
    }, 26000);

    window.addEventListener('beforeunload', () => St.save());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) St.save(); else last = performance.now();
    });

    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.DOLL);

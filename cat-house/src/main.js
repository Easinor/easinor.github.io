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
    treats: [],                        // 扔在地上的零食
    boxWob: 0,                         // 纸箱被碰了以后晃的那一下（秒）
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
  // quiet：悄悄换（逗猫棒吸引到另一只时用），不清场上的特效、不打招呼
  Game.switchCat = function (id, quiet) {
    if (G.catId !== id) {
      if (G2.catId === id) swapCats();
      else G.catId = id;
    }
    G2.catId = G.catId === 'luna' ? 'nova' : 'luna';
    St.cat = id;
    G.paused = false;
    if (!G.beh) AI.start(G, 'stretch');
    if (!quiet) {
      FX.clear();
      FX.say(U.pick(['Here I am~', 'Meow.', D.CATS[id].name + ' is here']), { dur: 2.4 });
    }
    UI.syncTools();
    St.save();
  };

  // 逗猫棒离哪只猫近，哪只就被吸引过来玩：另一只明显更近、并且持续半秒以上，就换成它来追。
  // 睡着的、在吃饭喝水的、在上厕所的、在跑轮里的、正在半空跳的不叫；正在追的那只跳到一半时也不换。
  const WAND_BUSY = { sleep: 1, pairSleep: 1, useLitter: 1, hopDown: 1, perch: 1, wheel: 1, goEat: 1, goDrink: 1, bedNap: 1, box: 1, nestOut: 1, goTreat: 1 };
  let wandSwitchT = 0;
  function wandAttract(dt) {
    const w = Game.wand;
    if (!w.on || G.tool !== 'wand' || !Game.showScene || G.chaseHops) { wandSwitchT = 0; return; }
    const dist = (cat) => Math.hypot(w.x - cat.x, w.y - (cat.y - 12));
    const other = G2, busy = !other.beh || WAND_BUSY[other.beh.name] || other.hopping;
    const tired = (St.data[other.catId] || {}).energy <= 10;
    if (busy || tired || dist(other) + 16 >= dist(G)) { wandSwitchT = 0; return; }
    wandSwitchT += dt;
    if (wandSwitchT < 0.5) return;
    wandSwitchT = 0;
    Game.switchCat(other.catId, true);      // 对调之后 G 就是离得近的那只
    AI.start(G, 'chase');                   // 原来追的那只（现在是 G2）下一帧自己会停下来
  }
  Game.wandAttract = wandAttract;

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
  const CALL_OK = { sit: 1, loaf: 1, wander: 1, groom: 1, gaze: 1, stretch: 1, wantpet: 1, come: 1, play: 1, sunbathe: 1 };
  function flickToy(toy, fromX) {
    const dir = fromX > toy.x + 1 ? -1 : fromX < toy.x - 1 ? 1 : (U.chance(.5) ? 1 : -1);
    toy.vx = dir * U.rnd(60, 95);
    FX.spawn('dust', toy.x, toy.y + 2, { n: 2, spread: 2, g: -1, life: .4 });
    // 离得最近、又闲着的那只去追
    const cand = Game.cats.filter(c => c.beh && CALL_OK[c.beh.name] && !c.onPerch && !c.hopping && !c.nest &&
      (St.data[c.catId] || {}).energy > 15);
    cand.sort((a, b) => Math.abs(a.x - toy.x) - Math.abs(b.x - toy.x));
    if (cand[0]) { cand[0].toyWant = toy; AI.start(cand[0], 'play'); cand[0].sinceTouch = 0; }
  }
  // 鼠标停在哪个能点的东西上（用来高亮、出提示）
  const HINTS = {
    photo: 'Click: change outfit', lamp: 'Click: light on / off', tomato: 'Click: start / pause the pomodoro',
    box: 'Click: peek in the box', toy: 'Click: flick the toy', window: 'Click: change the view'
  };
  let hoverId = null, hoverT = 0;
  function hoverOf(p) {
    const S = D.Scene, L = G.L;
    if (!Game.showScene || !G.mouseIn || G.dragging || G.tool === 'wand' || G.tool === 'treat') return null;
    if (S.hitPhoto(L, p.x, p.y)) return 'photo';
    if (S.hitLamp(L, p.x, p.y)) return 'lamp';
    if (Act.hitBody(G, p.x, p.y) || Act.hitBody(G2, p.x, p.y)) return null;
    if (D.Pomo && S.hitTomato(L, p.x, p.y)) return 'tomato';
    if (G.tool !== 'pet') return S.hitWindow(L, p.x, p.y) ? 'window' : null;
    if (S.hitBox(L, p.x, p.y)) return 'box';
    if (Game.toys.some(t => U.dist(p.x, p.y, t.x, t.y) < 8)) return 'toy';
    return S.hitWindow(L, p.x, p.y) ? 'window' : null;
  }

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / G.Z, y: (e.clientY - r.top) / G.Z };
  }
  canvas.addEventListener('pointerdown', (e) => {
    const p = pos(e);
    G.mouse = p; G.mouseIn = true;
    UI.closePanels();
    Game.userActAt = performance.now();        // 你动手了：专注期间猫只在这之后的一小会儿里会出声回应
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 有的环境抓不住指针，不影响 */ }
    // 拿着手 / 梳子点另一只猫：点到哪只就是在摸 / 梳哪只——先换成她，这一下直接落在她身上
    if (Game.showScene && (G.tool === 'pet' || G.tool === 'brush') && Act.hitBody(G2, p.x, p.y) && !Act.hitBody(G, p.x, p.y)) {
      UI.chooseCat(G2.catId);
    }
    // 点墙上的照片：给照片里那只猫换下一套装扮；照片晃一晃、冒爱心，那只猫会接一句话
    const ph = Game.showScene && G.tool !== 'wand' && G.tool !== 'treat' ? D.Scene.hitPhoto(G.L, p.x, p.y) : null;
    if (ph) {
      D.Scene.pokePhoto(ph.id);
      FX.toast('Outfit: ' + UI.cycleAcc(ph.id), Math.max(30, ph.x + ph.w / 2), ph.y + ph.h + 6, D.CATS[ph.id].tagColor);
      FX.spawn('heart', ph.x + ph.w / 2, ph.y + 6, { n: 4, spread: 7, vy: -11, life: 1.3 });
      FX.say(U.pick(PHOTO_LINES[ph.id]), { dur: 2.2, cat: ph.id });
      return;
    }
    // 点吊灯：开 / 关
    if (Game.showScene && G.tool !== 'wand' && G.tool !== 'treat' && D.Scene.hitLamp(G.L, p.x, p.y)) { UI.toggleLamp(); return; }
    const free = Game.showScene && (G.tool === 'pet' || G.tool === 'brush' || G.tool === 'litter') &&
      !Act.hitBody(G, p.x, p.y) && !(Act.hitBody(G2, p.x, p.y) && !G2.inBox);
    // 点搁板上的番茄：直接开始计时；正在走就暂停，再点一下继续（要看 / 改设置点右上角的番茄按钮）
    if (free && D.Pomo && D.Scene.hitTomato(G.L, p.x, p.y)) {
      const P = D.Pomo, tp = D.Scene.tomatoPos(G.L), fresh = !P.active;
      P.unlockAudio();
      P.toggle();
      if (!fresh) FX.toast(P.running ? 'Resumed · ' + P.fmt() : 'Paused · ' + P.fmt(), tp.x + 6, tp.y - 4, P.phase === 'focus' ? '#D9503F' : '#4F9E58');
      return;
    }
    // 点纸箱：里面有猫就冒出来；没有猫，闲着的那只会过来钻进去
    if (Game.showScene && G.tool === 'pet' && D.Scene.hitBox(G.L, p.x, p.y) && !(Act.hitBody(G, p.x, p.y) && !G.inBox)) {
      const inside = AI.pokeBox();
      if (inside) {
        if (performance.now() - (Game.boxBondT || 0) > 6000) { Game.boxBondT = performance.now(); St.addBond(); }
      } else if (G.beh && CALL_OK[G.beh.name] && !G.hopping && !G.nest && !G2.nest) {
        G.boxWant = 'play';
        AI.start(G, 'box');
      }
      return;
    }
    // 点地上的玩具：拨一下让它滚出去，闲着的猫会追过去玩
    if (free && G.tool === 'pet') {
      const toy = Game.toys.find(t => U.dist(p.x, p.y, t.x, t.y) < 8);
      if (toy) { flickToy(toy, p.x); return; }
    }
    // 点窗户（没点到猫身上）：换窗外的风景，山脉 → 高楼 → 村落
    if (Game.showScene && G.tool !== 'wand' && G.tool !== 'treat' && D.Scene.hitWindow(G.L, p.x, p.y) &&
        !Act.hitBody(G, p.x, p.y) && !Act.hitBody(G2, p.x, p.y)) {
      const w = G.L.win;
      FX.toast('View: ' + D.Scene.nextView(), w.x + w.w / 2, w.y + w.h / 2, '#FFFFFF');
      St.save();
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
    // 在输入框里打字（填 ID / 密码）时不触发工具快捷键
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    // 工具不再有快捷键，只留 Esc：放下手里的东西、回到「摸」
    if (e.key === 'Escape') Act.setTool(G, 'pet');
  });

  window.addEventListener('resize', () => Game.resize());

  // ---------- 循环 ----------
  let last = performance.now();
  let saveT = 0;

  const showSceneNow = () => St.settings.scene && !document.body.classList.contains('mini');

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;
    G.t += dt;

    St.tick(dt);
    if (D.Account) D.Account.tick(dt);
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

    // 番茄钟：专注的时候猫安静陪着，休息的时候更爱来找你玩
    const Pm = D.Pomo;
    Game.focusMode = !!(Pm && Pm.running && Pm.phase === 'focus');
    Game.breakMode = !!(Pm && Pm.running && Pm.phase !== 'focus');
    // 零食：落地（弹一下）；地上有零食就叫闲着的猫去吃
    for (const tr of Game.treats) {
      if (tr.z > 0 || tr.vz > 0) {
        tr.vz -= 240 * dt; tr.z += tr.vz * dt;
        if (tr.z <= 0) { tr.z = 0; tr.vz = tr.vz < -60 ? -tr.vz * 0.35 : 0; }
      }
      tr.age = (tr.age || 0) + dt;
    }
    if (showSceneNow()) AI.treatTick(dt);
    Game.boxWob = Math.max(0, Game.boxWob - dt);

    wandAttract(dt);
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

    // 鼠标停在能点的东西上：那样东西亮一下；停够半秒出一行小字提示（过两秒自己消失）
    const hov = hoverOf(G.mouse);
    if (hov !== hoverId) { hoverId = hov; hoverT = 0; } else hoverT += dt;
    D.Scene.hot = hov;

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

    // 天黑下来的那一刻灯自动打开，天亮的那一刻自动关上；中间手动开关过就听手动的，直到下一次昼夜交替
    if (showScene) {
      const phase = D.Scene.skyOf(hour).night ? 'night' : 'day';
      if (St.settings.lampPhase !== phase) {
        St.settings.lampPhase = phase;
        St.settings.lamp = phase === 'night';
        St.save();
      }
    }
    // 屋里暗不暗：外面是晚上、而且没开灯
    const night =D.Scene.skyOf(hour).night && !D.Scene.lampOn();
    // 地板是个平面：家具和猫按「站在地板上的深度」从后往前画，
    // 靠前的挡住靠后的（猫走到跑轮前面就挡住跑轮，走到后面就被跑轮挡住）。
    // 在爬架 / 窗台上、正在跳的猫最后画（它们在半空，不跟地上的东西比前后）。
    // 每一项的 f(c) 把自己画到 c 上：平时画到主画布，算光影遮挡时再往小画布上画一遍
    const items = [];
    if (showScene) {
      const S = D.Scene, wheelBase = L.catY + 3;
      items.push({ k: wheelBase, far: true, f: (c) => S.drawWheel(c, L, Game.wheel.angle, 'back', night) });
      // 猫窝和纸箱都分前后两半：后半在猫之前画，前沿在猫之后画，窝在里面的猫就被前沿挡住下半身
      items.push({ k: L.bed.y - 8, far: true, f: (c) => S.drawBed(c, L.bed.x, L.bed.y, 'back', night) });
      items.push({ k: L.bed.y + 0.5, far: true, f: (c) => S.drawBed(c, L.bed.x, L.bed.y, 'front', night) });
      items.push({ k: L.box.y - 14, f: (c) => S.drawBox(c, L.box.x, L.box.y, 'back', night, Game.boxWob) });
      items.push({ k: L.box.y + 0.5, f: (c) => S.drawBox(c, L.box.x, L.box.y, 'front', night, Game.boxWob) });
      items.push({ k: L.litter.y + 4, f: (c) => S.drawLitter(c, L.litter.x, L.litter.y, Game.poops, hoverLitter) });
      items.push({ k: L.bowl.y + 2, f: (c) => S.drawBowl(c, L.bowl.x, L.bowl.y, Game.bowl.fill, G.t, Game.water.fill) });
      for (const toy of Game.toys) items.push({ k: toy.y + 3, f: (c) => S.drawToys(c, [toy], night) });
      for (const tr of Game.treats) items.push({ k: tr.y + 1, f: (c) => S.drawTreat(c, tr, night) });
      // 逆光：窗户在猫身后。站在地板上那片光里、或者趴在窗台上的猫，轮廓上有一圈亮边
      const beam = S.beamNow, rimCol = beam ? (beam.sun ? (beam.rgb === '255,200,120' ? '#FFD9A0' : '#FFF4CC') : '#C4D2FF') : null;
      for (const cat of [G, G2]) {
        let k = cat.y;
        if (cat.inWheel) k = wheelBase + 0.1;                       // 在跑轮里：紧跟在跑轮后面画
        else if (cat.inBed) k = L.bed.y + 0.1;                      // 在猫窝 / 纸箱里：夹在它们的前后两半中间
        else if (cat.inBox) k = L.box.y + 0.1;
        else if (cat.onPerch || cat.hopping) k = 1000 + cat.y * 0.001;
        const lit = rimCol && !cat.hopping && !cat.inBed && !cat.inBox && !cat.inWheel &&
          (cat.onPerch ? cat.onPerch === 'sill' && cat.perchAt == null : S.inBeam(cat.x, cat.y)) &&
          (beam.sun || !S.lampOn());
        cat.rim = lit ? rimCol : null;
        items.push({
          k: k, f: (c) => {
            D.drawCat(c, cat);
            // 在轮子里跑的那只：画完马上补上跑道的前沿，猫就像被框在轮子里
            if (cat.inWheel && !S.silhouette) S.drawWheel(c, L, Game.wheel.angle, 'front', night);
          }
        });
      }
    } else {
      items.push({ k: 0, f: (c) => D.drawCat(c, G) });
    }
    items.sort((a, b) => a.k - b.k);
    for (const it of items) it.f(ctx);
    // 天黑以后的明暗：开着灯是灯下亮、墙角暗；没开灯就整间压暗，只有窗户和地上的月光是亮的
    // （far = 离窗户和月光都远的大件：跑轮、猫窝，算遮挡时不用重画）
    if (showScene) D.Scene.drawLight(ctx, L, G.t, hour, (c) => { for (const it of items) if (!it.far) it.f(c); });

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
    if (hoverId && hoverT > 0.5 && hoverT < 2.8) {
      const fs = Math.max(10, Math.round(2.4 * Z));
      ctx.font = '700 ' + fs + 'px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const text = HINTS[hoverId], tw = Math.round(ctx.measureText(text).width) + fs;
      const hx = U.clamp(Math.round(G.mouse.x * Z), tw / 2 + 4, L.W * Z - tw / 2 - 4), hy = Math.max(fs, Math.round(G.mouse.y * Z) - 5 * Z);
      ctx.fillStyle = 'rgba(74,59,82,.86)';
      ctx.fillRect(hx - tw / 2, hy - fs * 0.85, tw, fs * 1.7);
      ctx.fillStyle = '#FFFBF4';
      ctx.fillText(text, hx, hy);
    }

    UI.tick(dt, G.t);

    saveT += dt;
    if (saveT > 8) { saveT = 0; St.save(); }
    requestAnimationFrame(frame);
  }

  // ---------- 番茄钟：猫的反应 ----------
  const CHEER_OK = { sit: 1, loaf: 1, wander: 1, groom: 1, gaze: 1, stretch: 1, wantpet: 1, come: 1, play: 1, zoomies: 1, beg: 1, bellyUp: 1, sunbathe: 1 };
  function pomoEvent(evt, d) {
    const P = D.Pomo;
    if (UI.pomoRefresh) UI.pomoRefresh();
    if (evt === 'start') {
      if (d === 'focus') {
        UI.banner('Focus · ' + P.fmt(P.total), 'Luna & Nova will keep quiet until the break');
        FX.say(AI.line(G, 'focus'), { dur: 2.6 });
      } else {
        UI.banner(P.NAMES[d] + ' · ' + P.fmt(P.total), 'Stretch, drink some water, pet a cat');
      }
    } else if (evt === 'focusDone') {
      if (d.away) return;
      const bonus = D.Account && D.Account.user() && D.Account.addBond(25);
      UI.banner('Focus complete! Tomato #' + d.today + ' today',
        (d.next === 'long' ? 'Long break' : 'Short break') + ' time' + (bonus ? ' · +25 bond' : ''));
      for (const cat of Game.cats) {
        if (!cat.beh || !CHEER_OK[cat.beh.name] || cat.hopping || cat.nest) continue;
        AI.start(cat, 'cheer');
        FX.say(AI.line(cat, 'cheer'), { cat: cat.catId, dur: 3 });
        FX.spawn('heart', cat.x, cat.y - 30, { n: 3, spread: 8, vy: -10, life: 1.6 });
      }
    } else if (evt === 'breakDone') {
      if (d.away) return;
      UI.banner('Break is over', P.cfg.autoFocus ? 'The next focus round has started' : 'Start the next round when you are ready');
      FX.say(AI.line(G, 'breakOver'), { dur: 2.6 });
    }
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
    // 调试用：?lamp=0 / 1 直接指定灯的开关（配合 ?hour= 看各个时段开灯 / 关灯的样子）
    if (q.has('lamp') && Game.forceHour != null) {
      St.settings.lampPhase = D.Scene.skyOf(Game.forceHour).night ? 'night' : 'day';
      St.settings.lamp = q.get('lamp') === '1';
    }
    D.Scene.init();
    if (D.Pomo) D.Pomo.on = pomoEvent;
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
      if (St.firstRun || G.paused || Game.focusMode) return;      // 专注的时候不闲聊
      const c = St.cur();
      if (G.beh && G.beh.name === 'sleep') return;
      if (c.litter < 25 && U.chance(.4)) FX.say(AI.line(G, 'dirty'), { tone: 'warn' });
      else if (c.coat < 30 && U.chance(.35)) FX.say(AI.line(G, 'messy'), { tone: 'warn' });
      else if (c.mood > 75 && U.chance(.2)) FX.say(AI.line(G, 'happy'));
    }, 26000);

    const saveAll = () => { St.save(); if (D.Account) D.Account.save(); };
    window.addEventListener('beforeunload', saveAll);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) saveAll(); else last = performance.now();
    });

    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.DOLL);

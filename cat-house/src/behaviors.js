// 待机行为状态机 + 逐帧动画（眨眼、甩尾、呼吸、走路换帧）
// 坐标单位是虚拟像素，所以速度都是个位数。
window.DOLL = window.DOLL || {};
(function (D) {
  'use strict';
  const U = D.U, FX = D.FX, St = D.St;

  const AI = {};

  const LINES = {
    luna: {
      wantpet: ['Pet me…', 'Here, under my chin', 'Cuddle time', 'Hand, please'],
      hungry: ['The bowl is empty', 'A bit hungry', 'Dinner?'],
      dirty: ['The litter needs scooping…', 'It smells over there', "I'd rather not go in"],
      messy: ['My fur is tangled', 'Brush me, please', 'Itchy'],
      sleepy: ['Sleepy…', 'Just a little nap', 'Good night'],
      happy: ['Purr purr', 'So nice', 'I like you best'],
      gaze: ['Birds outside', 'Watching clouds', 'So windy'],
      poke: ['What is it?', 'Hm?', '…'],
      toilet: ['Litter box time~', 'Kind of urgent…', 'Be right back'],
      toiletDone: ['Much better~', 'All fresh', 'Done'],
      toiletFull: ['Scoop it for me, okay?', 'The box is getting full…', 'Time to scoop'],
      thirsty: ['No water in the bowl', 'A bit thirsty…', 'I want water'],
      drank: ['All full', 'Nice and cool~', 'Tasty'],
      playedOut: ['Tired… a snack, maybe', 'Hungry, and thirsty too', 'Break time. Dinner?'],
      bird: ['A little bird…', 'Ek-ek-ek…', 'I want it', "Don't fly away"],
      squirrel: ['A squirrel…', "What's it eating?", 'Such a big tail…', 'Ek-ek…'],
      sun: ['Warm…', 'A sunny spot', 'Mmm, sunshine'],
      bed: ['My bed', 'So soft…', 'Nap time'],
      box: ['A box.', 'If I fits, I sits', 'Mine now'],
      boo: ['…Boo.', 'You found me', 'Hm?'],
      treat: ['A treat?', 'For me?', 'Fish biscuit…'],
      yum: ['Tasty', 'Thank you', 'Crunch crunch'],
      full: ["I'm full, thank you", 'No more for me'],
      missed: ['Oh… gone', 'Too slow'],
      come: ['Coming', 'Yes?', 'You called?'],
      boop: ['…', 'Mrrp?', 'My nose!'],
      cheer: ['Well done', 'You did it', 'Good work today'],
      focus: ["I'll keep quiet", 'Focus time', 'Go on, I am here'],
      breakOver: ['Back to work?', 'Break is over', 'One more round?']
    },
    nova: {
      wantpet: ['Pet me now!', 'Belly rubs!', 'Hand! Hand!', 'Rub rub rub'],
      hungry: ['Starving, starving', 'Dinner, dinner!', 'Bowl is empty!!'],
      dirty: ['The box is full!', 'Stinky', 'Scooper, report for duty'],
      messy: ['My fur is a mess', "Where's the brush?!", 'So itchy'],
      sleepy: ['Quick nap…', 'So sleepy', 'Sleeping now'],
      happy: ['Hehehe', 'Again, again!', 'Purrrr—'],
      gaze: ["What's that!", 'Bird!', 'I want out'],
      poke: ['Whoa!', 'What, what?', 'You scared me'],
      toilet: ['Gotta go!', "Can't hold it!", 'Litter box, litter box!'],
      toiletDone: ['Done!', 'So much lighter!', 'Hehe~'],
      toiletFull: ['Come scoop, quick!', 'The box is full!', "Don't forget to scoop~"],
      thirsty: ['So thirsty!', "Where's the water?!", 'Water, now!'],
      drank: ['Glug glug~', 'All done!', 'Hehe, yummy'],
      playedOut: ['Hungry now! Dinner!', 'Thirsty from running!', 'Wiped out… food first!'],
      bird: ['Bird! Bird!', 'Ek-ek-ek-ek!', 'Let me out!', 'It looked at me!'],
      squirrel: ['Squirrel!!', 'That tail! Want it!', 'Share one with me!', 'Ek-ek-ek-ek!'],
      sun: ['Sunny spot!', 'So warm~', 'Toasty!'],
      bed: ['Bed! Bed!', 'Comfy~', 'Sleepy now…'],
      box: ['BOX!', 'I fit! I fit!', 'Best box ever!'],
      boo: ['BOO!', 'Surprise!!', 'Hehe, got you!'],
      treat: ['TREAT!', 'Gimme gimme!', 'Throw it! Throw it!'],
      yum: ['Yum!!', 'More! More!', 'Crunchy!'],
      full: ['So full… burp', 'Tummy is full!'],
      missed: ['Hey! Mine!', 'Aww…'],
      come: ['Coming!!', 'Here I am!', 'What? What?'],
      boop: ['Boop!', 'Hehe!', 'Achoo!'],
      cheer: ['Yay!! You did it!', 'Tomato get!', 'Play time!!'],
      focus: ["Shh… I'll be good", 'You can do it!', 'Focus! Focus!'],
      breakOver: ['Aww, already?', 'Back to work!', 'Go go go!']
    }
  };
  AI.line = function (G, key) {
    const t = LINES[G.catId] || LINES.luna;
    return U.pick(t[key] || t.poke);
  };

  // 两只猫同时在屋里：数值按各自的猫取；说话时带上是哪只猫，气泡就画在那只头上
  const cs = (G) => St.data[G.catId] || St.cur();
  // 番茄钟专注的时候猫不主动出声：只有你刚动过手（点了屋里的东西、用了底下的工具）之后的十来秒里才回应
  const QUIET_AFTER = 12000;
  const say = (G, text, opt) => {
    const Gm = D.Game;
    if (Gm && Gm.focusMode && performance.now() - (Gm.userActAt == null ? -1e9 : Gm.userActAt) > QUIET_AFTER) return;
    FX.say(text, Object.assign({ cat: G.catId }, opt || {}));
  };

  // ---------- 高处：三层猫爬架顶、窗台 ----------
  // 每个高处是一串跳点：从地上一层一层跳上去，下来时倒着跳回地面
  AI.perchPath = function (G, name) {
    const L = G.L;
    if (name === 'tree' && L.tree) {
      return L.tree.spots;   // 猫屋的屋顶 → 左边的跳板 → 顶上的软垫
    }
    // 窗台：先跳到砂盆的靠背上垫一步，再跳上窗台
    if (name === 'sill' && L.sill) {
      return L.step ? [{ x: L.step.x, y: L.step.y }, { x: L.sill.x, y: L.sill.y }] : [{ x: L.sill.x, y: L.sill.y }];
    }
    return null;
  };
  AI.perchPoint = function (G) {
    const p = G.onPerch && AI.perchPath(G, G.onPerch);
    if (!p) return null;
    // 追逗猫棒时可以停在半路的跳点上（爬架的下面两层、砂盆顶上），记在 perchAt 里；平时就是最顶上那个
    return p[G.perchAt != null ? Math.min(G.perchAt, p.length - 1) : p.length - 1];
  };
  function otherCats(G) { return (D.Game && D.Game.cats || []).filter(o => o !== G); }
  function freePerch(G, name) { return !otherCats(G).some(o => o.onPerch === name || o.perchGoal === name); }

  // 沿着跳点一跳一跳地走，跳完返回 true
  function hop(G, dt) {
    if (!G.hops || !G.hops.length) return true;
    const to = G.hops[0];
    if (!G.hopFrom) { G.hopFrom = { x: G.x, y: G.y }; G.hopT = 0; }
    const dist = Math.hypot(to.x - G.hopFrom.x, to.y - G.hopFrom.y);
    G.hopT += dt / U.clamp(dist / 70, 0.28, 0.6);
    const k = Math.min(1, G.hopT);
    G.spr = 'stand';
    if (Math.abs(to.x - G.hopFrom.x) > 1) G.facing = to.x > G.hopFrom.x ? 1 : -1;
    G.x = U.lerp(G.hopFrom.x, to.x, k);
    G.y = U.lerp(G.hopFrom.y, to.y, k) - Math.sin(k * Math.PI) * 7;
    if (k >= 1) {
      G.x = to.x; G.y = to.y;
      G.hops.shift(); G.hopFrom = null;
      // 最后一跳落在地板上：记下站的深度
      if (!G.hops.length && to.y >= AI.floorMin(G.L) - 1) G.gy = to.y;
      if (U.chance(.6)) FX.spawn('dust', G.x, G.y - 1, { n: 2, spread: 3, g: -1, life: .5 });
    }
    return !G.hops.length;
  }

  // ---------- 地面是一个平面 ----------
  // 每只猫有自己站在地板上的深度 gy（越大越靠近镜头）。走路时 x 和 gy 一起动：
  // 行为里只要设好 G.goY（想走到的深度），step() 每走一步就顺带往那个深度挪。
  AI.floorMin = (L) => L.floorY + 6;                  // 最靠墙能站的地方
  // 最靠镜头能站的地方：再往前就会被屏幕底下的动作栏挡住
  AI.floorMax = (L) => L.floorY + Math.round((L.H - L.floorY) * 0.45);
  AI.clampY = (L, y) => U.clamp(y, AI.floorMin(L), AI.floorMax(L));
  AI.randFloorY = (L) => U.rnd(AI.floorMin(L), AI.floorMax(L));

  // 走一步：相位按「走过的距离」（含前后挪的那段）推进，脚才不会打滑
  function step(G, dx, gait) {
    G.gait = gait;
    G.gaitHold = 0.15;        // 这一帧在走；超过这个时间没再调用就回到站立
    G.x += dx;
    let dyMoved = 0;
    if (G.goY != null && G.gy != null) {
      const dy = G.goY - G.gy;
      const can = Math.max(Math.abs(dx) * 0.8, 0.35);
      dyMoved = Math.sign(dy) * Math.min(Math.abs(dy), can);
      G.gy += dyMoved;
    }
    if (Math.abs(dx) > 0.001) G.facing = dx > 0 ? 1 : -1;
    G.gaitPhase = (G.gaitPhase || 0) + Math.hypot(dx, dyMoved) / D.Legs.cycleDist(D.Legs.GAITS[gait]);
  }
  // 到了没有：x 到位、深度也到位
  function arrived(G, d, tol) {
    return Math.abs(d) < (tol || 2) && (G.goY == null || G.gy == null || Math.abs(G.goY - G.gy) < 1);
  }

  // ---------- 行为表 ----------
  const B = {};

  B.sit = { spr: 'sit', dur: [5, 11] };
  B.loaf = { spr: 'loaf', dur: [8, 18] };
  // 伸懒腰：前半身压低、屁股翘高，眯着眼
  B.stretch = { spr: 'stretch', dur: [1.8, 2.6] };

  B.gaze = {
    spr: 'sit', dur: [7, 16], look: 'up',
    enter(G) { G.facing = 1; if (U.chance(.5)) say(G, AI.line(G, 'gaze')); }
  };

  B.sleep = {
    spr: 'sleep', dur: [26, 70],
    enter(G) { if (U.chance(.7)) say(G, AI.line(G, 'sleepy')); },
    update(G, dt) {
      const c = cs(G);
      c.energy = U.clamp(c.energy + 0.5 * dt, 0, 100);
      c.mood = U.clamp(c.mood + 0.05 * dt, 0, 100);
      G.zzzT = (G.zzzT || 0) - dt;
      if (G.zzzT <= 0) {
        G.zzzT = U.rnd(1.2, 2.2);
        FX.spawn('zzz', G.x + 9 * G.facing, G.y - 14, { vy: -5, vx: 2 * G.facing, g: -0.6, life: 2.4 });
      }
    }
  };

  B.groom = {
    spr: 'groom', dur: [4, 8],
    update(G, dt) {
      G.furT = (G.furT || 0) - dt;
      if (G.furT <= 0) {
        G.furT = U.rnd(.5, 1.0);
        FX.spawn('fur', G.x + 6 * G.facing, G.y - 22, { vy: -5, g: 4, life: 1.3 });
        cs(G).coat = U.clamp(cs(G).coat + 0.5, 0, 100);
      }
    }
  };

  // 饭碗 / 水碗左右这么宽的范围里不趴、不睡：趴着的身子很长，会压在碗和餐垫上，看着像悬空
  const BOWL_CLEAR = 76;
  const LIE_DOWN = { sleep: 1, loaf: 1 };

  B.wander = {
    spr: 'stand', dur: [4, 14], walking: true,
    enter(G) {
      G.walkTo = U.rnd(22, G.L.W - 22);
      // 刚吃完 / 喝完：至少走开一个身位以上，别停在碗边挡着另一只
      if (G.leaveBowl) {
        G.leaveBowl = false;
        for (let i = 0; i < 12 && Math.abs(G.walkTo - G.L.bowl.x) < BOWL_CLEAR + 6; i++) G.walkTo = U.rnd(22, G.L.W - 22);
      }
      G.goY = AI.randFloorY(G.L);                 // 往房间里任意一处走：左右 + 前后
      G.facing = G.walkTo > G.x ? 1 : -1;
    },
    update(G, dt) {
      const d = G.walkTo - G.x;
      if (arrived(G, d, 1.5)) {
        // 是为了躲开碗边才走过来的：到了就接着做原本想做的事（趴下 / 睡觉）
        const next = G.thenBeh; G.thenBeh = null;
        if (next) { G.noDodge = true; AI.start(G, next); G.noDodge = false; } else G.behDone = true;
        return;
      }
      step(G, Math.sign(d) * Math.min(Math.abs(d), 19 * dt), 'walk');
      cs(G).energy = U.clamp(cs(G).energy - 0.25 * dt, 0, 100);
    }
  };

  B.zoomies = {
    spr: 'stand', dur: [4, 8], walking: true,
    enter(G) { G.zoomLegs = 0; G.goY = AI.randFloorY(G.L); G.walkTo = U.chance(.5) ? 18 : G.L.W - 18; say(G, U.pick(['Zoom!', 'Awooo—', '!!!'])); },
    update(G, dt) {
      const d = G.walkTo - G.x;
      if (Math.abs(d) < 3) {
        G.zoomLegs++;
        if (G.zoomLegs >= 3) { G.behDone = true; return; }
        G.walkTo = G.walkTo < G.L.W / 2 ? G.L.W - 18 : 18;
        G.goY = AI.randFloorY(G.L);
      }
      step(G, Math.sign(d) * Math.min(Math.abs(d), 88 * dt), 'run');
      cs(G).energy = U.clamp(cs(G).energy - 2.4 * dt, 0, 100);
      cs(G).mood = U.clamp(cs(G).mood + 0.5 * dt, 0, 100);
      if (U.chance(dt * 8)) FX.spawn('dust', G.x - 6 * G.facing, G.y - 1, { vy: -3, vx: -8 * G.facing, g: 2, life: .5 });
    }
  };

  B.wantpet = {
    spr: 'rollover', dur: [6, 11],
    enter(G) { say(G, AI.line(G, 'wantpet'), { dur: 3.2 }); G.wantPet = true; },
    update(G, dt) {
      G.heartT = (G.heartT || 0) - dt;
      if (G.heartT <= 0) {
        G.heartT = U.rnd(1.3, 2.2);
        FX.spawn('heart', G.x + U.rnd(-6, 6), G.y - 16, { vy: -8, g: 0.8, life: 1.6 });
      }
      if (G.petStroke > 0) G.behDone = true;
    },
    exit(G) { G.wantPet = false; }
  };

  // 上厕所：走到砂盆边 → 跳进砂盆 → 蹲着 → 粑粑就出现在她蹲的地方 → 刨两下砂盖住 → 跳出来。
  // 粑粑只在这里产生；砂盆也只在这里变脏（不会自己变脏）。
  B.useLitter = {
    spr: 'stand', dur: [40, 40], walking: true,
    enter(G) {
      if (!G.L.litter || !(D.Game && D.Game.showScene)) { G.behDone = true; return; }
      G.litterPhase = 'go';
      G.walkTo = U.clamp(G.L.litter.x - 34, 16, G.L.W - 16);
      G.goY = AI.clampY(G.L, G.L.litter.y + 6);   // 走到砂盆前面那一排
      say(G, AI.line(G, 'toilet'), { dur: 2.2 });  // 出发前说一声
    },
    update(G, dt) {
      const Lt = G.L.litter;
      if (G.litterPhase === 'go') {
        const d = G.walkTo - G.x;
        if (arrived(G, d)) {
          G.litterPhase = 'hopIn';
          G.hops = [{ x: Lt.x - 4, y: Lt.y - 4 }]; G.hopFrom = null; G.hopping = true;
          return;
        }
        step(G, Math.sign(d) * Math.min(Math.abs(d), 22 * dt), 'walk');
      } else if (G.litterPhase === 'hopIn') {
        if (hop(G, dt)) { G.litterPhase = 'squat'; G.litterT = U.rnd(3, 5); G.spr = 'sit'; G.facing = 1; }
      } else if (G.litterPhase === 'squat') {
        G.spr = 'sit';
        G.litterT -= dt;
        if (G.litterT <= 0) {
          D.Game.addPoop(G, G.x - Lt.x);
          cs(G).litter = U.clamp(cs(G).litter - U.rnd(16, 26), 0, 100);
          G.litterPhase = 'scratch'; G.litterT = 1.2;
        }
      } else if (G.litterPhase === 'scratch') {
        // 转过身刨砂
        G.spr = 'stand'; G.facing = -1;
        G.litterT -= dt;
        if (U.chance(dt * 9)) FX.spawn('dust', G.x + 10, G.y - 2, { vy: -6, vx: 10, g: 12, life: .5 });
        if (G.litterT <= 0) {
          G.litterPhase = 'out';
          G.hops = [{ x: U.clamp(Lt.x - 34, 16, G.L.W - 16), y: AI.clampY(G.L, Lt.y + 6) }]; G.hopFrom = null;
          // 完事说一声；砂盆里已经攒了两坨以上就改成橙色提醒：该铲了
          const full = (D.Game.poops || []).length >= 2;
          say(G, AI.line(G, full ? 'toiletFull' : 'toiletDone'), { dur: full ? 2.8 : 2.2, tone: full ? 'warn' : undefined });
        }
      } else if (hop(G, dt)) {
        G.hopping = false;
        G.behDone = true;
      }
    },
    exit(G) { G.hopping = false; }
  };

  // 两只碗分开放（红碗在左、蓝碗在右，各离中心 BOWL_DX 格），猫总是从「外侧」去吃：
  // 吃饭的从左边来、脸朝右，喝水的从右边来、脸朝左——一只吃一只喝时背对背，不会叠在一起。
  // 同一只碗一次只给一只猫用：另一只已经占着，就坐到旁边（靠前一点、再往外让开一个身位）排队等。
  function bowlUser(key, beh) {
    const id = D.Game[key];
    const o = id && D.Game.cats && D.Game.cats.find(c => c.catId === id);
    if (!o || !o.beh || o.beh.name !== beh) { D.Game[key] = null; return null; }
    return o;
  }
  // 吃 / 喝通用的一套：排队 → 走到碗边 → 低头吃喝
  function feedSpot(G, kind) {
    const L = G.L, sgn = kind === 'eat' ? -1 : 1;          // 红碗在左（-1），蓝碗在右（+1）
    const DX = (D.Scene && D.Scene.BOWL_DX) || 18;
    const bx = L.bowl.x + sgn * DX;
    // 低头时脸离身子中心约 9 格：站在碗外侧 9 格，脸正好伸进碗里
    return { x: bx + sgn * 9, facing: -sgn, bx: bx,
      waitX: U.clamp(L.bowl.x + sgn * (DX + 9 + 40), 18, L.W - 18), waitY: AI.clampY(L, L.bowl.y + 10) };
  }
  function feedEnter(G, kind, beh, key) {
    const sp = feedSpot(G, kind);
    G.feedSpot = sp;
    const user = bowlUser(key, beh);
    if (user && user !== G) {
      G.feedPhase = 'wait';
      G.walkTo = sp.waitX; G.goY = sp.waitY;
    } else {
      D.Game[key] = G.catId;
      G.feedPhase = 'go';
      G.walkTo = sp.x;
      // 碗在地上：猫站在和碗同一条「深度线」上，碗沿挡在嘴前面——像把脸埋进碗里，不是头悬在碗上方
      G.goY = AI.clampY(G.L, G.L.bowl.y);
    }
  }
  // 返回 true 表示已经在碗边、可以吃喝了
  function feedApproach(G, dt, beh, key) {
    const sp = G.feedSpot;
    if (G.feedPhase === 'wait') {
      const user = bowlUser(key, beh);
      if (!user || user === G) {           // 轮到我了
        D.Game[key] = G.catId;
        G.feedPhase = 'go'; G.walkTo = sp.x; G.goY = AI.clampY(G.L, G.L.bowl.y);
        G.spr = 'stand'; G.walking = true;
        return false;
      }
      const d = G.walkTo - G.x;
      if (!arrived(G, d)) { step(G, Math.sign(d) * Math.min(Math.abs(d), 26 * dt), 'walk'); return false; }
      G.spr = 'sit'; G.walking = false;
      G.facing = Math.sign(sp.bx - G.x) || 1;      // 坐着望着碗等
      G.beh.t = Math.min(G.beh.t, 5);              // 排队的时间不算进吃饭的时长
      return false;
    }
    if (G.feedPhase === 'go') {
      const d = G.walkTo - G.x;
      if (arrived(G, d)) { G.feedPhase = 'at'; G.spr = eatPose(G); G.facing = sp.facing; return false; }
      step(G, Math.sign(d) * Math.min(Math.abs(d), 26 * dt), 'walk');
      return false;
    }
    return true;
  }
  function feedRelease(G, key) { if (D.Game[key] === G.catId) D.Game[key] = null; }

  B.goEat = {
    spr: 'stand', dur: [40, 40], walking: true,
    enter(G) { G.ate = 0; feedEnter(G, 'eat', 'goEat', 'bowlUser'); },
    exit(G) { feedRelease(G, 'bowlUser'); },
    update(G, dt) {
      const bowl = D.Game.bowl;
      if (!bowl || bowl.fill <= 0) { G.behDone = true; return; }
      if (!feedApproach(G, dt, 'goEat', 'bowlUser')) return;
      G.eatBob = (G.eatBob || 0) + dt * 6;
      bowl.fill -= dt * 0.26;
      G.ate = (G.ate || 0) + dt * 0.26;
      // 另一只在旁边排队：自己吃够半碗就让开，留一半给它
      const waiting = otherCats(G).some(o => o.beh && o.beh.name === 'goEat' && o.feedPhase === 'wait');
      if (waiting && G.ate >= 0.5 && bowl.fill > 0.05) {
        G.ate = 0;
        say(G, U.pick(['Saved you half~', 'Go ahead', 'Okay, your turn']), { dur: 2 });
        G.wantEat = false;
        G.leaveBowl = true; AI.start(G, 'wander');   // 走开，把碗边的位置让出来（不然原地趴下会和过来吃的那只叠在一起）
        return;
      }
      const c = cs(G);
      c.mood = U.clamp(c.mood + dt * 1.2, 0, 100);
      c.energy = U.clamp(c.energy + dt * 1.1, 0, 100);
      G.crumbT = (G.crumbT || 0) - dt;
      if (G.crumbT <= 0) {
        G.crumbT = U.rnd(.25, .55);
        FX.spawn('crumb', G.feedSpot.bx + U.rnd(-4, 4), G.L.bowl.y - 7, { vy: -9, g: 36, life: .7 });
      }
      if (bowl.fill <= 0) {
        bowl.fill = 0;
        c.meals++;
        say(G, U.pick(['All full~', 'Yummy!', 'That hit the spot']), { dur: 2 });
        FX.spawn('sparkle', G.x, G.y - 26, { n: 5, spread: 6, life: 1 });
        G.wantEat = false;
        if (G.wantDrink) { AI.start(G, 'refuel'); return; }   // 吃完接着去喝水
        G.leaveBowl = true; AI.start(G, 'wander');   // 吃完离开碗边
      }
    }
  };

  // 吃饭 / 喝水的姿势：一半站着低头，一半趴低了吃——趴低用的是捕猎那套身子（前低后高、背顺着脖子接到头上），只是不扭
  function eatPose(G) {
    G.wiggle = false;
    return Math.random() < 0.5 ? 'eatLow' : 'eat';
  }

  // 喝水：从右边走到蓝色水碗，低头舔水，水位一点点往下降，舔个几秒就走
  B.goDrink = {
    spr: 'stand', dur: [30, 30], walking: true,
    enter(G) {
      G.drinkT = 0; G.drinkFor = U.rnd(4, 6);
      feedEnter(G, 'drink', 'goDrink', 'waterUser');
    },
    exit(G) { feedRelease(G, 'waterUser'); },
    update(G, dt) {
      const w = D.Game.water;
      const c = cs(G);
      if (!w || w.fill <= 0) { G.behDone = true; return; }
      if (!feedApproach(G, dt, 'goDrink', 'waterUser')) return;
      w.fill = Math.max(0, w.fill - dt * 0.12);
      G.drinkT = (G.drinkT || 0) + dt;
      c.mood = U.clamp(c.mood + dt * 0.6, 0, 100);
      G.dropT = (G.dropT || 0) - dt;
      if (G.dropT <= 0) {
        G.dropT = U.rnd(.3, .6);
        FX.spawn('sparkle', G.feedSpot.bx + U.rnd(-4, 4), G.L.bowl.y - 8, { vy: -6, g: 20, life: .5, color: '#8EC3E6' });
      }
      // 舔个 4–6 秒就喝够了（或者水喝光了）
      if (G.drinkT >= G.drinkFor || w.fill <= 0) {
        say(G, AI.line(G, 'drank'), { dur: 2 });
        if (G.drinkT >= G.drinkFor) G.wantDrink = false;
        if (G.wantEat && D.Game.bowl.fill > 0.05) { AI.start(G, 'refuel'); return; }
        G.leaveBowl = true; AI.start(G, 'wander');   // 喝完离开碗边
      }
    }
  };

  // ---------- 逗猫棒：举到高处，猫会跟着跳上去 ----------
  // 能落脚的地方用 [哪条路, 第几个跳点] 表示（就是 perchPath 里的下标）：
  //   爬架上的三个 ['tree', 0..2]，砂盆顶上 ['sill', 0]，窗台 ['sill', 1]
  // 逗猫棒举起来的时候，猫跳到离逗猫棒最近的那个落脚点。
  function allSpots(G) {
    const out = [];
    for (const name of ['tree', 'sill']) {
      const p = AI.perchPath(G, name);
      if (p) for (let i = 0; i < p.length; i++) out.push([name, i]);
    }
    return out;
  }
  const lastIdx = (G, name) => { const p = AI.perchPath(G, name); return p ? p.length - 1 : -1; };
  function spotPos(G, s) { const p = AI.perchPath(G, s[0]); return p && p[s[1]] ? p[s[1]] : null; }
  function sameSpot(a, b) { return a && b ? a[0] === b[0] && a[1] === b[1] : !a && !b; }
  // 猫现在在哪个落脚点上（在地上是 null）。平时待在高处不记 perchAt，就是最顶上那个
  function curSpot(G) {
    if (!G.onPerch) return null;
    const last = lastIdx(G, G.onPerch);
    return [G.onPerch, G.perchAt != null ? Math.min(G.perchAt, last) : last];
  }
  // 另一只猫没占着这个落脚点（它正往那个高处去也算占着顶上那个）
  function spotFree(G, s) {
    const last = lastIdx(G, s[0]);
    return !otherCats(G).some(o => {
      const c = curSpot(o);
      return (c && sameSpot(c, s)) || (o.perchGoal === s[0] && s[1] === last);
    });
  }
  // 逗猫棒指着哪个落脚点：举得够高、60 像素以内最近的那个；没有就是 null（留在地上）
  function wandSpot(G, w) {
    const L = G.L;
    if (!(D.Game && D.Game.showScene) || w.y > L.floorY - 8) return null;
    let best = null, bd = 60;
    for (const s of allSpots(G)) {
      const p = spotPos(G, s);
      if (!p || !spotFree(G, s)) continue;
      let px = p.x, dy = w.y - (p.y - 10);
      // 窗台是一长条：逗猫棒在窗户前面哪儿都算挨着窗台，举得高一点也算
      if (s[0] === 'sill' && s[1] === lastIdx(G, 'sill') && L.win) {
        px = U.clamp(w.x, L.win.x, L.win.x + L.win.w);
        if (dy < 0) dy *= 0.4;
      }
      const d = Math.hypot(w.x - px, dy);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  // 落脚点之间能直接跳的：同一条路上相邻的两个，外加爬架上挨着窗户的那一个 ↔ 窗台
  function spotNeighbors(G, s) {
    const out = [];
    if (s[1] > 0) out.push([s[0], s[1] - 1]);
    if (s[1] < lastIdx(G, s[0])) out.push([s[0], s[1] + 1]);
    const sillTop = lastIdx(G, 'sill'), T = G.L.tree;
    const link = T && T.link != null ? T.link : 1;
    if (sillTop >= 0 && lastIdx(G, 'tree') >= link) {
      if (s[0] === 'tree' && s[1] === link) out.push(['sill', sillTop]);
      if (s[0] === 'sill' && s[1] === sillTop) out.push(['tree', link]);
    }
    return out;
  }
  // 在高处从 from 到 to 最少跳几下（不含 from、含 to）
  function spotPath(G, from, to) {
    if (sameSpot(from, to)) return [];
    const key = (s) => s[0] + s[1];
    const seen = {}, queue = [{ s: from, path: [] }];
    seen[key(from)] = 1;
    while (queue.length) {
      const cur = queue.shift();
      for (const n of spotNeighbors(G, cur.s)) {
        if (seen[key(n)]) continue;
        seen[key(n)] = 1;
        const path = cur.path.concat([n]);
        if (sameSpot(n, to)) return path;
        queue.push({ s: n, path: path });
      }
    }
    return null;
  }
  // 去 goal 要怎么跳。已经在高处：直接在高处之间跳过去，不下地。
  // 在地上：两条上去的路，看离哪条的起点近——靠左、靠爬架就从爬架上，否则踩着砂盆上。
  // 返回 { base: 地上的起跳点（已经在高处时没有）, hops: [跳点…] }
  function wandRoute(G, goal) {
    const L = G.L, here = curSpot(G);
    const pts = (list) => list.map(s => { const p = spotPos(G, s); return { x: p.x, y: p.y }; });
    if (here) { const p = spotPath(G, here, goal); return p ? { hops: pts(p) } : null; }
    const tp = AI.perchPath(G, 'tree'), sp = AI.perchPath(G, 'sill');
    const treeBase = tp && { x: U.clamp(tp[0].x - 16, 16, L.W - 16), y: AI.clampY(L, L.floorY + 7) };
    const litBase = sp && sp.length > 1 && { x: U.clamp(sp[0].x - 26, 16, L.W - 16), y: AI.clampY(L, L.litter.y + 6) };
    if (!treeBase && !litBase) return null;
    const viaTree = !litBase || (treeBase && Math.abs(G.x - treeBase.x) <= Math.abs(G.x - litBase.x));
    const entry = viaTree ? ['tree', 0] : ['sill', 0];
    const rest = spotPath(G, entry, goal);
    return rest ? { base: viaTree ? treeBase : litBase, hops: pts([entry].concat(rest)) } : null;
  }
  function landOn(G, spot) {
    G.onPerch = spot ? spot[0] : null;
    G.perchAt = spot ? spot[1] : null;
  }
  // 跳到一半被别的事打断（比如开饭了）：直接落到这一串跳点的终点，不留在半空
  function finishWandHop(G) {
    if (!G.chaseHops) return;
    const last = G.hops && G.hops.length ? G.hops[G.hops.length - 1] : null;
    if (last) { G.x = last.x; G.y = last.y; if (!G.chaseLand) G.gy = AI.clampY(G.L, last.y); }
    G.hops = []; G.hopFrom = null; G.hopping = false;
    landOn(G, G.chaseLand);
    G.chaseHops = false;
  }

  B.chase = {
    spr: 'crouch', dur: [999, 999],
    enter(G) { G.pounceT = U.rnd(1.2, 2.4); G.wandT = 0; G.catchPhase = null; G.playT = G.playT || 0; G.chaseHops = false; G.goalT = 0; },
    exit(G) { finishWandHop(G); G.goY = null; },
    update(G, dt) {
      const w = D.Game.wand;
      // 正在跳（上高处 / 换地方 / 下来）：跳完再说
      if (G.chaseHops) {
        if (hop(G, dt)) {
          G.hopping = false; G.chaseHops = false;
          landOn(G, G.chaseLand);
          if (!G.onPerch) G.y = G.gy;
        }
        return;
      }
      // 逗猫棒收起来了，或者被另一只猫吸引走了（追的永远是当前照顾的那只）：不追了
      if (!w || !w.on || G !== D.Game.G) { G.behDone = true; return; }
      const c = cs(G);

      // 抓到之后：坐起来得意一会儿（「> <」脸），然后接着玩
      if (G.catchPhase === 'win') {
        G.spr = 'sit'; G.wiggle = false;
        G.winT -= dt;
        if (G.winT <= 0) { G.catchPhase = null; G.wandT = 0; }
        return;
      }

      // 逗猫棒指着的落脚点和猫现在待的地方不一样：停稳半秒就跟过去
      const goal = wandSpot(G, w), here = curSpot(G);
      const move = !sameSpot(goal, here);
      G.goalT = move ? (G.goalT || 0) + dt : 0;
      if (move && G.goalT > 0.5) {
        let hops = null;
        if (goal) {
          const r = wandRoute(G, goal);
          if (r && r.base) {
            // 先跑到起跳点底下
            G.goY = r.base.y;
            const d = r.base.x - G.x;
            if (!arrived(G, d, 1.5)) {
              G.spr = 'stand'; G.walking = true; G.wiggle = false;
              step(G, Math.sign(d) * Math.min(Math.abs(d), 62 * dt), 'run');
              c.energy = U.clamp(c.energy - 1.5 * dt, 0, 100);
              return;
            }
          }
          hops = r && r.hops;
        } else {
          // 逗猫棒回到地上了：从现在这一层照着上来的路倒着跳下去
          const path = AI.perchPath(G, here[0]) || [];
          hops = path.slice(0, here[1]).reverse().map(p => ({ x: p.x, y: p.y }));
          const first = path[0] || { x: G.x };
          hops.push({ x: U.clamp(first.x + (here[0] === 'sill' ? -28 : 18), 16, G.L.W - 16),
            y: AI.clampY(G.L, here[0] === 'sill' ? G.L.litter.y + 6 : G.L.floorY + 7) });
        }
        if (hops && hops.length) {
          G.hops = hops; G.hopFrom = null; G.hopping = true;
          G.chaseHops = true; G.chaseLand = goal;
          G.onPerch = null; G.perchAt = null; G.goY = null; G.goalT = 0; G.wandT = 0; G.wiggle = false;
          return;
        }
      }

      const dx = w.x - G.x;
      const high = (G.y - w.y) > 34;

      // 逗猫棒在猫身前（朝着的那一侧、一个身位以内、头到地面之间）待满 2 秒 → 一扑抓住，得意 2 秒
      const rel = dx * G.facing;
      const inFront = rel > 4 && rel < 38 && w.y > G.y - 36 && w.y < G.y + 4;
      G.wandT = inFront ? (G.wandT || 0) + dt : 0;
      if (G.wandT >= 2) {
        G.pounce = 0.4;
        G.catchPhase = 'win'; G.winT = 2;
        FX.spawn('sparkle', w.x, w.y, { n: 8, spread: 6, life: 1 });
        FX.spawn('heart', G.x, G.y - 30, { vy: -9, g: 0.8, life: 1.5 });
        say(G, U.pick(['Got it!', "It's mine now!", 'Hmph~ caught you!']), { dur: 1.8 });
        c.mood = U.clamp(c.mood + 6, 0, 100);
        St.addBond();   // 逗猫棒：抓到一次算一个动作
        D.Game.wandHits++;
        return;
      }

      if (Math.abs(dx) > 4) G.facing = Math.sign(dx);

      G.wiggle = false;
      // 在地上：逗猫棒落在地板那一片时，猫前后也跟着走到它那一排——
      // 猫在砂盆 / 饭盆后面、逗猫棒在前面，就会绕到前面来
      const onFloor = !G.onPerch;
      if (onFloor) G.goY = w.y >= AI.floorMin(G.L) - 4 ? AI.clampY(G.L, w.y + 8) : null;
      const deep = onFloor && G.goY != null && G.gy != null && Math.abs(G.goY - G.gy) > 3;
      if (high && Math.abs(dx) < 26) {
        G.spr = 'reach';
      } else if (onFloor && (Math.abs(dx) > 18 || deep)) {
        G.spr = 'stand';
        G.walking = true;
        step(G, Math.abs(dx) > 18 ? Math.sign(dx) * Math.min(Math.abs(dx) - 16, 62 * dt) : 0, 'run');
      } else {
        // 盯住逗猫棒：压低身子扭屁股、甩尾巴，扑之前那一下停住不扭
        G.spr = 'crouch';
        G.wiggle = G.pounce <= 0 && G.pounceT > 0.25;
        G.pounceT -= dt;
        if (G.pounceT <= 0) {
          G.pounceT = U.rnd(1.4, 2.8);
          G.pounce = .4;
          FX.spawn('sparkle', w.x, w.y, { n: 5, spread: 4, life: .7 });
          c.mood = U.clamp(c.mood + 4, 0, 100);
          c.bond += 0.6;
          D.Game.wandHits++;
        }
      }
      c.energy = U.clamp(c.energy - 1.5 * dt, 0, 100);
      c.mood = U.clamp(c.mood + 0.8 * dt, 0, 100);
      // 玩逗猫棒很耗体力：会饿、会渴；玩够 40 秒（或者没力气了）就玩累了，要吃饭喝水
      G.playT = (G.playT || 0) + dt;
      if (c.energy < 8 || G.playT >= 40) {
        G.playT = 0;
        say(G, AI.line(G, 'playedOut'), { dur: 3 });
        D.Game.wand.on = false;
        D.Act.setTool(G, 'pet');
        // 玩累了要吃饭喝水：去饭碗那边
        G.wantEat = true; G.wantDrink = true;
        AI.start(G, 'refuel');
      }
    }
  };

  // 玩累了要补给：碗里有饭先吃饭、再喝水；碗是空的就坐到碗旁边等着，时不时喊一声，
  // 一倒上就过去（最多等 40 秒，等不到就算了）
  B.refuel = {
    spr: 'stand', dur: [40, 40], walking: true,
    enter(G) {
      // 坐到碗外侧、靠前一点等（不挡着正在吃喝的那只）
      G.walkTo = U.clamp(G.L.bowl.x + (G.x < G.L.bowl.x ? -62 : 62), 18, G.L.W - 18);
      G.goY = AI.clampY(G.L, G.L.bowl.y + 10);
      G.askT = 1.5;
    },
    update(G, dt) {
      const bowl = D.Game.bowl, water = D.Game.water;
      if (G.wantEat && bowl && bowl.fill > 0.05) { AI.start(G, 'goEat'); return; }
      if (G.wantDrink && water && water.fill > 0.05) { AI.start(G, 'goDrink'); return; }
      if (!G.wantEat && !G.wantDrink) { G.behDone = true; return; }
      const d = G.walkTo - G.x;
      if (!arrived(G, d)) { step(G, Math.sign(d) * Math.min(Math.abs(d), 24 * dt), 'walk'); return; }
      // 坐在碗旁边，望着碗等开饭
      G.spr = 'sit'; G.walking = false;
      G.facing = G.x < G.L.bowl.x ? 1 : -1;
      G.askT -= dt;
      if (G.askT <= 0) { G.askT = U.rnd(5, 8); say(G, AI.line(G, G.wantEat && !(bowl && bowl.fill > 0.05) ? 'hungry' : 'thirsty'), { dur: 2.2 }); }
      if (G.beh.t > 39) { G.wantEat = false; G.wantDrink = false; }
    }
  };

  // 去高处：先走到爬架 / 窗台底下，再一层一层跳上去
  B.perch = {
    spr: 'stand', dur: [30, 30], walking: true,
    enter(G) {
      const name = G.perchGoal;
      const path = name && AI.perchPath(G, name);
      if (!path) { G.perchGoal = null; G.behDone = true; return; }
      G.perchPhase = 'go';
      G.walkTo = U.clamp(path[0].x + (name === 'sill' ? -26 : -16), 16, G.L.W - 16);
      // 爬架就在墙边，走到它脚下；上窗台要先到砂盆前面
      G.goY = AI.clampY(G.L, name === 'sill' ? G.L.litter.y + 6 : G.L.floorY + 7);
    },
    update(G, dt) {
      if (G.perchPhase === 'go') {
        const d = G.walkTo - G.x;
        if (arrived(G, d, 1.5)) {
          G.perchPhase = 'jump';
          G.hops = AI.perchPath(G, G.perchGoal).map(p => ({ x: p.x, y: p.y }));
          G.hopFrom = null;
          G.hopping = true;
          return;
        }
        // 看见小鸟是跑过去的
        step(G, Math.sign(d) * Math.min(Math.abs(d), (G.forBird ? 46 : 22) * dt), G.forBird ? 'run' : 'walk');
      } else if (hop(G, dt)) {
        G.hopping = false;
        G.onPerch = G.perchGoal;
        G.perchAt = null;
        G.perchGoal = null;
        G.facing = G.onPerch === 'sill' ? 1 : (U.chance(.5) ? 1 : -1);
        // 是冲着窗外的小鸟上来的：一落地就开始盯着鸟看
        if (G.onPerch === 'sill' && G.forBird && D.Game.sillBird) { G.forBird = false; AI.start(G, 'birdWatch'); return; }
        G.forBird = false;
        G.behDone = true;
      }
    },
    exit(G) { G.hopping = false; if (!G.onPerch) G.perchGoal = null; }
  };

  // 趴在窗台上盯着窗外的小鸟：脸贴着玻璃，时不时「咔咔咔」，鸟飞走了再多看一会儿
  B.birdWatch = {
    spr: 'sit', dur: [40, 40], look: 'up',
    enter(G) { G.facing = 1; G.birdSayT = 0.4; G.birdGoneT = 0; },
    update(G, dt) {
      if (G.onPerch !== 'sill') { G.behDone = true; return; }
      const bird = D.Game.sillBird;
      G.facing = 1;
      if (bird && bird.phase !== 'out') {
        G.birdSayT -= dt;
        if (G.birdSayT <= 0) { G.birdSayT = U.rnd(3.5, 6); say(G, AI.line(G, bird.kind === 'squirrel' ? 'squirrel' : 'bird'), { dur: 2 }); }
        G.lastVisitor = bird.kind;
        cs(G).mood = U.clamp(cs(G).mood + dt * 0.5, 0, 100);
      } else {
        G.birdGoneT += dt;
        if (G.birdGoneT > 2.5) {
          if (G.birdGoneT < 2.6) say(G, U.pick([G.lastVisitor === 'squirrel' ? 'It ran off…' : 'It flew away…', 'Come back soon', "Hmph, I'll get you next time"]), { dur: 2 });
          if (G.birdGoneT > 4) G.behDone = true;
        }
      }
    }
  };

  // ---------- 窗外的小鸟 ----------
  // 白天时不时有一只小鸟落在窗外的窗沿上蹦两下、啄两下，待十来秒就飞走。
  // 小鸟落下的那一刻：已经在窗台上的猫马上转过去盯着看；
  // 地上刚好在溜达（没在吃饭、上厕所、睡觉、玩）的那只会跑过去跳上窗台看（窗台得空着）。
  const PASSING = { wander: 1, sit: 1, loaf: 1, stretch: 1, gaze: 1, groom: 1, zoomies: 1 };
  AI.birdTick = function (dt, L, hour) {
    const Gm = D.Game;
    if (!Gm || !L || !L.win) return;
    const night = hour != null && D.Scene.skyOf(hour).night;
    if (Gm.birdNext == null) Gm.birdNext = U.rnd(25, 50);
    let b = Gm.sillBird;
    if (!b) {
      if (night) return;
      Gm.birdNext -= dt;
      if (Gm.birdNext > 0) return;
      Gm.birdNext = U.rnd(50, 110);
      // 来的是小麻雀（多数）或者松鼠，都停在右半扇窗的窗沿上（窗台上的猫在左边，不会挡住它）
      const kind = U.chance(0.35) ? 'squirrel' : 'bird';
      // 右边墙角那盆绿植的叶子会挡住窗沿，落脚点停在它左边
      const maxX = U.clamp((L.W - 36 - L.win.x) / L.win.w, 0.62, 0.88);
      b = Gm.sillBird = { kind: kind, maxX: maxX, tx: U.rnd(0.6, maxX), x: kind === 'squirrel' ? 1.12 : 1.15, y: kind === 'squirrel' ? 1 : -0.25,
        phase: 'in', t: 0, stay: U.rnd(10, 16), face: -1, hopT: 1, peck: 0, nut: kind === 'squirrel' };
      AI.birdArrived();
    }
    b.t += dt;
    if (b.kind === 'squirrel') { squirrelTick(Gm, b, dt); return; }
    if (b.phase === 'in') {
      // 从右上方斜着飞下来
      const k = Math.min(1, b.t / 1.2);
      b.x = 1.15 + (b.tx - 1.15) * k;
      b.y = -0.25 + 1.25 * (1 - (1 - k) * (1 - k));
      if (k >= 1) { b.phase = 'sit'; b.t = 0; b.y = 1; }
    } else if (b.phase === 'sit') {
      // 蹦一蹦、转个身、低头啄一下
      b.hopT -= dt;
      b.peck = Math.max(0, b.peck - dt);
      if (b.hopT <= 0) {
        b.hopT = U.rnd(0.8, 1.8);
        const r = Math.random();
        if (r < 0.35) b.tx = U.clamp(b.tx + U.rnd(-0.06, 0.06), 0.58, b.maxX || 0.88);
        else if (r < 0.55) b.face = -b.face;
        else b.peck = 0.35;
      }
      b.x += (b.tx - b.x) * Math.min(1, dt * 8);
      b.y = 1 - (Math.abs(b.tx - b.x) > 0.005 ? 0.04 : 0);
      if (b.t > b.stay) { b.phase = 'out'; b.t = 0; b.ox = b.x; }
    } else {
      const k = Math.min(1, b.t / 1.2);
      b.x = b.ox + 0.5 * k; b.y = 1 - 1.3 * k; b.face = 1;
      if (k >= 1) Gm.sillBird = null;
    }
  };
  // 松鼠：从窗沿右边一路小跑进来，坐起来抱着坚果啃，尾巴一抖一抖，时不时左右张望，最后原路窜走
  function squirrelTick(Gm, b, dt) {
    if (b.phase === 'in') {
      b.x = Math.max(b.tx, b.x - dt * 0.3); b.face = -1;
      b.run = true;
      if (b.x <= b.tx) { b.phase = 'sit'; b.t = 0; b.run = false; }
    } else if (b.phase === 'sit') {
      b.hopT -= dt;
      b.peck = Math.max(0, b.peck - dt);          // 这里 peck = 正在啃坚果
      b.flick = Math.max(0, (b.flick || 0) - dt); // 尾巴抖一下
      if (b.hopT <= 0) {
        b.hopT = U.rnd(0.6, 1.4);
        const r = Math.random();
        if (r < 0.5) b.peck = U.rnd(0.6, 1.2);
        else if (r < 0.75) b.flick = 0.3;
        else b.face = -b.face;
      }
      if (b.t > b.stay) { b.phase = 'out'; b.t = 0; }
    } else {
      b.face = 1; b.run = true; b.peck = 0;
      b.x += dt * 0.45;
      if (b.x > 1.12) Gm.sillBird = null;
    }
  }

  AI.birdArrived = function () {
    const cats = D.Game.cats || [];
    let sent = false;
    for (const cat of cats) {
      if (cat.onPerch === 'sill') { AI.start(cat, 'birdWatch'); sent = true; }
    }
    if (sent) return;
    // 刚好在地上溜达的那只跑去窗台（优先正在走路的）
    const cand = cats.filter(c => !c.onPerch && !c.hopping && c.beh && PASSING[c.beh.name] &&
      !otherCats(c).some(o => o.onPerch === 'sill' || o.perchGoal === 'sill') && AI.perchPath(c, 'sill'));
    cand.sort((p, q) => (q.beh.name === 'wander') - (p.beh.name === 'wander'));
    const cat = cand[0];
    if (!cat) return;
    const sq = D.Game.sillBird && D.Game.sillBird.kind === 'squirrel';
    say(cat, cat.catId === 'nova' ? (sq ? '!! Squirrel!' : '!! Bird!') : (sq ? '…Hm? A squirrel?' : '…Hm? A bird?'), { dur: 1.6 });
    cat.perchGoal = 'sill';
    cat.forBird = true;
    AI.start(cat, 'perch');
  };

  // 从高处跳下来；跳完接着做原本想做的事（吃饭、上厕所、追逗猫棒…）
  B.hopDown = {
    spr: 'stand', dur: [20, 20], walking: true,
    enter(G) {
      const path = AI.perchPath(G, G.onPerch) || [];
      // 从现在站的那一层往下跳（平时在最顶上；追逗猫棒时可能停在半路）
      const at = G.perchAt != null ? Math.min(G.perchAt, path.length - 1) : path.length - 1;
      const down = path.slice(0, Math.max(0, at)).reverse().map(p => ({ x: p.x, y: p.y }));
      G.perchAt = null;
      const last = path[0] || { x: G.x };
      down.push({ x: U.clamp(last.x + (G.onPerch === 'sill' ? -28 : 18), 16, G.L.W - 16),
        y: AI.clampY(G.L, G.onPerch === 'sill' ? G.L.litter.y + 6 : G.L.floorY + 7) });
      G.hops = down; G.hopFrom = null; G.hopping = true;
      G.onPerch = null;
    },
    update(G, dt) {
      if (hop(G, dt)) {
        G.hopping = false;
        G.y = G.gy;
        const next = G.afterHop; G.afterHop = null;
        if (next) AI.start(G, next); else G.behDone = true;
      }
    },
    exit(G) { G.hopping = false; }
  };

  // 玩地上的玩具：跑过去 → 压低头、屁股翘高、左右扭屁股瞄准 → 一扑扑住玩具 →
  // 得意的「> <」脸 + 张嘴 → 再把玩具一巴掌拍出去，追过去接着玩
  B.play = {
    spr: 'stand', dur: [12, 20], walking: true,
    enter(G) {
      const toys = (D.Game && D.Game.toys) || [];
      // 你把哪个玩具拨了一下，猫就去追哪个；不然自己随便挑一个
      G.toy = G.toyWant && toys.indexOf(G.toyWant) >= 0 ? G.toyWant : (toys.length ? U.pick(toys) : null);
      G.toyWant = null;
      if (!G.toy) { G.behDone = true; return; }
      G.playPhase = 'go';
    },
    update(G, dt) {
      const toy = G.toy;
      if (!toy) { G.behDone = true; return; }
      const c = cs(G);
      if (G.playPhase === 'go') {
        const side = G.x < toy.x ? -1 : 1;
        const spot = toy.x + side * 24;
        const d = spot - G.x;
        G.goY = AI.clampY(G.L, toy.y + 1);         // 走到玩具那一排
        if (arrived(G, d)) {
          G.playPhase = 'aim'; G.aimT = U.rnd(1.2, 2.2);
          G.facing = toy.x > G.x ? 1 : -1;
          return;
        }
        G.spr = 'stand';
        step(G, Math.sign(d) * Math.min(Math.abs(d), 40 * dt), 'run');
      } else if (G.playPhase === 'aim') {
        // 压低头、翘屁股，扭屁股（crouch 姿势里按 wiggle 左右扭）
        G.spr = 'crouch'; G.wiggle = true;
        G.aimT -= dt;
        if (G.aimT <= 0) {
          G.wiggle = false;
          G.playPhase = 'pounce'; G.pounceT = 0.4; G.pounce = 0.4;
          G.pounceFrom = G.x; G.pounceTo = toy.x - G.facing * 14;
        }
      } else if (G.playPhase === 'pounce') {
        // 腾空扑过去，落地正好把玩具按在爪子下面
        G.spr = 'stand';
        G.pounceT -= dt;
        const k = U.clamp(1 - G.pounceT / 0.4, 0, 1);
        G.x = U.lerp(G.pounceFrom, G.pounceTo, k);
        if (G.pounceT <= 0) {
          toy.vx = 0;
          toy.x = G.x + G.facing * 14;
          G.playPhase = 'win'; G.winT = 1.6;
          FX.spawn('sparkle', toy.x, toy.y - 6, { n: 6, spread: 5, life: .8 });
          say(G, U.pick(['Got it!', 'Hmph~', 'Mine!', 'Hehe!']), { dur: 1.6 });
          c.mood = U.clamp(c.mood + 4, 0, 100);
          c.energy = U.clamp(c.energy - 1.5, 0, 100);
        }
      } else {
        // 得意脸，然后把玩具拍飞，追过去
        G.spr = 'sit';
        G.winT -= dt;
        if (G.winT <= 0) {
          toy.vx = G.facing * U.rnd(35, 65);
          toy.spin = (toy.spin || 0) + G.facing;
          G.playPhase = 'go';
        }
      }
    },
    exit(G) { G.toy = null; G.wiggle = false; G.winT = 0; }
  };

  // 跑轮（Nova 最爱）：走到轮子旁边、跳进去、在里面撒欢跑，轮子跟着转，跑够了跳出来
  B.wheel = {
    spr: 'stand', dur: [40, 40], walking: true,
    enter(G) {
      const W = G.L.wheel;
      if (!W) { G.behDone = true; return; }
      G.wheelPhase = 'go';
      G.runDir = U.chance(.5) ? 1 : -1;
      G.walkTo = U.clamp(W.x + W.r + 10, 16, G.L.W - 16);
      G.goY = AI.clampY(G.L, G.L.catY + 5);      // 站在跑轮脚边那一排（跑轮底座在 catY + 3）
    },
    update(G, dt) {
      const W = G.L.wheel;
      if (G.wheelPhase === 'go') {
        const d = G.walkTo - G.x;
        if (arrived(G, d, 1.5)) {
          G.wheelPhase = 'in';
          G.hops = [{ x: W.x, y: W.runY }]; G.hopFrom = null; G.hopping = true;
          return;
        }
        step(G, Math.sign(d) * Math.min(Math.abs(d), 26 * dt), 'walk');
      } else if (G.wheelPhase === 'in') {
        if (hop(G, dt)) {
          G.wheelPhase = 'run'; G.inWheel = true; G.runT = U.rnd(8, 16);
          say(G, U.pick(['Go go go!', 'Running~', "Can't stop!"]), { dur: 1.8 });
        }
      } else if (G.wheelPhase === 'run') {
        // 原地跑：腿按跑步的节奏动。猫的脚把脚下那段跑道往身后蹬，所以轮子最底下是往猫身后走的：
        // 猫朝右跑 → 底下往左 → 轮子在屏幕上顺时针转（角度是按屏幕坐标算的，y 朝下，角度变大就是顺时针）
        G.x = W.x; G.y = W.runY; G.facing = G.runDir; G.spr = 'stand';
        G.gait = 'run'; G.gaitHold = 0.15;
        G.gaitPhase = (G.gaitPhase || 0) + dt * 2.6;
        D.Game.wheel.speed = G.runDir * 5.5;
        const c = cs(G);
        c.energy = U.clamp(c.energy - 1.2 * dt, 0, 100);
        c.mood = U.clamp(c.mood + 0.6 * dt, 0, 100);
        G.runT -= dt;
        if (G.runT <= 0 || c.energy < 12) {
          G.wheelPhase = 'out'; G.inWheel = false;
          G.hops = [{ x: U.clamp(W.x + G.runDir * (W.r + 12), 16, G.L.W - 16), y: AI.clampY(G.L, G.L.catY + 5) }];
          G.hopFrom = null;
        }
      } else if (hop(G, dt)) {
        G.hopping = false;
        G.behDone = true;
      }
    },
    exit(G) { G.hopping = false; G.inWheel = false; }
  };

  // 被摸舒服了：翻过来露肚皮，四只爪子朝天，打呼噜冒音符
  B.bellyUp = {
    spr: 'belly', dur: [5, 9],
    enter(G) { say(G, U.pick(['Purr purr…', 'Belly rubs for you~', 'Purrrr—']), { dur: 2.4 }); G.purrT = 0; },
    update(G, dt) {
      G.forceHappy = true;
      G.purrT -= dt;
      if (G.purrT <= 0) {
        G.purrT = U.rnd(.45, .8);
        FX.spawn('note', G.x + U.rnd(-10, 10), G.y - 18, { vy: -8, g: 0, life: 1.3 });
      }
      const c = cs(G);
      c.mood = U.clamp(c.mood + 1.2 * dt, 0, 100);
    },
    exit(G) { G.forceHappy = false; }
  };

  // ---------- 窝：左下角的猫窝、右下角的纸箱 ----------
  // 两个窝都在猫平时走不到的最前面：走到旁边 → 跳进去。在里面的时候 G.inBed / G.inBox 是 true，
  // 位置由行为自己钉住（hopping 一直是 true，主循环就不会把它拉回地板那一排）。
  // 要去做别的事（开饭了、被叫走、时间到了）时由 AI.start 先插一段「跳出来」（nestOut）。
  function nestFree(G, name) { return !otherCats(G).some(o => o.nest === name); }
  function nestGo(G, dt, to) {
    const d = G.walkTo - G.x;
    if (!arrived(G, d, 1.5)) { G.spr = 'stand'; step(G, Math.sign(d) * Math.min(Math.abs(d), 24 * dt), 'walk'); return false; }
    G.hops = [to]; G.hopFrom = null; G.hopping = true;
    return true;
  }
  function nestExit(G) {
    if (G.inBed || G.inBox) return;       // 还在窝里：留给 nestOut 跳出来
    G.hopping = false; G.nest = null; G.sink = 0;
  }
  const zzz = (G, dx, dy, dt, gap) => {
    G.zzzT = (G.zzzT || 0) - dt;
    if (G.zzzT <= 0) {
      G.zzzT = U.rnd(gap, gap + 1);
      FX.spawn('zzz', G.x + dx, G.y + dy, { vy: -5, vx: 2 * G.facing, g: -0.6, life: 2.4 });
    }
  };

  // 去猫窝睡觉：跳进去先踩一会儿奶，再团起来睡
  B.bedNap = {
    spr: 'stand', dur: [70, 130], walking: true,
    enter(G) {
      const bed = G.L.bed;
      if (!bed || !(D.Game && D.Game.showScene) || !nestFree(G, 'bed')) { G.behDone = true; return; }
      G.nest = 'bed'; G.nestPhase = 'go';
      G.walkTo = U.clamp(bed.x + 30, 16, G.L.W - 16);
      G.goY = AI.floorMax(G.L);
    },
    update(G, dt) {
      const bed = G.L.bed;
      if (!G.nest) { G.behDone = true; return; }
      if (G.nestPhase === 'go') {
        if (nestGo(G, dt, { x: bed.x, y: bed.y - 5 })) G.nestPhase = 'in';
      } else if (G.nestPhase === 'in') {
        if (hop(G, dt)) {
          G.inBed = true; G.nestPhase = 'knead'; G.kneadT = U.rnd(2.5, 4.5); G.facing = 1;
          say(G, AI.line(G, 'bed'), { dur: 2.2 });
        }
      } else {
        G.x = bed.x; G.y = bed.y - 5; G.walking = false;
        if (G.nestPhase === 'knead') {
          G.spr = 'knead'; G.forceHappy = true;
          G.kneadT -= dt;
          if (G.kneadT <= 0) { G.nestPhase = 'sleep'; G.forceHappy = false; }
        } else {
          G.spr = 'sleep';
          const c = cs(G);
          c.energy = U.clamp(c.energy + 0.7 * dt, 0, 100);      // 在窝里睡得更香
          c.mood = U.clamp(c.mood + 0.1 * dt, 0, 100);
          zzz(G, 12, -14, dt, 1.4);
        }
      }
    },
    exit(G) { G.forceHappy = false; nestExit(G); }
  };

  // 钻纸箱：跳进去，要么缩在里面只露出耳朵尖、探出眼睛偷看、再猛地冒出来；要么就窝在里面打盹。
  // boxDrop = 身子往箱子里沉了多少格（负的是坐高了）
  const BOX_DROP = { up: -5, peek: 4, hide: 9, nap: 2 };
  B.box = {
    spr: 'stand', dur: [34, 64], walking: true,
    enter(G) {
      const box = G.L.box;
      if (!box || !(D.Game && D.Game.showScene) || !nestFree(G, 'box')) { G.behDone = true; return; }
      G.nest = 'box'; G.nestPhase = 'go';
      G.boxMode = G.boxWant || (U.chance(.4) ? 'nap' : 'play'); G.boxWant = null;
      if (G.boxMode === 'nap') G.beh.dur = U.rnd(60, 110);
      G.walkTo = U.clamp(box.x - 32, 16, G.L.W - 16);
      G.goY = AI.floorMax(G.L);
    },
    update(G, dt) {
      const box = G.L.box;
      if (!G.nest) { G.behDone = true; return; }
      if (G.nestPhase === 'go') {
        if (nestGo(G, dt, { x: box.x, y: box.y - 6 })) G.nestPhase = 'in';
        return;
      }
      if (G.nestPhase === 'in') {
        if (!hop(G, dt)) return;
        G.inBox = true; G.nestPhase = 'sit'; G.facing = 1;
        G.boxDrop = BOX_DROP.up; G.boxPose = 'up'; G.boxT = 1.6;
        say(G, AI.line(G, 'box'), { dur: 2.2 });
        D.Game.boxWob = 0.35;
      }
      // 在箱子里
      G.walking = false; G.spr = 'sit';
      G.boxT -= dt;
      if (G.boxMode === 'nap') {
        if (G.boxT <= 0 && G.boxPose !== 'nap') G.boxPose = 'nap';
        if (G.boxPose === 'nap') {
          const c = cs(G);
          c.energy = U.clamp(c.energy + 0.6 * dt, 0, 100);
          zzz(G, 8, -22 + G.boxDrop, dt, 1.6);
        }
      } else if (G.boxT <= 0) {
        // 藏 → 偷看 → 冒出来 → 藏…
        if (G.boxPose === 'up') { G.boxPose = 'hide'; G.boxT = U.rnd(1.5, 3); }
        else if (G.boxPose === 'hide') { G.boxPose = 'peek'; G.boxT = U.rnd(2.5, 4.5); G.facing = U.chance(.5) ? 1 : -1; }
        else { G.boxPose = 'up'; G.boxT = U.rnd(2, 3.2); G.pounce = 0.3; D.Game.boxWob = 0.3; if (U.chance(.5)) say(G, AI.line(G, 'boo'), { dur: 1.6 }); }
      }
      const to = BOX_DROP[G.boxPose];
      G.boxDrop += U.clamp(to - G.boxDrop, -38 * dt, 38 * dt);
      G.x = box.x; G.y = box.y - 1 + Math.round(G.boxDrop);
      G.sink = Math.max(0, Math.round(G.boxDrop));
    },
    exit(G) { nestExit(G); }
  };
  // 点了一下纸箱：里面的猫被吓一跳 / 冒出来（main.js 调）。返回里面有没有猫
  AI.pokeBox = function () {
    const cat = (D.Game.cats || []).find(c => c.inBox);
    D.Game.boxWob = 0.4;
    if (!cat) return null;
    const wasNap = cat.boxPose === 'nap';
    cat.boxMode = 'play'; cat.boxPose = 'up'; cat.boxT = 2.6; cat.pounce = 0.3;
    if (cat.beh && cat.beh.name === 'box') cat.beh.dur = Math.max(cat.beh.dur, cat.beh.t + 14);
    say(cat, wasNap ? U.pick(['…Hm?', 'Mm… what?']) : AI.line(cat, 'boo'), { dur: 1.8 });
    FX.spawn('sparkle', cat.x, cat.y - 26, { n: 5, spread: 8, life: .8 });
    return cat;
  };

  // 从窝里跳出来，再接着做原本要做的事
  B.nestOut = {
    spr: 'stand', dur: [10, 10], walking: true,
    enter(G) {
      const L = G.L, bed = G.inBed;
      const to = bed ? { x: U.clamp(L.bed.x + 34, 16, L.W - 16), y: AI.floorMax(L) }
        : { x: U.clamp(L.box.x - 34, 16, L.W - 16), y: AI.floorMax(L) };
      G.inBed = false; G.inBox = false; G.sink = 0;
      G.hops = [to]; G.hopFrom = null; G.hopping = true;
    },
    update(G, dt) {
      if (hop(G, dt)) {
        G.hopping = false; G.nest = null;
        G.y = G.gy;
        const next = G.afterHop; G.afterHop = null;
        if (next) AI.start(G, next); else G.behDone = true;
      }
    },
    exit(G) { G.hopping = false; G.nest = null; }
  };

  // 晒太阳：白天窗户照进来的那片光落在地板上，走过去趴着 / 翻着肚皮 / 睡一觉
  B.sunbathe = {
    spr: 'stand', dur: [28, 56], walking: true,
    enter(G) {
      const sp = D.Scene.sunSpot(G.L);
      if (!sp || otherCats(G).some(o => o.beh && o.beh.name === 'sunbathe')) { G.behDone = true; return; }
      G.sunPhase = 'go';
      G.walkTo = U.clamp(sp.x + U.rnd(-6, 6), 34, G.L.W - 34);
      G.goY = AI.clampY(G.L, sp.y);
    },
    update(G, dt) {
      if (G.sunPhase === 'go') {
        const d = G.walkTo - G.x;
        if (arrived(G, d, 1.5)) {
          G.sunPhase = 'bask'; G.walking = false;
          G.sunSpr = U.pick(['loaf', 'belly', 'sleep', 'loaf']);
          G.facing = U.chance(.5) ? 1 : -1;
          say(G, AI.line(G, 'sun'), { dur: 2.4 });
          return;
        }
        G.spr = 'stand';
        step(G, Math.sign(d) * Math.min(Math.abs(d), 22 * dt), 'walk');
        return;
      }
      G.walking = false; G.spr = G.sunSpr;
      G.forceHappy = G.sunSpr !== 'sleep';
      const c = cs(G);
      c.mood = U.clamp(c.mood + 0.6 * dt, 0, 100);
      c.energy = U.clamp(c.energy + 0.3 * dt, 0, 100);
      if (G.sunSpr === 'sleep') zzz(G, 9 * G.facing, -14, dt, 1.6);
      else if (U.chance(dt * 0.5)) FX.spawn('sparkle', G.x + U.rnd(-14, 14), G.y - U.rnd(6, 20), { vy: -4, g: 0, life: 1, color: '#FFE9A0' });
      // 太阳挪走了（或者天黑了）：不晒了
      const sp = D.Scene.sunSpot(G.L);
      if (!sp || Math.abs(sp.x - G.x) > 46) G.behDone = true;
    },
    exit(G) { G.forceHappy = false; }
  };

  // 被叫过来：你用手点一下地板，猫就小跑过来坐下，仰头等摸
  B.come = {
    spr: 'stand', dur: [14, 14], walking: true,
    enter(G) {
      const to = G.comeTo || { x: G.x, y: G.gy };
      G.walkTo = U.clamp(to.x, 16, G.L.W - 16);
      G.goY = AI.clampY(G.L, to.y);
      G.comePhase = 'go';
      if (U.chance(.6)) say(G, AI.line(G, 'come'), { dur: 1.6 });
    },
    update(G, dt) {
      if (G.comePhase === 'go') {
        const d = G.walkTo - G.x;
        if (arrived(G, d, 2)) { G.comePhase = 'sit'; G.comeT = U.rnd(3, 4.5); G.walking = false; return; }
        G.spr = 'stand';
        step(G, Math.sign(d) * Math.min(Math.abs(d), 46 * dt), 'run');
        return;
      }
      G.walking = false; G.spr = 'sit';
      G.comeT -= dt;
      if (G.comeT <= 0 && G.petStroke <= 0) G.behDone = true;
    }
  };

  // ---------- 零食 ----------
  // 拿着零食的时候：猫用后腿站起来讨（零食凑近了还会招手）；零食扔到地上，离得近的那只跑过去吃掉。
  // 一只猫连着吃 4 块就饱了，过一阵才会再吃
  AI.treatFull = (G) => (G.treatN || 0) >= 4;
  B.beg = {
    spr: 'sit', dur: [999, 999],
    enter(G) { G.begT = 0.6; },
    update(G, dt) {
      const Gm = D.Game;
      if (Gm.G.tool !== 'treat' || AI.treatFull(G)) { G.behDone = true; return; }
      const m = Gm.G.mouse, dx = m.x - G.x;
      if (Math.abs(dx) > 6) G.facing = Math.sign(dx);
      const near = Gm.G.mouseIn && Math.abs(dx) < 46 && m.y < G.y - 8 && m.y > G.y - 70;
      G.spr = near ? 'rear' : 'sit';
      G.wave = near;
      G.begT -= dt;
      if (G.begT <= 0) { G.begT = U.rnd(4, 7); say(G, AI.line(G, 'treat'), { dur: 1.8 }); }
    },
    exit(G) { G.wave = false; }
  };
  B.goTreat = {
    spr: 'stand', dur: [14, 14], walking: true,
    enter(G) { G.treatPhase = 'go'; },
    update(G, dt) {
      const Gm = D.Game, tr = G.treat;
      if (G.treatPhase === 'eat') {
        G.walking = false; G.spr = 'eat';
        G.eatT -= dt;
        // 掉的渣是小鱼饼干自己的黄色
        if (U.chance(dt * 7)) FX.spawn('crumb', G.x + 14 * G.facing, G.y - 3, { vy: -8, g: 36, life: .5, color: U.chance(.5) ? '#F4C55C' : '#D99C3A' });
        if (G.eatT <= 0) {
          G.treatN = (G.treatN || 0) + 1;
          cs(G).mood = U.clamp(cs(G).mood + 5, 0, 100);
          FX.spawn('heart', G.x, G.y - 26, { vy: -9, g: 0.8, life: 1.4 });
          say(G, AI.line(G, AI.treatFull(G) ? 'full' : 'yum'), { dur: 1.8 });
          St.addBond();
          // 你手里还拿着零食：吃完接着讨
          if (Gm.G.tool === 'treat' && !AI.treatFull(G)) { AI.start(G, 'beg'); return; }
          G.behDone = true;
        }
        return;
      }
      // 零食被另一只抢先吃掉了
      if (!tr || Gm.treats.indexOf(tr) < 0 || (tr.by && tr.by !== G.catId)) {
        if (tr) say(G, AI.line(G, 'missed'), { dur: 1.6 });
        if (Gm.G.tool === 'treat' && !AI.treatFull(G)) { AI.start(G, 'beg'); return; }
        G.behDone = true; return;
      }
      const side = G.x <= tr.x ? -1 : 1;
      const d = tr.x + side * 13 - G.x;
      G.goY = AI.clampY(G.L, tr.y);
      if (tr.z <= 0.5 && arrived(G, d, 2)) {
        tr.by = G.catId;                               // 我的了
        Gm.treats.splice(Gm.treats.indexOf(tr), 1);
        G.treatPhase = 'eat'; G.eatT = 1.3; G.facing = -side; G.spr = 'eat';
        return;
      }
      G.spr = 'stand';
      step(G, Math.sign(d) * Math.min(Math.abs(d), 66 * dt), 'run');
    },
    exit(G) { G.treat = null; }
  };
  // 地上有零食：让有空的猫去追（main.js 每帧调）。每块零食找离它最近、还没在追别的零食的那只
  const TREAT_OK = { sit: 1, loaf: 1, wander: 1, groom: 1, gaze: 1, stretch: 1, play: 1, beg: 1, wantpet: 1, come: 1, zoomies: 1, sunbathe: 1, refuel: 1, bellyUp: 1 };
  AI.treatTick = function (dt) {
    const Gm = D.Game;
    for (const cat of Gm.cats) {
      // 饱了以后慢慢消化：40 秒少一块
      if (cat.treatN > 0) { cat.treatDig = (cat.treatDig || 0) + dt; if (cat.treatDig > 40) { cat.treatDig = 0; cat.treatN--; } }
    }
    for (const tr of Gm.treats) {
      if (tr.z > 0.5 || Gm.cats.some(c => c.treat === tr)) continue;
      // 闲着的都算：在爬架 / 窗台上的会跳下来，躲在纸箱里玩的也会钻出来（睡着的不叫）
      const cand = Gm.cats.filter(c => !c.treat && c.beh && !AI.treatFull(c) && !(c === Gm.G && Gm.G.paused) &&
        ((TREAT_OK[c.beh.name] && !c.hopping) || (c.beh.name === 'box' && c.inBox && c.boxPose !== 'nap')));
      if (!cand.length) continue;
      cand.sort((a, b) => Math.abs(a.x - tr.x) - Math.abs(b.x - tr.x));
      cand[0].treat = tr;
      AI.start(cand[0], 'goTreat');
      cand[0].treat = tr;                              // start() 里上一个行为的 exit 可能把它清掉
    }
  };

  // 庆祝（番茄钟专注完成）：站起来招手、蹦两下
  B.cheer = {
    spr: 'rear', dur: [3.2, 3.2],
    enter(G) { G.wave = true; G.cheerT = 0; },
    update(G, dt) {
      G.spr = 'rear'; G.wave = true; G.forceHappy = true;
      G.cheerT -= dt;
      if (G.cheerT <= 0) {
        G.cheerT = 0.7; G.pounce = 0.4;
        FX.spawn('sparkle', G.x + U.rnd(-10, 10), G.y - 30, { n: 2, spread: 6, life: .8 });
      }
    },
    exit(G) { G.wave = false; G.forceHappy = false; }
  };

  // ---------- 你追我跑 ----------
  // 一只在前面满屋子跑，另一只在后面追；跑完三趟，追的那只扑上去「抓到了」
  B.tagLead = {
    spr: 'stand', dur: [14, 14], walking: true,
    enter(G) { G.zoomLegs = 0; G.goY = AI.randFloorY(G.L); G.walkTo = G.x < G.L.W / 2 ? G.L.W - 20 : 20; },
    update(G, dt) {
      const o = G.tagWith;
      if (!o || !o.beh || o.beh.name !== 'tagFollow') { G.behDone = true; return; }
      const d = G.walkTo - G.x;
      if (Math.abs(d) < 3) {
        G.zoomLegs++;
        if (G.zoomLegs >= 3) { G.behDone = true; return; }
        G.walkTo = G.walkTo < G.L.W / 2 ? G.L.W - 20 : 20;
        G.goY = AI.randFloorY(G.L);
      }
      step(G, Math.sign(d) * Math.min(Math.abs(d), 74 * dt), 'run');
      cs(G).energy = U.clamp(cs(G).energy - 1.8 * dt, 0, 100);
      cs(G).mood = U.clamp(cs(G).mood + 0.6 * dt, 0, 100);
      if (U.chance(dt * 6)) FX.spawn('dust', G.x - 6 * G.facing, G.y - 1, { vy: -3, vx: -8 * G.facing, g: 2, life: .5 });
    },
    exit(G) { G.tagWith = null; }
  };
  B.tagFollow = {
    spr: 'stand', dur: [16, 16], walking: true,
    enter(G) { say(G, U.pick(G.catId === 'nova' ? ['Tag! You are it!', 'Catch you!', 'Wait for me!'] : ['…Fine. Run.', 'I will catch you']), { dur: 1.6 }); },
    update(G, dt) {
      const o = G.tagWith;
      if (!o || !o.beh || o.beh.name !== 'tagLead') {
        // 前面那只停下了：扑上去
        if (o && !G.tagEnd) {
          G.tagEnd = true; G.pounce = 0.4;
          say(G, U.pick(['Got you!', 'Caught!', 'Hehe!']), { dur: 1.6 });
          FX.spawn('heart', (G.x + o.x) / 2, G.y - 28, { vy: -9, g: 0.8, life: 1.4 });
        }
        G.behDone = true; return;
      }
      const tx = o.x - o.facing * 30, d = tx - G.x;
      G.goY = o.gy;
      if (Math.abs(d) > 3) step(G, Math.sign(d) * Math.min(Math.abs(d), 70 * dt), 'run');
      else { G.gait = 'run'; G.gaitHold = 0.15; G.facing = o.facing; }
      cs(G).energy = U.clamp(cs(G).energy - 1.8 * dt, 0, 100);
      cs(G).mood = U.clamp(cs(G).mood + 0.6 * dt, 0, 100);
    },
    exit(G) { G.tagWith = null; G.tagEnd = false; }
  };

  // ---------- 两只猫一起做的事 ----------
  // 两只猫都进同一个行为，各自先走到自己的位置（pairX），两只都到了才开始。
  // 任何一只被打断（你去摸它、喂它…），另一只也就散了。
  function pairGo(G, dt) {
    const o = G.pairWith;
    // 对方可能还在从爬架上往下跳（跳完就接着来）
    const coming = o && o.beh && o.beh.name === 'hopDown' && G.beh && o.afterHop === G.beh.name;
    if (!o || !o.beh || !G.beh || (o.beh.name !== G.beh.name && !coming)) { G.behDone = true; return false; }
    if (G.pairPhase === 'go') {
      const d = G.pairX - G.x;
      G.goY = G.pairY;                              // 两只先走到同一排
      if (arrived(G, d, 1.5)) { G.x = G.pairX; G.gy = G.pairY; G.pairPhase = 'ready'; G.facing = G.pairFace; }
      else { G.spr = 'stand'; step(G, Math.sign(d) * Math.min(Math.abs(d), 26 * dt), 'walk'); }
      return false;
    }
    G.facing = G.pairFace;
    return o.pairPhase === 'ready';
  }
  function pairExit(G) {
    G.pairWith = null; G.pairPhase = null; G.forceHappy = false;
    G.pairBack = false; G.pairDy = 0; G.lean = 0; G.pairLead = false;
  }

  // 互相舔毛：面对面坐着，一只凑过去舔另一只的头，另一只眯眼享受，几秒换一次
  B.pairGroom = {
    spr: 'stand', dur: [16, 26], walking: true,
    enter(G) { G.pairPhase = 'go'; },
    update(G, dt) {
      const both = pairGo(G, dt);
      if (G.pairPhase !== 'ready') return;
      G.walking = false;
      G.spr = 'sit';
      if (!both) return;
      const o = G.pairWith;
      const leadTurn = Math.floor(G.t / 3) % 2 === 0;
      const licking = leadTurn === !!G.pairLead;
      const c = cs(G);
      if (licking) {
        G.forceHappy = false;
        G.lean = Math.sin(G.t * 12) > 0 ? 2 : 0;          // 一下一下往对方头上凑
        G.x = G.pairX + G.pairFace * G.lean;
        G.furT = (G.furT || 0) - dt;
        if (G.furT <= 0) {
          G.furT = U.rnd(.35, .7);
          FX.spawn('fur', o.x - o.facing * 2, o.y - 20, { vy: -6, g: 4, life: 1.1 });
        }
      } else {
        G.x = G.pairX; G.lean = 0;
        G.forceHappy = true;                               // 被舔的那只眯眼
        c.coat = U.clamp(c.coat + 0.8 * dt, 0, 100);
      }
      c.mood = U.clamp(c.mood + 0.5 * dt, 0, 100);
      if (G.pairLead) {
        G.heartT = (G.heartT || 0) - dt;
        if (G.heartT <= 0) {
          G.heartT = U.rnd(1.6, 2.6);
          FX.spawn('heart', (G.x + o.x) / 2, G.y - 30, { vy: -8, g: 0.8, life: 1.6 });
        }
      }
    },
    exit: pairExit
  };

  // 靠在一起睡觉：趴在同一条线上，头对头挨着，身子各朝两边
  B.pairSleep = {
    spr: 'stand', dur: [40, 80], walking: true,
    enter(G) { G.pairPhase = 'go'; },
    update(G, dt) {
      const both = pairGo(G, dt);
      if (G.pairPhase !== 'ready') return;
      G.walking = false;
      G.spr = both ? 'sleep' : 'loaf';
      if (!both) return;
      const c = cs(G);
      c.energy = U.clamp(c.energy + 0.55 * dt, 0, 100);
      c.mood = U.clamp(c.mood + 0.12 * dt, 0, 100);
      G.zzzT = (G.zzzT || 0) - dt;
      if (G.zzzT <= 0) {
        G.zzzT = U.rnd(1.6, 2.6);
        FX.spawn('zzz', G.x + 14 * G.facing, G.y + (G.pairDy || 0) - 18, { vy: -5, vx: 2 * G.facing, g: -0.6, life: 2.4 });
      }
      if (G.pairLead) {
        G.heartT = (G.heartT || 0) - dt;
        if (G.heartT <= 0) {
          G.heartT = U.rnd(3, 5);
          // 爱心从两颗脑袋中间冒出来
          const o = G.pairWith;
          FX.spawn('heart', o ? (G.x + o.x) / 2 : G.x, G.y - 20, { vy: -6, g: 0.6, life: 1.8 });
        }
      }
    },
    exit: pairExit
  };

  // 发起一起做的事：定好碰头的位置，两只同时开始
  function startPair(A, Bc, kind) {
    const L = A.L;
    const lead = A, other = Bc;
    if (kind === 'pairGroom') {
      const mid = U.clamp(Math.round((A.x + Bc.x) / 2), 46, L.W - 46);
      lead.pairX = mid - 13; lead.pairFace = 1;
      other.pairX = mid + 13; other.pairFace = -1;
    } else {
      // 头碰头：两只趴在同一条线上，左边那只朝右、右边那只朝左，
      // 脑袋在中间挨着（睡姿的脸离精灵中心 24 像素，各让 1 像素就贴上了），身子往两边伸
      let mid = U.clamp(Math.round((A.x + Bc.x) / 2), 56, L.W - 56);
      // 两只头碰头占的地方更宽：碰头点离碗太近就挪到碗的一侧去（哪边放得下去哪边）
      const clear = BOWL_CLEAR + 24;
      if (Math.abs(mid - L.bowl.x) < clear) {
        const left = L.bowl.x - clear, right = L.bowl.x + clear;
        const okL = left >= 56, okR = right <= L.W - 56;
        if (okL && okR) mid = Math.abs(mid - left) <= Math.abs(mid - right) ? left : right;
        else if (okR) mid = right;
        else if (okL) mid = left;
      }
      const leftCat = A.x <= Bc.x ? A : Bc, rightCat = leftCat === A ? Bc : A;
      leftCat.pairX = mid - 23; leftCat.pairFace = 1;
      rightCat.pairX = mid + 23; rightCat.pairFace = -1;
    }
    // 碰头的那一排：两只现在站的深度取中间
    const py = AI.clampY(L, ((A.gy != null ? A.gy : L.catY) + (Bc.gy != null ? Bc.gy : L.catY)) / 2);
    lead.pairY = py; other.pairY = py;
    lead.pairLead = true; other.pairLead = false;
    lead.pairWith = other; other.pairWith = lead;
    AI.start(other, kind);
    return kind;
  }
  const PAIR_OK_BEH = { sit: 1, loaf: 1, wander: 1, groom: 1, gaze: 1, stretch: 1, play: 1, sleep: 1 };
  function pairPartner(G) {
    if (!(D.Game && D.Game.showScene)) return null;
    const o = otherCats(G)[0];
    // 对方在高处（爬架 / 窗台）就不去叫她下来
    if (!o || !o.beh || !PAIR_OK_BEH[o.beh.name] || o.hopping || o.pairWith || o.onPerch || o.nest) return null;
    if (o === D.Game.G && D.Game.G.paused) return null;
    return o;
  }

  AI.B = B;

  // ---------- 选行为 ----------
  // 性格：Luna 爱待在高处（爬架顶的垫子、窗台看风景），Nova 在地上玩玩具、到处逛
  const PERSONA = {
    luna: { perch: 46, play: 2, wheel: 2, wander: 6, sit: 18, loaf: 12, gaze: 8, groom: 12, zoom: 0.4, stayUp: 1, box: 5, bed: 9, sun: 16, tag: 5 },
    nova: { perch: 3, play: 30, wheel: 24, wander: 22, sit: 10, loaf: 8, gaze: 4, groom: 8, zoom: 1.6, stayUp: 0.15, box: 12, bed: 7, sun: 9, tag: 16 }
  };
  AI.PERSONA = PERSONA;
  AI.choose = function (G) {
    const c = cs(G);
    const P = PERSONA[G.catId] || PERSONA.luna;
    // 跟窗外的时间走（调试时 ?hour= 指定的也算）
    const hour = D.Game && D.Game.hourNow != null ? D.Game.hourNow : new Date().getHours();
    const night = hour >= 23 || hour < 6;
    const room = !!(D.Game && D.Game.showScene);
    let w;
    if (G.onPerch) {
      // 在高处：坐着、趴着、睡觉、舔毛、看风景，偶尔跳下来
      w = {
        sit: 14, loaf: G.onPerch === 'sill' ? 30 : 22, groom: 10, sleep: 6,
        gaze: G.onPerch === 'sill' ? 28 : 8, wantpet: 0,
        hopDown: 22 / P.stayUp * 0.25
      };
      if (c.energy < 40) w.sleep += (40 - c.energy) * 1.6;
      if (night) w.sleep += 40;
      if (c.mood > 45 && G.sinceTouch > 25) w.wantpet = 6 + Math.min(20, (G.sinceTouch - 25) * .3);
      const fed = D.Game && D.Game.bowl && D.Game.bowl.fill > 0.05;   // 碗里有饭就下来吃
      if (fed || (c.litter > 25 && G.sinceLitter > 90 && !(D.Game && D.Game.focusMode))) w.hopDown += 30;
      // 刚上来先待一会儿（Luna 至少 45 秒），别一落脚就又跳下去
      if ((G.perchT || 0) < 45 * P.stayUp) w.hopDown = 0;
    } else {
      w = {
        sit: P.sit, loaf: P.loaf, gaze: P.gaze, groom: P.groom, wander: P.wander, stretch: 6,
        sleep: 5, zoomies: 0, wantpet: 0, useLitter: 0,
        perch: room ? P.perch : 0, play: room ? P.play : 0,
        wheel: room && G.L.wheel ? P.wheel : 0
      };
      if (c.energy < 40) w.sleep += (40 - c.energy) * 1.6;
      if (night) { w.sleep += 40; w.gaze += 6; w.play *= 0.3; w.wheel *= 0.3; }
      if (c.energy > 70 && c.mood > 55 && !night) w.zoomies = 10 * P.zoom;
      if (c.mood > 45 && G.sinceTouch > 25) w.wantpet = 10 + Math.min(30, (G.sinceTouch - 25) * .5);
      // 上厕所只在完整房间里（桌宠小窗里看不到砂盆，不能凭空多出粑粑）
      if (room && c.litter > 25 && G.sinceLitter > 90) w.useLitter = 8 + (G.sinceLitter - 90) * .06;
      if (c.energy < 15) { w.play = 0; w.wheel = 0; }
      // 没有饱食度了：碗里有饭就会过来吃，水碗有水时不时去喝两口
      const bowl = D.Game && D.Game.bowl;
      if (bowl && bowl.fill > 0.05 && !(G.beh && G.beh.name === 'goEat')) w.goEat = 60;
      const water = D.Game && D.Game.water;
      if (water && water.fill > 0.05 && !(G.beh && G.beh.name === 'goDrink')) w.goDrink = 12;
      if (room) {
        // 纸箱、猫窝（空着才去）、地板上的太阳
        if (nestFree(G, 'box')) w.box = P.box;
        if (nestFree(G, 'bed')) w.bedNap = P.bed + (c.energy < 40 ? 10 : 0) + (night ? 14 : 0);
        if (D.Scene.sunSpot(G.L)) w.sunbathe = P.sun;
      }
    }
    if (c.coat < 60) w.groom += (60 - c.coat) * 0.35;
    // 两只一起：心情好就去找对方舔毛，困了就挨着睡
    // 在高处的时候不发起：不然刚爬上爬架就会被「挨着睡」拽下来（困了就在上面睡）
    const partner = G.onPerch ? null : pairPartner(G);
    if (partner) {
      const oc = cs(partner);
      w.pairGroom = (c.mood > 40 && oc.mood > 30) ? 9 : 2;
      w.pairSleep = 3 + (c.energy < 45 ? 22 : 0) + (night ? 24 : 0);
    }
    // 你追我跑：两只都有精神的时候
    if (partner && !night && c.energy > 50 && cs(partner).energy > 45 && partner.beh.name !== 'sleep') w.tag = P.tag;
    // 番茄钟专注的时候两只猫都安静下来陪你：不提任何要求（不讨摸、不讨吃）、不上厕所、不疯跑、少玩，多趴着睡觉。
    // 憋着的事等休息了再说
    if (D.Game && D.Game.focusMode) {
      w.zoomies = 0; w.tag = 0; w.wantpet = 0; w.useLitter = 0;
      if (w.play) w.play *= 0.25;
      if (w.wheel) w.wheel *= 0.2;
      w.loaf += 10; w.sleep += 8; w.sit += 5;
    }
    if (D.Game && D.Game.breakMode && !G.onPerch && c.mood > 30) w.wantpet = (w.wantpet || 0) + 12;   // 休息时间：来找你玩
    if (G.lastBeh && w[G.lastBeh] !== undefined) w[G.lastBeh] *= 0.25;
    let pick = U.weighted(w);
    if (pick === 'pairGroom' || pick === 'pairSleep') return startPair(G, partner, pick);
    if (pick === 'tag') {
      // 发起的那只追，另一只跑
      G.tagWith = partner; partner.tagWith = G;
      AI.start(partner, 'tagLead');
      partner.tagWith = G;
      return 'tagFollow';
    }
    // 想在地上睡觉：一半时候会改去猫窝或者纸箱里睡（空着的话）
    if (pick === 'sleep' && !G.onPerch && room) {
      const r = Math.random();
      if (r < 0.4 && nestFree(G, 'bed')) pick = 'bedNap';
      else if (r < 0.65 && nestFree(G, 'box')) { G.boxWant = 'nap'; pick = 'box'; }
    }
    if (pick === 'perch') {
      const opts = ['tree', 'sill'].filter(n => freePerch(G, n) && AI.perchPath(G, n));
      if (!opts.length) return 'sit';
      G.perchGoal = U.pick(opts);
    }
    return pick;
  };

  // 要在地上做的事（走路、吃饭、上厕所、追逗猫棒）：人在高处就先跳下来
  // （追逗猫棒不在这里面：在高处也能玩，逗猫棒落到地上时它自己会跳下来）
  const NEEDS_FLOOR = { refuel: 1, wander: 1, zoomies: 1, useLitter: 1, goEat: 1, play: 1, perch: 1, stretch: 1, pairGroom: 1, pairSleep: 1, wheel: 1, goDrink: 1,
    bedNap: 1, box: 1, sunbathe: 1, come: 1, goTreat: 1, tagLead: 1, tagFollow: 1 };

  AI.start = function (G, name) {
    // 追逗猫棒跳到一半被打断：先落到终点，下面才知道它现在在不在高处
    if (G.chaseHops) finishWandHop(G);
    // 停在半路的落脚点上（爬架下面两层、砂盆顶上）只是追逗猫棒时歇一下脚，不在那儿坐着 / 睡觉：别的事都先下地
    const mid = G.onPerch && G.perchAt != null && G.perchAt < lastIdx(G, G.onPerch);
    if (G.onPerch && name !== 'chase' && name !== 'hopDown' && (NEEDS_FLOOR[name] || mid)) { G.afterHop = name; name = 'hopDown'; }
    // 在猫窝 / 纸箱里：不管接下来做什么，先跳出来
    if ((G.inBed || G.inBox) && name !== 'nestOut') { G.afterHop = name; name = 'nestOut'; }
    // 在碗边想趴下 / 睡觉：先走开，到了别处再趴
    if (LIE_DOWN[name] && !G.noDodge && !G.onPerch && !G.inWheel && G.L && G.L.bowl &&
        D.Game && D.Game.showScene && Math.abs(G.x - G.L.bowl.x) < BOWL_CLEAR) {
      G.thenBeh = name; G.leaveBowl = true; name = 'wander';
    } else if (name !== 'wander') G.thenBeh = null;
    const b = B[name];
    if (!b) return;
    const prev = G.beh && B[G.beh.name];
    if (prev && prev.exit) prev.exit(G);
    G.lastBeh = G.beh ? G.beh.name : null;
    G.beh = { name: name, t: 0, dur: U.rnd(b.dur[0], b.dur[1]) };
    G.behDone = false;
    G.wiggle = false;
    G.goY = null;
    G.catchPhase = null;
    G.spr = b.spr;
    G.walking = !!b.walking;
    if (b.enter) b.enter(G);
  };

  AI.update = function (G, dt) {
    if (!G.beh) { AI.start(G, 'sit'); return; }
    const b = B[G.beh.name];
    G.beh.t += dt;
    G.perchT = G.onPerch ? (G.perchT || 0) + dt : 0;   // 在高处已经待了多久
    G.walking = !!b.walking;
    if (b.update) b.update(G, dt);
    if (G.behDone || G.beh.t >= G.beh.dur) AI.start(G, AI.choose(G));
  };

  // ---------- 每帧动画 ----------
  AI.animate = function (G, t, dt) {
    const c = cs(G);
    const beh = G.beh ? B[G.beh.name] : null;
    const sleeping = G.spr === 'sleep' || (G.inBox && G.boxPose === 'nap');

    // 腿由骨骼每帧算；step() 不再被调用就淡回站立
    G.gaitHold = (G.gaitHold || 0) - dt;
    if (G.gaitHold <= 0) G.gait = null;

    // 尾巴：心情越好摆得越快
    const speed = sleeping ? 0.25 : (0.6 + c.mood / 100 * 1.1);
    G.tailPhase = (G.tailPhase || 0) + dt * speed * (G.spr === 'crouch' ? 4 : 1);

    // 呼吸 / 走路颠簸
    // 四足姿势的起伏交给骨骼系统，这里只管坐着/睡着的呼吸
    let lift = 0;
    if (!G.walking) lift = (sleeping ? Math.sin(t * 0.8) > 0.6 : Math.sin(t * 1.5) > 0.82) ? 1 : 0;

    // 扑
    if (G.pounce > 0) {
      G.pounce -= dt;
      lift += Math.round(Math.sin(U.clamp(1 - G.pounce / 0.4, 0, 1) * Math.PI) * 7);
    }
    G.lift = lift;

    // 眼睛
    let ov = null;
    G.blinkT -= dt;
    if (G.blinkT <= 0) { G.blinkT = U.rnd(2.2, 6.5); G.blinkP = 0.13; }
    if (G.blinkP > 0) G.blinkP -= dt;

    G.boopT = Math.max(0, (G.boopT || 0) - dt);
    G.slowBlink = Math.max(0, (G.slowBlink || 0) - dt);
    if (sleeping) ov = 'eye_shut';
    else if (G.boopT > 0) ov = 'eye_win';                                  // 被点了一下鼻子：「> <」
    else if (G.slowBlink > 0 && G.slowBlink < 1.1) ov = 'eye_shut';        // 慢慢眨一下眼
    else if (G.spr === 'stretch') ov = 'eye_shut';                         // 伸懒腰眯着眼
    else if (G.winT > 0 && (G.playPhase === 'win' || G.catchPhase === 'win')) ov = 'eye_win';   // 扑到玩具 / 抓到逗猫棒的得意脸
    else if (G.petStroke > 0 || G.brushStroke > 0 || G.forceHappy || G.spr === 'groom') ov = 'eye_happy';
    else if (G.blinkP > 0) ov = 'eye_shut';
    else if (G.beh && (G.beh.name === 'chase' || G.beh.name === 'beg' || G.beh.name === 'goTreat')) ov = 'eye_big';
    else if (beh && beh.look === 'up') ov = 'eye_up';
    else if (c.mood < 28) ov = 'eye_half';
    G.eyeOv = ov;
  };

  D.AI = AI;
})(window.DOLL);

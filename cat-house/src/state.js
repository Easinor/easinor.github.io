// 数值、存档、离线衰减
window.DOLL = window.DOLL || {};
(function (D) {
  'use strict';
  const U = D.U;

  const KEY = 'doll.save.v1';

  // 每分钟掉多少。砂盆不会自己变脏：只有猫真的去上了厕所（留下粑粑）才变脏
  const DECAY = { food: 0, water: 0, litter: 0, coat: 0.26 };   // 不再有饱食度 / 口渴：倒了粮和水，猫就会去吃喝
  const MAX_OFFLINE_MIN = 10 * 60; // 离线最多算 10 小时

  function freshCat() {
    return { food: 78, water: 80, litter: 88, coat: 82, energy: 72, mood: 76, bond: 0, pets: 0, meals: 0, plays: 0, scoops: 0, brushes: 0 };
  }

  const St = {
    cat: 'luna',
    data: { luna: freshCat(), nova: freshCat() },
    settings: { scene: true, mini: false, sound: false, zoom: 'm', acc: { luna: 'none', nova: 'none' } },
    lastSeen: Date.now(),
    firstRun: true,
    poops: []
  };

  St.cur = function () { return St.data[St.cat]; };

  // 亲密度等级
  const LEVELS = [0, 30, 80, 160, 280, 450, 700, 1050, 1500, 2100];
  St.level = function (bond) {
    let lv = 1;
    for (let i = 0; i < LEVELS.length; i++) if (bond >= LEVELS[i]) lv = i + 1;
    return Math.min(lv, LEVELS.length);
  };
  St.levelProgress = function (bond) {
    const lv = St.level(bond);
    if (lv >= LEVELS.length) return 1;
    const a = LEVELS[lv - 1], b = LEVELS[lv];
    return U.clamp((bond - a) / (b - a), 0, 1);
  };
  St.LEVEL_TITLES = ['First Meeting', 'Familiar Face', 'Comes Closer', 'Cuddle Buddy', 'Personal Scooper', 'Inseparable', 'In Sync', 'Best Friends', 'For Life', 'Meant to Be'];

  St.addBond = function (n) {
    const c = St.cur();
    const before = St.level(c.bond);
    c.bond = Math.max(0, c.bond + n);
    const after = St.level(c.bond);
    return after > before ? after : 0;
  };

  // 综合心情：由其它数值拖拽
  St.moodTarget = function (c) {
    const base = (c.litter * 0.2 + c.coat * 0.16 + c.energy * 0.12) / 0.48;
    return U.clamp(base, 0, 100);
  };

  St.tick = function (dt) {
    const c = St.cur();
    const m = dt / 60;
    c.food = U.clamp(c.food - DECAY.food * m, 0, 100);
    c.water = U.clamp((c.water == null ? 80 : c.water) - DECAY.water * m, 0, 100);
    c.litter = U.clamp(c.litter - DECAY.litter * m, 0, 100);
    c.coat = U.clamp(c.coat - DECAY.coat * m, 0, 100);
    // 心情缓慢靠向目标
    const target = St.moodTarget(c);
    c.mood = U.approach(c.mood, target, 0.012, dt);
    // 另一只猫也在屋里，一样的速度掉
    for (const id in St.data) {
      if (id === St.cat) continue;
      const o = St.data[id];
      o.food = U.clamp(o.food - DECAY.food * m, 0, 100);
      o.water = U.clamp((o.water == null ? 80 : o.water) - DECAY.water * m, 0, 100);
      o.litter = U.clamp(o.litter - DECAY.litter * m, 0, 100);
      o.coat = U.clamp(o.coat - DECAY.coat * m, 0, 100);
      o.mood = U.approach(o.mood, St.moodTarget(o), 0.012, dt);
    }
    // 砂盆是两只共用的：谁上了厕所都会变脏，铲一次两只都干净。
    // 每帧把各自身上的变化（铲屎 +、上厕所 -）汇总到同一个砂盆值，再同步回去。
    if (St.box == null) St.box = c.litter;
    St._lit = St._lit || {};
    for (const id in St.data) {
      const o = St.data[id];
      const prev = St._lit[id] == null ? o.litter : St._lit[id];
      // 上面已经各自扣过一次自然变脏，这里加回来，只汇总铲屎 / 上厕所带来的变化
      St.box += (o.litter + DECAY.litter * m) - prev;
    }
    St.box = U.clamp(St.box - DECAY.litter * m, 0, 100);
    for (const id in St.data) { St.data[id].litter = St.box; St._lit[id] = St.box; }
  };

  St.applyOffline = function (minutes) {
    const m = Math.min(minutes, MAX_OFFLINE_MIN);
    if (m < 1) return null;
    const before = {};
    for (const id in St.data) {
      const c = St.data[id];
      before[id] = c.food;
      const rate = id === St.cat ? 1 : 0.5;
      c.food = U.clamp(c.food - DECAY.food * m * rate, 0, 100);
      c.litter = U.clamp(c.litter - DECAY.litter * m * rate, 0, 100);
      c.coat = U.clamp(c.coat - DECAY.coat * m * rate, 0, 100);
      c.energy = U.clamp(c.energy + m * 0.35, 0, 100); // 不在的时候睡饱了
      c.mood = U.clamp(U.lerp(c.mood, St.moodTarget(c), 0.6), 0, 100);
    }
    return m;
  };

  // ---------- 存档 ----------
  let mem = null; // localStorage 不可用时的回退
  St.save = function () {
    St.lastSeen = Date.now();
    const blob = JSON.stringify({
      cat: St.cat, data: St.data, settings: St.settings,
      lastSeen: St.lastSeen, firstRun: false, poops: St.poops
    });
    try { localStorage.setItem(KEY, blob); } catch (e) { mem = blob; }
  };

  St.load = function () {
    let blob = null;
    try { blob = localStorage.getItem(KEY); } catch (e) { blob = mem; }
    if (!blob) return 0;
    try {
      const o = JSON.parse(blob);
      if (o.cat && D.CATS[o.cat]) St.cat = o.cat;
      for (const id in St.data) {
        if (o.data && o.data[id]) Object.assign(St.data[id], o.data[id]);
      }
      if (o.settings) Object.assign(St.settings, o.settings);
      // 旧存档：一件装扮两只共用 → 拆成每只一件
      if (!o.settings || !o.settings.acc || typeof o.settings.acc !== 'object') {
        const old = (o.settings && o.settings.accessory) || 'none';
        St.settings.acc = { luna: old, nova: old };
      }
      delete St.settings.accessory;
      if (Array.isArray(o.poops)) St.poops = o.poops;
      St.firstRun = !!o.firstRun;
      const mins = (Date.now() - (o.lastSeen || Date.now())) / 60000;
      return St.applyOffline(mins) || 0;
    } catch (e) {
      return 0;
    }
  };

  St.reset = function () {
    St.data = { luna: freshCat(), nova: freshCat() };
    St.poops = [];
    St.firstRun = true;
    try { localStorage.removeItem(KEY); } catch (e) { mem = null; }
  };

  D.St = St;
})(window.DOLL);

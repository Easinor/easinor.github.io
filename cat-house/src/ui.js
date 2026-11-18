// 界面：猫卡片、数值条、动作栏、选猫、升级提示（文字用 DOM，图标用像素画）
window.DOLL = window.DOLL || {};
(function (D) {
  'use strict';
  const U = D.U, St = D.St, PX = D.PX;
  const UI = {};

  const STATS = [
    { k: 'litter', label: 'Litter', color: ['#6E9CBE', '#9EC4DA'] },
    { k: 'coat', label: 'Coat', color: ['#A98ACB', '#CBB3E0'] },
    { k: 'energy', label: 'Energy', color: ['#6FAE82', '#A0CEAE'] },
    { k: 'mood', label: 'Mood', color: ['#DD7E9C', '#F0AEC2'] }
  ];

  let portraitCtx = null, portraitT = 0;
  const pickCtxs = [];
  const actCtxs = [];

  function pixCanvas(el, w, h, zoom) {
    const cv = document.createElement('canvas');
    cv.width = w * zoom; cv.height = h * zoom;
    cv.style.width = (w * zoom) + 'px';
    cv.style.height = (h * zoom) + 'px';
    cv.style.imageRendering = 'pixelated';
    el.appendChild(cv);
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.setTransform(zoom, 0, 0, zoom, 0, 0);
    return c;
  }

  // ---------- 猫卡片 ----------
  // 左上角的猫卡片拿掉了：换猫 = 拿手点另一只猫
  function buildCard() {
    portraitCtx = null;
    document.getElementById('hud').style.display = 'none';
  }

  // ---------- 像素图标 ----------
  function icon(c, id) {
    c.clearRect(0, 0, 16, 16);
    const R = (x, y, w, h, col) => PX.rect(c, x, y, w, h, col);
    if (id === 'pet') {
      R(3, 3, 2, 5, '#F6D8C0'); R(6, 2, 2, 6, '#F6D8C0'); R(9, 2, 2, 6, '#F6D8C0');
      R(12, 4, 2, 4, '#F6D8C0');
      R(3, 7, 11, 5, '#E7B993'); R(4, 12, 9, 2, '#D9A47E');
      R(10, 1, 4, 2, '#E8607F'); R(9, 2, 6, 2, '#E8607F'); R(10, 4, 4, 1, '#E8607F'); R(11, 5, 2, 1, '#E8607F');
    } else if (id === 'feed') {
      R(2, 12, 12, 2, '#C9B3D4');
      R(3, 6, 10, 6, '#E6E0EC'); R(3, 5, 10, 2, '#F4F0F7');
      R(4, 3, 3, 2, '#C98A4B'); R(8, 2, 3, 2, '#C98A4B'); R(6, 4, 4, 2, '#A96C33');
    } else if (id === 'water') {
      // 蓝碗 + 一滴水
      R(2, 12, 12, 2, '#7FB4D8');
      R(3, 7, 10, 5, '#A8D4F0'); R(3, 6, 10, 2, '#D2ECFA'); R(4, 7, 8, 1, '#7FC4F0');
      R(7, 1, 2, 1, '#4F8DC0'); R(6, 2, 4, 2, '#4F8DC0'); R(7, 4, 2, 1, '#4F8DC0'); R(7, 2, 1, 1, '#FFFFFF');
    } else if (id === 'brush') {
      R(6, 8, 4, 7, '#B5793F'); R(3, 3, 10, 6, '#5E6B86');
      R(3, 1, 2, 2, '#CFD8E8'); R(6, 1, 2, 2, '#CFD8E8'); R(9, 1, 2, 2, '#CFD8E8'); R(12, 1, 1, 2, '#CFD8E8');
    } else if (id === 'litter') {
      R(9, 8, 2, 7, '#6E7C96'); R(2, 3, 10, 6, '#B4C2D8'); R(2, 2, 10, 1, '#D4DEEC');
      R(4, 5, 1, 3, '#8795AE'); R(7, 5, 1, 3, '#8795AE');
    } else if (id === 'wand') {
      PX.line(c, 1, 13, 9, 4, '#8A5E3C'); PX.line(c, 2, 13, 10, 4, '#C89A6E');
      PX.line(c, 10, 4, 11, 9, 'rgba(90,80,100,.6)');
      const cols = ['#E8607F', '#F09A4E', '#6FB4E0', '#7FC98A'];
      for (let i = 0; i < 4; i++) R(8 + i * 2, 10 + (i % 2), 2, 5, cols[i]);
      R(10, 8, 3, 2, '#E8D7B8');
    }
  }

  function buildDock() {
    const dock = document.getElementById('dock');
    dock.innerHTML = '';
    actCtxs.length = 0;
    for (const t of D.Act.TOOLS) {
      const b = document.createElement('button');
      b.className = 'act';
      b.dataset.id = t.id;
      b.title = t.name + ' (' + t.key + ') — ' + t.hint;
      const c = pixCanvas(b, 16, 16, 2);
      icon(c, t.id);
      const sp = document.createElement('span'); sp.textContent = t.name; b.appendChild(sp);
      const kb = document.createElement('kbd'); kb.textContent = t.key; b.appendChild(kb);
      b.addEventListener('click', () => UI.pickTool(t.id));
      dock.appendChild(b);
      actCtxs.push({ ctx: c, id: t.id, el: b });
    }
  }

  UI.pickTool = function (id) {
    const G = D.Game.G;
    if (id === 'feed') { D.Act.feed(G); UI.flash(id); return; }
    if (id === 'water') { D.Act.water(G); UI.flash(id); return; }
    D.Act.setTool(G, (G.tool === id && id !== 'pet') ? 'pet' : id);
  };

  UI.flash = function (id) {
    const a = actCtxs.find(a => a.id === id);
    if (a && a.el.animate) a.el.animate([{ transform: 'translateY(-3px)' }, { transform: 'none' }], { duration: 220, easing: 'steps(3)' });
  };

  UI.syncTools = function () {
    const G = D.Game.G;
    for (const a of actCtxs) a.el.classList.toggle('on', a.id === G.tool);
    document.body.classList.toggle('tool-active', !!G.tool);
  };

  // ---------- 右上开关 ----------
  function buildTop() {
    // 右上角的按钮全拿掉了：装扮改成点墙上那只猫的照片来换
    const el = document.getElementById('tools-top');
    el.innerHTML = '';
    el.style.display = 'none';
    document.getElementById('miniback').onclick = () => UI.setMini(false);
  }

  // 给某只猫换下一套装扮（每只猫各戴各的），返回新装扮的名字
  UI.cycleAcc = function (catId) {
    // cat-new.js 没加载（比如浏览器还缓存着旧的 index.html）时别整页崩掉
    const list = D.ACC_LIST || ['none'], names = D.ACC_NAMES || { none: 'None' };
    const m = (St.settings.acc = St.settings.acc || { luna: 'none', nova: 'none' });
    m[catId] = list[(list.indexOf(m[catId] || 'none') + 1) % list.length];
    St.save();
    return names[m[catId]] || 'None';
  };

  UI.setMini = function (on) {
    St.settings.mini = on;
    document.body.classList.toggle('mini', on);
    St.save();
    D.Game.resize();
  };

  // ---------- 选猫 ----------
  UI.openChooser = function () {
    const box = document.querySelector('#chooser .picks');
    box.innerHTML = '';
    pickCtxs.length = 0;
    for (const id of D.CAT_LIST) {
      const cat = D.CATS[id];
      const c = St.data[id];
      const d = document.createElement('div');
      d.className = 'pick';
      d.dataset.id = id;
      d.innerHTML = '<h2>' + cat.name + '</h2>' +
        '<div class="breed">' + cat.breed + '</div>' +
        '<div class="desc">' + cat.desc + '</div>' +
        '<div class="cc-lv pick-lv"><span>Bond Lv.' + St.level(c.bond) + '</span><span>' +
        St.LEVEL_TITLES[St.level(c.bond) - 1] + '</span></div>';
      const holder = document.createElement('div');
      holder.className = 'pick-pic';
      d.insertBefore(holder, d.firstChild);
      d.addEventListener('click', () => UI.chooseCat(id));
      box.appendChild(d);
      pickCtxs.push({ ctx: pixCanvas(holder, 39, 33, 3), id: id });
    }
    document.getElementById('chooser').classList.remove('hide');
    if (D.Game) D.Game.G.paused = true;
  };

  UI.chooseCat = function (id) {
    St.cat = id;
    St.firstRun = false;
    St.save();
    document.getElementById('chooser').classList.add('hide');
    buildCard();
    D.Game.switchCat(id);
    if (UI.refreshAcc) UI.refreshAcc();
  };

  // ---------- 升级 ----------
  let lvTimer = null;
  UI.levelUp = function (lv) {
    const el = document.getElementById('levelup');
    el.innerHTML = 'Bond Lv.' + lv + ' · ' + St.LEVEL_TITLES[lv - 1] +
      '<small>You and ' + D.CATS[St.cat].name + ' grew a little closer</small>';
    el.classList.add('show');
    clearTimeout(lvTimer);
    lvTimer = setTimeout(() => el.classList.remove('show'), 3200);
  };

  // ---------- 每帧刷新 ----------
  let blinkAcc = 0, blinkOn = false;
  UI.tick = function (dt, t) {
    const c = St.cur();
    const lvt = document.getElementById('lvtext');
    if (lvt) {
      const lv = St.level(c.bond);
      lvt.textContent = 'Lv.' + lv + ' ' + St.LEVEL_TITLES[lv - 1];
      document.getElementById('lvnum').textContent = Math.floor(c.bond);
      document.getElementById('lvbar').style.width = (St.levelProgress(c.bond) * 100) + '%';
    }

    portraitT += dt;
    blinkAcc -= dt;
    if (blinkAcc <= 0) { blinkAcc = blinkOn ? U.rnd(2.5, 6) : 0.12; blinkOn = !blinkOn; }

    if (portraitCtx) {
      portraitCtx.clearRect(0, 0, 39, 33);
      D.drawHeadshot(portraitCtx, St.cat, 0, 0, blinkOn ? 'eye_shut' : null);
    }
    const ch = document.getElementById('chooser');
    if (ch && !ch.classList.contains('hide')) {
      for (const p of pickCtxs) {
        p.ctx.clearRect(0, 0, 39, 33);
        D.drawHeadshot(p.ctx, p.id, 0, 0, blinkOn ? 'eye_shut' : null);
      }
    }
  };

  UI.build = function () {
    buildCard();
    buildDock();
    buildTop();
    if (St.settings.mini) document.body.classList.add('mini');
  };

  D.UI = UI;
})(window.DOLL);

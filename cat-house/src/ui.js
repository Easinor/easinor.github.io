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
    } else if (id === 'treat') {
      // 小鱼饼干
      R(3, 6, 8, 5, '#F2A65A'); R(4, 5, 6, 1, '#F2A65A'); R(4, 11, 6, 1, '#D9823A');
      R(3, 10, 8, 1, '#E3924A');
      R(11, 5, 2, 3, '#D9823A'); R(11, 9, 2, 3, '#D9823A'); R(12, 4, 2, 2, '#D9823A'); R(12, 11, 2, 2, '#D9823A');
      R(5, 7, 1, 1, '#4A3020'); R(7, 8, 1, 2, '#E3924A');
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
      b.title = t.name + ' — ' + t.hint;
      const c = pixCanvas(b, 16, 16, 2);
      icon(c, t.id);
      const sp = document.createElement('span'); sp.textContent = t.name; b.appendChild(sp);
      b.addEventListener('click', () => UI.pickTool(t.id));
      dock.appendChild(b);
      actCtxs.push({ ctx: c, id: t.id, el: b });
    }
  }

  UI.pickTool = function (id) {
    const G = D.Game.G;
    D.Game.userActAt = performance.now();
    if (id === 'feed') { D.Act.feed(G); UI.flash(id); return; }
    if (id === 'water') { D.Act.water(G); UI.flash(id); return; }
    D.Act.setTool(G, (G.tool === id && id !== 'pet') ? 'pet' : id);
  };

  // 吊灯开 / 关：直接点屋里那盏灯。不算照顾猫的动作，不加亲密度
  UI.toggleLamp = function () {
    St.settings.lamp = !St.settings.lamp;
    St.save();
    const L = D.Game.G.L, lp = D.Scene.lampPos(L);
    D.FX.toast(St.settings.lamp ? 'Light on' : 'Light off', lp.x, lp.y + 14, '#B8894A');
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

  // ---------- 右上角：亲密度条、番茄钟、账号 ----------
  function buildTop() {
    const el = document.getElementById('tools-top');
    el.innerHTML = '';
    document.getElementById('miniback').onclick = () => UI.setMini(false);
    const Acc = D.Account;
    if (Acc) {
      // 亲密度进度条：两只猫共用一条，登录了才显示
      bondEl = document.createElement('div');
      bondEl.className = 'panel';
      bondEl.id = 'bondbar';
      bondEl.innerHTML = '<div class="bb-top"><b id="bb-lv"></b><span id="bb-title"></span><em id="bb-num"></em></div>' +
        '<div class="cc-bar"><i id="bb-fill"></i></div>';
      bondEl.title = 'Bond with Luna & Nova: +1 every 5 seconds here, +5 for each action below';
      el.appendChild(bondEl);
    }
    buildPomoChip(el);
    if (Acc) {
      accBtn = document.createElement('button');
      accBtn.className = 'chip';
      accBtn.addEventListener('click', () => UI.togglePanel('account'));
      el.appendChild(accBtn);
      Acc.onLevelUp = (lv, title, newTitle) => UI.banner('Bond Lv.' + lv + ' · ' + title,
        lv >= 10 ? 'Max level — you, Luna and Nova are family' : 'New title! You, Luna and Nova grew a little closer');
      // 登录状态在后台变了（取回了服务器上的进度 / 令牌失效被登出）：按钮和面板跟着刷新
      Acc.onChange = () => {
        refreshAccBtn();
        if (document.getElementById('account').classList.contains('show')) renderAccount();
      };
      refreshAccBtn();
    }
  }

  // 点一下屋里：把开着的面板收起来（main.js 在处理点击之前调）。返回刚才开着的是哪个
  UI.closePanels = function () {
    let was = null;
    for (const id of ['account', 'pomo']) {
      const el = document.getElementById(id);
      if (el.classList.contains('show')) { was = id; el.classList.remove('show'); }
    }
    return was;
  };

  // 右上角的两个面板（番茄钟 / 账号）同一时间只开一个
  UI.togglePanel = function (name) {
    const acc = document.getElementById('account'), pm = document.getElementById('pomo');
    const el = name === 'pomo' ? pm : acc, other = name === 'pomo' ? acc : pm;
    other.classList.remove('show');
    el.classList.toggle('show');
    if (!el.classList.contains('show')) return;
    if (name === 'pomo') renderPomo(); else renderAccount();
  };

  // ---------- 番茄钟 ----------
  let pomoBtn = null, pomoLbl = null, pomoBar = null, pomoBuilt = false, pomoClock = null, pomoTally = null;
  function buildPomoChip(el) {
    const P = D.Pomo;
    if (!P) return;
    pomoBtn = document.createElement('button');
    pomoBtn.className = 'chip';
    pomoBtn.id = 'pomo-chip';
    pomoBtn.title = 'Pomodoro timer — focus, then take a break';
    const c = pixCanvas(pomoBtn, PX.TOMATO_W, PX.TOMATO_H, 2);
    PX.tomato(c, 0, 0, false);
    pomoLbl = document.createElement('span');
    pomoBtn.appendChild(pomoLbl);
    pomoBar = document.createElement('i');
    pomoBtn.appendChild(pomoBar);
    pomoBtn.addEventListener('click', () => UI.togglePanel('pomo'));
    el.appendChild(pomoBtn);
    UI.pomoRefresh();
  }
  // 面板照着常见番茄钟的样子做，一眼只看到四样东西：现在是哪一段、还剩多久、一个大按钮、这一轮的进度。
  // 「重来 / 跳过」只在计时开始以后才出现；时长和提醒那些设置平时收着，点 Settings 才展开
  function renderPomo() {
    const P = D.Pomo, p = document.getElementById('pomo');
    if (!pomoBuilt) {
      pomoBuilt = true;
      const row = (k, label, unit) => '<label class="pm-row"><b>' + label + '</b><input type="number" data-k="' + k +
        '" min="' + P.LIMITS[k][0] + '" max="' + P.LIMITS[k][1] + '"><em>' + (unit || 'min') + '</em></label>';
      p.innerHTML =
        '<div class="pm-head"><b id="pm-phase"></b><button id="pm-gear" title="Settings">Settings</button></div>' +
        '<div class="pm-clock"></div>' +
        '<div class="cc-bar"><i id="pm-fill"></i></div>' +
        '<button class="chip" id="pm-go"></button>' +
        '<div class="pm-sub"><button id="pm-reset">Start over</button><button id="pm-skip"></button></div>' +
        '<div class="pm-cycle"><i id="pm-dots"></i><span id="pm-next"></span></div>' +
        '<div class="pm-today" id="pm-count"></div>' +
        '<div class="pm-set" id="pm-set">' +
        '<p class="hint" id="pm-hint"></p>' +
        row('every', 'Rounds', ' ') + row('focus', 'Focus') + row('short', 'Short break') + row('long', 'Long break') +
        '<label class="pm-check"><input type="checkbox" id="pm-sound"><span>Chime when time is up</span></label>' +
        '<label class="pm-check"><input type="checkbox" id="pm-auto"><span>After a break, start focus automatically</span></label>' +
        '<label class="pm-check"><input type="checkbox" id="pm-notify"><span>Desktop alert when I am in another tab</span></label>' +
        '</div>';
      pomoClock = pixCanvas(p.querySelector('.pm-clock'), 31, 9, 5);
      pomoTally = pixCanvas(p.querySelector('#pm-dots'), 8 * 16, 12, 2);
      p.querySelector('#pm-gear').addEventListener('click', () => p.classList.toggle('settings'));
      p.querySelector('#pm-go').addEventListener('click', () => { P.unlockAudio(); P.toggle(); });
      p.querySelector('#pm-skip').addEventListener('click', () => P.skip());
      p.querySelector('#pm-reset').addEventListener('click', () => P.reset());
      p.querySelectorAll('.pm-row input').forEach(inp => inp.addEventListener('change', () => { P.set(inp.dataset.k, inp.value); inp.value = P.cfg[inp.dataset.k]; }));
      p.querySelector('#pm-sound').addEventListener('change', (e) => {
        P.set('sound', e.target.checked);
        if (e.target.checked) { P.unlockAudio(); P.chime('tick'); }
      });
      p.querySelector('#pm-auto').addEventListener('change', (e) => P.set('autoFocus', e.target.checked));
      p.querySelector('#pm-notify').addEventListener('change', (e) => {
        if (!e.target.checked) { P.set('notify', false); return; }
        P.askNotify().then((ok) => {
          P.set('notify', ok);
          if (!ok) UI.banner('Desktop alerts are blocked', 'Allow notifications for this page in your browser to use them');
        });
      });
    }
    UI.pomoRefresh();
  }
  // 番茄钟的显示全在这里刷新：右上角的小按钮每次都刷，面板开着才刷面板
  UI.pomoRefresh = function () {
    const P = D.Pomo;
    if (!P || !pomoBtn) return;
    const brk = P.phase !== 'focus';
    pomoLbl.textContent = P.active ? P.fmt() : 'Pomodoro';
    pomoBar.style.width = (P.active ? U.clamp(P.progress(), 0, 1) * 100 : 0) + '%';
    pomoBtn.classList.toggle('on', P.running);
    pomoBtn.classList.toggle('brk', P.active && brk);
    pomoBtn.classList.toggle('paused', P.active && !P.running);
    const p = document.getElementById('pomo');
    if (!pomoBuilt || !p.classList.contains('show')) return;
    const every = P.cfg.every, done = P.cycleDone();
    p.classList.toggle('brk', brk);
    p.classList.toggle('active', P.active);
    // 现在是哪一段
    p.querySelector('#pm-phase').textContent = brk ? P.NAMES[P.phase] : 'Focus ' + (done + 1) + ' of ' + every;
    // 像素数字的大钟：专注是番茄红，休息是叶子绿，暂停时变灰
    pomoClock.clearRect(0, 0, 31, 9);
    const txt = P.fmt();
    PX.text(pomoClock, txt, Math.floor((31 - PX.textW(txt)) / 2), 1, !P.running && P.active ? '#A898AE' : brk ? '#4F9E58' : '#D9503F');
    const fill = p.querySelector('#pm-fill');
    fill.style.width = (U.clamp(P.progress(), 0, 1) * 100) + '%';
    fill.style.background = brk ? '#7FC47A' : '#EC6A58';
    // 一个主按钮：开始 → 暂停 → 继续
    p.querySelector('#pm-go').textContent = P.running ? 'Pause' : P.active ? 'Resume' : brk ? 'Start break' : 'Start focus';
    p.querySelector('#pm-skip').textContent = brk ? 'Skip break' : 'Skip to break';
    // 这一轮的进度：做完的是红番茄，没做的是淡淡的影子；旁边一句「接下来是什么」
    // 轮数可以改（1–8）：小画布跟着轮数变宽；超过 5 个番茄大号的放不下，就画小一号
    const tz = every <= 5 ? 2 : 1, tw = every * 16 - 3, tcv = pomoTally.canvas;
    if (tcv.width !== tw * tz || tcv.height !== 12 * tz) {
      tcv.width = tw * tz; tcv.height = 12 * tz;
      tcv.style.width = (tw * tz) + 'px'; tcv.style.height = (12 * tz) + 'px';
    }
    pomoTally.imageSmoothingEnabled = false;
    pomoTally.setTransform(tz, 0, 0, tz, 0, 0);
    pomoTally.clearRect(0, 0, every * 16, 12);
    for (let i = 0; i < every; i++) {
      pomoTally.globalAlpha = i < done ? 1 : 0.22;
      PX.tomato(pomoTally, i * 16, 0, false);
    }
    pomoTally.globalAlpha = 1;
    const nx = P.nextPhase();
    p.querySelector('#pm-next').textContent = 'Next: ' + (nx === 'focus' ? 'focus' : P.cfg[nx] + ' min ' + (nx === 'long' ? 'long break' : 'break'));
    p.querySelector('#pm-count').textContent = P.today
      ? 'Today: ' + P.today + (P.today === 1 ? ' tomato' : ' tomatoes') + (P.all > P.today ? ' · ' + P.all + ' in all' : '')
      : 'No tomatoes yet today';
    p.querySelector('#pm-hint').textContent = 'Focus, then a short break. After ' + every + (every === 1 ? ' round' : ' rounds') +
      ' you get a long break. A round you restart or skip does not count.';
    p.querySelectorAll('.pm-row input').forEach(inp => { if (document.activeElement !== inp) inp.value = P.cfg[inp.dataset.k]; });
    p.querySelector('#pm-sound').checked = !!P.cfg.sound;
    p.querySelector('#pm-auto').checked = !!P.cfg.autoFocus;
    p.querySelector('#pm-notify').checked = !!P.cfg.notify;
  };

  // ---------- 账号面板 ----------
  let accBtn = null, bondEl = null, accT = 0;
  const esc = (s) => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  function refreshAccBtn() {
    if (!accBtn) return;
    const u = D.Account.user();
    accBtn.textContent = u ? u.id + ' · ' + D.Account.fmt(u.seconds || 0) : 'Sign in';
    bondEl.style.display = u ? '' : 'none';
    if (!u) return;
    const b = D.Account.bondInfo();
    document.getElementById('bb-lv').textContent = 'Lv.' + b.lv;
    document.getElementById('bb-title').textContent = b.title;
    document.getElementById('bb-num').textContent = b.max ? 'MAX' : b.cur + ' / ' + b.need;
    document.getElementById('bb-fill').style.width = (b.cur / b.need * 100) + '%';
  }
  function renderAccount(msg) {
    const Acc = D.Account, p = document.getElementById('account'), u = Acc.user();
    if (!u) {
      p.innerHTML =
        '<h3>Your ID</h3>' +
        '<p class="hint">Sign in and the time you spend here builds your bond with both cats. A new ID is registered automatically.</p>' +
        '<form><input id="acc-id" placeholder="ID" maxlength="20" autocomplete="username">' +
        '<input id="acc-pw" type="password" placeholder="Password" autocomplete="current-password">' +
        '<div class="err">' + esc(msg || '') + '</div>' +
        '<button class="chip" type="submit">Sign in / Register</button></form>' +
        '<p class="hint">Your progress follows your ID to any device.</p>';
      p.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = p.querySelector('button[type=submit]');
        if (btn.disabled) return;
        btn.disabled = true; btn.textContent = 'Signing in…';
        const r = await Acc.signIn(p.querySelector('#acc-id').value, p.querySelector('#acc-pw').value);
        if (!r.ok) {
          btn.disabled = false; btn.textContent = 'Sign in / Register';
          p.querySelector('.err').textContent = r.error;
          return;
        }
        refreshAccBtn();
        renderAccount();
        UI.banner(r.created ? 'Welcome, ' + esc(Acc.user().id) : 'Welcome back, ' + esc(Acc.user().id),
          'Time spent here now counts toward your bond');
      });
      return;
    }
    const sec = u.seconds || 0;
    const b = Acc.bondInfo();
    p.innerHTML =
      '<h3>' + esc(u.id) + '</h3>' +
      '<div class="row"><b>Time together</b><span id="acc-time">' + Acc.fmt(sec) + '</span></div>' +
      '<div class="row"><b>Bond</b><span>Lv.' + b.lv + ' · ' + b.title + '</span></div>' +
      '<p class="hint">+1 every 5 seconds here, +5 for each action. A new title every level, up to Lv.10.</p>' +
      '<button class="chip" id="acc-out">Sign out</button>';
    p.querySelector('#acc-out').addEventListener('click', () => { Acc.signOut(); refreshAccBtn(); renderAccount(); });
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
  UI.banner = function (title, sub) {
    const el = document.getElementById('levelup');
    el.innerHTML = title + (sub ? '<small>' + sub + '</small>' : '');
    el.classList.add('show');
    clearTimeout(lvTimer);
    lvTimer = setTimeout(() => el.classList.remove('show'), 3200);
  };
  UI.levelUp = function (lv, catId) {
    UI.banner('Bond Lv.' + lv + ' · ' + St.LEVEL_TITLES[lv - 1],
      'You and ' + D.CATS[catId || St.cat].name + ' grew a little closer');
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

    // 账号按钮上的时长和亲密度进度条一秒刷几次；面板开着就把里面的时长也刷一下
    accT += dt;
    if (accT >= 0.25) {
      accT = 0;
      UI.pomoRefresh();
      if (accBtn) {
        refreshAccBtn();
        const tm = document.getElementById('acc-time');
        if (tm && D.Account.user()) tm.textContent = D.Account.fmt(D.Account.seconds());
      }
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

// 番茄钟，按番茄工作法原本的规矩来：专注 25 分钟 → 短休息 5 分钟，每 4 个番茄换一次长休息（15 分钟）；
// 一个番茄不能拆——中途「重来」或者「跳过」的那一个不算数。时长都能调。
// 只管计时和记数，不碰界面：界面在 ui.js，猫的反应在 main.js（都挂在 Pomo.on 上）。
//
// 时间按系统时钟算（记「几点结束」，不是一帧一帧减）：页面切到后台浏览器不出帧，
// 回来时剩余时间照样是对的；到点的检查放在 Worker 的定时器里，后台标签页也能按时响。
// 进度存在 localStorage：刷新页面接着走；关着页面的时候到点了，下次打开直接算这一段走完。
window.DOLL = window.DOLL || {};
(function (D) {
  'use strict';
  const KEY = 'doll.pomo.v1';
  const MIN = 60000;
  // 三段的时长（分钟），以及 every = 一共做几轮专注换一次长休息
  const LIMITS = { focus: [1, 90], short: [1, 30], long: [1, 60], every: [1, 8] };
  const NAMES = { focus: 'Focus', short: 'Short break', long: 'Long break' };

  const P = {
    // autoFocus：休息完自动开始下一个专注（默认要自己点开始）；休息总是自动开始
    cfg: { focus: 25, short: 5, long: 15, every: 4, sound: true, autoFocus: false, notify: false },
    phase: 'focus',     // 现在（或者接下来要开始的）是哪一段：focus | short | long
    active: false,      // 这一段已经开始了（在走，或者暂停在半路）
    running: false,     // 正在走
    endAt: 0,           // 正在走的时候：几点结束（毫秒时间戳）
    left: 25 * MIN,     // 没在走的时候：还剩多少毫秒
    total: 25 * MIN,    // 这一段一共多长
    round: 0,           // 这一轮已经完成了几个番茄（到 every 个就长休息）
    day: '', today: 0, all: 0,   // 今天完成了几个、一共完成了几个
    on: null,           // (evt, data) => {}   evt: start | resume | pause | reset | skip | focusDone | breakDone | half | lastMinute | change
    NAMES: NAMES, LIMITS: LIMITS
  };

  P.now = function () { return Date.now(); };          // 测试时可以换掉
  const dayStr = () => { const d = new Date(P.now()); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  const dur = (ph) => (P.cfg[ph] || 1) * MIN;
  function emit(evt, data) { if (P.on) { try { P.on(evt, data); } catch (e) { /* 界面出错不能把计时带崩 */ } } }

  let mem = null;
  function save() {
    const blob = JSON.stringify({
      cfg: P.cfg, phase: P.phase, active: P.active, running: P.running, endAt: P.endAt,
      left: P.left, total: P.total, round: P.round, day: P.day, today: P.today, all: P.all
    });
    try { localStorage.setItem(KEY, blob); } catch (e) { mem = blob; }
  }
  P.save = save;

  function rollDay() {
    const d = dayStr();
    if (P.day !== d) { P.day = d; P.today = 0; }
  }

  P.remaining = function () { return P.running ? Math.max(0, P.endAt - P.now()) : P.left; };
  P.progress = function () { return P.total > 0 ? 1 - P.remaining() / P.total : 0; };
  // 「24:59」；超过 99 分钟也照样显示分钟数
  P.fmt = function (ms) {
    const s = Math.ceil((ms == null ? P.remaining() : ms) / 1000);
    const m = Math.floor(s / 60), r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  };
  P.label = function () { return NAMES[P.phase]; };
  // 这一轮（every 个番茄一轮）里已经完成了几个：专注时是 0..every-1；休息时把刚完成的那个也算上（1..every）
  P.cycleDone = function () {
    const e = P.cfg.every, r = P.round % e;
    if (P.phase === 'focus') return r;
    return r === 0 && P.round > 0 ? e : r;
  };
  // 现在这一段走完以后接着是什么（给界面上那句「接下来…」用）
  P.nextPhase = function () {
    if (P.phase !== 'focus') return 'focus';
    return (P.round + 1) % P.cfg.every === 0 ? 'long' : 'short';
  };

  let marks = {};       // 这一段里已经报过的节点（过半、最后一分钟）
  function arm(ph, autostart) {
    P.phase = ph;
    P.total = dur(ph);
    P.left = P.total;
    P.active = !!autostart;
    P.running = !!autostart;
    P.endAt = autostart ? P.now() + P.total : 0;
    marks = {};
  }

  P.start = function () {
    if (P.running) return;
    rollDay();
    const fresh = !P.active;
    if (fresh) { P.total = dur(P.phase); P.left = P.total; marks = {}; }
    P.active = true;
    P.running = true;
    P.endAt = P.now() + P.left;
    save();
    emit(fresh ? 'start' : 'resume', P.phase);
    emit('change');
  };
  P.pause = function () {
    if (!P.running) return;
    P.left = P.remaining();
    P.running = false;
    save();
    emit('pause', P.phase);
    emit('change');
  };
  P.toggle = function () { if (P.running) P.pause(); else P.start(); };
  // 这一段从头来（不换段）
  P.reset = function () {
    arm(P.phase, false);
    save();
    emit('reset', P.phase);
    emit('change');
  };
  // 跳过这一段：专注 → 直接去短休息（这个番茄不算，也不占这一轮的位置）；休息 → 回到专注。都停在「等你点开始」
  P.skip = function () {
    const from = P.phase;
    if (from === 'long') P.round = 0;
    arm(from === 'focus' ? 'short' : 'focus', false);
    save();
    emit('skip', from);
    emit('change');
  };
  // 没开始的时候可以直接挑从哪一段开始
  P.setPhase = function (ph) {
    if (P.active || !NAMES[ph]) return;
    arm(ph, false);
    save();
    emit('change');
  };
  P.set = function (key, val) {
    if (LIMITS[key]) {
      const v = Math.max(LIMITS[key][0], Math.min(LIMITS[key][1], Math.round(+val) || LIMITS[key][0]));
      P.cfg[key] = v;
      if (!P.active && P.phase === key) { P.total = dur(key); P.left = P.total; }
    } else if (key in P.cfg) {
      P.cfg[key] = val;
    }
    save();
    emit('change');
  };

  // 这一段走完了。away = 是关着页面的时候到点的（不响、不自动接下一段）
  function complete(away) {
    const from = P.phase;
    if (from === 'focus') {
      rollDay();
      P.today++; P.all++; P.round++;
      const next = P.round % P.cfg.every === 0 ? 'long' : 'short';
      arm(next, !away);
      save();
      if (!away) { P.chime('focus'); notify('Focus complete — time for a break!', 'Luna & Nova are waiting for you.'); }
      emit('focusDone', { away: !!away, today: P.today, next: next });
    } else {
      if (from === 'long') P.round = 0;
      arm('focus', !away && P.cfg.autoFocus);
      save();
      if (!away) { P.chime('break'); notify('Break is over', 'Ready for the next focus round?'); }
      emit('breakDone', { away: !!away, from: from });
    }
    emit('change');
  }

  // 定时检查：到点了没有、过半 / 最后一分钟的提醒、标题栏上的倒计时
  P.check = function () {
    if (P.running) {
      const left = P.endAt - P.now();
      if (left <= 0) complete(false);
      else if (P.phase === 'focus') {
        if (!marks.half && P.total >= 4 * MIN && left <= P.total / 2) { marks.half = true; emit('half'); }
        if (!marks.last && P.total >= 4 * MIN && left <= MIN) { marks.last = true; emit('lastMinute'); }
      }
    }
    const title = P.active ? P.fmt() + ' · ' + NAMES[P.phase] + (P.running ? '' : ' (paused)') + ' — Cat House' : 'Cat House';
    if (document.title !== title) document.title = title;
  };

  // ---------- 提示音（WebAudio 合成的小铃声，不用音频文件）----------
  let ac = null;
  // 浏览器要求先有一次点击才让出声：点「开始」的时候顺手解锁
  P.unlockAudio = function () {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = ac || new AC();
      if (ac.state === 'suspended') ac.resume();
    } catch (e) { ac = null; }
  };
  function bell(freq, at, len, vol) {
    for (const [mul, v] of [[1, 1], [2, 0.35], [3, 0.12]]) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine';
      o.frequency.value = freq * mul;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol * v, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      o.connect(g); g.connect(ac.destination);
      o.start(at); o.stop(at + len + 0.05);
    }
  }
  // kind: focus = 专注结束（往上走的四个音）；break = 休息结束（两声）；tick = 试听
  P.chime = function (kind) {
    if (!P.cfg.sound || !ac) return;
    try {
      const t = ac.currentTime + 0.03;
      const notes = kind === 'focus' ? [[784, 0], [988, 0.16], [1175, 0.32], [1568, 0.52]]
        : kind === 'break' ? [[1175, 0], [880, 0.22]]
        : [[1175, 0]];
      for (const n of notes) bell(n[0], t + n[1], kind === 'focus' ? 0.9 : 0.6, 0.14);
    } catch (e) { /* 出不了声就算了 */ }
  };

  // ---------- 桌面通知（要先在面板里打开，浏览器会问一次权限）----------
  function notify(title, body) {
    if (!P.cfg.notify || !document.hidden) return;
    try {
      if (window.Notification && Notification.permission === 'granted') new Notification(title, { body: body });
    } catch (e) { /* 有的环境（比如直接打开本地文件）不让发通知 */ }
  }
  // 打开通知：返回 Promise<是否真的打开了>
  P.askNotify = function () {
    try {
      if (!window.Notification) return Promise.resolve(false);
      if (Notification.permission === 'granted') return Promise.resolve(true);
      if (Notification.permission === 'denied') return Promise.resolve(false);
      return Promise.resolve(Notification.requestPermission()).then(r => r === 'granted', () => false);
    } catch (e) { return Promise.resolve(false); }
  };

  // ---------- 读档 ----------
  function load() {
    let blob = null;
    try { blob = localStorage.getItem(KEY); } catch (e) { blob = mem; }
    if (blob) {
      try {
        const o = JSON.parse(blob);
        if (o.cfg) for (const k in P.cfg) if (o.cfg[k] != null) P.cfg[k] = o.cfg[k];
        for (const k in LIMITS) P.cfg[k] = Math.max(LIMITS[k][0], Math.min(LIMITS[k][1], +P.cfg[k] || LIMITS[k][0]));
        if (NAMES[o.phase]) P.phase = o.phase;
        P.active = !!o.active; P.running = !!o.running;
        P.endAt = +o.endAt || 0;
        P.total = +o.total > 0 ? +o.total : dur(P.phase);
        P.left = +o.left >= 0 ? Math.min(+o.left, P.total) : P.total;
        P.round = +o.round || 0;
        P.day = o.day || ''; P.today = +o.today || 0; P.all = +o.all || 0;
      } catch (e) { /* 存档坏了就用默认的 */ }
    }
    rollDay();
    if (!P.active) { P.running = false; P.total = dur(P.phase); P.left = P.total; }
    // 关着页面的时候到点了：这一段算走完，停在下一段等着
    if (P.running && P.endAt <= P.now()) complete(true);
  }

  // 到点检查放在 Worker 里：后台标签页的普通定时器会被浏览器压到一分钟一次，Worker 里的不会
  function startTicker() {
    const tick = () => P.check();
    let fell = false;
    const fallback = () => { if (!fell) { fell = true; setInterval(tick, 500); } };
    try {
      const url = URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},500)'], { type: 'text/javascript' }));
      const w = new Worker(url);
      w.onmessage = tick;
      w.onerror = () => { try { w.terminate(); } catch (e) { /* 无所谓 */ } fallback(); };
    } catch (e) { fallback(); }
  }

  load();
  if (!(D.TEST && D.TEST.noTicker)) startTicker();

  D.Pomo = P;
})(window.DOLL);

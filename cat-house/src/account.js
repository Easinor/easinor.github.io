// 账号：记一个 ID + 密码，登录着的时候在这个网页上待多久都记下来。
// 亲密度跟着账号走、两只猫共用一条进度条：每待 5 秒 +1，每做一次底下的动作 +5。
// 第 1 级要攒 100 点，之后每级翻一倍（100、200、400…）；10 级满级，每一级一个称号。
//
// 账号存在 Supabase（表和函数见 supabase/schema.sql）。网页只拿着 publishable key，
// 不能直接读写表，只能调那几个函数；密码在数据库里是 bcrypt 哈希。
// 浏览器这边只存一个登录令牌和最近一次的进度（断网时也能接着攒，连上再补报）。
window.DOLL = window.DOLL || {};
(function (D) {
  'use strict';
  // publishable key 本来就是给网页公开用的，可以放在仓库里。service_role key 绝对不能放这儿
  const SB_URL = 'https://konatfnasaarrybbrqoy.supabase.co';
  const SB_KEY = 'sb_publishable_f8UGlJFaQaTSk4HCrkT67A_TuayrkSI';

  const KEY = 'doll.session.v1';
  const TICK_SEC = 5;        // 每待这么多秒 +1
  const ACTION_BOND = 5;     // 每个动作 +5
  const FIRST_NEED = 100;    // 第 1 级的进度条长度，之后每级翻倍
  const MAX_LEVEL = 10;      // 10 级满级，每一级一个称号
  const SYNC_SEC = 15;       // 每隔这么久往服务器报一次进度
  const TITLES = ['First Meeting', 'Familiar Face', 'Comes Closer', 'Cuddle Buddy', 'Personal Scooper',
    'Inseparable', 'In Sync', 'Best Friends', 'For Life', 'Meant to Be'];

  const Acc = {
    // 陪伴时长的里程碑（小时）。之后可以按 Acc.tier() 解锁不同的动作
    MILESTONES: [1, 2, 5, 10],
    onMilestone: null,   // (hours) => {}
    onLevelUp: null,     // (level, title) => {}
    onChange: null       // () => {}  登录状态变了（比如令牌失效被登出）
  };
  Acc.ACTION_BOND = ACTION_BOND;

  // me = { token, id, seconds, bond }；没登录是 null
  let me = null;
  let mem = null, bondAcc = 0, syncAcc = 0, syncing = false;

  function loadLocal() {
    let blob = null;
    try { blob = localStorage.getItem(KEY); } catch (e) { blob = mem; }
    if (!blob) return;
    try {
      const o = JSON.parse(blob);
      if (o && o.token && o.id) me = { token: o.token, id: o.id, seconds: +o.seconds || 0, bond: +o.bond || 0 };
    } catch (e) { /* 存档坏了就当没登录 */ }
  }
  function saveLocal() {
    const blob = me ? JSON.stringify(me) : '';
    try { if (me) localStorage.setItem(KEY, blob); else localStorage.removeItem(KEY); } catch (e) { mem = blob || null; }
  }

  async function rpc(fn, args, keepalive) {
    const r = await fetch(SB_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SB_KEY },
      body: JSON.stringify(args),
      keepalive: !!keepalive
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  Acc.user = function () { return me; };
  Acc.seconds = function () { return me ? me.seconds || 0 : 0; };
  Acc.hours = function () { return Acc.seconds() / 3600; };
  // 已经到了第几个里程碑：0 = 还没到 1 小时，4 = 满 10 小时
  Acc.tier = function () {
    const h = Acc.hours();
    let n = 0;
    for (const m of Acc.MILESTONES) if (h >= m) n++;
    return n;
  };
  Acc.fmt = function (sec) {
    const m = Math.floor(sec / 60), h = Math.floor(m / 60);
    return h ? h + 'h ' + (m % 60) + 'm' : m + 'm';
  };

  // 亲密度：总点数 → 第几级、这一级攒了多少 / 要多少、称号
  Acc.bondInfo = function () {
    let left = (me && me.bond) || 0, lv = 1, need = FIRST_NEED;
    while (lv < MAX_LEVEL && left >= need) { left -= need; need *= 2; lv++; }
    const max = lv >= MAX_LEVEL;
    return { lv: lv, cur: max ? need : Math.floor(left), need: need, max: max, title: TITLES[lv - 1] };
  };
  // 没登录就不记。返回是否加上了
  Acc.addBond = function (n) {
    if (!me) return false;
    const before = Acc.bondInfo();
    me.bond = (me.bond || 0) + n;
    const after = Acc.bondInfo();
    if (after.lv > before.lv && Acc.onLevelUp) Acc.onLevelUp(after.lv, after.title);
    return true;
  };
  Acc.addAction = function () { return Acc.addBond(ACTION_BOND); };

  // ID 没见过就注册，见过就核对密码（都在服务器上做）。返回 { ok, created, error }
  Acc.signIn = async function (id, pw) {
    id = String(id || '').trim();
    pw = String(pw || '');
    if (id.length < 2 || id.length > 20) return { ok: false, error: 'ID must be 2–20 characters' };
    if (pw.length < 4 || pw.length > 72) return { ok: false, error: 'Password must be 4–72 characters' };
    let r;
    try { r = await rpc('cat_sign_in', { p_id: id, p_password: pw }); }
    catch (e) { return { ok: false, error: 'Cannot reach the server. Try again in a moment.' }; }
    if (!r || !r.ok) return { ok: false, error: (r && r.error) || 'Sign-in failed' };
    me = { token: r.token, id: r.id, seconds: r.seconds || 0, bond: r.bond || 0 };
    bondAcc = 0; syncAcc = 0;
    saveLocal();
    return { ok: true, created: !!r.created };
  };
  Acc.signOut = function () {
    if (!me) return;
    const token = me.token, seconds = Math.floor(me.seconds), bond = Math.floor(me.bond);
    me = null;
    saveLocal();
    // 先把最后一点进度报上去，再作废令牌；失败了也不拦着退出
    rpc('cat_save', { p_token: token, p_seconds: seconds, p_bond: bond })
      .catch(() => {}).then(() => rpc('cat_sign_out', { p_token: token })).catch(() => {});
  };

  // 往服务器报进度。服务器只增不减，所以拿回来的数比本地大（别的设备上攒的）就用服务器的
  function push(keepalive) {
    if (!me || syncing) return;
    const token = me.token;
    syncing = true;
    rpc('cat_save', { p_token: token, p_seconds: Math.floor(me.seconds), p_bond: Math.floor(me.bond) }, keepalive)
      .then((r) => {
        if (!me || me.token !== token) return;
        if (r && r.ok) {
          me.seconds = Math.max(me.seconds, r.seconds || 0);
          me.bond = Math.max(me.bond, r.bond || 0);
          saveLocal();
        } else if (r && r.ok === false) {
          // 令牌失效（比如在后台把这个用户删了）：登出
          me = null; saveLocal();
          if (Acc.onChange) Acc.onChange();
        }
      })
      .catch(() => { /* 断网：本地接着攒，下次再报 */ })
      .then(() => { syncing = false; });
  }
  // main.js 在关页面 / 切到后台时会调：本地存一份，再趁页面还在把进度报上去
  Acc.save = function () {
    if (!me) return;
    saveLocal();
    push(true);
  };

  // 每帧：登录着就累计时长（页面切到后台时浏览器不出帧，自然就不算）
  Acc.tick = function (dt) {
    if (!me) return;
    const before = me.seconds || 0;
    me.seconds = before + dt;
    for (const m of Acc.MILESTONES) {
      if (before < m * 3600 && me.seconds >= m * 3600 && Acc.onMilestone) Acc.onMilestone(m);
    }
    bondAcc += dt;
    while (bondAcc >= TICK_SEC) { bondAcc -= TICK_SEC; Acc.addBond(1); }
    syncAcc += dt;
    if (syncAcc >= SYNC_SEC) { syncAcc = 0; saveLocal(); push(false); }
  };

  // 启动：浏览器里有令牌就先用存着的进度顶上，再问服务器要最新的
  loadLocal();
  if (me) {
    const token = me.token;
    rpc('cat_resume', { p_token: token }).then((r) => {
      if (!me || me.token !== token) return;
      if (r && r.ok) {
        me.id = r.id;
        me.seconds = Math.max(me.seconds, r.seconds || 0);
        me.bond = Math.max(me.bond, r.bond || 0);
        saveLocal();
      } else if (r && r.ok === false) {
        me = null; saveLocal();
      }
      if (Acc.onChange) Acc.onChange();
    }).catch(() => { /* 断网：先用本地存的 */ });
  }

  D.Account = Acc;
})(window.DOLL);

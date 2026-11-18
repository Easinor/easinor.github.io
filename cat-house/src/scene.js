// 像素房间：墙、窗（天色跟真实时间走）、地板、地毯、猫窝、猫砂盆、饭碗、盆栽
window.DOLL = window.DOLL || {};
(function (D) {
  'use strict';
  const U = D.U, PX = D.PX;
  const S = {};

  S.clouds = [];
  S.birds = [];

  S.init = function () {
    S.clouds = [];
    for (let i = 0; i < 4; i++) {
      S.clouds.push({ x: U.rnd(0, 1), y: U.rnd(.12, .5), s: U.rnd(0, 1) < .5 ? 0 : 1, v: U.rnd(.006, .016) });
    }
    S.birds = [];
  };

  // ---------- 天色 ----------
  const RAMP = [
    // 夜 → 清晨（粉紫的鱼肚白，太阳从左边升起来）→ 白天 → 黄昏（金色到橙红的晚霞，太阳落到右边）→ 夜
    { h: 0, a: '#141A3C', b: '#2B2652', star: 1 },
    { h: 4.6, a: '#1C2148', b: '#3A3060', star: .9 },
    { h: 5.5, a: '#3B4680', b: '#C98AA0', star: .3 },      // 清晨开始：天边泛粉
    { h: 6.4, a: '#6F9AD6', b: '#F6C6B0', star: 0 },       // 日出
    { h: 7.6, a: '#7FB2E6', b: '#F7E2C4', star: 0 },       // 清晨的淡金色
    { h: 9.5, a: '#79B8EA', b: '#CFEAF7', star: 0 },
    { h: 16, a: '#6FB0E6', b: '#D7E9F6', star: 0 },
    { h: 17.4, a: '#6C9CDA', b: '#F7DDB0', star: 0 },      // 黄昏开始：金色
    { h: 18.5, a: '#5C66B0', b: '#F2A27C', star: 0 },      // 日落：橙红的晚霞
    { h: 19.3, a: '#3A3C7C', b: '#B06A8E', star: .3 },     // 太阳下山后的一抹紫红，天黑了
    { h: 20.3, a: '#20285A', b: '#4E3E6E', star: .85 },
    { h: 24, a: '#141A3C', b: '#2B2652', star: 1 }
  ];
  const SUNRISE = 5.7, SUNSET = 19.2;
  function mixHex(h1, h2, t) {
    const p = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const A = p(h1), B = p(h2);
    return `rgb(${Math.round(U.lerp(A[0], B[0], t))},${Math.round(U.lerp(A[1], B[1], t))},${Math.round(U.lerp(A[2], B[2], t))})`;
  }
  S.skyOf = function (hour) {
    let a = RAMP[0], b = RAMP[RAMP.length - 1];
    for (let i = 0; i < RAMP.length - 1; i++) {
      if (hour >= RAMP[i].h && hour <= RAMP[i + 1].h) { a = RAMP[i]; b = RAMP[i + 1]; break; }
    }
    const k = U.clamp(U.invLerp(a.h, b.h, hour), 0, 1);
    const star = U.lerp(a.star, b.star, k);
    // bands：从天顶到地平线分 6 段慢慢过渡。只分上下两段的话，日出日落时下半截就是一整块橙色，看不出是晚霞
    const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const mix = (A, B, q) => A.map((v, i) => Math.round(U.lerp(v, B[i], q)));
    const top = mix(rgb(a.a), rgb(b.a), k), bot = mix(rgb(a.b), rgb(b.b), k);
    const bands = [];
    for (let i = 0; i < 6; i++) bands.push('rgb(' + mix(top, bot, Math.pow(i / 5, 1.6)).join(',') + ')');
    // sun：太阳在天上走到哪了，0 = 刚日出、1 = 日落；不在天上时是 null
    const sun = hour > SUNRISE && hour < SUNSET ? (hour - SUNRISE) / (SUNSET - SUNRISE) : null;
    return { top: mixHex(a.a, b.a, k), bot: mixHex(a.b, b.b, k), bands: bands, star: star, night: star > .3, sun: sun };
  };

  // ---------- 布局（全部是虚拟像素）----------
  S.layout = function (VW, VH) {
    const floorY = Math.round(VH * 0.74);
    // 窗户右边留出一幅窗帘的位置（不然右边那幅窗帘在屏幕外面）
    const winW = Math.round(Math.min(VW * 0.40, 104, VW - Math.round(VW * 0.60) - 13));
    const winH = Math.round(Math.min(VH * 0.46, 68));
    const catY = floorY + Math.round((VH - floorY) * 0.26);   // 猫踩的那一排地面
    const litter = { x: Math.round(Math.min(VW - 42, VW * 0.85)), y: floorY + 7 };
    const wheelX = Math.round(Math.max(36, VW * 0.17));
    return {
      W: VW, H: VH, floorY: floorY, catY: catY,
      win: { x: Math.round(VW * 0.60), y: Math.round(VH * 0.13), w: winW, h: winH },
      // 三层猫爬架：两层小平台 + 顶上的大垫子（数值是平台面的 y，猫的脚就踩在这）
      // 猫爬架贴着窗户左边放（宽 58、高 70）。spots = 猫能落脚的三个地方，从低到高（数值是台面的 y，猫的脚就踩在这）：
      // 猫屋的屋顶、左边的跳板、最顶上的软垫。link = 能和窗台互相跳的那一个（屋顶）
      tree: (function () {
        const tx = Math.max(40, Math.round(VW * 0.60) - 26);
        return {
          x: tx, link: 0,
          spots: [{ x: tx + 14, y: floorY - 31 }, { x: tx - 17, y: floorY - 46 }, { x: tx + 14, y: floorY - 70 }]
        };
      })(),
      // 窗台：猫趴在窗台上看风景；上去要先跳到砂盆的靠背上（step），再跳上窗台
      sill: { x: Math.round(VW * 0.60 + winW * 0.42), y: Math.round(VH * 0.13) + winH + 5 },
      step: { x: litter.x - 2, y: litter.y - 23 },
      // 猫跑轮：靠墙立着，跑道内圈底部就是猫踩的地方
      wheel: { x: wheelX, r: 33, ri: 29, cy: catY - 32, runY: catY - 2 },
      // 猫窝在左下角、纸箱在右下角：都在猫平时走不到的最前面，猫要跳进去
      bed: { x: Math.round(Math.max(36, VW * 0.13)), y: VH - 4 },
      box: { x: Math.round(VW - Math.max(27, VW * 0.10)), y: VH - 5 },
      litter: litter,
      bowl: { x: Math.round(Math.max(88, VW * 0.42)), y: floorY + 10 }   // 碗放在地上，离墙根留一点
    };
  };

  // ---------- 窗 ----------
  // 窗外的三套风景：点一下窗户换一套
  const VIEWS = ['mountain', 'city', 'village'];
  const VIEW_NAMES = { mountain: 'Snow Mountains', city: 'City', village: 'Village' };
  S.viewNow = function () {
    const v = D.St && D.St.settings && D.St.settings.view;
    return VIEWS.indexOf(v) >= 0 ? v : 'mountain';
  };
  S.nextView = function () {
    const v = VIEWS[(VIEWS.indexOf(S.viewNow()) + 1) % VIEWS.length];
    D.St.settings.view = v;
    return VIEW_NAMES[v];
  };
  S.hitWindow = function (L, x, y) {
    const w = L.win;
    return x >= w.x && x < w.x + w.w && y >= w.y && y < w.y + w.h;
  };

  // 雪山：几座又宽又尖的大山，山体是被太阳照成橙红的岩面（一侧亮橙、一侧深橙红，带斜着的色块），
  // 山顶一截冰蓝的雪盖、下沿参差；山前两排深紫色的冷杉剪影，最底下一条雪地。
  // 这一幅是逐像素画的，画一次存成小画布，之后每帧直接贴（窗户大小或昼夜变了才重画）
  const mountain = { key: '', cv: null };
  function buildMountain(W, H, N) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const c = (day, night) => (N ? night : day);
    const dot = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    const rockL = c('#F7A254', '#4A4478'), rockD = c('#EC6A40', '#383262');
    const rockLd = c('#F08A48', '#423C6E'), rockDl = c('#F2824A', '#403A6C');
    const snowL = c('#EEF5FC', '#A9B6DC'), snowD = c('#A9C4E2', '#7482AE');
    // [峰顶的横向位置, 高度（占窗高）, 坡度]
    const peaks = [[0.10, 0.50, 0.95], [0.33, 0.44, 1.05], [0.57, 0.80, 0.92], [0.92, 0.52, 1.0]];
    for (let i = 0; i < W; i++) {
      let h = 0, pk = -1;
      for (let k = 0; k < peaks.length; k++) {
        const v = peaks[k][1] * H - Math.abs(i - peaks[k][0] * W) * peaks[k][2];
        if (v > h) { h = v; pk = k; }
      }
      h = Math.round(h);
      if (h <= 0 || pk < 0) continue;
      const top = peaks[pk][1] * H, px = peaks[pk][0] * W;
      for (let e = h - 1; e >= 0; e--) {            // e = 这个像素离地多高
        const depth = top - e;                       // 离峰顶往下多远
        // 山脊线从峰顶往下稍稍偏右、带点折：左边向阳、右边背阴
        const lit = i < px + depth * 0.18 + 2 * Math.sin(depth * 0.45 + pk);
        // 雪盖：峰顶往下约三成，下沿一齿一齿的
        const capEdge = top * 0.30 + 2.5 * Math.sin(i * 0.8 + pk * 2) + (U.hash(i * 2.1 + pk * 9) > 0.7 ? 3 : 0);
        let col;
        if (depth < capEdge) col = lit ? snowL : snowD;
        else {
          // 岩面上斜着的色块
          const band = Math.floor((i * (lit ? 0.9 : -0.9) + e * 1.1) / 6);
          const patch = U.hash(band * 5.3 + pk * 17 + (lit ? 0 : 40));
          col = lit ? (patch > 0.62 ? rockLd : rockL) : (patch > 0.7 ? rockDl : rockD);
        }
        dot(i, H - 1 - e, 1, 1, col);
      }
    }
    // 冷杉剪影：一层一层越往下越宽
    const fir = (x, ground, hgt, col) => {
      dot(x, ground - 2, 1, 2, col);
      for (let r = 0; r < hgt; r++) {
        const tier = r % 4, grow = Math.floor(r / 4);
        const half = Math.min(1 + grow + Math.floor(tier * 0.75), 1 + Math.floor(hgt / 3.2));
        dot(x - half, ground - 2 - hgt + r, half * 2 + 1, 1, col);
      }
      dot(x, ground - 3 - hgt, 1, 1, col);
    };
    const ground = H - 4;
    for (let k = 0, x = 2; x < W; k++, x += 6 + Math.floor(U.hash(k * 3.9 + 1) * 6)) {      // 后排：高一些、颜色浅一点
      fir(x, ground, 11 + Math.floor(U.hash(k * 7.3 + 2) * 9), c('#4A3C84', '#221E4A'));
    }
    for (let k = 0, x = 5; x < W; k++, x += 5 + Math.floor(U.hash(k * 5.1 + 8) * 6)) {      // 前排：矮一些、更深
      fir(x, ground + 1, 7 + Math.floor(U.hash(k * 8.7 + 5) * 6), c('#2E2259', '#141230'));
    }
    // 雪地：一条白，边上冒几撮雪里的草尖
    dot(0, ground, W, H - ground, c('#F6FAFE', '#5A6490'));
    dot(0, ground, W, 1, c('#DCE8F6', '#48527C'));
    for (let x = 1; x < W; x += 3) if (U.hash(x * 1.7) > 0.45) dot(x, ground - 1, 1, 1, c('#F6FAFE', '#5A6490'));
    return cv;
  }
  function viewMountain(ctx, w, t, N) {
    const key = w.w + 'x' + w.h + (N ? 'n' : 'd');
    if (mountain.key !== key) { mountain.key = key; mountain.cv = buildMountain(w.w, w.h, N); }
    ctx.drawImage(mountain.cv, w.x, w.y);
  }

  // 高楼大厦：照着纽约曼哈顿的天际线画，前后三层。
  //   远处：一排淡淡的楼影；
  //   中间：几栋认得出来的楼——克莱斯勒大厦（一层层收上去的尖冠 + 细针）、帝国大厦（层层往里收的台阶 + 尖顶）、
  //         一栋又细又高的住宅楼、世贸一号楼（越往上越窄的玻璃塔 + 天线），中间用带退台的普通高楼填满；
  //   近处：一排深色的矮楼，楼顶上是纽约特有的木头水塔。
  // 白天窗户只是玻璃、一动不动；只有晚上才亮灯，而且每隔 3–5 秒用随机数挑一扇窗，开着的关掉、关着的打开。
  // 晚上尖顶上有一闪一闪的红色航空灯；帝国大厦和克莱斯勒的楼冠和楼身一样是深色的，只是那几层的窗一直亮着（偏白的暖光）。
  // 每栋楼 = 几个摞起来的方块 rects: [左边 x, 顶离地多高, 宽, 高, 种类]（种类：0 楼身 / 1 楼冠 / 2 水塔 / 3 天线）
  const city = { key: '', layers: [], wins: [], beacons: [], next: 0 };
  function buildCity(w) {
    const W = w.w, H = w.h;
    city.layers = [[], [], []]; city.wins = []; city.beacons = [];
    // 摞方块：tiers = [[宽, 从多高, 到多高（占这栋楼总高的比例）, 种类]…]，都以 cx 为中线
    const tower = (layer, cx, total, tiers, p, seed) => {
      const b = { rects: [], wins: [] };
      for (const t of tiers) {
        const y0 = Math.round(total * t[1]), y1 = Math.round(total * t[2]);
        if (y1 <= y0) continue;
        const x = Math.round(cx - t[0] / 2);
        b.rects.push([x, y1, t[0], y1 - y0, t[3] || 0]);
        if (t[3] === 3 || t[0] < 3) continue;               // 天线、细针上没有窗
        for (let yy = y0 + 2; yy < y1; yy += 3) {
          for (let xx = x + 1; xx < x + t[0] - 1; xx += 2) {
            // glass：白天这一格画不画成浅色玻璃（固定）；lit：晚上这扇窗现在亮不亮（会变）
            // 楼冠（种类 1）上的窗晚上一直亮着，不参加随机开关
            const top = t[3] === 1;
            const win = { x: xx, dy: yy, glass: U.hash(seed + xx * 1.9 + yy * 3.7) < 0.55, lit: top || Math.random() < p, top: top };
            b.wins.push(win);
            if (!top) city.wins.push(win);
          }
        }
      }
      city.layers[layer].push(b);
      return b;
    };
    const beacon = (cx, h) => city.beacons.push({ x: Math.round(cx - 0.5), dy: h, ph: city.beacons.length * 1.7 });

    // 远处的楼影：矮一些、挨得紧
    for (let x = -2, k = 0; x < W; k++) {
      const bw = 5 + Math.floor(U.hash(11 + k * 1.3) * 6);
      tower(0, x + bw / 2, Math.round((0.22 + U.hash(11 + k * 2.7) * 0.26) * H), [[bw, 0, 1]], 0.22, 11 + k * 9.3);
      x += bw;
    }
    // 中间：先用带退台的普通高楼把空填上，再把几栋地标立在前面
    for (let x = -3, k = 0; x < W; k++) {
      const bw = 7 + Math.floor(U.hash(47 + k * 1.3) * 6);
      const hh = Math.round((0.30 + U.hash(47 + k * 2.7) * 0.24) * H);
      const step = U.hash(47 + k * 5.1) > 0.45;
      tower(1, x + bw / 2, hh, step ? [[bw, 0, 0.78], [Math.max(3, bw - 4), 0.78, 1]] : [[bw, 0, 1]], 0.34, 47 + k * 9.3);
      x += bw + (U.hash(47 + k * 3.3) > 0.6 ? 1 : 0);
    }
    const hC = Math.round(H * 0.74), hE = Math.round(H * 0.88), hS = Math.round(H * 0.70), hW = Math.round(H * 0.80);
    // 克莱斯勒大厦
    const xC = W * 0.15;
    tower(1, xC, hC, [[9, 0, 0.60], [7, 0.60, 0.68], [7, 0.68, 0.73, 1], [5, 0.73, 0.79, 1], [3, 0.79, 0.85, 1], [1, 0.85, 1, 3]], 0.42, 201);
    beacon(xC, hC);
    // 帝国大厦
    const xE = W * 0.40;
    tower(1, xE, hE, [[13, 0, 0.48], [11, 0.48, 0.60], [9, 0.60, 0.72], [5, 0.72, 0.82, 1], [3, 0.82, 0.88, 1], [1, 0.88, 1, 3]], 0.42, 301);
    beacon(xE, hE);
    // 细高的住宅楼
    tower(1, W * 0.61, hS, [[4, 0, 1]], 0.45, 401);
    // 世贸一号楼
    const xW = W * 0.82;
    tower(1, xW, hW, [[9, 0, 0.34], [7, 0.34, 0.66], [5, 0.66, 0.84], [1, 0.84, 1, 3]], 0.42, 501);
    beacon(xW, hW);
    // 近处的矮楼：楼顶隔一栋有一个木水塔（两条细腿 + 圆桶 + 尖盖）
    for (let x = -4, k = 0; x < W; k++) {
      const bw = 9 + Math.floor(U.hash(83 + k * 1.3) * 7);
      const hh = Math.round((0.12 + U.hash(83 + k * 2.7) * 0.14) * H);
      const b = tower(2, x + bw / 2, hh, [[bw, 0, 1]], 0.4, 83 + k * 9.3);
      if (U.hash(83 + k * 4.4) > 0.4) {
        const tx = x + 2 + Math.floor(U.hash(83 + k * 6.1) * Math.max(1, bw - 6));
        b.rects.push([tx, hh + 2, 1, 2, 3], [tx + 2, hh + 2, 1, 2, 3], [tx, hh + 5, 3, 3, 2], [tx + 1, hh + 6, 1, 1, 2]);
      }
      x += bw;
    }
  }
  function viewCity(ctx, w, t, N) {
    const base = w.y + w.h;
    const key = w.w + 'x' + w.h;
    if (city.key !== key) { city.key = key; buildCity(w); }
    if (N && t >= city.next && city.wins.length) {
      const pick = city.wins[Math.floor(Math.random() * city.wins.length)];
      pick.lit = !pick.lit;
      city.next = t + U.rnd(3, 5);
    }
    // 每一层：楼身、楼身左侧的一道亮边、窗（白天是玻璃 / 晚上是灯）、楼冠、水塔。
    // 晚上越近的一层越黑：远处的楼影比夜空亮一点（城市的光晕），中间的地标比夜空暗，剪影才看得出形状
    const cols = [
      { wall: N ? '#2A3358' : '#C2CFE2', edge: N ? '#2A3358' : '#CEDAEA', win: N ? '#C9A85A' : '#D6E1F0', crown: N ? '#2A3358' : '#C2CFE2', tank: '#000' },
      { wall: N ? '#151B3C' : '#8EA2C2', edge: N ? '#1F2750' : '#A3B5D0', win: N ? '#FFD97A' : '#BFD0E6', crown: N ? '#151B3C' : '#A9B9D2', tank: '#000' },
      { wall: N ? '#0D1228' : '#63779A', edge: N ? '#141A36' : '#748AAD', win: N ? '#FFC864' : '#9FB4D0', crown: N ? '#0D1228' : '#63779A', tank: N ? '#2A2230' : '#8A6A54' }
    ];
    city.layers.forEach((list, li) => {
      const c = cols[li];
      for (const b of list) {
        for (const r of b.rects) {
          const col = r[4] === 1 ? c.crown : r[4] === 2 ? c.tank : c.wall;
          PX.rect(ctx, w.x + r[0], base - r[1], r[2], r[3], col);
          if (r[4] === 0 && r[2] >= 4) PX.rect(ctx, w.x + r[0], base - r[1], 1, r[3], c.edge);
        }
        for (const win of b.wins) {
          if (N ? win.lit : win.glass) PX.rect(ctx, w.x + win.x, base - win.dy, 1, 1, N && win.top ? '#FFF2C4' : c.win);
        }
      }
    });
    // 尖顶上的红色航空灯：晚上一闪一闪
    if (N) for (const bc of city.beacons) if (Math.sin(t * 2.4 + bc.ph) > 0.2) PX.rect(ctx, w.x + bc.x, base - bc.dy, 1, 1, '#FF5A5A');
  }

  // 村落（晚上窗户亮着、烟囱冒烟）
  function viewVillage(ctx, w, t, N) {
    const base = w.y + w.h;
    // 德国乡村的样子：远处两层淡蓝的山丘，中间一块块拼起来的田（草地 + 黄色油菜花），
    // 村里是白墙黑木梁的桁架小屋、又陡又高的红瓦顶，中间一座尖顶小教堂，两边几棵深色的冷杉
    const c = (day, night) => (N ? night : day);
    for (let i = 0; i < w.w; i++) {
      const h0 = Math.round(27 + 4 * Math.sin(i * 0.06 + 0.4) + 2 * Math.sin(i * 0.17));
      const h1 = Math.round(20 + 3 * Math.sin(i * 0.09 + 2.2) + 2 * Math.sin(i * 0.23 + 1));
      const h2 = Math.round(13 + 2 * Math.sin(i * 0.07 + 0.5));
      PX.rect(ctx, w.x + i, base - h0, 1, h0, c('#B5CBDD', '#2B3558'));
      PX.rect(ctx, w.x + i, base - h1, 1, h1, c('#9DBFB4', '#263352'));
      // 田：斜着切成一块一块，颜色轮着来
      const patch = Math.floor((i + h2 * 1.5) / 15) % 4;
      PX.rect(ctx, w.x + i, base - h2, 1, h2, c(['#8FC47A', '#E6D460', '#A6CF86', '#7DB56E'][patch], ['#22304E', '#3A3E52', '#263654', '#1F2C48'][patch]));
      if ((i + h2) % 15 === 0) PX.rect(ctx, w.x + i, base - h2, 1, h2, c('#6FA468', '#1A2540'));   // 田埂
    }
    PX.rect(ctx, w.x, base - 5, w.w, 5, c('#6FA860', '#1C2844'));
    PX.rect(ctx, w.x, base - 5, w.w, 1, c('#86BC72', '#22304E'));
    const gy = base - 3;

    // 冷杉：三层越往下越宽的三角
    const fir = (f, hgt) => {
      const tx = w.x + Math.round(f * w.w);
      PX.rect(ctx, tx, gy - 2, 1, 2, c('#6B4A3A', '#2E2636'));
      for (let r = 0; r < hgt; r++) {
        const half = Math.min(3, Math.floor((r % 4 + 1) * 0.8) + (r > 3 ? 1 : 0));
        PX.rect(ctx, tx - half, gy - 2 - hgt + r, half * 2 + 1, 1, c(r % 4 === 0 ? '#2F6B4C' : '#3F7F58', r % 4 === 0 ? '#15303A' : '#1B3A42'));
      }
    };
    fir(0.03, 10); fir(0.09, 8);

    // 桁架小屋：白墙 + 深色木梁（横梁、立柱、斜撑）+ 陡屋顶 + 带窗板的小窗
    const house = (f, hw, hh, rh, roofCol, chimney) => {
      const hx = w.x + Math.round(f * w.w);
      const beam = c('#5E4234', '#2A2434'), wall = c('#F7F0E0', '#4E4A66');
      const roof = c(roofCol, '#54405E'), roofD = c('#8E3F36', '#3E3048');
      if (chimney) {
        const cx = hx + hw - 4, top = gy - hh - rh + 1;
        PX.rect(ctx, cx, top, 2, 5, c('#A8907C', '#3E3A54'));
        for (let j = 0; j < 3; j++) {
          const off = (t * 2.5 + j * 3) % 9;
          PX.rect(ctx, cx + Math.round(Math.sin(t * 0.8 + j) * 1.2), Math.round(top - 1 - off), 2, 1, 'rgba(255,255,255,' + (N ? 0.18 : 0.55) + ')');
        }
      }
      PX.rect(ctx, hx, gy - hh, hw, hh, wall);
      PX.rect(ctx, hx, gy - hh, hw, 1, beam);                         // 檐下横梁
      PX.rect(ctx, hx, gy - hh, 1, hh, beam); PX.rect(ctx, hx + hw - 1, gy - hh, 1, hh, beam);
      PX.rect(ctx, hx + (hw >> 1), gy - hh, 1, hh, beam);             // 中间立柱
      PX.rect(ctx, hx, gy - Math.round(hh * 0.45), hw, 1, beam);      // 腰梁
      for (let r = 0; r < 3; r++) {                                   // 两道斜撑
        PX.rect(ctx, hx + 1 + r, gy - 1 - r, 1, 1, beam);
        PX.rect(ctx, hx + hw - 2 - r, gy - 1 - r, 1, 1, beam);
      }
      // 陡屋顶：一行一行往上收，檐口压一道深色
      for (let r = 0; r < rh; r++) {
        const wid = Math.max(1, Math.round((hw + 2) * (1 - r / rh)));
        PX.rect(ctx, hx - 1 + Math.floor((hw + 2 - wid) / 2), gy - hh - 1 - r, wid, 1, r === 0 ? roofD : roof);
      }
      PX.rect(ctx, hx + (hw >> 1) - 1, gy - hh - Math.round(rh * 0.45), 2, 2, c('#5E4234', '#FFD97A'));   // 阁楼小窗
      const win = c('#8CC0E8', '#FFD97A');
      PX.rect(ctx, hx + 2, gy - hh + 2, 2, 2, win);
      PX.rect(ctx, hx + hw - 4, gy - hh + 2, 2, 2, win);
      PX.rect(ctx, hx + hw - 4, gy - 3, 2, 3, c('#7A5038', '#2E2A40'));   // 门
      PX.rect(ctx, hx + 2, gy - 1, 3, 1, c('#E8607F', '#7A4A66'));         // 窗下一排花
    };

    house(0.14, 13, 8, 8, '#B5523F', true);

    // 村子中间的钟楼：白色塔身 + 又细又尖的深灰塔顶 + 旁边一截红顶的矮房（塔尖上不放十字）
    const kx = w.x + Math.round(0.40 * w.w);
    const stone = c('#F4EFE4', '#56526E'), slate = c('#4E5A6E', '#232A44');
    PX.rect(ctx, kx + 5, gy - 9, 13, 9, stone);
    for (let r = 0; r < 5; r++) PX.rect(ctx, kx + 4 + r, gy - 10 - r, 15 - r, 1, c(r === 0 ? '#8E3F36' : '#B5523F', '#54405E'));
    PX.rect(ctx, kx + 8, gy - 6, 1, 3, c('#7FB0DC', '#FFD97A')); PX.rect(ctx, kx + 12, gy - 6, 1, 3, c('#7FB0DC', '#FFD97A')); PX.rect(ctx, kx + 16, gy - 6, 1, 3, c('#7FB0DC', '#FFD97A'));
    PX.rect(ctx, kx, gy - 17, 6, 17, stone);
    PX.rect(ctx, kx, gy - 17, 1, 17, c('#DAD3C4', '#46425C'));
    PX.rect(ctx, kx + 2, gy - 14, 2, 2, c('#3E4658', '#FFD97A'));     // 钟
    PX.rect(ctx, kx + 2, gy - 9, 2, 3, c('#7FB0DC', '#FFD97A'));
    PX.rect(ctx, kx + 2, gy - 3, 2, 3, c('#7A5038', '#2E2A40'));
    PX.rect(ctx, kx - 1, gy - 18, 8, 1, slate);
    for (let r = 0; r < 9; r++) {
      const wid = r < 2 ? 6 : r < 5 ? 4 : 2;
      PX.rect(ctx, kx + 3 - wid / 2, gy - 19 - r, wid, 1, slate);
    }

    house(0.62, 14, 9, 9, '#A8483A', false);
    fir(0.79, 9);
    house(0.84, 12, 7, 8, '#C0604A', true);
    fir(0.98, 11);
  }

  // dark = 屋里暗不暗（窗框的颜色跟着屋里走，窗外的天色跟着时间走）
  function drawWindow(ctx, L, t, sky, dark) {
    const w = L.win;
    // 木窗框：外圈深色描边 + 木色窗套（上、左受光，下、右背光）+ 贴着玻璃的一圈深色凹槽
    const wd = dark ? '#5A465C' : '#8E6247', wm = dark ? '#86687E' : '#C99A72';
    const wl = dark ? '#9C7E94' : '#E3BC92', ws = dark ? '#6A5468' : '#A8795A';
    PX.rect(ctx, w.x - 4, w.y - 4, w.w + 8, w.h + 8, wd);
    PX.rect(ctx, w.x - 3, w.y - 3, w.w + 6, w.h + 6, wm);
    PX.rect(ctx, w.x - 3, w.y - 3, w.w + 6, 1, wl);
    PX.rect(ctx, w.x - 3, w.y - 3, 1, w.h + 6, wl);
    PX.rect(ctx, w.x - 3, w.y + w.h + 2, w.w + 6, 1, ws);
    PX.rect(ctx, w.x + w.w + 2, w.y - 3, 1, w.h + 6, ws);
    PX.rect(ctx, w.x - 1, w.y - 1, w.w + 2, w.h + 2, wd);

    ctx.save();
    ctx.beginPath();
    ctx.rect(w.x, w.y, w.w, w.h);
    ctx.clip();

    // 天空：上下两段 + 中间抖动过渡
    const nb = sky.bands.length;
    for (let i = 0; i < nb; i++) {
      const y0 = w.y + Math.round(w.h * i / nb), y1 = w.y + Math.round(w.h * (i + 1) / nb);
      PX.rect(ctx, w.x, y0, w.w, y1 - y0, sky.bands[i]);
      if (i > 0) PX.dither(ctx, w.x, y0, w.w, 2, sky.bands[i - 1], i & 1);
    }

    if (sky.sun != null) {
      // 太阳：从左边升起、中午最高、傍晚落到右边；贴近地平线时又大又橙
      const alt = Math.sin(Math.PI * sky.sun);                 // 0 = 地平线，1 = 最高
      const sx = w.x + Math.round(w.w * (0.12 + 0.76 * sky.sun));
      const sy = w.y + Math.round(w.h * (0.74 - 0.56 * alt));
      const low = 1 - U.clamp(alt / 0.45, 0, 1);               // 越低越偏橙
      const core = low > 0.6 ? '#FFB36A' : low > 0.25 ? '#FFD78A' : '#FFF4C8';
      const halo = low > 0.25 ? '255,190,120' : '255,245,200';
      const r = low > 0.5 ? 5 : 4;
      PX.ellipse(ctx, sx, sy, r + 7, r + 7, 'rgba(' + halo + ',.14)');
      PX.ellipse(ctx, sx, sy, r + 3, r + 3, 'rgba(' + halo + ',.30)');
      PX.ellipse(ctx, sx, sy, r, r, core);
      if (low < 0.25) PX.rect(ctx, sx - 2, sy - 2, 2, 1, '#FFFFFF');
    }
    if (sky.star > .05) {
      for (let i = 0; i < 18; i++) {
        const sx = w.x + Math.floor(U.hash(i * 3.1) * w.w);
        const sy = w.y + Math.floor(U.hash(i * 7.7) * w.h * 0.62);
        const tw = Math.sin(t * 1.6 + i * 2);
        if (tw > -0.5) {
          ctx.fillStyle = `rgba(255,255,255,${sky.star})`;
          ctx.fillRect(sx, sy, 1, 1);
          // 每隔几颗有一颗大星星，亮的时候闪成一个小十字
          if (i % 5 === 0 && tw > 0.55) { ctx.fillRect(sx - 1, sy, 3, 1); ctx.fillRect(sx, sy - 1, 1, 3); }
        }
      }
      // 月亮：一弯月牙，外面一圈柔光（太阳还在天上的时候不出来）
      if (sky.sun == null) {
        const mx = w.x + Math.round(w.w * 0.72), my = w.y + Math.round(w.h * 0.22);
        PX.ellipse(ctx, mx, my, 9, 9, 'rgba(248,239,210,.07)');
        PX.ellipse(ctx, mx, my, 7, 7, 'rgba(248,239,210,.09)');
        PX.ellipse(ctx, mx, my, 5, 5, '#F8EFD2');
        PX.ellipse(ctx, mx - 3, my - 2, 4, 4, sky.bands[1]);
      }
    }

    // 云：几团圆鼓鼓的叠在一起，底边压一道淡淡的阴影
    for (const c of S.clouds) {
      const cx = Math.round(w.x + ((c.x + t * c.v) % 1.4 - 0.2) * w.w);
      const cy = Math.round(w.y + c.y * w.h * 0.55);
      const col = sky.night ? 'rgba(190,196,230,.30)' : '#FFFFFF';
      const big = c.s ? 1 : 0;
      PX.ellipse(ctx, cx + 3, cy + 1, 3, 2, col);
      PX.ellipse(ctx, cx + 7, cy - 1, 3 + big, 3, col);
      PX.ellipse(ctx, cx + 11 + big, cy + 1, 3, 2, col);
      PX.rect(ctx, cx + 1, cy + 1, 12 + big, 2, col);
      if (!sky.night) PX.rect(ctx, cx + 2, cy + 3, 10 + big, 1, 'rgba(150,180,215,.45)');
    }

    // 窗外的风景（三套里的一套）
    const view = S.viewNow();
    (view === 'city' ? viewCity : view === 'village' ? viewVillage : viewMountain)(ctx, w, t, sky.night);

    // 落在窗外窗沿上的那只小鸟（白天偶尔来）
    const sb = D.Game && D.Game.sillBird;
    if (sb) (sb.kind === 'squirrel' ? drawSquirrel : drawSillBird)(ctx, w, sb, t);

    // 小鸟
    for (const b of S.birds) {
      const bx = Math.round(w.x + b.x * w.w), by = Math.round(w.y + b.y * w.h);
      const col = sky.night ? 'rgba(210,215,245,.6)' : 'rgba(70,80,100,.8)';
      const up = Math.sin(b.ph + t * 9) > 0 ? 1 : 0;
      PX.rect(ctx, bx - 2, by + (up ? 0 : 1), 2, 1, col);
      PX.rect(ctx, bx + 1, by + (up ? 0 : 1), 2, 1, col);
      PX.rect(ctx, bx, by + 1, 1, 1, col);
    }
    // 玻璃嵌在窗框里：顶上和左边压一道窗框投下来的影子
    PX.rect(ctx, w.x, w.y, w.w, 1, 'rgba(40,30,60,.22)');
    PX.rect(ctx, w.x, w.y, 1, w.h, 'rgba(40,30,60,.14)');
    ctx.restore();

    // 窗棂：十字格，一侧受光一侧背光
    const mx0 = w.x + ((w.w / 2) | 0) - 1, my0 = w.y + ((w.h * 0.46) | 0);
    PX.rect(ctx, mx0, w.y, 2, w.h, wm);
    PX.rect(ctx, mx0, w.y, 1, w.h, wl);
    PX.rect(ctx, w.x, my0, w.w, 2, wm);
    PX.rect(ctx, w.x, my0, w.w, 1, wl);
    PX.rect(ctx, mx0 + 2, w.y, 1, w.h, 'rgba(40,30,60,.16)');
    PX.rect(ctx, w.x, my0 + 2, w.w, 1, 'rgba(40,30,60,.16)');
    // 窗台：做宽一点，猫要趴在上面。台面亮、前沿暗、底下一道投在墙上的影子
    PX.rect(ctx, w.x - 7, w.y + w.h + 2, w.w + 14, 4, ws);
    PX.rect(ctx, w.x - 7, w.y + w.h + 2, w.w + 14, 2, wl);
    PX.rect(ctx, w.x - 7, w.y + w.h + 5, w.w + 14, 1, wd);
    PX.rect(ctx, w.x - 5, w.y + w.h + 6, w.w + 10, 1, 'rgba(60,44,66,.22)');
    // 窗台左角的一小盆花
    const fx = w.x + 1, fy = w.y + w.h + 2;
    PX.rect(ctx, fx + 3, fy - 8, 1, 4, dark ? '#3E5A4C' : '#6FAE6A');
    PX.rect(ctx, fx + 1, fy - 6, 2, 1, dark ? '#3E5A4C' : '#7FBE78');
    PX.rect(ctx, fx + 4, fy - 5, 2, 1, dark ? '#3E5A4C' : '#7FBE78');
    PX.rect(ctx, fx + 2, fy - 11, 3, 3, dark ? '#9A6F86' : '#F28FA8');
    PX.rect(ctx, fx + 3, fy - 10, 1, 1, dark ? '#B89A6A' : '#FFE08A');
    PX.rect(ctx, fx, fy - 4, 7, 1, dark ? '#8A5E4C' : '#E39A72');
    PX.rect(ctx, fx + 1, fy - 3, 5, 3, dark ? '#74503F' : '#D98C64');
  }

  // 窗外的小麻雀：棕背、白肚子、橙嘴，站着时会蹦、会转身、会低头啄；飞的时候扑翅膀
  function drawSillBird(ctx, w, b, t) {
    const x = Math.round(w.x + b.x * w.w), y = Math.round(w.y + b.y * w.h) - 1;   // y = 脚下
    const f = b.face;            // 1 朝右，-1 朝左
    const X = (dx) => f > 0 ? x + dx : x - dx - 1;
    const px = (dx, dy, c) => PX.rect(ctx, X(dx), y + dy, 1, 1, c);
    const brown = '#8A6A52', dark = '#5E4636', belly = '#F4E6CF', beak = '#F0A040', eye = '#1E1A22';
    const flying = b.phase !== 'sit';
    const peck = b.peck > 0 ? 1 : 0;
    // 身子
    for (let dx = -3; dx <= 1; dx++) px(dx, -3, brown);
    for (let dx = -3; dx <= 1; dx++) px(dx, -2, dx >= -1 ? belly : brown);
    for (let dx = -2; dx <= 1; dx++) px(dx, -1, belly);
    px(-4, -3, dark); px(-5, -4, dark);                 // 尾巴往后上翘
    // 头（啄的时候往前下方低一格）
    const hx = 1 + peck, hy = -5 + peck;
    px(hx, hy, brown); px(hx + 1, hy, brown); px(hx, hy + 1, brown); px(hx + 1, hy + 1, belly);
    px(hx + 1, hy, eye);
    px(hx + 2, hy + 1, beak);
    // 翅膀：站着是背上一道深色；飞的时候上下扑
    if (flying) {
      const up = Math.sin(t * 30) > 0;
      px(-2, up ? -5 : -1, dark); px(-1, up ? -5 : -1, dark); px(-1, up ? -4 : 0, dark);
    } else {
      px(-2, -3, dark); px(-1, -3, dark);
      px(-1, 0, dark); px(0, 0, dark);                   // 小细腿
    }
  }

  // 窗外的小松鼠：橘棕色、奶白肚子、一条比身子还大的蓬松尾巴卷在背后；
  // 跑的时候身子压低、尾巴拖平；坐着时立起来，两只前爪捧着坚果，啃的时候头一点一点
  function drawSquirrel(ctx, w, b, t) {
    const x = Math.round(w.x + b.x * w.w), y = Math.round(w.y + w.h) - 1;
    const f = b.face;
    const X = (dx) => f > 0 ? x + dx : x - dx - 1;
    const px = (dx, dy, c) => PX.rect(ctx, X(dx), y + dy, 1, 1, c);
    const row = (x0, x1, dy, c) => { for (let dx = x0; dx <= x1; dx++) px(dx, dy, c); };
    const fur = '#B8743F', furL = '#D69458', dark = '#7E4A26', belly = '#F6E7CF', eye = '#1E1A22', nut = '#8A5A2C', cap = '#C9A06A';
    if (b.run) {
      // 跑：长条身子 + 尾巴往后上方拖，腿一前一后
      const k = Math.sin(t * 28) > 0 ? 1 : 0;
      row(-3, 2, -3, fur); row(-3, 3, -2, fur); row(-2, 2, -1, belly);
      px(3, -4, fur); px(4, -3, fur); px(4, -2, fur); px(5, -2, dark); px(4, -3, eye); px(3, -5, dark);
      row(-7, -4, -4, furL); row(-8, -5, -5, fur); row(-8, -6, -6, furL); px(-4, -3, fur);
      px(-2 + k, 0, dark); px(1 - k, 0, dark);
      return;
    }
    // 坐着：大尾巴卷在身后，尖往前弯；尾巴抖的时候往上翘一格
    const fl = b.flick > 0 ? -1 : 0;
    row(-6, -4, -2, fur); row(-7, -4, -3, furL); row(-7, -4, -4, fur); row(-7, -4, -5, furL);
    row(-7, -4, -6, fur); row(-6, -3, -7 + fl, furL); row(-5, -3, -8 + fl, fur); px(-3, -9 + fl, fur); px(-2, -9 + fl, furL);
    // 身子（立起来）
    row(-3, 0, -1, fur); row(-3, 0, -2, fur); row(-3, 1, -3, fur); row(-2, 1, -4, fur); row(-2, 1, -5, fur);
    row(-1, 0, -2, belly); row(-1, 1, -3, belly); row(0, 1, -4, belly);
    px(-3, 0, dark); px(0, 0, dark);                   // 后脚
    // 头（啃的时候往下点一点）
    const nib = b.peck > 0 && Math.sin(t * 18) > 0 ? 1 : 0;
    const hy = -8 + nib;
    row(-1, 1, hy, fur); row(-1, 2, hy + 1, fur); row(0, 2, hy + 2, furL);
    px(-1, hy - 1, dark);                               // 耳朵
    px(1, hy + 1, eye); px(3, hy + 2, dark);            // 眼睛、鼻子
    // 前爪捧着的坚果
    if (b.nut) { px(2, -5 + nib, cap); px(2, -4 + nib, nut); px(3, -4 + nib, nut); }
    px(1, -4 + nib, dark);
  }

  // ---------- 装饰 ----------
  // 窗帘：一根两头带圆球的窗帘杆，上面一道扇贝边的帘头；两边各一幅，中间用绑带收一下，布上有几道竖褶
  function drawCurtains(ctx, L, t, night) {
    const w = L.win;
    const a = night ? '#7E5F86' : '#F2B9C4', b = night ? '#6A4F72' : '#E39AAA', hi = night ? '#8C6C94' : '#FAD6DD';
    const rod = night ? '#6A5468' : '#A8795A', rodD = night ? '#55425A' : '#8A6045';
    const tie = night ? '#C9A85A' : '#F4D27A';
    PX.rect(ctx, w.x - 12, w.y - 7, w.w + 24, 2, rod);
    PX.rect(ctx, w.x - 14, w.y - 8, 3, 4, rodD); PX.rect(ctx, w.x + w.w + 11, w.y - 8, 3, 4, rodD);
    const ty = w.y + Math.round(w.h * 0.55);
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? w.x - 11 : w.x + w.w + 1;
      const yEnd = w.y + w.h + 9;
      for (let y = w.y - 5; y <= yEnd; y++) {
        const k = (y - ty) / (w.h * 0.55);
        const pinch = 1 - Math.max(0, 0.5 - Math.abs(k)) * 0.9;   // 绑带处收窄
        const wid = Math.round(10 * pinch);
        const x = side < 0 ? x0 : x0 + 10 - wid;
        PX.rect(ctx, x, y, wid, 1, y === yEnd ? b : a);
        // 竖褶：靠窗那一侧一道亮边，中间两道暗线
        PX.rect(ctx, side < 0 ? x : x + wid - 1, y, 1, 1, hi);
        if (wid > 4) PX.rect(ctx, x + (side < 0 ? 3 : wid - 4), y, 1, 1, b);
        if (wid > 7) PX.rect(ctx, x + (side < 0 ? 6 : wid - 7), y, 1, 1, b);
      }
      PX.rect(ctx, side < 0 ? x0 : x0 + 4, ty - 1, 6, 3, tie);
      PX.rect(ctx, side < 0 ? x0 + 5 : x0 + 4, ty + 2, 1, 3, tie);       // 绑带垂下来的一小截穗子
    }
    // 帘头：一个个半圆的扇贝边，盖住窗帘杆和窗框的上沿（不压到玻璃）
    const vx0 = w.x - 11, vw = w.w + 22, n = Math.max(3, Math.round(vw / 13)), sw = vw / n;
    for (let i = 0; i < vw; i++) {
      const h = 3 + Math.round(Math.sin(((i % sw) / sw) * Math.PI) * 3);
      PX.rect(ctx, vx0 + i, w.y - 6, 1, h, a);
      PX.rect(ctx, vx0 + i, w.y - 6 + h - 1, 1, 1, b);
    }
    PX.rect(ctx, vx0, w.y - 6, vw, 1, hi);
  }

  // 串灯：从左上角垂下来一条，灯泡晚上会亮、会闪
  function drawLights(ctx, L, t, night) {
    const x1 = L.win.x - 12;
    const cols = ['#FFD36E', '#FF9FB2', '#9ED8FF', '#B9F0A0'];
    let i = 0;
    for (let x = 2; x < x1; x++) {
      const k = (x % 34) / 34;
      const y = 5 + Math.round(Math.sin(k * Math.PI) * 5);
      PX.rect(ctx, x, y, 1, 1, night ? '#2B2438' : '#8C7A6E');
      if (x % 9 === 4) {
        const on = S.lampOn() && Math.sin(t * 2 + i * 1.7) > -0.6;   // 小彩灯跟着吊灯的开关一起亮
        const c = cols[i % cols.length];
        if (on) PX.ellipse(ctx, x, y + 3, 3, 3, c + '55');
        PX.rect(ctx, x, y + 1, 1, 1, night ? '#2B2438' : '#8C7A6E');
        PX.rect(ctx, x - 1, y + 2, 2, 3, on ? c : (night ? '#6B607A' : c));
        i++;
      }
    }
  }

  // 晚上没开灯时的颜色：整体压成一层带紫的暗色，只留一点原来的色相
  // C：家具、摆设用（留一半原色，暗里也分得清是什么）；CF：地板、地毯这种大面用（更暗、更平）
  function NT(hex, base, keep) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgb(' + Math.round(base[0] + ((n >> 16) & 255) * keep) + ',' + Math.round(base[1] + ((n >> 8) & 255) * keep) + ',' + Math.round(base[2] + (n & 255) * keep) + ')';
  }
  const C = (night, hex) => (night ? NT(hex, [28, 23, 42], 0.5) : hex);
  const CF = (night, hex) => (night ? NT(hex, [40, 33, 58], 0.14) : hex);

  // 墙上的小搁板：一排书（最右一本斜靠着）、番茄钟、一盆垂下来的绿萝
  S.shelfPos = function (L) { return { x: Math.round(L.W * 0.30) - 4, y: Math.round(L.H * 0.30) }; };
  // 番茄钟（搁板中间那只小番茄）：点一下打开番茄钟面板
  S.tomatoPos = function (L) { const p = S.shelfPos(L); return { x: p.x + 17, y: p.y - 12 }; };
  S.hitTomato = function (L, x, y) {
    const p = S.tomatoPos(L);
    return x >= p.x - 2 && x < p.x + 15 && y >= p.y - 2 && y < p.y + 15;
  };
  function drawShelf(ctx, L, t, night) {
    const P0 = S.shelfPos(L), x = P0.x, y = P0.y;
    const wood = C(night, '#C4946A'), woodL = C(night, '#DDB48A'), woodD = C(night, '#946A48');
    // 搁板投在墙上的影子
    PX.rect(ctx, x + 1, y + 4, 40, 2, 'rgba(60,44,66,.12)');
    // 板子：上沿亮、下沿暗；两只小三角托架
    PX.rect(ctx, x - 1, y, 42, 3, wood);
    PX.rect(ctx, x - 1, y, 42, 1, woodL);
    PX.rect(ctx, x - 1, y + 3, 42, 1, woodD);
    for (const bx of [x + 3, x + 34]) {
      for (let i = 0; i < 4; i++) PX.rect(ctx, bx, y + 4 + i, 4 - i, 1, woodD);
    }
    // 书：高矮不一，书脊上一道浅色的签；最右那本斜靠着
    const books = ['#7FA6D8', '#E59AAE', '#9CCB9A', '#F2C77A'];
    const hs = [11, 9, 12, 8];
    for (let i = 0; i < 4; i++) {
      const bx = x + 1 + i * 3;
      PX.rect(ctx, bx, y - hs[i], 3, hs[i], C(night, books[i]));
      PX.rect(ctx, bx, y - hs[i], 1, hs[i], 'rgba(255,255,255,.22)');
      PX.rect(ctx, bx, y - hs[i] + 2, 3, 1, 'rgba(255,255,255,.4)');
    }
    for (let i = 0; i < 9; i++) PX.rect(ctx, x + 13 + Math.round(i * 0.34), y - 9 + i, 3, 1, C(night, '#B79AD8'));
    PX.rect(ctx, x + 13, y - 7, 3, 1, 'rgba(255,255,255,.4)');

    // 番茄钟：专注时是睁着眼的红番茄，休息时变成闭着眼的青番茄；底下搁板边上一条慢慢走的进度。
    // 番茄自己不动：计时的时候眼角一直有东西在跳，很打扰人
    const Pm = D.Pomo, tp = S.tomatoPos(L);
    const brk = Pm && Pm.active && Pm.phase !== 'focus';
    if (S.hot === 'tomato') PX.ellipse(ctx, tp.x + 6, tp.y + 6, 9, 8, 'rgba(255,255,255,.4)');
    PX.rect(ctx, tp.x + 2, tp.y + 11, 9, 1, 'rgba(60,44,66,.25)');
    PX.tomato(ctx, tp.x, tp.y, brk, brk ? 'shut' : 'open');
    if (night) PX.ellipse(ctx, tp.x + 6, tp.y + 6, 7, 6, 'rgba(40,32,62,.35)');
    if (Pm && Pm.active) {
      PX.rect(ctx, tp.x, y + 1, 13, 1, C(night, '#7A5638'));
      PX.rect(ctx, tp.x, y + 1, Math.round(13 * U.clamp(Pm.progress(), 0, 1)), 1, brk ? '#8CC870' : '#F2705E');
    }

    // 绿萝：小陶盆 + 两条垂到搁板下面的藤，叶子轻轻晃
    const px = x + 32;
    const g1 = C(night, '#5E9A5E'), g2 = C(night, '#86C07A');
    const vine = (vx, len, ph) => {
      for (let i = 0; i < len; i++) {
        const sx = vx + Math.round(Math.sin(i * 0.5 + ph + Math.sin(t * 0.9 + ph) * 0.25) * 1.3);
        PX.rect(ctx, sx, y - 1 + i, 1, 1, g1);
        if (i % 3 === 1) PX.rect(ctx, sx + (i % 2 ? 1 : -2), y - 1 + i, 2, 2, i % 6 === 1 ? g2 : g1);
      }
    };
    vine(px + 7, 15, 0.4); vine(px + 5, 9, 2.1);
    PX.rect(ctx, px, y - 6, 7, 6, C(night, '#D98C64'));
    PX.rect(ctx, px - 1, y - 7, 9, 2, C(night, '#E8A27A'));
    PX.rect(ctx, px, y - 3, 7, 1, C(night, '#F3E3CC'));
    PX.rect(ctx, px + 1, y - 10, 2, 3, g2); PX.rect(ctx, px + 3, y - 12, 2, 5, g1); PX.rect(ctx, px + 5, y - 10, 2, 3, g2);
    PX.rect(ctx, px - 1, y - 9, 2, 2, g1);
  }

  // 猫爬架（干净的三段式）：右边一个带拱门和爪印的大猫屋，屋顶是第一层；
  // 左边一根柱子撑着第二层跳板；猫屋顶上的高柱子通到最上面的软垫，垫子底下吊一个绒球。
  // 猫能落脚的三个地方记在 L.tree.spots 里（从低到高），画的位置要和它对上。
  function drawCatTree(ctx, L, t, night) {
    const T = L.tree, x = T.x, base = L.floorY - 4;   // 底座垫在踢脚线上面，不然被踢脚线挡住
    const rope = night ? '#8E7A66' : '#D8BE92', ropeD = night ? '#76634F' : '#BFA176';
    const pad = night ? '#6E6288' : '#B9A6D6', padD = night ? '#5B5074' : '#9C88BE';
    const padL = night ? '#857AA0' : '#E3D6F0', hole = night ? '#2E2640' : '#5B4E70';
    // 下面的坐标都相对「爬架中线、地板」：dx 往右为正，dy 往上为负
    const R = (dx, dy, w, h, c) => PX.rect(ctx, x + dx, base + dy, w, h, c);
    const post = (dx, y0, y1, w) => { for (let y = y0; y < y1; y++) R(dx, y, w, 1, (((y % 3) + 3) % 3 === 0) ? ropeD : rope); };
    // 跳板：浅色毛毯面 + 毛茸茸的边
    const plat = (dx, dy, w) => {
      R(dx, dy, w, 3, pad); R(dx, dy, w, 1, padL); R(dx, dy + 3, w, 1, padD);
      for (let i = 1; i < w; i += 3) R(dx + i, dy + 4, 1, 1, padD);
    };

    if (!S.silhouette) PX.ellipse(ctx, x, base + 1, 31, 3, 'rgba(60,44,66,.25)');
    // 底座
    R(-29, -3, 58, 4, pad); R(-29, -3, 58, 1, padL); R(-29, 0, 58, 1, padD);
    // 两根麻绳柱：左边矮的撑着第二层，右边高的从猫屋顶通到软垫
    post(-19, -42, -3, 4);
    post(12, -64, -27, 5);
    // 大猫屋：拱形门洞（一圈浅色边）+ 爪印
    R(0, -24, 28, 21, pad);
    R(0, -24, 1, 21, padL); R(27, -24, 1, 21, padD);
    PX.ellipse(ctx, x + 9, base - 10, 6, 6, padL); R(3, -10, 13, 7, padL);
    PX.ellipse(ctx, x + 9, base - 10, 5, 5, hole); R(4, -10, 11, 7, hole);
    PX.stamp(ctx, TREAT, x + 17, base - 19, { a: padD, h: padD, b: padD });   // 爪印：四颗脚趾排成弧 + 大肉垫（和零食那块猫爪饼干同一个图）
    // 第一层：猫屋的屋顶（落脚点 0）
    plat(-2, -27, 32);
    // 第二层：左边的跳板（落脚点 1）
    plat(-29, -42, 24);
    // 顶上的软垫（落脚点 2，Luna 的专座）：厚垫子 + 一圈蓬蓬的毛边 + 两只小猫耳朵
    R(-1, -64, 30, 3, padD);
    R(-2, -66, 32, 3, pad);
    R(2, -65, 24, 1, padL);
    for (let i = -1; i <= 28; i += 2) R(i, -67 - ((i >> 1) & 1), 2, 1, padL);
    for (const ex of [2, 26]) {
      for (let i = 0; i < 4; i++) R(ex - (3 - i), -71 + i, (3 - i) * 2 + 1, 1, pad);
      R(ex, -69, 1, 2, '#F7C3CC');
    }
    // 第二层边上吊一个绒球
    const sw = Math.round(Math.sin(t * 1.3) * 1.5);
    PX.line(ctx, x - 27, base - 38, x - 27 + sw, base - 30, night ? '#2B2438' : '#8C7A6E');
    PX.ellipse(ctx, x - 27 + sw, base - 28, 2, 2, night ? '#B07C9A' : '#F48FB1');
  }

  // 猫跑轮：part='back' 在猫之前画（支架、背板、跑道、辐条），
  // part='front' 在猫之后画（跑道外沿和内沿的线），猫看起来就在轮子里面跑
  S.drawWheel = function (ctx, L, angle, part, night) {
    const W = L.wheel;
    if (!W) return;
    const { x, cy, r, ri } = W;
    const base = L.catY + 3;
    const wood = night ? '#8E6E5A' : '#C9935F', woodD = night ? '#6E5444' : '#9E6E44';
    const track = night ? '#6F8FB0' : '#9AC7E8', trackD = night ? '#58738F' : '#7AAED6';
    const rim = night ? '#435A72' : '#5E8FB8';
    if (part === 'back') {
      PX.ellipse(ctx, x, base, r - 2, 3, 'rgba(60,44,66,.22)');
      // A 字支架
      PX.line(ctx, x - 20, base, x - 1, cy, woodD); PX.line(ctx, x - 19, base, x, cy, wood);
      PX.line(ctx, x + 20, base, x + 1, cy, woodD); PX.line(ctx, x + 19, base, x, cy, wood);
      PX.rect(ctx, x - 23, base - 1, 8, 2, wood); PX.rect(ctx, x + 15, base - 1, 8, 2, wood);
      for (let yy = cy - r; yy <= cy + r; yy++) {
        for (let xx = x - r; xx <= x + r; xx++) {
          const dx = xx + 0.5 - x, dy = yy + 0.5 - cy, d = Math.hypot(dx, dy);
          if (d > r) continue;
          if (d < ri) { ctx.fillStyle = night ? 'rgba(70,62,96,.55)' : 'rgba(255,248,238,.55)'; ctx.fillRect(xx, yy, 1, 1); continue; }
          // 跑道上的一条条横档，跟着轮子转
          const a = Math.atan2(dy, dx) - angle;
          const slat = ((a / (Math.PI * 2) * 36) % 1 + 1) % 1 < 0.35;
          ctx.fillStyle = slat ? trackD : track;
          ctx.fillRect(xx, yy, 1, 1);
        }
      }
      for (let i = 0; i < 6; i++) {
        const a = angle + i * Math.PI / 3;
        PX.line(ctx, x, cy, x + Math.cos(a) * (ri - 1), cy + Math.sin(a) * (ri - 1), night ? '#7E95AE' : '#C9DFF0');
      }
      PX.ellipse(ctx, x, cy, 3, 3, wood);
      PX.rect(ctx, x - 1, cy - 1, 2, 2, woodD);
    } else {
      for (let yy = cy - r; yy <= cy + r; yy++) {
        for (let xx = x - r; xx <= x + r; xx++) {
          const dx = xx + 0.5 - x, dy = yy + 0.5 - cy, d = Math.hypot(dx, dy);
          if ((d <= r && d > r - 1.2) || (dy > 4 && d >= ri && d < ri + 1)) {
            ctx.fillStyle = rim; ctx.fillRect(xx, yy, 1, 1);
          }
        }
      }
    }
  };

  // 地上的玩具（位置会被猫拍得到处滚）
  S.drawToys = function (ctx, toys, night) {
    for (const toy of toys) {
      const x = Math.round(toy.x), y = Math.round(toy.y);
      if (toy.kind === 'yarn') {
        PX.ellipse(ctx, x, y + 4, 6, 2, 'rgba(60,44,66,.22)');
        PX.ellipse(ctx, x, y, 5, 5, night ? '#9A6F96' : '#F09AAE');
        // 毛线纹跟着滚动转
        const a = toy.spin || 0, line = night ? '#7A5478' : '#D6728A';
        for (const off of [0, 1.1]) {
          const c = Math.cos(a + off) * 4, s = Math.sin(a + off) * 4;
          PX.line(ctx, x - c, y - s, x + c, y + s, line);
        }
        PX.line(ctx, x + 5, y + 2, x + 12, y + 5, night ? '#9A6F96' : '#F09AAE');
      } else {
        const f = toy.vx < -1 ? -1 : 1, body = night ? '#7D7690' : '#B7AFC0';
        PX.ellipse(ctx, x, y, 4, 2, body);
        PX.rect(ctx, x + 3 * f - (f < 0 ? 1 : 0), y - 2, 2, 2, body);
        PX.rect(ctx, x + 4 * f, y - 3, 1, 1, '#F2B8B5');
        PX.rect(ctx, x + 5 * f, y, 1, 1, '#2A2230');
        PX.line(ctx, x - 4 * f, y, x - 9 * f, y - 2, night ? '#7D7690' : '#9C93A8');
      }
    }
  };

  // 吊灯：天花板垂下来。点一下开、再点一下关（默认关着），开着的时候暖光洒一圈
  S.lampOn = function () { return !!(D.St && D.St.settings && D.St.settings.lamp); };
  S.lampPos = function (L) { return { x: Math.round(L.W * 0.40), y: Math.round(L.H * 0.16) }; };
  S.hitLamp = function (L, x, y) {
    const p = S.lampPos(L);
    return Math.abs(x - p.x) <= 10 && y >= p.y - 8 && y <= p.y + 8;
  };
  function drawLamp(ctx, L, night) {
    const p = S.lampPos(L), x = p.x, y = p.y, on = S.lampOn();
    PX.rect(ctx, x - 2, 0, 5, 2, C(night, '#A98A72'));                 // 天花板上的灯座
    PX.rect(ctx, x, 2, 1, y - 9, night ? '#2B2438' : '#8C7A6E');       // 灯线
    if (on) {
      // 灯罩周围一圈一圈的暖光
      const a = night ? '.06' : '.09';
      for (let r = 40; r >= 12; r -= 7) PX.ellipse(ctx, x, y + 5, r, Math.round(r * 0.78), 'rgba(255,214,150,' + a + ')');
    }
    const dim = night && !on;
    const body = dim ? '#9A865C' : on ? '#FFE7AC' : '#F2D593';
    const lite = dim ? '#AC9868' : on ? '#FFF6D6' : '#FBE7B4';
    const rim = dim ? '#7C6A48' : '#D9B06A';
    PX.rect(ctx, x - 1, y - 8, 3, 2, dim ? '#6E5E44' : '#B98E52');     // 灯头
    // 圆顶灯罩：一行一行往下变宽，左边一道高光，下沿压一道深色
    const half = [2, 4, 6, 7, 8, 8, 9];
    for (let i = 0; i < half.length; i++) {
      PX.rect(ctx, x - half[i], y - 6 + i, half[i] * 2 + 1, 1, body);
      PX.rect(ctx, x - half[i] + 1, y - 6 + i, Math.max(1, half[i] >> 1), 1, lite);
    }
    PX.rect(ctx, x - 9, y + 1, 19, 1, rim);
    PX.rect(ctx, x - 2, y + 2, 5, 2, on ? '#FFF8D8' : dim ? '#8E8698' : '#E9DFCA');   // 灯泡
    if (on) PX.rect(ctx, x - 1, y + 4, 3, 1, '#FFE9A8');
    if (S.hot === 'lamp') { PX.rect(ctx, x - 12, y - 4, 1, 1, '#FFFFFF'); PX.rect(ctx, x + 12, y - 2, 1, 1, '#FFFFFF'); PX.rect(ctx, x + 9, y - 8, 1, 1, '#FFFFFF'); }
  }

  // ---------- 家具 ----------
  // 猫窝：一圈鼓鼓的绒边 + 中间的软垫。part='back' 在猫之前画，'front' 在猫之后画（前沿那半圈压在猫身上，猫就像窝在里面）
  S.drawBed = function (ctx, x, y, part, night) {
    const rim = C(night, '#E9A9BC'), rimL = C(night, '#F7CBD8'), rimD = C(night, '#CC869E');
    const cush = C(night, '#FFF3EA'), cushD = C(night, '#EBD3CF');
    if (part !== 'front') {
      PX.ellipse(ctx, x, y + 1, 34, 4, 'rgba(60,44,66,.25)');
      PX.ellipse(ctx, x, y - 8, 33, 9, rimD);
      PX.ellipse(ctx, x, y - 9, 32, 8, rim);
      PX.ellipse(ctx, x, y - 11, 29, 5, rimL);
      PX.ellipse(ctx, x, y - 8, 27, 6, cushD);      // 垫子：靠里的一圈是绒边投下来的影子
      PX.ellipse(ctx, x, y - 6, 26, 5, cush);
      return;
    }
    // 前沿：只画下半圈
    ctx.save();
    ctx.beginPath(); ctx.rect(x - 35, y - 6, 70, 9); ctx.clip();
    PX.ellipse(ctx, x, y - 8, 33, 9, rimD);
    PX.ellipse(ctx, x, y - 9, 33, 8, rim);
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.rect(x - 35, y - 6, 70, 3); ctx.clip();
    PX.ellipse(ctx, x, y - 12, 31, 8, rimL);       // 绒边鼓起来的那道高光
    ctx.restore();
    for (let i = -24; i <= 24; i += 6) PX.rect(ctx, x + i, y - 3 + Math.round(Math.abs(i) / 14), 2, 1, rimD);   // 一圈缝线
    paw(ctx, x - 1, y - 3, cush);
  };

  // 墙角的大盆栽（龟背竹）：圆肚子陶盆 + 几片高高低低的大叶子，叶子有叶脉和缺口，轻轻晃
  S.drawPlant = function (ctx, x, y, t, night) {
    const pot = C(night, '#D98C64'), potL = C(night, '#EDAA82'), potD = C(night, '#B56E48');
    const g1 = C(night, '#4E8A58'), g2 = C(night, '#74B070'), g3 = C(night, '#9CD08A'), stem = C(night, '#5E8F5A');
    // [叶心相对花盆口的位置 x, y, 半宽, 半高, 朝向, 深浅]，从后往前画
    const leaves = [[-9, -30, 7, 5, -1, 0], [8, -37, 7, 5, 1, 0], [-2, -46, 6, 5, -1, 1], [11, -24, 6, 4, 1, 1], [-12, -18, 6, 4, -1, 1], [3, -28, 5, 4, 1, 2]];
    leaves.forEach((lf, i) => {
      const sw = Math.round(Math.sin(t * 0.8 + i * 1.7) * 0.9);
      const lx = x + lf[0] + sw, ly = y + lf[1];
      PX.line(ctx, x + (lf[0] > 0 ? 1 : -1), y - 15, lx, ly + 2, stem);
      const body = lf[5] === 0 ? g1 : lf[5] === 1 ? g2 : g3;
      const vein = lf[5] === 0 ? g2 : g1;
      PX.ellipse(ctx, lx, ly, lf[2], lf[3], body);
      // 叶脉 + 叶缘的两个缺口
      PX.line(ctx, lx - lf[4] * (lf[2] - 1), ly + 1, lx + lf[4] * (lf[2] - 2), ly - 1, vein);
      PX.rect(ctx, lx + lf[4] * (lf[2] - 2), ly + 2, 2, 1, vein);
      PX.rect(ctx, lx - lf[4], ly - lf[3] + 1, 1, 2, vein);
    });
    // 花盆：盆口一圈、盆身往下收、一道奶白的腰线
    PX.ellipse(ctx, x, y + 1, 10, 2, 'rgba(60,44,66,.25)');
    const half = [8, 8, 8, 8, 7, 7, 7, 6, 6, 5];
    for (let i = 0; i < half.length; i++) {
      PX.rect(ctx, x - half[i], y - 10 + i, half[i] * 2, 1, pot);
      PX.rect(ctx, x - half[i], y - 10 + i, 2, 1, potL);
      PX.rect(ctx, x + half[i] - 2, y - 10 + i, 2, 1, potD);
    }
    PX.rect(ctx, x - 7, y - 6, 14, 1, C(night, '#F6E6D2'));
    PX.rect(ctx, x - 10, y - 14, 20, 4, potL);
    PX.rect(ctx, x - 10, y - 11, 20, 1, potD);
    PX.rect(ctx, x - 8, y - 14, 16, 1, C(night, '#6B4A3A'));    // 盆里的土
  };

  // 纸箱：猫会跳进去窝着，只露出耳朵和眼睛。part='back' 是箱子里面和翻开的盖子（猫之前画），'front' 是正面那块板（猫之后画）
  S.BOX_H = 13;   // 正面那块板有多高
  S.drawBox = function (ctx, x, y, part, night, wob) {
    const face = C(night, '#DCA56C'), faceL = C(night, '#EDC08C'), faceD = C(night, '#B98350');
    const inner = C(night, '#8E6238'), flap = C(night, '#E6B67E'), tape = C(night, '#F2E0BC');
    x += wob ? Math.round(Math.sin(wob * 40) * 1.2) : 0;           // 被碰了一下：左右晃两下
    if (part !== 'front') {
      PX.ellipse(ctx, x, y + 1, 25, 3, 'rgba(60,44,66,.25)');
      PX.rect(ctx, x - 19, y - 20, 38, 8, inner);                  // 箱子里面（后壁）
      PX.rect(ctx, x - 19, y - 20, 38, 1, faceD);
      PX.rect(ctx, x - 18, y - 25, 36, 5, flap);                   // 后面那片盖子竖着
      PX.rect(ctx, x - 18, y - 25, 36, 1, faceL);
      PX.rect(ctx, x - 18, y - 21, 36, 1, faceD);
      for (let i = 0; i < 6; i++) {                                // 左右两片盖子往外摊开
        PX.rect(ctx, x - 21 - i, y - 20 + i, 2, 4, flap);
        PX.rect(ctx, x + 19 + i, y - 20 + i, 2, 4, flap);
      }
      PX.rect(ctx, x - 26, y - 15, 2, 4, faceD); PX.rect(ctx, x + 24, y - 15, 2, 4, faceD);
      return;
    }
    const H = S.BOX_H;
    PX.rect(ctx, x - 20, y - H, 40, H, face);
    PX.rect(ctx, x - 20, y - H, 40, 1, faceL);
    PX.rect(ctx, x - 20, y - H, 1, H, faceL);
    PX.rect(ctx, x + 19, y - H, 1, H, faceD);
    PX.rect(ctx, x - 20, y - 1, 40, 1, faceD);
    PX.rect(ctx, x - 2, y - H, 4, H - 1, tape);                    // 中间一道封箱胶带
    PX.rect(ctx, x - 2, y - H, 1, H - 1, 'rgba(255,255,255,.35)');
    paw(ctx, x - 13, y - 7, faceD);                                // 印着的爪印
    PX.rect(ctx, x + 8, y - 9, 7, 1, faceD); PX.rect(ctx, x + 8, y - 7, 5, 1, faceD); PX.rect(ctx, x + 8, y - 5, 6, 1, faceD);   // 一小块「字」
    if (S.hot === 'box') PX.frame(ctx, x - 21, y - H - 1, 42, H + 2, 'rgba(255,255,255,.7)');
  };
  S.hitBox = function (L, x, y) {
    const b = L.box;
    return !!b && x >= b.x - 22 && x <= b.x + 22 && y >= b.y - 24 && y <= b.y + 1;
  };
  S.hitBed = function (L, x, y) {
    const b = L.bed;
    return !!b && Math.abs(x - b.x) <= 33 && y >= b.y - 17 && y <= b.y + 1;
  };

  // 猫爪印（9×8）：四颗圆圆的脚趾排成一道弧（中间两颗高、外侧两颗低），底下一块上窄下宽、圆乎乎的大肉垫，
  // 脚趾和肉垫之间留一格缝。猫爬架的猫屋上印的就是它
  const TREAT = [
    '..aa.aa..',
    '..aa.aa..',
    'aa.....aa',
    'aa.aaa.aa',
    '..ahaaa..',
    '.ahaaaaa.',
    '.aaaaaab.',
    '..aaabb..'
  ];
  // 零食：一条黄色的小鱼饼干（圆身子、右边一个分叉的尾巴、一只小黑眼睛）。飞在半空的时候地上有个小影子
  S.drawTreat = function (ctx, tr, night) {
    const x = Math.round(tr.x), y = Math.round(tr.y - (tr.z || 0));
    if (tr.z > 1) PX.ellipse(ctx, x, Math.round(tr.y), 3, 1, 'rgba(60,44,66,.2)');
    const a = C(night, '#F4C55C'), b = C(night, '#D99C3A');
    PX.rect(ctx, x - 3, y - 2, 5, 3, a);
    PX.rect(ctx, x - 2, y - 3, 3, 1, a); PX.rect(ctx, x - 2, y + 1, 3, 1, b);
    PX.rect(ctx, x + 2, y - 3, 2, 2, b); PX.rect(ctx, x + 2, y, 2, 2, b);   // 尾巴
    PX.rect(ctx, x - 2, y - 2, 1, 1, '#4A3020');
  };

  // 小爪印（砂盆脚垫、餐垫、猫窝、纸箱上用，5×4）：四颗脚趾排成弧——中间两颗高、外侧两颗低——底下一块肉垫
  function paw(ctx, x, y, col) {
    PX.rect(ctx, x, y + 1, 3, 2, col);
    PX.rect(ctx, x, y - 1, 1, 1, col); PX.rect(ctx, x + 2, y - 1, 1, 1, col);
    PX.rect(ctx, x - 1, y, 1, 1, col); PX.rect(ctx, x + 3, y, 1, 1, col);
  }

  // 猫砂盆：猫头形状的高靠背（耳朵、眯眼、粉鼻子）+ 托盘 + 前面一块爪印脚垫 + 靠着的小铲子
  S.drawLitter = function (ctx, x, y, poops, hover) {
    PX.ellipse(ctx, x, y + 2, 27, 5, 'rgba(60,44,66,.25)');
    // 脚垫
    PX.rect(ctx, x - 27, y - 1, 54, 5, '#F3C9D3');
    PX.rect(ctx, x - 26, y + 4, 52, 1, '#DFA9B8');
    paw(ctx, x - 20, y + 1, '#E8A9BA'); paw(ctx, x - 6, y + 1, '#E8A9BA'); paw(ctx, x + 9, y + 1, '#E8A9BA');
    // 猫头靠背：矮一点，顶上是平的，Luna 上窗台前会先跳到这上面垫一步
    const back = hover ? '#FFF8EF' : '#FFF1E2', line = '#C9A88A';
    PX.rect(ctx, x - 20, y - 23, 40, 12, back);
    PX.frame(ctx, x - 21, y - 24, 42, 13, line);
    PX.rect(ctx, x - 20, y - 23, 40, 1, '#FFFFFF');
    for (let i = 0; i < 6; i++) {           // 两只耳朵
      PX.rect(ctx, x - 20 + i, y - 30 + i, 6 - i, 1, line);
      PX.rect(ctx, x - 19 + i, y - 29 + i, Math.max(0, 4 - i), 1, '#F7C3CC');
      PX.rect(ctx, x + 15 + (5 - (6 - i)), y - 30 + i, 6 - i, 1, line);
      PX.rect(ctx, x + 16 + (5 - (6 - i)), y - 29 + i, Math.max(0, 4 - i), 1, '#F7C3CC');
    }
    PX.line(ctx, x - 9, y - 19, x - 7, y - 21, '#7A5A4A'); PX.line(ctx, x - 7, y - 21, x - 5, y - 19, '#7A5A4A');
    PX.line(ctx, x + 5, y - 19, x + 7, y - 21, '#7A5A4A'); PX.line(ctx, x + 7, y - 21, x + 9, y - 19, '#7A5A4A');
    PX.rect(ctx, x - 1, y - 19, 3, 2, '#F28C9E');
    PX.rect(ctx, x - 13, y - 18, 3, 1, '#F7C3CC'); PX.rect(ctx, x + 11, y - 18, 3, 1, '#F7C3CC');
    // 托盘
    const body = hover ? '#BFE0F2' : '#A8D4F0';
    PX.rect(ctx, x - 21, y - 13, 42, 14, body);
    PX.rect(ctx, x - 22, y - 16, 44, 4, hover ? '#DDF0FA' : '#CFE8F7');
    PX.rect(ctx, x - 22, y - 16, 44, 1, '#FFFFFF');
    PX.rect(ctx, x - 21, y - 2, 42, 1, '#86B8D8');
    for (let i = -16; i <= 16; i += 8) PX.rect(ctx, x + i, y - 8, 2, 2, '#FFFFFF');
    PX.rect(ctx, x - 18, y - 13, 36, 6, '#EADFC6');
    PX.dither(ctx, x - 18, y - 10, 36, 4, '#D3C3A0', 0);
    // 靠在右边的小铲子
    PX.line(ctx, x + 23, y - 22, x + 26, y - 6, '#E59AAE');
    PX.rect(ctx, x + 24, y - 7, 5, 6, '#F4B6C2');
    PX.rect(ctx, x + 25, y - 6, 1, 4, '#E59AAE'); PX.rect(ctx, x + 27, y - 6, 1, 4, '#E59AAE');
    for (const p of poops) {
      const px = Math.round(x + p.ox), py = Math.round(y + p.oy);
      if (p.hot) PX.rect(ctx, px - 6, py - 9, 13, 11, 'rgba(255,224,130,.5)');
      PX.rect(ctx, px - 4, py - 2, 9, 3, '#7A5339');
      PX.rect(ctx, px - 3, py - 5, 7, 3, '#8A6246');
      PX.rect(ctx, px - 2, py - 7, 5, 2, '#9C7152');
    }
  };

  // 饭碗：两只碗直接放在地上的爪印餐垫上（不用碗架了）——左边红色猫耳饭碗（喂食），右边蓝色水碗（喂水）
  S.BOWL_DX = 18;   // 两只碗各离中心多远（红碗在左、蓝碗在右）
  S.drawBowl = function (ctx, x, y, fill, t, water) {
    const R = x - S.BOWL_DX, B = x + S.BOWL_DX;   // 红碗、蓝碗的中心
    t = t || 0;
    water = water || 0;
    PX.ellipse(ctx, x, y + 2, 34, 4, 'rgba(60,44,66,.25)');
    // 爪印餐垫：长方形、奶油色、带一圈边
    PX.rect(ctx, x - 35, y - 1, 70, 4, '#F3E3CC');
    PX.rect(ctx, x - 35, y + 3, 70, 1, '#DCC3A0');
    PX.rect(ctx, x - 35, y - 1, 1, 4, '#E6D0B0'); PX.rect(ctx, x + 34, y - 1, 1, 4, '#E6D0B0');
    paw(ctx, x - 1, y + 1, '#E2C9A6');
    // 两只碗：碗口宽、碗底略收，底下一道深色接地
    const bowl = (cx, col, colL, colD) => {
      PX.rect(ctx, cx - 9, y - 6, 18, 5, col);
      PX.rect(ctx, cx - 8, y - 1, 16, 1, colD);
      PX.rect(ctx, cx - 10, y - 7, 20, 2, colL);
      PX.rect(ctx, cx - 9, y - 3, 18, 1, colD);
      PX.ellipse(ctx, cx, y + 1, 9, 1, 'rgba(60,44,66,.18)');
    };
    bowl(R, '#E8636B', '#F59A9E', '#B8434C');   // 红色：饭碗
    bowl(B, '#A8D4F0', '#D2ECFA', '#7FB4D8');   // 蓝色：水碗
    // 饭碗上的猫耳朵
    PX.rect(ctx, R - 8, y - 10, 3, 3, '#E8636B'); PX.rect(ctx, R - 7, y - 11, 1, 1, '#E8636B');
    PX.rect(ctx, R + 5, y - 10, 3, 3, '#E8636B'); PX.rect(ctx, R + 6, y - 11, 1, 1, '#E8636B');
    // 猫粮：越满堆得越高，冒出碗沿
    if (fill > 0.02) {
      const h = Math.max(1, Math.round(fill * 5));
      for (let i = 0; i < h; i++) {
        const w2 = 16 - i * 2;
        PX.rect(ctx, R - (w2 >> 1), y - 7 - i, w2, 1, '#C98A4B');
      }
      PX.dither(ctx, R - 7, y - 7 - h + 1, 14, h, '#A96C33', 1);
    }
    // 水：有水时碗里一层蓝，水越少碗里露出的碗底越多
    if (water > 0.02) {
      const lv = Math.max(1, Math.round(water * 3));
      PX.rect(ctx, B - 8, y - 4 - lv, 16, lv, '#7FC4F0');
      PX.rect(ctx, B - 8, y - 4 - lv, 16, 1, '#A9DBF7');
      // 水面平时是静的：只有一小段固定的淡色反光，不闪也不动。有猫在喝水的时候才荡起一圈圈小水纹
      PX.rect(ctx, B - 6, y - 4 - lv, 3, 1, '#D6EEFB');
      const drinker = D.Game && D.Game.waterUser && (D.Game.cats || []).find(c => c.catId === D.Game.waterUser);
      if (drinker && drinker.feedPhase === 'at') {              // 嘴已经凑到碗里了才有水纹（走过来的路上没有）
        const k = Math.floor(t * 3) % 3;
        PX.rect(ctx, B - 1 - k * 2, y - 4 - lv, 1, 1, '#E8F6FD');
        PX.rect(ctx, B + 1 + k * 2, y - 4 - lv, 1, 1, '#E8F6FD');
      }
    } else {
      PX.rect(ctx, B - 8, y - 5, 16, 1, '#8FB9D6');   // 空碗：只看得到碗底
    }
  };

  // ---------- 整体 ----------
  // 墙上的两张拍立得：胶带贴着、一高一低。鼠标移上去只是微微歪一下，表情不变；点下去才换表情、晃一晃、冒爱心
  const PHOTOS = [
    // rot = 贴歪的角度（弧度）；idle / hover / poke = 平时、鼠标移上去、被点时的表情
    { id: 'luna', bg: '#CFE3F6', bgN: '#6F7BA0', dot: '#FFFFFF', tape: '#F6B8C6', heart: '#8FA3D8', dy: 0, rot: -0.12, idle: 'meh', hover: 'meh', poke: 'sleep' },
    { id: 'nova', bg: '#FDE2CC', bgN: '#9A7A80', dot: '#FFFFFF', tape: '#A9D8C2', heart: '#F0A070', dy: 4, rot: 0.14, idle: 'happy', hover: 'happy', poke: 'win' }
  ];
  const photoState = { luna: { poke: -99 }, nova: { poke: -99 } };
  let sceneT = 0;
  S.photoRects = function (L) {
    const x0 = Math.max(3, Math.round(L.W * 0.14) - 31), y0 = Math.round(L.H * 0.17) - 13;
    return PHOTOS.map((p, i) => ({ id: p.id, x: x0 + i * 33, y: y0 + p.dy, w: 30, h: 27 }));
  };
  S.hitPhoto = function (L, x, y) {
    for (const r of S.photoRects(L)) if (x >= r.x && x < r.x + r.w && y >= r.y - 2 && y < r.y + r.h) return r;
    return null;
  };
  S.pokePhoto = function (id) { photoState[id].poke = sceneT; };

  function drawPhotos(ctx, L, t, night, mouse) {
    sceneT = t;
    const hot = mouse ? S.hitPhoto(L, mouse.x, mouse.y) : null;
    S.photoRects(L).forEach((r, i) => {
      const P = PHOTOS[i];
      const since = t - photoState[r.id].poke;
      const poked = since >= 0 && since < 1.2;
      const hover = !!hot && hot.id === r.id;
      // 照片绕着胶带那一点歪着贴；被点时像被弹了一下，绕着胶带来回荡
      let ang = P.rot + (hover ? (P.rot > 0 ? 0.03 : -0.03) : 0);
      if (poked) ang += Math.sin(since * 14) * 0.22 * (1 - since / 1.2);
      ctx.save();
      ctx.translate(r.x + 15, r.y);
      ctx.rotate(ang);
      const x = -15, y = 0;
      PX.rect(ctx, x + 1, y + 2, 30, 27, 'rgba(60,44,66,.20)');
      PX.rect(ctx, x, y, 30, 27, night ? '#B9AEC6' : '#FFFDF8');
      PX.rect(ctx, x + 2, y + 2, 26, 19, night ? P.bgN : P.bg);
      // 背景上的小星星
      for (const d of [[4, 4], [24, 5], [22, 3], [6, 9]]) PX.rect(ctx, x + d[0], y + d[1], 1, 1, P.dot);
      PX.rect(ctx, x + 23, y + 4, 3, 1, P.dot); PX.rect(ctx, x + 24, y + 3, 1, 3, P.dot);
      const mood = poked && since < 0.7 ? P.poke : hover ? P.hover : P.idle;
      if (D.drawFace) D.drawFace(ctx, r.id, x + 3, y + 4, mood);
      if (night) PX.rect(ctx, x + 2, y + 2, 26, 19, 'rgba(40,32,62,.30)');
      // 白边上的小爱心
      const hx = x + 13, hy = y + 22;
      PX.rect(ctx, hx, hy, 2, 1, P.heart); PX.rect(ctx, hx + 3, hy, 2, 1, P.heart);
      PX.rect(ctx, hx, hy + 1, 5, 1, P.heart); PX.rect(ctx, hx + 1, hy + 2, 3, 1, P.heart); PX.rect(ctx, hx + 2, hy + 3, 1, 1, P.heart);
      ctx.restore();
      // 胶带（跟着照片一起歪，但不跟着晃：照片是被它粘在墙上的）
      ctx.save();
      ctx.translate(r.x + 15, r.y);
      ctx.rotate(P.rot);
      PX.rect(ctx, -5, -2, 10, 4, P.tape);
      PX.rect(ctx, -5, -2, 10, 1, 'rgba(255,255,255,.45)');
      ctx.restore();
    });
  }

  // ---------- 地板、地毯 ----------
  // 木地板：规规整整的一排排木条——每排一样高、每块一样长，隔一排错开半块（像砌砖那样），
  // 两种很接近的木色一块隔一块。画一次存成小画布，窗口大小 / 明暗变了才重画
  const floorCache = { key: '', cv: null };
  function buildFloor(W, H, night) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const tones = [CF(night, '#D6A574'), CF(night, '#D0A06E')];
    const seam = CF(night, '#AD7B52'), lite = CF(night, '#E6BE94');
    const RH = 7, LEN = 44;                                              // 每排的高度、每块木条的长度
    for (let r = 0, y0 = 0; y0 < H; r++, y0 += RH) {
      const off = (r & 1) ? LEN / 2 : 0;
      for (let k = -1, x = -off; x < W; k++, x += LEN) {
        g.fillStyle = tones[(k + r) & 1];
        g.fillRect(x, y0, LEN, RH);
        g.fillStyle = seam;
        g.fillRect(x + LEN - 1, y0, 1, RH);                              // 木条的接头
      }
      g.fillStyle = seam;
      g.fillRect(0, y0, W, 1);                                           // 两排之间的缝
      g.fillStyle = lite;
      g.globalAlpha = 0.5;
      g.fillRect(0, y0 + 1, W, 1);                                       // 缝底下一道亮边
      g.globalAlpha = 1;
    }
    // 墙根投在地板上的一道影子
    g.fillStyle = 'rgba(60,44,66,.14)'; g.fillRect(0, 1, W, 1);
    g.fillStyle = 'rgba(60,44,66,.07)'; g.fillRect(0, 2, W, 2);
    return cv;
  }

  // 圆地毯（斜着看是个椭圆）：一圈两色相间的编织边 + 一道细线 + 里面一圈浅色环，毯面上撒着小波点
  const rugCache = { key: '', cv: null };
  function buildRug(rx, ry, night) {
    const cv = document.createElement('canvas');
    cv.width = rx * 2 + 1; cv.height = ry * 2 + 1;
    const g = cv.getContext('2d');
    const body = CF(night, '#F5E3E8'), rimA = CF(night, '#E3AEBF'), rimB = CF(night, '#FAEFF1');
    const line = CF(night, '#D595AB'), ring = CF(night, '#ECCBD5');
    for (let y = 0; y <= ry * 2; y++) {
      for (let x = 0; x <= rx * 2; x++) {
        const dx = (x - rx) / rx, dy = (y - ry) / ry, d = Math.hypot(dx, dy);
        if (d > 1) continue;
        const ang = Math.atan2(dy, dx);
        // 离边缘几个像素（按这个方向上椭圆的半径算）；边的宽度两侧宽、前后窄，才像平铺在地上的圆
        const R = 1 / Math.hypot(Math.cos(ang) / rx, Math.sin(ang) / ry);
        const m = (1 - d) * R / U.lerp(8, 2.6, Math.abs(Math.sin(ang)));
        let col = body;
        if (m < 1) col = (Math.floor((ang + Math.PI) / (Math.PI * 2) * 52) & 1) ? rimA : rimB;
        else if (m < 1.35) col = line;
        else if (m > 2.5 && m < 2.9) col = ring;
        else if (m > 3.4 && y % 5 === 0 && (x + ((y / 5) & 1) * 4) % 8 === 0) col = ring;
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
    return cv;
  }
  S.rugPos = function (L) {
    const fh = L.H - L.floorY;
    return { x: Math.round(L.W / 2), y: L.floorY + Math.round(fh * 0.55), rx: Math.round(L.W * 0.3), ry: Math.round(fh * 0.42) };
  };

  // ---------- 光 ----------
  // 从窗户照进来、落在地板上的那片光：白天是阳光（早上偏右，傍晚被拉长、偏到左边，越低越暖），晚上是月光。
  // 返回一行一行的光斑 { rows: [[y, x0, x1]…], rgb, a, x, y（猫晒太阳趴的地方）, sun }；没有就是 null
  S.beam = function (L, hour) {
    const sky = S.skyOf(hour), w = L.win;
    let pos, alt, rgb, a;
    if (sky.sun != null) {
      alt = Math.sin(Math.PI * sky.sun);
      const k = U.clamp((alt - 0.06) / 0.2, 0, 1);
      if (k <= 0) return null;
      pos = sky.sun;
      const low = 1 - U.clamp(alt / 0.5, 0, 1);
      rgb = low > 0.5 ? '255,200,120' : '255,244,184';
      a = (0.36 + 0.08 * low) * k;
    } else if (sky.star > 0.5) {
      pos = 0.72; alt = 0.7; rgb = '176,196,255';
      a = 0.10 * U.clamp((sky.star - 0.5) / 0.3, 0, 1);
    } else return null;
    const slope = (0.5 - pos) * 2.2;
    const near = L.floorY + 3 + Math.round(4 * (1 - alt));
    const far = Math.min(L.H - 3, near + 13 + Math.round(13 * (1 - alt)));
    // 光斑整体往屋里（左边）偏一些：正对着窗户的那块地板被砂盆挡着，偏过来才看得见
    const cxAt = (y) => w.x + w.w / 2 - 30 + slope * (y - L.floorY + 8);
    const rows = [];
    for (let y = near; y <= far; y++) {
      const tt = (y - near) / (far - near);
      if (Math.abs(tt - 0.54) < 1.1 / (far - near)) continue;          // 窗棂的横档投下来的影子
      const cx = cxAt(y), half = w.w / 2 * (1 + 0.16 * tt);
      rows.push([y, Math.round(cx - half), Math.round(cx - 1.5)]);
      rows.push([y, Math.round(cx + 1.5), Math.round(cx + half)]);       // 中间空一条：竖档的影子
    }
    // 猫晒太阳趴的那一排，以及光斑在这一排的左右边界
    const my = U.clamp(L.floorY + Math.round((L.H - L.floorY) * 0.42), near, far);
    const hm = w.w / 2 * (1 + 0.16 * (my - near) / (far - near));
    return { rows: rows, rgb: rgb, a: a, y: my, x0: cxAt(my) - hm, x1: cxAt(my) + hm, sun: sky.sun != null };
  };
  function drawBeam(ctx, L, b, alpha) {
    ctx.fillStyle = 'rgba(' + b.rgb + ',' + alpha.toFixed(3) + ')';
    for (const r of b.rows) {
      const x0 = Math.max(0, r[1]), x1 = Math.min(L.W, r[2]);
      if (x1 > x0) ctx.fillRect(x0, r[0], x1 - x0, 1);
    }
  }
  // 这个位置在不在光斑里（猫站在光里的时候，背后被照亮：轮廓上一圈亮边、身前拖一道影子）
  S.inBeam = function (x, y) {
    const b = S.beamNow;
    if (!b) return false;
    y = Math.round(y);
    for (const r of b.rows) if (Math.abs(r[0] - y) <= 1 && x >= r[1] - 4 && x <= r[2] + 4) return true;   // 窗棂影子那几格也算在光里
    return false;
  };
  // 猫晒太阳的地方：白天、光斑落在屏幕里、离饭碗够远才有
  S.sunSpot = function (L) {
    const b = S.beamNow;
    if (!b || !b.sun || b.a < 0.25) return null;
    // 趴着的猫有 60 多格长：整只要在光斑里、在屏幕里，还不能压到饭碗的餐垫上
    const lo = Math.max(b.x0 + 22, L.bowl.x + 68, 34), hi = Math.min(b.x1 - 22, L.W - 34);
    if (lo > hi) return null;
    return { x: Math.round(U.clamp((b.x0 + b.x1) / 2, lo, hi)), y: b.y };
  };

  // 天黑以后的明暗（main.js 在猫和家具都画完以后调）：整间屋子罩一层暗色，
  //   开着灯：灯底下一大圈是亮的，越往墙角越暗；
  //   没开灯：屋里都暗，只有窗户亮着、月光落在地板上；挡在窗前的东西（爬架、绿植、窗台上的猫）是一片剪影。
  // drawFront(c)：把地上的家具和猫按前后顺序画到 c 上（用来算哪些地方被它们挡住了）
  const lightCv = document.createElement('canvas'), silCv = document.createElement('canvas');
  S.drawLight = function (ctx, L, t, hour, drawFront) {
    const sky = S.skyOf(hour), on = S.lampOn();
    const dusk = U.clamp(sky.star / 0.55, 0, 1);
    const b = S.beamNow;
    if (dusk <= 0.01) return;
    const a = (on ? 0.36 : 0.5) * dusk;
    for (const cv of [lightCv, silCv]) if (cv.width !== L.W || cv.height !== L.H) { cv.width = L.W; cv.height = L.H; }
    const g = lightCv.getContext('2d'), w = L.win;
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, L.W, L.H);
    g.fillStyle = 'rgba(16,11,40,' + a.toFixed(3) + ')';
    g.fillRect(0, 0, L.W, L.H);
    g.globalCompositeOperation = 'destination-out';
    if (on) {
      // 灯光：以灯底下为中心一圈一圈往外暗下去
      const p = S.lampPos(L), cy = Math.round(p.y + (L.H - p.y) * 0.5);
      for (let i = 0; i < 7; i++) {
        const k = 1 - i / 7;
        PX.ellipse(g, p.x, cy, Math.round(L.W * (0.2 + 0.5 * k)), Math.round(L.H * (0.26 + 0.52 * k)), 'rgba(0,0,0,.2)');
      }
    } else if (b && !b.sun) {
      // 月光落在地板上的那一片。光是从猫身后的窗户照进来的：亮的是地板，站在光里的猫和家具朝着我们的这一面照不到，
      // 所以先把光斑涂出来、再把地上的东西从里面抠掉，只擦亮剩下的地板
      const c0 = silCv.getContext('2d');
      c0.globalCompositeOperation = 'source-over';
      c0.clearRect(0, 0, L.W, L.H);
      drawBeam(c0, L, { rows: b.rows, rgb: '0,0,0' }, 1);
      c0.globalCompositeOperation = 'destination-out';
      S.silhouette = true;
      if (drawFront) drawFront(c0);
      S.silhouette = false;
      g.globalAlpha = 0.5;
      g.drawImage(silCv, 0, 0);
      g.globalAlpha = 1;
    }
    // 窗玻璃不压暗：外面的夜色、星星、亮着灯的窗户都是原来的亮度。
    // 但只有「真正露出来的玻璃」才这样——挡在玻璃前面的东西（窗棂、爬架、绿植、窗台上的猫…）是屋里的东西，
    // 和屋里别处受一样的光。做法：先在另一张小画布上涂满玻璃那一块，再把挡在前面的东西从里面抠掉，
    // 剩下的就是露出来的玻璃，只把这一块从暗色层上擦掉
    const c = silCv.getContext('2d');
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, L.W, L.H);
    c.fillStyle = '#000';
    c.fillRect(w.x, w.y, w.w, w.h);
    c.globalCompositeOperation = 'destination-out';
    c.save();
    c.beginPath(); c.rect(w.x, w.y, w.w, w.h); c.clip();
    const mx0 = w.x + ((w.w / 2) | 0) - 1, my0 = w.y + ((w.h * 0.46) | 0);
    PX.rect(c, mx0, w.y, 2, w.h, '#000'); PX.rect(c, w.x, my0, w.w, 2, '#000');     // 窗棂
    PX.rect(c, w.x + 1, w.y + w.h - 9, 7, 9, '#000');                               // 窗台上的小花盆
    S.silhouette = true;                                                            // 画剪影：半透明的影子、光晕都不要画
    drawCatTree(c, L, t, true);
    S.drawPlant(c, L.W - 18, L.floorY + 11, t, true);
    if (drawFront) drawFront(c);
    S.silhouette = false;
    c.restore();
    g.globalAlpha = 0.85;
    g.drawImage(silCv, 0, 0);          // g 这时是 destination-out：把露出来的玻璃那一块擦掉大半
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    ctx.drawImage(lightCv, 0, 0);
  };

  S.draw = function (ctx, L, t, hour, mouse) {
    const sky = S.skyOf(hour);
    // 窗外的天色跟着电脑时间走；屋里暗不暗还要看灯：晚上开着灯，屋里就是亮的
    const night = sky.night && !S.lampOn();
    const wallA = night ? '#453C56' : '#EFD9C6';
    const wallB = night ? '#3B3349' : '#E3CAB4';
    const floorA = night ? '#4A3C52' : '#CC9A70';
    const floorB = night ? '#3C3044' : '#B07E57';
    const plank = night ? '#2E2436' : '#93603C';

    PX.rect(ctx, 0, 0, L.W, L.floorY, wallA);
    // 墙纸竖条 + 条纹里的小碎花点
    for (let x = 0; x < L.W; x += 12) {
      PX.rect(ctx, x, 0, 4, L.floorY, wallB);
      for (let y = 6 + ((x / 12) % 2) * 9; y < L.floorY - 26; y += 18) PX.rect(ctx, x + 8, y, 1, 1, night ? '#5A4F6E' : '#E8B7B2');
    }
    // 天花板底下一道石膏线
    PX.rect(ctx, 0, 0, L.W, 2, night ? '#554A66' : '#FBF1E6');
    PX.rect(ctx, 0, 2, L.W, 1, night ? '#352D45' : '#D9BDA6');
    // 下半截护墙板
    const wainY = L.floorY - 24;
    PX.rect(ctx, 0, wainY, L.W, 20, night ? '#3E3550' : '#E6CDB8');
    PX.rect(ctx, 0, wainY, L.W, 2, night ? '#55496A' : '#F6E6D8');
    for (let x = 6; x < L.W; x += 22) {
      PX.frame(ctx, x, wainY + 5, 16, 11, night ? '#352D45' : '#D7BBA4');
    }

    drawWindow(ctx, L, t, sky, night);
    drawCurtains(ctx, L, t, night);
    drawLights(ctx, L, t, night);
    drawShelf(ctx, L, t, night);
    drawCatTree(ctx, L, t, night);

    // 挂画
    drawPhotos(ctx, L, t, night, mouse);

    // 踢脚线：上沿一道亮线、下沿一道暗线
    PX.rect(ctx, 0, L.floorY - 4, L.W, 4, night ? '#342C42' : '#C49C82');
    PX.rect(ctx, 0, L.floorY - 4, L.W, 1, night ? '#42384F' : '#D9B59B');
    PX.rect(ctx, 0, L.floorY - 1, L.W, 1, night ? '#2A2338' : '#A9806A');
    // 木地板
    const fh = L.H - L.floorY, fkey = L.W + 'x' + fh + (night ? 'n' : 'd');
    if (floorCache.key !== fkey) { floorCache.key = fkey; floorCache.cv = buildFloor(L.W, fh, night); }
    ctx.drawImage(floorCache.cv, 0, L.floorY);

    // 地毯
    const rug = S.rugPos(L), rkey = rug.rx + 'x' + rug.ry + (night ? 'n' : 'd');
    if (rugCache.key !== rkey) { rugCache.key = rkey; rugCache.cv = buildRug(rug.rx, rug.ry, night); }
    PX.ellipse(ctx, rug.x, rug.y + 1, rug.rx, rug.ry, 'rgba(60,44,66,.16)');
    ctx.drawImage(rugCache.cv, rug.x - rug.rx, rug.y - rug.ry);

    // 窗户照进来的光：白天的阳光直接铺在地板和地毯上（晚上的月光在 drawLight 里做）
    S.beamNow = S.beam(L, hour);
    if (S.beamNow && (S.beamNow.sun || !S.lampOn())) drawBeam(ctx, L, S.beamNow, S.beamNow.a);
    // 开着灯：灯底下的地板上一圈暖光
    if (S.lampOn()) {
      const lp = S.lampPos(L);
      PX.ellipse(ctx, lp.x, L.floorY + Math.round(fh * 0.4), Math.round(L.W * 0.22), Math.round(fh * 0.3), 'rgba(255,226,160,.09)');
    }

    S.drawPlant(ctx, L.W - 18, L.floorY + 11, t, night);
    drawLamp(ctx, L, night);

    // 开着灯：整间屋子罩一层暖光（晚上更明显）。天黑以后的明暗由 main.js 最后调 drawLight 来压
    if (S.lampOn()) {
      ctx.fillStyle = sky.night ? 'rgba(255,206,140,.10)' : 'rgba(255,224,170,.05)';
      ctx.fillRect(0, 0, L.W, L.H);
    }
  };

  S.tick = function (dt, t) {
    if (U.chance(dt * 0.06) && S.birds.length < 2) {
      S.birds.push({ x: -0.1, y: U.rnd(0.1, 0.4), v: U.rnd(0.07, 0.14), ph: U.rnd(0, 6) });
    }
    for (let i = S.birds.length - 1; i >= 0; i--) {
      S.birds[i].x += S.birds[i].v * dt;
      if (S.birds[i].x > 1.15) S.birds.splice(i, 1);
    }
  };

  D.Scene = S;
})(window.DOLL);

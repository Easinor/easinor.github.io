// 新版猫：照着 Luna 的照片在设计画布上定稿的那只（Q 版小头、胖身子、二次元浅蓝眼、
// 嘴套 + 小下巴、白色细胡子、又长又蓬的尾巴、可换装饰品）。
// 精灵按「设计像素」生成，再按 K 倍贴到游戏的虚拟像素上。
// 这个文件要在 cat-draw.js 之后加载：它会接管 drawCat / catBox / drawHeadshot。
window.DOLL = window.DOLL || {};
(function (D) {
  'use strict';

  // 1 个设计像素 = K 个游戏虚拟像素。用 1：猫和房间同一套像素网格；
  // 房间只有 ~205x154（桌宠小窗 ~118 宽），2 倍的话猫占掉大半个屋子。
  // 想要大一点用右上角「猫 小/中/大」，那个会整体放大。
  const K = 1;

  // x 影子 / d 深点色 / m 点色（面罩、披风）/ c 身体奶茶色 / w 白毛 / e 耳内粉 / r 腮红
  // p 鼻子粉 / q 深粉 / l 虹膜浅蓝 / b 虹膜蓝 / n 瞳孔 / g 黑缎带 / k 睫毛线 / z 睡觉的 z
  // o 描边 / h 胡子
  const PAL = {
    luna: {
      x: 'rgba(58,42,64,.26)', d: '#5B4234', m: '#8C6B55', c: '#E2CDB6', w: '#FFFDF8',
      e: '#F2B8B5', r: '#FFC2CB', p: '#F28C9E', q: '#E2607A', l: '#A9D8FA', b: '#6AA8E8',
      n: '#111111', g: '#2A2A33', k: '#22304F', z: '#9DB8E8', o: '#3E2C24', h: '#F7F3EE',
      a: '#654A3B', A: '#47332A'
    },
    // 火焰色布偶：奶白身子 + 很浅的杏橘色点，不是橘猫那种深橙
    nova: {
      x: 'rgba(58,42,64,.26)', d: '#E2A273', m: '#F3C49C', c: '#FBF1E3', w: '#FFFCF6',
      e: '#F4BCB3', r: '#FFC2CB', p: '#F0A3A0', q: '#E2607A', l: '#A6DCF7', b: '#3B8DDF',
      n: '#111111', g: '#2A2A33', k: '#2F5F96', z: '#9DB8E8', o: '#8E644A', h: '#FFFCF6',
      a: '#ECAF80', A: '#D58C5A'
    }
  };

  // ---------------- 部件（和设计画布里的 Cat 组件一致） ----------------
  // 头：左半边 12 宽，镜像成 24 宽
  const HEAD = [
    '..oo........',
    '..oAo.......',
    '..oAeo......',
    '.odeedoooooo',
    '.odeedaaaaaa',
    '.oddaaaaaaaw',
    'oaaaaaaaaaaw',
    'oaaaaaaaaaww',
    'oaaaaaaaawww',
    'oaaaaaaawwww',
    'owaaaaawwwpp',
    'owwaarrcwwwp',
    'owwwwwcwwwwo',
    '.owwwwcwwwow',
    '..oowwwcccww',
    '....oowwwwww',
    '......oooooo'
  ];
  // 二次元眼：覆盖在头的第 4–10 行、第 2–8 列
  const EYES = {
    open: ['.......', '.k.....', '..kkkkk', '..kwnbk', '..bbnlb', '..bllwb', '...lll.'],
    happy: ['.......', '.......', '.k.kkk.', '..k...k', '.......', '.......', '.......'],
    sleep: ['.......', '.......', '.......', '.......', '.kk...k', '...kkk.', '.......'],
    // 嫌弃脸：眼皮压成一条平线，只露出下半截眼珠（墙上 Luna 的照片用）
    meh: ['.......', '.......', '.......', '.kkkkkk', '..bnnlb', '...lll.', '.......'],
    // 扑到玩具的得意脸：「> <」
    win: ['.......', '.kk....', '...kk..', '.....k.', '...kk..', '.kk....', '.......']
  };
  const mirror = (rows) => rows.map(r => r + r.split('').reverse().join(''));
  const rev = (r) => r.split('').reverse().join('');

  // 装饰品：[精灵, 相对头的 x, y]
  const ACC = {
    none: [],
    maid: [
      [['.ooo.oo.ooo.', 'owwwowwowwwo', 'oggggggggggo'], 6, 1],
      [mirror(['gg......', 'wwgg....', '..wwgggg', '....wowo']), 4, 16],
      [['gg..gg', 'gggggg', 'gg..gg'], 9, 17]
    ],
    scarf: [
      [mirror(['oq.......', 'oqpqq....', 'oopqqpqqp', '..ooopqqp', '.....oooo']), 3, 16],
      [['oqpqo', 'oqpqo', 'oqpqo', '.o.o.'], 14, 19]
    ],
    bow: [
      [['qq.qq', 'qpqpq', 'qq.qq'], 15, 2]
    ]
  };
  // 侧面（走、趴、睡、蹲、翻肚皮）用的短款：侧面下巴到前腿只有三四行，
  // 正面那种往下兜的 U 形领子会一路挂到腿上 / 盖住前爪。短款就是下巴底下紧紧一圈：
  // 领子 = 一行黑缎带 + 一行白蕾丝，蝴蝶结两行；围巾 = 两行 + 一小截垂下来的尾巴
  const ACC_SIDE = {
    none: [],
    maid: [
      ACC.maid[0],
      [['oggggggggggggggo', '.wowowowwowowow.'], 4, 16],
      [['gg..gg', 'gggggg'], 9, 16]
    ],
    scarf: [
      [['oqqpqqpqqpqqpqqpqo', '.oooooooooooooooo.'], 3, 16],
      [['oqpqo', '.o.o.'], 14, 18]
    ],
    bow: ACC.bow
  };
  D.ACC_NAMES = { none: 'None', maid: 'Maid', scarf: 'Scarf', bow: 'Bow' };
  D.ACC_LIST = ['none', 'maid', 'scarf', 'bow'];

  const SIT_BODY = [
    '....owwwwwwwww',
    '...omwwwwwwwww',
    '..ommmwwwwwwww',
    '.ommmmcwwwwwww',
    '.ommmmccwwwwww',
    'ommmmmcccwwwww',
    'ommmmmcccccwww',
    'ommmmmcccccccc',
    'ommmmcccowwwoc',
    'ommmmcccowwwoc',
    '.ommmmccowwwoc',
    '..oooooooooooo'
  ];
  const SIT_TAIL = [
    '...ooo.', '..odddo', '.oddddo', '.odddmo', '.odmmmo', 'odmmmo.', 'odmmmo.', 'odmmmmo',
    'odmmmmo', 'odmmmmo', '.odmmmo', '.odmmmo', '..odmmo', '.odmmo.', 'odmmo..', 'ommo...', 'oo.....'
  ];
  // 用后腿站起来（讨零食、够高处的逗猫棒、庆祝）：身子比坐着瘦高，底下两只后脚，
  // 两只前爪蜷在胸前（另外画，会一上一下地招手）
  const REAR_BODY = [
    '.....owwwwwwww',
    '....omwwwwwwww',
    '...ommwwwwwwww',
    '...ommwwwwwwww',
    '...ommcwwwwwww',
    '...ommcwwwwwww',
    '..ommmcwwwwwww',
    '..ommmccwwwwww',
    '..ommmccwwwwww',
    '.ommmmcccwwwww',
    '.ommmmcccwwwww',
    '.ommmmccccwwww',
    'ommmmmccccccww',
    'ommmmcccccccww',
    'ommmowwwwocccc',
    '.oooowwwwooooo',
    '....oooooo....'
  ];
  // 举在胸前的小爪子（爪尖朝下垂着）
  // 左边不描边：那一侧压在身子上，描了就是一道缝
  const LIE_CHEST = [
    '.ooooooooooo.',
    'wwwwwwwwwwwwo',
    'wwwwwwwwwwwwo',
    'wwwwwwwwwwwwo',
    'wwwwwwwwwwwwo',
    'wwwwwwwwwwwwo'
  ];
  // 一只小前爪（趴着、蹲伏时从下巴底下露出来）
  const SMALL_PAW = ['.ooo.', 'owwwo', 'ooooo'];
  const LIE_PAWS = ['oooooooooooo..', 'owwwwwwwwwwwo.', 'owwwwwwwowwwwo', '.oooooooooooo.'];
  const LIE_TAIL = [
    '..ooo.oooo......', '.odddoddddoo....', 'oddmmmmmmmmmoo..',
    'odmmmmmmmmmmmmo.', '.odmmmmmmmmmmmmo', '..oooooooooooooo'
  ];
  const ZZZ = ['zzzz', '..z.', '.z..', 'zzzz'];
  const WHISKER_L = ['hh...', '..hhh', '..hhh', 'hh...'];
  const WHISKER_R = WHISKER_L.map(rev);

  function head(m) {
    const rows = HEAD.slice();
    const eye = EYES[m] || EYES.open;
    for (let i = 0; i < eye.length; i++) {
      const r = rows[4 + i].split('');
      for (let j = 0; j < 7; j++) if (eye[i][j] !== '.') r[2 + j] = eye[i][j];
      rows[4 + i] = r.join('');
    }
    if (m === 'win') {
      // 得意脸再张开嘴：嘴里一点粉
      rows[12] = rows[12].slice(0, 10) + 'op';
      rows[13] = rows[13].slice(0, 10) + 'oo';
    }
    return mirror(rows);
  }
  function outline(g) {
    const h = g.length, w = g[0].length;
    const out = g.map(r => r.slice());
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (g[y][x] === '.') continue;
      const edge = y === 0 || y === h - 1 || x === 0 || x === w - 1 ||
        g[y - 1][x] === '.' || g[y + 1][x] === '.' || g[y][x - 1] === '.' || g[y][x + 1] === '.';
      if (edge) out[y][x] = 'o';
      else if (y > 0 && out[y - 1][x] === 'o' && g[y][x] === 'm') out[y][x] = 'd';
    }
    return out.map(r => r.join(''));
  }
  // 面包形身体
  function loaf(w, h) {
    const g = [];
    for (let y = 0; y < h; y++) {
      const row = [];
      for (let x = 0; x < w; x++) {
        const dx = (x + 0.5 - w / 2) / (w / 2), dy = (h - 0.5 - y) / h;
        // 指数 2.2：背是圆拱的，不是方方的一块（2.6 那版看着太扁）
        if (Math.pow(Math.abs(dx), 2.2) + Math.pow(dy, 2.2) > 1) { row.push('.'); continue; }
        const saddle = h * 0.5 + Math.abs(dx) * h * 0.2;
        let ch = y < saddle ? 'm' : 'c';
        if (dx > 0.4 && y > h * 0.5) ch = 'w';
        if (dx < -0.6 && y > h * 0.62) ch = 'w';
        row.push(ch);
      }
      g.push(row);
    }
    return outline(g);
  }
  // 沿二次贝塞尔曲线长出来的蓬松尾巴：p0 根部（埋在身体里）→ p2 尾巴尖，
  // 粗细从 r0 收到 r1，尾巴尖那一截用深色
  function tailCurve(W, H, p0, p1, p2, r0, r1) {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, u = 1 - t;
      pts.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
        u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1], t]);
    }
    const g = [];
    for (let y = 0; y < H; y++) {
      const row = [];
      for (let x = 0; x < W; x++) {
        let hit = null;
        for (const p of pts) {
          const r = r0 + (r1 - r0) * p[2];
          if (Math.hypot(x + 0.5 - p[0], y + 0.5 - p[1]) <= r) { hit = p[2]; break; }
        }
        row.push(hit === null ? '.' : hit > 0.72 ? 'd' : 'm');
      }
      g.push(row);
    }
    return outline(g);
  }
  const U01 = (v) => Math.max(0, Math.min(1, v));
  // 侧面站着的猫身：屁股一个圆、胸脯一个圆，中间一段平背 + 微微下垂的肚子。
  // 背上是披风色，胸口、肚皮、后腿根是白的
  // arch = true（蹲伏用）：背中间不塌腰，反而微微拱起来
  function catSide(W, H, arch) {
    const inE = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
    const g = [];
    for (let y = 0; y < H; y++) {
      const row = [];
      for (let x = 0; x < W; x++) {
        const px = x + 0.5, py = y + 0.5;
        const top = arch ? 4 : 5 + (px > 24 && px < 31 ? 1 : 0);
        const bot = 18 + (px > 23 && px < 33 ? 1 : 0);
        const inside = inE(px, py, 19, 12, 9, 7.5) || inE(px, py, 36, 11.5, 10, 8) ||
          (px >= 19 && px <= 36 && py >= top && py <= bot);
        if (!inside) { row.push('.'); continue; }
        let ch = py < 10.5 ? 'm' : 'c';
        if (px >= 31 && py >= 9) ch = 'w';          // 胸口
        if (py >= 16.5) ch = 'w';                   // 肚皮
        if (px < 17 && py > 14) ch = 'w';           // 后腿根
        row.push(ch);
      }
      g.push(row);
    }
    return outline(g);
  }
  // 站着的身子：上下都是圆的豆子形，背上披风、肚子和胸口白
  function bean(w, h) {
    const g = [];
    for (let y = 0; y < h; y++) {
      const row = [];
      for (let x = 0; x < w; x++) {
        const dx = (x + 0.5 - w / 2) / (w / 2), dy = (y + 0.5 - h / 2) / (h / 2);
        if (dx * dx + Math.pow(Math.abs(dy), 1.8) > 1) { row.push('.'); continue; }
        const yy = y / h;
        let ch = yy < 0.42 ? 'm' : yy > 0.7 ? 'w' : 'c';
        if (dx > 0.5 && yy > 0.35) ch = 'w';
        row.push(ch);
      }
      g.push(row);
    }
    return outline(g);
  }
  // 睡觉的尾巴：根部从身体左下缘贴地长出，平铺在身前，尾巴尖收在下巴底下
  function sleepTail(W, H) {
    const g = [];
    for (let y = 0; y < H; y++) {
      const row = [];
      for (let x = 0; x < W; x++) {
        const t = (x - 14) / 36;   // 尾巴根跟着身子左缘（第 14 列）走
        if (t < 0 || t > 1) { row.push('.'); continue; }
        const cy = 19.6 - 0.8 * Math.pow(Math.max(0, (t - 0.8) / 0.2), 2);
        let r = 2.3 + 0.4 * Math.sin(Math.PI * t) - 1.1 * Math.pow(Math.max(0, (t - 0.85) / 0.15), 1.5);
        const dy = (y + 0.5) - cy;
        if (dy < 0) r += 0.35 * Math.sin(x * 0.9);
        if (Math.abs(dy) > r) { row.push('.'); continue; }
        row.push(dy > r * 0.3 ? 'd' : 'm');
      }
      g.push(row);
    }
    return outline(g);
  }

  function grid(w, h) { const g = []; for (let y = 0; y < h; y++) g.push(new Array(w).fill('.')); return g; }
  function blit(g, spr, x, y) {
    for (let i = 0; i < spr.length; i++) for (let j = 0; j < spr[i].length; j++) {
      const ch = spr[i][j];
      if (ch !== '.' && g[y + i] && x + j >= 0 && x + j < g[0].length) g[y + i][x + j] = ch;
    }
  }
  function shadow(g, x0, x1, y) { for (let x = x0; x <= x1; x++) if (g[y][x] === '.') g[y][x] = 'x'; }

  // 生成一帧：pose = sit | lie | sleep | stand；frame 走路时左右腿交替；low 吃东西低头
  function build(pose, mood, acc, frame, low) {
    if (pose === 'sleep') mood = 'sleep';
    // 坐着（正面）用往下兜的 U 形领子；其余侧面姿势用贴着下巴的短款
    const set = pose === 'sit' ? ACC : ACC_SIDE;
    const wear = (g, hx, hy) => (set[acc] || []).forEach(p => blit(g, p[0], hx + p[1], hy + p[2]));
    const whisk = (g, hx, hy) => { blit(g, WHISKER_L, hx - 5, hy + 10); blit(g, WHISKER_R, hx + 24, hy + 10); };
    let g, W, H, hx, hy;
    if (pose === 'sit' || pose === 'groom') {
      // groom = 坐着舔爪子：一只前爪举到嘴边，头一点一点地舔（frame 0 / 1），舔的那一下吐一点舌头
      const lick = pose === 'groom', f = frame & 1;
      W = 38; H = 25; g = grid(W, H); hx = 6; hy = lick && f ? 1 : 0;
      blit(g, SIT_TAIL, 30, 6);
      blit(g, mirror(SIT_BODY), 4, 12);
      blit(g, head(mood), hx, hy);
      wear(g, hx, hy); whisk(g, hx, hy);
      if (lick) {
        // 端坐时身前那两条就是前爪。舔的是其中一只：把右边那只从地上拿走（原来的位置补成胸口的毛），
        // 再画一条同样粗细的前腿从胸口抬到嘴边，爪尖朝上
        for (let y = 20; y <= 22; y++) for (let x = 19; x <= 23; x++) g[y][x] = 'c';
        const top = hy + 13;
        blit(g, ['.ooo.'], hx + 12, top);
        for (let y = top + 1; y <= 19; y++) blit(g, ['owwwo'], hx + 12, y);
        if (f) g[top][hx + 11] = 'q';          // 舔的那一下吐一点舌头
      }
      shadow(g, 7, 33, 24);
    } else if (pose === 'rear') {
      // 用后腿站起来：frame 0 / 1 两只前爪一高一低地招（frame < 0 就并排举着不动）
      W = 38; H = 30; g = grid(W, H); hx = 6; hy = 0;
      blit(g, SIT_TAIL, 30, 11);
      blit(g, mirror(REAR_BODY), 4, 12);
      // 两条前腿从肩膀垂在胸前、爪子蜷着（先画腿、再画头：腿的上端被下巴压住，看着是从肩膀长出来的）
      const up = frame < 0 ? [0, 0] : (frame & 1) ? [-1, 1] : [1, -1];
      [[hx + 4, up[0]], [hx + 15, up[1]]].forEach(([ax, d]) => {
        for (let y = 14; y <= 20 + d; y++) blit(g, ['owwwo'], ax, y);
        blit(g, ['.ooo.'], ax, 21 + d);
      });
      blit(g, head(mood), hx, hy);
      wear(g, hx, hy); whisk(g, hx, hy);
      shadow(g, 7, 33, 29);
    } else if (pose === 'lie') {
      W = 62; H = 23; g = grid(W, H); hx = 32; hy = 0;
      blit(g, LIE_TAIL, 3, 16);
      blit(g, loaf(26, 18), 14, 4);   // 趴着的身子：18 高，背拱到耳朵根那么高，肚子还贴地
      // 胸口：一块白毛从身子前端接到下巴底下，再接到前爪，三块连成一片（不然前爪和下巴是飘着的）
      blit(g, LIE_CHEST, 36, 14);
      blit(g, head(mood), hx, hy);
      // 两只小前爪平放在地上、领结底下；领子 / 围巾最后画，压在下巴底下那一圈
      // 踩奶（frame 0 / 1）：两只前爪轮流抬起来一格再按下去
      blit(g, SMALL_PAW, hx + 6, frame === 0 ? 18 : 19); blit(g, SMALL_PAW, hx + 13, frame === 1 ? 18 : 19);
      wear(g, hx, hy); whisk(g, hx, hy);
      shadow(g, 2, 56, 22);
    } else if (pose === 'crouch') {
      // 蹲伏准备扑：前低后高，背是一张弓——屁股最高，顺着一条弧线往前越压越低，胸口和头压到最低，
      // 前爪平放在下巴底下。frame 0..3 是扭的四帧，frame < 0 是蹲着不动。
      // 扭的时候：身子 + 尾巴 + 后腿是一整块，整块往尾巴那边挪 2 格、再往头那边挪 2 格并抬 1 格，来回晃；
      // 整块平移，不拉伸不挤压，所以身子不会断。头盯着猎物不动，两只前爪按在地上也不动。尾巴另外左右甩。
      W = 62; H = 26; g = grid(W, H); hx = 29; hy = 7;
      const f = frame < 0 ? -1 : frame & 3;
      const wx = f < 0 ? 0 : [-2, 0, 2, 0][f];            // 整块左右挪
      const wy = f < 0 ? 0 : [0, 0, -1, 0][f];            // 扭向头那边时整块抬 1 格
      // 尾巴左右甩：尾巴尖在「身后低处 ↔ 背上方」之间来回扫（左 → 中 → 右 → 中），比屁股慢半拍
      const TIP = [[6, 6], [1, 10], [6, 6], [11, 4]];
      const tip = f < 0 ? [3, 9] : TIP[f];
      // 背线：屁股那段保持高，往前顺着一条平滑的坡（缓进缓出）压下去，正好接到头顶轮廓上——
      // 像脖子顺下去连着头，不是背突然断成一个台阶。
      // 做法是把身子前半截「上下压扁」：背往下压 d 格，肚皮那一行不动（不会压进地里）。
      // d 从后往前只增不减，背线中途不会再翘起来，也不会塌腰。
      const TOP = 4, BOT = 20, BEL = 23;                       // 身子（拱背版）背最高的一行、肚皮最低的一行
      const ss = (t) => t * t * (3 - 2 * t);
      const dropAt = (x) => Math.round((hy + 3 - TOP) * ss(U01((x - 12) / 16)));   // 到头那一列正好压到头顶轮廓
      const layer = grid(W, H);
      blit(layer, tailCurve(W, H, [13, 12], [5, 11], tip, 2.6, 2.0), 0, 0);
      blit(layer, catSide(W, H, true), 0, 0);
      // 先按列压扁（按目标行反推源行，不会漏行），再整块平移
      const warped = grid(W, H);
      for (let x = 0; x < W; x++) {
        const tx = x + wx;
        if (tx < 0 || tx >= W) continue;
        const d = dropAt(x);
        // 目标：背在 TOP + d，肚皮压低到 BEL（比原来低 3 格，蹲伏时肚子几乎贴地）→ 整个身子厚 3 格，不显瘦
        const k = (BEL - TOP - d) / (BOT - TOP);
        for (let ty = 0; ty < H; ty++) {
          const sy = Math.round(BOT - (BEL - ty) / k);
          if (sy < 0 || sy >= H) continue;
          const ch = layer[sy][x];
          if (ch === '.') continue;
          const y2 = ty + wy;
          if (y2 >= 0 && y2 < H) warped[y2][tx] = ch;
        }
      }
      // 把背线磨平：从屁股（尾巴根后面）到头，每一列的背只能和前一列一样高或更低，
      // 冒出来的那一两个像素削掉、削完那一格补成描边——背就是一条顺滑往下的线，没有小疙瘩
      let lowest = -1;
      for (let x = 15 + wx; x < hx && x < W; x++) {
        if (x < 0) continue;
        let top = -1;
        for (let y = 0; y < H; y++) if ('mcdo'.includes(warped[y][x])) { top = y; break; }
        if (top < 0) continue;
        if (lowest >= 0 && top < lowest) {
          for (let y = top; y < lowest; y++) warped[y][x] = '.';
          warped[lowest][x] = 'o';
          top = lowest;
        }
        lowest = top;
      }
      const bottomAt = (x) => { for (let y = H - 1; y >= 0; y--) if (warped[y][x] !== '.') return y; return 20; };
      // 后腿：跟着身子一起挪，从肚皮那一行长到地面（屁股高，后腿就长）
      const hind = (hip0, fill, sink) => {
        const hip = hip0 + wx;
        const top = Math.min(bottomAt(hip), bottomAt(hip + 1)) - sink;
        for (let y = top; y <= 23; y++) { g[y][hip - 1] = 'o'; g[y][hip] = fill; g[y][hip + 1] = fill; g[y][hip + 2] = 'o'; }
        for (let x = hip - 1; x <= hip + 2; x++) g[24][x] = 'o';
      };
      hind(19, 'c', 3);                          // 远侧后腿，藏在身子后面
      blit(g, warped.map(r => r.join('')), 0, 0);
      hind(14, 'w', 0);                          // 近侧后腿
      // 头不动：死死盯住猎物；只有身子在后面晃（接缝藏在头后面）
      const hx0 = hx;
      // 头顶上不能露出身子：头的那几列里，比头顶轮廓（两耳之间那条线，hy + 3）还高的身子像素全清掉
      for (let x = hx; x < hx + 24 && x < W; x++) for (let y = 0; y < hy + 3; y++) g[y][x] = '.';
      blit(g, head(mood), hx, hy);
      wear(g, hx, hy); whisk(g, hx, hy);
      // 两只前爪平放在地上、不跟着晃
      blit(g, SMALL_PAW, hx0 + 6, 22); blit(g, SMALL_PAW, hx0 + 13, 22);
      shadow(g, 4, 52, 25);
    } else if (pose === 'belly') {
      // 翻肚皮：身子翻过来（白肚皮朝上），四只爪子举在半空，脑袋歪着冲你笑
      W = 62; H = 23; g = grid(W, H); hx = 32; hy = 3;
      blit(g, LIE_TAIL, 3, 16);
      // 面包身上下翻过来：原来底下的白肚皮到了上面，带披风色的背贴着地
      const body = loaf(26, 15).slice().reverse();
      blit(g, body, 14, 8);
      const paw = (x, top, bot) => {
        for (let y = top; y <= bot; y++) { g[y][x - 1] = 'o'; g[y][x] = 'w'; g[y][x + 1] = 'w'; g[y][x + 2] = 'o'; }
        for (let x2 = x - 1; x2 <= x + 2; x2++) g[top - 1][x2] = 'o';
      };
      // 爪子短短地蜷在半空，高低错开，不要一排栅栏
      paw(16, 5, 9); paw(22, 6, 9); paw(29, 4, 9); paw(35, 6, 9);
      for (const px of [16, 22, 29, 35]) g[px === 22 || px === 35 ? 6 : px === 29 ? 4 : 5][px] = 'e';   // 粉肉垫
      blit(g, head(mood), hx, hy);
      wear(g, hx, hy); whisk(g, hx, hy);
      shadow(g, 2, 56, 22);
    } else if (pose === 'stand') {
      // 站着 / 走路：侧面的猫身——圆屁股、平背、头底下是深胸脯，
      // 前腿长在胸脯下、后腿长在屁股下，四条白袜子腿，尾巴从屁股翘起来。
      // 头往后收到胸脯正上方：领子、围巾就搭在胸口上，不会悬在半空。
      // frame = -1 站着不动；0..3 是小跑的四帧：对角两条腿一组，
      // 着地的那组往后蹬，另一组抬起来往前迈。
      W = 62; H = 26; g = grid(W, H);
      const walking = frame >= 0;
      hx = 28; hy = low ? 7 : (walking && (frame & 1) ? 1 : 0);
      const LEGS = [
        { hip: 16, off: 0, near: true },   // 后腿·近
        { hip: 33, off: 0, near: false },  // 前腿·远
        { hip: 20, off: 0.5, near: false },// 后腿·远
        { hip: 38, off: 0.5, near: true }  // 前腿·近
      ];
      const foot = (L) => {
        if (!walking) return { x: L.hip, y: 23 };
        const q = (frame / 4 + L.off) % 1;
        if (q < 0.5) return { x: Math.round(L.hip + 2 - 8 * q), y: 23 };
        const s = (q - 0.5) * 2;
        return { x: Math.round(L.hip - 2 + 4 * s), y: 21 };
      };
      const drawLeg = (L) => {
        const f = foot(L), top = L.near ? 16 : 14, fill = L.near ? 'w' : 'c';
        for (let y = top; y <= f.y; y++) {
          const x = Math.round(L.hip + (f.x - L.hip) * (y - top) / Math.max(1, f.y - top));
          g[y][x - 1] = 'o'; g[y][x] = fill; g[y][x + 1] = fill; g[y][x + 2] = 'o';
        }
        for (let x = f.x - 1; x <= f.x + 2; x++) g[f.y + 1][x] = 'o';
      };
      LEGS.filter(L => !L.near).forEach(drawLeg);
      // 尾巴根从屁股里面长出来（先画尾巴、再画身子盖住根部），走路时尾巴尖左右晃
      const sway = walking ? [0, 1, 0, -1][frame] : 0;
      blit(g, tailCurve(W, H, [14, 10], [2, 12], [5 + sway, 0], 2.7, 2.1), 0, 0);
      blit(g, catSide(W, H), 0, 0);
      LEGS.filter(L => L.near).forEach(drawLeg);
      blit(g, head(mood), hx, hy);
      wear(g, hx, hy); whisk(g, hx, hy);
      shadow(g, 10, 50, 25);
    } else {
      W = 62; H = 24; g = grid(W, H); hx = 32; hy = 4;
      blit(g, loaf(26, 18), 14, 4);   // 趴着的身子：18 高，背拱到耳朵根那么高，肚子还贴地
      blit(g, sleepTail(W, H), 0, 0);
      blit(g, head(mood), hx, hy);
      wear(g, hx, hy); whisk(g, hx, hy);
      // （精灵里原来画死了一个蓝色的 Z，看着像头上一块色块；睡觉时游戏会另外飘 z 粒子，这里不画了）
      shadow(g, 6, 54, 23);
    }
    return { rows: g.map(r => r.join('')), W, H, hx, hy };
  }

  // ---------------- 上色 + 缓存 ----------------
  const cache = new Map();
  function get(catId, pose, mood, acc, frame, low) {
    const key = [catId, pose, mood, acc, frame, low ? 1 : 0].join('|');
    let it = cache.get(key);
    if (it) return it;
    it = build(pose, mood, acc, frame, low);
    const pal = PAL[catId] || PAL.luna;
    const cv = document.createElement('canvas');
    cv.width = it.W; cv.height = it.H;
    const c = cv.getContext('2d');
    for (let y = 0; y < it.H; y++) for (let x = 0; x < it.W; x++) {
      const ch = it.rows[y][x];
      // x 是精灵里那条 1 像素的影子线，太细显得猫飘着；改成 drawCat 里画的椭圆影子
      if (ch === '.' || ch === 'x' || !pal[ch]) continue;
      c.fillStyle = pal[ch];
      c.fillRect(x, y, 1, 1);
    }
    it.cv = cv;
    cache.set(key, it);
    return it;
  }

  // 游戏里的姿势 → 新猫的四种身形
  const POSE_MAP = {
    sit: 'sit', gaze: 'sit', groom: 'groom', reach: 'rear', rear: 'rear',
    loaf: 'lie', knead: 'lie', rollover: 'belly', belly: 'belly',
    // stretch = 伸懒腰：前半身压低、屁股翘高，正好是蹲伏那一套身子（不扭）
    stand: 'stand', walk: 'stand', crouch: 'crouch', eatLow: 'crouch', stretch: 'crouch', eat: 'stand',
    sleep: 'sleep'
  };
  function moodOf(ov) {
    if (ov === 'eye_shut') return 'sleep';
    if (ov === 'eye_happy') return 'happy';
    if (ov === 'eye_win') return 'win';
    return 'open';
  }
  // 每只猫各戴各的：存档 settings.acc = { luna: 'maid', nova: 'scarf' }
  function accOf(catId) {
    const St = D.St;
    const a = St && St.settings && St.settings.acc;
    return (a && a[catId]) || 'none';
  }
  D.accOf = accOf;
  function current(G) {
    const pose = POSE_MAP[G.spr] || 'sit';
    let frame = 0;
    if (pose === 'stand') frame = G.gait ? (Math.floor((G.gaitPhase || 0) * 4) & 3) : -1;
    else if (pose === 'crouch') frame = G.wiggle && G.spr === 'crouch' ? (Math.floor((G.t || 0) * 9) & 3) : -1;   // 扭屁股 + 甩尾巴
    else if (pose === 'groom') frame = Math.floor((G.t || 0) * 5) & 1;                    // 舔爪子
    else if (pose === 'rear') frame = G.wave ? (Math.floor((G.t || 0) * 6) & 1) : -1;      // 招手
    else if (pose === 'lie') frame = G.spr === 'knead' ? (Math.floor((G.t || 0) * 3.2) & 1) : -1;   // 踩奶
    return get(G.catId, pose, moodOf(G.eyeOv), accOf(G.catId), frame, G.spr === 'eat');
  }
  // 精灵左上角（游戏坐标）：脚下中心对准 G.x，最底一行（影子）落在 G.y
  function origin(G, it) {
    const flip = G.facing < 0;
    return { x: Math.round(G.x - (it.W * K) / 2), y: Math.round(G.y - (G.lift || 0) - it.H * K), flip };
  }

  // 逆光的亮边：这一帧每一列最顶上的那个像素（头顶、耳朵尖、背、尾巴的上沿）换成光的颜色
  function rimOf(it, col) {
    it.rims = it.rims || {};
    if (it.rims[col]) return it.rims[col];
    const cv = document.createElement('canvas');
    cv.width = it.W; cv.height = it.H;
    const c = cv.getContext('2d');
    c.fillStyle = col;
    for (let x = 0; x < it.W; x++) {
      for (let y = 0; y < it.H; y++) {
        const ch = it.rows[y][x];
        if (ch !== '.' && ch !== 'x') { c.fillRect(x, y, 1, 1); break; }
      }
    }
    it.rims[col] = cv;
    return cv;
  }

  D.drawCat = function (ctx, G) {
    const it = current(G);
    const o = origin(G, it);
    const sil = !!(D.Scene && D.Scene.silhouette);
    // 站在窗户照进来的光里：光从背后来，身前（靠近我们这边）的地板上拖一道影子
    if (G.rim && !sil && !G.onPerch && !G.noShadow) D.PX.ellipse(ctx, Math.round(G.x), Math.round(G.y) + 2, it.W > 40 ? 22 : 13, 3, 'rgba(58,42,64,.20)');
    // 脚下的椭圆影子：贴在地上不跟着跳，跳得越高越小越淡
    const up = Math.max(0, (G.lift || 0) + (G.hopping && G.hopFrom ? Math.sin(Math.min(1, G.hopT || 0) * Math.PI) * 7 : 0));
    const k = Math.max(0.45, 1 - up / 14);
    const rx = Math.round((it.W > 40 ? 23 : 13) * K * k), ry = Math.max(1, Math.round(2.5 * K * k));
    const gy = Math.round(G.y - 1 + (G.hopping && G.hopFrom ? up : 0));
    if (!G.noShadow && !(D.Scene && D.Scene.silhouette)) D.PX.ellipse(ctx, Math.round(G.x), gy, rx, ry, 'rgba(58,42,64,' + (0.28 * k).toFixed(2) + ')');
    // sink：身子底下这么多行不画（窝在纸箱里往下缩的时候，缩下去的那一截被箱子挡住）
    const vh = Math.max(1, it.H - Math.max(0, Math.round(G.sink || 0)));
    if (o.flip) {
      ctx.save();
      ctx.translate(o.x * 2 + it.W * K, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(it.cv, 0, 0, it.W, vh, o.x, o.y, it.W * K, vh * K);
      if (G.rim && !sil) ctx.drawImage(rimOf(it, G.rim), 0, 0, it.W, vh, o.x, o.y, it.W * K, vh * K);
      ctx.restore();
    } else {
      ctx.drawImage(it.cv, 0, 0, it.W, vh, o.x, o.y, it.W * K, vh * K);
      if (G.rim && !sil) ctx.drawImage(rimOf(it, G.rim), 0, 0, it.W, vh, o.x, o.y, it.W * K, vh * K);
    }
  };

  D.catBox = function (G) {
    const it = current(G);
    const o = origin(G, it);
    const hxLocal = o.flip ? it.W - it.hx - 24 : it.hx;
    return {
      x: o.x, y: o.y, w: it.W * K, h: (it.H - 1) * K,
      head: { x: o.x + hxLocal * K, y: o.y + it.hy * K, w: 24 * K, h: 17 * K }
    };
  };
  D.catHeight = function (G) { return D.catBox(G).h; };

  // 头像（39x33 的小画布）：画整只坐着的猫，1:1 刚好放得下
  D.drawHeadshot = function (ctx, catId, x, y, eyeOv) {
    const it = get(catId, 'sit', moodOf(eyeOv), accOf(catId), 0, false);
    ctx.drawImage(it.cv, x + Math.round((39 - it.W) / 2), y + 33 - it.H - 2);
  };

  // 只画一张脸（24x17）：从坐姿那帧里把头裁出来。墙上的相框用
  // mood: open | happy | sleep | win | meh
  D.drawFace = function (ctx, catId, x, y, mood) {
    const it = get(catId, 'sit', mood || 'open', accOf(catId), 0, false);   // 照片里也戴着当前的装扮
    ctx.drawImage(it.cv, it.hx * K, it.hy * K, 24 * K, 17 * K, x, y, 24, 17);
  };

  D.NewCat = { build, get, K };
})(window.DOLL);

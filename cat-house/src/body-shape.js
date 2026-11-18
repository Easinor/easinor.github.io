// 身体用「每行半宽」生成，省得手数字符，也保证左右对称。
// 明暗规则：最左 2 列 d（背光），往里 4 列 w，最右 3 列 w，其余 W。
// 腿有两种：insideLegs（坐姿/面包猫，腿在身体轮廓里，周围压暗让腿跳出来）
// 和 standLegs / upLegs（侧身站立、翻肚皮，腿是身体外独立的柱子）。
window.DOLL = window.DOLL || {};
(function (D) {
  'use strict';
  const PX = D.PX;

  // 控制点之间平滑插值，t 从 0（屁股）到 1（胸前）
  function curve(pts, t) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (t >= a[0] && t <= b[0]) {
        const k = (b[0] - a[0]) ? (t - a[0]) / (b[0] - a[0]) : 0;
        return a[1] + (b[1] - a[1]) * (k * k * (3 - 2 * k));
      }
    }
    return pts[pts.length - 1][1];
  }

  // 封边：挨着透明的格子全改描边。只给每行（或每列）两端上描边的话，
  // 轮廓一拐弯就会漏出一排没封口的白边。
  function seal(rows, w, h) {
    const out = rows.map(r => r.slice());
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (rows[y][x] === '.') continue;
        if (y === 0 || y === h - 1 || x === 0 || x === w - 1 ||
          rows[y - 1][x] === '.' || rows[y + 1][x] === '.' ||
          rows[y][x - 1] === '.' || rows[y][x + 1] === '.') out[y][x] = 'o';
      }
    }
    return out;
  }

  // 侧身躯干：按列给出背线和腹线，这样才有圆屁股和深胸脯，
  // 不像左右对称的 half 那样只能画出一条直背。
  function buildProfile(o) {
    const P = o.profile;
    const rows = [];
    for (let y = 0; y < o.h; y++) rows.push(new Array(o.w).fill('.'));
    for (let x = P.x0; x <= P.x1; x++) {
      const t = (x - P.x0) / (P.x1 - P.x0);
      const ty = Math.round(curve(P.top, t));
      const by = Math.round(curve(P.bot, t));
      const depth = by - ty;
      if (depth < 0) continue;
      // 明暗按这一列的深度按比例分，固定像素宽的话整条背就是一条平行色带，
      // 看起来像给圆柱体打高光
      const dBand = Math.max(1, Math.round(depth * 0.10));
      const wBand = Math.max(3, Math.round(depth * 0.30));
      const bBand = Math.max(1, Math.round(depth * 0.06));
      for (let y = ty; y <= by; y++) {
        const dt = y - ty, db = by - y;
        let ch = 'W';
        if (dt <= dBand) ch = 'd';                 // 背脊压暗
        else if (dt <= wBand) ch = 'w';
        else if (db <= bBand) ch = 'w';            // 肚皮下缘
        rows[y][x] = ch;
      }
    }
    return seal(rows, o.w, o.h).map(r => r.join(''));
  }

  // 立起来的身体（坐着往上够东西）：按行给出背缘和胸缘。
  // profile 那套是横着的身子，立起来之后每列只剩一两个像素，得转个 90° 来。
  // t 从 0（脖子根）到 1（坐在地上的屁股），x 小的一侧是背。
  function buildUpright(o) {
    const P = o.upright;
    const rows = [];
    for (let y = 0; y < o.h; y++) rows.push(new Array(o.w).fill('.'));
    for (let y = P.y0; y <= P.y1; y++) {
      const t = (y - P.y0) / (P.y1 - P.y0);
      const bx = Math.round(curve(P.back, t));
      const fx = Math.round(curve(P.front, t));
      const depth = Math.max(1, fx - bx);
      const dBand = Math.max(1, Math.round(depth * 0.12));
      const wBand = Math.max(2, Math.round(depth * 0.34));
      const fBand = Math.max(1, Math.round(depth * 0.08));
      for (let x = bx; x <= fx; x++) {
        const db = x - bx, df = fx - x;
        let ch = 'W';
        if (db <= dBand) ch = 'd';            // 背脊压暗
        else if (db <= wBand) ch = 'w';
        else if (df <= fBand) ch = 'w';       // 胸前边缘
        rows[y][x] = ch;
      }
    }
    return seal(rows, o.w, o.h).map(r => r.join(''));
  }

  function build(o) {
    if (o.profile) return buildProfile(o);
    if (o.upright) return buildUpright(o);
    const w = o.w, cx = o.cx, half = o.half;
    const up = o.upLegs, down = o.standLegs;
    const upRows = up ? up.rows : 0;
    const rows = [];

    const blank = () => new Array(w).fill('.');
    const pillar = (row, pairs, cap) => {
      for (const [a, b] of pairs) {
        if (a - 1 >= 0) row[a - 1] = 'o';
        for (let x = a; x <= b; x++) row[x] = cap ? 'o' : 'W';
        if (b + 1 < w) row[b + 1] = 'o';
      }
    };

    // 朝天的腿（翻肚皮）
    for (let y = 0; y < upRows; y++) {
      const row = blank();
      pillar(row, up.pairs, y === 0);
      rows.push(row.join(''));
    }

    // 身体
    for (let y = 0; y < half.length; y++) {
      const hw = half[y];
      const x0 = cx - hw, x1 = cx + hw;
      const row = blank();
      const last = y === half.length - 1;
      for (let x = x0; x <= x1; x++) {
        if (x === x0 || x === x1 || last) { row[x] = 'o'; continue; }
        const dl = x - x0, dr = x1 - x;
        let ch = 'W';
        if (dl <= 1) ch = 'd';
        else if (dl <= 5) ch = 'w';
        else if (dr <= 2) ch = 'w';
        if (o.cape && y <= o.cape.y && dl <= o.cape.w) ch = 'd';
        row[x] = ch;
      }
      if (o.insideLegs && y >= o.insideLegs.y && !last) {
        for (let x = x0 + 1; x < x1; x++) if (row[x] === 'W') row[x] = 'w';
        for (const [a, b] of o.insideLegs.pairs) {
          for (let x = a; x <= b; x++) if (x > x0 && x < x1) row[x] = 'W';
          if (a - 1 > x0) row[a - 1] = 'o';
          if (b + 1 < x1) row[b + 1] = 'o';
        }
      }
      rows.push(row.join(''));
    }

    // 身体下面的四条腿（侧身站立）
    if (down) {
      for (let y = 0; y < down.rows; y++) {
        const row = blank();
        const pairs = (down.offsets && down.offsets[y]) ? down.offsets[y] : down.pairs;
        pillar(row, pairs, y === down.rows - 1);
        rows.push(row.join(''));
      }
    }
    return rows;
  }

  D.buildBody = function (id, o, meta) {
    const sp = PX.sprite(build(o), meta);
    sp.id = id;
    D.CAT_SPR[id] = sp;
    return sp;
  };
})(window.DOLL);

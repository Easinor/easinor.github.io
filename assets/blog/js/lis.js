/* Interactive figures for /blog/parallel-lis/.
   Depends on common.js (global Blog). Every figure runs the real algorithm
   on its current input; nothing here is a pre-recorded animation. */
(function () {
  'use strict';

  if (!window.Blog) return;

  var D = Blog.draw;
  var INF = Infinity;
  var num = Blog.num;

  /* the running example: its first 8 values are the example used in the paper */
  var EX = [52, 31, 45, 26, 61, 10, 39, 44, 58, 20, 70, 35];
  var EX_W = [2, 4, 7, 1, 9, 3, 2, 1, 2, 6, 1, 8];

  var WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen'];

  function fmt(v) { return v === INF ? '∞' : String(v); }
  function A(i) { return '<i>A</i><sub>' + (i + 1) + '</sub>'; }
  function word(n) { return n < WORDS.length ? WORDS[n] : String(n); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function times(x) { return (x >= 10 ? String(Math.round(x)) : x.toFixed(1)) + '×'; }

  function layerColor(c, r) {
    var p = [c.purple, c.blue, c.teal, c.green, c.yellow, c.orange, c.red, c.pink];
    return p[(r - 1) % p.length];
  }

  /* A press that ends where it began. Blog.pointer can deliver `down` for the
     first pixels of a touch swipe that then turns into a page scroll, so anything
     a plain tap or click should do is done on release, and only if nothing moved. */
  function tapper(fn) {
    var start = null;
    return {
      down: function (p) { start = p; },
      up: function (p) {
        var hit = start && Blog.dist(p.x, p.y, start.x, start.y) <= 8;
        var at = start;
        start = null;
        if (hit) fn(at);
      }
    };
  }

  /* ---------- algorithms ---------- */

  /* textbook O(n^2) DP: rank[i] = length of the LIS ending at a[i] (strictly increasing).
     pred[i] = the last earlier element of rank one lower that a[i] can extend. */
  function lisBrute(a) {
    var n = a.length, rank = [], pred = [], k = 0, pairs = 0, i, j;
    for (i = 0; i < n; i++) {
      rank[i] = 1; pred[i] = -1;
      for (j = 0; j < i; j++) {
        if (a[j] < a[i]) {
          pairs++;
          if (rank[j] + 1 >= rank[i]) { rank[i] = rank[j] + 1; pred[i] = j; }
        }
      }
      if (rank[i] > k) k = rank[i];
    }
    var end = -1, chain = [];
    for (i = 0; i < n; i++) if (rank[i] === k) end = i;
    for (i = end; i >= 0; i = pred[i]) chain.unshift(i);
    var layers = [];
    for (i = 0; i <= k; i++) layers.push([]);
    for (i = 0; i < n; i++) layers[rank[i]].push(i);
    return { rank: rank, pred: pred, k: k, pairs: pairs, chain: chain, layers: layers };
  }

  /* sequential O(n log k) algorithm (binary search over the smallest tail of each length) */
  function lisLength(a) {
    var tails = [], i, lo, hi, mid;
    for (i = 0; i < a.length; i++) {
      lo = 0; hi = tails.length;
      while (lo < hi) { mid = (lo + hi) >> 1; if (tails[mid] < a[i]) lo = mid + 1; else hi = mid; }
      tails[lo] = a[i];
    }
    return tails.length;
  }

  /* The parallel algorithm, simulated level by level. One round = one call of
     PrefixMin(root, +inf). The two children of a node are independent, so a
     whole tree level can be processed together; that is what `levels` records.
     Two details matter for correctness:
       - the right child gets min(LMin, T[left]) with T[left] as it was at the
         START of the round (all reads below happen before any removal);
       - a subtree that is already empty (+inf) is skipped explicitly. */
  function treeRun(a, trace) {
    var n = a.length, size = 1, depth = 1, i;
    while (size < n) { size *= 2; depth++; }
    var T = new Array(2 * size);
    for (i = 0; i < size; i++) T[size + i] = i < n ? a[i] : INF;
    for (i = size - 1; i >= 1; i--) T[i] = Math.min(T[2 * i], T[2 * i + 1]);
    var out = { size: size, depth: depth, nodes: 2 * size - 1, rank: new Array(n), rounds: [], visited: 0, initial: trace ? T.slice() : null };
    var r = 0;
    while (T[1] !== INF) {
      r++;
      var before = trace ? T.slice() : null;
      var levels = [], cur = [1, INF], taken = [], visited = 0;
      while (cur.length) {
        var next = [], evs = [];
        for (i = 0; i < cur.length; i += 2) {
          var node = cur[i], lmin = cur[i + 1], v = T[node], act;
          visited++;
          if (v === INF) act = 'empty';
          else if (v > lmin) act = 'skip';
          else if (node >= size) { act = 'take'; taken.push(node); }
          else {
            act = 'go';
            next.push(2 * node, lmin, 2 * node + 1, Math.min(lmin, T[2 * node]));
          }
          if (trace) evs.push({ node: node, lmin: lmin, val: v, act: act });
        }
        if (trace) levels.push(evs);
        cur = next;
      }
      for (i = 0; i < taken.length; i++) { out.rank[taken[i] - size] = r; T[taken[i]] = INF; }
      var set = taken;
      while (set.length && set[0] > 1) {
        var parents = [], last = -1;
        for (i = 0; i < set.length; i++) {
          var p = set[i] >> 1;
          if (p !== last) { T[p] = Math.min(T[2 * p], T[2 * p + 1]); parents.push(p); last = p; }
        }
        set = parents;
      }
      out.visited += visited;
      out.rounds.push({
        r: r, visited: visited, m: taken.length,
        taken: taken.map(function (t) { return t - size; }),
        levels: levels, before: before, after: trace ? T.slice() : null
      });
    }
    out.k = r;
    return out;
  }

  /* Development check, only reachable at /blog/parallel-lis/#selfcheck:
     the tree algorithm must agree with the O(n^2) DP on random inputs. */
  if (window.location.hash === '#selfcheck') {
    window.__lisSelfCheck = function () {
      var rnd = Blog.rng(2023), t, i, n, a, x, y;
      for (t = 0; t < 400; t++) {
        n = rnd.int(1, 40); a = [];
        for (i = 0; i < n; i++) a.push(rnd.int(1, t % 3 === 0 ? 6 : 60));
        x = lisBrute(a); y = treeRun(a, t % 2 === 0);
        if (x.k !== y.k || x.k !== lisLength(a)) return 'k mismatch on ' + a.join(' ');
        for (i = 0; i < n; i++) if (x.rank[i] !== y.rank[i]) return 'rank mismatch on ' + a.join(' ');
      }
      y = treeRun(EX, true);
      return 'ok; example ranks ' + y.rank.join(' ') + '; visited per round ' + y.rounds.map(function (q) { return q.visited; }).join(' ');
    };
  }

  /* index-vs-value plot helper */
  function plot(w, h, n, lo, hi, pad) {
    var sx = n > 1 ? (w - pad.l - pad.r) / (n - 1) : 0;
    var sy = (h - pad.t - pad.b) / (hi - lo);
    return {
      x: function (i) { return n > 1 ? pad.l + sx * i : (pad.l + w - pad.r) / 2; },
      y: function (v) { return h - pad.b - sy * (v - lo); },
      v: function (y) { return lo + (h - pad.b - y) / sy; },
      col: function (x) { return n > 1 ? Blog.clamp(Math.round((x - pad.l) / sx), 0, n - 1) : 0; }
    };
  }

  /* ==================================================================
     1. The DP and its dependences: drag the points
     ================================================================== */
  Blog.demo('demo-dp', function (fig) {
    var el = Blog.parts(fig);
    var a = EX.slice(), n = a.length, sel = 8, res = lisBrute(a), drag = null, seed = 1, g = null;
    var LO = 0, HI = 80, AXIS = 28;

    var view = Blog.canvas(el.canvas, function (ctx, w, h, c) {
      var R = Blog.clamp((w - 60) / n * 0.36, 9, 14), i, j, v;
      g = plot(w, h, n, LO, HI, { l: AXIS + 8 + R, r: 12 + R, t: 24 + R, b: 24 + R });
      g.R = R;
      var onLis = {};
      res.chain.forEach(function (q) { onLis[q] = true; });

      for (v = LO; v <= HI; v += 20) {
        D.line(ctx, AXIS, g.y(v), w - 6, g.y(v), c.line, 1);
        D.text(ctx, String(v), AXIS - 5, g.y(v), { font: Blog.mono(11), color: c.faint, align: 'right' });
      }
      for (i = 0; i < n; i++) D.text(ctx, String(i + 1), g.x(i), h - 10, { font: Blog.mono(11), color: c.faint });

      if (sel >= 0) {
        var qx = g.x(sel), qy = g.y(a[sel]);
        ctx.fillStyle = Blog.alpha(c.blue, 0.1);
        ctx.fillRect(AXIS, qy, qx - AXIS, g.y(LO) - qy);
        D.line(ctx, AXIS, qy, qx, qy, Blog.alpha(c.blue, 0.7), 1, [4, 4]);
        D.line(ctx, qx, qy, qx, g.y(LO), Blog.alpha(c.blue, 0.7), 1, [4, 4]);
        for (j = 0; j < sel; j++) {
          if (a[j] < a[sel] && j !== res.pred[sel]) D.line(ctx, g.x(j), g.y(a[j]), qx, qy, Blog.alpha(c.blue, 0.3), 1);
        }
      }

      /* one longest increasing subsequence */
      ctx.save();
      ctx.strokeStyle = Blog.alpha(c.accent, 0.4); ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      res.chain.forEach(function (q, t) { if (t) ctx.lineTo(g.x(q), g.y(a[q])); else ctx.moveTo(g.x(q), g.y(a[q])); });
      ctx.stroke();
      ctx.restore();

      if (sel >= 0 && res.pred[sel] >= 0) {
        var pj = res.pred[sel];
        D.arrow(ctx, g.x(pj), g.y(a[pj]), g.x(sel), g.y(a[sel]), c.blue, 2.2, R + 2, 8);
      }

      for (i = 0; i < n; i++) {
        var x = g.x(i), y = g.y(a[i]);
        var dep = sel >= 0 && i < sel && a[i] < a[sel];
        if (i === sel) {
          D.circle(ctx, x, y, R + 4.5, null, c.orange, 2.2);
          /* drag affordance */
          ctx.fillStyle = c.orange;
          ctx.beginPath(); ctx.moveTo(x + R + 9, y - 3); ctx.lineTo(x + R + 19, y - 3); ctx.lineTo(x + R + 14, y - 11); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.moveTo(x + R + 9, y + 3); ctx.lineTo(x + R + 19, y + 3); ctx.lineTo(x + R + 14, y + 11); ctx.closePath(); ctx.fill();
        }
        if (onLis[i]) D.circle(ctx, x, y, R, c.accent, dep ? c.blue : null, 2.6);
        else D.circle(ctx, x, y, R, c.stage, dep ? c.blue : c.ink, dep ? 2.6 : 1.5);
        D.text(ctx, String(res.rank[i]), x, y + 0.5, { font: Blog.font(R < 11 ? 11 : 12.5, 700), color: onLis[i] ? Blog.inkOn(c.accent) : c.ink });
      }
      /* value labels last, so helper lines never strike through them */
      for (i = 0; i < n; i++) {
        D.text(ctx, String(a[i]), g.x(i), g.y(a[i]) - g.R - 10, { font: Blog.mono(11, 600), color: c.muted, halo: c.stage, haloWidth: 5 });
      }
    });

    function update() {
      res = lisBrute(a);
      var lis = res.chain.map(function (q) { return a[q]; }).join(', ');
      el.readout.innerHTML = '<span>LIS length <b><i>k</i> = ' + res.k + '</b></span>' +
        '<span>one LIS: <b>' + lis + '</b></span>' +
        '<span>earlier-and-smaller pairs: <b>' + res.pairs + '</b> of ' + (n * (n - 1) / 2) + '</span>';
      if (sel < 0) {
        el.status.innerHTML = 'The number inside each point is its <i>dp</i> value: the length of the longest increasing subsequence that ends there. Select a point to see what it depends on.';
      } else {
        var deps = [], j, best = 0;
        for (j = 0; j < sel; j++) if (a[j] < a[sel]) { deps.push(a[j]); best = Math.max(best, res.rank[j]); }
        if (!deps.length) {
          el.status.innerHTML = '<b>' + A(sel) + ' = ' + a[sel] + '</b>: nothing smaller comes before it, so the best it can do is start a new subsequence. <b><i>dp</i> = 1</b>.';
        } else {
          el.status.innerHTML = '<b>' + A(sel) + ' = ' + a[sel] + '</b> can extend a subsequence ending at any earlier, smaller element (the shaded region: ' +
            deps.join(', ') + '). The best of those has <i>dp</i> ' + best + ', so <b><i>dp</i> = ' + best + ' + 1 = ' + res.rank[sel] + '</b>.';
        }
      }
      view.invalidate();
    }

    /* the point under the pointer, or -1 */
    function near(p, slack) {
      if (!g) return -1;
      var best = -1, bestD = Math.max(g.R * slack, 22), i, d;
      for (i = 0; i < n; i++) {
        d = Blog.dist(p.x, p.y, g.x(i), g.y(a[i]));
        if (d <= bestD) { best = i; bestD = d; }
      }
      return best;
    }

    function dragTo(d, y) {
      var v = Blog.clamp(Math.round(g.v(y) + d.off), 1, 79);
      if (v !== a[d.i]) { a[d.i] = v; update(); }
    }

    /* a tap or click on empty space clears the selection */
    var clear = tapper(function (p) { if (near(p, 1.7) < 0 && sel !== -1) { sel = -1; update(); } });

    Blog.pointer(el.canvas, {
      /* a touch that starts on a point drags it; anywhere else it scrolls the page */
      grab: function (p) { return near(p, 1.7) >= 0; },
      down: function (p) {
        var i = near(p, 1.7);
        clear.down(p);
        if (i < 0) return;
        sel = i;
        drag = { i: i, off: a[i] - g.v(p.y) };
        el.canvas.style.cursor = 'grabbing';
        update();
      },
      move: function (p) { if (drag) dragTo(drag, p.y); },
      up: function (p) {
        if (drag) { drag = null; el.canvas.style.cursor = ''; clear.down(null); }
        clear.up(p);
      },
      hover: function (p) {
        var i = near(p, 1.7);
        el.canvas.style.cursor = i >= 0 ? 'grab' : '';
        if (i >= 0 && i !== sel) { sel = i; update(); }
      }
    });

    /* keyboard: arrow keys travel between points, + and - change the selected value */
    Blog.keys(el.canvas, {
      points: function () {
        if (!g) return [];
        return a.map(function (v, i) { return { x: g.x(i), y: g.y(v), label: 'Position ' + (i + 1) + ', value ' + v + ', dp ' + res.rank[i] }; });
      },
      move: function (i) { if (i >= 0 && i !== sel) { sel = i; update(); } }
    });
    el.canvas.addEventListener('keydown', function (ev) {
      var step = ev.key === '+' || ev.key === '=' ? 1 : ev.key === '-' || ev.key === '_' ? -1 : 0;
      if (!step || sel < 0) return;
      ev.preventDefault();
      a[sel] = Blog.clamp(a[sel] + step, 1, 79);
      update();
    });

    function load(make) {
      return function () { a = make(); sel = 8; update(); };
    }
    el.controls.appendChild(Blog.button('Reset example', load(function () { return EX.slice(); })));
    el.controls.appendChild(Blog.button('Randomize', load(function () {
      var rnd = Blog.rng(40 + seed++), pool = [], i;
      for (i = 0; i < 25; i++) pool.push(5 + i * 3);
      return rnd.shuffle(pool).slice(0, n);
    })));
    el.controls.appendChild(Blog.button('Sort ascending', load(function () {
      return EX.map(function (_, i) { return 8 + i * 6; });
    })));
    el.controls.appendChild(Blog.button('Sort descending', load(function () {
      return EX.map(function (_, i) { return 74 - i * 6; });
    })));

    update();
  });

  /* ==================================================================
     2. Peeling prefix minima, round by round
     ================================================================== */
  Blog.demo('demo-peel', function (fig) {
    var el = Blog.parts(fig);
    var mode = 'ex', seed = 1, a, n, res, remain, step = 0, prog = 1, cancel = null, stepper = null;

    function gen() {
      var rnd = Blog.rng(500 + seed * 13), arr = [], i;
      if (mode === 'ex') return EX.slice();
      if (mode === 'rand') {
        for (i = 0; i < 36; i++) arr.push(i);
        rnd.shuffle(arr);
        return arr.map(function (v) { return Math.round(5 + v * 2.6); });
      }
      if (mode === 'up') { for (i = 0; i < 36; i++) arr.push(Math.round(5 + i * 2 + rnd.range(0, 22))); return arr; }
      if (mode === 'down') { for (i = 0; i < 36; i++) arr.push(Math.round(5 + (35 - i) * 2 + rnd.range(0, 22))); return arr; }
      for (i = 0; i < 24; i++) arr.push(rnd.pick([15, 35, 55, 75, 95]));
      return arr;
    }

    function setup() {
      a = gen(); n = a.length; res = lisBrute(a);
      remain = [0];
      var left = n, r;
      for (r = 1; r <= res.k; r++) { remain[r] = left; left -= res.layers[r].length; }
    }
    setup();

    var view = Blog.canvas(el.canvas, function (ctx, w, h, c) {
      var big = n <= 16;
      var R = big ? Blog.clamp(w / n * 0.3, 9, 13) : Blog.clamp(w / n * 0.2, 3.6, 6);
      var hiV = 0;
      a.forEach(function (q) { if (q > hiV) hiV = q; });
      hiV += 4;
      var g = plot(w, h, n, 0, hiV, { l: 12 + R, r: 28 + R, t: (big ? 32 : 16) + R, b: 12 + R });
      var topY = g.y(hiV) - R - (big ? 16 : 4), rightX = w - 22;
      var finished = step >= res.k && prog >= 1;
      var sweep = prog < 1 ? Blog.lerp(g.x(0) - R - 8, g.x(n - 1) + R + 8, prog) : Infinity;
      var i, r, labels = [];

      /* the running minimum of one round: starts at "nothing seen yet" (dashed) */
      function stair(layer, color, alpha, upto) {
        var pts = res.layers[layer];
        if (!pts.length) return;
        ctx.save();
        if (upto !== Infinity) { ctx.beginPath(); ctx.rect(0, 0, Math.max(0, upto), h); ctx.clip(); }
        ctx.strokeStyle = Blog.alpha(color, alpha * 0.7); ctx.lineWidth = 1.5;
        ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(g.x(pts[0]), topY); ctx.lineTo(g.x(pts[0]), g.y(a[pts[0]])); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = Blog.alpha(color, alpha); ctx.lineWidth = 1.8; ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(g.x(pts[0]), g.y(a[pts[0]]));
        pts.forEach(function (q, t) {
          if (!t) return;
          ctx.lineTo(g.x(q), g.y(a[pts[t - 1]]));
          ctx.lineTo(g.x(q), g.y(a[q]));
        });
        ctx.lineTo(rightX, g.y(a[pts[pts.length - 1]]));
        ctx.stroke();
        ctx.restore();
        if (upto === Infinity) labels.push({ r: layer, y: g.y(a[pts[pts.length - 1]]) });
      }

      if (finished) for (r = 1; r <= res.k; r++) stair(r, layerColor(c, r), 0.55, Infinity);
      else if (step > 0) stair(step, layerColor(c, step), 0.95, sweep);

      if (prog < 1) D.line(ctx, sweep, topY - 4, sweep, h - 6, Blog.alpha(c.ink, 0.45), 1.2, [3, 3]);

      for (i = 0; i < n; i++) {
        var x = g.x(i), y = g.y(a[i]), rk = res.rank[i], color = layerColor(c, rk);
        var assigned = rk < step || (rk === step && x <= sweep);
        var current = rk === step && !finished;
        if (!assigned) {
          D.circle(ctx, x, y, R, big ? c.stage : c.gray, big ? c.ink : null, 1.5);
        } else if (current) {
          D.circle(ctx, x, y, R + (big ? 1.5 : 1.8), color, null);
          D.circle(ctx, x, y, R + (big ? 5 : 4.5), null, Blog.alpha(color, 0.45), 1.5);
        } else {
          D.circle(ctx, x, y, big ? R : R * 0.85, finished ? color : Blog.alpha(color, 0.38), null);
        }
        if (big && assigned) {
          D.text(ctx, String(rk), x, y + 0.5, { font: Blog.font(11.5, 700), color: finished || current ? Blog.inkOn(color) : c.text });
        }
      }
      if (big) {
        for (i = 0; i < n; i++) {
          D.text(ctx, String(a[i]), g.x(i), g.y(a[i]) - R - 10, { font: Blog.mono(11, 600), color: c.muted, halo: c.stage, haloWidth: 5 });
        }
      }

      /* round numbers at the right edge, so color is never the only label */
      labels.sort(function (p, q) { return p.y - q.y; });
      var lastY = -100;
      labels.forEach(function (lb) {
        if (lb.y - lastY < 13) return;
        lastY = lb.y;
        D.text(ctx, String(lb.r), w - 11, lb.y, { font: Blog.font(11, 700), color: c.muted });
      });
    });

    function describe() {
      var scanned = 0, r, list;
      for (r = 1; r <= step; r++) scanned += remain[r];
      el.readout.innerHTML = '<span><i>n</i> = <b>' + n + '</b></span>' +
        '<span>LIS length <b><i>k</i> = ' + res.k + '</b>, so <b>' + res.k + '</b> ' + (res.k === 1 ? 'round' : 'rounds') + '</span>' +
        (step ? '<span>frontier size this round: <b>' + res.layers[step].length + '</b></span>' : '') +
        '<span>elements read by rescanning: <b>' + scanned + '</b></span>';
      if (step === 0) {
        el.status.innerHTML = 'Before round 1. Which elements have nothing smaller to their left? Those are the <b>prefix minima</b>, and their <i>dp</i> can only be 1.';
        return;
      }
      list = res.layers[step].map(function (q) { return a[q]; });
      if (list.length > 9) list = list.slice(0, 9).concat(['…']);
      el.status.innerHTML = '<b>Round ' + step + '</b>: sweep left to right with a running minimum over what is left. Every element that sets or ties the minimum gets <b><i>dp</i> = ' + step +
        '</b> and is removed: ' + list.join(', ') + '.' +
        (step === res.k ? ' Nothing is left: <b>' + word(res.k) + (res.k === 1 ? ' round' : ' rounds') + ', one per <i>dp</i> value</b>.' : '');
    }

    stepper = Blog.stepper(el.controls, {
      total: function () { return res.k; },
      interval: 1250,
      onStep: function (i, dir) {
        step = i;
        if (cancel) { cancel(); cancel = null; }
        if (dir > 0 && i > 0 && !Blog.reduced) {
          prog = 0;
          cancel = Blog.tween({ dur: 800, ease: Blog.ease.inOut, update: function (t) { prog = t; view.invalidate(); } });
        } else prog = 1;
        describe();
        view.invalidate();
      }
    });

    var seg = Blog.segmented({
      label: 'Input',
      value: 'ex',
      options: [
        { value: 'ex', label: 'Example' }, { value: 'rand', label: 'Random' },
        { value: 'up', label: 'Nearly sorted' }, { value: 'down', label: 'Nearly reversed' }, { value: 'dup', label: 'Ties' }
      ],
      onChange: function (v) { mode = v; setup(); stepper.reset(); }
    });
    el.controls.appendChild(Blog.el('span', { class: 'spacer' }));
    el.controls.appendChild(seg.el);
    el.controls.appendChild(Blog.button('Reshuffle', function () {
      seed++;
      if (mode === 'ex') seg.set('rand'); else { setup(); stepper.reset(); }
    }));
  });

  /* ==================================================================
     3. The tournament tree, one level at a time
     ================================================================== */
  Blog.demo('demo-tree', function (fig) {
    var el = Blog.parts(fig);
    var a = EX.slice(), run, steps, s = 0, sel = -1, seed = 1, lay = null, stepper = null;

    function setup() {
      run = treeRun(a, true);
      steps = [];
      run.rounds.forEach(function (R, ri) {
        R.levels.forEach(function (_, d) { steps.push({ ri: ri, kind: 'level', d: d }); });
        steps.push({ ri: ri, kind: 'update' });
      });
    }
    setup();

    function state() {
      if (s === 0) return { vals: run.initial, ev: {}, kind: 'init', ri: -1 };
      var st = steps[s - 1], R = run.rounds[st.ri], ev = {}, d, count = 0;
      var upto = st.kind === 'level' ? st.d : R.levels.length - 1;
      for (d = 0; d <= upto; d++) R.levels[d].forEach(function (e) { ev[e.node] = e; count++; });
      return { vals: st.kind === 'level' ? R.before : R.after, before: R.before, ev: ev, R: R, kind: st.kind, d: st.d, ri: st.ri, count: count };
    }

    function depthOf(i) { var d = 0; while ((i >> (d + 1)) > 0) d++; return d; }

    function layout(w, h) {
      var size = run.size, small = Blog.compact(w);
      var padX = small ? 5 : 16;
      var leafW = (w - 2 * padX) / size;
      var nodeW = Blog.clamp(leafW - 3, 15, 42), nodeH = small ? 21 : 24;
      var top = 32, bottom = 50;
      var levelH = (h - top - bottom - nodeH) / (run.depth - 1);
      lay = {
        nodeW: nodeW, nodeH: nodeH, leafW: leafW, small: small,
        pos: function (i) {
          var d = depthOf(i), j = i - (1 << d), span = size >> d;
          return { x: padX + (j + 0.5) * span * leafW, y: top + nodeH / 2 + d * levelH, d: d, lo: j * span, hi: (j + 1) * span - 1 };
        },
        leafX: function (j) { return padX + (j + 0.5) * leafW; },
        leafY: top + nodeH / 2 + (run.depth - 1) * levelH
      };
      return lay;
    }

    var view = Blog.canvas(el.canvas, function (ctx, w, h, c) {
      var L = layout(w, h), st = state(), size = run.size, i, ch, p, q, e;
      var hw = L.nodeW / 2, hh = L.nodeH / 2;
      var narrow = L.nodeW < 24;

      /* the level being processed right now: its nodes do not wait for each other */
      if (st.kind === 'level') {
        var by = L.pos(1 << st.d).y;
        D.roundRect(ctx, 2, by - hh - 7, w - 4, L.nodeH + 14, 8, Blog.alpha(c.accent, 0.09));
      }

      for (i = 1; i < size; i++) {
        p = L.pos(i);
        for (ch = 2 * i; ch <= 2 * i + 1; ch++) {
          q = L.pos(ch); e = st.ev[ch];
          var col = c.lineStrong, lw = 1;
          if (e) {
            if (e.act === 'go' || e.act === 'take') { col = c.accent; lw = 2; }
            else { col = Blog.alpha(c.red, 0.75); lw = 1.5; }
            if (st.kind === 'update') col = Blog.alpha(col, 0.45);
          }
          D.line(ctx, p.x, p.y + hh, q.x, q.y - hh, col, lw);
        }
      }

      /* LMin travels down the edges */
      if (st.kind === 'level') {
        for (i = 2; i < 2 * size; i++) {
          e = st.ev[i];
          if (!e) continue;
          p = L.pos(i >> 1); q = L.pos(i);
          var tight = q.d === run.depth - 1 && L.leafW < 30;
          var t = tight ? (i % 2 === 0 ? 0.34 : 0.7) : 0.5;
          D.text(ctx, fmt(e.lmin), Blog.lerp(p.x, q.x, t), Blog.lerp(p.y + hh, q.y - hh, t), {
            font: e.lmin === INF ? Blog.font(L.small ? 13 : 15, 700) : Blog.mono(11, 700), color: c.orangeText, halo: c.stage, haloWidth: 4
          });
        }
        if (st.ev[1]) {
          p = L.pos(1);
          D.text(ctx, 'LMin = ∞', p.x, p.y - hh - 11, { font: Blog.mono(11, 700), color: c.orangeText });
        }
      }

      for (i = 1; i < 2 * size; i++) {
        p = L.pos(i); e = st.ev[i];
        var v = st.vals[i];
        var fill = c.stage, stroke = c.gray, width = 1.3, txt = v === INF ? c.faint : c.ink, dash = null;
        if (st.kind === 'level' && e) {
          if (e.act === 'go') { fill = Blog.mix(c.stage, c.accent, 0.2); stroke = c.accent; width = 2; }
          else if (e.act === 'take') { fill = c.accent; stroke = c.accent; width = 2; txt = Blog.inkOn(c.accent); }
          else { stroke = c.red; width = 1.8; dash = [3, 3]; txt = c.muted; }
        } else if (st.kind === 'update') {
          if (e && e.act === 'take') { fill = Blog.mix(c.stage, c.accent, 0.2); stroke = c.accent; width = 2; txt = c.ink; }
          else if (st.before[i] !== v) { fill = Blog.mix(c.stage, c.green, 0.22); stroke = c.green; width = 2; txt = c.ink; }
        }
        ctx.save();
        if (dash) ctx.setLineDash(dash);
        D.roundRect(ctx, p.x - hw, p.y - hh, L.nodeW, L.nodeH, 5, fill, stroke, width);
        ctx.restore();
        D.text(ctx, fmt(v), p.x, p.y + 0.5, { font: v === INF ? Blog.font(narrow ? 13 : 16, 600) : Blog.mono(narrow ? 11 : 12, 700), color: txt });
        if (i === sel) D.roundRect(ctx, p.x - hw - 3.5, p.y - hh - 3.5, L.nodeW + 7, L.nodeH + 7, 8, null, c.orange, 2);
      }

      /* positions and the dp values handed out so far */
      for (i = 0; i < a.length; i++) {
        var lx = L.leafX(i);
        D.text(ctx, String(i + 1), lx, L.leafY + hh + 13, { font: Blog.mono(11), color: c.faint });
        var rk = run.rank[i];
        if (rk <= (st.kind === 'update' ? st.ri + 1 : st.ri)) {
          D.tag(ctx, String(rk), lx, L.leafY + hh + 33, { fill: c.muted, color: Blog.inkOn(c.muted), font: Blog.font(11, 700), height: 17, padX: 5 });
        }
      }

      /* what a selected node "sees" to its left */
      if (sel >= 1) {
        p = L.pos(sel);
        var yb = L.leafY + hh + 3.5;
        D.line(ctx, L.leafX(p.lo) - hw, yb, L.leafX(p.hi) + hw, yb, c.accent, 3);
        if (p.lo > 0) D.line(ctx, L.leafX(0) - hw, yb, L.leafX(p.lo - 1) + hw, yb, c.orange, 3);
      }
    });

    function rangeText(p) {
      return p.lo === p.hi ? 'position ' + (p.lo + 1) : 'positions ' + (p.lo + 1) + '–' + (p.hi + 1);
    }

    /* what one node holds, in words (no round in progress, or node not visited) */
    function holds(p, v) {
      if (p.lo === p.hi) {
        if (p.lo >= a.length) return '<b>Padding leaf</b>: the input has ' + a.length + ' elements, and the tree is filled up to ' + run.size + ' leaves with ∞.';
        if (v === INF) return '<b>Leaf at position ' + (p.lo + 1) + '</b>: its element, ' + a[p.lo] + ', was removed in round ' + run.rank[p.lo] + ', so the leaf now holds ∞.';
        return '<b>Leaf at position ' + (p.lo + 1) + '</b> holds ' + A(p.lo) + ' = <b>' + v + '</b>.';
      }
      if (v === INF) return '<b>Node over ' + rangeText(p) + '</b> stores ∞: nothing is left below it.';
      return '<b>Node over ' + rangeText(p) + '</b> stores <b>' + v + '</b>, the minimum of the leaves below it.';
    }

    function explain(st) {
      var p = lay.pos(sel), e = st.ev[sel], v = st.vals[sel], i;
      if (st.kind !== 'level' || !e) {
        var base = holds(p, v);
        if (st.kind !== 'level') return base;
        var cut = false;
        for (i = sel >> 1; i >= 1; i >>= 1) if (st.ev[i] && st.ev[i].act !== 'go') cut = true;
        return base + (cut ? ' It is not visited in this round: an ancestor was skipped.' : ' The walk has not reached this level yet.');
      }
      var who = p.lo === p.hi ? '<b>Leaf at position ' + (p.lo + 1) + '</b>' : '<b>Node over ' + rangeText(p) + '</b>';
      var left;
      if (p.lo === 0) left = 'Nothing lies to its left, so it receives <b>LMin = ∞</b>.';
      else if (e.lmin === INF) left = 'Everything to its left is already removed, so it receives <b>LMin = ∞</b>.';
      else left = 'Everything to its left (' + (p.lo === 1 ? 'position 1' : 'positions 1–' + p.lo) + ', orange bar) had minimum ' + e.lmin + ' when the round started, so it receives <b>LMin = ' + e.lmin + '</b>.';
      var verdict;
      if (e.act === 'go') verdict = 'Its own minimum ' + e.val + ' is ≤ LMin, so a prefix minimum hides inside: <b>descend into both children</b>.';
      else if (e.act === 'take') verdict = e.val + ' ≤ LMin, so this element is a prefix minimum: it gets <b><i>dp</i> = ' + (st.ri + 1) + '</b> and is removed.';
      else if (e.act === 'empty') verdict = 'It is already empty (∞), so it is <b>skipped</b>.';
      else if (p.lo === p.hi) verdict = e.val + ' is larger than LMin, so this element is not a prefix minimum yet: <b>it stays</b>.';
      else verdict = 'Its minimum ' + e.val + ' is larger than LMin, so nothing inside can be a prefix minimum: <b>the whole subtree is skipped with one comparison</b>.';
      return who + '. ' + left + ' ' + verdict;
    }

    function describe() {
      var st = state(), i, touched = 0;
      if (!lay) layout(el.canvas.clientWidth || 600, el.canvas.clientHeight || 400);
      for (i = 0; i < st.ri; i++) touched += run.rounds[i].visited;
      if (st.ri >= 0) touched += st.kind === 'update' ? st.R.visited : st.count;
      el.readout.innerHTML = (st.ri < 0
        ? '<span>round <b>0</b> of ' + run.k + '</span>'
        : '<span>round <b>' + (st.ri + 1) + '</b> of ' + run.k + '</span>' +
          '<span>nodes touched this round: <b>' + (st.kind === 'update' ? st.R.visited : st.count) + '</b> of ' + run.nodes + '</span>') +
        '<span>touched in total: <b>' + touched + '</b></span>' +
        '<span>rescanning the whole tree every round: <b>' + Math.max(0, st.ri + 1) * run.nodes + '</b></span>';

      if (sel >= 1) { el.status.innerHTML = explain(st); return; }
      if (st.kind === 'init') {
        el.status.innerHTML = 'Every node stores the minimum of the leaves below it; the root holds the global minimum, <b>' + fmt(run.initial[1]) +
          '</b>. Round 1 starts at the root and moves down one level per step.';
        return;
      }
      var r = st.ri + 1;
      if (st.kind === 'level') {
        var go = 0, skip = 0, take = 0;
        st.R.levels[st.d].forEach(function (e) { if (e.act === 'go') go++; else if (e.act === 'take') take++; else skip++; });
        var total = go + skip + take;
        var msg = '<b>Round ' + r + ', level ' + st.d + '</b>: ';
        if (st.d === 0) {
          msg += 'the root is tested against <span class="k k-orange">LMin</span> = ∞. It is not empty, so the walk descends into both children.';
        } else if (st.d === run.depth - 1) {
          msg += word(total) + (total === 1 ? ' leaf is' : ' leaves are') + ' tested against the <span class="k k-orange">LMin</span> handed down to ' + (total === 1 ? 'it' : 'each') + '. ';
          if (take === 0) msg += 'None passes.';
          else if (take === 1) msg += 'One passes: it is this round’s prefix minimum' + (skip ? ', and ' + word(skip) + (skip === 1 ? ' stays' : ' stay') + ' for a later round' : '') + '.';
          else msg += cap(word(take)) + ' pass: they are this round’s prefix minima' + (skip ? ', and ' + word(skip) + (skip === 1 ? ' stays' : ' stay') + ' for a later round' : '') + '.';
        } else {
          msg += word(total) + (total === 1 ? ' node is' : ' nodes are') + ' tested, each against the <span class="k k-orange">LMin</span> handed down to it. ';
          msg += cap(word(go)) + (go === 1 ? ' has' : ' have') + ' min ≤ LMin and ' + (go === 1 ? 'descends' : 'descend');
          if (skip) msg += '; ' + word(skip) + (skip === 1 ? ' is' : ' are') + ' skipped with one comparison' + (skip === 1 ? '' : ' each');
          msg += '.';
        }
        el.status.innerHTML = msg;
      } else {
        var vals = st.R.taken.map(function (q) { return a[q]; }).join(', ');
        el.status.innerHTML = '<b>Round ' + r + ' returns</b>: ' + vals + (st.R.m === 1 ? ' gets' : ' get') + ' <b><i>dp</i> = ' + r + '</b> and become' + (st.R.m === 1 ? 's' : '') +
          ' ∞. On the way back up, each node re-takes the min of its children (green). This round touched <b>' + st.R.visited + ' of ' + run.nodes + '</b> nodes.' +
          (r === run.k ? ' The root is now ∞, so the algorithm stops after <b><i>k</i> = ' + run.k + '</b> ' + (run.k === 1 ? 'round' : 'rounds') + '.' : '');
      }
    }

    function hit(p) {
      if (!lay) return -1;
      var best = -1, bestD = 1e9, i;
      for (i = 1; i < 2 * run.size; i++) {
        var q = lay.pos(i);
        var dx = Math.abs(p.x - q.x), dy = Math.abs(p.y - q.y);
        if (dx <= Math.max(lay.nodeW / 2 + 3, lay.leafW / 2) && dy <= lay.nodeH / 2 + 10 && dx + dy < bestD) { best = i; bestD = dx + dy; }
      }
      return best;
    }

    function select(i) { sel = i; describe(); view.invalidate(); }

    var treeTap = tapper(function (p) { select(hit(p)); });
    Blog.pointer(el.canvas, {
      down: treeTap.down,
      up: treeTap.up,
      hover: function (p) { var i = hit(p); if (i !== sel) select(i); },
      leave: function () { if (sel !== -1) select(-1); }
    });

    Blog.keys(el.canvas, {
      points: function () {
        if (!lay) return [];
        var st = state(), out = [], i, p;
        for (i = 1; i < 2 * run.size; i++) {
          p = lay.pos(i);
          /* x is compressed so that the arrow keys follow the tree: up = parent,
             down = a child, left and right = the neighbors on the same level */
          out.push({ x: p.x * 0.1, y: p.y, label: holds(p, st.vals[i]).replace(/<[^>]+>/g, '') });
        }
        return out;
      },
      move: function (i) { select(i >= 0 ? i + 1 : -1); }
    });

    stepper = Blog.stepper(el.controls, {
      total: function () { return steps.length; },
      interval: 1300,
      speeds: true,
      onStep: function (i) { s = i; sel = -1; describe(); view.invalidate(); }
    });
    el.controls.appendChild(Blog.button('Finish round', function () {
      var j = s + 1;
      while (j < steps.length && steps[j - 1].kind !== 'update') j++;
      stepper.pause();
      stepper.go(Math.min(j, steps.length));
    }));
    el.controls.appendChild(Blog.el('span', { class: 'spacer' }));
    el.controls.appendChild(Blog.button('Shuffle input', function () {
      var rnd = Blog.rng(900 + seed++), pool = [], i;
      for (i = 10; i < 80; i++) pool.push(i);
      a = rnd.shuffle(pool).slice(0, 12);
      setup(); stepper.reset();
    }));
    el.controls.appendChild(Blog.button('Reset input', function () { a = EX.slice(); setup(); stepper.reset(); }));
  });

  /* ==================================================================
     4. Work, span and the k dial
     ================================================================== */
  Blog.demo('demo-kdial', function (fig) {
    var el = Blog.parts(fig);
    var N = 2048, TARGETS = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];
    var CORES = [1, 2, 4, 8, 16, 32, 64, 96, 192];
    var SPLIT = 6;            /* TARGETS[0..SPLIT] use the first generator */
    var idx = 5, pIdx = 7, data = null, view = null, kSlider = null;

    /* modeled on the paper's two generators: "range" caps the LIS length by the
       number of distinct values; "line" adds a slope to random noise (the slope
       is tuned here by bisection so that the LIS length hits the target) */
    function makeInput(K, t) {
      var rnd = Blog.rng(7000 + t), arr = new Array(N), i;
      if (t <= SPLIT) { for (i = 0; i < N; i++) arr[i] = rnd.int(1, K); return arr; }
      var noise = new Array(N);
      for (i = 0; i < N; i++) noise[i] = rnd() * N;
      var lo = 0, hi = N + 1, it, mid;
      function build(slope) { var out = new Array(N), q; for (q = 0; q < N; q++) out[q] = slope * q + noise[q]; return out; }
      for (it = 0; it < 22; it++) {
        mid = (lo + hi) / 2;
        if (lisLength(build(mid)) >= K) hi = mid; else lo = mid;
      }
      return build(hi);
    }

    /* built on first approach, not at page load */
    function ensure() {
      if (data) return;
      data = TARGETS.map(function (K, t) {
        var input = makeInput(K, t), run = treeRun(input, false);
        var lo = Infinity, hi = -Infinity;
        input.forEach(function (v) { if (v < lo) lo = v; if (v > hi) hi = v; });
        return { input: input, lo: lo, flat: hi === lo, hi: hi === lo ? lo + 1 : hi, k: run.k, W: run.visited, S: run.k * run.depth, naive: run.k * run.nodes, depth: run.depth };
      });
      if (kSlider) kSlider.set(idx, true);
      describe();
    }

    /* greedy-scheduler model: equals W on one core and approaches S with many */
    function modelTime(d, P) { return d.S + (d.W - d.S) / P; }

    view = Blog.canvas(el.canvas, function (ctx, w, h, c) {
      if (!data) return;
      var d = data[idx], P = CORES[pIdx], wide = w >= 640, i;
      var sx, sy, sw, sh, cx0, cx1, cy0, cy1;
      if (wide) {
        sx = 34; sy = 42; sw = w * 0.26; sh = h - 42 - 58;
        cx0 = sx + sw + 66; cx1 = w - 20; cy0 = 30; cy1 = h - 48;
      } else {
        sx = 30; sy = 32; sw = w - 44; sh = h * 0.2;
        cx0 = 46; cx1 = w - 14; cy0 = sy + sh + 62; cy1 = h - 42;
      }

      /* the input itself */
      D.text(ctx, 'the input: ' + num(N) + ' values' + (d.flat ? ', all equal' : ''), sx, sy - 14, { font: Blog.font(11.5, 600), color: c.muted, align: 'left' });
      D.roundRect(ctx, sx, sy, sw, sh, 6, null, c.line, 1);
      ctx.fillStyle = Blog.alpha(c.accent, 0.8);
      for (i = 0; i < N; i++) {
        var px = sx + 4 + (sw - 8) * i / (N - 1);
        var py = sy + sh - 4 - (sh - 8) * (d.input[i] - d.lo) / (d.hi - d.lo);
        ctx.fillRect(px - 0.8, py - 0.8, 1.7, 1.7);
      }
      D.text(ctx, 'position →', sx + sw, sy + sh + 12, { font: Blog.font(11), color: c.faint, align: 'right' });
      ctx.save();
      ctx.translate(sx - 12, sy);
      ctx.rotate(-Math.PI / 2);
      D.text(ctx, 'value →', 0, 0, { font: Blog.font(11), color: c.faint, align: 'right' });
      ctx.restore();

      /* log-log chart: x = k, y = operations */
      var kx = function (k) { return cx0 + (cx1 - cx0) * (Math.log(k) / Math.LN2) / 11; };
      var vy = function (v) { return cy1 - (cy1 - cy0) * (Math.log(Math.max(v, 10)) / Math.LN10 - 1) / 6; };
      var ylab = ['10', '10²', '10³', '10⁴', '10⁵', '10⁶', '10⁷'];
      for (i = 0; i <= 6; i++) {
        var yy = vy(Math.pow(10, i + 1));
        D.line(ctx, cx0, yy, cx1, yy, c.line, 1);
        D.text(ctx, ylab[i], cx0 - 7, yy, { font: Blog.font(11.5), color: c.faint, align: 'right' });
      }
      [1, 4, 16, 64, 256, 2048].forEach(function (k) {
        D.line(ctx, kx(k), cy1, kx(k), cy1 + 4, c.lineStrong, 1);
        D.text(ctx, num(k), kx(k), cy1 + 14, { font: Blog.mono(11), color: c.faint, align: k === 2048 ? 'right' : 'center' });
      });
      D.text(ctx, 'LIS length k (log scale)', (cx0 + cx1) / 2, cy1 + 32, { font: Blog.font(11.5, 600), color: c.muted });
      D.text(ctx, 'operations = time steps on one core (log scale)', cx0, cy0 - 14, { font: Blog.font(11.5, 600), color: c.muted, align: 'left' });

      /* where the generator changes */
      var gx = (kx(data[SPLIT].k) + kx(data[SPLIT + 1].k)) / 2;
      D.line(ctx, gx, cy0, gx, cy1, c.line, 1, [2, 4]);
      D.text(ctx, '← few distinct values', gx - 8, cy0 + 11, { font: Blog.font(11), color: c.faint, align: 'right', halo: c.stage, haloWidth: 4 });
      D.text(ctx, 'noisy rising line →', gx + 8, cy1 - 11, { font: Blog.font(11), color: c.faint, align: 'left', halo: c.stage, haloWidth: 4 });

      function curve(get, color, width, dash) {
        ctx.save();
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        if (dash) ctx.setLineDash(dash);
        ctx.beginPath();
        data.forEach(function (q, t) { var x = kx(q.k), y = vy(get(q)); if (t) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.stroke();
        ctx.restore();
      }
      curve(function (q) { return q.naive; }, c.gray, 1.6, [5, 4]);
      curve(function (q) { return q.S; }, c.orange, 2.4);
      curve(function (q) { return modelTime(q, P); }, c.blue, 2, [2, 4]);
      curve(function (q) { return q.W; }, c.accent, 3.2);

      /* the selected k */
      var mx = kx(d.k), yW = vy(d.W), yS = vy(d.S);
      D.line(ctx, mx, cy0, mx, cy1, Blog.alpha(c.ink, 0.35), 1, [3, 3]);
      D.line(ctx, mx, yW, mx, yS, c.ink, 1.6);
      D.circle(ctx, mx, vy(d.naive), 3.5, c.gray);
      D.circle(ctx, mx, vy(modelTime(d, P)), 4, c.blue);
      D.circle(ctx, mx, yS, 5, c.orange, c.stage, 1.5);
      D.circle(ctx, mx, yW, 5.5, c.accent, c.stage, 1.5);
      var label = 'W / S ≈ ' + times(d.W / d.S);
      var right = mx < (cx0 + cx1) / 2;
      var tightGap = yS - yW < 34;
      D.text(ctx, label, mx + (right ? 9 : -9), tightGap ? yW - 16 : (yW + yS) / 2, {
        font: Blog.font(11.5, 700), color: c.ink, align: right ? 'left' : 'right', halo: c.stage, haloWidth: 4
      });
    });

    function describe() {
      if (!data) { el.status.textContent = ''; return; }
      var d = data[idx], P = CORES[pIdx];
      var par = d.W / d.S, speed = d.W / modelTime(d, P);
      var cores = P + (P === 1 ? ' core' : ' cores');
      el.readout.innerHTML =
        '<span>LIS length <b><i>k</i> = ' + num(d.k) + '</b> (= rounds)</span>' +
        '<span><span class="k k-accent">work <i>W</i></span>: <b>' + num(d.W) + '</b> tree nodes touched (' + (d.W / N).toFixed(1) + ' per element)</span>' +
        '<span>rescanning every round: <b>' + num(d.naive) + '</b></span>' +
        '<span><span class="k k-orange">span <i>S</i></span>: <i>k</i> × ' + d.depth + ' levels = <b>' + num(d.S) + '</b></span>' +
        '<span><span class="k k-blue">model</span> self-speedup on ' + cores + ' (vs. this algorithm on one core): <b>' + times(speed) + '</b></span>';
      var msg;
      if (P === 1) {
        msg = 'On one core the model time is just the work <i>W</i>, so what matters is that <i>W</i> stays small. It does: from <i>k</i> = 1 to <i>k</i> = <i>n</i> the work grows by only about ' +
          Math.round(data[data.length - 1].W / data[0].W) + '×.';
      } else if (par >= P) {
        msg = 'The parallelism <i>W</i>/<i>S</i> ≈ ' + num(par) + ' is larger than the ' + cores + ', so the model keeps nearly all of them busy.';
      } else if (par >= P / 4) {
        msg = 'The parallelism <i>W</i>/<i>S</i> ≈ ' + num(par) + ' is now below the ' + cores + ': there is work for about ' + num(par) + ' of them at a time.';
      } else {
        msg = 'With ' + num(d.k) + ' rounds one after another, the model time is close to the span <i>S</i>. The work is still only ' + (d.W / N).toFixed(1) +
          ' node visits per element, so the total cost stays close to the sequential algorithm’s.';
      }
      el.status.innerHTML = msg;
      view.invalidate();
    }

    kSlider = Blog.slider({
      label: 'LIS length k', min: 0, max: TARGETS.length - 1, value: idx,
      format: function (v) { return num(data ? data[v].k : TARGETS[v]); },
      onInput: function (v) { idx = v; describe(); }
    });
    el.controls.appendChild(kSlider.el);
    el.controls.appendChild(Blog.slider({
      label: 'Cores P', min: 0, max: CORES.length - 1, value: pIdx,
      format: function (v) { return String(CORES[v]); },
      onInput: function (v) { pIdx = v; describe(); }
    }).el);

    Blog.inView(fig, ensure, null, '500px 0px');
  });

  /* ==================================================================
     5. Weighted LIS: a max over the lower-left quadrant, and the staircase
     ================================================================== */
  Blog.demo('demo-wlis', function (fig) {
    var el = Blog.parts(fig);
    var a = EX, n = a.length, base = lisBrute(a), k = base.k;
    var wts = EX_W.slice(), dp, pred, best, s = 0, sel = -1, seed = 1, gL = null, stepper = null;
    var LO = 0, HI = 80, AXIS = 26;

    function compute() {
      var i, j, r, top = -1;
      dp = new Array(n); pred = new Array(n);
      for (r = 1; r <= k; r++) {
        base.layers[r].forEach(function (q) {
          var m = 0, arg = -1;
          for (j = 0; j < q; j++) if (a[j] < a[q] && dp[j] > m) { m = dp[j]; arg = j; }
          dp[q] = m + wts[q]; pred[q] = arg;
        });
      }
      for (i = 0; i < n; i++) if (top < 0 || dp[i] > dp[top]) top = i;
      best = [];
      for (i = top; i >= 0; i = pred[i]) best.unshift(i);
    }
    compute();

    /* the candidates of a query for `q`: already scored, smaller value.
       `stair` marks the ones no earlier candidate covers. */
    function eligible(q) {
      var out = [], j, runMax = 0;
      for (j = 0; j < n; j++) {
        if (j !== q && base.rank[j] < base.rank[q] && a[j] < a[q]) {
          var on = dp[j] > runMax;
          if (on) runMax = dp[j];
          out.push({ j: j, stair: on });
        }
      }
      return out;
    }

    function pads(w, R) { return { l: AXIS + 8 + R, r: 8 + R, t: 34 + R, b: 24 + R }; }
    function radius(w) { return Blog.clamp((w - 50) / n * 0.38, 8.5, 13); }
    function done(q) { return base.rank[q] <= s; }

    var left = Blog.canvas(el.canvases[0], function (ctx, w, h, c) {
      var R = radius(w), i, v;
      var g = plot(w, h, n, LO, HI, pads(w, R));
      gL = g; gL.R = R;
      for (v = LO; v <= HI; v += 20) {
        D.line(ctx, AXIS, g.y(v), w - 6, g.y(v), c.line, 1);
        D.text(ctx, String(v), AXIS - 4, g.y(v), { font: Blog.mono(11), color: c.faint, align: 'right' });
      }
      for (i = 0; i < n; i++) D.text(ctx, String(i + 1), g.x(i), h - 10, { font: Blog.mono(11), color: c.faint });

      if (sel >= 0 && done(sel)) {
        var qx = g.x(sel), qy = g.y(a[sel]);
        ctx.fillStyle = Blog.alpha(c.green, 0.12);
        ctx.fillRect(AXIS, qy, qx - AXIS, g.y(LO) - qy);
        D.line(ctx, AXIS, qy, qx, qy, Blog.alpha(c.green, 0.8), 1, [4, 4]);
        D.line(ctx, qx, qy, qx, g.y(LO), Blog.alpha(c.green, 0.8), 1, [4, 4]);
      }
      if (s >= k) {
        ctx.save();
        ctx.strokeStyle = Blog.alpha(c.green, 0.45); ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath();
        best.forEach(function (q, t) { if (t) ctx.lineTo(g.x(q), g.y(a[q])); else ctx.moveTo(g.x(q), g.y(a[q])); });
        ctx.stroke();
        ctx.restore();
      }
      for (i = 0; i < n; i++) {
        if (base.rank[i] === s && pred[i] >= 0 && i !== sel) {
          D.arrow(ctx, g.x(pred[i]), g.y(a[pred[i]]), g.x(i), g.y(a[i]), Blog.alpha(c.accent, 0.5), 1.4, R + 2, 6);
        }
      }
      if (sel >= 0 && done(sel) && pred[sel] >= 0) {
        D.arrow(ctx, g.x(pred[sel]), g.y(a[pred[sel]]), g.x(sel), g.y(a[sel]), c.green, 2.4, R + 2, 8);
      }
      for (i = 0; i < n; i++) {
        var x = g.x(i), y = g.y(a[i]);
        if (i === sel) D.circle(ctx, x, y, R + 4.5, null, c.orange, 2.2);
        if (!done(i)) { D.circle(ctx, x, y, R, c.stage, c.gray, 1.5); D.text(ctx, String(wts[i]), x, y + 0.5, { font: Blog.font(11.5, 700), color: c.muted }); }
        else if (base.rank[i] === s) { D.circle(ctx, x, y, R, c.accent); D.text(ctx, String(wts[i]), x, y + 0.5, { font: Blog.font(11.5, 700), color: Blog.inkOn(c.accent) }); }
        else { D.circle(ctx, x, y, R, Blog.mix(c.stage, c.accent, 0.22), c.accent, 1.5); D.text(ctx, String(wts[i]), x, y + 0.5, { font: Blog.font(11.5, 700), color: c.ink }); }
      }
      for (i = 0; i < n; i++) {
        if (done(i)) D.tag(ctx, String(dp[i]), g.x(i), g.y(a[i]) - R - 12, { fill: c.green, color: Blog.inkOn(c.green), font: Blog.font(11, 700), height: 17, padX: 5 });
      }
    });

    var right = Blog.canvas(el.canvases[1], function (ctx, w, h, c) {
      var R = radius(w), i, v;
      var maxDp = 0;
      for (i = 0; i < n; i++) if (dp[i] > maxDp) maxDp = dp[i];
      var top = Math.max(10, Math.ceil(maxDp / 5) * 5);
      var pd = pads(w, R);
      pd.t += 16;
      var g = plot(w, h, n, 0, top, pd);
      var tick = top > 30 ? 10 : 5;
      for (v = 0; v <= top; v += tick) {
        D.line(ctx, AXIS, g.y(v), w - 6, g.y(v), c.line, 1);
        D.text(ctx, String(v), AXIS - 4, g.y(v), { font: Blog.mono(11), color: c.faint, align: 'right' });
      }
      for (i = 0; i < n; i++) D.text(ctx, String(i + 1), g.x(i), h - 10, { font: Blog.mono(11), color: c.faint });

      if (sel < 0 || !done(sel)) {
        D.text(ctx, s === 0 ? 'Step into round 1 to see a query.' : 'Select a scored point in the first panel.', w / 2 + AXIS / 2, h / 2, { font: Blog.font(12.5, 600), color: c.faint });
        return;
      }
      var list = eligible(sel), prevX = AXIS, prevY = g.y(0), ans = null;
      var qx = g.x(sel);

      ctx.save();
      ctx.strokeStyle = c.green; ctx.lineWidth = 2; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(prevX, prevY);
      list.forEach(function (e) {
        if (!e.stair) return;
        ctx.lineTo(g.x(e.j), prevY);
        prevY = g.y(dp[e.j]);
        ctx.lineTo(g.x(e.j), prevY);
        if (e.j < sel) ans = e.j;
      });
      ctx.lineTo(w - 6, prevY);
      ctx.stroke();
      ctx.restore();

      D.line(ctx, qx, g.y(top) - 6, qx, g.y(0), c.orange, 1.6, [5, 4]);
      D.text(ctx, 'query: before position ' + (sel + 1), Blog.clamp(qx, 82, w - 82), g.y(top) - 16, { font: Blog.font(11, 700), color: c.orangeText, halo: c.stage });

      if (ans !== null) D.line(ctx, g.x(ans), g.y(dp[ans]), qx, g.y(dp[ans]), c.orange, 2.4);

      list.forEach(function (e) {
        var x = g.x(e.j), y = g.y(dp[e.j]), late = e.j > sel;
        if (e.stair) {
          D.circle(ctx, x, y, 6, late ? Blog.alpha(c.green, 0.4) : c.green, c.stage, 1.5);
          D.text(ctx, String(dp[e.j]), x, y - (e.j === ans ? 21 : 15), { font: Blog.font(11, 700), color: late ? c.faint : c.ink, halo: c.stage });
        } else {
          D.line(ctx, x - 4.5, y - 4.5, x + 4.5, y + 4.5, c.gray, 1.8);
          D.line(ctx, x - 4.5, y + 4.5, x + 4.5, y - 4.5, c.gray, 1.8);
        }
      });
      if (ans !== null) D.circle(ctx, g.x(ans), g.y(dp[ans]), 10.5, null, c.orange, 2.2);
      else D.text(ctx, 'no candidate before it: max = 0', Blog.clamp(qx, 98, w - 98), g.y(0) - 13, { font: Blog.font(11, 700), color: c.orangeText, halo: c.stage });
    });

    function redraw() { left.invalidate(); right.invalidate(); }

    function describe() {
      var msg;
      if (s === 0) {
        msg = 'Each point shows its weight. Nothing is scored yet. The rounds are the same ' + word(k) + ' frontiers as before; only what gets written changes.';
      } else if (sel >= 0 && !done(sel)) {
        msg = '<b>' + A(sel) + ' = ' + a[sel] + '</b> belongs to frontier ' + base.rank[sel] + ', so it waits for round ' + base.rank[sel] + ': its score needs the final scores of everything it depends on.';
      } else if (sel >= 0) {
        var m = pred[sel] >= 0 ? dp[pred[sel]] : 0;
        msg = '<b>Round ' + base.rank[sel] + ', query for ' + A(sel) + ' = ' + a[sel] + '</b> (weight ' + wts[sel] + '): ' +
          (pred[sel] >= 0
            ? 'among earlier, smaller elements the best total so far is <b>' + m + '</b> (ending at ' + a[pred[sel]] + ').'
            : 'no earlier element is smaller, so the best total so far is <b>0</b>.') +
          ' Score = ' + m + ' + ' + wts[sel] + ' = <b>' + dp[sel] + '</b>.';
      } else msg = 'Select a scored point to see the query it made.';
      if (s >= k) {
        var total = dp[best[best.length - 1]];
        var lisW = 0;
        base.chain.forEach(function (q) { lisW += wts[q]; });
        msg += ' <b>Done.</b> Heaviest increasing subsequence: ' + best.map(function (q) { return a[q]; }).join(', ') + ' (weight <b>' + total + '</b>, length ' + best.length +
          '). The longest one from before, ' + base.chain.map(function (q) { return a[q]; }).join(', ') + ', weighs ' + lisW + '.';
      }
      el.status.innerHTML = msg;
      el.readout.innerHTML = '<span>round <b>' + s + '</b> of ' + k + '</span>' +
        (s ? '<span>queries answered in parallel this round: <b>' + base.layers[s].length + '</b></span>' : '');
    }

    function pickDefault() {
      if (s === 0) return -1;
      var cand = base.layers[s], pick = cand[0], most = -1;
      cand.forEach(function (q) {
        var size = eligible(q).length;
        if (size > most) { most = size; pick = q; }
      });
      return pick;
    }

    function select(i) { sel = i; describe(); redraw(); }

    Blog.pointer(el.canvases[0], tapper(function (p) {
      if (!gL) return;
      var i = gL.col(p.x);
      if (Blog.dist(p.x, p.y, gL.x(i), gL.y(a[i])) > Math.max(gL.R * 2.2, 26)) return;
      select(i);
    }));

    Blog.keys(el.canvases[0], {
      points: function () {
        if (!gL) return [];
        return a.map(function (v, i) {
          return { x: gL.x(i), y: gL.y(v), label: 'Position ' + (i + 1) + ', value ' + v + ', weight ' + wts[i] + (done(i) ? ', score ' + dp[i] : ', not scored yet') };
        });
      },
      move: function (i) { if (i >= 0) select(i); }
    });

    stepper = Blog.stepper(el.controls, {
      total: k,
      interval: 1700,
      onStep: function (i) { s = i; sel = pickDefault(); describe(); redraw(); }
    });
    el.controls.appendChild(Blog.el('span', { class: 'spacer' }));
    el.controls.appendChild(Blog.button('Shuffle weights', function () {
      var rnd = Blog.rng(300 + seed++);
      wts = wts.map(function () { return rnd.int(1, 9); });
      compute(); sel = pickDefault(); describe(); redraw();
    }));
    el.controls.appendChild(Blog.button('Reset weights', function () {
      wts = EX_W.slice(); compute(); sel = pickDefault(); describe(); redraw();
    }));
  });
})();

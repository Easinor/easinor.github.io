/* Interactive figures for /blog/parallel-ch/ (SPoCH, ICS 2025).
   Everything here is computed live: real Dijkstra, real witness searches,
   real contraction, real upward bidirectional queries. Depends on common.js. */
(function () {
  'use strict';

  var D = Blog.draw;
  var INF = Infinity;
  var NAMES = 'ABCDEFGHIJ';

  /* ======================================================================
     Algorithms
     ====================================================================== */

  /* binary min-heap of (key, value); ties broken by value so runs are deterministic */
  function Heap() { this.keys = []; this.vals = []; }
  Heap.prototype.size = function () { return this.keys.length; };
  Heap.prototype.less = function (i, j) {
    return this.keys[i] < this.keys[j] || (this.keys[i] === this.keys[j] && this.vals[i] < this.vals[j]);
  };
  Heap.prototype.swap = function (i, j) {
    var k = this.keys[i], v = this.vals[i];
    this.keys[i] = this.keys[j]; this.vals[i] = this.vals[j];
    this.keys[j] = k; this.vals[j] = v;
  };
  Heap.prototype.push = function (key, val) {
    var i = this.keys.length, p;
    this.keys.push(key); this.vals.push(val);
    while (i > 0) {
      p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p); i = p;
    }
  };
  Heap.prototype.pop = function () {
    var n = this.keys.length - 1, out = { key: this.keys[0], val: this.vals[0] }, i = 0, l, r, m;
    this.swap(0, n); this.keys.pop(); this.vals.pop();
    for (;;) {
      l = 2 * i + 1; r = l + 1; m = i;
      if (l < n && this.less(l, m)) m = l;
      if (r < n && this.less(r, m)) m = r;
      if (m === i) break;
      this.swap(i, m); i = m;
    }
    return out;
  };

  function pairKey(a, b) { return a < b ? a + ',' + b : b + ',' + a; }

  function neighbors(row) {
    var out = [], k;
    for (k in row) out.push(+k);
    out.sort(function (x, y) { return x - y; });
    return out;
  }

  /* undirected weighted graph as an array of { neighbor: weight } rows */
  function adjFrom(n, edges) {
    var adj = [], i;
    for (i = 0; i < n; i++) adj.push({});
    edges.forEach(function (e) { adj[e[0]][e[1]] = e[2]; adj[e[1]][e[0]] = e[2]; });
    return adj;
  }

  /* Dijkstra on `adj`. opt.skip: pretend this vertex is absent.
     opt.targets: stop once all of them are settled. opt.target: stop at this one.
     opt.limit: give up after settling this many vertices. */
  function dijkstra(adj, src, opt) {
    opt = opt || {};
    var dist = {}, parent = {}, done = {}, order = [], heap = new Heap();
    var want = {}, remaining = 0, skip = opt.skip == null ? -1 : opt.skip;
    var top, u, key, v, nd;
    if (opt.targets) opt.targets.forEach(function (x) { if (!want[x]) { want[x] = true; remaining++; } });
    dist[src] = 0; heap.push(0, src);
    while (heap.size()) {
      top = heap.pop(); u = top.val;
      if (done[u]) continue;
      done[u] = true; order.push(u);
      if (want[u]) { remaining--; if (remaining === 0) break; }
      if (opt.target === u) break;
      if (opt.limit && order.length >= opt.limit) break;
      for (key in adj[u]) {
        v = +key;
        if (v === skip || done[v]) continue;
        nd = top.key + adj[u][key];
        if (dist[v] === undefined || nd < dist[v]) { dist[v] = nd; parent[v] = u; heap.push(nd, v); }
      }
    }
    return { dist: dist, parent: parent, done: done, order: order };
  }

  function pathTo(parent, src, v) {
    var out = [v];
    while (v !== src && parent[v] !== undefined) { v = parent[v]; out.push(v); }
    return out.reverse();
  }

  /* What would contracting v do in the overlay `adj`?
     For every pair (a, b) of v's neighbors, run a witness search: the shortest
     a-b distance that avoids v. A shortcut is needed iff the path through v is
     at least as short (v lies on a shortest path; a tie still needs it).
     This matches the paper's test "w(a,v) + w(v,b) = dist(a,b)" whenever both
     edges at v are themselves shortest paths; when one is not, this version can
     add a shortcut the paper's test would skip, which is harmless.
     `cap` bounds each search; a search that gives up counts as "no witness". */
  function analyze(adj, v, cap) {
    var ns = neighbors(adj[v]), out = [], i, j, a, b, res, via, wit, direct;
    for (i = 0; i < ns.length - 1; i++) {
      a = ns[i];
      res = dijkstra(adj, a, { skip: v, targets: ns.slice(i + 1), limit: cap });
      for (j = i + 1; j < ns.length; j++) {
        b = ns[j];
        via = adj[v][a] + adj[v][b];
        wit = res.done[b] ? res.dist[b] : INF;
        direct = adj[a][b];
        out.push({
          a: a, b: b, via: via, wit: wit,
          witPath: res.done[b] ? pathTo(res.parent, a, b) : null,
          need: via <= wit && (direct === undefined || direct > via)
        });
      }
    }
    return out;
  }

  /* insert the needed shortcuts of `pairs` (keeping the smaller weight on a clash) */
  function addShortcuts(adj, v, pairs, sc, list, mids, at) {
    var added = [];
    pairs.forEach(function (p) {
      if (!p.need) return;
      var cur = adj[p.a][p.b], key;
      if (cur !== undefined && cur <= p.via) return;
      key = pairKey(p.a, p.b);
      adj[p.a][p.b] = p.via; adj[p.b][p.a] = p.via;
      mids[key] = v;
      if (!sc[key]) { sc[key] = { a: p.a, b: p.b, w: p.via, mid: v, at: at }; list.push(sc[key]); }
      else { sc[key].w = p.via; sc[key].mid = v; }
      added.push(sc[key]);
    });
    return added;
  }

  /* A contraction-hierarchy build that can be advanced a little at a time.
     opts.parallel: each step contracts every vertex whose score is a strict
       local minimum, i.e. an independent set. Otherwise one global-minimum
       vertex per step.
     opts.prio: tie-break rank per vertex (lower wins); default is the index.
     opts.cap: settle limit of each witness search.
     Score = shortcuts needed - degree (edge difference) [+ opts.depth * depth]. */
  function makeBuilder(n, edges, opts) {
    opts = opts || {};
    var adj = adjFrom(n, edges), alive = [], score = [], depth = [], removedAt = [], up = [];
    var sc = {}, list = [], mids = {}, picks = [], affected = [], left = n, step = 0, cursor = 0, v;
    var prio = opts.prio || null;
    for (v = 0; v < n; v++) { alive.push(true); score.push(0); depth.push(0); removedAt.push(-1); up.push({}); affected.push(v); }

    function wins(u, w) { return prio ? prio[u] < prio[w] : u < w; }

    function rescore(x) {
      var need = 0;
      analyze(adj, x, opts.cap).forEach(function (p) { if (p.need) need++; });
      score[x] = need - neighbors(adj[x]).length + (opts.depth ? opts.depth * depth[x] : 0);
    }

    function contractRound() {
      var chosen = [], best = -1, key, ok, u, x;
      for (x = 0; x < n; x++) {
        if (!alive[x]) continue;
        if (opts.parallel) {
          ok = true;
          for (key in adj[x]) {
            u = +key;
            if (score[u] < score[x] || (score[u] === score[x] && wins(u, x))) { ok = false; break; }
          }
          if (ok) chosen.push(x);
        } else if (best < 0 || score[x] < score[best] || (score[x] === score[best] && wins(x, best))) best = x;
      }
      if (!opts.parallel) chosen.push(best);

      /* plan every contraction against the same overlay, then apply them all */
      var plans = chosen.map(function (y) { return analyze(adj, y, opts.cap); });
      chosen.forEach(function (y, ci) { addShortcuts(adj, y, plans[ci], sc, list, mids, step); });
      var touched = {};
      chosen.forEach(function (y) {
        var k2;
        for (k2 in adj[y]) {
          up[y][k2] = adj[y][k2];
          delete adj[+k2][y];
          touched[k2] = true;
          depth[+k2] = Math.max(depth[+k2], depth[y] + 1);
        }
        adj[y] = {}; alive[y] = false; removedAt[y] = step; left--;
      });
      affected = neighbors(touched);
      picks.push(chosen);
      step++;
    }

    return {
      /* do a bounded amount of work; true once the hierarchy is complete */
      work: function () {
        if (left === 0) return true;
        if (cursor < affected.length) {
          var end = Math.min(affected.length, cursor + 10);
          while (cursor < end) rescore(affected[cursor++]);
          return false;
        }
        contractRound();
        cursor = 0;
        return left === 0;
      },
      result: function () {
        return { removedAt: removedAt, up: up, mids: mids, shortcuts: list, picks: picks, steps: step };
      }
    };
  }

  function simulate(n, edges, opts) {
    var b = makeBuilder(n, edges, opts);
    while (!b.work()) { /* run to completion */ }
    return b.result();
  }

  /* Run a builder in slices of a few milliseconds once `fig` is near the
     viewport, so that building a hierarchy never blocks scrolling. */
  function buildWhenNear(fig, builder, done) {
    var started = false;
    Blog.inView(fig, function () {
      if (started) return;
      started = true;
      (function slice() {
        var t0 = Date.now(), finished = false;
        while (!finished && Date.now() - t0 < 8) finished = builder.work();
        if (finished) done(builder.result()); else setTimeout(slice, 0);
      })();
    }, null, '1200px 0px');
  }

  /* CH query: two Dijkstras that only follow upward edges, one from each end.
     A side stops once its smallest queued label is >= the best meeting so far.
     opt.naive: stop at the first meeting instead (wrong on purpose). */
  function chQuery(up, s, t, opt) {
    opt = opt || {};
    var lab = { f: {}, b: {} }, par = { f: {}, b: {} }, done = { f: {}, b: {} };
    var heap = { f: new Heap(), b: new Heap() }, count = { f: 0, b: 0 };
    var mu = INF, meet = -1, events = [], side = 'b', other, top, v, key, x, nd, cand, guard = 0;
    lab.f[s] = 0; heap.f.push(0, s);
    lab.b[t] = 0; heap.b.push(0, t);

    function clean(sd) {
      var h = heap[sd];
      while (h.size() && (done[sd][h.vals[0]] || h.keys[0] > lab[sd][h.vals[0]])) h.pop();
      return h.size() ? h.keys[0] : INF;
    }
    function open(sd) { return clean(sd) < mu; }

    while (guard++ < 100000) {
      if (!open('f') && !open('b')) break;
      side = side === 'f' ? 'b' : 'f';
      if (!open(side)) side = side === 'f' ? 'b' : 'f';
      other = side === 'f' ? 'b' : 'f';
      top = heap[side].pop(); v = top.val;
      done[side][v] = true; count[side]++;
      var ev = { side: side, v: v, key: top.key, relaxed: [], improved: false, seenBefore: false };
      if (lab[other][v] !== undefined) {
        cand = lab.f[v] + lab.b[v];
        ev.cand = cand;
        ev.seenBefore = !!done[other][v];
        if (cand < mu) { mu = cand; meet = v; ev.improved = true; }
      }
      for (key in up[v]) {
        x = +key;
        if (done[side][x]) continue;
        nd = top.key + up[v][key];
        if (lab[side][x] === undefined || nd < lab[side][x]) {
          lab[side][x] = nd; par[side][x] = v; heap[side].push(nd, x);
          ev.relaxed.push(x);
        }
      }
      ev.mu = mu; ev.meet = meet;
      events.push(ev);
      if (opt.naive && mu < INF) break;
    }
    return { dist: mu, meet: meet, events: events, lab: lab, par: par, done: done, count: count };
  }

  /* replace every shortcut on a vertex path by the two edges it stands for */
  function unpack(path, mids) {
    function expand(a, b, out) {
      var m = mids[pairKey(a, b)];
      if (m === undefined) { out.push(b); return; }
      expand(a, m, out); expand(m, b, out);
    }
    var out = [path[0]], i;
    for (i = 1; i < path.length; i++) expand(path[i - 1], path[i], out);
    return out;
  }

  /* the up-down path of a finished query, as CH vertices (shortcuts not unpacked) */
  function chPath(q, s, t) {
    if (q.meet < 0) return [];
    var a = pathTo(q.par.f, s, q.meet), b = pathTo(q.par.b, t, q.meet);
    b.reverse();
    return a.concat(b.slice(1));
  }

  /* number of shortcuts a full contraction order creates on a small graph */
  function countShortcuts(n, edges, seq) {
    var adj = adjFrom(n, edges), sc = {}, list = [], mids = {};
    seq.forEach(function (v, idx) {
      var key;
      addShortcuts(adj, v, analyze(adj, v), sc, list, mids, idx);
      for (key in adj[v]) delete adj[+key][v];
      adj[v] = {};
    });
    return list.length;
  }

  /* ---------- graphs ---------- */

  /* the 10-vertex example used throughout the post; columns x rows on a 4 x 3 grid */
  var SMALL = {
    n: 10,
    pos: [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2], [2, 2]],
    edges: [[0, 1, 3], [0, 4, 2], [1, 2, 2], [1, 5, 1], [2, 3, 4], [2, 6, 3], [3, 7, 2],
            [4, 5, 5], [5, 6, 2], [5, 8, 4], [6, 7, 4], [6, 9, 1], [8, 9, 2]]
  };

  /* A small road-like network: a jittered grid with some streets missing and a
     few fast arterial roads. Weights are integer travel times so sums are exact.
     `prio` is a random permutation used to break score ties, so that a tie is
     never decided by where a vertex happens to sit on the grid. */
  function roadGraph(cols, rows, seed) {
    var rnd = Blog.rng(seed), pts = [], kept = [], dropped = [], comp = [], prio = [], i, j;
    var artCol = function (c) { return c % 6 === 3; };
    var artRow = function (r) { return r % 5 === 2; };
    for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) {
      pts.push({
        x: i + 0.5 + rnd.range(-0.3, 0.3) * (artCol(i) ? 0.3 : 1),
        y: j + 0.5 + rnd.range(-0.3, 0.3) * (artRow(j) ? 0.3 : 1)
      });
      comp.push(j * cols + i);
    }
    function find(x) { while (comp[x] !== x) { comp[x] = comp[comp[x]]; x = comp[x]; } return x; }
    function consider(a, b, art) {
      var e = { a: a, b: b, art: art };
      if (art || rnd() > 0.2) { kept.push(e); comp[find(a)] = find(b); }
      else dropped.push(e);
    }
    for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) {
      if (i + 1 < cols) consider(j * cols + i, j * cols + i + 1, artRow(j));
      if (j + 1 < rows) consider(j * cols + i, (j + 1) * cols + i, artCol(i));
    }
    rnd.shuffle(dropped).forEach(function (e) {
      if (find(e.a) !== find(e.b)) { kept.push(e); comp[find(e.a)] = find(e.b); }
    });
    var edges = kept.map(function (e) {
      var len = Blog.dist(pts[e.a].x, pts[e.a].y, pts[e.b].x, pts[e.b].y);
      return [e.a, e.b, Math.max(1, Math.round(len * 100 * (e.art ? 0.4 : 1))), e.art];
    });
    var order = [];
    for (i = 0; i < pts.length; i++) order.push(i);
    Blog.rng(seed * 7919 + 13).shuffle(order).forEach(function (v, rank) { prio[v] = rank; });
    return {
      n: pts.length, edges: edges, prio: prio,
      pts: pts.map(function (p) { return { x: p.x / cols, y: p.y / rows }; })
    };
  }

  /* ======================================================================
     Shared drawing helpers
     ====================================================================== */

  function name(v) { return NAMES.charAt(v); }

  function names(list, sep) { return list.map(name).join(sep || ', '); }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /* layout of the 10-vertex example on its 4 x 3 grid */
  function gridLayout(w, h, top, bottom) {
    var mx = Math.max(30, w * 0.08);
    var cy = (h - top - bottom) / 2;
    var cx = Math.min((w - 2 * mx) / 3, cy * 1.9);
    var ox = (w - cx * 3) / 2;
    return {
      r: Blog.clamp(Math.min(cx, cy) * 0.17, 12, 17),
      x: function (v) { return ox + SMALL.pos[v][0] * cx; },
      y: function (v) { return top + SMALL.pos[v][1] * cy; },
      midX: w / 2, midY: top + cy
    };
  }

  /* quadratic arc between two points, bulging away from (awayX, awayY) */
  function arcOf(ax, ay, bx, by, awayX, awayY) {
    var mx = (ax + bx) / 2, my = (ay + by) / 2, dx = bx - ax, dy = by - ay;
    var len = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / len, ny = dx / len;
    var side = ((mx - awayX) * nx + (my - awayY) * ny) >= 0 ? 1 : -1;
    var bulge = Math.min(len * 0.3, 44);
    return { ax: ax, ay: ay, bx: bx, by: by, cx: mx + nx * side * bulge, cy: my + ny * side * bulge };
  }

  function arcPoint(arc, t) {
    var u = 1 - t;
    return {
      x: u * u * arc.ax + 2 * u * t * arc.cx + t * t * arc.bx,
      y: u * u * arc.ay + 2 * u * t * arc.cy + t * t * arc.by
    };
  }

  function strokeArc(ctx, arc, color, width, dash, upto) {
    var steps = 28, end = upto == null ? 1 : upto, i, p;
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    for (i = 0; i <= steps; i++) {
      p = arcPoint(arc, end * i / steps);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function segDist(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
    var t = l2 ? Blog.clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1) : 0;
    return Blog.dist(px, py, x1 + t * dx, y1 + t * dy);
  }

  /* Of the candidate points, the one with the most room around it.
     discs: [{ x, y, r }]   segs: [{ x1, y1, x2, y2, owner }]   placed: [{ x, y }]
     Segments whose owner equals `owner` are the label's own line and are ignored. */
  function clearestSpot(cands, discs, segs, placed, owner, enough) {
    var best = cands[0], bestScore = -INF, i, j, p, score, o;
    for (i = 0; i < cands.length; i++) {
      p = cands[i]; score = INF;
      for (j = 0; j < discs.length; j++) score = Math.min(score, Blog.dist(p.x, p.y, discs[j].x, discs[j].y) - discs[j].r);
      for (j = 0; j < segs.length; j++) {
        o = segs[j];
        if (o.owner === owner) continue;
        score = Math.min(score, segDist(p.x, p.y, o.x1, o.y1, o.x2, o.y2));
      }
      for (j = 0; j < placed.length; j++) score = Math.min(score, Blog.dist(p.x, p.y, placed[j].x, placed[j].y) - 8);
      if (score > bestScore) { bestScore = score; best = p; }
      if (score >= enough) break;
    }
    return best;
  }

  var ARC_T = [0.5, 0.38, 0.62, 0.28, 0.72, 0.2, 0.8];

  function arcCands(arc) { return ARC_T.map(function (t) { return arcPoint(arc, t); }); }

  function arcSegs(arc, owner) {
    var out = [], i, a = arcPoint(arc, 0), b;
    for (i = 1; i <= 6; i++) {
      b = arcPoint(arc, i / 6);
      out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, owner: owner });
      a = b;
    }
    return out;
  }

  function weightLabel(ctx, text, x, y, color, c) {
    D.text(ctx, text, x, y, { font: Blog.font(11.5, 700), color: color, halo: c.stage, haloWidth: 5 });
  }

  function vertexDisc(ctx, x, y, r, label, fill, stroke, textColor, lineWidth) {
    D.circle(ctx, x, y, r, fill, stroke, lineWidth || 2);
    D.text(ctx, label, x, y + 0.5, { font: Blog.font(Math.round(r * 0.95), 700), color: textColor });
  }

  /* where the keyboard cursor is */
  function focusRing(ctx, x, y, r, c) {
    ctx.save();
    ctx.setLineDash([4, 3]);
    D.circle(ctx, x, y, r, null, c.ink, 2);
    ctx.restore();
  }

  function hitVertex(p, count, xOf, yOf, radius) {
    var best = -1, bestD = radius, v, d;
    for (v = 0; v < count; v++) {
      d = Blog.dist(p.x, p.y, xOf(v), yOf(v));
      if (d < bestD) { bestD = d; best = v; }
    }
    return best;
  }

  function fmt(x) { return x === INF ? '∞' : String(x); }

  function waitingNote(ctx, w, h, c) {
    D.text(ctx, 'Building the hierarchy…', w / 2, h / 2, { font: Blog.font(13, 600), color: c.muted, halo: c.stage, haloWidth: 6 });
  }

  /* ======================================================================
     Demo 1: Dijkstra versus a CH query on a road-like network
     ====================================================================== */

  Blog.demo('demo-space', function (fig) {
    var P = Blog.parts(fig), readout = P.readout, controls = P.controls;
    var G = roadGraph(26, 15, 7);
    var base = adjFrom(G.n, G.edges);
    var sim = null, PAD = 14, TOP = 32;

    function layout(view) {
      return {
        x: function (v) { return PAD + G.pts[v].x * (view.w - 2 * PAD); },
        y: function (v) { return TOP + G.pts[v].y * (view.h - TOP - PAD); }
      };
    }

    function nearest(fx, fy) {
      var best = 0, bd = INF, v, d;
      for (v = 0; v < G.n; v++) {
        d = Blog.dist(fx, fy, G.pts[v].x, G.pts[v].y);
        if (d < bd) { bd = d; best = v; }
      }
      return best;
    }

    var s = nearest(0.1, 0.8), t = nearest(0.9, 0.18);
    var dj, cq = null, djPath, cqPath = [], prog = 1, cancel = null, views = [], cursor = [-1, -1];

    function compute() {
      dj = dijkstra(base, s, { target: t });
      djPath = pathTo(dj.parent, s, t);
      if (!sim) { readout.innerHTML = '<span>Building the hierarchy for this network…</span>'; return; }
      cq = chQuery(sim.up, s, t);
      cqPath = unpack(chPath(cq, s, t), sim.mids);
      var ratio = dj.order.length / Math.max(1, cq.events.length);
      readout.innerHTML =
        '<span>Dijkstra settles: <b>' + dj.order.length + '</b> of ' + G.n + ' vertices</span>' +
        '<span>CH query settles: <b>' + cq.events.length + '</b> (' + cq.count.f + ' from <i>s</i>, ' + cq.count.b + ' from <i>t</i>)</span>' +
        '<span>Search space: <b>' + (ratio >= 1.25 ? (ratio >= 10 ? ratio.toFixed(0) : ratio.toFixed(1)) + '× smaller</b>'
          : 'about the same</b> (<i>s</i> and <i>t</i> are close together)') + '</span>' +
        '<span>Travel time: <b>' + cq.dist + '</b>' + (dj.dist[t] === cq.dist ? ' from both' : ' (MISMATCH with Dijkstra)') + '</span>';
    }

    function redraw() { views.forEach(function (v) { v.invalidate(); }); }

    function animate() {
      if (cancel) cancel();
      prog = 0;
      cancel = Blog.tween({
        dur: 1500, ease: Blog.ease.linear,
        update: function (x) { prog = x; redraw(); },
        done: function () { cancel = null; }
      });
    }

    function settle() { if (cancel) { cancel(); cancel = null; } prog = 1; }

    /* move the nearer endpoint to vertex v (what a tap does) */
    function moveNearer(v) {
      if (v === s || v === t) return;
      var ds = Blog.dist(G.pts[v].x, G.pts[v].y, G.pts[s].x, G.pts[s].y);
      var dt = Blog.dist(G.pts[v].x, G.pts[v].y, G.pts[t].x, G.pts[t].y);
      if (ds <= dt) s = v; else t = v;
      compute();
    }

    function paint(which) {
      return function (ctx, w, h, c) {
        var L = layout({ w: w, h: h }), X = L.x, Y = L.y;
        var thin = Blog.alpha(c.gray, 0.4), thick = Blog.alpha(c.gray, 0.85), i, v, e, ev, color, path, shown, total;

        for (i = 0; i < G.edges.length; i++) {
          e = G.edges[i];
          D.line(ctx, X(e[0]), Y(e[0]), X(e[1]), Y(e[1]), e[3] ? thick : thin, e[3] ? 2.4 : 1);
        }

        if (which === 0) {
          total = dj.order.length;
          shown = Math.min(total, Math.floor(prog * total + 0.001));
          for (i = 0; i < shown; i++) {
            v = dj.order[i];
            D.circle(ctx, X(v), Y(v), 2.8, c.blue);
          }
          path = djPath;
        } else if (!cq) {
          total = 0; shown = 0; path = [];
          waitingNote(ctx, w, h, c);
        } else {
          /* each pane runs through its own search in the same time */
          total = cq.events.length;
          shown = Math.min(total, Math.floor(prog * total + 0.001));
          for (i = 0; i < shown; i++) {
            ev = cq.events[i];
            color = ev.side === 'f' ? c.blue : c.purple;
            var from = cq.par[ev.side][ev.v];
            if (from !== undefined) D.line(ctx, X(from), Y(from), X(ev.v), Y(ev.v), Blog.alpha(color, 0.75), 1.4);
          }
          for (i = 0; i < shown; i++) {
            ev = cq.events[i];
            D.circle(ctx, X(ev.v), Y(ev.v), 3.6, ev.side === 'f' ? c.blue : c.purple);
          }
          path = cqPath;
        }

        if (prog >= 1 && path.length > 1) {
          ctx.save();
          ctx.strokeStyle = c.green; ctx.lineWidth = 3.4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
          ctx.beginPath();
          path.forEach(function (pv, k) { if (k === 0) ctx.moveTo(X(pv), Y(pv)); else ctx.lineTo(X(pv), Y(pv)); });
          ctx.stroke();
          ctx.restore();
          if (which === 1 && cq.meet >= 0) D.circle(ctx, X(cq.meet), Y(cq.meet), 6.5, c.stage, c.green, 3);
        }

        [[s, 's'], [t, 't']].forEach(function (end) {
          var x = X(end[0]), y = Y(end[0]);
          D.circle(ctx, x, y, 6, c.ink, c.stage, 2);
          D.tag(ctx, end[1], Blog.clamp(x, 16, w - 16), y < TOP + 22 ? y + 18 : y - 17,
            { fill: c.ink, color: Blog.inkOn(c.ink), font: Blog.font(12, 700), height: 20, padX: 7 });
        });

        if (cursor[which] >= 0) focusRing(ctx, X(cursor[which]), Y(cursor[which]), 10, c);

        if (which === 0 || cq) {
          D.text(ctx, shown + ' settled', w - 10, h - 10, { font: Blog.mono(11, 700), color: c.muted, align: 'right', halo: c.stage, haloWidth: 5 });
        }
      };
    }

    compute();

    P.canvases.forEach(function (canvas, idx) {
      var view = Blog.canvas(canvas, paint(idx));
      views.push(view);
      var which = 's';
      function vertexAt(p) {
        return nearest((p.x - PAD) / (view.w - 2 * PAD), (p.y - TOP) / (view.h - TOP - PAD));
      }
      function endDist(p, v) {
        var L = layout(view);
        return Blog.dist(p.x, p.y, L.x(v), L.y(v));
      }
      function place(p) {
        var v = vertexAt(p);
        if (v === s || v === t) return;
        if (which === 's') s = v; else t = v;
        compute(); redraw();
      }
      Blog.pointer(canvas, {
        /* a finger that lands on s or t drags it in any direction; elsewhere the page scrolls */
        grab: function (p) { return Math.min(endDist(p, s), endDist(p, t)) < 30; },
        down: function (p) {
          which = endDist(p, s) <= endDist(p, t) ? 's' : 't';
          settle();
          place(p);
        },
        move: place,
        up: function () { animate(); }
      });
      Blog.keys(canvas, {
        points: function () {
          var L = layout(view);
          return G.pts.map(function (pt, v) {
            return { x: L.x(v), y: L.y(v), label: 'Intersection ' + (v + 1) + (v === s ? ', the start s' : v === t ? ', the target t' : '') };
          });
        },
        move: function (i) { cursor[idx] = i; view.invalidate(); },
        pick: function (i) { settle(); moveNearer(i); redraw(); animate(); }
      });
    });

    /* test hook: where s and t are drawn on the first map */
    if (window.location.hash === '#selfcheck') {
      Blog._chEnds = function () { var L = layout(views[0]); return [L.x(s), L.y(s), L.x(t), L.y(t)]; };
    }

    /* with reduced motion a replay would redraw the same frame, so leave the button out */
    if (!Blog.reduced) controls.appendChild(Blog.button('Replay search', animate, { primary: true }));
    controls.appendChild(Blog.button('Pick a random pair', function () {
      var rnd = Blog.rng(Math.floor(Math.random() * 1e9)), tries = 0;
      do {
        s = rnd.int(0, G.n - 1); t = rnd.int(0, G.n - 1); tries++;
      } while (tries < 200 && (s === t || Blog.dist(G.pts[s].x, G.pts[s].y, G.pts[t].x, G.pts[t].y) < 0.5));
      compute(); animate();
    }));

    /* build the hierarchy in the background, then play the search once it is on screen */
    var built = false, seen = false, played = false;
    function firstPlay() {
      if (built && seen && !played) { played = true; if (!Blog.reduced) animate(); }
    }
    buildWhenNear(fig, makeBuilder(G.n, G.edges, { depth: 1, cap: 30, prio: G.prio }), function (result) {
      sim = result; built = true;
      compute(); redraw(); firstPlay();
    });
    Blog.inView(fig, function () { seen = true; firstPlay(); });
  });

  /* ======================================================================
     Demo 2: contract it yourself
     ====================================================================== */

  Blog.demo('demo-contract', function (fig) {
    var P = Blog.parts(fig), canvas = P.canvas, status = P.status, readout = P.readout, controls = P.controls;
    var GOOD = [2, 4, 8, 0, 3, 5, 9, 1, 6, 7];
    var BAD = [6, 5, 1, 2, 0, 3, 4, 7, 8, 9];
    var FEWEST = 1;   /* the minimum over all 10! orders, found by exhaustive search */
    var goodCount = countShortcuts(SMALL.n, SMALL.edges, GOOD), badCount = countShortcuts(SMALL.n, SMALL.edges, BAD);
    var order = [], sel = -1, hover = -1, kbd = -1, pairs = null, anim = 1, cancel = null;
    var st, lastAdded = [], lastSkipped = 0;
    var play = { seq: null, next: 0, timer: 0, visible: true };

    function layoutFor(w, h) { return gridLayout(w, h, 58, 46); }

    function layout() { return layoutFor(view.w, view.h); }

    /* rebuild the overlay by replaying the contraction order from scratch */
    function replay() {
      st = { adj: adjFrom(SMALL.n, SMALL.edges), gone: {}, sc: {}, list: [], mids: {}, ghosts: [] };
      lastAdded = []; lastSkipped = 0;
      order.forEach(function (v, idx) {
        var plan = analyze(st.adj, v), key;
        lastAdded = addShortcuts(st.adj, v, plan, st.sc, st.list, st.mids, idx).slice();
        lastSkipped = plan.length - lastAdded.length;
        for (key in st.adj[v]) {
          st.ghosts.push({ a: v, b: +key, w: st.adj[v][key], shortcut: !!st.sc[pairKey(v, +key)], at: idx });
          delete st.adj[+key][v];
        }
        st.adj[v] = {};
        st.gone[v] = idx + 1;
      });
    }

    function select(v) {
      sel = v;
      pairs = v >= 0 ? analyze(st.adj, v) : null;
    }

    function pairText(p) {
      var ab = name(p.a) + '–' + name(p.b);
      if (p.need) {
        return '<b>' + ab + '</b>: ' + p.via + ' through ' + name(sel) + ', ' +
          (p.wit === INF ? 'no other route' : p.wit + ' any other way') +
          ' → <span class="k k-orange">shortcut ' + ab + ' (' + p.via + ')</span>';
      }
      return '<b>' + ab + '</b>: ' + p.via + ' through ' + name(sel) + ', but ' +
        '<span class="k k-green">' + p.witPath.map(name).join('–') + '</span> is ' + p.wit + ' → no shortcut';
    }

    function describe() {
      var left = SMALL.n - order.length, need, deg, n;
      if (sel >= 0) {
        need = pairs.filter(function (p) { return p.need; }).length;
        deg = neighbors(st.adj[sel]).length;
        if (!pairs.length) {
          status.innerHTML = '<b>' + name(sel) + '</b> has ' + (deg === 1 ? 'one neighbor' : 'no neighbors') +
            ' left, so removing it cannot lengthen any path.';
        } else {
          status.innerHTML = 'Contracting <b>' + name(sel) + '</b>: ' + plural(need, 'shortcut', 'shortcuts') + ' in, ' +
            plural(deg, 'edge', 'edges') + ' out (edge difference ' + String(need - deg).replace('-', '−') + ').<br>' +
            pairs.map(pairText).join('<br>');
        }
      } else if (!order.length) {
        status.innerHTML = 'Click any vertex to preview what contracting it would do.';
      } else if (left === 0) {
        n = st.list.length;
        status.innerHTML = 'Done: the order <b>' + names(order) + '</b> needed <b>' + plural(n, 'shortcut', 'shortcuts') +
          '</b>, so this hierarchy has ' + SMALL.edges.length + ' + ' + n + ' = ' + (SMALL.edges.length + n) + ' edges. ' +
          (n === FEWEST ? 'No order does better.'
            : 'The preset good order needs ' + goodCount + ', the careless one ' + badCount + ', and the fewest possible is ' + FEWEST + '.');
      } else {
        var v = order[order.length - 1];
        status.innerHTML = 'Contracted <b>' + name(v) + '</b>: ' +
          (lastAdded.length ? 'added ' + lastAdded.map(function (x) {
            return '<span class="k k-orange">' + name(x.a) + '–' + name(x.b) + ' (' + x.w + ')</span>';
          }).join(', ') : 'no shortcut needed') +
          (lastSkipped ? '; ' + plural(lastSkipped, 'pair', 'pairs') + ' already had a shorter way around' : '') + '.';
      }
      readout.innerHTML = '<span>Contracted: <b>' + order.length + ' / ' + SMALL.n + '</b></span>' +
        '<span>Shortcuts added: <b>' + st.list.length + '</b></span>' +
        '<span>Order: <b>' + (order.length ? names(order, ' ') : '–') + '</b></span>';
      contractBtn.textContent = sel >= 0 ? 'Contract ' + name(sel) : 'Contract';
      contractBtn.disabled = sel < 0;
      undoBtn.disabled = !order.length;
    }

    function contract(v, quick) {
      order.push(v);
      replay();
      select(-1);
      describe();
      if (cancel) cancel();
      anim = 0;
      cancel = Blog.tween({ dur: quick ? 300 : 480, update: function (x) { anim = x; view.invalidate(); }, done: function () { cancel = null; } });
    }

    /* what a click on vertex v does */
    function clickVertex(v) {
      stopPlay();
      if (v < 0 || st.gone[v]) { select(-1); describe(); view.invalidate(); return; }
      if (v === sel) { contract(v); return; }
      select(v); describe(); view.invalidate();
    }

    function stopPlay() {
      if (play.timer) clearTimeout(play.timer);
      play.timer = 0; play.seq = null;
    }

    function playNext() {
      play.timer = 0;
      if (!play.seq || !play.visible) return;
      if (play.next >= play.seq.length) { play.seq = null; return; }
      contract(play.seq[play.next++], true);
      play.timer = setTimeout(playNext, Blog.reduced ? 1000 : 650);
    }

    function reset() {
      stopPlay(); order = []; replay(); select(-1); anim = 1; describe(); view.invalidate();
    }

    function startPlay(seq) {
      reset();
      play.seq = seq; play.next = 0;
      playNext();
    }

    replay();

    var view = Blog.canvas(canvas, function (ctx, w, h, c) {
      var L = layoutFor(w, h), X = L.x, Y = L.y, r = L.r;
      var lastIdx = order.length - 1, finished = order.length === SMALL.n;
      var straight = [], arcs = [], discs = [], segs = [], placed = [], v, key, u, a;

      for (v = 0; v < SMALL.n; v++) discs.push({ x: X(v), y: Y(v), r: r + 12 });

      /* edges still in the overlay, and edges that already moved into the hierarchy */
      for (v = 0; v < SMALL.n; v++) for (key in st.adj[v]) {
        u = +key;
        if (u < v) continue;
        var rec = st.sc[pairKey(v, u)];
        if (rec) arcs.push({ a: v, b: u, w: st.adj[v][key], live: true, grow: rec.at === lastIdx ? anim : 1 });
        else straight.push({ a: v, b: u, w: st.adj[v][key], live: true });
      }
      st.ghosts.forEach(function (g) {
        var fresh = g.at === lastIdx ? anim : 1;
        if (g.shortcut) arcs.push({ a: g.a, b: g.b, w: g.w, live: false, fresh: fresh });
        else straight.push({ a: g.a, b: g.b, w: g.w, live: false, fresh: fresh });
      });
      if (pairs) pairs.forEach(function (pr) {
        if (pr.need) arcs.push({ a: pr.a, b: pr.b, w: pr.via, preview: true });
      });

      straight.forEach(function (e, i) { segs.push({ x1: X(e.a), y1: Y(e.a), x2: X(e.b), y2: Y(e.b), owner: 's' + i }); });
      arcs.forEach(function (e, i) {
        e.arc = arcOf(X(e.a), Y(e.a), X(e.b), Y(e.b), L.midX, L.midY);
        segs = segs.concat(arcSegs(e.arc, 'a' + i));
      });

      /* witness paths of the previewed vertex, under everything else */
      if (pairs) pairs.forEach(function (pr) {
        if (pr.need || !pr.witPath) return;
        for (a = 1; a < pr.witPath.length; a++) {
          D.line(ctx, X(pr.witPath[a - 1]), Y(pr.witPath[a - 1]), X(pr.witPath[a]), Y(pr.witPath[a]), Blog.alpha(c.green, 0.35), 9);
        }
      });

      straight.forEach(function (e) {
        var x1 = X(e.a), y1 = Y(e.a), x2 = X(e.b), y2 = Y(e.b), mid = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
        if (e.live || finished) {
          var touching = sel >= 0 && (e.a === sel || e.b === sel);
          D.line(ctx, x1, y1, x2, y2, touching ? c.pink : c.gray, touching ? 2.6 : 2);
          weightLabel(ctx, String(e.w), mid.x, mid.y, c.text, c);
          placed.push(mid);
        } else {
          D.line(ctx, x1, y1, x2, y2, Blog.alpha(Blog.mix(c.gray, Blog.alpha(c.gray, 1), e.fresh), 0.5), 1.4, [2, 5]);
        }
      });

      arcs.forEach(function (e, i) {
        var p;
        if (e.preview) {
          strokeArc(ctx, e.arc, Blog.alpha(c.orange, 0.8), 2.2, [3, 5]);
          p = clearestSpot(arcCands(e.arc), discs, segs, placed, 'a' + i, 12);
          weightLabel(ctx, '+' + e.w, p.x, p.y, c.orangeText, c);
          placed.push(p);
        } else if (e.live || finished) {
          strokeArc(ctx, e.arc, c.orange, 2.4, [7, 5], e.live ? e.grow : 1);
          if (!e.live || e.grow > 0.6) {
            p = clearestSpot(arcCands(e.arc), discs, segs, placed, 'a' + i, 12);
            weightLabel(ctx, String(e.w), p.x, p.y, c.orangeText, c);
            placed.push(p);
          }
        } else {
          strokeArc(ctx, e.arc, Blog.alpha(c.orange, 0.45), 1.4, [2, 5]);
        }
      });

      for (v = 0; v < SMALL.n; v++) {
        var gone = st.gone[v];
        if (gone && finished) {
          vertexDisc(ctx, X(v), Y(v), r, name(v), c.stage, c.ink, c.ink, 2);
          D.text(ctx, '#' + gone, X(v), Y(v) + r + 10, { font: Blog.mono(11, 700), color: c.muted, halo: c.stage });
        } else if (gone) {
          var f = gone - 1 === lastIdx ? anim : 1;
          ctx.save();
          ctx.setLineDash([3, 3]);
          D.circle(ctx, X(v), Y(v), r, c.stage, Blog.mix(c.pink, Blog.alpha(c.gray, 1), f), 1.5);
          ctx.restore();
          D.text(ctx, name(v), X(v), Y(v) + 0.5, { font: Blog.font(Math.round(r * 0.95), 700), color: c.faint });
          D.text(ctx, '#' + gone, X(v), Y(v) + r + 10, { font: Blog.mono(11, 700), color: c.faint, halo: c.stage });
        } else if (v === sel) {
          D.circle(ctx, X(v), Y(v), r + 6, Blog.alpha(c.pink, 0.22));
          vertexDisc(ctx, X(v), Y(v), r, name(v), c.pink, c.pink, Blog.inkOn(c.pink), 2);
        } else {
          vertexDisc(ctx, X(v), Y(v), r, name(v), c.stage, v === hover ? c.pink : c.ink, c.ink, v === hover ? 3 : 2);
        }
        if (v === kbd) focusRing(ctx, X(v), Y(v), r + 7, c);
      }
    });

    function hit(p) {
      var L = layout();
      return hitVertex(p, SMALL.n, L.x, L.y, Math.max(L.r + 8, 24));
    }

    canvas.classList.add('clickable');
    Blog.pointer(canvas, {
      down: function (p) { clickVertex(hit(p)); },
      hover: function (p) {
        var v = hit(p);
        if (v >= 0 && st.gone[v]) v = -1;
        if (v !== hover) { hover = v; view.invalidate(); }
      },
      leave: function () { if (hover !== -1) { hover = -1; view.invalidate(); } }
    });

    Blog.keys(canvas, {
      points: function () {
        var L = layout(), out = [], v;
        for (v = 0; v < SMALL.n; v++) {
          if (st.gone[v]) continue;
          out.push({
            v: v, x: L.x(v), y: L.y(v),
            label: 'Vertex ' + name(v) + (v === sel ? ', selected. Press Enter to contract it.' : ', ' + plural(neighbors(st.adj[v]).length, 'neighbor', 'neighbors'))
          });
        }
        return out;
      },
      move: function (i, pt) { kbd = pt ? pt.v : -1; view.invalidate(); },
      pick: function (i, pt) { clickVertex(pt.v); kbd = -1; }
    });

    var contractBtn = Blog.button('Contract', function () { stopPlay(); if (sel >= 0) contract(sel); }, { primary: true });
    var undoBtn = Blog.button('Undo', function () {
      stopPlay();
      if (!order.length) return;
      order.pop(); replay(); select(-1); anim = 1; describe(); view.invalidate();
    });
    contractBtn.style.minWidth = '7em';
    controls.appendChild(contractBtn);
    controls.appendChild(undoBtn);
    controls.appendChild(Blog.button('Reset', reset));
    controls.appendChild(Blog.el('span', { class: 'spacer' }));
    controls.appendChild(Blog.button('Play a good order', function () { startPlay(GOOD); }));
    controls.appendChild(Blog.button('Play a careless order', function () { startPlay(BAD); }));

    /* a preset that is playing waits while the figure is off screen */
    Blog.inView(fig, function () {
      play.visible = true;
      if (play.seq && !play.timer) play.timer = setTimeout(playNext, 400);
    }, function () {
      play.visible = false;
      if (play.timer) { clearTimeout(play.timer); play.timer = 0; }
    }, '0px');

    describe();
    view.invalidate();
  });

  /* ======================================================================
     Demo 3: the upward bidirectional query, one settle at a time
     ====================================================================== */

  Blog.demo('demo-query', function (fig) {
    var P = Blog.parts(fig), canvas = P.canvas, status = P.status, readout = P.readout, controls = P.controls;
    var sim = simulate(SMALL.n, SMALL.edges, { parallel: true });
    var base = adjFrom(SMALL.n, SMALL.edges);
    var levels = Math.max.apply(null, sim.removedAt) + 1;
    /* horizontal slots chosen by hand so the 15 edges cross as little as possible */
    var XS = [0.45, 0.3, 0.2, 0.06, 0.52, 0.6, 0.64, 0.13, 0.73, 0.84];
    var edges = [];
    sim.up.forEach(function (row, v) {
      var key;
      for (key in row) edges.push({ a: v, b: +key, w: row[key], shortcut: sim.mids[pairKey(v, +key)] !== undefined });
    });

    var s = 3, t = 8, naive = false, q, truth, step = 0, pickSide = 's', stepper = null, kbd = -1;

    function layout(w, h) {
      var left = 46, right = 30, top = 44, bottom = 46;
      return {
        r: Blog.clamp(w * 0.034, 12, 16),
        left: left, top: top, bottom: bottom,
        x: function (v) { return left + XS[v] * (w - left - right); },
        y: function (v) { return h - bottom - sim.removedAt[v] * (h - top - bottom) / (levels - 1); },
        levelY: function (l) { return h - bottom - l * (h - top - bottom) / (levels - 1); }
      };
    }

    function run() {
      q = chQuery(sim.up, s, t, { naive: naive });
      truth = dijkstra(base, s, { target: t }).dist[t];
    }

    /* labels and settled sets after the first `k` events */
    function stateAt(k) {
      var out = { lab: { f: {}, b: {} }, done: { f: {}, b: {} }, mu: INF, meet: -1, last: null };
      var i, ev, pv;
      out.lab.f[s] = 0; out.lab.b[t] = 0;
      for (i = 0; i < k; i++) {
        ev = q.events[i];
        out.done[ev.side][ev.v] = true;
        out.lab[ev.side][ev.v] = ev.key;
        pv = ev;
        ev.relaxed.forEach(function (x) { out.lab[pv.side][x] = pv.key + sim.up[pv.v][x]; });
        out.mu = ev.mu; out.meet = ev.meet; out.last = ev;
      }
      return out;
    }

    function queueText(S, side) {
      var items = [], key;
      for (key in S.lab[side]) if (!S.done[side][key]) items.push({ v: +key, d: S.lab[side][key] });
      items.sort(function (a, b) { return a.d - b.d || a.v - b.v; });
      if (!items.length) return 'empty';
      return items.map(function (it) { return name(it.v) + ' ' + it.d; }).join(', ');
    }

    function describe() {
      var S = stateAt(step), ev = S.last, total = q.events.length, txt;
      var fw = '<span class="k k-blue">forward</span>', bw = '<span class="k k-purple">backward</span>';
      if (!ev) {
        txt = 'Query <b>' + name(s) + ' → ' + name(t) + '</b>. The ' + fw + ' search starts at ' + name(s) +
          ', the ' + bw + ' search at ' + name(t) + '. Both may only follow edges in the direction of the arrowheads: up.';
      } else {
        var who = ev.side === 'f' ? fw : bw;
        txt = 'The ' + who + ' search settles <b>' + name(ev.v) + '</b> at distance ' + ev.key;
        if (ev.relaxed.length) txt += ' and reaches ' + ev.relaxed.map(function (x) { return name(x) + ' (' + S.lab[ev.side][x] + ')'; }).join(', ');
        txt += '. ';
        if (ev.cand !== undefined) {
          if (ev.improved) {
            txt += name(ev.v) + ' is now reached from both sides: ' + S.lab.f[ev.v] + ' + ' + S.lab.b[ev.v] + ' = <b>' + ev.cand + '</b>, the best meeting so far. ';
          } else if (ev.seenBefore) {
            txt += 'Both sides have now settled ' + name(ev.v) + '; its total of ' + ev.cand + ' was already counted. ';
          } else {
            txt += name(ev.v) + ' is reached from both sides: ' + S.lab.f[ev.v] + ' + ' + S.lab.b[ev.v] + ' = ' + ev.cand + ', no better than ' + S.mu + '. ';
          }
        } else if (!ev.relaxed.length) {
          txt += 'It has no upward edges left to follow. ';
        }
        if (step === total) {
          if (naive && q.dist !== truth) {
            txt += '<b>Stopped at the first meeting: answer ' + q.dist + ', but the true distance is ' + truth + '.</b> Untick the box and play again.';
          } else {
            var up = chPath(q, s, t), full = unpack(up, sim.mids);
            txt += '<b>Done: ' + q.dist + '</b>, meeting at ' + name(q.meet) + '. In the hierarchy the path is ' + up.map(name).join(' → ') +
              (full.length !== up.length ? '; unpacking the shortcut gives ' + full.map(name).join(' → ') : '') + '.';
          }
        }
      }
      status.innerHTML = txt;
      readout.innerHTML = '<span>Best meeting: <b>μ = ' + fmt(S.mu) + (S.meet >= 0 ? ' at ' + name(S.meet) : '') + '</b></span>' +
        '<span><span class="k k-blue">Forward</span> queue: <b>' + queueText(S, 'f') + '</b></span>' +
        '<span><span class="k k-purple">Backward</span> queue: <b>' + queueText(S, 'b') + '</b></span>';
    }

    /* a small arrowhead at the upper end of an edge: the only direction a search may take */
    function upArrow(ctx, x1, y1, x2, y2, back, color) {
      var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / len, uy = dy / len;
      var bx = x2 - ux * back, by = y2 - uy * back, hd = 8;
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - ux * hd - uy * hd * 0.5, by - uy * hd + ux * hd * 0.5);
      ctx.lineTo(bx - ux * hd + uy * hd * 0.5, by - uy * hd - ux * hd * 0.5);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    run();

    var view = Blog.canvas(canvas, function (ctx, w, h, c) {
      var L = layout(w, h), X = L.x, Y = L.y, r = L.r;
      var S = stateAt(step), finished = step === q.events.length && !(naive && q.dist !== truth);
      var l, v, col, onPath = {}, path, discs = [], segs = [], placed = [];

      for (l = 0; l < levels; l++) {
        D.line(ctx, L.left - 14, L.levelY(l), w - 10, L.levelY(l), Blog.alpha(c.gray, 0.22), 1, [2, 6]);
        D.text(ctx, 'L' + (l + 1), 8, L.levelY(l), { font: Blog.mono(11, 700), color: c.muted, align: 'left' });
      }

      if (finished) {
        path = chPath(q, s, t);
        for (l = 1; l < path.length; l++) onPath[pairKey(path[l - 1], path[l])] = true;
      }

      edges.forEach(function (ed, idx) {
        var hot = S.last && S.last.v === ed.a && S.last.relaxed.indexOf(ed.b) >= 0;
        var x1 = X(ed.a), y1 = Y(ed.a), x2 = X(ed.b), y2 = Y(ed.b);
        if (onPath[pairKey(ed.a, ed.b)]) D.line(ctx, x1, y1, x2, y2, Blog.alpha(c.green, 0.45), 10);
        col = hot ? (S.last.side === 'f' ? c.blue : c.purple) : (ed.shortcut ? c.orange : c.gray);
        D.line(ctx, x1, y1, x2, y2, col, hot ? 3 : (ed.shortcut ? 2.2 : 1.8), ed.shortcut ? [7, 5] : null);
        upArrow(ctx, x1, y1, x2, y2, r + 3, col);
        segs.push({ x1: x1, y1: y1, x2: x2, y2: y2, owner: idx });
      });
      for (v = 0; v < SMALL.n; v++) discs.push({ x: X(v), y: Y(v), r: r + 14 });
      /* put each weight where it is clear of vertices, other edges and other labels */
      edges.forEach(function (ed, idx) {
        var cands = [0.5, 0.4, 0.6, 0.32, 0.68, 0.25].map(function (tt) {
          return { x: Blog.lerp(X(ed.a), X(ed.b), tt), y: Blog.lerp(Y(ed.a), Y(ed.b), tt) };
        });
        var spot = clearestSpot(cands, discs, segs, placed, idx, 20);
        placed.push(spot);
        weightLabel(ctx, String(ed.w), spot.x, spot.y, ed.shortcut ? c.orangeText : c.muted, c);
      });

      for (v = 0; v < SMALL.n; v++) {
        var x = X(v), y = Y(v);
        if (S.last && S.last.v === v) D.circle(ctx, x, y, r + 8, Blog.alpha(S.last.side === 'f' ? c.blue : c.purple, 0.25));
        if (finished && v === q.meet) D.circle(ctx, x, y, r + 8, Blog.alpha(c.green, 0.35));
        vertexDisc(ctx, x, y, r, name(v), c.stage, c.ink, c.ink, 1.6);
        ctx.save();
        ctx.lineWidth = 4; ctx.lineCap = 'butt';
        if (S.done.f[v]) { ctx.strokeStyle = c.blue; ctx.beginPath(); ctx.arc(x, y, r + 1, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke(); }
        if (S.done.b[v]) { ctx.strokeStyle = c.purple; ctx.beginPath(); ctx.arc(x, y, r + 1, Math.PI * 1.5, Math.PI * 2.5); ctx.stroke(); }
        ctx.restore();
        if (S.lab.f[v] !== undefined) {
          D.tag(ctx, String(S.lab.f[v]), x - r + 1, y - r - 7, {
            align: 'right', fill: S.done.f[v] ? c.blue : c.stage, stroke: c.blue, color: S.done.f[v] ? Blog.inkOn(c.blue) : c.blueText, height: 17, padX: 5
          });
        }
        if (S.lab.b[v] !== undefined) {
          D.tag(ctx, String(S.lab.b[v]), x + r - 1, y - r - 7, {
            align: 'left', fill: S.done.b[v] ? c.purple : c.stage, stroke: c.purple, color: S.done.b[v] ? Blog.inkOn(c.purple) : c.purpleText, height: 17, padX: 5
          });
        }
        if (v === s || v === t) {
          D.tag(ctx, v === s ? 's' : 't', x, y + r + 12, { fill: c.ink, color: Blog.inkOn(c.ink), font: Blog.font(11.5, 700), height: 18, padX: 7 });
        }
        if (v === kbd) focusRing(ctx, x, y, r + 7, c);
      }
    });

    function restart() {
      run();
      step = 0;
      stepper.reset();
    }

    /* what a click on vertex v does: it becomes s or t; clicking the other endpoint swaps them */
    function setEndpoint(v) {
      var tmp;
      if ((pickSide === 's' && v === t) || (pickSide === 't' && v === s)) { tmp = s; s = t; t = tmp; }
      else if (pickSide === 's') { if (v === s) return; s = v; seg.set('t'); }
      else { if (v === t) return; t = v; seg.set('s'); }
      restart();
    }

    stepper = Blog.stepper(controls, {
      total: function () { return q.events.length; },
      interval: 1100,
      onStep: function (i) { step = i; describe(); view.invalidate(); }
    });

    controls.appendChild(Blog.el('span', { class: 'spacer' }));
    [[3, 8], [0, 9], [4, 3]].forEach(function (pair) {
      controls.appendChild(Blog.button(name(pair[0]) + ' → ' + name(pair[1]), function () { s = pair[0]; t = pair[1]; restart(); },
        { title: 'Query from ' + name(pair[0]) + ' to ' + name(pair[1]) }));
    });
    var seg = Blog.segmented({
      label: 'A click on a vertex sets', value: 's',
      options: [{ value: 's', label: 'Click sets s' }, { value: 't', label: 'Click sets t' }],
      onChange: function (v) { pickSide = v; }
    });
    controls.appendChild(seg.el);
    controls.appendChild(Blog.checkbox('Stop at the first meeting (wrong)', false, function (on) { naive = on; restart(); }).el);

    canvas.classList.add('clickable');
    Blog.pointer(canvas, {
      down: function (p) {
        var L = layout(view.w, view.h), v = hitVertex(p, SMALL.n, L.x, L.y, 26);
        if (v >= 0) setEndpoint(v);
      }
    });
    Blog.keys(canvas, {
      points: function () {
        var L = layout(view.w, view.h), out = [], v;
        for (v = 0; v < SMALL.n; v++) {
          out.push({
            v: v, x: L.x(v), y: L.y(v),
            label: 'Vertex ' + name(v) + ', level ' + (sim.removedAt[v] + 1) + (v === s ? ', the start s' : v === t ? ', the target t' : '') +
              '. Enter makes it ' + (pickSide === 's' ? 'the start.' : 'the target.')
          });
        }
        return out;
      },
      move: function (i, pt) { kbd = pt ? pt.v : -1; view.invalidate(); },
      pick: function (i, pt) { setEndpoint(pt.v); }
    });
  });

  /* ======================================================================
     Demo 4: one vertex per step versus an independent set per round
     ====================================================================== */

  Blog.demo('demo-rounds', function (fig) {
    var P = Blog.parts(fig), status = P.status, readout = P.readout, controls = P.controls;
    var SEEDS = [12, 31, 47, 58, 73, 90], seedAt = 0;
    var G = null, seq = null, par = null, index = 0, anim = 1, cancel = null, views = [], stepper, token = 0;

    /* both builds run in small slices so that a new network never freezes the page */
    function build(done) {
      var mine = ++token, g = roadGraph(14, 9, SEEDS[seedAt]);
      var b1 = makeBuilder(g.n, g.edges, { prio: g.prio }), b2 = makeBuilder(g.n, g.edges, { parallel: true, prio: g.prio });
      G = null; seq = null; par = null;
      (function slice() {
        if (mine !== token) return;
        var t0 = Date.now(), d1 = false, d2 = false;
        while (!(d1 && d2) && Date.now() - t0 < 8) { d1 = b1.work(); d2 = b2.work(); }
        if (d1 && d2) { G = g; seq = b1.result(); par = b2.result(); done(); }
        else setTimeout(slice, 0);
      })();
    }

    function goneBy(sim, k) {
      var cnt = 0, v;
      for (v = 0; v < G.n; v++) if (sim.removedAt[v] < k) cnt++;
      return cnt;
    }

    function describe() {
      if (!G) {
        status.innerHTML = 'Building both hierarchies for this network…';
        readout.innerHTML = '';
        return;
      }
      var k = index, pk = Math.min(k, par.steps), sk = Math.min(k, seq.steps);
      var pg = goneBy(par, pk), sg = goneBy(seq, sk), txt, now, nxt;
      if (k === 0) {
        txt = 'Both builds start from the same network. <span class="k k-pink">Pink</span> marks what the next step contracts: ' +
          'the single lowest-scoring vertex in the first build, and all <b>' + par.picks[0].length +
          '</b> vertices that score lower than every neighbor in the second.';
      } else if (k >= par.steps) {
        txt = 'After <b>' + par.steps + '</b> rounds the round-based build has contracted every vertex. The shading shows the round that removed each one, with the strongest contrast for the last rounds. ' +
          'In the same number of steps the first build has contracted ' + sg + ' of ' + G.n + '.';
      } else {
        now = par.picks[k - 1].length; nxt = par.picks[k].length;
        txt = 'Round ' + k + ' contracted <b>' + plural(now, 'vertex', 'vertices') + '</b>' + (now === 1 ? '' : ' at once') +
          ', none of them neighbors. The next round has <b>' + plural(nxt, 'local minimum', 'local minima') + '</b>.';
      }
      status.innerHTML = txt;
      readout.innerHTML =
        '<span>One at a time: <b>' + sg + ' / ' + G.n + '</b> contracted</span>' +
        '<span>In rounds: <b>' + pg + ' / ' + G.n + '</b> contracted (' + Math.round(100 * pg / G.n) + '%)</span>' +
        '<span>Round: <b>' + pk + ' / ' + par.steps + '</b></span>';
    }

    function paint(which) {
      return function (ctx, w, h, c) {
        if (!G) { waitingNote(ctx, w, h, c); return; }
        var sim = which === 0 ? seq : par, k = Math.min(index, sim.steps);
        var pad = 16, padTop = 34;
        var X = function (v) { return pad + G.pts[v].x * (w - 2 * pad); };
        var Y = function (v) { return padTop + G.pts[v].y * (h - padTop - pad - 16); };
        var ended = which === 1 && k >= sim.steps;
        var ghost = Blog.alpha(c.gray, ended ? 0.4 : 0.16), i, e, v, at, sc, grow;

        for (i = 0; i < G.edges.length; i++) {
          e = G.edges[i];
          var liveEdge = sim.removedAt[e[0]] >= k && sim.removedAt[e[1]] >= k;
          D.line(ctx, X(e[0]), Y(e[0]), X(e[1]), Y(e[1]), liveEdge ? Blog.alpha(c.gray, 0.9) : ghost, liveEdge ? (e[3] ? 2.6 : 1.5) : 1);
        }
        for (i = 0; i < sim.shortcuts.length; i++) {
          sc = sim.shortcuts[i];
          if (sc.at >= k || sim.removedAt[sc.a] < k || sim.removedAt[sc.b] < k) continue;
          grow = sc.at === k - 1 ? anim : 1;
          D.line(ctx, X(sc.a), Y(sc.a), Blog.lerp(X(sc.a), X(sc.b), grow), Blog.lerp(Y(sc.a), Y(sc.b), grow), Blog.alpha(c.orange, 0.8), 1.4, [5, 4]);
        }
        for (v = 0; v < G.n; v++) {
          at = sim.removedAt[v];
          if (ended) D.circle(ctx, X(v), Y(v), 3.6, Blog.mix(c.stage, c.ink, 0.15 + 0.85 * at / Math.max(1, sim.steps - 1)), Blog.alpha(c.gray, 0.9), 1);
          else if (at < k - 1 || (at === k - 1 && anim >= 1)) D.circle(ctx, X(v), Y(v), 1.6, Blog.alpha(c.gray, 0.4));
          else if (at === k - 1) D.circle(ctx, X(v), Y(v), 4.5 + 7 * anim, Blog.alpha(c.pink, 1 - anim));
          else if (at === k) D.circle(ctx, X(v), Y(v), 5, c.pink, c.stage, 1.5);
          else D.circle(ctx, X(v), Y(v), 3.4, c.stage, c.ink, 1.5);
        }
        var label = which === 0 ? 'step ' + k + ' of ' + seq.steps
          : (ended ? 'done after ' + par.steps + ' rounds  ·  strong contrast = late round' : 'round ' + k + ' of ' + par.steps);
        if (!ended) label += '  ·  ' + plural(G.n - goneBy(sim, k), 'vertex', 'vertices') + ' left';
        D.text(ctx, label, w - 10, h - 11, { font: Blog.mono(11, 700), color: c.muted, align: 'right', halo: c.stage, haloWidth: 5 });
      };
    }

    function redraw() { views.forEach(function (v) { v.invalidate(); }); }

    P.canvases.forEach(function (canvas, idx) { views.push(Blog.canvas(canvas, paint(idx))); });

    stepper = Blog.stepper(controls, {
      total: function () { return par ? par.steps : 0; },
      interval: 950,
      speeds: true,
      onStep: function (i, dir) {
        index = i;
        if (cancel) { cancel(); cancel = null; }
        if (dir === 1 && G) {
          anim = 0;
          cancel = Blog.tween({ dur: 520, update: function (x) { anim = x; redraw(); }, done: function () { cancel = null; } });
        } else anim = 1;
        describe();
        redraw();
      }
    });
    var buttons = Blog.$$('button', controls);
    function lock(on) { buttons.forEach(function (b) { if (on) b.disabled = true; else if (b.className.indexOf('icon') < 0) b.disabled = false; }); }
    function ready() { lock(false); stepper.reset(); }

    controls.appendChild(Blog.el('span', { class: 'spacer' }));
    controls.appendChild(Blog.button('New network', function () {
      seedAt = (seedAt + 1) % SEEDS.length;
      stepper.reset(); lock(true);
      build(ready);
      describe(); redraw();
    }));

    lock(true);
    describe();
    var started = false;
    Blog.inView(fig, function () { if (!started) { started = true; build(ready); } }, null, '1200px 0px');
  });

  /* ======================================================================
     Demo 5: LocalSearch, counting Dijkstra runs in round 2
     ====================================================================== */

  Blog.demo('demo-batch', function (fig) {
    var P = Blog.parts(fig), canvas = P.canvas, status = P.status, readout = P.readout, controls = P.controls;
    var plan = batchPlan();
    var mode = 'naive', step = 0, stepper;

    function runs() { return mode === 'naive' ? plan.naive : mode === 'source' ? plan.bySource : plan.batch; }

    function repeatsUpTo(k) {
      var seen = {}, rep = 0, i, list = runs();
      for (i = 0; i < k; i++) { if (seen[list[i].src]) rep++; seen[list[i].src] = true; }
      return rep;
    }

    function describe() {
      var list = runs(), run = step > 0 ? list[step - 1] : null, txt;
      var single = names(plan.single, ' and ');
      if (!run) {
        if (mode === 'naive') {
          txt = 'Round 1 contracted C, E and I. Six vertices (<span class="k k-purple">purple rings</span>) lost a neighbor and need a new score; ' +
            single + ' have a single neighbor left and need no search. A per-vertex builder rescores the other four independently, each with its own searches.';
        } else if (mode === 'source') {
          txt = 'The same searches, grouped by their <span class="k k-blue">source</span>: one Dijkstra per source finds every distance that any affected vertex wants from it.';
        } else {
          txt = 'Grouped by source, and checked against the table first. Round 1 scored every vertex, so the table already holds the distance between every two vertices that were two hops apart.';
        }
      } else if (mode === 'naive') {
        var again = repeatsUpTo(step) > repeatsUpTo(step - 1);
        txt = 'Rescoring <b>' + name(run.forV) + '</b>: a Dijkstra from its neighbor <span class="k k-blue">' + name(run.src) + '</span> to reach ' +
          '<span class="k k-green">' + names(run.targets, ' and ') + '</span>.' +
          (again ? ' <b>' + name(run.src) + ' was already a source in this round</b>, for another vertex; nothing is shared between the two searches.' : '');
      } else if (mode === 'source') {
        txt = 'One Dijkstra from <span class="k k-blue">' + name(run.src) + '</span> covers everything asked of it: <span class="k k-green">' +
          names(run.targets, ', ') + '</span>.';
      } else {
        txt = 'One Dijkstra from <span class="k k-blue">' + name(run.src) + '</span> finds the ' + (run.targets.length === 1 ? 'distance' : 'distances') +
          ' it still needs: <span class="k k-green">' + names(run.targets, ' and ') + '</span>.' +
          (run.memo.length ? ' Already in the table from round 1: ' + names(run.memo, ', ') + '.' : '');
      }
      if (step === list.length && step > 0) {
        txt += mode === 'naive' ? ' <b>Total: ' + list.length + ' Dijkstra runs.</b>'
          : mode === 'source' ? ' <b>Total: ' + list.length + ' runs</b> instead of ' + plan.naive.length + '.'
            : ' <b>Total: ' + list.length + ' runs</b> instead of ' + plan.naive.length + '; scoring is now pure table lookup.';
      }
      status.innerHTML = txt;
      readout.innerHTML = '<span>Dijkstra runs so far: <b>' + step + ' / ' + list.length + '</b></span>' +
        (mode === 'naive' ? '<span>Repeated sources: <b>' + repeatsUpTo(step) + '</b></span>' : '') +
        (mode === 'batch' ? '<span>Reused from the table: <b>' + list.slice(0, step).reduce(function (acc, r) { return acc + r.memo.length; }, 0) + '</b></span>' : '') +
        '<span>Totals: <b>' + plan.naive.length + '</b> per vertex, <b>' + plan.bySource.length + '</b> by source, <b>' + plan.batch.length + '</b> with the table</span>';
    }

    var view = Blog.canvas(canvas, function (ctx, w, h, c) {
      /* the tally strip at the bottom is sized for the longest list so the graph never moves */
      var chip = 26, gap = 6, labelW = 92, perRow = Math.max(4, Math.floor((w - 32 - labelW) / (chip + gap)));
      var tallyH = Math.ceil(plan.naive.length / perRow) * (chip + 4);
      var L = gridLayout(w, h, 50, tallyH + 52), X = L.x, Y = L.y, r = L.r;
      var list = runs(), run = step > 0 ? list[step - 1] : null, v, key, u, arc, p, i;
      var isTarget = {}, isMemo = {};
      if (run) {
        run.targets.forEach(function (x) { isTarget[x] = true; });
        (run.memo || []).forEach(function (x) { isMemo[x] = true; });
      }

      plan.ghostEdges.forEach(function (g) {
        D.line(ctx, X(g[0]), Y(g[0]), X(g[1]), Y(g[1]), Blog.alpha(c.gray, 0.3), 1.3, [2, 5]);
      });
      for (v = 0; v < SMALL.n; v++) for (key in plan.adj[v]) {
        u = +key;
        if (u < v) continue;
        if (plan.sc[pairKey(v, u)]) {
          arc = arcOf(X(v), Y(v), X(u), Y(u), L.midX, L.midY);
          strokeArc(ctx, arc, c.orange, 2.2, [7, 5]);
          p = arcPoint(arc, 0.5);
          weightLabel(ctx, String(plan.adj[v][key]), p.x, p.y, c.orangeText, c);
        } else {
          D.line(ctx, X(v), Y(v), X(u), Y(u), c.gray, 2);
          weightLabel(ctx, String(plan.adj[v][key]), (X(v) + X(u)) / 2, (Y(v) + Y(u)) / 2, c.text, c);
        }
      }

      /* the current search: dotted arcs to every distance it has to find */
      if (run) {
        run.targets.forEach(function (x) {
          arc = arcOf(X(run.src), Y(run.src), X(x), Y(x), L.midX, L.midY + 1);
          strokeArc(ctx, arc, Blog.alpha(c.green, 0.9), 2.6, [2, 6]);
        });
      }

      for (v = 0; v < SMALL.n; v++) {
        if (plan.gone[v]) {
          ctx.save(); ctx.setLineDash([3, 3]);
          D.circle(ctx, X(v), Y(v), r, c.stage, Blog.alpha(c.gray, 0.8), 1.5);
          ctx.restore();
          D.text(ctx, name(v), X(v), Y(v) + 0.5, { font: Blog.font(Math.round(r * 0.95), 700), color: c.faint });
          continue;
        }
        if (plan.affected[v]) D.circle(ctx, X(v), Y(v), r + 4.5, null, c.purple, 2.5);
        if (run && v === run.src) vertexDisc(ctx, X(v), Y(v), r, name(v), c.blue, c.blue, Blog.inkOn(c.blue), 2);
        else if (isTarget[v]) vertexDisc(ctx, X(v), Y(v), r, name(v), c.green, c.green, Blog.inkOn(c.green), 2);
        else vertexDisc(ctx, X(v), Y(v), r, name(v), c.stage, c.ink, c.ink, 2);
        if (run && mode === 'naive' && v === run.forV) {
          D.tag(ctx, 'rescoring', X(v), Y(v) - r - 15, { fill: c.purple, color: Blog.inkOn(c.purple), font: Blog.font(11, 700), height: 18 });
        }
        if (isMemo[v]) {
          D.tag(ctx, 'known', X(v), SMALL.pos[v][1] === 2 ? Y(v) - r - 15 : Y(v) + r + 15,
            { fill: c.stage, stroke: c.gray, color: c.muted, font: Blog.font(11, 700), height: 18 });
        }
      }

      /* tally of runs: one chip per Dijkstra; a repeated source is red with a second ring */
      var seen = {}, baseY = h - 12 - tallyH;
      D.text(ctx, 'Dijkstra runs', 16, baseY + chip / 2, { font: Blog.font(11.5, 700), color: c.muted, align: 'left' });
      for (i = 0; i < list.length; i++) {
        var cx = 16 + labelW + (i % perRow) * (chip + gap) + chip / 2;
        var cyy = baseY + Math.floor(i / perRow) * (chip + 4) + chip / 2;
        if (i < step) {
          var rep = !!seen[list[i].src], fill = rep ? c.red : c.blue;
          seen[list[i].src] = true;
          D.circle(ctx, cx, cyy, chip / 2 - 1, fill, i === step - 1 ? c.ink : null, 2);
          if (rep) D.circle(ctx, cx, cyy, chip / 2 - 4.5, null, Blog.inkOn(fill), 1.2);
          D.text(ctx, name(list[i].src), cx, cyy + 0.5, { font: Blog.font(12, 700), color: Blog.inkOn(fill) });
        } else {
          D.circle(ctx, cx, cyy, chip / 2 - 1, null, Blog.alpha(c.gray, 0.6), 1.2);
        }
      }
    });

    var seg = Blog.segmented({
      label: 'Strategy', value: 'naive',
      options: [{ value: 'naive', label: 'Per vertex' }, { value: 'source', label: 'Batched by source' }, { value: 'batch', label: 'Batched + table' }],
      onChange: function (v) { mode = v; stepper.reset(); }
    });
    controls.appendChild(seg.el);
    stepper = Blog.stepper(controls, {
      total: function () { return runs().length; },
      interval: 1000,
      onStep: function (i) { step = i; describe(); if (view) view.invalidate(); }
    });
    describe();
    view.invalidate();
  });

  /* Round 2 of the worked example: who needs a new score, which searches a
     per-vertex builder runs, what is left after grouping them by source, and
     what is left after also reusing the distances remembered from round 1.
     Distances are kept per ordered pair, as on a directed road graph. */
  function batchPlan() {
    var n = SMALL.n, adj = adjFrom(n, SMALL.edges), memo = {}, s, v;
    var all = {}, gone = {}, sc = {}, list = [], mids = {}, ghostEdges = [];
    for (v = 0; v < n; v++) all[v] = true;

    /* targets of source s: every v with s - u - v where u is an affected neighbor of s */
    function twoHop(src, affected) {
      var out = {}, k1, k2;
      for (k1 in adj[src]) {
        if (!affected[k1]) continue;
        for (k2 in adj[+k1]) if (+k2 !== src) out[k2] = true;
      }
      return neighbors(out);
    }

    /* round 1: every vertex is affected and every vertex is a source */
    for (s = 0; s < n; s++) twoHop(s, all).forEach(function (x) { memo[s + '>' + x] = true; });
    var first = simulate(n, SMALL.edges, { parallel: true }).picks[0];
    var plans = first.map(function (x) { return analyze(adj, x); });
    var added = [];
    first.forEach(function (x, i) { added = added.concat(addShortcuts(adj, x, plans[i], sc, list, mids, 0)); });
    var affected = {};
    first.forEach(function (x) {
      var key;
      for (key in adj[x]) { ghostEdges.push([x, +key]); delete adj[+key][x]; affected[key] = true; }
      adj[x] = {}; gone[x] = true;
    });

    /* sources for round 2: ends of new shortcuts and their neighbors */
    var sources = {};
    added.forEach(function (e) {
      [e.a, e.b].forEach(function (end) {
        var key;
        sources[end] = true;
        for (key in adj[end]) sources[key] = true;
      });
    });

    var naive = [], bySource = [], batch = [], single = [];
    neighbors(affected).forEach(function (x) {
      var ns = neighbors(adj[x]);
      if (ns.length < 2) { single.push(x); return; }
      ns.forEach(function (src) {
        naive.push({ forV: x, src: src, targets: ns.filter(function (y) { return y !== src; }) });
      });
    });
    for (s = 0; s < n; s++) {
      if (gone[s]) continue;
      var wanted = twoHop(s, affected);
      if (wanted.length) bySource.push({ src: s, targets: wanted, memo: [] });
    }
    neighbors(sources).forEach(function (src) {
      var fresh = [], known = [];
      twoHop(src, affected).forEach(function (x) { if (memo[src + '>' + x]) known.push(x); else fresh.push(x); });
      if (fresh.length) batch.push({ src: src, targets: fresh, memo: known });
    });
    return { adj: adj, gone: gone, sc: sc, ghostEdges: ghostEdges, affected: affected, sources: sources,
      naive: naive, bySource: bySource, batch: batch, single: single, first: first, added: added };
  }

  /* ======================================================================
     Demo 6: the measurements
     ====================================================================== */

  Blog.demo('demo-results', function (fig) {
    var P = Blog.parts(fig), canvas = P.canvas, status = P.status, controls = P.controls;
    /* the paper's main comparison table; build in seconds, query in microseconds */
    var GRAPHS = [
      { id: 'CA', full: 'Central America', n: '3.34M' },
      { id: 'AO', full: 'Australia-Oceania', n: '6.22M' },
      { id: 'AF', full: 'Africa', n: '33.5M' },
      { id: 'NA', full: 'North America', n: '87.0M' },
      { id: 'AS', full: 'Asia', n: '95.7M' },
      { id: 'EU', full: 'Europe', n: '131M' }
    ];
    var BUILD = [
      { label: 'SPoCH', note: '192 threads', ours: true, vals: [1.00, 2.25, 7.32, 23.1, 23.5, 32.9] },
      { label: 'OSRM', note: 'parallel', vals: [4.60, 26.8, 60.0, 307, 286, 521] },
      { label: 'CH-Constructor', note: '8 threads', vals: [19.0, 32.9, 334, 1527, 1548, 2121] },
      { label: 'PHAST', note: 'sequential', vals: [15.5, 66.2, 287, 1341, 1421, 1865] },
      { label: 'RoutingKit', note: 'sequential', vals: [22.1, 94.7, 466, 2466, 2619, 3783] },
      { label: 'SPoCH', note: '1 thread', seq: true, vals: [29.3, 89.6, 383, 1411, 1347, 1823] }
    ];
    var QUERY = [
      { label: 'RoutingKit', note: 'sequential build', vals: [6.65, 24.0, 13.6, 79.1, 47.9, 102] },
      { label: 'SPoCH', note: 'parallel build', ours: true, vals: [7.99, 27.9, 17.2, 93.3, 60.4, 137] },
      { label: 'PHAST', note: 'sequential build', vals: [12.6, 39.2, 26.7, 138, 84.4, 169] },
      { label: 'OSRM', note: 'parallel build', vals: [13.6, 43.8, 28.7, 163, 97.6, 223] },
      { label: 'CH-Constructor', note: 'parallel build', vals: [22.1, 96.4, 48.1, 317, 190, 424] }
    ];
    /* self-relative speedup of SPoCH, from the data file behind the paper's scalability figure */
    var THREADS = [1, 2, 4, 8, 16, 24, 48, 96, 192];
    var SCALE = [
      [1, 1.26, 2.47, 4.85, 9.15, 12.67, 21.71, 33.68, 29.06],
      [1, 1.29, 2.56, 5.00, 9.50, 13.13, 23.78, 39.34, 39.72],
      [1, 1.15, 2.30, 4.67, 9.04, 12.58, 24.58, 45.34, 53.89],
      [1, 1.16, 2.28, 4.55, 8.84, 12.21, 25.28, 48.15, 60.98],
      [1, 1.15, 2.28, 4.51, 8.76, 12.21, 24.81, 46.82, 58.13],
      [1, 1.13, 2.25, 4.46, 8.62, 11.99, 24.42, 46.28, 56.20]
    ];
    var viewMode = 'build', g = 3, logScale = false, shown = null, target = null, cancel = null;

    function rows() { return viewMode === 'build' ? BUILD : QUERY; }

    /* thousands separators only from 10,000 up, as in the post's table */
    function whole(x) { return x >= 10000 ? Blog.num(x) : String(Math.round(x)); }

    function num(x) { return x >= 100 ? whole(x) : x >= 10 ? x.toFixed(1) : x.toFixed(2); }

    function times(x) { return x.toFixed(x >= 10 ? 0 : 1) + '×'; }

    function describe() {
      var G0 = GRAPHS[g], txt;
      if (viewMode === 'build') {
        var best = Math.min(BUILD[1].vals[g], BUILD[2].vals[g], BUILD[3].vals[g], BUILD[4].vals[g]);
        txt = '<b>' + G0.full + '</b> (' + G0.n + ' vertices): SPoCH builds the hierarchy in <b>' + num(BUILD[0].vals[g]) + ' s</b> on 96 cores (192 hyperthreads), ' +
          times(best / BUILD[0].vals[g]) + ' faster than the fastest other builder on the same machine. On one thread it takes ' +
          num(BUILD[5].vals[g]) + ' s; RoutingKit takes ' + num(BUILD[4].vals[g]) + ' s and PHAST ' + num(BUILD[3].vals[g]) + ' s.';
      } else if (viewMode === 'query') {
        txt = '<b>' + G0.full + '</b>: average time of one distance query (1000 random pairs, one thread, RoutingKit’s query code on every hierarchy). ' +
          'On SPoCH’s hierarchy a query takes <b>' + num(QUERY[1].vals[g]) + ' µs</b>, within ' + (QUERY[1].vals[g] / QUERY[0].vals[g]).toFixed(2) +
          '× of RoutingKit’s ' + num(QUERY[0].vals[g]) + ' µs.';
      } else {
        var peak = SCALE[g][8] >= SCALE[g][7];
        txt = '<b>' + G0.full + '</b>: SPoCH on 96 cores is <b>' + SCALE[g][7].toFixed(1) + '×</b> faster than SPoCH on one thread, and <b>' +
          SCALE[g][8].toFixed(1) + '×</b> with all 192 hyperthreads' + (peak ? '.' : ' (on this smallest network the peak is at 96 threads).') +
          ' The dashed line is perfect scaling; the gray curves are the other five networks.';
      }
      status.innerHTML = txt;
    }

    function retarget(animateIt) {
      target = rows().map(function (r) { return r.vals[g]; });
      if (cancel) { cancel(); cancel = null; }
      describe();
      if (!animateIt || !shown || shown.length !== target.length) { shown = target.slice(); view.invalidate(); return; }
      var from = shown.slice();
      cancel = Blog.tween({
        dur: 450,
        update: function (x) { shown = target.map(function (tv, i) { return Blog.lerp(from[i], tv, x); }); view.invalidate(); },
        done: function () { cancel = null; }
      });
    }

    /* about `count` round tick values from 0 to hi */
    function linearTicks(hi, count) {
      var raw = hi / Math.max(1, count), mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), unit = raw / mag;
      unit = (unit > 5 ? 10 : unit > 2 ? 5 : unit > 1 ? 2 : 1) * mag;
      var out = [], v;
      for (v = 0; v <= hi * 1.0001; v += unit) out.push(v);
      return out;
    }

    function drawBars(ctx, w, h, c) {
      var list = rows(), narrow = Blog.compact(w);
      var left = narrow ? 104 : 150, top = 36, bottom = 34;
      var rowH = (h - top - bottom) / list.length, barH = Math.min(26, rowH * 0.56);
      var unit = viewMode === 'build' ? 's' : 'µs';
      var useLog = viewMode === 'build' && logScale;
      var maxV = Math.max.apply(null, target), minV = Math.min.apply(null, target), i, y, r0, ticks = [], tv;
      var valueFont = Blog.mono(11, 700);

      /* the text printed after each mark, measured so that it never leaves the canvas */
      var texts = list.map(function (row, k) {
        var txt = num(shown[k]) + ' ' + unit;
        if (viewMode === 'build' && !row.ours && !narrow) txt += '  ' + times(target[k] / BUILD[0].vals[g]) + ' longer';
        return txt;
      });
      ctx.save(); ctx.font = valueFont;
      var widest = Math.max.apply(null, texts.map(function (txt) { return ctx.measureText(txt).width; }));
      ctx.restore();
      var right = Math.ceil(widest) + 18, plot = w - left - right;

      var lo, hi, sx;
      if (useLog) {
        lo = Math.pow(10, Math.floor(Math.log(minV) / Math.LN10)) * 0.5;
        hi = maxV * 1.1;
        sx = function (v) { return left + (Math.log(Math.max(v, lo)) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)) * plot; };
        for (tv = Math.pow(10, Math.ceil(Math.log(lo) / Math.LN10)); tv <= hi; tv *= 10) ticks.push(tv);
      } else {
        lo = 0; hi = maxV;
        sx = function (v) { return left + v / hi * plot; };
        ticks = linearTicks(hi, Math.max(2, Math.floor(plot / 64)));
      }

      D.text(ctx, (viewMode === 'build' ? (narrow ? 'Build time' : 'Time to build the hierarchy') : (narrow ? 'Time per query' : 'Average time per query')) +
        ', ' + GRAPHS[g].full + (useLog ? ' (log scale)' : ''), narrow ? 12 : left, 16, { font: Blog.font(11.5, 700), color: c.muted, align: 'left' });
      ticks.forEach(function (val, k) {
        var x = sx(val), lastTick = k === ticks.length - 1;
        D.line(ctx, x, top - 4, x, h - bottom + 4, Blog.alpha(c.gray, 0.3), 1);
        D.text(ctx, whole(val) + (useLog || lastTick ? ' ' + unit : ''), x, h - bottom + 16, { font: Blog.mono(11, 600), color: c.muted });
      });
      for (i = 0; i < list.length; i++) {
        r0 = list[i]; y = top + rowH * (i + 0.5);
        D.text(ctx, r0.label, left - 10, y - (narrow ? 6 : 7), { font: Blog.font(narrow ? 11.5 : 12.5, 700), color: c.ink, align: 'right' });
        D.text(ctx, r0.note, left - 10, y + (narrow ? 7 : 8), { font: Blog.font(11, 500), color: c.muted, align: 'right' });
        var x1 = sx(shown[i]), color = r0.ours ? c.accent : (r0.seq ? Blog.alpha(c.accent, 0.45) : c.gray);
        if (useLog) {
          /* a log axis has no zero, so a bar's length would mean nothing: mark the value with a dot */
          D.line(ctx, left, y, w - right, y, Blog.alpha(c.gray, 0.25), 1);
          D.circle(ctx, x1, y, 6.5, color, c.stage, 1.5);
          D.text(ctx, texts[i], x1 + 12, y, { font: valueFont, color: r0.ours ? c.accent : c.text, align: 'left' });
        } else {
          D.roundRect(ctx, left, y - barH / 2, Math.max(2, x1 - left), barH, 4, color);
          D.text(ctx, texts[i], x1 + 7, y, { font: valueFont, color: r0.ours ? c.accent : c.text, align: 'left' });
        }
      }
    }

    function drawScale(ctx, w, h, c) {
      var narrow = Blog.compact(w), left = 46, right = narrow ? 52 : 70, top = 34, bottom = 44;
      var lx = function (p) { return left + (Math.log(p) / Math.LN2) / (Math.log(192) / Math.LN2) * (w - left - right); };
      var ly = function (v) { return h - bottom - (Math.log(v) / Math.LN2) / 7 * (h - top - bottom); };
      var i, k;
      D.text(ctx, narrow ? 'Speedup over one thread (log axes)' : 'Speedup over one thread, both axes logarithmic', narrow ? 12 : left, 16,
        { font: Blog.font(11.5, 700), color: c.muted, align: 'left' });
      [1, 2, 4, 8, 16, 32, 64, 128].forEach(function (v) {
        D.line(ctx, left, ly(v), w - right, ly(v), Blog.alpha(c.gray, 0.25), 1);
        D.text(ctx, v + '×', left - 8, ly(v), { font: Blog.mono(11, 600), color: c.muted, align: 'right' });
      });
      THREADS.forEach(function (p) {
        if (narrow && (p === 2 || p === 24)) return;
        D.text(ctx, String(p), lx(p), h - bottom + 15, { font: Blog.mono(11, 600), color: c.muted });
      });
      D.text(ctx, narrow ? 'threads (192 = hyperthreads on 96 cores)' : 'threads (192 = all hyperthreads of the 96 cores)', (left + w - right) / 2, h - 10,
        { font: Blog.font(11, 500), color: c.muted });
      D.line(ctx, lx(1), ly(1), lx(96), ly(96), Blog.alpha(c.gray, 0.8), 1.3, [5, 5]);
      D.text(ctx, 'ideal', lx(96) - 6, ly(96) - 9, { font: Blog.font(11, 600), color: c.muted, align: 'right' });
      for (k = 0; k < SCALE.length; k++) {
        if (k === g) continue;
        ctx.save(); ctx.strokeStyle = Blog.alpha(c.gray, 0.55); ctx.lineWidth = 1.3; ctx.beginPath();
        for (i = 0; i < THREADS.length; i++) { if (i === 0) ctx.moveTo(lx(THREADS[i]), ly(SCALE[k][i])); else ctx.lineTo(lx(THREADS[i]), ly(SCALE[k][i])); }
        ctx.stroke(); ctx.restore();
      }
      ctx.save(); ctx.strokeStyle = c.accent; ctx.lineWidth = 2.8; ctx.lineJoin = 'round'; ctx.beginPath();
      for (i = 0; i < THREADS.length; i++) { if (i === 0) ctx.moveTo(lx(THREADS[i]), ly(SCALE[g][i])); else ctx.lineTo(lx(THREADS[i]), ly(SCALE[g][i])); }
      ctx.stroke(); ctx.restore();
      for (i = 0; i < THREADS.length; i++) D.circle(ctx, lx(THREADS[i]), ly(SCALE[g][i]), 3.6, c.stage, c.accent, 2);
      D.text(ctx, SCALE[g][8].toFixed(1) + '×', lx(192) + 8, ly(SCALE[g][8]), { font: Blog.mono(11.5, 700), color: c.accent, align: 'left' });
    }

    var view = Blog.canvas(canvas, function (ctx, w, h, c) {
      if (!shown) return;
      if (viewMode === 'scale') drawScale(ctx, w, h, c); else drawBars(ctx, w, h, c);
    });

    var logBox = Blog.checkbox('Log scale', false, function (on) { logScale = on; view.invalidate(); });
    controls.appendChild(Blog.segmented({
      label: 'Chart', value: 'build',
      options: [{ value: 'build', label: 'Build time' }, { value: 'query', label: 'Query time' }, { value: 'scale', label: 'Scaling' }],
      onChange: function (v) { viewMode = v; logBox.el.style.display = v === 'build' ? '' : 'none'; shown = null; retarget(false); }
    }).el);
    controls.appendChild(Blog.segmented({
      label: 'Road network', value: 3,
      options: GRAPHS.map(function (x, i) { return { value: i, label: x.id }; }),
      onChange: function (v) { g = v; if (viewMode === 'scale') { describe(); view.invalidate(); } else retarget(true); }
    }).el);
    controls.appendChild(logBox.el);
    retarget(false);
  });

  /* ======================================================================
     Self-check, only defined when the page is opened with #selfcheck:
     Blog._chCheck() compares every CH query against plain Dijkstra.
     ====================================================================== */

  if (window.location.hash === '#selfcheck') Blog._chCheck = function () {
    var out = [], bad = 0, a, b, i;
    var small = simulate(SMALL.n, SMALL.edges, { parallel: true }), base = adjFrom(SMALL.n, SMALL.edges);
    out.push('rounds: ' + small.picks.map(function (r) { return names(r, ''); }).join(' | '));
    out.push('shortcuts: ' + small.shortcuts.map(function (x) { return name(x.a) + name(x.b) + x.w + '/' + name(x.mid); }).join(' '));
    for (a = 0; a < SMALL.n; a++) for (b = 0; b < SMALL.n; b++) {
      if (a !== b && chQuery(small.up, a, b).dist !== dijkstra(base, a, { target: b }).dist[b]) bad++;
    }
    out.push('small mismatches: ' + bad);
    out.push('D->I naive ' + chQuery(small.up, 3, 8, { naive: true }).dist + ' real ' + chQuery(small.up, 3, 8).dist);
    var cfgs = [[26, 15, 7, { depth: 1 }], [26, 15, 7, { depth: 1, cap: 60 }], [26, 15, 7, { depth: 1, cap: 30 }]];
    [12, 31, 47, 58, 73, 90].forEach(function (seed) { cfgs.push([14, 9, seed, {}]); cfgs.push([14, 9, seed, { parallel: true }]); });
    cfgs.forEach(function (cfg) {
      var G = roadGraph(cfg[0], cfg[1], cfg[2]), opts = cfg[3], adj = adjFrom(G.n, G.edges), t0 = Date.now();
      opts.prio = G.prio;
      var sim = simulate(G.n, G.edges, opts), ms = Date.now() - t0;
      var rnd = Blog.rng(99), miss = 0, total = 0, sum = 0, indep = 0;
      sim.picks.forEach(function (round) {
        round.forEach(function (x) { round.forEach(function (y) { if (x < y && sim.up[x][y] !== undefined) indep++; }); });
      });
      for (i = 0; i < 300; i++) {
        a = rnd.int(0, G.n - 1); b = rnd.int(0, G.n - 1);
        if (a === b) continue;
        var q = chQuery(sim.up, a, b), d = dijkstra(adj, a, { target: b });
        total++; sum += d.order.length / q.events.length;
        if (q.dist !== d.dist[b]) miss++;
        var path = unpack(chPath(q, a, b), sim.mids), len = 0, k;
        for (k = 1; k < path.length; k++) len += adj[path[k - 1]][path[k]];
        if (len !== q.dist) miss++;
      }
      out.push('graph ' + cfg.slice(0, 3).join('x') + (opts.parallel ? ' rounds' : ' seq') + (opts.cap ? ' cap' + opts.cap : '') + ' n=' + G.n + ' steps=' + sim.steps +
        ' shortcuts=' + sim.shortcuts.length + ' mismatches=' + miss + '/' + total + ' adjacent-in-round=' + indep +
        ' avg ratio=' + (sum / total).toFixed(1) + ' build=' + ms + 'ms' +
        (opts.parallel ? ' sizes=' + sim.picks.map(function (r) { return r.length; }).join(',') : ''));
    });
    var plan = batchPlan();
    out.push('batch: per vertex ' + plan.naive.length + ', by source ' + plan.bySource.length + ' (' + names(plan.bySource.map(function (r) { return r.src; }), '') +
      '), with table ' + plan.batch.length + ' runs / ' + plan.batch.reduce(function (acc, r) { return acc + r.targets.length; }, 0) +
      ' targets; sources ' + names(neighbors(plan.sources), '') + '; affected ' + names(neighbors(plan.affected), '') + '; single ' + names(plan.single, ''));
    out.push('orders: good ' + countShortcuts(SMALL.n, SMALL.edges, [2, 4, 8, 0, 3, 5, 9, 1, 6, 7]) +
      ' careless ' + countShortcuts(SMALL.n, SMALL.edges, [6, 5, 1, 2, 0, 3, 4, 7, 8, 9]) +
      ' best-known ' + countShortcuts(SMALL.n, SMALL.edges, [4, 0, 8, 9, 2, 3, 7, 1, 5, 6]));
    return out.join('\n');
  };
})();

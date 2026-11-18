/* Animated card art for /blog/. Each canvas[data-art] gets a small looping
   sketch of the post's core idea. Depends on common.js (global Blog). */
(function () {
  'use strict';

  if (!window.Blog) return;

  var D = Blog.draw;
  var HEAD = 24;          /* band at the top of every card reserved for its label */
  var CYCLES = 2;         /* loops played before the sketch rests on its last frame */

  /* Each sketch returns { paint, cycle }. The loop runs only while the card is
     on screen, plays a couple of cycles, then rests on the final frame until
     the reader points at (or focuses) the card again. */
  function mount(canvas, setup) {
    var card = canvas.closest('.blog-card') || canvas;
    var accent = Blog.colorOf(card, '--b-accent');
    Blog.onTheme(function () { accent = Blog.colorOf(card, '--b-accent'); });
    var sketch = setup();
    var time = 0, stopAt = 0;
    var broken = false;
    var view = Blog.canvas(canvas, function (ctx, w, h, c) {
      if (broken) return;
      try { sketch.paint(ctx, w, h, c, accent, time); }
      catch (err) {
        broken = true;
        if (window.console) console.error('[blog] card art "' + canvas.getAttribute('data-art') + '" failed at t=' + time, err && err.stack);
      }
    });
    var rest = sketch.cycle - 0.02;                    /* the last frame of a cycle */
    if (Blog.reduced) { time = rest; view.redraw(); return; }

    var loop = Blog.loop(canvas, function (dt) {
      time += dt;
      if (time >= stopAt) { time = stopAt; loop.stop(); }
      view.redraw();
    });
    function wake() {
      if (loop.wanted && time < stopAt) return;
      var done = Math.floor((time + 0.05) / sketch.cycle);
      time = done * sketch.cycle;
      stopAt = time + CYCLES * sketch.cycle - 0.02;
      loop.start();
    }
    stopAt = CYCLES * sketch.cycle - 0.02;
    card.addEventListener('pointerenter', wake);
    card.addEventListener('focus', wake);
    Blog.inView(canvas, wake);
  }

  function label(ctx, text, w, c) {
    D.text(ctx, text, w - 12, 13, { font: Blog.mono(11, 600), color: c.muted, align: 'right' });
  }

  /* ---- LIS: peel the points off in layers ---- */
  function lis() {
    var rnd = Blog.rng(11), n = 26, i, j;
    var vals = [];
    for (i = 0; i < n; i++) vals.push(i);
    rnd.shuffle(vals);
    var rank = [], k = 0;
    for (i = 0; i < n; i++) {
      rank[i] = 1;
      for (j = 0; j < i; j++) if (vals[j] < vals[i] && rank[j] + 1 > rank[i]) rank[i] = rank[j] + 1;
      if (rank[i] > k) k = rank[i];
    }
    var per = 0.75, hold = 1.6;

    function paint(ctx, w, h, c, accent, t) {
      var tt = t % (k * per + hold);
      var round = Math.min(k, Math.floor(tt / per) + 1);
      var frac = tt < k * per ? (tt % per) / per : 1;
      var padX = 22, top = HEAD + 8, bottom = 18;
      var px = function (idx) { return padX + (w - 2 * padX) * idx / (n - 1); };
      var py = function (v) { return h - bottom - (h - top - bottom) * v / (n - 1); };

      /* staircase through the current layer: the prefix minima of what is left */
      var layer = [];
      for (i = 0; i < n; i++) if (rank[i] === round) layer.push(i);
      ctx.save();
      ctx.globalAlpha = Blog.clamp(frac * 2.5, 0, 1) * 0.55;
      ctx.strokeStyle = accent; ctx.lineWidth = 1.5; ctx.beginPath();
      layer.forEach(function (idx, q) {
        var x = px(idx), y = py(vals[idx]);
        if (q === 0) ctx.moveTo(x, HEAD);
        ctx.lineTo(x, y);
        ctx.lineTo(q + 1 < layer.length ? px(layer[q + 1]) : w - padX * 0.4, y);
      });
      ctx.stroke();
      ctx.restore();

      for (i = 0; i < n; i++) {
        var x = px(i), y = py(vals[i]);
        if (rank[i] < round) D.circle(ctx, x, y, 3, Blog.alpha(accent, 0.22));
        else if (rank[i] === round) D.circle(ctx, x, y, 3.5 + 2.5 * Math.sin(Math.min(1, frac * 1.6) * Math.PI), accent);
        else D.circle(ctx, x, y, 3.5, c.gray);
      }
      label(ctx, 'round ' + round + ' of ' + k, w, c);
    }
    return { paint: paint, cycle: k * per + hold };
  }

  /* ---- CH: every round contracts a whole independent set at once ----
     A real (tiny) parallel contraction: score = edge difference with witness
     searches, pick every vertex that beats all its neighbors, contract them
     together, add only the shortcuts that no witness path makes unnecessary. */
  function ch() {
    var rnd = Blog.rng(7), cols = 6, rows = 4, nodes = [], i, j;
    for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) {
      nodes.push({ x: (i + 0.5 + rnd.range(-0.27, 0.27)) / cols, y: (j + 0.5 + rnd.range(-0.27, 0.27)) / rows });
    }
    var n = nodes.length;
    var len = function (a, b) { return Blog.dist(nodes[a].x * 2.3, nodes[a].y, nodes[b].x * 2.3, nodes[b].y); };
    var adj = [], alive = [], prio = [], removedAt = [], edges = [];
    for (i = 0; i < n; i++) { adj.push({}); alive.push(true); prio.push(rnd()); removedAt.push(Infinity); }
    var link = function (a, b) { adj[a][b] = adj[b][a] = len(a, b); edges.push([a, b]); };
    for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) {
      var v = j * cols + i;
      if (i + 1 < cols) link(v, v + 1);
      if (j + 1 < rows) link(v, v + cols);
      if (i + 1 < cols && j + 1 < rows && rnd() < 0.28) link(v, v + cols + 1);
    }

    /* shortest u-w distance among live vertices without passing through `skip` */
    function witness(u, w, skip, cap) {
      var dist = {}, done = {}, x, y, best;
      dist[u] = 0;
      for (;;) {
        best = -1;
        for (x in dist) if (!done[x] && (best < 0 || dist[x] < dist[best])) best = +x;
        if (best < 0 || dist[best] > cap) return Infinity;
        if (best === w) return dist[best];
        done[best] = true;
        for (y in adj[best]) {
          y = +y;
          if (y === skip || !alive[y]) continue;
          var nd = dist[best] + adj[best][y];
          if (dist[y] === undefined || nd < dist[y]) dist[y] = nd;
        }
      }
    }
    function needed(vtx) {
      var nb = Object.keys(adj[vtx]).map(Number), out = [], a, b;
      for (a = 0; a < nb.length; a++) for (b = a + 1; b < nb.length; b++) {
        var via = adj[vtx][nb[a]] + adj[vtx][nb[b]];
        if (witness(nb[a], nb[b], vtx, via) > via - 1e-9) out.push([nb[a], nb[b], via]);
      }
      return out;
    }

    var rounds = [], shortcuts = [], left = n;
    while (left > 3 && rounds.length < 12) {
      var score = [], plan = [], chosen = [];
      for (i = 0; i < n; i++) if (alive[i]) {
        plan[i] = needed(i);
        score[i] = plan[i].length - Object.keys(adj[i]).length;
      }
      for (i = 0; i < n; i++) if (alive[i]) {
        var wins = true, u;
        for (u in adj[i]) {
          u = +u;
          if (score[u] < score[i] || (score[u] === score[i] && prio[u] < prio[i])) { wins = false; break; }
        }
        if (wins) chosen.push(i);
      }
      if (!chosen.length || left - chosen.length < 3) break;
      chosen.forEach(function (vtx) {
        plan[vtx].forEach(function (s) {
          if (adj[s[0]][s[1]] === undefined) shortcuts.push({ a: s[0], b: s[1], at: rounds.length });
          if (adj[s[0]][s[1]] === undefined || s[2] < adj[s[0]][s[1]]) adj[s[0]][s[1]] = adj[s[1]][s[0]] = s[2];
        });
      });
      chosen.forEach(function (vtx) {
        Object.keys(adj[vtx]).forEach(function (u) { delete adj[u][vtx]; });
        adj[vtx] = {}; alive[vtx] = false; removedAt[vtx] = rounds.length;
      });
      left -= chosen.length;
      rounds.push(chosen);
    }
    var per = 1.15, hold = 2.0, total = rounds.length;

    function paint(ctx, w, h, c, accent, t) {
      var tt = Math.max(0, t) % (total * per + hold);
      var pos = Math.min(total, tt / per);
      var round = Blog.clamp(Math.floor(pos), 0, total - 1);
      var pad = 18, top = HEAD + 6;
      var X = function (p) { return pad + p.x * (w - 2 * pad); };
      var Y = function (p) { return top + p.y * (h - top - 12); };
      /* 0 = untouched, rises to 1 during the second half of the vertex's round */
      var gone = function (vtx) { return Blog.clamp((pos - removedAt[vtx] - 0.4) / 0.6, 0, 1); };

      edges.forEach(function (e) {
        var fade = 1 - 0.82 * Math.max(gone(e[0]), gone(e[1]));
        D.line(ctx, X(nodes[e[0]]), Y(nodes[e[0]]), X(nodes[e[1]]), Y(nodes[e[1]]), Blog.alpha(c.gray, 0.8 * fade), 1.4);
      });
      shortcuts.forEach(function (s) {
        var grow = Blog.clamp((pos - s.at - 0.4) / 0.55, 0, 1);
        if (grow <= 0) return;
        var a = nodes[s.a], b = nodes[s.b];
        var fade = 1 - 0.8 * Math.max(gone(s.a), gone(s.b));
        D.line(ctx, X(a), Y(a), Blog.lerp(X(a), X(b), grow), Blog.lerp(Y(a), Y(b), grow), Blog.alpha(accent, 0.95 * fade), 1.9, [5, 4]);
      });
      nodes.forEach(function (p, vtx) {
        var into = pos - removedAt[vtx];             /* time since this vertex's round began */
        var g = gone(vtx);
        if (g >= 1) { D.circle(ctx, X(p), Y(p), 2.4, Blog.alpha(c.gray, 0.4)); return; }
        if (into >= 0) {
          /* picked this round: all of them light up together, then go */
          var pulse = Math.sin(Blog.clamp(into / 0.4, 0, 1) * Math.PI);
          D.circle(ctx, X(p), Y(p), 9 + 3 * pulse + 5 * g, Blog.alpha(accent, 0.22 * (1 - g)));
          D.circle(ctx, X(p), Y(p), 5.2 * (1 - 0.5 * g), Blog.alpha(accent, 1 - g));
        } else D.circle(ctx, X(p), Y(p), 4.8, c.stage, c.ink, 1.6);
      });
      var text = pos >= total ? total + ' rounds, ' + (n - left) + ' vertices'
        : 'round ' + (round + 1) + ': ' + rounds[round].length + ' at once';
      label(ctx, text, w, c);
    }
    return { paint: paint, cycle: total * per + hold };
  }

  /* ---- PlanarCutter: lock the two ends, then find the wall between them ----
     As in the paper: sort the junctions along a direction and lock the first and
     the last ALPHA of them as the terminals S and T. The cut is then a wall
     through the free middle. The wall alternates junction, block, junction,
     block (a path in the radial graph); it never follows a street. */
  function planarcutter() {
    var rnd = Blog.rng(21), cols = 10, rows = 6, pts = [], i, j;
    for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) {
      pts.push({ x: (i + 0.5 + rnd.range(-0.26, 0.26)) / cols, y: (j + 0.5 + rnd.range(-0.26, 0.26)) / rows, i: i, j: j });
    }
    var at = function (a, b) { return pts[b * cols + a]; };

    /* terminals: the leftmost and the rightmost ALPHA of all junctions, by x */
    var ALPHA = 0.25, nTerm = Math.round(ALPHA * pts.length), sMax = 0, tMin = 1;
    pts.slice().sort(function (a, b) { return a.x - b.x; }).forEach(function (p, r) {
      var fromRight = pts.length - 1 - r;
      p.term = r < nTerm ? -1 : fromRight < nTerm ? 1 : 0;
      p.rank = r < nTerm ? r / nTerm : fromRight < nTerm ? fromRight / nTerm : 0;   /* 0 = outermost */
      if (p.term < 0) sMax = Math.max(sMax, p.x);
      if (p.term > 0) tMin = Math.min(tMin, p.x);
    });
    var freeColumn = function (col) {
      for (var r = 0; r < rows; r++) if (at(col, r).term !== 0) return false;
      return true;
    };
    var lo = 0, hi = cols - 1;
    while (lo < hi && !freeColumn(lo)) lo += 1;
    while (hi > lo && !freeColumn(hi)) hi -= 1;

    /* wall column per row, inside the free middle; neighbors differ by at most one
       column, so two consecutive wall vertices always sit on a common block */
    var wc = [Math.floor((lo + hi) / 2)], faces = [];
    for (j = 1; j < rows; j++) wc.push(Blog.clamp(wc[j - 1] + rnd.pick([-1, 0, 1, 1, 0]), lo, hi));
    for (j = 0; j + 1 < rows; j++) {
      var a = wc[j], b = wc[j + 1];
      var cell = b > a ? a : b < a ? b : (j % 2 ? a - 1 : a);   /* left column of the shared block */
      faces.push({ i: cell, j: j });
    }
    var side = function (p) { return p.i === wc[p.j] ? 0 : (p.i < wc[p.j] ? -1 : 1); };
    var lock = 1.3, grow = 2.1, split = 1.0, hold = 2.2;
    var steps = 2 * rows - 1;                        /* vertex, block, vertex, ... */
    var percent = Math.round(ALPHA * 100);

    function paint(ctx, w, h, c, accent, t) {
      var tt = Math.max(0, t) % (lock + grow + split + hold);
      var L = Blog.clamp(tt / (lock * 0.75), 0, 1);                       /* terminals locked, outermost first */
      var g = Blog.clamp((tt - lock) / grow, 0, 1) * (steps + 1);         /* wall elements revealed so far */
      var s = Blog.ease.inOut(Blog.clamp((tt - lock - grow) / split, 0, 1));
      var pad = 16, top = HEAD + 4, bottom = 20, shift = 10 * s;
      var span = w - 2 * pad;
      var X = function (p) { return pad + p.x * span + side(p) * shift; };
      var Y = function (p) { return top + p.y * (h - top - bottom); };
      var hue = function (p) { return side(p) < 0 ? c.blue : c.orange; };
      /* how much of its side's color a junction shows: a terminal as soon as it is
         locked, a free junction only once the wall has decided its side */
      var amount = function (p) { return p.term !== 0 ? (p.rank <= L ? 1 : 0) : s; };

      /* the two locked ends */
      var zone = function (x0, x1, color, textColor, letter, align) {
        D.roundRect(ctx, x0, top - 5, x1 - x0, h - top - 1, 7, Blog.alpha(color, 0.1 * L));
        if (L > 0.45) {
          D.text(ctx, letter + ' · ' + percent + '%', align === 'left' ? x0 + 7 : x1 - 7, h - 9,
            { font: Blog.font(11, 700), color: textColor, align: align });
        }
      };
      zone(Math.max(2, 5 - shift), pad + sMax * span + 9 - shift, c.blue, c.blueText, 'S', 'left');
      zone(pad + tMin * span - 9 + shift, Math.min(w - 2, w - 5 + shift), c.orange, c.orangeText, 'T', 'right');

      /* streets */
      for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) {
        var p = at(i, j);
        [[1, 0], [0, 1]].forEach(function (d) {
          if (i + d[0] >= cols || j + d[1] >= rows) return;
          var q = at(i + d[0], j + d[1]);
          var cut = side(p) === 0 || side(q) === 0;            /* touches a removed junction */
          var color = cut ? Blog.alpha(c.gray, 0.75 * (1 - s))
            : Blog.alpha(Blog.mix(c.gray, hue(p), 0.6 * Math.min(amount(p), amount(q))), 0.8);
          D.line(ctx, X(p), Y(p), X(q), Y(q), color, 1.3);
        });
      }

      /* the wall: junction -> middle of a block -> junction ... */
      var stops = [];
      for (j = 0; j < rows; j++) {
        var v = at(wc[j], j);
        stops.push({ x: X(v), y: Y(v), vertex: true });
        if (j + 1 < rows) {
          var f = faces[j], cx = 0, cy = 0;
          [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(function (d) {
            var corner = at(f.i + d[0], f.j + d[1]);
            cx += pad + corner.x * span; cy += Y(corner);
          });
          stops.push({ x: cx / 4, y: cy / 4, vertex: false });
        }
      }
      var ends = [{ x: stops[0].x, y: top - 6 }].concat(stops, [{ x: stops[stops.length - 1].x, y: h - bottom + 8 }]);
      ctx.save();
      ctx.strokeStyle = accent; ctx.lineWidth = 2.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      ends.forEach(function (pt, q) {
        if (g <= 0 || q > Math.ceil(g)) return;
        var x = pt.x, y = pt.y;
        if (q > g && q > 0) { x = Blog.lerp(ends[q - 1].x, x, g - (q - 1)); y = Blog.lerp(ends[q - 1].y, y, g - (q - 1)); }
        if (q === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();

      pts.forEach(function (p) {
        if (side(p) === 0) return;
        var a = amount(p);
        D.circle(ctx, X(p), Y(p), p.term !== 0 && a > 0 ? 3.2 : 2.6, Blog.mix(c.gray, hue(p), a));
      });
      var reached = 0;
      stops.forEach(function (pt, q) {
        if (g <= 0 || q + 1 > g) { if (pt.vertex) D.circle(ctx, pt.x, pt.y, 2.6, c.gray); return; }
        if (pt.vertex) { reached += 1; D.circle(ctx, pt.x, pt.y, 4.6, accent, c.stage, 1.5); }
        else D.roundRect(ctx, pt.x - 3.5, pt.y - 3.5, 7, 7, 1.5, c.stage, accent, 1.8);
      });
      label(ctx, tt < lock ? 'lock ' + percent + '% at each end'
        : reached < rows ? 'BFS round ' + Math.max(1, reached)
        : 'wall: ' + rows + ' junctions', w, c);
    }
    return { paint: paint, cycle: lock + grow + split + hold };
  }

  /* ---- FlashbackANN: lifespans on a timeline, a query time sweeping ---- */
  function flashback() {
    var rnd = Blog.rng(8), bars = [], n = 11, i;
    for (i = 0; i < n; i++) {
      var s = rnd.range(0, 0.72);
      bars.push({ s: s, e: Math.min(1.02, s + rnd.range(0.14, 0.5)) });
    }
    bars.sort(function (a, b) { return a.s - b.s; });
    var windows = 4, speed = 0.55;

    function paint(ctx, w, h, c, accent, t) {
      var padL = 16, padR = 16, top = HEAD + 10, bottom = 16;
      var span = w - padL - padR;
      var q = 0.06 + 0.84 * (Math.sin(t * speed - 0.1) + 1) / 2;  /* query time; rests mid-timeline */
      var qx = padL + q * span;
      var win = Math.min(windows - 1, Math.floor(q * windows));

      /* one checkpoint per window of updates; the query uses the one for its window */
      for (i = 0; i < windows; i++) {
        var x0 = padL + span * i / windows, x1 = padL + span * (i + 1) / windows;
        D.roundRect(ctx, x0 + 2, HEAD - 6, x1 - x0 - 4, 8, 4, i === win ? Blog.alpha(accent, 0.9) : Blog.alpha(c.gray, 0.28));
      }
      var rowH = (h - top - bottom) / n;
      bars.forEach(function (b, r) {
        var y = top + r * rowH + rowH / 2;
        var active = b.s <= q && q < b.e;
        var x0 = padL + b.s * span, x1 = Math.min(w - 6, padL + b.e * span);
        D.line(ctx, x0, y, x1, y, active ? accent : Blog.alpha(c.gray, 0.45), active ? 4.5 : 3);
        if (active) D.circle(ctx, qx, y, 3.6, c.stage, accent, 2);
      });
      D.line(ctx, qx, HEAD + 4, qx, h - 14, Blog.alpha(c.ink, 0.55), 1.2, [3, 3]);
      D.text(ctx, 'query time', Blog.clamp(qx, 40, w - 40), h - 7, { font: Blog.mono(11, 600), color: c.muted, halo: c.stage });
      D.text(ctx, 'checkpoint ' + win, padL + 2, 9, { font: Blog.mono(11, 600), color: c.muted, align: 'left' });
    }
    return { paint: paint, cycle: 2 * Math.PI / speed };
  }

  var sketches = { lis: lis, ch: ch, planarcutter: planarcutter, flashback: flashback };

  Blog.ready(function () {
    Blog.$$('canvas[data-art]').forEach(function (canvas) {
      var make = sketches[canvas.getAttribute('data-art')];
      if (!make) return;
      try { mount(canvas, make); }
      catch (err) { if (window.console) console.error('[blog] card art failed:', err); }
    });
  });
})();

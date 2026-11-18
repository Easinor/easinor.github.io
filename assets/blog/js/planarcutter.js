/* PlanarCutter post: interactive demos.
   Depends on common.js (global Blog).

   Colors come from Blog.theme(); the hues keep one meaning across the post:
   blue = terminal S and its side, orange = terminal T and its side,
   green ring = start vertices, purple ring = end vertices, teal = reached by
   the BFS, red = wall / separator, pink = repair vertex or augmenting path.

   Everything on the page is computed live from a small plane-graph toolkit:
   faces from the rotation system, the radial (vertex-face) graph, the wall BFS,
   a max-flow min vertex cut used as an independent check, nested dissection,
   and the CCH contraction that turns an order into an index. */
(function () {
  'use strict';

  var D = Blog.draw;
  var FREE = 0, SRC = 1, SNK = 2;

  /* ======================================================================
     Small helpers
     ====================================================================== */

  function filled(n, value) {
    var out = [], i;
    for (i = 0; i < n; i++) out.push(value);
    return out;
  }

  function numeric(a, b) { return a - b; }

  function uniq(list) {
    var seen = {}, out = [];
    list.forEach(function (v) { if (!seen[v]) { seen[v] = true; out.push(v); } });
    return out;
  }

  function crossProd(ax, ay, bx, by) { return ax * by - ay * bx; }

  /* one number for the unordered pair {a, b} among n vertices */
  function pairKey(a, b, n) { return Math.min(a, b) * n + Math.max(a, b); }

  /* proper intersection of segments ab and cd; touching at endpoints does not count */
  function segHit(a, b, c, d) {
    var rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y;
    var den = crossProd(rx, ry, sx, sy);
    if (Math.abs(den) < 1e-12) return null;
    var t = crossProd(c.x - a.x, c.y - a.y, sx, sy) / den;
    var u = crossProd(c.x - a.x, c.y - a.y, rx, ry) / den;
    var eps = 1e-7;
    if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null;
    return { x: a.x + t * rx, y: a.y + t * ry, t: t, u: u };
  }

  function pointInPoly(px, py, poly) {
    var inside = false, i, j;
    for (i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[i], b = poly[j];
      if ((a.y > py) !== (b.y > py) && px < (b.x - a.x) * (py - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }

  function distToSeg(px, py, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    var t = len2 > 0 ? Blog.clamp(((px - a.x) * dx + (py - a.y) * dy) / len2, 0, 1) : 0;
    return Blog.dist(px, py, a.x + t * dx, a.y + t * dy);
  }

  /* ======================================================================
     Plane graphs: rotation system -> faces -> radial graph
     ====================================================================== */

  /* pts: [{x, y}], edges: [[u, v]]. The drawing must be crossing-free. */
  function makeGraph(pts, edges) {
    var n = pts.length, adj = [], i;
    for (i = 0; i < n; i++) adj.push([]);
    edges.forEach(function (e) { adj[e[0]].push(e[1]); adj[e[1]].push(e[0]); });
    /* the rotation system: neighbors of every vertex in cyclic order */
    adj.forEach(function (list, v) {
      list.sort(function (a, b) {
        return Math.atan2(pts[a].y - pts[v].y, pts[a].x - pts[v].x) - Math.atan2(pts[b].y - pts[v].y, pts[b].x - pts[v].x);
      });
    });
    var g = { n: n, pts: pts, edges: edges, adj: adj };
    computeFaces(g);
    return g;
  }

  /* Walk along a half-edge, then turn into the next edge around the vertex you
     reach: that traces one face. Every half-edge lies on exactly one face. */
  function computeFaces(g) {
    var n = g.n, heFace = {}, faces = [], u, k;
    for (u = 0; u < n; u++) {
      for (k = 0; k < g.adj[u].length; k++) {
        var key = u * n + g.adj[u][k];
        if (heFace[key] != null) continue;
        var walk = [], a = u, b = g.adj[u][k], guard = 0, area = 0;
        while (heFace[a * n + b] == null && guard++ < 4 * g.edges.length + 8) {
          heFace[a * n + b] = faces.length;
          walk.push(a);
          area += crossProd(g.pts[a].x, g.pts[a].y, g.pts[b].x, g.pts[b].y);
          var list = g.adj[b], idx = list.indexOf(a);
          var w = list[(idx - 1 + list.length) % list.length];
          a = b; b = w;
        }
        faces.push({ id: faces.length, walk: walk, verts: uniq(walk), area: area / 2 });
      }
    }
    /* with this turning rule every inner face has positive signed area and
       the outer face is the one traced the other way round */
    var outer = 0;
    faces.forEach(function (f) { if (f.area < faces[outer].area) outer = f.id; });
    var vfaces = [];
    for (u = 0; u < n; u++) vfaces.push([]);
    faces.forEach(function (f) { f.verts.forEach(function (v) { vfaces[v].push(f.id); }); });
    faces.forEach(function (f) { f.pole = f.id === outer ? null : facePole(g, f); });
    g.faces = faces; g.outer = outer; g.vfaces = vfaces; g.heFace = heFace;
  }

  /* a point well inside the face, used to draw face nodes and walls */
  function facePole(g, f) {
    var poly = f.walk.map(function (v) { return g.pts[v]; });
    var minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity, mx = 0, my = 0;
    poly.forEach(function (p) {
      minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x);
      miny = Math.min(miny, p.y); maxy = Math.max(maxy, p.y);
      mx += p.x / poly.length; my += p.y / poly.length;
    });
    var best = { x: mx, y: my }, bestD = -1, steps = 9, i, j;
    function consider(x, y) {
      if (!pointInPoly(x, y, poly)) return;
      var d = Infinity, q;
      for (q = 0; q < poly.length; q++) d = Math.min(d, distToSeg(x, y, poly[q], poly[(q + 1) % poly.length]));
      if (d > bestD) { bestD = d; best = { x: x, y: y }; }
    }
    consider(mx, my);
    bestD *= 1.15;                       /* mild preference for the centroid */
    for (i = 1; i < steps; i++) for (j = 1; j < steps; j++) {
      consider(minx + (maxx - minx) * i / steps, miny + (maxy - miny) * j / steps);
    }
    return best;
  }

  function inducedGraph(g, verts) {
    var index = {}, pts = [], edges = [];
    verts.forEach(function (v, i) { index[v] = i; pts.push(g.pts[v]); });
    g.edges.forEach(function (e) {
      if (index[e[0]] != null && index[e[1]] != null) edges.push([index[e[0]], index[e[1]]]);
    });
    var sub = makeGraph(pts, edges);
    sub.orig = verts.slice();
    return sub;
  }

  /* connected components of g minus the vertices flagged in `gone` */
  function components(g, gone) {
    var comp = filled(g.n, -1), list = [], v;
    for (v = 0; v < g.n; v++) {
      if (comp[v] >= 0 || (gone && gone[v])) continue;
      var members = [v], head = 0;
      comp[v] = list.length;
      while (head < members.length) {
        var a = members[head++];
        g.adj[a].forEach(function (b) {
          if (comp[b] >= 0 || (gone && gone[b])) return;
          comp[b] = list.length; members.push(b);
        });
      }
      list.push(members);
    }
    return { comp: comp, list: list };
  }

  /* ======================================================================
     Terminals, the wall BFS, and a max-flow cross-check
     ====================================================================== */

  /* Given S and T labels, make the outer boundary read S, S*, T, T* and
     return the two free intervals (the start and end vertices of the wall). */
  function finishTerminals(g, term) {
    var walk = g.faces[g.outer].walk, len = walk.length, first = -1, i;
    for (i = 0; i < len; i++) if (term[walk[i]] !== FREE) { first = i; break; }
    if (first < 0) return null;
    var runs = [], run = null, prev = term[walk[first]];
    for (i = 1; i <= len; i++) {
      var v = walk[(first + i) % len], t = term[v];
      if (t === FREE) {
        if (!run) run = { verts: [], prev: prev };
        run.verts.push(v);
      } else {
        if (run) { run.next = t; runs.push(run); run = null; }
        prev = t;
      }
    }
    /* free boundary vertices between two stretches of the same terminal join it */
    runs.forEach(function (r) {
      if (r.prev === r.next) r.verts.forEach(function (x) { term[x] = r.prev; });
    });
    var sides = [];
    runs.forEach(function (r) {
      if (r.prev === r.next) return;
      var vs = uniq(r.verts.filter(function (x) { return term[x] === FREE; }));
      if (vs.length) sides.push(vs);
    });
    if (sides.length !== 2) return null;
    for (i = 0; i < g.edges.length; i++) {
      var e = g.edges[i];
      if (term[e[0]] !== FREE && term[e[1]] !== FREE && term[e[0]] !== term[e[1]]) return null;
    }
    return { term: term, start: sides[0], end: sides[1] };
  }

  /* largest connected part of `verts` that touches the outer boundary */
  function boundaryComponent(g, verts, onOuter) {
    var inSet = {}, seen = {}, best = [];
    verts.forEach(function (v) { inSet[v] = true; });
    verts.forEach(function (v) {
      if (seen[v]) return;
      var members = [v], head = 0, touches = false;
      seen[v] = true;
      while (head < members.length) {
        var a = members[head++];
        if (onOuter[a]) touches = true;
        g.adj[a].forEach(function (b) { if (inSet[b] && !seen[b]) { seen[b] = true; members.push(b); } });
      }
      if (touches && members.length > best.length) best = members;
    });
    return best;
  }

  /* geometric terminals, as in Inertial Flow: sort the vertices along a
     direction; S is the first `count`, T the last `count` */
  function pickTerminals(g, dx, dy, count) {
    var n = g.n, order = [], i;
    if (2 * count >= n || count < 1) return null;
    for (i = 0; i < n; i++) order.push(i);
    order.sort(function (a, b) {
      return (g.pts[a].x * dx + g.pts[a].y * dy) - (g.pts[b].x * dx + g.pts[b].y * dy) || a - b;
    });
    var onOuter = {};
    g.faces[g.outer].walk.forEach(function (v) { onOuter[v] = true; });
    var s = boundaryComponent(g, order.slice(0, count), onOuter);
    var t = boundaryComponent(g, order.slice(n - count), onOuter);
    if (!s.length || !t.length) return null;
    var term = filled(n, FREE);
    s.forEach(function (v) { term[v] = SRC; });
    t.forEach(function (v) { term[v] = SNK; });
    return finishTerminals(g, term);
  }

  /* The heart of the post. A BFS in the radial graph from the start vertices:
     one round goes from the current vertices into the faces they touch and on
     to the free vertices of those faces. Terminals and the outer face are
     never entered. The round in which an end vertex appears is the size of the
     separator, and the parent pointers spell out the wall. */
  function wallBFS(g, tm) {
    var seenV = {}, seenF = {}, parV = {}, parF = {}, isEnd = {}, rounds = [], hit = -1, i;
    tm.end.forEach(function (v) { isEnd[v] = true; });
    var frontier = tm.start.slice().sort(numeric);
    frontier.forEach(function (v) { seenV[v] = true; parV[v] = -1; });
    rounds.push({ verts: frontier.slice(), faces: [] });
    for (i = 0; i < frontier.length && hit < 0; i++) if (isEnd[frontier[i]]) hit = frontier[i];
    while (hit < 0) {
      var faces = [], next = [];
      frontier.forEach(function (v) {
        g.vfaces[v].forEach(function (f) {
          if (f === g.outer || seenF[f]) return;
          seenF[f] = true; parF[f] = v; faces.push(f);
        });
      });
      faces.forEach(function (f) {
        g.faces[f].verts.forEach(function (u) {
          if (seenV[u] || tm.term[u] !== FREE) return;
          seenV[u] = true; parV[u] = f; next.push(u);
        });
      });
      if (!next.length) return null;
      next.sort(numeric);
      rounds.push({ verts: next, faces: faces });
      for (i = 0; i < next.length && hit < 0; i++) if (isEnd[next[i]]) hit = next[i];
      frontier = next;
    }
    var verts = [], wf = [], v = hit;
    for (;;) {
      verts.push(v);
      if (parV[v] === -1) break;
      wf.push(parV[v]);
      v = parF[parV[v]];
    }
    verts.reverse(); wf.reverse();
    return { k: rounds.length, rounds: rounds, verts: verts, faces: wf, parV: parV, parF: parF };
  }

  /* does X separate S from T? Returns the side sizes and a side label per vertex. */
  function sidesOf(g, term, X) {
    var gone = {}, side = filled(g.n, 2), queue = [], head = 0, ok = true, a = 0, v;
    X.forEach(function (x) { gone[x] = true; side[x] = 0; });
    for (v = 0; v < g.n; v++) if (term[v] === SRC && !gone[v]) { side[v] = 1; queue.push(v); }
    while (head < queue.length) {
      var cur = queue[head++];
      a++;
      if (term[cur] === SNK) ok = false;
      g.adj[cur].forEach(function (b) {
        if (gone[b] || side[b] === 1) return;
        side[b] = 1; queue.push(b);
      });
    }
    return { ok: ok, a: a, b: g.n - X.length - a, side: side };
  }

  /* Minimum S-T vertex cut by maximum flow, one augmenting path at a time
     (every free vertex is split into in/out with capacity 1). Used as an
     independent check of the wall, and to animate what flow-based cutters do. */
  function minCutFlow(g, term) {
    var n = g.n, N = 2 * n + 2, s = 2 * n, t = 2 * n + 1, BIG = 1e6;
    var to = [], cap = [], out = [], i;
    for (i = 0; i < N; i++) out.push([]);
    function arc(a, b, c) {
      out[a].push(to.length); to.push(b); cap.push(c);
      out[b].push(to.length); to.push(a); cap.push(0);
    }
    for (i = 0; i < n; i++) {
      arc(2 * i, 2 * i + 1, term[i] === FREE ? 1 : BIG);
      if (term[i] === SRC) arc(s, 2 * i, BIG);
      if (term[i] === SNK) arc(2 * i + 1, t, BIG);
    }
    g.edges.forEach(function (e) { arc(2 * e[0] + 1, 2 * e[1], BIG); arc(2 * e[1] + 1, 2 * e[0], BIG); });
    var cap0 = cap.slice(), steps = [], value = 0, seen, last = [];

    function search() {
      var prevArc = filled(N, -1), queue = [s], head = 0;
      seen = filled(N, false);
      seen[s] = true;
      while (head < queue.length && !seen[t]) {
        var a = queue[head++];
        for (var q = 0; q < out[a].length; q++) {
          var id = out[a][q];
          if (cap[id] <= 0 || seen[to[id]]) continue;
          seen[to[id]] = true; prevArc[to[id]] = id; queue.push(to[id]);
        }
      }
      var scanned = [];
      for (var v = 0; v < n; v++) if (term[v] === FREE && (seen[2 * v] || seen[2 * v + 1])) scanned.push(v);
      return { prevArc: prevArc, scanned: scanned };
    }

    function decompose() {
      var flow = [], paths = [], q;
      for (q = 0; q < cap.length; q += 2) flow[q] = cap0[q] - cap[q];
      for (;;) {
        var node = s, path = [], guard = 0, stuck = false;
        while (node !== t && guard++ < 4 * N) {
          var found = -1;
          for (q = 0; q < out[node].length; q++) {
            var id = out[node][q];
            if (id % 2 === 0 && flow[id] > 0) { found = id; break; }
          }
          if (found < 0) { stuck = true; break; }
          flow[found]--;
          node = to[found];
          if (node < 2 * n) {
            var v = node >> 1;
            if (path[path.length - 1] !== v) path.push(v);
          }
        }
        if (stuck || node !== t) break;
        paths.push(path);
      }
      return paths;
    }

    for (;;) {
      var res = search();
      if (!seen[t]) { last = res.scanned; break; }
      var walk = [], node = t;
      while (node !== s) {
        var id = res.prevArc[node];
        cap[id] -= 1; cap[id ^ 1] += 1;
        node = to[id ^ 1];
        if (node < 2 * n) {
          var v = node >> 1;
          if (walk[walk.length - 1] !== v) walk.push(v);
        }
      }
      walk.reverse();
      value++;
      steps.push({ walk: walk, scanned: res.scanned, paths: decompose() });
      if (value > n) break;
    }
    var cut = [];
    for (i = 0; i < n; i++) if (term[i] === FREE && seen[2 * i] && !seen[2 * i + 1]) cut.push(i);
    return { value: value, steps: steps, cut: cut, last: last };
  }

  /* fewest free vertices on a route along roads from a start to an end vertex */
  function roadPath(g, tm) {
    var par = {}, queue = [], head = 0, isEnd = {}, hit = -1;
    tm.end.forEach(function (v) { isEnd[v] = true; });
    tm.start.forEach(function (v) { par[v] = -1; queue.push(v); });
    while (head < queue.length && hit < 0) {
      var a = queue[head++];
      if (isEnd[a]) { hit = a; break; }
      g.adj[a].forEach(function (b) {
        if (par[b] != null || tm.term[b] !== FREE) return;
        par[b] = a; queue.push(b);
      });
    }
    var path = [];
    while (hit >= 0) { path.push(hit); hit = par[hit]; }
    return path.reverse();
  }

  /* ======================================================================
     A miniature PlanarCutter: candidates, scoring, nested dissection, CCH
     ====================================================================== */

  var DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  var FRACS = [0.15, 0.25, 0.35];

  /* try every candidate (direction, fraction), keep the wall with the
     smallest expansion |X| / min(|A|, |B|); skip lopsided cuts if possible */
  function bestSeparator(g) {
    var best = null, fair = null;
    DIRS.forEach(function (dir) {
      FRACS.forEach(function (frac) {
        var tm = pickTerminals(g, dir[0], dir[1], Math.max(1, Math.round(frac * g.n)));
        if (!tm) return;
        var wall = wallBFS(g, tm);
        if (!wall) return;
        var sd = sidesOf(g, tm.term, wall.verts);
        var small = Math.min(sd.a, sd.b);
        if (!sd.ok || small < 1) return;
        var cand = { verts: wall.verts, wall: wall, tm: tm, a: sd.a, b: sd.b, score: wall.verts.length / small };
        if (!best || cand.score < best.score - 1e-9) best = cand;
        if (small >= 0.2 * g.n && (!fair || cand.score < fair.score - 1e-9)) fair = cand;
      });
    });
    return fair || best;
  }

  /* fallback for tiny or awkward pieces: an exact min cut between the two
     extreme vertices (the real system falls back to Inertial Flow) */
  function fallbackSeparator(g) {
    var out = null;
    DIRS.forEach(function (dir) {
      if (out || g.n < 3) return;
      var lo = 0, hi = 0, v;
      for (v = 1; v < g.n; v++) {
        var p = g.pts[v].x * dir[0] + g.pts[v].y * dir[1];
        if (p < g.pts[lo].x * dir[0] + g.pts[lo].y * dir[1]) lo = v;
        if (p > g.pts[hi].x * dir[0] + g.pts[hi].y * dir[1]) hi = v;
      }
      if (lo === hi || g.adj[lo].indexOf(hi) >= 0) return;
      var term = filled(g.n, FREE);
      term[lo] = SRC; term[hi] = SNK;
      var flow = minCutFlow(g, term);
      if (flow.cut.length && sidesOf(g, term, flow.cut).ok) out = { verts: flow.cut };
    });
    return out;
  }

  /* nested dissection: parts first, separator last. level[v] is the depth of
     the recursion at which v received its rank (1 = top separator); sep[v]
     says whether v is in a separator or in a cell that was not cut further. */
  function nestedDissection(g) {
    var order = [], level = filled(g.n, 0), sep = filled(g.n, false), maxLevel = 1;
    function rec(verts, depth) {
      var cut = null, sub = null;
      if (verts.length > 2) {
        sub = inducedGraph(g, verts);
        cut = bestSeparator(sub) || fallbackSeparator(sub);
      }
      if (!cut) {
        verts.forEach(function (v) { level[v] = depth; order.push(v); });
        return;
      }
      var gone = {};
      cut.verts.forEach(function (x) { gone[x] = true; });
      components(sub, gone).list.forEach(function (members) {
        rec(members.map(function (x) { return sub.orig[x]; }), depth + 1);
      });
      maxLevel = Math.max(maxLevel, depth);
      cut.verts.forEach(function (x) { level[sub.orig[x]] = depth; sep[sub.orig[x]] = true; order.push(sub.orig[x]); });
    }
    rec(components(g, null).list[0], 1);
    return { order: order, level: level, sep: sep, maxLevel: maxLevel };
  }

  /* CCH from an order alone: contract in order; every pair of remaining
     neighbors of the contracted vertex gets an arc (no weights, no witnesses).
     The parent of v in the elimination tree is its lowest-ranked upward neighbor. */
  function buildCCH(g, order) {
    var n = g.n, rank = [], nb = [], up = [], parent = filled(n, -1), shortcuts = [], i;
    order.forEach(function (v, r) { rank[v] = r; });
    for (i = 0; i < n; i++) nb.push({});
    g.edges.forEach(function (e) { nb[e[0]][e[1]] = true; nb[e[1]][e[0]] = true; });
    order.forEach(function (v) {
      var hi = Object.keys(nb[v]).map(Number).filter(function (u) { return rank[u] > rank[v]; });
      hi.sort(function (a, b) { return rank[a] - rank[b]; });
      up[v] = hi;
      if (hi.length) parent[v] = hi[0];
      for (var a = 0; a < hi.length; a++) for (var b = a + 1; b < hi.length; b++) {
        if (nb[hi[a]][hi[b]]) continue;
        nb[hi[a]][hi[b]] = true; nb[hi[b]][hi[a]] = true;
        shortcuts.push([hi[a], hi[b], v]);
      }
    });
    var depth = filled(n, 1), arcs = filled(n, 0), sumV = 0, sumA = 0, height = 0;
    for (i = n - 1; i >= 0; i--) {
      var v = order[i], p = parent[v];
      depth[v] = p < 0 ? 1 : depth[p] + 1;
      arcs[v] = up[v].length + (p < 0 ? 0 : arcs[p]);
      sumV += depth[v]; sumA += arcs[v];
      height = Math.max(height, depth[v]);
    }
    return {
      rank: rank, up: up, parent: parent, shortcuts: shortcuts, depth: depth, arcs: arcs,
      avgVerts: sumV / n, avgArcs: sumA / n, height: height, totalArcs: g.edges.length + shortcuts.length
    };
  }

  /* ======================================================================
     Maps
     ====================================================================== */

  /* a small road-like plane graph: a jittered grid with some streets removed,
     a few diagonals, and optionally a river crossed by a few bridges */
  function makeTown(seed, cols, rows, opts) {
    opts = opts || {};
    var rnd = Blog.rng(seed), pts = [], edges = [], i, j;
    var jit = opts.jitter == null ? 0.2 : opts.jitter;
    var river = opts.river == null ? -1 : opts.river, gap = river >= 0 ? 0.55 : 0;
    var id = function (a, b) { return b * cols + a; };
    for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) {
      pts.push({ x: i + rnd.range(-jit, jit), y: j + (j > river && river >= 0 ? gap : 0) + rnd.range(-jit, jit) });
    }
    var bridges = {};
    if (river >= 0) {
      /* the ring road crosses the river at both ends; a few more bridges in between */
      var want = (opts.bridges || 3), tries = 0;
      bridges[0] = true; bridges[cols - 1] = true;
      while (Object.keys(bridges).length < want && tries++ < 200) {
        var col = rnd.int(2, cols - 3);
        if (!bridges[col - 1] && !bridges[col + 1]) bridges[col] = true;
      }
    }
    var key = function (a, b) { return pairKey(a, b, cols * rows); };
    var deg = filled(cols * rows, 0), protectedEdge = {};
    function add(a, b) { edges.push([a, b]); deg[a]++; deg[b]++; }
    for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) {
      if (i + 1 < cols) {
        add(id(i, j), id(i + 1, j));
        if (j === 0 || j === rows - 1) protectedEdge[key(id(i, j), id(i + 1, j))] = true;
      }
      if (j + 1 < rows && j !== river && (i === 0 || i === cols - 1)) protectedEdge[key(id(i, j), id(i, j + 1))] = true;
      if (j + 1 < rows) {
        if (j === river) { if (bridges[i]) { add(id(i, j), id(i, j + 1)); protectedEdge[key(id(i, j), id(i, j + 1))] = true; } }
        else add(id(i, j), id(i, j + 1));
      }
    }
    /* take some streets out, but keep the town connected and free of dead ends */
    var drop = opts.drop == null ? 0.14 : opts.drop;
    rnd.shuffle(edges.slice()).forEach(function (e) {
      if (rnd() >= drop || protectedEdge[key(e[0], e[1])]) return;
      if (deg[e[0]] <= 2 || deg[e[1]] <= 2) return;
      var keep = edges.filter(function (x) { return x !== e; });
      var adj = [];
      for (var q = 0; q < pts.length; q++) adj.push([]);
      keep.forEach(function (x) { adj[x[0]].push(x[1]); adj[x[1]].push(x[0]); });
      var seen = {}, queue = [0], head = 0, count = 0;
      seen[0] = true;
      while (head < queue.length) {
        var a = queue[head++]; count++;
        adj[a].forEach(function (b) { if (!seen[b]) { seen[b] = true; queue.push(b); } });
      }
      if (count !== pts.length) return;
      edges = keep; deg[e[0]]--; deg[e[1]]--;
    });
    /* a few diagonal streets, only where they cross nothing */
    var diag = opts.diag == null ? 0.12 : opts.diag;
    for (j = 0; j + 1 < rows; j++) for (i = 0; i + 1 < cols; i++) {
      if (j === river || rnd() >= diag) continue;
      var flip = rnd() < 0.5;
      var a = flip ? id(i + 1, j) : id(i, j), b = flip ? id(i, j + 1) : id(i + 1, j + 1);
      var clear = true;
      edges.forEach(function (e) { if (clear && segHit(pts[a], pts[b], pts[e[0]], pts[e[1]])) clear = false; });
      if (clear) add(a, b);
    }
    var g = makeGraph(pts, edges);
    g.cols = cols; g.rows = rows;
    if (river >= 0) g.river = { y0: river + jit + 0.04, y1: river + 1 + gap - jit - 0.04 };
    return g;
  }

  /* the 24-vertex example from the paper: two terminal rows, four vertical
     roads, and a zigzag road with spurs. y grows downward on screen. */
  function makePaperGrid() {
    var pts = [], edges = [], name = {}, x;
    function vtx(label, px, py) { name[label] = pts.length; pts.push({ x: px, y: 4 - py }); }
    function road() {
      for (var q = 0; q + 1 < arguments.length; q++) edges.push([name[arguments[q]], name[arguments[q + 1]]]);
    }
    for (x = 0; x <= 6; x++) vtx('b' + x, x, 0);
    for (x = 0; x <= 6; x++) vtx('t' + x, x, 4);
    for (x = 0; x <= 6; x += 2) vtx('m' + x, x, 2);
    vtx('p1', 0.67, 2.75); vtx('p2', 1.33, 2.75);
    vtx('q1', 2.67, 1.25); vtx('q2', 3.33, 1.25);
    vtx('r1', 4.67, 2.75); vtx('r2', 5.33, 2.75);
    road('b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6');
    road('t0', 't1', 't2', 't3', 't4', 't5', 't6');
    for (x = 0; x <= 6; x += 2) road('b' + x, 'm' + x, 't' + x);
    road('m0', 'p1', 'p2', 'm2', 'q1', 'q2', 'm4', 'r1', 'r2', 'm6');
    road('p1', 't1'); road('p2', 't1'); road('r1', 't5'); road('r2', 't5'); road('q1', 'b3'); road('q2', 'b3');
    var g = makeGraph(pts, edges);
    g.cols = 7; g.rows = 5;
    return g;
  }

  /* ======================================================================
     Drawing helpers
     ====================================================================== */

  /* world -> canvas. The two axes may stretch a little differently so the map
     fills tall phone canvases; the cyclic order of edges is unaffected. */
  function makeView(g, w, h, padX, padY, padTop, padBottom) {
    var top = padTop == null ? padY : padTop, bottom = padBottom == null ? padY : padBottom;
    var minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    g.pts.forEach(function (p) {
      minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x);
      miny = Math.min(miny, p.y); maxy = Math.max(maxy, p.y);
    });
    var sx = (w - 2 * padX) / Math.max(1e-6, maxx - minx), sy = (h - top - bottom) / Math.max(1e-6, maxy - miny);
    sx = Math.min(sx, sy * 1.5); sy = Math.min(sy, sx * 1.5);
    var ox = (w - sx * (maxx - minx)) / 2 - sx * minx, oy = top + (h - top - bottom - sy * (maxy - miny)) / 2 - sy * miny;
    return {
      sx: sx, sy: sy,
      X: function (p) { return ox + p.x * sx; },
      Y: function (p) { return oy + p.y * sy; }
    };
  }

  function pickVertex(g, V, p, reach) {
    var best = -1, bestD = reach;
    g.pts.forEach(function (q, v) {
      var d = Blog.dist(p.x, p.y, V.X(q), V.Y(q));
      if (d < bestD) { bestD = d; best = v; }
    });
    return best;
  }

  function drawRiver(ctx, g, V, w, c) {
    if (!g.river) return;
    var y0 = V.Y({ x: 0, y: g.river.y0 }), y1 = V.Y({ x: 0, y: g.river.y1 });
    D.roundRect(ctx, 4, y0, w - 8, y1 - y0, Math.min(14, (y1 - y0) / 2), Blog.alpha(c.blue, c.dark ? 0.16 : 0.1));
    D.text(ctx, 'river', 14, (y0 + y1) / 2, { font: Blog.font(11, 600), color: c.blueText, align: 'left' });
  }

  /* is the straight segment between two vertices of a face inside that face? */
  function straightInside(g, f, a, b) {
    var pa = g.pts[a], pb = g.pts[b], i;
    var poly = g.faces[f].walk.map(function (v) { return g.pts[v]; });
    if (!pointInPoly((pa.x + pb.x) / 2, (pa.y + pb.y) / 2, poly)) return false;
    for (i = 0; i < g.edges.length; i++) {
      if (segHit(pa, pb, g.pts[g.edges[i][0]], g.pts[g.edges[i][1]])) return false;
    }
    return true;
  }

  /* A polyline from a to b that stays inside face f (both points lie on its
     border). Used to draw walls through awkwardly shaped faces: sample the
     face, connect samples that see each other, take the shortest chain. */
  function routeInFace(g, f, a, b) {
    var face = g.faces[f], poly = face.walk.map(function (v) { return g.pts[v]; });
    var minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity, i, j;
    poly.forEach(function (p) {
      minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x);
      miny = Math.min(miny, p.y); maxy = Math.max(maxy, p.y);
    });
    function clearance(x, y) {
      var d = Infinity;
      for (var q = 0; q < poly.length; q++) d = Math.min(d, distToSeg(x, y, poly[q], poly[(q + 1) % poly.length]));
      return d;
    }
    var margin = Math.min(maxx - minx, maxy - miny) * 0.11;
    /* p sees q if the segment stays inside the face and keeps its distance
       from the border (a and b sit on the border, so the rule relaxes near them) */
    function sees(p, q) {
      var ts = [0.2, 0.4, 0.5, 0.6, 0.8], k;
      for (k = 0; k < ts.length; k++) {
        var x = Blog.lerp(p.x, q.x, ts[k]), y = Blog.lerp(p.y, q.y, ts[k]);
        var need = Math.min(margin, 0.25 * Math.min(Blog.dist(x, y, a.x, a.y), Blog.dist(x, y, b.x, b.y)));
        if (!pointInPoly(x, y, poly) || clearance(x, y) < Math.max(need, 1e-3)) return false;
      }
      for (var e = 0; e < g.edges.length; e++) {
        if (segHit(p, q, g.pts[g.edges[e][0]], g.pts[g.edges[e][1]])) return false;
      }
      return true;
    }
    if (sees(a, b)) return [a, b];
    var steps = 11, nodes = [a, b];
    for (i = 1; i < steps; i++) for (j = 1; j < steps; j++) {
      var x = minx + (maxx - minx) * i / steps, y = miny + (maxy - miny) * j / steps;
      if (pointInPoly(x, y, poly) && clearance(x, y) >= margin) nodes.push({ x: x, y: y });
    }
    var n = nodes.length, dist = filled(n, Infinity), prev = filled(n, -1), done = filled(n, false);
    var reach = 1.6 * Math.max((maxx - minx) / steps, (maxy - miny) / steps);
    dist[0] = 0;
    for (;;) {
      var cur = -1;
      for (i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (cur < 0 || dist[i] < dist[cur])) cur = i;
      if (cur < 0 || cur === 1) break;
      done[cur] = true;
      for (i = 0; i < n; i++) {
        if (done[i]) continue;
        var d = Blog.dist(nodes[cur].x, nodes[cur].y, nodes[i].x, nodes[i].y);
        if (cur > 1 && i > 1 && d > reach) continue;
        if (dist[cur] + d >= dist[i] || !sees(nodes[cur], nodes[i])) continue;
        dist[i] = dist[cur] + d; prev[i] = cur;
      }
    }
    if (dist[1] === Infinity) return [a, face.pole, b];
    var chain = [];
    for (i = 1; i >= 0; i = prev[i]) chain.push(nodes[i]);
    chain.reverse();
    /* pull the chain tight: jump to the farthest point still in sight */
    var out = [chain[0]], at = 0;
    while (at < chain.length - 1) {
      var far = at + 1;
      for (j = chain.length - 1; j > at + 1; j--) if (sees(chain[at], chain[j])) { far = j; break; }
      out.push(chain[far]); at = far;
    }
    return out;
  }

  /* the wall as a smooth curve: vertex, through a face, vertex, ... */
  function wallCurve(g, V, wall) {
    var out = [], i, q;
    for (i = 0; i + 1 < wall.verts.length; i++) {
      var a = g.pts[wall.verts[i]], b = g.pts[wall.verts[i + 1]], pole = g.faces[wall.faces[i]].pole;
      var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, cx, cy;
      if (!straightInside(g, wall.faces[i], wall.verts[i], wall.verts[i + 1])) {
        /* a bent face: thread the wall through its interior */
        routeInFace(g, wall.faces[i], a, b).forEach(function (p, idx) {
          if (idx > 0 || i === 0) out.push({ x: V.X(p), y: V.Y(p) });
        });
        continue;
      }
      cx = Blog.lerp(mx, pole.x, 0.4); cy = Blog.lerp(my, pole.y, 0.4);
      for (q = (i === 0 ? 0 : 1); q <= 14; q++) {
        var t = q / 14, u = 1 - t;
        out.push({
          x: V.X({ x: u * u * a.x + 2 * u * t * cx + t * t * b.x, y: 0 }),
          y: V.Y({ x: 0, y: u * u * a.y + 2 * u * t * cy + t * t * b.y })
        });
      }
    }
    if (!out.length && wall.verts.length) out.push({ x: V.X(g.pts[wall.verts[0]]), y: V.Y(g.pts[wall.verts[0]]) });
    return out;
  }

  /* stroke the first `frac` of a polyline given in canvas pixels */
  function strokePoly(ctx, pts, frac, color, width, dash) {
    if (pts.length < 2) return;
    var total = 0, i, lens = [];
    for (i = 1; i < pts.length; i++) { lens.push(Blog.dist(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y)); total += lens[i - 1]; }
    var left = total * Blog.clamp(frac, 0, 1);
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (i = 1; i < pts.length && left > 0; i++) {
      var f = Math.min(1, left / (lens[i - 1] || 1));
      ctx.lineTo(Blog.lerp(pts[i - 1].x, pts[i].x, f), Blog.lerp(pts[i - 1].y, pts[i].y, f));
      left -= lens[i - 1];
    }
    ctx.stroke();
    ctx.restore();
  }

  function verts(n) { return n + (n === 1 ? ' vertex' : ' vertices'); }

  /* a tap or click that is not the start of a scroll or drag */
  function onTap(el, fn) {
    var from = null;
    Blog.pointer(el, {
      down: function (p) { from = p; },
      up: function (p) {
        if (from && Blog.dist(p.x, p.y, from.x, from.y) < 10) fn(from);
        from = null;
      }
    });
  }

  function setReadout(el, items) {
    el.innerHTML = items.map(function (it) { return '<span>' + it[0] + ' <b>' + it[1] + '</b></span>'; }).join('');
  }

  function junctions(n) { return n + (n === 1 ? ' junction' : ' junctions'); }

  /* a button label with a leading symbol that screen readers skip */
  function glyphLabel(btn, glyph, text) {
    btn.textContent = '';
    btn.appendChild(Blog.el('span', { 'aria-hidden': 'true', text: glyph }));
    btn.appendChild(document.createTextNode(' ' + text));
  }

  /* a letter just outside a group of vertices, on the side away from the map centre */
  function labelGroup(ctx, g, V, group, text, color, c, w, h) {
    if (!group.length) return;
    var cx = 0, cy = 0, gx = 0, gy = 0;
    g.pts.forEach(function (p) { cx += V.X(p) / g.n; cy += V.Y(p) / g.n; });
    group.forEach(function (v) { gx += V.X(g.pts[v]) / group.length; gy += V.Y(g.pts[v]) / group.length; });
    var dx = gx - cx, dy = gy - cy, len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) { dx = 0; dy = 1; } else { dx /= len; dy /= len; }
    var far = 0;
    group.forEach(function (v) { far = Math.max(far, (V.X(g.pts[v]) - cx) * dx + (V.Y(g.pts[v]) - cy) * dy); });
    D.text(ctx, text, Blog.clamp(cx + dx * (far + 16), 9, w - 9), Blog.clamp(cy + dy * (far + 16), 10, h - 10),
      { font: Blog.font(13, 800), color: color, halo: c.stage });
  }

  /* shared look of a map with terminals, a BFS in progress and a wall */
  function drawCutScene(ctx, w, h, c, sc) {
    var g = sc.g, tm = sc.tm, V = makeView(g, w, h, sc.padX || 24, sc.padY || 24, sc.padTop, sc.padBottom);
    var r = Blog.clamp(Math.min(V.sx, V.sy) * 0.17, 5.5, 8.5);
    var reached = {}, faceRound = {}, i;
    var shown = sc.rounds || 0, pop = sc.pop == null ? 1 : sc.pop;
    if (sc.wall) {
      for (i = 0; i < Math.min(shown, sc.wall.rounds.length); i++) {
        sc.wall.rounds[i].verts.forEach(function (v) { reached[v] = i + 1; });
        sc.wall.rounds[i].faces.forEach(function (f) { faceRound[f] = i + 1; });
      }
    }
    var side = sc.sides ? sc.sides.side : null;
    drawRiver(ctx, g, V, w, c);

    /* faces flooded by the search */
    Object.keys(faceRound).forEach(function (f) {
      var face = g.faces[f], rr = faceRound[f];
      ctx.beginPath();
      face.walk.forEach(function (v, q) {
        if (q === 0) ctx.moveTo(V.X(g.pts[v]), V.Y(g.pts[v])); else ctx.lineTo(V.X(g.pts[v]), V.Y(g.pts[v]));
      });
      ctx.closePath();
      ctx.fillStyle = Blog.alpha(c.teal, (rr === shown && !sc.done ? 0.3 * pop : 0.14));
      ctx.fill();
    });

    /* roads */
    g.edges.forEach(function (e) {
      var color = c.gray, width = 1.8;
      if (side && side[e[0]] && side[e[1]] && side[e[0]] === side[e[1]]) {
        color = Blog.mix(c.gray, side[e[0]] === 1 ? c.blue : c.orange, 0.75); width = 2.2;
      } else if (side) { color = Blog.alpha(c.gray, 0.45); }
      D.line(ctx, V.X(g.pts[e[0]]), V.Y(g.pts[e[0]]), V.X(g.pts[e[1]]), V.Y(g.pts[e[1]]), color, width);
    });

    /* the radial graph: a square per face, linked to the corners of the face */
    if (sc.radial) {
      g.faces.forEach(function (face) {
        if (face.id === g.outer) return;
        var fx = V.X(face.pole), fy = V.Y(face.pole), lit = faceRound[face.id];
        face.verts.forEach(function (v) {
          if (tm && tm.term[v] !== FREE) return;
          var tree = sc.wall && lit && (sc.wall.parF[face.id] === v || (reached[v] && sc.wall.parV[v] === face.id));
          D.line(ctx, fx, fy, V.X(g.pts[v]), V.Y(g.pts[v]), Blog.alpha(tree ? c.teal : c.muted, tree ? 0.9 : 0.3), tree ? 1.6 : 1, tree ? null : [2, 3]);
        });
      });
      g.faces.forEach(function (face) {
        if (face.id === g.outer) return;
        var fx = V.X(face.pole), fy = V.Y(face.pole), lit = faceRound[face.id];
        D.roundRect(ctx, fx - 4.5, fy - 4.5, 9, 9, 2, lit ? c.teal : c.stage, lit ? c.teal : c.muted, 1.3);
      });
    }

    /* a route along roads, for contrast */
    if (sc.route && sc.route.length > 1) {
      strokePoly(ctx, sc.route.map(function (v) { return { x: V.X(g.pts[v]), y: V.Y(g.pts[v]) }; }), 1, c.pink, 4.5, [1, 8]);
    }

    /* max flow (race figure): the routes found so far, and the augmenting
       path of the current search drawn as one trail on top */
    if (sc.paths) {
      sc.paths.forEach(function (path) {
        strokePoly(ctx, path.map(function (v) { return { x: V.X(g.pts[v]), y: V.Y(g.pts[v]) }; }), 1, Blog.alpha(c.purple, 0.85), 3.5);
      });
    }
    if (sc.walk && sc.walk.length > 1) {
      strokePoly(ctx, sc.walk.map(function (v) { return { x: V.X(g.pts[v]), y: V.Y(g.pts[v]) }; }), pop, c.pink, 5);
    }

    /* the wall */
    if (sc.wall && sc.done) {
      strokePoly(ctx, wallCurve(g, V, sc.wall), sc.progress == null ? 1 : sc.progress, c.red, 3.5);
    }

    /* vertices */
    var inWall = {}, isStart = {}, isEnd = {}, cut = {};
    if (sc.wall && sc.done) sc.wall.verts.forEach(function (v) { inWall[v] = true; });
    if (sc.cut) sc.cut.forEach(function (v) { cut[v] = true; });
    if (tm && !sc.noEnds) { tm.start.forEach(function (v) { isStart[v] = true; }); tm.end.forEach(function (v) { isEnd[v] = true; }); }
    g.pts.forEach(function (p, v) {
      var x = V.X(p), y = V.Y(p), t = tm ? tm.term[v] : FREE;
      if (t === SRC) { D.circle(ctx, x, y, r * 0.8, c.blue); return; }
      if (t === SNK) { D.circle(ctx, x, y, r * 0.8, c.orange); return; }
      if (inWall[v] || cut[v]) { D.circle(ctx, x, y, r + 1.5, c.red, c.stage, 1.5); return; }
      if (reached[v]) {
        var now = reached[v] === shown && !sc.done;
        var fill = now ? c.teal : Blog.mix(c.stage, c.teal, 0.55);
        D.circle(ctx, x, y, now ? (r + 1.5) * (0.35 + 0.65 * pop) : r, fill, c.teal, 1.5);
        if (r >= 6 && (!now || pop > 0.6)) D.text(ctx, String(reached[v]), x, y + 0.5, { font: Blog.font(11, 700), color: now ? Blog.inkOn(c.teal) : c.ink });
        return;
      }
      if (isStart[v] || isEnd[v]) { D.circle(ctx, x, y, r * 0.9, c.stage, isStart[v] ? c.green : c.purple, 3); return; }
      D.circle(ctx, x, y, r * 0.72, c.stage, c.muted, 1.5);
    });

    if (sc.labels && tm) {
      var sVerts = [], tVerts = [];
      tm.term.forEach(function (t, v) { if (t === SRC) sVerts.push(v); else if (t === SNK) tVerts.push(v); });
      labelGroup(ctx, g, V, sVerts, 'S', c.blueText, c, w, h);
      labelGroup(ctx, g, V, tVerts, 'T', c.orangeText, c, w, h);
    }
    return V;
  }

  /* ======================================================================
     Demo 1: cut the town yourself
     ====================================================================== */

  Blog.demo('demo-cut', function (fig) {
    var el = Blog.parts(fig), canvas = el.canvas, status = el.status, readout = el.readout, controls = el.controls;
    var seed = 7, g, gone, V = null, timer = 0, queue = [], bestK = 0, focus = -1, flash = -1, flashTimer = 0;

    function fresh() {
      g = makeTown(seed, 9, 6, { river: 2, bridges: 3, drop: 0.16, diag: 0.14 });
      gone = {};
      var best = bestSeparator(g);
      bestK = best ? best.verts.length : 0;
    }

    function analyse() {
      var closed = Object.keys(gone).filter(function (k) { return gone[k]; }).map(Number);
      var cc = components(g, gone);
      var sizes = cc.list.map(function (m) { return m.length; }).sort(function (a, b) { return b - a; });
      var rest = g.n - closed.length - (sizes[0] || 0);
      return { closed: closed, cc: cc, sizes: sizes, rest: rest };
    }

    fresh();
    var view = Blog.canvas(canvas, function (ctx, w, h, c) {
      V = makeView(g, w, h, 22, 22);
      var info = analyse(), cc = info.cc;
      var rankOf = {}, order = cc.list.map(function (m, i) { return i; }).sort(function (a, b) { return cc.list[b].length - cc.list[a].length; });
      order.forEach(function (ci, r) { rankOf[ci] = r; });
      var split = cc.list.length > 1;
      var tint = function (v) {
        if (!split) return c.muted;
        var r = rankOf[cc.comp[v]];
        return r === 0 ? c.blue : r === 1 ? c.orange : c.gray;
      };
      var r = Blog.clamp(Math.min(V.sx, V.sy) * 0.16, 5, 8);
      drawRiver(ctx, g, V, w, c);
      g.edges.forEach(function (e) {
        var x1 = V.X(g.pts[e[0]]), y1 = V.Y(g.pts[e[0]]), x2 = V.X(g.pts[e[1]]), y2 = V.Y(g.pts[e[1]]);
        if (gone[e[0]] || gone[e[1]]) D.line(ctx, x1, y1, x2, y2, Blog.alpha(c.gray, 0.5), 1.2, [3, 4]);
        else D.line(ctx, x1, y1, x2, y2, split ? Blog.alpha(tint(e[0]), 0.8) : c.gray, 2);
      });
      g.pts.forEach(function (p, v) {
        var x = V.X(p), y = V.Y(p);
        if (gone[v]) {
          D.circle(ctx, x, y, r + 1.5, c.red, c.stage, 1.5);
          D.line(ctx, x - 3, y - 3, x + 3, y + 3, Blog.inkOn(c.red), 1.8);
          D.line(ctx, x - 3, y + 3, x + 3, y - 3, Blog.inkOn(c.red), 1.8);
        } else if (split) D.circle(ctx, x, y, r * 0.78, tint(v), c.stage, 1.2);
        else D.circle(ctx, x, y, r * 0.72, c.stage, c.muted, 1.5);
        if (v === flash) D.circle(ctx, x, y, r + 7, null, c.accent, 2);
        if (v === focus) D.circle(ctx, x, y, r + 5, null, c.ink, 2.2);
      });
    });

    function refresh() {
      var info = analyse(), k = info.closed.length, pieces = info.cc.list.length;
      var big = info.sizes[0] || 0, small = Math.min(big, info.rest);
      setReadout(readout, [
        ['Closed', junctions(k)],
        ['Pieces', String(pieces)],
        ['Largest piece', big + ' of ' + g.n],
        ['All other pieces', String(info.rest)],
        ['Expansion', pieces > 1 && small > 0 ? (k / small).toFixed(2) : '\u2013']
      ]);
      if (!k) status.innerHTML = 'Every junction can still reach every other one. Close junctions to split the town into two large sides.';
      else if (big <= 1) status.innerHTML = '<b>Nothing left to split.</b> Almost every junction is closed. Press Reset to start again.';
      else if (pieces === 1) status.innerHTML = '<b>Still one piece.</b> Closing ' + junctions(k) + ' is not enough: traffic finds a way around.';
      else if (small < 0.2 * g.n) status.innerHTML = '<b>Split, but lopsided.</b> The cut separates only ' + junctions(info.rest) + ' from the other ' + big + '. A useful separator leaves two large sides.';
      else status.innerHTML = '<b>That is a separator:</b> ' + junctions(k) + ' split the town into sides of ' + big + ' and ' + info.rest + '. ' +
        (k <= bestK ? 'Our search does not find a smaller balanced one.' : 'A smaller one exists: try again, or let the search show it.');
      view.invalidate();
    }

    function stopHint(finish) {
      clearInterval(timer);
      if (finish) queue.forEach(function (v) { gone[v] = true; });
      queue = [];
    }

    function toggle(v) {
      stopHint(false);
      gone[v] = !gone[v];
      flash = v;
      clearTimeout(flashTimer);
      flashTimer = setTimeout(function () { flash = -1; view.invalidate(); }, 380);
      refresh();
    }

    onTap(canvas, function (p) {
      if (!V) return;
      /* reach well under half the street spacing, so a tap between two junctions does nothing */
      var v = pickVertex(g, V, p, Math.max(13, 0.45 * Math.min(V.sx, V.sy)));
      if (v >= 0) toggle(v);
    });

    var keys = Blog.keys(canvas, {
      points: function () {
        if (!V) return [];
        return g.pts.map(function (p, v) { return { x: V.X(p), y: V.Y(p), label: 'Junction ' + (v + 1) + (gone[v] ? ', closed' : ', open') }; });
      },
      move: function (i) { focus = i; view.invalidate(); },
      pick: function (i) { toggle(i); }
    });

    controls.appendChild(Blog.button('Show a good cut', function () {
      var best = bestSeparator(g);
      if (!best) return;
      stopHint(false);
      gone = {};
      queue = best.verts.slice();
      if (Blog.reduced) { stopHint(true); refresh(); return; }
      refresh();
      timer = setInterval(function () {
        if (!queue.length) { clearInterval(timer); return; }
        gone[queue.shift()] = true;
        refresh();
      }, 260);
    }, { primary: true }));
    controls.appendChild(Blog.button('Reset', function () { stopHint(false); gone = {}; refresh(); }));
    controls.appendChild(Blog.button('New town', function () { stopHint(false); seed += 1; fresh(); keys.clear(); focus = -1; refresh(); }));

    /* do not keep animating a figure nobody is looking at */
    Blog.inView(fig, null, function () { if (queue.length) { stopHint(true); refresh(); } });

    refresh();
    fig.__pc = { state: function () { return { n: g.n, closed: analyse().closed, bestK: bestK }; } };
  });

  /* ======================================================================
     Demo 2: nested dissection, the order, and what a query touches
     ====================================================================== */

  Blog.demo('demo-nd', function (fig) {
    var el = Blog.parts(fig), canvases = el.canvases, status = el.status, readout = el.readout, controls = el.controls;
    var g = makeTown(31, 10, 7, { river: 3, bridges: 3, drop: 0.14, diag: 0.12 });
    var nd = nestedDissection(g);
    var names = { nd: 'nested dissection', sweep: 'west to east', random: 'random' };
    var orders = { nd: nd.order, sweep: null, random: null };
    orders.sweep = g.pts.map(function (p, v) { return v; }).sort(function (a, b) { return g.pts[a].x - g.pts[b].x || a - b; });
    orders.random = Blog.rng(4).shuffle(g.pts.map(function (p, v) { return v; }));
    var cch = {};
    Object.keys(orders).forEach(function (key) { cch[key] = buildCCH(g, orders[key]); });
    var mode = 'nd', depth = 0, selected = 0, showShort = false, mapView = null, treeView = null, timer = 0, focus = -1;

    /* mark a typical junction: the one whose climb is closest to the average in every order */
    (function () {
      var best = Infinity;
      g.pts.forEach(function (p, v) {
        var off = 0;
        Object.keys(cch).forEach(function (key) { off += Math.abs(cch[key].depth[v] - cch[key].avgVerts) / cch[key].avgVerts; });
        if (off < best) { best = off; selected = v; }
      });
    })();

    /* separators get darker the earlier they were found; one hue, so it reads as "depth" */
    function depthShade(lvl) { return Math.round(100 - 74 * (lvl - 1) / Math.max(1, nd.maxLevel - 1)); }
    function depthColor(c, lvl) { return Blog.mix(c.stage, c.red, depthShade(lvl) / 100); }

    function ancestors(h, v) {
      var out = {}, cur = v;
      while (cur >= 0) { out[cur] = true; cur = h.parent[cur]; }
      return out;
    }

    function complete() { return mode !== 'nd' || depth >= nd.maxLevel; }

    /* null = draw as a plain vertex (a cell, or a separator not found yet) */
    function colorOf(c, v) {
      if (mode !== 'nd' || !nd.sep[v] || nd.level[v] > depth) return null;
      return depthColor(c, nd.level[v]);
    }

    function pin(ctx, x, y, r, c) {
      D.circle(ctx, x, y, r + 5.5, null, c.ink, 3);
      ctx.beginPath();
      ctx.moveTo(x, y - r - 8); ctx.lineTo(x - 6, y - r - 18); ctx.lineTo(x + 6, y - r - 18);
      ctx.closePath();
      ctx.fillStyle = c.ink; ctx.fill();
    }

    var map = Blog.canvas(canvases[0], function (ctx, w, h, c) {
      var V = mapView = makeView(g, w, h, 20, 22, 40), hier = cch[mode];
      var anc = complete() ? ancestors(hier, selected) : {};
      var r = Blog.clamp(Math.min(V.sx, V.sy) * 0.15, 4, 7);
      drawRiver(ctx, g, V, w, c);
      if (showShort && complete()) hier.shortcuts.forEach(function (e) {
        D.line(ctx, V.X(g.pts[e[0]]), V.Y(g.pts[e[0]]), V.X(g.pts[e[1]]), V.Y(g.pts[e[1]]), Blog.alpha(c.ink, hier.shortcuts.length > 200 ? 0.2 : 0.32), 1, [4, 4]);
      });
      g.edges.forEach(function (e) {
        D.line(ctx, V.X(g.pts[e[0]]), V.Y(g.pts[e[0]]), V.X(g.pts[e[1]]), V.Y(g.pts[e[1]]), c.gray, 1.7);
      });
      g.pts.forEach(function (p, v) {
        var x = V.X(p), y = V.Y(p), col = colorOf(c, v);
        if (anc[v] && v !== selected) D.circle(ctx, x, y, r + 4.5, null, c.ink, 1.8);
        if (col) D.circle(ctx, x, y, r, col, c.red, 1.3);
        else D.circle(ctx, x, y, r * 0.72, c.stage, c.muted, 1.3);
        if (v === focus) D.circle(ctx, x, y, r + 8, null, c.accent, 2.2);
      });
      pin(ctx, V.X(g.pts[selected]), V.Y(g.pts[selected]), r, c);
    });

    var tree = Blog.canvas(canvases[1], function (ctx, w, h, c) {
      var hier = cch[mode], n = g.n, kids = [], root = -1, v;
      for (v = 0; v < n; v++) kids.push([]);
      for (v = 0; v < n; v++) { if (hier.parent[v] < 0) root = v; else kids[hier.parent[v]].push(v); }
      /* leaves get consecutive columns, a parent sits above the middle of its children */
      var col = filled(n, 0), nextCol = 0;
      (function place(u) {
        if (!kids[u].length) { col[u] = nextCol++; return; }
        kids[u].sort(function (a, b) { return g.pts[a].x - g.pts[b].x; });
        kids[u].forEach(place);
        col[u] = (col[kids[u][0]] + col[kids[u][kids[u].length - 1]]) / 2;
      })(root);
      var padX = 18, top = 50, bottom = 16;
      var X = function (u) { return padX + (nextCol > 1 ? col[u] / (nextCol - 1) : 0.5) * (w - 2 * padX); };
      var Y = function (u) { return top + (hier.height > 1 ? (hier.depth[u] - 1) / (hier.height - 1) : 0) * (h - top - bottom); };
      var anc = complete() ? ancestors(hier, selected) : {};
      var tall = hier.height > 28, r = tall ? 2.6 : 3.8;
      treeView = { X: X, Y: Y };
      for (v = 0; v < n; v++) {
        var p = hier.parent[v];
        if (p < 0) continue;
        var hot = anc[v] && anc[p];
        D.line(ctx, X(v), Y(v), X(p), Y(p), hot ? c.ink : Blog.alpha(c.gray, 0.7), hot ? (tall ? 3.4 : 2.4) : 1);
      }
      for (v = 0; v < n; v++) {
        var colr = colorOf(c, v);
        /* a very tall tree has no room for rings: the thick path carries the climb */
        if (anc[v] && !tall && v !== selected) D.circle(ctx, X(v), Y(v), r + 3.2, null, c.ink, 1.6);
        D.circle(ctx, X(v), Y(v), r, colr || c.stage, colr ? c.red : c.muted, 1.2);
      }
      if (complete()) D.circle(ctx, X(selected), Y(selected), r + 4.5, null, c.ink, 3);
      D.text(ctx, '\u2191 top', Math.min(w - 44, X(root) + 12), top, { font: Blog.font(11, 600), color: c.muted, align: 'left' });
    });

    function stop() { clearInterval(timer); timer = 0; glyphLabel(play, '\u25B6', 'Play'); }

    var depthSlider = Blog.slider({
      label: 'Recursion depth', min: 0, max: nd.maxLevel, value: 0,
      onInput: function (v) { depth = v; stop(); refresh(); }
    });
    var orderSeg = Blog.segmented({
      label: 'Order', value: 'nd',
      options: [{ value: 'nd', label: 'Nested dissection' }, { value: 'sweep', label: 'West to east' }, { value: 'random', label: 'Random' }],
      onChange: function (v) { mode = v; stop(); refresh(); }
    });
    var shortBox = Blog.checkbox('Show shortcuts', false, function (v) { showShort = v; refresh(); });
    var play = Blog.button('Play', function () {
      if (timer) { stop(); return; }
      playCuts();
    }, { primary: true });
    play.style.minWidth = '6.2em';

    function playCuts() {
      stop();
      orderSeg.set('nd');
      if (depth >= nd.maxLevel) depthSlider.set(0);
      if (Blog.reduced) { depthSlider.set(nd.maxLevel); return; }
      glyphLabel(play, '\u275A\u275A', 'Pause');
      timer = setInterval(function () {
        if (depth >= nd.maxLevel) { stop(); refresh(); return; }
        depth += 1;
        depthSlider.set(depth, true);
        if (depth >= nd.maxLevel) stop();
        refresh();
      }, 850);
    }

    controls.appendChild(play);
    controls.appendChild(depthSlider.el);
    controls.appendChild(orderSeg.el);
    controls.appendChild(shortBox.el);
    glyphLabel(play, '\u25B6', 'Play');

    /* the legend is generated because the number of depth levels comes from the data */
    (function () {
      var html = '<span>separators by depth: ', lvl;
      for (lvl = 1; lvl <= nd.maxLevel; lvl++) {
        html += '<span class="sw sq" style="margin-right: 2px; background: color-mix(in srgb, var(--v-red) ' + depthShade(lvl) + '%, var(--b-stage)); box-shadow: inset 0 0 0 1px var(--v-red)"></span>';
      }
      html += ' 1 (top) to ' + nd.maxLevel + '</span>' +
        '<span><span class="sw" style="background: var(--b-stage); box-shadow: inset 0 0 0 1.5px var(--b-muted)"></span>cell: a piece that is not cut further</span>' +
        '<span><span class="sw" style="background: transparent; box-shadow: inset 0 0 0 3px var(--b-ink)"></span>marked junction (under the arrow)</span>' +
        '<span><span class="sw" style="background: transparent; box-shadow: inset 0 0 0 1.5px var(--b-ink)"></span>on its climb</span>' +
        '<span><span class="sw line" style="background: none; height: 0; border-top: 2px dashed var(--b-text)"></span>shortcut</span>';
      el.legend.innerHTML = html;
    })();

    function refresh() {
      var hier = cch[mode], done = complete();
      depthSlider.el.style.display = mode === 'nd' ? '' : 'none';
      shortBox.input.disabled = !done;
      setReadout(readout, [
        ['Shortcuts', String(hier.shortcuts.length)],
        ['Tree height', String(hier.height)],
        ['Climb of the marked junction', done ? hier.depth[selected] + ' of ' + g.n + ' vertices (one endpoint)' : '\u2026']
      ]);
      /* the honest summary: the average climb, for every order at once */
      readout.insertAdjacentHTML('beforeend', '<span>Average climb, in vertices: ' + Object.keys(names).map(function (key) {
        var text = names[key] + ' ' + cch[key].avgVerts.toFixed(1);
        return key === mode ? '<b>' + text + '</b>' : text;
      }).join(', ') + '</span>');
      if (mode === 'nd') {
        if (depth === 0) status.innerHTML = 'The whole town is one piece: nothing has been cut yet.';
        else if (depth === 1) status.innerHTML = '<b>Depth 1:</b> one separator (darkest red) splits the town. Its vertices go to the very top of the elimination tree.';
        else if (depth < nd.maxLevel) status.innerHTML = '<b>Depth ' + depth + ':</b> every piece that is still large enough is cut again. Each new separator ranks below the one that created its piece.';
        else status.innerHTML = '<b>Done.</b> A query from the marked junction climbs through the ringed vertices: its own cell first, then separators further and further up. Select any junction to move the mark.';
      } else if (mode === 'sweep') {
        status.innerHTML = '<b>Same town, contracted from west to east.</b> The elimination tree becomes one long chain: a query from the west climbs through almost everything east of it, and the index needs ' +
          (hier.shortcuts.length / cch.nd.shortcuts.length).toFixed(1) + '\u00D7 the shortcuts of nested dissection.';
      } else {
        status.innerHTML = '<b>Same town, contracted in random order.</b> Important junctions are removed early and shortcuts pile up: ' +
          (hier.shortcuts.length / cch.nd.shortcuts.length).toFixed(1) + '\u00D7 as many as with nested dissection, and an average climb ' +
          (hier.avgVerts / cch.nd.avgVerts).toFixed(1) + '\u00D7 as long.';
      }
      map.invalidate(); tree.invalidate();
    }

    function mark(v) { selected = v; refresh(); }

    onTap(canvases[0], function (p) {
      if (!mapView) return;
      var v = pickVertex(g, mapView, p, Math.max(13, 0.5 * Math.min(mapView.sx, mapView.sy)));
      if (v >= 0) mark(v);
    });
    onTap(canvases[1], function (p) {
      if (!treeView) return;
      var best = -1, bestD = 20, v;
      for (v = 0; v < g.n; v++) {
        var d = Blog.dist(p.x, p.y, treeView.X(v), treeView.Y(v));
        if (d < bestD) { bestD = d; best = v; }
      }
      if (best >= 0) mark(best);
    });
    Blog.keys(canvases[0], {
      points: function () {
        if (!mapView) return [];
        return g.pts.map(function (p, v) {
          return { x: mapView.X(p), y: mapView.Y(p), label: 'Junction ' + (v + 1) + (v === selected ? ', marked' : '') };
        });
      },
      move: function (i) { focus = i; map.invalidate(); },
      pick: function (i) { mark(i); }
    });

    refresh();
    /* run the recursion once when the figure first scrolls into view, and never off screen */
    var started = false;
    Blog.inView(fig, function () { if (!started) { started = true; playCuts(); } }, function () { if (timer) { stop(); refresh(); } }, '-80px 0px');
    fig.__pc = {
      state: function () {
        var sum = {};
        Object.keys(cch).forEach(function (key) {
          sum[key] = { shortcuts: cch[key].shortcuts.length, height: cch[key].height, avg: Number(cch[key].avgVerts.toFixed(1)), marked: cch[key].depth[selected] };
        });
        return { orders: sum, maxLevel: nd.maxLevel, selected: selected, depth: depth, mode: mode, cells: nd.sep.filter(function (x) { return !x; }).length };
      }
    };
  });

  /* ======================================================================
     Demo 3: the wall BFS in the radial graph
     ====================================================================== */

  Blog.demo('demo-wall', function (fig) {
    var el = Blog.parts(fig), canvas = el.canvas, status = el.status, readout = el.readout, controls = el.controls;
    var which = 'paper', dir = 'ns', seed = 12, radial = true, showRoute = false;
    var cur = null, step = 0, progress = 1, cancel = null;

    /* returns a complete scene or null; the caller keeps the old one on null */
    function build(kind, direction, firstSeed) {
      var s = firstSeed, tries = 0;
      for (;;) {
        var g = kind === 'paper' ? makePaperGrid() : makeTown(s, 9, 6, { river: 2, bridges: 3, drop: 0.16, diag: 0.14 });
        var count = kind === 'paper' ? (direction === 'ns' ? 7 : 5) : (direction === 'ns' ? g.cols : g.rows);
        var tm = direction === 'ns' ? pickTerminals(g, 0, -1, count) : pickTerminals(g, 1, 0, count);
        var wall = tm ? wallBFS(g, tm) : null;
        if (wall) {
          return { g: g, tm: tm, wall: wall, seed: s, flow: minCutFlow(g, tm.term), sides: sidesOf(g, tm.term, wall.verts), route: roadPath(g, tm) };
        }
        if (kind === 'paper' || tries++ > 30) return null;
        s += 1;
      }
    }

    cur = build(which, dir, seed);
    var view = Blog.canvas(canvas, function (ctx, w, h, c) {
      var k = cur.wall.k, done = step > k;
      drawCutScene(ctx, w, h, c, {
        g: cur.g, tm: cur.tm, wall: cur.wall, rounds: Math.min(step, k), done: done, progress: progress,
        sides: done && progress >= 1 ? cur.sides : null, radial: radial, route: showRoute ? cur.route : null,
        labels: true, padX: 28, padY: 30
      });
    });

    var routeBox;
    var stepper = Blog.stepper(controls, {
      total: function () { return cur.wall.k + 1; },
      interval: 1100,
      onStep: function (i) {
        step = i;
        if (cancel) { cancel(); cancel = null; }
        progress = 1;
        var wall = cur.wall, k = wall.k, done = i > k;
        if (done) {
          progress = 0;
          cancel = Blog.tween({ dur: 900, update: function (t) { progress = t; view.invalidate(); }, done: function () { view.invalidate(); } });
        }
        var reachedNow = 0, q;
        for (q = 0; q < Math.min(i, k); q++) reachedNow += wall.rounds[q].verts.length;
        setReadout(readout, [
          ['Round', Math.min(i, k) + ' of ' + k],
          ['Free vertices reached', String(reachedNow)],
          ['Wall', done ? verts(k) : '\u2026'],
          ['Max-flow check', done ? (cur.flow.value === k && cur.sides.ok ? 'also ' + cur.flow.value + ' \u2713' : 'mismatch: ' + cur.flow.value) : '\u2026'],
          ['Shortest route along roads', cur.route.length ? verts(cur.route.length) : 'none: the terminals block every road']
        ]);
        if (i === 0) {
          status.innerHTML = 'Two terminals, <span class="k k-blue">S</span> and <span class="k k-orange">T</span>, sit at opposite ends. Along the outer boundary they leave two free stretches: the <span class="k k-green">start vertices</span> and the <span class="k k-purple">end vertices</span>.';
        } else if (i === 1) {
          status.innerHTML = '<b>Round 1</b> is the starting set: ' + (wall.rounds[0].verts.length === 1 ? 'the one start vertex' : 'all ' + wall.rounds[0].verts.length + ' start vertices at once') + '. Every wall has to begin on one of them, and that junction already costs 1.';
        } else if (!done) {
          var rd = wall.rounds[i - 1];
          status.innerHTML = '<b>Round ' + i + '.</b> From the vertices of round ' + (i - 1) + ', step into every face they touch (' + rd.faces.length + ' new, shaded), then onto every free vertex of those faces (' + rd.verts.length + ' new).' + (i === k ? ' One of them is an <span class="k k-purple">end vertex</span>: stop.' : '');
        } else {
          status.innerHTML = '<b>Read the wall back.</b> The parent pointers give a curve that touches the roads at only ' + verts(k) + '. Without them <span class="k k-blue">S</span> cannot reach <span class="k k-orange">T</span>: ' + k + (k === 1 ? ' round' : ' rounds') + ', a separator of size ' + k + ', sides of ' + cur.sides.a + ' and ' + cur.sides.b + ' junctions.' +
            (Math.min(cur.sides.a, cur.sides.b) < 0.2 * cur.g.n ? ' It is the smallest for these terminals and lopsided, which is why many terminal pairs are tried and scored.' : '');
        }
        view.invalidate();
      }
    });

    function restart(kind, direction, firstSeed) {
      var next = build(kind, direction, firstSeed);
      if (!next) return false;                 /* keep the scene that works */
      cur = next; which = kind; dir = direction; seed = next.seed;
      if (routeBox) {
        routeBox.input.disabled = !cur.route.length;
        if (!cur.route.length) { routeBox.set(false); showRoute = false; }
      }
      stepper.reset(); stepper.refresh(); view.invalidate();
      return true;
    }

    controls.appendChild(Blog.el('span', { class: 'spacer' }));
    var mapSeg = Blog.segmented({
      label: 'Map', value: 'paper',
      options: [{ value: 'paper', label: 'Paper example' }, { value: 'town', label: 'River town' }],
      onChange: function (v) { if (!restart(v, dir, seed)) mapSeg.set(which, true); }
    });
    controls.appendChild(mapSeg.el);
    var dirSeg = Blog.segmented({
      label: 'Cut direction', value: 'ns',
      options: [{ value: 'ns', label: 'South vs north' }, { value: 'we', label: 'West vs east' }],
      onChange: function (v) { if (!restart(which, v, seed)) dirSeg.set(dir, true); }
    });
    controls.appendChild(dirSeg.el);
    controls.appendChild(Blog.button('New town', function () { if (restart('town', dir, seed + 1)) mapSeg.set('town', true); }));
    controls.appendChild(Blog.checkbox('Radial graph', true, function (v) { radial = v; view.invalidate(); }).el);
    routeBox = Blog.checkbox('Route along roads', false, function (v) { showRoute = v; view.invalidate(); });
    controls.appendChild(routeBox.el);

    fig.__pc = { state: function () { return { k: cur.wall.k, flow: cur.flow.value, route: cur.route.length, seed: cur.seed, ok: cur.sides.ok }; } };
  });

  /* ======================================================================
     Demo 4: k dependent searches versus k rounds
     ====================================================================== */

  var STRIP = 58;

  /* The dependency strip under each map of the race figure. One column per
     step; a column holds as many cells as the step has independent pieces of
     work (always 1 for an augmenting path, the frontier size for a BFS round). */
  function drawStrip(ctx, w, h, c, opt) {
    var n = opt.cols.length, box = 15;
    var gap = Blog.clamp((w - 30 - n * box) / Math.max(1, n - 1), 6, 18);
    var x0 = (w - (n * box + (n - 1) * gap)) / 2, base = h - 9, i, q;
    D.line(ctx, 10, h - STRIP + 2, w - 10, h - STRIP + 2, c.line, 1);
    D.text(ctx, opt.title, w / 2, h - STRIP + 13, { font: Blog.font(11, 600), color: c.muted });
    for (i = 0; i < n; i++) {
      var x = x0 + i * (box + gap), on = i < opt.done, cells = Math.min(opt.cols[i], 10), rows = Math.ceil(cells / 2);
      if (cells <= 1) {
        D.roundRect(ctx, x, base - 11, box, 11, 2.5, on ? (opt.last && i === n - 1 ? c.gray : opt.color) : c.stage, on ? null : c.gray, 1.2);
      } else {
        for (q = 0; q < cells; q++) {
          D.roundRect(ctx, x + (q % 2) * 8, base - 5 - Math.floor(q / 2) * 6, 7, 5, 1.2, on ? opt.color : c.stage, on ? null : c.gray, 1);
        }
        if (opt.cols[i] > cells) D.text(ctx, '+', x + box / 2, base - rows * 6 - 5, { font: Blog.font(11, 700), color: c.muted });
      }
      if (i + 1 < n && gap >= 8) D.arrow(ctx, x + box + 1.5, base - 5, x + box + gap - 1.5, base - 5, c.muted, 1.1, 0, 4);
    }
  }

  Blog.demo('demo-race', function (fig) {
    var el = Blog.parts(fig), canvases = el.canvases, status = el.status, readout = el.readout, controls = el.controls;
    var seed = 5, cur = null, step = 0, pop = 1, cancel = null;

    function build(firstSeed) {
      var s = firstSeed, tries = 0;
      for (;;) {
        var g = makeTown(s, 8, 6, { drop: 0.2, diag: 0.1, jitter: 0.18 });
        var tm = pickTerminals(g, 0, -1, g.cols);
        var wall = tm ? wallBFS(g, tm) : null;
        if (wall && wall.k >= 4 && wall.k <= 7) {
          var flow = minCutFlow(g, tm.term);
          return { g: g, tm: tm, wall: wall, flow: flow, seed: s, sides: sidesOf(g, tm.term, wall.verts), cutSides: sidesOf(g, tm.term, flow.cut) };
        }
        if (tries++ > 60) return null;
        s += 1;
      }
    }

    cur = build(seed);
    var left = Blog.canvas(canvases[0], function (ctx, w, h, c) {
      var flow = cur.flow, k = flow.value, i = Math.min(step, k), done = step > k;
      var st = i > 0 ? flow.steps[i - 1] : null;
      drawCutScene(ctx, w, h, c, {
        g: cur.g, tm: cur.tm, noEnds: true, pop: pop,
        /* while the trail is being drawn, show the routes as they were before it */
        paths: st ? (!done && pop < 1 && i > 1 ? flow.steps[i - 2].paths : (!done && pop < 1 ? [] : st.paths)) : null,
        walk: st && !done ? st.walk : null,
        cut: done ? flow.cut : null, sides: done ? cur.cutSides : null,
        padX: 18, padY: 14, padTop: 40, padBottom: STRIP + 12
      });
      var cols = [], q;
      for (q = 0; q <= k; q++) cols.push(1);
      drawStrip(ctx, w, h, c, { cols: cols, done: Math.min(step, k + 1), color: c.purple, last: true, title: 'one search after another' });
    });
    var right = Blog.canvas(canvases[1], function (ctx, w, h, c) {
      var wall = cur.wall, k = wall.k, done = step > k;
      drawCutScene(ctx, w, h, c, {
        g: cur.g, tm: cur.tm, wall: wall, rounds: Math.min(step, k), done: done, pop: pop,
        sides: done ? cur.sides : null, padX: 18, padY: 14, padTop: 40, padBottom: STRIP + 12
      });
      drawStrip(ctx, w, h, c, {
        cols: wall.rounds.map(function (rd) { return rd.verts.length; }), done: Math.min(step, k), color: c.teal,
        title: 'per round: independent pieces of work'
      });
    });

    var stepper = Blog.stepper(controls, {
      total: function () { return Math.max(cur.flow.value, cur.wall.k) + 1; },
      interval: 1500,
      onStep: function (i, dirn) {
        step = i;
        if (cancel) { cancel(); cancel = null; }
        pop = 1;
        var flow = cur.flow, wall = cur.wall, k = wall.k, fi = Math.min(i, flow.value), ri = Math.min(i, k), done = i > k;
        if (i > 0 && !done && dirn > 0) {
          pop = 0;
          cancel = Blog.tween({ dur: 800, ease: Blog.ease.linear, update: function (t) { pop = t; left.invalidate(); right.invalidate(); } });
        }
        setReadout(readout, [
          ['Max flow: searches', i > flow.value ? flow.value + ' + 1 that finds nothing' : String(fi)],
          ['BFS: rounds', String(ri)],
          ['BFS: frontier of this round', ri > 0 ? verts(wall.rounds[ri - 1].verts.length) : '\u2013']
        ]);
        if (i === 0) {
          status.innerHTML = 'Same town, same terminals. One pane runs maximum flow by augmenting paths, the other the wall BFS.';
        } else if (!done) {
          var nf = wall.rounds[ri - 1].verts.length;
          status.innerHTML = '<b>Step ' + i + '.</b> <b>Max flow:</b> search ' + fi + ' traces one more route from <span class="k k-blue">S</span> to <span class="k k-orange">T</span>, one junction after the next' +
            (fi > 1 ? ', through what the earlier ' + (fi === 2 ? 'route' : fi - 1 + ' routes') + ' left free' : '') + '. <b>BFS:</b> ' +
            (ri === 1 ? 'round 1 places the ' + (nf === 1 ? 'start vertex' : nf + ' start vertices') + '.' : 'round ' + ri + ' reaches ' + nf + ' new ' + (nf === 1 ? 'vertex' : 'vertices') + ', all at the same time.');
        } else {
          var same = flow.cut.slice().sort(numeric).join() === wall.verts.slice().sort(numeric).join();
          status.innerHTML = '<b>Both stop at ' + k + '.</b> <b>Max flow:</b> a last search finds no further route, and the ' + flow.value + ' vertices where it got stuck are a minimum cut. <b>BFS:</b> the wall has ' + verts(k) + ': the same size' + (same ? ', here even the same vertices.' : ', possibly different vertices.');
        }
        left.invalidate(); right.invalidate();
      }
    });
    controls.appendChild(Blog.el('span', { class: 'spacer' }));
    controls.appendChild(Blog.button('New town', function () {
      var next = build(cur.seed + 1);
      if (!next) return;                        /* keep the town that works */
      cur = next;
      stepper.reset(); stepper.refresh(); left.invalidate(); right.invalidate();
    }));

    fig.__pc = { state: function () { return { k: cur.wall.k, flow: cur.flow.value, walks: cur.flow.steps.map(function (s) { return s.walk.length; }) }; } };
  });

  /* ======================================================================
     Demo 5: bridges. Planarize, or tunnel and repair by parity
     ====================================================================== */

  /* insert a fake junction at every crossing; remember which road each
     segment belongs to */
  function planarize(pts, edges) {
    var all = pts.map(function (p) { return { x: p.x, y: p.y }; });
    var onEdge = edges.map(function () { return []; }), crossings = [], i, j;
    for (i = 0; i < edges.length; i++) for (j = i + 1; j < edges.length; j++) {
      var hit = segHit(pts[edges[i][0]], pts[edges[i][1]], pts[edges[j][0]], pts[edges[j][1]]);
      if (!hit) continue;
      var id = all.length;
      all.push({ x: hit.x, y: hit.y });
      crossings.push(id);
      onEdge[i].push({ t: hit.t, id: id });
      onEdge[j].push({ t: hit.u, id: id });
    }
    var segs = [], segRoad = {}, n2 = all.length;
    edges.forEach(function (e, idx) {
      var chain = [e[0]].concat(onEdge[idx].sort(function (a, b) { return a.t - b.t; }).map(function (o) { return o.id; }), [e[1]]);
      for (var q = 0; q + 1 < chain.length; q++) {
        segs.push([chain[q], chain[q + 1]]);
        segRoad[pairKey(chain[q], chain[q + 1], n2)] = idx;
      }
    });
    var gp = makeGraph(all, segs);
    gp.real = pts.length;
    gp.segRoad = segRoad;
    gp.tunnel = edges.map(function (e, idx) { return onEdge[idx].length > 0; });
    gp.crossings = crossings;
    return gp;
  }

  /* shortest wall when it may also pass straight through tunnel segments.
     A passage is charged like a vertex. Ties are broken towards walls with
     fewer vertices (more passages), then by id, so the result is repeatable.
     (The real implementation breaks ties by a hashed id instead.) */
  function tunnelWall(gp, tm, opts) {
    var nodes = gp.n + gp.faces.length, INF = 1e9;
    var cost = filled(nodes, INF), nv = filled(nodes, INF), par = filled(nodes, null), done = filled(nodes, false);
    var isEnd = {}, banV = opts.banVerts || {}, banRoad = opts.banRoads || {}, v;
    tm.end.forEach(function (x) { isEnd[x] = true; });
    tm.start.forEach(function (x) { if (!banV[x]) { cost[x] = 1; nv[x] = 1; } });
    function usable(x) { return x < gp.real && tm.term[x] === FREE && !banV[x]; }
    function relax(to, c, k, from, via) {
      if (c < cost[to] || (c === cost[to] && k < nv[to])) { cost[to] = c; nv[to] = k; par[to] = { from: from, via: via }; }
    }
    var hit = -1;
    for (;;) {
      var cur = -1;
      for (v = 0; v < nodes; v++) {
        if (done[v] || cost[v] >= INF) continue;
        if (cur < 0 || cost[v] < cost[cur] || (cost[v] === cost[cur] && nv[v] < nv[cur])) cur = v;
      }
      if (cur < 0) break;
      done[cur] = true;
      if (cur < gp.n) {
        if (isEnd[cur]) { hit = cur; break; }
        gp.vfaces[cur].forEach(function (f) { if (f !== gp.outer) relax(gp.n + f, cost[cur], nv[cur], cur, null); });
      } else {
        var f = cur - gp.n, walk = gp.faces[f].walk;
        gp.faces[f].verts.forEach(function (u) { if (usable(u)) relax(u, cost[cur] + 1, nv[cur] + 1, cur, null); });
        if (opts.tunnel) {
          walk.forEach(function (a, q) {
            var b = walk[(q + 1) % walk.length];
            var road = gp.segRoad[pairKey(a, b, gp.n)];
            if (road == null || !gp.tunnel[road] || banRoad[road]) return;
            var other = gp.heFace[b * gp.n + a];
            if (other === f || other === gp.outer) return;
            relax(gp.n + other, cost[cur] + 1, nv[cur], cur, { a: a, b: b, road: road });
          });
        }
      }
    }
    if (hit < 0) return null;
    var path = [], node = hit;
    while (node != null) {
      path.push(node < gp.n ? { type: 'v', id: node } : { type: 'f', id: node - gp.n });
      var p = par[node];
      if (!p) break;
      if (p.via) path.push({ type: 'p', a: p.via.a, b: p.via.b, road: p.via.road });
      node = p.from;
    }
    path.reverse();
    return { cost: cost[hit], path: path };
  }

  Blog.demo('demo-bridge', function (fig) {
    var el = Blog.parts(fig), canvas = el.canvas, status = el.status, readout = el.readout, controls = el.controls;

    /* the instance from the paper's figure: S is the bottom row, T the top row */
    var pts = [], edges = [], S = [], T = [], name = {}, roadName = {};
    function vtx(label, x, y) { name[label] = pts.length; pts.push({ x: x, y: 4.4 - y }); return pts.length - 1; }
    function road() { for (var q = 0; q + 1 < arguments.length; q++) edges.push([name[arguments[q]], name[arguments[q + 1]]]); }
    [-0.8, 0, 0.75, 2, 3.25, 4, 4.8].forEach(function (x, i) { S.push(vtx('b' + i, x, 0)); });
    [-0.8, 0, 0.45, 3.55, 4, 4.8].forEach(function (x, i) { T.push(vtx('t' + i, x, 4.4)); });
    vtx('s1', -0.8, 1.3); vtx('s2', 0, 1.3); vtx('s3', 4, 1.3); vtx('s4', 4.8, 1.3);
    vtx('hL', 0.45, 2.4); vtx('hR', 3.55, 2.4);
    vtx('l1', 0.75, 1); vtx('l2', 2, 1); vtx('l3', 3.25, 1); vtx('w', 2, 3.4);
    road('b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6');
    road('t0', 't1', 't2', 't3', 't4', 't5');
    road('b0', 's1', 't0'); road('b1', 's2', 't1'); road('b5', 's3', 't4'); road('b6', 's4', 't5');
    var highway = edges.length;
    road('hL', 'hR'); road('hL', 't2'); road('hR', 't3');
    road('l1', 'b2'); road('l2', 'b3'); road('l3', 'b4');
    roadName[highway] = 'the highway';
    ['l1', 'l2', 'l3'].forEach(function (leg, i) { roadName[edges.length] = 'leg ' + (i + 1); road(leg, 'w'); });
    var vertexName = {};
    Object.keys(name).forEach(function (label) { vertexName[name[label]] = label; });

    /* the real network is not plane; for connectivity questions only its
       adjacency matters, so it skips the face machinery */
    var real = { n: pts.length, pts: pts, edges: edges, adj: pts.map(function () { return []; }) };
    edges.forEach(function (e) { real.adj[e[0]].push(e[1]); real.adj[e[1]].push(e[0]); });

    var gp = planarize(pts, edges);
    var term = filled(gp.n, FREE);
    S.forEach(function (v) { term[v] = SRC; });
    T.forEach(function (v) { term[v] = SNK; });
    var tm = finishTerminals(gp, term);
    var realTerm = term.slice(0, real.n);
    var optimum = minCutFlow(real, realTerm);
    var inOpt = {};
    optimum.cut.forEach(function (v) { inOpt[v] = true; });

    var mode = 'planar', step = 0, progress = 1, cancel = null, res = null;

    function solve() {
      var opts = { tunnel: mode !== 'planar' };
      if (mode === 'low') {
        opts.banRoads = {}; opts.banRoads[highway] = true;
        opts.banVerts = {}; opts.banVerts[name.hL] = true; opts.banVerts[name.hR] = true;
      }
      var wall = tunnelWall(gp, tm, opts);
      var X = [], passes = {}, covered = {}, Y = [];
      wall.path.forEach(function (el2) {
        if (el2.type === 'v') { X.push(el2.id); covered[el2.id] = true; }
        if (el2.type === 'p') passes[el2.road] = (passes[el2.road] || 0) + 1;
      });
      /* parity repair: a road passed an odd number of times straddles the wall */
      Object.keys(passes).map(Number).sort(numeric).forEach(function (roadId) {
        if (passes[roadId] % 2 === 0) return;
        var a = edges[roadId][0], b = edges[roadId][1];
        if (covered[a] || covered[b]) return;
        var pick = real.adj[a].length > real.adj[b].length ? a : real.adj[b].length > real.adj[a].length ? b : Math.min(a, b);
        covered[pick] = true; Y.push(pick);
      });
      /* the wall as a polyline in map coordinates that stays inside each face it uses */
      var stops = [], line = [];
      wall.path.forEach(function (el2) {
        if (el2.type === 'v') stops.push({ x: gp.pts[el2.id].x, y: gp.pts[el2.id].y });
        else if (el2.type === 'p') stops.push({ x: (gp.pts[el2.a].x + gp.pts[el2.b].x) / 2, y: (gp.pts[el2.a].y + gp.pts[el2.b].y) / 2, pass: true });
        else stops.push({ face: el2.id });
      });
      stops.forEach(function (st, idx) {
        if (st.face == null) { line.push(st); return; }
        var leg = routeInFace(gp, st.face, stops[idx - 1], stops[idx + 1]);
        leg.slice(1, leg.length - 1).forEach(function (p) { line.push(p); });
      });
      var all = X.concat(Y);
      res = {
        wall: wall, X: X, Y: Y, all: all, passes: passes, line: line,
        extra: all.filter(function (v) { return !inOpt[v]; }),
        after: sidesOf(real, realTerm, all),
        polished: sidesOf(real, realTerm, optimum.cut)
      };
    }

    function listNames(list) {
      var legs = list.filter(function (x) { return x.indexOf('leg ') === 0; });
      if (legs.length === 3 && list.length === 3) return 'the three legs of the local road';
      return list.length < 2 ? list.join('') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
    }

    solve();

    var view = Blog.canvas(canvas, function (ctx, w, h, c) {
      var V = makeView(real, w, h, 26, 28);
      var r = Blog.clamp(Math.min(V.sx, V.sy) * 0.085, 5, 8);
      var planar = mode === 'planar';
      /* the last step keeps this mode's own result on screen: in planarize mode the
         separator stays, in the tunneling modes the refinement replaces it */
      var polished = step >= 4 && !planar;
      var sep = polished ? optimum.cut : step >= 3 ? res.all : step >= 1 ? res.X : [];
      var sides = polished ? res.polished : step >= 3 ? res.after : null;
      var inSep = {}, inY = {}, ghost = {};
      sep.forEach(function (v) { inSep[v] = true; });
      if (step === 3) res.Y.forEach(function (v) { inY[v] = true; });
      if (step >= 4) res.extra.forEach(function (v) { ghost[v] = true; });

      edges.forEach(function (e, idx) {
        var a = pts[e[0]], b = pts[e[1]], color = c.gray;
        var isHighway = idx === highway;
        if (sides && sides.side[e[0]] && sides.side[e[1]] && sides.side[e[0]] === sides.side[e[1]]) {
          color = Blog.mix(c.gray, sides.side[e[0]] === 1 ? c.blue : c.orange, 0.8);
        }
        D.line(ctx, V.X(a), V.Y(a), V.X(b), V.Y(b), isHighway ? (sides ? color : c.ink) : color, isHighway ? 5 : 2, gp.tunnel[idx] ? (isHighway ? [13, 5] : [6, 4]) : null);
      });

      /* fake junctions exist only in the planarized view */
      if (planar) gp.crossings.forEach(function (id) {
        var x = V.X(gp.pts[id]), y = V.Y(gp.pts[id]);
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
        D.roundRect(ctx, -5, -5, 10, 10, 1.5, c.stage, c.ink, 1.8);
        ctx.restore();
      });

      /* the wall */
      if (step >= 1 && !polished) {
        var line = res.line.map(function (p) { return { x: V.X(p), y: V.Y(p), pass: p.pass }; });
        strokePoly(ctx, line, progress, c.red, 3.5);
        if (progress >= 1) line.forEach(function (p) {
          if (!p.pass) return;
          D.circle(ctx, p.x, p.y, 6.5, c.stage, c.red, 2.2);
          D.line(ctx, p.x - 2.6, p.y - 2.6, p.x + 2.6, p.y + 2.6, c.red, 1.8);
          D.line(ctx, p.x - 2.6, p.y + 2.6, p.x + 2.6, p.y - 2.6, c.red, 1.8);
        });
      }

      /* parity labels */
      if (!planar && (step === 2 || step === 3)) {
        Object.keys(res.passes).forEach(function (roadId) {
          var e = edges[roadId], n = res.passes[roadId], odd = n % 2 === 1;
          var a = pts[e[0]], b = pts[e[1]];
          var isHighway = Number(roadId) === highway;
          var along = a.x === 2 ? 0.07 : 0.85, align = isHighway ? 'center' : a.x < 2 ? 'right' : 'left';
          var tx = isHighway ? V.X({ x: 2, y: 0 }) : Blog.lerp(V.X(a), V.X(b), along) + (a.x < 2 ? -9 : 9);
          var ty = isHighway ? V.Y(a) - 16 : Blog.lerp(V.Y(a), V.Y(b), along);
          var fill = odd ? c.redText : c.greenText;
          D.tag(ctx, n + '\u00D7 ' + (odd ? 'odd' : 'even'), tx, ty, { fill: fill, color: Blog.inkOn(fill), font: Blog.font(11, 700), align: align });
        });
      }

      pts.forEach(function (p, v) {
        var x = V.X(p), y = V.Y(p);
        if (realTerm[v] === SRC) { D.circle(ctx, x, y, r * 0.85, c.blue); return; }
        if (realTerm[v] === SNK) { D.circle(ctx, x, y, r * 0.85, c.orange); return; }
        var big = v === name.w ? Math.max(r + 2.5, 10) : 0;
        if (ghost[v]) D.circle(ctx, x, y, big || r + 1.5, c.stage, c.red, 2.6);
        else if (inSep[v]) D.circle(ctx, x, y, big || r + 1.5, inY[v] ? c.pink : c.red, c.stage, 1.5);
        else D.circle(ctx, x, y, big || r * 0.8, c.stage, c.muted, 1.6);
        if (big) D.text(ctx, 'w', x, y, { font: Blog.font(11, 700), color: inSep[v] && !ghost[v] ? Blog.inkOn(inY[v] ? c.pink : c.red) : c.ink });
      });

      /* labels */
      var lab = function (text, wx, wy, dx, dy, align) {
        D.text(ctx, text, V.X({ x: wx, y: 0 }) + dx, V.Y({ x: 0, y: 4.4 - wy }) + dy, { font: Blog.font(11, 600), color: c.muted, halo: c.stage, align: align || 'center' });
      };
      lab('highway', 0.45, 3.9, 8, 0, 'left');
      lab('local road', 1.375, 0.5, 0, 0);
      D.text(ctx, 'T', V.X(pts[name.t0]) - 2, V.Y(pts[name.t0]) - 15, { font: Blog.font(13, 800), color: c.orangeText });
      D.text(ctx, 'S', V.X(pts[name.b0]) - 2, V.Y(pts[name.b0]) + 16, { font: Blog.font(13, 800), color: c.blueText });
    });

    var stepper = Blog.stepper(controls, {
      total: 4,
      interval: 1900,
      onStep: function (i) {
        step = i;
        if (cancel) { cancel(); cancel = null; }
        progress = 1;
        if (i === 1) {
          progress = 0;
          cancel = Blog.tween({ dur: 900, update: function (t) { progress = t; view.invalidate(); } });
        }
        var planar = mode === 'planar', nPass = 0, oddRoads = [], evenRoads = [];
        Object.keys(res.passes).map(Number).sort(numeric).forEach(function (k) {
          nPass += res.passes[k];
          (res.passes[k] % 2 ? oddRoads : evenRoads).push(roadName[k] || 'a road');
        });
        var repaired = res.all.length, opt = optimum.value;
        var costText = res.wall.cost + ' = ' + verts(res.X.length) + (nPass ? ' + ' + nPass + (nPass === 1 ? ' passage' : ' passages') : '');
        setReadout(readout, [
          ['BFS cost of the wall', i >= 1 ? costText : '\u2026'],
          [planar ? 'Planarized separator' : 'Separator after repair', i >= 3 ? verts(repaired) : '\u2026'],
          [planar ? 'True optimum, for reference' : 'After the refinement', i >= 4 ? verts(opt) : '\u2026'],
          ['Separates S from T', i >= 3 ? ((i >= 4 && !planar ? res.polished.ok : res.after.ok) ? 'yes \u2713' : 'no') : '\u2026']
        ]);
        var txt;
        if (i === 0) {
          txt = 'A map seen from above. Three legs of a local road come up from <span class="k k-blue">S</span>, pass <b>under</b> a highway that hangs from <span class="k k-orange">T</span>, and meet at w. The two roads never meet. ' +
            (planar ? 'Here every crossing is treated as a junction (diamonds).' : 'Here the wall may pass through the four roads involved in a crossing (dashed).');
        } else if (planar) {
          txt = i === 1 ? '<b>Shortest wall in the planarized map: cost ' + res.wall.cost + '.</b> The fake junctions connect the local road to the highway, so the wall has to climb over the highway through both of its ends.'
            : i === 2 ? '<b>No passages to count.</b> The wall touched only real vertices, so it is a valid separator as it stands.'
            : i === 3 ? '<b>Planarized result: ' + verts(repaired) + '.</b> It separates <span class="k k-blue">S</span> from <span class="k k-orange">T</span>, but the two highway ends block a connection that the real network does not have.'
            : '<b>For reference:</b> the real network needs only ' + verts(opt) + '. The ' + (res.extra.length === 1 ? 'hollow vertex is' : res.extra.length + ' hollow vertices are') + ' what planarizing cost here.';
        } else {
          txt = i === 1 ? (mode === 'low'
              ? '<b>Another wall, kept below the highway for this example: cost ' + costText + '.</b> Each passage through a road (marked \u00D7) is charged like a vertex.'
              : '<b>Shortest wall with tunneling: cost ' + costText + '.</b> Each passage (marked \u00D7) is charged like a vertex, so this is still a plain BFS. The planarized wall also costs ' + res.wall.cost + '; among equal walls this figure takes the one with fewer vertices.')
            : i === 2 ? '<b>Count passages per road.</b> ' +
              (oddRoads.length ? 'Passed an odd number of times: ' + listNames(oddRoads) + '. The two ends of such a road lie on opposite sides of the wall, so it would leak. ' : '') +
              (evenRoads.length ? 'Passed an even number of times: ' + listNames(evenRoads) + '. Both of its ends are on the same side, so it does not leak.' : '')
            : i === 3 ? (res.Y.length
              ? '<b>Repair.</b> Each odd road needs one endpoint in the separator. ' + (res.Y.length === 1 && oddRoads.length > 1 ? vertexName[res.Y[0]] + ' is an endpoint of all ' + oddRoads.length + ', so one extra vertex (pink) plugs them: ' : 'The pink ' + (res.Y.length === 1 ? 'vertex plugs it: ' : 'vertices plug them: ')) + verts(repaired) + ', within the BFS cost of ' + res.wall.cost + '.'
              : '<b>Nothing to repair.</b> The separator is just the wall vertices: ' + verts(repaired) + ', below the BFS cost of ' + res.wall.cost + '.')
            : '<b>Refine.</b> An exact minimum cut on the real network around the wall returns ' + verts(opt) + '.' +
              (repaired > opt ? ' It drops the ' + (res.extra.length === 1 ? 'vertex' : res.extra.length + ' vertices') + ' the repair had to add (hollow): ' + repaired + ' before, ' + opt + ' after.' : ' The tunneling wall was already optimal here.');
        }
        status.innerHTML = txt;
        view.invalidate();
      }
    });

    controls.appendChild(Blog.el('span', { class: 'spacer' }));
    controls.appendChild(Blog.segmented({
      label: 'Crossings', value: 'planar',
      options: [{ value: 'planar', label: 'Planarize' }, { value: 'tunnel', label: 'Tunnel' }, { value: 'low', label: 'Tunnel, lower wall' }],
      onChange: function (v) { mode = v; solve(); stepper.reset(); stepper.refresh(); }
    }).el);

    fig.__pc = {
      state: function () { return { mode: mode, step: step, cost: res.wall.cost, X: res.X.length, Y: res.Y.length, ok: res.after.ok, opt: optimum.value, extra: res.extra.length }; }
    };
  });

  /* ======================================================================
     Demo 6: building the index without global rounds
     ====================================================================== */

  Blog.demo('demo-build', function (fig) {
    var el = Blog.parts(fig), canvases = el.canvases, canvas = canvases[1], status = el.status, readout = el.readout, controls = el.controls;

    /* the 8-vertex town from the paper: an 8-cycle plus the chord G-H */
    var labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    var pos = { E: [0, 1], B: [1, 0.25], A: [1, 1.75], G: [2, 0], H: [2, 2], C: [3, 0.25], D: [3, 1.75], F: [4, 1] };
    var pts = labels.map(function (l) { return { x: pos[l][0], y: pos[l][1] }; });
    var L = {};
    labels.forEach(function (l, i) { L[l] = i; });
    var edges = [['A', 'E'], ['A', 'H'], ['B', 'E'], ['B', 'G'], ['C', 'F'], ['C', 'G'], ['D', 'F'], ['D', 'H'], ['G', 'H']].map(function (e) { return [L[e[0]], L[e[1]]]; });
    var g = makeGraph(pts, edges);
    var order = labels.map(function (l, i) { return i; });       /* A..H is the nested dissection order */
    var hier = buildCCH(g, order);
    var counter, doneV, lists, log, lastMsg = '', timer = 0, focus = -1;

    function reset() {
      counter = filled(g.n, 0); doneV = filled(g.n, false); lists = []; log = []; lastMsg = '';
      /* a vertex counts its roads to lower-ranked vertices; each is handed up to it later */
      edges.forEach(function (e) { counter[hier.rank[e[0]] > hier.rank[e[1]] ? e[0] : e[1]] += 1; });
      for (var v = 0; v < g.n; v++) lists.push({});
      edges.forEach(function (e) {
        var lo = hier.rank[e[0]] < hier.rank[e[1]] ? e[0] : e[1], hi = lo === e[0] ? e[1] : e[0];
        lists[lo][hi] = 1;                                         /* own upward roads, weight 1 */
      });
    }

    function ready(v) { return !doneV[v] && counter[v] === 0; }
    function roads(n) { return n + (n === 1 ? ' road' : ' roads'); }

    /* Finish u: its upward list is final. Its lowest entry is the parent p; the
       entry's weight (the roads to p that were handed up inside this list) comes
       off p's counter, and the rest of the list moves into p's list. */
    function finish(u) {
      if (doneV[u]) return false;
      if (!ready(u)) {
        lastMsg = '<b>' + labels[u] + ' is not ready.</b> ' + roads(counter[u]) + ' to lower-ranked vertices ' + (counter[u] === 1 ? 'has' : 'have') + ' not been handed up to it yet.';
        return true;
      }
      doneV[u] = true;
      log.push(labels[u]);
      var p = hier.parent[u];
      if (p < 0) { lastMsg = ''; return true; }
      var wgt = lists[u][p], carried = [];
      counter[p] -= wgt;
      Object.keys(lists[u]).map(Number).forEach(function (x) {
        if (x === p) return;
        lists[p][x] = (lists[p][x] || 0) + lists[u][x];
        carried.push(labels[x]);
      });
      lastMsg = '<b>' + labels[u] + ' is done.</b> Its parent is ' + labels[p] + ': ' + roads(wgt) + ' to ' + labels[p] + ' ' + (wgt === 1 ? 'arrives' : 'arrive') + ', so ' + labels[p] + ' now waits for ' + (counter[p] === 0 ? 'nothing and is ready' : roads(counter[p])) + '.' +
        (carried.length ? ' The rest of its list (' + carried.join(', ') + ') travels on inside ' + labels[p] + '\u2019s list.' : '');
      return true;
    }

    var V = null, townV = null;
    reset();
    function inkDash(c) { return Blog.alpha(c.ink, 0.75); }

    /* the town: roads, plus every shortcut created so far */
    var town = Blog.canvas(canvases[0], function (ctx, w, h, c) {
      var T = townV = makeView(g, w, h, Math.max(30, w * 0.1), 34, 50);
      var r = Blog.clamp(w / 26, 12, 16);
      hier.shortcuts.forEach(function (e) {
        if (!doneV[e[2]]) return;
        D.line(ctx, T.X(pts[e[0]]), T.Y(pts[e[0]]), T.X(pts[e[1]]), T.Y(pts[e[1]]), inkDash(c), 2, [6, 4]);
      });
      edges.forEach(function (e) {
        D.line(ctx, T.X(pts[e[0]]), T.Y(pts[e[0]]), T.X(pts[e[1]]), T.Y(pts[e[1]]), c.gray, 2.2);
      });
      pts.forEach(function (p, v) {
        var isReady = ready(v), fill = doneV[v] ? c.green : c.stage;
        D.circle(ctx, T.X(p), T.Y(p), r, fill, doneV[v] ? c.green : isReady ? c.green : c.gray, isReady ? 3 : 1.6);
        D.text(ctx, labels[v], T.X(p), T.Y(p) + 0.5, { font: Blog.font(12.5, 700), color: doneV[v] ? Blog.inkOn(c.green) : c.ink });
      });
    });
    var view = Blog.canvas(canvas, function (ctx, w, h, c) {
      /* elimination tree, root on top */
      var colOf = { A: 0, B: 1, C: 2, D: 3, E: 0.5, F: 2.5, G: 1.5, H: 1.5 };
      var padX = Math.max(46, w * 0.13), top = 58, bottom = 50;
      var X = function (v) { return padX + colOf[labels[v]] / 3 * (w - 2 * padX); };
      var Y = function (v) { return top + (hier.depth[v] - 1) / (hier.height - 1) * (h - top - bottom); };
      V = { X: X, Y: Y };
      var r = Blog.clamp(w / 24, 13, 18), v;
      for (v = 0; v < g.n; v++) {
        var p = hier.parent[v];
        if (p >= 0) D.line(ctx, X(v), Y(v), X(p), Y(p), doneV[v] ? c.green : c.gray, doneV[v] ? 3 : 1.6);
      }
      for (v = 0; v < g.n; v++) {
        var isReady = ready(v);
        var fill = doneV[v] ? c.green : isReady ? c.stage : c.panel;
        D.circle(ctx, X(v), Y(v), r, fill, doneV[v] || isReady ? c.green : c.gray, isReady ? 3 : 1.6);
        D.text(ctx, labels[v], X(v), Y(v) + 0.5, { font: Blog.font(14, 700), color: doneV[v] ? Blog.inkOn(c.green) : c.ink });
        if (v === focus) D.circle(ctx, X(v), Y(v), r + 5, null, c.ink, 2.2);
        if (!doneV[v]) {
          var pill = isReady ? c.greenText : c.muted;
          D.tag(ctx, isReady ? 'ready' : 'waits for ' + roads(counter[v]), X(v), Y(v) + r + 11, { fill: pill, color: Blog.inkOn(pill), font: Blog.font(11, 700) });
        } else {
          var ups = hier.up[v].map(function (x) { return labels[x]; }).join(', ');
          var leaf = hier.depth[v] === hier.height;
          D.text(ctx, ups ? '\u2191 ' + ups : 'top', leaf ? X(v) : X(v) + r + 7, leaf ? Y(v) + r + 11 : Y(v), { font: Blog.font(11, 600), color: c.muted, halo: c.stage, align: leaf ? 'center' : 'left' });
        }
      }
    });

    var play;
    function stop() { clearInterval(timer); timer = 0; }
    function allDone() { return log.length === g.n; }

    function refresh() {
      var left = g.n - log.length, nReady = 0, v;
      for (v = 0; v < g.n; v++) if (ready(v)) nReady++;
      setReadout(readout, [
        ['Finished', (g.n - left) + ' of ' + g.n],
        ['Ready now', String(nReady)],
        ['Finishing order', log.length ? log.join(' \u2192 ') : '\u2013'],
        ['Index', left ? '\u2026' : edges.length + ' roads + ' + hier.shortcuts.length + ' shortcuts, whatever the order']
      ]);
      if (!log.length && !lastMsg) status.innerHTML = 'The ranks are A, B, \u2026, H. A, B, C and D have no lower-ranked neighbors, so four threads could start on them at once. Select any <b>ready</b> vertex to finish it.';
      else if (left) status.innerHTML = lastMsg;
      else status.innerHTML = '<b>All done:</b> ' + edges.length + ' roads and ' + hier.shortcuts.length + ' shortcuts, the same index for every finishing order. Press Reset and try another one.';
      if (play) glyphLabel(play, timer ? '\u275A\u275A' : allDone() ? '\u21BB' : '\u25B6', timer ? 'Pause' : allDone() ? 'Replay' : 'Play');
      view.invalidate(); town.invalidate();
    }

    function attempt(v) { if (v >= 0 && finish(v)) { if (allDone()) stop(); refresh(); } }

    onTap(canvas, function (p) {
      if (!V) return;
      var best = -1, bestD = 30, v;
      for (v = 0; v < g.n; v++) {
        var d = Blog.dist(p.x, p.y, V.X(v), V.Y(v));
        if (d < bestD) { bestD = d; best = v; }
      }
      attempt(best);
    });
    onTap(canvases[0], function (p) {
      if (!townV) return;
      attempt(pickVertex(g, townV, p, 30));
    });
    Blog.keys(canvas, {
      points: function () {
        if (!V) return [];
        return labels.map(function (l, v) {
          return { x: V.X(v), y: V.Y(v), label: l + (doneV[v] ? ', finished' : ready(v) ? ', ready' : ', waits for ' + roads(counter[v])) };
        });
      },
      move: function (i) { focus = i; view.invalidate(); },
      pick: function (i) { attempt(i); }
    });

    play = Blog.button('Play', function () {
      if (timer) { stop(); refresh(); return; }
      if (allDone()) reset();
      var rnd = Blog.rng(Date.now() % 100000);
      var tick = function () {
        var options = [], v;
        for (v = 0; v < g.n; v++) if (ready(v)) options.push(v);
        if (!options.length) { stop(); refresh(); return; }
        finish(rnd.pick(options));
        if (allDone()) stop();
        refresh();
      };
      if (Blog.reduced) { while (!allDone()) tick(); refresh(); return; }
      timer = setInterval(tick, 620);
      refresh();
    }, { primary: true });
    play.style.minWidth = '6.2em';
    controls.appendChild(play);
    controls.appendChild(Blog.button('Reset', function () { stop(); reset(); refresh(); }));
    Blog.inView(fig, null, function () { if (timer) { stop(); refresh(); } });

    refresh();
    fig.__pc = { state: function () { return { counters: counter.slice(), done: log.slice() }; } };
  });

  /* ======================================================================
     Self-check, run by hand from the console or the test harness:
     the wall must separate, and must match an independent max-flow.
     ====================================================================== */

  Blog._pcCheck = function (count) {
    var bad = [], tested = 0, seed;
    for (seed = 1; seed <= (count || 60); seed++) {
      var g = makeTown(seed, 5 + seed % 5, 4 + seed % 4, { river: seed % 3 === 0 ? 1 : -1, drop: 0.1 + (seed % 4) * 0.06, diag: 0.15 });
      DIRS.forEach(function (dir) {
        FRACS.forEach(function (frac) {
          var tm = pickTerminals(g, dir[0], dir[1], Math.max(1, Math.round(frac * g.n)));
          if (!tm) return;
          var wall = wallBFS(g, tm);
          if (!wall) { bad.push('no wall ' + seed); return; }
          var flow = minCutFlow(g, tm.term);
          tested++;
          if (!sidesOf(g, tm.term, wall.verts).ok) bad.push('not a separator ' + seed);
          if (flow.value !== wall.k || wall.verts.length !== wall.k) bad.push('size ' + seed + ': wall ' + wall.k + ' flow ' + flow.value);
        });
      });
    }
    var paper = makePaperGrid(), ptm = pickTerminals(paper, 0, -1, 7), pw = wallBFS(paper, ptm);
    return { tested: tested, bad: bad, paperWall: pw.k, paperRoute: roadPath(paper, ptm).length, paperFaces: paper.faces.length };
  };
  window.__pcSelfCheck = Blog._pcCheck;      /* the name used by the test scripts */
})();

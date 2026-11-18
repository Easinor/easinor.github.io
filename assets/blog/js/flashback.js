/* Interactive figures for /blog/flashback-ann/. Depends on common.js (global Blog).
   Every figure computes its content live: lifespans -> checkpoints -> filtering,
   and real beam searches on a toy 2D proximity graph. */
(function () {
  'use strict';

  var D = Blog.draw;

  function listOf(arr) { return arr.length ? arr.join(', ') : 'none'; }
  function sub(base, n) { return base + '<sub>' + n + '</sub>'; }
  function plural(n, word, many) { return n + ' ' + (n === 1 ? word : (many || word + 's')); }
  function v(name) { return '<i>' + name + '</i>'; }

  /* a Play / Pause toggle that looks like the stepper's */
  function playButton(onToggle) {
    var on = false;
    var btn = Blog.button('', function () { onToggle(!on); }, { primary: true });
    var api = {
      el: btn,
      set: function (p) {
        on = p;
        btn.textContent = '';
        btn.appendChild(Blog.el('span', { 'aria-hidden': 'true', text: p ? '❚❚ ' : '▶ ' }));
        btn.appendChild(document.createTextNode(p ? 'Pause' : 'Play'));
      }
    };
    btn.style.minWidth = '6.2em';
    api.set(false);
    return api;
  }

  /* run `tick` every `ms` while playing; stops when the figure or the tab is hidden */
  function ticker(fig, ms, tick) {
    var timer = 0, btn;
    function stop() { if (timer) { clearInterval(timer); timer = 0; btn.set(false); } }
    btn = playButton(function (go) {
      if (!go) { stop(); return; }
      btn.set(true);
      timer = setInterval(tick, ms);
    });
    Blog.inView(fig, null, stop, '0px');
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); });
    return { el: btn.el, stop: stop };
  }

  /* ======================================================================
     The running example: 10 points, 20 operations. A timestamp is the
     position of an operation in this stream.
     ====================================================================== */

  var STREAM = ['+A', '+B', '+C', '-B', '+D', '-A', '+E', '+F', '-C', '-F',
                '+G', '+H', '-H', '-D', '+I', '-G', '+J', '-J', '-E', '-I'];
  var N_OPS = STREAM.length;
  var NAMES = [];
  var SPAN = {};
  STREAM.forEach(function (op, i) {
    var name = op.charAt(1);
    if (op.charAt(0) === '+') { NAMES.push(name); SPAN[name] = { s: i, e: N_OPS }; }
    else SPAN[name].e = i;
  });

  function opText(i) { return STREAM[i].replace('-', '−'); }

  /* alive at ts  <=>  s <= ts < e  (the state after operation ts was applied) */
  function isAlive(name, ts) { return SPAN[name].s <= ts && ts < SPAN[name].e; }

  /* checkpoint G_c: insertions through window c, expirations through window c-1 */
  function inCheckpoint(name, c, W) { return SPAN[name].s < (c + 1) * W && SPAN[name].e >= c * W; }

  /* exact snapshot taken at the end of window c-1 (none exists before window 1) */
  function inSnapshot(name, c, W) { return c > 0 && isAlive(name, c * W - 1); }

  function whyNot(name, ts) {
    return SPAN[name].e <= ts ? 'expired at ' + SPAN[name].e : 'not inserted until ' + SPAN[name].s;
  }

  /* ---------- figure: lifespans on a timeline, movable query time ---------- */

  function timeline(fig, cfg) {
    var P = Blog.parts(fig), canvas = P.canvas;
    var st = { ts: cfg.ts, W: 5, mode: cfg.mode };
    var geo = { padL: 30, cw: 10 };
    var tsSlider, play, view;

    function classify() {
      var c = Math.floor(st.ts / st.W);
      var out = { c: c, graph: [], alive: [], extra: [], missing: [], state: {} };
      NAMES.forEach(function (name) {
        var inG = st.mode === 'cover' ? inCheckpoint(name, c, st.W) : inSnapshot(name, c, st.W);
        var al = isAlive(name, st.ts);
        var s = 'out';
        if (inG) out.graph.push(name);
        if (al) out.alive.push(name);
        if (al && inG) s = 'alive';
        else if (al) { s = 'missing'; out.missing.push(name); }
        else if (inG) { s = 'extra'; out.extra.push(name); }
        out.state[name] = s;
      });
      return out;
    }

    function describe() {
      var info = classify(), c = info.c, html;
      var head = '<b>' + v('ts') + ' = ' + st.ts + '</b> (right after <b>' + opText(st.ts) + '</b>) lies in window ' + c + '. ';
      var extras = info.extra.map(function (n) { return n + ' (' + whyNot(n, st.ts) + ')'; });
      var one = info.missing.length === 1;
      if (st.mode === 'cover') {
        html = head + 'The query searches checkpoint <b>' + sub('G', c) + ' = {' + info.graph.join(', ') + '}</b>. ' +
          'Alive: <span class="k k-teal">' + listOf(info.alive) + '</span>. ' +
          (extras.length ? 'The lifespan check drops <span class="k-orange">' + extras.join(', ') + '</span>.' : 'Nothing needs to be filtered.');
      } else if (c === 0) {
        html = head + 'No snapshot exists yet, so <span class="k-red">' + listOf(info.missing) + '</span> cannot be found. ' +
          'This is a start-up effect; the steady-state behavior starts in window 1.';
      } else {
        html = head + 'The newest exact snapshot is <b>' + sub('S', c - 1) + ' = {' + info.graph.join(', ') + '}</b>, taken after operation ' + (c * st.W - 1) + '. ' +
          (info.missing.length
            ? '<span class="k-red">' + listOf(info.missing) + '</span> ' + (one ? 'is' : 'are') + ' alive but not in that graph, so no search can return ' + (one ? 'it' : 'them') + '. '
            : 'Nothing alive is missing at this ' + v('ts') + '. ') +
          (extras.length ? 'The filter drops <span class="k-orange">' + extras.join(', ') + '</span>.' : '');
      }
      P.status.innerHTML = html;
      P.readout.innerHTML = '<span>alive at ' + v('ts') + ': <b>' + info.alive.length + '</b></span>' +
        '<span>in the graph searched: <b>' + info.graph.length + '</b></span>' +
        '<span>filtered out: <b>' + info.extra.length + '</b></span>' +
        '<span>alive but missing: <b>' + info.missing.length + '</b></span>';
    }

    function setTs(val, fromSlider) {
      val = Blog.clamp(Math.round(val), 0, N_OPS - 1);
      if (val === st.ts) return;
      st.ts = val;
      if (!fromSlider) tsSlider.set(val, true);
      describe();
      view.invalidate();
    }

    view = Blog.canvas(canvas, function (ctx, w, h, c) {
      var info = classify();
      var padL = 30, padR = 12, top = 34, bottom = 46;
      var cw = (w - padL - padR) / N_OPS;
      var rowH = (h - top - bottom) / NAMES.length;
      var S = Math.ceil(N_OPS / st.W), t, i;
      var X = function (pos) { return padL + (pos + 0.5) * cw; };
      var bandTop = top - 8, bandH = h - top - bottom + 12;
      var hue = { alive: c.teal, extra: c.orange, missing: c.red, out: Blog.alpha(c.gray, 0.6) };
      var ink = { alive: c.tealText, extra: c.orangeText, missing: c.redText, out: c.faint };
      geo.padL = padL; geo.cw = cw;

      for (t = 0; t < S; t++) {
        var x0 = padL + t * st.W * cw, x1 = padL + Math.min(N_OPS, (t + 1) * st.W) * cw;
        var active = t === info.c;
        if (t % 2 === 1) { ctx.fillStyle = Blog.alpha(c.gray, 0.09); ctx.fillRect(x0, bandTop, x1 - x0, bandH); }
        if (st.mode === 'cover') {
          if (active) D.roundRect(ctx, x0 + 1, bandTop, x1 - x0 - 2, bandH, 6, Blog.alpha(c.accent, 0.12), c.accent, 1.5);
          if (active) D.tag(ctx, 'G' + t, (x0 + x1) / 2, 13, { fill: c.accent, color: Blog.inkOn(c.accent), font: Blog.mono(11, 700) });
          else D.text(ctx, 'G' + t, (x0 + x1) / 2, 13, { font: Blog.mono(11, 600), color: c.faint });
        } else {
          if (active) {
            /* everything between the snapshot and ts is unseen by the snapshot */
            ctx.fillStyle = Blog.alpha(c.red, 0.1);
            ctx.fillRect(x0, bandTop, X(st.ts) - x0, bandH);
          }
          if (t > 0) {
            D.line(ctx, x0, bandTop, x0, bandTop + bandH, active ? c.accent : Blog.alpha(c.gray, 0.6), active ? 2 : 1, active ? null : [3, 3]);
            if (active) D.tag(ctx, 'S' + (t - 1), x0, 13, { fill: c.accent, color: Blog.inkOn(c.accent), font: Blog.mono(11, 700) });
            else D.text(ctx, 'S' + (t - 1), x0, 13, { font: Blog.mono(11, 600), color: c.faint });
          }
        }
      }

      NAMES.forEach(function (name, r) {
        var y = top + (r + 0.5) * rowH, sp = SPAN[name], s = info.state[name];
        var xa = X(sp.s), xb = X(sp.e);
        D.line(ctx, xa, y, xb, y, hue[s], s === 'out' ? 3 : 5, s === 'extra' ? [5, 5] : null);
        D.circle(ctx, xa, y, 4.5, hue[s]);
        D.circle(ctx, xb, y, 4.5, c.stage, hue[s], 2);
        D.text(ctx, name, padL - 15, y, { font: Blog.mono(12, 700), color: ink[s] });
      });

      /* the query time; a diamond marks every alive bar it crosses */
      var qx = X(st.ts);
      D.line(ctx, qx, bandTop - 2, qx, bandTop + bandH + 2, c.ink, 1.6);
      NAMES.forEach(function (name, r) {
        var s = info.state[name], y = top + (r + 0.5) * rowH;
        if (s !== 'alive' && s !== 'missing') return;
        ctx.beginPath();
        ctx.moveTo(qx, y - 6.5); ctx.lineTo(qx + 6.5, y); ctx.lineTo(qx, y + 6.5); ctx.lineTo(qx - 6.5, y);
        ctx.closePath();
        ctx.fillStyle = hue[s]; ctx.fill();
        ctx.strokeStyle = c.ink; ctx.lineWidth = 1.5; ctx.stroke();
      });

      /* operation labels: all of them when there is room, otherwise every
         second one plus the current one */
      var sparse = cw < 20;
      for (i = 0; i < N_OPS; i++) {
        var cur = i === st.ts;
        if (sparse && !cur && (i % 2 === 1 || Math.abs(i - st.ts) === 1)) continue;
        D.text(ctx, opText(i), X(i), h - bottom + 17, { font: Blog.mono(11, cur ? 800 : 500), color: cur ? c.ink : c.muted });
      }
      var tagX = Blog.clamp(qx, 34, w - 34);
      for (t = 0; t < S; t++) {
        var tx = X(t * st.W);
        if (Math.abs(tx - tagX) > 40 && (S <= 5 || t % 2 === 0 || !sparse)) D.text(ctx, String(t * st.W), tx, h - 12, { font: Blog.mono(11, 500), color: c.faint });
      }
      D.tag(ctx, 'ts = ' + st.ts, tagX, h - 12, { fill: c.ink, color: c.stage, font: Blog.mono(11, 700), height: 19 });
    });

    function fromPointer(p) {
      play.stop();
      setTs((p.x - geo.padL) / geo.cw - 0.5);
    }
    Blog.pointer(canvas, { down: fromPointer, move: fromPointer });
    canvas.style.cursor = 'ew-resize';

    play = ticker(fig, 800, function () { setTs((st.ts + 1) % N_OPS); });
    tsSlider = Blog.slider({
      label: 'Query time ts', min: 0, max: N_OPS - 1, value: st.ts,
      onInput: function (val) { play.stop(); setTs(val, true); }
    });
    P.controls.appendChild(play.el);
    P.controls.appendChild(tsSlider.el);
    if (cfg.switches) {
      P.controls.appendChild(Blog.el('span', { class: 'spacer' }));
      P.controls.appendChild(Blog.segmented({
        label: 'Design', value: st.mode,
        options: [{ value: 'cover', label: 'Cover-and-filter' }, { value: 'snapshot', label: 'Exact snapshots' }],
        onChange: function (val) { st.mode = val; describe(); view.invalidate(); }
      }).el);
      P.controls.appendChild(Blog.el('span', { class: 'b-field' }, [Blog.el('span', { text: 'Window size W' }), Blog.segmented({
        label: 'Window size W', value: 5,
        options: [{ value: 2, label: '2' }, { value: 4, label: '4' }, { value: 5, label: '5' }, { value: 10, label: '10' }],
        onChange: function (val) { st.W = val; describe(); view.invalidate(); }
      }).el]));
    }
    describe();
  }

  Blog.demo('demo-snapshot', function (fig) { timeline(fig, { mode: 'snapshot', ts: 7, switches: false }); });
  Blog.demo('demo-cover', function (fig) { timeline(fig, { mode: 'cover', ts: 6, switches: true }); });

  /* ---------- figure: the build, three steps per window ---------- */

  Blog.demo('demo-build', function (fig) {
    var P = Blog.parts(fig), canvas = P.canvas;
    var W = 5, beat = 0, pop = 1, cancelPop = null, started = false, view, stepper;

    function windows() { return Math.ceil(N_OPS / W); }
    function winOf(pos) { return Math.floor(pos / W); }
    function opsOf(c, sign) {
      var out = [], i;
      for (i = c * W; i < Math.min(N_OPS, (c + 1) * W); i++) if (STREAM[i].charAt(0) === sign) out.push(i);
      return out;
    }
    function members(c) { return NAMES.filter(function (n) { return inCheckpoint(n, c, W); }); }

    function describe() {
      var S = windows(), html;
      if (beat === 0) {
        html = 'Nothing is built yet. Each window takes three steps: insert, freeze, delete.';
      } else {
        var c = Math.floor((beat - 1) / 3), phase = (beat - 1) % 3;
        var ins = opsOf(c, '+').map(opText), del = opsOf(c, '-').map(opText);
        if (phase === 0) {
          html = '<b>Window ' + c + ': insert.</b> ' + (ins.length
            ? (ins.length === 1 ? 'The one insertion of this window' : 'The ' + ins.length + ' insertions of this window') +
              ' (<span class="k-teal">' + ins.join(', ') + '</span>) ' + (ins.length === 1 ? 'goes' : 'go') + ' into the current graph as one parallel batch.'
            : 'This window has no insertions.');
        } else if (phase === 1) {
          html = '<b>Window ' + c + ': freeze.</b> The current graph becomes checkpoint <b>' + sub('G', c) + ' = {' + members(c).join(', ') + '}</b>. ' +
            'The expirations of this window have not been applied yet, so every point alive at any moment of the window is in it.';
        } else if (!del.length) {
          html = '<b>Window ' + c + ': delete.</b> This window has no expirations.';
        } else {
          var total = NAMES.filter(function (n) { return winOf(SPAN[n].s) <= c && winOf(SPAN[n].e) >= c; }).length;
          var frac = del.length / total, left = total - del.length, after;
          if (left === 0) after = 'No live point remains, so the current graph is now empty.';
          else if (frac >= 0.5) after = 'At least half of the graph is dead, so it is rebuilt from its ' + plural(left, 'live point') + '.';
          else if (frac >= 0.1) after = 'More than 10% of the graph is dead, so the live vertices are rewired around ' + (del.length === 1 ? 'it' : 'them') + '.';
          else after = 'Less than 10% of the graph is dead, so ' + (del.length === 1 ? 'it stays' : 'they stay') + ' in place for now as ' + (del.length === 1 ? 'a stepping stone' : 'stepping stones') + '.';
          html = '<b>Window ' + c + ': delete.</b> <span class="k-orange">' + del.join(', ') + '</span> ' + (del.length === 1 ? 'is' : 'are') +
            ' marked dead in the current graph (' + del.length + ' of its ' + plural(total, 'vertex', 'vertices') + '). ' + after + ' ' + sub('G', c) + ' is untouched.';
        }
      }
      P.status.innerHTML = html;
      P.readout.innerHTML = '<span>one-at-a-time replay: <b>' + N_OPS + '</b> dependent steps</span>' +
        '<span>windowed build: <b>' + S + '</b> windows in order, each one (insert batch, freeze, delete batch) with parallel work inside</span>' +
        '<span>checkpoints frozen: <b>' + Math.min(S, Math.floor((beat + 1) / 3)) + ' / ' + S + '</b></span>';
    }

    view = Blog.canvas(canvas, function (ctx, w, h, c) {
      var compact = Blog.compact(w), pad = compact ? 10 : 18;
      var S = windows();
      var curC = beat > 0 ? Math.floor((beat - 1) / 3) : -1, curP = beat > 0 ? (beat - 1) % 3 : -1;
      var perRow = compact ? 10 : 20, rowsN = N_OPS / perRow, chipH = 26, chipGap = 5;
      var cw = (w - 2 * pad) / perRow, i, t;
      var small = Blog.font(11, 600);
      var chipXY = function (pos) { return { x: pad + (pos % perRow) * cw, y: 24 + Math.floor(pos / perRow) * (chipH + chipGap) }; };

      /* row 1: the stream, with the current window highlighted */
      D.text(ctx, 'Update stream in windows of W = ' + W + (curC >= 0 ? ' (now: window ' + curC + ')' : ''), pad, 12, { font: small, color: c.muted, align: 'left' });
      if (curC >= 0) {
        var a = curC * W, b = Math.min(N_OPS, (curC + 1) * W) - 1, r;
        for (r = Math.floor(a / perRow); r <= Math.floor(b / perRow); r++) {
          var from = Math.max(a, r * perRow), to = Math.min(b, r * perRow + perRow - 1);
          D.roundRect(ctx, chipXY(from).x - 1, chipXY(from).y - 3, (to - from + 1) * cw + 2, chipH + 6, 7, Blog.alpha(c.accent, 0.14), c.accent, 1.2);
        }
      }
      for (i = 0; i < N_OPS; i++) {
        var plus = STREAM[i].charAt(0) === '+', wc = winOf(i);
        var done = beat > 3 * wc + (plus ? 0 : 2);
        var now = wc === curC && ((plus && curP === 0) || (!plus && curP === 2));
        var hue = plus ? c.teal : c.orange;
        var xy = chipXY(i);
        D.roundRect(ctx, xy.x + 2, xy.y, cw - 4, chipH, 5,
          now ? hue : done ? Blog.alpha(hue, 0.2) : c.stage,
          now ? hue : done ? Blog.alpha(hue, 0.55) : c.lineStrong, 1.2);
        D.text(ctx, opText(i), xy.x + cw / 2, xy.y + chipH / 2 + 0.5, { font: Blog.mono(11, 700), color: now ? Blog.inkOn(hue) : done ? c.ink : c.muted });
        if (i % W === 0 && i > 0 && i % perRow !== 0) D.line(ctx, xy.x, xy.y - 2, xy.x, xy.y + chipH + 2, c.lineStrong, 1.5);
      }
      var y = 24 + rowsN * (chipH + chipGap);
      if (!compact) {
        for (t = 0; t < S; t++) {
          var bx0 = pad + t * W * cw, bx1 = pad + Math.min(N_OPS, (t + 1) * W) * cw;
          D.text(ctx, 'window ' + t, (bx0 + bx1) / 2, y + 8, { font: Blog.mono(11, t === curC ? 700 : 500), color: t === curC ? c.accent : c.faint });
        }
        y += 16;
      }

      /* row 2: the current graph (vertices only) */
      y += 14;
      D.text(ctx, compact ? 'Current graph, vertices only' : 'Current graph, vertices only (the one graph that is ever modified)', pad, y, { font: small, color: c.muted, align: 'left' });
      var slot = (w - 2 * pad) / NAMES.length, rad = Math.min(15, slot * 0.38), gy = y + 30;
      NAMES.forEach(function (name, k) {
        var cIns = winOf(SPAN[name].s), cDel = winOf(SPAN[name].e);
        var cx = pad + (k + 0.5) * slot;
        var present = beat > 3 * cIns, dead = beat > 3 * cDel + 2, gone = beat > 3 * cDel + 3;
        if (!present || gone) { D.circle(ctx, cx, gy, 2.5, Blog.alpha(c.gray, 0.45)); return; }
        var fresh = beat === 3 * cIns + 1;
        var r = rad * (fresh ? 0.6 + 0.4 * Blog.ease.outBack(pop) : 1);
        if (dead) {
          ctx.save(); ctx.setLineDash([4, 3]);
          D.circle(ctx, cx, gy, r, c.stage, c.orange, 2);
          ctx.restore();
          D.text(ctx, name, cx, gy + 0.5, { font: Blog.mono(12, 700), color: c.orangeText });
        } else {
          D.circle(ctx, cx, gy, r, c.teal);
          D.text(ctx, name, cx, gy + 0.5, { font: Blog.mono(12, 700), color: Blog.inkOn(c.teal) });
        }
      });

      /* row 3: the frozen checkpoints */
      y = gy + 34;
      D.text(ctx, compact ? 'Frozen checkpoints (read-only)' : 'Frozen checkpoints (read-only from the moment they are taken)', pad, y, { font: small, color: c.muted, align: 'left' });
      var gap = compact ? 6 : 12, cardY = y + 12, cardH = h - cardY - 8;
      var cardW = (w - 2 * pad - gap * (S - 1)) / S;
      for (t = 0; t < S; t++) {
        var cx0 = pad + t * (cardW + gap);
        var frozen = beat > 3 * t + 1, fresh2 = beat === 3 * t + 2;
        var range = t * W + '–' + (Math.min(N_OPS, (t + 1) * W) - 1);
        var subText = cardW > 118 ? 'answers ts ' + range : 'ts ' + range;
        if (!frozen) {
          ctx.save(); ctx.setLineDash([4, 4]);
          D.roundRect(ctx, cx0, cardY, cardW, cardH, 8, null, c.lineStrong, 1.2);
          ctx.restore();
          D.text(ctx, 'G' + t, cx0 + cardW / 2, cardY + 17, { font: Blog.mono(12, 600), color: c.faint });
          D.text(ctx, subText, cx0 + cardW / 2, cardY + 34, { font: Blog.mono(11, 500), color: c.faint });
          continue;
        }
        var dy = fresh2 ? (1 - Blog.ease.out(pop)) * -18 : 0;
        ctx.save();
        ctx.globalAlpha = fresh2 ? 0.3 + 0.7 * pop : 1;
        D.roundRect(ctx, cx0, cardY + dy, cardW, cardH, 8, Blog.alpha(c.accent, 0.12), c.accent, 1.6);
        D.text(ctx, 'G' + t, cx0 + cardW / 2, cardY + dy + 17, { font: Blog.mono(13, 800), color: c.accent });
        D.text(ctx, subText, cx0 + cardW / 2, cardY + dy + 34, { font: Blog.mono(11, 500), color: c.muted });
        var mem = members(t);
        var per = Math.max(1, Math.floor((cardW - 8) / 22));
        var rows = Math.ceil(mem.length / per);
        mem.forEach(function (name, k) {
          var row = Math.floor(k / per), col = k % per;
          var inRow = row === rows - 1 ? mem.length - per * (rows - 1) : per;
          var mx = cx0 + cardW / 2 + (col - (inRow - 1) / 2) * 22;
          var my = cardY + dy + 58 + row * 23;
          D.circle(ctx, mx, my, 9.5, c.stage, c.accent, 1.4);
          D.text(ctx, name, mx, my + 0.5, { font: Blog.mono(11, 700), color: c.ink });
        });
        ctx.restore();
      }
    });

    P.controls.appendChild(Blog.el('span', { class: 'b-field' }, [Blog.el('span', { text: 'Window size W' }), Blog.segmented({
      label: 'Window size W', value: 5,
      options: [{ value: 4, label: '4' }, { value: 5, label: '5' }, { value: 10, label: '10' }],
      onChange: function (val) { W = val; stepper.reset(); }
    }).el]));
    stepper = Blog.stepper(P.controls, {
      total: function () { return windows() * 3; },
      interval: 1500,
      speeds: true,
      onStep: function (i) {
        beat = i;
        describe();
        if (cancelPop) cancelPop();
        pop = 1;
        if (started) {
          pop = 0;
          cancelPop = Blog.tween({ dur: 420, ease: Blog.ease.linear, update: function (k) { pop = k; if (view) view.invalidate(); } });
        } else if (view) view.invalidate();
        started = true;
      }
    });
  });

  /* ======================================================================
     Toy 2D world for the two search figures. Points live in a fixed world
     rectangle (A wide, 1 tall); the canvas only scales it, so the same
     search runs on every screen of the same shape.
     ====================================================================== */

  function makePoints(n, seed, A) {
    var rnd = Blog.rng(seed), pts = [], tries = 0, i, ok;
    var minD = 0.68 * Math.sqrt(A / n);
    while (pts.length < n && tries < 60000) {
      tries++;
      var p = { x: rnd() * A, y: rnd() };
      ok = true;
      for (i = 0; i < pts.length; i++) {
        var dx = pts[i].x - p.x, dy = pts[i].y - p.y;
        if (dx * dx + dy * dy < minD * minD) { ok = false; break; }
      }
      if (ok) pts.push(p);
    }
    return pts;
  }

  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }

  /* A toy proximity graph: each vertex looks at its 12 nearest candidates and
     keeps up to r of them, skipping a candidate that is closer to an already
     kept neighbor than to the vertex itself. Edges are made two-way. */
  function buildGraph(ids, pts, r) {
    var adj = {};
    ids.forEach(function (a) { adj[a] = []; });
    ids.forEach(function (a) {
      var cand = [];
      ids.forEach(function (b) { if (b !== a) cand.push({ id: b, d: dist(pts[a], pts[b]) }); });
      cand.sort(function (x, y) { return x.d - y.d; });
      var kept = [], i, j, ok;
      for (i = 0; i < cand.length && i < 12 && kept.length < r; i++) {
        ok = true;
        for (j = 0; j < kept.length; j++) if (dist(pts[kept[j]], pts[cand[i].id]) < cand[i].d) { ok = false; break; }
        if (ok) kept.push(cand[i].id);
      }
      kept.forEach(function (b) {
        if (adj[a].indexOf(b) < 0) adj[a].push(b);
        if (adj[b].indexOf(a) < 0) adj[b].push(a);
      });
    });
    return adj;
  }

  /* entry point: the vertex closest to the centroid */
  function entryOf(ids, pts) {
    var cx = 0, cy = 0, best = -1, bd = Infinity;
    if (!ids.length) return -1;
    ids.forEach(function (a) { cx += pts[a].x; cy += pts[a].y; });
    cx /= ids.length; cy /= ids.length;
    ids.forEach(function (a) {
      var d = dist(pts[a], { x: cx, y: cy });
      if (d < bd) { bd = d; best = a; }
    });
    return best;
  }

  function byDist(pts, q) {
    return function (a, b) { return dist(pts[a], q) - dist(pts[b], q) || a - b; };
  }

  /* Standard beam search: keep the L closest candidates, always expand the
     closest unexpanded one, stop when all L have been expanded. */
  function standardSearch(adj, entry, q, L, pts) {
    var steps = [], beam = [], seen = {}, done = {}, cmp = byDist(pts, q), i;
    if (entry < 0) return { steps: steps, pool: [] };
    beam.push(entry); seen[entry] = true;
    for (;;) {
      var x = -1;
      for (i = 0; i < beam.length; i++) if (!done[beam[i]]) { x = beam[i]; break; }
      if (x < 0) break;
      done[x] = true;
      var added = [];
      adj[x].forEach(function (y) { if (!seen[y]) { seen[y] = true; beam.push(y); added.push(y); } });
      beam.sort(cmp);
      if (beam.length > L) beam.length = L;
      steps.push({ x: x, added: added, counted: true, beam: beam.slice() });
    }
    return { steps: steps, pool: beam.slice() };
  }

  /* The paper's query loop: the same best-first walk, but the candidate list
     is not cut to L, and the walk stops once L vertices that are alive at ts
     have been expanded. Non-alive vertices are still expanded, so they route. */
  function filteredSearch(adj, entry, q, L, pts, alive) {
    var steps = [], beam = [], seen = {}, done = {}, pool = [], cmp = byDist(pts, q), i;
    if (entry < 0) return { steps: steps, pool: pool };
    beam.push(entry); seen[entry] = true;
    while (pool.length < L) {
      var x = -1;
      for (i = 0; i < beam.length; i++) if (!done[beam[i]]) { x = beam[i]; break; }
      if (x < 0) break;
      done[x] = true;
      var ok = alive(x), added = [];
      if (ok) pool.push(x);
      adj[x].forEach(function (y) { if (!seen[y]) { seen[y] = true; beam.push(y); added.push(y); } });
      beam.sort(cmp);
      steps.push({ x: x, added: added, counted: ok });
    }
    pool.sort(cmp);
    return { steps: steps, pool: pool };
  }

  /* lifespans as in the paper's synthetic workload: point i expires right
     after point i + len_i is inserted, len_i uniform in [1, R] */
  function makeLifespans(n, R, seed) {
    var rnd = Blog.rng(seed), len = [], s = [], e = [], pos = 0, i, j;
    for (i = 0; i < n; i++) len.push(rnd.int(1, R));
    for (j = 0; j < n; j++) {
      s[j] = pos++;
      for (i = 0; i < j; i++) if (i + len[i] === j) e[i] = pos++;
    }
    var rest = [];
    for (i = 0; i < n; i++) if (e[i] == null) rest.push(i);
    rest.sort(function (a, b) { return (a + len[a]) - (b + len[b]); });
    rest.forEach(function (k) { e[k] = pos++; });
    return { s: s, e: e, total: pos };
  }

  /* ---------- figure: beam search, plain and time-travelling ---------- */

  function searchDemo(fig, cfg) {
    var P = Blog.parts(fig), canvas = P.canvas;
    var K = 3, DEG = 4, WIN = 30, THETA = WIN / 10, STRIP = 30;
    var life = cfg.temporal ? makeLifespans(cfg.n, 44, 7) : null;
    var world = { A: 0, pts: [], all: [], cache: {} };
    var geo = { ox: 0, oy: 0, s: 1 };
    var st = { qu: cfg.temporal ? 0.4 : 0.74, qv: cfg.temporal ? 0.75 : 0.3, L: cfg.temporal ? 5 : 4, ts: 100, mode: 'cover' };
    var run = null, shown = 0, flash = 1, cancelFlash = null, started = false, kbd = -1, view, stepper = null;

    function aliveAt(i) { return !life || (life.s[i] <= st.ts && st.ts < life.e[i]); }
    function inWindowGraph(i, c) { return life.s[i] < (c + 1) * WIN && life.e[i] >= c * WIN; }

    function setWorld(A) {
      world.A = A;
      world.pts = makePoints(cfg.n, cfg.seed, A);
      world.all = world.pts.map(function (p, i) { return i; });
      world.cache = {};
    }

    function compute() {
      var pts = world.pts, all = world.all;
      var q = { x: st.qu * world.A, y: st.qv };
      var c = life ? Math.floor(st.ts / WIN) : 0;
      var cmp = byDist(pts, q);
      var alive = all.filter(aliveAt);
      var truth = alive.slice().sort(cmp).slice(0, K);
      var ids, adj, res, key = 'g' + c, scan = false;
      if (!cfg.temporal || st.mode === 'post') {
        if (!world.cache.all) world.cache.all = buildGraph(all, pts, DEG);
        ids = all; adj = world.cache.all;
        res = standardSearch(adj, entryOf(ids, pts), q, st.L, pts);
        if (cfg.temporal) res.pool = res.pool.filter(aliveAt);
      } else {
        var full = all.filter(function (i) { return inWindowGraph(i, c); });
        if (!world.cache[key]) world.cache[key] = buildGraph(full, pts, DEG);
        if (st.mode === 'cover') {
          ids = full; adj = world.cache[key];
          /* fewer than W/10 alive points: compare q with them directly */
          scan = alive.length < THETA;
          res = scan ? { steps: [], pool: truth.slice() } : filteredSearch(adj, entryOf(ids, pts), q, st.L, pts, aliveAt);
        } else {
          /* 'drop': the same checkpoint graph with every non-alive vertex removed */
          ids = alive;
          adj = {};
          ids.forEach(function (a) { adj[a] = world.cache[key][a].filter(aliveAt); });
          res = filteredSearch(adj, entryOf(ids, pts), q, st.L, pts, aliveAt);
        }
      }
      var inGraph = {};
      ids.forEach(function (i) { inGraph[i] = true; });
      /* which vertices can be reached from the entry point at all */
      var entry = entryOf(ids, pts), reach = 0, mark = {}, stack = entry >= 0 ? [entry] : [];
      if (entry >= 0) mark[entry] = true;
      while (stack.length) {
        var top = stack.pop();
        reach++;
        adj[top].forEach(function (y) { if (!mark[y]) { mark[y] = true; stack.push(y); } });
      }
      var result = res.pool.slice().sort(cmp).slice(0, K);
      run = {
        c: c, ids: ids, adj: adj, inGraph: inGraph, entry: scan ? -1 : entry, scan: scan, reach: reach,
        steps: res.steps, pool: res.pool, result: result, truth: truth, aliveCount: alive.length,
        hits: result.filter(function (r) { return truth.indexOf(r) >= 0; }).length,
        cutOff: truth.filter(function (r) { return !mark[r]; }).length
      };
    }

    function tally(upto) {
      var out = { counted: 0, transit: 0, seen: {}, done: {}, parent: {}, list: run.entry >= 0 ? [run.entry] : [] }, i;
      if (run.entry >= 0) out.seen[run.entry] = true;
      for (i = 0; i < upto && i < run.steps.length; i++) {
        var sp = run.steps[i];
        out.done[sp.x] = true;
        if (sp.counted) out.counted++; else out.transit++;
        sp.added.forEach(function (y) { out.seen[y] = true; out.parent[y] = sp.x; });
        if (sp.beam) out.list = sp.beam;
      }
      return out;
    }

    function describe() {
      var total = run.steps.length, i = Math.min(shown, total), tl = tally(i), html;
      var finished = i >= total;
      var want = Math.min(K, run.truth.length);
      var found = '<span class="k-green">True nearest neighbors found: ' + run.hits + ' of ' + want + '.</span>';
      var standard = !cfg.temporal || st.mode === 'post';
      if (cfg.temporal && run.aliveCount === 0) {
        html = 'No point is alive at this ' + v('ts') + ', so the answer is empty.';
      } else if (run.scan) {
        html = 'Only ' + plural(run.aliveCount, 'point') + ' ' + (run.aliveCount === 1 ? 'is' : 'are') + ' alive, fewer than the threshold ' + v('W') + ' / 10 = ' + THETA +
          '. The query skips the graph and compares ' + v('q') + ' with ' + (run.aliveCount === 1 ? 'it' : 'them') + ' directly, which is exact. ' + found;
      } else if (!total) {
        html = 'No vertex is in this graph.';
      } else if (i === 0) {
        html = 'The search starts at the <b>entry point</b>.';
      } else if (!finished) {
        var sp = run.steps[i - 1];
        html = 'Expansion ' + i + ': the closest unexpanded candidate is expanded' +
          (!standard && !sp.counted ? '. It is <span class="k-orange">not alive at ' + v('ts') + '</span>, so it serves as a stepping stone and does not count toward ' + v('L') : '') +
          '. Its edges reveal ' + plural(sp.added.length, 'new candidate') + '.';
      } else if (!cfg.temporal) {
        html = 'Done after <b>' + plural(total, 'expansion') + '</b> out of ' + cfg.n + ' points. ' + found;
      } else if (st.mode === 'cover') {
        html = 'Done after ' + plural(total, 'expansion') + ', with <span class="k-orange">' + (tl.transit ? plural(tl.transit, 'stepping stone') : 'no stepping stones') + '</span> (vertices not alive at ' + v('ts') + '). ' + found +
          (tl.transit > 3 * Math.max(1, tl.counted) ? ' With so few alive points, this is the case the direct comparison in the text is for.' : '');
      } else if (st.mode === 'post') {
        html = 'After ' + plural(total, 'expansion') + ', the list holds ' + (st.L === 1
          ? 'the single closest point <em>ever inserted</em>, which is <b>' + (run.pool.length ? '' : 'not ') + 'alive</b> at ' + v('ts')
          : 'the ' + st.L + ' closest points <em>ever inserted</em>; <b>' + run.pool.length + '</b> of them ' + (run.pool.length === 1 ? 'is' : 'are') + ' alive at ' + v('ts')) + '. ' + found;
      } else {
        html = (run.aliveCount === 1
          ? 'With the non-alive vertices removed, the graph is the single alive point. '
          : run.reach === run.aliveCount
            ? 'With the non-alive vertices removed, all ' + run.aliveCount + ' alive points are still connected at this ' + v('ts') + '. '
            : 'With the non-alive vertices removed, ' + run.reach + ' of the ' + run.aliveCount + ' alive points ' + (run.reach === 1 ? 'is' : 'are') + ' reachable from the entry point. ') +
          found + (run.cutOff ? ' ' + plural(run.cutOff, 'true neighbor') + ' ' + (run.cutOff === 1 ? 'is' : 'are') + ' not reachable in this graph.' : '');
      }
      P.status.innerHTML = html;
      var ro = '';
      if (cfg.temporal) {
        ro += '<span>' + v('ts') + ' = <b>' + st.ts + '</b> of ' + (life.total - 1) + (st.mode === 'post' ? '' : ' → checkpoint <b>' + sub('G', run.c) + '</b>') + '</span>' +
          '<span>alive at ' + v('ts') + ': <b>' + run.aliveCount + '</b></span>' +
          '<span>vertices in the graph: <b>' + run.ids.length + '</b></span>' +
          (standard || run.scan
            ? '<span>expansions: <b>' + (tl.counted + tl.transit) + '</b></span>'
            : '<span>expansions: <b>' + (tl.counted + tl.transit) + '</b> (alive: ' + tl.counted + ' of ' + v('L') + ' = ' + st.L + ', stepping stones: ' + tl.transit + ')</span>');
      } else {
        ro += '<span>expansions: <b>' + (tl.counted + tl.transit) + '</b> of ' + cfg.n + ' points</span><span>beam width ' + v('L') + ' = <b>' + st.L + '</b></span>';
      }
      if ((finished || run.scan) && want) ro += '<span>recall: <b>' + run.hits + ' / ' + want + '</b></span>';
      P.readout.innerHTML = ro;
    }

    function restart(toEnd) {
      compute();
      if (!stepper) return;
      stepper.pause();
      stepper.go(toEnd ? run.steps.length : 0);
    }

    view = Blog.canvas(canvas, function (ctx, w, h, c) {
      var compact = Blog.compact(w), pad = compact ? 14 : 24, i;
      var A = w / h > 1.3 ? 2.2 : 0.9;
      if (A !== world.A) {
        setWorld(A);
        compute();
        if (stepper) setTimeout(function () { stepper.pause(); stepper.go(run.steps.length); }, 0);
      }
      var s = Math.min((w - 2 * pad) / A, h - 2 * pad - STRIP);
      var ox = (w - A * s) / 2, oy = pad;
      geo.ox = ox; geo.oy = oy; geo.s = s;
      var pts = world.pts;
      var X = function (p) { return ox + p.x * s; }, Y = function (p) { return oy + p.y * s; };
      var qx = ox + st.qu * A * s, qy = oy + st.qv * s;
      var total = run.steps.length, upto = Math.min(shown, total), tl = tally(upto);
      var finished = (upto >= total && total > 0) || run.scan;
      var R0 = compact ? 4.6 : 6;
      var cur = upto > 0 ? run.steps[upto - 1] : null;
      var standard = !cfg.temporal || st.mode === 'post';
      var liveHue = cfg.temporal ? c.teal : c.accent;

      /* edges of the graph being searched */
      ctx.lineWidth = 1; ctx.strokeStyle = Blog.alpha(c.gray, c.dark ? 0.4 : 0.34);
      ctx.beginPath();
      run.ids.forEach(function (a) {
        run.adj[a].forEach(function (b) {
          if (b < a) return;
          ctx.moveTo(X(pts[a]), Y(pts[a])); ctx.lineTo(X(pts[b]), Y(pts[b]));
        });
      });
      ctx.stroke();

      /* the walk so far: who discovered whom */
      for (i in tl.parent) {
        if (!Object.prototype.hasOwnProperty.call(tl.parent, i)) continue;
        var child = pts[i], par = pts[tl.parent[i]];
        var isNew = cur && cur.added.indexOf(Number(i)) >= 0;
        var g = isNew ? flash : 1;
        D.line(ctx, X(par), Y(par), Blog.lerp(X(par), X(child), g), Blog.lerp(Y(par), Y(child), g),
          tl.done[i] ? c.accent : Blog.alpha(c.accent, 0.5), tl.done[i] ? 2.6 : 1.4);
      }

      /* vertices */
      world.all.forEach(function (a) {
        var px = X(pts[a]), py = Y(pts[a]), al = aliveAt(a);
        if (!run.inGraph[a]) { D.circle(ctx, px, py, 1.8, Blog.alpha(c.gray, 0.5)); return; }
        var isRes = finished && run.result.indexOf(a) >= 0;
        if (isRes) D.circle(ctx, px, py, R0 + 2.5, c.green, c.ink, 1.5);
        else if (cfg.temporal && !al) D.circle(ctx, px, py, R0 - 0.5 + (tl.done[a] ? 1 : 0), c.stage, Blog.alpha(c.orange, tl.done[a] || tl.seen[a] ? 1 : 0.8), tl.done[a] ? 3.2 : 1.6);
        else if (tl.done[a]) D.circle(ctx, px, py, R0 + 0.5, liveHue, c.ink, 1.8);
        else if (cfg.temporal) D.circle(ctx, px, py, R0 - 0.5, Blog.alpha(c.teal, tl.seen[a] ? 1 : 0.6));
        else D.circle(ctx, px, py, R0 - 0.5, tl.seen[a] ? c.gray : Blog.alpha(c.gray, 0.45), tl.seen[a] ? c.ink : null, 1.2);
      });

      /* ground truth rings */
      run.truth.forEach(function (a) {
        ctx.save(); ctx.setLineDash([3, 3]);
        D.circle(ctx, X(pts[a]), Y(pts[a]), R0 + 7, null, c.green, 1.6);
        ctx.restore();
      });

      /* pulse on the vertex just expanded */
      if (cur && !finished) D.circle(ctx, X(pts[cur.x]), Y(pts[cur.x]), R0 + 4 + 12 * flash, null, Blog.alpha(c.ink, 0.6 * (1 - flash)), 2);

      if (run.entry >= 0) {
        var ep = pts[run.entry];
        D.text(ctx, 'entry', X(ep), Y(ep) - R0 - 9, { font: Blog.font(11, 700), color: c.muted, halo: c.stage });
      }

      /* keyboard cursor */
      if (kbd >= 0 && run.inGraph[kbd]) D.circle(ctx, X(pts[kbd]), Y(pts[kbd]), R0 + 10, null, c.ink, 2.2);

      /* the query */
      D.line(ctx, qx - 9, qy, qx + 9, qy, c.ink, 2.2);
      D.line(ctx, qx, qy - 9, qx, qy + 9, c.ink, 2.2);
      D.circle(ctx, qx, qy, 4, c.pink, c.ink, 1.5);
      D.text(ctx, 'q', qx + 13, qy - 11, { font: Blog.font(13, 800), color: c.ink, halo: c.stage });

      /* bottom strip: where the budget L goes */
      var sy = h - STRIP / 2 - 2, label, slots = st.L, k, sx;
      ctx.fillStyle = Blog.alpha(c.gray, 0.1);
      ctx.fillRect(0, h - STRIP - 2, w, STRIP + 2);
      if (run.scan) {
        D.text(ctx, 'direct comparison with the ' + plural(run.aliveCount, 'alive point'), pad, sy, { font: Blog.font(11, 600), color: c.muted, align: 'left' });
      } else {
        label = standard ? 'candidate list' : 'alive expanded';
        D.text(ctx, label, pad, sy, { font: Blog.font(11, 600), color: c.muted, align: 'left' });
        ctx.font = Blog.font(11, 600);
        sx = pad + ctx.measureText(label).width + 14;
        var pitch = Math.min(20, (w - pad - sx) / slots);
        for (k = 0; k < slots; k++) {
          var cxs = sx + k * pitch + 6;
          if (standard) {
            var id = tl.list[k];
            if (id == null) { ctx.save(); ctx.setLineDash([2, 2]); D.circle(ctx, cxs, sy, 5.5, null, c.lineStrong, 1.2); ctx.restore(); }
            else if (finished && run.result.indexOf(id) >= 0) D.circle(ctx, cxs, sy, 6, c.green, c.ink, 1.3);
            else if (tl.done[id]) D.circle(ctx, cxs, sy, 6, cfg.temporal && !aliveAt(id) ? c.stage : liveHue, cfg.temporal && !aliveAt(id) ? c.orange : c.ink, cfg.temporal && !aliveAt(id) ? 2.6 : 1.3);
            else D.circle(ctx, cxs, sy, 5.5, c.stage, c.ink, 1.3);
          } else if (k < tl.counted) D.circle(ctx, cxs, sy, 6, c.teal, c.ink, 1.3);
          else { ctx.save(); ctx.setLineDash([2, 2]); D.circle(ctx, cxs, sy, 5.5, null, c.lineStrong, 1.2); ctx.restore(); }
        }
      }
      if (cfg.temporal && !compact) {
        D.text(ctx, st.mode === 'post' ? 'graph of every point ever inserted' : 'checkpoint G' + run.c + (st.mode === 'drop' ? ', non-alive vertices removed' : ''),
          w - pad, sy, { font: Blog.font(11, 600), color: c.muted, align: 'right' });
      }
    });

    function setQuery(qu, qv) {
      st.qu = Blog.clamp(qu, 0, 1);
      st.qv = Blog.clamp(qv, 0, 1);
      restart(true);
    }
    function moveQuery(p) { setQuery((p.x - geo.ox) / (world.A * geo.s), (p.y - geo.oy) / geo.s); }
    /* a finger that starts on or near q drags it in any direction; anywhere
       else a tap moves q and a vertical swipe scrolls the page */
    Blog.pointer(canvas, {
      down: moveQuery, move: moveQuery,
      grab: function (p) { return Blog.dist(p.x, p.y, geo.ox + st.qu * world.A * geo.s, geo.oy + st.qv * geo.s) < 30; }
    });
    /* keyboard path: arrow keys travel between the vertices of the graph,
       Enter or Space places q right next to the chosen one */
    canvas.setAttribute('aria-label', (cfg.temporal ? 'Time-travel search' : 'Beam search') +
      ' on a toy graph. Arrow keys choose a vertex; Enter moves the query point next to it.');
    Blog.keys(canvas, {
      points: function () {
        return run.ids.map(function (a) {
          return {
            id: a, x: geo.ox + world.pts[a].x * geo.s, y: geo.oy + world.pts[a].y * geo.s,
            label: 'Vertex ' + (a + 1) + (cfg.temporal ? (aliveAt(a) ? ', alive at ts' : ', not alive at ts') : '')
          };
        });
      },
      move: function (i, pt) { kbd = pt ? pt.id : -1; view.invalidate(); },
      pick: function (i, pt) {
        setQuery((world.pts[pt.id].x + 0.03) / world.A, world.pts[pt.id].y + 0.03);
      }
    });

    if (cfg.temporal) {
      P.controls.appendChild(Blog.segmented({
        label: 'Strategy', value: 'cover',
        options: [{ value: 'cover', label: 'Cover-and-filter' }, { value: 'post', label: 'Post-filter' }, { value: 'drop', label: 'Remove non-alive' }],
        onChange: function (val) { st.mode = val; restart(true); }
      }).el);
    }
    stepper = Blog.stepper(P.controls, {
      total: function () { return run ? run.steps.length : 0; },
      interval: 620,
      autoplay: !!cfg.autoplay,
      onStep: function (i) {
        shown = i;
        describe();
        if (cancelFlash) cancelFlash();
        flash = 1;
        if (started) {
          flash = 0;
          cancelFlash = Blog.tween({ dur: 380, ease: Blog.ease.out, update: function (k) { flash = k; view.invalidate(); } });
        } else view.invalidate();
        started = true;
      }
    });
    P.controls.appendChild(Blog.el('span', { class: 'spacer' }));
    P.controls.appendChild(Blog.slider({
      label: 'Beam width L', min: 1, max: cfg.temporal ? 12 : 10, value: st.L,
      onInput: function (val) { st.L = val; restart(true); }
    }).el);
    if (cfg.temporal) {
      P.controls.appendChild(Blog.slider({
        label: 'Query time ts', min: 0, max: life.total - 1, value: st.ts,
        onInput: function (val) { st.ts = val; restart(true); }
      }).el);
    }
  }

  Blog.demo('demo-beam', function (fig) {
    searchDemo(fig, { n: 80, seed: 3, temporal: false, autoplay: true });
  });
  Blog.demo('demo-filtered', function (fig) {
    searchDemo(fig, { n: 90, seed: 12, temporal: true });
  });

  /* ---------- figure: reading one vertex's edge history at checkpoint c ---------- */

  Blog.demo('demo-history', function (fig) {
    var P = Blog.parts(fig), canvas = P.canvas;
    var INF = 99;
    var LIVE = [['X', 2, INF], ['Y', 5, INF], ['Z', 8, INF]];
    var BLOCKS = [
      [['A', 1, 2], ['B', 1, 3], ['C', 2, 4]],
      [['D', 3, 5], ['E', 4, 7], ['F', 6, 7]],
      [['G', 2, 8], ['H', 5, 9], ['I', 8, 9]],
      [['J', 7, 10], ['K', 9, 10], ['L', 10, 11]]
    ];
    var TAIL = [['Q', 3, 12], ['R', 11, 12]];
    var cp = 6, view, slider, play;

    function summary(block) {
      var lo = Infinity, hi = -Infinity;
      block.forEach(function (r) { lo = Math.min(lo, r[1]); hi = Math.max(hi, r[2]); });
      return [lo, hi];
    }

    /* the read path of the default layout: binary-search the block summaries on
       "latest death" (deaths are sorted), then scan forward, skipping blocks
       whose edges were all born after the checkpoint */
    function read() {
      var rows = [], out = [], decoded = 0, lo = 0, hi = BLOCKS.length, i, first, stop = false;
      while (lo < hi) {
        var mid = (lo + hi) >> 1;
        if (summary(BLOCKS[mid])[1] > cp) hi = mid; else lo = mid + 1;
      }
      first = lo;
      var cell = function (r) {
        var ok = r[1] <= cp && cp < r[2];
        if (ok) out.push(r[0]);
        return { rec: r, state: ok ? 'hit' : 'miss' };
      };
      var skipCell = function (r) { return { rec: r, state: 'skip' }; };
      /* live edges are in birth order: read until the first one born after cp */
      rows.push({ kind: 'live', title: 'Live buffer', note: 'current edges', verdict: 'read', cells: LIVE.map(function (r) {
        if (stop || r[1] > cp) { stop = true; return skipCell(r); }
        out.push(r[0]);
        return { rec: r, state: 'hit' };
      }) });
      for (i = 0; i < BLOCKS.length; i++) {
        var sm = summary(BLOCKS[i]), row = { kind: 'block', title: 'Block ' + (i + 1), note: '[' + sm[0] + ', ' + sm[1] + ']' };
        if (i < first) { row.verdict = 'dead'; row.cells = BLOCKS[i].map(skipCell); }
        else if (sm[0] > cp) { row.verdict = 'unborn'; row.cells = BLOCKS[i].map(skipCell); }
        else { row.verdict = 'read'; decoded += BLOCKS[i].length; row.cells = BLOCKS[i].map(cell); }
        rows.push(row);
      }
      decoded += TAIL.length;
      rows.push({ kind: 'tail', title: 'Open tail', note: 'not full yet', verdict: 'read', cells: TAIL.map(cell) });
      return { rows: rows, out: out, decoded: decoded, first: first };
    }

    function recText(r) { return r[0] + '[' + r[1] + ',' + (r[2] === INF ? '∞' : r[2]) + ')'; }

    function describe() {
      var res = read(), total = BLOCKS.length * 3 + TAIL.length;
      var dead = res.first, unborn = res.rows.filter(function (r) { return r.verdict === 'unborn'; }).length;
      var parts = [];
      if (dead) parts.push('The binary search skips ' + plural(dead, 'block') + ' whose edges had all died by then.');
      if (unborn) parts.push((unborn === 1 ? 'One block' : ['', '', 'Two', 'Three', 'Four'][unborn] + ' blocks') + ' born entirely later ' + (unborn === 1 ? 'is' : 'are') + ' skipped by ' + (unborn === 1 ? 'its summary' : 'their summaries') + '.');
      P.status.innerHTML = 'Neighbor list at <b>checkpoint ' + cp + '</b>: <span class="k-green">{' + listOf(res.out) + '}</span>. ' +
        (parts.length ? parts.join(' ') : 'No block can be skipped at this checkpoint.');
      P.readout.innerHTML = '<span>history records decoded: <b>' + res.decoded + ' of ' + total + '</b></span>' +
        '<span>blocks skipped: <b>' + (dead + unborn) + ' of ' + BLOCKS.length + '</b></span>' +
        '<span>edges returned: <b>' + res.out.length + '</b></span>';
    }

    function setCp(val, fromSlider) {
      cp = Blog.clamp(val, 1, 12);
      if (!fromSlider) slider.set(cp, true);
      describe();
      view.invalidate();
    }

    view = Blog.canvas(canvas, function (ctx, w, h, c) {
      var res = read(), narrow = w < 720;
      var pad = narrow ? 10 : 20, labelW = narrow ? 78 : 150, verdictW = narrow ? 44 : 270, gap = narrow ? 4 : 8;
      var cellW = Math.min(96, (w - 2 * pad - labelW - verdictW - gap * 2) / 3);
      var rowH = (h - 16) / res.rows.length, cellH = Math.min(34, rowH - 12);
      var longText = {
        live: 'read until the first edge born after c',
        dead: 'skipped: every edge had died by checkpoint c',
        unborn: 'skipped: every edge was born after c',
        read: 'decoded and checked edge by edge',
        tail: 'checked edge by edge'
      };
      res.rows.forEach(function (row, r) {
        var y = 8 + r * rowH + rowH / 2;
        var skipped = row.verdict === 'dead' || row.verdict === 'unborn';
        D.text(ctx, row.title, pad, y - 7, { font: Blog.font(12, 700), color: skipped ? c.faint : c.ink, align: 'left' });
        D.text(ctx, row.note, pad, y + 8, { font: row.kind === 'block' ? Blog.mono(11, 600) : Blog.font(11, 500), color: skipped ? c.faint : c.muted, align: 'left' });
        row.cells.forEach(function (cell, k) {
          var x = pad + labelW + k * (cellW + gap);
          var fill = null, stroke = c.lineStrong, ink = c.faint;
          if (cell.state === 'hit') { fill = Blog.alpha(c.green, 0.22); stroke = c.green; ink = c.ink; }
          else if (cell.state === 'miss') { stroke = c.orange; ink = c.muted; }
          D.roundRect(ctx, x, y - cellH / 2, cellW, cellH, 6, fill, stroke, cell.state === 'skip' ? 1 : 1.6);
          D.text(ctx, recText(cell.rec), x + cellW / 2, y + 0.5, { font: Blog.mono(narrow ? 11 : 11.5, 600), color: ink });
          if (cell.state === 'miss') D.line(ctx, x + 5, y, x + cellW - 5, y, Blog.alpha(c.orange, 0.8), 1.4);
        });
        var vx = pad + labelW + 3 * (cellW + gap) + (narrow ? 2 : 8);
        var key = row.kind === 'live' ? 'live' : row.kind === 'tail' ? 'tail' : row.verdict;
        D.text(ctx, narrow ? (skipped ? 'skip' : 'read') : longText[key], vx, y, { font: Blog.font(11.5, 700), color: skipped ? c.faint : c.accent, align: 'left' });
      });
    });

    play = ticker(fig, 900, function () { setCp(cp >= 12 ? 1 : cp + 1); });
    slider = Blog.slider({ label: 'Checkpoint c', min: 1, max: 12, value: cp, onInput: function (val) { play.stop(); setCp(val, true); } });
    P.controls.appendChild(play.el);
    P.controls.appendChild(slider.el);
    describe();
  });

  /* ---------- figure: build time, measured values from the paper ---------- */

  Blog.demo('demo-buildtime', function (fig) {
    var P = Blog.parts(fig), canvas = P.canvas;
    var DATA = {
      BIGANN: [['Timestamp Graph (sequential), 1 million points', 5749, false], ['FlashbackANN (112 cores), 1 million points', 11.5, true], ['FlashbackANN (112 cores), 1 billion points', 11548, true]],
      DEEP: [['Timestamp Graph (sequential), 1 million points', 4372, false], ['FlashbackANN (112 cores), 1 million points', 12.4, true], ['FlashbackANN (112 cores), 1 billion points', 12557, true]]
    };
    var set = 'BIGANN', scale = 'linear', from = [0, 0, 0], shownW = [0, 0, 0], cancel = null, started = false, view;

    function frac(val) {
      return scale === 'linear' ? val / 13000 : Math.log(val) / Math.log(13000 * 1.2);
    }
    function fmt(val) {
      var s = val < 100 ? val.toFixed(1) + ' s' : Blog.num(val) + ' s';
      return val >= 3600 ? s + '  (' + (val / 3600).toFixed(1) + ' h)' : val >= 600 ? s + '  (' + Math.round(val / 60) + ' min)' : s;
    }
    function retarget() {
      var rows = DATA[set];
      from = shownW.slice();
      if (cancel) cancel();
      cancel = Blog.tween({ dur: 600, update: function (k) {
        rows.forEach(function (r, i) { shownW[i] = Blog.lerp(from[i], frac(r[1]), k); });
        if (view) view.invalidate();
      } });
      P.status.innerHTML = scale === 'linear'
        ? 'On a linear axis the 1-million-point FlashbackANN build is a sliver: <b>' + rows[1][1] + ' s</b> next to <b>' + Blog.num(rows[0][1]) + ' s</b>. Switch to the log axis to see it.'
        : 'On a log axis every gridline is 10×. FlashbackANN indexes a <b>thousand times more points</b> in ' + (rows[2][1] / rows[0][1]).toFixed(1) + '× the time Timestamp Graph takes for 1 million.';
    }

    view = Blog.canvas(canvas, function (ctx, w, h, c) {
      var rows = DATA[set], compact = Blog.compact(w), padL = compact ? 10 : 20, padR = compact ? 12 : 26;
      var span = w - padL - padR, rowH = (h - 26) / rows.length, i;
      var ticks = scale === 'log' ? [1, 10, 100, 1000, 10000] : [0, 4000, 8000, 12000];
      ticks.forEach(function (tv, k) {
        var gx = padL + span * (scale === 'log' ? frac(tv) : tv / 13000);
        D.line(ctx, gx, 8, gx, h - 20, Blog.alpha(c.gray, 0.3), 1, [3, 4]);
        D.text(ctx, Blog.num(tv) + ' s', gx, h - 9, { font: Blog.mono(11, 500), color: c.faint, align: k === 0 ? 'left' : k === ticks.length - 1 ? 'right' : 'center' });
      });
      rows.forEach(function (r, k) {
        var y = 8 + k * rowH, bh = Math.min(22, rowH - 30), bw = Math.max(2, span * shownW[k]);
        var fill = r[2] ? c.accent : c.gray;
        D.text(ctx, compact ? r[0].replace(' (sequential)', '').replace(' (112 cores)', '') : r[0], padL, y + 10, { font: Blog.font(11.5, 650), color: c.ink, align: 'left' });
        D.roundRect(ctx, padL, y + 20, bw, bh, 4, fill);
        var label = fmt(r[1]);
        ctx.font = Blog.mono(11, 700);
        var tw = ctx.measureText(label).width, inside = bw > tw + 20 && bw + tw + 12 > span;
        D.text(ctx, label, inside ? padL + bw - 8 : padL + bw + 8, y + 20 + bh / 2 + 0.5,
          { font: Blog.mono(11, 700), color: inside ? Blog.inkOn(fill) : c.ink, align: inside ? 'right' : 'left' });
      });
    });

    P.controls.appendChild(Blog.segmented({
      label: 'Dataset', value: set,
      options: [{ value: 'BIGANN', label: 'BIGANN' }, { value: 'DEEP', label: 'DEEP' }],
      onChange: function (val) { set = val; retarget(); }
    }).el);
    P.controls.appendChild(Blog.segmented({
      label: 'Axis', value: scale,
      options: [{ value: 'linear', label: 'Linear axis' }, { value: 'log', label: 'Log axis' }],
      onChange: function (val) { scale = val; retarget(); }
    }).el);
    P.status.innerHTML = 'Build times for the same 1 million points, and for a history a thousand times longer.';
    /* let the bars grow when the figure first comes into view */
    Blog.inView(fig, function () { if (!started) { started = true; retarget(); } }, null, '0px');
  });
})();

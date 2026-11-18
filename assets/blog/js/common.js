/* ==========================================================================
   Blog toolkit shared by every post under /blog/.
   Exposes one global, `Blog`. No dependencies.

   Blog.theme()                    palette read from the CSS tokens in blog.css
   Blog.onTheme(fn)                fn() whenever light/dark flips
   Blog.canvas(el, draw)           HiDPI canvas that redraws on resize + theme
   Blog.loop(el, tick)             rAF loop that only runs while el is on screen
   Blog.inView(el, enter, leave)   IntersectionObserver wrapper
   Blog.pointer(el, handlers)      unified mouse/touch in CSS pixels
   Blog.keys(el, opts)             keyboard path for things you can pick on a canvas
   Blog.stepper(mount, opts)       play / pause / step / reset transport
   Blog.button / slider / segmented / checkbox   consistent controls
   Blog.tween(opts)                one-shot animation
   Blog.rng(seed)                  deterministic random numbers
   Blog.el(tag, attrs, children)   tiny DOM builder
   Blog.parts(fig)                 the standard child nodes of a figure.demo
   Blog.num(n)                     1234567 -> "1,234,567"
   Blog.inkOn(fill)                readable text color for a filled shape
   Blog.draw.*                     canvas helpers (arrow, roundRect, label, ...)
   ========================================================================== */
(function () {
  'use strict';

  var Blog = {};
  var root = document.documentElement;
  var reducedQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  Blog.reduced = !!(reducedQuery && reducedQuery.matches);

  /* ---------- math ---------- */

  Blog.clamp = function (x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; };
  Blog.lerp = function (a, b, t) { return a + (b - a) * t; };
  Blog.dist = function (ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); };

  Blog.ease = {
    linear: function (t) { return t; },
    inOut: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    out: function (t) { return 1 - Math.pow(1 - t, 3); },
    in: function (t) { return t * t * t; },
    outBack: function (t) { var c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  };

  /* mulberry32: small deterministic PRNG so every reader sees the same example */
  Blog.rng = function (seed) {
    var a = seed >>> 0;
    var next = function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.int = function (lo, hi) { return lo + Math.floor(next() * (hi - lo + 1)); };
    next.range = function (lo, hi) { return lo + next() * (hi - lo); };
    next.pick = function (arr) { return arr[Math.floor(next() * arr.length)]; };
    next.shuffle = function (arr) {
      for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(next() * (i + 1));
        var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      }
      return arr;
    };
    return next;
  };

  /* ---------- DOM ---------- */

  Blog.$ = function (sel, scope) { return (scope || document).querySelector(sel); };
  Blog.$$ = function (sel, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(sel)); };

  Blog.el = function (tag, attrs, children) {
    var node = document.createElement(tag);
    var key;
    if (attrs) {
      for (key in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, key)) continue;
        var val = attrs[key];
        if (val == null || val === false) continue;
        if (key === 'class') node.className = val;
        else if (key === 'text') node.textContent = val;
        else if (key === 'html') node.innerHTML = val;
        else if (key.slice(0, 2) === 'on' && typeof val === 'function') node.addEventListener(key.slice(2), val);
        else node.setAttribute(key, val === true ? '' : val);
      }
    }
    if (children != null) {
      (Array.isArray(children) ? children : [children]).forEach(function (child) {
        if (child == null) return;
        node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
      });
    }
    return node;
  };

  /* ---------- theme ---------- */

  var themeCache = null;
  var themeListeners = [];
  var TOKENS = {
    bg: '--b-bg', ink: '--b-ink', text: '--b-text', muted: '--b-muted', faint: '--b-faint',
    line: '--b-line', lineStrong: '--b-line-strong', panel: '--b-panel', stage: '--b-stage',
    accent: '--b-accent',
    blue: '--v-blue', orange: '--v-orange', green: '--v-green', red: '--v-red',
    purple: '--v-purple', yellow: '--v-yellow', teal: '--v-teal', pink: '--v-pink', gray: '--v-gray',
    /* the --v-* hues are for fills and strokes; small text in those hues must
       use the darker --t-* variants (identical to --v-* in the dark theme) */
    blueText: '--t-blue', orangeText: '--t-orange', greenText: '--t-green', redText: '--t-red',
    purpleText: '--t-purple', yellowText: '--t-yellow', tealText: '--t-teal', pinkText: '--t-pink',
    grayText: '--t-gray'
  };

  /* resolves var() chains by letting the browser compute a real color */
  function resolveColor(probe, cssVar) {
    probe.style.color = '';
    probe.style.color = 'var(' + cssVar + ')';
    return getComputedStyle(probe).color;
  }

  Blog.theme = function () {
    if (themeCache) return themeCache;
    var host = document.querySelector('.blog') || document.body;
    var probe = document.createElement('span');
    probe.style.display = 'none';
    host.appendChild(probe);
    var out = {}, key;
    for (key in TOKENS) out[key] = resolveColor(probe, TOKENS[key]);
    host.removeChild(probe);
    out.dark = root.getAttribute('data-theme') === 'dark';
    themeCache = out;
    return out;
  };

  Blog.onTheme = function (fn) { themeListeners.push(fn); };

  /* computed color of one CSS variable as seen from `el` (not cached) */
  Blog.colorOf = function (el, cssVar) {
    var probe = document.createElement('span');
    probe.style.display = 'none';
    el.appendChild(probe);
    var color = resolveColor(probe, cssVar);
    el.removeChild(probe);
    return color;
  };

  /* 'rgb(r, g, b)' + alpha -> 'rgba(r, g, b, a)' */
  Blog.alpha = function (color, a) {
    var m = /rgba?\(([^)]+)\)/.exec(color);
    if (!m) return color;
    var p = m[1].split(/[,\s/]+/).filter(Boolean);
    return 'rgba(' + p[0] + ', ' + p[1] + ', ' + p[2] + ', ' + a + ')';
  };

  /* mix two computed rgb() colors; t = 0 gives a, t = 1 gives b */
  Blog.mix = function (a, b, t) {
    var pa = /rgba?\(([^)]+)\)/.exec(a), pb = /rgba?\(([^)]+)\)/.exec(b);
    if (!pa || !pb) return t < 0.5 ? a : b;
    var x = pa[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    var y = pb[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return 'rgb(' + Math.round(Blog.lerp(x[0], y[0], t)) + ', ' + Math.round(Blog.lerp(x[1], y[1], t)) + ', ' + Math.round(Blog.lerp(x[2], y[2], t)) + ')';
  };

  function rgbOf(color) {
    var m = /rgba?\(([^)]+)\)/.exec(color);
    return m ? m[1].split(/[,\s/]+/).filter(Boolean).slice(0, 3).map(Number) : null;
  }

  /* relative luminance (WCAG) of a computed rgb() color */
  Blog.luminance = function (color) {
    var p = rgbOf(color);
    if (!p) return 0.5;
    var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]);
  };

  /* text color to draw on top of a filled shape: near-black on light fills,
     white on dark ones. Use it instead of c.stage for labels inside chips. */
  Blog.inkOn = function (fill) {
    /* 0.2 is roughly where near-black starts to out-contrast white */
    return Blog.luminance(fill) > 0.2 ? 'rgb(24, 26, 31)' : 'rgb(255, 255, 255)';
  };

  if (window.MutationObserver) {
    new MutationObserver(function () {
      themeCache = null;
      themeListeners.forEach(function (fn) { fn(); });
    }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  }

  /* ---------- canvas ---------- */

  /* Blog.canvas(el, draw) -> { el, ctx, w, h, redraw() }
     draw(ctx, w, h, colors) is called in CSS pixels; the backing store is
     scaled for the device pixel ratio. The canvas height comes from CSS. */
  Blog.canvas = function (el, draw) {
    var ctx = el.getContext('2d');
    var view = { el: el, ctx: ctx, w: 0, h: 0, dpr: 1 };
    var queued = false;

    function fit() {
      var rect = el.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      var w = Math.max(1, Math.round(rect.width));
      var h = Math.max(1, Math.round(rect.height));
      if (w !== view.w || h !== view.h || dpr !== view.dpr) {
        view.w = w; view.h = h; view.dpr = dpr;
        el.width = Math.round(w * dpr);
        el.height = Math.round(h * dpr);
      }
    }

    view.redraw = function () {
      fit();
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.clearRect(0, 0, view.w, view.h);
      if (draw) draw(ctx, view.w, view.h, Blog.theme());
    };

    /* coalesce many state changes in one frame into one paint */
    view.invalidate = function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; view.redraw(); });
    };

    function resized() {
      var rect = el.getBoundingClientRect();
      if (Math.round(rect.width) !== view.w || Math.round(rect.height) !== view.h) view.invalidate();
    }

    /* a canvas is opaque to assistive tech: expose it as an image named after its figure */
    if (!el.getAttribute('role')) el.setAttribute('role', 'img');
    if (!el.getAttribute('aria-label')) {
      var fig = el.closest ? el.closest('figure') : null;
      var title = fig ? fig.querySelector('.demo-head h3, .demo-title') : null;
      var pane = el.parentNode ? el.parentNode.querySelector('.demo-pane-label') : null;
      if (title) el.setAttribute('aria-label', 'Interactive figure: ' + title.textContent + (pane ? ' (' + pane.textContent + ')' : ''));
    }

    if (window.ResizeObserver) new ResizeObserver(resized).observe(el);
    else window.addEventListener('resize', resized);
    Blog.onTheme(view.invalidate);
    view.redraw();
    return view;
  };

  Blog.font = function (px, weight) {
    return (weight || 500) + ' ' + px + 'px -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  };

  Blog.mono = function (px, weight) {
    return (weight || 500) + ' ' + px + 'px ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';
  };

  Blog.draw = {
    circle: function (ctx, x, y, r, fill, stroke, lineWidth) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth || 1.5; ctx.stroke(); }
    },

    line: function (ctx, x1, y1, x2, y2, stroke, lineWidth, dash) {
      ctx.save();
      ctx.beginPath();
      if (dash) ctx.setLineDash(dash);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth || 1.5;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    },

    /* straight arrow; `shrink` pulls both ends back (e.g. a node radius) */
    arrow: function (ctx, x1, y1, x2, y2, stroke, lineWidth, shrink, head) {
      var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy) || 1;
      var ux = dx / len, uy = dy / len, s = shrink || 0, hd = head || 7;
      var ax = x1 + ux * s, ay = y1 + uy * s, bx = x2 - ux * s, by = y2 - uy * s;
      ctx.save();
      ctx.strokeStyle = stroke; ctx.fillStyle = stroke;
      ctx.lineWidth = lineWidth || 1.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx - ux * hd * 0.6, by - uy * hd * 0.6); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - ux * hd - uy * hd * 0.5, by - uy * hd + ux * hd * 0.5);
      ctx.lineTo(bx - ux * hd + uy * hd * 0.5, by - uy * hd - ux * hd * 0.5);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    },

    roundRect: function (ctx, x, y, w, h, r, fill, stroke, lineWidth) {
      var rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth || 1.5; ctx.stroke(); }
    },

    /* text with options: { font, color, align, baseline, halo (color), maxWidth } */
    text: function (ctx, str, x, y, opts) {
      opts = opts || {};
      ctx.save();
      ctx.font = opts.font || Blog.font(12);
      ctx.textAlign = opts.align || 'center';
      ctx.textBaseline = opts.baseline || 'middle';
      if (opts.halo) {
        ctx.lineWidth = opts.haloWidth || 3.5;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = opts.halo;
        ctx.strokeText(str, x, y);
      }
      ctx.fillStyle = opts.color || '#000';
      ctx.fillText(str, x, y);
      ctx.restore();
    },

    /* pill-shaped label, returns its width */
    tag: function (ctx, str, x, y, opts) {
      opts = opts || {};
      ctx.save();
      ctx.font = opts.font || Blog.font(11, 600);
      var padX = opts.padX == null ? 6 : opts.padX;
      var hgt = opts.height || 18;
      var wid = ctx.measureText(str).width + padX * 2;
      var left = opts.align === 'left' ? x : opts.align === 'right' ? x - wid : x - wid / 2;
      Blog.draw.roundRect(ctx, left, y - hgt / 2, wid, hgt, hgt / 2, opts.fill || '#000', opts.stroke, 1);
      ctx.fillStyle = opts.color || '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(str, left + wid / 2, y + 0.5);
      ctx.restore();
      return wid;
    }
  };

  /* ---------- visibility + animation loop ---------- */

  Blog.inView = function (el, onEnter, onLeave, margin) {
    if (!window.IntersectionObserver) { if (onEnter) onEnter(); return null; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { if (onEnter) onEnter(); }
        else if (onLeave) onLeave();
      });
    }, { rootMargin: margin || '80px 0px' });
    io.observe(el);
    return io;
  };

  /* Blog.loop(el, tick) -> { start, stop, active }
     tick(dt, t) in seconds; dt is clamped so a background tab does not jump.
     The loop is paused automatically while `el` is off screen. */
  Blog.loop = function (el, tick) {
    var state = { active: false, visible: false, wanted: true };
    var last = 0, elapsed = 0, raf = 0;

    function frame(now) {
      raf = 0;
      if (!state.active) return;
      /* a frame's timestamp can precede the moment the loop was started, so clamp below too */
      var dt = Blog.clamp((now - last) / 1000, 0, 0.05);
      last = now;
      elapsed += dt;
      tick(dt, elapsed);
      raf = requestAnimationFrame(frame);
    }

    function sync() {
      var should = state.wanted && state.visible && !document.hidden;
      if (should && !state.active) {
        state.active = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      } else if (!should && state.active) {
        state.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      }
    }

    state.start = function () { state.wanted = true; sync(); };
    state.stop = function () { state.wanted = false; sync(); };
    Blog.inView(el, function () { state.visible = true; sync(); }, function () { state.visible = false; sync(); });
    document.addEventListener('visibilitychange', sync);
    return state;
  };

  /* Blog.tween({ dur, ease, update(t), done() }) -> cancel()
     dur in ms. With reduced motion the tween jumps straight to the end. */
  Blog.tween = function (opts) {
    var dur = opts.dur == null ? 400 : opts.dur;
    var ease = opts.ease || Blog.ease.inOut;
    var start = 0, raf = 0, cancelled = false;
    if (Blog.reduced || dur <= 0) {
      opts.update(1);
      if (opts.done) opts.done();
      return function () {};
    }
    function frame(now) {
      if (cancelled) return;
      if (!start) start = now;
      var t = Blog.clamp((now - start) / dur, 0, 1);
      opts.update(ease(t));
      if (t < 1) raf = requestAnimationFrame(frame);
      else if (opts.done) opts.done();
    }
    raf = requestAnimationFrame(frame);
    return function () { cancelled = true; if (raf) cancelAnimationFrame(raf); };
  };

  /* ---------- pointer ---------- */

  /* Blog.pointer(el, handlers): unified mouse / touch / pen input.
     handlers: down(p, ev), move(p, ev), up(p, ev), hover(p, ev), leave(), grab(p)
     p = { x, y } in CSS pixels relative to the element. A drag keeps reporting
     `move` even when the pointer leaves the element.

     Touch rules, so that a figure never hijacks scrolling:
     - If the canvas lets the page pan (touch-action other than `none`), a touch
       is only delivered once it is clearly meant for the figure: a tap
       (down + up at release, under 10px of travel) or a mostly horizontal drag
       (down at the start point, then moves). A vertical swipe scrolls the page
       and the figure hears nothing.
     - `grab(p)` (optional) is asked at touchstart; return true when p is on
       something draggable (a point, a handle). That gesture then belongs to the
       figure in every direction and the page does not scroll. Use this instead
       of `touch-action: none` on the whole canvas.
     - `leave` only fires for a mouse, so a tap selection stays after the finger lifts. */
  Blog.pointer = function (el, handlers) {
    var dragging = false, pending = null, grabbed = false;

    function at(x, y) {
      var rect = el.getBoundingClientRect();
      return { x: x - rect.left, y: y - rect.top };
    }
    function pos(ev) { return at(ev.clientX, ev.clientY); }

    function begin(p, ev) {
      dragging = true;
      if (el.setPointerCapture) { try { el.setPointerCapture(ev.pointerId); } catch (err) { /* ignore */ } }
      if (handlers.down) handlers.down(p, ev);
    }
    function finish(p, ev) {
      if (!dragging) return;
      dragging = false;
      if (handlers.up) handlers.up(p, ev);
    }

    if (handlers.grab) {
      el.addEventListener('touchstart', function (ev) {
        /* preventDefault here is what keeps the page from scrolling during the drag */
        var t = ev.changedTouches && ev.changedTouches[0];
        if (t && handlers.grab(at(t.clientX, t.clientY)) && ev.cancelable) ev.preventDefault();
      }, { passive: false });
    }

    el.addEventListener('pointerdown', function (ev) {
      if (ev.button != null && ev.button > 0) return;
      var p = pos(ev);
      /* for touch, pointerdown arrives before touchstart, so ask `grab` here as well */
      if (ev.pointerType === 'touch' && handlers.grab) grabbed = !!handlers.grab(p);
      var pans = ev.pointerType === 'touch' && !grabbed && getComputedStyle(el).touchAction !== 'none';
      if (pans) { pending = { id: ev.pointerId, x: p.x, y: p.y }; return; }
      begin(p, ev);
    });

    el.addEventListener('pointermove', function (ev) {
      var p = pos(ev);
      if (pending && ev.pointerId === pending.id) {
        var dx = p.x - pending.x, dy = p.y - pending.y;
        var sideways = Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2;
        /* a clearly diagonal drag also belongs to the figure; a mostly vertical one never
           does, because the browser may deliver a few moves before it cancels to scroll */
        var diagonal = Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy) * 0.7;
        if (sideways || diagonal) {
          var from = { x: pending.x, y: pending.y };
          pending = null;
          begin(from, ev);
          if (handlers.move) handlers.move(p, ev);
        }
        return;
      }
      if (dragging) { if (handlers.move) handlers.move(p, ev); }
      else if (handlers.hover) handlers.hover(p, ev);
    });

    el.addEventListener('pointerup', function (ev) {
      var p = pos(ev);
      grabbed = false;
      if (pending && ev.pointerId === pending.id) {
        var travelled = Blog.dist(p.x, p.y, pending.x, pending.y);
        pending = null;
        if (travelled <= 10) { begin(p, ev); finish(p, ev); }
        return;
      }
      finish(p, ev);
    });

    el.addEventListener('pointercancel', function (ev) {
      grabbed = false;
      if (pending) { pending = null; return; }   /* the browser took it as a scroll */
      finish(pos(ev), ev);
    });

    el.addEventListener('pointerleave', function (ev) {
      if (ev.pointerType && ev.pointerType !== 'mouse') return;
      if (!dragging && handlers.leave) handlers.leave();
    });
  };

  /* Blog.keys(el, opts) -> { index(), set(i), clear() }
     Keyboard path for a canvas whose content can be picked with the pointer.
     opts.points()        -> [{ x, y, label }]  everything pickable right now (CSS px)
     opts.move(i, point)  called when the keyboard cursor lands on a point, and with
                          (-1, null) when it leaves; draw a focus ring there and/or
                          update the status line, exactly as a hover would
     opts.pick(i, point)  Enter or Space: do what a click on that point does
     Arrow keys jump to the nearest point in that direction, Home/End to the first
     and last point, Escape clears. The point's label is announced to screen readers. */
  Blog.keys = function (el, opts) {
    var index = -1;
    var live = Blog.el('span', { class: 'b-sr', 'aria-live': 'polite' });
    if (el.parentNode) el.parentNode.appendChild(live);
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'application');
    if (!el.getAttribute('aria-roledescription')) el.setAttribute('aria-roledescription', 'interactive figure');

    function go(i) {
      var pts = opts.points();
      index = pts.length ? Blog.clamp(i, 0, pts.length - 1) : -1;
      live.textContent = index >= 0 ? (pts[index].label || '') : '';
      if (opts.move) opts.move(index, index >= 0 ? pts[index] : null);
    }

    function toward(dx, dy) {
      var pts = opts.points();
      if (!pts.length) return;
      if (index < 0 || index >= pts.length) { go(0); return; }
      var from = pts[index], best = -1, bestCost = Infinity;
      pts.forEach(function (pt, i) {
        if (i === index) return;
        var along = (pt.x - from.x) * dx + (pt.y - from.y) * dy;
        var across = Math.abs((pt.x - from.x) * dy - (pt.y - from.y) * dx);
        if (along <= 0.5) return;
        var cost = along + 2.5 * across;       /* prefer points straight ahead */
        if (cost < bestCost) { bestCost = cost; best = i; }
      });
      if (best >= 0) go(best);
    }

    el.addEventListener('keydown', function (ev) {
      var key = ev.key;
      if (key === 'ArrowRight') toward(1, 0);
      else if (key === 'ArrowLeft') toward(-1, 0);
      else if (key === 'ArrowDown') toward(0, 1);
      else if (key === 'ArrowUp') toward(0, -1);
      else if (key === 'Home') go(0);
      else if (key === 'End') go(opts.points().length - 1);
      else if (key === 'Escape') { index = -1; live.textContent = ''; if (opts.move) opts.move(-1, null); }
      else if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
        var pts = opts.points();
        if (index < 0 && pts.length) go(0);
        else if (index >= 0 && index < pts.length && opts.pick) {
          opts.pick(index, pts[index]);
          var after = opts.points();              /* the pick may have changed what exists */
          if (index >= after.length) index = after.length - 1;
          live.textContent = index >= 0 && after[index] ? (after[index].label || '') : '';
        }
      } else return;
      ev.preventDefault();
    });
    el.addEventListener('focus', function () {
      if (el.matches && !el.matches(':focus-visible')) return;   /* mouse focus: no cursor */
      if (index < 0) go(0);
    });
    el.addEventListener('blur', function () {
      if (index < 0) return;
      index = -1;
      if (opts.move) opts.move(-1, null);
    });

    return {
      index: function () { return index; },
      set: function (i) { go(i); },
      clear: function () { index = -1; live.textContent = ''; }
    };
  };

  /* ---------- controls ---------- */

  Blog.button = function (label, onClick, opts) {
    opts = opts || {};
    var cls = 'b-btn' + (opts.primary ? ' primary' : '') + (opts.icon ? ' icon' : '');
    var btn = Blog.el('button', { type: 'button', class: cls, text: label, title: opts.title, 'aria-label': opts.title });
    if (onClick) btn.addEventListener('click', onClick);
    return btn;
  };

  /* Blog.slider({ label, min, max, step, value, format, onInput }) -> { el, input, get, set } */
  Blog.slider = function (opts) {
    var format = opts.format || function (v) { return String(v); };
    var input = Blog.el('input', {
      type: 'range', class: 'b-range', min: opts.min, max: opts.max,
      step: opts.step == null ? 1 : opts.step, value: opts.value, 'aria-label': opts.label
    });
    var out = Blog.el('output', { text: format(Number(opts.value)) });
    var wrap = Blog.el('label', { class: 'b-field' }, [Blog.el('span', { text: opts.label }), out, input]);
    input.addEventListener('input', function () {
      var v = Number(input.value);
      out.textContent = format(v);
      if (opts.onInput) opts.onInput(v);
    });
    return {
      el: wrap,
      input: input,
      get: function () { return Number(input.value); },
      set: function (v, silent) {
        input.value = v;
        out.textContent = format(Number(input.value));
        if (!silent && opts.onInput) opts.onInput(Number(input.value));
      }
    };
  };

  /* Blog.segmented({ options: [{ value, label }], value, onChange, label }) -> { el, get, set } */
  Blog.segmented = function (opts) {
    var current = opts.value;
    var wrap = Blog.el('div', { class: 'b-seg', role: 'group', 'aria-label': opts.label });
    var buttons = opts.options.map(function (opt) {
      var btn = Blog.el('button', { type: 'button', text: opt.label, 'aria-pressed': String(opt.value === current) });
      btn.addEventListener('click', function () { api.set(opt.value); });
      wrap.appendChild(btn);
      return btn;
    });
    var api = {
      el: wrap,
      get: function () { return current; },
      set: function (value, silent) {
        if (value === current) return;
        current = value;
        opts.options.forEach(function (opt, i) { buttons[i].setAttribute('aria-pressed', String(opt.value === current)); });
        if (!silent && opts.onChange) opts.onChange(current);
      }
    };
    return api;
  };

  Blog.checkbox = function (label, checked, onChange) {
    var input = Blog.el('input', { type: 'checkbox' });
    input.checked = !!checked;
    var wrap = Blog.el('label', { class: 'b-check' }, [input, Blog.el('span', { text: label })]);
    input.addEventListener('change', function () { if (onChange) onChange(input.checked); });
    return { el: wrap, input: input, get: function () { return input.checked; }, set: function (v) { input.checked = !!v; } };
  };

  /* Blog.stepper(mount, opts) -> { play, pause, toggle, reset, next, prev, go, index, playing }
     A transport bar for step-by-step algorithm animations.
     opts: {
       total: number | function -> number of steps (index runs 0..total),
       onStep(index, dir): render state `index`,
       interval: ms between steps while playing (default 900),
       loop: restart from 0 after the end (default false),
       autoplay: start playing when first scrolled into view (default false),
       speeds: true to add a speed switch,
       labels: { play, pause } }
     Appends its buttons to `mount`; add your own controls to the same bar. */
  Blog.stepper = function (mount, opts) {
    var index = 0, timer = 0, playing = false, speed = 1, autoplayed = false;
    var total = function () { return typeof opts.total === 'function' ? opts.total() : opts.total; };
    var labels = opts.labels || {};
    var playLabel = labels.play || '▶ Play', pauseLabel = labels.pause || '❚❚ Pause';

    /* a leading symbol is decoration: keep it out of the button's accessible name */
    function setLabel(btn, label) {
      var m = /^([^A-Za-z0-9]+)\s+(.*)$/.exec(label);
      btn.textContent = '';
      if (m) {
        btn.appendChild(Blog.el('span', { 'aria-hidden': 'true', text: m[1] }));
        btn.appendChild(document.createTextNode(' ' + m[2]));
      } else btn.textContent = label;
    }

    var playBtn = Blog.button(playLabel, function () { api.toggle(); }, { primary: true });
    var prevBtn = Blog.button('←', function () { api.pause(); api.prev(); }, { icon: true, title: 'Previous step' });
    var nextBtn = Blog.button('→', function () { api.pause(); api.next(); }, { icon: true, title: 'Next step' });
    var resetBtn = Blog.button('Reset', function () { api.reset(); });
    var counter = Blog.el('span', { class: 'b-field' });
    playBtn.style.minWidth = '6.2em';
    [playBtn, prevBtn, nextBtn, resetBtn, counter].forEach(function (node) { mount.appendChild(node); });

    var speedSeg = null;
    if (opts.speeds) {
      speedSeg = Blog.segmented({
        label: 'Speed',
        value: 1,
        options: [{ value: 0.5, label: '0.5×' }, { value: 1, label: '1×' }, { value: 2, label: '2×' }],
        onChange: function (v) { speed = v; if (playing) { clearTimeout(timer); schedule(); } }
      });
      mount.appendChild(speedSeg.el);
    }

    function render(dir) {
      var n = total();
      prevBtn.disabled = index <= 0;
      nextBtn.disabled = index >= n;
      counter.textContent = 'Step ' + index + ' / ' + n;
      setLabel(playBtn, playing ? pauseLabel : (index >= n ? '↻ Replay' : playLabel));
      opts.onStep(index, dir || 0);
    }

    function schedule() {
      var wait = (opts.interval || 900) / speed;
      timer = setTimeout(function () {
        if (!playing) return;
        if (index >= total()) {
          if (opts.loop) { index = 0; render(-1); schedule(); }
          else api.pause();
          return;
        }
        index += 1;
        render(1);
        if (index >= total() && !opts.loop) api.pause(); else schedule();
      }, wait);
    }

    var api = {
      play: function () {
        if (playing) return;
        if (index >= total()) index = 0;
        playing = true;
        render(0);
        schedule();
      },
      pause: function () {
        if (!playing) return;
        playing = false;
        clearTimeout(timer);
        render(0);
      },
      toggle: function () { if (playing) api.pause(); else api.play(); },
      next: function () { if (index < total()) { index += 1; render(1); } },
      prev: function () { if (index > 0) { index -= 1; render(-1); } },
      go: function (i) { index = Blog.clamp(i, 0, total()); render(0); },
      reset: function () { api.pause(); index = 0; render(-1); if (opts.onReset) opts.onReset(); },
      refresh: function () { index = Blog.clamp(index, 0, total()); render(0); },
      index: function () { return index; },
      playing: function () { return playing; }
    };

    render(0);

    /* stop burning cycles once the whole figure (not just this bar) has scrolled away */
    Blog.inView((mount.closest && mount.closest('figure')) || mount, function () {
      if (opts.autoplay && !autoplayed && !Blog.reduced) { autoplayed = true; api.play(); }
    }, function () { api.pause(); }, '0px');

    return api;
  };

  /* ---------- page chrome: progress bar, reveal, table of contents ---------- */

  function initProgress() {
    var bar = document.querySelector('.blog-progress > span');
    if (!bar) return;
    var ticking = false;
    function update() {
      ticking = false;
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (max > 0 ? Blog.clamp(window.scrollY / max, 0, 1) : 0) + ')';
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  function initReveal() {
    var host = document.querySelector('.blog');
    if (!host || !window.IntersectionObserver || Blog.reduced) return;
    var items = Blog.$$('[data-reveal]', host);
    if (!items.length) return;
    host.classList.add('js-reveal');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    items.forEach(function (item) { io.observe(item); });
  }

  function initToc() {
    var toc = document.querySelector('.blog-toc');
    if (!toc) return;
    var sections = Blog.$$('.blog-body > section[id]');
    if (sections.length < 2) return;
    var links = sections.map(function (sec) {
      var heading = sec.querySelector('h2');
      var label = sec.getAttribute('data-toc') || (heading ? heading.textContent.replace(/^\s*\d+\s*/, '') : sec.id);
      var num = heading ? heading.querySelector('.num') : null;
      if (num && heading && !sec.getAttribute('data-toc')) {
        label = heading.textContent.replace(num.textContent, '').trim();
      }
      var link = Blog.el('a', { href: '#' + sec.id, text: label });
      toc.appendChild(link);
      return link;
    });
    if (!window.IntersectionObserver) return;
    var current = -1;
    function mark() {
      var best = 0, line = window.innerHeight * 0.3;
      sections.forEach(function (sec, i) { if (sec.getBoundingClientRect().top <= line) best = i; });
      if (best === current) return;
      current = best;
      links.forEach(function (link, i) { link.classList.toggle('active', i === best); });
    }
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(function () { ticking = false; mark(); }); }
    }, { passive: true });
    mark();
  }

  /* run `fn` now if the DOM is parsed, otherwise when it is */
  Blog.ready = function (fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  };

  /* the standard children of a figure.demo */
  Blog.parts = function (fig) {
    return {
      canvas: fig.querySelector('canvas'),
      canvases: Blog.$$('canvas', fig),
      status: fig.querySelector('.demo-status'),
      readout: fig.querySelector('.demo-readout'),
      legend: fig.querySelector('.demo-legend'),
      controls: fig.querySelector('.demo-controls')
    };
  };

  /* 1234567 -> "1,234,567" */
  Blog.num = function (n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  /* one shared answer to "is this canvas too narrow for the roomy layout?" */
  Blog.compact = function (w) { return w < 560; };

  /* Each demo registers itself: Blog.demo('demo-id', function (figure) { ... }).
     A broken demo must never take the rest of the page down with it; the
     figure is marked so the stylesheet can say so instead of showing a blank box. */
  Blog.demo = function (id, init) {
    Blog.ready(function () {
      var figure = document.getElementById(id);
      if (!figure) return;
      var status = figure.querySelector('.demo-status');
      var readout = figure.querySelector('.demo-readout');
      if (status && !status.getAttribute('aria-live')) status.setAttribute('aria-live', 'polite');
      if (!status && readout && !readout.getAttribute('aria-live')) readout.setAttribute('aria-live', 'polite');
      try {
        init(figure);
        figure.classList.add('is-ready');
      } catch (err) {
        figure.classList.add('is-failed');
        if (window.console) console.error('[blog] demo "' + id + '" failed:', err);
      }
    });
  };

  /* a table wider than its wrapper scrolls sideways: make that reachable by keyboard */
  function initTables() {
    var wraps = Blog.$$('.blog .table-scroll');
    if (!wraps.length) return;
    function check() {
      wraps.forEach(function (wrap) {
        if (wrap.scrollWidth > wrap.clientWidth + 1) {
          wrap.setAttribute('tabindex', '0');
          wrap.setAttribute('role', 'region');
          if (!wrap.getAttribute('aria-label')) wrap.setAttribute('aria-label', 'Table, scrolls sideways');
        } else {
          wrap.removeAttribute('tabindex');
        }
      });
    }
    check();
    window.addEventListener('resize', check);
  }

  Blog.ready(function () {
    initProgress();
    initReveal();
    initToc();
    initTables();
  });

  if (reducedQuery && reducedQuery.addEventListener) {
    reducedQuery.addEventListener('change', function (ev) { Blog.reduced = ev.matches; });
  }

  window.Blog = Blog;
})();

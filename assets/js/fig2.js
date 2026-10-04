/* PACER project page — Fig. 2, the PACER pipeline, as an animated vector figure.

   The inline <svg class="fig2__svg"> in index.html is generated from the paper's figure PDF
   by _dev/tools/extract_fig2.py and is the complete, static figure (what readers without
   JavaScript or with prefers-reduced-motion see). This script animates it once when it
   scrolls into view (≈ 11 s, calm and eased), with play/pause and replay, and links it to
   the five step buttons under the figure:

     01 Collect & label   collect   tokens leave the setup along the five process arrows
     02 Gate              gate      corrections, successes and near traces pass the green gate;
                                    offsets and wrong-region tokens stop in the red Audit cell
                                    and stay there (gated to zero weight, kept for audit)
     03 Process evidence  chunks    passing tokens break into action chunks; histogram bars grow
                          evidence  the five evidence chips light in turn as chunks are read
     04 Bounded weight    weight    eta -> s_eta -> score-to-weight transform; a weight in [0, w_max]
     05 Train & select    train     the weighted native loss pulses, the network's edges draw,
                                    the validation score J_val(eta) appears

   state(t) is a pure function of time (progress values only; the geometry comes from the
   SVG), and control(c, action) is a pure reducer for the player, so both are unit-tested in
   node (_dev/tests/fig2.test.js). The DOM side (mount) only maps them onto the SVG.

   Printing (beforeprint) finishes the figure: complete, nothing pinned, no focus wash. If
   mount or a frame throws, the SVG is put back exactly as index.html shipped it (the complete
   static figure), the controls hide and the steps go inert.

   Classic script (no ES modules, no fetch) so the page works from file://; it also loads in
   node (module.exports at the bottom). main.js calls PACERFig2.mount(figure, steps, opts);
   PACERFig2.finish() completes the mounted figure (screenshots).
*/
var PACERFig2 = (function () {
  "use strict";

  var DURATION = 10.8;
  var MAX_DT = 0.1;          // a stalled frame never skips more than this
  var DIM = 0.22;            // opacity of a box before its phase has reached it
  var WASH = 0.6;            // opacity of the paper wash over the columns outside a step's focus

  var PHASES = [
    { id: "collect", t0: 0, t1: 2.0 },
    { id: "gate", t0: 2.0, t1: 3.8 },
    { id: "chunks", t0: 3.8, t1: 5.6 },
    { id: "evidence", t0: 5.6, t1: 7.4 },
    { id: "weight", t0: 7.4, t1: 9.0 },
    { id: "train", t0: 9.0, t1: DURATION }
  ];
  var STEPS = [
    { id: "collect", phases: ["collect"], cols: ["setup", "processes"] },
    { id: "gate", phases: ["gate"], cols: ["gate"] },
    { id: "evidence", phases: ["chunks", "evidence"], cols: ["chunk", "evidence"] },
    { id: "weight", phases: ["weight"], cols: ["weight"] },
    { id: "train", phases: ["train"], cols: ["training"] }
  ];
  var TRACES = [
    { id: "corr", fate: "pass" }, { id: "success", fate: "pass" }, { id: "near", fate: "pass" },
    { id: "offsets", fate: "audit" }, { id: "wrong", fate: "audit" }
  ];
  var PASS = ["corr", "success", "near"];
  var AUDIT = ["offsets", "wrong"];

  /* ------------------------------------------------------------ timing */

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function ramp(t, a, b) { return clamp01((t - a) / (b - a)); }
  function easeInOut(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function easeOut(x) { return 1 - Math.pow(1 - x, 3); }
  function bump(t, a, b) {
    var x = ramp(t, a, b);
    return x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x);
  }
  // One progress p spread over n items in order: item i starts at spread * i / (n - 1).
  function stagger(p, i, n, spread) {
    var s = spread === undefined ? 0.6 : spread;
    var start = n > 1 ? s * i / (n - 1) : 0;
    return clamp01((p - start) / (1 - s));
  }

  function phaseAt(t) {
    if (t >= DURATION) return -1;
    for (var i = 0; i < PHASES.length; i++) if (t < PHASES[i].t1) return i;
    return -1;
  }
  function stepAt(t) {
    var i = phaseAt(t);
    if (i < 0) return -1;
    for (var k = 0; k < STEPS.length; k++) if (STEPS[k].phases.indexOf(PHASES[i].id) >= 0) return k;
    return -1;
  }
  function phase(id) { for (var i = 0; i < PHASES.length; i++) if (PHASES[i].id === id) return PHASES[i]; return null; }
  function stepRange(k) {
    var ps = STEPS[k].phases;
    return [phase(ps[0]).t0, phase(ps[ps.length - 1]).t1];
  }

  /* ------------------------------------------------------------- state */

  // Every token: at = hidden | setup | arrow | gate | audit | chunk, on route leg
  // "collect" (photo -> process arrow tip) or "gate" (arrow tip -> gate exit / Audit cell).
  function token(t, i, fate) {
    var appear = 0.15 + 0.06 * i;
    var go = 0.35 + 0.06 * i;
    var s = { at: "hidden", leg: null, u: 0, o: 0, s: 0 };
    if (t < appear) return s;
    s.o = easeOut(ramp(t, appear, appear + 0.3));
    s.s = easeOut(ramp(t, appear, appear + 0.35));
    s.leg = "collect";
    s.at = t < go ? "setup" : "arrow";
    s.u = easeInOut(ramp(t, go, go + 1.4));
    var g0, g1;
    if (fate === "pass") { g0 = 2.05 + 0.1 * i; g1 = g0 + 1.2; } else { g0 = 2.2 + 0.12 * (i - 3); g1 = g0 + 1.15; }
    if (t < g0) return s;
    s.leg = "gate";
    s.at = "gate";
    s.u = fate === "pass" ? easeInOut(ramp(t, g0, g1)) : easeOut(ramp(t, g0, g1));
    if (fate === "audit") {
      if (s.u >= 1) s.at = "audit";
      return s;
    }
    var split = 3.85 + 0.18 * i;
    if (t >= split) {
      s.at = "chunk";
      s.o = 1 - ramp(t, split, split + 0.2);
    }
    return s;
  }

  function state(time) {
    var t = time < 0 ? 0 : time > DURATION ? DURATION : time;
    var pi = phaseAt(t);
    var si = stepAt(t);
    var out = {
      t: t, phase: pi < 0 ? null : PHASES[pi].id, step: si < 0 ? null : si,
      tokens: {}, chunks: {}, bars: {}, read: null, chips: [], flash: null, weight: null, train: null
    };
    TRACES.forEach(function (tr, i) { out.tokens[tr.id] = token(t, i, tr.fate); });

    // chunks: each passing token breaks into five chunks that fly to its histogram's bars
    PASS.forEach(function (id, p) {
      var split = 3.85 + 0.18 * p;
      out.chunks[id] = [];
      out.bars[id] = [];
      for (var k = 0; k < 5; k++) {
        var c0 = split + 0.05 * k;
        var bar = easeOut(ramp(t, split + 0.5 + 0.07 * k, split + 1.0 + 0.07 * k));
        out.bars[id].push(bar);
        out.chunks[id].push({ u: easeInOut(ramp(t, c0, c0 + 0.55)), o: ramp(t, c0, c0 + 0.1) * (1 - bar) });
      }
    });

    // evidence: a read head sweeps the chunks while the chips light in turn
    out.read = { u: ramp(t, 5.7, 7.1), o: ramp(t, 5.6, 5.75) * (1 - ramp(t, 7.1, 7.3)) };
    for (var k = 0; k < 5; k++) {
      var c = 5.8 + 0.3 * k;
      out.chips.push({ lit: easeOut(ramp(t, c, c + 0.25)), pop: bump(t, c, c + 0.4) });
    }
    out.flash = { pass: bump(t, 2.5, 3.5), audit: bump(t, 3.1, 3.75) };

    out.weight = {
      eta: easeOut(ramp(t, 7.45, 7.7)),
      a0: easeInOut(ramp(t, 7.7, 7.95)),
      score: easeOut(ramp(t, 7.95, 8.2)),
      a1: easeInOut(ramp(t, 8.2, 8.45)),
      transform: easeOut(ramp(t, 8.45, 8.7)),
      gauge: ramp(t, 8.6, 8.75),
      fill: easeOut(ramp(t, 8.7, 8.98))      // a share of the bar between 0 and w_max
    };

    function ripple(a, b) {
      var u = ramp(t, a, b);
      return { u: u, o: u > 0 && u < 1 ? 0.9 * (1 - u) : 0 };
    }
    out.train = {
      loss: easeOut(ramp(t, 9.05, 9.3)),
      ripple: [ripple(9.25, 9.95), ripple(9.6, 10.3)],
      nodes: easeOut(ramp(t, 9.2, 9.5)),
      edges: ramp(t, 9.35, 10.15),
      val: easeOut(ramp(t, 10.05, 10.3)),
      jval: easeOut(ramp(t, 10.25, 10.7))
    };
    return out;
  }

  /* -------------------------------------------------------- controller */

  // c = {t, playing, until, pinned, started, reduced}. A pinned step plays its own phases
  // and holds at their end; without a pin the player runs to the end of the figure.
  function initial(opts) {
    var reduced = !!(opts && opts.reduced);
    return { t: reduced ? DURATION : 0, playing: false, until: DURATION, pinned: null, started: false, reduced: reduced };
  }

  function copy(c) {
    return { t: c.t, playing: c.playing, until: c.until, pinned: c.pinned, started: c.started, reduced: c.reduced };
  }

  function playAll(n, from) {
    n.started = true;
    n.t = from;
    n.playing = true;
    n.until = DURATION;
    n.pinned = null;
    return n;
  }

  function control(c, a) {
    var n = copy(c);
    switch (a.type) {
      case "view":                                   // first time in view: autoplay once
        if (c.started || c.reduced) return c;
        return playAll(n, 0);
      case "tick":
        if (!c.playing) return c;
        n.t = Math.min(c.until, c.t + Math.min(Math.max(a.dt || 0, 0), MAX_DT));
        if (n.t >= c.until) n.playing = false;
        return n;
      case "toggle":
        if (c.reduced) return c;
        if (c.playing) { n.playing = false; n.started = true; return n; }
        return playAll(n, c.t >= DURATION ? 0 : c.t);
      case "pause":
        if (!c.playing) return c;
        n.playing = false;
        return n;
      case "replay":
        if (c.reduced) return c;
        return playAll(n, 0);
      case "seek":
        if (c.reduced) return c;
        n.started = true;
        n.t = Math.max(0, Math.min(DURATION, a.t));
        n.pinned = null;
        n.until = DURATION;
        if (n.t >= DURATION) n.playing = false;
        return n;
      case "finish":                                 // print, screenshots: the complete figure, unpinned
        n.started = true; n.t = DURATION; n.playing = false; n.until = DURATION; n.pinned = null;
        return n;
      case "step":
        n.started = true;
        if (c.reduced) { n.pinned = c.pinned === a.k ? null : a.k; return n; }
        if (c.pinned === a.k) {                    // second click: back to the complete figure
          n.pinned = null; n.playing = false; n.t = DURATION; n.until = DURATION;
          return n;
        }
        var r = stepRange(a.k);
        n.pinned = a.k;
        n.until = r[1];
        if (c.playing && c.pinned === null && stepAt(c.t) === a.k) return n;   // already in it: hold at its end
        n.t = r[0];
        n.playing = true;
        return n;
      default:
        return c;
    }
  }

  // The step button that shows as pressed: the pinned step, else the playing (or paused) phase's.
  function pressed(c) {
    if (c.pinned !== null) return c.pinned;
    if (c.reduced || !c.started || c.t >= DURATION) return null;
    var k = stepAt(c.t);
    return k < 0 ? null : k;
  }

  /* --------------------------------------------------------------- DOM */

  var active = null;

  function f2(v) { return String(Math.round(v * 100) / 100); }

  function setOpacity(el, o) {
    if (o >= 1) el.removeAttribute("opacity");
    else el.setAttribute("opacity", f2(Math.max(0, o)));
  }

  function scaleAbout(el, k, cx, cy) {
    if (Math.abs(k - 1) < 1e-4) el.removeAttribute("transform");
    else el.setAttribute("transform", "matrix(" + [f2(k), 0, 0, f2(k), f2(cx * (1 - k)), f2(cy * (1 - k))].join(" ") + ")");
  }

  function draw(el, len, p) {
    if (p >= 1) { el.removeAttribute("stroke-dasharray"); el.removeAttribute("stroke-dashoffset"); return; }
    el.setAttribute("stroke-dasharray", f2(len) + " " + f2(len + 1));
    el.setAttribute("stroke-dashoffset", f2(len * (1 - p)));
  }

  // If anything in mount or in a frame throws, the SVG is put back exactly as index.html
  // shipped it (the complete static figure), the controls hide and the steps go inert.
  function mount(fig, steps, opts) {
    var svg = fig && fig.querySelector(".fig2__svg");
    if (!svg) return null;
    var win = fig.ownerDocument.defaultView;
    var pristine = svg.cloneNode(true);
    var controls = fig.querySelector(".fig2__controls");
    var guard = { broken: false, stop: null };
    guard.fail = function (err) {
      if (guard.broken) return;
      guard.broken = true;
      if (guard.stop) guard.stop();
      var live = fig.querySelector(".fig2__svg");
      if (live && live.parentNode) live.parentNode.replaceChild(pristine.cloneNode(true), live);
      if (controls) controls.hidden = true;
      steps.forEach(function (s) { s.setAttribute("aria-pressed", "false"); });
      if (win.console) win.console.error("PACERFig2: animation off, showing the static figure:", err);
    };
    try {
      return player(fig, svg, steps, opts || {}, guard);
    } catch (err) {
      guard.fail(err);
      return null;
    }
  }

  function player(fig, svg, steps, opts, guard) {
    var doc = fig.ownerDocument;
    var win = doc.defaultView;
    var reduced = !!opts.reduceMotion;
    var hasIO = "IntersectionObserver" in win;
    var scroller = fig.querySelector(".fig2__scroll");
    var controls = fig.querySelector(".fig2__controls");
    var toggleBtn = controls && controls.querySelector('[data-fig2="toggle"]');
    var replayBtn = controls && controls.querySelector('[data-fig2="replay"]');
    var vb = svg.viewBox.baseVal;
    var W = vb.width, H = vb.height;
    function q(sel) { return svg.querySelector(sel); }
    function qa(sel) { return Array.prototype.slice.call(svg.querySelectorAll(sel)); }
    function num(el, a) { return parseFloat(el.getAttribute(a)); }

    /* geometry, read once from the generated SVG */
    var g = { tokens: {}, routes: {}, chunks: {}, bars: {}, chips: [], boxes: {}, warrows: [], edges: [], cols: {} };
    g.rest = {};
    TRACES.forEach(function (tr) {
      var id = tr.id;
      g.tokens[id] = q('.f2-token[data-trace="' + id + '"]');
      g.rest[id] = q('.f2-rest[data-trace="' + id + '"]');
      g.routes[id] = {};
      ["collect", "gate"].forEach(function (leg) {
        var p = q('.f2-route[data-trace="' + id + '"][data-leg="' + leg + '"]');
        g.routes[id][leg] = { el: p, len: p.getTotalLength() };
      });
    });
    PASS.forEach(function (id) {
      var gate = g.routes[id].gate;
      var from = gate.el.getPointAtLength(gate.len);
      g.chunks[id] = [];
      g.bars[id] = qa('.f2-hist[data-trace="' + id + '"] .f2-bar').map(function (b, k) {
        var r = { el: b, y: num(b, "y"), h: num(b, "height"), x: num(b, "x"), w: num(b, "width") };
        var c = q('.f2-chunk[data-trace="' + id + '"][data-bar="' + k + '"]');
        var size = num(c, "width");
        g.chunks[id].push({ el: c, x0: from.x - size / 2, y0: from.y - size / 2,
                            x1: r.x + r.w / 2 - size / 2, y1: r.y + r.h - size - 0.6 });
        return r;
      });
    });
    var read = q(".f2-read");
    var readX = [num(read, "data-from"), num(read, "data-to")];
    qa(".f2-chip").forEach(function (el) {
      var r = el.querySelector("rect");
      g.chips.push({ el: el, cx: num(r, "x") + num(r, "width") / 2, cy: num(r, "y") + num(r, "height") / 2 });
    });
    ["eta", "score", "transform", "loss", "val"].forEach(function (k) { g.boxes[k] = q('.f2-box[data-box="' + k + '"]'); });
    qa(".f2-warrow").forEach(function (el) {
      var line = el.querySelector("line");
      g.warrows.push({ line: line, head: el.querySelector(".f2-warrow__head"), len: num(line, "y2") - num(line, "y1") });
    });
    var gauge = q(".f2-gauge"), gaugeFill = q(".f2-gauge__fill"), gaugeW = num(gaugeFill, "data-w");
    var ripple = q(".f2-ripple");
    var rippleC = [num(ripple, "x") + num(ripple, "width") / 2, num(ripple, "y") + num(ripple, "height") / 2];
    var nodes = q(".f2-nodes");
    qa(".f2-edge").forEach(function (el) { g.edges.push({ el: el, len: el.getTotalLength() }); });
    var jval = q(".f2-jval");
    var flash = { pass: q('.f2-flash[data-flash="pass"]'), audit: q('.f2-flash[data-flash="audit"]') };
    var wash = q(".f2-wash"), hl = q(".f2-hl");
    qa(".f2-col").forEach(function (el) {
      var b = el.getBBox();
      g.cols[el.getAttribute("data-col")] = [b.x, b.x + b.width];
    });
    // labels the tokens pass behind sit above the wash: they fade with their column instead
    var over = qa(".f2-over > [data-col]").map(function (el) { return { el: el, span: g.cols[el.getAttribute("data-col")] }; });

    /* state -> SVG */
    function apply(s) {
      TRACES.forEach(function (tr) {
        var tk = s.tokens[tr.id], el = g.tokens[tr.id];
        if (tk.leg) {
          var route = g.routes[tr.id][tk.leg];
          var p = route.el.getPointAtLength(route.len * tk.u);
          el.setAttribute("cx", f2(p.x));
          el.setAttribute("cy", f2(p.y));
        }
        el.setAttribute("r", f2(2.4 * Math.max(tk.s, 0.01)));
        // a gated token that has settled is handed to its resting dot in the Audit cell
        var rest = g.rest[tr.id], settled = tk.at === "audit";
        el.setAttribute("opacity", f2(settled ? 0 : tk.o));
        if (rest) setOpacity(rest, settled ? tk.o : 0);
      });
      PASS.forEach(function (id) {
        s.chunks[id].forEach(function (c, k) {
          var ch = g.chunks[id][k];
          ch.el.setAttribute("x", f2(ch.x0 + (ch.x1 - ch.x0) * c.u));
          ch.el.setAttribute("y", f2(ch.y0 + (ch.y1 - ch.y0) * c.u - 3 * Math.sin(Math.PI * c.u)));
          ch.el.setAttribute("opacity", f2(c.o));
        });
        s.bars[id].forEach(function (v, k) {
          var b = g.bars[id][k];
          b.el.setAttribute("y", f2(b.y + b.h * (1 - v)));
          b.el.setAttribute("height", f2(b.h * v));
          setOpacity(b.el, v > 0.001 ? 1 : 0);
        });
      });
      var rx = readX[0] + (readX[1] - readX[0]) * s.read.u;
      read.setAttribute("x1", f2(rx));
      read.setAttribute("x2", f2(rx));
      read.setAttribute("opacity", f2(s.read.o));
      s.chips.forEach(function (c, k) {
        var ch = g.chips[k];
        setOpacity(ch.el, DIM + (1 - DIM) * c.lit);
        scaleAbout(ch.el, 1 + 0.07 * c.pop, ch.cx, ch.cy);
      });
      flash.pass.setAttribute("opacity", f2(0.3 * s.flash.pass));
      flash.audit.setAttribute("opacity", f2(0.3 * s.flash.audit));

      var w = s.weight;
      setOpacity(g.boxes.eta, DIM + (1 - DIM) * w.eta);
      setOpacity(g.boxes.score, DIM + (1 - DIM) * w.score);
      setOpacity(g.boxes.transform, DIM + (1 - DIM) * w.transform);
      [w.a0, w.a1].forEach(function (p, k) {
        var a = g.warrows[k];
        draw(a.line, a.len, p);
        setOpacity(a.head, ramp(p, 0.8, 1));
      });
      setOpacity(gauge, w.gauge);
      gaugeFill.setAttribute("width", f2(gaugeW * w.fill));

      var tr = s.train;
      setOpacity(g.boxes.loss, DIM + (1 - DIM) * tr.loss);
      var rp = tr.ripple[0].o >= tr.ripple[1].o ? tr.ripple[0] : tr.ripple[1];
      ripple.setAttribute("opacity", f2(rp.o));
      scaleAbout(ripple, 1 + 0.16 * rp.u, rippleC[0], rippleC[1]);
      setOpacity(nodes, DIM + (1 - DIM) * tr.nodes);
      g.edges.forEach(function (e, i) { draw(e.el, e.len, stagger(tr.edges, i, g.edges.length, 0.55)); });
      setOpacity(g.boxes.val, DIM + (1 - DIM) * tr.val);
      setOpacity(jval, tr.jval);
      if (tr.jval >= 1) jval.removeAttribute("transform");
      else jval.setAttribute("transform", "translate(0 " + f2(1.5 * (1 - tr.jval)) + ")");
    }

    /* column focus: a wash over the other columns, a brass outline around the step's */
    var focus = { x0: 0, x1: W, o: 0 };
    var target = { x0: 0, x1: W, o: 0 };
    var PAD = 2.5;
    function focusTarget(k) {
      if (k === null) { target.o = 0; return; }
      var cols = STEPS[k].cols.map(function (id) { return g.cols[id]; });
      target.x0 = Math.min.apply(null, cols.map(function (c) { return c[0]; })) - PAD;
      target.x1 = Math.max.apply(null, cols.map(function (c) { return c[1]; })) + PAD;
      target.o = 1;
      if (focus.o < 0.02) { focus.x0 = target.x0; focus.x1 = target.x1; }     // appear in place
    }
    function focusMoving() {
      return Math.abs(focus.o - target.o) > 0.002 ||
        (target.o > 0 && (Math.abs(focus.x0 - target.x0) > 0.05 || Math.abs(focus.x1 - target.x1) > 0.05));
    }
    function tweenFocus(dt) {
      var k = reduced ? 1 : 1 - Math.exp(-dt / 0.09);
      focus.o += (target.o - focus.o) * k;
      if (target.o > 0) {
        focus.x0 += (target.x0 - focus.x0) * k;
        focus.x1 += (target.x1 - focus.x1) * k;
      }
      if (!focusMoving()) { focus.o = target.o; if (target.o > 0) { focus.x0 = target.x0; focus.x1 = target.x1; } }
    }
    function drawFocus() {
      var x0 = Math.max(0, focus.x0), x1 = Math.min(W, focus.x1);
      wash.setAttribute("d", "M0 0H" + f2(W) + "V" + f2(H) + "H0Z" +
        "M" + f2(x0) + " 0H" + f2(x1) + "V" + f2(H) + "H" + f2(x0) + "Z");
      wash.setAttribute("opacity", f2(WASH * focus.o));
      over.forEach(function (o) {
        var a = o.span[0], b = o.span[1];
        var inside = Math.max(0, Math.min(b, focus.x1) - Math.max(a, focus.x0)) / (b - a);
        setOpacity(o.el, 1 - WASH * focus.o * (1 - inside));
      });
      hl.setAttribute("x", f2(focus.x0));
      hl.setAttribute("y", f2(-PAD));
      hl.setAttribute("width", f2(focus.x1 - focus.x0));
      hl.setAttribute("height", f2(H + 2 * PAD));
      hl.setAttribute("opacity", f2(focus.o));
    }

    /* narrow screens: bring a step's columns into the scroller's view */
    var userScrolled = false;
    function reveal(k, smooth) {
      if (!scroller || scroller.scrollWidth <= scroller.clientWidth || k === null) return;
      var cols = STEPS[k].cols.map(function (id) { return g.cols[id]; });
      var x0 = Math.min.apply(null, cols.map(function (c) { return c[0]; }));
      var px = x0 / W * svg.getBoundingClientRect().width;
      scroller.scrollTo({ left: Math.max(0, px - 24), behavior: smooth && !reduced ? "smooth" : "auto" });
    }
    if (scroller) {
      ["pointerdown", "wheel", "touchstart", "keydown"].forEach(function (ev) {
        scroller.addEventListener(ev, function () { userScrolled = true; }, { passive: true });
      });
    }

    /* the player */
    var c = initial({ reduced: reduced });
    if (!reduced && !hasIO) { c.t = DURATION; c.started = true; }     // no autoplay trigger: start complete
    var visible = !hasIO;
    var raf = 0, last = 0, drawnT = -1, shown, wasPlaying;
    guard.stop = function () { if (raf) win.cancelAnimationFrame(raf); raf = 0; };

    function render() {
      try {
        if (c.t !== drawnT) { apply(state(c.t)); drawnT = c.t; }
        drawFocus();
      } catch (err) { guard.fail(err); }
    }
    // Buttons follow the player; the DOM is touched only when the pressed step or play state changes.
    function sync() {
      var k = pressed(c);
      if (k !== shown) {
        steps.forEach(function (s, i) { s.setAttribute("aria-pressed", String(i === k)); });
        focusTarget(k);
        if (k !== null && c.pinned === null && c.playing && !userScrolled) reveal(k, true);
        shown = k;
      }
      if (toggleBtn && c.playing !== wasPlaying) {
        toggleBtn.classList.toggle("is-paused", !c.playing);
        toggleBtn.querySelector(".fig2__btn-text").textContent = c.playing ? "Pause" : "Play";
        toggleBtn.setAttribute("aria-label", (c.playing ? "Pause" : "Play") + " the Fig. 2 animation");
        wasPlaying = c.playing;
      }
    }
    function frame(now) {
      raf = 0;
      if (guard.broken) return;
      var dt = last ? (now - last) / 1000 : 0;
      last = now;
      if (visible) {
        var before = c;
        c = control(c, { type: "tick", dt: dt });
        if (c !== before) sync();
      }
      tweenFocus(dt);
      render();
      if ((c.playing && visible) || focusMoving()) raf = win.requestAnimationFrame(frame);
      else last = 0;
    }
    function kick() { if (!raf && !guard.broken) { last = 0; raf = win.requestAnimationFrame(frame); } }
    function dispatch(a) {
      if (guard.broken) return;
      c = control(c, a);
      sync();
      if (reduced) tweenFocus(1);
      render();
      kick();
    }

    steps.forEach(function (s, k) {
      s.setAttribute("aria-controls", "fig2-frame");
      s.addEventListener("click", function () {
        if (guard.broken) return;
        dispatch({ type: "step", k: k });
        reveal(pressed(c), true);
      });
    });
    if (controls && !reduced) {
      controls.hidden = false;
      toggleBtn.addEventListener("click", function () { dispatch({ type: "toggle" }); });
      replayBtn.addEventListener("click", function () { userScrolled = false; dispatch({ type: "replay" }); reveal(0, true); });
    }

    // Scroll cue (CSS): .is-scrollable while the figure is wider than its box, .is-end at the right edge.
    function cue() {
      var max = scroller.scrollWidth - scroller.clientWidth;
      fig.classList.toggle("is-scrollable", max > 1);
      fig.classList.toggle("is-end", max > 1 && scroller.scrollLeft >= max - 2);
    }
    if (scroller) {
      cue();
      scroller.addEventListener("scroll", cue, { passive: true });
      if ("ResizeObserver" in win) new win.ResizeObserver(cue).observe(scroller);
      else win.addEventListener("resize", cue);
    }

    // Autoplay once, when a good part of the figure is on screen; time stands still while
    // the figure is entirely off screen.
    if (hasIO && !reduced) {
      var timer = 0, seen = false;
      new win.IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          visible = e.isIntersecting;
          seen = e.intersectionRatio >= 0.35;
          if (seen && !c.started && !timer) {
            timer = win.setTimeout(function () { timer = 0; if (seen) dispatch({ type: "view" }); }, 350);
          }
          if (visible) kick();
        });
      }, { threshold: [0, 0.35] }).observe(fig.querySelector(".fig2__view") || svg);
    }

    // Printing or saving as PDF captures the complete figure, never an empty start or a focus wash.
    function finish() {
      if (guard.broken) return;
      c = control(c, { type: "finish" });
      sync();
      tweenFocus(1e9);
      render();
    }
    win.addEventListener("beforeprint", finish);

    sync();
    render();
    if (guard.broken) return null;

    var api = {
      finish: finish,
      seek: function (t) { dispatch({ type: "seek", t: t }); },
      play: function () { if (!c.playing) dispatch({ type: "toggle" }); },
      pause: function () { dispatch({ type: "pause" }); },
      replay: function () { dispatch({ type: "replay" }); },
      select: function (k) { dispatch({ type: "step", k: k }); },
      state: function () { return state(c.t); }
    };
    Object.defineProperty(api, "ctl", { get: function () { return c; } });
    active = api;
    return api;
  }

  var API = {
    DURATION: DURATION,
    MAX_DT: MAX_DT,
    PHASES: PHASES,
    STEPS: STEPS,
    TRACES: TRACES,
    phaseAt: phaseAt,
    stepAt: stepAt,
    stepRange: stepRange,
    stagger: stagger,
    state: state,
    initial: initial,
    control: control,
    pressed: pressed,
    mount: mount,
    finish: function () { if (active) active.finish(); }
  };
  Object.defineProperty(API, "active", { get: function () { return active; } });
  return API;
})();

if (typeof module !== "undefined" && module.exports) module.exports = PACERFig2;

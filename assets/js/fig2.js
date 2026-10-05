/* PACER project page — Fig. 2, the PACER pipeline, as a looping token-flow figure (R40).

   The inline <svg class="fig2__svg"> in index.html is generated from the paper's figure PDF by
   _dev/tools/extract_fig2.py. It is the complete figure, and it always stays complete and crisp:
   nothing is ever washed, dimmed or filtered. Motion is additive, drawn on top by moving marks
   that are hidden at rest: tokens, chunk squares, glows, pulses and the phase rule. Next to the
   SVG the tool writes the flow layout L (<script type="application/json" id="fig2-flow">).

   One cycle (DURATION ≈ 10.6 s), then the complete figure holds (HOLD 1.8 s) and the moving marks
   retract quietly (RESET 0.3 s) before the next cycle. It loops while the figure is on screen:

     01 Collect & label   collect   a ping at each trace's end in the photo; each of the five
                                    process arrows emits three tokens in its colour while its
                                    dashes march
     02 Gate              gate      corrections, successes and near traces pass the green gate,
                                    which pulses as each crosses, into the Action Chunk column;
                                    offsets and wrong-region tokens
                                    touch the Audit cell's red wall, spring back and rest there
                                    (gated to zero weight, kept for audit: never deleted)
     03 Process evidence  chunks    each passing token splits into five squares that drop onto its
                                    histogram's bars; the bars grow by thirds
                          evidence  a brass tick runs down the five evidence chips; each glows
     04 Bounded weight    weight    eta, a pulse down, s_eta, a pulse down, the transform; the
                                    graphite 0..w_max gauge fills
     05 Train & select    train     the weighted native loss pulses, the network's edges light
                                    from the inputs, J_val(eta) is emphasised

   The current phase is marked by a thin brass rule under its column caption and by its step
   button pressed (aria-pressed). A step click plays only that phase and holds (the loop pauses)
   until Play or the same step again. Pause is a toggle button (aria-pressed = paused).

   state(t, L) is a pure function and control(c, action) a pure reducer, both unit-tested in node
   (_dev/tests/fig2.test.js). Reduced motion, no IntersectionObserver, no JS and printing show the
   complete figure. If mount or a frame throws, the SVG is put back exactly as index.html shipped
   it, the controls hide and the steps go inert.

   Classic script (no ES modules, no fetch) so the page works from file://; it also loads in node
   (module.exports at the bottom). main.js calls PACERFig2.mount(figure, steps, opts);
   PACERFig2.finish() completes the mounted figure (print, screenshots).
*/
var PACERFig2 = (function () {
  "use strict";

  var DURATION = 10.6;
  var HOLD = 1.8;
  var RESET = 0.3;
  var LOOP = DURATION + HOLD + RESET;
  var MAX_DT = 0.1;          // a stalled frame never skips more than this

  var PHASES = [
    { id: "collect", t0: 0, t1: 2.0 },
    { id: "gate", t0: 2.0, t1: 3.8 },
    { id: "chunks", t0: 3.8, t1: 5.8 },
    { id: "evidence", t0: 5.8, t1: 7.3 },
    { id: "weight", t0: 7.3, t1: 8.8 },
    { id: "train", t0: 8.8, t1: DURATION }
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

  /* ------------------------------------------------------------ timing */

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function ramp(t, a, b) { return clamp01((t - a) / (b - a)); }
  function easeInOut(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function easeOut(x) { return 1 - Math.pow(1 - x, 3); }
  function easeIn(x) { return x * x * x; }
  function bump(t, a, b) {
    var x = ramp(t, a, b);
    return x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x);
  }
  // A glow read at time r: rises quickly, peaks at r + 0.02, decays by r + 0.4.
  function glow(t, r) {
    if (t <= r - 0.08 || t >= r + 0.4) return 0;
    return t < r + 0.02 ? easeOut(ramp(t, r - 0.08, r + 0.02)) : 1 - easeInOut(ramp(t, r + 0.02, r + 0.4));
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

  var COLLECT = { start: 0.3, stagger: 0.09, dur: 1.3 };       // each trace's train along its arrow
  var GATE = { pass: 2.05, passStagger: 0.1, passDur: 1.25, audit: 2.15, auditStagger: 0.15, approach: 1.0, recoil: 0.4 };
  var CHUNK = { start: 3.9, traceStagger: 0.08, tokenStagger: 0.38, pop: 0.18, drop: 0.4, grow: 0.25 };

  function splitAt(i, k) { return CHUNK.start + CHUNK.traceStagger * i + CHUNK.tokenStagger * k; }

  // Token k of trace row i at time t: {x, y, o, s, at} (at: hidden | arrow | gate | audit | chunk).
  function tokenAt(L, i, k, t) {
    var row = L.rows[i];
    var lead0 = row.tip - 1;                                  // the lead token's slot at the arrow tip
    var e = COLLECT.start + COLLECT.stagger * i;
    var lead = row.x0 + (lead0 - row.x0) * easeInOut(ramp(t, e, e + COLLECT.dur));
    var x = lead - L.SP * k, y = row.y, at = "arrow";
    if (row.fate === "pass") {
      // through the green gate, then on into the (still empty) Action Chunk column, gliding to
      // the row above the trace's histogram once clear of the gate
      var g0 = GATE.pass + GATE.passStagger * i;
      if (t > g0) {
        x = lead0 + (L.gate.park - lead0) * easeInOut(ramp(t, g0, g0 + GATE.passDur)) - L.SP * k;
        var ey = L.hist[row.trace].entry[1], park = L.gate.park - L.SP * k;
        y = row.y + (ey - row.y) * easeInOut(clamp01((x - L.gate.x1) / (park - L.gate.x1)));
        at = "gate";
      }
      var d = splitAt(i, k);
      if (t > d) {                                          // the token breaks into its chunks
        return { x: x, y: y, o: 1 - ramp(t, d + 0.04, d + CHUNK.pop), s: 1 + 0.4 * easeOut(ramp(t, d, d + CHUNK.pop)), at: "chunk" };
      }
    } else {
      var a0 = GATE.audit + GATE.auditStagger * (i - 3);
      var hit = a0 + GATE.approach;
      if (t > a0) {
        var contact = L.gate.contact - L.SP * k;
        x = t <= hit
          ? lead0 - L.SP * k + (contact - lead0 + L.SP * k) * easeInOut(ramp(t, a0, hit))
          : contact + (L.gate.rest[k] - contact) * easeOut(ramp(t, hit, hit + GATE.recoil));
        at = x - L.R >= L.gate.x0 ? "audit" : "gate";
      }
    }
    if (x < row.x0 - 1e-9) return { x: row.x0, y: y, o: 0, s: 0, at: "hidden" };
    var pop = easeOut(ramp(x, row.x0, row.x0 + 4));            // tokens emerge from the arrow's start
    return { x: x, y: y, o: pop, s: 0.5 + 0.5 * pop, at: at };
  }

  function cycle(t, L) {
    var out = {
      t: t, phase: null, step: null, tokens: [], chunks: [], bars: {}, pings: {}, march: {},
      flash: { pass: 0, audit: 0 }, hits: {}, tick: null, chips: [], weight: null, train: null
    };
    var pi = phaseAt(t), si = stepAt(t);
    out.phase = pi < 0 ? null : PHASES[pi].id;
    out.step = si < 0 ? null : si;

    L.rows.forEach(function (row, i) {
      for (var k = 0; k < L.N; k++) {
        var tk = tokenAt(L, i, k, t);
        var trail = [1, 2, 3].map(function (m) {
          var p = tokenAt(L, i, k, t - 0.045 * m);
          var far = Math.abs(p.x - tk.x) + Math.abs(p.y - tk.y) > 0.3;
          return { x: p.x, y: p.y, o: far && tk.at !== "chunk" ? p.o * tk.o : 0 };
        });
        var moving = trail[0].o > 0;
        out.tokens.push({ trace: row.trace, k: k, fate: row.fate, x: tk.x, y: tk.y, o: tk.o, s: tk.s, at: tk.at,
                          halo: moving ? 0.28 * tk.o : 0, trail: trail });
        if (row.fate === "pass" && tk.at === "gate") out.flash.pass = Math.max(out.flash.pass, clamp01(1 - Math.abs(tk.x - L.gate.cx) / 9));
      }
      // the ping in the photo, and the arrow's marching dashes while its train travels
      var e = COLLECT.start + COLLECT.stagger * i;
      var pp = ramp(t, 0.05 + 0.06 * i, 0.75 + 0.06 * i);
      out.pings[row.trace] = { r: easeOut(pp), o: pp > 0 && pp < 1 ? 1 - easeIn(pp) : 0 };
      out.march[row.trace] = {
        o: ramp(t, e, e + 0.15) * (1 - ramp(t, e + COLLECT.dur - 0.2, e + COLLECT.dur + 0.05)),
        shift: -4.32 * 3 * easeInOut(ramp(t, e, e + COLLECT.dur))
      };
      if (row.fate === "audit") {
        var hit = GATE.audit + GATE.auditStagger * (i - 3) + GATE.approach;
        out.hits[row.trace] = bump(t, hit - 0.05, hit + 0.45);
        out.flash.audit = Math.max(out.flash.audit, bump(t, hit - 0.05, hit + 0.6));
      }
    });

    // chunks: each passing token splits into five squares that drop onto its histogram's bars
    PASS.forEach(function (id, i) {
      var h = L.hist[id];
      out.bars[id] = [0, 0, 0, 0, 0];
      for (var k = 0; k < L.N; k++) {
        var land = splitAt(i, k);
        for (var b = 0; b < 5; b++) {
          var bar = h.bars[b];
          var u = ramp(t, land, land + CHUNK.drop);
          var tx = bar[0] + bar[2] / 2 - L.CH / 2, ty = bar[1] + bar[3] - bar[3] * k / L.N - L.CH - 0.3;
          var sx = L.gate.park - L.SP * k - L.CH / 2, sy = h.entry[1] - L.CH / 2;
          out.chunks.push({
            trace: id, k: k, bar: b,
            x: sx + (tx - sx) * easeOut(u), y: sy + (ty - sy) * easeIn(u),
            o: ramp(t, land, land + 0.05) * (1 - ramp(t, land + CHUNK.drop, land + CHUNK.drop + 0.1))
          });
          out.bars[id][b] += easeOut(ramp(t, land + CHUNK.drop - 0.05, land + CHUNK.drop + CHUNK.grow)) / L.N;
        }
      }
      out.bars[id] = out.bars[id].map(function (v) { return v > 1 - 1e-9 ? 1 : v; });
    });

    // evidence: a tick runs down the chips; each glows as it is read
    var reads = [0, 1, 2, 3, 4].map(function (k) { return 5.92 + 0.24 * k; });
    out.chips = reads.map(function (r) { return glow(t, r); });
    var pos = 0;
    for (var k2 = 1; k2 < 5; k2++) pos += easeInOut(ramp(t, reads[k2 - 1] + 0.06, reads[k2] - 0.02));
    var c0 = Math.floor(Math.min(pos, 3.999)), f = pos - c0;
    out.tick = {
      y: L.chips[c0][1] + (L.chips[Math.min(c0 + 1, 4)][1] - L.chips[c0][1]) * f,
      o: ramp(t, 5.82, 5.9) * (1 - ramp(t, 7.0, 7.2))
    };

    function pulse(a, b) {
      return { u: easeInOut(ramp(t, a, b)), o: ramp(t, a, a + 0.05) * (1 - ramp(t, b - 0.05, b)) };
    }
    out.weight = {
      eta: glow(t, 7.4), pulses: [pulse(7.55, 7.85), pulse(8.0, 8.32)],
      score: glow(t, 7.9), transform: glow(t, 8.38),
      fill: easeOut(ramp(t, 8.4, 8.78))                        // up to its illustrative share of w_max
    };

    function ripple(a, b) {
      var u = ramp(t, a, b);
      return { u: u, o: u > 0 && u < 1 ? 0.7 * (1 - u) : 0 };
    }
    var edges = L.edges.map(function () { return 0; });
    var litAt = L.edges.map(function () { return Infinity; });
    L.edgeOrder.forEach(function (e, j) { litAt[e] = 9.1 + 0.075 * j; edges[e] = glow(t, litAt[e]); });
    var nodeAt = L.nodes.map(function (_, n) {
      if (L.nodeOrder.indexOf(n) < 2) return 9.05;           // the inputs light first
      var first = Infinity;
      L.edges.forEach(function (e, m) { if (e.a === n || e.b === n) first = Math.min(first, litAt[m]); });
      return first + 0.1;
    });
    out.train = {
      loss: glow(t, 8.88), ripple: [ripple(8.95, 9.6), ripple(9.2, 9.85)],
      edges: edges, nodes: nodeAt.map(function (r) { return glow(t, r); }),
      val: glow(t, 10.05), jval: bump(t, 10.1, 10.58)
    };
    return out;
  }

  // The complete figure, held through the hold; in the reset only the moving marks retract.
  function state(time, L) {
    var t = time < 0 ? 0 : time > LOOP ? LOOP : time;
    if (t <= DURATION) return cycle(t, L);
    var s = cycle(DURATION, L);
    s.t = t;
    if (t <= DURATION + HOLD) return s;
    var r = easeInOut(ramp(t, DURATION + HOLD, LOOP));
    PASS.forEach(function (id) { s.bars[id] = s.bars[id].map(function (v) { return v * (1 - r); }); });
    s.weight.fill *= 1 - r;
    s.tokens.forEach(function (k) { k.o *= 1 - r; });
    return s;
  }

  /* -------------------------------------------------------- controller */

  // c = {t, playing, until, pinned, started, reduced}. Unpinned, the player loops; a pinned step
  // plays its own phases and holds at their end (the loop is paused).
  function initial(opts) {
    return { t: DURATION, playing: false, until: null, pinned: null, started: false, reduced: !!(opts && opts.reduced) };
  }

  function copy(c) {
    return { t: c.t, playing: c.playing, until: c.until, pinned: c.pinned, started: c.started, reduced: c.reduced };
  }

  function loop(n) { n.started = true; n.playing = true; n.until = null; n.pinned = null; return n; }

  function control(c, a) {
    var n = copy(c);
    switch (a.type) {
      case "view":                                   // first time in view: retract quietly, then loop
        if (c.started || c.reduced) return c;
        n.t = DURATION + HOLD;
        return loop(n);
      case "tick":
        if (!c.playing) return c;
        var dt = Math.min(Math.max(a.dt || 0, 0), MAX_DT);
        if (c.until !== null) {
          n.t = Math.min(c.until, c.t + dt);
          if (n.t >= c.until) n.playing = false;
        } else {
          n.t = c.t + dt;
          if (n.t >= LOOP) n.t -= LOOP;
        }
        return n;
      case "toggle":
        if (c.reduced) return c;
        if (c.playing) { n.playing = false; n.started = true; return n; }
        return loop(n);
      case "pause":
        if (!c.playing) return c;
        n.playing = false;
        return n;
      case "replay":
        if (c.reduced) return c;
        n.t = 0;
        return loop(n);
      case "seek":
        if (c.reduced) return c;
        n.started = true;
        n.t = Math.max(0, Math.min(LOOP, a.t));
        n.pinned = null;
        n.until = null;
        return n;
      case "finish":                                 // print, screenshots: the complete figure, unpinned
        n.started = true; n.t = DURATION; n.playing = false; n.until = null; n.pinned = null;
        return n;
      case "step":
        n.started = true;
        if (c.reduced) { n.pinned = c.pinned === a.k ? null : a.k; return n; }
        if (c.pinned === a.k) return loop(n);         // the same step again: the loop resumes
        var r = stepRange(a.k);
        n.pinned = a.k;
        n.t = r[0];
        n.until = r[1];
        n.playing = true;
        return n;
      default:
        return c;
    }
  }

  // The step button that shows as pressed: the pinned step, else the playing (or paused) phase's.
  function pressed(c) {
    if (c.pinned !== null) return c.pinned;
    if (c.reduced || !c.started) return null;
    var k = stepAt(c.t);
    return k < 0 ? null : k;
  }

  function paused(c) { return !c.reduced && c.started && !c.playing; }

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
    var hasIO = "IntersectionObserver" in win;
    var still = !!opts.reduceMotion || !hasIO;                  // the complete figure, no motion
    var L = JSON.parse(doc.getElementById("fig2-flow").textContent);
    var scroller = fig.querySelector(".fig2__scroll");
    var controls = fig.querySelector(".fig2__controls");
    var toggleBtn = controls && controls.querySelector('[data-fig2="toggle"]');
    var replayBtn = controls && controls.querySelector('[data-fig2="replay"]');
    var W = svg.viewBox.baseVal.width;
    function q(sel) { return svg.querySelector(sel); }
    function qa(sel) { return Array.prototype.slice.call(svg.querySelectorAll(sel)); }
    function num(el, a) { return parseFloat(el.getAttribute(a)); }
    function centre(r) { return [num(r, "x") + num(r, "width") / 2, num(r, "y") + num(r, "height") / 2]; }

    /* the moving marks, read once from the generated SVG */
    var tokens = qa(".f2-token").map(function (g) {
      return { core: g.querySelector(".f2-token__core"), halo: g.querySelector(".f2-token__halo"), g: g,
               trail: Array.prototype.slice.call(g.querySelectorAll(".f2-token__trail")) };
    });
    var trailO = tokens[0].trail.map(function (c) { return num(c, "data-o"); });
    var chunks = {};
    qa(".f2-chunk").forEach(function (el) {
      chunks[el.getAttribute("data-trace") + el.getAttribute("data-k") + el.getAttribute("data-bar")] = el;
    });
    var bars = {};
    PASS.forEach(function (id) {
      bars[id] = qa('.f2-hist[data-trace="' + id + '"] .f2-bar').map(function (b) {
        return { el: b, y: num(b, "y"), h: num(b, "height") };
      });
    });
    function byTrace(cls) {
      var m = {};
      qa(cls).forEach(function (el) { m[el.getAttribute("data-trace")] = el; });
      return m;
    }
    var pings = byTrace(".f2-ping"), march = byTrace(".f2-march"), hits = byTrace(".f2-hit");
    var flash = { pass: q('.f2-flash[data-flash="pass"]'), audit: q('.f2-flash[data-flash="audit"]') };
    function lit(group) {
      var box = group.querySelector(".f2-chip__box, .f2-box__box");
      return { aura: group.querySelector(".f2-aura"), box: box, w: box ? num(box, "stroke-width") : 0 };
    }
    var chips = qa(".f2-chip").map(lit);
    var boxes = {};
    ["eta", "score", "transform", "loss", "val"].forEach(function (k) { boxes[k] = lit(q('.f2-box[data-box="' + k + '"]')); });
    var tick = q(".f2-tick");
    var pulses = qa(".f2-wpulse");
    var gaugeFill = q(".f2-gauge__fill"), gaugeW = num(gaugeFill, "data-w");
    var ripple = q(".f2-ripple"), rippleC = centre(ripple);
    var edgeGlows = qa(".f2-edge-glow");
    var nodes = qa(".f2-node");
    var jval = q(".f2-jval"), jvalAura = jval.querySelector(".f2-aura"), jvalC = centre(jvalAura);

    /* state -> SVG */
    function apply(s) {
      s.tokens.forEach(function (tk, i) {
        var el = tokens[i];
        setOpacity(el.g, tk.o);
        el.core.setAttribute("cx", f2(tk.x));
        el.core.setAttribute("cy", f2(tk.y));
        el.core.setAttribute("r", f2(L.R * Math.max(tk.s, 0.05)));
        el.halo.setAttribute("cx", f2(tk.x));
        el.halo.setAttribute("cy", f2(tk.y));
        el.halo.setAttribute("opacity", f2(tk.halo));
        tk.trail.forEach(function (p, m) {
          var c = el.trail[m];
          c.setAttribute("cx", f2(p.x));
          c.setAttribute("cy", f2(p.y));
          c.setAttribute("opacity", f2(p.o * trailO[m]));
        });
      });
      s.chunks.forEach(function (c) {
        var el = chunks[c.trace + c.k + c.bar];
        el.setAttribute("x", f2(c.x));
        el.setAttribute("y", f2(c.y));
        el.setAttribute("opacity", f2(c.o));
      });
      PASS.forEach(function (id) {
        s.bars[id].forEach(function (v, k) {
          var b = bars[id][k];
          b.el.setAttribute("y", f2(b.y + b.h * (1 - v)));
          b.el.setAttribute("height", f2(b.h * v));
          setOpacity(b.el, v > 0.001 ? 1 : 0);
        });
      });
      Object.keys(pings).forEach(function (id) {
        pings[id].setAttribute("r", f2(9 * s.pings[id].r));
        pings[id].setAttribute("opacity", f2(s.pings[id].o));
        march[id].setAttribute("opacity", f2(s.march[id].o));
        march[id].setAttribute("stroke-dashoffset", f2(s.march[id].shift));
      });
      Object.keys(hits).forEach(function (id) { hits[id].setAttribute("opacity", f2(s.hits[id])); });
      flash.pass.setAttribute("opacity", f2(0.32 * s.flash.pass));
      flash.audit.setAttribute("opacity", f2(0.3 * s.flash.audit));
      function glowBox(b, g) {
        b.aura.setAttribute("opacity", f2(0.4 * g));
        if (b.box) b.box.setAttribute("stroke-width", f2(b.w + 0.9 * g));
      }
      s.chips.forEach(function (g, k) { glowBox(chips[k], g); });
      tick.setAttribute("transform", "translate(" + f2(L.tickX) + " " + f2(s.tick.y) + ")");
      tick.setAttribute("opacity", f2(s.tick.o));
      var w = s.weight;
      glowBox(boxes.eta, w.eta);
      glowBox(boxes.score, w.score);
      glowBox(boxes.transform, w.transform);
      w.pulses.forEach(function (p, k) {
        var a = L.warrows[k];
        pulses[k].setAttribute("cy", f2(a[1] + (a[2] - a[1]) * p.u));
        pulses[k].setAttribute("opacity", f2(p.o));
      });
      gaugeFill.setAttribute("width", f2(gaugeW * w.fill));
      var tr = s.train;
      glowBox(boxes.loss, tr.loss);
      glowBox(boxes.val, tr.val);
      var rp = tr.ripple[0].o >= tr.ripple[1].o ? tr.ripple[0] : tr.ripple[1];
      ripple.setAttribute("opacity", f2(rp.o));
      scaleAbout(ripple, 1 + 0.1 * rp.u, rippleC[0], rippleC[1]);
      tr.edges.forEach(function (g, e) { edgeGlows[e].setAttribute("opacity", f2(g)); });
      tr.nodes.forEach(function (g, n) { scaleAbout(nodes[n], 1 + 0.22 * g, L.nodes[n][0], L.nodes[n][1]); });
      jvalAura.setAttribute("opacity", f2(0.3 * tr.jval));
      scaleAbout(jval, 1 + 0.12 * tr.jval, jvalC[0], jvalC[1]);
    }

    /* the phase rule: a thin brass line under the current step's column captions */
    var rules = qa(".f2-rule").map(function (el) {
      var col = el.getAttribute("data-col");
      var caps = qa('.f2-col[data-col="' + col + '"] .f2-cap');
      var x0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      caps.forEach(function (c) { var b = c.getBBox(); x0 = Math.min(x0, b.x); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height); });
      el.setAttribute("y1", f2(y1 + 0.2));
      el.setAttribute("y2", f2(y1 + 0.2));
      return { el: el, col: col, cx: (x0 + x1) / 2, half: (x1 - x0) / 2, o: 0, target: 0 };
    });
    function rulesTarget(k) {
      var cols = k === null ? [] : STEPS[k].cols;
      rules.forEach(function (r) { r.target = cols.indexOf(r.col) >= 0 ? 1 : 0; });
    }
    function rulesMoving() { return rules.some(function (r) { return Math.abs(r.o - r.target) > 0.002; }); }
    function tweenRules(dt) {
      var k = still ? 1 : 1 - Math.exp(-dt / 0.08);
      rules.forEach(function (r) { r.o += (r.target - r.o) * k; if (Math.abs(r.o - r.target) <= 0.002) r.o = r.target; });
    }
    function drawRules() {
      rules.forEach(function (r) {
        var h = r.half * (0.4 + 0.6 * r.o);
        r.el.setAttribute("x1", f2(r.cx - h));
        r.el.setAttribute("x2", f2(r.cx + h));
        setOpacity(r.el, r.o);
      });
    }

    /* narrow screens: bring a step's columns into the scroller's view */
    var userScrolled = false;
    var colX = {};
    qa(".f2-col").forEach(function (el) { colX[el.getAttribute("data-col")] = el.getBBox().x; });
    function reveal(k, smooth) {
      if (!scroller || scroller.scrollWidth <= scroller.clientWidth || k === null) return;
      var x0 = Math.min.apply(null, STEPS[k].cols.map(function (id) { return colX[id]; }));
      var px = x0 / W * svg.getBoundingClientRect().width;
      scroller.scrollTo({ left: Math.max(0, px - 24), behavior: smooth && !still ? "smooth" : "auto" });
    }
    if (scroller) {
      ["pointerdown", "wheel", "touchstart", "keydown"].forEach(function (ev) {
        scroller.addEventListener(ev, function () { userScrolled = true; }, { passive: true });
      });
    }

    /* the player */
    var c = initial({ reduced: still });
    var visible = !hasIO;
    var raf = 0, last = 0, drawnT = -1, shown, wasPaused;
    guard.stop = function () { if (raf) win.cancelAnimationFrame(raf); raf = 0; };

    function render() {
      try {
        if (c.t !== drawnT) { apply(state(c.t, L)); drawnT = c.t; }
        drawRules();
      } catch (err) { guard.fail(err); }
    }
    // Buttons follow the player; the DOM is touched only when the pressed step or pause state changes.
    function sync() {
      var k = pressed(c);
      if (k !== shown) {
        steps.forEach(function (s, i) { s.setAttribute("aria-pressed", String(i === k)); });
        rulesTarget(k);
        if (k !== null && c.pinned === null && c.playing && !userScrolled) reveal(k, true);
        shown = k;
      }
      var p = paused(c);
      if (toggleBtn && p !== wasPaused) {
        toggleBtn.setAttribute("aria-pressed", String(p));
        toggleBtn.classList.toggle("is-paused", p);
        wasPaused = p;
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
      tweenRules(dt);
      render();
      if ((c.playing && visible) || rulesMoving()) raf = win.requestAnimationFrame(frame);
      else last = 0;
    }
    function kick() { if (!raf && !guard.broken) { last = 0; raf = win.requestAnimationFrame(frame); } }
    function dispatch(a) {
      if (guard.broken) return;
      c = control(c, a);
      sync();
      if (still) tweenRules(1);
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
    if (controls && !still) {
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

    // Loop while on screen: start once a good part of the figure is seen; time stands still while
    // the figure is entirely off screen.
    if (hasIO && !still) {
      var timer = 0, seen = false;
      new win.IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          visible = e.isIntersecting;
          seen = e.intersectionRatio >= 0.35;
          if (seen && !c.started && !timer) {
            timer = win.setTimeout(function () { timer = 0; if (seen) dispatch({ type: "view" }); }, 400);
          }
          if (visible) kick();
        });
      }, { threshold: [0, 0.35] }).observe(fig.querySelector(".fig2__view") || svg);
    }

    // Printing or saving as PDF captures the complete figure, never a moving frame or a phase rule.
    function finish() {
      if (guard.broken) return;
      c = control(c, { type: "finish" });
      sync();
      tweenRules(1e9);
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
      state: function () { return state(c.t, L); }
    };
    Object.defineProperty(api, "ctl", { get: function () { return c; } });
    active = api;
    return api;
  }

  var API = {
    DURATION: DURATION,
    HOLD: HOLD,
    RESET: RESET,
    LOOP: LOOP,
    MAX_DT: MAX_DT,
    PHASES: PHASES,
    STEPS: STEPS,
    TRACES: TRACES,
    phaseAt: phaseAt,
    stepAt: stepAt,
    stepRange: stepRange,
    state: state,
    initial: initial,
    control: control,
    pressed: pressed,
    paused: paused,
    mount: mount,
    finish: function () { if (active) active.finish(); }
  };
  Object.defineProperty(API, "active", { get: function () { return active; } });
  return API;
})();

if (typeof module !== "undefined" && module.exports) module.exports = PACERFig2;

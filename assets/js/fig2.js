/* PACER project page — Fig. 2, the PACER pipeline, played once over the complete figure (R62).

   The inline <svg class="fig2__svg"> in index.html is generated from the paper's figure PDF by
   _dev/tools/extract_fig2.py. It is the complete figure, and it always stays complete and crisp:
   nothing in it is ever emptied, washed, dimmed or filtered (the Action Chunk histograms keep the
   paper's bars at all times). Motion is additive, drawn on top by moving marks that are hidden at
   rest. Next to the SVG the tool writes the flow layout L (<script type="application/json"
   id="fig2-flow">).

   When the figure is first seen it plays ONE cycle (DURATION = 16 s), then rests on the complete
   figure; state(0) and state(DURATION) both look exactly like the paper's figure, so the start and
   the end never jump. Replay plays the cycle again. There is no loop.

     01 Collect & label   collect    0.0-2.8  the gated tokens resting in Audit fade; a ping at each
                                              trace's end in the photo; each process arrow emits
                                              three tokens in its colour while its dashes march
     02 Gate              gate       2.8-5.2  corrections, successes and near traces pass the green
                                              gate (it pulses) into the Action Chunk column; offsets
                                              and wrong-region tokens touch the Audit cell's red wall,
                                              spring back and rest there (zero weight, kept for audit)
     03 Process evidence  chunks     5.2-7.6  each passing token splits into five chunk squares that
                                              drop onto its histogram; a weight overlay on the bars
                                              rises by thirds to one equal height (unweighted; it
                                              covers the outlines of the bars shorter than that
                                              height until the weight comes back)
                          evidence   7.6-10.0 a brass tick runs down the five evidence chips; as each
                                              chip is read, a mark in its colour flies to each
                                              histogram, lands just above it and leaves one evidence
                                              segment above every chunk's bar, left to right (a
                                              five-colour stack per chunk)
     04 Bounded weight    weight    10.0-13.0 each histogram's evidence is carried, in its trace's
                                              colour, to the evidence score s_eta while eta glows and
                                              a pulse runs down from eta: they meet at s_eta, which
                                              glows; a pulse down, the transform glows and a brass
                                              sweep fills the 0..w_max gauge; then brass marks carry
                                              the weight back to the histograms, where the evidence
                                              stacks sink into the bars and the overlay goes from the
                                              equal height to the paper's bar heights
     05 Train & select    train     13.0-16.0 from every bar a token sized by its weight rises to a
                                              lane above the figure and drops into the weighted
                                              native loss (the overlay leaves with it); the loss
                                              pulses, the network's edges light from the inputs, the
                                              validation score glows and J_val(eta) is emphasised

   Marks that cross the Process Evidence and Evidence to Weight columns never cross their text:
   the evidence goes to s_eta through the gap between the Proximity and Terminal chips, the
   weight comes back through the gap between the Stop and Operator chips (both up or down the
   gutter beside the Action Chunk column), and the weighted tokens travel on a lane just above the
   column frames (inside the scroller's padding) and enter the loss box through its top edge.

   At rest the figure is the paper's figure with two additions (R38, R40): the 0..w_max gauge
   under the transform box and the six gated tokens resting in the Audit cell.

   The current phase is marked by a thin brass rule under its column caption and by its step
   button pressed (aria-pressed). A step click plays only that phase and holds, and brings the
   figure into view if it is off screen; Play or the same step again plays on to the end of the
   cycle. The Pause / Play button names what it does (no aria-pressed); at rest nothing is playing
   and it is inert (aria-disabled) until Replay.

   On narrow screens the figure scrolls sideways. During playback the scroller follows the active
   columns (state(t).focus) and the "scroll" hint steps aside; the first time the reader scrolls
   the figure sideways, following stops until Replay (a vertical page swipe that starts on the
   figure does not count). A step click brings its columns into view. Reduced motion never scrolls
   on its own.

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

  var DURATION = 16.0;
  var RETRACT = 0.35;        // the gated tokens resting in Audit fade at the start of a cycle
  var MAX_DT = 0.1;          // a stalled frame never skips more than this

  var PHASES = [
    { id: "collect", t0: 0, t1: 2.8 },
    { id: "gate", t0: 2.8, t1: 5.2 },
    { id: "chunks", t0: 5.2, t1: 7.6 },
    { id: "evidence", t0: 7.6, t1: 10.0 },
    { id: "weight", t0: 10.0, t1: 13.0 },
    { id: "train", t0: 13.0, t1: DURATION }
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
  // A point on the quadratic curve p0 -> p2 bowed through c, at u in [0, 1].
  function curve(p0, c, p2, u) {
    var a = (1 - u) * (1 - u), b = 2 * u * (1 - u), d = u * u;
    return [a * p0[0] + b * c[0] + d * p2[0], a * p0[1] + b * c[1] + d * p2[1]];
  }
  function bow(p0, p2, lift) {
    return [(p0[0] + p2[0]) / 2, Math.max(3, Math.min(p0[1], p2[1]) - lift)];
  }
  function dist(a, b) { return Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])); }
  // A route through waypoints with rounded corners (radius up to R, at most half of either leg),
  // sampled once into a polyline with cumulative lengths; along(route, u) is the point at the
  // fraction u of its length, so one easing over u gives an even, unbroken motion.
  function route(way, R) {
    var w = [way[0]];
    for (var i = 1; i < way.length; i++) if (dist(w[w.length - 1], way[i]) > 1e-6) w.push(way[i]);
    var pts = [w[0]];
    for (var j = 1; j < w.length - 1; j++) {
      var a = w[j - 1], b = w[j], c = w[j + 1], l1 = dist(a, b), l2 = dist(b, c);
      var r = Math.min(R, l1 / 2, l2 / 2);
      var p = [b[0] + (a[0] - b[0]) * r / l1, b[1] + (a[1] - b[1]) * r / l1];
      var q = [b[0] + (c[0] - b[0]) * r / l2, b[1] + (c[1] - b[1]) * r / l2];
      for (var k = 0; k <= 8; k++) pts.push(curve(p, b, q, k / 8));
    }
    if (w.length > 1) pts.push(w[w.length - 1]);
    var cum = [0];
    for (var m = 1; m < pts.length; m++) cum.push(cum[m - 1] + dist(pts[m - 1], pts[m]));
    return { pts: pts, cum: cum, len: cum[cum.length - 1] };
  }
  function along(rt, u) {
    var s = clamp01(u) * rt.len, lo = 0, hi = rt.cum.length - 1;
    if (hi === 0) return rt.pts[0].slice();
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (rt.cum[mid] <= s) lo = mid; else hi = mid; }
    var seg = rt.cum[hi] - rt.cum[lo], f = seg > 0 ? (s - rt.cum[lo]) / seg : 0;
    return [rt.pts[lo][0] + (rt.pts[hi][0] - rt.pts[lo][0]) * f, rt.pts[lo][1] + (rt.pts[hi][1] - rt.pts[lo][1]) * f];
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

  // The x range (pt) a narrow screen keeps in view at time t: where the motion is. Training first
  // shows the weighted tokens leaving the Action Chunk bars, drifts right with them along the lane,
  // then follows them into the loss.
  var TRAIN_PAN = [13.8, 14.0], TRAIN_DRIFT = 18;
  function focusAt(t, L) {
    var c = L.cols, i = phaseAt(t);
    switch (i < 0 ? null : PHASES[i].id) {
      case "collect": return [Math.min.apply(null, L.rows.map(function (r) { return r.end[0]; })) - 8, c.processes[1]];
      case "gate": return [L.rows[0].tip - 10, c.chunk[1]];
      case "chunks": return [c.gate[0], c.chunk[1]];
      case "evidence": return [c.chunk[0], c.evidence[1]];
      case "weight": return [c.chunk[0], c.weight[1]];
      case "train":
        if (t < TRAIN_PAN[0]) return [c.chunk[0], c.training[0] + 12];
        if (t < TRAIN_PAN[1]) return [c.chunk[0] + TRAIN_DRIFT, c.training[0] + 12 + TRAIN_DRIFT];
        return [c.evidence[0], c.training[1]];
      default: return null;
    }
  }
  // A step's columns: where its phases' motion is, from its start to its end.
  function stepFocus(k, L) {
    var r = stepRange(k), x0 = Infinity, x1 = -Infinity;
    for (var t = r[0]; t < r[1]; t += 0.05) { var f = focusAt(t, L); x0 = Math.min(x0, f[0]); x1 = Math.max(x1, f[1]); }
    return [x0, x1];
  }

  /* ------------------------------------------------------------- state */

  var COLLECT = { start: 0.45, stagger: 0.12, dur: 1.8 };      // each trace's train along its arrow
  var GATE = { pass: 2.9, passStagger: 0.15, passDur: 1.8, audit: 3.05, auditStagger: 0.22, approach: 1.35, recoil: 0.55 };
  var CHUNK = { start: 5.3, traceStagger: 0.12, tokenStagger: 0.55, pop: 0.25, drop: 0.55, grow: 0.35 };
  // evidence: chip k is read at read + step * k; its mark to histogram i leaves after launch +
  // traceStagger * i and lands flight later, just above the stacks (above pt over the tallest);
  // there its segments grow above the chunk bars, bar b barStagger * b after the landing. A
  // segment is unit * e pt tall (e >= floor), the segments gap pt apart: >= 2 px and >= 1 px at
  // 1024 px on a 1x display.
  var EVIDENCE = { read: 7.7, step: 0.37, launch: 0.03, traceStagger: 0.04, flight: 0.42, grow: 0.12,
                   barStagger: 0.04, unit: 2.6, gap: 0.6, floor: 0.47, lift: 0.5, above: 3 };
  // weight: histogram i's evidence leaves for s_eta at fwd + fwdStagger * i and lands fwdFlight
  // later, as the pulse from eta reaches s_eta; the boxes glow in turn, the gauge sweeps, and as
  // the sweep completes the weight returns to histogram i (leaves at back + backStagger * i,
  // lands backFlight later); the evidence sinks, the bars morph
  var WEIGHT = { eta: 10.15, fwd: 10.05, fwdStagger: 0.05, fwdFlight: 0.6,
                 pulses: [[10.3, 10.7], [10.9, 11.3]], score: 10.72, transform: 11.35,
                 sweep: [11.35, 11.7], sweepOut: [12.6, 12.95], back: 11.7, backStagger: 0.06, backFlight: 0.6,
                 sink: 0.4, morph: [0.05, 0.55] };
  // train: the token of bar b in histogram i leaves at launch + traceStagger * i + barStagger * b,
  // rises to the lane (y = lane pt, above the column frames) and drops into the loss box
  var TRAIN = { launch: 13.1, traceStagger: 0.12, barStagger: 0.05, flight: 1.0, fade: 0.25, lane: -3.5,
                loss: 14.55, ripples: [[14.57, 15.22], [14.82, 15.47]], inputs: 14.72, edge0: 14.77, edgeStep: 0.06,
                val: 15.55, jval: [15.5, 15.98] };
  var CORNER = 6;            // corner radius of the routes (pt)
  // The operator label's evidence is fixed by the process role (App. C: 1 for corrections, 0.8 for
  // successes, 0.6 for partial (near) rows). The other heights are illustrative: they rise with the
  // paper's bar height for that chunk, so more evidence ends in a taller bar. No values are shown.
  var OPERATOR = { corr: 1, success: 0.8, near: 0.6 };
  var JITTER = [[0.06, -0.05, 0.04, -0.07, 0.05], [-0.04, 0.07, -0.06, 0.03, -0.02]];

  function splitAt(i, k) { return CHUNK.start + CHUNK.traceStagger * i + CHUNK.tokenStagger * k; }
  function evLand(k, i) { return EVIDENCE.read + EVIDENCE.step * k + EVIDENCE.launch + EVIDENCE.traceStagger * i + EVIDENCE.flight; }
  function fwdLand(i) { return WEIGHT.fwd + WEIGHT.fwdStagger * i + WEIGHT.fwdFlight; }
  function backLand(i) { return WEIGHT.back + WEIGHT.backStagger * i + WEIGHT.backFlight; }
  function launchAt(i, b) { return TRAIN.launch + TRAIN.traceStagger * i + TRAIN.barStagger * b; }

  // Quantities derived from the layout alone (cached per layout object; pure).
  var derivedFor = null, derivedVal = null;
  function derived(L) {
    if (L === derivedFor) return derivedVal;
    var all = [];
    PASS.forEach(function (id) { L.hist[id].bars.forEach(function (b) { all.push(b[3]); }); });
    var heq = all.reduce(function (a, b) { return a + b; }, 0) / all.length;   // every chunk counts the same
    var hmax = Math.max.apply(null, all);
    // the gutters beside the Action Chunk and Process Evidence columns, and the chip gaps the
    // evidence (Proximity | Terminal) and the weight (Stop | Operator) travel through
    var g1 = (L.cols.chunk[1] + L.cols.evidence[0]) / 2, g2 = (L.cols.evidence[1] + L.cols.weight[0]) / 2;
    var laneEv = (L.chips[1][1] + L.chips[2][1]) / 2, laneW = (L.chips[3][1] + L.chips[4][1]) / 2;
    var S = L.score, T = L.transform, Lb = L.loss;
    var hist = {};
    PASS.forEach(function (id, i) {
      var bars = L.hist[id].bars;
      var hs = bars.map(function (b) { return b[3]; });
      var lo = Math.min.apply(null, hs), hi = Math.max.apply(null, hs), f = EVIDENCE.floor;
      var base = bars[0][1] + bars[0][3];
      var mid = (bars[0][0] + bars[4][0] + bars[4][2]) / 2;
      var units = bars.map(function (b, j) {
        var q = (b[3] - lo) / (hi - lo);
        var e = [Math.min(1, Math.max(f, 0.25 + 0.65 * q + JITTER[0][j])),     // progress
                 Math.min(1, Math.max(f, 0.2 + 0.7 * q + JITTER[1][j])),       // proximity
                 q >= 0.45 ? 1 : f,                                            // terminal entry
                 q >= 0.95 ? 1 : f,                                            // stop / handoff
                 Math.max(f, OPERATOR[id])];                                   // operator label
        return e.map(function (v) { return v * EVIDENCE.unit; });
      });
      var stack = units.reduce(function (m, u) { return Math.max(m, u.reduce(function (a, b) { return a + b; }, 0)); }, 0) + 4 * EVIDENCE.gap;
      var target = [mid, base - heq - EVIDENCE.lift - stack - EVIDENCE.above];   // where marks land
      var sy = S[1] + S[3] / 2;
      hist[id] = {
        base: base, mid: mid, units: units, stack: stack, target: target,
        radius: hs.map(function (h) { return Math.max(0.9, L.R * Math.sqrt(h / hmax)); }),
        // the evidence, to s_eta: right to the gutter, along it to the chip gap, across, into s_eta
        fwd: route([target, [g1, target[1]], [g1, laneEv], [g2, laneEv], [g2, sy], [S[0] - 1.2, sy]], CORNER),
        // the weight, back from the transform: left through the chip gap, up the gutter, to the stacks
        back: route([[T[0] - 2.5, laneW], [g1, laneW], [g1, target[1]], target], CORNER),
        // each weighted chunk: up to the lane, along it, down into the loss box through its top edge
        train: bars.map(function (bar, b) {
          var x0 = bar[0] + bar[2] / 2, xe = Lb[0] + Lb[2] / 2 + (i - 1) * 9 + (b - 2) * 1.6;
          return route([[x0, bar[1]], [x0, TRAIN.lane], [xe, TRAIN.lane], [xe, Lb[1] + 1.5]], CORNER);
        })
      };
    });
    derivedFor = L;
    derivedVal = { heq: heq, hmax: hmax, hist: hist };
    return derivedVal;
  }

  // Token k of trace row i at time t: {x, y, o, s, at} (at: hidden | arrow | gate | audit | chunk).
  function tokenAt(L, i, k, t) {
    var row = L.rows[i];
    if (row.fate === "audit" && t < RETRACT) {               // last cycle's gated tokens, at rest
      return { x: L.gate.rest[k], y: row.y, o: 1 - easeInOut(ramp(t, 0, RETRACT)), s: 1, at: "audit" };
    }
    var lead0 = row.tip - 1;                                  // the lead token's slot at the arrow tip
    var e = COLLECT.start + COLLECT.stagger * i;
    var lead = row.x0 + (lead0 - row.x0) * easeInOut(ramp(t, e, e + COLLECT.dur));
    var x = lead - L.SP * k, y = row.y, at = "arrow";
    if (row.fate === "pass") {
      // through the green gate, then on into the Action Chunk column, gliding to the row above the
      // trace's histogram once clear of the gate
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
    var D = derived(L);
    var out = {
      t: t, phase: null, step: null, focus: null, tokens: [], chunks: [], overlay: {}, ev: [], marks: [],
      fwd: [], back: [], wtok: [], pings: {}, march: {}, flash: { pass: 0, audit: 0 }, hits: {}, tick: null, chips: [],
      weight: null, train: null
    };
    var pi = phaseAt(t), si = stepAt(t);
    out.phase = pi < 0 ? null : PHASES[pi].id;
    out.step = si < 0 ? null : si;
    out.focus = focusAt(t, L);

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
      var pp = ramp(t, 0.1 + 0.09 * i, 1.15 + 0.09 * i);
      out.pings[row.trace] = { r: easeOut(pp), o: pp > 0 && pp < 1 ? 1 - easeIn(pp) : 0 };
      out.march[row.trace] = {
        o: ramp(t, e, e + 0.2) * (1 - ramp(t, e + COLLECT.dur - 0.3, e + COLLECT.dur + 0.08)),
        shift: -4.32 * 4 * easeInOut(ramp(t, e, e + COLLECT.dur))
      };
      if (row.fate === "audit") {
        var hit = GATE.audit + GATE.auditStagger * (i - 3) + GATE.approach;
        out.hits[row.trace] = bump(t, hit - 0.05, hit + 0.6);
        out.flash.audit = Math.max(out.flash.audit, bump(t, hit - 0.05, hit + 0.75));
      }
    });

    // Action Chunk: each passing token splits into five squares that drop onto its histogram, and
    // a weight overlay on the paper's bars rises by thirds to one equal height (unweighted); when
    // the weight comes back it takes the paper's heights; it leaves with the weighted tokens.
    PASS.forEach(function (id, i) {
      var h = L.hist[id], d = D.hist[id];
      var frac = 0;
      for (var k = 0; k < L.N; k++) {
        var land = splitAt(i, k);
        frac += easeOut(ramp(t, land + CHUNK.drop - 0.05, land + CHUNK.drop + CHUNK.grow)) / L.N;
        for (var b = 0; b < 5; b++) {
          var bar = h.bars[b];
          var u = ramp(t, land, land + CHUNK.drop);
          var tx = bar[0] + bar[2] / 2 - L.CH / 2, ty = d.base - D.heq * (k + 1) / L.N;
          var sx = L.gate.park - L.SP * k - L.CH / 2, sy = h.entry[1] - L.CH / 2;
          out.chunks.push({
            trace: id, k: k, bar: b,
            x: sx + (tx - sx) * easeOut(u), y: sy + (ty - sy) * easeIn(u),
            o: ramp(t, land, land + 0.05) * (1 - ramp(t, land + CHUNK.drop, land + CHUNK.drop + 0.12))
          });
        }
      }
      if (frac > 1 - 1e-9) frac = 1;
      var A = backLand(i);
      var morph = easeInOut(ramp(t, A + WEIGHT.morph[0], A + WEIGHT.morph[1]));
      var sink = easeIn(ramp(t, A, A + WEIGHT.sink));
      var sinkO = 1 - ramp(t, A + 0.25, A + 0.42);
      out.overlay[id] = h.bars.map(function (bar, b) {
        var hh = D.heq * frac + (bar[3] - D.heq) * morph;
        var o = hh > 1e-3 ? 1 - ramp(t, launchAt(i, b), launchAt(i, b) + TRAIN.fade) : 0;
        return { y: bar[1] + bar[3] - hh, h: hh, o: o };      // on the bar's own baseline
      });
      // the evidence read for each chunk: one segment per chip, stacked above the chunk's bar,
      // growing left to right from where the mark landed
      h.bars.forEach(function (bar, b) {
        var top = out.overlay[id][b].y - EVIDENCE.lift;
        for (var c = 0; c < 5; c++) {
          var m1 = evLand(c, i) + EVIDENCE.barStagger * b;
          var hh = d.units[b][c] * easeOut(ramp(t, m1 - 0.02, m1 + EVIDENCE.grow)) * (1 - sink);
          out.ev.push({ trace: id, bar: b, chip: c, y: top - hh, h: hh,
                        o: hh > 1e-4 ? ramp(t, m1 - 0.02, m1 + 0.04) * sinkO : 0 });
          if (hh > 1e-4) top -= hh + EVIDENCE.gap;
        }
      });
    });

    // Process evidence: a tick runs down the chips; each glows as it is read and sends a mark in
    // its colour to each histogram
    var reads = [0, 1, 2, 3, 4].map(function (k) { return EVIDENCE.read + EVIDENCE.step * k; });
    out.chips = reads.map(function (r) { return glow(t, r); });
    var pos = 0;
    for (var k2 = 1; k2 < 5; k2++) pos += easeInOut(ramp(t, reads[k2 - 1] + 0.06, reads[k2] - 0.02));
    var c0 = Math.floor(Math.min(pos, 3.999)), f = pos - c0;
    out.tick = {
      y: L.chips[c0][1] + (L.chips[Math.min(c0 + 1, 4)][1] - L.chips[c0][1]) * f,
      o: ramp(t, reads[0] - 0.1, reads[0] - 0.02) * (1 - ramp(t, reads[4] + 0.25, reads[4] + 0.45))
    };
    reads.forEach(function (r, c) {
      PASS.forEach(function (id, i) {
        var m1 = evLand(c, i), m0 = m1 - EVIDENCE.flight;
        var p0 = [L.chipX0 - 1.2, L.chips[c][1]], p2 = D.hist[id].target;
        var p = curve(p0, bow(p0, p2, 5), p2, easeInOut(ramp(t, m0, m1)));
        out.marks.push({ chip: c, trace: id, x: p[0], y: p[1],
                         o: ramp(t, m0, m0 + 0.06) * (1 - ramp(t, m1 - 0.03, m1 + 0.05)) });
      });
    });

    // Evidence to weight: each histogram's evidence goes to s_eta (in its trace's colour) as eta
    // glows and a pulse runs down to s_eta; s_eta glows, a pulse down, the transform; a brass sweep
    // fills the gauge; brass marks carry the weight back to the histograms
    PASS.forEach(function (id, i) {
      var f1 = fwdLand(i), f0 = f1 - WEIGHT.fwdFlight;
      var p = along(D.hist[id].fwd, easeInOut(ramp(t, f0, f1)));
      out.fwd.push({ trace: id, x: p[0], y: p[1], o: ramp(t, f0, f0 + 0.06) * (1 - ramp(t, f1 - 0.04, f1 + 0.06)) });
    });
    function pulse(ab) {
      return { u: easeInOut(ramp(t, ab[0], ab[1])), o: ramp(t, ab[0], ab[0] + 0.05) * (1 - ramp(t, ab[1] - 0.05, ab[1])) };
    }
    out.weight = {
      eta: glow(t, WEIGHT.eta), pulses: WEIGHT.pulses.map(pulse),
      score: glow(t, WEIGHT.score), transform: glow(t, WEIGHT.transform),
      sweep: { w: easeOut(ramp(t, WEIGHT.sweep[0], WEIGHT.sweep[1])),
               o: ramp(t, WEIGHT.sweep[0], WEIGHT.sweep[0] + 0.05) * (1 - ramp(t, WEIGHT.sweepOut[0], WEIGHT.sweepOut[1])) }
    };
    PASS.forEach(function (id, i) {
      var q1 = backLand(i), q0 = q1 - WEIGHT.backFlight;
      var p = along(D.hist[id].back, easeInOut(ramp(t, q0, q1)));
      out.back.push({ trace: id, x: p[0], y: p[1], o: ramp(t, q0, q0 + 0.06) * (1 - ramp(t, q1 - 0.03, q1 + 0.06)) });
    });

    // VLA training: every chunk, as a token sized by its weight, goes into the weighted native loss
    PASS.forEach(function (id, i) {
      var d = D.hist[id];
      L.hist[id].bars.forEach(function (bar, b) {
        var l0 = launchAt(i, b), l1 = l0 + TRAIN.flight;
        var p = along(d.train[b], easeInOut(ramp(t, l0, l1)));
        out.wtok.push({ trace: id, bar: b, x: p[0], y: p[1],
                        r: d.radius[b] * easeOut(ramp(t, l0, l0 + 0.15)) * (1 - 0.6 * ramp(t, l1 - 0.12, l1)),
                        o: ramp(t, l0, l0 + 0.05) * (1 - ramp(t, l1 - 0.1, l1)) });
      });
    });

    function ripple(ab) {
      var u = ramp(t, ab[0], ab[1]);
      return { u: u, o: u > 0 && u < 1 ? 0.7 * (1 - u) : 0 };
    }
    var edges = L.edges.map(function () { return 0; });
    var litAt = L.edges.map(function () { return Infinity; });
    L.edgeOrder.forEach(function (e, j) { litAt[e] = TRAIN.edge0 + TRAIN.edgeStep * j; edges[e] = glow(t, litAt[e]); });
    var nodeAt = L.nodes.map(function (_, n) {
      if (L.nodeOrder.indexOf(n) < 2) return TRAIN.inputs;    // the inputs light first
      var first = Infinity;
      L.edges.forEach(function (e, m) { if (e.a === n || e.b === n) first = Math.min(first, litAt[m]); });
      return first + 0.1;
    });
    out.train = {
      loss: glow(t, TRAIN.loss), ripple: TRAIN.ripples.map(ripple),
      edges: edges, nodes: nodeAt.map(function (r) { return glow(t, r); }),
      val: glow(t, TRAIN.val), jval: bump(t, TRAIN.jval[0], TRAIN.jval[1])
    };
    return out;
  }

  // The cycle at time t (clamped to [0, DURATION]); both ends are the complete figure at rest.
  function state(time, L) {
    var t = time < 0 ? 0 : time > DURATION ? DURATION : time;
    return cycle(t, L);
  }

  /* -------------------------------------------------------- controller */

  // c = {t, playing, until, pinned, started, reduced}. The player plays the cycle once and rests at
  // DURATION; a pinned step plays its own phases and holds at their end.
  function initial(opts) {
    return { t: DURATION, playing: false, until: null, pinned: null, started: false, reduced: !!(opts && opts.reduced) };
  }

  function copy(c) {
    return { t: c.t, playing: c.playing, until: c.until, pinned: c.pinned, started: c.started, reduced: c.reduced };
  }

  function play(n, t) { n.started = true; n.playing = true; n.until = null; n.pinned = null; if (t !== undefined) n.t = t; return n; }

  // Paused: mid-cycle, or holding a pinned step. At rest (the cycle has played) nothing is paused.
  function paused(c) { return !c.reduced && c.started && !c.playing && (c.pinned !== null || c.t < DURATION); }
  function canToggle(c) { return !c.reduced && (c.playing || paused(c)); }

  function control(c, a) {
    var n = copy(c);
    switch (a.type) {
      case "view":                                   // first time in view: play the cycle once
        if (c.started || c.reduced) return c;
        return play(n, 0);
      case "tick":
        if (!c.playing) return c;
        var dt = Math.min(Math.max(a.dt || 0, 0), MAX_DT);
        var end = c.until !== null ? c.until : DURATION;
        n.t = Math.min(end, c.t + dt);
        if (n.t >= end) n.playing = false;           // a pinned step holds; the cycle rests
        return n;
      case "toggle":
        if (!canToggle(c)) return c;
        if (c.playing) { n.playing = false; return n; }
        return play(n);                              // play on to the end of the cycle
      case "pause":
        if (!c.playing) return c;
        n.playing = false;
        return n;
      case "replay":
        if (c.reduced) return c;
        return play(n, 0);
      case "seek":
        if (c.reduced) return c;
        n.started = true;
        n.t = Math.max(0, Math.min(DURATION, a.t));
        n.pinned = null;
        n.until = null;
        return n;
      case "finish":                                 // print, screenshots: the complete figure, unpinned
        n.started = true; n.t = DURATION; n.playing = false; n.until = null; n.pinned = null;
        return n;
      case "step":
        n.started = true;
        if (c.reduced) { n.pinned = c.pinned === a.k ? null : a.k; return n; }
        if (c.pinned === a.k) return play(n);         // the same step again: play on to the end
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

  /* --------------------------------------------------------------- DOM */

  var active = null;

  function f2(v) { return String(Math.round(v * 100) / 100); }

  // Attribute writes only when the value changes (the figure has a few hundred moving marks).
  function put(el, name, v) {
    var memo = el.__f2 || (el.__f2 = {});
    if (memo[name] === v) return;
    el.setAttribute(name, v);
    memo[name] = v;
  }

  function setOpacity(el, o) {
    if (o >= 1) { if (el.hasAttribute("opacity")) el.removeAttribute("opacity"); if (el.__f2) el.__f2.opacity = null; }
    else put(el, "opacity", f2(Math.max(0, o)));
  }

  function scaleAbout(el, k, cx, cy) {
    if (Math.abs(k - 1) < 1e-4) { if (el.hasAttribute("transform")) el.removeAttribute("transform"); if (el.__f2) el.__f2.transform = null; }
    else put(el, "transform", "matrix(" + [f2(k), 0, 0, f2(k), f2(cx * (1 - k)), f2(cy * (1 - k))].join(" ") + ")");
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
    var toggleText = toggleBtn && toggleBtn.querySelector(".fig2__btn-text");
    var replayBtn = controls && controls.querySelector('[data-fig2="replay"]');
    var W = svg.viewBox.baseVal.width;
    function q(sel) { return svg.querySelector(sel); }
    function qa(sel) { return Array.prototype.slice.call(svg.querySelectorAll(sel)); }
    function num(el, a) { return parseFloat(el.getAttribute(a)); }
    function centre(r) { return [num(r, "x") + num(r, "width") / 2, num(r, "y") + num(r, "height") / 2]; }
    function keyed(sel, attrs) {
      var m = {};
      qa(sel).forEach(function (el) { m[attrs.map(function (a) { return el.getAttribute("data-" + a); }).join("|")] = el; });
      return m;
    }
    function need(m, key) { if (!m[key]) throw new Error("fig2: no moving mark " + key); return m[key]; }

    /* the moving marks, read once from the generated SVG */
    var tokens = qa(".f2-token").map(function (g) {
      return { core: g.querySelector(".f2-token__core"), halo: g.querySelector(".f2-token__halo"), g: g,
               trail: Array.prototype.slice.call(g.querySelectorAll(".f2-token__trail")) };
    });
    var trailO = tokens[0].trail.map(function (c) { return num(c, "data-o"); });
    var chunks = keyed(".f2-chunk", ["trace", "k", "bar"]);
    var wbars = keyed(".f2-wbar", ["trace", "bar"]);
    var evs = keyed(".f2-ev", ["trace", "bar", "chip"]);
    var marks = keyed(".f2-evmark", ["chip", "trace"]);
    var fwds = keyed(".f2-evsum", ["trace"]);
    var backs = keyed(".f2-wret", ["trace"]);
    var wtoks = keyed(".f2-wtok", ["trace", "bar"]);
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
    var sweep = q(".f2-gauge__sweep"), sweepW = num(sweep, "data-w");
    var ripple = q(".f2-ripple"), rippleC = centre(ripple);
    var edgeGlows = qa(".f2-edge-glow");
    var nodes = qa(".f2-node");
    var jval = q(".f2-jval"), jvalAura = jval.querySelector(".f2-aura"), jvalC = centre(jvalAura);

    /* state -> SVG */
    function apply(s) {
      s.tokens.forEach(function (tk, i) {
        var el = tokens[i];
        setOpacity(el.g, tk.o);
        if (tk.o <= 0 && el.g.__f2 && el.g.__f2.opacity === "0") return;   // hidden: leave it be
        put(el.core, "cx", f2(tk.x));
        put(el.core, "cy", f2(tk.y));
        put(el.core, "r", f2(L.R * Math.max(tk.s, 0.05)));
        put(el.halo, "cx", f2(tk.x));
        put(el.halo, "cy", f2(tk.y));
        put(el.halo, "opacity", f2(tk.halo));
        tk.trail.forEach(function (p, m) {
          var c = el.trail[m];
          put(c, "cx", f2(p.x));
          put(c, "cy", f2(p.y));
          put(c, "opacity", f2(p.o * trailO[m]));
        });
      });
      s.chunks.forEach(function (c) {
        var el = need(chunks, c.trace + "|" + c.k + "|" + c.bar);
        put(el, "opacity", f2(c.o));
        if (c.o <= 0) return;
        put(el, "x", f2(c.x));
        put(el, "y", f2(c.y));
      });
      PASS.forEach(function (id) {
        s.overlay[id].forEach(function (v, b) {
          var el = need(wbars, id + "|" + b);
          put(el, "opacity", f2(v.o));
          if (v.o <= 0) return;
          put(el, "y", f2(v.y));
          put(el, "height", f2(v.h));
        });
      });
      s.ev.forEach(function (v) {
        var el = need(evs, v.trace + "|" + v.bar + "|" + v.chip);
        put(el, "opacity", f2(v.o));
        if (v.o <= 0) return;
        put(el, "y", f2(v.y));
        put(el, "height", f2(v.h));
      });
      s.marks.forEach(function (v) {
        var el = need(marks, v.chip + "|" + v.trace);
        put(el, "opacity", f2(v.o));
        if (v.o <= 0) return;
        put(el, "cx", f2(v.x));
        put(el, "cy", f2(v.y));
      });
      s.fwd.forEach(function (v) {
        var el = need(fwds, v.trace);
        put(el, "opacity", f2(v.o));
        if (v.o <= 0) return;
        put(el, "cx", f2(v.x));
        put(el, "cy", f2(v.y));
      });
      s.back.forEach(function (v) {
        var el = need(backs, v.trace);
        put(el, "opacity", f2(v.o));
        if (v.o <= 0) return;
        put(el, "cx", f2(v.x));
        put(el, "cy", f2(v.y));
      });
      s.wtok.forEach(function (v) {
        var el = need(wtoks, v.trace + "|" + v.bar);
        put(el, "opacity", f2(v.o));
        if (v.o <= 0) return;
        put(el, "cx", f2(v.x));
        put(el, "cy", f2(v.y));
        put(el, "r", f2(Math.max(v.r, 0.05)));
      });
      Object.keys(pings).forEach(function (id) {
        put(pings[id], "r", f2(9 * s.pings[id].r));
        put(pings[id], "opacity", f2(s.pings[id].o));
        put(march[id], "opacity", f2(s.march[id].o));
        put(march[id], "stroke-dashoffset", f2(s.march[id].shift));
      });
      Object.keys(hits).forEach(function (id) { put(hits[id], "opacity", f2(s.hits[id])); });
      put(flash.pass, "opacity", f2(0.32 * s.flash.pass));
      put(flash.audit, "opacity", f2(0.3 * s.flash.audit));
      function glowBox(b, g) {
        put(b.aura, "opacity", f2(0.4 * g));
        if (b.box) put(b.box, "stroke-width", f2(b.w + 0.9 * g));
      }
      s.chips.forEach(function (g, k) { glowBox(chips[k], g); });
      put(tick, "transform", "translate(" + f2(L.tickX) + " " + f2(s.tick.y) + ")");
      put(tick, "opacity", f2(s.tick.o));
      var w = s.weight;
      glowBox(boxes.eta, w.eta);
      glowBox(boxes.score, w.score);
      glowBox(boxes.transform, w.transform);
      w.pulses.forEach(function (p, k) {
        var a = L.warrows[k];
        put(pulses[k], "cy", f2(a[1] + (a[2] - a[1]) * p.u));
        put(pulses[k], "opacity", f2(p.o));
      });
      put(sweep, "width", f2(sweepW * w.sweep.w));
      put(sweep, "opacity", f2(w.sweep.o));
      var tr = s.train;
      glowBox(boxes.loss, tr.loss);
      glowBox(boxes.val, tr.val);
      var rp = tr.ripple[0].o >= tr.ripple[1].o ? tr.ripple[0] : tr.ripple[1];
      put(ripple, "opacity", f2(rp.o));
      scaleAbout(ripple, 1 + 0.1 * rp.u, rippleC[0], rippleC[1]);
      tr.edges.forEach(function (g, e) { put(edgeGlows[e], "opacity", f2(g)); });
      tr.nodes.forEach(function (g, n) { scaleAbout(nodes[n], 1 + 0.22 * g, L.nodes[n][0], L.nodes[n][1]); });
      put(jvalAura, "opacity", f2(0.3 * tr.jval));
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
        put(r.el, "x1", f2(r.cx - h));
        put(r.el, "x2", f2(r.cx + h));
        setOpacity(r.el, r.o);
      });
    }

    /* narrow screens: during playback the scroller follows the active columns (state focus) with
       its own eased tween; the reader's first sideways scroll of the figure stops it until Replay.
       Only the scroller's scrollLeft is ever set: the auto-follow never scrolls the page. */
    var follow = { on: true, key: null, set: scroller ? scroller.scrollLeft : 0, tween: null };
    function scrollable() { return !!scroller && scroller.scrollWidth - scroller.clientWidth > 1; }
    // The scrollLeft that brings range (pt) into view with the least movement; a range wider than
    // the view falls back to `narrower` if given, else keeps its right end (where the flow goes).
    function goalFor(range, narrower) {
      if (!range || !scrollable()) return null;
      var max = scroller.scrollWidth - scroller.clientWidth;
      var sr = svg.getBoundingClientRect(), cr = scroller.getBoundingClientRect();
      var k = sr.width / W, off = sr.left - cr.left + scroller.scrollLeft, pad = 10;
      var a = off + range[0] * k - pad, b = off + range[1] * k + pad;
      var view = scroller.clientWidth, cur = scroller.scrollLeft, g;
      if (b - a > view && narrower) return goalFor(narrower);
      if (b - a <= view) g = a < cur ? a : b > cur + view ? b - view : cur;
      else g = b - view;
      if (g < 2 * pad) g = 0;                              // near an edge: go to the edge (the cue clears)
      if (g > max - 2 * pad) g = max;
      return Math.max(0, Math.min(max, g));
    }
    function scrollTo(g) {
      if (g === null) return;
      if (still) { scroller.scrollLeft = g; follow.set = scroller.scrollLeft; follow.tween = null; return; }
      var from = scroller.scrollLeft;
      if (Math.abs(g - from) <= 2) { follow.tween = null; return; }
      follow.tween = { from: from, to: g, u: 0, dur: Math.min(1.0, Math.max(0.5, 0.35 + Math.abs(g - from) / 700)) };
    }
    function stepScroll(dt) {
      var tw = follow.tween;
      if (!tw) return;
      tw.u = Math.min(1, tw.u + dt / tw.dur);
      scroller.scrollLeft = tw.from + (tw.to - tw.from) * easeInOut(tw.u);
      follow.set = scroller.scrollLeft;
      if (tw.u >= 1) follow.tween = null;
    }
    // While it plays and follows, the "scroll" hint steps aside (it invites the sideways scroll
    // that would stop the following).
    function followCue() { fig.classList.toggle("is-following", follow.on && c.playing && !still); }
    function stopFollowing() { follow.on = false; follow.tween = null; followCue(); }
    if (scroller) {
      // Only a sideways scroll of the figure stops following. A touch or a vertical swipe or wheel
      // that starts on the figure scrolls the page and does not count; every real sideways scroll
      // (a touch pan, the scrollbar, keys, assistive technology, momentum) moves scrollLeft away
      // from where the follow put it, and that stops it.
      scroller.addEventListener("scroll", function () {
        if (Math.abs(scroller.scrollLeft - follow.set) > 2) stopFollowing();
      }, { passive: true });
      // a sideways wheel or trackpad gesture stops it at once, before its scroll lands
      scroller.addEventListener("wheel", function (e) {
        if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) stopFollowing();
      }, { passive: true });
      scroller.addEventListener("keydown", function (e) {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") stopFollowing();
      });
    }
    // A step click brings its columns into view (an explicit request: also when not following):
    // all of them if they fit, else where its motion starts.
    function reveal(k) {
      if (k === null || !scroller) return;
      var start = focusAt(stepRange(k)[0], L);
      follow.key = String(start);
      scrollTo(goalFor(stepFocus(k, L), start));
    }
    // A step click is also a request to see the figure: the steps sit below it, so when it is
    // (partly) off screen the page scrolls the least that shows all of it, below the sticky bar
    // (the html scroll-padding). The reader asked for this scroll; the auto-follow never scrolls
    // the page.
    var view = fig.querySelector(".fig2__view") || svg;
    function bringIntoView() {
      if (!view.scrollIntoView) return;
      var r = view.getBoundingClientRect();
      var top = parseFloat(win.getComputedStyle(doc.documentElement).scrollPaddingTop) || 0;
      if (r.top >= top - 1 && r.bottom <= win.innerHeight + 1) return;
      view.scrollIntoView({ block: "nearest", inline: "nearest", behavior: still ? "instant" : "smooth" });
    }

    /* the player */
    var c = initial({ reduced: still });
    var visible = !hasIO;
    var raf = 0, last = 0, drawn = null, drawnT = -1, shown, wasPaused, wasToggle;
    guard.stop = function () { if (raf) win.cancelAnimationFrame(raf); raf = 0; };

    function render() {
      try {
        if (c.t !== drawnT) { drawn = state(c.t, L); apply(drawn); drawnT = c.t; }
        drawRules();
      } catch (err) { guard.fail(err); }
    }
    // Buttons follow the player; the DOM is touched only when the pressed step or pause state changes.
    function sync() {
      var k = pressed(c);
      if (k !== shown) {
        steps.forEach(function (s, i) { s.setAttribute("aria-pressed", String(i === k)); });
        rulesTarget(k);
        shown = k;
      }
      var p = paused(c), tg = canToggle(c);
      if (toggleBtn && p !== wasPaused) {
        toggleBtn.classList.toggle("is-paused", p);      // the icon and the label say what a click does
        if (toggleText) toggleText.textContent = p ? "Play" : "Pause";
        wasPaused = p;
      }
      if (toggleBtn && tg !== wasToggle) {
        toggleBtn.setAttribute("aria-disabled", String(!tg));
        wasToggle = tg;
      }
      followCue();
    }
    function followFocus() {
      if (!follow.on || still || !c.playing || !drawn || !drawn.focus || String(drawn.focus) === follow.key) return;
      follow.key = String(drawn.focus);
      scrollTo(goalFor(drawn.focus));
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
      if (guard.broken) return;
      if (scroller) { followFocus(); stepScroll(Math.min(dt, MAX_DT)); }
      if ((c.playing && visible) || rulesMoving() || follow.tween) raf = win.requestAnimationFrame(frame);
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
    function replay() {
      if (guard.broken) return;
      follow.on = true;
      follow.key = null;
      dispatch({ type: "replay" });
    }
    function choose(k) {
      if (guard.broken) return;
      dispatch({ type: "step", k: k });
      reveal(pressed(c));
      bringIntoView();
      kick();
    }

    steps.forEach(function (s, k) {
      s.setAttribute("aria-controls", "fig2-frame");
      s.addEventListener("click", function () { choose(k); });
    });
    if (controls && !still) {
      controls.hidden = false;
      toggleBtn.addEventListener("click", function () { dispatch({ type: "toggle" }); });
      replayBtn.addEventListener("click", replay);
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

    // Play once when first seen: start once a good part of the figure is in view; time stands still
    // while the figure is entirely off screen.
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
      play: function () { if (paused(c)) dispatch({ type: "toggle" }); else if (!c.playing) replay(); },
      pause: function () { dispatch({ type: "pause" }); },
      replay: replay,
      select: choose,
      state: function () { return state(c.t, L); },
      following: function () { return follow.on; }
    };
    Object.defineProperty(api, "ctl", { get: function () { return c; } });
    active = api;
    return api;
  }

  var API = {
    DURATION: DURATION,
    RETRACT: RETRACT,
    MAX_DT: MAX_DT,
    PHASES: PHASES,
    STEPS: STEPS,
    TRACES: TRACES,
    phaseAt: phaseAt,
    stepAt: stepAt,
    stepRange: stepRange,
    focusAt: focusAt,
    stepFocus: stepFocus,
    state: state,
    initial: initial,
    control: control,
    pressed: pressed,
    paused: paused,
    canToggle: canToggle,
    mount: mount,
    finish: function () { if (active) active.finish(); }
  };
  Object.defineProperty(API, "active", { get: function () { return active; } });
  return API;
})();

if (typeof module !== "undefined" && module.exports) module.exports = PACERFig2;

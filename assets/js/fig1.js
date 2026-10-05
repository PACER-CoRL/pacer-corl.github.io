/* PACER project page — Fig. 1 (#idea): the paper's four rollout traces as a dynamic figure.

   index.html carries the complete figure (Task 12): the paper's eight clean photos, each with
   an inline SVG overlay whose viewBox is the photo's rect in PDF points, the four status
   chips and the "E. Human Corrections" bracket; geometry and colours come from the paper's
   PDF (_dev/tools/extract_fig1.py). Without JS, without IntersectionObserver, under
   prefers-reduced-motion and in print, that complete state is what shows.

   R40 (author): the figure itself is never washed, dimmed or bleached; motion is additive.
   Only the moving marks appear and reset: the bold annotations (with a one-time pulse), the
   status chips, and the correction dot with the glows it lights. While the figure is in view
   it loops: one panel at a time, A -> D, the panel lifts ~2 px while its annotations draw and
   pulse, then its chip slides up; then a blue dot runs the correction bracket from D's drop,
   past C's and B's (each lights as it passes; the operator nods), up into A's arrowhead,
   which pulses, and the E chip appears. The complete figure holds ~1.8 s, the marks fade out
   in 0.3 s, and the cycle restarts. It pauses out of view; Pause/Play (aria-pressed) and
   Replay are in the bar under the figure.

   Selecting a trace (click or tap; keyboard focus) shows its one-line caption (Main.tex, the
   role mapping) and outlines it in brass; the loop pauses on the complete figure until the
   selection is cleared (the same trace again, or Escape).

   state(t) is a pure function of the cycle time and control(s, event) the pure player, so
   both are unit-tested in node (_dev/tests/fig1.test.js). Classes on figure.fig1:
   fig1--anim (animating), is-playing (the loop runs), is-drawn (the complete state shows).

   Classic script (no modules, no fetch) so the page works from file://.
   Public API (window.PACERFig1): the timeline (PANELS, TRACKS, DRAW_END, HOLD, RESET,
   HOLD_END, PERIOD, ease, state), the geometry helpers (lengthOf, pointAt, fractionAtX,
   glowAt, nodAt), the player (init, control, running, shownTime) and, once mounted,
   seek(t), finish(), replay(), select(key | null), status().
*/
var PACERFig1 = (function () {
  "use strict";

  var win = typeof window !== "undefined" ? window : null;
  var doc = win ? win.document : null;

  /* ----------------------------------------------------------- timeline */

  var PANELS = ["A", "B", "C", "D"];
  var T0 = 0.3;          // s: the first panel lifts
  var STEP = 1.1;        // s per panel
  var PULSE = 0.7;       // s: a mark's one-time pulse
  var HOLD = 1.8;        // s: the complete figure holds
  var RESET = 0.3;       // s: the marks fade out (the only fade, and only of the marks)
  var DOT_FADE = 0.25;   // s: the dot rests in A's arrowhead, then fades
  var MAX_DT = 0.25;     // s: a long frame gap (a background tab) never jumps the figure ahead
  var LIFT_RAMP = 0.3;   // s: a panel rises at the start of its step and settles after it
  var LIFT_PX = 2;       // px: how far it rises
  // The correction dot's soft trail: three overlapping strokes along the path from where the
  // dot was this long ago up to the dot, thinner and fainter the longer the lag (a comet tail
  // that is long when the dot is quick and folds away as it eases in and out).
  var TRAIL_LAGS = [0.04, 0.075, 0.12];   // s

  var TRACKS = [];
  function r3(x) { return Math.round(x * 1000) / 1000; }
  function add(key, kind, t0, t1) { TRACKS.push({ key: key, kind: kind, t0: r3(t0), t1: r3(t1) }); }

  // Per panel: it lifts for its whole step; the top and bottom photos' annotations draw 0.1 s
  // apart, a head lands as its shaft arrives, each mark pulses once when done, then the chip.
  PANELS.forEach(function (p, i) {
    var s = T0 + i * STEP;
    add(p, "lift", s, s + STEP);
    [1, 2].forEach(function (row) {
      var id = p + row;
      var a = s + 0.12 + (row - 1) * 0.1, b = a + 0.5, done = b;
      add(id, "draw", a, b);
      if (p === "B" || p === "C") { add(id + "-head", "head", b - 0.08, b + 0.17); done = b + 0.17; }
      add(id, "pulse", done, done + PULSE);
    });
    add(p + "-chip", "chip", s + 0.86, s + STEP);
  });
  // E: the correction dot runs the bracket; A's arrowhead pulses on arrival; the E chip.
  var E0 = T0 + PANELS.length * STEP;
  add("E-dot", "dot", E0 + 0.05, E0 + 1.3);
  add("E-head", "pulse", E0 + 1.3, E0 + 1.3 + PULSE);
  add("E-chip", "chip", E0 + 1.25, E0 + 1.55);

  var DRAW_END = TRACKS.reduce(function (m, t) { return Math.max(m, t.t1); }, 0);
  var HOLD_END = r3(DRAW_END + HOLD);
  var PERIOD = r3(HOLD_END + RESET);
  var DOT = TRACKS.filter(function (t) { return t.kind === "dot"; })[0];

  // Calm in-and-out (sine): ease(0) = 0, ease(1) = 1, symmetric about 1/2.
  function ease(u) {
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    return 0.5 - 0.5 * Math.cos(Math.PI * u);
  }

  function progress(track, t) { return ease((t - track.t0) / (track.t1 - track.t0)); }

  // Everything the figure shows at cycle time t (wrapped into [0, PERIOD)).
  function wrap(t) {
    var w = t % PERIOD;
    return w < 0 ? w + PERIOD : w;
  }

  function state(time) {
    var t = wrap(time);
    var st = {
      t: t,
      phase: t < DRAW_END ? "draw" : t <= HOLD_END ? "hold" : "reset",
      current: null,
      lift: {},
      fade: t > HOLD_END ? 1 - ease((t - HOLD_END) / RESET) : 1,
      marks: {},
      pulses: {},
      dot: null
    };
    TRACKS.forEach(function (tr) {
      if (tr.kind === "lift") {
        if (t >= tr.t0 && t < tr.t1) st.current = tr.key;
        st.lift[tr.key] = Math.min(ease((t - tr.t0) / LIFT_RAMP), ease((tr.t1 + LIFT_RAMP - t) / LIFT_RAMP));
      } else if (tr.kind === "pulse") {
        st.pulses[tr.key] = t > tr.t0 && t < tr.t1 ? (t - tr.t0) / (tr.t1 - tr.t0) : 0;
      } else if (tr.kind !== "dot") {
        st.marks[tr.key] = progress(tr, t);
      }
    });
    if (t >= DOT.t0 && t <= DOT.t1 + DOT_FADE) {
      var alpha = Math.min(1, (t - DOT.t0) / 0.12, 1 - (t - DOT.t1) / DOT_FADE);
      st.dot = {
        f: progress(DOT, t), alpha: Math.max(0, alpha),
        trail: TRAIL_LAGS.map(function (lag) { return progress(DOT, t - lag); })
      };
    }
    return st;
  }

  /* ------------------------------------------- geometry along the bracket */

  function segLen(a, b) { return Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])); }

  function lengthOf(pts) {
    var L = 0;
    for (var i = 1; i < pts.length; i++) L += segLen(pts[i - 1], pts[i]);
    return L;
  }

  // The point a fraction f of the way along the polyline.
  function pointAt(pts, f) {
    var goal = Math.max(0, Math.min(1, f)) * lengthOf(pts);
    for (var i = 1; i < pts.length; i++) {
      var l = segLen(pts[i - 1], pts[i]);
      if (goal <= l || i === pts.length - 1) {
        var u = l ? Math.min(1, goal / l) : 0;
        return [pts[i - 1][0] + u * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + u * (pts[i][1] - pts[i - 1][1])];
      }
      goal -= l;
    }
    return pts[pts.length - 1].slice();
  }

  // The piece of the polyline between fractions f0 <= f1, corners included.
  function subpath(pts, f0, f1) {
    var L = lengthOf(pts), a = Math.max(0, f0) * L, b = Math.min(1, f1) * L, acc = 0;
    var out = [pointAt(pts, f0)];
    for (var i = 1; i < pts.length - 1; i++) {
      acc += segLen(pts[i - 1], pts[i]);
      if (acc > a && acc < b) out.push(pts[i].slice());
    }
    out.push(pointAt(pts, f1));
    return out;
  }

  // The fraction at which the path's horizontal run (the bracket line) reaches x.
  function fractionAtX(pts, x) {
    var acc = 0, L = lengthOf(pts);
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i];
      if (a[1] === b[1] && x <= Math.max(a[0], b[0]) && x >= Math.min(a[0], b[0])) return (acc + Math.abs(x - a[0])) / L;
      acc += segLen(a, b);
    }
    return null;
  }

  // How brightly a drop glows when the dot is at f; its junction is at fJ. The lead (D's
  // drop) is lit while the dot runs down it.
  var GLOW_W = 0.1;
  function glowAt(f, fJ, lead) {
    if (lead && f <= fJ) return 1;
    var g = 1 - Math.abs(f - fJ) / GLOW_W;
    return g > 0 ? ease(g) : 0;
  }

  // The operator's nod (degrees) as the dot passes under it: a single 3-degree dip.
  var NOD = 3, NOD_W = 0.12;
  function nodAt(f, fJ) {
    var u = Math.abs(f - fJ) / NOD_W;
    return u < 1 ? -NOD * ease(1 - u) : 0;
  }

  /* -------------------------------------------------------------- player */

  function init() { return { t: 0, visible: false, paused: false, selected: null, held: false }; }

  function running(s) { return s.visible && !s.paused && !s.selected && !s.held; }

  function shownTime(s) { return s.t; }

  function complete(t) { return t >= DRAW_END && t <= HOLD_END; }

  // The pure player. Events: tick {dt}, visible {on}, toggle, replay, select {key, keep},
  // clear, seek {t}, finish, release.
  function control(s, ev) {
    var n = { t: s.t, visible: s.visible, paused: s.paused, selected: s.selected, held: s.held };
    switch (ev.type) {
      case "tick":
        if (running(s)) n.t = (s.t + Math.min(Math.max(ev.dt || 0, 0), MAX_DT)) % PERIOD;
        break;
      case "visible":
        n.visible = !!ev.on;
        break;
      case "toggle":                       // Pause/Play; after a hold (seek, finish) it plays on
        if (s.held) { n.held = false; n.paused = false; } else n.paused = !s.paused;
        break;
      case "replay":
        n.t = 0; n.paused = false; n.held = false; n.selected = null;
        break;
      case "select":                       // the same trace again clears it (a toggle button)
        if (!ev.key || (ev.key === s.selected && !ev.keep)) { n.selected = null; break; }
        n.selected = ev.key;
        if (!complete(s.t)) n.t = DRAW_END;   // pause on the complete figure; clearing resumes in the hold
        break;
      case "clear":
        n.selected = null;
        break;
      case "seek":
        n.t = wrap(ev.t); n.held = true;
        break;
      case "finish":
        n.t = DRAW_END; n.held = true;
        break;
      case "release":
        n.held = false;
        break;
    }
    return n;
  }

  /* ------------------------------------------------------------ the page */

  var api = null;      // set by mount(): the live figure's controls

  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  function parsePath(text) {
    return String(text).trim().split(/\s+/).map(function (p) { return p.split(",").map(Number); });
  }

  function mount(root) {
    if (root.__pacerFig1) return root.__pacerFig1;
    var q = function (sel) { return root.querySelectorAll(sel); };
    var drawn = q("[data-draw]"), pulses = q("[data-pulse]");
    var panels = q(".fig1-panel"), buttons = q("button[data-trace]"), lines = q(".fig1-role__line");
    var frames = {};
    each(panels, function (b) { frames[b.getAttribute("data-trace")] = b.querySelector(".fig1-panel__frame"); });
    var photos = q(".fig1-photo img");
    var hint = root.querySelector(".fig1-role__hint");
    var controls = root.querySelector(".fig1-controls");
    var toggleBtn = root.querySelector(".fig1-toggle"), replayBtn = root.querySelector(".fig1-replay");
    var dots = Array.prototype.map.call(q("[data-dot]"), function (g) {
      var pts = parsePath(g.getAttribute("data-path"));
      var svg = g.ownerSVGElement || g.parentNode;
      return {
        el: g, pts: pts, name: g.getAttribute("data-dot"),
        trail: Array.prototype.slice.call(root.querySelectorAll('[data-trail="' + g.getAttribute("data-dot") + '"]')),
        glows: Array.prototype.map.call(svg.querySelectorAll("[data-glow]"), function (el) {
          var key = el.getAttribute("data-glow");
          return { el: el, f: fractionAtX(pts, +el.getAttribute("data-at")), lead: key === "D" };
        })
      };
    });
    var nods = Array.prototype.map.call(q("[data-nod]"), function (el) {
      var d = dots.filter(function (x) { return x.name === el.getAttribute("data-nod"); })[0];
      return { el: el, f: d ? fractionAtX(d.pts, +el.getAttribute("data-at")) : null };
    });

    var motion = !(win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches);
    var anim = motion && "IntersectionObserver" in win && "requestAnimationFrame" in win;
    var s = init();
    var raf = 0, last = null, pointer = false;

    function apply(st) {
      var fade = st.fade;
      each(drawn, function (el) {
        var p = st.marks[el.getAttribute("data-draw")];
        if (p === undefined) return;
        if (el.classList.contains("fig1-stroke")) {
          el.style.strokeDashoffset = String(1 - p);
          el.style.opacity = p > 0 ? String(fade) : "0";
        } else if (el.classList.contains("fig1-chip")) {
          el.style.opacity = String(p * fade);
          el.style.transform = p < 1 ? "translateY(" + ((1 - p) * 8).toFixed(2) + "px)" : "";
        } else {                                                 // arrow heads
          el.style.opacity = String(p * fade);
          el.style.transform = p < 1 ? "scale(" + (0.55 + 0.45 * p).toFixed(4) + ")" : "";
        }
      });
      each(pulses, function (el) {
        var v = st.pulses[el.getAttribute("data-pulse")] || 0;
        var ring = el.tagName.toLowerCase() === "circle";
        // a ring that swells out of the mark and fades: quick to grow, slower to go
        var grow = 1 - (1 - v) * (1 - v);
        el.style.opacity = v > 0 ? (0.95 * Math.pow(1 - v, 1.4)).toFixed(3) : "0";
        el.style.transform = v > 0 ? "scale(" + (1 + (ring ? 2.2 : 0.6) * grow).toFixed(4) + ")" : "";
      });
      dots.forEach(function (d) {
        if (!st.dot) {
          d.el.style.opacity = "0";
          d.glows.forEach(function (g) { g.el.style.opacity = "0"; });
          d.trail.forEach(function (c) { c.style.opacity = "0"; });
          return;
        }
        var pt = pointAt(d.pts, st.dot.f);
        d.el.setAttribute("transform", "translate(" + pt[0].toFixed(3) + " " + pt[1].toFixed(3) + ")");
        d.el.style.opacity = st.dot.alpha.toFixed(3);
        d.trail.forEach(function (c) {
          var lag = +c.getAttribute("data-lag");
          var seg = subpath(d.pts, st.dot.trail[lag], st.dot.f);
          c.setAttribute("d", "M" + seg.map(function (q) { return q[0].toFixed(3) + " " + q[1].toFixed(3); }).join("L"));
          c.style.opacity = st.dot.alpha.toFixed(3);
        });
        d.glows.forEach(function (g) { g.el.style.opacity = (glowAt(st.dot.f, g.f, g.lead) * st.dot.alpha).toFixed(3); });
      });
      nods.forEach(function (n) {
        var a = st.dot && n.f !== null ? nodAt(st.dot.f, n.f) : 0;
        n.el.style.transform = a ? "rotate(" + a.toFixed(2) + "deg)" : "";
      });
      each(panels, function (b) {
        var key = b.getAttribute("data-trace"), l = st.lift[key] || 0, f = frames[key];
        if (l > 0.001) {
          f.style.transform = "translateY(" + (-LIFT_PX * l).toFixed(2) + "px)";
          f.style.boxShadow = "var(--ring), 0 12px 24px -14px rgba(27, 31, 36, " + (0.45 * l).toFixed(3) + ")";
        } else {
          f.style.removeProperty("transform");
          f.style.removeProperty("box-shadow");
        }
      });
    }

    function render() {
      var shown = false;
      if (anim) {
        var st = state(shownTime(s));
        apply(st);
        root.classList.toggle("is-playing", running(s));
        root.classList.toggle("is-drawn", st.phase === "hold");
        if (toggleBtn) toggleBtn.setAttribute("aria-pressed", String(s.paused));
      }
      each(buttons, function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-trace") === s.selected)); });
      if (s.selected) root.setAttribute("data-active", s.selected);
      else root.removeAttribute("data-active");
      each(lines, function (l) {
        var on = l.getAttribute("data-for") === s.selected;
        l.hidden = !on;
        shown = shown || on;
      });
      if (hint) hint.hidden = shown;
    }

    function step(now) {
      raf = 0;
      if (!running(s)) { last = null; return; }
      var dt = last === null ? 0 : (now - last) / 1000;
      last = now;
      s = control(s, { type: "tick", dt: dt });
      render();
      raf = win.requestAnimationFrame(step);
    }

    function dispatch(ev) {
      s = control(s, ev);
      render();
      if (anim && running(s) && !raf) { last = null; raf = win.requestAnimationFrame(step); }
    }

    // A mouse or touch press also focuses the button: only keyboard focus selects on focus,
    // so a click toggles cleanly.
    root.addEventListener("pointerdown", function () { pointer = true; }, true);
    root.addEventListener("keydown", function (e) {
      pointer = false;
      if (e.key === "Escape" || e.key === "Esc") dispatch({ type: "clear" });
    });
    each(buttons, function (b) {
      var key = b.getAttribute("data-trace");
      b.addEventListener("click", function () { pointer = false; dispatch({ type: "select", key: key }); });
      b.addEventListener("focus", function () { if (!pointer) dispatch({ type: "select", key: key, keep: true }); });
    });
    // index.html ships the hint hidden: without JS the panels do nothing.
    if (hint) hint.hidden = false;

    if (anim) {
      root.classList.add("fig1--anim");
      if (controls) controls.hidden = false;
      if (toggleBtn) toggleBtn.addEventListener("click", function () { dispatch({ type: "toggle" }); });
      if (replayBtn) replayBtn.addEventListener("click", function () { dispatch({ type: "replay" }); });
      // Printing or saving as PDF captures the complete figure, then the loop carries on.
      win.addEventListener("beforeprint", function () { dispatch({ type: "finish" }); });
      win.addEventListener("afterprint", function () { dispatch({ type: "release" }); });
      var seen = false;
      var loaded = function () {
        return Array.prototype.every.call(photos, function (im) { return im.complete; });
      };
      var update = function () { if (s.visible !== (seen && loaded())) dispatch({ type: "visible", on: seen && loaded() }); };
      each(photos, function (im) {
        im.addEventListener("load", update);
        im.addEventListener("error", update);
      });
      new win.IntersectionObserver(function (entries) {
        seen = entries[entries.length - 1].isIntersecting;
        update();
      }, { threshold: 0.3 }).observe(root);
    }
    render();

    api = root.__pacerFig1 = {
      seek: function (t) { dispatch({ type: "seek", t: +t || 0 }); },
      finish: function () { dispatch({ type: "finish" }); },
      replay: function () { dispatch({ type: "replay" }); },
      select: function (key) { dispatch(key ? { type: "select", key: key, keep: true } : { type: "clear" }); },
      status: function () {
        return { t: s.t, running: anim && running(s), paused: s.paused, selected: s.selected,
                 held: s.held, visible: s.visible, animated: anim };
      }
    };
    return api;
  }

  function boot() {
    var root = doc.querySelector("#idea figure.fig1");
    if (!root) return;
    try { mount(root); } catch (err) {
      root.classList.remove("fig1--anim");      // never leave the marks hidden
      if (win.console) win.console.error("PACERFig1.mount failed:", err);
    }
  }

  if (doc) {
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  function call(name) {
    return function (arg) { return api ? api[name](arg) : undefined; };
  }

  return {
    PANELS: PANELS,
    TRACKS: TRACKS,
    DRAW_END: DRAW_END,
    HOLD: HOLD,
    RESET: RESET,
    HOLD_END: HOLD_END,
    PERIOD: PERIOD,
    ease: ease,
    state: state,
    lengthOf: lengthOf,
    pointAt: pointAt,
    subpath: subpath,
    fractionAtX: fractionAtX,
    glowAt: glowAt,
    nodAt: nodAt,
    init: init,
    control: control,
    running: running,
    shownTime: shownTime,
    mount: mount,
    seek: call("seek"),
    finish: call("finish"),
    replay: call("replay"),
    select: call("select"),
    status: call("status")
  };
})();

if (typeof window !== "undefined") window.PACERFig1 = PACERFig1;
if (typeof module !== "undefined" && module.exports) module.exports = PACERFig1;

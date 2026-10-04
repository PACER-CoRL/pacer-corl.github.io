/* PACER project page — Fig. 1 (#idea): the paper's four rollout traces as a dynamic figure.

   index.html carries the finished figure (Task 12): the paper's eight clean photos, each
   with an inline SVG overlay whose viewBox is the photo's rect in PDF points, and the
   "E. Human Corrections" bracket; all geometry and colours come from the paper's PDF
   (_dev/tools/extract_fig1.py). Without JS, or under prefers-reduced-motion, that final
   state is what shows.

   With motion allowed, the annotations draw once when the figure scrolls into view
   (END ≈ 5.8 s): A's green boxes, B's then C's orange arrows, D's red circles, then the
   correction line from D, C and B along the bracket and up into A's arrow while the
   operator appears. A small Replay control plays it again.

   Animated elements carry data-draw="<track key>". Strokes (.fig1-stroke, pathLength="1")
   draw by stroke-dashoffset 1 -> 0; .fig1-pop elements (arrow heads, icon, label) fade and
   scale in. frame(t) is a pure function of time (node: _dev/tests/fig1.test.js).
   Classes on figure.fig1: fig1--anim (animation enabled; the annotations wait hidden),
   is-playing (running), is-drawn (finished: the CSS final state, no inline styles).

   Selecting a trace (click, tap or keyboard focus on a panel or on E) shows its one-line
   caption (Main.tex, the role mapping) and highlights it: data-active on the figure,
   aria-pressed on the five buttons. Escape clears the selection. The "Select a trace" hint
   ships hidden and is shown here; printing (beforeprint) finishes the figure.

   Classic script (no modules, no fetch) so the page works from file://.
   Public API (window.PACERFig1): TRACKS, END, ease, progress, frame,
     seek(t) (pause at t seconds), finish(), replay(), select(key | null).
*/
var PACERFig1 = (function () {
  "use strict";

  var win = typeof window !== "undefined" ? window : null;
  var doc = win ? win.document : null;

  /* ----------------------------------------------------------- timeline */

  // [data-draw key, start s, end s], in the brief's order; each step ends before the next begins.
  var SPEC = [
    // 1. A's green boxes stroke themselves in
    ["A1", 0.40, 1.15], ["A2", 0.55, 1.30],
    // 2. B's orange arrows draw toward their targets; the heads land as the shafts arrive
    ["B1", 1.40, 1.95], ["B1-head", 1.85, 2.10], ["B2", 1.52, 2.07], ["B2-head", 1.97, 2.22],
    // 3. C's arrows
    ["C1", 2.30, 2.85], ["C1-head", 2.75, 3.00], ["C2", 2.42, 2.97], ["C2-head", 2.87, 3.12],
    // 4. D's red circles
    ["D1", 3.20, 3.95], ["D2", 3.35, 4.10],
    // 5. E: the corrections leave D, C and B together, run along the bracket and up into
    //    A's arrow; the operator and the label appear while the line passes under them
    ["E-down", 4.20, 4.60], ["E-drop", 4.20, 4.60], ["E-along", 4.60, 5.40], ["E-up", 5.40, 5.62],
    ["E-icon", 4.90, 5.50], ["E-head", 5.55, 5.80]
  ];
  var TRACKS = SPEC.map(function (s) { return { key: s[0], t0: s[1], t1: s[2] }; });
  var END = TRACKS.reduce(function (m, t) { return Math.max(m, t.t1); }, 0);

  // Calm in-and-out (sine): ease(0) = 0, ease(1) = 1, symmetric about 1/2.
  function ease(u) {
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    return 0.5 - 0.5 * Math.cos(Math.PI * u);
  }

  function progress(track, t) {
    return ease((t - track.t0) / (track.t1 - track.t0));
  }

  // {key: eased progress in [0, 1]} at t seconds.
  function frame(t) {
    var f = {};
    TRACKS.forEach(function (tr) { f[tr.key] = progress(tr, t); });
    return f;
  }

  /* ------------------------------------------------------------ the page */

  var ctl = null;      // set by mount(): the live figure's controls

  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  function mount(root) {
    var drawn = root.querySelectorAll("[data-draw]");
    var buttons = root.querySelectorAll("button[data-trace]");
    var lines = root.querySelectorAll(".fig1-role__line");
    var hint = root.querySelector(".fig1-role__hint");
    var replayBtn = root.querySelector(".fig1-replay");
    var raf = 0, started = false;

    function apply(f) {
      each(drawn, function (el) {
        var p = f[el.getAttribute("data-draw")];
        if (p === undefined) return;
        if (el.classList.contains("fig1-stroke")) {
          el.style.opacity = p > 0 ? "1" : "0";
          el.style.strokeDashoffset = String(1 - p);
        } else {
          el.style.opacity = String(p);
          el.style.transform = "scale(" + (0.6 + 0.4 * p).toFixed(4) + ")";
        }
      });
    }

    function clear() {
      each(drawn, function (el) {
        el.style.removeProperty("opacity");
        el.style.removeProperty("stroke-dashoffset");
        el.style.removeProperty("transform");
      });
    }

    function stop() {
      if (raf) win.cancelAnimationFrame(raf);
      raf = 0;
    }

    function finish() {
      started = true;
      stop();
      clear();
      root.classList.remove("is-playing");
      root.classList.add("is-drawn");
    }

    function seek(t) {
      started = true;
      stop();
      if (t >= END) { finish(); return; }
      root.classList.remove("is-playing", "is-drawn");
      apply(frame(t));
    }

    function play() {
      started = true;
      stop();
      root.classList.remove("is-drawn");
      root.classList.add("is-playing");
      apply(frame(0));
      var start = null;
      function tick(now) {
        if (start === null) start = now;
        var t = (now - start) / 1000;
        if (t >= END) { finish(); return; }
        apply(frame(t));
        raf = win.requestAnimationFrame(tick);
      }
      raf = win.requestAnimationFrame(tick);
    }

    function select(key) {
      var shown = false;
      each(buttons, function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-trace") === key)); });
      if (key) root.setAttribute("data-active", key);
      else root.removeAttribute("data-active");
      each(lines, function (l) {
        var on = l.getAttribute("data-for") === key;
        l.hidden = !on;
        shown = shown || on;
      });
      if (hint) hint.hidden = shown;
    }

    each(buttons, function (b) {
      var key = b.getAttribute("data-trace");
      b.addEventListener("click", function () { select(key); });
      b.addEventListener("focus", function () { select(key); });
    });
    root.addEventListener("keydown", function (e) {
      if (e.key === "Escape" || e.key === "Esc") select(null);
    });
    // index.html ships the hint hidden: without JS the panels do nothing.
    if (hint) hint.hidden = false;
    // Printing or saving as PDF captures the finished figure, never the hidden annotations.
    win.addEventListener("beforeprint", finish);

    var motion = !(win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (motion && "IntersectionObserver" in win && "requestAnimationFrame" in win) {
      root.classList.add("fig1--anim");
      if (replayBtn) {
        replayBtn.hidden = false;
        replayBtn.addEventListener("click", play);
      }
      var io = new win.IntersectionObserver(function (entries) {
        if (!entries.some(function (e) { return e.isIntersecting; })) return;
        io.disconnect();
        if (!started) play();
      }, { threshold: 0.3 });
      io.observe(root);
    }

    ctl = { seek: seek, finish: finish, replay: play, select: select };
    return ctl;
  }

  function init() {
    var root = doc.querySelector("#idea figure.fig1");
    if (!root) return;
    try { mount(root); } catch (err) {
      root.classList.remove("fig1--anim");      // never leave the annotations hidden
      if (win.console) win.console.error("PACERFig1.mount failed:", err);
    }
  }

  if (doc) {
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
    else init();
  }

  function call(name) {
    return function (arg) { if (ctl) ctl[name](arg); };
  }

  return {
    TRACKS: TRACKS,
    END: END,
    ease: ease,
    progress: progress,
    frame: frame,
    mount: mount,
    seek: call("seek"),
    finish: call("finish"),
    replay: call("replay"),
    select: call("select")
  };
})();

if (typeof window !== "undefined") window.PACERFig1 = PACERFig1;
if (typeof module !== "undefined" && module.exports) module.exports = PACERFig1;

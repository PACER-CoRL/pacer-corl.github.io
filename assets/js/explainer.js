/* PACER project page — interactive weight explainer, "How PACER weights a trace"
   (spec §2 item 7), mounted into #explainer-app from window.PACER (assets/js/data.js).

   It implements the paper's row weight (Main.tex, eq:weight) on illustrative traces:

     s = Σ_k β_k e_k                       k ∈ {prog, prox, term, stop} from η, plus β_op (fixed)
     w = g · clip( max(f_ρ, γ_ρ · exp((s − b) / (τ σ + ε))), 0, w_max )

   b and σ are the median and 1.4826 · MAD of s inside the row's stratum. The toy
   uses one stratum per role (its 12 chunks) and backs off to the global pool of
   gate-eligible chunks when a role has fewer than 3 rows or σ = 0; the paper
   centers per (component, phase, role) over 8,836 training rows.

   The plate echoes the motivation film's exam plate: four lanes with a start block
   and a target slot; each attempt is a beaded path, one bead per action chunk, bead
   area ∝ w (0 → hollow bead). Lanes share one scale, x = 1 − d / lane_d, where d is
   the chunk's end distance to the target in units of d_ref = 2 r_target; the toy
   evidence follows the appendix definitions from d (see pacer_data.json).

   The paper zeroes failure rows twice: the eligibility gate g = 0 and the fixed
   γ_failure = 0. With the gate on (default, R10) failure chunks drop into an "audit
   only" tray at w = 0 (still rust: R18). Gate off is a what-if that removes both
   barriers — no gate and γ_failure = WHATIF_GAMMA = 1, no floor — so failure chunks,
   centered within their own stratum, are drawn hatched: they would be imitated.
   The 8 predeclared candidates are radio chips (never sliders).

   Classic script (no ES modules, no fetch) so the page works from file://; it also
   loads in node for the unit tests (module.exports at the bottom).
   Public API (window.PACERExplainer):
     score(e, eta, fixed) -> s
     detail(row, eta, fixed, stats, gateOn = true) -> {s, b, sigma, gamma, floor, g, raw, w, ...}
     weight(row, eta, fixed, stats, gateOn = true) -> w ∈ [0, w_max]
       (stats: the row's {b, sigma}, or the per-role map returned by stats())
     stats(rows, eta, fixed) -> {[role]: {b, sigma, n, pooled}}
     weigh(traces, eta, fixed, gateOn = true) -> {stats, traces: [{id, role, w: [...], detail: [...]}]}
     mount(el, data)
*/
var PACERExplainer = (function () {
  "use strict";

  var EPS = 1e-6;           // ε in eq:weight (appendix)
  var SIGMA_MIN = 1e-6;     // σ_min (appendix)
  var MAD_K = 1.4826;       // normal-consistency factor for the MAD
  var MIN_STRATUM = 3;      // toy back-off: a role with fewer rows uses the global pool
  var GATED = { failure: true, excluded: true };
  var WHATIF_GAMMA = 1;     // gate-off what-if only; the paper fixes γ_failure = γ_excluded = 0

  var EVIDENCE = [
    { k: "prog", label: "progress", beta: "beta_prog" },
    { k: "prox", label: "proximity", beta: "beta_prox" },
    { k: "term", label: "terminal", beta: "beta_term" },
    { k: "stop", label: "stop", beta: "beta_stop" },
    { k: "op", label: "operator", beta: "beta_op", fixed: true }
  ];

  var win = typeof window !== "undefined" ? window : null;
  var doc = win && win.document;

  /* ----------------------------------------------------------- the math */

  function score(e, eta, fixed) {
    return eta.beta_prog * e.prog + eta.beta_prox * e.prox + eta.beta_term * e.term + eta.beta_stop * e.stop +
      fixed.beta_op * e.op + (fixed.beta_dir || 0) * (e.dir || 0) + (fixed.beta_prov || 0) * (e.prov || 0);
  }

  function median(v) {
    var a = v.slice().sort(function (x, y) { return x - y; });
    var n = a.length;
    if (!n) return 0;
    return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
  }

  function center(scores) {
    var b = median(scores);
    return { b: b, sigma: MAD_K * median(scores.map(function (s) { return Math.abs(s - b); })) };
  }

  // Per-role location and scale; only gate-eligible rows enter the global pool.
  function stats(rows, eta, fixed) {
    var byRole = {}, pool = [], all = [];
    rows.forEach(function (r) {
      var s = score(r.e, eta, fixed);
      (byRole[r.role] = byRole[r.role] || []).push(s);
      all.push(s);
      if (!GATED[r.role]) pool.push(s);
    });
    var global = center(pool.length ? pool : all);
    var out = {};
    Object.keys(byRole).forEach(function (role) {
      var own = center(byRole[role]);
      var pooled = byRole[role].length < MIN_STRATUM || !(own.sigma > 0);
      var st = pooled ? global : own;
      out[role] = { b: st.b, sigma: Math.max(st.sigma, SIGMA_MIN), n: byRole[role].length, pooled: pooled };
    });
    return out;
  }

  function gammaFor(role, eta, fixed) {
    switch (role) {
      case "clean": return fixed.gamma_clean;
      case "correction": return eta.gamma_corr;
      case "auto_success": return fixed.gamma_auto_success;
      case "partial": return eta.gamma_part;
      case "failure": return fixed.gamma_failure;
      case "excluded": return fixed.gamma_excluded;
    }
    return 0;
  }

  function floorFor(role, fixed) {
    return role === "clean" ? fixed.f_clean : role === "correction" ? fixed.f_corr : 0;
  }

  // Every term of eq:weight for one row. Gate-failing rows get w = 0 directly: their
  // centered score is never needed (b, sigma, raw are null).
  function detail(row, eta, fixed, st, gateOn) {
    if (gateOn === undefined) gateOn = true;
    var role = row.role;
    var gated = !!GATED[role];
    var whatIf = gated && !gateOn;
    var s = score(row.e, eta, fixed);
    var base = { role: role, s: s, wMax: eta.w_max, tau: eta.tau, whatIf: whatIf };
    if (gated && gateOn) {
      return assign(base, {
        g: 0, gamma: gammaFor(role, eta, fixed), floor: floorFor(role, fixed), b: null, sigma: null,
        z: null, raw: null, w: 0, gated: true, clipped: false, floored: false
      });
    }
    if (st && st.b === undefined) st = st[role];
    var gamma = whatIf ? WHATIF_GAMMA : gammaFor(role, eta, fixed);
    var floor = whatIf ? 0 : floorFor(role, fixed);
    if (whatIf) base.paperGamma = gammaFor(role, eta, fixed);
    var z = (s - st.b) / (eta.tau * st.sigma + EPS);
    var mult = gamma * Math.exp(z);
    var raw = Math.max(floor, mult);
    return assign(base, {
      g: 1, gamma: gamma, floor: floor, b: st.b, sigma: st.sigma, z: z, raw: raw,
      w: Math.min(Math.max(raw, 0), eta.w_max),
      gated: false, clipped: raw > eta.w_max, floored: floor > 0 && mult < floor
    });
  }

  function weight(row, eta, fixed, st, gateOn) {
    return detail(row, eta, fixed, st, gateOn).w;
  }

  function rowsOf(traces) {
    var rows = [];
    traces.forEach(function (t) {
      t.chunks.forEach(function (c, i) { rows.push({ role: t.role, e: c.e, trace: t.id, i: i }); });
    });
    return rows;
  }

  function weigh(traces, eta, fixed, gateOn) {
    if (gateOn === undefined) gateOn = true;
    var st = stats(rowsOf(traces), eta, fixed);
    return {
      stats: st,
      traces: traces.map(function (t) {
        var d = t.chunks.map(function (c) { return detail({ role: t.role, e: c.e }, eta, fixed, st, gateOn); });
        var w = d.map(function (x) { return x.w; });
        return { id: t.id, role: t.role, w: w, detail: d, mean: w.reduce(function (a, b) { return a + b; }, 0) / w.length };
      })
    };
  }

  function assign(a, b) { Object.keys(b).forEach(function (k) { a[k] = b[k]; }); return a; }

  /* --------------------------------------------------------- DOM helpers */

  var SVG_NS = "http://www.w3.org/2000/svg";

  function attrs(e, a) {
    Object.keys(a || {}).forEach(function (k) {
      var v = a[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "text") e.textContent = v;
      else if (k === "class") e.setAttribute("class", v);
      else e.setAttribute(k, v === true ? "" : String(v));
    });
    return e;
  }

  function append(e, kids) {
    (kids || []).forEach(function (c) {
      if (c !== null && c !== undefined) e.appendChild(typeof c === "string" ? doc.createTextNode(c) : c);
    });
    return e;
  }

  function h(tag, a, kids) { return append(attrs(doc.createElement(tag), a), kids); }
  function s(tag, a, kids) { return append(attrs(doc.createElementNS(SVG_NS, tag), a), kids); }

  // <var>x</var><sub>y</sub>
  function sym(v, sub) {
    var f = doc.createDocumentFragment();
    f.appendChild(h("var", { text: v }));
    if (sub) f.appendChild(h("sub", { text: sub }));
    return f;
  }

  // "terminal_stop_heavy" with a line-break opportunity after each underscore
  function candName(id) {
    var f = doc.createDocumentFragment();
    id.split("_").forEach(function (part, i, all) {
      f.appendChild(doc.createTextNode(part + (i < all.length - 1 ? "_" : "")));
      if (i < all.length - 1) f.appendChild(h("wbr"));
    });
    return f;
  }

  // The paper's realised mean weights for the selected candidate (appendix, tab:app_weightdist):
  // the toy lanes are illustrative, so the footnote says what the real roles average.
  function realisedClause(rw) {
    if (!rw || rw.clean === undefined || rw.correction === undefined || rw.auto_success === undefined) return "";
    var f2 = function (v) { return Number(v).toFixed(2); };
    var human = f2(rw.clean) === f2(rw.correction)
      ? "clean and correction rows average weight " + f2(rw.clean)
      : "clean rows average weight " + f2(rw.clean) + ", correction rows " + f2(rw.correction);
    return "In the paper’s selected configuration, " + human + " and autonomous successes " +
      f2(rw.auto_success) + " (appendix). ";
  }

  function r1(v) { return Math.round(v * 10) / 10; }
  function fmt(v, d) { return v === null || v === undefined ? "–" : v.toFixed(d); }
  function trimNum(v) { return String(+v.toFixed(2)); }

  function reduceMotion() {
    return !!(win && win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  // Catmull-Rom spline through the points, as cubic Bézier segments.
  function smooth(pts) {
    var d = "M" + r1(pts[0][0]) + " " + r1(pts[0][1]);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += "C" + r1(p1[0] + (p2[0] - p0[0]) / 6) + " " + r1(p1[1] + (p2[1] - p0[1]) / 6) + " " +
        r1(p2[0] - (p3[0] - p1[0]) / 6) + " " + r1(p2[1] - (p3[1] - p1[1]) / 6) + " " +
        r1(p2[0]) + " " + r1(p2[1]);
    }
    return d;
  }

  /* -------------------------------------------------------------- the UI */

  var NARROW = 560;   // plate width (px) below which lane labels move above their lane
  var GUIDE_H = 18;   // band above the lanes for the evidence-guide labels

  function mount(el, data) {
    var cands = data.candidates, fixed = data.fixed, ex = data.explainer, traces = ex.traces;
    var laneD = ex.lane_d || 1.6;
    var picked = cands.filter(function (c) { return c.selected; })[0] || cands[0];
    var wScale = Math.max.apply(null, cands.map(function (c) { return c.w_max; }));
    var jvals = cands.map(function (c) { return c.jval; });
    var span = Math.max.apply(null, jvals) - Math.min.apply(null, jvals);
    var byId = {};
    cands.forEach(function (c) { byId[c.id] = c; });

    // Opens on a late chunk of the near-miss lane: high proximity, no terminal entry.
    var t0 = Math.min(1, traces.length - 1);
    var state = { cand: picked.id, gate: true, pin: { t: t0, i: Math.min(9, traces[t0].chunks.length - 1) }, peek: null, result: null };
    var geo = null;          // current plate geometry (rebuilt on resize)
    var beads = [];          // [{t, i, node, dot, clip, lanePos, trayPos, cur}]

    el.textContent = "";
    var root = h("div", { class: "xp reveal", "data-gate": "on" });

    /* ---- configuration chips (a native radio group) */
    var grid = h("div", { class: "cands__grid" });
    cands.forEach(function (c) {
      var input = h("input", {
        type: "radio", name: "xp-candidate", value: c.id, class: "cand__input", checked: c.id === state.cand
      });
      // A human-readable label first; the paper's candidate id small beneath it.
      grid.appendChild(h("label", { class: "cand", "data-cand": c.id }, [
        input,
        h("span", { class: "cand__head" }, [
          h("span", { class: "cand__label", text: c.label || c.id }),
          h("span", { class: "cand__name" }, [candName(c.id)])
        ]),
        h("span", { class: "cand__meta" }, [
          h("span", { class: "cand__j" }, [sym("J", "val"), " " + c.jval.toFixed(6)]),
          c.selected ? h("span", { class: "cand__pick", title: "Highest validation score: the configuration PACER uses", text: "selected" }) : null
        ])
      ]));
    });
    var cands_ = h("fieldset", { class: "cands" }, [
      h("legend", { class: "xp__label", text: "Predeclared configuration" }),
      grid,
      h("p", { class: "cands__note" }, [
        "PACER uses the highest ", sym("J", "val"), "; all " + cands.length + " lie within " +
        (Math.ceil(span * 1e4) / 1e4).toFixed(4) + " of each other."
      ])
    ]);

    /* ---- formula, live parameters and the gate switch */
    var params = h("dl", { class: "params", "aria-label": "Values of the chosen configuration" });
    var gate = h("button", { type: "button", role: "switch", "aria-checked": "true", class: "switch" }, [
      h("span", { class: "switch__track", "aria-hidden": "true" }, [h("span", { class: "switch__thumb" })]),
      h("span", { class: "switch__label", text: "Eligibility gate" }),
      h("span", { class: "switch__state", text: "on" })
    ]);
    var gateNote = h("p", { class: "gate__note" });
    var head = h("div", { class: "xp__head" }, [
      h("div", { class: "xp__formula" }, [
        h("div", {
          class: "eq",
          "data-tex": "\\begin{aligned} w &= g\\cdot\\mathrm{clip}\\Bigl(\\max\\bigl(f_\\rho,\\;\\gamma_\\rho" +
            "\\exp\\!\\bigl(\\tfrac{s-b}{\\tau\\sigma+\\epsilon}\\bigr)\\bigr),\\,0,\\,w_{\\max}\\Bigr)\\\\" +
            " s &= \\textstyle\\sum_k \\beta_k\\, e_k \\end{aligned}"
        }),
        params
      ]),
      h("div", { class: "gate" }, [gate, gateNote])
    ]);

    /* ---- plate (SVG lanes + audit tray) and inspector */
    var key = h("p", { class: "plate__key" });
    var plateBox = h("div", { class: "plate__svg" });
    var plate = h("figure", { class: "plate" }, [
      h("figcaption", { class: "plate__head" }, [
        h("span", { class: "plate__tag", text: "Illustrative" }),
        h("span", { class: "plate__hint", text: "One bead per action chunk. Hover, tap or use the arrow keys." }),
        key
      ]),
      plateBox
    ]);
    // No aria-live: the focused bead's own label already carries its role, chunk and w.
    var ins = h("aside", { class: "xp-ins", "aria-label": "Selected chunk: evidence, score and weight" });
    var foot = h("p", { class: "xp__foot" }, [
      "Illustrative traces, centered per role over their " + traces[0].chunks.length + " chunks. " +
      "Real weights are computed over " +
      Number(ex.training_rows).toLocaleString("en-US") + " training rows with stratum-wise centering. " +
      realisedClause(ex.realised_mean_weight) + "The " +
      cands.length + " candidates span < " + ex.jval_span_bound + " in ", sym("J", "val"),
      ", so selection is a fixed protocol choice."
    ]);

    append(root, [
      cands_,
      head,
      h("div", { class: "xp__stage" }, [plate, ins]),
      foot
    ]);
    el.appendChild(root);

    /* ---------------------------------------------------- plate geometry */

    function layout(W) {
      var narrow = W < NARROW;
      var pad = narrow ? 10 : 16;
      var x0 = pad + 6;
      var x1 = W - (narrow ? 30 : 160);     // target point (wide layouts keep a label column)
      var L = x1 - x0;
      var half = narrow ? 24 : 34;
      // Bead size: the largest bead spans about one typical chunk step. Hovering chunks sit
      // closer than that and may overlap, which reads as the attempt stalling.
      var gaps = [];
      traces.forEach(function (t) {
        for (var i = 1; i < t.chunks.length; i++) {
          var a = t.chunks[i - 1], b = t.chunks[i];
          gaps.push(Math.hypot((b.x - a.x) * L, (b.y - a.y) * half));
        }
      });
      var rMax = Math.max(5, Math.min(narrow ? 9 : 12, median(gaps) * 0.5));
      var labelH = narrow ? 22 : 0;
      var band = 2 * half + 2 * rMax;
      var pitch = labelH + band + (narrow ? 10 : 12);
      var lanes = traces.map(function (t, k) {
        var top = GUIDE_H + k * pitch;
        var yc = top + labelH + band / 2;
        var X = function (x) { return x0 + x * L; };
        var Y = function (y) { return yc + y * half; };
        return {
          top: top, yc: yc, x0: x0, x1: x1,
          pts: t.chunks.map(function (c) { return [X(c.x), Y(c.y)]; }),
          lead: t.lead ? t.lead.map(function (p) { return [X(p.x), Y(p.y)]; }) : null
        };
      });
      var trayTop = GUIDE_H + traces.length * pitch + 4;
      var trayH = narrow ? 70 : 58;
      var gated = traces.filter(function (t) { return GATED[t.role]; })[0];
      var n = gated ? gated.chunks.length : 12;
      var sx0 = narrow ? pad + 14 : pad + 196, sx1 = W - pad - 18;
      var slotY = trayTop + (narrow ? 46 : trayH / 2);
      var slots = [];
      for (var i = 0; i < n; i++) slots.push([sx0 + (sx1 - sx0) * (n > 1 ? i / (n - 1) : 0), slotY]);
      return {
        W: W, H: trayTop + trayH + 2, narrow: narrow, pad: pad, half: half, rMax: rMax, labelH: labelH,
        lanes: lanes, tray: { top: trayTop, h: trayH, slots: slots },
        // Evidence guides on the shared scale x = 1 − d / lane_d (d in units of d_ref = 2 r_target):
        // proximity is positive inside d < d_ref, the terminal region is d ≤ r_target.
        guides: { prox: x0 + (1 - 1 / laneD) * L, term: x0 + (1 - 0.5 / laneD) * L, slot: x1 + rMax + 3 }
      };
    }

    function radius(w) {
      if (!(w > 0)) return 4.5;
      return Math.max(2, geo.rMax * Math.sqrt(Math.min(w, wScale) / wScale));
    }

    function draw() {
      var W = Math.round(plateBox.clientWidth);
      if (!W || (geo && geo.W === W)) return;
      var focused = doc.activeElement && doc.activeElement.closest && doc.activeElement.closest(".bead");
      var refocus = focused && plateBox.contains(focused);
      geo = layout(W);
      beads = [];
      var svg = s("svg", {
        class: "plate__canvas", width: W, height: geo.H, viewBox: "0 0 " + W + " " + geo.H,
        role: "group", "aria-label": "Illustrative traces: one bead per action chunk, bead area proportional to its weight"
      });
      svg.appendChild(s("defs", null, [
        s("pattern", { id: "xp-hatch", width: 4, height: 4, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, [
          s("rect", { width: 4, height: 4, class: "hatch__bg" }),
          s("line", { x1: 0, y1: 0, x2: 0, y2: 4, class: "hatch__line" })
        ])
      ]));

      var G = geo.guides, gBottom = geo.tray.top - 4;
      svg.appendChild(s("g", { class: "guides", "aria-hidden": "true" }, [
        s("rect", { class: "guide__term", x: r1(G.term), y: GUIDE_H - 4, width: r1(G.slot - G.term), height: gBottom - GUIDE_H + 4 }),
        s("line", { class: "guide__prox", x1: r1(G.prox), x2: r1(G.prox), y1: GUIDE_H - 4, y2: gBottom }),
        s("text", { class: "guide__label", x: r1(G.prox) + 5, y: 10, text: geo.narrow ? "proximity" : "proximity > 0" }),
        s("text", { class: "guide__label", x: r1(G.term) + 5, y: 10, text: geo.narrow ? "terminal" : "terminal region" })
      ]));

      var layers = [];
      traces.forEach(function (t, k) {
        var ln = geo.lanes[k];
        var g = s("g", { class: "lane", "data-role": t.role, "data-trace": t.id, style: "--l:" + k });
        var start = t.lead ? ln.lead : [[ln.x0, ln.yc]];
        if (t.lead) g.appendChild(s("path", { class: "lane__lead", d: smooth(ln.lead) }));
        g.appendChild(s("path", { class: "lane__path", d: smooth([start[start.length - 1]].concat(ln.pts)) }));
        g.appendChild(s("rect", { class: "lane__start", x: ln.x0 - 5, y: ln.yc - 5, width: 10, height: 10, rx: 1.5 }));
        // Target slot: a bracket that encloses the target point, as on the film's exam plate.
        var bh = geo.half * 0.75, bx = r1(ln.x1 + geo.rMax + 3);
        g.appendChild(s("path", {
          class: "lane__slot",
          d: "M" + (bx - 8) + " " + r1(ln.yc - bh) + "H" + bx + "V" + r1(ln.yc + bh) + "H" + (bx - 8)
        }));
        // Labels: a column to the right of the slot (wide) or a row above the lane (narrow).
        var lx = geo.narrow ? geo.pad : ln.x1 + geo.rMax + 20;
        var ly = geo.narrow ? ln.top + 14 : ln.yc - 3;
        var tag = s("text", { class: "lane__tag", x: lx, y: ly, text: t.tag });
        var mean = s("text", {
          class: "lane__mean", x: geo.narrow ? geo.W - geo.pad : lx, y: geo.narrow ? ly : ly + 19,
          "text-anchor": geo.narrow ? "end" : null
        });
        // Only gate-failing roles can carry the what-if warning.
        var warn = GATED[t.role] ? s("text", {
          class: "lane__warn",
          x: geo.narrow ? lx + 74 : lx, y: geo.narrow ? ly : ly + 37, text: "would be imitated"
        }) : null;
        append(g, [tag, mean, warn]);
        var layer = s("g", { class: "lane__beads" });
        g.appendChild(layer);
        layers.push({ g: g, layer: layer, mean: mean });
        svg.appendChild(g);
      });

      var T = geo.tray;
      var tray = s("g", { class: "audit-tray" });
      tray.appendChild(s("rect", {
        class: "tray__box", x: geo.pad - 4, y: T.top, width: geo.W - 2 * geo.pad + 8, height: T.h, rx: 10
      }));
      var trayLabel = s("text", {
        class: "tray__label", x: geo.pad + 12, y: geo.narrow ? T.top + 22 : T.top + T.h / 2
      });
      tray.appendChild(trayLabel);
      T.slots.forEach(function (p) {
        tray.appendChild(s("circle", { class: "tray__slot", cx: r1(p[0]), cy: r1(p[1]), r: 4.5 }));
      });
      var trayBeads = s("g", { class: "tray__beads" });
      tray.appendChild(trayBeads);
      svg.appendChild(tray);

      traces.forEach(function (t, k) {
        t.chunks.forEach(function (c, i) {
          var p = geo.lanes[k].pts[i];
          var node = s("g", {
            class: "bead", role: "button", tabindex: "-1", "data-trace": t.id, "data-role": t.role, "data-chunk": i,
            "data-lane": k, style: "--i:" + i + ";--l:" + k
          });
          var dot = s("circle", { class: "bead__dot", r: 4.5 });
          var clip = s("circle", { class: "bead__clip", r: 4.5 });
          var ring = s("circle", { class: "bead__ring", r: 8 });
          append(node, [s("circle", { class: "bead__hit", r: geo.narrow ? 11 : 14 }), clip, dot, ring]);
          var b = { t: k, i: i, node: node, dot: dot, clip: clip, ring: ring, lanePos: p,
                    trayPos: GATED[t.role] ? T.slots[i] : null, layer: layers[k].layer, trayLayer: trayBeads };
          node.__bead = b;
          beads.push(b);
        });
      });
      plateBox.textContent = "";
      plateBox.appendChild(svg);
      geo.svg = svg;
      geo.layers = layers;
      geo.trayLabel = trayLabel;
      update(false);
      if (refocus) beadAt(state.pin.t, state.pin.i).node.focus({ preventScroll: true });
    }

    /* ---------------------------------------------------- state -> view */

    function beadAt(t, i) {
      for (var k = 0; k < beads.length; k++) if (beads[k].t === t && beads[k].i === i) return beads[k];
      return null;
    }

    function translate(p) { return "translate(" + r1(p[0]) + "px, " + r1(p[1]) + "px)"; }

    function update(animate) {
      var eta = byId[state.cand];
      state.result = weigh(traces, eta, fixed, state.gate);
      root.setAttribute("data-gate", state.gate ? "on" : "off");
      gate.setAttribute("aria-checked", String(state.gate));
      gate.querySelector(".switch__state").textContent = state.gate ? "on" : "off";
      gateNote.textContent = "";
      append(gateNote, state.gate
        ? ["Failure chunks: audit only, w\u00a0=\u00a00."]
        : ["What-if: no gate and ", sym("γ", "failure"), "\u00a0=\u00a0" + trimNum(WHATIF_GAMMA) + " (the paper fixes ",
           sym("γ", "failure"), "\u00a0=\u00a0" + trimNum(fixed.gamma_failure) + ")\u00a0— failure chunks would be imitated."]);
      renderParams(eta);
      renderKey(eta);
      if (!geo) { renderInspector(); return; }   // plate not laid out yet (no width)

      geo.trayLabel.textContent = "";
      append(geo.trayLabel, state.gate
        ? ["AUDIT ONLY", s("tspan", { class: "tray__w", text: "  w = 0" })]
        : ["AUDIT TRAY EMPTY", s("tspan", { class: "tray__w", text: "  gate off" })]);
      state.result.traces.forEach(function (r, k) {
        var gatedLane = !!GATED[r.role] && state.gate;
        geo.layers[k].g.classList.toggle("is-gated", gatedLane);
        geo.layers[k].g.classList.toggle("is-whatif", !!GATED[r.role] && !state.gate);
        geo.layers[k].mean.textContent = gatedLane ? "w = 0 · audit" : "mean w " + r.mean.toFixed(2);
      });
      beads.forEach(function (b) {
        var t = traces[b.t], d = state.result.traces[b.t].detail[b.i];
        var inTray = !!(b.trayPos && state.gate);
        var parent = inTray ? b.trayLayer : b.layer;
        var pos = inTray ? b.trayPos : b.lanePos;
        if (b.node.parentNode !== parent) {
          var hadFocus = doc.activeElement === b.node;
          parent.appendChild(b.node);
          if (animate && b.cur) {
            b.node.style.transform = translate(b.cur);
            b.node.getBoundingClientRect();     // commit the old position so the move transitions
          }
          if (hadFocus) b.node.focus({ preventScroll: true });
        }
        b.node.style.transform = translate(pos);
        b.cur = pos;
        var r = d.gated ? 4.5 : radius(d.w);
        b.dot.setAttribute("r", r1(r * 10) / 10);
        b.clip.setAttribute("r", r1((r + 2.6) * 10) / 10);
        b.ring.setAttribute("r", r1((Math.max(r, 4.5) + 4.5) * 10) / 10);
        b.node.setAttribute("data-w", d.w.toFixed(4));
        b.node.classList.toggle("is-gated", d.gated);
        b.node.classList.toggle("is-hatched", d.whatIf);
        b.node.classList.toggle("is-clipped", d.clipped);
        b.node.setAttribute("aria-label", t.tag + ", chunk " + (b.i + 1) + " of " + t.chunks.length +
          ": w " + d.w.toFixed(2) + (d.gated ? ", gated, audit only" : d.whatIf ? ", would be imitated" : ""));
      });
      focusMarks();
      renderInspector();
    }

    function renderParams(eta) {
      var items = [
        ["β", "prog", trimNum(eta.beta_prog)], ["β", "prox", trimNum(eta.beta_prox)],
        ["β", "term", trimNum(eta.beta_term)], ["β", "stop", trimNum(eta.beta_stop)],
        ["γ", "corr", trimNum(eta.gamma_corr)], ["γ", "part", trimNum(eta.gamma_part)],
        ["τ", null, trimNum(eta.tau)], ["w", "max", trimNum(eta.w_max)]
      ];
      params.textContent = "";
      items.forEach(function (it) {
        params.appendChild(h("div", { class: "params__item" }, [
          h("dt", null, [sym(it[0], it[1])]), h("dd", { text: it[2] })
        ]));
      });
    }

    function keyDot(r, cls) {
      var d = Math.ceil(2 * r + 4);
      return s("svg", { class: "key__bead " + cls, width: d, height: d, viewBox: "0 0 " + d + " " + d, "aria-hidden": "true" }, [
        s("circle", { cx: d / 2, cy: d / 2, r: r1(r * 10) / 10 })
      ]);
    }

    function renderKey(eta) {
      if (!geo) return;
      key.textContent = "";
      append(key, [
        h("span", { class: "key__item" }, [keyDot(4.5, "is-zero"), "0"]),
        h("span", { class: "key__item" }, [keyDot(radius(1), "is-one"), "1"]),
        h("span", { class: "key__item" }, [keyDot(radius(eta.w_max), "is-max"), sym("w", "max") , " " + trimNum(eta.w_max)]),
        h("span", { class: "visually-hidden", text: "Bead area is proportional to the chunk weight w." })
      ]);
    }

    function focusMarks() {
      var cur = state.peek || state.pin;
      beads.forEach(function (b) {
        var on = b.t === state.pin.t && b.i === state.pin.i;
        b.node.setAttribute("tabindex", on ? "0" : "-1");
        b.node.setAttribute("aria-pressed", String(on));
        b.node.classList.toggle("is-on", b.t === cur.t && b.i === cur.i);
      });
    }

    /* ---------------------------------------------------------- inspector */

    function renderInspector() {
      var cur = state.peek || state.pin;
      var t = traces[cur.t], c = t.chunks[cur.i];
      var eta = byId[state.cand];
      var d = state.result.traces[cur.t].detail[cur.i];
      attrs(ins, { "data-trace": t.id, "data-role": t.role, "data-chunk": cur.i });
      ins.textContent = "";

      var ev = h("div", { class: "ev", role: "table", "aria-label": "Process evidence of this chunk" }, [
        h("div", { class: "ev__row ev__row--head", role: "row" }, [
          h("span", { role: "columnheader", class: "ev__label" }, ["evidence ", sym("e", "k")]),
          h("span", { role: "columnheader", class: "ev__bar-h", "aria-hidden": "true" }),
          h("span", { role: "columnheader", class: "ev__val", text: "" }),
          h("span", { role: "columnheader", class: "ev__beta" }, [sym("β", "k")])
        ])
      ]);
      EVIDENCE.forEach(function (f) {
        var v = c.e[f.k];
        var beta = f.fixed ? fixed[f.beta] : eta[f.beta];
        ev.appendChild(h("div", { class: "ev__row", role: "row" }, [
          h("span", { role: "rowheader", class: "ev__label", text: f.label }),
          h("span", { role: "cell", class: "ev__bar", "aria-hidden": "true" }, [
            h("i", { style: "width:" + (v * 100).toFixed(1) + "%" })
          ]),
          h("span", { role: "cell", class: "ev__val", text: v.toFixed(2) }),
          h("span", { role: "cell", class: "ev__beta", text: trimNum(beta) })
        ]));
      });

      var terms = h("dl", { class: "terms" }, [
        term(["score ", sym("s")], "s", fmt(d.s, 3)),
        term(["stratum ", sym("b"), ", ", sym("σ")], "bs", d.gated ? "not needed" : fmt(d.b, 3) + ", " + fmt(d.sigma, 3)),
        term(["role ", sym("γ")], "gamma", d.whatIf
          ? [trimNum(d.gamma), h("span", { class: "terms__aside", text: " (what-if; paper: " + trimNum(d.paperGamma) + ")" })]
          : trimNum(d.gamma)),
        term(["floor ", sym("f")], "floor", trimNum(d.floor)),
        term(["gate ", sym("g")], "g", String(d.g))
      ]);

      var note = d.gated ? ["gated: audit only, never imitated"]
        : d.whatIf ? ["would be imitated: centered within the failure stratum, its relatively best chunks get ",
                      sym("w"), " > 1"]
        : d.clipped ? ["clipped from " + d.raw.toFixed(2) + " to ", sym("w", "max")]
        : d.floored ? ["held at the role floor ", sym("f")]
        : ["between 0 and ", sym("w", "max")];

      ins.appendChild(h("p", { class: "xp-ins__kicker" }, [
        h("span", { class: "xp-ins__swatch", "aria-hidden": "true" }),
        h("span", { class: "xp-ins__trace", text: t.label }),
        h("span", { class: "xp-ins__chunk", text: "chunk " + (cur.i + 1) + " / " + t.chunks.length })
      ]));
      ins.appendChild(ev);
      ins.appendChild(terms);
      ins.appendChild(gauge(d, eta));
      ins.appendChild(h("p", { class: "xp-ins__w" }, [
        sym("w"), " = ", h("strong", { "data-field": "w", text: d.w.toFixed(2) }),
        h("span", { class: "xp-ins__note" + (d.whatIf ? " is-warn" : "") }, note)
      ]));
    }

    function term(label, field, value) {
      return h("div", { class: "terms__item" }, [
      h("dt", null, label), h("dd", { "data-field": field }, typeof value === "string" ? [value] : value)
    ]);
    }

    // Weight on a fixed 0 … max(w_max) scale: the clip bound moves with the candidate.
    function gauge(d, eta) {
      var pc = function (v) { return (Math.min(v, wScale) / wScale * 100).toFixed(2) + "%"; };
      var g = h("div", { class: "gauge", "aria-hidden": "true" }, [
        h("span", { class: "gauge__track" }),
        h("span", { class: "gauge__beyond", style: "left:" + pc(eta.w_max) })
      ]);
      if (d.clipped) {
        g.appendChild(h("span", {
          class: "gauge__over" + (d.raw > wScale ? " is-out" : ""),
          style: "left:" + pc(eta.w_max) + ";width:calc(" + pc(d.raw) + " - " + pc(eta.w_max) + ")"
        }));
      }
      g.appendChild(h("span", { class: "gauge__fill", style: "width:" + pc(d.w) }));
      if (d.floor > 0 && !d.gated) {
        g.appendChild(h("span", { class: "gauge__floor", style: "left:" + pc(d.floor) }, [
          h("span", { class: "gauge__tag", text: "f " + trimNum(d.floor) })
        ]));
      }
      g.appendChild(h("span", { class: "gauge__clip" + (eta.w_max / wScale > 0.85 ? " is-end" : ""), style: "left:" + pc(eta.w_max) }, [
        h("span", { class: "gauge__tag" }, [sym("w", "max"), " " + trimNum(eta.w_max)])
      ]));
      g.appendChild(h("span", { class: "gauge__zero", text: "0" }));
      return g;
    }

    /* -------------------------------------------------------------- input */

    function beadFrom(e) {
      var n = e.target && e.target.closest && e.target.closest(".bead");
      return n && n.__bead;
    }

    function pin(b, focus) {
      state.pin = { t: b.t, i: b.i };
      state.peek = null;
      focusMarks();
      renderInspector();
      if (focus) b.node.focus({ preventScroll: false });
    }

    plateBox.addEventListener("pointerover", function (e) {
      var b = beadFrom(e);
      if (!b || e.pointerType === "touch") return;
      state.peek = { t: b.t, i: b.i };
      focusMarks();
      renderInspector();
    });
    plateBox.addEventListener("pointerleave", function () {
      if (!state.peek) return;
      state.peek = null;
      focusMarks();
      renderInspector();
    });
    plateBox.addEventListener("click", function (e) { var b = beadFrom(e); if (b) pin(b, false); });
    plateBox.addEventListener("focusin", function (e) {
      var b = beadFrom(e);
      if (b && (b.t !== state.pin.t || b.i !== state.pin.i || state.peek)) pin(b, false);
    });
    plateBox.addEventListener("keydown", function (e) {
      var b = beadFrom(e);
      if (!b) return;
      var t = b.t, i = b.i, n = traces[t].chunks.length;
      switch (e.key) {
        case "ArrowRight": i = Math.min(n - 1, i + 1); break;
        case "ArrowLeft": i = Math.max(0, i - 1); break;
        case "ArrowDown": t = Math.min(traces.length - 1, t + 1); break;
        case "ArrowUp": t = Math.max(0, t - 1); break;
        case "Home": i = 0; break;
        case "End": i = n - 1; break;
        case "Enter": case " ": pin(b, false); e.preventDefault(); return;
        default: return;
      }
      e.preventDefault();
      i = Math.min(i, traces[t].chunks.length - 1);
      pin(beadAt(t, i), true);
    });

    grid.addEventListener("change", function (e) {
      if (e.target && e.target.name === "xp-candidate") {
        state.cand = e.target.value;
        update(true);
      }
    });
    gate.addEventListener("click", function () {
      state.gate = !state.gate;
      update(true);
    });

    /* --------------------------------------------------------------- go */

    update(false);
    draw();
    var pending = false;
    function schedule() {
      if (pending) return;
      pending = true;
      win.requestAnimationFrame(function () { pending = false; draw(); });
    }
    if ("ResizeObserver" in win) new win.ResizeObserver(schedule).observe(plateBox);
    else win.addEventListener("resize", schedule);

    // Beads appear along each lane once, the first time the plate scrolls into view.
    if (!reduceMotion() && "IntersectionObserver" in win) {
      root.classList.add("xp--anim");
      var io = new IntersectionObserver(function (entries) {
        if (!entries.some(function (x) { return x.isIntersecting; })) return;
        io.disconnect();
        win.requestAnimationFrame(function () { root.classList.add("is-drawn"); });
      }, { threshold: 0.25 });
      io.observe(plate);
    }
    if (win.PACERUI) {
      if (win.PACERUI.observeReveal) win.PACERUI.observeReveal(el);
      if (win.PACERUI.renderMath) win.PACERUI.renderMath();
    }
    el.setAttribute("data-ready", "1");
    return root;
  }

  /* ---------------------------------------------------------------- init */

  function init() {
    var D = win.PACER;
    var el = doc.getElementById("explainer-app");
    if (!D || !el || !D.explainer || !D.explainer.traces.length) return;
    try { mount(el, D); } catch (err) {
      if (win.console) win.console.error("PACERExplainer.mount failed:", err);
    }
  }

  if (doc) {
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
    else init();
  }

  return {
    score: score,
    stats: stats,
    detail: detail,
    weight: weight,
    weigh: weigh,
    rowsOf: rowsOf,
    mount: mount,
    EPS: EPS,
    WHATIF_GAMMA: WHATIF_GAMMA
  };
})();

if (typeof window !== "undefined") window.PACERExplainer = PACERExplainer;
if (typeof module !== "undefined" && module.exports) module.exports = PACERExplainer;

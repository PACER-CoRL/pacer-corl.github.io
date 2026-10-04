/* PACER project page — results charts (spec §2 item 8), rendered as inline SVG
   from window.PACER.results (assets/js/data.js) into the mounts in #results:

     #ladder          ablation ladder: overall held-out success per method,
                      ascending, PACER last; one-line description per method
     #per-component   grouped bars per component with Wilson 95% intervals
                      (z = 1.96, n = trials per component), as in the paper's figure
     #results-table   the full table incl. the validation score J_val

   Colour: PACER is the only teal mark; baselines take a neutral sand -> ink ramp
   ordered by overall success, so a method keeps its tone across charts.
   Motion: bars grow once on first view; static under prefers-reduced-motion.

   Classic script (no ES modules, no fetch) so the page works from file://; it
   also loads in node for the unit tests (module.exports at the bottom).
   Public API (window.PACERCharts):
     wilson(k, n, z = 1.96) -> {p, lo, hi}
     renderLadder(el, results)
     renderPerComponent(el, results, methodIds = DEFAULT_PER_COMPONENT, opts)
     renderTable(el, results)
     ladderOrder(methods), tones(methods)
*/
var PACERCharts = (function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var TEAL = "#0F8B8D";
  var RAMP = ["#D6CCB9", "#4E545C"];          // sand (lightest baseline) -> ink (darkest)
  var Z95 = 1.96;
  var DEFAULT_PER_COMPONENT = ["theta0", "vanilla_post_sft", "fixed_geometry", "pacer"];
  var CALLOUTS = { correction_only: true, outcome_only: true };   // spec §2 item 8
  var NARROW = 560;                            // plot width (px) below which the chart splits into small multiples

  var win = typeof window !== "undefined" ? window : null;
  var doc = win && win.document;

  /* ----------------------------------------------------------- numbers */

  // Wilson score interval for k successes in n trials (the paper's CI method).
  function wilson(k, n, z) {
    if (z === undefined) z = Z95;
    var p = k / n;
    var z2 = z * z;
    var denom = 1 + z2 / n;
    var center = (p + z2 / (2 * n)) / denom;
    var half = z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / denom;
    return {
      p: p,
      lo: k <= 0 ? 0 : Math.max(0, center - half),
      hi: k >= n ? 1 : Math.min(1, center + half)
    };
  }

  // Baselines ascending by overall success, PACER last. Does not mutate the input.
  function ladderOrder(methods) {
    var base = methods.filter(function (m) { return m.id !== "pacer"; });
    var idx = {};
    base.forEach(function (m, i) { idx[m.id] = i; });
    base.sort(function (a, b) { return a.overall - b.overall || idx[a.id] - idx[b.id]; });
    return base.concat(methods.filter(function (m) { return m.id === "pacer"; }));
  }

  function hex2rgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function mix(a, b, t) {
    var A = hex2rgb(a), B = hex2rgb(b);
    return "#" + A.map(function (c, i) {
      var v = Math.round(c + (B[i] - c) * t);
      return (v < 16 ? "0" : "") + v.toString(16);
    }).join("").toUpperCase();
  }

  // id -> fill colour: PACER teal; baselines step from sand to ink with overall success.
  function tones(methods) {
    var out = {};
    var base = ladderOrder(methods).filter(function (m) { return m.id !== "pacer"; });
    base.forEach(function (m, i) {
      out[m.id] = mix(RAMP[0], RAMP[1], base.length > 1 ? i / (base.length - 1) : 1);
    });
    methods.forEach(function (m) { if (m.id === "pacer") out[m.id] = TEAL; });
    return out;
  }

  function pct(x, digits) {
    return (x * 100).toFixed(digits === undefined ? 1 : digits).replace(/\.0+$/, "") + "%";
  }

  /* ----------------------------------------------------------- DOM helpers */

  function attrs(e, a) {
    Object.keys(a || {}).forEach(function (k) {
      var v = a[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "text") e.textContent = v;
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

  // "π_θ0 (no post-train)" -> π<sub>θ0</sub> (no post-train)
  function label(text) {
    var frag = doc.createDocumentFragment();
    String(text).split("π_θ0").forEach(function (part, i) {
      if (i > 0) {
        frag.appendChild(doc.createTextNode("π"));
        frag.appendChild(h("sub", { text: "θ0" }));
      }
      if (part) frag.appendChild(doc.createTextNode(part));
    });
    return frag;
  }

  function plain(text) { return String(text).replace(/π_θ0/g, "πθ0"); }

  function r1(v) { return Math.round(v * 10) / 10; }

  function reduceMotion() {
    return !!(win && win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  // Grow the marks once, the first time the chart scrolls into view.
  function animateOnce(chart) {
    if (reduceMotion() || !("IntersectionObserver" in win)) return;
    chart.classList.add("chart--anim");
    var io = new IntersectionObserver(function (entries) {
      if (!entries.some(function (e) { return e.isIntersecting; })) return;
      io.disconnect();
      win.requestAnimationFrame(function () { chart.classList.add("is-drawn"); });
    }, { threshold: 0.3 });
    io.observe(chart);
  }

  /* ------------------------------------------------------- (a) ladder */

  var LADDER_H = 24, LADDER_BAR = 14;
  var DELTA_H = 22;                          // room above PACER's bar for the "+N points" bracket
  var DELTA_REF = "vanilla_post_sft";        // the bracket measures PACER's gain over this baseline

  function renderLadder(el, results) {
    var methods = ladderOrder(results.methods);
    var tone = tones(results.methods);
    var total = results.trials_per_component * results.components.length;
    var ref = methods.filter(function (m) { return m.id === DELTA_REF; })[0];
    var top = methods.filter(function (m) { return m.id === "pacer"; })[0];
    var delta = ref && top ? top.overall - ref.overall : 0;

    el.textContent = "";
    var chart = h("div", { class: "chart ladder", "data-chart": "ladder" });
    chart.appendChild(h("div", { class: "ladder__head", "aria-hidden": "true" }, [
      h("span", { text: "Method" }),
      h("span", { text: "Held-out successes / " + total })
    ]));
    var list = h("ol", { class: "ladder__rows" });

    methods.forEach(function (m, i) {
      var isPacer = m.id === "pacer";
      var share = m.overall / total;
      var withDelta = isPacer && delta > 0;
      var off = withDelta ? DELTA_H : 0;
      var y = off + (LADDER_H - LADDER_BAR) / 2;
      var svg = s("svg", {
        class: "ladder__svg", role: "img", width: "100%", height: LADDER_H + off,
        "aria-label": plain(m.label) + ": " + m.overall + " of " + total + " held-out trials succeeded" +
          (withDelta ? ", " + delta + " points more than " + plain(ref.label) : "")
      });
      svg.appendChild(s("rect", { class: "ladder__track", x: 0, y: y, width: "100%", height: LADDER_BAR, rx: 3 }));
      var bar = s("g", { class: "ladder__bar" }, [
        s("rect", {
          class: "bar", "data-method": m.id, "data-value": m.overall, fill: tone[m.id],
          x: 0, y: y, width: (share * 100) + "%", height: LADDER_BAR, rx: 4
        }),
        // square root end on the baseline, rounded data end
        m.overall > 1 ? s("rect", { class: "bar__root", fill: tone[m.id], x: 0, y: y, width: 4, height: LADDER_BAR }) : null
      ]);
      svg.appendChild(bar);
      if (m.overall === 0) {
        svg.appendChild(s("rect", { class: "ladder__zero", x: 0, y: y - 3, width: 2, height: LADDER_BAR + 6 }));
      }

      // PACER's gain over vanilla post-SFT: a bracket from that baseline's value to PACER's.
      if (withDelta) {
        var xa = (ref.overall / total * 100) + "%", xb = (share * 100) + "%";
        svg.appendChild(s("g", { class: "ladder__delta-g", "aria-hidden": "true" }, [
          s("line", { class: "ladder__delta-span", x1: xa, x2: xb, y1: 16, y2: 16 }),
          s("line", { class: "ladder__delta-tick", x1: xa, x2: xa, y1: 16, y2: off + 2 }),
          s("line", { class: "ladder__delta-tick", x1: xb, x2: xb, y1: 16, y2: off + 2 }),
          s("text", {
            class: "ladder__delta", x: ((ref.overall + m.overall) / 2 / total * 100) + "%", y: 7,
            "text-anchor": "middle", text: "+" + delta + " points"
          })
        ]));
      }

      // Value at the bar's end; callout rows spell out the fraction.
      var at = s("svg", { class: "ladder__at", x: (share * 100) + "%", y: off, width: 1, height: LADDER_H, overflow: "visible" });
      if (CALLOUTS[m.id]) {
        var txt = m.overall + "/" + total;
        var w = Math.ceil(txt.length * 7.9) + 16;
        at.appendChild(s("g", { class: "ladder__callout" }, [
          s("rect", { x: 8, y: 2, width: w, height: LADDER_H - 4, rx: (LADDER_H - 4) / 2 }),
          s("text", { class: "ladder__value", x: 8 + w / 2, y: LADDER_H / 2, "text-anchor": "middle", text: txt })
        ]));
      } else {
        at.appendChild(s("text", {
          class: "ladder__value", x: 8, y: LADDER_H / 2, text: String(m.overall)
        }));
      }
      svg.appendChild(at);

      list.appendChild(h("li", {
        class: "ladder__row" + (isPacer ? " is-pacer" : ""), "data-row": m.id,
        "data-context": isPacer ? null : "baseline", style: "--i:" + i
      }, [
        h("div", { class: "ladder__text" }, [
          h("p", { class: "ladder__label" }, [label(m.label)]),
          h("p", { class: "ladder__desc", text: m.desc })
        ]),
        h("div", { class: "ladder__plot" }, [svg])
      ]));
    });

    chart.appendChild(list);
    el.appendChild(chart);

    // Dashed guide from the baseline bar's end down to the bracket, across the rows between.
    if (delta > 0) {
      var guide = h("span", { class: "ladder__guide", "aria-hidden": "true" });
      chart.appendChild(guide);
      var placeGuide = function () {
        var track = list.querySelector('[data-row="' + ref.id + '"] .ladder__track');
        var span = list.querySelector(".ladder__delta-span");
        if (!track || !span) return;
        var c = chart.getBoundingClientRect(), t = track.getBoundingClientRect(), sp = span.getBoundingClientRect();
        guide.style.left = (t.left - c.left + t.width * ref.overall / total - 0.5) + "px";
        guide.style.top = (t.bottom - c.top) + "px";
        guide.style.height = Math.max(0, sp.top - t.bottom) + "px";
      };
      placeGuide();
      if ("ResizeObserver" in win) new win.ResizeObserver(placeGuide).observe(list);
      else win.addEventListener("resize", placeGuide);
    }
    animateOnce(chart);
    return chart;
  }

  /* ------------------------------------------------ (b) per component */

  function pick(results, ids) {
    var byId = {};
    results.methods.forEach(function (m) { byId[m.id] = m; });
    return ids.map(function (id) { return byId[id]; }).filter(Boolean);
  }

  // A column anchored on the baseline with a rounded data end; zero height -> flat stub path.
  function roundedBar(x, y, w, hgt, r) {
    if (hgt <= 0) return "M" + x + " " + (y + hgt) + "H" + (x + w);
    r = Math.min(r, hgt, w / 2);
    return "M" + x + " " + (y + hgt) + "V" + (y + r) + "A" + r + " " + r + " 0 0 1 " + (x + r) + " " + y +
      "H" + (x + w - r) + "A" + r + " " + r + " 0 0 1 " + (x + w) + " " + (y + r) + "V" + (y + hgt) + "Z";
  }

  function barGroup(m, comp, ci, n, tone, geo) {
    var k = m.per_component[ci];
    var w = wilson(k, n);
    var isPacer = m.id === "pacer";
    var cx = r1(geo.x + geo.w / 2), y = geo.y;
    var g = s("g", {
      class: "pc-bar" + (isPacer ? " is-pacer" : ""), "data-method": m.id, "data-component": comp,
      style: "--i:" + ci
    });
    g.appendChild(s("title", {
      text: plain(m.label) + " · " + comp + ": " + k + "/" + n + " successes (" + pct(w.p, 0) + "); " +
        "Wilson 95% CI " + pct(w.lo) + "–" + pct(w.hi)
    }));
    g.appendChild(s("rect", { class: "pc__hit", x: r1(geo.x - geo.gap / 2), y: y(1), width: r1(geo.w + geo.gap), height: y(0) - y(1) }));
    g.appendChild(s("path", {
      class: "bar", d: roundedBar(geo.x, y(w.p), geo.w, r1(y(0) - y(w.p)), 4), fill: tone[m.id],
      "data-method": m.id, "data-component": comp, "data-value": k
    }));
    var cap = Math.min(4, geo.w / 2 - 1);
    var d = "M" + cx + " " + y(w.lo) + "V" + y(w.hi) +
      "M" + (cx - cap) + " " + y(w.lo) + "H" + (cx + cap) + "M" + (cx - cap) + " " + y(w.hi) + "H" + (cx + cap);
    g.appendChild(s("g", {
      class: "ci", "data-method": m.id, "data-component": comp,
      "data-lo": w.lo.toFixed(4), "data-hi": w.hi.toFixed(4)
    }, [
      s("path", { class: "ci__halo", d: d }),
      s("path", { class: "ci__cap", d: d }),
      s("line", { class: "ci__line", x1: cx, y1: y(w.lo), x2: cx, y2: y(w.hi) })
    ]));
    if (isPacer) {
      g.appendChild(s("text", { class: "pc__value", x: cx, y: y(w.hi) - 9, "text-anchor": "middle", text: k + "/" + n }));
    }
    if (k === 0) {
      // A zero bar has no height to see: say "0/n" on the baseline instead. Wide bars hold
      // the label above the baseline; narrow small multiples put it just below, clear of
      // the neighbouring bars.
      g.appendChild(s("text", {
        class: "pc__zero", x: cx, y: geo.zeroBelow ? y(0) + 12 : y(0) - 4, "text-anchor": "middle", text: "0/" + n
      }));
    }
    return g;
  }

  // One plot panel: gridlines, optional tick labels, and a band of grouped bars per component.
  function panel(svg, P, compIdx, results, methods, tone) {
    var comps = results.components, n = results.trials_per_component;
    var nm = methods.length, gap = 3;
    var y = function (r) { return r1(P.top + P.h * (1 - r)); };
    P.ticks.forEach(function (t) {
      svg.appendChild(s("line", {
        class: "grid" + (t === 0 ? " grid--base" : ""), "data-tick": t, x1: P.x0, x2: P.x1, y1: y(t), y2: y(t)
      }));
      if (P.tickLabels) {
        svg.appendChild(s("text", { class: "pc__tick", x: P.x0 - 8, y: y(t), "text-anchor": "end", text: (t * 100) + (t === 1 ? "%" : "") }));
      }
    });
    var band = (P.x1 - P.x0) / compIdx.length;
    var barW = r1(Math.max(8, Math.min(28, (band * P.fill - gap * (nm - 1)) / nm)));
    var groupW = nm * barW + (nm - 1) * gap;
    compIdx.forEach(function (ci, bi) {
      var gx = P.x0 + band * bi + (band - groupW) / 2;
      if (P.labelBelow) {
        svg.appendChild(s("text", { class: "pc__comp", x: r1(P.x0 + band * (bi + 0.5)), y: y(0) + 26, "text-anchor": "middle", text: comps[ci] }));
      }
      methods.forEach(function (m, mi) {
        svg.appendChild(barGroup(m, comps[ci], ci, n, tone, {
          x: r1(gx + mi * (barW + gap)), w: barW, gap: gap, y: y, zeroBelow: !P.labelBelow
        }));
      });
    });
  }

  // Wide: one chart, a band per component. Narrow: small multiples, one panel per
  // component (3 or 2 per row), same vertical bars and whiskers as the paper figure.
  function perComponentSvg(width, results, methods, tone) {
    var comps = results.components, n = results.trials_per_component;
    var W = Math.round(width), H;
    var multiples = W < NARROW;
    var all = comps.map(function (c, i) { return i; });
    var summary = "Held-out success rate per component, " + n + " trials each, with Wilson 95% intervals. " +
      comps.map(function (c, ci) {
        return c + ": " + methods.map(function (m) { return plain(m.label) + " " + m.per_component[ci] + "/" + n; }).join(", ");
      }).join(". ") + ".";
    var svg = s("svg", { class: "pc__svg", role: "img", "aria-label": summary });

    if (!multiples) {
      var M = { top: 30, right: 4, bottom: 40, left: 46 }, plotH = 280;
      H = M.top + plotH + M.bottom;
      panel(svg, { x0: M.left, x1: W - M.right, top: M.top, h: plotH, ticks: [0, 0.25, 0.5, 0.75, 1],
        tickLabels: true, labelBelow: true, fill: 0.66 }, all, results, methods, tone);
    } else {
      var cols = W >= 300 ? 3 : 2, left = 36, right = 8, colGap = 14, rowGap = 26;
      var titleH = 18, valueRoom = 18, ph = 104;
      var pw = (W - left - right - colGap * (cols - 1)) / cols;
      var rows = Math.ceil(comps.length / cols);
      var rowH = titleH + valueRoom + ph;
      H = rows * rowH + (rows - 1) * rowGap + 16;     // room for "0/n" below the last baseline
      all.forEach(function (ci) {
        var col = ci % cols, row = Math.floor(ci / cols);
        var x0 = r1(left + col * (pw + colGap)), top = row * (rowH + rowGap);
        svg.appendChild(s("text", { class: "pc__comp", x: x0, y: top + 13, text: comps[ci] }));
        panel(svg, { x0: x0, x1: r1(x0 + pw), top: top + titleH + valueRoom, h: ph, ticks: [0, 0.5, 1],
          tickLabels: col === 0, labelBelow: false, fill: 0.94 }, [ci], results, methods, tone);
      });
    }
    attrs(svg, { viewBox: "0 0 " + W + " " + H, width: W, height: H, "data-layout": multiples ? "multiples" : "vertical" });
    return svg;
  }

  function highlight(chart, id) {
    chart.classList.toggle("has-focus", !!id);
    Array.prototype.forEach.call(chart.querySelectorAll("[data-method]"), function (e) {
      if (e.classList.contains("pc-bar") || e.classList.contains("chart-legend__item")) {
        e.classList.toggle("is-focus", e.getAttribute("data-method") === id);
      }
    });
  }

  function renderPerComponent(el, results, methodIds, opts) {
    var methods = pick(results, methodIds || DEFAULT_PER_COMPONENT);
    var tone = tones(results.methods);
    var design = (opts && opts.design) || {};
    var n = results.trials_per_component;

    el.textContent = "";
    var chart = h("figure", { class: "chart pc", "data-chart": "per-component" });
    var legend = h("ul", { class: "chart-legend", "aria-label": "Legend" });
    methods.forEach(function (m) {
      legend.appendChild(h("li", { class: "chart-legend__item", "data-method": m.id }, [
        h("span", { class: "chart-legend__swatch", style: "background:" + tone[m.id], "aria-hidden": "true" }),
        h("span", null, [label(m.label)])
      ]));
    });
    legend.appendChild(h("li", { class: "chart-legend__ci" }, [
      h("span", { class: "chart-legend__whisker", "aria-hidden": "true" }),
      h("span", { text: "Wilson 95% interval" })
    ]));
    var plot = h("div", { class: "pc__plot" });
    var split = design.heldout_configs_per_component && design.trials_per_config
      ? " (" + design.heldout_configs_per_component + " held-out configurations × " + design.trials_per_config + " trials)"
      : "";
    var caption = h("figcaption", { class: "chart__caption" }, [
      "Success rate over n = " + n + " trials per component" + split + ". Whiskers: Wilson score 95% intervals " +
      "(z = " + Z95 + "), as in the paper’s per-component figure. Labels give PACER’s successes out of " + n + "."
    ]);
    append(chart, [legend, plot, caption]);
    el.appendChild(chart);

    var lastW = -1;
    function draw() {
      var w = plot.clientWidth;
      if (!w || w === lastW) return;
      lastW = w;
      var svg = perComponentSvg(w, results, methods, tone);
      plot.textContent = "";
      plot.appendChild(svg);
      chart.setAttribute("data-layout", svg.getAttribute("data-layout"));
    }
    draw();

    var pending = false;
    function schedule() {
      if (pending) return;
      pending = true;
      win.requestAnimationFrame(function () { pending = false; draw(); });
    }
    if ("ResizeObserver" in win) new win.ResizeObserver(schedule).observe(plot);
    else win.addEventListener("resize", schedule);

    // Hovering a bar or a legend entry highlights that method across components.
    chart.addEventListener("pointerover", function (e) {
      var t = e.target.closest && e.target.closest(".pc-bar, .chart-legend__item");
      highlight(chart, t ? t.getAttribute("data-method") : null);
    });
    chart.addEventListener("pointerleave", function () { highlight(chart, null); });

    animateOnce(chart);
    return chart;
  }

  /* ---------------------------------------------------------- (c) table */

  function renderTable(el, results) {
    var tone = tones(results.methods);
    var comps = results.components;
    var n = results.trials_per_component;
    var total = n * comps.length;

    el.textContent = "";
    var head = h("tr", null, [h("th", { scope: "col", class: "rt__method", text: "Method" })]
      .concat(comps.map(function (c) { return h("th", { scope: "col", text: c }); }))
      .concat([
        h("th", { scope: "col", text: "Overall" }),
        h("th", { scope: "col" }, [h("var", { text: "J" }), h("sub", { text: "val" })])
      ]));
    var body = h("tbody");
    results.methods.forEach(function (m) {
      var isPacer = m.id === "pacer";
      body.appendChild(h("tr", {
        class: isPacer ? "is-pacer" : null, "data-method": m.id, "data-context": isPacer ? null : "baseline"
      }, [
        h("th", { scope: "row", class: "rt__method" }, [
          h("span", { class: "rt__swatch", style: "background:" + tone[m.id], "aria-hidden": "true" }),
          label(m.label)
        ])
      ].concat(m.per_component.map(function (k) { return h("td", { text: String(k) }); }))
        .concat([
          h("td", { class: "rt__overall", text: String(m.overall) }),
          h("td", { text: m.jval.toFixed(4) })
        ])));
    });
    var table = h("table", { class: "rt" }, [
      h("caption", { class: "visually-hidden", text: "Held-out results per method, with the validation score J_val" }),
      h("thead", null, [head]),
      body
    ]);
    // The note sits outside the scroll box so it never scrolls or clips on a phone.
    el.appendChild(h("div", { class: "table-scroll", role: "region", "aria-label": "Full results table", tabindex: "0" }, [table]));
    el.appendChild(h("p", { class: "chart__caption" }, [
      "Held-out successes out of " + n + " per component and out of " + total + " overall. ",
      h("var", { text: "J" }), h("sub", { text: "val" }),
      " is the validation score defined in the Method section."
    ]));
    return table;
  }

  /* ---------------------------------------------------------------- init */

  function safely(name, fn) {
    try { fn(); } catch (err) {
      if (win && win.console) win.console.error("PACERCharts." + name + " failed:", err);
    }
  }

  function init() {
    var D = win.PACER;
    if (!D || !D.results) return;
    var R = D.results;
    var mount = function (id) { return doc.getElementById(id); };
    if (mount("ladder")) safely("renderLadder", function () { renderLadder(mount("ladder"), R); });
    if (mount("per-component")) {
      safely("renderPerComponent", function () {
        renderPerComponent(mount("per-component"), R, DEFAULT_PER_COMPONENT, { design: D.tldr });
      });
    }
    if (mount("results-table")) safely("renderTable", function () { renderTable(mount("results-table"), R); });
  }

  if (doc) {
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
    else init();
  }

  return {
    wilson: wilson,
    ladderOrder: ladderOrder,
    tones: tones,
    renderLadder: renderLadder,
    renderPerComponent: renderPerComponent,
    renderTable: renderTable,
    DEFAULT_PER_COMPONENT: DEFAULT_PER_COMPONENT
  };
})();

if (typeof window !== "undefined") window.PACERCharts = PACERCharts;
if (typeof module !== "undefined" && module.exports) module.exports = PACERCharts;
